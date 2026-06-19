import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const categories = [
  { name: 'Préparation / Protection', sort_order: 1 },
  { name: 'Démolition', sort_order: 2 },
  { name: 'Peinture', sort_order: 3 },
  { name: 'Placo / Cloisons', sort_order: 4 },
  { name: 'Isolation', sort_order: 5 },
  { name: 'Carrelage', sort_order: 6 },
  { name: 'Revêtements de sol', sort_order: 7 },
  { name: 'Plomberie', sort_order: 8 },
  { name: 'Électricité', sort_order: 9 },
  { name: 'Menuiserie', sort_order: 10 },
  { name: 'Maçonnerie', sort_order: 11 },
  { name: 'Main-d\'œuvre / Déplacement', sort_order: 12 },
  { name: 'Divers', sort_order: 13 },
]

const itemsByCategory: Record<string, { name: string; unit: string; price: number; desc?: string }[]> = {
  'Préparation / Protection': [
    { name: 'Protection chantier (sol, mobilier)', unit: 'forfait', price: 80 },
    { name: 'Bâchage et protection surfaces', unit: 'm2', price: 3 },
    { name: 'Nettoyage fin de chantier', unit: 'forfait', price: 120 },
  ],
  'Démolition': [
    { name: 'Dépose ancien carrelage sol', unit: 'm2', price: 18 },
    { name: 'Dépose ancien revêtement mural', unit: 'm2', price: 15 },
    { name: 'Démolition cloison', unit: 'm2', price: 35 },
    { name: 'Évacuation gravats', unit: 'forfait', price: 150 },
  ],
  'Peinture': [
    { name: 'Préparation support mur (rebouchage, ponçage)', unit: 'm2', price: 8 },
    { name: 'Impression mur', unit: 'm2', price: 6 },
    { name: 'Peinture mur 2 couches', unit: 'm2', price: 28 },
    { name: 'Peinture plafond 2 couches', unit: 'm2', price: 22 },
    { name: 'Peinture boiseries (portes, fenêtres)', unit: 'u', price: 85 },
    { name: 'Peinture radiateur', unit: 'u', price: 45 },
  ],
  'Placo / Cloisons': [
    { name: 'Pose cloison placo BA13', unit: 'm2', price: 45 },
    { name: 'Pose doublage isolant', unit: 'm2', price: 52 },
    { name: 'Pose faux plafond', unit: 'm2', price: 38 },
    { name: 'Réalisation bandes à joints', unit: 'ml', price: 4 },
    { name: 'Enduit de finition', unit: 'm2', price: 12 },
  ],
  'Isolation': [
    { name: 'Isolation mur intérieur (laine de verre)', unit: 'm2', price: 35 },
    { name: 'Isolation combles soufflée', unit: 'm2', price: 28 },
    { name: 'Isolation sol (sous chape)', unit: 'm2', price: 22 },
  ],
  'Carrelage': [
    { name: 'Pose carrelage sol (format standard)', unit: 'm2', price: 45 },
    { name: 'Pose carrelage sol (grand format)', unit: 'm2', price: 60 },
    { name: 'Pose faïence murale', unit: 'm2', price: 50 },
    { name: 'Pose plinthe carrelage', unit: 'ml', price: 12 },
    { name: 'Ragréage avant carrelage', unit: 'm2', price: 15 },
    { name: 'Joint époxy carrelage', unit: 'm2', price: 18 },
  ],
  'Revêtements de sol': [
    { name: 'Pose parquet stratifié', unit: 'm2', price: 28 },
    { name: 'Pose parquet massif', unit: 'm2', price: 45 },
    { name: 'Pose vinyl / LVT', unit: 'm2', price: 22 },
    { name: 'Pose moquette', unit: 'm2', price: 20 },
    { name: 'Pose plinthe bois', unit: 'ml', price: 8 },
  ],
  'Plomberie': [
    { name: 'Remplacement robinetterie lavabo', unit: 'u', price: 120 },
    { name: 'Remplacement robinetterie baignoire/douche', unit: 'u', price: 180 },
    { name: 'Pose meuble vasque complet', unit: 'u', price: 250 },
    { name: 'Pose receveur de douche', unit: 'u', price: 220 },
    { name: 'Pose WC suspendu', unit: 'u', price: 350 },
    { name: 'Pose radiateur sèche-serviettes', unit: 'u', price: 280 },
  ],
  'Électricité': [
    { name: 'Pose point luminaire', unit: 'u', price: 80 },
    { name: 'Pose prise électrique', unit: 'u', price: 55 },
    { name: 'Pose interrupteur', unit: 'u', price: 45 },
    { name: 'Pose tableau électrique', unit: 'forfait', price: 450 },
  ],
  'Menuiserie': [
    { name: 'Pose porte intérieure (fourniture incluse)', unit: 'u', price: 350 },
    { name: 'Pose fenêtre (fourniture incluse)', unit: 'u', price: 650 },
    { name: 'Pose placard sur mesure', unit: 'forfait', price: 800 },
  ],
  'Maçonnerie': [
    { name: 'Création ouverture (hors structure)', unit: 'u', price: 400 },
    { name: 'Ragréage sol', unit: 'm2', price: 18 },
    { name: 'Chape liquide', unit: 'm2', price: 25 },
  ],
  'Main-d\'œuvre / Déplacement': [
    { name: 'Main-d\'œuvre horaire', unit: 'h', price: 45 },
    { name: 'Main-d\'œuvre journalière', unit: 'j', price: 320 },
    { name: 'Déplacement', unit: 'forfait', price: 50 },
  ],
  'Divers': [
    { name: 'Fournitures et consommables', unit: 'forfait', price: 0 },
    { name: 'Location matériel', unit: 'forfait', price: 0 },
    { name: 'Prestation sous-traitant', unit: 'forfait', price: 0 },
  ],
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  // Créer les catégories
  const { data: createdCats } = await supabase
    .from('price_categories')
    .insert(categories.map(c => ({ ...c, user_id: user.id })))
    .select()

  if (!createdCats) return NextResponse.json({ error: 'Erreur catégories' }, { status: 500 })

  // Créer les prestations
  const items = createdCats.flatMap(cat => {
    const catItems = itemsByCategory[cat.name] || []
    return catItems.map(item => ({
      user_id: user.id,
      category_id: cat.id,
      name: item.name,
      description: item.desc,
      unit: item.unit as string,
      unit_price_ht: item.price,
      vat_rate: 10,
      supply_included: true,
      labor_included: true,
      is_active: true,
    }))
  })

  await supabase.from('price_items').insert(items)

  return NextResponse.json({ success: true, count: items.length })
}
