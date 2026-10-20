import crypto from "node:crypto";
import * as db from "../../db/index.ts";
import * as repo from "./repository.ts";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 2 * 60 * 1000;

function hash(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}

/** Bearer token for the apps. Only its hash is stored. */
function issue(userId: number): string {
    const token = crypto.randomBytes(32).toString("base64url");
    repo.insertToken(hash(token), userId, Date.now() + TOKEN_TTL_MS);
    return token;
}

/** Returns the user id for a valid token, or null. */
export function verify(token: unknown): number | null {
    if (typeof token !== "string" || token.length < 20) return null;
    const tokenHash = hash(token);
    const row = repo.findToken(tokenHash);
    if (!row || row.expires_at < Date.now()) return null;
    repo.touchToken(tokenHash);
    return row.user_id;
}

export function revoke(token: unknown): void {
    if (typeof token === "string") repo.deleteToken(hash(token));
}

export const revokeAllFor = repo.deleteTokensFor;

/** Short-lived, single-use code passed to the app after the browser sign-in. */
export function issueLoginCode(userId: number): string {
    const code = crypto.randomBytes(24).toString("base64url");
    repo.insertLoginCode(hash(code), userId, Date.now() + CODE_TTL_MS);
    return code;
}

/** Swap a login code for a bearer token. Returns null if unknown, used or expired. */
export function exchangeLoginCode(code: unknown): { token: string; userId: number } | null {
    if (typeof code !== "string") return null;
    return db.transaction(() => {
        const row = repo.takeLoginCode(hash(code));
        if (!row || row.expires_at < Date.now()) return null;
        return { token: issue(row.user_id), userId: row.user_id };
    });
}
