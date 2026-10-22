import assert from "node:assert/strict";
import * as sms from "../../lib/sms.ts";
import * as users from "../../services/users/service.ts";
import { Client } from "./client.ts";

// 1x1 PNG
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
export const APP_REDIRECT = "exp://127.0.0.1:8081/--/auth";

export const GHATKOPAR = { lat: 19.0863, lng: 72.9081, name: "Ghatkopar Station" };
export const POWAI = { lat: 19.1176, lng: 72.906, name: "Powai" };

export function stamp(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.test`;
}

// Test responses are loosely typed JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export interface ApiResponse {
    status: number;
    body: Json;
    headers: Headers;
}

/** Talks to the API the way the apps do. `prefix` is /api (legacy, mobile) or /api/v1. */
export class App {
    browser = new Client();
    token: string | null = null;

    readonly apiUrl: string;
    readonly prefix: "/api" | "/api/v1";

    constructor(apiUrl: string, prefix: "/api" | "/api/v1" = "/api") {
        this.apiUrl = apiUrl;
        this.prefix = prefix;
    }

    /** Mobile sign-in: browser flow ending at the app's deep link, then code exchange. */
    async signIn(email: string): Promise<ApiResponse | { error: string }> {
        const done = await this.browser.signIn(this.apiUrl, email, email.split("@")[0], `?redirect=${encodeURIComponent(APP_REDIRECT)}`);
        assert.ok(done.url.startsWith(APP_REDIRECT), `expected deep link, got ${done.url}`);
        const deepLink = new URL(done.url);
        if (deepLink.searchParams.get("error")) return { error: deepLink.searchParams.get("error")! };
        return this.exchange(deepLink.searchParams.get("code")!);
    }

    /** Web sign-in: browser flow through /web/auth ending at <WEB_URL>/signed-in, then code exchange. */
    async signInWeb(email: string): Promise<ApiResponse> {
        const done = await this.browser.signIn(`${this.apiUrl}/web`, email);
        const url = new URL(done.url);
        assert.equal(url.pathname, "/signed-in", `expected the web app's /signed-in page, got ${done.url}`);
        assert.ok(url.searchParams.get("code"), `no code in ${done.url}`);
        return this.exchange(url.searchParams.get("code")!);
    }

    private async exchange(code: string): Promise<ApiResponse> {
        const res = await this.call("POST", "/auth/exchange", { code });
        this.token = res.body.token;
        return res;
    }

    async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResponse> {
        const isForm = body instanceof FormData;
        const response = await fetch(`${this.apiUrl}${this.prefix}${path}`, {
            method,
            headers: {
                ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
                ...(body && !isForm ? { "content-type": "application/json" } : {}),
                ...headers
            },
            body: body ? (isForm ? body : JSON.stringify(body)) : undefined
        });
        return { status: response.status, body: await response.json(), headers: response.headers };
    }

    async ok(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Json> {
        const res = await this.call(method, path, body, headers);
        assert.ok(res.status < 400, `${method} ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
        return res.body;
    }
}

export function latestCode(email: string): string {
    return sms.latestForUser(users.getByEmail(email)!.id, 1)[0]!.message.slice(0, 6);
}

/** Sign in and finish onboarding through the API. Drivers end up pending approval. */
export async function onboard(
    apiUrl: string,
    role: "rider" | "driver",
    email: string,
    { vehicleType = "car", prefix = "/api" as "/api" | "/api/v1" } = {}
): Promise<App> {
    const app = new App(apiUrl, prefix);
    await app.signIn(email);
    let me = await app.ok("GET", "/me");
    assert.equal(me.next, "profile");

    me = await app.ok("POST", "/onboarding/profile", { role, name: `Test ${role}`, phone: `9${String(Date.now()).slice(-9)}` });
    assert.equal(me.next, "verify");
    assert.match(me.devSms, /verification code/);

    me = await app.ok("POST", "/onboarding/verify", { code: latestCode(email) });
    if (role === "rider") {
        assert.equal(me.next, "ready");
        return app;
    }
    assert.equal(me.next, "driver");

    const form = new FormData();
    Object.entries({
        licenseNumber: "MH0220200011111",
        vehicleType,
        vehicleMake: "Hyundai",
        vehicleModel: "Aura",
        vehiclePlate: "MH 02 TT 9999",
        vehicleColor: "Grey"
    }).forEach(([key, value]) => form.set(key, value));
    form.set("licenseDoc", new Blob([PNG], { type: "image/png" }), "licence.png");
    form.set("rcDoc", new Blob([PNG], { type: "image/png" }), "rc.png");
    me = await app.ok("POST", "/onboarding/driver", form);
    assert.equal(me.next, "pending");
    return app;
}
