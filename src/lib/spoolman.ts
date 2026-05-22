import type { Spool, Filament, Vendor } from '../types/spoolman'

export interface SpoolQuery {
  filament_name?: string
  filament_material?: string
  vendor_name?: string
  location?: string
  include_archived?: boolean
  limit?: number
  offset?: number
}

export async function fetchSpools(params: SpoolQuery = {}): Promise<Spool[]> {
  const url = new URL('/api/spool', window.location.origin)
  url.searchParams.set('limit', String(params.limit ?? 500))
  if (params.filament_name) url.searchParams.set('filament_name', params.filament_name)
  if (params.filament_material) url.searchParams.set('filament_material', params.filament_material)
  if (params.vendor_name) url.searchParams.set('vendor_name', params.vendor_name)
  if (params.location) url.searchParams.set('location', params.location)
  if (params.include_archived) url.searchParams.set('include_archived', 'true')
  if (params.offset) url.searchParams.set('offset', String(params.offset))

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`Spoolman API error: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<Spool[]>
}

export async function fetchFilaments(
  params: { name?: string; material?: string; limit?: number } = {},
): Promise<Filament[]> {
  const url = new URL('/api/filament', window.location.origin)
  if (params.name) url.searchParams.set('name', params.name)
  if (params.material) url.searchParams.set('material', params.material)
  url.searchParams.set('limit', String(params.limit ?? 10))
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Spoolman API error: ${res.status}`)
  return res.json() as Promise<Filament[]>
}

export async function fetchVendors(): Promise<Vendor[]> {
  const res = await fetch('/api/vendor')
  if (!res.ok) throw new Error(`Spoolman API error: ${res.status}`)
  return res.json() as Promise<Vendor[]>
}

export interface FilamentCreateParams {
  name?: string
  vendor_id?: number
  material?: string
  price?: number
  density: number
  diameter: number
  weight?: number
  spool_weight?: number
  article_number?: string
  comment?: string
  settings_extruder_temp?: number
  settings_bed_temp?: number
  color_hex?: string
  extra?: Record<string, string>
}

export async function createFilament(params: FilamentCreateParams): Promise<Filament> {
  const res = await fetch('/api/filament', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(`Create filament failed: ${res.status} ${msg}`)
  }
  return res.json() as Promise<Filament>
}

export interface SpoolCreateParams {
  filament_id: number
  initial_weight?: number
  spool_weight?: number
  location?: string
  lot_nr?: string
  comment?: string
  extra?: Record<string, string>
}

export async function createSpool(params: SpoolCreateParams): Promise<Spool> {
  const res = await fetch('/api/spool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(`Create spool failed: ${res.status} ${msg}`)
  }
  return res.json() as Promise<Spool>
}
