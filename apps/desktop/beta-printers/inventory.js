const { execFile } = require('node:child_process')
const path = require('node:path')
// Fixed script: no user strings, interpolation, shell, driver writes or elevation.
const script = `Get-CimInstance -ClassName Win32_Printer -ErrorAction Stop | Select-Object Name,DriverName,PortName,PNPDeviceID,PrinterStatus,WorkOffline | ConvertTo-Json -Compress`
function windowsInventory() {
  return new Promise((resolve, reject) => {
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    execFile(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' + script],
      { timeout: 8000, maxBuffer: 1024 * 1024, windowsHide: true, encoding: 'utf8' }, (error, stdout) => {
        if (error) return reject(Error('Windows no entregó metadatos CIM; revise permisos o disponibilidad de PowerShell.'))
        try { const data = JSON.parse(stdout.replace(/^\uFEFF/, '') || '[]'); resolve(Array.isArray(data) ? data : [data]) } catch { reject(Error('Respuesta CIM inválida.')) }
      })
  })
}
const safe = v => typeof v === 'string' ? v.replace(/[\x00-\x1f]/g, '').slice(0, 512) : ''
async function inventory(contents, platform = process.platform, enrich = windowsInventory) {
  const base = await contents.getPrintersAsync()
  let extra = []; let diagnostic = platform === 'win32' ? null : 'Metadatos CIM disponibles únicamente en Windows.'
  if (platform === 'win32') { try { extra = await enrich() } catch { diagnostic = 'No se pudieron consultar metadatos CIM. Inventario Electron disponible; revise permisos de Windows.' } }
  return { diagnostic, printers: base.map(p => {
    const rows = extra.filter(e => e && e.Name === p.name)
    const e = rows.length === 1 ? rows[0] : {}
    return {
      identity: { name: safe(p.name).slice(0, 256), driver: safe(e.DriverName), port: safe(e.PortName), pnp: safe(e.PNPDeviceID), serial: '' },
      status: e.WorkOffline === true ? 'offline (cola Windows)' : e.PrinterStatus === 7 ? 'offline (CIM)' : 'desconocido',
      source: 'Nombre: Electron; driver/puerto/PnP: CIM si disponible. Serial físico: no expuesto de forma fiable.',
    }
  }) }
}
module.exports = { inventory, windowsInventory }
