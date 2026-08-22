import { redirect } from "next/navigation";

/** Old contact record page — replaced by the AG-07 master-detail view (?selected=). */
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/contacts?selected=${id}`);
}
