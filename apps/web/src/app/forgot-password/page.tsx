import { AuthCard } from "@/components/auth-card";
import { I18nProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";
import { ForgotForm } from "./forgot-form";

/**
 * Where the "Forgot your password?" link finally leads. The form asks Better
 * Auth's /request-password-reset (wired in packages/auth via sendResetPassword);
 * the email lands the user on /reset-password with a one-hour token.
 */
export default async function ForgotPasswordPage() {
  const t = await getT();
  return (
    <AuthCard>
      <I18nProvider locale={t.locale} dict={t.dict}>
        <ForgotForm />
      </I18nProvider>
    </AuthCard>
  );
}
