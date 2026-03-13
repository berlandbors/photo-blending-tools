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
    scale1: 1.0,           // масштаб первого изображения (1.0 = 100%)
    scale2: 1.0,           // масштаб второго изображения
    orientation1: 'auto',  // 'auto' | 'landscape' | 'portrait'
    orientation2: 'auto',
    layerOrder: 'img1-top', // 'img1-top' | 'img2-top' | 'auto'
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

const resultCanvas   = $('result-canvas');
const resultCtx      = resultCanvas.getContext('2d');
const splitHandle    = $('split-handle');
const loadingOverlay = $('loading-overlay');
const statusMsg      = $('status-message');

const uploadBtn1     = $('upload-btn-1');
const uploadBtn2     = $('upload-btn-2');
const swapLayersBtn  = $('swap-layers-btn');
const layerOrderRadios = document.querySelectorAll('input[name="layer-order"]');

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
 * Вернуть пару источников [нижний, верхний] с учётом порядка слоёв.
 * @returns {{ bottom: object|null, top: object|null }}
 */
function getOrderedSources() {
    const s1 = getScaledSource(1);
    const s2 = getScaledSource(2);
    if (state.layerOrder === 'img2-top') {
        return { bottom: s1, top: s2 };
    }
    /* 'img1-top' и 'auto' — изображение 1 сверху */
    return { bottom: s2, top: s1 };
}


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
            const dz1 = $('drop-zone-1');
            dz1.querySelector('.drop-hint').hidden = true;
            dz1.classList.add('has-image');
            updateImageInfo(1);
        } else {
            state.image2 = img;
            preview2.src     = img.src;
            preview2.hidden  = false;
            const dz2 = $('drop-zone-2');
            dz2.querySelector('.drop-hint').hidden = true;
            dz2.classList.add('has-image');
            updateImageInfo(2);
        }
        showStatus(`Изображение ${slot} загружено (${img.naturalWidth}×${img.naturalHeight} px)`, 'success');
        debouncedApply();
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
        debouncedApply();
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
    const { bottom, top } = getOrderedSources();
    if (!bottom || !top) {
        showStatus('Для этого режима нужны оба изображения.', 'info');
        return;
    }
    const W = Math.max(bottom.width,  top.width);
    const H = Math.max(bottom.height, top.height);

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
    const { bottom, top } = getOrderedSources();
    if (!bottom || !top) {
        showStatus('Для этого режима нужны оба изображения.', 'info');
        return;
    }
    const W = Math.max(bottom.width,  top.width);
    const H = Math.max(bottom.height, top.height);

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
    const { bottom, top } = getOrderedSources();
    if (!bottom || !top) {
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

    const out = window.BlendingEngine.blendImages(bottom.src, top.src, internalMode, opts);
    resultCanvas.width  = out.width;
    resultCanvas.height = out.height;
    resultCtx.drawImage(out, 0, 0);
}

/* ══════════════════════════════════════════════════
   Рендеринг: Double Exposure
══════════════════════════════════════════════════ */

