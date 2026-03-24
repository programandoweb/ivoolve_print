export function historyPage() {
  return `
    <h2 class="text-xl font-bold mb-4">Historial de impresión</h2>

    <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-500">
          <tr>
            <th class="text-left p-3">Fecha</th>
            <th class="text-left p-3">Contenido</th>
            <th class="text-left p-3">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${mockHistory().map(row => `
            <tr class="border-t">
              <td class="p-3">${row.date}</td>
              <td class="p-3 truncate max-w-[300px]">${row.text}</td>
              <td class="p-3">
                <span class="${statusColor(row.status)} px-2 py-1 rounded text-xs font-medium">
                  ${row.status}
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

function statusColor(status) {
  switch (status) {
    case 'OK':
      return 'bg-green-100 text-green-600'
    case 'ERROR':
      return 'bg-red-100 text-red-600'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

function mockHistory() {
  return [
    {
      date: new Date().toLocaleString(),
      text: 'Ticket venta #001 - $25.000',
      status: 'OK',
    },
    {
      date: new Date().toLocaleString(),
      text: 'Ticket prueba',
      status: 'ERROR',
    },
    {
      date: new Date().toLocaleString(),
      text: 'Factura cliente Juan',
      status: 'OK',
    }
  ]
}