// Outils de l'assistant vocal « IA TonPilote » (V1, lecture seule).
// Chaque outil lit les données de l'utilisateur connecté et renvoie un résultat
// texte pour Claude + éventuellement des cartes cliquables et une navigation.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getGmailAccessToken, fetchRecentInbox } from '@/lib/gmail-read'

const num = (v: unknown) => Number(v) || 0
const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const jour = (d: unknown) => { const s = String(d || ''); return s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '' }
const nomClient = (c: { company_name?: string | null; first_name?: string | null; last_name?: string | null }) =>
  c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client'
const today = () => new Date().toISOString().split('T')[0]

async function findEmployee(supabase: SupabaseClient, userId: string, name: string) {
  const { data } = await supabase.from('employees').select('id, full_name').eq('user_id', userId).eq('active', true).ilike('full_name', `%${name}%`).limit(5)
  return data || []
}
async function findProject(supabase: SupabaseClient, userId: string, name: string) {
  const { data } = await supabase.from('projects').select('id, title, client_id').eq('user_id', userId).neq('status', 'archive').ilike('title', `%${name}%`).limit(5)
  return data || []
}
async function findClient(supabase: SupabaseClient, userId: string, name: string) {
  const like = `%${name}%`
  const { data } = await supabase.from('clients').select('id, first_name, last_name, company_name, site_address, billing_address')
    .eq('user_id', userId).or(`company_name.ilike.${like},last_name.ilike.${like},first_name.ilike.${like}`).limit(5)
  return data || []
}

export type AssistantCard = { label: string; sublabel?: string; href?: string }

// Action d'envoi préparée mais NON exécutée : l'utilisateur doit confirmer
// (bouton « Envoyer ») avant tout envoi réel. Exécutée par /api/assistant/execute.
export type PendingAction =
  | { canal: 'email_client'; to: string; label: string; subject: string; message: string }
  | { canal: 'message_interne'; targetKind: 'employee'; employeeId: string; label: string; message: string }
  | { canal: 'message_interne'; targetKind: 'conversation'; conversationId: string; label: string; message: string }
  | { canal: 'marquer_facture_payee'; invoiceId: string; label: string; message: string }

export type ToolOutcome = { result: string; cards?: AssistantCard[]; navigateTo?: string; pendingAction?: PendingAction }

