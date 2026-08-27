import { AuthCard } from "@/components/auth-card";
import { I18nProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";
import { ResetForm } from "./reset-form";

/**
 * Landing page of the reset email link (built in packages/auth to point at this
 * tenant subdomain, with the token in the query). The token is validated only
 * when the new password is submitted — Better Auth's /reset-password consumes
 * `reset-password:${token}`. A missing token is reported rather than rendering a
 * form that cannot work.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getT();
  const { token } = await searchParams;
  return (
    <AuthCard>
      <I18nProvider locale={t.locale} dict={t.dict}>
        <ResetForm token={token ?? ""} />
      </I18nProvider>
    </AuthCard>
  );
}
