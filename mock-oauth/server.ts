/**
 * Development-only OpenID Connect provider.
 *
 * Implements just enough of OIDC for local sign-in without Google credentials:
 * discovery, /authorize (code flow, PKCE S256 required), /token, /jwks, /userinfo.
 * ID tokens are RS256-signed with a key generated at startup. Anyone can sign in
 * as any email, so it refuses to start in production.
 */
import crypto from "node:crypto";
import express from "express";
import type { Response } from "express";
import { config, isMain } from "@rideshare/shared";
import type { AppKey } from "@rideshare/shared";

if (config.isProduction || !config.oauth.mock.enabled) {
    console.error("mock-oauth is a development tool and is disabled (NODE_ENV=production or MOCK_OAUTH_ENABLED=false).");
    process.exit(1);
}

const ISSUER = config.urls.mockOAuth;
const CODE_TTL_MS = 60 * 1000;
const TOKEN_TTL_S = 3600;

// Where each app receives the callback: the admin app itself, the API (mobile), or the web app (proxied to the API under /web).
const CALLBACK_BASE: Record<AppKey, string> = {
    admin: config.urls.admin,
    mobile: config.urls.api,
    web: `${config.urls.web}/web`
};

interface Client {
    clientId: string;
    clientSecret: string;
    appKey: AppKey;
    redirectUris: string[];
}

const clients = new Map<string, Client>(
    (Object.entries(config.oauth.mock.clients) as [AppKey, { clientId: string; clientSecret: string }][]).map(([appKey, registered]) => [
        registered.clientId,
        { ...registered, appKey, redirectUris: [`${CALLBACK_BASE[appKey]}/auth/mock/callback`] }
    ])
);

// Quick-pick accounts that match `npm run seed`.
const APP_ACCOUNTS = [
    { email: "rider@example.test", name: "Asha Rider", note: "Seeded rider" },
    { email: "driver@example.test", name: "Ravi Driver", note: "Seeded, approved driver" },
    { email: "newdriver@example.test", name: "Neha Newdriver", note: "Fresh account - try onboarding" },
    { email: "newrider@example.test", name: "Kabir Newrider", note: "Fresh account - try onboarding" }
];
const SAMPLE_ACCOUNTS: Record<AppKey, { email: string; name: string; note: string }[]> = {
    mobile: APP_ACCOUNTS,
    web: APP_ACCOUNTS,
    admin: [
        { email: config.adminEmails[0] || "admin@example.test", name: "Platform Admin", note: "On the admin allowlist" },
        { email: "rider@example.test", name: "Asha Rider", note: "Not an admin - should be refused" }
    ]
};

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const KEY_ID = crypto.randomBytes(8).toString("hex");
const publicJwk = { ...publicKey.export({ format: "jwk" }), kid: KEY_ID, alg: "RS256", use: "sig" };

interface Grant {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    nonce?: string;
    email: string;
    name: string;
    expiresAt: number;
}
interface Profile {
    sub: string;
    email: string;
    email_verified: boolean;
    name: string;
}

const codes = new Map<string, Grant>();
const accessTokens = new Map<string, { profile: Profile; expiresAt: number }>();
type Params = Record<string, string | undefined>;

function b64url(input: string): string {
    return Buffer.from(input).toString("base64url");
}

function signJwt(payload: Record<string, unknown>): string {
    const header = { alg: "RS256", typ: "JWT", kid: KEY_ID };
    const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const signature = crypto.sign("sha256", Buffer.from(data), privateKey).toString("base64url");
    return `${data}.${signature}`;
}

function subjectFor(email: string): string {
    return crypto.createHash("sha256").update(`mock:${email}`).digest("hex").slice(0, 24);
}

