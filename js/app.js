/* ===================================
   PhotoSpot PKU — Main Application
   Map-dominant + Area panel + Bottom strips
   =================================== */

// ── Data Base URL (Tencent COS) ──
const DATA_BASE_URL = 'https://raymondstorage-1307420465.cos.ap-beijing.myqcloud.com/';

// ── Mapbox Token (from js/config.js) ──
mapboxgl.accessToken = MAPBOX_TOKEN;

// ── Map Style Presets ──
const MAP_STYLES = {
    dark: 'mapbox://styles/mapbox/dark-v11',
    streets: 'mapbox://styles/mapbox/streets-v12',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12'
};

// ── PKU Campus Center ──
const PKU_CENTER = [116.3042, 39.9930];
const PKU_ZOOM = 15.8;
const DETAIL_ZOOM = 17.5;

// ── State ──
let areaData = null;
let spotData = null;
let imageManifest = null;
let imageMetadata = null;
let currentLevel = 1;
let currentAreaId = null;
let currentSpotFeature = null;
let currentStyle = 'dark';
let currentPhotoIndex = 0;
let currentImages = [];
let currentCategoryFilter = 'all'; // 'all', '风光', '人像'

// ── Geolocation & Routing State ──
let userLocation = null;
let isGeolocateActive = false;
let currentRouteData = null;
const PKU_GEOFENCE_RADIUS = 5000; // meters

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

// ── DOM Elements ──
const $ = (sel) => document.querySelector(sel);
const areaPanel = $('#area-panel');
const areasContainer = $('#areas-container');
const bottomPanel = $('#bottom-panel');
const spotCards = $('#spot-cards');
const photoDetail = $('#photo-detail');
const cardsContainer = $('#cards-container');
const photoStrip = $('#photo-strip');
const photoDots = $('#photo-dots');
const photoDesc = $('#photo-desc');
const spotCardsTitle = $('#spot-cards-title');
const spotCardsCount = $('#spot-cards-count');
const brandBadge = $('#brand-badge');
const backBtn = $('#back-btn');
const loadingOverlay = $('#loading-overlay');
const styleSwitcher = $('#style-switcher');
const lightbox = $('#lightbox');
const lightboxImg = $('#lightbox-img');
const lightboxClose = $('#lightbox-close');
const lightboxPrev = $('#lightbox-prev');
const lightboxNext = $('#lightbox-next');
const lightboxExif = $('#lightbox-exif');
const lightboxSpotName = $('#lightbox-spot-name');
const lightboxSpotArea = $('#lightbox-spot-area');
const floatBtn = $('#float-btn');
const floatBtnIcon = $('#float-btn-icon');
const toastEl = $('#toast');
const routeInfoEl = $('#route-info');
const routeDistanceEl = $('#route-distance');
const routeDurationEl = $('#route-duration');
const searchInput = $('#search-input');
const searchClear = $('#search-clear');
const shareBtn = $('#share-btn');
const categoryFilter = $('#category-filter');
const spotCategoryFilter = $('#spot-category-filter');
const routePlan = $('#route-plan');
const routePlanCount = $('#route-plan-count');
const routeWaypointListEl = $('#route-waypoint-list');
const routeStartIndicator = $('#route-start-indicator');
const routeStartText = document.querySelector('.route-start-text');
const routeSummary = $('#route-summary');
const routeSummaryDistance = $('#route-summary-distance');
const routeSummaryDuration = $('#route-summary-duration');
const routeSummarySpots = $('#route-summary-spots');
const routeAddBtn = $('#route-add-btn');
const routeSortBtn = $('#route-sort-btn');
const routeViewBtn = $('#route-view-btn');
const routeShareBtnRoute = $('#route-share-btn-route');
const routeClearBtn = $('#route-clear-btn');
const spotPicker = $('#spot-picker');
const spotPickerInput = $('#spot-picker-input');
const spotPickerList = $('#spot-picker-list');
const spotPickerClose = $('#spot-picker-close');
const routeShareModal = $('#route-share-modal');
const routeShareLink = $('#route-share-link');
const routeShareImage = $('#route-share-image');
const routeShareCancel = $('#route-share-cancel');

// ── Initialize Map ──
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

map.addControl(new mapboxgl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');

// ── Geolocate Control ──
const geolocateControl = new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
});
map.addControl(geolocateControl, 'top-right');

geolocateControl.on('geolocate', (e) => {
    const pos = [e.coords.longitude, e.coords.latitude];
    const dist = haversineDistance(pos, PKU_CENTER);
    console.log('[PhotoSpot] 定位成功:', pos, '距北大', Math.round(dist) + 'm');
    if (dist > PKU_GEOFENCE_RADIUS) {
        console.warn('[PhotoSpot] 超出地理围栏');
        showToast('你不在北京大学附近（' + Math.round(dist) + 'm），无法导航');
        geolocateControl.trigger();
        userLocation = null;
        isGeolocateActive = false;
        clearRoute();
        return;
    }
    userLocation = pos;
    isGeolocateActive = true;

    if (routePlanMode) {
        updateRouteStartIndicator();
        if (routeWaypoints.length >= 2) requestMultiRoute();
    } else if (currentRouteData && currentSpotFeature) {
        console.log('[PhotoSpot] 位置变化，自动刷新路线');
        fetchAndShowRoute(currentSpotFeature.geometry.coordinates.slice());
    }
});

geolocateControl.on('error', (e) => {
    console.error('[PhotoSpot] 定位失败:', e.message || e);
    showToast('定位失败: ' + (e.message || '未知错误'));
});

geolocateControl.on('trackuserlocationend', () => {
    console.log('[PhotoSpot] trackuserlocationend → 地图不再跟随用户');
});

map.addControl(new mapboxgl.ScaleControl({ maxWidth: 100 }), 'bottom-right');

// ═══════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════

let _toastTimer = null;
function showToast(message, duration = 3000) {
    clearTimeout(_toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add('visible');
    _toastTimer = setTimeout(() => toastEl.classList.remove('visible'), duration);
}

function haversineDistance(c1, c2) {
    const R = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(c2[1] - c1[1]);
    const dLon = toRad(c2[0] - c1[0]);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(c1[1])) * Math.cos(toRad(c2[1])) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── URL State & Share ──
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

shareBtn.addEventListener('click', async () => {
    const url = location.href;
    const area = areaData.features.find(f => f.properties.id === currentAreaId);
    const title = area ? area.properties.Area_Name + ' - PhotoSpot PKU' : 'PhotoSpot PKU';
    if (navigator.share) {
        try {
            await navigator.share({ title, url });
        } catch (e) { /* user cancelled */ }
    } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        showToast('链接已复制到剪贴板');
    }
});

function handleURLParams() {
    const params = new URLSearchParams(location.search);

    // Route parameter takes precedence
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

// ═══════════════════════════════════
//  ROUTING
// ═══════════════════════════════════

async function fetchAndShowRoute(destination) {
    if (!userLocation || !isGeolocateActive) {
        console.warn('[PhotoSpot] fetchAndShowRoute 跳过: userLocation=', userLocation, 'isGeolocateActive=', isGeolocateActive);
        return;
    }
    console.log('[PhotoSpot] 请求路线:', userLocation, '→', destination);
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${userLocation[0]},${userLocation[1]};${destination[0]},${destination[1]}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.routes || data.routes.length === 0) {
            console.warn('[PhotoSpot] API 返回无路线');
            showToast('无法获取步行路线');
            return;
        }
        const route = data.routes[0];
        const dist = route.distance >= 1000 ? (route.distance / 1000).toFixed(1) + 'km' : Math.round(route.distance) + 'm';
        console.log('[PhotoSpot] 路线获取成功: 距离', dist, '耗时约', Math.ceil(route.duration / 60), '分钟');
        currentRouteData = route.geometry;
        drawRouteOnMap(route.geometry);
        showRouteInfo(route.distance, route.duration);
    } catch (err) {
        console.error('[PhotoSpot] 路线请求失败:', err);
        showToast('路线获取失败');
    }
}

