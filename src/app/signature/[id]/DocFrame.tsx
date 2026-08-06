'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Affiche le document (rendu par un modèle, souvent à largeur fixe type A4) dans une iframe.
 * Sur mobile, le document est mis à l'échelle pour tenir dans la largeur de l'écran
 * (scale-to-fit) au lieu de déborder — sinon on ne voyait que le coin haut-gauche.
 */
export default function DocFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [scale, setScale] = useState(1)

  // Mesure la taille naturelle du document.
  const measure = useCallback(() => {
    const doc = ref.current?.contentWindow?.document
    if (!doc || !doc.body) return
    const w = Math.max(doc.body.scrollWidth, doc.documentElement.scrollWidth)
    const h = Math.max(doc.body.scrollHeight, doc.body.getBoundingClientRect().height)
    if (w > 0 && h > 0) setNat(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
  }, [])

  // srcDoc n'appelle pas toujours onLoad de façon fiable → on mesure aussi après montage.
  useEffect(() => {
    const ids = [40, 200, 600].map(d => setTimeout(measure, d))
    return () => ids.forEach(clearTimeout)
  }, [measure, html])

  // Recalcule l'échelle pour tenir dans la largeur disponible (au chargement + au resize).
  useEffect(() => {
    function fit() {
      const wrap = wrapRef.current
      if (!wrap || !nat) return
      const cw = wrap.clientWidth
      setScale(nat.w > cw ? cw / nat.w : 1)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [nat])

  const height = nat ? Math.round(nat.h * scale) : 1100

  return (
    <div ref={wrapRef} className="rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm" style={{ height }}>
      <iframe
        ref={ref}
        srcDoc={html}
        onLoad={measure}
        title="Document"
        scrolling="no"
        className="block border-0"
        style={nat
          ? { width: nat.w, height: nat.h, transform: `scale(${scale})`, transformOrigin: 'top left' }
          : { width: '100%', height: 1100 }}
      />
    </div>
  )
}
