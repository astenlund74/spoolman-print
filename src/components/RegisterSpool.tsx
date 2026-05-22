import { useEffect, useRef, useState } from 'react'
import type { HATray, HAPrinter } from '../types/spoolmansync'
import type { Filament, Spool, Vendor } from '../types/spoolman'
import { fetchPrinters, assignSpool as syncAssign } from '../lib/spoolmansync'
import { lookupColorName } from '../lib/openfilamentdb'
import {
  fetchFilaments,
  fetchVendors,
  createFilament,
  createSpool,
} from '../lib/spoolman'

// ── Helpers ────────────────────────────────────────────────────────────────

function toInputColor(hex: string | undefined): string {
  if (!hex) return '#888888'
  // Strip leading # and trim alpha channel if 8-digit RGBA (e.g. "#000000FF" → "#000000")
  const h = '#' + hex.replace('#', '').slice(0, 6)
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h : '#888888'
}

function toSpoolmanHex(inputColor: string): string {
  return inputColor.replace('#', '')
}

function trayDisplayName(tray: HATray): string {
  const name = tray.name && tray.name !== 'Empty' ? tray.name : null
  const prefix = tray.ams_unit_name ? `${tray.ams_unit_name} · ` : ''
  return `${prefix}Tray ${tray.tray_number}${name ? ` · ${name}` : ''}`
}

/** Returns the Spoolman spool whose extra.tag matches the given RFID tray_uuid, if any */
function findSpoolByTag(spools: Spool[], uuid: string | undefined): Spool | undefined {
  if (!uuid) return undefined
  return spools.find(s => {
    try { return JSON.parse(s.extra?.tag ?? '') === uuid } catch { return false }
  })
}

function isUnmapped(tray: HATray): boolean {
  if (!tray.name || tray.name === 'Empty') return false
  const assigned = tray.assigned_spool ?? tray.assignedSpool
  return assigned == null
}

function isMismatched(tray: HATray): boolean {
  return tray.mismatch != null
}

function assignedInfo(tray: HATray) {
  return tray.assigned_spool ?? tray.assignedSpool
}

/** Split AMS tray name like "Bambu PETG Basic" → brand hint + product line */
function parseTrayName(name: string): { brandHint: string; productLine: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length <= 1) return { brandHint: '', productLine: name }
  return { brandHint: parts[0], productLine: parts.slice(1).join(' ') }
}

// ── Material temperature defaults ─────────────────────────────────────────

const MATERIAL_TEMPS: Record<string, { extruder: number; bed: number; density: number }> = {
  PLA:        { extruder: 220, bed: 60,  density: 1.24 },
  'PLA-CF':   { extruder: 230, bed: 60,  density: 1.30 },
  'PLA-S':    { extruder: 220, bed: 60,  density: 1.24 },
  'PLA+':     { extruder: 225, bed: 60,  density: 1.24 },
  PETG:       { extruder: 240, bed: 70,  density: 1.27 },
  'PETG-CF':  { extruder: 260, bed: 70,  density: 1.35 },
  'PETG-HF':  { extruder: 240, bed: 70,  density: 1.27 },
  ABS:        { extruder: 250, bed: 100, density: 1.05 },
  'ABS-GF':   { extruder: 270, bed: 100, density: 1.20 },
  ASA:        { extruder: 260, bed: 100, density: 1.07 },
  'ASA-CF':   { extruder: 270, bed: 100, density: 1.20 },
  TPU:        { extruder: 230, bed: 30,  density: 1.21 },
  'TPU-HF':   { extruder: 230, bed: 30,  density: 1.21 },
  PA:         { extruder: 280, bed: 80,  density: 1.14 },
  'PA-CF':    { extruder: 290, bed: 80,  density: 1.30 },
  'PA6-CF':   { extruder: 290, bed: 80,  density: 1.30 },
  'PA12-CF':  { extruder: 300, bed: 80,  density: 1.20 },
  PC:         { extruder: 300, bed: 100, density: 1.20 },
  'PC-CF':    { extruder: 320, bed: 110, density: 1.30 },
  HIPS:       { extruder: 240, bed: 100, density: 1.03 },
  PVA:        { extruder: 215, bed: 60,  density: 1.23 },
  'PE-CF':    { extruder: 260, bed: 80,  density: 1.20 },
  PP:         { extruder: 230, bed: 85,  density: 0.90 },
}