function drawRouteOnMap(geometry) {
    clearRouteLayer();
    map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry }
    });
    map.addLayer({
        id: 'route-line-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#000000', 'line-width': 8, 'line-opacity': 0.4 }
    }, getFirstAreaLayer());
    map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#34d399', 'line-width': 5, 'line-opacity': 0.85 }
    }, getFirstAreaLayer());
}

function getFirstAreaLayer() {
    // Insert route below area layers so it doesn't cover markers
    return map.getLayer('area-glow') ? 'area-glow' : undefined;
}

function showRouteInfo(distMeters, durSeconds) {
    const dist = distMeters >= 1000
        ? (distMeters / 1000).toFixed(1) + ' km'
        : Math.round(distMeters) + ' m';
    const mins = Math.ceil(durSeconds / 60);
    routeDistanceEl.textContent = '步行 ' + dist;
    routeDurationEl.textContent = '约 ' + mins + ' 分钟';
    routeInfoEl.classList.add('visible');
}

function clearRoute() {
    console.log('[PhotoSpot] 清除路线');
    currentRouteData = null;
    clearRouteLayer();
    if (routeInfoEl) routeInfoEl.classList.remove('visible');
}

function clearRouteLayer() {
    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getLayer('route-line-casing')) map.removeLayer('route-line-casing');
    if (map.getSource('route')) map.removeSource('route');
}

// ═══════════════════════════════════
//  ROUTE PLANNING
// ═══════════════════════════════════

function enterRoutePlanMode(prefillSpots) {
    routePlanMode = true;
    currentLevel = 4;
    routePanelCollapsed = false;
    bottomPanel.classList.remove('panel-collapsed');
    clearRoute();
    routeWaypoints = [];
    routeGeometry = null;
    routeTotalDistance = 0;
    routeTotalDuration = 0;

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
        if (routeWaypoints.length >= 2) {
            tspSortWaypoints();
            requestMultiRoute();
        } else {
            showToast('当前区域景点不足，请手动添加更多');
        }
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
    routePanelCollapsed = false;
    bottomPanel.classList.remove('panel-collapsed');
    routeWaypoints = [];
    routeGeometry = null;
    routeTotalDistance = 0;
    routeTotalDuration = 0;
    clearRouteLayer();
    clearRouteMarkers();

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

let routePanelCollapsed = false;

function collapseRoutePanel() {
    if (routePanelCollapsed) return;
    routePanelCollapsed = true;
    bottomPanel.classList.add('panel-collapsed');
    const collapseBtn = document.getElementById('route-collapse-btn');
    if (collapseBtn) collapseBtn.textContent = '展开';
}

function expandRoutePanel() {
    if (!routePanelCollapsed) return;
    routePanelCollapsed = false;
    bottomPanel.classList.remove('panel-collapsed');
    const collapseBtn = document.getElementById('route-collapse-btn');
    if (collapseBtn) collapseBtn.textContent = '收起';
}

function toggleRoutePanel() {
    if (routePanelCollapsed) {
        expandRoutePanel();
    } else {
        collapseRoutePanel();
    }
    updateMapControlsAfterTransition();
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

function setAsStart(index) {
    if (index <= 0 || index >= routeWaypoints.length) return;
    const item = routeWaypoints.splice(index, 1)[0];
    routeWaypoints.unshift(item);
    renderRouteWaypointList();
    updateRouteMarkers();
    debouncedRequestMultiRoute();
}

function renderRouteWaypointList() {
    if (routeWaypoints.length === 0) {
        routeWaypointListEl.innerHTML = '<div class="route-empty-hint">请添加至少2个景点</div>';
        routePlanCount.textContent = '';
        return;
    }

    routePlanCount.textContent = routeWaypoints.length + ' 个景点';

    routeWaypointListEl.innerHTML = routeWaypoints.map((w, idx) => {
        const p = w.feature.properties;
        return `<div class="route-waypoint-item" draggable="true" data-key="${w.key}" data-index="${idx}">
            <div class="route-waypoint-drag" aria-label="拖拽排序">⋮⋮</div>
            <div class="route-waypoint-num">${idx + 1}</div>
            <div class="route-waypoint-info">
                <div class="route-waypoint-name">${p.Spot_Name}</div>
                <div class="route-waypoint-area">${p.Area_Name || ''}</div>
            </div>
            <div class="route-waypoint-actions">
                ${idx > 0 ? `<button class="route-wp-btn set-start" data-index="${idx}" aria-label="设为起点" title="设为起点">置顶</button>` : ''}
                <button class="route-wp-btn remove" data-key="${w.key}" aria-label="移除">✕</button>
            </div>
        </div>`;
    }).join('');

    // Set as start
    routeWaypointListEl.querySelectorAll('.set-start').forEach(btn => {
        btn.addEventListener('click', () => setAsStart(parseInt(btn.dataset.index)));
    });
    // Remove
    routeWaypointListEl.querySelectorAll('.remove').forEach(btn => {
        btn.addEventListener('click', () => removeWaypoint(btn.dataset.key));
    });

    // Drag and drop
    initWaypointDragDrop();
}

function initWaypointDragDrop() {
    const items = routeWaypointListEl.querySelectorAll('.route-waypoint-item');
    let dragIdx = null;

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            dragIdx = parseInt(item.dataset.index);
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            // Needed for Firefox
            e.dataTransfer.setData('text/plain', '');
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            routeWaypointListEl.querySelectorAll('.route-waypoint-item').forEach(el => el.classList.remove('drag-over'));
            dragIdx = null;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const overIdx = parseInt(item.dataset.index);
            if (overIdx === dragIdx) return;
            items.forEach(el => el.classList.remove('drag-over'));
            item.classList.add('drag-over');
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const dropIdx = parseInt(item.dataset.index);
            if (dragIdx === null || dragIdx === dropIdx) return;
            // Reorder
            const moved = routeWaypoints.splice(dragIdx, 1)[0];
            routeWaypoints.splice(dropIdx, 0, moved);
            renderRouteWaypointList();
            updateRouteMarkers();
            debouncedRequestMultiRoute();
        });
    });

    // Touch drag support
    let touchDragIdx = null;
    let touchClone = null;
    let touchStartY = 0;
    let longPressTimer = null;

    items.forEach(item => {
        const dragHandle = item.querySelector('.route-waypoint-drag');
        if (!dragHandle) return;

        dragHandle.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            longPressTimer = setTimeout(() => {
                touchDragIdx = parseInt(item.dataset.index);
                item.classList.add('dragging');
                // Create floating clone
                touchClone = item.cloneNode(true);
                touchClone.classList.add('drag-clone');
                touchClone.style.width = item.offsetWidth + 'px';
                document.body.appendChild(touchClone);
                touchClone.style.top = (e.touches[0].clientY - 20) + 'px';
                touchClone.style.left = item.getBoundingClientRect().left + 'px';
            }, 300);
        }, { passive: true });

        dragHandle.addEventListener('touchmove', (e) => {
            if (touchDragIdx === null) {
                // Cancel long press if moved too much before activation
                if (Math.abs(e.touches[0].clientY - touchStartY) > 10) {
                    clearTimeout(longPressTimer);
                }
                return;
            }
            e.preventDefault();
            const y = e.touches[0].clientY;
            if (touchClone) touchClone.style.top = (y - 20) + 'px';

            // Highlight drop target
            items.forEach(el => el.classList.remove('drag-over'));
            const overEl = document.elementFromPoint(e.touches[0].clientX, y);
            const overItem = overEl?.closest('.route-waypoint-item');
            if (overItem && overItem !== item) overItem.classList.add('drag-over');
        });

        dragHandle.addEventListener('touchend', (e) => {
            clearTimeout(longPressTimer);
            if (touchDragIdx === null) return;

            const y = e.changedTouches[0].clientY;
            const overEl = document.elementFromPoint(e.changedTouches[0].clientX, y);
            const overItem = overEl?.closest('.route-waypoint-item');
            const dropIdx = overItem ? parseInt(overItem.dataset.index) : null;

            if (dropIdx !== null && dropIdx !== touchDragIdx) {
                const moved = routeWaypoints.splice(touchDragIdx, 1)[0];
                routeWaypoints.splice(dropIdx, 0, moved);
                renderRouteWaypointList();
                updateRouteMarkers();
                debouncedRequestMultiRoute();
            } else {
                items.forEach(el => el.classList.remove('drag-over', 'dragging'));
            }

            if (touchClone) { touchClone.remove(); touchClone = null; }
            touchDragIdx = null;
        });

        dragHandle.addEventListener('touchcancel', () => {
            clearTimeout(longPressTimer);
            items.forEach(el => el.classList.remove('drag-over', 'dragging'));
            if (touchClone) { touchClone.remove(); touchClone = null; }
            touchDragIdx = null;
        });
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

