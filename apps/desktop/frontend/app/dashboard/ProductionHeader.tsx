'use client'

import { FiPackage } from 'react-icons/fi'

interface ProductionHeaderProps {
  productName?: string
}

export default function ProductionHeader({
  productName,
}: ProductionHeaderProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pink-100 text-pink-600">
        <FiPackage size={28} />
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-800">
          {productName || 'Orden encontrada'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Resumen general de la orden de producción
        </p>
      </div>
    </div>
  )
}