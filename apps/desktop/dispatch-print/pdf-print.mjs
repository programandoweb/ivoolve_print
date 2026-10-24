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
  let scaled = false; let pixels = 0
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i); const original = page.getViewport({ scale: 1 })
    if (original.width * original.height > 4000000) throw Error('Página PDF demasiado grande.')
    const originalWidth = original.width * 25.4 / 72; const originalHeight = original.height * 25.4 / 72
    const fit = Math.min(1, usableWidth / originalWidth, usableHeight / originalHeight)
    if (fit < 0.99) scaled = true
    const displayWidth = originalWidth * fit; const displayHeight = originalHeight * fit
    const renderScale = Math.min(4, Math.max(1, (displayWidth * 300 / 25.4) / original.width))
    const viewport = page.getViewport({ scale: renderScale })
    pixels += Math.ceil(viewport.width) * Math.ceil(viewport.height)
    if (pixels > 40000000) throw Error('PDF demasiado grande para renderizar.')
    const sheet = document.createElement('section'); sheet.className = 'pdf-page'; sheet.style.width = width + 'mm'; sheet.style.height = height + 'mm'
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
    canvas.style.width = displayWidth + 'mm'; canvas.style.height = displayHeight + 'mm'
    canvas.style.left = (left + (usableWidth - displayWidth) / 2 + p.offsetXMm) + 'mm'; canvas.style.top = (top + p.offsetYMm) + 'mm'
    sheet.append(canvas); document.getElementById('pages').append(sheet)
    await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport, background: 'rgb(255,255,255)' }).promise
    page.cleanup()
  }
  await document.fonts.ready
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  await window.dispatchPdf.ready({ ok: true, pages: doc.numPages, scaled })
} catch {
  await window.dispatchPdf.ready({ ok: false })
}
