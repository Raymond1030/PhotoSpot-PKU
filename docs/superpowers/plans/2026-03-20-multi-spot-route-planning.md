# Multi-Spot Route Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-spot route planning with TSP optimization, spot picker, map markers, and URL/screenshot sharing.

**Architecture:** Extends the existing 3-level panel navigation with a Level 4 route planning panel. Uses Mapbox Directions API multi-point walking routes with front-end greedy nearest-neighbor TSP sorting. All new code goes into the existing `app.js`, `style.css`, and `index.html` files following established patterns.

**Tech Stack:** Vanilla JS, Mapbox GL JS v3.3.0, Mapbox Directions API, Canvas API for numbered markers and screenshot watermarks.

**Spec:** `docs/superpowers/specs/2026-03-20-multi-spot-route-planning-design.md`

---

### Task 1: Add Route Planning State & HTML Shell

**Files:**
- Modify: `js/app.js:24-41` (state variables section)
- Modify: `js/app.js:80-91` (map constructor — add `preserveDrawingBuffer`)
- Modify: `js/app.js:43-78` (DOM elements section)
- Modify: `index.html:86-115` (add Level 4 panel and spot picker inside bottom-panel)

- [ ] **Step 1: Add route planning state variables to app.js**

In `js/app.js`, after the existing state block (line 41, after `const PKU_GEOFENCE_RADIUS`), add:

```js
// ── Route Planning State ──
const MAX_WAYPOINTS = 24;
let routePlanMode = false;
let routeWaypoints = [];        // [{key, feature}], key = "{Area_id}-{Spot_id}", order = array index
let routeGeometry = null;
let routeTotalDistance = 0;
let routeTotalDuration = 0;
let _routeDebounceTimer = null;

function spotKey(feature) {
    const p = feature.properties;
    return p.Area_id + '-' + p.Spot_id;
}
```

- [ ] **Step 2: Add `preserveDrawingBuffer: true` to map constructor**

In `js/app.js`, modify the map constructor (line 81-91) to add `preserveDrawingBuffer: true`:

```js
const map = new mapboxgl.Map({
    container: 'map',
    style: MAP_STYLES.dark,
    center: PKU_CENTER,
    zoom: PKU_ZOOM,
    pitch: 0,
    bearing: 0,
    minZoom: 13,
    maxZoom: 20,
    attributionControl: false,
    preserveDrawingBuffer: true
});
```

- [ ] **Step 3: Add Level 4 HTML to index.html**

In `index.html`, inside `#bottom-panel` (after `#photo-detail` div, before the closing `</div>` of `#bottom-panel` at line 115), add:

```html
<!-- Level 4: Route Planning -->
<div id="route-plan" class="panel-section">
    <div class="route-plan-header">
        <div class="route-plan-header-left">
            <div class="route-plan-title">路线规划</div>
            <div class="route-plan-count" id="route-plan-count"></div>
        </div>
        <button id="route-clear-btn" class="route-clear-btn" aria-label="清空路线">清空</button>
    </div>
    <div class="route-start-indicator" id="route-start-indicator">
        <span class="route-start-icon">📍</span>
        <span class="route-start-text">起点：第一个景点</span>
    </div>
    <div class="route-waypoint-list" id="route-waypoint-list">
        <div class="route-empty-hint">请添加至少2个景点</div>
    </div>
    <div class="route-actions">
        <button id="route-add-btn" class="route-action-btn">+ 添加景点</button>
        <button id="route-sort-btn" class="route-action-btn route-sort-btn">⚡ 智能排序</button>
    </div>
    <div class="route-summary hidden" id="route-summary">
        <div class="route-summary-info">
            <span id="route-summary-distance"></span>
            <span class="route-sep">·</span>
            <span id="route-summary-duration"></span>
            <span class="route-sep">·</span>
            <span id="route-summary-spots"></span>
        </div>
        <div class="route-summary-actions">
            <button id="route-view-btn" class="route-primary-btn">查看路线</button>
            <button id="route-share-btn" class="route-share-btn" aria-label="分享路线">分享</button>
        </div>
    </div>
</div>

<!-- Spot Picker Overlay -->
<div id="spot-picker" class="spot-picker hidden">
    <div class="spot-picker-header">
        <button id="spot-picker-close" class="spot-picker-close" aria-label="关闭">✕</button>
        <div class="spot-picker-title">添加景点</div>
    </div>
    <div class="spot-picker-search">
        <span class="search-icon">🔍</span>
        <input type="text" id="spot-picker-input" class="search-input" placeholder="搜索景点..." autocomplete="off">
    </div>
    <div class="spot-picker-list" id="spot-picker-list"></div>
</div>

<!-- Route Share Modal -->
<div id="route-share-modal" class="route-share-modal hidden">
    <div class="route-share-modal-content">
        <div class="route-share-modal-title">分享路线</div>
        <button id="route-share-link" class="route-share-option">🔗 复制链接</button>
        <button id="route-share-image" class="route-share-option">📸 分享图片</button>
        <button id="route-share-cancel" class="route-share-cancel">取消</button>
    </div>
</div>
```

- [ ] **Step 4: Add DOM element references in app.js**

After the existing DOM elements block (after line 78, `const spotCategoryFilter`), add:

