import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Conditions générales de vente — TonPilote',
  description: 'Les conditions générales de vente de l’abonnement TonPilote.',
}

// Page légale PUBLIQUE (sans authentification — cf. src/proxy.ts).
export default function CgvPage() {
  const maj = '13 septembre 2026'
  return (
    <main className="min-h-screen bg-[#FBF9F5] text-[#1E1B16]">
      <header className="border-b border-black/10 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-3xl px-5 py-4 flex items-center justify-between">
          <Link href="/" className="font-heading text-lg font-extrabold tracking-tight">Ton<span className="text-[#E0674C]">Pilote</span></Link>
          <nav className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/mentions-legales" className="hover:text-gray-800">Mentions légales</Link>
            <Link href="/confidentialite" className="hover:text-gray-800">Confidentialité</Link>
            <Link href="/" className="hover:text-gray-800">Accueil</Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Conditions générales de vente</h1>
        <p className="mt-2 text-sm text-gray-500">Dernière mise à jour : {maj}</p>

        <Section title="1. Objet">
          <p>Les présentes conditions générales de vente (« CGV ») régissent l’abonnement au service TonPilote, application de gestion pour artisans et entreprises du bâtiment. Elles complètent les <Link href="/conditions">conditions d’utilisation</Link>. Toute souscription implique leur acceptation.</p>
        </Section>

        <Section title="2. Vendeur">
          <p><b>PERILLIAT EMRICK</b> — entrepreneur individuel (micro-entreprise), SIRET <b>990 572 117 00010</b>, 4 avenue Maurice Franck, 73110 Valgelon-la-Rochette. Contact : <a href="mailto:potentiel.web@gmail.com">potentiel.web@gmail.com</a>.</p>
        </Section>

        <Section title="3. Service et offre">
          <p>TonPilote est un logiciel en ligne (SaaS) proposé par <b>abonnement mensuel, sans engagement</b>, avec le <b>1er mois offert</b>. Le tarif dépend de la taille de l’entreprise (dirigeant seul ou avec salariés). Les prix en vigueur sont affichés lors de la souscription et dans l’application.</p>
        </Section>

        <Section title="4. Souscription">
          <p>La souscription se fait en ligne, après création d’un compte. Le client déclare être un professionnel agissant pour les besoins de son activité. Les informations fournies doivent être exactes et à jour.</p>
        </Section>

        <Section title="5. Prix et paiement">
          <p>Les prix sont indiqués en euros. L’éditeur relève de la franchise en base de TVA (article 293 B du CGI) : la TVA n’est pas applicable, sauf mention contraire. L’abonnement est payable d’avance, par période mensuelle, par le moyen de paiement proposé lors de la souscription. Le 1er mois est gratuit ; la facturation démarre au début du 2e mois si le client n’a pas résilié.</p>
        </Section>

        <Section title="6. Durée et résiliation">
          <p>L’abonnement est conclu sans durée d’engagement et se renouvelle par tacite reconduction mensuelle. Le client peut <b>résilier à tout moment</b> depuis son espace ou par e-mail ; la résiliation prend effet à la fin de la période mensuelle en cours, sans remboursement du mois entamé. L’éditeur peut suspendre ou résilier un compte en cas de non-paiement ou d’usage frauduleux.</p>
        </Section>

        <Section title="7. Droit de rétractation">
          <p>Le service s’adressant à des professionnels dans le cadre de leur activité, le droit de rétractation de 14 jours prévu pour les consommateurs ne s’applique pas. Le <b>1er mois offert</b> permet néanmoins d’essayer le service sans frais.</p>
        </Section>

        <Section title="8. Disponibilité et responsabilité">
          <p>L’éditeur met tout en œuvre pour assurer la disponibilité du service, sans garantie d’absence d’interruption (maintenance, incidents, prestataires tiers). TonPilote est un outil d’aide à la gestion : le client reste seul responsable de ses obligations légales, comptables et fiscales et de la vérification des documents produits. La responsabilité de l’éditeur ne saurait être engagée pour les dommages indirects.</p>
        </Section>

        <Section title="9. Données personnelles">
          <p>Le traitement des données est décrit dans la <Link href="/confidentialite">politique de confidentialité</Link>.</p>
        </Section>

        <Section title="10. Droit applicable et litiges">
          <p>Les présentes CGV sont soumises au droit français. En cas de différend, les parties rechercheront une solution amiable avant toute action. À défaut, les tribunaux français seront compétents.</p>
        </Section>

        <Section title="11. Contact">
          <p><a href="mailto:potentiel.web@gmail.com">potentiel.web@gmail.com</a></p>
        </Section>
      </article>

      <footer className="border-t border-black/10 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} TonPilote · <Link href="/mentions-legales" className="hover:text-gray-600">Mentions légales</Link> · <Link href="/confidentialite" className="hover:text-gray-600">Confidentialité</Link>
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