function escapeHtml(value: unknown): string {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function oauthError(res: Response, status: number, error: string, description: string): void {
    res.status(status).json({ error, error_description: description });
}

/** Validate the authorization request; returns the client or sends an error page. */
function validateAuthorizeRequest(params: Params, res: Response): Client | null {
    const client = clients.get(params.client_id || "");
    if (!client) {
        res.status(400).send("Unknown client_id.");
        return null;
    }
    if (!params.redirect_uri || !client.redirectUris.includes(params.redirect_uri)) {
        // Never redirect to an unregistered URI.
        res.status(400).send("redirect_uri is not registered for this client.");
        return null;
    }
    const problem =
        params.response_type !== "code"
            ? "unsupported_response_type"
            : !String(params.scope || "")
                    .split(" ")
                    .includes("openid")
              ? "invalid_scope"
              : !params.code_challenge || params.code_challenge_method !== "S256"
                ? "invalid_request"
                : null;
    if (problem) {
        const url = new URL(params.redirect_uri);
        url.searchParams.set("error", problem);
        if (params.state) url.searchParams.set("state", params.state);
        res.redirect(url.href);
        return null;
    }
    return client;
}

const app = express();
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
    // Forms post here and then redirect back to the registered apps.
    const appOrigins = [config.urls.api, config.urls.admin, config.urls.web].map((url) => new URL(url).origin).join(" ");
    res.setHeader(
        "Content-Security-Policy",
        `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${appOrigins}; frame-ancestors 'none'`
    );
    res.setHeader("X-Frame-Options", "DENY");
    next();
});

app.get("/.well-known/openid-configuration", (req, res) => {
    res.json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        userinfo_endpoint: `${ISSUER}/userinfo`,
        jwks_uri: `${ISSUER}/jwks`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        scopes_supported: ["openid", "email", "profile"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
        code_challenge_methods_supported: ["S256"],
        claims_supported: ["sub", "email", "email_verified", "name", "iss", "aud", "exp", "iat", "nonce"],
        authorization_response_iss_parameter_supported: true
    });
});

app.get("/jwks", (req, res) => res.json({ keys: [publicJwk] }));

