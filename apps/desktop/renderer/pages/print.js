export function printPage() {
  return `
    <h2 class="text-xl font-bold mb-4">Impresión</h2>

    <textarea id="text" class="w-full border p-2 rounded mb-4"></textarea>

    <button onclick="sendPrint()" class="bg-pink-500 text-white px-4 py-2 rounded">
      Imprimir
    </button>
  `
}

window.sendPrint = async function () {
  const text = document.getElementById('text').value

  await window.api.print({ text })

  alert('Enviado a imprimir')
}