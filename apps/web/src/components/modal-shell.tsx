"use client";

/**
 * The layer a modal route sits on: scrim, blur, and the two ways out.
 *
 * The blur is the point. `backdrop-filter` frosts whatever is painted behind
 * the element — so this only looks like the mockup when the inbox is still
 * mounted underneath, which is what the intercepting routes (@modal) are for.
 * Reached directly, the same card renders as a page instead (see new/page.tsx).
 *
 * Closing goes through router.back(): the modal was pushed onto the history by
 * a client navigation, so going back is what removes it and puts the list in
 * front again. router.push("/app/tickets") would stack a second entry and make
 * the browser's back button walk through the modal again.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ModalShell({
  children,
  paddingTop = "7vh",
}: {
  children: React.ReactNode;
  paddingTop?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div
      className="fixed inset-0 z-50 grid overflow-auto"
      style={{
        placeItems: "start center",
        padding: `${paddingTop} 24px 40px`,
        background: "var(--scrim-modal)",
        backdropFilter: "blur(2px)",
      }}
      onClick={() => router.back()}
      role="dialog"
      aria-modal
    >
      {/* The card swallows the click: only the veil closes. */}
      <div className="contents" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
