import ClientFiche from '@/app/clients/[id]/ClientFiche'

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ClientFiche id={id} base="/prospects" />
}