// ── Route Waypoint Markers on Map ──

function generateMarkerImage(number) {
    const size = 56; // retina size
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), size / 2, size / 2);

    return { width: size, height: size, data: ctx.getImageData(0, 0, size, size).data };
}

function updateRouteMarkers() {
    clearRouteMarkers();
    if (routeWaypoints.length === 0) return;

    routeWaypoints.forEach((w, idx) => {
        const imgName = 'route-marker-' + (idx + 1);
        if (map.hasImage(imgName)) map.removeImage(imgName);
        const imgData = generateMarkerImage(idx + 1);
        map.addImage(imgName, imgData, { pixelRatio: 2 });
    });

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
    for (let i = 1; i <= MAX_WAYPOINTS; i++) {
        const imgName = 'route-marker-' + i;
        if (map.hasImage(imgName)) map.removeImage(imgName);
    }
}

// ═══════════════════════════════════
//  SPOT PICKER
// ═══════════════════════════════════

function openSpotPicker() {
    // Expand panel if collapsed so picker header is visible
    if (routePanelCollapsed) expandRoutePanel();
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
        const allSelected = group.spots.every(f => isSpotInRoute(f.properties.Area_id + '-' + f.properties.Spot_id));
        html += `<div class="spot-picker-group-header">
            <span>${group.name}</span>
            <button class="spot-picker-add-all" data-area-id="${areaId}">${allSelected ? '全部移除' : '全部添加'}</button>
        </div>`;
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

    spotPickerList.querySelectorAll('.spot-picker-add-all').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const aId = parseInt(btn.dataset.areaId);
            const group = areaGroups[aId];
            if (!group) return;
            const allSelected = group.spots.every(f => isSpotInRoute(f.properties.Area_id + '-' + f.properties.Spot_id));
            if (allSelected) {
                group.spots.forEach(f => {
                    const key = spotKey(f);
                    if (isSpotInRoute(key)) removeWaypoint(key);
                });
            } else {
                group.spots.forEach(f => {
                    if (!isSpotInRoute(spotKey(f))) addWaypoint(f);
                });
            }
            renderSpotPickerList(spotPickerInput.value);
        });
    });
}

// ═══════════════════════════════════
//  ROUTE SHARING
// ═══════════════════════════════════

function openRouteShareModal() {
    routeShareModal.classList.remove('hidden');
}

function closeRouteShareModal() {
    routeShareModal.classList.add('hidden');
}

// ── Route Planning Event Listeners ──

document.getElementById('route-entry-btn')?.addEventListener('click', () => {
    enterRoutePlanMode([]);
});

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
    // Collapse panel first so map gets full viewport
    collapseRoutePanel();
    setTimeout(() => {
        const bounds = new mapboxgl.LngLatBounds();
        routeWaypoints.forEach(w => bounds.extend(w.feature.geometry.coordinates));
        map.fitBounds(bounds, { padding: { top: 80, left: 60, right: 60, bottom: 60 }, maxZoom: DETAIL_ZOOM, duration: 800 });
    }, 100);
});
routeClearBtn?.addEventListener('click', () => clearAllWaypoints());
document.getElementById('route-collapse-btn')?.addEventListener('click', toggleRoutePanel);
// Click on collapsed header expands it
document.querySelector('.route-plan-header')?.addEventListener('click', (e) => {
    if (routePanelCollapsed && !e.target.closest('button')) {
        expandRoutePanel();
        updateMapControlsAfterTransition();
    }
});

spotPickerClose?.addEventListener('click', closeSpotPicker);
spotPickerInput?.addEventListener('input', (e) => renderSpotPickerList(e.target.value));

routeShareBtnRoute?.addEventListener('click', openRouteShareModal);
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
        const bounds = new mapboxgl.LngLatBounds();
        routeWaypoints.forEach(w => bounds.extend(w.feature.geometry.coordinates));
        map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 60 }, maxZoom: DETAIL_ZOOM, duration: 0 });

        await new Promise(resolve => {
            map.once('idle', resolve);
            setTimeout(resolve, 2000);
        });

        const mapCanvas = map.getCanvas();
        const mapDataUrl = mapCanvas.toDataURL('image/png');

        if (!mapDataUrl || mapDataUrl === 'data:,') {
            showToast('截图失败，已复制链接');
            const params = new URLSearchParams();
            params.set('route', routeWaypoints.map(w => w.key).join(','));
            if (navigator.clipboard) await navigator.clipboard.writeText(location.origin + location.pathname + '?' + params.toString());
            closeRouteShareModal();
            return;
        }

        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const barHeight = 80;
            ctx.fillStyle = 'rgba(10, 15, 22, 0.85)';
            ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

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

// ═══════════════════════════════════
//  DATA LOADING
// ═══════════════════════════════════

async function loadData() {
    try {
        const [areaRes, spotRes, manifestRes, metaRes] = await Promise.all([
            fetch(DATA_BASE_URL + 'data/spot_data/PKU_Area.json'),
            fetch(DATA_BASE_URL + 'data/spot_data/PKU_spot.json'),
            fetch(DATA_BASE_URL + 'data/image_manifest.json'),
            fetch(DATA_BASE_URL + 'data/image_metadata.json').catch(() => ({ json: () => ({}) }))
        ]);
        areaData = await areaRes.json();
        spotData = await spotRes.json();
        imageManifest = await manifestRes.json();
        imageMetadata = await metaRes.json();
    } catch (err) {
        console.error('Failed to load data:', err);
    }
}

function getSpotImages(areaId, spotId) {
    if (!imageManifest) return [];
    return imageManifest[`${areaId}-${spotId}`] || [];
}

function getAreaCover(areaId) {
    if (!imageManifest || !imageManifest._covers) return null;
    return imageManifest._covers[String(areaId)] || null;
}

