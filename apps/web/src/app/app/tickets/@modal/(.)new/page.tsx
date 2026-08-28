import { ModalShell } from "@/components/modal-shell";
import { NewTicketCard } from "../../new/ticket-card";

/** AG-05 over the inbox: the list stays mounted, so the blur has something to frost. */
export default function NewTicketModal() {
  return (
    <ModalShell paddingTop="7vh">
      <NewTicketCard />
    </ModalShell>
  );
}
