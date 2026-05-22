/**
 * Tray data as enriched and returned by SpoolmanSync's /api/printers endpoint.
 * HA-sourced fields use snake_case; SpoolmanSync-added fields may be camelCase.
 * Both naming variants are included for robustness until confirmed against the live API.
 */
export interface HATray {
  /** HA entity_id, e.g. "sensor.x1c_abc123_tray_1_2" */
  entity_id: string
  /** Stable HA registry unique_id — preferred for SpoolmanSync mapping calls */
  unique_id?: string
  tray_number: number
  is_external?: boolean
  /** Filament name from AMS RFID tag, or "Empty" when no spool is loaded */
  name?: string
  /** Hex color, with or without leading "#" */
  color?: string
  /** Material reported by the AMS, e.g. "PLA", "PETG" */
  material?: string
  /** Bambu spool RFID serial number — stored as extra.tag in Spoolman for auto-match */
  tray_uuid?: string
  remaining_weight?: number
  /** AMS unit name injected during normalisation, e.g. "AMS 1" */
  ams_unit_name?: string
  /** Set by SpoolmanSync when a Spoolman spool is assigned to this tray */
  assigned_spool?: AssignedSpool | null
  /** camelCase alias — SpoolmanSync may use either naming */
  assignedSpool?: AssignedSpool | null
  /** Present when AMS-reported material/color doesn't match the assigned Spoolman spool */
  mismatch?: TrayMismatch | null
}

export interface TrayMismatch {
  type: string
  printerReports: { material?: string; color?: string }
  spoolmanHas: { material?: string; color?: string }
  message: string
}

export interface AssignedSpool {
  id: number
  filament?: {
    name?: string
    vendor?: { name: string }
    material?: string
  }
}

export interface HAPrinter {
  id: string
  name: string
  trays: HATray[]
}
