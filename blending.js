/**
 * blending.js — алгоритмы попиксельного смешивания изображений через Canvas API
 *
 * Поддерживаемые режимы:
 *   Базовые:  average, additive, multiply, screen, overlay, difference
 *   Продвинутые: gradient-h, gradient-v, gradient-radial,
 *                luminosity, lighten-only, darken-only, chroma-key
 */

'use strict';

/* ─────────────── Вспомогательные утилиты ─────────────── */

/**
 * Зажать значение в диапазоне [0, 255]
 * @param {number} v
 * @returns {number}
 */
function clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Яркость пикселя по формуле BT.601
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number} 0–255
 */
function luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

/* ─────────────── Базовые алгоритмы ─────────────── */

/**
 * Average — усреднение цветов двух пикселей
 */
function blendAverage(r1, g1, b1, r2, g2, b2) {
    return {
        r: (r1 + r2) >> 1,
        g: (g1 + g2) >> 1,
        b: (b1 + b2) >> 1,
    };
}

/**
 * Additive — сложение с ограничением до 255
 */
function blendAdditive(r1, g1, b1, r2, g2, b2) {
    return {
        r: clamp(r1 + r2),
        g: clamp(g1 + g2),
        b: clamp(b1 + b2),
    };
}

/**
 * Multiply — умножение (нормализованное к [0,255])
 */
function blendMultiply(r1, g1, b1, r2, g2, b2) {
    return {
        r: (r1 * r2) / 255 | 0,
        g: (g1 * g2) / 255 | 0,
        b: (b1 * b2) / 255 | 0,
    };
}

/**
 * Screen — осветление
 */
function blendScreen(r1, g1, b1, r2, g2, b2) {
    return {
        r: 255 - (((255 - r1) * (255 - r2)) / 255 | 0),
        g: 255 - (((255 - g1) * (255 - g2)) / 255 | 0),
        b: 255 - (((255 - b1) * (255 - b2)) / 255 | 0),
    };
}

/**
 * Overlay — наложение с контрастом (зависит от базового цвета)
 */
function blendOverlay(r1, g1, b1, r2, g2, b2) {
    return {
        r: r1 < 128
            ? (2 * r1 * r2) / 255 | 0
            : 255 - (2 * (255 - r1) * (255 - r2) / 255 | 0),
        g: g1 < 128
            ? (2 * g1 * g2) / 255 | 0
            : 255 - (2 * (255 - g1) * (255 - g2) / 255 | 0),
        b: b1 < 128
            ? (2 * b1 * b2) / 255 | 0
            : 255 - (2 * (255 - b1) * (255 - b2) / 255 | 0),
    };
}

/**
 * Difference — абсолютная разница
 */
function blendDifference(r1, g1, b1, r2, g2, b2) {
    return {
        r: Math.abs(r1 - r2),
        g: Math.abs(g1 - g2),
        b: Math.abs(b1 - b2),
    };
}

/* ─────────────── Продвинутые режимы ─────────────── */

/**
 * Lighten Only — выбирает более светлый пиксель покомпонентно
 */
function blendLightenOnly(r1, g1, b1, r2, g2, b2) {
    return {
        r: Math.max(r1, r2),
        g: Math.max(g1, g2),
        b: Math.max(b1, b2),
    };
}

/**
 * Darken Only — выбирает более тёмный пиксель покомпонентно
 */
function blendDarkenOnly(r1, g1, b1, r2, g2, b2) {
    return {
        r: Math.min(r1, r2),
        g: Math.min(g1, g2),
        b: Math.min(b1, b2),
    };
}

/**
 * Luminosity Blend — смешивание по яркости:
 * использует цвет первого изображения, но яркость второго.
 */
function blendLuminosity(r1, g1, b1, r2, g2, b2) {
    const lum1 = luminance(r1, g1, b1);
    const lum2 = luminance(r2, g2, b2);
    const delta = lum2 - lum1;
    return {
        r: clamp(r1 + delta),
        g: clamp(g1 + delta),
        b: clamp(b1 + delta),
    };
}

/* ─────────────── Градиентные маски ─────────────── */

/**
 * Gradient Horizontal — плавный переход слева (img1) направо (img2)
 * @param {number} x    — координата пикселя
 * @param {number} w    — ширина холста
 */
function blendGradientH(r1, g1, b1, r2, g2, b2, x, w) {
    const t = x / (w - 1 || 1);
    const s = 1 - t;
    return {
        r: clamp(r1 * s + r2 * t),
        g: clamp(g1 * s + g2 * t),
        b: clamp(b1 * s + b2 * t),
    };
}

