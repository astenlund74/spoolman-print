/**
 * Minimal client for the Open Filament Database static JSON API.
 * https://api.openfilamentdatabase.org/
 *
 * Used to resolve a color name from a vendor + product line + hex color.
 */

const OFD_BASE = 'https://api.openfilamentdatabase.org/api/v1'

/** "Bambu Lab" → "bambu_lab" */
function toBrandSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

/** "PLA" → "pla",  "PETG-CF" → "petg_cf" */
function toMaterialSlug(material: string): string {
  return material.toLowerCase().replace(/[-\s]+/g, '_').replace(/[^a-z0-9_]/g, '')
}

/**
 * Derive filament slug from product line + material.
 * "PLA Matte" + "PLA" → "matte"
 * "PETG Basic" + "PETG" → "basic"
 * "PLA-CF"    + "PLA-CF" → "" (nothing after stripping)
 */
function toFilamentSlug(productLine: string, material: string): string {
  const stripped = productLine.replace(new RegExp(`^${material}[\\s-]*`, 'i'), '').trim()
  return stripped.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

/** Parse hex string (with or without alpha, with or without #) to [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').slice(0, 6).padEnd(6, '0')
  const n = parseInt(h, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
}

interface OFDVariant {
  name: string
  color_hex: string
  slug: string
  discontinued?: boolean
}

interface OFDFilamentIndex {
  variants?: OFDVariant[]
}

/**
 * Try to resolve a human-readable color name from the Open Filament Database.
 *
 * @param vendorName  Spoolman vendor name, e.g. "Bambu Lab"
 * @param productLine Extracted product line, e.g. "PLA Matte" or "PETG Basic"
 * @param material    Material string from AMS, e.g. "PLA", "PETG"
 * @param colorHex    Hex color from AMS, e.g. "#9B9EA0FF" (alpha stripped internally)
 * @returns Color name like "Ash Gray", or null if not found / no close match
 */
export async function lookupColorName(
  vendorName: string,
  productLine: string,
  material: string,
  colorHex: string,
): Promise<string | null> {
  const brandSlug = toBrandSlug(vendorName)
  const materialSlug = toMaterialSlug(material)
  const filamentSlug = toFilamentSlug(productLine, material)

  if (!brandSlug || !materialSlug || !filamentSlug) return null

  const url = `${OFD_BASE}/brands/${brandSlug}/materials/${materialSlug}/filaments/${filamentSlug}/index.json`

  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data: OFDFilamentIndex = await res.json()
    const variants = data.variants?.filter(v => !v.discontinued) ?? []
    if (!variants.length) return null

    let best: OFDVariant | null = null
    let bestDist = Infinity
    for (const v of variants) {
      const dist = colorDistance(colorHex, v.color_hex)
      if (dist < bestDist) {
        bestDist = dist
        best = v
      }
    }

    // Accept match only when colour is within reasonable RGB distance (~30 units)
    return best && bestDist < 30 ? best.name : null
  } catch {
    return null
  }
}
