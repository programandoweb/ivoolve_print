export function settingsPage() {
  return `
    <h2 class="text-xl font-bold mb-4">Configuración</h2>

    <div class="grid grid-cols-2 gap-6">

      <!-- Config impresora -->
      <div class="bg-white rounded-xl p-4 shadow-sm border">
        <h3 class="font-semibold mb-4">Impresora</h3>

        <div class="space-y-3 text-sm">

          <div>
            <label class="block text-gray-500 mb-1">Tipo conexión</label>
            <select id="type" class="w-full border rounded p-2">
              <option value="usb">USB</option>
              <option value="network">Red (IP)</option>
            </select>
          </div>

          <div>
            <label class="block text-gray-500 mb-1">Nombre / IP</label>
            <input id="target" type="text" placeholder="Ej: 192.168.1.100"
              class="w-full border rounded p-2" />
          </div>

          <div>
            <label class="block text-gray-500 mb-1">Copias</label>
            <input id="copies" type="number" value="1"
              class="w-full border rounded p-2" />
          </div>

        </div>

        <button onclick="saveSettings()"
          class="mt-4 w-full bg-pink-500 text-white py-2 rounded-lg hover:opacity-90">
          Guardar configuración
        </button>
      </div>

      <!-- Prueba -->
      <div class="bg-white rounded-xl p-4 shadow-sm border">
        <h3 class="font-semibold mb-4">Prueba de impresión</h3>

        <textarea id="testText"
          class="w-full border p-2 rounded mb-3"
          placeholder="Texto de prueba...">Hola desde Delice POS</textarea>

        <button onclick="testPrint()"
          class="w-full bg-pink-500 text-white py-2 rounded-lg hover:opacity-90">
          Imprimir prueba
        </button>
      </div>

    </div>
  `
}

/**
 * Guardar configuración (temporal local)
 */
window.saveSettings = function () {
  const config = {
    type: document.getElementById('type').value,
    target: document.getElementById('target').value,
    copies: document.getElementById('copies').value,
  }

  localStorage.setItem('printer_config', JSON.stringify(config))

  alert('Configuración guardada')
}

/**
 * Prueba de impresión
 */
window.testPrint = async function () {
  const text = document.getElementById('testText').value

  const config = JSON.parse(localStorage.getItem('printer_config') || '{}')

  await window.api.print({
    text,
    config,
  })

  alert('Enviado a imprimir')
}