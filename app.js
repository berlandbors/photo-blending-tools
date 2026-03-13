/**
 * app.js — основная логика приложения Photo Blending Tools
 *
 * Функциональность:
 *  - Загрузка двух изображений (drag & drop / click)
 *  - Выбор режима смешивания (Canvas, CSS, Коллаж, Split Screen, Double Exposure)
 *  - Регулировка параметров через слайдеры (opacity, brightness, contrast, blend amount)
 *  - Предпросмотр результата в реальном времени
 *  - Экспорт результата в PNG / JPEG
 *  - Интерактивный разделитель для Split Screen
 */

'use strict';

/* ══════════════════════════════════════════════════
   Константы
══════════════════════════════════════════════════ */
const MAX_FILE_SIZE_MB   = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_TYPES     = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const DEBOUNCE_DELAY_MS  = 150;
const JPEG_QUALITY       = 0.9;

/* ══════════════════════════════════════════════════
   Состояние приложения
══════════════════════════════════════════════════ */
const state = {
    image1: null,          // HTMLImageElement
    image2: null,          // HTMLImageElement
    splitPos: 50,          // позиция разделителя (0–100)
    isDraggingSplit: false,
    layerOrder: 'img1-top', // 'img1-top' | 'img2-top' | 'auto'
    orientation1: 'auto',  // 'auto' | 'landscape' | 'portrait'
    orientation2: 'auto',
    activeLayer: 1,        // активный слой: 1 или 2
    layer1: { opacity: 100, scale: 100, x: 0, y: 0, brightness: 0, contrast: 0,
               saturation: 0, temperature: 0, hue: 0, blur: 0, sharpness: 0, vignette: 0, hdr: 0, grain: 0 },
    layer2: { opacity: 100, scale: 100, x: 0, y: 0, brightness: 0, contrast: 0,
               saturation: 0, temperature: 0, hue: 0, blur: 0, sharpness: 0, vignette: 0, hdr: 0, grain: 0 },
};

/* ══════════════════════════════════════════════════
   Элементы DOM
══════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const dropZone1     = $('drop-zone-1');
const dropZone2     = $('drop-zone-2');
const fileInput1    = $('file-input-1');
const fileInput2    = $('file-input-2');
const preview1      = $('preview-1');
const preview2      = $('preview-2');

const modeSelect    = $('blend-mode');
const opacitySlider = $('opacity-slider');
const blendAmountSlider = $('blend-amount-slider');

const opacityValue      = $('opacity-value');
const blendAmountValue  = $('blend-amount-value');

const imageInfo1    = $('image-info-1');
const imageInfo2    = $('image-info-2');

/* ── Per-layer controls ── */
const layer1OpacitySlider     = $('layer1-opacity');
const layer1ScaleSlider       = $('layer1-scale');
const layer1XSlider           = $('layer1-x');
const layer1YSlider           = $('layer1-y');
const layer1BrightnessSlider  = $('layer1-brightness');
const layer1ContrastSlider    = $('layer1-contrast');

const layer2OpacitySlider     = $('layer2-opacity');
const layer2ScaleSlider       = $('layer2-scale');
const layer2XSlider           = $('layer2-x');
const layer2YSlider           = $('layer2-y');
const layer2BrightnessSlider  = $('layer2-brightness');
const layer2ContrastSlider    = $('layer2-contrast');

const applyBtn       = $('apply-btn');
const downloadPngBtn = $('download-png');
const downloadJpgBtn = $('download-jpg');
const resetBtn       = $('reset-btn');

const uploadBtn1     = $('upload-btn-1');
const uploadBtn2     = $('upload-btn-2');
const deleteLayer1Btn = $('delete-layer-1');
const deleteLayer2Btn = $('delete-layer-2');
const swapLayersBtn  = $('swap-layers');

const resultCanvas   = $('result-canvas');
const resultCtx      = resultCanvas.getContext('2d');
const splitHandle    = $('split-handle');
const loadingOverlay = $('loading-overlay');
const statusMsg      = $('status-message');

/* ══════════════════════════════════════════════════
   Состояние живого предпросмотра
══════════════════════════════════════════════════ */
let livePreviewEnabled = localStorage.getItem('livePreview') !== 'false';

/* ══════════════════════════════════════════════════
   История состояний (Undo/Redo)
══════════════════════════════════════════════════ */
const history = {
    states: [],
    currentIndex: -1,
    maxSize: 20
};

/* ══════════════════════════════════════════════════
   Режим сравнения До/После
══════════════════════════════════════════════════ */
let comparisonMode   = false;
let comparisonBefore = null; // canvas с «до»
let comparisonAfter  = null; // canvas с «после»

/* ══════════════════════════════════════════════════
   Zoom & Pan
══════════════════════════════════════════════════ */
let zoomLevel  = 1;
let panX       = 0;
let panY       = 0;
let isPanning  = false;
let spaceDown  = false;
let panStartX  = 0;
let panStartY  = 0;

/* ══════════════════════════════════════════════════
   Пресеты
══════════════════════════════════════════════════ */
const presets = JSON.parse(localStorage.getItem('presets')) || [];

/* ══════════════════════════════════════════════════
   Избранные режимы
══════════════════════════════════════════════════ */
let favoriteModes = JSON.parse(localStorage.getItem('favoriteModes')) || [];

/* ══════════════════════════════════════════════════
   Ресайз панели
══════════════════════════════════════════════════ */
let isResizing = false;
let panelWidth = parseInt(localStorage.getItem('panelWidth'), 10) || 340;

/* ══════════════════════════════════════════════════
   Утилиты
══════════════════════════════════════════════════ */

/**
 * Показать/скрыть оверлей загрузки
 * @param {boolean} show
 */
function setLoading(show) {
    loadingOverlay.hidden = !show;
}

/**
 * Вывести статусное сообщение пользователю
 * @param {string} msg
 * @param {'info'|'error'|'success'} type
 */
function showStatus(msg, type = 'info') {
    statusMsg.textContent = msg;
    statusMsg.className   = `status-message status-${type}`;
    statusMsg.hidden      = false;
    clearTimeout(statusMsg._timer);
    if (type !== 'error') {
        statusMsg._timer = setTimeout(() => { statusMsg.hidden = true; }, 4000);
    }
}

/**
 * Создать debounce-обёртку для функции
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Загрузить файл как HTMLImageElement
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        if (!ACCEPTED_TYPES.includes(file.type)) {
            reject(new Error(`Неподдерживаемый формат: ${file.type}. Используйте JPG, PNG, GIF или WebP.`));
            return;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            reject(new Error(`Файл слишком большой (макс. ${MAX_FILE_SIZE_MB} МБ).`));
            return;
        }
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload  = () => resolve(img);
            img.onerror = () => reject(new Error('Ошибка загрузки изображения.'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Ошибка чтения файла.'));
        reader.readAsDataURL(file);
    });
}

/**
 * Сгенерировать имя файла для экспорта
 * @param {string} ext
 * @returns {string}
 */
