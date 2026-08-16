import type { Metadata } from "next";
import "@openhelpdesk/ui/tokens.css";

export const metadata: Metadata = {
  title: "Open HelpDesk — Support client open source",
  description:
    "Plateforme de ticketing open source. Hébergez-la vous-même, ou laissez-nous le faire.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "var(--font-ui)" }}>{children}</body>
    </html>
  );
}
