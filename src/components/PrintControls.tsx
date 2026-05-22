import type { LabelSettings } from '../lib/label'
import type { PrinterSettings } from '../lib/printer'

interface Props {
  labelSettings: LabelSettings
  printerSettings: PrinterSettings
  connected: boolean
  printing: boolean
  canPrint: boolean
  onLabelChange: (s: LabelSettings) => void
  onPrinterChange: (s: PrinterSettings) => void
  onConnect: () => void
  onDisconnect: () => void
  onPrint: () => void
}

export function PrintControls({
  labelSettings,
  printerSettings,
  connected,
  printing,
  canPrint,
  onLabelChange,
  onPrinterChange,
  onConnect,
  onDisconnect,
  onPrint,
}: Props) {
  return (
    <div className="card">
      <div className="card-header">Print Settings</div>
      <div className="controls-body">

        {/* Label size */}
        <div className="field-group">
          <label>Label Size (mm)</label>
          <div className="field-row">
            <input
              type="number" min={10} max={120} step={1}
              value={labelSettings.widthMm}
              onChange={(e) => onLabelChange({ ...labelSettings, widthMm: Number(e.target.value) })}
              placeholder="Width"
            />
            <input
              type="number" min={10} max={120} step={1}
              value={labelSettings.heightMm}
              onChange={(e) => onLabelChange({ ...labelSettings, heightMm: Number(e.target.value) })}
              placeholder="Height"
            />
          </div>
        </div>

        <div className="field-group">
          <label>DPI (dots/mm)</label>
          <input
            type="number" min={4} max={12} step={0.5}
            value={labelSettings.dpi}
            onChange={(e) => onLabelChange({ ...labelSettings, dpi: Number(e.target.value) })}
          />
        </div>

        <div className="field-group">
          <label>QR Code Size (% of label width)</label>
          <input
            type="range" min={30} max={90} step={5}
            value={labelSettings.qrSizePct}
            onChange={(e) => onLabelChange({ ...labelSettings, qrSizePct: Number(e.target.value) })}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {labelSettings.qrSizePct}%
          </span>
        </div>

        <div className="field-group">
          <label>Text Block Width (% of label width)</label>
          <input
            type="range" min={20} max={90} step={5}
            value={labelSettings.textSizePct}
            onChange={(e) => onLabelChange({ ...labelSettings, textSizePct: Number(e.target.value) })}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {labelSettings.textSizePct}%
          </span>
        </div>

        <div className="field-group">
          <label>Spoolman URL</label>
          <input
            type="url"
            value={labelSettings.spoolUrlBase}
            onChange={(e) => onLabelChange({ ...labelSettings, spoolUrlBase: e.target.value })}
          />
        </div>

        <hr className="controls-divider" />

        <div className="field-group">
          <label>Paper Type</label>
          <select
            value={printerSettings.paperType}
            onChange={(e) => onPrinterChange({ ...printerSettings, paperType: Number(e.target.value) })}
          >
            <option value={1}>1 — Continuous</option>
            <option value={2}>2 — Gap</option>
            <option value={4}>4 — Black Mark</option>
            <option value={5}>5 — Transparent</option>
          </select>
        </div>

        <div className="field-row">
          <div className="field-group">
            <label>Gap (mm)</label>
            <input
              type="number" min={2} max={8} step={1}
              value={printerSettings.gap}
              onChange={(e) => onPrinterChange({ ...printerSettings, gap: Number(e.target.value) })}
            />
          </div>
          <div className="field-group">
            <label>Speed</label>
            <input
              type="number" min={20} max={60} step={5}
              value={printerSettings.speed}
              onChange={(e) => onPrinterChange({ ...printerSettings, speed: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="field-group">
          <label>Deepness (darkness)</label>
          <input
            type="range" min={1} max={7} step={1}
            value={printerSettings.deepness}
            onChange={(e) => onPrinterChange({ ...printerSettings, deepness: Number(e.target.value) })}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {printerSettings.deepness} / 7
          </span>
        </div>

        <hr className="controls-divider" />

        {/* Printer connection */}
        <div className="btn-group">
          {!connected ? (
            <button className="btn btn-primary btn-full" onClick={onConnect} disabled={printing}>
              Connect Printer
            </button>
          ) : (
            <button className="btn btn-danger" onClick={onDisconnect} disabled={printing}>
              Disconnect
            </button>
          )}
        </div>

        <button
          className="btn btn-primary btn-full"
          onClick={onPrint}
          disabled={!connected || !canPrint || printing}
        >
          {printing ? 'Printing…' : 'Print Label'}
        </button>

      </div>
    </div>
  )
}