app.get("/authorize", (req, res) => {
    const client = validateAuthorizeRequest(req.query as Params, res);
    if (!client) return;

    const hidden = ["client_id", "redirect_uri", "response_type", "scope", "state", "nonce", "code_challenge", "code_challenge_method"]
        .map((key) => `<input type="hidden" name="${key}" value="${escapeHtml((req.query as Params)[key])}">`)
        .join("");
    const samples = SAMPLE_ACCOUNTS[client.appKey]
        .map(
            (account) => `
            <form method="post" action="/authorize" class="account">
                ${hidden}
                <input type="hidden" name="email" value="${escapeHtml(account.email)}">
                <input type="hidden" name="name" value="${escapeHtml(account.name)}">
                <button type="submit"><strong>${escapeHtml(account.name)}</strong><span>${escapeHtml(account.email)}</span><em>${escapeHtml(account.note)}</em></button>
            </form>`
        )
        .join("");

    res.send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dev sign-in</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: "Segoe UI", system-ui, sans-serif; background: #0f1115; color: #eceef2; margin: 0; display: grid; place-items: center; min-height: 100vh; padding: 16px; box-sizing: border-box; }
  main { background: #171a21; border: 1px solid #2a2f3a; border-radius: 16px; padding: 28px; width: 100%; max-width: 440px; }
  h1 { font-size: 1.3rem; margin: 0 0 4px; } p { color: #9aa1ae; margin: 0 0 18px; font-size: .9rem; }
  .warn { background: #36280a; color: #fbbf24; padding: 8px 12px; border-radius: 8px; font-size: .8rem; margin-bottom: 18px; }
  .account { margin: 0 0 10px; }
  .account button { width: 100%; text-align: left; display: grid; gap: 2px; padding: 12px 14px; border-radius: 10px; border: 1px solid #2a2f3a; background: #1e222b; color: inherit; font: inherit; cursor: pointer; }
  .account button:hover { border-color: #facc15; }
  .account span { color: #9aa1ae; font-size: .85rem; } .account em { color: #facc15; font-size: .78rem; font-style: normal; }
  label { display: grid; gap: 6px; font-size: .85rem; margin-bottom: 10px; }
  input[type=email], input[type=text] { padding: 10px; border-radius: 8px; border: 1px solid #2a2f3a; background: #0f1115; color: inherit; font: inherit; }
  .go { width: 100%; padding: 11px; border: 0; border-radius: 10px; background: #facc15; color: #1f1a00; font-weight: 700; font: inherit; cursor: pointer; }
  hr { border: 0; border-top: 1px solid #2a2f3a; margin: 18px 0; }
</style></head>
<body><main>
  <h1>Dev sign-in</h1>
  <p>Signing in to <strong>${escapeHtml(client.appKey === "admin" ? "RideShare Admin" : client.appKey === "web" ? "RideShare web app" : "RideShare app")}</strong></p>
  <div class="warn">Local development OAuth provider. Use Google sign-in in production.</div>
  ${samples}
  <hr>
  <form method="post" action="/authorize">
    ${hidden}
    <label>Email <input type="email" name="email" required placeholder="you@example.test"></label>
    <label>Name <input type="text" name="name" placeholder="Your name"></label>
    <button class="go" type="submit">Continue</button>
  </form>
</main></body></html>`);
});

app.post("/authorize", (req, res) => {
    const client = validateAuthorizeRequest(req.body, res);
    if (!client) return;

    const email = String(req.body.email || "")
        .trim()
        .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).send("Please go back and enter a valid email.");
    }

    const code = crypto.randomBytes(24).toString("base64url");
    codes.set(code, {
        clientId: client.clientId,
        redirectUri: req.body.redirect_uri,
        codeChallenge: req.body.code_challenge,
        nonce: req.body.nonce || undefined,
        email,
        name:
            String(req.body.name || "")
                .trim()
                .slice(0, 80) || email.split("@")[0],
        expiresAt: Date.now() + CODE_TTL_MS
    });

    const url = new URL(req.body.redirect_uri as string);
    url.searchParams.set("code", code);
    url.searchParams.set("iss", ISSUER);
    if (req.body.state) url.searchParams.set("state", req.body.state);
    res.redirect(url.href);
});

function authenticateClient(req: express.Request): Client | null {
    let clientId = req.body.client_id;
    let clientSecret = req.body.client_secret;
    const header = req.get("authorization") || "";
    if (header.startsWith("Basic ")) {
        const decoded = Buffer.from(header.slice(6), "base64").toString();
        const index = decoded.indexOf(":");
        clientId = decodeURIComponent(decoded.slice(0, index));
        clientSecret = decodeURIComponent(decoded.slice(index + 1));
    }
    const client = clients.get(clientId);
    return client && client.clientSecret === clientSecret ? client : null;
}

app.post("/token", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const client = authenticateClient(req);
    if (!client) return oauthError(res, 401, "invalid_client", "Client authentication failed.");
    if (req.body.grant_type !== "authorization_code") {
        return oauthError(res, 400, "unsupported_grant_type", "Only authorization_code is supported.");
    }

    const grant = codes.get(req.body.code);
    codes.delete(req.body.code); // single use
    if (!grant || grant.expiresAt < Date.now() || grant.clientId !== client.clientId) {
        return oauthError(res, 400, "invalid_grant", "Code is invalid or expired.");
    }
    if (grant.redirectUri !== req.body.redirect_uri) {
        return oauthError(res, 400, "invalid_grant", "redirect_uri mismatch.");
    }
    const challenge = crypto
        .createHash("sha256")
        .update(String(req.body.code_verifier || ""))
        .digest("base64url");
    if (challenge !== grant.codeChallenge) {
        return oauthError(res, 400, "invalid_grant", "PKCE verification failed.");
    }

    const now = Math.floor(Date.now() / 1000);
    const sub = subjectFor(grant.email);
    const profile = { sub, email: grant.email, email_verified: true, name: grant.name };
    const accessToken = crypto.randomBytes(32).toString("base64url");
    accessTokens.set(accessToken, { profile, expiresAt: Date.now() + TOKEN_TTL_S * 1000 });

    res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: TOKEN_TTL_S,
        scope: "openid email profile",
        id_token: signJwt({ iss: ISSUER, aud: client.clientId, iat: now, exp: now + 600, nonce: grant.nonce, ...profile })
    });
});

app.get("/userinfo", (req, res) => {
    const token = (req.get("authorization") || "").replace(/^Bearer /, "");
    const entry = accessTokens.get(token);
    if (!entry || entry.expiresAt < Date.now()) return oauthError(res, 401, "invalid_token", "Unknown or expired token.");
    res.json(entry.profile);
});

setInterval(() => {
    const now = Date.now();
    for (const [code, grant] of codes) if (grant.expiresAt < now) codes.delete(code);
    for (const [token, entry] of accessTokens) if (entry.expiresAt < now) accessTokens.delete(token);
}, 60 * 1000).unref();

if (isMain(import.meta.url)) {
    // All interfaces, so the phone can reach the sign-in page over Wi-Fi.
    app.listen(config.ports.mockOAuth, "0.0.0.0", () => {
        console.log(`Mock OAuth provider (dev only) running at ${ISSUER}`);
    });
}

export default app;
