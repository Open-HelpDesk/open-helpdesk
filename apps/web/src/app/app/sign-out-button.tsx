"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      title="Se déconnecter"
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