function materialTemps(material: string | undefined) {
  if (!material) return null
  const key = material.toUpperCase().trim()
  return MATERIAL_TEMPS[key] ?? null
}

// ── Wizard state machine ───────────────────────────────────────────────────

type WizardState =
  | { step: 0 }
  | { step: 1; tray: HATray; printerName: string }
  | { step: 2; tray: HATray; printerName: string; filamentId: number; filamentName: string }
  | { step: 3; tray: HATray; printerName: string; spool: Spool }
  | { step: 4; spool: Spool; trayLabel: string; printerName: string }

// ── Root component ─────────────────────────────────────────────────────────

interface RegisterSpoolProps {
  onPrintSpool: (spool: Spool) => void
  spools: Spool[]
}

export function RegisterSpool({ onPrintSpool, spools }: RegisterSpoolProps) {
  const [wizard, setWizard] = useState<WizardState>({ step: 0 })

  return (
    <div className="register-view">
      {wizard.step === 0 && (
        <TrayListView
          spools={spools}
          onSelect={(tray, printerName) => setWizard({ step: 1, tray, printerName })}
        />
      )}

      {wizard.step === 1 && (
        <FilamentView
          tray={wizard.tray}
          printerName={wizard.printerName}
          onBack={() => setWizard({ step: 0 })}
          onDone={(filamentId, filamentName) =>
            setWizard({ step: 2, tray: wizard.tray, printerName: wizard.printerName, filamentId, filamentName })
          }
        />
      )}

      {wizard.step === 2 && (
        <SpoolView
          tray={wizard.tray}
          printerName={wizard.printerName}
          filamentId={wizard.filamentId}
          filamentName={wizard.filamentName}
          onBack={() => setWizard({ step: 1, tray: wizard.tray, printerName: wizard.printerName })}
          onDone={(spool) =>
            setWizard({ step: 3, tray: wizard.tray, printerName: wizard.printerName, spool })
          }
        />
      )}

      {wizard.step === 3 && (
        <MapView
          tray={wizard.tray}
          printerName={wizard.printerName}
          spool={wizard.spool}
          onDone={(label) =>
            setWizard({ step: 4, spool: wizard.spool, trayLabel: label, printerName: wizard.printerName })
          }
        />
      )}

      {wizard.step === 4 && (
        <DoneView
          spool={wizard.spool}
          trayLabel={wizard.trayLabel}
          printerName={wizard.printerName}
          onPrint={() => onPrintSpool(wizard.spool)}
          onReset={() => setWizard({ step: 0 })}
        />
      )}
    </div>
  )
}

// ── Step 0: TrayListView ───────────────────────────────────────────────────

