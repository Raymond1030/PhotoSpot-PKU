/* ===================================
   PhotoSpot PKU — Main Application
   Native Mapbox Layers (no DOM markers)
   =================================== */

// ── Data Base URL (Tencent COS) ──
const DATA_BASE_URL = 'https://raymondstorage-1307420465.cos.ap-beijing.myqcloud.com/';

// ── Mapbox Token (从 js/config.js 读取) ──
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
let currentAreaId = null;
let currentSpotFeature = null;
let activePopup = null;
let currentStyle = 'dark';

// ── DOM Elements ──
const panel = document.getElementById('panel');
const areaList = document.getElementById('area-list');
const spotDetail = document.getElementById('spot-detail');
const spotPhotoDetail = document.getElementById('spot-photo-detail');
const areasContainer = document.getElementById('areas-container');
const spotsContainer = document.getElementById('spots-container');
const areaInfo = document.getElementById('area-info');
const spotPhotoHeader = document.getElementById('spot-photo-header');
const spotPhotoGallery = document.getElementById('spot-photo-gallery');
const backBtn = document.getElementById('back-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const styleSwitcher = document.getElementById('style-switcher');

// Debug: verify DOM elements
console.log('[PhotoSpot] DOM init:', {
    spotPhotoDetail: !!spotPhotoDetail,
    spotPhotoHeader: !!spotPhotoHeader,
    spotPhotoGallery: !!spotPhotoGallery
});

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
    attributionControl: false
});

// Add navigation controls
map.addControl(new mapboxgl.NavigationControl({
    showCompass: true,
    showZoom: true
}), 'bottom-right');

map.addControl(new mapboxgl.ScaleControl({ maxWidth: 100 }), 'bottom-right');

// ── Load Data ──
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

// ── Get images for a spot ──
function getSpotImages(areaId, spotId) {
    if (!imageManifest) return [];
    const key = `${areaId}-${spotId}`;
    return imageManifest[key] || [];
}

// ── Get cover image for an area ──
function getAreaCover(areaId) {
    if (!imageManifest || !imageManifest._covers) return null;
    return imageManifest._covers[String(areaId)] || null;
}

// ── Map Ready ──
map.on('load', async () => {
    await loadData();
    addMapSources();
    addMapLayers();
    bindMapEvents();
    renderAreaList();
    hideLoading();
});

// ── Hide Loading ──
function hideLoading() {
    loadingOverlay.classList.add('fade-out');
    setTimeout(() => {
        loadingOverlay.style.display = 'none';
    }, 600);
}

// ═══════════════════════════════════
//  NATIVE MAPBOX SOURCES & LAYERS
// ═══════════════════════════════════

function addMapSources() {
    // Area source (always visible)
    map.addSource('areas', {
        type: 'geojson',
        data: areaData
    });

    // Spot source (filtered by area)
    map.addSource('spots', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });
}

