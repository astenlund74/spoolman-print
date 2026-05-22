export interface Vendor {
  id: number
  registered: string
  name: string
  comment?: string
  empty_spool_weight?: number
  extra: Record<string, string>
}

export interface Filament {
  id: number
  registered: string
  name?: string
  vendor?: Vendor
  material?: string
  price?: number
  density?: number
  diameter: number
  weight?: number
  spool_weight?: number
  article_number?: string
  comment?: string
  settings_extruder_temp?: number
  settings_bed_temp?: number
  color_hex?: string
  multi_color_hexes?: string
  multi_color_direction?: string
  external_id?: string
  finish?: string
  pattern?: string
  extra: Record<string, string>
}

export interface Spool {
  id: number
  registered: string
  first_used?: string
  last_used?: string
  filament: Filament
  price?: number
  initial_weight?: number
  spool_weight?: number
  remaining_weight?: number
  used_weight?: number
  remaining_length?: number
  used_length?: number
  location?: string
  lot_nr?: string
  comment?: string
  archived: boolean
  extra: Record<string, string>
}
