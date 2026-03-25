'use client'

interface ProductSummaryProps {
  productName?: string
  totalReferences: number
}

export default function ProductSummary({
  productName,
  totalReferences,
}: ProductSummaryProps) {
  return (
    <div className="grid gap-4 border-b border-slate-100 px-6 py-6 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-500">Producto</p>
        <p className="mt-2 text-lg font-bold text-slate-800">
          {productName || '-'}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-500">
          Total referencias
        </p>
        <p className="mt-2 text-lg font-bold text-slate-800">
          {totalReferences}
        </p>
      </div>
    </div>
  )
}