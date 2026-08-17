import { redirect } from "next/navigation";

/** Ancienne fiche organisation — remplacée par le maître-détail AG-08 (?selected=). */
export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/organizations?selected=${id}`);
}