function renderDoubleExposure() {
    const { bottom, top } = getOrderedSources();
    if (!bottom || !top) {
        showStatus('Для двойного экспонирования нужны оба изображения.', 'info');
        return;
    }
    const opts = { blendAmount: parseInt(blendAmountSlider.value, 10) };
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
    const W = Math.max(s1.width,  s2.width);
    const H = Math.max(s1.height, s2.height);

    resultCanvas.width  = W;
    resultCanvas.height = H;

    const pos = state.splitPos / 100;

    if (mode === 'split-v') {
        /* Вертикальный разделитель */
        const splitX = Math.round(W * pos);
        resultCtx.drawImage(s1.src, 0, 0, s1.width, s1.height);
        resultCtx.save();
        resultCtx.beginPath();
        resultCtx.rect(splitX, 0, W - splitX, H);
        resultCtx.clip();
        resultCtx.drawImage(s2.src, 0, 0, s2.width, s2.height);
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
        resultCtx.drawImage(s1.src, 0, 0, s1.width, s1.height);
        resultCtx.save();
        resultCtx.beginPath();
        resultCtx.rect(0, splitY, W, H - splitY);
        resultCtx.clip();
        resultCtx.drawImage(s2.src, 0, 0, s2.width, s2.height);
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
    state.scale1      = 1.0;
    state.scale2      = 1.0;
    state.orientation1 = 'auto';
    state.orientation2 = 'auto';
    state.layerOrder  = 'img1-top';

    /* Очищаем превью */
    [preview1, preview2].forEach(p => { p.src = ''; p.hidden = true; });
    [$('drop-zone-1'), $('drop-zone-2')].forEach(z => {
        z.querySelector('.drop-hint').hidden = false;
        z.classList.remove('has-image');
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

    /* Сбрасываем порядок слоёв */
    layerOrderRadios.forEach(r => {
        r.checked = r.value === 'img1-top';
    });
    localStorage.removeItem('layerOrder');

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
        debouncedApply();
    });
    scaleSlider2.addEventListener('input', () => {
        state.scale2 = parseInt(scaleSlider2.value, 10) / 100;
        scaleValue2.textContent = scaleSlider2.value + '%';
        debouncedApply();
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

    /* Кнопки выбора файла */
    uploadBtn1.addEventListener('click', e => {
        e.stopPropagation();
        fileInput1.click();
    });
    uploadBtn2.addEventListener('click', e => {
        e.stopPropagation();
        fileInput2.click();
    });

    /* Радио-кнопки порядка слоёв */
    layerOrderRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            state.layerOrder = radio.value;
            localStorage.setItem('layerOrder', state.layerOrder);
            if (state.image1 && state.image2) {
                debouncedApply();
            }
        });
    });

    /* Кнопка «Поменять местами» */
    swapLayersBtn.addEventListener('click', () => {
        /* Поменять изображения */
        const tempImg = state.image1;
        state.image1 = state.image2;
        state.image2 = tempImg;

        /* Поменять превью */
        const tempSrc = preview1.src;
        preview1.src  = preview2.src;
        preview2.src  = tempSrc;
        const tempHidden = preview1.hidden;
        preview1.hidden  = preview2.hidden;
        preview2.hidden  = tempHidden;

        /* Поменять классы has-image на drop-zone */
        const dz1HasImage = $('drop-zone-1').classList.contains('has-image');
        const dz2HasImage = $('drop-zone-2').classList.contains('has-image');
        $('drop-zone-1').classList.toggle('has-image', dz2HasImage);
        $('drop-zone-2').classList.toggle('has-image', dz1HasImage);

        /* Поменять видимость drop-hint */
        const hint1 = $('drop-zone-1').querySelector('.drop-hint');
        const hint2 = $('drop-zone-2').querySelector('.drop-hint');
        const hint1Hidden = hint1.hidden;
        hint1.hidden = hint2.hidden;
        hint2.hidden = hint1Hidden;

        /* Обновить информацию об изображениях */
        updateImageInfo(1);
        updateImageInfo(2);

        /* Применить изменения */
        if (state.image1 && state.image2) {
            debouncedApply();
        }

        /* Визуальная анимация */
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            swapLayersBtn.style.transition = 'transform 0.3s ease';
            swapLayersBtn.style.transform  = 'rotate(180deg)';
            setTimeout(() => {
                swapLayersBtn.style.transform = '';
                setTimeout(() => {
                    swapLayersBtn.style.transition = '';
                }, 300);
            }, 300);
        }
    });

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

    /* Начальная настройка */
    updateSliderVisibility();
    resultCanvas.width  = 800;
    resultCanvas.height = 500;
    drawPlaceholder();

    /* Восстановить порядок слоёв из localStorage */
    const savedLayerOrder = localStorage.getItem('layerOrder');
    if (savedLayerOrder) {
        state.layerOrder = savedLayerOrder;
        const savedRadio = document.querySelector(`input[name="layer-order"][value="${savedLayerOrder}"]`);
        if (savedRadio) savedRadio.checked = true;
    }
}

/* Запуск после полной загрузки DOM */
document.addEventListener('DOMContentLoaded', init);
