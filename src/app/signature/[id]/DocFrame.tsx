'use client'

import { useRef, useState } from 'react'

/**
 * Affiche le document (rendu par un modèle) dans une iframe isolée : ses styles
 * (police, cartes, couleurs) ne peuvent pas entrer en conflit avec la page.
 * La hauteur s'ajuste au contenu réel une fois chargé.
 */
export default function DocFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(1100)

  function onLoad() {
    const doc = ref.current?.contentWindow?.document
    if (doc) {
      // +2px : évite une barre de défilement due à l'arrondi
      const h = doc.documentElement.scrollHeight || doc.body.scrollHeight
      if (h) setHeight(h + 2)
    }
  }

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
      <iframe
        ref={ref}
        srcDoc={html}
        onLoad={onLoad}
        title="Document"
        className="w-full block"
        style={{ height }}
        scrolling="no"
      />
    </div>
  )
}
