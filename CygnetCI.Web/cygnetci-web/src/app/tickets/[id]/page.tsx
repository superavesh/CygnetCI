import TicketDetailClient from './TicketDetailClient';

// Builds a shell page for the route. All actual IDs load data client-side.
export function generateStaticParams() {
  return [{ id: '0' }];
}

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketDetailClient ticketId={id} />;
}