// ── Image URL with COS resize (imageMogr2) ──
// Appends Tencent COS image processing to resize server-side, avoiding loading 24MB originals as thumbnails
function imgUrl(path, width) {
    const url = DATA_BASE_URL + path;
    if (!width) return url; // full size for lightbox
    return url + '?imageMogr2/thumbnail/' + width + 'x/quality/80';
}

// Clean up verbose lens model names (e.g. "SIGMA 56mm F1.4 DC DN | Contemporary 018" → "SIGMA 56mm F1.4 DC DN")
function cleanLensModel(name) {
    if (!name) return '';
    return name.replace(/\s*\|\s*Contemporary\s*\d*/i, '').trim();
}

// ═══════════════════════════════════
//  MAP SOURCES & LAYERS
// ═══════════════════════════════════

function addMapSources() {
    map.addSource('areas', { type: 'geojson', data: areaData });
    map.addSource('spots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
}

function addMapLayers() {
    map.addLayer({ id: 'area-glow', type: 'circle', source: 'areas',
        filter: ['==', ['get', 'Key_Area'], 1],
        paint: { 'circle-radius': 14, 'circle-color': 'rgba(56, 189, 248, 0.20)', 'circle-blur': 0.6 }
    });
    map.addLayer({ id: 'area-circle', type: 'circle', source: 'areas',
        filter: ['!=', ['get', 'Key_Area'], 1],
        paint: {
            'circle-radius': 6,
            'circle-color': '#0ea5e9',
            'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff'
        }
    });
    map.addLayer({ id: 'area-star', type: 'symbol', source: 'areas',
        filter: ['==', ['get', 'Key_Area'], 1],
        layout: { 'text-field': '★', 'text-size': 24, 'text-allow-overlap': true, 'text-ignore-placement': true },
        paint: { 'text-color': '#f59e0b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }
    });
    map.addLayer({ id: 'area-label', type: 'symbol', source: 'areas',
        layout: {
            'text-field': ['get', 'Area_Name'],
            'text-font': ['Noto Sans CJK SC Regular', 'Arial Unicode MS Regular'],
            'text-size': 12, 'text-offset': [0, 1.8], 'text-anchor': 'top',
            'text-allow-overlap': false, 'text-ignore-placement': false
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0, 0, 0, 0.75)', 'text-halo-width': 1.5 }
    });
    map.addLayer({ id: 'spot-glow', type: 'circle', source: 'spots',
        paint: { 'circle-radius': 10, 'circle-color': 'rgba(232, 167, 60, 0.20)', 'circle-blur': 0.5 }
    });
    map.addLayer({ id: 'spot-circle', type: 'circle', source: 'spots',
        filter: ['!=', ['get', 'Key_Spot'], 1],
        paint: { 'circle-radius': 5, 'circle-color': '#e8a73c', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }
    });
    map.addLayer({ id: 'spot-star', type: 'symbol', source: 'spots',
        filter: ['==', ['get', 'Key_Spot'], 1],
        layout: { 'text-field': '★', 'text-size': 22, 'text-allow-overlap': true, 'text-ignore-placement': true },
        paint: { 'text-color': '#f59e0b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }
    });
    map.addLayer({ id: 'spot-label', type: 'symbol', source: 'spots',
        layout: {
            'text-field': ['get', 'Spot_Name'],
            'text-font': ['Noto Sans CJK SC Regular', 'Arial Unicode MS Regular'],
            'text-size': 11, 'text-offset': [0, 1.8], 'text-anchor': 'top',
            'text-allow-overlap': false, 'text-ignore-placement': false
        },
        paint: { 'text-color': '#fde68a', 'text-halo-color': 'rgba(0, 0, 0, 0.75)', 'text-halo-width': 1.2 }
    });
}

function showSpotsForArea(areaId) {
    const filtered = { type: 'FeatureCollection', features: spotData.features.filter(f => f.properties.Area_id === areaId) };
    const source = map.getSource('spots');
    if (source) source.setData(filtered);
}

function hideSpots() {
    const source = map.getSource('spots');
    if (source) source.setData({ type: 'FeatureCollection', features: [] });
}

// ═══════════════════════════════════
//  MAP EVENTS
// ═══════════════════════════════════

// Named handlers so we can remove before re-adding (prevents duplicates on style.load)
function _onAreaClick(e) {
    e.originalEvent.stopPropagation();
    const feature = e.features[0];
    selectArea(feature.properties.id, feature.geometry.coordinates.slice());
}

function _onSpotClick(e) {
    e.originalEvent.stopPropagation();
    if (routePlanMode) {
        toggleWaypoint(e.features[0]);
        return;
    }
    selectSpot(e.features[0]);
}

function _cursorPointer() { map.getCanvas().style.cursor = 'pointer'; }
function _cursorDefault() { map.getCanvas().style.cursor = ''; }

function bindMapEvents() {
    // Remove previous listeners first (safe even if not yet added)
    map.off('click', 'area-circle', _onAreaClick);
    map.off('click', 'area-star', _onAreaClick);
    map.off('click', 'spot-circle', _onSpotClick);
    map.off('click', 'spot-star', _onSpotClick);
    ['area-circle', 'area-star', 'spot-circle', 'spot-star'].forEach(layer => {
        map.off('mouseenter', layer, _cursorPointer);
        map.off('mouseleave', layer, _cursorDefault);
    });

    // Add listeners
    map.on('click', 'area-circle', _onAreaClick);
    map.on('click', 'area-star', _onAreaClick);
    map.on('click', 'spot-circle', _onSpotClick);
    map.on('click', 'spot-star', _onSpotClick);
    ['area-circle', 'area-star', 'spot-circle', 'spot-star'].forEach(layer => {
        map.on('mouseenter', layer, _cursorPointer);
        map.on('mouseleave', layer, _cursorDefault);
    });
}

// ═══════════════════════════════════
//  HELPERS
// ═══════════════════════════════════

function isMobile() { return window.innerWidth <= 768; }

function getMapPadding() {
    if (isMobile() && panelHidden) {
        // Mobile with panel hidden: full-screen map, minimal padding
        return { top: 60, left: 40, right: 40, bottom: 60 };
    }
    if (currentLevel === 1 && !isMobile()) {
        // Desktop Level 1: sidebar on left
        const panelW = areaPanel.offsetWidth + 32;
        return { top: 80, left: panelW + 20, right: 60, bottom: 60 };
    }
    // Level 2/3 or mobile: bottom panel
    const panelH = bottomPanel.offsetHeight || 120;
    return { top: 80, left: 60, right: 60, bottom: panelH + 40 };
}

function fitAllAreas() {
    if (!areaData || areaData.features.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    areaData.features.forEach(f => bounds.extend(f.geometry.coordinates));
    map.fitBounds(bounds, { padding: getMapPadding(), maxZoom: PKU_ZOOM, duration: 1200 });
}

// ═══════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════

function resetFloatBtn() {
    panelHidden = false;
    floatBtn.classList.remove('show-mode');
    floatBtnIcon.textContent = routePlanMode ? '🗺️' : '✕';
}

// Adjust map controls above panel on mobile
function updateMapControls() {
    if (!isMobile()) return;
    const ctrl = document.querySelector('.mapboxgl-ctrl-bottom-right');
    if (!ctrl) return;
    let bottomVal;
    if (panelHidden) {
        bottomVal = 10;
    } else {
        // Get visible panel height after transition completes
        const panel = currentLevel === 1 ? areaPanel : bottomPanel;
        const h = panel.offsetHeight || 120;
        bottomVal = h + 10;
    }
    ctrl.style.bottom = bottomVal + 'px';
    // Move route-info capsule to sit above scale control
    if (routeInfoEl) routeInfoEl.style.bottom = (bottomVal + 30) + 'px';
}

// Delayed version that waits for panel transition to finish
function updateMapControlsAfterTransition() {
    setTimeout(updateMapControls, 50);
}

function highlightSelectedArea(areaId) {
    if (!map.getLayer('area-circle') || !map.getLayer('area-star')) return;
    // Show selected area as blue circle, hide its star
    map.setFilter('area-circle', ['any',
        ['!=', ['get', 'Key_Area'], 1],
        ['==', ['get', 'id'], areaId]
    ]);
    map.setFilter('area-star', ['all',
        ['==', ['get', 'Key_Area'], 1],
        ['!=', ['get', 'id'], areaId]
    ]);
    // Also show glow only for non-selected recommended areas
    if (map.getLayer('area-glow')) {
        map.setFilter('area-glow', ['all',
            ['==', ['get', 'Key_Area'], 1],
            ['!=', ['get', 'id'], areaId]
        ]);
    }
}

function resetAreaHighlight() {
    if (!map.getLayer('area-circle') || !map.getLayer('area-star')) return;
    map.setFilter('area-circle', ['!=', ['get', 'Key_Area'], 1]);
    map.setFilter('area-star', ['==', ['get', 'Key_Area'], 1]);
    if (map.getLayer('area-glow')) {
        map.setFilter('area-glow', ['==', ['get', 'Key_Area'], 1]);
    }
}

function selectArea(areaId, coords) {
    clearRoute();
    currentLevel = 2;
    currentAreaId = areaId;
    currentSpotFeature = null;
    resetFloatBtn();

    const area = areaData.features.find(f => f.properties.id === areaId);
    if (!area) return;

    // Hide area panel, show bottom panel
    areaPanel.classList.add('hidden');
    bottomPanel.classList.remove('panel-hidden');
    brandBadge.classList.add('visible');

    // Fly to area bounds
    const spots = spotData.features.filter(f => f.properties.Area_id === areaId);
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend(coords);
    spots.forEach(f => bounds.extend(f.geometry.coordinates));

    // Small delay so panel transition starts before fly
    setTimeout(() => {
        map.fitBounds(bounds, { padding: getMapPadding(), maxZoom: DETAIL_ZOOM, duration: 1200 });
    }, 50);

    // Highlight selected area as blue circle (even if it was a star)
    highlightSelectedArea(areaId);

    showSpotsForArea(areaId);
    renderSpotCards(areaId);
    switchBottomSection(spotCards);
    updateBackButton();
    updateMapControlsAfterTransition();

    // Highlight card in area panel
    document.querySelectorAll('.area-card').forEach(c => {
        c.classList.toggle('active', parseInt(c.dataset.areaId) === areaId);
    });
    updateURL();
}

function selectSpot(feature) {
    currentLevel = 3;
    currentSpotFeature = feature;
    resetFloatBtn();
    const coords = feature.geometry.coordinates.slice();
    console.log('[PhotoSpot] selectSpot:', feature.properties.Spot_Name, coords);

    // Ensure bottom panel is visible
    bottomPanel.classList.remove('panel-hidden');

    map.flyTo({ center: coords, zoom: 18.5, duration: 800, essential: true });

    // Auto-route only if user has already enabled geolocation
    console.log('[PhotoSpot] 定位状态: isGeolocateActive=', isGeolocateActive, 'userLocation=', userLocation);
    if (isGeolocateActive && userLocation) {
        console.log('[PhotoSpot] 已有定位，自动规划路线');
        fetchAndShowRoute(coords);
    } else {
        console.log('[PhotoSpot] 未开启定位，跳过路线规划');
    }

    renderPhotoDetail(feature);
    switchBottomSection(photoDetail);
    updateBackButton();
    updateMapControlsAfterTransition();

    document.querySelectorAll('.spot-card').forEach(c => {
        c.classList.toggle('active', parseInt(c.dataset.spotId) === feature.properties.Spot_id);
    });
    updateURL();
}

function goBack() {
    clearRoute();
    resetFloatBtn();
    if (currentLevel === 4) {
        exitRoutePlanMode();
        return;
    }
    if (currentLevel === 3) {
        currentLevel = 2;
        currentSpotFeature = null;
        currentImages = [];

        switchBottomSection(spotCards);
        updateBackButton();
        updateMapControlsAfterTransition();

        const area = areaData.features.find(f => f.properties.id === currentAreaId);
        if (area) {
            const spots = spotData.features.filter(f => f.properties.Area_id === currentAreaId);
            const bounds = new mapboxgl.LngLatBounds();
            bounds.extend(area.geometry.coordinates);
            spots.forEach(f => bounds.extend(f.geometry.coordinates));
            map.fitBounds(bounds, { padding: getMapPadding(), maxZoom: DETAIL_ZOOM, duration: 800 });
        }

        document.querySelectorAll('.spot-card').forEach(c => c.classList.remove('active'));
        updateURL();
    } else if (currentLevel === 2) {
        currentLevel = 1;
        currentAreaId = null;

        hideSpots();
        resetAreaHighlight();

        // Show area panel, hide bottom panel
        areaPanel.classList.remove('hidden');
        bottomPanel.classList.add('panel-hidden');
        brandBadge.classList.remove('visible');

        // Clear any active search
        clearSearch();

        setTimeout(() => fitAllAreas(), 50);
        updateBackButton();
        updateMapControlsAfterTransition();

        document.querySelectorAll('.area-card').forEach(c => c.classList.remove('active'));
        updateURL();
    }
}

function switchBottomSection(section) {
    [spotCards, photoDetail, routePlan].forEach(s => s.classList.remove('active'));
    section.classList.add('active');
}

function updateBackButton() {
    if (currentLevel === 1) {
        backBtn.classList.remove('visible');
        backBtn.removeAttribute('data-level');
        return;
    }

    backBtn.classList.add('visible');
    backBtn.setAttribute('data-level', currentLevel);

    const nameEl = backBtn.querySelector('.back-name');
    const metaEl = backBtn.querySelector('.back-meta');

    if (currentLevel === 2) {
        const area = areaData.features.find(f => f.properties.id === currentAreaId);
        const spotCount = spotData.features.filter(f => f.properties.Area_id === currentAreaId).length;
        nameEl.textContent = area ? area.properties.Area_Name : '';
        metaEl.textContent = `${spotCount} 个机位`;
    } else if (currentLevel === 3) {
        const props = currentSpotFeature.properties;
        nameEl.textContent = props.Spot_Name;
        metaEl.textContent = props.Area_Name;
    } else if (currentLevel === 4) {
        nameEl.textContent = '路线规划';
        metaEl.textContent = routeWaypoints.length + ' 个景点';
    }
}

// ═══════════════════════════════════
//  CATEGORY FILTER
// ═══════════════════════════════════

function spotMatchesCategory(spotFeature, category) {
    if (category === 'all') return true;
    const cat = spotFeature.properties.Category || '';
    return cat.includes(category);
}

function getAreaCategories(areaId) {
    const spots = spotData.features.filter(f => f.properties.Area_id === areaId);
    const cats = new Set();
    spots.forEach(f => {
        const cat = f.properties.Category || '';
        cat.split('|').forEach(c => { if (c) cats.add(c); });
    });
    return cats;
}

function renderCategoryTags(categories) {
    const tags = [];
    if (categories.has('风光')) tags.push('<span class="cat-tag cat-landscape">🏔️ 风光</span>');
    if (categories.has('人像')) tags.push('<span class="cat-tag cat-portrait">🧑 人像</span>');
    return tags.join('');
}

function renderSpotCategoryTag(spotFeature) {
    const cat = spotFeature.properties.Category || '';
    const tags = [];
    if (cat.includes('风光')) tags.push('<span class="cat-tag cat-landscape">🏔️ 风光</span>');
    if (cat.includes('人像')) tags.push('<span class="cat-tag cat-portrait">🧑 人像</span>');
    return tags.join('');
}

function initCategoryFilter(containerEl, onChange) {
    containerEl.addEventListener('click', (e) => {
        const pill = e.target.closest('.filter-pill');
        if (!pill) return;
        containerEl.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentCategoryFilter = pill.dataset.category;
        onChange(currentCategoryFilter);
    });
}

// Sync both filter UIs
function syncFilterPills(category) {
    [categoryFilter, spotCategoryFilter].forEach(container => {
        if (!container) return;
        container.querySelectorAll('.filter-pill').forEach(p => {
            p.classList.toggle('active', p.dataset.category === category);
        });
    });
}

// ═══════════════════════════════════
//  RENDER: AREA LIST (Level 1)
// ═══════════════════════════════════

function renderAreaList() {
    if (!areaData) return;

    const sorted = [...areaData.features].sort((a, b) => {
        return (b.properties.Key_Area || 0) - (a.properties.Key_Area || 0);
    });

    // Filter areas: show only areas that have spots matching the category
    const filtered = currentCategoryFilter === 'all' ? sorted : sorted.filter(feature => {
        const areaId = feature.properties.id;
        return spotData.features.some(f => f.properties.Area_id === areaId && spotMatchesCategory(f, currentCategoryFilter));
    });

    areasContainer.innerHTML = filtered.map((feature, idx) => {
        const p = feature.properties;
        const coords = feature.geometry.coordinates;
        const allSpots = spotData.features.filter(f => f.properties.Area_id === p.id);
        const matchingSpots = currentCategoryFilter === 'all'
            ? allSpots
            : allSpots.filter(f => spotMatchesCategory(f, currentCategoryFilter));
        const spotCount = matchingSpots.length;
        const coverSrc = getAreaCover(p.id);
        const areaCats = getAreaCategories(p.id);

        return `<div class="area-card card-stagger" data-area-id="${p.id}"
                     data-lng="${coords[0]}" data-lat="${coords[1]}"
                     style="animation-delay: ${idx * 40}ms">
                    ${coverSrc
                        ? `<div class="area-card-cover"><img src="${imgUrl(coverSrc, 300)}" alt="${p.Area_Name}" loading="lazy" onerror="this.parentElement.outerHTML='<div class=\\'area-card-no-cover\\'>📷</div>'" /></div>`
                        : `<div class="area-card-no-cover">📷</div>`}
                    <div class="area-card-body">
                        <div class="area-card-name">
                            ${p.Area_Name}
                            ${p.Key_Area ? '<span class="key-badge">⭐ 推荐</span>' : ''}
                        </div>
                        ${p.Des ? `<div class="area-card-desc">${p.Des}</div>` : ''}
                        <div class="area-card-meta">
                            ${spotCount > 0 ? `📍 ${spotCount} 个机位` : ''}
                            <span class="area-card-cats">${renderCategoryTags(areaCats)}</span>
                        </div>
                    </div>
                    <div class="area-card-arrow">›</div>
                </div>`;
    }).join('');

    areasContainer.querySelectorAll('.area-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.areaId);
            const coords = [parseFloat(card.dataset.lng), parseFloat(card.dataset.lat)];
            selectArea(id, coords);
        });
    });
}

// ═══════════════════════════════════
//  SEARCH
// ═══════════════════════════════════

function performSearch(query) {
    const q = query.trim().toLowerCase();

    if (!q) {
        clearSearch();
        return;
    }

    searchClear.classList.remove('hidden');

    const areaResults = areaData.features
        .filter(f => f.properties.Area_Name.toLowerCase().includes(q))
        .map(f => ({ type: 'area', feature: f }));

    const spotResults = spotData.features
        .filter(f => f.properties.Spot_Name.toLowerCase().includes(q) && spotMatchesCategory(f, currentCategoryFilter))
        .map(f => ({ type: 'spot', feature: f }));

    const results = [...areaResults, ...spotResults].slice(0, 20);

    renderSearchResults(results, q);
}

function renderSearchResults(results, query) {
    if (results.length === 0) {
        areasContainer.innerHTML = `
            <div class="search-empty">
                <div class="search-empty-icon">🔍</div>
                <div>没有找到相关结果</div>
            </div>`;
        return;
    }

    areasContainer.innerHTML = results.map(r => {
        const p = r.feature.properties;
        if (r.type === 'area') {
            const spotCount = spotData.features.filter(f => f.properties.Area_id === p.id).length;
            const name = highlightMatch(p.Area_Name, query);
            return `<div class="search-result" data-type="area" data-area-id="${p.id}"
                         data-lng="${r.feature.geometry.coordinates[0]}" data-lat="${r.feature.geometry.coordinates[1]}">
                        <div class="search-result-icon area">📍</div>
                        <div class="search-result-info">
                            <div class="search-result-name">${name}</div>
                            <div class="search-result-meta">区域 · ${spotCount} 个机位</div>
                        </div>
                        <div class="search-result-arrow">›</div>
                    </div>`;
        } else {
            const areaName = p.Area_Name || '';
            const name = highlightMatch(p.Spot_Name, query);
            return `<div class="search-result" data-type="spot" data-area-id="${p.Area_id}" data-spot-id="${p.Spot_id}"
                         data-lng="${r.feature.geometry.coordinates[0]}" data-lat="${r.feature.geometry.coordinates[1]}">
                        <div class="search-result-icon spot">📷</div>
                        <div class="search-result-info">
                            <div class="search-result-name">${name}</div>
                            <div class="search-result-meta">机位 · ${areaName} ${renderSpotCategoryTag(r.feature)}</div>
                        </div>
                        <div class="search-result-arrow">›</div>
                    </div>`;
        }
    }).join('');

    areasContainer.querySelectorAll('.search-result').forEach(el => {
        el.addEventListener('click', () => {
            const type = el.dataset.type;
            const areaId = parseInt(el.dataset.areaId);
            const coords = [parseFloat(el.dataset.lng), parseFloat(el.dataset.lat)];

            searchInput.value = '';
            searchClear.classList.add('hidden');

            if (type === 'area') {
                selectArea(areaId, coords);
            } else {
                const spotId = parseInt(el.dataset.spotId);
                const spotFeature = spotData.features.find(f => f.properties.Spot_id === spotId);
                if (spotFeature) {
                    selectArea(areaId, coords);
                    setTimeout(() => selectSpot(spotFeature), 300);
                }
            }
        });
    });
}

function highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);
    return `${before}<mark>${match}</mark>${after}`;
}

