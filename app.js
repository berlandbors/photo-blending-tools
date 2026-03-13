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

const applyBtn       = $('apply-btn');
const downloadPngBtn = $('download-png');
const downloadJpgBtn = $('download-jpg');
const resetBtn       = $('reset-btn');

const resultCanvas   = $('result-canvas');
const resultCtx      = resultCanvas.getContext('2d');
const splitHandle    = $('split-handle');
const loadingOverlay = $('loading-overlay');
const statusMsg      = $('status-message');

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
        } else {
            state.image2 = img;
            preview2.src     = img.src;
            preview2.hidden  = false;
            $('drop-zone-2').querySelector('.drop-hint').hidden = true;
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
    const imgs = [state.image1, state.image2].filter(Boolean);
    if (imgs.length === 0) return;

    const CELL_W = 600;
    const CELL_H = 450;

    switch (mode) {
        case 'collage-h': {
            resultCanvas.width  = CELL_W * imgs.length;
            resultCanvas.height = CELL_H;
            imgs.forEach((img, i) => {
                resultCtx.drawImage(img, i * CELL_W, 0, CELL_W, CELL_H);
            });
            break;
        }
        case 'collage-v': {
            resultCanvas.width  = CELL_W;
            resultCanvas.height = CELL_H * imgs.length;
            imgs.forEach((img, i) => {
                resultCtx.drawImage(img, 0, i * CELL_H, CELL_W, CELL_H);
            });
            break;
        }
        case 'collage-grid2': {
            /* 2×2: нужны 2 изображения — клонируем */
            const cells = [imgs[0], imgs[1] || imgs[0], imgs[1] || imgs[0], imgs[0]];
            resultCanvas.width  = CELL_W * 2;
            resultCanvas.height = CELL_H * 2;
            cells.forEach((img, i) => {
                const col = i % 2;
                const row = Math.floor(i / 2);
                resultCtx.drawImage(img, col * CELL_W, row * CELL_H, CELL_W, CELL_H);
            });
            break;
        }
        case 'collage-grid3': {
            /* 3×3: заполняем чередованием */
            resultCanvas.width  = CELL_W * 3;
            resultCanvas.height = CELL_H * 3;
            for (let i = 0; i < 9; i++) {
                const img = imgs[i % imgs.length];
                const col = i % 3;
                const row = Math.floor(i / 3);
                resultCtx.drawImage(img, col * CELL_W, row * CELL_H, CELL_W, CELL_H);
            }
            break;
        }
    }
}

/* ══════════════════════════════════════════════════
   Рендеринг: Прозрачность
══════════════════════════════════════════════════ */

function renderOpacity() {
    const img1 = state.image1;
    const img2 = state.image2;
    if (!img1 || !img2) {
        showStatus('Для этого режима нужны оба изображения.', 'info');
        return;
    }
    const W = Math.max(img1.naturalWidth,  img2.naturalWidth);
    const H = Math.max(img1.naturalHeight, img2.naturalHeight);

    resultCanvas.width  = W;
    resultCanvas.height = H;

    resultCtx.drawImage(img1, 0, 0, W, H);

    const alpha = parseInt(opacitySlider.value, 10) / 100;
    resultCtx.globalAlpha = alpha;
    resultCtx.drawImage(img2, 0, 0, W, H);
    resultCtx.globalAlpha = 1;
}

/* ══════════════════════════════════════════════════
   Рендеринг: CSS Blend Modes
══════════════════════════════════════════════════ */

function renderCSSBlend(mode) {
    const img1 = state.image1;
    const img2 = state.image2;
    if (!img1 || !img2) {
        showStatus('Для этого режима нужны оба изображения.', 'info');
        return;
    }
    const W = Math.max(img1.naturalWidth,  img2.naturalWidth);
    const H = Math.max(img1.naturalHeight, img2.naturalHeight);

    resultCanvas.width  = W;
    resultCanvas.height = H;

    resultCtx.drawImage(img1, 0, 0, W, H);
    resultCtx.globalCompositeOperation = mode;
    resultCtx.drawImage(img2, 0, 0, W, H);
    resultCtx.globalCompositeOperation = 'source-over';
}

/* ══════════════════════════════════════════════════
   Рендеринг: Canvas попиксельное смешивание
══════════════════════════════════════════════════ */

function renderCanvasBlend(mode) {
    const img1 = state.image1;
    const img2 = state.image2;
    if (!img1 || !img2) {
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

    const out = window.BlendingEngine.blendImages(img1, img2, internalMode, opts);
    resultCanvas.width  = out.width;
    resultCanvas.height = out.height;
    resultCtx.drawImage(out, 0, 0);
}

/* ══════════════════════════════════════════════════
   Рендеринг: Double Exposure
══════════════════════════════════════════════════ */

function renderDoubleExposure() {
    const img1 = state.image1;
    const img2 = state.image2;
    if (!img1 || !img2) {
        showStatus('Для двойного экспонирования нужны оба изображения.', 'info');
        return;
    }
    const opts = { blendAmount: parseInt(blendAmountSlider.value, 10) };
    const out  = window.BlendingEngine.doubleExposure(img1, img2, opts);
    resultCanvas.width  = out.width;
    resultCanvas.height = out.height;
    resultCtx.drawImage(out, 0, 0);
}

/* ══════════════════════════════════════════════════
   Рендеринг: Split Screen
══════════════════════════════════════════════════ */

function renderSplitScreen(mode) {
    const img1 = state.image1;
    const img2 = state.image2;
    if (!img1 || !img2) {
        showStatus('Для Split Screen нужны оба изображения.', 'info');
        return;
    }
    const W = Math.max(img1.naturalWidth,  img2.naturalWidth);
    const H = Math.max(img1.naturalHeight, img2.naturalHeight);

    resultCanvas.width  = W;
    resultCanvas.height = H;

    const pos = state.splitPos / 100;

    if (mode === 'split-v') {
        /* Вертикальный разделитель */
        const splitX = Math.round(W * pos);
        resultCtx.drawImage(img1, 0, 0, W, H);
        resultCtx.save();
        resultCtx.beginPath();
        resultCtx.rect(splitX, 0, W - splitX, H);
        resultCtx.clip();
        resultCtx.drawImage(img2, 0, 0, W, H);
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
        resultCtx.drawImage(img1, 0, 0, W, H);
        resultCtx.save();
        resultCtx.beginPath();
        resultCtx.rect(0, splitY, W, H - splitY);
        resultCtx.clip();
        resultCtx.drawImage(img2, 0, 0, W, H);
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
    state.image1   = null;
    state.image2   = null;
    state.splitPos = 50;

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
    opacityValue.textContent    = '50%';
    brightnessValue.textContent = '0';
    contrastValue.textContent   = '100%';
    blendAmountValue.textContent = '100%';

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
}

/* Запуск после полной загрузки DOM */
document.addEventListener('DOMContentLoaded', init);
