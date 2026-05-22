import { useCallback, useEffect, useRef, useState } from 'react'
import { SpoolList } from './components/SpoolList'
import { LabelPreview } from './components/LabelPreview'
import { PrintControls } from './components/PrintControls'
import { RegisterSpool } from './components/RegisterSpool'
import { fetchSpools } from './lib/spoolman'
import { Printer, DEFAULT_PRINTER_SETTINGS } from './lib/printer'
import type { PrinterSettings } from './lib/printer'
import type { LabelSettings } from './lib/label'
import { renderLabel } from './lib/label'
import type { Spool } from './types/spoolman'

const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  widthMm: 40,
  heightMm: 30,
  dpi: 8,
  spoolUrlBase: 'http://spoolman.local',
  qrSizePct: 60,
  textSizePct: 50,
}

function loadLabelSettings(): LabelSettings {
  try {
    const raw = localStorage.getItem('labelSettings')
    if (raw) return { ...DEFAULT_LABEL_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_LABEL_SETTINGS
}

export function App() {
  const [view, setView] = useState<'print' | 'register'>('print')
  const [spools, setSpools] = useState<Spool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSpool, setSelectedSpool] = useState<Spool | null>(null)
  const [connected, setConnected] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [status, setStatus] = useState('Ready')
  const [labelSettings, setLabelSettings] = useState<LabelSettings>(loadLabelSettings)
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>(DEFAULT_PRINTER_SETTINGS)

  const printerRef = useRef(new Printer())

  // Persist label settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('labelSettings', JSON.stringify(labelSettings))
  }, [labelSettings])

  // Load spools on mount
  const loadSpools = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchSpools()
      .then(setSpools)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadSpools() }, [])

  // Sync label dims into printer settings
  useEffect(() => {
    setPrinterSettings((prev) => ({
      ...prev,
      widthMm: labelSettings.widthMm,
      heightMm: labelSettings.heightMm,
      dpi: labelSettings.dpi,
    }))
  }, [labelSettings.widthMm, labelSettings.heightMm, labelSettings.dpi])

  const handleConnect = useCallback(async () => {
    try {
      setStatus('Connecting…')
      await printerRef.current.connect(() => {
        setConnected(false)
        setStatus('Printer disconnected')
      })
      setConnected(true)
      setStatus('Printer connected')
    } catch (e: unknown) {
      setStatus(`Connect error: ${(e as Error).message}`)
    }
  }, [])

  const handleDisconnect = useCallback(() => {
    printerRef.current.disconnect()
    setConnected(false)
    setStatus('Disconnected')
  }, [])

  const handlePrintNewSpool = useCallback((spool: Spool) => {
    setSpools(prev => prev.some(s => s.id === spool.id) ? prev : [spool, ...prev])
    setSelectedSpool(spool)
    setView('print')
    loadSpools()
  }, [loadSpools])

  const handlePrint = useCallback(async () => {
    if (!selectedSpool) return
    setPrinting(true)
    try {
      const canvas = await renderLabel(selectedSpool, labelSettings)
      await printerRef.current.print(canvas, printerSettings, setStatus)
    } catch (e: unknown) {
      setStatus(`Print error: ${(e as Error).message}`)
    } finally {
      setPrinting(false)
    }
  }, [selectedSpool, labelSettings, printerSettings])

  return (
    <>
      <nav className="navbar">
        <span className="navbar-title">Spoolman Print</span>
        <div className={`conn-dot${connected ? ' connected' : ''}`} title={connected ? 'Connected' : 'Not connected'} />
        <span className="navbar-status">{status}</span>
      </nav>
      <div className="view-tabs">
        <button
          className={`view-tab${view === 'print' ? ' active' : ''}`}
          onClick={() => { setView('print'); if (view === 'register') loadSpools() }}
        >
          Print Spool Label
        </button>
        <button
          className={`view-tab${view === 'register' ? ' active' : ''}`}
          onClick={() => setView('register')}
        >
          Register New Spool
        </button>
      </div>
      {view === 'print' ? (
        <div className="layout">
          <SpoolList
            spools={spools}
            loading={loading}
            error={error}
            selectedId={selectedSpool?.id ?? null}
            onSelect={setSelectedSpool}
          />
          <LabelPreview spool={selectedSpool} labelSettings={labelSettings} />
          <PrintControls
            labelSettings={labelSettings}
            printerSettings={printerSettings}
            connected={connected}
            printing={printing}
            canPrint={selectedSpool !== null}
            onLabelChange={setLabelSettings}
            onPrinterChange={setPrinterSettings}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onPrint={handlePrint}
          />
        </div>
      ) : (
        <RegisterSpool onPrintSpool={handlePrintNewSpool} spools={spools} />
      )}
    </>
  )
}