/**
 * Gradient Vertical — плавный переход сверху (img1) вниз (img2)
 * @param {number} y    — координата пикселя
 * @param {number} h    — высота холста
 */
function blendGradientV(r1, g1, b1, r2, g2, b2, y, h) {
    const t = y / (h - 1 || 1);
    const s = 1 - t;
    return {
        r: clamp(r1 * s + r2 * t),
        g: clamp(g1 * s + g2 * t),
        b: clamp(b1 * s + b2 * t),
    };
}

/**
 * Gradient Radial — img1 в центре, img2 по краям
 * @param {number} x, y   — координаты пикселя
 * @param {number} w, h   — размеры холста
 */
function blendGradientRadial(r1, g1, b1, r2, g2, b2, x, y, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    const t = Math.min(dist / maxDist, 1);
    const s = 1 - t;
    return {
        r: clamp(r1 * s + r2 * t),
        g: clamp(g1 * s + g2 * t),
        b: clamp(b1 * s + b2 * t),
    };
}

/* ─────────────── Chroma Key ─────────────── */

/**
 * Chroma Key (Green Screen) — заменяет зелёный фон первого изображения вторым.
 * @param {object} options  — { threshold: 100 }
 */
function blendChromaKey(r1, g1, b1, r2, g2, b2, options) {
    const threshold = (options && options.threshold) || 80;
    const isGreen = g1 > threshold && g1 > r1 * 1.2 && g1 > b1 * 1.2;
    return isGreen
        ? { r: r2, g: g2, b: b2 }
        : { r: r1, g: g1, b: b1 };
}

/* ─────────────── Главный диспетчер ─────────────── */

/**
 * Применить заданный режим смешивания к паре значений RGBA одного пикселя.
 *
 * @param {string} mode
 * @param {number} r1, g1, b1  — каналы пикселя из первого изображения
 * @param {number} r2, g2, b2  — каналы пикселя из второго изображения
 * @param {object} ctx         — контекст: { x, y, w, h, options }
 * @returns {{ r, g, b }}
 */
function applyBlendMode(mode, r1, g1, b1, r2, g2, b2, ctx) {
    switch (mode) {
        case 'average':         return blendAverage(r1, g1, b1, r2, g2, b2);
        case 'additive':        return blendAdditive(r1, g1, b1, r2, g2, b2);
        case 'multiply':        return blendMultiply(r1, g1, b1, r2, g2, b2);
        case 'screen':          return blendScreen(r1, g1, b1, r2, g2, b2);
        case 'overlay':         return blendOverlay(r1, g1, b1, r2, g2, b2);
        case 'difference':      return blendDifference(r1, g1, b1, r2, g2, b2);
        case 'lighten-only':    return blendLightenOnly(r1, g1, b1, r2, g2, b2);
        case 'darken-only':     return blendDarkenOnly(r1, g1, b1, r2, g2, b2);
        case 'luminosity-blend':return blendLuminosity(r1, g1, b1, r2, g2, b2);
        case 'gradient-h':      return blendGradientH(r1, g1, b1, r2, g2, b2, ctx.x, ctx.w);
        case 'gradient-v':      return blendGradientV(r1, g1, b1, r2, g2, b2, ctx.y, ctx.h);
        case 'gradient-radial': return blendGradientRadial(r1, g1, b1, r2, g2, b2, ctx.x, ctx.y, ctx.w, ctx.h);
        case 'chroma-key':      return blendChromaKey(r1, g1, b1, r2, g2, b2, ctx.options);
        default:                return blendAverage(r1, g1, b1, r2, g2, b2);
    }
}

/* ─────────────── Основная функция ─────────────── */

/**
 * Смешать два HTMLImageElement (или HTMLCanvasElement) попиксельно.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} img1
 * @param {HTMLImageElement|HTMLCanvasElement} img2
 * @param {string} mode   — режим из списка выше
 * @param {object} [opts] — дополнительные параметры { threshold, blendAmount }
 * @returns {HTMLCanvasElement}  — холст с результатом
 */