```js
const routePlan = $('#route-plan');
const routePlanCount = $('#route-plan-count');
const routeWaypointList = $('#route-waypoint-list');
const routeStartIndicator = $('#route-start-indicator');
const routeStartText = routeStartIndicator?.querySelector('.route-start-text');
const routeSummary = $('#route-summary');
const routeSummaryDistance = $('#route-summary-distance');
const routeSummaryDuration = $('#route-summary-duration');
const routeSummarySpots = $('#route-summary-spots');
const routeAddBtn = $('#route-add-btn');
const routeSortBtn = $('#route-sort-btn');
const routeViewBtn = $('#route-view-btn');
const routeShareBtn = $('#route-share-btn');
const routeClearBtn = $('#route-clear-btn');
const spotPicker = $('#spot-picker');
const spotPickerInput = $('#spot-picker-input');
const spotPickerList = $('#spot-picker-list');
const spotPickerClose = $('#spot-picker-close');
const routeShareModal = $('#route-share-modal');
const routeShareLink = $('#route-share-link');
const routeShareImage = $('#route-share-image');
const routeShareCancel = $('#route-share-cancel');
```

- [ ] **Step 5: Commit**

```bash
git add index.html js/app.js
git commit -m "feat: add route planning HTML shell and state variables"
```

---

### Task 2: Add Route Planning CSS

**Files:**
- Modify: `css/style.css` (append new styles at end, before closing)

- [ ] **Step 1: Add route planning panel styles**

Append to `css/style.css`:

```css
/* ═══════════════════════════════════
   ROUTE PLANNING (Level 4)
   ═══════════════════════════════════ */

.route-plan-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 8px;
}

.route-plan-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-accent);
}

.route-plan-count {
    font-size: 12px;
    color: var(--color-text-secondary);
    margin-top: 2px;
}

.route-clear-btn {
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: 12px;
    padding: 4px 12px;
    border-radius: var(--radius-pill);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: all var(--transition-fast);
}

.route-clear-btn:hover {
    color: #f87171;
    border-color: #f87171;
}

/* Start indicator */
.route-start-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    font-size: 13px;
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border);
}

.route-start-icon { font-size: 14px; }

/* Waypoint list */
.route-waypoint-list {
    padding: 8px 0;
    max-height: 40vh;
    overflow-y: auto;
}

.route-empty-hint {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 13px;
    padding: 24px 16px;
}

.route-waypoint-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    transition: background var(--transition-fast);
}

.route-waypoint-item:hover {
    background: var(--color-card-hover);
}

.route-waypoint-num {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--color-accent);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.route-waypoint-info {
    flex: 1;
    min-width: 0;
}

.route-waypoint-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.route-waypoint-area {
    font-size: 11px;
    color: var(--color-text-secondary);
    margin-top: 1px;
}

.route-waypoint-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
}

.route-wp-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 14px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
}

.route-wp-btn:hover {
    background: var(--color-card);
    color: var(--color-text);
}

.route-wp-btn.remove:hover {
    color: #f87171;
}

.route-wp-btn:disabled {
    opacity: 0.2;
    cursor: default;
    pointer-events: none;
}

/* Actions row */
.route-actions {
    display: flex;
    gap: 8px;
    padding: 8px 16px;
    border-top: 1px solid var(--color-border);
}

.route-action-btn {
    flex: 1;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    font-size: 13px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: all var(--transition-fast);
}

.route-action-btn:hover {
    background: var(--color-card-hover);
}

.route-action-btn:disabled {
    opacity: 0.4;
    cursor: default;
}

.route-sort-btn { color: var(--color-key); }

/* Summary bar */
.route-summary {
    padding: 12px 16px;
    border-top: 1px solid var(--color-border);
    background: rgba(56, 189, 248, 0.05);
}

.route-summary.hidden { display: none; }

.route-summary-info {
    font-size: 13px;
    color: var(--color-text-secondary);
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.route-summary-actions {
    display: flex;
    gap: 8px;
}

.route-primary-btn {
    flex: 1;
    background: var(--color-accent);
    border: none;
    color: #0a0f16;
    font-size: 14px;
    font-weight: 600;
    padding: 10px 16px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: all var(--transition-fast);
}

.route-primary-btn:hover { opacity: 0.9; }

.route-share-btn {
    background: var(--color-card);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    font-size: 13px;
    padding: 10px 16px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: all var(--transition-fast);
}

.route-share-btn:hover { background: var(--color-card-hover); }

/* ═══════════════════════════════════
   SPOT PICKER OVERLAY
   ═══════════════════════════════════ */

.spot-picker {
    position: absolute;
    inset: 0;
    background: var(--color-panel-solid);
    z-index: 50;
    display: flex;
    flex-direction: column;
    transition: opacity var(--transition-fast);
}

.spot-picker.hidden { display: none; }

.spot-picker-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid var(--color-border);
}

.spot-picker-close {
    background: none;
    border: none;
    color: var(--color-text);
    font-size: 18px;
    cursor: pointer;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.spot-picker-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
}

.spot-picker-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--color-border);
}

.spot-picker-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
}

.spot-picker-group-header {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted);
    padding: 12px 16px 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.spot-picker-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    cursor: pointer;
    transition: background var(--transition-fast);
}

.spot-picker-item:hover {
    background: var(--color-card-hover);
}

.spot-picker-check {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    flex-shrink: 0;
    transition: all var(--transition-fast);
}

.spot-picker-item.selected .spot-picker-check {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: #fff;
}

.spot-picker-item-name {
    font-size: 14px;
    color: var(--color-text);
}

.spot-picker-item.selected .spot-picker-item-name {
    color: var(--color-accent);
}

/* ═══════════════════════════════════
   ROUTE SHARE MODAL
   ═══════════════════════════════════ */

.route-share-modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 1500;
    display: flex;
    align-items: flex-end;
    justify-content: center;
}

.route-share-modal.hidden { display: none; }

.route-share-modal-content {
    background: var(--color-panel-solid);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding: 24px 16px;
    width: 100%;
    max-width: 400px;
}

.route-share-modal-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
    text-align: center;
    margin-bottom: 16px;
}

.route-share-option {
    display: block;
    width: 100%;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    font-size: 15px;
    padding: 14px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-sans);
    text-align: center;
    margin-bottom: 8px;
    transition: all var(--transition-fast);
}

.route-share-option:hover { background: var(--color-card-hover); }

.route-share-cancel {
    display: block;
    width: 100%;
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 14px;
    padding: 12px;
    cursor: pointer;
    font-family: var(--font-sans);
    margin-top: 4px;
}

/* ═══════════════════════════════════
   ROUTE PLANNING: ENTRY BUTTONS
   ═══════════════════════════════════ */

.route-plan-entry-btn {
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-accent);
    font-size: 12px;
    padding: 4px 12px;
    border-radius: var(--radius-pill);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    gap: 4px;
}

.route-plan-entry-btn:hover {
    background: rgba(56, 189, 248, 0.1);
}

.route-area-btn {
    width: 100%;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    color: var(--color-accent);
    font-size: 13px;
    padding: 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-sans);
    margin: 8px 16px;
    width: calc(100% - 32px);
    transition: all var(--transition-fast);
}

.route-area-btn:hover {
    background: rgba(56, 189, 248, 0.1);
}

/* ═══════════════════════════════════
   ROUTE PLANNING: MOBILE OVERRIDES
   ═══════════════════════════════════ */

@media (max-width: 768px) {
    .route-actions {
        flex-wrap: wrap;
    }

    .route-waypoint-list {
        max-height: 30vh;
    }

    .route-share-modal-content {
        max-width: 100%;
        padding-bottom: calc(24px + env(safe-area-inset-bottom));
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add css/style.css
git commit -m "feat: add route planning CSS styles"
```

