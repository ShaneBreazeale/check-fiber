const CENSUS_GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const ARCGIS_BDC =
  "https://services.arcgis.com/jIL9msH9OI208GCb/arcgis/rest/services/" +
  "FCC_Broadband_Data_Collection_December_2023_V2/FeatureServer/10/query";

const TECH_NAMES = {
  10: "DSL/Copper",
  40: "Cable",
  50: "Fiber",
  60: "Satellite",
  61: "NGSO Satellite",
  70: "Fixed Wireless",
  71: "Licensed FW",
  72: "LBR FW",
};

async function geocodeToBlock(address) {
  const url = new URL(CENSUS_GEOCODER);
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");

  const r = await fetch(url);
  const data = await r.json();
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

  const r = await fetch(url);
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
    if (Technology === 50) {
      fiberProviders.push(ProviderName);
    }
  }

  return {
    fiber: fiberProviders.length > 0,
    fiberProviders,
    technologies: [...techs].sort(),
  };
}

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "checkFiber") {
    checkFiber(msg.address).then(sendResponse).catch((e) =>
      sendResponse({ error: e.message })
    );
    return true;
  }
});