function clearSearch() {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    renderAreaList();
}

searchInput.addEventListener('input', (e) => {
    performSearch(e.target.value);
});

searchClear.addEventListener('click', () => {
    clearSearch();
    searchInput.focus();
});

// ═══════════════════════════════════
//  RENDER: SPOT CARDS (Level 2)
// ═══════════════════════════════════

function renderSpotCards(areaId) {
    const allSpots = spotData.features.filter(f => f.properties.Area_id === areaId);
    const spots = currentCategoryFilter === 'all'
        ? allSpots
        : allSpots.filter(f => spotMatchesCategory(f, currentCategoryFilter));
    const area = areaData.features.find(f => f.properties.id === areaId);

    spotCardsTitle.textContent = area ? area.properties.Area_Name : '';
    spotCardsCount.textContent = `${spots.length} 个机位`;

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

    if (spots.length === 0) {
        cardsContainer.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔭</div><div class="empty-state-text">${currentCategoryFilter !== 'all' ? '当前分类下暂无机位' : '暂无详细机位数据'}<br>更多内容即将上线</div></div>`;
        return;
    }

    spots.sort((a, b) => (b.properties.Key_Spot === 1 ? 1 : 0) - (a.properties.Key_Spot === 1 ? 1 : 0));

    cardsContainer.innerHTML = spots.map((feature, idx) => {
        const p = feature.properties;
        const isKey = p.Key_Spot === 1;
        const images = getSpotImages(p.Area_id, p.Spot_id);
        const coverImg = images.length > 0 ? images[0] : null;

        return `<div class="spot-card card-stagger" data-spot-id="${p.Spot_id}" style="animation-delay: ${idx * 50}ms">
                    ${coverImg
                        ? `<div class="spot-card-cover">
                             <img src="${imgUrl(coverImg, 400)}" alt="${p.Spot_Name}" loading="lazy"
                                  onerror="this.parentElement.outerHTML='<div class=\\'spot-card-no-cover\\'>📷</div>'" />
                             ${isKey ? '<div class="spot-card-badge">⭐ 推荐</div>' : ''}
                           </div>`
                        : `<div class="spot-card-no-cover">${isKey ? '⭐' : '📷'}</div>`}
                    <div class="spot-card-body">
                        <div class="spot-card-name">${p.Spot_Name}</div>
                        <div class="spot-card-meta">
                            ${images.length > 0 ? images.length + ' 张照片' : '暂无照片'}
                            <span class="spot-card-cats">${renderSpotCategoryTag(feature)}</span>
                        </div>
                    </div>
                </div>`;
    }).join('');

    cardsContainer.querySelectorAll('.spot-card').forEach(card => {
        card.addEventListener('click', () => {
            const spotId = parseInt(card.dataset.spotId);
            const spot = allSpots.find(f => f.properties.Spot_id === spotId);
            if (spot) selectSpot(spot);
        });
    });
}

// ═══════════════════════════════════
//  RENDER: PHOTO DETAIL (Level 3)
// ═══════════════════════════════════

function renderExifHtml(meta) {
    if (!meta) return '';
    const parts = [];
    if (meta.Model) parts.push(meta.Model);
    if (meta.FocalLength) parts.push(meta.FocalLength.replace(' ', ''));
    if (meta.FNumber) parts.push(meta.FNumber);
    if (meta.ISO) parts.push('ISO ' + meta.ISO);
    if (meta.ExposureTime) parts.push(meta.ExposureTime + 's');
    if (parts.length === 0) return '';

    return `<div class="exif-overlay">
                <div class="exif-main">${parts.join('<span class="exif-sep"> · </span>')}</div>
                ${meta.LensModel ? `<div class="exif-lens">${cleanLensModel(meta.LensModel)}</div>` : ''}
            </div>`;
}

function renderPhotoDetail(feature) {
    const props = feature.properties;
    const images = getSpotImages(props.Area_id, props.Spot_id);
    currentImages = images;
    currentPhotoIndex = 0;

    photoDesc.textContent = props.Des || '';
    photoDesc.style.display = props.Des ? 'block' : 'none';

    if (images.length === 0) {
        photoStrip.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📷</div><div class="empty-state-text">暂无示例照片</div></div>`;
        photoDots.innerHTML = '';
        return;
    }

    photoStrip.innerHTML = images.map((imgPath, idx) => {
        const meta = imageMetadata && imageMetadata[imgPath];
        return `<div class="photo-item ${idx === 0 ? 'active' : ''}" data-index="${idx}">
                    <img src="${imgUrl(imgPath, 600)}" alt="${props.Spot_Name} - ${idx + 1}" loading="lazy"
                         onerror="this.parentElement.style.display='none'" />
                    ${renderExifHtml(meta)}
                </div>`;
    }).join('');

    photoDots.innerHTML = images.length > 1
        ? images.map((_, idx) => `<div class="photo-dot ${idx === 0 ? 'active' : ''}" data-index="${idx}"></div>`).join('')
        : '';

    setupPhotoStripEvents();
}

