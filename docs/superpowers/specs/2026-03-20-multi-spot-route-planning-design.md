# Multi-Spot Route Planning Design

## Overview

Add multi-spot route planning to PhotoSpot PKU, allowing users to select multiple photography spots and generate an optimized walking route. Supports both manual spot selection and area-based quick generation, with URL and screenshot sharing.

## Data Model & State

New global state variables in `app.js`:

```js
const MAX_WAYPOINTS = 24;           // 25 API limit minus 1 for possible user-location start
let routePlanMode = false;          // whether route planning mode is active
let routeWaypoints = [];            // selected spots: [{spotId, feature}], order = array index
let routeGeometry = null;           // current route GeoJSON from API
let routeTotalDistance = 0;         // total distance in meters
let routeTotalDuration = 0;         // total duration in seconds
```

**Waypoint identity**: determined by `feature.properties.Spot_id`. Adding a spot already in the list removes it (toggle). `routeWaypoints` stores `{spotId, feature}` objects; order is always the array index (no separate `order` field).

**Waypoint limit**: max 24 spots (Mapbox API allows 25 coordinates; 1 reserved for user-location start). When limit reached, "Add Spot" is disabled and a toast shows "最多添加24个景点".

### Start Point Logic

- If geolocation is active (`isGeolocateActive && userLocation`): user's current position is the start point (consumes 1 API coordinate slot)
- Otherwise: the first waypoint serves as the start point (no routing segment to itself)
- **Shared routes** (`?route=` URL): always use first waypoint as start, regardless of recipient's geolocation state, for consistent route shape

### TSP Optimization

Greedy nearest-neighbor algorithm (front-end only):

1. Start from the determined start point
2. At each step, pick the nearest unvisited spot (haversine distance)
3. Repeat until all spots are visited

This is sufficient for the typical 3-8 spot range within PKU campus. Note: haversine distance may not reflect actual walking distance (e.g., detours around Weiming Lake), but the resulting route is close enough for the campus scale. Users can manually reorder after optimization.

## API Integration

### Mapbox Directions API (multi-point)

Single API call with all waypoints in optimized order:

```
GET /directions/v5/mapbox/walking/{coord1};{coord2};{coord3};...
    ?geometries=geojson
    &access_token={token}
```

- Supports up to 25 coordinates per request
- Returns complete multi-leg route geometry, total distance, and duration
- Called on: initial route generation, after reorder, after add/remove waypoint

### Re-request Strategy

Every change to waypoints (add, remove, reorder) triggers a new API call. Debounce rapid changes by 300ms to avoid redundant requests.

### Loading & Error States

- **During API request**: show a loading spinner on the route summary bar; disable "Smart Sort" and "View Route" buttons
- **Old route retained**: keep the previous route line visible on the map until a new response arrives or an error occurs
- **On API error** (network failure, 422, rate limit): show toast "路线获取失败", retain the last valid route geometry on the map
- **On empty waypoints** (< 2 spots): hide route summary, show helper text "请添加至少2个景点"
- **Debounce note**: 300ms debounce applies to reorder (move up/down) actions where rapid clicks are expected; add/remove actions fire the API call immediately

## Entry Points

### 1. Area Panel (Level 1) Header

- Add a route planning button (icon: route/map icon) in the area list header bar
- Click enters Level 4 route planning panel with an empty waypoint list

### 2. Spot List (Level 2) Quick Action

- Add "Plan Route for This Area" button below the category filters
- Click auto-populates waypoints with all `Key_Spot=1` spots from the current area
- Enters Level 4 with pre-filled list and auto-runs TSP + API call

## State Transitions: Single-Spot vs Multi-Spot Routing

- **Entering route plan mode**: clears any active single-spot route, enters Level 4 panel
- **In route plan mode**: clicking a spot marker on the map adds/removes it from waypoints (does NOT trigger existing single-spot selection flow)
- **Exiting route plan mode**: clears multi-spot route, returns to previous level, restores normal spot-click behavior. Does NOT restore any previous single-spot route. Clears `?route=` URL parameter via `history.replaceState` (consistent with existing `area`/`spot` param management).

## Level 4: Route Planning Panel

### Panel Structure

```
+----------------------------------+
| ← Back    Route Planning   Clear |  ← Header
+----------------------------------+
| Start: Your Location / Spot #1   |  ← Start point indicator
+----------------------------------+
| 1. Spot Name A    (Area X)    ✕  |  ← Reorderable list items
| 2. Spot Name B    (Area Y)    ✕  |
| 3. Spot Name C    (Area X)    ✕  |
+----------------------------------+
| + Add Spot    ⚡ Smart Sort      |  ← Actions
+----------------------------------+
| 🚶 1.2 km · ~15 min · 3 spots   |  ← Route summary
| [View Route]  [Share]            |  ← Primary actions
+----------------------------------+
```

Numbers in the list are plain text ("1.", "2.", "3.") styled with CSS circles, not Unicode circled numbers (which only go up to 20).

### Panel Behaviors

- **Back button**: exits route planning mode, clears route from map, returns to previous level
- **Clear button**: removes all waypoints, clears route
- **Add Spot**: opens spot picker overlay (see below)
- **Smart Sort**: runs TSP algorithm, reorders list, re-requests route
- **View Route**: fits map to route bounds (using `map.fitBounds()` with padding)
- **Share**: opens share options (URL copy + screenshot)

