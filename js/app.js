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

map.addControl(new mapboxgl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');
map.addControl(new mapboxgl.ScaleControl({ maxWidth: 100 }), 'bottom-right');

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
    floatBtnIcon.textContent = '✕';
}

// Adjust map controls above panel on mobile
function updateMapControls() {
    if (!isMobile()) return;
    const ctrl = document.querySelector('.mapboxgl-ctrl-bottom-right');
    if (!ctrl) return;
    if (panelHidden) {
        ctrl.style.bottom = '10px';
    } else {
        // Get visible panel height after transition completes
        const panel = currentLevel === 1 ? areaPanel : bottomPanel;
        const h = panel.offsetHeight || 120;
        ctrl.style.bottom = (h + 10) + 'px';
    }
}

// Delayed version that waits for panel transition to finish
function updateMapControlsAfterTransition() {
    setTimeout(updateMapControls, 50);
}

function selectArea(areaId, coords) {
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

    showSpotsForArea(areaId);
    renderSpotCards(areaId);
    switchBottomSection(spotCards);
    updateBackButton();
    updateMapControlsAfterTransition();

    // Highlight card in area panel
    document.querySelectorAll('.area-card').forEach(c => {
        c.classList.toggle('active', parseInt(c.dataset.areaId) === areaId);
    });
}

function selectSpot(feature) {
    currentLevel = 3;
    currentSpotFeature = feature;
    const coords = feature.geometry.coordinates.slice();

    map.flyTo({ center: coords, zoom: 18.5, duration: 800, essential: true });

    renderPhotoDetail(feature);
    switchBottomSection(photoDetail);
    updateBackButton();
    updateMapControlsAfterTransition();

    document.querySelectorAll('.spot-card').forEach(c => {
        c.classList.toggle('active', parseInt(c.dataset.spotId) === feature.properties.Spot_id);
    });
}

function goBack() {
    resetFloatBtn();
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
    } else if (currentLevel === 2) {
        currentLevel = 1;
        currentAreaId = null;

        hideSpots();

        // Show area panel, hide bottom panel
        areaPanel.classList.remove('hidden');
        bottomPanel.classList.add('panel-hidden');
        brandBadge.classList.remove('visible');

        setTimeout(() => fitAllAreas(), 50);
        updateBackButton();
        updateMapControlsAfterTransition();

        document.querySelectorAll('.area-card').forEach(c => c.classList.remove('active'));
    }
}

function switchBottomSection(section) {
    [spotCards, photoDetail].forEach(s => s.classList.remove('active'));
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
    }
}

// ═══════════════════════════════════
//  RENDER: AREA LIST (Level 1)
// ═══════════════════════════════════

function renderAreaList() {
    if (!areaData) return;

    const sorted = [...areaData.features].sort((a, b) => {
        return (b.properties.Key_Area || 0) - (a.properties.Key_Area || 0);
    });

    areasContainer.innerHTML = sorted.map((feature, idx) => {
        const p = feature.properties;
        const coords = feature.geometry.coordinates;
        const spotCount = spotData.features.filter(f => f.properties.Area_id === p.id).length;
        const coverSrc = getAreaCover(p.id);

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
//  RENDER: SPOT CARDS (Level 2)
// ═══════════════════════════════════

function renderSpotCards(areaId) {
    const spots = spotData.features.filter(f => f.properties.Area_id === areaId);
    const area = areaData.features.find(f => f.properties.id === areaId);

    spotCardsTitle.textContent = area ? area.properties.Area_Name : '';
    spotCardsCount.textContent = `${spots.length} 个机位`;

    if (spots.length === 0) {
        cardsContainer.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔭</div><div class="empty-state-text">暂无详细机位数据<br>更多内容即将上线</div></div>`;
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
                        <div class="spot-card-meta">${images.length > 0 ? images.length + ' 张照片' : '暂无照片'}</div>
                    </div>
                </div>`;
    }).join('');

    cardsContainer.querySelectorAll('.spot-card').forEach(card => {
        card.addEventListener('click', () => {
            const spotId = parseInt(card.dataset.spotId);
            const spot = spots.find(f => f.properties.Spot_id === spotId);
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
        floatBtnIcon.textContent = '📷';
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
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;

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

        // Snap to nearest edge
        const rect = floatBtn.getBoundingClientRect();
        const margin = 16;
        if (rect.left + rect.width / 2 < window.innerWidth / 2) {
            floatBtn.style.left = margin + 'px';
            floatBtn.style.right = 'auto';
        } else {
            floatBtn.style.left = 'auto';
            floatBtn.style.right = margin + 'px';
        }

        if (!hasMoved) {
            togglePanel();
            updateMapControlsAfterTransition();
        }
    });
})();

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
});
