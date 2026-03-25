'use client'

import { FiHash, FiTag, FiLayers, FiBox } from 'react-icons/fi'

interface ProductionStatsProps {
  batchCode?: string
  status?: string
  productionType?: string
  totalQuantity: number
}

export default function ProductionStats({
  batchCode,
  status,
  productionType,
  totalQuantity,
}: ProductionStatsProps) {
  return (
    <div className="grid gap-4 border-b border-slate-100 px-6 py-6 md:grid-cols-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center gap-2 text-slate-500">
          <FiHash size={16} />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Lote
          </span>
        </div>
        <p className="text-lg font-bold text-slate-800">
          {batchCode || '-'}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center gap-2 text-slate-500">
          <FiTag size={16} />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Estado
          </span>
        </div>
        <p className="text-lg font-bold text-slate-800">
          {status || '-'}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center gap-2 text-slate-500">
          <FiLayers size={16} />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Tipo
          </span>
        </div>
        <p className="text-lg font-bold capitalize text-slate-800">
          {productionType || '-'}
        </p>
      </div>

      <div className="rounded-2xl border border-pink-200 bg-pink-50 p-4">
        <div className="mb-2 flex items-center gap-2 text-pink-500">
          <FiBox size={16} />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Total unidades
          </span>
        </div>
        <p className="text-2xl font-extrabold text-pink-600">
          {totalQuantity}
        </p>
      </div>
    </div>
  )
}