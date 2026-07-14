'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { phasesBefore } from '@/lib/clients'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import type { Client } from '@/types'

type Line = { tempId: string; designation: string; quantity: number; unit: string; unit_price_ht: number; vat_rate: number; total_ht: number }

const UNITS = { m2: 'm²', ml: 'ml', u: 'unité', forfait: 'forfait', h: 'heure', j: 'jour', piece: 'pièce' }

export default function NouvelleFacturePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState(searchParams.get('client') || '')
  const [lines, setLines] = useState<Line[]>([])
  const [saving, setSaving] = useState(false)
  const [dueDays, setDueDays] = useState('30')

  useEffect(() => {
    createClient().from('clients').select('*').order('created_at', { ascending: false }).then(({ data }) => setClients(data || []))
  }, [])

  function addLine() {
    setLines(prev => [...prev, { tempId: crypto.randomUUID(), designation: '', quantity: 1, unit: 'u', unit_price_ht: 0, vat_rate: 10, total_ht: 0 }])
  }

  function updateLine(tempId: string, field: string, value: string | number) {
    setLines(prev => prev.map(l => {
      if (l.tempId !== tempId) return l
      const u = { ...l, [field]: value }
      u.total_ht = u.quantity * u.unit_price_ht
      return u
    }))
  }

  const subtotalHT = lines.reduce((s, l) => s + l.total_ht, 0)
  const totalVAT = lines.reduce((s, l) => s + l.total_ht * l.vat_rate / 100, 0)
  const totalTTC = subtotalHT + totalVAT

  async function handleSave() {
    if (!clientId) { toast.error('Choisissez un client'); return }
    if (!lines.length) { toast.error('Ajoutez au moins une prestation'); return }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
    const invoiceNumber = `FAC-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + parseInt(dueDays || '30'))

    const { data: invoice, error } = await supabase.from('invoices').insert({
      user_id: user.id,
      client_id: clientId,
      invoice_number: invoiceNumber,
      type: 'complete',
      status: 'brouillon',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: dueDate.toISOString().split('T')[0],
      subtotal_ht: subtotalHT,
      total_vat: totalVAT,
      total_ttc: totalTTC,
      deposit_already_paid: 0,
      amount_due: totalTTC,
      legal_mentions: 'TVA à taux réduit — Article 279-0 bis du CGI (travaux de rénovation)',
    }).select().single()

    if (error || !invoice) { toast.error('Erreur création facture'); setSaving(false); return }

    await supabase.from('invoice_lines').insert(
      lines.map((l, i) => ({
        invoice_id: invoice.id,
        designation: l.designation,
        quantity: l.quantity,
        unit: l.unit,
        unit_price_ht: l.unit_price_ht,
        vat_rate: l.vat_rate,
        discount_percent: 0,
        total_ht: l.total_ht,
        sort_order: i,
      }))
    )

    // Fait avancer la carte du client sur le board Clients → « À facturer ».
    await supabase.from('clients').update({ status: 'facture_a_envoyer' })
      .eq('id', clientId).in('status', phasesBefore('facture_a_envoyer'))

    toast.success('Facture créée !')
    router.push(`/factures/${invoice.id}`)
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/factures"><Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button></Link>
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle facture directe</h1>
      </div>

      <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700 border border-blue-200">
        <span>💡</span>
        <span>Pour facturer depuis un devis accepté, utilisez le bouton "Créer la facture" depuis la page du devis.</span>
      </div>

      <Card>
        <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-base">Client *</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <select value={clientId} onChange={e => setClientId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white">
            <option value="">Sélectionner un client...</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.type === 'professionnel' ? c.company_name : `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Sans nom'}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Prestations</CardTitle>
          <span className="text-sm text-gray-400">{lines.length} ligne{lines.length > 1 ? 's' : ''}</span>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {lines.map(line => (
            <div key={line.tempId} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex gap-2">
                <Input value={line.designation} onChange={e => updateLine(line.tempId, 'designation', e.target.value)}
                  placeholder="Désignation" className="flex-1 font-medium" />
                <button onClick={() => setLines(prev => prev.filter(l => l.tempId !== line.tempId))} className="text-gray-300 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div><Label className="text-xs text-gray-500">Qté</Label>
                  <Input type="number" value={line.quantity} onChange={e => updateLine(line.tempId, 'quantity', parseFloat(e.target.value) || 0)} className="h-8 text-sm" min="0" step="0.1" /></div>
                <div><Label className="text-xs text-gray-500">Unité</Label>
                  <select value={line.unit} onChange={e => updateLine(line.tempId, 'unit', e.target.value)}
                    className="w-full h-8 border border-gray-200 rounded-md px-2 text-sm bg-white">
                    {Object.entries(UNITS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
                <div><Label className="text-xs text-gray-500">Prix HT</Label>
                  <Input type="number" value={line.unit_price_ht} onChange={e => updateLine(line.tempId, 'unit_price_ht', parseFloat(e.target.value) || 0)} className="h-8 text-sm" min="0" step="0.01" /></div>
                <div><Label className="text-xs text-gray-500">TVA %</Label>
                  <select value={line.vat_rate} onChange={e => updateLine(line.tempId, 'vat_rate', parseFloat(e.target.value))}
                    className="w-full h-8 border border-gray-200 rounded-md px-2 text-sm bg-white">
                    <option value={5.5}>5.5%</option><option value={10}>10%</option><option value={20}>20%</option>
                  </select></div>
              </div>
              <div className="text-right text-sm font-semibold text-gray-900">{formatCurrency(line.total_ht)} HT</div>
            </div>
          ))}
          <Button variant="outline" className="w-full gap-2 border-dashed" onClick={addLine}>
            <Plus className="w-4 h-4" /> Ajouter une prestation
          </Button>
        </CardContent>
      </Card>

      {lines.length > 0 && (
        <Card><CardContent className="p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Total HT</span><span className="font-semibold">{formatCurrency(subtotalHT)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">TVA</span><span>{formatCurrency(totalVAT)}</span></div>
            <div className="flex justify-between text-base font-bold border-t pt-2 mt-2"><span>Total TTC</span><span>{formatCurrency(totalTTC)}</span></div>
          </div>
          <div className="mt-3 flex gap-2 items-center">
            <Label className="text-sm text-gray-500 whitespace-nowrap">Échéance (jours) :</Label>
            <Input type="number" value={dueDays} onChange={e => setDueDays(e.target.value)} className="w-20 h-8 text-sm" min="1" />
          </div>
        </CardContent></Card>
      )}

      <div className="pb-6">
        <Button className="w-full h-12 text-base" onClick={handleSave} disabled={saving}>
          {saving ? 'Création...' : 'Créer la facture'}
        </Button>
      </div>
    </div>
  )
}
