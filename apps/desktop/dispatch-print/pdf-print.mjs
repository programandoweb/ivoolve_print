try {
  const job = await window.dispatchPdf.load()
  const pdfjs = await import('./pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.mjs', location.href).href
  const doc = await pdfjs.getDocument({ data: new Uint8Array(job.bytes), isEvalSupported: false, useSystemFonts: true, disableAutoFetch: true, disableStream: true, standardFontDataUrl: new URL('./standard_fonts/', location.href).href, cMapUrl: new URL('./cmaps/', location.href).href, cMapPacked: true, wasmUrl: new URL('./wasm/', location.href).href, useWorkerFetch: true }).promise
  if (doc.numPages < 1 || doc.numPages > 20) throw Error('Cantidad de páginas no permitida.')
  const p = job.paper
  const width = p.orientation === 'landscape' ? p.heightMm : p.widthMm
  const height = p.orientation === 'landscape' ? p.widthMm : p.heightMm
  const left = p.source === 'custom' ? p.leftMm : 0; const right = p.source === 'custom' ? p.rightMm : 0
  const top = p.source === 'custom' ? p.topMm : 0; const bottom = p.source === 'custom' ? p.bottomMm : 0
  const usableWidth = width - left - right; const usableHeight = height - top - bottom
  const style = document.createElement('style'); style.textContent = `@page{size:${width}mm ${height}mm;margin:0}`; document.head.append(style)
  // Impresora térmica: el bitmap se genera a su resolución nativa (1 píxel = 1 punto) y en blanco/negro
  // puro, para que ni Chromium ni el driver reescalen ni tramen la imagen.
  const PRINTER_DPI = 203; const THRESHOLD = 160
  let scaled = false; let pixels = 0
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i); const original = page.getViewport({ scale: 1 })
    if (original.width * original.height > 4000000) throw Error('Página PDF demasiado grande.')
    const originalWidth = original.width * 25.4 / 72; const originalHeight = original.height * 25.4 / 72
    const fit = Math.min(1, usableWidth / originalWidth, usableHeight / originalHeight)
    if (fit < 0.99) scaled = true
    const displayWidth = originalWidth * fit; const displayHeight = originalHeight * fit
    const dotsWide = Math.max(1, Math.round(displayWidth / 25.4 * PRINTER_DPI)); const dotsHigh = Math.max(1, Math.round(displayHeight / 25.4 * PRINTER_DPI))
    const viewport = page.getViewport({ scale: dotsWide / original.width })
    pixels += Math.ceil(viewport.width) * Math.ceil(viewport.height)
    if (pixels > 40000000) throw Error('PDF demasiado grande para renderizar.')
    const sheet = document.createElement('section'); sheet.className = 'pdf-page'; sheet.style.width = width + 'mm'; sheet.style.height = height + 'mm'
    const canvas = document.createElement('canvas'); canvas.width = dotsWide; canvas.height = dotsHigh
    canvas.style.width = (dotsWide / PRINTER_DPI * 25.4) + 'mm'; canvas.style.height = (dotsHigh / PRINTER_DPI * 25.4) + 'mm'; canvas.style.imageRendering = 'pixelated'
    canvas.style.left = (left + (usableWidth - dotsWide / PRINTER_DPI * 25.4) / 2 + p.offsetXMm) + 'mm'; canvas.style.top = (top + p.offsetYMm) + 'mm'
    sheet.append(canvas); document.getElementById('pages').append(sheet)
    await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport, background: 'rgb(255,255,255)' }).promise
    const context = canvas.getContext('2d'); const image = context.getImageData(0, 0, canvas.width, canvas.height); const d = image.data
    for (let k = 0; k < d.length; k += 4) { const v = (d[k] * 299 + d[k + 1] * 587 + d[k + 2] * 114) / 1000 < THRESHOLD ? 0 : 255; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255 }
    context.putImageData(image, 0, 0)
    page.cleanup()
  }
  await document.fonts.ready
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  await window.dispatchPdf.ready({ ok: true, pages: doc.numPages, scaled })
} catch {
  await window.dispatchPdf.ready({ ok: false })
}
