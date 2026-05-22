import { useMemo, useState } from 'react'
import type { Spool } from '../types/spoolman'

interface Props {
  spools: Spool[]
  loading: boolean
  error: string | null
  selectedId: number | null
  onSelect: (spool: Spool) => void
}

export function SpoolList({ spools, loading, error, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return spools
    return spools.filter((s) => {
      const parts = [
        s.filament.vendor?.name,
        s.filament.name,
        s.filament.material,
        s.location,
        String(s.id),
      ]
      return parts.some((p) => p?.toLowerCase().includes(q))
    })
  }, [spools, query])

  return (
    <div className="card">
      <div className="card-header">Spools</div>
      <div className="spool-search">
        <input
          type="search"
          placeholder="Filter by name, material, vendor…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="spool-list">
        {loading && <div className="loading-msg">Loading…</div>}
        {error && <div className="error-msg">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="spool-empty">No spools found</div>
        )}
        {filtered.map((spool) => (
          <SpoolItem
            key={spool.id}
            spool={spool}
            selected={spool.id === selectedId}
            onClick={() => onSelect(spool)}
          />
        ))}
      </div>
    </div>
  )
}

function SpoolItem({ spool, selected, onClick }: { spool: Spool; selected: boolean; onClick: () => void }) {
  const colorHex = spool.filament.color_hex
  const vendorName = spool.filament.vendor?.name ?? '—'
  const filamentName = spool.filament.name ?? '—'
  const material = spool.filament.material ?? ''

  return (
    <div className={`spool-item${selected ? ' selected' : ''}`} onClick={onClick}>
      <div
        className="spool-color"
        style={{ background: colorHex ? `#${colorHex}` : '#e2e8f0' }}
      />
      <div className="spool-info">
        <div className="spool-name">
          #{spool.id} · {vendorName} {filamentName}
        </div>
        <div className="spool-sub">
          {material}
          {spool.remaining_weight != null && ` · ${Math.round(spool.remaining_weight)} g left`}
          {spool.location && ` · ${spool.location}`}
        </div>
      </div>
    </div>
  )
}