function generateFilename(ext) {
    const now = new Date();
    const ts  = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}` +
                `${String(now.getDate()).padStart(2, '0')}_` +
                `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}` +
                `${String(now.getSeconds()).padStart(2, '0')}`;
    return `blend_${ts}.${ext}`;
}

/* ══════════════════════════════════════════════════
   Ориентация и масштаб изображений
══════════════════════════════════════════════════ */

const ORIENTATION_LABELS = {
    landscape: 'Альбомная',
    portrait:  'Книжная',
    square:    'Квадратная',
};

/**
 * Определить ориентацию изображения по его размерам
 * @param {HTMLImageElement} img
 * @returns {'landscape'|'portrait'|'square'}
 */
function getOrientation(img) {
    if (img.naturalWidth > img.naturalHeight) return 'landscape';
    if (img.naturalHeight > img.naturalWidth) return 'portrait';
    return 'square';
}

/**
 * Повернуть изображение на 90° для получения нужной ориентации.
 * Возвращает исходный элемент, если поворот не требуется.
 * @param {HTMLImageElement|HTMLCanvasElement} img
 * @param {'auto'|'landscape'|'portrait'} targetOrientation
 * @returns {HTMLImageElement|HTMLCanvasElement}
 */
function rotateImage(img, targetOrientation) {
    if (targetOrientation === 'auto') return img;

    const w = img.naturalWidth  || img.width;
    const h = img.naturalHeight || img.height;
    const currentOrientation = w > h ? 'landscape' : h > w ? 'portrait' : 'square';

    /* Поворот не нужен, если ориентация уже совпадает или изображение квадратное */
    if (currentOrientation === 'square' || currentOrientation === targetOrientation) return img;

    /* Создаём временный canvas, поворачиваем на 90° по часовой стрелке */
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    tempCanvas.width  = h;
    tempCanvas.height = w;
    ctx.translate(h / 2, w / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -w / 2, -h / 2);
    return tempCanvas;
}

/**
 * Получить источник изображения с применёнными ориентацией и масштабом.
 * Если трансформация не нужна, возвращает исходный элемент без лишних операций.
 * @param {number} slot — 1 или 2
 * @returns {{ src: HTMLImageElement|HTMLCanvasElement, width: number, height: number }|null}
 */
function getScaledSource(slot) {
    const img         = slot === 1 ? state.image1       : state.image2;
    const orientation = slot === 1 ? state.orientation1 : state.orientation2;
    const layer       = slot === 1 ? state.layer1       : state.layer2;
    const scale       = layer.scale / 100;

    if (!img) return null;

    /* Применить ориентацию */
    const oriented = rotateImage(img, orientation);

    const srcW = oriented.naturalWidth  || oriented.width;
    const srcH = oriented.naturalHeight || oriented.height;
    const scaledW = Math.max(10, Math.round(srcW * scale));
    const scaledH = Math.max(10, Math.round(srcH * scale));

    /* Если трансформация не нужна, возвращаем оригинал с его размерами */
    if (scale === 1.0 && orientation === 'auto') {
        return { src: img, width: img.naturalWidth, height: img.naturalHeight };
    }

    /* Предварительно рендерим в canvas нужного размера */
    const canvas = document.createElement('canvas');
    canvas.width  = scaledW;
    canvas.height = scaledH;
    canvas.getContext('2d').drawImage(oriented, 0, 0, scaledW, scaledH);
    return { src: canvas, width: scaledW, height: scaledH };
}

/**
 * Получить полностью обработанный источник слоя:
 * ориентация + масштаб + яркость/контраст (per-layer).
 * Возвращает также x, y смещение и opacity для использования при рендеринге.
 * @param {number} slot — 1 или 2
 * @returns {{ src: HTMLCanvasElement, width: number, height: number, x: number, y: number, opacity: number }|null}
 */
function getProcessedLayer(slot) {
    const img         = slot === 1 ? state.image1       : state.image2;
    const orientation = slot === 1 ? state.orientation1 : state.orientation2;
    const layer       = slot === 1 ? state.layer1       : state.layer2;

    if (!img) return null;

    const oriented = rotateImage(img, orientation);
    const srcW = oriented.naturalWidth  || oriented.width;
    const srcH = oriented.naturalHeight || oriented.height;
    const scale = layer.scale / 100;
    const scaledW = Math.max(10, Math.round(srcW * scale));
    const scaledH = Math.max(10, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width  = scaledW;
    canvas.height = scaledH;
    const ctx = canvas.getContext('2d');

    /* Применить размытие / резкость через CSS-фильтр при рисовании */
    const cssFilters = [];
    if (layer.blur > 0) {
        cssFilters.push(`blur(${layer.blur}px)`);
    }
    if (layer.sharpness > 0) {
        const sharpAmount = 1 + (layer.sharpness / 50);
        cssFilters.push(`contrast(${sharpAmount.toFixed(3)})`);
    }
    if (cssFilters.length > 0) {
        ctx.filter = cssFilters.join(' ');
    }
    ctx.drawImage(oriented, 0, 0, scaledW, scaledH);
    ctx.filter = 'none';

    /* Применить per-layer яркость/контраст */
    if (layer.brightness !== 0 || layer.contrast !== 0) {
        /* contrast: per-layer диапазон -100..100 → преобразуем в 0..200 (100 = без изменений) */
        const contrastAdj = 100 + layer.contrast;
        window.BlendingEngine.applyBrightnessContrast(canvas, layer.brightness, contrastAdj);
    }

    /* Применить расширенные фильтры: насыщенность, температура, оттенок, HDR, зерно */
    if (layer.saturation !== 0 || layer.temperature !== 0 || layer.hue !== 0 ||
            layer.hdr > 0 || layer.grain > 0) {
        applyLayerFilters(canvas, layer);
    }

    /* Применить виньетирование */
    if (layer.vignette > 0) {
        applyVignette(canvas, layer.vignette);
    }

    return {
        src:     canvas,
        width:   scaledW,
        height:  scaledH,
        x:       layer.x,
        y:       layer.y,
        opacity: layer.opacity / 100,
    };
}

/**
 * Обновить строку с информацией о размерах и ориентации изображения
 * @param {number} slot — 1 или 2
 */
function updateImageInfo(slot) {
    const img  = slot === 1 ? state.image1    : state.image2;
    const info = slot === 1 ? imageInfo1      : imageInfo2;

    if (!img) {
        info.textContent = '';
        return;
    }

    const orientation  = slot === 1 ? state.orientation1 : state.orientation2;
    const naturalOri   = getOrientation(img);
    const effectiveOri = orientation === 'auto' ? naturalOri : orientation;
    const label        = ORIENTATION_LABELS[effectiveOri] || effectiveOri;

    /* Dimensions swap only when the image is actually rotated:
       rotation happens when target differs from natural and image is not square */
    const rotated = naturalOri !== 'square'
        && orientation !== 'auto'
        && naturalOri !== orientation;
    const w = rotated ? img.naturalHeight : img.naturalWidth;
    const h = rotated ? img.naturalWidth  : img.naturalHeight;

    info.textContent = `${w}×${h} px (${label})`;
}

/**
 * Вернуть пару источников {bottom, top} с учётом порядка слоев из state.layerOrder.
 * @returns {{ bottom: object|null, top: object|null }}
 */
function getOrderedSources() {
    const s1 = getProcessedLayer(1);
    const s2 = getProcessedLayer(2);
    if (state.layerOrder === 'img2-top') {
        return { bottom: s1, top: s2 };
    }
    /* 'img1-top' и 'auto' — img1 сверху */
    return { bottom: s2, top: s1 };
}

/* ══════════════════════════════════════════════════
   Зоны загрузки изображений
══════════════════════════════════════════════════ */

/**
 * Обновить визуальные индикаторы активного слоя
 * @param {number} slot — 1 или 2
 */
function setActiveLayer(slot) {
    state.activeLayer = slot;
    dropZone1.classList.toggle('active', slot === 1);
    dropZone2.classList.toggle('active', slot === 2);

    const controls1 = $('layer-controls-1');
    const controls2 = $('layer-controls-2');
    if (controls1) controls1.classList.toggle('inactive', slot !== 1);
    if (controls2) controls2.classList.toggle('inactive', slot !== 2);
}

/**
 * Настроить зону перетаскивания и превью для одного изображения
 * @param {HTMLElement} zone
 * @param {HTMLInputElement} input
 * @param {HTMLImageElement} preview
 * @param {number} slot  — 1 или 2
 */
function setupDropZone(zone, input, preview, slot) {
    /* Клик по зоне — выбрать слой (не открывать диалог файла) */
    zone.addEventListener('click', () => setActiveLayer(slot));

    /* Keyboard accessibility */
    zone.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setActiveLayer(slot);
        }
    });

    /* Выбор через диалог */
    input.addEventListener('change', () => {
        if (input.files && input.files[0]) handleFile(input.files[0], slot);
    });

    /* Drag & Drop */
    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file, slot);
    });
}

/**
 * Обработать загруженный файл изображения
 * @param {File} file
 * @param {number} slot
 */
async function handleFile(file, slot) {
    try {
        setLoading(true);
        const img = await loadImageFromFile(file);
        if (slot === 1) {
            state.image1 = img;
            preview1.src     = img.src;
            preview1.hidden  = false;
            $('drop-zone-1').querySelector('.drop-hint').hidden = true;
            updateImageInfo(1);
            deleteLayer1Btn.disabled = false;
        } else {
            state.image2 = img;
            preview2.src     = img.src;
            preview2.hidden  = false;
            $('drop-zone-2').querySelector('.drop-hint').hidden = true;
            updateImageInfo(2);
            deleteLayer2Btn.disabled = false;
        }
        setActiveLayer(slot);
        showStatus(`Изображение ${slot} загружено (${img.naturalWidth}×${img.naturalHeight} px)`, 'success');
        if (livePreviewEnabled) debouncedApply();
    } catch (err) {
        showStatus(err.message, 'error');
    } finally {
        setLoading(false);
    }
}

/* ══════════════════════════════════════════════════
   Удаление изображения из слоя
══════════════════════════════════════════════════ */

/**
 * Удаляет изображение из слоя, сохраняя настройки слоя
 * @param {1|2} slot - номер слоя
 */
function deleteLayer(slot) {
    if (slot === 1) {
        state.image1 = null;
        preview1.hidden = true;
        preview1.src = '';
        $('drop-zone-1').querySelector('.drop-hint').hidden = false;
        fileInput1.value = '';
        deleteLayer1Btn.disabled = true;
        imageInfo1.textContent = '';
        showStatus('Изображение 1 удалено', 'success');
    } else {
        state.image2 = null;
        preview2.hidden = true;
        preview2.src = '';
        $('drop-zone-2').querySelector('.drop-hint').hidden = false;
        fileInput2.value = '';
        deleteLayer2Btn.disabled = true;
        imageInfo2.textContent = '';
        showStatus('Изображение 2 удалено', 'success');
    }

    if (state.image1 || state.image2) {
        if (livePreviewEnabled) debouncedApply();
    } else {
        resultCanvas.width  = 800;
        resultCanvas.height = 500;
        resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
        drawPlaceholder();
        hideSplitHandle();
    }
}

/* ══════════════════════════════════════════════════
   Слайдеры
══════════════════════════════════════════════════ */

/**
 * Связать слайдер с отображением значения и автоматическим apply
 */
function setupSlider(slider, display, suffix = '%') {
    const update = () => {
        display.textContent = slider.value + suffix;
        if (livePreviewEnabled) debouncedApply();
    };
    slider.addEventListener('input', update);
    /* Начальное отображение */
    display.textContent = slider.value + suffix;
}

/* ══════════════════════════════════════════════════
   Управление видимостью слайдеров по режиму
══════════════════════════════════════════════════ */

const CANVAS_MODES    = new Set(['average', 'additive', 'multiply-canvas', 'screen-canvas', 'overlay-canvas',
    'difference-canvas', 'gradient-h', 'gradient-v', 'gradient-radial',
    'luminosity-blend', 'lighten-only', 'darken-only', 'chroma-key']);
const CSS_MODES       = new Set(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
    'color-dodge', 'color-burn', 'hard-light', 'soft-light',
    'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']);
const SPLIT_MODES     = new Set(['split-v', 'split-h']);
const COLLAGE_MODES   = new Set(['collage-h', 'collage-v', 'collage-grid2', 'collage-grid3']);

function updateSliderVisibility() {
    const mode = modeSelect.value;
    const opacityRow      = $('opacity-row');
    const blendAmountRow  = $('blend-amount-row');

    if (mode === 'opacity') {
        opacityRow.hidden     = false;
        blendAmountRow.hidden = true;
    } else if (CANVAS_MODES.has(mode) || mode === 'double-exposure') {
        opacityRow.hidden     = true;
        blendAmountRow.hidden = false;
    } else {
        opacityRow.hidden     = true;
        blendAmountRow.hidden = true;
    }
}

/* ══════════════════════════════════════════════════
   Применение режима смешивания
══════════════════════════════════════════════════ */

function apply() {
    const mode = modeSelect.value;

    if (!state.image1 && !state.image2) return;

    /* Показываем заглушки, если одно из изображений не загружено */
    if (!state.image1 || !state.image2) {
        const missing = !state.image1 ? 1 : 2;
        if (!COLLAGE_MODES.has(mode)) {
            showStatus(`Загрузите изображение ${missing} для этого режима.`, 'info');
        }
    }

    try {
        setLoading(true);

        if (COLLAGE_MODES.has(mode)) {
            renderCollage(mode);
        } else if (mode === 'opacity') {
            renderOpacity();
        } else if (CSS_MODES.has(mode)) {
            renderCSSBlend(mode);
        } else if (mode === 'double-exposure') {
            renderDoubleExposure();
        } else if (SPLIT_MODES.has(mode)) {
            renderSplitScreen(mode);
        } else if (CANVAS_MODES.has(mode)) {
            renderCanvasBlend(mode);
        }

        /* Постобработка удалена: яркость/контраст управляются на уровне каждого слоя */

        saveState();

    } catch (err) {
        showStatus('Ошибка обработки: ' + err.message, 'error');
    } finally {
        setLoading(false);
    }
}

const debouncedApply = debounce(apply, DEBOUNCE_DELAY_MS);

/* ══════════════════════════════════════════════════
   Рендеринг: Коллаж
══════════════════════════════════════════════════ */

function renderCollage(mode) {
    const s1 = getProcessedLayer(1);
    const s2 = getProcessedLayer(2);
    const sources = [s1, s2].filter(Boolean);
    if (sources.length === 0) return;

    switch (mode) {
        case 'collage-h': {
            const W = sources.reduce((sum, s) => sum + s.width, 0);
            const H = Math.max(...sources.map(s => s.height));
            resultCanvas.width  = W;
            resultCanvas.height = H;
            let x = 0;
            sources.forEach(s => {
                resultCtx.drawImage(s.src, x, 0, s.width, s.height);
                x += s.width;
            });
            break;
        }
        case 'collage-v': {
            const W = Math.max(...sources.map(s => s.width));
            const H = sources.reduce((sum, s) => sum + s.height, 0);
            resultCanvas.width  = W;
            resultCanvas.height = H;
            let y = 0;
            sources.forEach(s => {
                resultCtx.drawImage(s.src, 0, y, s.width, s.height);
                y += s.height;
            });
            break;
        }
        case 'collage-grid2': {
            /* 2×2: нужны 2 изображения — клонируем */
            const cells = [s1, s2 || s1, s2 || s1, s1].filter(Boolean);
            const CW = Math.max(...cells.map(s => s.width));
            const CH = Math.max(...cells.map(s => s.height));
            resultCanvas.width  = CW * 2;
            resultCanvas.height = CH * 2;
            cells.forEach((s, i) => {
                const col = i % 2;
                const row = Math.floor(i / 2);
                resultCtx.drawImage(s.src, col * CW, row * CH, CW, CH);
            });
            break;
        }
        case 'collage-grid3': {
            /* 3×3: заполняем чередованием */
            const allSrc = [s1, s2].filter(Boolean);
            const CW = Math.max(...allSrc.map(s => s.width));
            const CH = Math.max(...allSrc.map(s => s.height));
            resultCanvas.width  = CW * 3;
            resultCanvas.height = CH * 3;
            for (let i = 0; i < 9; i++) {
                const s = allSrc[i % allSrc.length];
                const col = i % 3;
                const row = Math.floor(i / 3);
                resultCtx.drawImage(s.src, col * CW, row * CH, CW, CH);
            }
            break;
        }
    }
}

/* ══════════════════════════════════════════════════
   Рендеринг: Прозрачность
══════════════════════════════════════════════════ */

function renderOpacity() {
    const s1 = getProcessedLayer(1);
    const s2 = getProcessedLayer(2);
    if (!s1 || !s2) {
        showStatus('Для этого режима нужны оба изображения.', 'info');
        return;
    }
    const { bottom, top } = getOrderedSources();
    const W = Math.max(s1.width,  s2.width);
    const H = Math.max(s1.height, s2.height);

    resultCanvas.width  = W;
    resultCanvas.height = H;

    resultCtx.globalAlpha = bottom.opacity;
    resultCtx.drawImage(bottom.src, bottom.x, bottom.y, bottom.width, bottom.height);
    resultCtx.globalAlpha = 1;

    const alpha = (parseInt(opacitySlider.value, 10) / 100) * top.opacity;
    resultCtx.globalAlpha = alpha;
    resultCtx.drawImage(top.src, top.x, top.y, top.width, top.height);
    resultCtx.globalAlpha = 1;
}

/* ══════════════════════════════════════════════════
   Рендеринг: CSS Blend Modes
══════════════════════════════════════════════════ */

function renderCSSBlend(mode) {
    const s1 = getProcessedLayer(1);
    const s2 = getProcessedLayer(2);
    if (!s1 || !s2) {
        showStatus('Для этого режима нужны оба изображения.', 'info');
        return;
    }
    const { bottom, top } = getOrderedSources();
    const W = Math.max(s1.width,  s2.width);
    const H = Math.max(s1.height, s2.height);

    resultCanvas.width  = W;
    resultCanvas.height = H;

    resultCtx.globalAlpha = bottom.opacity;
    resultCtx.drawImage(bottom.src, bottom.x, bottom.y, bottom.width, bottom.height);
    resultCtx.globalAlpha = 1;
    resultCtx.globalCompositeOperation = mode;
    resultCtx.globalAlpha = top.opacity;
    resultCtx.drawImage(top.src, top.x, top.y, top.width, top.height);
    resultCtx.globalCompositeOperation = 'source-over';
    resultCtx.globalAlpha = 1;
}

/* ══════════════════════════════════════════════════
   Рендеринг: Canvas попиксельное смешивание
══════════════════════════════════════════════════ */

function renderCanvasBlend(mode) {
    const s1 = getProcessedLayer(1);
    const s2 = getProcessedLayer(2);
    if (!s1 || !s2) {
        showStatus('Для этого режима нужны оба изображения.', 'info');
        return;
    }

    /* Маппинг: UI-значение → внутренний режим blending.js */
    const modeMap = {
        'multiply-canvas': 'multiply',
        'screen-canvas':   'screen',
        'overlay-canvas':  'overlay',
        'difference-canvas': 'difference',
    };
    const internalMode = modeMap[mode] || mode;

    const opts = {
        blendAmount: parseInt(blendAmountSlider.value, 10),
        threshold:   80,
    };

    /* Создаём полноразмерные canvas-источники с учётом позиции и прозрачности */
    const W = Math.max(s1.width, s2.width);
    const H = Math.max(s1.height, s2.height);
    const { bottom, top } = getOrderedSources();

    const bottomCanvas = document.createElement('canvas');
    bottomCanvas.width = W; bottomCanvas.height = H;
    const bCtx = bottomCanvas.getContext('2d');
    bCtx.globalAlpha = bottom.opacity;
    bCtx.drawImage(bottom.src, bottom.x, bottom.y, bottom.width, bottom.height);

    const topCanvas = document.createElement('canvas');
    topCanvas.width = W; topCanvas.height = H;
    const tCtx = topCanvas.getContext('2d');
    tCtx.globalAlpha = top.opacity;
    tCtx.drawImage(top.src, top.x, top.y, top.width, top.height);

    const out = window.BlendingEngine.blendImages(bottomCanvas, topCanvas, internalMode, opts);
    resultCanvas.width  = out.width;
    resultCanvas.height = out.height;
    resultCtx.drawImage(out, 0, 0);
}

/* ══════════════════════════════════════════════════
   Рендеринг: Double Exposure
══════════════════════════════════════════════════ */

function renderDoubleExposure() {
    const s1 = getProcessedLayer(1);
    const s2 = getProcessedLayer(2);
    if (!s1 || !s2) {
        showStatus('Для двойного экспонирования нужны оба изображения.', 'info');
        return;
    }
    const opts = { blendAmount: parseInt(blendAmountSlider.value, 10) };
    const { bottom, top } = getOrderedSources();

    /* Создаём полноразмерные canvas-источники с учётом позиции и прозрачности */
    const W = Math.max(s1.width, s2.width);
    const H = Math.max(s1.height, s2.height);

    const bottomCanvas = document.createElement('canvas');
    bottomCanvas.width = W; bottomCanvas.height = H;
    const bCtx = bottomCanvas.getContext('2d');
    bCtx.globalAlpha = bottom.opacity;
    bCtx.drawImage(bottom.src, bottom.x, bottom.y, bottom.width, bottom.height);

    const topCanvas = document.createElement('canvas');
    topCanvas.width = W; topCanvas.height = H;
    const tCtx = topCanvas.getContext('2d');
    tCtx.globalAlpha = top.opacity;
    tCtx.drawImage(top.src, top.x, top.y, top.width, top.height);

    const out  = window.BlendingEngine.doubleExposure(bottomCanvas, topCanvas, opts);
    resultCanvas.width  = out.width;
    resultCanvas.height = out.height;
    resultCtx.drawImage(out, 0, 0);
}

/* ══════════════════════════════════════════════════
   Рендеринг: Split Screen
══════════════════════════════════════════════════ */

function renderSplitScreen(mode) {
    const s1 = getProcessedLayer(1);
    const s2 = getProcessedLayer(2);
    if (!s1 || !s2) {
        showStatus('Для Split Screen нужны оба изображения.', 'info');
        return;
    }
    const { bottom, top } = getOrderedSources();
    const W = Math.max(s1.width,  s2.width);
    const H = Math.max(s1.height, s2.height);

    resultCanvas.width  = W;
    resultCanvas.height = H;

    const pos = state.splitPos / 100;

    if (mode === 'split-v') {
        /* Вертикальный разделитель */
        const splitX = Math.round(W * pos);
        resultCtx.globalAlpha = bottom.opacity;
        resultCtx.drawImage(bottom.src, bottom.x, bottom.y, bottom.width, bottom.height);
        resultCtx.save();
        resultCtx.beginPath();
        resultCtx.rect(splitX, 0, W - splitX, H);
        resultCtx.clip();
        resultCtx.globalAlpha = top.opacity;
        resultCtx.drawImage(top.src, top.x, top.y, top.width, top.height);
        resultCtx.restore();
        resultCtx.globalAlpha = 1;

        /* Линия разделителя */
        resultCtx.strokeStyle = 'rgba(255,255,255,0.8)';
        resultCtx.lineWidth   = 2;
        resultCtx.beginPath();
        resultCtx.moveTo(splitX, 0);
        resultCtx.lineTo(splitX, H);
        resultCtx.stroke();
    } else {
        /* Горизонтальный разделитель */
        const splitY = Math.round(H * pos);
        resultCtx.globalAlpha = bottom.opacity;
        resultCtx.drawImage(bottom.src, bottom.x, bottom.y, bottom.width, bottom.height);
        resultCtx.save();
        resultCtx.beginPath();
        resultCtx.rect(0, splitY, W, H - splitY);
        resultCtx.clip();
        resultCtx.globalAlpha = top.opacity;
        resultCtx.drawImage(top.src, top.x, top.y, top.width, top.height);
        resultCtx.restore();
        resultCtx.globalAlpha = 1;

        resultCtx.strokeStyle = 'rgba(255,255,255,0.8)';
        resultCtx.lineWidth   = 2;
        resultCtx.beginPath();
        resultCtx.moveTo(0,    splitY);
        resultCtx.lineTo(W,    splitY);
        resultCtx.stroke();
    }

    updateSplitHandle(mode);
}

/* ══════════════════════════════════════════════════
   Интерактивный разделитель Split Screen
══════════════════════════════════════════════════ */

function updateSplitHandle(mode) {
    const rect = resultCanvas.getBoundingClientRect();
    splitHandle.style.display = 'block';

    if (mode === 'split-v') {
        splitHandle.style.left   = `${rect.left + (rect.width  * state.splitPos / 100)}px`;
        splitHandle.style.top    = `${rect.top}px`;
        splitHandle.style.width  = '6px';
        splitHandle.style.height = `${rect.height}px`;
        splitHandle.style.cursor = 'ew-resize';
    } else {
        splitHandle.style.left   = `${rect.left}px`;
        splitHandle.style.top    = `${rect.top + (rect.height * state.splitPos / 100)}px`;
        splitHandle.style.width  = `${rect.width}px`;
        splitHandle.style.height = '6px';
        splitHandle.style.cursor = 'ns-resize';
    }
}

function hideSplitHandle() {
    splitHandle.style.display = 'none';
}

/* Перетаскивание разделителя */
splitHandle.addEventListener('mousedown', e => {
    e.preventDefault();
    state.isDraggingSplit = true;
});

document.addEventListener('mousemove', e => {
    if (!state.isDraggingSplit) return;
    const mode = modeSelect.value;
    const rect = resultCanvas.getBoundingClientRect();

    if (mode === 'split-v') {
        state.splitPos = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width)  * 100));
    } else {
        state.splitPos = Math.min(100, Math.max(0, ((e.clientY - rect.top)  / rect.height) * 100));
    }
    debouncedApply();
});

document.addEventListener('mouseup', () => { state.isDraggingSplit = false; });

/* Touch events для мобильных */
splitHandle.addEventListener('touchstart', e => {
    e.preventDefault();
    state.isDraggingSplit = true;
}, { passive: false });

document.addEventListener('touchmove', e => {
    if (!state.isDraggingSplit) return;
    const touch = e.touches[0];
    const mode  = modeSelect.value;
    const rect  = resultCanvas.getBoundingClientRect();

    if (mode === 'split-v') {
        state.splitPos = Math.min(100, Math.max(0, ((touch.clientX - rect.left) / rect.width)  * 100));
    } else {
        state.splitPos = Math.min(100, Math.max(0, ((touch.clientY - rect.top)  / rect.height) * 100));
    }
    debouncedApply();
}, { passive: true });

document.addEventListener('touchend', () => { state.isDraggingSplit = false; });

/* ══════════════════════════════════════════════════
   Экспорт
══════════════════════════════════════════════════ */

function downloadCanvas(mimeType, ext) {
    if (resultCanvas.width === 0 || resultCanvas.height === 0) {
        showStatus('Сначала применить режим смешивания.', 'info');
        return;
    }
    const quality  = mimeType === 'image/jpeg' ? JPEG_QUALITY : undefined;
    const dataURL  = resultCanvas.toDataURL(mimeType, quality);
    const link     = document.createElement('a');
    link.href      = dataURL;
    link.download  = generateFilename(ext);
    link.click();
    showStatus(`Файл ${link.download} сохранён.`, 'success');
}

/* ══════════════════════════════════════════════════
   Сброс
══════════════════════════════════════════════════ */

function resetAll() {
    state.image1      = null;
    state.image2      = null;
    state.splitPos    = 50;
    state.layerOrder  = 'img1-top';
    state.orientation1 = 'auto';
    state.orientation2 = 'auto';
    state.layer1 = { opacity: 100, scale: 100, x: 0, y: 0, brightness: 0, contrast: 0,
                     saturation: 0, temperature: 0, hue: 0, blur: 0, sharpness: 0, vignette: 0, hdr: 0, grain: 0 };
    state.layer2 = { opacity: 100, scale: 100, x: 0, y: 0, brightness: 0, contrast: 0,
                     saturation: 0, temperature: 0, hue: 0, blur: 0, sharpness: 0, vignette: 0, hdr: 0, grain: 0 };

    /* Очищаем превью */
    [preview1, preview2].forEach(p => { p.src = ''; p.hidden = true; });
    [$('drop-zone-1'), $('drop-zone-2')].forEach(z => {
        z.querySelector('.drop-hint').hidden = false;
    });

    /* Сбрасываем глобальные слайдеры */
    opacitySlider.value      = 50;
    blendAmountSlider.value  = 100;
    opacityValue.textContent     = '50%';
    blendAmountValue.textContent = '100%';

    /* Сбрасываем per-layer слайдеры */
    resetLayerControls(1);
    resetLayerControls(2);

    /* Сбрасываем ориентацию */
    document.querySelectorAll('input[name="orientation-1"]').forEach(r => {
        r.checked = r.value === 'auto';
    });
    document.querySelectorAll('input[name="orientation-2"]').forEach(r => {
        r.checked = r.value === 'auto';
    });

    /* Сбрасываем порядок слоев */
    document.querySelectorAll('input[name="layer-order"]').forEach(r => {
        r.checked = r.value === 'img1-top';
    });

    /* Очищаем информацию об изображениях */
    imageInfo1.textContent = '';
    imageInfo2.textContent = '';

    /* Деактивируем кнопки удаления */
    deleteLayer1Btn.disabled = true;
    deleteLayer2Btn.disabled = true;

    /* Очищаем холст */
    resultCanvas.width  = 800;
    resultCanvas.height = 500;
    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);

    /* Рисуем плейсхолдер */
    drawPlaceholder();

    /* Восстановить активный слой */
    setActiveLayer(1);

    hideSplitHandle();
    statusMsg.hidden = true;
    showStatus('Все настройки сброшены.', 'info');
}

/* ══════════════════════════════════════════════════
   Плейсхолдер на холсте
══════════════════════════════════════════════════ */

function drawPlaceholder() {
    const W = resultCanvas.width;
    const H = resultCanvas.height;

    /* Фон */
    const grad = resultCtx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0,   '#1a1a2e');
    grad.addColorStop(0.5, '#16213e');
    grad.addColorStop(1,   '#0f3460');
    resultCtx.fillStyle = grad;
    resultCtx.fillRect(0, 0, W, H);

    /* Текст */
    resultCtx.fillStyle    = 'rgba(255,255,255,0.25)';
    resultCtx.font         = 'bold 22px Inter, sans-serif';
    resultCtx.textAlign    = 'center';
    resultCtx.textBaseline = 'middle';
    resultCtx.fillText('Загрузите изображения и нажмите «Применить»', W / 2, H / 2);
}

/* ══════════════════════════════════════════════════
   Утилита: обновить отображение всех слайдеров
══════════════════════════════════════════════════ */

function updateAllSliderValues() {
    opacityValue.textContent     = opacitySlider.value + '%';
    blendAmountValue.textContent = blendAmountSlider.value + '%';
}

/* ══════════════════════════════════════════════════
   История состояний (Undo/Redo)
══════════════════════════════════════════════════ */

function saveState() {
    if (resultCanvas.width === 0 || resultCanvas.height === 0) return;

    const currentState = {
        mode:        modeSelect.value,
        opacity:     opacitySlider.value,
        blendAmount: blendAmountSlider.value,
        layerOrder:  state.layerOrder,
        canvasData:  resultCanvas.toDataURL()
    };

    /* Удалить все состояния после текущего */
    history.states = history.states.slice(0, history.currentIndex + 1);
    history.states.push(currentState);

    if (history.states.length > history.maxSize) {
        history.states.shift();
    } else {
        history.currentIndex++;
    }

    updateHistoryButtons();
}

function undo() {
    if (history.currentIndex > 0) {
        history.currentIndex--;
        restoreState(history.states[history.currentIndex]);
        updateHistoryButtons();
    }
}

function redo() {
    if (history.currentIndex < history.states.length - 1) {
        history.currentIndex++;
        restoreState(history.states[history.currentIndex]);
        updateHistoryButtons();
    }
}

function restoreState(savedState) {
    modeSelect.value         = savedState.mode;
    opacitySlider.value      = savedState.opacity;
    blendAmountSlider.value  = savedState.blendAmount;
    state.layerOrder         = savedState.layerOrder;

    updateAllSliderValues();
    updateSliderVisibility();

    /* Обновить radio-кнопку порядка слоев */
    document.querySelectorAll('input[name="layer-order"]').forEach(r => {
        r.checked = r.value === savedState.layerOrder;
    });

    /* Восстановить canvas */
    const img = new Image();
    img.onload = () => {
        resultCanvas.width  = img.naturalWidth;
        resultCanvas.height = img.naturalHeight;
        resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
        resultCtx.drawImage(img, 0, 0);
    };
    img.src = savedState.canvasData;
}

function updateHistoryButtons() {
    const undoBtn = $('undo-btn');
    const redoBtn = $('redo-btn');
    if (undoBtn) undoBtn.disabled = history.currentIndex <= 0;
    if (redoBtn) redoBtn.disabled = history.currentIndex >= history.states.length - 1;
}

/* ══════════════════════════════════════════════════
   Режим сравнения До/После
══════════════════════════════════════════════════ */

function toggleComparisonMode() {
    if (!comparisonMode) {
        /* Нужны оба изображения */
        if (!state.image1 || !state.image2) {
            showStatus('Для режима сравнения нужны оба изображения.', 'info');
            return;
        }
        /* Сохраняем «до» — первое изображение в размере текущего canvas */
        comparisonBefore = document.createElement('canvas');
        comparisonBefore.width  = resultCanvas.width;
        comparisonBefore.height = resultCanvas.height;
        const s1 = getProcessedLayer(1);
        if (s1) {
            comparisonBefore.getContext('2d').drawImage(
                s1.src, s1.x, s1.y, s1.width, s1.height);
        }
        /* Сохраняем «после» — текущий результат */
        comparisonAfter = document.createElement('canvas');
        comparisonAfter.width  = resultCanvas.width;
        comparisonAfter.height = resultCanvas.height;
        comparisonAfter.getContext('2d').drawImage(resultCanvas, 0, 0);

        comparisonMode = true;
        $('comparison-overlay').hidden = false;
        $('comparison-toggle-btn').classList.add('active');
        updateComparisonView(50);
    } else {
        comparisonMode = false;
        $('comparison-overlay').hidden = true;
        $('comparison-toggle-btn').classList.remove('active');
        /* Восстановить полный результат */
        if (comparisonAfter) {
            resultCanvas.width  = comparisonAfter.width;
            resultCanvas.height = comparisonAfter.height;
            resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
            resultCtx.drawImage(comparisonAfter, 0, 0);
        }
    }
}

function updateComparisonView(position) {
    if (!comparisonBefore || !comparisonAfter) return;

    const splitX = Math.round((position / 100) * resultCanvas.width);

    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);

    /* Левая часть — «до» */
    resultCtx.save();
    resultCtx.beginPath();
    resultCtx.rect(0, 0, splitX, resultCanvas.height);
    resultCtx.clip();
    resultCtx.drawImage(comparisonBefore, 0, 0);
    resultCtx.restore();

    /* Правая часть — «после» */
    resultCtx.save();
    resultCtx.beginPath();
    resultCtx.rect(splitX, 0, resultCanvas.width - splitX, resultCanvas.height);
    resultCtx.clip();
    resultCtx.drawImage(comparisonAfter, 0, 0);
    resultCtx.restore();

    /* Обновить позицию разделителя */
    const divider = $('comparison-divider');
    if (divider) divider.style.left = `${position}%`;
}

/* ══════════════════════════════════════════════════
   Пресеты
══════════════════════════════════════════════════ */

function savePreset() {
    const name = prompt('Название пресета:');
    if (!name) return;

    const preset = {
        id:          Date.now(),
        name:        name,
        mode:        modeSelect.value,
        opacity:     opacitySlider.value,
        blendAmount: blendAmountSlider.value,
        layerOrder:  state.layerOrder
    };

    presets.push(preset);
    localStorage.setItem('presets', JSON.stringify(presets));
    renderPresets();
    showStatus(`Пресет «${name}» сохранён.`, 'success');
}

function loadPreset(presetId) {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    modeSelect.value         = preset.mode;
    opacitySlider.value      = preset.opacity;
    blendAmountSlider.value  = preset.blendAmount;
    state.layerOrder         = preset.layerOrder;

    document.querySelectorAll('input[name="layer-order"]').forEach(r => {
        r.checked = r.value === preset.layerOrder;
    });

    updateAllSliderValues();
    updateSliderVisibility();

    if (livePreviewEnabled && state.image1 && state.image2) {
        debouncedApply();
    }
    showStatus(`Пресет «${preset.name}» применён.`, 'success');
}

function deletePreset(presetId) {
    if (!confirm('Удалить этот пресет?')) return;
    const index = presets.findIndex(p => p.id === presetId);
    if (index !== -1) {
        const name = presets[index].name;
        presets.splice(index, 1);
        localStorage.setItem('presets', JSON.stringify(presets));
        renderPresets();
        showStatus(`Пресет «${name}» удалён.`, 'info');
    }
}

function renderPresets() {
    const list = $('presets-list');
    if (!list) return;
    list.innerHTML = '';

    if (presets.length === 0) {
        list.innerHTML = '<p style="font-size:0.8rem;color:var(--color-text-muted);text-align:center;padding:8px 0;">Нет сохранённых пресетов</p>';
        return;
    }

    presets.forEach(preset => {
        const item = document.createElement('div');
        item.className = 'preset-item';
        item.innerHTML = `
            <span class="preset-name" title="${preset.name}">${preset.name}</span>
            <button class="preset-load-btn" data-id="${preset.id}" type="button">Применить</button>
            <button class="preset-delete-btn" data-id="${preset.id}" type="button" title="Удалить">🗑️</button>
        `;
        list.appendChild(item);
    });

    list.querySelectorAll('.preset-load-btn').forEach(btn => {
        btn.addEventListener('click', e => loadPreset(parseInt(e.currentTarget.dataset.id, 10)));
    });
    list.querySelectorAll('.preset-delete-btn').forEach(btn => {
        btn.addEventListener('click', e => deletePreset(parseInt(e.currentTarget.dataset.id, 10)));
    });
}

/* ══════════════════════════════════════════════════
   Избранные режимы смешивания
══════════════════════════════════════════════════ */

function toggleFavoriteMode(modeValue) {
    const index = favoriteModes.indexOf(modeValue);
    if (index === -1) {
        favoriteModes.push(modeValue);
    } else {
        favoriteModes.splice(index, 1);
    }
    localStorage.setItem('favoriteModes', JSON.stringify(favoriteModes));
    renderFavorites();
}

function renderFavorites() {
    const options = Array.from(modeSelect.options);
    options.forEach(opt => {
        /* Убрать старую звёздочку */
        opt.textContent = opt.textContent.replace(/^⭐\s/, '');
        if (favoriteModes.includes(opt.value)) {
            opt.textContent = '⭐ ' + opt.textContent;
        }
    });

    /* Переставить избранные опции вверх (внутри своей optgroup) */
    const groups = Array.from(modeSelect.querySelectorAll('optgroup'));
    groups.forEach(group => {
        const opts = Array.from(group.querySelectorAll('option'));
        opts.sort((a, b) => {
            const aFav = favoriteModes.includes(a.value);
            const bFav = favoriteModes.includes(b.value);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return 0;
        });
        opts.forEach(o => group.appendChild(o));
    });
}

/* ══════════════════════════════════════════════════
   Поиск по режимам смешивания
══════════════════════════════════════════════════ */

function setupModeSearch() {
    const modeSearch = $('mode-search');
    if (!modeSearch) return;

    modeSearch.addEventListener('input', e => {
        const term = e.target.value.toLowerCase().trim();
        Array.from(modeSelect.options).forEach(opt => {
            const text = opt.textContent.toLowerCase();
            opt.style.display = (!term || text.includes(term)) ? '' : 'none';
        });
    });

    /* Сбросить фильтр при выборе */
    modeSelect.addEventListener('change', () => {
        modeSearch.value = '';
        Array.from(modeSelect.options).forEach(opt => { opt.style.display = ''; });
    });
}

/* ══════════════════════════════════════════════════
   Ресайз боковой панели
══════════════════════════════════════════════════ */

function setupPanelResize() {
    const panelResizer    = $('panel-resizer');
    const panelCollapseBtn = $('panel-collapse-btn');
    const appContainer    = document.querySelector('.app-container');
    if (!panelResizer || !appContainer) return;

    /* Применить сохранённую ширину */
    document.documentElement.style.setProperty('--panel-width', `${panelWidth}px`);

    /* Восстановить состояние коллапса */
    if (localStorage.getItem('panelCollapsed') === 'true') {
        appContainer.classList.add('panel-collapsed');
    }

    /* Ресайз */
    panelResizer.addEventListener('mousedown', () => {
        isResizing = true;
        panelResizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', e => {
        if (!isResizing) return;
        const container = appContainer.getBoundingClientRect();
        panelWidth = Math.max(240, Math.min(600, e.clientX - container.left));
        document.documentElement.style.setProperty('--panel-width', `${panelWidth}px`);
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            panelResizer.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            localStorage.setItem('panelWidth', panelWidth);
        }
    });

    /* Коллапс */
    if (panelCollapseBtn) {
        panelCollapseBtn.addEventListener('click', () => {
            appContainer.classList.toggle('panel-collapsed');
            localStorage.setItem('panelCollapsed',
                appContainer.classList.contains('panel-collapsed'));
        });
    }
}

/* ══════════════════════════════════════════════════
   Zoom & Pan
══════════════════════════════════════════════════ */

function applyCanvasTransform() {
    resultCanvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
}

function setupZoomPan() {
    /* Колесо мыши — масштаб */
    resultCanvas.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        zoomLevel = Math.max(0.1, Math.min(5, zoomLevel * delta));
        applyCanvasTransform();
    }, { passive: false });

    /* Space — включить режим перемещения */
    document.addEventListener('keydown', e => {
        if (e.code === 'Space' && e.target.tagName !== 'INPUT'
                && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
            e.preventDefault();
            spaceDown = true;
            resultCanvas.style.cursor = 'grab';
        }
    });
    document.addEventListener('keyup', e => {
        if (e.code === 'Space') {
            spaceDown = false;
            if (!isPanning) resultCanvas.style.cursor = '';
        }
    });

    resultCanvas.addEventListener('mousedown', e => {
        if (e.button === 0 && spaceDown) {
            isPanning  = true;
            panStartX  = e.clientX - panX;
            panStartY  = e.clientY - panY;
            resultCanvas.style.cursor = 'grabbing';
        }
    });

    document.addEventListener('mousemove', e => {
        if (isPanning) {
            panX = e.clientX - panStartX;
            panY = e.clientY - panStartY;
            applyCanvasTransform();
        }
    });

    document.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            resultCanvas.style.cursor = spaceDown ? 'grab' : '';
        }
    });

    /* Кнопки zoom */
    const zoomControls = document.createElement('div');
    zoomControls.className = 'zoom-controls';

    const zoomInBtn = document.createElement('button');
    zoomInBtn.type      = 'button';
    zoomInBtn.className = 'zoom-btn zoom-in-btn';
    zoomInBtn.title     = 'Увеличить';
    zoomInBtn.textContent = '+';
    zoomInBtn.addEventListener('click', () => {
        zoomLevel = Math.min(5, zoomLevel * 1.2);
        applyCanvasTransform();
    });

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.type      = 'button';
    zoomOutBtn.className = 'zoom-btn zoom-out-btn';
    zoomOutBtn.title     = 'Уменьшить';
    zoomOutBtn.textContent = '−';
    zoomOutBtn.addEventListener('click', () => {
        zoomLevel = Math.max(0.1, zoomLevel * 0.8);
        applyCanvasTransform();
    });

    const zoomResetBtn = document.createElement('button');
    zoomResetBtn.type      = 'button';
    zoomResetBtn.className = 'zoom-btn zoom-reset-btn';
    zoomResetBtn.title     = 'Сбросить масштаб';
    zoomResetBtn.textContent = '100%';
    zoomResetBtn.addEventListener('click', () => {
        zoomLevel = 1;
        panX = 0;
        panY = 0;
        applyCanvasTransform();
    });

    zoomControls.appendChild(zoomOutBtn);
    zoomControls.appendChild(zoomResetBtn);
    zoomControls.appendChild(zoomInBtn);

    const resultPanel = document.querySelector('.result-panel');
    if (resultPanel) resultPanel.appendChild(zoomControls);
}

/* ══════════════════════════════════════════════════
   Горячие клавиши
══════════════════════════════════════════════════ */

function selectPreviousMode() {
    const idx = modeSelect.selectedIndex;
    if (idx > 0) {
        modeSelect.selectedIndex = idx - 1;
        modeSelect.dispatchEvent(new Event('change'));
    }
}

function selectNextMode() {
    const idx = modeSelect.selectedIndex;
    if (idx < modeSelect.options.length - 1) {
        modeSelect.selectedIndex = idx + 1;
        modeSelect.dispatchEvent(new Event('change'));
    }
}

function showKeyboardShortcuts() {
    const text = [
        'Горячие клавиши:',
        'Ctrl+O — Загрузить изображение 1',
        'Ctrl+Shift+O — Загрузить изображение 2',
        'Ctrl+S — Сохранить PNG',
        'Ctrl+Shift+S — Сохранить JPEG',
        'Ctrl+Z — Отменить',
        'Ctrl+Shift+Z / Ctrl+Y — Повторить',
        'Tab — Переключить активный слой',
        'Space — Режим сравнения (или pan при зажатии)',
        'R — Сброс',
        'L — Живой предпросмотр',
        'C — Свернуть/развернуть панель',
        '↑/↓ — Переключить режим',
        '? — Эта справка'
    ].join('\n');
    showStatus(text, 'info');
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
        const tag = e.target.tagName;
        const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

        /* Ctrl+O — загрузить изображение 1 */
        if (e.ctrlKey && !e.shiftKey && e.key === 'o') {
            e.preventDefault();
            fileInput1.click();
            return;
        }

        /* Ctrl+Shift+O — загрузить изображение 2 */
        if (e.ctrlKey && e.shiftKey && e.key === 'O') {
            e.preventDefault();
            fileInput2.click();
            return;
        }

        /* Ctrl+S — сохранить PNG */
        if (e.ctrlKey && !e.shiftKey && e.key === 's') {
            e.preventDefault();
            downloadPngBtn.click();
            return;
        }

        /* Ctrl+Shift+S — сохранить JPEG */
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            downloadJpgBtn.click();
            return;
        }

        /* Ctrl+Z — отменить */
        if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
            e.preventDefault();
            undo();
            return;
        }

        /* Ctrl+Shift+Z / Ctrl+Y — повторить */
        if ((e.ctrlKey && e.shiftKey && e.key === 'Z') ||
                (e.ctrlKey && !e.shiftKey && e.key === 'y')) {
            e.preventDefault();
            redo();
            return;
        }

        if (inInput) return;

        /* Tab — переключить активный слой */
        if (e.key === 'Tab' && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            setActiveLayer(state.activeLayer === 1 ? 2 : 1);
            return;
        }

        /* Space — предотвратить прокрутку страницы только в активном режиме */
        if (e.code === 'Space' && spaceDown) {
            e.preventDefault();
        }

        /* R — сброс */
        if (e.key === 'r' && !e.ctrlKey) {
            e.preventDefault();
            resetBtn.click();
            return;
        }

        /* L — живой предпросмотр */
        if (e.key === 'l' && !e.ctrlKey) {
            e.preventDefault();
            const toggle = $('live-preview-toggle');
            if (toggle) toggle.click();
            return;
        }

        /* C — свернуть/развернуть панель */
        if (e.key === 'c' && !e.ctrlKey) {
            e.preventDefault();
            const collapseBtn = $('panel-collapse-btn');
            if (collapseBtn) collapseBtn.click();
            return;
        }

        /* ↑/↓ — переключить режим */
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectPreviousMode();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectNextMode();
            return;
        }

        /* ? — справка */
        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
            e.preventDefault();
            showKeyboardShortcuts();
        }
    });

    /* Space keyup — режим сравнения (если не было движения) */
    document.addEventListener('keyup', e => {
        if (e.code === 'Space' && !isPanning
                && e.target.tagName !== 'INPUT'
                && e.target.tagName !== 'TEXTAREA'
                && e.target.tagName !== 'SELECT') {
            toggleComparisonMode();
        }
    });

    /* Кнопка справки */
    const helpBtn = document.createElement('button');
    helpBtn.className   = 'help-btn';
    helpBtn.type        = 'button';
    helpBtn.textContent = '?';
    helpBtn.title       = 'Горячие клавиши (?)';
    helpBtn.addEventListener('click', showKeyboardShortcuts);
    document.body.appendChild(helpBtn);
}

/* ══════════════════════════════════════════════════
   Per-layer controls helpers
══════════════════════════════════════════════════ */

/* ── Вспомогательные функции для пространства HSL ── */

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            default: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return [h, s, l];
}

function hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r * 255, g * 255, b * 255];
}

/**
 * Применить расширенные фильтры (насыщенность, температура, оттенок, HDR, зерно) к canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {object} layer
 */
function applyLayerFilters(canvas, layer) {
    const ctx  = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        /* Насыщенность */
        if (layer.saturation !== 0) {
            const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
            const satFactor = 1 + (layer.saturation / 100);
            r = gray + (r - gray) * satFactor;
            g = gray + (g - gray) * satFactor;
            b = gray + (b - gray) * satFactor;
        }

        /* Температура */
        if (layer.temperature !== 0) {
            const temp = layer.temperature / 100;
            r += temp * 50;
            b -= temp * 50;
        }

        /* Оттенок (hue shift) */
        if (layer.hue !== 0) {
            const hsl = rgbToHsl(
                Math.max(0, Math.min(255, r)),
                Math.max(0, Math.min(255, g)),
                Math.max(0, Math.min(255, b))
            );
            hsl[0] = ((hsl[0] + layer.hue / 360) % 1 + 1) % 1;
            const rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);
            r = rgb[0];
            g = rgb[1];
            b = rgb[2];
        }

        /* HDR эффект */
        if (layer.hdr > 0) {
            const hdrFactor = layer.hdr / 100;
            const avg = (r + g + b) / 3;
            if (avg > 128) {
                r = r + (255 - r) * hdrFactor * 0.3;
                g = g + (255 - g) * hdrFactor * 0.3;
                b = b + (255 - b) * hdrFactor * 0.3;
            } else {
                r = r * (1 - hdrFactor * 0.3);
                g = g * (1 - hdrFactor * 0.3);
                b = b * (1 - hdrFactor * 0.3);
            }
        }

        data[i]     = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
    }

    /* Зерно пленки */
    if (layer.grain > 0) {
        const grainAmount = layer.grain / 100;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * grainAmount * 50;
            data[i]     = Math.max(0, Math.min(255, data[i]     + noise));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        }
    }

    ctx.putImageData(imgData, 0, 0);
}

/**
 * Применить виньетирование (тёмный радиальный градиент) к canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {number} strength — 0–100
 */
function applyVignette(canvas, strength) {
    const ctx    = canvas.getContext('2d');
    const w      = canvas.width;
    const h      = canvas.height;
    const cx     = w / 2;
    const cy     = h / 2;
    const radius = Math.max(w, h);
    const vignetteStrength = strength / 100;

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0,   'rgba(0,0,0,0)');
    gradient.addColorStop(0.7, 'rgba(0,0,0,0)');
    gradient.addColorStop(1,   `rgba(0,0,0,${vignetteStrength.toFixed(3)})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
}