function addMapLayers() {
    // ── AREA layers ──

    // Outer glow ring for key areas
    map.addLayer({
        id: 'area-glow',
        type: 'circle',
        source: 'areas',
        filter: ['==', ['get', 'Key_Area'], 1],
        paint: {
            'circle-radius': 14,
            'circle-color': 'rgba(56, 189, 248, 0.20)',
            'circle-blur': 0.6
        }
    });

    // Area circle
    map.addLayer({
        id: 'area-circle',
        type: 'circle',
        source: 'areas',
        paint: {
            'circle-radius': [
                'case',
                ['==', ['get', 'Key_Area'], 1], 7,
                6
            ],
            'circle-color': [
                'case',
                ['==', ['get', 'Key_Area'], 1], '#38bdf8',
                '#0ea5e9'
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
        }
    });

    // Area labels
    map.addLayer({
        id: 'area-label',
        type: 'symbol',
        source: 'areas',
        layout: {
            'text-field': ['get', 'Area_Name'],
            'text-font': ['Noto Sans CJK SC Regular', 'Arial Unicode MS Regular'],
            'text-size': 12,
            'text-offset': [0, 1.8],
            'text-anchor': 'top',
            'text-allow-overlap': false,
            'text-ignore-placement': false
        },
        paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0, 0, 0, 0.75)',
            'text-halo-width': 1.5
        }
    });

    // ── SPOT layers ──

    // Spot outer glow
    map.addLayer({
        id: 'spot-glow',
        type: 'circle',
        source: 'spots',
        paint: {
            'circle-radius': 10,
            'circle-color': 'rgba(232, 167, 60, 0.20)',
            'circle-blur': 0.5
        }
    });

    // Spot circle (non-key spots only)
    map.addLayer({
        id: 'spot-circle',
        type: 'circle',
        source: 'spots',
        filter: ['!=', ['get', 'Key_Spot'], 1],
        paint: {
            'circle-radius': 5,
            'circle-color': '#e8a73c',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
        }
    });

    // Key spot star icon
    map.addLayer({
        id: 'spot-star',
        type: 'symbol',
        source: 'spots',
        filter: ['==', ['get', 'Key_Spot'], 1],
        layout: {
            'text-field': '★',
            'text-size': 22,
            'text-allow-overlap': true,
            'text-ignore-placement': true
        },
        paint: {
            'text-color': '#f59e0b',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
        }
    });

    // Spot name label
    map.addLayer({
        id: 'spot-label',
        type: 'symbol',
        source: 'spots',
        layout: {
            'text-field': ['get', 'Spot_Name'],
            'text-font': ['Noto Sans CJK SC Regular', 'Arial Unicode MS Regular'],
            'text-size': 11,
            'text-offset': [0, 1.8],
            'text-anchor': 'top',
            'text-allow-overlap': false,
            'text-ignore-placement': false
        },
        paint: {
            'text-color': '#fde68a',
            'text-halo-color': 'rgba(0, 0, 0, 0.75)',
            'text-halo-width': 1.2
        }
    });
}

// ═══════════════════════════════════
//  MAP CLICK EVENTS
// ═══════════════════════════════════

function bindMapEvents() {
    // ── Click area circle ──
    map.on('click', 'area-circle', (e) => {
        e.originalEvent.stopPropagation();
        const feature = e.features[0];
        const props = feature.properties;
        const coords = feature.geometry.coordinates.slice();
        selectArea(props.id, coords);
    });

    // ── Click spot circle or star ──
    const handleSpotClick = (e) => {
        e.originalEvent.stopPropagation();
        const feature = e.features[0];
        selectSpot(feature);
        highlightSpotCard(feature.properties.Spot_id);
    };
    map.on('click', 'spot-circle', handleSpotClick);
    map.on('click', 'spot-star', handleSpotClick);

    // ── Cursor pointer on hover ──
    map.on('mouseenter', 'area-circle', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'area-circle', () => {
        map.getCanvas().style.cursor = '';
    });
    ['spot-circle', 'spot-star'].forEach(layer => {
        map.on('mouseenter', layer, () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
            map.getCanvas().style.cursor = '';
        });
    });

    // ── Click empty map area ──
    map.on('click', (e) => {
        // Check if click was on a feature
        const areaFeatures = map.queryRenderedFeatures(e.point, { layers: ['area-circle'] });
        const spotFeatures = map.queryRenderedFeatures(e.point, { layers: ['spot-circle', 'spot-star'] });
        if (areaFeatures.length === 0 && spotFeatures.length === 0) {
            closePopup();
            document.querySelectorAll('.spot-card').forEach(c => c.classList.remove('active'));
        }
    });
}

// ═══════════════════════════════════
//  SPOT DATA UPDATE
// ═══════════════════════════════════

function showSpotsForArea(areaId) {
    const filtered = {
        type: 'FeatureCollection',
        features: spotData.features.filter(f => f.properties.Area_id === areaId)
    };
    const source = map.getSource('spots');
    if (source) source.setData(filtered);
}

function hideSpots() {
    const source = map.getSource('spots');
    if (source) source.setData({ type: 'FeatureCollection', features: [] });
}

// ═══════════════════════════════════
//  POPUP
// ═══════════════════════════════════

function showPopup(coords, html) {
    closePopup();
    activePopup = new mapboxgl.Popup({
        offset: 14,
        closeButton: true,
        maxWidth: '320px'
    })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);
}

function closePopup() {
    if (activePopup) {
        activePopup.remove();
        activePopup = null;
    }
}

// ═══════════════════════════════════
//  SELECT / NAVIGATE
// ═══════════════════════════════════

