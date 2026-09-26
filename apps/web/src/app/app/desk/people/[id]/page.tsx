import { PeopleScreen } from "@/components/desk/it/people-screen";

/** SD-A5 — one person's profile (linked from the hardware list, a request, a review). */
export default async function DeskPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PeopleScreen selectedId={id} />;
}