function setupPhotoStripEvents() {
    const strip = photoStrip;
    const items = strip.querySelectorAll('.photo-item');
    const dots = photoDots.querySelectorAll('.photo-dot');

    items.forEach((item, idx) => {
        item.addEventListener('click', () => openLightbox(idx));
    });

    let scrollRaf = 0;
    strip.addEventListener('scroll', () => {
        if (scrollRaf) return;
        scrollRaf = requestAnimationFrame(() => {
            scrollRaf = 0;
            const itemWidth = items[0]?.offsetWidth + 8;
            const activeIdx = Math.round(strip.scrollLeft / itemWidth);
            currentPhotoIndex = activeIdx;
            items.forEach((item, i) => item.classList.toggle('active', i === activeIdx));
            dots.forEach((dot, i) => dot.classList.toggle('active', i === activeIdx));
        });
    }, { passive: true });

    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            const idx = parseInt(dot.dataset.index);
            const itemWidth = items[0]?.offsetWidth + 8;
            strip.scrollTo({ left: idx * itemWidth, behavior: 'smooth' });
        });
    });
}

// ═══════════════════════════════════
//  LIGHTBOX
// ═══════════════════════════════════

function openLightbox(index) {
    if (currentImages.length === 0) return;
    currentPhotoIndex = index;
    lightbox.classList.add('active');
    requestAnimationFrame(() => lightbox.classList.add('fade-in'));
    updateLightboxContent();
    if (currentSpotFeature) {
        lightboxSpotName.textContent = currentSpotFeature.properties.Spot_Name;
        lightboxSpotArea.textContent = currentSpotFeature.properties.Area_Name;
    }
}