---

### Task 3: Core Route Planning Logic (Enter/Exit, Waypoint Management, Panel Rendering)

**Files:**
- Modify: `js/app.js` (add new section after ROUTING section, ~line 282)

- [ ] **Step 1: Add route planning core functions**

In `js/app.js`, after the `clearRouteLayer()` function (after line 281), add a new section:

```js
// ═══════════════════════════════════
//  ROUTE PLANNING
// ═══════════════════════════════════

function enterRoutePlanMode(prefillSpots) {
    routePlanMode = true;
    currentLevel = 4;
    clearRoute();
    routeWaypoints = [];
    routeGeometry = null;
    routeTotalDistance = 0;
    routeTotalDuration = 0;

    // Hide area panel, show bottom panel with route plan section
    areaPanel.classList.add('hidden');
    bottomPanel.classList.remove('panel-hidden');
    brandBadge.classList.add('visible');
    switchBottomSection(routePlan);

    if (prefillSpots && prefillSpots.length > 0) {
        prefillSpots.forEach(f => {
            if (routeWaypoints.length < MAX_WAYPOINTS) {
                routeWaypoints.push({ key: spotKey(f), feature: f });
            }
        });
        tspSortWaypoints();
        requestMultiRoute();
    }

    renderRouteWaypointList();
    updateRouteStartIndicator();
    updateRouteSummary();
    updateBackButton();
    updateMapControlsAfterTransition();
    updateURL();
    resetFloatBtn();
}

function exitRoutePlanMode() {
    routePlanMode = false;
    routeWaypoints = [];
    routeGeometry = null;
    routeTotalDistance = 0;
    routeTotalDuration = 0;
    clearRouteLayer();
    clearRouteMarkers();

    // Return to level 1
    currentLevel = 1;
    currentAreaId = null;
    currentSpotFeature = null;

    hideSpots();
    resetAreaHighlight();

    areaPanel.classList.remove('hidden');
    bottomPanel.classList.add('panel-hidden');
    brandBadge.classList.remove('visible');

    clearSearch();
    setTimeout(() => fitAllAreas(), 50);
    updateBackButton();
    updateMapControlsAfterTransition();
    updateURL();
    resetFloatBtn();
}

function isSpotInRoute(key) {
    return routeWaypoints.some(w => w.key === key);
}

function addWaypoint(feature) {
    const key = spotKey(feature);
    if (isSpotInRoute(key)) return;
    if (routeWaypoints.length >= MAX_WAYPOINTS) {
        showToast('最多添加' + MAX_WAYPOINTS + '个景点');
        return;
    }
    routeWaypoints.push({ key, feature });
    renderRouteWaypointList();
    updateRouteSummary();
    updateRouteMarkers();
    requestMultiRoute();
}

function removeWaypoint(key) {
    routeWaypoints = routeWaypoints.filter(w => w.key !== key);
    renderRouteWaypointList();
    updateRouteSummary();
    updateRouteMarkers();
    if (routeWaypoints.length >= 2) {
        requestMultiRoute();
    } else {
        clearRouteLayer();
        routeGeometry = null;
        routeTotalDistance = 0;
        routeTotalDuration = 0;
        updateRouteSummary();
    }
}

function toggleWaypoint(feature) {
    const key = spotKey(feature);
    if (isSpotInRoute(key)) {
        removeWaypoint(key);
    } else {
        addWaypoint(feature);
    }
}

function moveWaypoint(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= routeWaypoints.length) return;
    const temp = routeWaypoints[index];
    routeWaypoints[index] = routeWaypoints[newIndex];
    routeWaypoints[newIndex] = temp;
    renderRouteWaypointList();
    updateRouteMarkers();
    debouncedRequestMultiRoute();
}

function clearAllWaypoints() {
    routeWaypoints = [];
    routeGeometry = null;
    routeTotalDistance = 0;
    routeTotalDuration = 0;
    clearRouteLayer();
    clearRouteMarkers();
    renderRouteWaypointList();
    updateRouteSummary();
}

function renderRouteWaypointList() {
    if (routeWaypoints.length === 0) {
        routeWaypointList.innerHTML = '<div class="route-empty-hint">请添加至少2个景点</div>';
        routePlanCount.textContent = '';
        return;
    }

    routePlanCount.textContent = routeWaypoints.length + ' 个景点';

    routeWaypointList.innerHTML = routeWaypoints.map((w, idx) => {
        const p = w.feature.properties;
        return `<div class="route-waypoint-item" data-key="${w.key}">
            <div class="route-waypoint-num">${idx + 1}</div>
            <div class="route-waypoint-info">
                <div class="route-waypoint-name">${p.Spot_Name}</div>
                <div class="route-waypoint-area">${p.Area_Name || ''}</div>
            </div>
            <div class="route-waypoint-actions">
                <button class="route-wp-btn move-up" data-index="${idx}" ${idx === 0 ? 'disabled' : ''} aria-label="上移">▲</button>
                <button class="route-wp-btn move-down" data-index="${idx}" ${idx === routeWaypoints.length - 1 ? 'disabled' : ''} aria-label="下移">▼</button>
                <button class="route-wp-btn remove" data-key="${w.key}" aria-label="移除">✕</button>
            </div>
        </div>`;
    }).join('');

    // Bind events
    routeWaypointList.querySelectorAll('.move-up').forEach(btn => {
        btn.addEventListener('click', () => moveWaypoint(parseInt(btn.dataset.index), -1));
    });
    routeWaypointList.querySelectorAll('.move-down').forEach(btn => {
        btn.addEventListener('click', () => moveWaypoint(parseInt(btn.dataset.index), 1));
    });
    routeWaypointList.querySelectorAll('.remove').forEach(btn => {
        btn.addEventListener('click', () => removeWaypoint(btn.dataset.key));
    });
}

function updateRouteStartIndicator() {
    if (!routeStartText) return;
    if (isGeolocateActive && userLocation) {
        routeStartText.textContent = '起点：当前位置';
    } else {
        routeStartText.textContent = '起点：第一个景点';
    }
}

function updateRouteSummary() {
    if (routeWaypoints.length < 2 || !routeGeometry) {
        routeSummary.classList.add('hidden');
        return;
    }
    routeSummary.classList.remove('hidden');

    const dist = routeTotalDistance >= 1000
        ? (routeTotalDistance / 1000).toFixed(1) + ' km'
        : Math.round(routeTotalDistance) + ' m';
    const mins = Math.ceil(routeTotalDuration / 60);

    routeSummaryDistance.textContent = '🚶 ' + dist;
    routeSummaryDuration.textContent = '约 ' + mins + ' 分钟';
    routeSummarySpots.textContent = routeWaypoints.length + ' 个景点';
}
```

