function clamp(n: number) { return Math.max(0, Math.min(255, n)) }

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function mix(hex: string, target: 'white' | 'black', amount: number) {
  const { r, g, b } = hexToRgb(hex)
  const t = target === 'white' ? 255 : 0
  const m = (c: number) => clamp(Math.round(c + (t - c) * amount))
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`
}

/** Fond dégradé fluide + grain léger, calculé à partir d'une seule couleur de base. */
export function FluidTexture({ color }: { color: string }) {
  const light = mix(color, 'white', 0.32)
  const light2 = mix(color, 'white', 0.18)
  const dark = mix(color, 'black', 0.22)

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background: [
            `radial-gradient(130% 110% at 105% -10%, ${light} 0%, transparent 55%)`,
            `radial-gradient(90% 100% at 90% 75%, ${dark} 0%, transparent 50%)`,
            `radial-gradient(100% 90% at -10% 105%, ${light2} 0%, transparent 55%)`,
          ].join(', '),
        }}
      />
      <svg className="absolute inset-0 w-full h-full mix-blend-overlay opacity-[0.15]">
        <filter id="fluid-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#fluid-grain)" />
      </svg>
    </div>
  )
}
