import fs from "node:fs";
import crypto from "node:crypto";
import express from "express";
import type { Request, Response, Router } from "express";
import * as client from "openid-client";
import config from "../../lib/config.ts";
import type { AppKey } from "../../lib/config.ts";
import { AppError } from "../../lib/errors.ts";
import type { IdentityProfile } from "../users/service.ts";
import { safeReturnTo } from "../../lib/security.ts";

/**
 * OAuth 2.0 / OpenID Connect sign-in (Authorization Code flow + PKCE, state and nonce).
 *
 * Providers:
 *   google - Google accounts (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
 *   apple  - Sign in with Apple (APPLE_SERVICES_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY[_PATH])
 *   mock   - the local dev provider in /mock-oauth (development only)
 */

export type Provider = "google" | "apple" | "mock";
const PROVIDERS: Provider[] = ["google", "apple", "mock"];
const PROVIDER_LABELS: Record<Provider, string> = { google: "Google", apple: "Apple", mock: "Dev sign-in" };

function isProvider(value: string): value is Provider {
    return (PROVIDERS as string[]).includes(value);
}

function isEnabled(provider: Provider): boolean {
    return Boolean(config.oauth[provider]?.enabled);
}

/**
 * Apple doesn't use a static client secret: it's a short-lived ES256 JWT signed with the
 * .p8 key from the Apple Developer portal.
 */
function appleClientSecret(): string {
    const apple = config.oauth.apple;
    const pem = apple.privateKey ? apple.privateKey.replace(/\\n/g, "\n") : fs.readFileSync(apple.privateKeyPath, "utf8");
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const data = `${encode({ alg: "ES256", kid: apple.keyId })}.${encode({
        iss: apple.teamId,
        iat: now,
        exp: now + 60 * 60 * 24,
        aud: "https://appleid.apple.com",
        sub: apple.clientId
    })}`;
    const signature = crypto.sign("sha256", Buffer.from(data), { key: pem, dsaEncoding: "ieee-p1363" });
    return `${data}.${signature.toString("base64url")}`;
}

interface ProviderSettings {
    issuer: string;
    clientId: string;
    clientSecret: string;
    extraParams: Record<string, string>;
    scope?: string;
    ttlMs?: number;
    insecure?: boolean;
}

function providerSettings(provider: Provider, appKey: AppKey): ProviderSettings | null {
    if (!isEnabled(provider)) return null;
    if (provider === "google") {
        return {
            issuer: config.oauth.google.issuer,
            clientId: config.oauth.google.clientId,
            clientSecret: config.oauth.google.clientSecret,
            extraParams: { prompt: "select_account" }
        };
    }
    if (provider === "apple") {
        return {
            issuer: config.oauth.apple.issuer,
            clientId: config.oauth.apple.clientId,
            clientSecret: appleClientSecret(),
            // Apple only returns name/email when the response is POSTed back.
            extraParams: { response_mode: "form_post" },
            scope: "openid email name",
            ttlMs: 60 * 60 * 1000
        };
    }
    const registered = config.oauth.mock.clients[appKey];
    return {
        issuer: config.urls.mockOAuth,
        clientId: registered.clientId,
        clientSecret: registered.clientSecret,
        insecure: config.urls.mockOAuth.startsWith("http://"),
        extraParams: {}
    };
}

export interface ProviderInfo {
    id: Provider;
    label: string;
    enabled: boolean;
}

/** Providers to show as buttons. Apple is listed (disabled) even before it's configured. */
export function providerList(): ProviderInfo[] {
    return PROVIDERS.filter((id) => id !== "mock" || isEnabled("mock")).map((id) => ({
        id,
        label: PROVIDER_LABELS[id],
        enabled: isEnabled(id)
    }));
}

export function enabledProviders(): ProviderInfo[] {
    return providerList().filter((provider) => provider.enabled);
}

interface Discovered {
    oidc: client.Configuration;
    settings: ProviderSettings;
}

const discovered = new Map<string, { pending: Promise<Discovered>; expires: number }>();

async function getConfiguration(provider: Provider, appKey: AppKey): Promise<Discovered> {
    const key = `${provider}:${appKey}`;
    const cached = discovered.get(key);
    if (cached && cached.expires > Date.now()) return cached.pending;

    const settings = providerSettings(provider, appKey);
    if (!settings) throw new AppError("NOT_FOUND", `${PROVIDER_LABELS[provider] || "That"} sign-in isn't set up yet.`);

    const pending = client
        .discovery(
            new URL(settings.issuer),
            settings.clientId,
            settings.clientSecret,
            client.ClientSecretPost(settings.clientSecret),
            settings.insecure ? { execute: [client.allowInsecureRequests] } : undefined
        )
        .then((oidc) => ({ oidc, settings }))
        .catch((err: Error) => {
            discovered.delete(key);
            console.error(`OIDC discovery failed for ${provider}:`, err.message);
            throw new AppError("SERVICE_UNAVAILABLE", `${PROVIDER_LABELS[provider]} sign-in is unreachable right now. Please try again.`);
        });
    discovered.set(key, { pending, expires: Date.now() + (settings.ttlMs || 12 * 60 * 60 * 1000) });
    return pending;
}

