(() => {
  let lastUrl = "";
  let badgeEl = null;

  function extractAddressFromUrl() {
    // Zillow listing URLs: /homedetails/4742-Tuscan-Loon-Dr-Tampa-FL-33619/12345_zpid/
    const match = location.pathname.match(/\/homedetails\/([^/]+)\//);
    if (!match) return null;

    const slug = match[1];
    // Convert "4742-Tuscan-Loon-Dr-Tampa-FL-33619" to "4742 Tuscan Loon Dr, Tampa, FL 33619"
    const parts = slug.split("-");

    // Find state abbreviation (2 uppercase letters near the end)
    let stateIdx = -1;
    for (let i = parts.length - 2; i >= 0; i--) {
      if (/^[A-Z]{2}$/.test(parts[i])) {
        stateIdx = i;
        break;
      }
    }
    if (stateIdx < 0) return null;

    const zip = parts.slice(stateIdx + 1).join(" ");
    const state = parts[stateIdx];
    // City is typically 1-2 words before state
    // Street address is everything before city
    // Heuristic: look for common city boundary by trying different splits
    const beforeState = parts.slice(0, stateIdx);

    // Try to find where the city starts by working backwards
    // Most cities are 1-3 words. Try each split and pick the most reasonable one.
    let bestAddr = beforeState.join(" ");
    let bestCity = "";

    // Simple approach: assume city is last 1-3 words before state
    for (let cityLen = 1; cityLen <= 3 && cityLen < beforeState.length; cityLen++) {
      const cityParts = beforeState.slice(-cityLen);
      // City words typically start with uppercase
      if (cityParts.every((p) => /^[A-Z]/.test(p))) {
        bestCity = cityParts.join(" ");
        bestAddr = beforeState.slice(0, -cityLen).join(" ");
      }
    }

    if (!bestAddr) return null;
    if (bestCity) {
      return `${bestAddr}, ${bestCity}, ${state} ${zip}`;
    }
    return `${bestAddr}, ${state} ${zip}`;
  }

  function extractAddressFromDom() {
    // Try common Zillow selectors for the address
    const selectors = [
      'h1[class*="Text"]',        // Main listing title
      '[data-testid="bdp-hero-address"]',
      '.summary-container h1',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) {
        const text = el.textContent.trim();
        // Should look like an address (has a comma and state abbreviation)
        if (/,\s*[A-Z]{2}\s+\d{5}/.test(text)) return text;
        if (/,\s*[A-Z]{2}/.test(text)) return text;
      }
    }
    return null;
  }

  function getAddress() {
    return extractAddressFromDom() || extractAddressFromUrl();
  }

  function createBadge() {
    const el = document.createElement("div");
    el.id = "fiber-checker-badge";
    el.innerHTML = "Checking fiber...";
    document.body.appendChild(el);
    return el;
  }

  function updateBadge(result) {
    if (!badgeEl) return;

    if (result.error) {
      badgeEl.className = "fiber-error";
      badgeEl.innerHTML = `<span class="fiber-icon">&#x26A0;</span> Fiber: ${result.error}`;
      return;
    }

    if (result.fiber) {
      badgeEl.className = "fiber-yes";
      const providers = result.fiberProviders.join(", ");
      badgeEl.innerHTML =
        `<span class="fiber-icon">&#x2713;</span> <strong>Fiber available</strong>` +
        `<span class="fiber-detail">${providers}</span>`;
    } else {
      badgeEl.className = "fiber-no";
      const techs = result.technologies.join(", ");
      badgeEl.innerHTML =
        `<span class="fiber-icon">&#x2717;</span> <strong>No fiber</strong>` +
        `<span class="fiber-detail">${techs || "no data"}</span>`;
    }
  }

  async function run() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;

    // Only run on listing detail pages
    if (!location.pathname.includes("/homedetails/")) return;

    const address = getAddress();
    if (!address) return;

    if (!badgeEl) {
      badgeEl = createBadge();
    }

    badgeEl.className = "fiber-loading";
    badgeEl.innerHTML = `<span class="fiber-icon">&#x23F3;</span> Checking fiber for: ${address}`;

    try {
      const result = await browser.runtime.sendMessage({
        type: "checkFiber",
        address,
      });
      updateBadge(result);
    } catch (e) {
      updateBadge({ error: e.message });
    }
  }

  // Run on page load and URL changes (Zillow is a SPA)
  run();
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) run();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
