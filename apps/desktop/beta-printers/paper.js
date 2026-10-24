const defaults = (label = '') => ({
  source: 'driver', widthMm: 101.6, heightMm: 101.6, orientation: 'portrait',
  topMm: 0, rightMm: 0, bottomMm: 0, leftMm: 0, offsetXMm: 0, offsetYMm: 0,
  exposedLeftMm: 1.3, exposedRightMm: 1.3,
  ...(label.trim().toLocaleLowerCase() === 'membretes' ? { widthMm: 101, heightMm: 24, exposedLeftMm: 1, exposedRightMm: 1 } : {}),
})
const keys = Object.keys(defaults())
const px = mm => Math.round(mm * 96 / 25.4 * 1e6) / 1e6
// Driver 'Vertical' does not imply width < height (Membretes is 101 × 24 mm).
const dimensions = p => p.orientation === 'landscape' ? { width: p.heightMm, height: p.widthMm } : { width: p.widthMm, height: p.heightMm }
function profilePaper(profile) {
  if (!profile.paper) return defaults(profile.label)
  const oldDefault = defaults()
  const isUntouched = !profile.paperCustomized && keys.every(key => profile.paper[key] === oldDefault[key])
  return isUntouched ? defaults(profile.label) : profile.paper
}
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
function validPaper(p) {
  return p && typeof p === 'object' && !Array.isArray(p) && Object.keys(p).length === keys.length && Object.keys(p).every(k => keys.includes(k)) &&
    ['driver', 'custom'].includes(p.source) && ['portrait', 'landscape'].includes(p.orientation) &&
    number(p.widthMm, 5, 1000) && number(p.heightMm, 5, 2000) &&
    ['topMm', 'rightMm', 'bottomMm', 'leftMm', 'exposedLeftMm', 'exposedRightMm'].every(k => number(p[k], 0, 100)) &&
    number(p.offsetXMm, -20, 20) && number(p.offsetYMm, -20, 20) &&
    p.leftMm + p.rightMm < dimensions(p).width && p.topMm + p.bottomMm < dimensions(p).height && p.exposedLeftMm + p.exposedRightMm < p.widthMm
}
function settings(value) {
  const p = value ?? defaults()
  if (!validPaper(p)) throw Error('Papel: revise medidas, márgenes y calibración del perfil.')
  return p
}
function paperOptions(value, silent = false) {
  const p = settings(value)
  // Dialog/default jobs preserve existing options; silent jobs explicitly use that queue's paper.
  if (p.source === 'driver') return silent ? { usePrinterDefaultPageSize: true } : {}
  return {
    pageSize: { width: Math.round(p.widthMm * 1000), height: Math.round(p.heightMm * 1000) },
    landscape: p.orientation === 'landscape', scaleFactor: 100,
    margins: { marginType: 'custom', top: px(p.topMm), right: px(p.rightMm), bottom: px(p.bottomMm), left: px(p.leftMm) },
  }
}
function paperCss(value) {
  const p = settings(value)
  const size = p.source === 'custom' ? `@page { size: ${dimensions(p).width}mm ${dimensions(p).height}mm !important; }` : ''
  const offset = p.offsetXMm || p.offsetYMm ? `body { position: relative !important; left: ${p.offsetXMm}mm !important; top: ${p.offsetYMm}mm !important; }` : ''
  return size || offset ? `@media print { ${size} ${offset} }` : ''
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function calibrationHtml(paper, label) {
  const p = settings(paper)
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>
    @page{margin:0}*{box-sizing:border-box}body{margin:0;padding:2mm;font:9pt sans-serif}h1{font-size:11pt;margin:0 0 2mm}p{margin:1mm 0;overflow-wrap:anywhere}.ruler{width:20mm;height:20mm;border:0.3mm solid black;margin:3mm 0;position:relative}.ruler:before{content:'';position:absolute;left:9.7mm;top:0;height:100%;border-left:0.2mm solid black}.ruler:after{content:'';position:absolute;top:9.7mm;left:0;width:100%;border-top:0.2mm solid black}${paperCss(p)}
    </style></head><body><h1>Calibración · ${escape(label)}</h1><p>${p.source === 'driver' ? 'Papel según Windows (medidas reales a verificar en el driver)' : `${p.widthMm} × ${p.heightMm} mm · ${p.orientation === 'portrait' ? 'Vertical' : 'Horizontal'}`}</p><div class="ruler"></div><p>Cuadro de referencia: 20 × 20 mm</p><p>Desplazamiento X: ${p.offsetXMm} mm · Y: ${p.offsetYMm} mm</p></body></html>`
}
module.exports = { defaults, profilePaper, validPaper, paperOptions, paperCss, calibrationHtml }
