import { redirect } from "next/navigation";

/** Ancienne fiche contact — remplacée par le maître-détail AG-07 (?selected=). */
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/contacts?selected=${id}`);
}
