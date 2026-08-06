import ClientFiche from './ClientFiche'

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ClientFiche id={id} base="/clients" />
}
