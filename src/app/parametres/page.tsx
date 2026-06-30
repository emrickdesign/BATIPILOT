import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Building2, Mail, User, FileText, ShieldCheck, Landmark, Calculator, Truck, Bell, HardHat } from 'lucide-react'

type Item = { href?: string; icon: typeof Building2; title: string; desc: string; soon?: boolean }
type Group = { title: string; items: Item[] }

const groups: Group[] = [
  {
    title: 'Entreprise',
    items: [
      { href: '/parametres/entreprise', icon: Building2, title: 'Mon entreprise', desc: 'Nom, SIRET, adresse, logo, couleurs, mentions légales' },
      { href: '/parametres/modele-document', icon: FileText, title: 'Modèles de devis & factures', desc: 'Importez un document existant — l\'IA reproduit votre style' },
    ],
  },
  {
    title: 'Équipe & accès',
    items: [
      { href: '/roles', icon: ShieldCheck, title: 'Utilisateurs & rôles', desc: 'Gérez les accès de votre équipe (admin, bureau, salarié…)' },
      { href: '/terrain', icon: HardHat, title: 'Interface salarié (terrain)', desc: 'Aperçu de l\'app mobile simplifiée pour les salariés sur chantier' },
    ],
  },
  {
    title: 'Connexions',
    items: [
      { href: '/parametres/gmail', icon: Mail, title: 'Email (Gmail)', desc: 'Connectez ou gérez votre compte Gmail' },
      { href: '/banque', icon: Landmark, title: 'Banque', desc: 'Import de relevé et rapprochement des paiements' },
      { href: '/comptable', icon: Calculator, title: 'Comptable', desc: 'Exports mensuels à transmettre à votre comptable' },
      { icon: Truck, title: 'Traceurs véhicules', desc: 'Connexion d\'un boîtier GPS à la flotte', soon: true },
    ],
  },
  {
    title: 'Compte & sécurité',
    items: [
      { href: '/parametres/compte', icon: User, title: 'Mon compte & sécurité', desc: 'Email, mot de passe' },
      { icon: Bell, title: 'Notifications', desc: 'Alertes email / mobile sur les actions importantes', soon: true },
    ],
  },
]

export default function ParametresPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-500 mt-1 text-sm">Configurez BatiPilot pour votre entreprise.</p>
      </div>

      {groups.map(group => (
        <div key={group.title}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{group.title}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {group.items.map(({ href, icon: Icon, title, desc, soon }) => {
              const inner = (
                <Card className={`h-full transition-colors ${soon ? 'opacity-60' : 'hover:border-blue-300 cursor-pointer'}`}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 flex items-center gap-2">{title}{soon && <span className="text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Bientôt</span>}</p>
                      <p className="text-sm text-gray-500">{desc}</p>
                    </div>
                  </CardContent>
                </Card>
              )
              return soon || !href ? <div key={title}>{inner}</div> : <Link key={title} href={href}>{inner}</Link>
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