- [ ] **Step 2: Update `switchBottomSection` to include route plan**

Modify the existing `switchBottomSection` function (line ~651) from:

```js
function switchBottomSection(section) {
    [spotCards, photoDetail].forEach(s => s.classList.remove('active'));
    section.classList.add('active');
}
```

to:

```js
function switchBottomSection(section) {
    [spotCards, photoDetail, routePlan].forEach(s => s.classList.remove('active'));
    section.classList.add('active');
}
```

- [ ] **Step 3: Update `goBack` to handle Level 4**

In the `goBack()` function (line ~604), add a case for Level 4 at the beginning of the function body, before the `if (currentLevel === 3)` check:

```js
function goBack() {
    clearRoute();
    resetFloatBtn();
    if (currentLevel === 4) {
        exitRoutePlanMode();
        return;
    }
    if (currentLevel === 3) {
```

- [ ] **Step 4: Update `updateBackButton` for Level 4**

In the `updateBackButton()` function (line ~656), add a case for Level 4 after the Level 3 case:

```js
    } else if (currentLevel === 4) {
        nameEl.textContent = '路线规划';
        metaEl.textContent = routeWaypoints.length + ' 个景点';
    }
```

- [ ] **Step 5: Update `togglePanel` for Level 4**

In the `togglePanel()` function (line ~1241), update the show/hide logic to handle Level 4 (route plan uses bottom panel like Level 2/3):

