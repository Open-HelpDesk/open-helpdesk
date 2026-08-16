import { createAuthClient } from "better-auth/react";

/** Client Better Auth — baseURL implicite : l'origine courante (le sous-domaine du tenant). */
export const authClient = createAuthClient();
