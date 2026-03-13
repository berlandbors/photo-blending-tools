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
    scale1: 1.0,           // масштаб первого изображения (1.0 = 100%)
    scale2: 1.0,           // масштаб второго изображения
    orientation1: 'auto',  // 'auto' | 'landscape' | 'portrait'
    orientation2: 'auto',
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
const brightnessSlider = $('brightness-slider');
const contrastSlider   = $('contrast-slider');
const blendAmountSlider = $('blend-amount-slider');

const opacityValue      = $('opacity-value');
const brightnessValue   = $('brightness-value');
const contrastValue     = $('contrast-value');
const blendAmountValue  = $('blend-amount-value');

const scaleSlider1  = $('scale-slider-1');
const scaleSlider2  = $('scale-slider-2');
const scaleValue1   = $('scale-value-1');
const scaleValue2   = $('scale-value-2');
const imageInfo1    = $('image-info-1');
const imageInfo2    = $('image-info-2');

const applyBtn       = $('apply-btn');
const downloadPngBtn = $('download-png');
const downloadJpgBtn = $('download-jpg');
const resetBtn       = $('reset-btn');

const uploadBtn1     = $('upload-btn-1');
const uploadBtn2     = $('upload-btn-2');
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
    const scale       = slot === 1 ? state.scale1       : state.scale2;

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
    const s1 = getScaledSource(1);
    const s2 = getScaledSource(2);
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
 * Настроить зону перетаскивания и превью для одного изображения
 * @param {HTMLElement} zone
 * @param {HTMLInputElement} input
 * @param {HTMLImageElement} preview
 * @param {number} slot  — 1 или 2
 */
function setupDropZone(zone, input, preview, slot) {
    /* Клик по зоне */
    zone.addEventListener('click', () => input.click());

    /* Keyboard accessibility */
    zone.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.click();
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
        } else {
            state.image2 = img;
            preview2.src     = img.src;
            preview2.hidden  = false;
            $('drop-zone-2').querySelector('.drop-hint').hidden = true;
            updateImageInfo(2);
        }
        showStatus(`Изображение ${slot} загружено (${img.naturalWidth}×${img.naturalHeight} px)`, 'success');
        if (livePreviewEnabled) debouncedApply();
    } catch (err) {
        showStatus(err.message, 'error');
    } finally {
        setLoading(false);
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

        /* Постобработка: яркость / контраст */
        const brightness = parseInt(brightnessSlider.value, 10);
        const contrast   = parseInt(contrastSlider.value, 10);
        if (brightness !== 0 || contrast !== 100) {
            window.BlendingEngine.applyBrightnessContrast(resultCanvas, brightness, contrast);
        }

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
    const s1 = getScaledSource(1);
    const s2 = getScaledSource(2);
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
    const s1 = getScaledSource(1);
    const s2 = getScaledSource(2);
    if (!s1 || !s2) {
        showStatus('Для этого режима нужны оба изображения.', 'info');
        return;
    }
    const { bottom, top } = getOrderedSources();
    const W = Math.max(s1.width,  s2.width);
    const H = Math.max(s1.height, s2.height);

    resultCanvas.width  = W;
    resultCanvas.height = H;

    resultCtx.drawImage(bottom.src, 0, 0, bottom.width, bottom.height);

    const alpha = parseInt(opacitySlider.value, 10) / 100;
    resultCtx.globalAlpha = alpha;
    resultCtx.drawImage(top.src, 0, 0, top.width, top.height);
    resultCtx.globalAlpha = 1;
}

/* ══════════════════════════════════════════════════
   Рендеринг: CSS Blend Modes
══════════════════════════════════════════════════ */

function renderCSSBlend(mode) {
    const s1 = getScaledSource(1);
    const s2 = getScaledSource(2);
    if (!s1 || !s2) {
        showStatus('Для этого режима нужны оба изображения.', 'info');
        return;
    }
    const { bottom, top } = getOrderedSources();
    const W = Math.max(s1.width,  s2.width);
    const H = Math.max(s1.height, s2.height);

    resultCanvas.width  = W;
    resultCanvas.height = H;

    resultCtx.drawImage(bottom.src, 0, 0, bottom.width, bottom.height);
    resultCtx.globalCompositeOperation = mode;
    resultCtx.drawImage(top.src, 0, 0, top.width, top.height);
    resultCtx.globalCompositeOperation = 'source-over';
}

/* ══════════════════════════════════════════════════
   Рендеринг: Canvas попиксельное смешивание
══════════════════════════════════════════════════ */

function renderCanvasBlend(mode) {
    const s1 = getScaledSource(1);
    const s2 = getScaledSource(2);
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

    /* Применяем порядок слоев: blendImages(bottom, top, ...) */
    const { bottom, top } = getOrderedSources();
    const out = window.BlendingEngine.blendImages(bottom.src, top.src, internalMode, opts);
    resultCanvas.width  = out.width;
    resultCanvas.height = out.height;
    resultCtx.drawImage(out, 0, 0);
}

