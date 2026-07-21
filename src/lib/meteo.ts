// Météo chantier — 100% APIs publiques gratuites, sans clé :
//  - géocodage : api-adresse.data.gouv.fr (adresses FR)
//  - prévisions : api.open-meteo.com (modèle météo européen)
// Sert à l'alerte "chantier extérieur + météo dégradée → proposer un décalage".

export type WeatherRisk = 'ok' | 'pluie' | 'gel' | 'vent' | 'neige'

export interface DayWeather {
  date: string // YYYY-MM-DD
  tMin: number
  tMax: number
  precip: number // mm cumulés
  precipProb: number // % max sur la journée
  wind: number // km/h rafales max
  code: number // WMO weather code
  risk: WeatherRisk
  bad: boolean // vrai si déconseillé pour un chantier extérieur
  label: string // court, ex "Pluie 8mm"
  emoji: string
}

// Horizon de prévision fiable d'Open-Meteo qu'on exploite.
export const FORECAST_DAYS = 7

// ── Géocodage ────────────────────────────────────────────────────────────
export async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  const q = address.trim()
  if (q.length < 4) return null
  try {
    const url = new URL('https://api-adresse.data.gouv.fr/search/')
    url.searchParams.set('q', q)
    url.searchParams.set('limit', '1')
    const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 60 * 60 * 24 * 30 } })
    if (!res.ok) return null
    const json = await res.json()
    const feat = json?.features?.[0]
    const coords = feat?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) return null
    // GeoJSON = [lon, lat]
    return { lon: Number(coords[0]), lat: Number(coords[1]) }
  } catch {
    return null
  }
}

// ── Classification du risque pour un chantier extérieur ──────────────────
function classify(precip: number, precipProb: number, wind: number, tMin: number, code: number): { risk: WeatherRisk; bad: boolean } {
  // Codes WMO neige : 71-77, 85-86
  const isSnow = (code >= 71 && code <= 77) || code === 85 || code === 86
  if (isSnow || (tMin <= 0 && precip >= 1)) return { risk: 'neige', bad: true }
  if (tMin <= -1) return { risk: 'gel', bad: true }
  if (precip >= 5 || (precip >= 1 && precipProb >= 70)) return { risk: 'pluie', bad: true }
  if (wind >= 60) return { risk: 'vent', bad: true }
  // Risque léger, non bloquant
  if (precip >= 1 || precipProb >= 60) return { risk: 'pluie', bad: false }
  if (wind >= 45) return { risk: 'vent', bad: false }
  return { risk: 'ok', bad: false }
}

const RISK_META: Record<WeatherRisk, { emoji: string; word: string }> = {
  ok: { emoji: '☀️', word: 'Dégagé' },
  pluie: { emoji: '🌧️', word: 'Pluie' },
  gel: { emoji: '❄️', word: 'Gel' },
  vent: { emoji: '💨', word: 'Vent' },
  neige: { emoji: '🌨️', word: 'Neige' },
}

export function riskEmoji(risk: WeatherRisk) { return RISK_META[risk].emoji }
export function riskWord(risk: WeatherRisk) { return RISK_META[risk].word }

// ── Prévisions ───────────────────────────────────────────────────────────
export async function fetchForecast(lat: number, lon: number): Promise<DayWeather[]> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lon))
    url.searchParams.set('daily', 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,windgusts_10m_max')
    url.searchParams.set('forecast_days', String(FORECAST_DAYS))
    url.searchParams.set('timezone', 'Europe/Paris')
    // Prévisions rafraîchies ~toutes les 3h côté modèle : un cache court suffit.
    const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 60 * 60 * 3 } })
    if (!res.ok) return []
    const j = await res.json()
    const d = j?.daily
    if (!d?.time) return []
    return d.time.map((date: string, i: number): DayWeather => {
      const precip = Number(d.precipitation_sum?.[i] ?? 0)
      const precipProb = Number(d.precipitation_probability_max?.[i] ?? 0)
      const wind = Number(d.windgusts_10m_max?.[i] ?? 0)
      const tMin = Number(d.temperature_2m_min?.[i] ?? 0)
      const tMax = Number(d.temperature_2m_max?.[i] ?? 0)
      const code = Number(d.weathercode?.[i] ?? 0)
      const { risk, bad } = classify(precip, precipProb, wind, tMin, code)
      const label = risk === 'ok'
        ? `${Math.round(tMax)}°`
        : risk === 'pluie' ? `Pluie ${precip.toFixed(precip < 10 ? 1 : 0)}mm`
        : risk === 'vent' ? `Rafales ${Math.round(wind)} km/h`
        : risk === 'gel' ? `Gel ${Math.round(tMin)}°`
        : `Neige`
      return { date, tMin, tMax, precip, precipProb, wind, code, risk, bad, label, emoji: RISK_META[risk].emoji }
    })
  } catch {
    return []
  }
}

// Regroupe plusieurs coordonnées en une seule série par clé arrondie
// (évite de rappeler l'API pour deux chantiers très proches).
export function coordKey(lat: number, lon: number) {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`
}
