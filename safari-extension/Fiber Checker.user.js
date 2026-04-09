// ==UserScript==
// @name         Fiber Checker
// @description  Shows fiber availability on Zillow listings (FCC BDC data)
// @match        *://*.zillow.com/*
// @version      1.0
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      geocoding.geo.census.gov
// @connect      services.arcgis.com
// ==/UserScript==

(() => {
  const CENSUS_GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
  const ARCGIS_BDC =
    "https://services.arcgis.com/jIL9msH9OI208GCb/arcgis/rest/services/" +
    "FCC_Broadband_Data_Collection_December_2023_V2/FeatureServer/10/query";

  const TECH_NAMES = {
    10: "DSL/Copper", 40: "Cable", 50: "Fiber", 60: "Satellite",
    61: "NGSO Satellite", 70: "Fixed Wireless", 71: "Licensed FW", 72: "LBR FW",
  };

  let lastUrl = "";
  let badgeEl = null;

  // --- API helpers ---

  // GM_xmlhttpRequest wrapper (bypasses CORS; needed for Census Geocoder)
  function gmFetch(url) {
    if (typeof GM_xmlhttpRequest !== "undefined") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          onload: (r) => {
            try { resolve(JSON.parse(r.responseText)); }
            catch (e) { reject(new Error("Bad JSON from " + url)); }
          },
          onerror: (e) => reject(new Error("Request failed")),
        });
      });
    }
    // Fallback to regular fetch (works if CORS allows it)
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  }

  async function geocodeToBlock(address) {
    const url = new URL(CENSUS_GEOCODER);
    url.searchParams.set("address", address);
    url.searchParams.set("benchmark", "Public_AR_Current");
    url.searchParams.set("vintage", "Current_Current");
    url.searchParams.set("format", "json");

    const data = await gmFetch(url.toString());
    const matches = data.result.addressMatches;
    if (!matches.length) return null;
    const blocks = matches[0]?.geographies?.["2020 Census Blocks"];
    if (!blocks?.length) return null;
    return blocks[0].GEOID;
  }

  async function queryBlockAvailability(geoid) {
    const url = new URL(ARCGIS_BDC);
    url.searchParams.set("where", `GEOID='${geoid}'`);
    url.searchParams.set("outFields", "ProviderName,Technology,TotalBSLs,ServedBSLs");
    url.searchParams.set("f", "json");
    url.searchParams.set("returnGeometry", "false");

    // ArcGIS has CORS enabled, so regular fetch works
    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`ArcGIS HTTP ${r.status}`);
    const data = await r.json();
    return data.features || [];
  }

  async function checkFiber(address) {
    const geoid = await geocodeToBlock(address);
    if (!geoid) return { error: "Could not geocode address" };

    const features = await queryBlockAvailability(geoid);
    const techs = new Set();
    const fiberProviders = [];

    for (const f of features) {
      const { Technology, ProviderName } = f.attributes;
      techs.add(TECH_NAMES[Technology] || `tech ${Technology}`);
      if (Technology === 50) fiberProviders.push(ProviderName);
    }

    return {
      fiber: fiberProviders.length > 0,
      fiberProviders,
      technologies: [...techs].sort(),
    };
  }

  // --- Address extraction ---

  function extractAddressFromUrl() {
    const match = location.pathname.match(/\/homedetails\/([^/]+)\//);
    if (!match) return null;

    const parts = match[1].split("-");
    let stateIdx = -1;
    for (let i = parts.length - 2; i >= 0; i--) {
      if (/^[A-Z]{2}$/.test(parts[i])) { stateIdx = i; break; }
    }
    if (stateIdx < 0) return null;

    const zip = parts.slice(stateIdx + 1).join(" ");
    const state = parts[stateIdx];
    const beforeState = parts.slice(0, stateIdx);

    let bestAddr = beforeState.join(" ");
    let bestCity = "";
    for (let cityLen = 1; cityLen <= 3 && cityLen < beforeState.length; cityLen++) {
      const cityParts = beforeState.slice(-cityLen);
      if (cityParts.every((p) => /^[A-Z]/.test(p))) {
        bestCity = cityParts.join(" ");
        bestAddr = beforeState.slice(0, -cityLen).join(" ");
      }
    }

    if (!bestAddr) return null;
    return bestCity
      ? `${bestAddr}, ${bestCity}, ${state} ${zip}`
      : `${bestAddr}, ${state} ${zip}`;
  }

  function extractAddressFromDom() {
    const selectors = [
      'h1[class*="Text"]',
      '[data-testid="bdp-hero-address"]',
      '.summary-container h1',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) {
        const text = el.textContent.trim();
        if (/,\s*[A-Z]{2}\s+\d{5}/.test(text)) return text;
        if (/,\s*[A-Z]{2}/.test(text)) return text;
      }
    }
    return null;
  }

  function getAddress() {
    return extractAddressFromDom() || extractAddressFromUrl();
  }

  // --- UI ---

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #fiber-checker-badge {
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 999999;
        padding: 10px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
        max-width: 340px;
        cursor: pointer;
        transition: opacity 0.2s;
      }
      #fiber-checker-badge:hover { opacity: 0.85; }
      #fiber-checker-badge .fiber-icon { margin-right: 6px; font-size: 16px; }
      #fiber-checker-badge .fiber-detail {
        display: block; font-size: 12px; margin-top: 2px; opacity: 0.85;
      }
      #fiber-checker-badge .fiber-source {
        display: block; font-size: 10px; margin-top: 4px; opacity: 0.5;
      }
      #fiber-checker-badge.fiber-loading {
        background: #f0f4ff; border: 1px solid #b8c9e8; color: #3a5a8c;
      }
      #fiber-checker-badge.fiber-yes {
        background: #e8f5e9; border: 1px solid #66bb6a; color: #2e7d32;
      }
      #fiber-checker-badge.fiber-no {
        background: #fbe9e7; border: 1px solid #ef5350; color: #c62828;
      }
      #fiber-checker-badge.fiber-error {
        background: #fff8e1; border: 1px solid #ffc107; color: #7a6200;
      }
    `;
    document.head.appendChild(style);
  }

  function createBadge() {
    const el = document.createElement("div");
    el.id = "fiber-checker-badge";
    el.addEventListener("click", () => { el.style.display = "none"; });
    document.body.appendChild(el);
    return el;
  }

  function updateBadge(result) {
    if (!badgeEl) return;
    const source = `<span class="fiber-source">FCC BDC Dec 2023 | block-level</span>`;

    if (result.error) {
      badgeEl.className = "fiber-error";
      badgeEl.innerHTML = `<span class="fiber-icon">\u26A0</span> Fiber: ${result.error}${source}`;
      return;
    }

    if (result.fiber) {
      badgeEl.className = "fiber-yes";
      const providers = result.fiberProviders.join(", ");
      badgeEl.innerHTML =
        `<span class="fiber-icon">\u2713</span> <strong>Fiber available</strong>` +
        `<span class="fiber-detail">${providers}</span>${source}`;
    } else {
      badgeEl.className = "fiber-no";
      const techs = result.technologies.join(", ");
      badgeEl.innerHTML =
        `<span class="fiber-icon">\u2717</span> <strong>No fiber</strong>` +
        `<span class="fiber-detail">${techs || "no data"}</span>${source}`;
    }
  }

  // --- Main ---

  async function run() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    if (!location.pathname.includes("/homedetails/")) {
      if (badgeEl) badgeEl.style.display = "none";
      return;
    }

    // Wait a beat for SPA content to render
    await new Promise((r) => setTimeout(r, 1000));

    const address = getAddress();
    if (!address) return;

    if (!badgeEl) {
      injectStyles();
      badgeEl = createBadge();
    }

    badgeEl.style.display = "";
    badgeEl.className = "fiber-loading";
    badgeEl.innerHTML = `<span class="fiber-icon">\u23F3</span> Checking fiber\u2026`;

    try {
      const result = await checkFiber(address);
      updateBadge(result);
    } catch (e) {
      updateBadge({ error: e.message });
    }
  }

  run();

  // Watch for SPA navigation
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) run();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