/**
 * Синхронизировать все slider-элементы слоя с текущим состоянием.
 * Используется после применения пресета.
 * @param {number} layerNum — 1 или 2
 */
function updateAllLayerControls(layerNum) {
    const layer = layerNum === 1 ? state.layer1 : state.layer2;
    const pfx   = `layer${layerNum}`;

    const params = [
        { id: `${pfx}-opacity`,     val: layer.opacity,     suffix: '%'  },
        { id: `${pfx}-scale`,       val: layer.scale,       suffix: '%'  },
        { id: `${pfx}-x`,           val: layer.x,           suffix: 'px' },
        { id: `${pfx}-y`,           val: layer.y,           suffix: 'px' },
        { id: `${pfx}-brightness`,  val: layer.brightness,  suffix: ''   },
        { id: `${pfx}-contrast`,    val: layer.contrast,    suffix: ''   },
        { id: `${pfx}-saturation`,  val: layer.saturation,  suffix: ''   },
        { id: `${pfx}-temperature`, val: layer.temperature, suffix: ''   },
        { id: `${pfx}-blur`,        val: layer.blur,        suffix: ''   },
        { id: `${pfx}-sharpness`,   val: layer.sharpness,   suffix: ''   },
        { id: `${pfx}-vignette`,    val: layer.vignette,    suffix: ''   },
        { id: `${pfx}-hdr`,         val: layer.hdr,         suffix: ''   },
        { id: `${pfx}-grain`,       val: layer.grain,       suffix: ''   },
    ];

    params.forEach(({ id, val, suffix }) => {
        const el = $(id);
        if (el) {
            el.value = val;
            const display = $(`${id}-value`);
            if (display) display.textContent = Math.round(val) + suffix;
        }
    });

    /* Оттенок имеет суффикс '°' */
    const hueEl = $(`${pfx}-hue`);
    if (hueEl) {
        hueEl.value = layer.hue;
        const hueDisplay = $(`${pfx}-hue-value`);
        if (hueDisplay) hueDisplay.textContent = `${Math.round(layer.hue)}°`;
    }
}