function closeLightbox() {
    lightbox.classList.remove('fade-in');
    setTimeout(() => { lightbox.classList.remove('active'); lightboxImg.src = ''; }, 300);
}

function updateLightboxContent() {
    const imgPath = currentImages[currentPhotoIndex];
    if (!imgPath) return;

    lightboxImg.src = imgUrl(imgPath); // full resolution for lightbox
    lightboxImg.alt = `照片 ${currentPhotoIndex + 1}`;

    const meta = imageMetadata && imageMetadata[imgPath];
    if (meta) {
        const parts = [];
        if (meta.Model) parts.push(meta.Model);
        if (meta.FocalLength) parts.push(meta.FocalLength.replace(' ', ''));
        if (meta.FNumber) parts.push(meta.FNumber);
        if (meta.ISO) parts.push('ISO ' + meta.ISO);
        if (meta.ExposureTime) parts.push(meta.ExposureTime + 's');
        lightboxExif.innerHTML = `
            <div class="lightbox-exif-main">${parts.join(' · ')}</div>
            ${meta.LensModel ? `<div class="lightbox-exif-lens">${meta.LensModel}</div>` : ''}
            <div class="lightbox-exif-page">${currentPhotoIndex + 1} / ${currentImages.length}</div>`;
    } else {
        lightboxExif.innerHTML = `<div class="lightbox-exif-page">${currentPhotoIndex + 1} / ${currentImages.length}</div>`;
    }
    lightboxExif.style.display = 'block';

    lightboxPrev.style.display = currentPhotoIndex > 0 ? 'flex' : 'none';
    lightboxNext.style.display = currentPhotoIndex < currentImages.length - 1 ? 'flex' : 'none';
}

