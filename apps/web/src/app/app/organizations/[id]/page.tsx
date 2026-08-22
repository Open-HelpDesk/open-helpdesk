import { redirect } from "next/navigation";

/** Old organization record page — replaced by the AG-08 master-detail view (?selected=). */
export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/organizations?selected=${id}`);
}