/**
 * Переключить таб внутри layer-controls.
 * @param {number} layerNum — 1 или 2
 * @param {string} tab      — 'basic' | 'filters' | 'effects'
 */
function switchLayerTab(layerNum, tab) {
    const container = $(`layer-controls-${layerNum}`);
    if (!container) return;

    container.querySelectorAll('.layer-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    container.querySelectorAll('.layer-tab-content').forEach(content => {
        content.classList.toggle('active', content.dataset.content === tab);
    });
}

/**
 * Применить пресет фильтров к слою.
 * @param {number} layerNum — 1 или 2
 * @param {string} preset
 */
function applyFilterPreset(layerNum, preset) {
    const layer = layerNum === 1 ? state.layer1 : state.layer2;

    switch (preset) {
        case 'none':
            layer.brightness  = 0;
            layer.contrast    = 0;
            layer.saturation  = 0;
            layer.temperature = 0;
            layer.hue         = 0;
            break;
        case 'bw':
            layer.saturation = -100;
            layer.contrast   = 20;
            break;
        case 'sepia':
            layer.saturation  = -50;
            layer.temperature = 40;
            layer.contrast    = 10;
            break;
        case 'warm':
            layer.temperature = 30;
            layer.brightness  = 10;
            break;
        case 'cold':
            layer.temperature = -30;
            layer.contrast    = 10;
            break;
        case 'vintage':
            layer.saturation  = -30;
            layer.temperature = 20;
            layer.contrast    = -10;
            layer.brightness  = -5;
            break;
    }

    updateAllLayerControls(layerNum);
    if (livePreviewEnabled) debouncedApply();
}