The existing code already handles this correctly since Level 4 uses the bottom panel. No changes needed — `currentLevel === 4` falls into the `else` branch which shows/hides `bottomPanel`.

- [ ] **Step 6: Update `updateURL` for route parameter**

Modify the `updateURL` function (line ~159):

```js
function updateURL() {
    const params = new URLSearchParams();
    if (routePlanMode && routeWaypoints.length > 0) {
        params.set('route', routeWaypoints.map(w => w.key).join(','));
    } else {
        if (currentAreaId != null) params.set('area', currentAreaId);
        if (currentSpotFeature) params.set('spot', currentSpotFeature.properties.Spot_id);
    }
    const qs = params.toString();
    const url = qs ? `${location.pathname}?${qs}` : location.pathname;
    history.replaceState(null, '', url);
}
```

- [ ] **Step 7: Commit**

```bash
git add js/app.js
git commit -m "feat: add route planning core logic (enter/exit, waypoint management, panel rendering)"
```

---

### Task 4: TSP Algorithm & Multi-Point Directions API

**Files:**
- Modify: `js/app.js` (add after the route planning core section)

- [ ] **Step 1: Add TSP and API functions**

Add after the `updateRouteSummary` function:

```js
// ── TSP: Greedy Nearest-Neighbor ──

function tspSortWaypoints() {
    if (routeWaypoints.length <= 2) return;

    let startCoord;
    if (isGeolocateActive && userLocation) {
        startCoord = userLocation;
    } else {
        startCoord = routeWaypoints[0].feature.geometry.coordinates;
    }

    const remaining = [...routeWaypoints];
    const sorted = [];
    let currentCoord = startCoord;

    while (remaining.length > 0) {
        let nearestIdx = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const coord = remaining[i].feature.geometry.coordinates;
            const d = haversineDistance(currentCoord, coord);
            if (d < nearestDist) {
                nearestDist = d;
                nearestIdx = i;
            }
        }
        const nearest = remaining.splice(nearestIdx, 1)[0];
        sorted.push(nearest);
        currentCoord = nearest.feature.geometry.coordinates;
    }

    routeWaypoints = sorted;
}

// ── Multi-Point Directions API ──

function debouncedRequestMultiRoute() {
    clearTimeout(_routeDebounceTimer);
    _routeDebounceTimer = setTimeout(() => requestMultiRoute(), 300);
}

async function requestMultiRoute() {
    if (routeWaypoints.length < 2) return;

    // Build coordinate string
    const coords = [];
    if (isGeolocateActive && userLocation) {
        coords.push(userLocation.join(','));
    }
    routeWaypoints.forEach(w => {
        const c = w.feature.geometry.coordinates;
        coords.push(c[0] + ',' + c[1]);
    });

    const coordStr = coords.join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordStr}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;

    // Show loading state
    if (routeViewBtn) routeViewBtn.disabled = true;
    if (routeSortBtn) routeSortBtn.disabled = true;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.routes || data.routes.length === 0) {
            showToast('无法获取步行路线');
            return;
        }
        const route = data.routes[0];
        routeGeometry = route.geometry;
        routeTotalDistance = route.distance;
        routeTotalDuration = route.duration;
        drawRouteOnMap(routeGeometry);
        updateRouteSummary();
    } catch (err) {
        console.error('[PhotoSpot] 多点路线请求失败:', err);
        showToast('路线获取失败');
    } finally {
        if (routeViewBtn) routeViewBtn.disabled = false;
        if (routeSortBtn) routeSortBtn.disabled = false;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add js/app.js
git commit -m "feat: add TSP nearest-neighbor algorithm and multi-point Directions API"
```

---

### Task 5: Map Numbered Markers

**Files:**
- Modify: `js/app.js` (add after TSP section)

- [ ] **Step 1: Add numbered marker functions**

```js
// ── Route Waypoint Markers on Map ──

function generateMarkerImage(number) {
    const size = 28;
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;  // retina
    canvas.height = size * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // Circle
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Number
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), size / 2, size / 2);

    return canvas;
}

function updateRouteMarkers() {
    clearRouteMarkers();
    if (routeWaypoints.length === 0) return;

    // Register images
    routeWaypoints.forEach((w, idx) => {
        const imgName = 'route-marker-' + (idx + 1);
        if (map.hasImage(imgName)) map.removeImage(imgName);
        const canvas = generateMarkerImage(idx + 1);
        map.addImage(imgName, canvas, { pixelRatio: 2 });
    });

    // Add source
    const features = routeWaypoints.map((w, idx) => ({
        type: 'Feature',
        geometry: w.feature.geometry,
        properties: { icon: 'route-marker-' + (idx + 1), order: idx }
    }));

    map.addSource('route-waypoints', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features }
    });

    map.addLayer({
        id: 'route-waypoint-markers',
        type: 'symbol',
        source: 'route-waypoints',
        layout: {
            'icon-image': ['get', 'icon'],
            'icon-size': 1,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
        }
    });
}

function clearRouteMarkers() {
    if (map.getLayer('route-waypoint-markers')) map.removeLayer('route-waypoint-markers');
    if (map.getSource('route-waypoints')) map.removeSource('route-waypoints');
    // Clean up marker images
    for (let i = 1; i <= MAX_WAYPOINTS; i++) {
        const imgName = 'route-marker-' + i;
        if (map.hasImage(imgName)) map.removeImage(imgName);
    }
}
```

