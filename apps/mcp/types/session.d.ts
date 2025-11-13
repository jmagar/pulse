import "express-session";

declare module "express-session" {
  interface SessionData {
    oauth?: {
      state: string;
      codeVerifier: string;
    };
    user?: {
      id: string;
      email?: string;
      scopes: string[];
      expiresAt?: string;
    };
    csrfToken?: string;
  }
}
