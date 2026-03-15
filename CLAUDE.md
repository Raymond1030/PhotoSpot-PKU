# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PhotoSpot PKU is an interactive web map for photography spots at Peking University (北京大学). It's a static site using vanilla HTML/CSS/JS with Mapbox GL JS for map rendering. All UI text is in Chinese (zh-CN).

## Development Commands

```bash
# Start dev server (generates image manifest first, then serves on port 3000)
npm run dev

# Regenerate image manifest and EXIF metadata from data/images/
npm run sync-photos
```

No build step, no tests, no linter configured. The app loads via `index.html` and requires an HTTP server (cannot open `index.html` directly due to `fetch` calls).

## Architecture

**Single-page app with three navigation levels:**
1. **Area list** (Level 1) — campus photography regions (西门, 未名湖, etc.)
2. **Spot list** (Level 2) — specific photo positions within an area
3. **Spot detail** (Level 3) — photo gallery with EXIF overlay for a single spot

**Key files:**
- `js/app.js` — All application logic in one file: map initialization, data loading, native Mapbox layer management (no DOM markers), panel navigation state machine, photo slider, mobile drawer gestures, lightbox
- `css/style.css` — Complete styling with CSS variables, dark theme, responsive layout (desktop sidebar ↔ mobile bottom drawer at 768px breakpoint)
- `index.html` — Static HTML shell with panel structure for all three levels

**Data pipeline:**
- `data/spot_data/PKU_Area.json` — GeoJSON FeatureCollection of areas. Key fields: `id`, `Area_Name`, `Des`, `Key_Area` (1=recommended)
- `data/spot_data/PKU_spot.json` — GeoJSON FeatureCollection of spots. Key fields: `Spot_id`, `Area_id`, `Spot_Name`, `Des`, `Key_Spot`
- `data/images/{areaNum}. {areaName}/{spotNum}. {spotName}/` — Photo files organized by area/spot folder naming convention (e.g., `1. 西门/1. 西门正面门匾/`)
- `scripts/generate_manifest.js` — Node script that scans `data/images/`, extracts EXIF via `exifreader`, outputs `data/image_manifest.json` (maps `"{areaId}-{spotId}"` keys to image path arrays) and `data/image_metadata.json` (maps image paths to EXIF data)

**Map layer architecture:** Uses native Mapbox sources/layers (not DOM markers). Two sources: `areas` (always visible) and `spots` (filtered by selected area). Layers include circles, labels, glows for both area and spot levels. All layers are re-added on style change via `style.load` event.

**State management:** Global variables (`currentAreaId`, `currentSpotFeature`, `currentStyle`) control navigation. Panel switching uses CSS class `hidden` toggling on `#area-list`, `#spot-detail`, `#spot-photo-detail`.

## Mapbox Token

The Mapbox access token is hardcoded in `js/app.js` line 7. The map defaults to dark style centered on PKU campus at `[116.3042, 39.9930]`.
