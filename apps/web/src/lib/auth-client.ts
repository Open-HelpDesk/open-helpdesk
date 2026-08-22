import { createAuthClient } from "better-auth/react";

/** Better Auth client — implicit baseURL: the current origin (the tenant's subdomain). */
export const authClient = createAuthClient();
