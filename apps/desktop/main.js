const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const { register: registerBetaPrinters } = require('./beta-printers')
const dispatchPrint = require('./dispatch-print')
const prismaAgent = require('./prisma-agent')
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
  fs.writeFileSync(file, id, { mode: 0o600 })
  return id
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  attachBetaPrinters(win)
  attachDispatchPrinting(win)
  attachPrisma(win)
  //win.loadURL('http://localhost:3030')
  win.loadURL('https://ivoolve-print-frontend.vercel.app')
}

async function printLabels(_event, payload) {
  try {
    const response = await fetch('http://localhost:3031/api/print/labels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const html = await response.text()

    if (!response.ok) {
      return {
        ok: false,
        message: 'No fue posible generar el HTML de impresión',
        status: response.status,
      }
    }

    const { options: printerOptions, css: profileCss } = await attachBetaPrinters.getPrintPlan(_event)

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
  attachPrisma = prismaAgent.register({ ipcMain, profiles: attachBetaPrinters, printLabels, printLetterhead: attachDispatchPrinting.run, stationId: prismaStationId() })
  createWindow()
})
