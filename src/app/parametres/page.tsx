import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Building2, Mail, User } from 'lucide-react'

const sections = [
  {
    href: '/parametres/entreprise',
    icon: Building2,
    title: 'Mon entreprise',
    desc: 'Nom, SIRET, adresse, logo, mentions légales',
  },
  {
    href: '/parametres/gmail',
    icon: Mail,
    title: 'Connexion Gmail',
    desc: 'Connectez ou gérez votre compte Gmail',
  },
  {
    href: '/parametres/compte',
    icon: User,
    title: 'Mon compte',
    desc: 'Email, mot de passe',
  },
]

export default function ParametresPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
      <div className="grid gap-3">
        {sections.map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href}>
            <Card className="hover:border-blue-300 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{title}</p>
                  <p className="text-sm text-gray-500">{desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
