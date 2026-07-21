'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Check, FileText, Receipt, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { DOC_TEMPLATES, DEFAULT_TEMPLATE, renderDocument, sampleDocData } from '@/lib/doc-templates'

export default function ModeleDocumentPage() {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_TEMPLATE)
  const [current, setCurrent] = useState<string>(DEFAULT_TEMPLATE)
  const [docType, setDocType] = useState<'devis' | 'facture'>('devis')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoaded(true); return }
      supabase.from('companies').select('template_style').eq('user_id', user.id).single().then(({ data }) => {
        const tid = data?.template_style?.template_id
        if (tid && DOC_TEMPLATES[tid]) { setSelectedId(tid); setCurrent(tid) }
        setLoaded(true)
      })
    })
  }, [])

  const sample = useMemo(() => sampleDocData(docType), [docType])
  const templates = Object.values(DOC_TEMPLATES)
  const bigPreview = useMemo(() => renderDocument(selectedId, sample), [selectedId, sample])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/modele/choisir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: selectedId }),
      })
      if (!res.ok) throw new Error()
      setCurrent(selectedId)
      toast.success(`Modèle « ${DOC_TEMPLATES[selectedId]?.name} » appliqué`)
      router.refresh()
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <Link href="/parametres">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2"><ArrowLeft className="w-4 h-4" /> Paramètres</Button>
      </Link>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold font-heading text-marine">Modèle de document</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Le style de vos devis et factures — c&apos;est ce que le client voit et signe en ligne. Seuls les textes changent : vos infos, votre logo, le client.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          <button onClick={() => setDocType('devis')}
            className={`px-3 h-9 text-sm font-medium gap-1.5 inline-flex items-center ${docType === 'devis' ? 'bg-accent text-primary' : 'text-gray-500 hover:bg-gray-50'}`}>
            <FileText className="w-4 h-4" /> Devis
          </button>
          <button onClick={() => setDocType('facture')}
            className={`px-3 h-9 text-sm font-medium gap-1.5 inline-flex items-center border-l border-gray-200 ${docType === 'facture' ? 'bg-accent text-primary' : 'text-gray-500 hover:bg-gray-50'}`}>
            <Receipt className="w-4 h-4" /> Facture
          </button>
        </div>
      </div>

      {!loaded ? (
        <div className="py-16 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : (
        <div className="grid lg:grid-cols-[300px_1fr] gap-5 items-start">
          <div className="space-y-3">
            {templates.map(t => {
              const isSel = selectedId === t.id
              const isCurrent = current === t.id
              return (
                <button key={t.id} onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left rounded-xl border-2 overflow-hidden transition-all ${isSel ? 'border-primary shadow-[var(--shadow-md)]' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="h-40 bg-gray-100 overflow-hidden relative">
                    <ThumbFrame html={renderDocument(t.id, sample)} />
                    {isCurrent && (
                      <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-[#3F7A2E] text-white text-[10px] font-semibold px-2 py-0.5">
                        <Check className="w-3 h-3" /> Actuel
                      </span>
                    )}
                  </div>
                  <div className="p-3 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.accent }} />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-marine">{t.name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{t.description}</p>
                    </div>
                    {isSel && <Check className="w-4 h-4 text-primary ml-auto flex-shrink-0" />}
                  </div>
                </button>
              )
            })}
            <p className="text-[11px] text-gray-400 px-1">D&apos;autres modèles arrivent bientôt.</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Badge className="bg-accent text-primary border-0">{DOC_TEMPLATES[selectedId]?.name}</Badge>
                <span className="text-xs text-gray-400">Aperçu {docType}</span>
              </div>
              <Button onClick={save} disabled={saving || selectedId === current} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {selectedId === current ? 'Modèle appliqué' : `Appliquer « ${DOC_TEMPLATES[selectedId]?.name} »`}
              </Button>
            </div>
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 p-3">
              <BigFrame html={bigPreview} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Vignette : le modèle rendu, réduit pour tenir dans la carte. */
function ThumbFrame({ html }: { html: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <iframe srcDoc={html} title="" scrolling="no"
        style={{ width: '794px', height: '1123px', border: 0, transform: 'scale(0.28)', transformOrigin: 'top left' }} />
    </div>
  )
}

/** Grand aperçu, hauteur ajustée au contenu. */
function BigFrame({ html }: { html: string }) {
  const [h, setH] = useState(1100)
  return (
    <iframe srcDoc={html} title="Aperçu" scrolling="no"
      onLoad={e => {
        const d = (e.target as HTMLIFrameElement).contentWindow?.document
        const height = d?.documentElement?.scrollHeight
        if (height) setH(height + 2)
      }}
      className="w-full block rounded-lg bg-white shadow-sm" style={{ height: h, border: 0 }} />
  )
}
