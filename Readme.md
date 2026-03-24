# DigitalPOS Labels

Aplicación de escritorio para impresión manual de etiquetas mixtas en **Windows** usando **Electron**, impresora **USB** y **driver nativo de Windows**.

El proyecto fue pensado para trabajar con una impresora térmica tipo:

- **Marca:** Digital POS
- **Modelo:** DG-2406T PRO

---

## Objetivo

Permitir la impresión manual de etiquetas térmicas a partir de un **payload JSON editable**, con:

- selección de impresora instalada en Windows
- vista previa de la etiqueta
- botón manual de impresión
- soporte para diseño mixto
- soporte para código de barras
- posibilidad de cambiar el JSON sin recompilar

---

## Stack técnico

- **Node.js**
- **Electron**
- **electron-builder**
- **bwip-js**
- **jsbarcode**
- **electron-store**

---

## Características

- Aplicación de escritorio ejecutable para Windows
- Detección de impresoras registradas por el sistema operativo
- Impresión silenciosa usando el nombre exacto de la impresora
- Etiquetas parametrizadas en milímetros
- Márgenes configurables
- Vista previa local antes de imprimir
- Carga de JSON desde archivo
- Persistencia del último payload usado
- Persistencia de la última impresora seleccionada

---

## Requisitos

### Software

- **Node.js 18+** recomendado
- **npm 9+**
- **Windows** con la impresora instalada correctamente
- Driver oficial o funcional de la impresora en Windows

### Hardware

- Impresora térmica conectada por **USB**
- En este caso se tomó como referencia una **Digital POS DG-2406T PRO**

---

## Instalación

Clonar o descomprimir el proyecto y luego ejecutar:

```bash
npm install