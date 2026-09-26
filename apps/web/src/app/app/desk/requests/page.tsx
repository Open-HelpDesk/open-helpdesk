import { redirect } from "next/navigation";

/** /app/desk/requests has no screen of its own: the queue lives at /app/desk. */
export default function DeskRequestsIndex() {
  redirect("/app/desk");
}