/**
 * Применить пресет эффектов к слою.
 * @param {number} layerNum — 1 или 2
 * @param {string} effect
 */
function applyEffectPreset(layerNum, effect) {
    const layer = layerNum === 1 ? state.layer1 : state.layer2;

    switch (effect) {
        case 'none':
            layer.blur      = 0;
            layer.sharpness = 0;
            layer.vignette  = 0;
            layer.hdr       = 0;
            layer.grain     = 0;
            break;
        case 'soft':
            layer.blur      = 1;
            layer.vignette  = 20;
            layer.brightness = 5;
            break;
        case 'dramatic':
            layer.contrast  = 40;
            layer.saturation = 20;
            layer.vignette  = 50;
            layer.hdr       = 60;
            break;
        case 'dreamy':
            layer.blur       = 2;
            layer.brightness = 15;
            layer.saturation = -20;
            layer.vignette   = 30;
            break;
        case 'gritty':
            layer.grain      = 40;
            layer.contrast   = 30;
            layer.saturation = -20;
            layer.sharpness  = 30;
            break;
        case 'cinema':
            layer.vignette  = 40;
            layer.contrast  = 20;
            layer.saturation = 10;
            layer.hdr       = 30;
            break;
    }

    updateAllLayerControls(layerNum);
    if (livePreviewEnabled) debouncedApply();
}


