import type { UserRow } from "./types.ts";

export interface OAuthPending {
    provider: string;
    codeVerifier: string;
    state: string;
    nonce: string;
    returnTo: string;
    extra: unknown;
    startedAt: number;
}

declare module "express-session" {
    interface SessionData {
        csrfToken?: string;
        flash?: { type: string; message: string }[];
        oauth?: OAuthPending;
        adminId?: number;
    }
}

declare global {
    namespace Express {
        interface Request {
            /** Signed-in app user (API) */
            user?: UserRow;
            /** Bearer token of the request (API) */
            token?: string;
            /** Signed-in admin (admin app) */
            admin?: UserRow;
            requestId?: string;
            flash?: (type: string, message: string) => void;
        }
    }
}
