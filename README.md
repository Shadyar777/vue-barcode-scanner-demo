# Vue 3 Barcode Scanner Demo

Сканер штрихкодов на Vue 3 с доступом к камере через `getUserMedia` и распознаванием через `Barcode Detection API`.

## Live Demo

Example: https://shadyar777.github.io/vue-barcode-scanner-demo/

## Возможности

- Запуск и остановка камеры.
- Сканирование штрихкодов в реальном времени.
- Автопауза после первого успешного скана.
- История сканирований (с ограничением размера).
- Debug-метрики (`attempts`, `successfulScans`, timing `detect`).
- Защита от async race-condition при `start/pause/stop`.
- Throttled-цикл сканирования для снижения нагрузки на CPU.

## Стек

- Vue 3 (`script setup`, Composition API)
- TypeScript (strict mode)
- Vite 7
- Tailwind CSS 4

## Требования

- Node.js `^20.19.0 || >=22.12.0`
- Браузер с поддержкой:
  - `navigator.mediaDevices.getUserMedia`
  - `BarcodeDetector` (обычно Chromium-based)
- Разрешение на доступ к камере.
- Secure context (`https` или `localhost`).

## Локальный запуск

```sh
npm install
npm run dev
```

## Скрипты

- `npm run dev` - запуск dev-сервера
- `npm run dev:host` - запуск dev-сервера с `--host`
- `npm run type-check` - проверка типов
- `npm run build` - production build
- `npm run preview` - preview production build
- `npm run format` - форматирование
- `npm run format:check` - проверка форматирования


## Ограничения

- Если `BarcodeDetector` не поддерживается браузером, сканирование не запустится.
- Набор поддерживаемых форматов зависит от браузера и устройства.