function selectArea(areaId, coords) {
    currentAreaId = areaId;

    // Fly to area
    map.flyTo({
        center: coords,
        zoom: DETAIL_ZOOM,
        duration: 1200,
        essential: true
    });

    // Show spot markers for this area
    showSpotsForArea(areaId);

    // Get area info
    const area = areaData.features.find(f => f.properties.id === areaId);
    if (!area) return;

    const props = area.properties;

    // Update panel: show spot detail view
    areaList.classList.add('hidden');
    spotDetail.classList.remove('hidden');
    backBtn.classList.remove('hidden');

    // Render area info card
    areaInfo.innerHTML = `
        <div class="area-info-name">${props.Area_Name}</div>
        ${props.Des ? `<div class="area-info-desc">${props.Des}</div>` : ''}
    `;

    // Render spot list
    renderSpotList(areaId);

    // Highlight active area card
    document.querySelectorAll('.area-card').forEach(c => c.classList.remove('active'));
}

function selectSpot(feature) {
    console.log('[PhotoSpot] selectSpot called:', feature.properties.Spot_Name, feature.properties);
    currentSpotFeature = feature;
    const props = feature.properties;
    const coords = feature.geometry.coordinates.slice
        ? feature.geometry.coordinates.slice()
        : [feature.geometry.coordinates[0], feature.geometry.coordinates[1]];

    map.flyTo({
        center: coords,
        zoom: 18.5,
        duration: 800,
        essential: true
    });

    closePopup();

    // Switch sidebar to Level 3: spot photo detail
    spotDetail.classList.add('hidden');
    spotPhotoDetail.classList.remove('hidden');
    backBtn.classList.remove('hidden');

    renderSpotDetail(feature);
}

function goBack() {
    if (currentSpotFeature) {
        // Level 3 → Level 2: go back to spot list
        currentSpotFeature = null;
        closePopup();

        spotPhotoDetail.classList.add('hidden');
        spotDetail.classList.remove('hidden');

        // Fly back to area level
        const area = areaData.features.find(f => f.properties.id === currentAreaId);
        if (area) {
            map.flyTo({
                center: area.geometry.coordinates,
                zoom: DETAIL_ZOOM,
                duration: 800,
                essential: true
            });
        }

        // Clear active spot card
        document.querySelectorAll('.spot-card').forEach(c => c.classList.remove('active'));
    } else {
        // Level 2 → Level 1: go back to area list
        currentAreaId = null;

        hideSpots();
        closePopup();

        map.flyTo({
            center: PKU_CENTER,
            zoom: PKU_ZOOM,
            duration: 1200,
            essential: true
        });

        spotDetail.classList.add('hidden');
        spotPhotoDetail.classList.add('hidden');
        areaList.classList.remove('hidden');
        backBtn.classList.add('hidden');

        document.querySelectorAll('.spot-card').forEach(c => c.classList.remove('active'));
    }
}

// ═══════════════════════════════════
//  RENDER PANEL LISTS
// ═══════════════════════════════════

function renderAreaList() {
    if (!areaData) return;

    // Sort: key areas first
    const sorted = [...areaData.features].sort((a, b) => {
        if (a.properties.Key_Area !== b.properties.Key_Area) {
            return b.properties.Key_Area - a.properties.Key_Area;
        }
        return 0;
    });

    areasContainer.innerHTML = sorted.map(feature => {
        const p = feature.properties;
        const coords = feature.geometry.coordinates;
        const spotCount = spotData.features.filter(
            f => f.properties.Area_id === p.id
        ).length;
        const coverSrc = getAreaCover(p.id);

        return `
            <div class="area-card ${coverSrc ? 'has-cover' : ''}" data-area-id="${p.id}" data-lng="${coords[0]}" data-lat="${coords[1]}">
                ${coverSrc ? `<div class="area-card-cover"><img src="${DATA_BASE_URL}${coverSrc}" alt="${p.Area_Name}" loading="lazy" onerror="this.parentElement.style.display='none'" /></div>` : ''}
                <div class="area-card-body">
                    <div class="area-card-header">
                        <div class="area-card-name">
                            ${p.Area_Name}
                            ${p.Key_Area ? '<span class="key-badge">⭐ 推荐</span>' : ''}
                        </div>
                        <svg class="area-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    </div>
                    ${p.Des ? `<div class="area-card-desc">${p.Des}</div>` : ''}
                    <div class="area-card-meta">
                        ${spotCount > 0 ? `
                            <span class="meta-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                ${spotCount} 个机位
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Bind click events
    areasContainer.querySelectorAll('.area-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.areaId);
            const coords = [parseFloat(card.dataset.lng), parseFloat(card.dataset.lat)];
            selectArea(id, coords);
        });
    });
}

