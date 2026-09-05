// Outils de l'assistant vocal « IA TonPilote » (V1, lecture seule).
// Chaque outil lit les données de l'utilisateur connecté et renvoie un résultat
// texte pour Claude + éventuellement des cartes cliquables et une navigation.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getGmailAccessToken, fetchRecentInbox } from '@/lib/gmail-read'

const num = (v: unknown) => Number(v) || 0
const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export type AssistantCard = { label: string; sublabel?: string; href?: string }

// Action d'envoi préparée mais NON exécutée : l'utilisateur doit confirmer
// (bouton « Envoyer ») avant tout envoi réel. Exécutée par /api/assistant/execute.
export type PendingAction =
  | { canal: 'email_client'; to: string; label: string; subject: string; message: string }
  | { canal: 'message_salarie'; employeeId: string; label: string; message: string }

export type ToolOutcome = { result: string; cards?: AssistantCard[]; navigateTo?: string; pendingAction?: PendingAction }

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
    description: "Donne les tout derniers emails reçus, lus EN DIRECT dans Gmail (donc toujours à jour). Pour « recap de mes mails », « actualise et donne mes derniers mails », « qu'est-ce que j'ai reçu ».",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'creer_note_chantier',
    description: "Ajoute une note à un chantier. Pour « note sur le chantier X : … », « ajoute une note au chantier de Dupont ». Donne le nom du chantier et le texte de la note.",
    input_schema: {
      type: 'object' as const,
      properties: {
        chantier: { type: 'string', description: 'Nom (ou partie du nom) du chantier' },
        note: { type: 'string', description: 'Texte de la note à enregistrer' },
      },
      required: ['chantier', 'note'],
    },
  },
  {
    name: 'preparer_envoi',
    description: "PRÉPARE l'envoi d'un message (sans l'envoyer) : email à un client, ou message interne à un salarié. L'utilisateur devra confirmer avant l'envoi réel. Pour « écris à … », « envoie un message à … », « préviens le salarié … ». Rédige toi-même un message clair à partir de l'intention.",
    input_schema: {
      type: 'object' as const,
      properties: {
        canal: { type: 'string', enum: ['email_client', 'message_salarie', 'sms'], description: "email_client = email à un client ; message_salarie = message interne à un salarié ; sms = SMS/WhatsApp" },
        destinataire: { type: 'string', description: 'Nom du client ou du salarié' },
        message: { type: 'string', description: 'Le message à envoyer, rédigé' },
        sujet: { type: 'string', description: "Objet de l'email (canal email_client uniquement)" },
      },
      required: ['canal', 'destinataire', 'message'],
    },
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
      // Live Gmail = vrais derniers mails. Repli sur la table locale si non connecté.
      const token = await getGmailAccessToken(supabase, userId)
      if (token) {
        const mails = await fetchRecentInbox(token, 5)
        if (mails.length) {
          return {
            result: `${mails.length} derniers mails reçus : ` + mails.map(m => `${m.from} — ${m.subject}`).join(' | '),
            cards: mails.map(m => ({ label: m.subject, sublabel: m.from, href: '/emails' })),
          }
        }
      }
      const { data } = await supabase.from('emails')
        .select('from_name, from_email, subject, ai_summary, received_at')
        .eq('user_id', userId).order('received_at', { ascending: false }).limit(5)
      const mails = data || []
      if (!mails.length) return { result: token ? 'Aucun email récent.' : "Gmail n'est pas connecté. Connecte-le dans Paramètres.", cards: [{ label: 'Ouvrir les mails', href: '/emails' }] }
      return {
        result: `${mails.length} derniers mails. ` + mails.map(m => `${m.from_name || m.from_email} — ${m.subject}`).join(' | '),
        cards: mails.map(m => ({ label: (m.subject as string) || '(sans objet)', sublabel: (m.from_name as string) || (m.from_email as string), href: '/emails' })),
      }
    }

    case 'creer_note_chantier': {
      const chantier = String(input.chantier || '').trim()
      const note = String(input.note || '').trim()
      if (!chantier || !note) return { result: 'Il me faut le nom du chantier et le texte de la note.' }
      const { data: matches } = await supabase.from('projects').select('id, title')
        .eq('user_id', userId).ilike('title', `%${chantier}%`).neq('status', 'archive').limit(5)
      if (!matches?.length) return { result: `Aucun chantier trouvé pour « ${chantier} ».` }
      if (matches.length > 1) {
        return {
          result: `Plusieurs chantiers correspondent à « ${chantier} » : ${matches.map(m => m.title).join(', ')}. Lequel ?`,
          cards: matches.map(m => ({ label: m.title as string, sublabel: 'Chantier', href: `/chantiers/${m.id}` })),
        }
      }
      const proj = matches[0]
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle()
      const { error } = await supabase.from('notes').insert({
        user_id: userId, project_id: proj.id, author_name: prof?.full_name || 'Vous', body: note,
      })
      if (error) return { result: "Je n'ai pas réussi à enregistrer la note." }
      return {
        result: `Note ajoutée au chantier ${proj.title}.`,
        cards: [{ label: proj.title as string, sublabel: 'Note ajoutée', href: `/chantiers/${proj.id}` }],
      }
    }

    case 'preparer_envoi': {
      const canal = String(input.canal || '')
      const dest = String(input.destinataire || '').trim()
      const message = String(input.message || '').trim()
      if (!dest || !message) return { result: 'Il me faut le destinataire et le message.' }

      if (canal === 'sms') {
        return { result: "L'envoi de SMS ou WhatsApp n'est pas encore branché — il faudrait un service comme Twilio. Je peux le faire par email ou en message interne à un salarié." }
      }

      if (canal === 'email_client') {
        const like = `%${dest}%`
        const { data } = await supabase.from('clients').select('first_name, last_name, company_name, email')
          .eq('user_id', userId).or(`company_name.ilike.${like},last_name.ilike.${like},first_name.ilike.${like}`).limit(5)
        const withEmail = (data || []).find(c => c.email)
        if (!data?.length) return { result: `Aucun client trouvé pour « ${dest} ».` }
        if (!withEmail) return { result: `${dest} n'a pas d'adresse email enregistrée.` }
        const label = withEmail.company_name || `${withEmail.first_name || ''} ${withEmail.last_name || ''}`.trim() || (withEmail.email as string)
        const subject = String(input.sujet || '').trim() || 'Message'
        return {
          result: `Prêt à envoyer un email à ${label} (${withEmail.email}). Objet : « ${subject} ». Tu confirmes l'envoi ?`,
          pendingAction: { canal: 'email_client', to: withEmail.email as string, label, subject, message },
        }
      }

      if (canal === 'message_salarie') {
        const { data } = await supabase.from('employees').select('id, full_name')
          .eq('user_id', userId).eq('active', true).ilike('full_name', `%${dest}%`).limit(5)
        if (!data?.length) return { result: `Aucun salarié actif trouvé pour « ${dest} ».` }
        if (data.length > 1) return { result: `Plusieurs salariés correspondent : ${data.map(e => e.full_name).join(', ')}. Lequel ?` }
        const emp = data[0]
        return {
          result: `Prêt à envoyer un message interne à ${emp.full_name}. Tu confirmes ?`,
          pendingAction: { canal: 'message_salarie', employeeId: emp.id as string, label: emp.full_name as string, message },
        }
      }

      return { result: 'Canal inconnu.' }
    }

    default:
      return { result: `Outil inconnu : ${name}.` }
  }
}
