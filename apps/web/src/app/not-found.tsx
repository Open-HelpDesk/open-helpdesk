import { getTenantFromHeaders } from "@/lib/tenant";
import { WORKSPACE_NOT_FOUND } from "@/lib/workspace-not-found";

/**
 * The 404 of the product, for the two things a 404 can mean here.
 *
 * A subdomain that matches no workspace lands here through `requireTenant()`,
 * and it deserves the way out rather than a dead end: whoever typed it was
 * after a workspace, and mistyping one is the likeliest reason to be here. A
 * page missing *inside* a real workspace (a ticket, an article) is an ordinary
 * 404 and says so.
 *
 * Telling the two apart costs no query: the tenant lookup is memoised per
 * request and has already run by the time we get here.
 *
 * Styles are literal rather than themed on purpose — the tenant is precisely
 * what may be missing, so there is no branding to honour.
 */
export default async function NotFound() {
  const tenant = await getTenantFromHeaders().catch(() => null);
  const signupUrl = process.env.SIGNUP_URL;

  return (
    <main
      style={{
        margin: 0,
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#F4F6F5",
        color: "#11211C",
      }}
    >
      <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
        <h1 style={{ fontSize: 22, margin: "0 0 10px" }}>
          {tenant ? "Page not found" : WORKSPACE_NOT_FOUND.title}
        </h1>
        <p style={{ fontSize: 14, color: "#51615B", margin: "0 0 18px" }}>
          {tenant
            ? "The address is correct, but there is nothing at it any more."
            : WORKSPACE_NOT_FOUND.body}
        </p>
        {!tenant && signupUrl && (
          <a
            href={signupUrl}
            style={{
              display: "inline-block",
              background: "#0B5F46",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
              padding: "10px 18px",
              borderRadius: 8,
            }}
          >
            {WORKSPACE_NOT_FOUND.cta}
          </a>
        )}
      </div>
    </main>
  );
}
