'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Mail, RefreshCw, Trash2, Reply, Send, Mic, MicOff, Sparkles, Loader2, Download } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

const TABS = [
  { key: 'all', label: 'Tout', categories: null },
  { key: 'client', label: 'Clients', categories: ['demande_devis', 'client_a_repondre', 'relance_client'] },
  { key: 'devis', label: 'Devis', categories: ['demande_devis'] },
  { key: 'facture', label: 'Factures', categories: ['facture_recue'] },
  { key: 'fournisseur', label: 'Fournisseurs', categories: ['fournisseur', 'document_admin'] },
  { key: 'pub', label: 'Pubs', categories: ['pub_newsletter', 'spam'] },
]

const importanceBorder: Record<string, string> = {
  urgent: 'border-l-red-500', important: 'border-l-orange-400',
  normal: 'border-l-blue-300', faible: 'border-l-gray-200', ignorer: 'border-l-gray-100',
}
const categoryLabel: Record<string, string> = {
  demande_devis: '📋 Devis', client_a_repondre: '💬 Client',
  relance_client: '🔔 Relance', fournisseur: '📦 Fournisseur',
  facture_recue: '🧾 Facture', document_admin: '📄 Admin',
  pub_newsletter: '📣 Pub', spam: '🗑️ Spam',
  personnel: '👤 Perso', a_verifier: '❓ À vérifier',
}

type ImportState = {
  open: boolean
  phase: 'idle' | 'scanning' | 'processing' | 'done' | 'error'
  message: string
  found: number
  toProcess: number
  processed: number
  synced: number
}

const defaultImport: ImportState = {
  open: false, phase: 'idle', message: '', found: 0, toProcess: 0, processed: 0, synced: 0,
}