- [ ] **Step 2: Update `style.load` handler to restore route markers**

Modify the `style.load` handler (line ~1139) to add route marker restoration:

```js
map.on('style.load', () => {
    if (!areaData) return;
    addMapSources();
    addMapLayers();
    bindMapEvents();
    if (currentAreaId) showSpotsForArea(currentAreaId);
    if (currentRouteData && !routePlanMode) drawRouteOnMap(currentRouteData);
    if (routePlanMode && routeGeometry) {
        drawRouteOnMap(routeGeometry);
        updateRouteMarkers();
    }
});
```

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: add numbered markers for route waypoints on map"
```

---

### Task 6: Entry Points & Map Click Interaction

**Files:**
- Modify: `index.html:66-71` (add route planning button to area panel header)
- Modify: `js/app.js` (add entry point buttons and map click handling)

- [ ] **Step 1: Add route planning button to area panel header**

In `index.html`, modify the area panel header (line 66-72) to add a route button:

```html
<div class="area-panel-header">
    <img src="assets/pku-logo.png" alt="北京大学" class="panel-logo">
    <div>
        <div class="area-panel-title">PhotoSpot PKU</div>
        <div class="area-panel-subtitle">北京大学摄影点位地图</div>
    </div>
    <button id="route-entry-btn" class="route-plan-entry-btn" aria-label="路线规划">🗺️ 路线</button>
</div>
```

- [ ] **Step 2: Add "Plan Area Route" button in renderSpotCards**

In `js/app.js`, in the `renderSpotCards` function, after the spot category filter rendering and before the cards, add a "plan area route" button. Modify `renderSpotCards` to insert a button after setting spot cards count:

After `spotCardsCount.textContent = ...` (line ~920), add:

```js
    // Add route plan button for this area
    const existingRouteBtn = document.querySelector('.route-area-btn');
    if (existingRouteBtn) existingRouteBtn.remove();

    const routeAreaBtn = document.createElement('button');
    routeAreaBtn.className = 'route-area-btn';
    routeAreaBtn.textContent = '🗺️ 规划本区域路线';
    routeAreaBtn.addEventListener('click', () => {
        const keySpots = spotData.features.filter(f =>
            f.properties.Area_id === areaId && f.properties.Key_Spot === 1
        );
        const allAreaSpots = spotData.features.filter(f => f.properties.Area_id === areaId);
        enterRoutePlanMode(keySpots.length > 0 ? keySpots : allAreaSpots);
    });
    cardsContainer.parentElement.insertBefore(routeAreaBtn, cardsContainer);
```

- [ ] **Step 3: Add entry button event and map click handling**

After the route planning section in `app.js`, add:

```js
// ── Route Planning Entry Points ──

document.getElementById('route-entry-btn')?.addEventListener('click', () => {
    enterRoutePlanMode([]);
});

// ── Route Planning Button Events ──

routeAddBtn?.addEventListener('click', () => openSpotPicker());
routeSortBtn?.addEventListener('click', () => {
    if (routeWaypoints.length <= 2) return;
    tspSortWaypoints();
    renderRouteWaypointList();
    updateRouteMarkers();
    requestMultiRoute();
    showToast('已智能排序');
});
routeViewBtn?.addEventListener('click', () => {
    if (!routeGeometry) return;
    const bounds = new mapboxgl.LngLatBounds();
    routeWaypoints.forEach(w => bounds.extend(w.feature.geometry.coordinates));
    map.fitBounds(bounds, { padding: getMapPadding(), maxZoom: DETAIL_ZOOM, duration: 800 });
});
routeClearBtn?.addEventListener('click', () => clearAllWaypoints());
```

- [ ] **Step 4: Add map click toggle for route mode**

Modify the `_onSpotClick` function (line ~409 of `app.js`) to check for route planning mode before the normal spot selection:

```js
function _onSpotClick(e) {
    e.originalEvent.stopPropagation();
    if (routePlanMode) {
        toggleWaypoint(e.features[0]);
        return;
    }
    selectSpot(e.features[0]);
}
```

- [ ] **Step 5: Update geolocate handler for route planning**

In `js/app.js`, in the `geolocateControl.on('geolocate', ...)` handler (line ~103), after `isGeolocateActive = true;`, replace the existing route refresh block:

```js
    if (routePlanMode) {
        updateRouteStartIndicator();
        if (routeWaypoints.length >= 2) requestMultiRoute();
    } else if (currentRouteData && currentSpotFeature) {
        console.log('[PhotoSpot] 位置变化，自动刷新路线');
        fetchAndShowRoute(currentSpotFeature.geometry.coordinates.slice());
    }
```

- [ ] **Step 6: Add prefill edge case handling**

In `enterRoutePlanMode`, after the prefill block, add a toast when too few spots:

```js
    if (prefillSpots && prefillSpots.length > 0 && routeWaypoints.length < 2) {
        showToast('当前区域景点不足，请手动添加更多');
    }
```

- [ ] **Step 7: Commit**

```bash
git add index.html js/app.js
git commit -m "feat: add route planning entry points and map click interaction"
```

---

### Task 7: Spot Picker Overlay

**Files:**
- Modify: `js/app.js` (add spot picker logic)

- [ ] **Step 1: Add spot picker functions**

```js
// ═══════════════════════════════════
//  SPOT PICKER
// ═══════════════════════════════════

