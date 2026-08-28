import { NewTicketCard } from "./ticket-card";

/**
 * AG-05 as a page — a direct hit or a refresh, where no inbox is mounted to
 * float over. The modal version lives at @modal/(.)new and is what you get
 * navigating from the inbox.
 */
export default function NewTicketPage() {
  return (
    <div
      className="grid h-full overflow-auto"
      style={{
        padding: "7vh 24px 40px",
        placeItems: "start center",
        background: "var(--canvas)",
      }}
    >
      <NewTicketCard />
    </div>
  );
}
