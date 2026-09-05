// Outils de l'assistant vocal « IA TonPilote » (V1, lecture seule).
// Chaque outil lit les données de l'utilisateur connecté et renvoie un résultat
// texte pour Claude + éventuellement des cartes cliquables et une navigation.

import type { SupabaseClient } from '@supabase/supabase-js'

const num = (v: unknown) => Number(v) || 0
const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export type AssistantCard = { label: string; sublabel?: string; href?: string }
export type ToolOutcome = { result: string; cards?: AssistantCard[]; navigateTo?: string }

// Sections navigables → routes. Sert aussi d'enum pour l'outil « naviguer ».
export const SECTIONS: Record<string, string> = {
  tableau_de_bord: '/dashboard',
  finances: '/finances',
  clients: '/clients',
  prospects: '/prospects',
  devis: '/devis',
  factures: '/factures',
  chantiers: '/chantiers',
  planning: '/planning',
  heures: '/heures',
  equipe: '/equipe',
  mails: '/emails',
  relances: '/relances',
  scan: '/tickets',
  parametres: '/parametres',
}

export const assistantTools = [
  {
    name: 'chercher_dans_lapp',
    description: "Cherche un client, un chantier, un devis ou une facture par son nom/numéro. Utilise-le quand l'utilisateur demande « où est X », « trouve X », « ouvre le dossier de X ».",
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'Nom du client, titre de chantier, ou numéro de devis/facture' } },
      required: ['query'],
    },
  },
  {
    name: 'etat_finances',
    description: "Donne l'état financier : reste à encaisser, factures impayées/en retard, devis en attente. Pour « où en sont mes paiements », « combien on me doit », « mes finances ».",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'etat_chantiers',
    description: "Liste les chantiers en cours. Pour « où en sont mes chantiers », « mes chantiers actifs ».",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'recap_mails',
    description: "Récapitule les derniers emails reçus (expéditeur, objet, résumé IA, catégorie). Pour « recap de mes mails », « qu'est-ce que j'ai reçu ».",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'naviguer',
    description: "Emmène l'utilisateur vers une section de l'app. Utilise-le dès qu'il veut « aller à », « ouvrir », « montre-moi » une section.",
    input_schema: {
      type: 'object' as const,
      properties: { section: { type: 'string', enum: Object.keys(SECTIONS), description: 'Section cible' } },
      required: ['section'],
    },
  },
]

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
): Promise<ToolOutcome> {
  switch (name) {
    case 'naviguer': {
      const section = String(input.section || '')
      const route = SECTIONS[section]
      if (!route) return { result: `Section inconnue : ${section}.` }
      return { result: `Navigation vers ${section}.`, navigateTo: route }
    }

    case 'chercher_dans_lapp': {
      const q = String(input.query || '').trim()
      if (!q) return { result: 'Requête vide.' }
      const like = `%${q}%`
      const [cl, pr, inv, dv] = await Promise.all([
        supabase.from('clients').select('id, first_name, last_name, company_name')
          .eq('user_id', userId).or(`company_name.ilike.${like},last_name.ilike.${like},first_name.ilike.${like}`).limit(5),
        supabase.from('projects').select('id, title, status').eq('user_id', userId).ilike('title', like).neq('status', 'archive').limit(5),
        supabase.from('invoices').select('id, invoice_number, total_ttc, status').eq('user_id', userId).ilike('invoice_number', like).limit(5),
        supabase.from('quotes').select('id, quote_number, total_ttc, status').eq('user_id', userId).ilike('quote_number', like).limit(5),
      ])
      const cards: AssistantCard[] = []
      for (const c of cl.data || []) cards.push({ label: c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client', sublabel: 'Client', href: '/clients' })
      for (const p of pr.data || []) cards.push({ label: p.title as string, sublabel: 'Chantier', href: `/chantiers/${p.id}` })
      for (const i of inv.data || []) cards.push({ label: `Facture ${i.invoice_number}`, sublabel: fmt(num(i.total_ttc)), href: `/factures/${i.id}` })
      for (const d of dv.data || []) cards.push({ label: `Devis ${d.quote_number}`, sublabel: fmt(num(d.total_ttc)), href: `/devis/${d.id}` })
      if (!cards.length) return { result: `Rien trouvé pour « ${q} ».` }
      return { result: `${cards.length} résultat(s) : ` + cards.map(c => `${c.label} (${c.sublabel})`).join('; '), cards }
    }

    case 'etat_finances': {
      const [openInv, quotes] = await Promise.all([
        supabase.from('invoices').select('amount_due, total_ttc, status, due_date')
          .eq('user_id', userId).in('status', ['envoyee', 'en_retard', 'payee_partiellement']),
        supabase.from('quotes').select('total_ttc, status').eq('user_id', userId).eq('status', 'envoye'),
      ])
      const inv = openInv.data || []
      const reste = inv.reduce((s, i) => s + (num(i.amount_due) || num(i.total_ttc)), 0)
      const today = new Date().toISOString().split('T')[0]
      const enRetard = inv.filter(i => i.status === 'en_retard' || (i.due_date && i.due_date < today))
      const devis = quotes.data || []
      const devisMontant = devis.reduce((s, d) => s + num(d.total_ttc), 0)
      return {
        result: `Reste à encaisser : ${fmt(reste)} sur ${inv.length} facture(s) ouverte(s), dont ${enRetard.length} en retard. ${devis.length} devis en attente pour ${fmt(devisMontant)}.`,
        cards: [
          { label: `Reste à encaisser : ${fmt(reste)}`, sublabel: `${inv.length} facture(s)`, href: '/finances' },
          ...(enRetard.length ? [{ label: `${enRetard.length} facture(s) en retard`, href: '/factures' }] : []),
          ...(devis.length ? [{ label: `${devis.length} devis en attente`, sublabel: fmt(devisMontant), href: '/devis' }] : []),
        ],
      }
    }

    case 'etat_chantiers': {
      const CLOSED = ['termine', 'archive']
      const { data } = await supabase.from('projects').select('id, title, status, progress')
        .eq('user_id', userId).order('created_at', { ascending: false })
      const active = (data || []).filter(p => !CLOSED.includes(p.status as string))
      if (!active.length) return { result: 'Aucun chantier en cours.', cards: [{ label: 'Voir les chantiers', href: '/chantiers' }] }
      return {
        result: `${active.length} chantier(s) en cours : ` + active.slice(0, 6).map(p => `${p.title}${p.progress != null ? ` (${p.progress}%)` : ''}`).join('; ') + '.',
        cards: active.slice(0, 6).map(p => ({ label: p.title as string, sublabel: p.progress != null ? `${p.progress}%` : 'en cours', href: `/chantiers/${p.id}` })),
      }
    }

    case 'recap_mails': {
      const { data } = await supabase.from('emails')
        .select('from_name, from_email, subject, category, ai_summary, received_at')
        .eq('user_id', userId).order('received_at', { ascending: false }).limit(5)
      const mails = data || []
      if (!mails.length) return { result: 'Aucun email récent.', cards: [{ label: 'Ouvrir les mails', href: '/emails' }] }
      const lignes = mails.map(m => `${m.from_name || m.from_email} — ${m.subject}${m.ai_summary ? ` : ${m.ai_summary}` : ''}`)
      return {
        result: `${mails.length} derniers mails. ` + lignes.join(' | '),
        cards: mails.map(m => ({ label: m.subject as string || '(sans objet)', sublabel: (m.from_name as string) || (m.from_email as string), href: '/emails' })),
      }
    }

    default:
      return { result: `Outil inconnu : ${name}.` }
  }
}
