const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const { register: registerBetaPrinters } = require('./beta-printers')
const dispatchPrint = require('./dispatch-print')
const prismaAgent = require('./prisma-agent')
const { createWake } = require('./prisma-agent/wake')
const runtimeConfig = require('./runtime-config')
// Logging técnico aislado (docs/logging/README.md). Debe crearse antes de registrar cualquier IPC.
const logs = require('./logging').create({ app, ipcMain, dialog, BrowserWindow, runtimeConfig })
// Historial de impresiones (quién imprimió y qué): módulo independiente de los logs técnicos.
const printHistory = require('./print-history').create({ app, ipcMain, dialog, BrowserWindow, runtimeConfig })
logs.setPrintTrace(printHistory.trace)
dispatchPrint.registerScheme(require('electron').protocol)
let attachDispatchPrinting
let attachBetaPrinters
let attachPrisma

function prismaStationId() {
  const file = path.join(app.getPath('userData'), 'prisma-station.id')
  try {
    const saved = fs.readFileSync(file, 'utf8').trim()
    if (/^[0-9a-f-]{36}$/.test(saved)) return saved
  } catch { /* New installation. */ }
  const id = randomUUID()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, id, { mode: 0o600 })
  } catch (error) {
    // Fail open for the existing manual printing app; diagnostics still use an
    // in-memory station ID for this run instead of crashing Electron.
    logs.logger.warn('config.station_id_unwritable', 'No se pudo guardar el identificador de la estación; se usa uno temporal', { error })
  }
  return id
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--ivoolve-frontend-origin=${runtimeConfig.frontendOrigin}`],
      contextIsolation: true,
      nodeIntegration: false,
      // El polling de Prisma corre en la página: sin esto Chromium lo frena al minimizar y la estación aparece desconectada.
      backgroundThrottling: false,
    },
  })
  attachBetaPrinters(win)
  attachDispatchPrinting(win)
  attachPrisma(win)
  logs.attachShell(win)
  printHistory.attachShell(win)
  win.loadURL(runtimeConfig.frontendOrigin)
}

async function printLabels(_event, payload, context = {}) {
  try {
    const response = await fetch('http://localhost:3031/api/print/labels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Solo hacia la API local: permite correlacionar los logs de Electron y de la API.
        ...logs.correlationHeaders(),
      },
      body: JSON.stringify(payload),
    })

    const html = await response.text()

    if (!response.ok) {
      logs.logger.error('api.request_failed', 'La API local no pudo generar el HTML de etiquetas', { metadata: { target: 'local_api', http_status: response.status } })
      return {
        ok: false,
        message: 'No fue posible generar el HTML de impresión',
        status: response.status,
      }
    }

    const { options: printerOptions, css: profileCss } = context.prismaSupervised === true
      ? await attachBetaPrinters.getPrismaPrintPlan(_event, 'labels', { confirmed: context.prismaConfirmed === true })
      : await attachBetaPrinters.getPrintPlan(_event)

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
      },
    })

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    if (profileCss) {
      try { await printWindow.webContents.insertCSS(profileCss) } catch {
        printWindow.close()
        throw Error('No fue posible aplicar la calibración del perfil. No se envió la impresión.')
      }
    }

    return await new Promise((resolve) => {
      printWindow.webContents.print(
        {
          silent: false,
          printBackground: true,
          margins: {
            marginType: 'none',
          },
          ...printerOptions,
          ...(context.prismaSupervised === true ? { copies: 1 } : {}),
        },
        (success, errorType) => {
          printWindow.close()

          if (!success) {
            resolve({
              ok: false,
              message: errorType || 'La impresión no se completó',
            })
            return
          }

          resolve({
            ok: true,
            message: 'Impresión enviada correctamente',
          })
        }
      )
    })
  } catch (error) {
    // La API local caída (ECONNREFUSED) es un fallo de conexión, no de impresión.
    if (error?.cause?.code === 'ECONNREFUSED' || error?.message === 'fetch failed') {
      logs.logger.error('api.request_failed', 'No se pudo contactar a la API local de impresión', { error, metadata: { target: 'local_api', code: error?.cause?.code } })
    }
    return {
      ok: false,
      message: error?.message || 'Error interno al imprimir',
    }
  }
}
ipcMain.handle('print-labels', printLabels)

app.whenReady().then(() => {
  attachBetaPrinters = registerBetaPrinters({ app, BrowserWindow, ipcMain, ...require('electron') })
  attachDispatchPrinting = dispatchPrint.register({ ...require('electron'), profiles: attachBetaPrinters })
  const stationId = prismaStationId()
  logs.setStationId(stationId)
  printHistory.setStationId(stationId)
  logs.logger.info('app.ready', 'Electron listo; módulos de impresión registrados')
  // Las funciones de impresión que usa Prisma se envuelven solo para registrar su resultado técnico.
  attachPrisma = prismaAgent.register({
    ipcMain, profiles: attachBetaPrinters, stationId, log: logs.prismaLog,
    printLabels: logs.instrumentPrint('labels', printLabels),
    printLetterhead: logs.instrumentPrint('letterhead', attachDispatchPrinting.run),
    wake: createWake({ stationId, events: logs.prismaLog }),
  })
  createWindow()
})