// Sections navigables → routes. Couvre TOUS les onglets de l'app.
// Sert aussi d'enum pour l'outil « naviguer ».
export const SECTIONS: Record<string, string> = {
  tableau_de_bord: '/dashboard',
  messages: '/messages',
  notes: '/notes',
  prospects: '/prospects',
  visites: '/visites',
  clients: '/clients',
  devis: '/devis',
  factures: '/factures',
  relances: '/relances',
  avis_clients: '/avis',
  chantiers: '/chantiers',
  planning: '/planning',
  heures: '/heures',
  salaries: '/equipe',
  sous_traitants: '/sous-traitants',
  vehicules: '/vehicules',
  comptes_rendus: '/comptes-rendus',
  finances: '/finances',
  scan: '/tickets',
  comptable: '/comptable',
  documents: '/documents',
  mails: '/emails',
  prix: '/prix',
  analyse_de_plan: '/plans',
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
    name: 'lire',
    description: "Lit le contenu de N'IMPORTE QUEL onglet de l'app. Utilise-le pour « montre/lis mes … », « qu'est-ce qu'il y a dans … », l'état d'une section. Filtre optionnel par nom.",
    input_schema: {
      type: 'object' as const,
      properties: {
        domaine: {
          type: 'string',
          enum: ['messages', 'planning', 'absences', 'prospects', 'clients', 'devis', 'factures', 'heures', 'salaries', 'sous_traitants', 'vehicules', 'comptes_rendus', 'visites', 'documents', 'notes', 'depenses', 'chantiers', 'rappels'],
          description: 'La section à lire',
        },
        filtre: { type: 'string', description: 'Optionnel : nom/mot-clé pour restreindre' },
      },
      required: ['domaine'],
    },
  },
  {
    name: 'creer_contact',
    description: "Crée un nouveau client/prospect dans le CRM. Pour « ajoute un client … », « nouveau prospect … ». Donne au moins le nom.",
    input_schema: {
      type: 'object' as const,
      properties: {
        nom: { type: 'string', description: 'Nom de la personne (ou du contact)' },
        entreprise: { type: 'string', description: "Nom de l'entreprise si c'est un professionnel" },
        telephone: { type: 'string' },
        email: { type: 'string' },
      },
      required: ['nom'],
    },
  },
  {
    name: 'preparer_devis',
    description: "Ouvre un nouveau devis pré-rempli pour un client (l'utilisateur complète les lignes à l'écran). Pour « fais un devis pour … », « nouveau devis à … ».",
    input_schema: {
      type: 'object' as const,
      properties: { client: { type: 'string', description: 'Nom du client' } },
      required: ['client'],
    },
  },
  {
    name: 'marquer_facture_payee',
    description: "Prépare le passage d'une facture en « payée » (confirmation requise). Pour « marque la facture X payée », « le client a payé la facture … ».",
    input_schema: {
      type: 'object' as const,
      properties: { facture: { type: 'string', description: 'Numéro de facture ou nom du client' } },
      required: ['facture'],
    },
  },
  {
    name: 'pointer_heures',
    description: "Enregistre des heures travaillées pour un salarié. Pour « note 8h pour Kevin aujourd'hui », « pointe 6 heures à Sami sur le chantier Dupont ».",
    input_schema: {
      type: 'object' as const,
      properties: {
        salarie: { type: 'string' }, heures: { type: 'number' },
        date: { type: 'string', description: 'AAAA-MM-JJ ; par défaut aujourd’hui' },
        chantier: { type: 'string', description: 'Optionnel : nom du chantier' },
      },
      required: ['salarie', 'heures'],
    },
  },
  {
    name: 'creer_absence',
    description: "Pose une absence pour un salarié. Pour « Kevin est absent du 10 au 12 », « congé de Sami lundi ».",
    input_schema: {
      type: 'object' as const,
      properties: {
        salarie: { type: 'string' }, du: { type: 'string', description: 'AAAA-MM-JJ' }, au: { type: 'string', description: 'AAAA-MM-JJ' },
        type: { type: 'string', description: 'congé, maladie, RTT…' },
      },
      required: ['salarie', 'du', 'au'],
    },
  },
  {
    name: 'creer_rappel',
    description: "Crée un rappel/tâche. Pour « rappelle-moi de rappeler le fournisseur demain », « note : commander le carrelage ».",
    input_schema: {
      type: 'object' as const,
      properties: { titre: { type: 'string' }, date: { type: 'string', description: 'AAAA-MM-JJ échéance' }, priorite: { type: 'string', enum: ['basse', 'normal', 'haute'] } },
      required: ['titre'],
    },
  },
  {
    name: 'creer_compte_rendu',
    description: "Ajoute un compte-rendu / point d'avancement à un chantier. Pour « CR chantier Dupont : dalle coulée, 40% », « avancement chantier X ».",
    input_schema: {
      type: 'object' as const,
      properties: { chantier: { type: 'string' }, note: { type: 'string' }, avancement: { type: 'number', description: '0-100' } },
      required: ['chantier', 'note'],
    },
  },
  {
    name: 'creer_chantier',
    description: "Crée un nouveau chantier. Pour « crée le chantier rénovation salle de bain pour Dupont ».",
    input_schema: {
      type: 'object' as const,
      properties: { titre: { type: 'string' }, client: { type: 'string', description: 'Optionnel : nom du client' } },
      required: ['titre'],
    },
  },
  {
    name: 'creer_visite',
    description: "Crée une visite technique / de chantier. Pour « planifie une visite chez Dupont », « nouvelle visite au 12 rue… ».",
    input_schema: {
      type: 'object' as const,
      properties: { titre: { type: 'string' }, client: { type: 'string' }, adresse: { type: 'string' } },
      required: ['titre'],
    },
  },
  {
    name: 'preparer_facture',
    description: "Ouvre une nouvelle facture pré-remplie pour un client (l'utilisateur complète à l'écran). Pour « facture le client … », « nouvelle facture pour … ».",
    input_schema: {
      type: 'object' as const,
      properties: { client: { type: 'string' } },
      required: ['client'],
    },
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
    description: "PRÉPARE l'envoi d'un message (sans l'envoyer) : email à un client, ou message interne (à un salarié OU à un groupe/conversation de la messagerie). L'utilisateur confirmera avant l'envoi réel. Pour « écris à … », « envoie un message à … », « préviens le groupe … », « message dans la conversation … ». Rédige toi-même un message clair.",
    input_schema: {
      type: 'object' as const,
      properties: {
        canal: { type: 'string', enum: ['email_client', 'message_interne', 'sms'], description: "email_client = email à un client ; message_interne = messagerie de l'app (salarié ou groupe) ; sms = SMS/WhatsApp" },
        destinataire: { type: 'string', description: 'Nom du client, du salarié, ou du groupe/conversation' },
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

    case 'lire': {
      const dom = String(input.domaine || '')
      const filtre = String(input.filtre || '').trim()
      const like = `%${filtre}%`
      const today = new Date().toISOString().split('T')[0]
      const pack = (label: string, items: AssistantCard[], route: string): ToolOutcome => {
        if (!items.length) return { result: `Rien à afficher dans ${label}.`, cards: [{ label: `Ouvrir ${label}`, href: route }] }
        return { result: `${label} (${items.length}) : ` + items.map(c => `${c.label}${c.sublabel ? ` — ${c.sublabel}` : ''}`).join(' | '), cards: items }
      }

      switch (dom) {
        case 'messages': {
          const { data } = await supabase.from('messages').select('body, created_at, conversations(name)')
            .eq('user_id', userId).order('created_at', { ascending: false }).limit(8)
          return pack('Messages', (data || []).map(m => ({
            label: (m.body as string || '').slice(0, 60) || '(vocal/pièce jointe)',
            sublabel: ((m.conversations as unknown as { name?: string } | null)?.name) || jour(m.created_at), href: '/messages',
          })), '/messages')
        }
        case 'planning': {
          const { data } = await supabase.from('assignments').select('date, start_hour, end_hour, employees(full_name), projects(title)')
            .eq('user_id', userId).gte('date', today).order('date', { ascending: true }).limit(10)
          return pack('Planning', (data || []).map(a => ({
            label: `${jour(a.date)} · ${(a.projects as unknown as { title?: string } | null)?.title || 'Chantier'}`,
            sublabel: `${(a.employees as unknown as { full_name?: string } | null)?.full_name || ''}${a.start_hour ? ` ${a.start_hour}-${a.end_hour || ''}` : ''}`, href: '/planning',
          })), '/planning')
        }
        case 'absences': {
          const { data } = await supabase.from('absences').select('start_date, end_date, type, employees(full_name)')
            .eq('user_id', userId).gte('end_date', today).order('start_date', { ascending: true }).limit(10)
          return pack('Absences', (data || []).map(a => ({
            label: `${(a.employees as unknown as { full_name?: string } | null)?.full_name || 'Salarié'} — ${a.type || 'absence'}`,
            sublabel: `${jour(a.start_date)} → ${jour(a.end_date)}`, href: '/planning',
          })), '/planning')
        }
        case 'prospects': {
          // « Prospects » = clients au stade amont (pas encore de chantier).
          const q = supabase.from('clients').select('first_name, last_name, company_name, status, created_at')
            .eq('user_id', userId).in('status', ['nouveau', 'infos_a_recuperer', 'devis_a_faire', 'devis_envoye'])
          const { data } = filtre ? await q.or(`company_name.ilike.${like},last_name.ilike.${like}`).limit(10) : await q.order('created_at', { ascending: false }).limit(10)
          return pack('Prospects', (data || []).map(c => ({ label: nomClient(c), sublabel: c.status as string, href: '/prospects' })), '/prospects')
        }
        case 'clients': {
          const q = supabase.from('clients').select('id, first_name, last_name, company_name, phone').eq('user_id', userId)
          const { data } = filtre ? await q.or(`company_name.ilike.${like},last_name.ilike.${like},first_name.ilike.${like}`).limit(10) : await q.order('created_at', { ascending: false }).limit(10)
          return pack('Clients', (data || []).map(c => ({ label: nomClient(c), sublabel: c.phone as string || '', href: '/clients' })), '/clients')
        }
        case 'devis': {
          const q = supabase.from('quotes').select('id, quote_number, status, total_ttc').eq('user_id', userId)
          const { data } = filtre ? await q.ilike('quote_number', like).limit(10) : await q.order('created_at', { ascending: false }).limit(10)
          return pack('Devis', (data || []).map(d => ({ label: `Devis ${d.quote_number}`, sublabel: `${fmt(num(d.total_ttc))} · ${d.status}`, href: `/devis/${d.id}` })), '/devis')
        }
        case 'factures': {
          const q = supabase.from('invoices').select('id, invoice_number, status, total_ttc, amount_due').eq('user_id', userId)
          const { data } = filtre ? await q.ilike('invoice_number', like).limit(10) : await q.order('created_at', { ascending: false }).limit(10)
          return pack('Factures', (data || []).map(i => ({ label: `Facture ${i.invoice_number}`, sublabel: `${fmt(num(i.total_ttc))} · ${i.status}`, href: `/factures/${i.id}` })), '/factures')
        }
        case 'heures': {
          const { data } = await supabase.from('time_entries').select('date, hours, employees(full_name), projects(title)')
            .eq('user_id', userId).order('date', { ascending: false }).limit(10)
          return pack('Heures', (data || []).map(h => ({
            label: `${(h.employees as unknown as { full_name?: string } | null)?.full_name || 'Salarié'} — ${num(h.hours)}h`,
            sublabel: `${jour(h.date)} · ${(h.projects as unknown as { title?: string } | null)?.title || ''}`, href: '/heures',
          })), '/heures')
        }
        case 'salaries': {
          const { data } = await supabase.from('employees').select('full_name, role, phone').eq('user_id', userId).eq('active', true).limit(15)
          return pack('Salariés', (data || []).map(e => ({ label: e.full_name as string, sublabel: (e.role as string) || (e.phone as string) || '', href: '/equipe' })), '/equipe')
        }
        case 'sous_traitants': {
          const { data } = await supabase.from('subcontractors').select('company_name, trade, phone').eq('user_id', userId).limit(15)
          return pack('Sous-traitants', (data || []).map(s => ({ label: s.company_name as string, sublabel: (s.trade as string) || (s.phone as string) || '', href: '/sous-traitants' })), '/sous-traitants')
        }
        case 'vehicules': {
          const { data } = await supabase.from('vehicles').select('name, plate, active').eq('user_id', userId).limit(15)
          return pack('Véhicules', (data || []).map(v => ({ label: v.name as string, sublabel: (v.plate as string) || (v.active ? 'actif' : 'inactif'), href: '/vehicules' })), '/vehicules')
        }
        case 'comptes_rendus': {
          const { data } = await supabase.from('site_updates').select('update_date, note, progress, projects(title)')
            .eq('user_id', userId).order('update_date', { ascending: false }).limit(10)
          return pack('Comptes-rendus', (data || []).map(u => ({
            label: `${(u.projects as unknown as { title?: string } | null)?.title || 'Chantier'}${u.progress != null ? ` (${u.progress}%)` : ''}`,
            sublabel: `${jour(u.update_date)} ${(u.note as string || '').slice(0, 40)}`, href: '/comptes-rendus',
          })), '/comptes-rendus')
        }
        case 'visites': {
          const { data } = await supabase.from('site_visits').select('title, address, status, created_at, clients(first_name, last_name, company_name)')
            .eq('user_id', userId).order('created_at', { ascending: false }).limit(10)
          return pack('Visites', (data || []).map(v => ({
            label: (v.title as string) || (v.clients ? nomClient(v.clients as any) : 'Visite'),
            sublabel: `${jour(v.created_at)} ${(v.address as string || '').slice(0, 30)}`, href: '/visites',
          })), '/visites')
        }
        case 'documents': {
          const q = supabase.from('documents').select('name, category, created_at').eq('user_id', userId)
          const { data } = filtre ? await q.ilike('name', like).limit(12) : await q.order('created_at', { ascending: false }).limit(12)
          return pack('Documents', (data || []).map(d => ({ label: d.name as string, sublabel: (d.category as string) || jour(d.created_at), href: '/documents' })), '/documents')
        }
        case 'notes': {
          const { data } = await supabase.from('notes').select('body, created_at, projects(title)')
            .eq('user_id', userId).order('created_at', { ascending: false }).limit(10)
          return pack('Notes', (data || []).map(n => ({ label: (n.body as string || '').slice(0, 60), sublabel: (n.projects as unknown as { title?: string } | null)?.title || jour(n.created_at), href: '/notes' })), '/notes')
        }
        case 'depenses': {
          const { data } = await supabase.from('expenses').select('supplier, amount_ttc, expense_date, status').eq('user_id', userId).order('expense_date', { ascending: false }).limit(10)
          return pack('Dépenses', (data || []).map(e => ({ label: (e.supplier as string) || 'Dépense', sublabel: `${fmt(num(e.amount_ttc))} · ${jour(e.expense_date)}`, href: '/depenses' })), '/depenses')
        }
        case 'chantiers': {
          const q = supabase.from('projects').select('id, title, status, progress').eq('user_id', userId).neq('status', 'archive')
          const { data } = filtre ? await q.ilike('title', like).limit(12) : await q.order('created_at', { ascending: false }).limit(12)
          return pack('Chantiers', (data || []).map(p => ({ label: p.title as string, sublabel: `${p.status}${p.progress != null ? ` · ${p.progress}%` : ''}`, href: `/chantiers/${p.id}` })), '/chantiers')
        }
        case 'rappels': {
          const { data } = await supabase.from('reminders').select('title, type, due_date, priority, status').eq('user_id', userId).neq('status', 'done').order('due_date', { ascending: true }).limit(10)
          return pack('Rappels', (data || []).map(r => ({ label: (r.title as string) || (r.type as string) || 'Rappel', sublabel: `${jour(r.due_date)}${r.priority ? ` · ${r.priority}` : ''}`, href: '/dashboard' })), '/dashboard')
        }
        default:
          return { result: `Domaine inconnu : ${dom}.` }
      }
    }

    case 'creer_contact': {
      const nom = String(input.nom || '').trim()
      const entreprise = String(input.entreprise || '').trim()
      if (!nom && !entreprise) return { result: 'Il me faut au moins un nom.' }
      const parts = nom.split(/\s+/)
      const { data, error } = await supabase.from('clients').insert({
        user_id: userId,
        status: 'nouveau',
        type: entreprise ? 'professionnel' : 'particulier',
        company_name: entreprise || null,
        first_name: parts[0] || null,
        last_name: parts.slice(1).join(' ') || null,
        phone: String(input.telephone || '') || null,
        email: String(input.email || '') || null,
      }).select('id').single()
      if (error) return { result: "Je n'ai pas réussi à créer le contact." }
      const label = entreprise || nom
      return { result: `Contact ${label} créé.`, cards: [{ label, sublabel: 'Nouveau — fiche client', href: `/clients/${data.id}` }] }
    }

    case 'preparer_devis': {
      const client = String(input.client || '').trim()
      if (!client) return { result: 'Pour quel client ?' }
      const like = `%${client}%`
      const { data } = await supabase.from('clients').select('id, first_name, last_name, company_name')
        .eq('user_id', userId).or(`company_name.ilike.${like},last_name.ilike.${like},first_name.ilike.${like}`).limit(5)
      if (!data?.length) return { result: `Aucun client trouvé pour « ${client} ». Je peux d'abord le créer.` }
      if (data.length > 1) return { result: `Plusieurs clients correspondent : ${data.map(nomClient).join(', ')}. Lequel ?`, cards: data.map(c => ({ label: nomClient(c), href: `/devis/nouveau?client=${c.id}` })) }
      const c = data[0]
      return { result: `J'ouvre un nouveau devis pour ${nomClient(c)}. Complète les lignes à l'écran.`, navigateTo: `/devis/nouveau?client=${c.id}` }
    }

    case 'marquer_facture_payee': {
      const f = String(input.facture || '').trim()
      if (!f) return { result: 'Quelle facture ?' }
      const like = `%${f}%`
      const { data } = await supabase.from('invoices')
        .select('id, invoice_number, total_ttc, status, clients(first_name, last_name, company_name)')
        .eq('user_id', userId).in('status', ['envoyee', 'en_retard', 'payee_partiellement'])
        .or(`invoice_number.ilike.${like}`).limit(5)
      let rows = data || []
      // Repli : recherche par nom de client (filtré côté JS) si rien par numéro.
      if (!rows.length) {
        const { data: open } = await supabase.from('invoices')
          .select('id, invoice_number, total_ttc, status, clients(first_name, last_name, company_name)')
          .eq('user_id', userId).in('status', ['envoyee', 'en_retard', 'payee_partiellement']).limit(50)
        const needle = f.toLowerCase()
        rows = (open || []).filter(r => nomClient((r.clients as any) || {}).toLowerCase().includes(needle))
      }
      if (!rows.length) return { result: `Aucune facture ouverte trouvée pour « ${f} ».` }
      if (rows.length > 1) return { result: `Plusieurs factures correspondent : ${rows.map(r => r.invoice_number).join(', ')}. Laquelle ?`, cards: rows.map(r => ({ label: `Facture ${r.invoice_number}`, sublabel: fmt(num(r.total_ttc)), href: `/factures/${r.id}` })) }
      const inv = rows[0]
      return {
        result: `Marquer la facture ${inv.invoice_number} (${fmt(num(inv.total_ttc))}) comme payée ? Confirme.`,
        pendingAction: { canal: 'marquer_facture_payee', invoiceId: inv.id as string, label: `Facture ${inv.invoice_number}`, message: `Passer la facture ${inv.invoice_number} de ${fmt(num(inv.total_ttc))} en « payée ».` },
      }
    }

    case 'pointer_heures': {
      const heures = Number(input.heures) || 0
      const emps = await findEmployee(supabase, userId, String(input.salarie || ''))
      if (!emps.length) return { result: `Aucun salarié trouvé pour « ${input.salarie} ».` }
      if (emps.length > 1) return { result: `Plusieurs salariés : ${emps.map(e => e.full_name).join(', ')}. Lequel ?` }
      let projectId: string | null = null
      if (input.chantier) {
        const pr = await findProject(supabase, userId, String(input.chantier))
        if (pr.length === 1) projectId = pr[0].id as string
      }
      const date = String(input.date || '') || today()
      const { error } = await supabase.from('time_entries').insert({ user_id: userId, employee_id: emps[0].id, project_id: projectId, date, hours: heures, status: 'valide' })
      if (error) return { result: "Je n'ai pas réussi à enregistrer les heures." }
      return { result: `${heures}h enregistrées pour ${emps[0].full_name} le ${date.slice(8, 10)}/${date.slice(5, 7)}.`, cards: [{ label: `${emps[0].full_name} · ${heures}h`, href: '/heures' }] }
    }

    case 'creer_absence': {
      const emps = await findEmployee(supabase, userId, String(input.salarie || ''))
      if (!emps.length) return { result: `Aucun salarié trouvé pour « ${input.salarie} ».` }
      if (emps.length > 1) return { result: `Plusieurs salariés : ${emps.map(e => e.full_name).join(', ')}. Lequel ?` }
      const du = String(input.du || ''), au = String(input.au || du)
      if (!du) return { result: 'À quelle date ?' }
      const { error } = await supabase.from('absences').insert({ user_id: userId, employee_id: emps[0].id, start_date: du, end_date: au || du, type: String(input.type || '') || null })
      if (error) return { result: "Je n'ai pas réussi à enregistrer l'absence." }
      return { result: `Absence de ${emps[0].full_name} enregistrée du ${jour(du)} au ${jour(au || du)}.`, cards: [{ label: `${emps[0].full_name} — absence`, sublabel: `${jour(du)} → ${jour(au || du)}`, href: '/planning' }] }
    }

    case 'creer_rappel': {
      const titre = String(input.titre || '').trim()
      if (!titre) return { result: 'Quel rappel ?' }
      const { error } = await supabase.from('reminders').insert({ user_id: userId, title: titre, type: 'manuel', due_date: String(input.date || '') || null, priority: String(input.priorite || '') || 'normal', status: 'a_faire' })
      if (error) return { result: "Je n'ai pas réussi à créer le rappel." }
      return { result: `Rappel créé : ${titre}${input.date ? ` (pour le ${jour(input.date)})` : ''}.`, cards: [{ label: titre, sublabel: input.date ? jour(input.date) : 'sans échéance', href: '/dashboard' }] }
    }

    case 'creer_compte_rendu': {
      const pr = await findProject(supabase, userId, String(input.chantier || ''))
      if (!pr.length) return { result: `Aucun chantier trouvé pour « ${input.chantier} ».` }
      if (pr.length > 1) return { result: `Plusieurs chantiers : ${pr.map(p => p.title).join(', ')}. Lequel ?` }
      const progress = input.avancement != null ? Math.max(0, Math.min(100, Number(input.avancement))) : null
      const { error } = await supabase.from('site_updates').insert({ user_id: userId, project_id: pr[0].id, update_date: today(), note: String(input.note || ''), progress })
      if (error) return { result: "Je n'ai pas réussi à enregistrer le compte-rendu." }
      return { result: `Compte-rendu ajouté au chantier ${pr[0].title}${progress != null ? ` (${progress}%)` : ''}.`, cards: [{ label: pr[0].title as string, sublabel: 'Compte-rendu ajouté', href: `/chantiers/${pr[0].id}` }] }
    }

    case 'creer_chantier': {
      const titre = String(input.titre || '').trim()
      if (!titre) return { result: 'Quel est le nom du chantier ?' }
      let clientId: string | null = null, address: string | null = null
      if (input.client) {
        const cl = await findClient(supabase, userId, String(input.client))
        if (cl.length === 1) { clientId = cl[0].id as string; address = (cl[0].site_address as string) || (cl[0].billing_address as string) || null }
      }
      const { data, error } = await supabase.from('projects').insert({ user_id: userId, title: titre, client_id: clientId, address, status: 'a_planifier' }).select('id').single()
      if (error) return { result: "Je n'ai pas réussi à créer le chantier." }
      return { result: `Chantier « ${titre} » créé.`, cards: [{ label: titre, sublabel: 'À planifier', href: `/chantiers/${data.id}` }] }
    }

    case 'creer_visite': {
      const titre = String(input.titre || '').trim()
      if (!titre) return { result: "Quel intitulé pour la visite ?" }
      let clientId: string | null = null
      if (input.client) {
        const cl = await findClient(supabase, userId, String(input.client))
        if (cl.length === 1) clientId = cl[0].id as string
      }
      const { data, error } = await supabase.from('site_visits').insert({ user_id: userId, title: titre, client_id: clientId, address: String(input.adresse || '') || null, status: 'brouillon' }).select('id').single()
      if (error) return { result: "Je n'ai pas réussi à créer la visite." }
      return { result: `Visite « ${titre} » créée.`, cards: [{ label: titre, sublabel: 'Visite', href: '/visites' }] }
    }

    case 'preparer_facture': {
      const client = String(input.client || '').trim()
      if (!client) return { result: 'Pour quel client ?' }
      const cl = await findClient(supabase, userId, client)
      if (!cl.length) return { result: `Aucun client trouvé pour « ${client} ».` }
      if (cl.length > 1) return { result: `Plusieurs clients : ${cl.map(nomClient).join(', ')}. Lequel ?`, cards: cl.map(c => ({ label: nomClient(c), href: `/factures/nouveau?client=${c.id}` })) }
      return { result: `J'ouvre une nouvelle facture pour ${nomClient(cl[0])}. Complète à l'écran.`, navigateTo: `/factures/nouveau?client=${cl[0].id}` }
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

      if (canal === 'message_interne') {
        // 1) Groupe / conversation nommée qui matche.
        const { data: convs } = await supabase.from('conversations').select('id, name, type')
          .eq('user_id', userId).not('name', 'is', null).ilike('name', `%${dest}%`).limit(5)
        if (convs && convs.length === 1) {
          return {
            result: `Prêt à envoyer un message dans « ${convs[0].name} ». Tu confirmes ?`,
            pendingAction: { canal: 'message_interne', targetKind: 'conversation', conversationId: convs[0].id as string, label: convs[0].name as string, message },
          }
        }
        if (convs && convs.length > 1) {
          return { result: `Plusieurs conversations correspondent : ${convs.map(c => c.name).join(', ')}. Laquelle ?` }
        }
        // 2) Sinon, un salarié (conversation directe).
        const { data: emps } = await supabase.from('employees').select('id, full_name')
          .eq('user_id', userId).eq('active', true).ilike('full_name', `%${dest}%`).limit(5)
        if (!emps?.length) return { result: `Aucun salarié ni groupe trouvé pour « ${dest} ».` }
        if (emps.length > 1) return { result: `Plusieurs salariés correspondent : ${emps.map(e => e.full_name).join(', ')}. Lequel ?` }
        return {
          result: `Prêt à envoyer un message interne à ${emps[0].full_name}. Tu confirmes ?`,
          pendingAction: { canal: 'message_interne', targetKind: 'employee', employeeId: emps[0].id as string, label: emps[0].full_name as string, message },
        }
      }

      return { result: 'Canal inconnu.' }
    }

    default:
      return { result: `Outil inconnu : ${name}.` }
  }
}
