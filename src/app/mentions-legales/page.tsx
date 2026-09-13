import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Mentions légales — TonPilote',
  description: 'Mentions légales du service TonPilote (éditeur, hébergement, contact).',
}

// Page légale PUBLIQUE (sans authentification — cf. src/proxy.ts).
export default function MentionsLegalesPage() {
  const maj = '13 septembre 2026'
  return (
    <main className="min-h-screen bg-[#FBF9F5] text-[#1E1B16]">
      <header className="border-b border-black/10 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-3xl px-5 py-4 flex items-center justify-between">
          <Link href="/" className="font-heading text-lg font-extrabold tracking-tight">Ton<span className="text-[#E0674C]">Pilote</span></Link>
          <nav className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/cgv" className="hover:text-gray-800">CGV</Link>
            <Link href="/confidentialite" className="hover:text-gray-800">Confidentialité</Link>
            <Link href="/" className="hover:text-gray-800">Accueil</Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Mentions légales</h1>
        <p className="mt-2 text-sm text-gray-500">Dernière mise à jour : {maj}</p>

        <Section title="1. Éditeur du site">
          <p>Le site et l’application <b>TonPilote</b> (tonpilote.com) sont édités par :</p>
          <ul>
            <li><b>PERILLIAT EMRICK</b> — entrepreneur individuel (micro-entreprise)</li>
            <li>SIRET : <b>990 572 117 00010</b> — SIREN : 990 572 117</li>
            <li>RCS : 990 572 117 R.C.S. Chambéry</li>
            <li>N° TVA intracommunautaire : FR16 990 572 117</li>
            <li>Siège : 4 avenue Maurice Franck, 73110 Valgelon-la-Rochette, France</li>
            <li>E-mail : <a href="mailto:potentiel.web@gmail.com">potentiel.web@gmail.com</a></li>
          </ul>
        </Section>

        <Section title="2. Directeur de la publication">
          <p>Emrick Perilliat.</p>
        </Section>

        <Section title="3. Hébergement">
          <ul>
            <li>Application : <b>Vercel Inc.</b>, 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis.</li>
            <li>Base de données : <b>Supabase</b> (hébergement Union européenne).</li>
          </ul>
        </Section>

        <Section title="4. Propriété intellectuelle">
          <p>La marque TonPilote, le site, l’application et leurs contenus (textes, visuels, code) sont protégés. Toute reproduction ou réutilisation sans autorisation est interdite. Les données que vous saisissez dans l’application vous appartiennent.</p>
        </Section>

        <Section title="5. Données personnelles">
          <p>Le traitement de vos données est détaillé dans notre <Link href="/confidentialite">politique de confidentialité</Link>. Vous disposez de droits d’accès, de rectification et de suppression, à exercer à <a href="mailto:potentiel.web@gmail.com">potentiel.web@gmail.com</a>.</p>
        </Section>

        <Section title="6. Contact">
          <p><a href="mailto:potentiel.web@gmail.com">potentiel.web@gmail.com</a></p>
        </Section>
      </article>

      <footer className="border-t border-black/10 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} TonPilote · <Link href="/cgv" className="hover:text-gray-600">CGV</Link> · <Link href="/confidentialite" className="hover:text-gray-600">Confidentialité</Link>
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
