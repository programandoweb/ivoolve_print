'use client'

import { useState } from 'react'

export default function PrintPage() {
  const [text, setText] = useState('Hola Delice')
  const [loading, setLoading] = useState(false)

  const handlePrint = async () => {
    try {
      setLoading(true)

      await fetch('http://localhost:3001/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      alert('Enviado a imprimir')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1f2a5a]">
          Impresión
        </h1>
        <p className="text-gray-400 text-sm">
          Envía contenido directamente a la impresora térmica
        </p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">

        {/* Label */}
        <label className="block text-sm font-medium text-gray-600 mb-2">
          Contenido a imprimir
        </label>

        {/* Textarea */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="
            w-full
            min-h-[120px]
            border border-gray-200
            rounded-xl
            p-3
            text-sm
            text-gray-700
            focus:outline-none
            focus:ring-2
            focus:ring-pink-400
            focus:border-pink-400
            transition
          "
        />

        {/* Actions */}
        <div className="flex justify-end mt-4">

          <button
            onClick={handlePrint}
            disabled={loading}
            className="
              bg-pink-500
              hover:bg-pink-600
              text-white
              px-5 py-2.5
              rounded-xl
              text-sm
              font-medium
              shadow-sm
              transition
              disabled:opacity-50
              disabled:cursor-not-allowed
            "
          >
            {loading ? 'Imprimiendo...' : 'Imprimir'}
          </button>

        </div>

      </div>

    </div>
  )
}