function blendImages(img1, img2, mode, opts = {}) {
    const W = Math.max(img1.width || img1.naturalWidth, img2.width || img2.naturalWidth);
    const H = Math.max(img1.height || img1.naturalHeight, img2.height || img2.naturalHeight);

    const offscreen = document.createElement('canvas');
    offscreen.width  = W;
    offscreen.height = H;
    const c = offscreen.getContext('2d');

    /* Считываем пиксели первого изображения */
    c.drawImage(img1, 0, 0, W, H);
    const data1 = c.getImageData(0, 0, W, H).data;

    /* Считываем пиксели второго изображения */
    c.clearRect(0, 0, W, H);
    c.drawImage(img2, 0, 0, W, H);
    const data2 = c.getImageData(0, 0, W, H).data;

    /* Создаём результирующий ImageData */
    const result = c.createImageData(W, H);
    const out    = result.data;

    const blendAmount = opts.blendAmount !== undefined ? opts.blendAmount / 100 : 1;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;

            const r1 = data1[i],     g1 = data1[i + 1], b1 = data1[i + 2];
            const r2 = data2[i],     g2 = data2[i + 1], b2 = data2[i + 2];

            const px = applyBlendMode(mode, r1, g1, b1, r2, g2, b2, { x, y, w: W, h: H, options: opts });

            /* Если blendAmount < 1 — интерполируем между img1 и результатом */
            out[i]     = clamp(r1 + (px.r - r1) * blendAmount);
            out[i + 1] = clamp(g1 + (px.g - g1) * blendAmount);
            out[i + 2] = clamp(b1 + (px.b - b1) * blendAmount);
            out[i + 3] = 255;
        }
    }

    c.putImageData(result, 0, 0);
    return offscreen;
}

/* ─────────────── Double Exposure ─────────────── */

/**
 * Double Exposure — художественное двойное экспонирование:
 * Screen + усиление контраста первого изображения.
 *
 * @param {HTMLImageElement} img1
 * @param {HTMLImageElement} img2
 * @param {object} [opts] — { blendAmount }
 * @returns {HTMLCanvasElement}
 */
function doubleExposure(img1, img2, opts = {}) {
    const W = Math.max(img1.naturalWidth  || img1.width,  img2.naturalWidth  || img2.width);
    const H = Math.max(img1.naturalHeight || img1.height, img2.naturalHeight || img2.height);

    const offscreen = document.createElement('canvas');
    offscreen.width  = W;
    offscreen.height = H;
    const c = offscreen.getContext('2d');

    /* Шаг 1 — рисуем img1 с повышенным контрастом через filter */
    c.filter = 'contrast(150%) grayscale(50%)';
    c.drawImage(img1, 0, 0, W, H);
    c.filter = 'none';
    const data1 = c.getImageData(0, 0, W, H).data;

    /* Шаг 2 — считываем img2 */
    c.clearRect(0, 0, W, H);
    c.drawImage(img2, 0, 0, W, H);
    const data2 = c.getImageData(0, 0, W, H).data;

    const result = c.createImageData(W, H);
    const out    = result.data;
    const amount = opts.blendAmount !== undefined ? opts.blendAmount / 100 : 1;

    for (let i = 0; i < data1.length; i += 4) {
        const r1 = data1[i], g1 = data1[i + 1], b1 = data1[i + 2];
        const r2 = data2[i], g2 = data2[i + 1], b2 = data2[i + 2];
        const sc = blendScreen(r1, g1, b1, r2, g2, b2);
        out[i]     = clamp(r1 + (sc.r - r1) * amount);
        out[i + 1] = clamp(g1 + (sc.g - g1) * amount);
        out[i + 2] = clamp(b1 + (sc.b - b1) * amount);
        out[i + 3] = 255;
    }

    c.putImageData(result, 0, 0);
    return offscreen;
}

/* ─────────────── Постобработка (яркость / контраст) ─────────────── */

/**
 * Применить яркость и контраст к холсту (in-place).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} brightness  — от -100 до +100
 * @param {number} contrast    — от 0 до 200 (100 = без изменений)
 */
function applyBrightnessContrast(canvas, brightness, contrast) {
    const ctx   = canvas.getContext('2d');
    const W     = canvas.width;
    const H     = canvas.height;
    const img   = ctx.getImageData(0, 0, W, H);
    const d     = img.data;

    /* Нормализуем: brightness ∈ [-1, 1], contrast ∈ [0, 2] */
    const bAdj = brightness / 100;
    const cAdj = contrast   / 100;

    for (let i = 0; i < d.length; i += 4) {
        for (let ch = 0; ch < 3; ch++) {
            /* Яркость */
            let v = d[i + ch] / 255 + bAdj;
            /* Контраст вокруг середины (0.5) */
            v = (v - 0.5) * cAdj + 0.5;
            d[i + ch] = clamp(v * 255 | 0);
        }
    }
    ctx.putImageData(img, 0, 0);
}

/* ─────────────── Экспорт ─────────────── */

/* Сделать функции доступными глобально (модуль без сборщика) */
window.BlendingEngine = {
    blendImages,
    doubleExposure,
    applyBrightnessContrast,
    applyBlendMode,
};
