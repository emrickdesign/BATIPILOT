import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — TonPilote',
  description: 'Comment TonPilote collecte, utilise et protège vos données personnelles.',
}

// Page légale PUBLIQUE (sans authentification — cf. src/proxy.ts).
// Requise pour la validation Google OAuth : elle décrit l'usage des données
// Google (Gmail / Agenda) et contient la mention « Limited Use ».
export default function ConfidentialitePage() {
  const maj = '13 septembre 2026'
  return (
    <main className="min-h-screen bg-[#FBF9F5] text-[#1E1B16]">
      <header className="border-b border-black/10 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-3xl px-5 py-4 flex items-center justify-between">
          <Link href="/" className="font-heading text-lg font-extrabold tracking-tight">Ton<span className="text-[#E0674C]">Pilote</span></Link>
          <nav className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/conditions" className="hover:text-gray-800">Conditions</Link>
            <Link href="/" className="hover:text-gray-800">Accueil</Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-10 prose-legal">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Politique de confidentialité</h1>
        <p className="mt-2 text-sm text-gray-500">Dernière mise à jour : {maj}</p>

        <Section title="1. Responsable du traitement">
          <p>TonPilote (« l’Application », « nous ») est édité par <b>PERILLIAT EMRICK — entrepreneur individuel (micro-entreprise)</b>, SIRET <b>990 572 117 00010</b>, dont le siège est situé <b>4 avenue Maurice Franck, 73110 Valgelon-la-Rochette</b>. Pour toute question relative à vos données : <a href="mailto:potentiel.web@gmail.com">potentiel.web@gmail.com</a>.</p>
        </Section>

        <Section title="2. Données que nous collectons">
          <ul>
            <li><b>Compte</b> : nom, adresse e-mail, mot de passe (chiffré).</li>
            <li><b>Entreprise</b> : raison sociale, SIRET, adresse, coordonnées, IBAN, numéros d’assurance, mentions légales — pour établir vos devis et factures.</li>
            <li><b>Activité</b> : clients, chantiers, devis, factures, notes, photos et documents que vous créez dans l’Application.</li>
            <li><b>Données Google</b> (si vous connectez votre compte) : voir la section 4.</li>
            <li><b>Données bancaires</b> (si vous connectez votre banque via notre agrégateur agréé DSP2) : intitulé du compte, IBAN, opérations reçues — en lecture seule, pour le rapprochement de vos factures.</li>
            <li><b>Données techniques</b> : journaux de connexion et de sécurité.</li>
          </ul>
        </Section>

        <Section title="3. Finalités">
          <p>Vos données servent uniquement à : fournir le service (gestion de devis, factures, chantiers, clients), pré-remplir vos documents, rapprocher vos paiements, assurer la sécurité et le support. Nous ne vendons jamais vos données.</p>
        </Section>

        <Section title="4. Utilisation des données Google (Gmail & Agenda)">
          <p>Si vous connectez votre compte Google, TonPilote accède à votre messagerie et à votre agenda pour vous permettre, depuis l’Application, de lire vos e-mails clients, d’envoyer vos devis/factures par e-mail et d’organiser vos rendez-vous.</p>
          <p className="rounded-xl border border-[#E0674C]/30 bg-[#E0674C]/[0.06] p-3 text-[15px]">
            <b>Utilisation limitée (Limited Use).</b> L’utilisation et le transfert par TonPilote des informations reçues des API Google respectent la <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, y compris ses exigences d’<b>utilisation limitée</b> (« Limited Use »). Concrètement : vos données Gmail et Agenda ne sont utilisées que pour vous fournir les fonctionnalités décrites ci-dessus ; elles ne sont pas vendues, ni utilisées à des fins publicitaires, ni exploitées pour entraîner des modèles d’IA généralisés, et aucun humain ne les lit sauf accord explicite de votre part, pour la sécurité, ou obligation légale.
          </p>
          <p>Vous pouvez révoquer cet accès à tout moment depuis les réglages de votre compte Google (<a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>) ou depuis TonPilote.</p>
        </Section>

        <Section title="5. Hébergement et sous-traitants">
          <p>Vos données sont hébergées et traitées par des prestataires qui agissent pour notre compte :</p>
          <ul>
            <li><b>Supabase</b> (base de données et authentification, hébergement Union européenne) ;</li>
            <li><b>Vercel</b> (hébergement de l’application) ;</li>
            <li><b>Bridge</b> (agrégation bancaire agréée DSP2), si vous connectez votre banque ;</li>
            <li><b>Anthropic</b> (assistant IA), uniquement sur le contenu que vous lui soumettez ;</li>
            <li><b>Google</b>, pour les fonctionnalités Gmail/Agenda que vous activez.</li>
          </ul>
        </Section>

        <Section title="6. Durée de conservation">
          <p>Vos données sont conservées tant que votre compte est actif. À la suppression du compte, elles sont effacées sous 30 jours, sauf obligations légales (les documents comptables sont conservés selon les durées légales en vigueur).</p>
        </Section>

        <Section title="7. Sécurité">
          <p>Nous mettons en œuvre des mesures techniques et organisationnelles adaptées (chiffrement des mots de passe et des jetons d’accès, accès restreint, connexions sécurisées HTTPS).</p>
        </Section>

        <Section title="8. Vos droits (RGPD)">
          <p>Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité de vos données. Pour les exercer, écrivez à <a href="mailto:potentiel.web@gmail.com">potentiel.web@gmail.com</a>. Vous pouvez aussi introduire une réclamation auprès de la CNIL (cnil.fr).</p>
        </Section>

        <Section title="9. Cookies">
          <p>TonPilote n’utilise que des cookies strictement nécessaires au fonctionnement (session, sécurité). Aucun cookie publicitaire ou de suivi tiers.</p>
        </Section>

        <Section title="10. Contact">
          <p>Pour toute question : <a href="mailto:potentiel.web@gmail.com">potentiel.web@gmail.com</a>.</p>
        </Section>
      </article>

      <footer className="border-t border-black/10 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} TonPilote · <Link href="/conditions" className="hover:text-gray-600">Conditions d’utilisation</Link>
      </footer>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="font-heading text-lg font-bold text-[#2A2620]">{title}</h2>
      <div className="mt-2 space-y-2.5 text-[15px] leading-relaxed text-[#3A352C] [&_a]:text-[#C14E33] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  )
}
