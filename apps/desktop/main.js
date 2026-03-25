const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

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

  win.loadURL('http://localhost:3030')
}

ipcMain.handle('print-labels', async (_event, payload) => {
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

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
      },
    })

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    return await new Promise((resolve) => {
      printWindow.webContents.print(
        {
          silent: false,
          printBackground: true,
          margins: {
            marginType: 'none',
          },
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
})

app.whenReady().then(createWindow)