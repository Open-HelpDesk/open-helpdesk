import { getPortalTenant } from "@/lib/portal-auth";

/**
 * Formulaire compact du widget (ST-09) — rendu dans l'iframe, hors shell du portail.
 * POST multipart vers /api/portal/widget-submit (pièce jointe acceptée, 10 Mo max).
 */
export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const tenant = await getPortalTenant();
  const { sent } = await searchParams;
  if (!tenant) return null;

  if (sent) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <p className="text-3xl">✅</p>
        <h1 className="mt-2 text-base font-semibold">Demande envoyée</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--mute)" }}>
          Vous recevrez la réponse par email.
        </p>
        <a href="/widget" className="mt-4 text-sm underline" style={{ color: "var(--acc)" }}>
          Envoyer une autre demande
        </a>
      </main>
    );
  }

  return (
    <main className="p-4" style={{ fontSize: 14 }}>
      <h1 className="text-base font-semibold">{tenant.name}</h1>
      <p className="mb-3 text-xs" style={{ color: "var(--mute)" }}>
        Décrivez votre demande, nous répondons par email.
      </p>
      <form
        action="/api/portal/widget-submit"
        method="post"
        encType="multipart/form-data"
        className="flex flex-col gap-2.5"
      >
        <input
          name="email"
          type="email"
          required
          placeholder="Votre email"
          className="rounded-md border px-3 py-2"
          style={{ borderColor: "var(--line)", background: "var(--bg)" }}
        />
        <input
          name="subject"
          required
          placeholder="Sujet"
          className="rounded-md border px-3 py-2"
          style={{ borderColor: "var(--line)", background: "var(--bg)" }}
        />
        <textarea
          name="body"
          required
          rows={6}
          placeholder="Votre message…"
          className="resize-y rounded-md border px-3 py-2"
          style={{ borderColor: "var(--line)", background: "var(--bg)" }}
        />
        <label className="text-xs" style={{ color: "var(--mute)" }}>
          Pièce jointe (10 Mo max)
          <input name="files" type="file" className="mt-1 block w-full text-xs" />
        </label>
        <button
          type="submit"
          className="rounded-md px-4 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--acc)" }}
        >
          Envoyer
        </button>
      </form>
    </main>
  );
}