function TrayListView({ onSelect, spools }: { onSelect: (tray: HATray, printerName: string) => void; spools: Spool[] }) {
  const [printers, setPrinters] = useState<HAPrinter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    fetchPrinters()
      .then(setPrinters)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  if (loading) return <div className="wizard-card"><p className="loading-msg">Loading AMS trays…</p></div>

  if (error) return (
    <div className="wizard-card">
      <p className="error-msg">Could not reach SpoolmanSync: {error}</p>
      <div className="wizard-actions">
        <button className="btn btn-secondary" onClick={load}>Retry</button>
      </div>
    </div>
  )

  const hasTrays = printers.some(p => (p.trays ?? []).some(t => t.name && t.name !== 'Empty'))
  const hasUnmapped = printers.some(p => (p.trays ?? []).some(t => isUnmapped(t) || isMismatched(t)))

  return (
    <div className="wizard-card wizard-card--wide">
      <div className="step-header">
        <h2>AMS Tray Overview</h2>
        <p className="step-sub">
          Select an unmapped tray to register its spool in Spoolman.
        </p>
      </div>

      {!hasTrays && (
        <p className="loading-msg">No filament-loaded trays found.</p>
      )}

      {hasTrays && !hasUnmapped && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: '8px 0' }}>
          All loaded spools are already mapped. Load a new spool in the AMS or re-insert one to see it here.
        </p>
      )}

      {printers.map(printer => {
        const visibleTrays = (printer.trays ?? [])
          .filter(t => t.name && t.name !== 'Empty')
          .sort((a, b) => a.tray_number - b.tray_number)
        if (!visibleTrays.length) return null
        return (
          <div key={printer.id} className="tray-printer-group">
            <div className="tray-printer-header">{printer.name}</div>
            {visibleTrays.map(tray => {
              const mapped = !isUnmapped(tray) && !isMismatched(tray)
              const mismatched = isMismatched(tray)
              const info = assignedInfo(tray)
              const existingSpool = mismatched ? findSpoolByTag(spools, tray.tray_uuid) : undefined
              return (
                <div key={tray.entity_id} className={`tray-row${mapped ? ' tray-row--mapped' : mismatched ? ' tray-row--mismatch' : ''}`}>
                  <span className="tray-color" style={{ background: toInputColor(tray.color) }} />
                  <span className="tray-info">
                    <span className="tray-name">{tray.name}</span>
                    <span className="tray-sub">
                      Tray {tray.tray_number}
                      {tray.material ? ` · ${tray.material}` : ''}
                      {tray.remaining_weight != null && tray.remaining_weight >= 0 ? ` · ${Math.round(tray.remaining_weight)} % left` : ''}
                    </span>
                  </span>
                  {mapped ? (
                    <span className="badge badge--ok">
                      {info?.filament?.name ?? 'Mapped'}
                    </span>
                  ) : mismatched ? (
                    <span title={tray.mismatch?.message} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span className="badge badge--warn">⚠ Mismatch</span>
                      <button className="btn btn-secondary btn-sm" onClick={() => onSelect(tray, printer.name)}>
                        {existingSpool ? 'Re-register →' : 'Register new →'}
                      </button>
                    </span>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => onSelect(tray, printer.name)}>
                      Register →
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      <div className="wizard-actions">
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>
    </div>
  )
}

// ── Step 1: FilamentView ───────────────────────────────────────────────────

interface FilamentViewProps {
  tray: HATray
  printerName: string
  onBack: () => void
  onDone: (filamentId: number, filamentName: string) => void
}

function FilamentView({ tray, printerName, onBack, onDone }: FilamentViewProps) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [matches, setMatches] = useState<Filament[]>([])
  const temps = materialTemps(tray.material)
  const parsed = parseTrayName(tray.name ?? '')
  const [form, setForm] = useState({
    name: parsed.productLine,
    colorName: '',
    material: tray.material ?? '',
    colorHex: toInputColor(tray.color),
    vendorSearch: parsed.brandHint,
    vendorId: null as number | null,
    weight: 1000,
    diameter: 1.75,
    density: temps ? String(temps.density) : '1.24',
    extruderTemp: temps ? String(temps.extruder) : '',
    bedTemp: temps ? String(temps.bed) : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [colorLookupPending, setColorLookupPending] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchVendors().then(v => {
      setVendors(v)
      // Auto-match vendor from brand hint (e.g. "Bambu" → "Bambu Lab")
      if (parsed.brandHint) {
        const hint = parsed.brandHint.toLowerCase()
        const match = v.find(vn =>
          vn.name.toLowerCase() === hint ||
          vn.name.toLowerCase().startsWith(hint) ||
          hint.startsWith(vn.name.toLowerCase())
        )
        if (match) {
          setForm(prev => ({ ...prev, vendorSearch: match.name, vendorId: match.id }))
          // Auto-lookup color name from Open Filament Database
          setColorLookupPending(true)
          lookupColorName(match.name, parsed.productLine, tray.material ?? '', tray.color ?? '')
            .then(name => {
              if (name) setForm(prev => ({ ...prev, colorName: prev.colorName || name }))
            })
            .catch(() => {})
            .finally(() => setColorLookupPending(false))
        }
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (form.name.length < 2) { setMatches([]); return }
    debounceRef.current = setTimeout(() => {
      fetchFilaments({ name: form.name, material: form.material || undefined, limit: 6 })
        .then(setMatches)
        .catch(() => {})
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [form.name, form.material])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const handleMaterialChange = (v: string) => {
    const newTemps = materialTemps(v)
    setForm(prev => ({
      ...prev,
      material: v,
      // only overwrite temps if fields are still at a "default" value (or empty)
      extruderTemp: newTemps ? String(newTemps.extruder) : prev.extruderTemp,
      bedTemp: newTemps ? String(newTemps.bed) : prev.bedTemp,
      density: newTemps ? String(newTemps.density) : prev.density,
    }))
  }

  const handleVendorSearch = (v: string) => {
    set('vendorSearch', v)
    const match = vendors.find(vn => vn.name.toLowerCase() === v.toLowerCase())
    set('vendorId', match?.id ?? null)
  }

  const handleCreate = async () => {
    setSaving(true)
    setError(null)
    try {
      const f = await createFilament({
        name: form.name || undefined,
        material: form.material || undefined,
        color_hex: toSpoolmanHex(form.colorHex),
        vendor_id: form.vendorId ?? undefined,
        weight: form.weight,
        diameter: form.diameter,
        density: form.density ? Number(form.density) : 1.24,
        settings_extruder_temp: form.extruderTemp ? Number(form.extruderTemp) : undefined,
        settings_bed_temp: form.bedTemp ? Number(form.bedTemp) : undefined,
        extra: form.colorName ? { color_name: JSON.stringify(form.colorName) } : undefined,
      })
      onDone(f.id, f.name ?? `Filament #${f.id}`)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="wizard-card">
      <div className="step-header">
        <div className="step-breadcrumb">
          <button className="btn-link" onClick={onBack}>← Back</button>
          <span>Step 1 of 3: Filament</span>
        </div>
        <h2>Select or Create Filament</h2>
        <p className="step-sub">
          <span className="tray-color" style={{ background: toInputColor(tray.color), display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />
          {trayDisplayName(tray)} · {printerName}
        </p>
      </div>

      {matches.length > 0 && (
        <div className="filament-matches">
          <div className="filament-matches-header">Existing matches in Spoolman</div>
          {matches.map(f => (
            <div key={f.id} className="filament-match">
              {f.color_hex && (
                <span className="tray-color" style={{ background: `#${f.color_hex}` }} />
              )}
              <span className="filament-match-info">
                <span>{f.vendor?.name ? `${f.vendor.name} · ` : ''}{f.name ?? `#${f.id}`}</span>
                <span className="tray-sub">{[f.material, f.weight ? `${f.weight} g` : ''].filter(Boolean).join(' · ')}</span>
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onDone(f.id, f.name ?? `Filament #${f.id}`)}
              >
                Use this
              </button>
            </div>
          ))}
          <div className="filament-matches-sep">— or create new —</div>
        </div>
      )}

      <div className="wizard-form">
        <div className="field-row">
          <div className="field-group">
            <label>Product Line</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. PETG Basic" />
          </div>
          <div className="field-group">
            <label>Color Name {colorLookupPending && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>looking up…</span>}</label>
            <input value={form.colorName} onChange={e => set('colorName', e.target.value)} placeholder="e.g. Black, Jade White" />
          </div>
          <div className="field-group">
            <label>Material</label>
            <input value={form.material} onChange={e => handleMaterialChange(e.target.value)} placeholder="PLA" />
          </div>
        </div>

        <div className="field-row">
          <div className="field-group">
            <label>Color</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={form.colorHex}
                onChange={e => set('colorHex', e.target.value)}
                style={{ width: 48, height: 34, padding: 2, border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}
              />
              <input
                value={form.colorHex}
                onChange={e => set('colorHex', e.target.value)}
                placeholder="#000000"
                style={{ flex: 1 }}
              />
            </div>
          </div>
          <div className="field-group">
            <label>Vendor</label>
            <input
              list="vendor-datalist"
              value={form.vendorSearch}
              onChange={e => handleVendorSearch(e.target.value)}
              placeholder="e.g. Bambu Lab"
            />
            <datalist id="vendor-datalist">
              {vendors.map(v => <option key={v.id} value={v.name} />)}
            </datalist>
          </div>
        </div>

        <div className="field-row">
          <div className="field-group">
            <label>Spool weight (g)</label>
            <input type="number" min={0} value={form.weight} onChange={e => set('weight', Number(e.target.value))} />
          </div>
          <div className="field-group">
            <label>Diameter (mm)</label>
            <input type="number" min={1} step={0.01} value={form.diameter} onChange={e => set('diameter', Number(e.target.value))} />
          </div>
          <div className="field-group">
            <label>Density (g/cm³)</label>
            <input type="number" min={0.1} step={0.01} value={form.density} onChange={e => set('density', e.target.value)} />
          </div>
        </div>

        <div className="field-row">
          <div className="field-group">
            <label>Extruder temp (°C)</label>
            <input type="number" min={0} value={form.extruderTemp} onChange={e => set('extruderTemp', e.target.value)} placeholder="Optional" />
          </div>
          <div className="field-group">
            <label>Bed temp (°C)</label>
            <input type="number" min={0} value={form.bedTemp} onChange={e => set('bedTemp', e.target.value)} placeholder="Optional" />
          </div>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div className="wizard-actions">
        <button className="btn btn-secondary" onClick={onBack}>Back</button>
        <button className="btn btn-primary" disabled={saving || !form.name} onClick={handleCreate}>
          {saving ? 'Creating…' : 'Create Filament'}
        </button>
      </div>
    </div>
  )
}

// ── Step 2: SpoolView ──────────────────────────────────────────────────────

interface SpoolViewProps {
  tray: HATray
  printerName: string
  filamentId: number
  filamentName: string
  onBack: () => void
  onDone: (spool: Spool) => void
}

function SpoolView({ tray, printerName, filamentId, filamentName, onBack, onDone }: SpoolViewProps) {
  const [form, setForm] = useState({ initialWeight: 1000, location: '', comment: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const handleCreate = async () => {
    setSaving(true)
    setError(null)
    try {
      const spool = await createSpool({
        filament_id: filamentId,
        initial_weight: form.initialWeight || undefined,
        location: form.location || undefined,
        comment: form.comment || undefined,
        extra: tray.tray_uuid ? { tag: JSON.stringify(tray.tray_uuid) } : undefined,
      })
      onDone(spool)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="wizard-card">
      <div className="step-header">
        <div className="step-breadcrumb">
          <button className="btn-link" onClick={onBack}>← Back</button>
          <span>Step 2 of 3: Spool</span>
        </div>
        <h2>Create Spool</h2>
        <p className="step-sub">
          <span className="tray-color" style={{ background: toInputColor(tray.color), display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />
          {filamentName} · {trayDisplayName(tray)} · {printerName}
        </p>
      </div>

      <div className="wizard-form">
        <div className="field-group">
          <label>Initial weight (g)</label>
          <input type="number" min={0} value={form.initialWeight} onChange={e => set('initialWeight', Number(e.target.value))} />
        </div>
        <div className="field-group">
          <label>Location</label>
          <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Storage Box A" />
        </div>
        <div className="field-group">
          <label>Comment</label>
          <input value={form.comment} onChange={e => set('comment', e.target.value)} placeholder="Optional" />
        </div>
        {tray.tray_uuid && (
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            RFID tag <code style={{ fontFamily: 'monospace', background: 'var(--color-bg)', padding: '1px 4px', borderRadius: 3 }}>{tray.tray_uuid}</code> will be stored for auto-match on re-insert.
          </p>
        )}
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div className="wizard-actions">
        <button className="btn btn-secondary" onClick={onBack}>Back</button>
        <button className="btn btn-primary" disabled={saving} onClick={handleCreate}>
          {saving ? 'Creating…' : 'Create Spool'}
        </button>
      </div>
    </div>
  )
}

// ── Step 3: MapView ────────────────────────────────────────────────────────

interface MapViewProps {
  tray: HATray
  printerName: string
  spool: Spool
  onDone: (trayLabel: string) => void
}

function MapView({ tray, printerName, spool, onDone }: MapViewProps) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const label = trayDisplayName(tray)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const trayId = tray.unique_id ?? tray.entity_id
    syncAssign(spool.id, trayId)
      .then(() => {
        setStatus('ok')
        timer = setTimeout(() => onDone(label), 1200)
      })
      .catch((e: Error) => {
        setError(e.message)
        setStatus('error')
      })
    return () => { if (timer) clearTimeout(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="wizard-card wizard-card--center">
      {status === 'loading' && (
        <>
          <div className="spinner" />
          <p style={{ marginTop: 16 }}>Mapping spool to {label} on {printerName}…</p>
        </>
      )}
      {status === 'ok' && (
        <>
          <div className="done-icon">✓</div>
          <p style={{ marginTop: 8 }}>Spool #{spool.id} mapped to {label} on {printerName}</p>
        </>
      )}
      {status === 'error' && (
        <>
          <p className="error-msg">Mapping failed: {error}</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '8px 0 0' }}>
            The spool was created in Spoolman but could not be mapped in SpoolmanSync.
            You can map it manually there.
          </p>
          <div className="wizard-actions" style={{ borderTop: 'none', justifyContent: 'center', paddingTop: 16 }}>
            <button className="btn btn-primary" onClick={() => onDone(label)}>Continue anyway</button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Step 4: DoneView ───────────────────────────────────────────────────────

interface DoneViewProps {
  spool: Spool
  trayLabel: string
  printerName: string
  onPrint: () => void
  onReset: () => void
}

function DoneView({ spool, trayLabel, printerName, onPrint, onReset }: DoneViewProps) {
  return (
    <div className="wizard-card wizard-card--center">
      <div className="done-icon done-icon--large">✓</div>
      <h2 style={{ marginTop: 16, marginBottom: 4 }}>All done!</h2>
      <div className="done-summary">
        <div><strong>Spool</strong> <span>#{spool.id}</span></div>
        <div>
          <strong>Filament</strong>
          <span>{spool.filament.vendor?.name ? `${spool.filament.vendor.name} · ` : ''}{spool.filament.name ?? '—'}</span>
        </div>
        <div><strong>Material</strong> <span>{spool.filament.material ?? '—'}</span></div>
        {spool.filament.color_hex && (
          <div>
            <strong>Color</strong>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="tray-color" style={{ background: `#${spool.filament.color_hex}` }} />
              #{spool.filament.color_hex}
            </span>
          </div>
        )}
        <div><strong>Tray</strong> <span>{trayLabel} · {printerName}</span></div>
      </div>
      <div className="wizard-actions wizard-actions--center">
        <button className="btn btn-primary" onClick={onPrint}>Print Label Now</button>
        <button className="btn btn-secondary" onClick={onReset}>Register Another</button>
      </div>
    </div>
  )
}
