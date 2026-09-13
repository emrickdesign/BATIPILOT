import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Conditions d’utilisation — TonPilote',
  description: 'Les conditions générales d’utilisation du service TonPilote.',
}

// Page légale PUBLIQUE (sans authentification — cf. src/proxy.ts).
export default function ConditionsPage() {
  const maj = '13 septembre 2026'
  return (
    <main className="min-h-screen bg-[#FBF9F5] text-[#1E1B16]">
      <header className="border-b border-black/10 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-3xl px-5 py-4 flex items-center justify-between">
          <Link href="/" className="font-heading text-lg font-extrabold tracking-tight">Ton<span className="text-[#E0674C]">Pilote</span></Link>
          <nav className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/confidentialite" className="hover:text-gray-800">Confidentialité</Link>
            <Link href="/" className="hover:text-gray-800">Accueil</Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Conditions générales d’utilisation</h1>
        <p className="mt-2 text-sm text-gray-500">Dernière mise à jour : {maj}</p>

        <Section title="1. Objet">
          <p>Les présentes conditions régissent l’accès et l’utilisation de TonPilote (« le Service »), application de gestion destinée aux artisans et entreprises du bâtiment. En créant un compte, vous les acceptez.</p>
        </Section>

        <Section title="2. Éditeur">
          <p>Le Service est édité par <b>[Raison sociale à compléter]</b>, SIRET <b>[SIRET]</b>, <b>[Adresse]</b>. Contact : <a href="mailto:contact@tonpilote.com">contact@tonpilote.com</a>.</p>
        </Section>

        <Section title="3. Description du service">
          <p>TonPilote permet de gérer devis, factures, clients, chantiers, notes et documents, avec des fonctionnalités optionnelles : assistant IA, connexion à votre messagerie Gmail (envoi/lecture d’e-mails, agenda) et à votre banque (agrégateur agréé DSP2, lecture seule). Ces connexions sont facultatives et activées par vous.</p>
        </Section>

        <Section title="4. Compte & accès">
          <p>Vous êtes responsable de l’exactitude des informations fournies et de la confidentialité de vos identifiants. Vous vous engagez à un usage conforme à la loi et aux présentes conditions.</p>
        </Section>

        <Section title="5. Abonnement & tarifs">
          <p>Le Service est proposé sur abonnement mensuel, sans engagement, avec le 1er mois offert. Les tarifs applicables sont présentés lors de l’inscription et dans l’Application. Vous pouvez résilier à tout moment.</p>
        </Section>

        <Section title="6. Connexions à des services tiers">
          <p>Lorsque vous connectez Google (Gmail/Agenda) ou votre banque, vous autorisez TonPilote à accéder aux données nécessaires aux fonctionnalités correspondantes, dans les conditions décrites par notre <Link href="/confidentialite">politique de confidentialité</Link>. Vous pouvez révoquer ces accès à tout moment.</p>
        </Section>

        <Section title="7. Propriété intellectuelle">
          <p>Le Service, sa marque et ses contenus restent la propriété de l’éditeur. Les données que vous saisissez (clients, devis, documents…) vous appartiennent ; vous en accordez à l’éditeur l’usage strictement nécessaire à la fourniture du Service.</p>
        </Section>

        <Section title="8. Responsabilité">
          <p>TonPilote est un outil d’aide à la gestion. Vous restez responsable de vos obligations légales, comptables et fiscales, et de la vérification des documents produits. Le Service est fourni « en l’état » ; notre responsabilité ne saurait être engagée pour les dommages indirects.</p>
        </Section>

        <Section title="9. Disponibilité">
          <p>Nous nous efforçons d’assurer la disponibilité du Service mais ne pouvons la garantir sans interruption (maintenance, incidents techniques, prestataires tiers).</p>
        </Section>

        <Section title="10. Résiliation">
          <p>Vous pouvez supprimer votre compte à tout moment. Nous pouvons suspendre un compte en cas d’usage frauduleux ou contraire aux présentes conditions.</p>
        </Section>

        <Section title="11. Données personnelles">
          <p>Le traitement de vos données est décrit dans notre <Link href="/confidentialite">politique de confidentialité</Link>.</p>
        </Section>

        <Section title="12. Droit applicable">
          <p>Les présentes conditions sont soumises au droit français. En cas de litige, une solution amiable sera recherchée avant toute action.</p>
        </Section>

        <Section title="13. Contact">
          <p><a href="mailto:contact@tonpilote.com">contact@tonpilote.com</a></p>
        </Section>
      </article>

      <footer className="border-t border-black/10 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} TonPilote · <Link href="/confidentialite" className="hover:text-gray-600">Politique de confidentialité</Link>
      </footer>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="font-heading text-lg font-bold text-[#2A2620]">{title}</h2>
      <div className="mt-2 space-y-2.5 text-[15px] leading-relaxed text-[#3A352C] [&_a]:text-[#C14E33] [&_a]:underline">
        {children}
      </div>
    </section>
  )
}
