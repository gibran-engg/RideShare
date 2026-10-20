import * as db from "../../db/index.ts";

/** App bearer tokens and one-time login codes. Only SHA-256 hashes are stored. */

interface StoredSecret {
    user_id: number;
    expires_at: number;
}

export function insertToken(tokenHash: string, userId: number, expiresAt: number): void {
    db.get().prepare("INSERT INTO api_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, userId, expiresAt);
}

export function findToken(tokenHash: string): StoredSecret | null {
    return (
        (db.get().prepare("SELECT user_id, expires_at FROM api_tokens WHERE token_hash = ?").get(tokenHash) as StoredSecret | undefined) ??
        null
    );
}

export function touchToken(tokenHash: string): void {
    db.get().prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE token_hash = ?").run(tokenHash);
}

export function deleteToken(tokenHash: string): void {
    db.get().prepare("DELETE FROM api_tokens WHERE token_hash = ?").run(tokenHash);
}

export function deleteTokensFor(userId: number): void {
    db.get().prepare("DELETE FROM api_tokens WHERE user_id = ?").run(userId);
}

export function insertLoginCode(codeHash: string, userId: number, expiresAt: number): void {
    const conn = db.get();
    conn.prepare("DELETE FROM login_codes WHERE expires_at < ?").run(Date.now());
    conn.prepare("INSERT INTO login_codes (code_hash, user_id, expires_at) VALUES (?, ?, ?)").run(codeHash, userId, expiresAt);
}

/** Removes and returns a login code (single use). Call inside a transaction. */
export function takeLoginCode(codeHash: string): StoredSecret | null {
    const conn = db.get();
    const row = conn.prepare("SELECT user_id, expires_at FROM login_codes WHERE code_hash = ?").get(codeHash) as StoredSecret | undefined;
    if (row) conn.prepare("DELETE FROM login_codes WHERE code_hash = ?").run(codeHash);
    return row ?? null;
}
