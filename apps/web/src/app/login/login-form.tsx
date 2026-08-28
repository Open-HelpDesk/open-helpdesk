"use client";

/**
 * AG-01 form (V2): SSO first, then the separator, then email and password —
 * the mockup's order, and the one an agent whose company runs SSO expects. The
 * mockup draws a single provider; both ship, so both are here.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/i18n/client";

/** SSO button — h44, radius 10, hairline that turns brand on hover. */
const ssoButton: React.CSSProperties = {
  height: 44,
  border: "1px solid var(--line)",
  borderRadius: 10,
  background: "var(--panel)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  fontSize: 14,
  fontWeight: 600,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--ink-2)",
};

/**
 * Provider marks in the mockup's own idiom — one monochrome glyph in the brand
 * stroke. Deliberately not the official Google and Microsoft logos: those come
 * with brand rules, and a redrawn approximation of them is worse than a plain
 * mark that claims nothing.
 */
function TileMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--brand)" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </svg>
  );
}

function CircleMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--brand)" strokeWidth="2" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 12h-6" />
    </svg>
  );
}

export function LoginForm({ initialError }: { initialError?: string }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    initialError === "not-a-member" ? t("app.login.notAMember") : null,
  );
  const [badCredentials, setBadCredentials] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setBadCredentials(false);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      // A rate-limit refusal is not a wrong password. Better Auth caps /sign-in
      // at a few calls per ten seconds; conflating the two blamed a legitimate
      // agent for a fault they had not committed, and invited them to fix a
      // correct password instead of waiting.
      // Same logic for an unverified email (cloud signup): the password IS
      // correct — telling the user otherwise sends them to reset a password
      // that works instead of opening the verification email.
      const rateLimited = error.status === 429;
      const unverified = error.code === "EMAIL_NOT_VERIFIED";
      setError(
        rateLimited
          ? t("app.login.rateLimited")
          : unverified
            ? t("app.login.emailNotVerified")
            : t("app.login.badCredentials"),
      );
      setBadCredentials(!rateLimited && !unverified);
      setPending(false);
      return;
    }
    router.push("/app/tickets");
    router.refresh();
  }

  async function onSocial(provider: "google" | "microsoft") {
    setError(null);
    setBadCredentials(false);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: "/app/tickets",
    });
    if (error) setError(t("app.login.providerMissing"));
  }

  const inputStyle: React.CSSProperties = {
    height: 42,
    padding: "0 13px",
    borderRadius: 10,
    border: `1px solid ${badCredentials ? "var(--dang)" : "var(--line)"}`,
    background: "var(--panel)",
    color: "var(--ink)",
    fontSize: 14,
    width: "100%",
  };

  return (
    // `method="post"` even though submission is intercepted in JavaScript: this
    // is the safety net for the window before hydration. Without it, a form with
    // no method goes out as GET, and both the email and the password end up in
    // URL parameters — hence in the address bar, the history and the server
    // access logs.
    <form onSubmit={onSubmit} method="post" className="flex flex-col" style={{ gap: 14 }}>
      <button
        type="button"
        onClick={() => onSocial("microsoft")}
        className="ohd-hover-edge-ink"
        style={ssoButton}
      >
        <TileMark />
        {t("app.login.microsoft")}
      </button>
      <button
        type="button"
        onClick={() => onSocial("google")}
        className="ohd-hover-edge-ink"
        style={ssoButton}
      >
        <CircleMark />
        {t("app.login.google")}
      </button>

      <div
        className="flex items-center"
        style={{ gap: 12, color: "var(--ink-3)", fontSize: 12 }}
      >
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        {t("app.login.or")}
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>

      <label className="flex flex-col" style={{ gap: 6 }}>
        <span style={labelStyle}>{t("app.login.email")}</span>
        <input
          className="ohd-field outline-none"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t("app.login.emailPlaceholder")}
          style={inputStyle}
        />
      </label>
      <label className="flex flex-col" style={{ gap: 6 }}>
        <span style={labelStyle}>{t("app.login.password")}</span>
        <input
          className="ohd-field outline-none"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          style={inputStyle}
        />
      </label>

      {error && (
        <p
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--dang-t)",
            border: "1px solid var(--dang)",
            color: "var(--dang)",
            fontSize: 13,
          }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="grid place-items-center disabled:opacity-60"
        style={{
          color: "var(--on-brand)",
          height: 44,
          borderRadius: 10,
          background: "var(--brand)",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {pending ? t("app.login.pending") : t("app.login.submit")}
      </button>

      <a href="/forgot-password" className="ohd-link text-center" style={{ fontSize: 13 }}>
        {t("app.login.forgot")}
      </a>
    </form>
  );
}
