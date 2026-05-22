import { useEffect, useRef } from 'react'
import type { Spool } from '../types/spoolman'
import type { LabelSettings } from '../lib/label'
import { renderLabel } from '../lib/label'

interface Props {
  spool: Spool | null
  labelSettings: LabelSettings
}

export function LabelPreview({ spool, labelSettings }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!spool || !canvasRef.current) return
    let cancelled = false
    renderLabel(spool, labelSettings).then((offscreen) => {
      if (cancelled || !canvasRef.current) return
      const dst = canvasRef.current
      dst.width = offscreen.width
      dst.height = offscreen.height
      dst.getContext('2d')!.drawImage(offscreen, 0, 0)
    })
    return () => { cancelled = true }
  }, [spool, labelSettings])

  const scale = 3
  const widthPx = Math.round(labelSettings.widthMm * labelSettings.dpi)
  const heightPx = Math.round(labelSettings.heightMm * labelSettings.dpi)

  return (
    <div className="card preview-panel">
      <div className="card-header">Label Preview</div>
      <div className="preview-body">
        {spool ? (
          <canvas
            ref={canvasRef}
            className="preview-canvas"
            width={widthPx}
            height={heightPx}
            style={{ width: widthPx * scale, height: heightPx * scale }}
          />
        ) : (
          <div className="preview-placeholder">Select a spool to preview the label</div>
        )}
      </div>
    </div>
  )
}
