# Photo Blending Tools 🎨📸

> **RU** | [EN](#english)

Полнофункциональный веб-инструмент для смешивания и слияния фотографий прямо в браузере — без установки, без серверов.

---

## Возможности

| Категория | Что умеет |
|-----------|-----------|
| **Коллаж** | Горизонтальный, вертикальный, сетка 2×2 и 3×3 |
| **Прозрачность** | Наложение с регулируемой opacity 0–100 % |
| **CSS Blend Modes** | Все 16 режимов: Multiply, Screen, Overlay, Difference… |
| **Canvas Blending** | Попиксельные алгоритмы (см. ниже) |
| **Double Exposure** | Художественное двойное экспонирование |
| **Split Screen** | Вертикальный / горизонтальный разделитель |
| **Управление слоями** | Выбор порядка наложения (1 сверху, 2 сверху, авто) |
| **Удобная загрузка** | Явные кнопки «📂 Выбрать файл» + drag & drop |
| **Прокручиваемая панель** | Стилизованный скроллбар для большого числа настроек |
| **Масштабирование** | Независимое изменение размера каждой фотографии (10%–200%) |
| **Ориентация** | Автоопределение и ручной выбор альбомной/книжной ориентации |
| **Улучшенные слайдеры** | Точный контроль без случайных перескоков |

### Canvas Blending — алгоритмы

| Режим | Формула |
|-------|---------|
| Average | `(A + B) / 2` |
| Additive | `min(255, A + B)` |
| Multiply | `(A × B) / 255` |
| Screen | `255 − (255−A)(255−B)/255` |
| Overlay | `A < 128 ? 2AB/255 : 255 − 2(255−A)(255−B)/255` |
| Difference | `|A − B|` |
| Lighten Only | `max(A, B)` |
| Darken Only | `min(A, B)` |
| Luminosity Blend | Цвет img1 + яркость img2 |
| Gradient Horizontal | Линейный переход слева→направо |
| Gradient Vertical | Линейный переход сверху→вниз |
| Gradient Radial | Радиальный переход от центра |
| Chroma Key | Удаление зелёного фона |

---

## Как использовать

1. Откройте `index.html` в любом современном браузере (Chrome, Firefox, Edge, Safari).
2. Загрузите **два изображения** (перетащите или нажмите на зоны загрузки).  
   Поддерживаемые форматы: **JPG, PNG, GIF, WebP** — до **10 МБ** каждый.
3. **Управление изображениями**:
   - Нажмите **«📂 Выбрать файл»** или перетащите изображение в зону загрузки
   - Выберите **порядок слоёв** — какое изображение будет сверху
   - Используйте **«⇅ Поменять местами»** для быстрой смены
4. Выберите **режим смешивания** из выпадающего списка.
5. Настройте параметры с помощью **слайдеров** (прозрачность, яркость, контраст, интенсивность).
6. **Настройте изображения** (опционально):
   - **Масштаб** — измените размер каждой фотографии от 10% до 200%
   - **Ориентация** — поверните изображение для альбомной или книжной компоновки
   - Размеры и ориентация изображения отображаются под зоной загрузки
7. Нажмите **✨ Применить**.
8. Скачайте результат в **PNG** или **JPEG**.

---

## Структура файлов

```
photo-blending-tools/
├── index.html     — главная страница (семантическая разметка, aria-labels)
├── styles.css     — стили (CSS Grid/Flexbox, тёмная тема, responsive)
├── app.js         — основная логика (drag & drop, UI, экспорт)
├── blending.js    — алгоритмы попиксельного смешивания
└── README.md
```

---

## Технические детали

- **Чистый HTML/CSS/JS** — без зависимостей, без сборщиков
- **Canvas API** — попиксельная обработка через `getImageData` / `putImageData`
- **ES6+** — стрелочные функции, деструктуризация, `const/let`
- **Debounce** — плавный предпросмотр в реальном времени
- **Accessibility** — `aria-label`, `role`, `tabindex`, клавиатурная навигация
- **Responsive** — работает на мобильных (включая touch для Split Screen)
- **Постобработка** — яркость и контраст применяются поверх любого режима

---

## Браузерная совместимость

| Браузер | Версия |
|---------|--------|
| Chrome / Edge | 90+ |
| Firefox | 88+ |
| Safari | 14+ |
| Opera | 76+ |

---

## Лицензия

[MIT](LICENSE)

---

<a name="english"></a>

## English

A fully-featured browser-based photo blending tool — no installation required.

### Features
- **Collage** — horizontal, vertical, 2×2 and 3×3 grids
- **Opacity Blend** — adjustable transparency overlay
- **CSS Blend Modes** — all 16 standard modes
- **Canvas Pixel Blending** — 13 custom algorithms (Average, Additive, Multiply, Screen, Overlay, Difference, Lighten Only, Darken Only, Luminosity, Gradient H/V/Radial, Chroma Key)
- **Double Exposure** — artistic double exposure effect
- **Split Screen** — draggable vertical / horizontal divider
- **Layer Order** — choose which image is on top (Image 1, Image 2, or Auto)
- **File selection buttons** — explicit «📂 Choose file» buttons + drag & drop
- **Scrollable panel** — styled scrollbar for many controls
- **Post-processing** — brightness & contrast adjustment
- **Scaling** — independent resize of each photo (10%–200%)
- **Orientation** — auto-detection and manual selection of landscape/portrait
- **Improved sliders** — no accidental jumps when clicking on the track

### Usage
1. Open `index.html` in a modern browser.
2. Upload two images via **«📂 Choose file»** buttons, drag & drop, or click the drop zones.
3. Choose a **layer order** — which image should be on top — and use **«⇅ Swap»** to quickly switch.
4. Choose a blend mode and adjust sliders.
5. Optionally adjust **scale** (10–200%) and **orientation** (Auto / Landscape / Portrait) per image.
6. Click **Apply** and download as PNG or JPEG.

### License
MIT