function renderSpotList(areaId) {
    const spots = spotData.features.filter(f => f.properties.Area_id === areaId);

    if (spots.length === 0) {
        spotsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔭</div>
                <div class="empty-state-text">暂无详细机位数据<br>更多内容即将上线</div>
            </div>
        `;
        return;
    }

    // Key spots first, then non-key; preserve original order within each group
    spots.sort((a, b) => (b.properties.Key_Spot === 1 ? 1 : 0) - (a.properties.Key_Spot === 1 ? 1 : 0));

    spotsContainer.innerHTML = spots.map(feature => {
        const p = feature.properties;
        const coords = feature.geometry.coordinates;
        const images = getSpotImages(p.Area_id, p.Spot_id);
        const isKey = p.Key_Spot === 1;
        return `
            <div class="spot-card" data-spot-id="${p.Spot_id}" data-lng="${coords[0]}" data-lat="${coords[1]}">
                <div class="spot-card-header">
                    <span class="spot-index ${isKey ? 'spot-index-key' : ''}">${isKey ? '★' : '●'}</span>
                    <span class="spot-card-name">${p.Spot_Name}</span>
                    <svg class="spot-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                </div>
                ${p.Des ? `<div class="spot-card-desc">${p.Des}</div>` : ''}
            </div>
        `;
    }).join('');

    // Bind click events
    spotsContainer.querySelectorAll('.spot-card').forEach(card => {
        card.addEventListener('click', () => {
            const spotId = parseInt(card.dataset.spotId);
            const spot = spots.find(f => f.properties.Spot_id === spotId);
            if (spot) {
                selectSpot(spot);
                highlightSpotCard(spotId);
            }
        });
    });
}

function highlightSpotCard(spotId) {
    document.querySelectorAll('.spot-card').forEach(c => c.classList.remove('active'));
    const card = document.querySelector(`.spot-card[data-spot-id="${spotId}"]`);
    if (card) {
        card.classList.add('active');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function renderSpotDetail(feature) {
    const props = feature.properties;
    const images = getSpotImages(props.Area_id, props.Spot_id);

    // Render header info card
    spotPhotoHeader.innerHTML = `
        <div class="spot-detail-name">
            ${props.Spot_Name}
        </div>
        ${props.Des ? `<div class="spot-detail-desc">${props.Des}</div>` : ''}
        <div class="spot-detail-area">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${props.Area_Name}
        </div>
    `;

    // Helper to render EXIF overlay
    function renderExifOverlay(meta) {
        if (!meta) return '';
        const parts = [];
        if (meta.Model) parts.push(meta.Model);
        if (meta.FocalLength) parts.push(meta.FocalLength.replace(' ', ''));
        if (meta.FNumber) parts.push(meta.FNumber);
        if (meta.ISO) parts.push(`ISO ${meta.ISO}`);
        if (meta.ExposureTime) parts.push(`${meta.ExposureTime}s`);

        if (parts.length === 0) return '';

        return `
            <div class="exif-overlay">
                <div class="exif-main">${parts.join(' · ')}</div>
                ${meta.LensModel ? `<div class="exif-lens">${meta.LensModel}</div>` : ''}
            </div>
        `;
    }

    // Render photo gallery
    if (images.length > 0) {
        spotPhotoGallery.innerHTML = `
            <div class="slider-container">
                ${images.length > 1 ? `
                    <button class="slider-arrow slider-arrow-left" aria-label="上一张">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M15 18l-6-6 6-6"/>
                        </svg>
                    </button>
                    <button class="slider-arrow slider-arrow-right" aria-label="下一张">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18l6-6-6-6"/>
                        </svg>
                    </button>
                ` : ''}
                <div class="slider-track" id="slider-track">
                    ${images.map((imgPath, idx) => {
            const meta = imageMetadata && imageMetadata[imgPath];
            return `
                        <div class="gallery-item">
                            <img class="gallery-image" src="${DATA_BASE_URL}${imgPath}" alt="${props.Spot_Name} - 照片 ${idx + 1}" loading="lazy"
                                 onerror="this.parentElement.style.display='none'"
                                 onclick="window.openLightbox && window.openLightbox('${DATA_BASE_URL}${imgPath}')" />
                            ${meta ? renderExifOverlay(meta) : ''}
                        </div>
                    `}).join('')}
                </div>
            </div>
            ${images.length > 1 ? `
                <div class="slider-dots" id="slider-dots">
                    ${images.map((_, idx) => `
                        <span class="slider-dot ${idx === 0 ? 'active' : ''}" data-index="${idx}"></span>
                    `).join('')}
                </div>
            ` : ''}
        `;

        // Add Event Listeners for slider if there are multiple images
        if (images.length > 1) {
            const track = document.getElementById('slider-track');
            const dots = document.querySelectorAll('.slider-dot');
            const leftBtn = document.querySelector('.slider-arrow-left');
            const rightBtn = document.querySelector('.slider-arrow-right');

            // Update dots on scroll
            track.addEventListener('scroll', () => {
                const scrollLeft = track.scrollLeft;
                const itemWidth = track.clientWidth;
                // Calculate which item is mostly in view
                const activeIndex = Math.round(scrollLeft / itemWidth);

                dots.forEach((dot, index) => {
                    dot.classList.toggle('active', index === activeIndex);
                });
            });

            // Click dots to navigate
            dots.forEach(dot => {
                dot.addEventListener('click', (e) => {
                    const index = parseInt(e.target.dataset.index);
                    track.scrollTo({
                        left: index * track.clientWidth,
                        behavior: 'smooth'
                    });
                });
            });

            // Left/Right arrow navigation
            if (leftBtn && rightBtn) {
                leftBtn.addEventListener('click', () => {
                    track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
                });

                rightBtn.addEventListener('click', () => {
                    track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
                });
            }
        }
    } else {
        spotPhotoGallery.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📷</div>
                <div class="empty-state-text">暂无示例照片<br>更多内容即将上线</div>
            </div>
        `;
    }
}

