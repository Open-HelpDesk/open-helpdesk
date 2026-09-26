import { RequestsScreen } from "@/components/desk/it/requests-screen";
import { parseQueueFilter } from "@/lib/desk/it-data";

/** SD-A1 — access requests: the queue, with the first request of the view selected. */
export default async function DeskRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return <RequestsScreen filter={parseQueueFilter(sp.f)} selectedId={null} />;
}
