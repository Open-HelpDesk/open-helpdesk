import { ModalShell } from "@/components/modal-shell";
import { NewViewCard } from "../../../views/new/view-card";

/** newview over the inbox — the list behind it is what the blur frosts. */
export default async function NewViewModal({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <ModalShell paddingTop="6vh">
      <NewViewCard nameError={error === "name"} />
    </ModalShell>
  );
}