function openSpotPicker() {
    spotPicker.classList.remove('hidden');
    spotPickerInput.value = '';
    renderSpotPickerList('');
    spotPickerInput.focus();
}

function closeSpotPicker() {
    spotPicker.classList.add('hidden');
    spotPickerInput.value = '';
}

function renderSpotPickerList(query) {
    const q = query.trim().toLowerCase();

    // Group spots by area
    const areaGroups = {};
    areaData.features.forEach(a => {
        areaGroups[a.properties.id] = {
            name: a.properties.Area_Name,
            spots: []
        };
    });

    spotData.features.forEach(f => {
        const p = f.properties;
        if (q && !p.Spot_Name.toLowerCase().includes(q)) return;
        if (areaGroups[p.Area_id]) {
            areaGroups[p.Area_id].spots.push(f);
        }
    });

    let html = '';
    Object.entries(areaGroups).forEach(([areaId, group]) => {
        if (group.spots.length === 0) return;
        html += `<div class="spot-picker-group-header">${group.name}</div>`;
        group.spots.forEach(f => {
            const p = f.properties;
            const key = p.Area_id + '-' + p.Spot_id;
            const selected = isSpotInRoute(key);
            html += `<div class="spot-picker-item ${selected ? 'selected' : ''}" data-key="${key}">
                <div class="spot-picker-check">${selected ? '✓' : ''}</div>
                <div class="spot-picker-item-name">${p.Spot_Name}</div>
            </div>`;
        });
    });

    if (!html) {
        html = '<div class="route-empty-hint">没有找到景点</div>';
    }

    spotPickerList.innerHTML = html;

    // Bind click events
    spotPickerList.querySelectorAll('.spot-picker-item').forEach(item => {
        item.addEventListener('click', () => {
            const key = item.dataset.key;
            const [aId, sId] = key.split('-').map(Number);
            const feature = spotData.features.find(f => f.properties.Area_id === aId && f.properties.Spot_id === sId);
            if (feature) {
                toggleWaypoint(feature);
                renderSpotPickerList(spotPickerInput.value);
            }
        });
    });
}

spotPickerClose?.addEventListener('click', closeSpotPicker);
spotPickerInput?.addEventListener('input', (e) => renderSpotPickerList(e.target.value));
```

- [ ] **Step 2: Commit**

```bash
git add js/app.js
git commit -m "feat: add spot picker overlay for route planning"
```

---

### Task 8: Sharing (URL + Screenshot)

**Files:**
- Modify: `js/app.js` (add sharing logic, update `handleURLParams`)

- [ ] **Step 1: Add route sharing functions**

```js
// ═══════════════════════════════════
//  ROUTE SHARING
// ═══════════════════════════════════

function openRouteShareModal() {
    routeShareModal.classList.remove('hidden');
}

function closeRouteShareModal() {
    routeShareModal.classList.add('hidden');
}

routeShareBtn?.addEventListener('click', openRouteShareModal);
routeShareCancel?.addEventListener('click', closeRouteShareModal);
routeShareModal?.addEventListener('click', (e) => {
    if (e.target === routeShareModal) closeRouteShareModal();
});

routeShareLink?.addEventListener('click', async () => {
    const params = new URLSearchParams();
    params.set('route', routeWaypoints.map(w => w.key).join(','));
    const url = location.origin + location.pathname + '?' + params.toString();

    if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        showToast('链接已复制到剪贴板');
    }
    closeRouteShareModal();
});

