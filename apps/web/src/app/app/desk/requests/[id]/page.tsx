import { RequestsScreen } from "@/components/desk/it/requests-screen";
import { parseQueueFilter } from "@/lib/desk/it-data";

/** SD-A1 — one access request, linkable (ticket, notification, colleague). */
export default async function DeskRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <RequestsScreen filter={parseQueueFilter(sp.f)} selectedId={id} />;
}