/* ══════════════════════════════════════════════════
   Рендеринг: Double Exposure
══════════════════════════════════════════════════ */

function renderDoubleExposure() {
    const s1 = getScaledSource(1);
    const s2 = getScaledSource(2);
    if (!s1 || !s2) {
        showStatus('Для двойного экспонирования нужны оба изображения.', 'info');
        return;
    }
    const opts = { blendAmount: parseInt(blendAmountSlider.value, 10) };
    const { bottom, top } = getOrderedSources();
    const out  = window.BlendingEngine.doubleExposure(bottom.src, top.src, opts);
    resultCanvas.width  = out.width;
    resultCanvas.height = out.height;
    resultCtx.drawImage(out, 0, 0);
}

/* ══════════════════════════════════════════════════
   Рендеринг: Split Screen
══════════════════════════════════════════════════ */

function renderSplitScreen(mode) {
    const s1 = getScaledSource(1);
    const s2 = getScaledSource(2);
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
        resultCtx.drawImage(bottom.src, 0, 0, bottom.width, bottom.height);
        resultCtx.save();
        resultCtx.beginPath();
        resultCtx.rect(splitX, 0, W - splitX, H);
        resultCtx.clip();
        resultCtx.drawImage(top.src, 0, 0, top.width, top.height);
        resultCtx.restore();

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
        resultCtx.drawImage(bottom.src, 0, 0, bottom.width, bottom.height);
        resultCtx.save();
        resultCtx.beginPath();
        resultCtx.rect(0, splitY, W, H - splitY);
        resultCtx.clip();
        resultCtx.drawImage(top.src, 0, 0, top.width, top.height);
        resultCtx.restore();

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
    state.scale1      = 1.0;
    state.scale2      = 1.0;
    state.orientation1 = 'auto';
    state.orientation2 = 'auto';

    /* Очищаем превью */
    [preview1, preview2].forEach(p => { p.src = ''; p.hidden = true; });
    [$('drop-zone-1'), $('drop-zone-2')].forEach(z => {
        z.querySelector('.drop-hint').hidden = false;
    });

    /* Сбрасываем слайдеры */
    opacitySlider.value      = 50;
    brightnessSlider.value   = 0;
    contrastSlider.value     = 100;
    blendAmountSlider.value  = 100;
    scaleSlider1.value       = 100;
    scaleSlider2.value       = 100;
    opacityValue.textContent     = '50%';
    brightnessValue.textContent  = '0';
    contrastValue.textContent    = '100%';
    blendAmountValue.textContent = '100%';
    scaleValue1.textContent      = '100%';
    scaleValue2.textContent      = '100%';

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

    /* Очищаем холст */
    resultCanvas.width  = 800;
    resultCanvas.height = 500;
    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);

    /* Рисуем плейсхолдер */
    drawPlaceholder();

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
    brightnessValue.textContent  = brightnessSlider.value;
    contrastValue.textContent    = contrastSlider.value + '%';
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
        brightness:  brightnessSlider.value,
        contrast:    contrastSlider.value,
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
    brightnessSlider.value   = savedState.brightness;
    contrastSlider.value     = savedState.contrast;
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
        const s1 = getScaledSource(1);
        if (s1) {
            comparisonBefore.getContext('2d').drawImage(
                s1.src, 0, 0, resultCanvas.width, resultCanvas.height);
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
        brightness:  brightnessSlider.value,
        contrast:    contrastSlider.value,
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
    brightnessSlider.value   = preset.brightness;
    contrastSlider.value     = preset.contrast;
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
   Инициализация
══════════════════════════════════════════════════ */

function init() {
    /* Зоны загрузки */
    setupDropZone(dropZone1, fileInput1, preview1, 1);
    setupDropZone(dropZone2, fileInput2, preview2, 2);

    /* Слайдеры */
    setupSlider(opacitySlider,      opacityValue,      '%');
    setupSlider(brightnessSlider,   brightnessValue,   '');
    setupSlider(contrastSlider,     contrastValue,     '%');
    setupSlider(blendAmountSlider,  blendAmountValue,  '%');

    /* Слайдеры масштаба */
    setupSlider(scaleSlider1, scaleValue1, '%');
    setupSlider(scaleSlider2, scaleValue2, '%');
    scaleSlider1.addEventListener('input', () => {
        state.scale1 = parseInt(scaleSlider1.value, 10) / 100;
        scaleValue1.textContent = scaleSlider1.value + '%';
        if (livePreviewEnabled) debouncedApply();
    });
    scaleSlider2.addEventListener('input', () => {
        state.scale2 = parseInt(scaleSlider2.value, 10) / 100;
        scaleValue2.textContent = scaleSlider2.value + '%';
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

    /* Начальная настройка */
    updateSliderVisibility();
    resultCanvas.width  = 800;
    resultCanvas.height = 500;
    drawPlaceholder();
}

/* Запуск после полной загрузки DOM */
document.addEventListener('DOMContentLoaded', init);