routeShareImage?.addEventListener('click', async () => {
    try {
        // Fit map to route first
        const bounds = new mapboxgl.LngLatBounds();
        routeWaypoints.forEach(w => bounds.extend(w.feature.geometry.coordinates));
        map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 60 }, maxZoom: DETAIL_ZOOM, duration: 0 });

        // Wait for map to render
        await new Promise(resolve => {
            map.once('idle', resolve);
            setTimeout(resolve, 2000); // fallback timeout
        });

        const mapCanvas = map.getCanvas();
        const mapDataUrl = mapCanvas.toDataURL('image/png');

        // Check if capture succeeded
        if (!mapDataUrl || mapDataUrl === 'data:,') {
            showToast('截图失败，已复制链接');
            const params = new URLSearchParams();
            params.set('route', routeWaypoints.map(w => w.key).join(','));
            if (navigator.clipboard) await navigator.clipboard.writeText(location.origin + location.pathname + '?' + params.toString());
            closeRouteShareModal();
            return;
        }

        // Load map image and add watermark
        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Watermark background
            const barHeight = 80;
            ctx.fillStyle = 'rgba(10, 15, 22, 0.85)';
            ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

            // Watermark text
            ctx.fillStyle = '#f0f4f8';
            ctx.font = 'bold 20px Inter, sans-serif';
            ctx.fillText('PhotoSpot PKU · 路线规划', 16, canvas.height - barHeight + 28);

            ctx.fillStyle = '#94a3b8';
            ctx.font = '16px Inter, sans-serif';
            const dist = routeTotalDistance >= 1000
                ? (routeTotalDistance / 1000).toFixed(1) + ' km'
                : Math.round(routeTotalDistance) + ' m';
            const mins = Math.ceil(routeTotalDuration / 60);
            const spotNames = routeWaypoints.map(w => w.feature.properties.Spot_Name).join(' → ');
            ctx.fillText(`${dist} · ~${mins}min · ${spotNames}`, 16, canvas.height - barHeight + 56);

            canvas.toBlob(async (blob) => {
                if (!blob) { showToast('图片生成失败'); return; }

                const file = new File([blob], 'photospot-route.png', { type: 'image/png' });

                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({ files: [file], title: 'PhotoSpot PKU Route' });
                    } catch (e) { /* cancelled */ }
                } else {
                    // Download fallback
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'photospot-route.png';
                    a.click();
                    URL.revokeObjectURL(a.href);
                    showToast('路线图已下载');
                }
                closeRouteShareModal();
            }, 'image/png');
        };
        img.src = mapDataUrl;
    } catch (err) {
        console.error('[PhotoSpot] 截图分享失败:', err);
        showToast('分享失败');
        closeRouteShareModal();
    }
});
```

- [ ] **Step 2: Update `handleURLParams` to support route parameter**

Modify the `handleURLParams` function (line ~182) to handle `?route=` parameter:

```js
function handleURLParams() {
    const params = new URLSearchParams(location.search);

    // Route parameter takes precedence (format: "areaId-spotId,areaId-spotId,...")
    const routeParam = params.get('route');
    if (routeParam) {
        const keys = routeParam.split(',');
        const features = keys.map(key => {
            const [aId, sId] = key.split('-').map(Number);
            return spotData.features.find(f => f.properties.Area_id === aId && f.properties.Spot_id === sId);
        }).filter(Boolean);
        if (features.length > 0) {
            enterRoutePlanMode(features);
            return;
        }
    }

    const areaId = params.get('area') ? parseInt(params.get('area')) : null;
    const spotId = params.get('spot') ? parseInt(params.get('spot')) : null;

    if (areaId == null) return;

    const area = areaData.features.find(f => f.properties.id === areaId);
    if (!area) return;

    selectArea(areaId, area.geometry.coordinates);

    if (spotId != null) {
        const spotFeature = spotData.features.find(f => f.properties.Spot_id === spotId);
        if (spotFeature) {
            setTimeout(() => selectSpot(spotFeature), 400);
        }
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: add route sharing (URL + screenshot with watermark)"
```

---

### Task 9: Float Button & Mobile Integration

**Files:**
- Modify: `js/app.js` (update float button for route mode)

- [ ] **Step 1: Update float button for route planning mode**

Modify the `resetFloatBtn` function (find it — it likely resets the float button state). If there is no `resetFloatBtn`, find where `floatBtnIcon.textContent` is set and add route mode handling.

In the `togglePanel` function, update to handle Level 4:

The existing code at line ~1241 already handles Level 4 correctly (it falls into the `else` branch for bottom panel). Update `resetFloatBtn` to set the icon to 🗺️ when in route mode:

Find `resetFloatBtn` and add:

```js
function resetFloatBtn() {
    panelHidden = false;
    floatBtn.classList.remove('show-mode');
    if (routePlanMode) {
        floatBtnIcon.textContent = '🗺️';
    } else {
        floatBtnIcon.textContent = '✕';
    }
}
```

Note: If `resetFloatBtn` doesn't exist as a standalone function, look for where `floatBtnIcon.textContent = '✕'` is set and add the route mode check there.

- [ ] **Step 2: Also update the togglePanel show-mode icon**

In `togglePanel`, when `panelHidden = true` (hiding), set:

```js
floatBtnIcon.textContent = routePlanMode ? '🗺️' : '📷';
```

And when `panelHidden = false` (showing), set:

```js
floatBtnIcon.textContent = '✕';
```

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: update float button icon for route planning mode"
```

---

### Task 10: Integration Testing & Final Fixes

**Files:**
- All three files for any fixes

- [ ] **Step 1: Start dev server and test**

```bash
cd "/Users/raymond/Documents/PhotoSpot PKU" && npm run dev
```

- [ ] **Step 2: Test basic flow**

Open `http://localhost:3000` in browser. Test:
1. Click 🗺️ route button in area panel header → Level 4 panel opens
2. Click "添加景点" → spot picker opens with all spots grouped by area
3. Select 3+ spots → they appear in waypoint list with numbers
4. Click "智能排序" → waypoints reorder
5. Route line appears on map with numbered markers
6. Click "查看路线" → map fits to route bounds
7. Move waypoints up/down → route updates
8. Remove a waypoint → route updates
9. Click "清空" → all cleared

- [ ] **Step 3: Test area entry**

1. Navigate to an area (Level 2)
2. Click "🗺️ 规划本区域路线" → Level 4 with area's key spots pre-filled
3. Route automatically calculated and displayed

- [ ] **Step 4: Test sharing**

1. Click "分享" → modal with two options
2. "复制链接" → URL with `?route=` param copied
3. Open copied URL → route planning mode loads with correct spots
4. "分享图片" → screenshot generated with watermark

- [ ] **Step 5: Test mobile**

1. Resize to mobile viewport (<768px)
2. Float button shows 🗺️ in route mode
3. Panel works as bottom drawer
4. Spot picker works full-screen

- [ ] **Step 6: Fix any issues found and commit**

```bash
git add index.html js/app.js css/style.css
git commit -m "fix: address integration issues in route planning"
```