### Spot Picker Overlay

A modal overlay on top of the Level 4 panel. Structure:

```
+----------------------------------+
| ✕  Add Spot                      |  ← Header with close button
+----------------------------------+
| 🔍 Search spots...               |  ← Search input
+----------------------------------+
| ── Area Name A ──                |  ← Area group header
| ☑ Spot 1 (already added)        |  ← Checkmark = in waypoints
| ☐ Spot 2                        |
| ── Area Name B ──                |
| ☐ Spot 3                        |
| ☐ Spot 4                        |
+----------------------------------+
```

- Shows all spots grouped by area, scrollable list
- Spots already in waypoints show a checkmark; tapping toggles add/remove
- Search input filters spots by name (case-insensitive substring match)
- Tapping close button (✕) or overlay backdrop dismisses the picker
- The Level 4 panel remains underneath (not navigated away)

### Reorder: Move Up/Down Buttons

For v1, use simple move-up (▲) and move-down (▼) buttons on each waypoint item instead of full drag-and-drop. This avoids the complexity of drag-and-drop in scrollable containers on both desktop and mobile.

- First item hides ▲, last item hides ▼
- After reorder: re-request route from API (debounced 300ms)

Drag-and-drop reorder can be added as a future enhancement.

## Map Visualization

### Numbered Markers

- Use Mapbox symbol layer with dynamically generated icons
- For each waypoint, draw a numbered circle using canvas (28px diameter, white text on blue `#38bdf8` circle), register as map image via `map.addImage('route-marker-{n}', canvas)` where `{n}` is the 1-based index
- Layer ID: `route-waypoint-markers`, source: `route-waypoints`
- Must be re-added in the `style.load` handler (at line ~1139 of `app.js`, alongside existing `areas`/`spots` layer restoration)

### Route Line

- Reuse existing route line style (green `#34d399`, width 5, with black casing)
- Source ID: `route` (same as existing, cleared and rebuilt)
- Route segments between waypoints share the same geometry from the multi-point API response

### Map Interaction in Route Mode

- Clicking a spot circle/label on the map toggles it in/out of the waypoint list (identified by `Spot_id`)
- Already-selected spots show the numbered marker overlay
- Unselected spots remain with their default orange styling

## Sharing

### URL Sharing

- Parameter format: `?route=spotId1,spotId2,spotId3` (ordered)
- On page load, if `route` param exists:
  1. Parse spot IDs
  2. Look up corresponding features from `spotData`
  3. Enter route planning mode with these waypoints (first spot = start)
  4. Auto-request route from API
- `route` parameter takes precedence over `area`/`spot` params when both present

### Screenshot Sharing

Flow when user clicks "Share":

1. Show share options: "Copy Link" and "Share as Image"
2. **Copy Link**: encode current waypoints to URL, copy to clipboard via `navigator.clipboard`
3. **Share as Image**:
   a. Set `preserveDrawingBuffer: true` on map initialization (accept the minor performance cost — it is negligible for this app's use case)
   b. Capture map canvas via `map.getCanvas().toDataURL()`
   c. Create offscreen canvas, draw map screenshot
   d. Overlay watermark: route summary (distance, time, spot list) + "PhotoSpot PKU" branding
   e. Try `navigator.share({ files: [imageFile] })` for native mobile sharing
   f. Fallback: trigger PNG download

## Mobile Adaptation

### Bottom Drawer

- Level 4 reuses existing bottom drawer pattern
- Supports pull-up to 90% viewport height (same as area panel)
- Drag handle at top for expand/collapse

### Simplified Layout

- On mobile (<768px), "Smart Sort" and "Add Spot" move into a "..." overflow menu to reduce button crowding
- Share button and "View Route" remain prominent
- Route summary bar is always visible at panel bottom

### Float Button

- In route planning mode, float button icon changes to 🗺️
- Click toggles Level 4 panel visibility (show/hide), same as current panel toggle pattern

### Spot Picker on Mobile

- Spot picker overlay renders as a full-screen modal (same bottom-drawer style)
- Search input at top, grouped spot list below, scrollable

## Files Modified

| File | Changes |
|------|---------|
| `index.html` | Add Level 4 route planning panel HTML, spot picker overlay markup, share modal markup |
| `js/app.js` | Route planning state, TSP algorithm, multi-point API calls, Level 4 panel logic, spot picker, numbered marker management, move up/down reorder, share functionality, URL param parsing for `route`, `style.load` handler update, `preserveDrawingBuffer` flag |
| `css/style.css` | Route panel styles, waypoint list styles, move buttons, numbered marker CSS circles, spot picker overlay styles, share modal styles, mobile overrides |

## Not In Scope

- Local storage for saving/recalling routes
- Offline route caching
- Real-time turn-by-turn navigation
- Refactoring app.js into modules (separate effort)
- Optimization API (Mapbox `/optimized-trips/`) — greedy nearest-neighbor is sufficient
- Drag-and-drop reorder (v1 uses move up/down buttons; drag-and-drop is a future enhancement)
- Keyboard/ARIA accessibility for reorder (consistent with existing codebase)