function lightboxNavigate(dir) {
    const n = currentPhotoIndex + dir;
    if (n < 0 || n >= currentImages.length) return;
    currentPhotoIndex = n;
    updateLightboxContent();
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => lightboxNavigate(-1));
lightboxNext.addEventListener('click', () => lightboxNavigate(1));
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') lightboxNavigate(-1);
    if (e.key === 'ArrowRight') lightboxNavigate(1);
});

// Touch swipe for lightbox
(function initLightboxSwipe() {
    let startX = 0, startY = 0, swiping = false;
    lightboxImg.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; swiping = true; }, { passive: true });
    lightboxImg.addEventListener('touchend', (e) => {
        if (!swiping) return;
        swiping = false;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { dx > 0 ? lightboxNavigate(-1) : lightboxNavigate(1); }
        else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) { closeLightbox(); }
    }, { passive: true });
})();

// ═══════════════════════════════════
//  STYLE SWITCHER
// ═══════════════════════════════════

styleSwitcher.addEventListener('click', (e) => {
    const btn = e.target.closest('.style-btn');
    if (!btn || btn.classList.contains('active')) return;
    currentStyle = btn.dataset.style;
    styleSwitcher.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    map.setStyle(MAP_STYLES[currentStyle]);
});

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

// ═══════════════════════════════════
//  BACK BUTTON
// ═══════════════════════════════════

backBtn.addEventListener('click', goBack);

// ═══════════════════════════════════
//  MOBILE DRAWER GESTURES
// ═══════════════════════════════════

(function initDrawerGestures() {
    document.querySelectorAll('.panel-handle').forEach(handle => {
        let startY = 0, dy = 0, isDragging = false, startH = 0;
        const panel = handle.parentElement;
        const isAreaPanel = panel.id === 'area-panel';

        handle.addEventListener('pointerdown', (e) => {
            if (!isMobile()) return;
            isDragging = true;
            startY = e.clientY;
            dy = 0;
            startH = panel.offsetHeight;
            handle.setPointerCapture(e.pointerId);
            panel.style.transition = 'none';
        });

        handle.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            dy = e.clientY - startY;

            if (dy < 0 && isAreaPanel) {
                // Pulling up: increase panel height
                const maxH = window.innerHeight * 0.9;
                const newH = Math.min(startH - dy, maxH);
                panel.style.height = newH + 'px';
                panel.style.maxHeight = newH + 'px';
            } else if (dy > 0) {
                // Pulling down: use translateY
                panel.style.transform = `translateY(${dy}px)`;
            }
        });

        handle.addEventListener('pointerup', () => {
            if (!isDragging) return;
            isDragging = false;
            panel.style.transition = '';

            if (dy < -60 && isAreaPanel) {
                // Pulled up: snap to expanded height
                panel.classList.add('expanded');
                panel.style.height = '';
                panel.style.maxHeight = '';
                panel.style.transform = '';
                updateMapControlsAfterTransition();
            } else if (dy < 0 && isAreaPanel) {
                // Small pull up: snap back
                panel.style.height = '';
                panel.style.maxHeight = '';
                panel.style.transform = '';
            } else if (dy > 60 && isAreaPanel && panel.classList.contains('expanded')) {
                // Pulled down while expanded: collapse back
                panel.classList.remove('expanded');
                panel.style.height = '';
                panel.style.maxHeight = '';
                panel.style.transform = '';
                updateMapControlsAfterTransition();
            } else if (dy > 100 && currentLevel > 1) {
                panel.style.transform = '';
                goBack();
            } else {
                panel.style.height = '';
                panel.style.maxHeight = '';
                panel.style.transform = '';
            }
        });

        handle.addEventListener('pointercancel', () => {
            if (!isDragging) return;
            isDragging = false;
            panel.style.transition = '';
            panel.style.height = '';
            panel.style.maxHeight = '';
            panel.style.transform = '';
        });
    });
})();

// ═══════════════════════════════════
//  MOBILE FLOAT BUTTON
// ═══════════════════════════════════

let panelHidden = false;

function togglePanel() {
    if (panelHidden) {
        // Show panel
        if (currentLevel === 1) {
            areaPanel.classList.remove('hidden');
        } else {
            bottomPanel.classList.remove('panel-hidden');
        }
        panelHidden = false;
        floatBtn.classList.remove('show-mode');
        floatBtnIcon.textContent = '✕';
    } else {
        // Hide panel
        if (currentLevel === 1) {
            areaPanel.classList.add('hidden');
        } else {
            bottomPanel.classList.add('panel-hidden');
        }
        panelHidden = true;
        floatBtn.classList.add('show-mode');
        floatBtnIcon.textContent = routePlanMode ? '🗺️' : '📷';
    }
}

floatBtn.addEventListener('click', () => {
    togglePanel();
    updateMapControlsAfterTransition();
});

// Make float button draggable on mobile
(function initFloatBtnDrag() {
    let isDragging = false, hasMoved = false;
    let startX = 0, startY = 0, btnStartX = 0, btnStartY = 0;

    floatBtn.addEventListener('touchstart', (e) => {
        isDragging = true;
        hasMoved = false;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        const rect = floatBtn.getBoundingClientRect();
        btnStartX = rect.left;
        btnStartY = rect.top;
        e.preventDefault();
    });

    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
            hasMoved = true;
            floatBtn.classList.add('dragging');
        }

        const newX = Math.max(0, Math.min(btnStartX + dx, window.innerWidth - floatBtn.offsetWidth));
        const newY = Math.max(0, Math.min(btnStartY + dy, window.innerHeight - floatBtn.offsetHeight));
        floatBtn.style.left = newX + 'px';
        floatBtn.style.top = newY + 'px';
        floatBtn.style.right = 'auto';
        floatBtn.style.bottom = 'auto';
    }, { passive: true });

    document.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        floatBtn.classList.remove('dragging');

        if (hasMoved) {
            // Snap to nearest edge with animation
            floatBtn.classList.add('snapping');
            const rect = floatBtn.getBoundingClientRect();
            const margin = 16;
            if (rect.left + rect.width / 2 < window.innerWidth / 2) {
                floatBtn.style.left = margin + 'px';
                floatBtn.style.right = 'auto';
            } else {
                floatBtn.style.left = 'auto';
                floatBtn.style.right = margin + 'px';
            }
            setTimeout(() => floatBtn.classList.remove('snapping'), 300);
        } else {
            togglePanel();
            updateMapControlsAfterTransition();
        }
    });
})();

// ═══════════════════════════════════
//  CATEGORY FILTER EVENTS
// ═══════════════════════════════════

initCategoryFilter(categoryFilter, (cat) => {
    syncFilterPills(cat);
    if (currentLevel === 1) {
        renderAreaList();
    }
});

initCategoryFilter(spotCategoryFilter, (cat) => {
    syncFilterPills(cat);
    if (currentLevel === 2 && currentAreaId != null) {
        renderSpotCards(currentAreaId);
    }
});

// ═══════════════════════════════════
//  LOADING & INIT
// ═══════════════════════════════════

function hideLoading() {
    loadingOverlay.classList.add('fade-out');
    setTimeout(() => { loadingOverlay.style.display = 'none'; }, 600);
}

map.on('load', async () => {
    await loadData();
    addMapSources();
    addMapLayers();
    bindMapEvents();
    renderAreaList();

    // Mobile: hide panel first so fitAllAreas uses full-screen padding
    if (isMobile()) {
        areaPanel.classList.add('hidden');
        panelHidden = true;
        floatBtn.classList.add('show-mode');
        floatBtnIcon.textContent = '📷';
    }

    fitAllAreas();
    hideLoading();
    updateMapControlsAfterTransition();

    // Handle URL parameters (e.g. ?area=2&spot=5)
    handleURLParams();
});
