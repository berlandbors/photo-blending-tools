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
| **Масштабирование** | Независимое изменение размера каждой фотографии (10%–200%) |
| **Ориентация** | Автоопределение и ручной выбор альбомной/книжной ориентации |
| **Улучшенные слайдеры** | Точный контроль без случайных перескоков |
| **Скролл боковой панели** | Плавная прокрутка при большом количестве элементов управления |
| **Кнопки загрузки** | Явные кнопки для выбора файлов в дополнение к drag & drop |
| **Управление слоями** | Выбор порядка наложения изображений (какое сверху/снизу) |
| **Расширенные фильтры** | Насыщенность, Температура, Оттенок (Hue Shift) |
| **Эффекты** | Размытие, Резкость, Виньетирование, HDR, Зерно пленки |
| **Пресеты** | Быстрые настройки: Ч/Б, Сепия, Винтаж, Кино, Драма, Мечта, Гритти и др. |
| **Система табов** | Организация настроек по категориям: Базовые, Фильтры, Эффекты |

### 🚀 Новые возможности

- **Ресайзабельная панель** — изменяйте ширину боковой панели, сворачивайте её (состояние сохраняется)
- **Живой предпросмотр** — автоматическое применение изменений в реальном времени (переключатель ⚡)
- **Горячие клавиши** — быстрый доступ ко всем функциям (нажмите `?` для справки)
- **История (Undo/Redo)** — отмена и повтор до 20 шагов (Ctrl+Z / Ctrl+Shift+Z)
- **Режим сравнения** — визуальное сравнение «до/после» с ползунком (Space)
- **Пресеты** — сохраняйте и применяйте любимые комбинации настроек
- **Zoom & Pan** — масштабирование колесиком мыши и перемещение (Space + drag)
- **Поиск режимов** — быстрый фильтр по названию режима смешивания
- **Избранные режимы** — отмечайте часто используемые режимы (двойной клик)
- **Анимации** — плавные переходы и микроинтеракции

### ⌨️ Горячие клавиши

| Клавиша | Действие |
|---------|----------|
| `Ctrl+O` | Загрузить изображение 1 |
| `Ctrl+Shift+O` | Загрузить изображение 2 |
| `Ctrl+S` | Сохранить PNG |
| `Ctrl+Shift+S` | Сохранить JPEG |
| `Ctrl+Z` | Отменить |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Повторить |
| `Space` (hold + drag) | Перемещение (pan) |
| `Space` (tap) | Режим сравнения До/После |
| `R` | Сброс настроек |
| `L` | Живой предпросмотр вкл/выкл |
| `C` | Свернуть/развернуть панель |
| `↑` / `↓` | Переключить режим смешивания |
| `?` | Показать справку |

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
3. Выберите **режим смешивания** из выпадающего списка.
4. Настройте параметры с помощью **слайдеров** (прозрачность, яркость, контраст, интенсивность).
5. **Настройте изображения** (опционально):
   - **Масштаб** — измените размер каждой фотографии от 10% до 200%
   - **Ориентация** — поверните изображение для альбомной или книжной компоновки
   - Размеры и ориентация изображения отображаются под зоной загрузки
6. Нажмите **✨ Применить**.
7. Скачайте результат в **PNG** или **JPEG**.

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
- **Post-processing** — brightness & contrast adjustment
- **Advanced Filters** — Saturation, Temperature, Hue Shift
- **Effects** — Blur, Sharpness, Vignette, HDR, Film Grain
- **Presets** — quick-apply filter/effect combinations (B&W, Sepia, Vintage, Cinema, Drama, etc.)
- **Tab system** — layer settings organized by category: Basic, Filters, Effects
- **Scaling** — independent resize of each photo (10%–200%)
- **Orientation** — auto-detection and manual selection of landscape/portrait
- **Resizable panel** — drag to resize or collapse the sidebar
- **Live Preview** — auto-apply changes in real-time (⚡ toggle)
- **Keyboard Shortcuts** — quick access to all features (press `?` for help)
- **Undo/Redo** — history of up to 20 steps (Ctrl+Z / Ctrl+Shift+Z)
- **Comparison Mode** — before/after split slider (Space)
- **Presets** — save and recall favourite setting combinations
- **Zoom & Pan** — mouse-wheel zoom and Space+drag pan
- **Mode Search** — filter blend modes by name
- **Favourite Modes** — double-click an option to star it

### Usage
1. Open `index.html` in a modern browser.
2. Upload two images (drag & drop or click).
3. Choose a blend mode and adjust sliders.
4. Optionally adjust **scale** (10–200%) and **orientation** (Auto / Landscape / Portrait) per image.
5. Click **Apply** (or enable Live Preview for instant updates) and download as PNG or JPEG.

### License
MIT