function resetLayerControls(slot) {
    const pfx = `layer${slot}`;
    const setSlider = (id, val, suffix) => {
        const el = $(id);
        if (el) {
            el.value = val;
            const display = $(`${id}-value`);
            if (display) display.textContent = val + suffix;
        }
    };
    setSlider(`${pfx}-opacity`,     100, '%');
    setSlider(`${pfx}-scale`,       100, '%');
    setSlider(`${pfx}-x`,             0, 'px');
    setSlider(`${pfx}-y`,             0, 'px');
    setSlider(`${pfx}-brightness`,    0, '');
    setSlider(`${pfx}-contrast`,      0, '');
    setSlider(`${pfx}-saturation`,    0, '');
    setSlider(`${pfx}-temperature`,   0, '');
    setSlider(`${pfx}-blur`,          0, '');
    setSlider(`${pfx}-sharpness`,     0, '');
    setSlider(`${pfx}-vignette`,      0, '');
    setSlider(`${pfx}-hdr`,           0, '');
    setSlider(`${pfx}-grain`,         0, '');
    /* Оттенок имеет особый суффикс */
    const hueEl = $(`${pfx}-hue`);
    if (hueEl) {
        hueEl.value = 0;
        const hueDisplay = $(`${pfx}-hue-value`);
        if (hueDisplay) hueDisplay.textContent = '0°';
    }
}

