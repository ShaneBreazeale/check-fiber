#!/usr/bin/env python3
"""
FCC Broadband Fiber Checker
Checks fiber (tech code 50) availability for a list of addresses using:
  1. Census Geocoder to resolve addresses to census block GEOIDs
  2. ArcGIS FCC BDC layer to query fiber providers per block

Usage:
    pip install requests
    python check_fiber.py
"""

import requests
import time

ADDRESSES = [
    {"id": 1,  "addr": "4742 Tuscan Loon Dr",       "city": "Tampa",        "state": "FL", "zip": "33619"},
    {"id": 2,  "addr": "4021 Wild Senna Blvd",       "city": "Tampa",        "state": "FL", "zip": "33619"},
    {"id": 3,  "addr": "3108 N Jefferson St",         "city": "Tampa",        "state": "FL", "zip": "33603", "unit": "210"},
    {"id": 4,  "addr": "6209 Cannoli Pl",             "city": "Riverview",    "state": "FL", "zip": "33578"},
    {"id": 5,  "addr": "705 Straw Lake Dr",           "city": "Brandon",      "state": "FL", "zip": "33510"},
    {"id": 6,  "addr": "415 S Delaware Ave",          "city": "Tampa",        "state": "FL", "zip": "33606"},
    {"id": 7,  "addr": "2223 Gordon St",              "city": "Tampa",        "state": "FL", "zip": "33605", "unit": "B"},
    {"id": 8,  "addr": "3505 E 11th Ave",             "city": "Tampa",        "state": "FL", "zip": "33605"},
    {"id": 9,  "addr": "6015 Crickethollow Dr",       "city": "Riverview",    "state": "FL", "zip": "33578"},
    {"id": 10, "addr": "105 Ridge Ct",                "city": "Brandon",      "state": "FL", "zip": "33511"},
    {"id": 11, "addr": "1623 Fluorshire Dr",          "city": "Brandon",      "state": "FL", "zip": "33511"},
    {"id": 12, "addr": "826 Milano Cir",              "city": "Brandon",      "state": "FL", "zip": "33511"},
    {"id": 13, "addr": "902 Delaney Cir",             "city": "Brandon",      "state": "FL", "zip": "33511"},
    {"id": 14, "addr": "6144 Paseo Al Mar Blvd",      "city": "Apollo Beach", "state": "FL", "zip": "33572"},
    {"id": 15, "addr": "9104 Canopy Oak Ln",          "city": "Riverview",    "state": "FL", "zip": "33578"},
    {"id": 16, "addr": "9707 Tranquility Lake Cir",   "city": "Riverview",    "state": "FL", "zip": "33578"},
]

CENSUS_GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
ARCGIS_BDC = (
    "https://services.arcgis.com/jIL9msH9OI208GCb/arcgis/rest/services/"
    "FCC_Broadband_Data_Collection_December_2023_V2/FeatureServer/10/query"
)

TECH_NAMES = {
    10: "DSL/Copper",
    40: "Cable",
    50: "Fiber",
    60: "Satellite",
    70: "Fixed Wireless",
    71: "Licensed FW",
    72: "LBR FW",
}


def geocode_to_block(a):
    """Resolve an address to its 2020 Census Block GEOID."""
    full = f"{a['addr']}, {a['city']}, {a['state']} {a['zip']}"
    r = requests.get(CENSUS_GEOCODER, params={
        "address": full,
        "benchmark": "Public_AR_Current",
        "vintage": "Current_Current",
        "format": "json",
    }, timeout=15)
    r.raise_for_status()
    matches = r.json()["result"]["addressMatches"]
    if not matches:
        return None
    blocks = matches[0].get("geographies", {}).get("2020 Census Blocks", [])
    if not blocks:
        return None
    return blocks[0]["GEOID"]


def query_block_availability(geoid):
    """Query FCC BDC data for all providers/technologies in a census block."""
    r = requests.get(ARCGIS_BDC, params={
        "where": f"GEOID='{geoid}'",
        "outFields": "ProviderName,Technology,TotalBSLs,ServedBSLs",
        "f": "json",
        "returnGeometry": "false",
    }, timeout=15)
    r.raise_for_status()
    return r.json().get("features", [])


def check_address(a):
    try:
        geoid = geocode_to_block(a)
        if not geoid:
            return None, ["geocode failed"]

        features = query_block_availability(geoid)
        techs = set()
        fiber_providers = []
        for f in features:
            attr = f["attributes"]
            tc = attr["Technology"]
            name = attr["ProviderName"]
            techs.add(TECH_NAMES.get(tc, f"tech {tc}"))
            if tc == 50:
                fiber_providers.append(name)

        fiber = len(fiber_providers) > 0
        return fiber, sorted(techs), fiber_providers
    except Exception as e:
        return None, [str(e)], []


def main():
    print(f"\n{'#':<4} {'Address':<44} {'Fiber':<8} Technologies (Fiber providers)")
    print("-" * 100)

    fiber_count = 0
    for a in ADDRESSES:
        display = a["addr"]
        if "unit" in a:
            display += f" #{a['unit']}"
        display += f", {a['city']}, {a['state']}"

        result = check_address(a)
        fiber, techs, providers = result[0], result[1], result[2] if len(result) > 2 else []

        if fiber is None:
            fiber_str = "ERROR"
            detail = ", ".join(techs)
        elif fiber:
            fiber_str = "YES"
            fiber_count += 1
            detail = ", ".join(techs) + f"  [{', '.join(providers)}]"
        else:
            fiber_str = "no"
            detail = ", ".join(techs) if techs else "none reported"

        print(f"{a['id']:<4} {display:<44} {fiber_str:<8} {detail}")
        time.sleep(0.5)

    print("-" * 100)
    print(f"\nFiber available: {fiber_count}/{len(ADDRESSES)}")
    print("Source: FCC BDC Dec 2023 via ArcGIS | Block-level data (not address-specific)\n")


if __name__ == "__main__":
    main()
