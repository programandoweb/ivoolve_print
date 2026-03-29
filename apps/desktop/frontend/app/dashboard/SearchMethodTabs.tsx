'use client'

import { FC } from 'react'

export type SearchMethodType = 'batch_code' | 'tag' | 'letterhead'

export type SearchMethodOption = {
  label: string
  value: SearchMethodType
  drawer?: boolean
}

interface Props {
  value: SearchMethodType
  onChange: (value: SearchMethodType, option: SearchMethodOption) => void
}

export const OPTIONS: SearchMethodOption[] = [
  { label: 'Requisición', value: 'batch_code' },
  { label: 'Etiqueta', value: 'tag' },
  { label: 'Membretes', value: 'letterhead', drawer: true },
]

const SearchMethodTabs: FC<Props> = ({ value, onChange }) => {
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      {OPTIONS.map((option) => {
        const isActive = value === option.value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value, option)}
            className={[
              'rounded-2xl border px-4 py-3 text-sm font-semibold transition-all',
              isActive
                ? 'border-pink-500 bg-pink-500 text-white shadow-md'
                : 'border-slate-300 bg-white text-slate-700 hover:border-pink-300 hover:text-pink-600',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default SearchMethodTabs