/**
 * Подключить per-layer слайдеры для заданного слоя
 * @param {number} slot — 1 или 2
 */
function setupLayerControls(slot) {
    const pfx   = `layer${slot}`;
    const layer = slot === 1 ? state.layer1 : state.layer2;

    const bindSlider = (id, prop, suffix, transform) => {
        const slider  = $(id);
        const display = $(`${id}-value`);
        if (!slider) return;
        if (display) display.textContent = slider.value + suffix;
        slider.addEventListener('input', () => {
            const raw = parseFloat(slider.value);
            layer[prop] = transform ? transform(raw) : raw;
            if (display) display.textContent = slider.value + suffix;
            if (livePreviewEnabled) debouncedApply();
        });
    };

    bindSlider(`${pfx}-opacity`,    'opacity',    '%');
    bindSlider(`${pfx}-scale`,      'scale',      '%');
    bindSlider(`${pfx}-x`,          'x',          'px');
    bindSlider(`${pfx}-y`,          'y',          'px');
    bindSlider(`${pfx}-brightness`, 'brightness', '');
    bindSlider(`${pfx}-contrast`,   'contrast',   '');
    bindSlider(`${pfx}-saturation`, 'saturation', '');
    bindSlider(`${pfx}-temperature`, 'temperature', '');
    bindSlider(`${pfx}-blur`,       'blur',       '');
    bindSlider(`${pfx}-sharpness`,  'sharpness',  '');
    bindSlider(`${pfx}-vignette`,   'vignette',   '');
    bindSlider(`${pfx}-hdr`,        'hdr',        '');
    bindSlider(`${pfx}-grain`,      'grain',      '');

    /* Оттенок: особый суффикс '°' */
    const hueSlider  = $(`${pfx}-hue`);
    const hueDisplay = $(`${pfx}-hue-value`);
    if (hueSlider) {
        if (hueDisplay) hueDisplay.textContent = hueSlider.value + '°';
        hueSlider.addEventListener('input', () => {
            layer.hue = parseFloat(hueSlider.value);
            if (hueDisplay) hueDisplay.textContent = Math.round(layer.hue) + '°';
            if (livePreviewEnabled) debouncedApply();
        });
    }
}