// ═══════════════════════════════════
//  STYLE SWITCHER
// ═══════════════════════════════════

styleSwitcher.addEventListener('click', (e) => {
    const btn = e.target.closest('.style-btn');
    if (!btn || btn.classList.contains('active')) return;

    const style = btn.dataset.style;
    currentStyle = style;

    // Update button states
    styleSwitcher.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Change map style
    map.setStyle(MAP_STYLES[style]);
});

// When style changes, re-add sources & layers
map.on('style.load', () => {
    // Only re-add if data is loaded (skip initial style.load)
    if (!areaData) return;

    addMapSources();
    addMapLayers();
    bindMapEvents();

    // If we were viewing a specific area, re-show its spots
    if (currentAreaId) {
        showSpotsForArea(currentAreaId);
    }
});

// ═══════════════════════════════════
//  BACK BUTTON
// ═══════════════════════════════════

backBtn.addEventListener('click', goBack);

// ═══════════════════════════════════
//  MOBILE DRAWER TOUCH SUPPORT
// ═══════════════════════════════════

(function initDrawerGestures() {
    const handle = document.getElementById('panel-handle');
    let startY = 0;
    let startHeight = 0;
    let isDragging = false;

    function isMobile() {
        return window.innerWidth <= 768;
    }

    handle.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        isDragging = true;
        startY = e.touches[0].clientY;
        startHeight = panel.offsetHeight;
        panel.style.transition = 'none';
    });

    document.addEventListener('touchmove', (e) => {
        if (!isDragging || !isMobile()) return;
        const dy = startY - e.touches[0].clientY;
        const newHeight = Math.min(
            Math.max(startHeight + dy, 120),
            window.innerHeight * 0.85
        );
        panel.style.height = newHeight + 'px';
    });

    document.addEventListener('touchend', () => {
        if (!isDragging || !isMobile()) return;
        isDragging = false;
        panel.style.transition = '';

        const h = panel.offsetHeight;
        const vh = window.innerHeight;

        if (h < vh * 0.25) {
            panel.style.height = '120px';
            panel.classList.add('drawer-collapsed');
            panel.classList.remove('drawer-expanded');
        } else if (h > vh * 0.55) {
            panel.style.height = '70vh';
            panel.classList.add('drawer-expanded');
            panel.classList.remove('drawer-collapsed');
        } else {
            panel.style.height = '45vh';
            panel.classList.remove('drawer-collapsed', 'drawer-expanded');
        }
    });
})();
