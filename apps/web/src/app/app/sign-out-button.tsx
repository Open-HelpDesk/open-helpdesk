"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/i18n/client";

export function SignOutButton() {
  const t = useT();
  const router = useRouter();
  return (
    <button
      type="button"
      title={t("app.shell.signOut")}
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="rounded-md p-2"
      style={{ color: "var(--mute)" }}
    >
      <LogOut size={16} />
    </button>
  );
}