/* ══════════════════════════════════════════════════
   Инициализация
══════════════════════════════════════════════════ */

function init() {
    /* Зоны загрузки */
    setupDropZone(dropZone1, fileInput1, preview1, 1);
    setupDropZone(dropZone2, fileInput2, preview2, 2);

    /* Глобальные слайдеры */
    setupSlider(opacitySlider,      opacityValue,      '%');
    setupSlider(blendAmountSlider,  blendAmountValue,  '%');

    /* Per-layer слайдеры */
    setupLayerControls(1);
    setupLayerControls(2);

    /* Кнопки сброса слоя */
    const resetLayer1Btn = $('reset-layer-1');
    const resetLayer2Btn = $('reset-layer-2');
    if (resetLayer1Btn) resetLayer1Btn.addEventListener('click', () => {
        state.layer1 = { opacity: 100, scale: 100, x: 0, y: 0, brightness: 0, contrast: 0,
                         saturation: 0, temperature: 0, hue: 0, blur: 0, sharpness: 0, vignette: 0, hdr: 0, grain: 0 };
        resetLayerControls(1);
        if (livePreviewEnabled) debouncedApply();
    });
    if (resetLayer2Btn) resetLayer2Btn.addEventListener('click', () => {
        state.layer2 = { opacity: 100, scale: 100, x: 0, y: 0, brightness: 0, contrast: 0,
                         saturation: 0, temperature: 0, hue: 0, blur: 0, sharpness: 0, vignette: 0, hdr: 0, grain: 0 };
        resetLayerControls(2);
        if (livePreviewEnabled) debouncedApply();
    });

    /* Радио-кнопки ориентации */
    document.querySelectorAll('input[name="orientation-1"]').forEach(radio => {
        radio.addEventListener('change', () => {
            state.orientation1 = radio.value;
            updateImageInfo(1);
            debouncedApply();
        });
    });
    document.querySelectorAll('input[name="orientation-2"]').forEach(radio => {
        radio.addEventListener('change', () => {
            state.orientation2 = radio.value;
            updateImageInfo(2);
            debouncedApply();
        });
    });

    /* Кнопки загрузки */
    if (uploadBtn1) {
        uploadBtn1.addEventListener('click', e => {
            e.stopPropagation();
            fileInput1.click();
        });
    }
    if (uploadBtn2) {
        uploadBtn2.addEventListener('click', e => {
            e.stopPropagation();
            fileInput2.click();
        });
    }

    /* Кнопки удаления слоёв */
    deleteLayer1Btn.addEventListener('click', () => deleteLayer(1));
    deleteLayer2Btn.addEventListener('click', () => deleteLayer(2));

    /* Порядок слоев */
    document.querySelectorAll('input[name="layer-order"]').forEach(radio => {
        radio.addEventListener('change', e => {
            state.layerOrder = e.target.value;
            if (state.image1 && state.image2) debouncedApply();
        });
    });

    /* Кнопка смены слоев */
    if (swapLayersBtn) {
        swapLayersBtn.addEventListener('click', () => {
            if (state.layerOrder === 'img1-top') {
                state.layerOrder = 'img2-top';
                const r = $('layer-order-2');
                if (r) r.checked = true;
            } else {
                /* 'img2-top' and 'auto' both swap to img1-top */
                state.layerOrder = 'img1-top';
                const r = $('layer-order-1');
                if (r) r.checked = true;
            }
            if (state.image1 && state.image2) debouncedApply();
        });
    }

    /* Смена режима */
    modeSelect.addEventListener('change', () => {
        updateSliderVisibility();
        hideSplitHandle();
        debouncedApply();
    });

    /* Кнопки */
    applyBtn.addEventListener('click', apply);
    downloadPngBtn.addEventListener('click', () => downloadCanvas('image/png',  'png'));
    downloadJpgBtn.addEventListener('click', () => downloadCanvas('image/jpeg', 'jpg'));
    resetBtn.addEventListener('click', resetAll);

    /* ── Живой предпросмотр ── */
    const livePreviewToggle = $('live-preview-toggle');
    if (livePreviewToggle) {
        livePreviewToggle.checked = livePreviewEnabled;
        livePreviewToggle.addEventListener('change', e => {
            livePreviewEnabled = e.target.checked;
            localStorage.setItem('livePreview', livePreviewEnabled);
            applyBtn.style.display = livePreviewEnabled ? 'none' : '';
        });
        /* Скрыть кнопку «Применить» если live preview включён */
        applyBtn.style.display = livePreviewEnabled ? 'none' : '';
    }

    /* ── История: кнопки Undo/Redo ── */
    const undoBtn = $('undo-btn');
    const redoBtn = $('redo-btn');
    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);
    updateHistoryButtons();

    /* ── Режим сравнения ── */
    const comparisonToggleBtn = $('comparison-toggle-btn');
    if (comparisonToggleBtn) {
        comparisonToggleBtn.addEventListener('click', toggleComparisonMode);
    }
    const comparisonSlider = $('comparison-slider');
    if (comparisonSlider) {
        comparisonSlider.addEventListener('input', e => {
            updateComparisonView(parseInt(e.target.value, 10));
        });
    }

    /* ── Пресеты ── */
    renderPresets();
    const savePresetBtn = $('save-preset-btn');
    if (savePresetBtn) savePresetBtn.addEventListener('click', savePreset);

    /* ── Избранные режимы ── */
    renderFavorites();
    modeSelect.addEventListener('dblclick', e => {
        if (e.target.tagName === 'OPTION') {
            toggleFavoriteMode(e.target.value);
        }
    });

    /* ── Поиск режимов ── */
    setupModeSearch();

    /* ── Ресайз панели ── */
    setupPanelResize();

    /* ── Zoom & Pan ── */
    setupZoomPan();

    /* ── Горячие клавиши ── */
    setupKeyboardShortcuts();

    /* ── Табы слоёв ── */
    document.querySelectorAll('.layer-tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const controls = this.closest('.layer-controls');
            const layerNum = controls && controls.id.includes('1') ? 1 : 2;
            switchLayerTab(layerNum, this.dataset.tab);
        });
    });

    /* ── Пресеты фильтров и эффектов ── */
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const layerNum = parseInt(this.dataset.layer, 10);
            if (this.dataset.preset) {
                applyFilterPreset(layerNum, this.dataset.preset);
            } else if (this.dataset.effect) {
                applyEffectPreset(layerNum, this.dataset.effect);
            }
        });
    });

    /* Начальная настройка */
    updateSliderVisibility();
    setActiveLayer(1);
    resultCanvas.width  = 800;
    resultCanvas.height = 500;
    drawPlaceholder();
}

/* Запуск после полной загрузки DOM */
document.addEventListener('DOMContentLoaded', init);
