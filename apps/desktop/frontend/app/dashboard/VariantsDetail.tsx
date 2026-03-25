'use client'

interface VariantsDetailProps {
  items?: any[]
  totalQuantity: number
}

export default function VariantsDetail({
  items = [],
  totalQuantity,
}: VariantsDetailProps) {
  return (
    <div className="px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            Detalle de variantes
          </h3>
          <p className="text-sm text-slate-500">
            Cantidades discriminadas por referencia
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
          <div className="col-span-8">Variante</div>
          <div className="col-span-4 text-right">Cantidad</div>
        </div>

        <div className="divide-y divide-slate-100 bg-white">
          {items.map((item: any) => (
            <div
              key={item.id}
              className="grid grid-cols-12 items-center px-4 py-3 transition hover:bg-slate-50"
            >
              <div className="col-span-8 pr-3 text-sm font-medium text-slate-700">
                {item.variant_name}
              </div>
              <div className="col-span-4 text-right text-base font-bold text-slate-800">
                {item.quantity}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 border-t border-slate-200 bg-pink-50 px-4 py-4">
          <div className="col-span-8 text-sm font-bold uppercase tracking-wide text-pink-700">
            Total general
          </div>
          <div className="col-span-4 text-right text-xl font-extrabold text-pink-700">
            {totalQuantity}
          </div>
        </div>
      </div>
    </div>
  )
}