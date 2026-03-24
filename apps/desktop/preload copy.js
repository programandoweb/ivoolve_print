const { contextBridge, ipcRenderer } = require('electron')


contextBridge.exposeInMainWorld('api', {
  print: async (data) => {
    try {
      const response = await fetch('http://localhost:3001/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      let result = null

      try {
        result = await response.json()
      } catch (error) {
        result = null
      }

      if (!response.ok) {
        return {
          ok: false,
          message: result?.message || 'Error al enviar al servicio de impresión',
          status: response.status,
          data: result,
        }
      }

      return {
        ok: true,
        message: result?.message || 'Impresión recibida correctamente',
        status: response.status,
        data: result,
      }
    } catch (error) {
      return {
        ok: false,
        message: error?.message || 'No fue posible conectar con el servicio de impresión',
      }
    }
  },
})