export default function EmailsPage() {
  const [emails, setEmails] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [connected, setConnected] = useState(false)
  const [replyEmail, setReplyEmail] = useState<any>(null)
  const [draft, setDraft] = useState('')
  const [intent, setIntent] = useState('')
  const [draftLoading, setDraftLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [importState, setImportState] = useState<ImportState>(defaultImport)
  const recognitionRef = useRef<any>(null)
  const abortRef = useRef<AbortController | null>(null)

  const loadEmails = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: conn } = await supabase.from('gmail_connections').select('gmail_email').eq('user_id', user.id).maybeSingle()
    setConnected(!!conn?.gmail_email)
    const { data } = await supabase.from('emails').select('*').eq('user_id', user.id)
      .neq('status', 'supprime').order('received_at', { ascending: false }).limit(200)
    setEmails(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadEmails() }, [loadEmails])

  // Auto-sync toutes les 5 minutes quand la page est visible
  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/gmail/sync', { method: 'POST' })
        const json = await res.json()
        if (res.ok && json.synced > 0) {
          toast.info(`${json.synced} nouveau${json.synced > 1 ? 'x' : ''} email${json.synced > 1 ? 's' : ''}`)
          await loadEmails()
        }
      } catch {}
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [loadEmails])

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) toast.error(json.error || 'Erreur')
      else if (json.synced === 0) toast.info(json.message || 'Pas de nouveaux emails')
      else { toast.success(`${json.synced} email${json.synced > 1 ? 's' : ''} récupéré${json.synced > 1 ? 's' : ''}`); await loadEmails() }
    } catch { toast.error('Erreur réseau') }
    setSyncing(false)
  }

  async function startImportAll() {
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setImportState({ open: true, phase: 'scanning', message: 'Connexion à Gmail...', found: 0, toProcess: 0, processed: 0, synced: 0 })

    try {
      const res = await fetch('/api/gmail/sync-all', { signal: ctrl.signal })
      if (!res.ok || !res.body) { setImportState(s => ({ ...s, phase: 'error', message: 'Erreur serveur' })); return }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6))
            setImportState(s => {
              if (ev.type === 'scanning') return { ...s, phase: 'scanning', found: ev.found, message: `Scan en cours... ${ev.found} emails trouvés` }
              if (ev.type === 'found') return { ...s, found: ev.total, message: `${ev.total} emails dans la boîte` }
              if (ev.type === 'toprocess') return { ...s, toProcess: ev.count, phase: 'processing', message: `${ev.count} nouveaux emails à importer` }
              if (ev.type === 'progress') return { ...s, processed: ev.processed, synced: ev.synced, message: `Traitement ${ev.processed}/${ev.total}...` }
              if (ev.type === 'done') return { ...s, phase: 'done', synced: ev.synced, message: ev.message || `${ev.synced} emails importés avec succès !` }
              if (ev.type === 'error') return { ...s, phase: 'error', message: ev.message || 'Erreur' }
              return s
            })
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setImportState(s => ({ ...s, phase: 'error', message: 'Erreur réseau' }))
      }
    }
  }

  function cancelImport() {
    abortRef.current?.abort()
    setImportState(defaultImport)
  }

  async function closeImport() {
    setImportState(defaultImport)
    if (importState.synced > 0) await loadEmails()
  }

  async function handleTrash(email: any) {
    const res = await fetch('/api/gmail/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailId: email.id, gmailMessageId: email.gmail_message_id }),
    })
    if (res.ok) { toast.success('Email supprimé'); setEmails(prev => prev.filter(e => e.id !== email.id)) }
    else toast.error('Erreur suppression')
  }

  async function openReply(email: any) {
    setReplyEmail(email); setDraft(''); setIntent(''); setDraftLoading(true)
    try {
      const res = await fetch('/api/gmail/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: email.id }),
      })
      const json = await res.json()
      setDraft(json.draft || '')
    } catch { toast.error('Erreur génération brouillon') }
    setDraftLoading(false)
  }

  async function regenerateDraft() {
    if (!replyEmail) return
    setDraftLoading(true)
    try {
      const res = await fetch('/api/gmail/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: replyEmail.id, userIntent: intent }),
      })
      const json = await res.json()
      setDraft(json.draft || '')
    } catch { toast.error('Erreur') }
    setDraftLoading(false)
  }

  async function handleSend() {
    if (!replyEmail || !draft) return
    setSending(true)
    const res = await fetch('/api/gmail/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailId: replyEmail.id, to: replyEmail.from_email, body: draft }),
    })
    if (res.ok) {
      toast.success('Email envoyé !')
      setEmails(prev => prev.map(e => e.id === replyEmail.id ? { ...e, status: 'traite' } : e))
      setReplyEmail(null)
    } else {
      const json = await res.json()
      toast.error(json.error || 'Erreur envoi')
    }
    setSending(false)
  }

  function toggleVoice() {
    if (recording) { recognitionRef.current?.stop(); setRecording(false); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { toast.error('Reconnaissance vocale non supportée'); return }
    const r = new SR()
    r.lang = 'fr-FR'; r.continuous = false; r.interimResults = false
    r.onresult = (e: any) => {
      const t = e.results[0][0].transcript
      setIntent(prev => prev ? `${prev} ${t}` : t)
    }
    r.onend = () => setRecording(false)
    r.onerror = () => { toast.error('Erreur micro'); setRecording(false) }
    recognitionRef.current = r; r.start(); setRecording(true)
  }

  const tab = TABS.find(t => t.key === activeTab)
  const filtered = !tab?.categories ? emails : emails.filter(e => tab.categories!.includes(e.category))
  const counts: Record<string, number> = {}
  TABS.forEach(t => { counts[t.key] = !t.categories ? emails.length : emails.filter(e => t.categories!.includes(e.category)).length })

  const progressPct = importState.toProcess > 0 ? Math.round((importState.processed / importState.toProcess) * 100) : 0

  if (!connected && !loading) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mes mails</h1>
      <Card><CardContent className="py-12 text-center">
        <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="font-medium text-gray-700 mb-4">Gmail non connecté</p>
        <Link href="/parametres/gmail"><Button>Connecter Gmail</Button></Link>
      </CardContent></Card>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Mes mails</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => startImportAll()} disabled={importState.open} className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50">
            <Download className="w-4 h-4" />
            Importer tout Gmail
          </Button>
          <Button variant="outline" onClick={handleSync} disabled={syncing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sync...' : 'Actualiser'}
          </Button>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            {counts[t.key] > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${activeTab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-gray-500">
          <Mail className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p className="font-medium mb-1">Aucun email ici</p>
          <p className="text-sm mb-4">Cliquez sur "Importer tout Gmail" pour charger votre historique</p>
          <Button variant="outline" onClick={handleSync} disabled={syncing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            Charger les 48 dernières heures
          </Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(email => (
            <Card key={email.id} className={`border-l-4 transition-shadow hover:shadow-md ${importanceBorder[email.importance] || 'border-l-gray-200'} ${email.status === 'traite' ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{email.from_name || email.from_email}</span>
                      {email.category && <span className="text-xs text-gray-400">{categoryLabel[email.category]}</span>}
                      {email.importance === 'urgent' && <Badge className="bg-red-100 text-red-700 text-xs">Urgent</Badge>}
                      {email.status === 'traite' && <Badge className="bg-green-100 text-green-700 text-xs">Répondu</Badge>}
                    </div>
                    <p className="text-sm font-medium text-gray-800 truncate">{email.subject}</p>
                    {email.ai_summary && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{email.ai_summary}</p>}
                    {email.ai_recommended_action && <p className="text-xs text-blue-600 mt-1">→ {email.ai_recommended_action}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400">
                      {email.received_at && new Date(email.received_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-8 px-2 gap-1 text-xs border-blue-200 text-blue-600 hover:bg-blue-50" onClick={() => openReply(email)}>
                        <Reply className="w-3 h-3" /> Répondre
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 px-2 text-red-500 border-red-100 hover:bg-red-50" onClick={() => handleTrash(email)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog import complet */}
      <Dialog open={importState.open} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Import de l'historique Gmail</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-600">{importState.message}</p>

            {importState.phase === 'scanning' && (
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600 flex-shrink-0" />
                <div className="text-sm text-gray-500">
                  {importState.found > 0 ? `${importState.found} emails trouvés...` : 'Analyse de votre boîte...'}
                </div>
              </div>
            )}

            {importState.phase === 'processing' && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{importState.processed} / {importState.toProcess} traités</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div className="bg-purple-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="text-xs text-gray-400">
                  {importState.synced} importés · Les emails récents sont analysés par IA, les anciens par mots-clés
                </p>
              </div>
            )}

            {importState.phase === 'done' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <p className="text-green-700 font-semibold text-lg">{importState.synced}</p>
                <p className="text-green-600 text-sm">emails importés et classés</p>
                {importState.found > 0 && <p className="text-green-500 text-xs mt-1">sur {importState.found} emails dans votre boîte</p>}
              </div>
            )}

            {importState.phase === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
                {importState.message}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {importState.phase === 'done' || importState.phase === 'error' ? (
                <Button onClick={closeImport} className="flex-1">Fermer</Button>
              ) : (
                <Button variant="outline" onClick={cancelImport} className="flex-1 text-gray-500">Annuler</Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Popup réponse */}
      <Dialog open={!!replyEmail} onOpenChange={() => setReplyEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Répondre à {replyEmail?.from_name || replyEmail?.from_email}</DialogTitle>
            <p className="text-sm text-gray-500 truncate">{replyEmail?.subject}</p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Que voulez-vous dire ? (optionnel)</label>
              <div className="flex gap-2">
                <Textarea value={intent} onChange={e => setIntent(e.target.value)}
                  placeholder="Ex: dire que je suis disponible la semaine prochaine..." rows={2} className="text-sm" />
                <Button type="button" variant="outline" onClick={toggleVoice}
                  className={`flex-shrink-0 h-auto px-3 ${recording ? 'bg-red-50 border-red-300 text-red-600' : ''}`}>
                  {recording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
              </div>
              {recording && <p className="text-xs text-red-500 animate-pulse">🎙️ Enregistrement en cours... parlez</p>}
              <Button variant="outline" size="sm" onClick={regenerateDraft} disabled={draftLoading} className="gap-2">
                <Sparkles className="w-4 h-4" />
                {draftLoading ? 'Génération...' : 'Générer / Regénérer'}
              </Button>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Brouillon de réponse</label>
              {draftLoading ? (
                <div className="h-40 bg-gray-50 rounded-lg flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  <span className="ml-2 text-sm text-gray-400">L'IA rédige...</span>
                </div>
              ) : (
                <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={8} className="text-sm"
                  placeholder="Le brouillon IA apparaîtra ici..." />
              )}
            </div>
            <div className="flex gap-3 pt-2 border-t">
              <Button onClick={handleSend} disabled={sending || !draft || draftLoading} className="flex-1 gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Envoi...' : 'Envoyer'}
              </Button>
              <Button variant="outline" onClick={() => setReplyEmail(null)}>Annuler</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