function regenerateSession(req: Request): Promise<void> {
    return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

function saveSession(req: Request): Promise<void> {
    return new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}

function defaultOnError(req: Request, res: Response, message: string): void {
    if (req.flash) req.flash("error", message);
    res.redirect("/login");
}

export interface AuthRouterOptions {
    appKey: AppKey;
    /** Public origin (+ optional path prefix) the router is mounted at; redirect URIs are built from it. */
    baseUrl: string;
    /** Extra data to remember across the redirect (may throw an AppError). */
    startContext?: (req: Request) => unknown;
    /** Runs on a freshly regenerated session (prevents session fixation). Returns where to redirect. */
    onSignIn: (req: Request, profile: IdentityProfile, context: { returnTo: string; extra: unknown }) => Promise<string> | string;
    onError?: (req: Request, res: Response, message: string, extra: unknown) => void;
    afterLogout?: string;
}

/**
 * Router with:
 *   GET  /auth/:provider                 -> redirect to the provider
 *   GET  /auth/:provider/callback        -> code exchange + ID token validation (Google, dev)
 *   POST /auth/:provider/callback        -> same, for Apple's form_post response
 *   POST /auth/logout
 */
export function createAuthRouter({
    appKey,
    baseUrl,
    onSignIn,
    startContext = () => null,
    onError = defaultOnError,
    afterLogout = "/login"
}: AuthRouterOptions): Router {
    const router = express.Router();

    router.get("/auth/:provider", async (req, res) => {
        const provider = String(req.params.provider);
        if (!isProvider(provider)) throw new AppError("NOT_FOUND", "Unknown sign-in provider.");
        const extra = startContext(req);
        const { oidc, settings } = await getConfiguration(provider, appKey);

        const codeVerifier = client.randomPKCECodeVerifier();
        const state = client.randomState();
        const nonce = client.randomNonce();

        req.session.oauth = {
            provider,
            codeVerifier,
            state,
            nonce,
            returnTo: safeReturnTo(req.query.returnTo, ""),
            extra,
            startedAt: Date.now()
        };
        await saveSession(req);

        const url = client.buildAuthorizationUrl(oidc, {
            redirect_uri: `${baseUrl}/auth/${provider}/callback`,
            scope: settings.scope || "openid email profile",
            response_type: "code",
            code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
            code_challenge_method: "S256",
            state,
            nonce,
            ...settings.extraParams
        });
        res.redirect(url.href);
    });

    async function callback(req: Request, res: Response): Promise<void> {
        const provider = String(req.params.provider);
        const params = (req.method === "POST" ? req.body || {} : req.query) as Record<string, unknown>;
        const pending = req.session.oauth;
        delete req.session.oauth;
        const extra = pending?.extra;

        if (params.error) {
            const cancelled = params.error === "access_denied" || params.error === "user_cancelled_authorize";
            return onError(req, res, cancelled ? "Sign-in was cancelled." : "Sign-in failed. Please try again.", extra);
        }
        if (!isProvider(provider) || !pending || pending.provider !== provider || Date.now() - pending.startedAt > 10 * 60 * 1000) {
            return onError(req, res, "Your sign-in session expired. Please try again.", extra);
        }

        const { oidc } = await getConfiguration(provider, appKey);
        // Rebuild the callback URL from whichever channel the response arrived on.
        const currentUrl = new URL(`${baseUrl}/auth/${provider}/callback`);
        for (const key of ["code", "state", "iss"]) {
            const value = params[key];
            if (typeof value === "string") currentUrl.searchParams.set(key, value);
        }

        let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>;
        try {
            tokens = await client.authorizationCodeGrant(oidc, currentUrl, {
                pkceCodeVerifier: pending.codeVerifier,
                expectedState: pending.state,
                expectedNonce: pending.nonce,
                idTokenExpected: true
            });
        } catch (err) {
            console.error(`OAuth callback failed for ${provider}:`, (err as Error).message);
            return onError(req, res, "We couldn't complete sign-in. Please try again.", extra);
        }

        const claims = tokens.claims()!;
        // Apple sends the user's name only once, in a separate "user" form field.
        let appleName: string | null = null;
        if (provider === "apple" && typeof params.user === "string") {
            try {
                const name = (JSON.parse(params.user) as { name?: { firstName?: string; lastName?: string } }).name || {};
                appleName = [name.firstName, name.lastName].filter(Boolean).join(" ") || null;
            } catch {
                appleName = null;
            }
        }
        const verified = claims.email_verified as unknown;
        const profile: IdentityProfile = {
            provider,
            subject: claims.sub,
            email: claims.email ? String(claims.email).toLowerCase() : null,
            // Apple sends "true"/"false" strings.
            emailVerified: verified === true || verified === "true" ? true : verified === undefined ? undefined : false,
            name: (claims.name as string | undefined) || appleName,
            picture: (claims.picture as string | undefined) || null
        };

        await regenerateSession(req);
        let destination: string;
        try {
            destination = await onSignIn(req, profile, { returnTo: pending.returnTo, extra });
        } catch (err) {
            if (err instanceof AppError && err.status < 500) return onError(req, res, err.message, extra);
            throw err;
        }
        await saveSession(req);
        res.redirect(destination);
    }

    router.get("/auth/:provider/callback", callback);
    router.post("/auth/:provider/callback", express.urlencoded({ extended: false, limit: "20kb" }), callback);

    router.post("/auth/logout", (req, res, next) => {
        req.session.destroy((err) => {
            if (err) return next(err);
            res.redirect(afterLogout);
        });
    });

    return router;
}
