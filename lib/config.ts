import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";

// The project root (this file is in lib/). .env, data/ and uploads are resolved from here.
const ROOT_DIR = path.resolve(import.meta.dirname, "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env"), quiet: true });

const env = process.env;
const isProduction = env.NODE_ENV === "production";

function list(value: string | undefined): string[] {
    return (value || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

function port(name: string, fallback: number): number {
    return Number.parseInt(env[name] || "", 10) || fallback;
}

/** The PC's Wi-Fi/LAN address, so a phone on the same network can reach the dev servers. */
function lanAddress(): string {
    const candidates = Object.values(os.networkInterfaces())
        .flat()
        .filter((iface): iface is os.NetworkInterfaceInfo => Boolean(iface && iface.family === "IPv4" && !iface.internal))
        .map((iface) => iface.address);
    return (
        candidates.find((ip) => ip.startsWith("192.168.")) || candidates.find((ip) => ip.startsWith("10.")) || candidates[0] || "localhost"
    );
}

const ports = {
    api: port("API_PORT", port("PORT", 3000)),
    admin: port("ADMIN_APP_PORT", 3002),
    mockOAuth: port("MOCK_OAUTH_PORT", 4000),
    web: port("WEB_PORT", 5173)
};

// Host the phone uses to reach this machine in development.
const devHost = env.DEV_HOST || lanAddress();

function secret(name: string): string {
    const value = env[name];
    if (value) return value;
    if (isProduction) throw new Error(`${name} must be set in production.`);
    // Dev fallback: anything signed with it stops working after a restart.
    return crypto.randomBytes(32).toString("hex");
}

const mockOAuthEnabled = !isProduction && env.MOCK_OAUTH_ENABLED !== "false";

const apiUrl = env.API_URL || `http://${devHost}:${ports.api}`;
const webUrl = (env.WEB_URL || `http://localhost:${ports.web}`).replace(/\/$/, "");

const maptilerKey = env.MAPTILER_KEY || "";
const mapStyle = env.MAPTILER_STYLE || "dataviz-dark";

export type AppKey = "mobile" | "web" | "admin";

const config = {
    isProduction,
    ports,
    devHost,
    urls: {
        // Public URL of the API; the mobile app's OAuth redirect URIs are built from it.
        api: apiUrl,
        // The web app (Vite in development). Its sign-in runs through the API at <web>/web/auth/*.
        web: webUrl,
        admin: env.ADMIN_APP_URL || `http://localhost:${ports.admin}`,
        mockOAuth: env.MOCK_OAUTH_URL || `http://${devHost}:${ports.mockOAuth}`
    },
    databasePath: path.resolve(ROOT_DIR, env.DATABASE_PATH || "data/rideshare.db"),
    uploadDir: path.resolve(ROOT_DIR, env.UPLOAD_DIR || "data/uploads"),
    sessionSecret: secret("SESSION_SECRET"),
    adminEmails: list(env.ADMIN_EMAILS || (isProduction ? "" : "admin@example.test")),
    // Deep-link prefixes the mobile app may ask to be sent back to after sign-in.
    appRedirectPrefixes: (env.APP_REDIRECT_PREFIXES || (isProduction ? "rideshare://" : "rideshare://,exp://"))
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    oauth: {
        google: {
            enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
            issuer: "https://accounts.google.com",
            clientId: env.GOOGLE_CLIENT_ID || "",
            clientSecret: env.GOOGLE_CLIENT_SECRET || ""
        },
        apple: {
            // Sign in with Apple: a Services ID plus a .p8 key from developer.apple.com.
            enabled: Boolean(
                env.APPLE_SERVICES_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && (env.APPLE_PRIVATE_KEY || env.APPLE_PRIVATE_KEY_PATH)
            ),
            issuer: "https://appleid.apple.com",
            clientId: env.APPLE_SERVICES_ID || "",
            teamId: env.APPLE_TEAM_ID || "",
            keyId: env.APPLE_KEY_ID || "",
            privateKey: env.APPLE_PRIVATE_KEY || "",
            privateKeyPath: env.APPLE_PRIVATE_KEY_PATH || ""
        },
        mock: {
            enabled: mockOAuthEnabled,
            // Each app is registered as a separate OAuth client of the dev provider.
            clients: {
                mobile: { clientId: "rideshare-mobile", clientSecret: "dev-mobile-secret" },
                web: { clientId: "rideshare-web", clientSecret: "dev-web-secret" },
                admin: { clientId: "rideshare-admin-app", clientSecret: "dev-admin-app-secret" }
            } satisfies Record<AppKey, { clientId: string; clientSecret: string }>
        }
    },
    map: {
        // MapTiler (free key at cloud.maptiler.com). Without a key the apps fall back to CARTO,
        // which now shows an "API key required" watermark.
        configured: Boolean(maptilerKey),
        styleUrl: maptilerKey ? `https://api.maptiler.com/maps/${mapStyle}/style.json?key=${maptilerKey}` : null,
        tileUrl: maptilerKey
            ? `https://api.maptiler.com/maps/${mapStyle}/256/{z}/{x}/{y}@2x.png?key=${maptilerKey}`
            : "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        attribution: maptilerKey ? "© MapTiler © OpenStreetMap contributors" : "© OpenStreetMap contributors © CARTO"
    },
    payments: {
        provider: env.PAYMENT_PROVIDER || "mock",
        // Signs the payment gateway's callbacks (webhook-style), so a forged "paid" is rejected.
        webhookSecret: secret("PAYMENT_WEBHOOK_SECRET"),
        currency: "INR"
    },
    geo: {
        // OpenStreetMap services. The public demo servers are fine for development;
        // self-host or use a commercial provider for production traffic.
        nominatimUrl: env.NOMINATIM_URL || "https://nominatim.openstreetmap.org",
        osrmUrl: env.OSRM_URL || "https://router.project-osrm.org",
        userAgent: env.GEO_USER_AGENT || "RideShare-dev/1.0 (student project)",
        // Bias place search toward the service area (Mumbai by default).
        viewbox: env.GEO_VIEWBOX || "72.75,19.30,73.10,18.88",
        countryCodes: env.GEO_COUNTRY_CODES || "in",
        // OSRM assumes empty roads; multiply its durations for city traffic.
        trafficFactor: Number(env.GEO_TRAFFIC_FACTOR) || 1.8
    },
    sms: { provider: env.SMS_PROVIDER || "console" }
};

export type Config = typeof config;
export default config;
