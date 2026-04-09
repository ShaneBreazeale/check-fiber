# Fiber Checker

Safari userscript that shows fiber broadband availability on Zillow listing pages.

When you view a property on Zillow, a badge appears in the top-right corner showing whether fiber internet is available at that address and which providers offer it.

## How it works

1. Extracts the address from the Zillow listing page
2. Geocodes it to a census block via the [Census Geocoder API](https://geocoding.geo.census.gov/geocoder/)
3. Queries the [FCC Broadband Data Collection](https://broadbandmap.fcc.gov/) (Dec 2023) via ArcGIS for provider/technology data in that block
4. Displays a color-coded badge:
   - **Green** — Fiber available (lists providers)
   - **Red** — No fiber (shows available technologies)
   - **Yellow** — Could not look up address

Data is at the census block level, not address-specific. Confirm directly with the ISP before signing a lease.

## Install

1. Install [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) from the Mac App Store (free)
2. Open **Safari > Settings > Extensions** and enable **Userscripts**
3. Click the Userscripts icon (</> ) in the Safari toolbar and set a scripts directory when prompted
4. Download [`Fiber Checker.user.js`](Fiber%20Checker.user.js) into that directory
5. Click the Userscripts icon again — you should see **Fiber Checker** listed and enabled

## Usage

Browse to any Zillow listing (e.g. `zillow.com/homedetails/...`). The fiber badge appears automatically. Click it to dismiss.

No API keys or accounts required — all data sources are public.
