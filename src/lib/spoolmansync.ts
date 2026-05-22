import type { HAPrinter } from '../types/spoolmansync'

export async function fetchPrinters(): Promise<HAPrinter[]> {
  const res = await fetch('/spoolmansync-api/printers')
  if (!res.ok) throw new Error(`SpoolmanSync API error: ${res.status} ${res.statusText}`)
  const data: unknown = await res.json()

  // Unwrap envelope if needed
  let raw: unknown[] = []
  if (Array.isArray(data)) raw = data
  else if (data && typeof data === 'object') {
    for (const key of ['printers', 'data', 'items', 'results']) {
      const v = (data as Record<string, unknown>)[key]
      if (Array.isArray(v)) { raw = v; break }
    }
  }

  if (raw.length === 0) {
    console.warn('fetchPrinters: unexpected response shape', data)
    return []
  }

  // Log first printer so we can see the actual field names during development
  console.debug('fetchPrinters: first printer shape', raw[0])

  // Normalise each printer: flatten ams_units[].trays + external_spools into a single trays array
  return raw.map((p) => {
    const printer = p as Record<string, unknown>

    const amsUnits = Array.isArray(printer.ams_units) ? printer.ams_units as Record<string, unknown>[] : []
    const externalSpools = Array.isArray(printer.external_spools) ? printer.external_spools as unknown[] : []

    const trays: HAPrinter['trays'] = [
      ...amsUnits.flatMap((unit) => {
        const unitName = String(unit.name ?? '')
        const unitTrays = Array.isArray(unit.trays) ? unit.trays as Record<string, unknown>[] : []
        return unitTrays.map((t) => ({ ...t, ams_unit_name: unitName }) as HAPrinter['trays'][number])
      }),
      ...externalSpools as HAPrinter['trays'],
    ]

    return {
      id: String(printer.entity_id ?? printer.id ?? ''),
      name: String(printer.name ?? ''),
      trays,
    }
  })
}

/**
 * Assign a Spoolman spool to an AMS tray in SpoolmanSync.
 * trayId should be the tray's unique_id (preferred) or entity_id.
 */
export async function assignSpool(spoolId: number, trayId: string): Promise<void> {
  const res = await fetch('/spoolmansync-api/spools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spoolId, trayId }),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(`SpoolmanSync assign error: ${res.status} ${msg}`)
  }
}
