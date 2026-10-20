import { startServers, stopServers } from "./helpers/env.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { users } from "@rideshare/shared";
import { APP_REDIRECT, App, GHATKOPAR, POWAI, onboard, stamp } from "./helpers/app.ts";
import type { Json } from "./helpers/app.ts";
import { Client } from "./helpers/client.ts";

/**
 * End-to-end journeys through the legacy /api paths, which the current mobile app uses.
 * (tests/api-v1.test.ts covers the versioned API.)
 */

let urls: Awaited<ReturnType<typeof startServers>>;
test.before(async () => {
    urls = await startServers();
});
test.after(() => stopServers());

test("health and public config", async () => {
    const health = (await (await fetch(`${urls.api}/api/health`)).json()) as Json;
    assert.equal(health.status, "ok");
    const config = (await (await fetch(`${urls.api}/api/config`)).json()) as Json;
    assert.deepEqual(
        config.providers.map((p: { id: string; enabled: boolean }) => [p.id, p.enabled]),
        [
            ["google", false],
            ["apple", false],
            ["mock", true]
        ]
    );
    assert.match(config.map.tileUrl, /dark_all/);
    assert.equal(config.map.configured, false);
});

test("API requires a token", async () => {
    const res = await new App(urls.api).call("GET", "/me");
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "Please sign in again.", "legacy error format is a plain message");
});

test("sign-in only redirects to registered app deep links", async () => {
    const res = await fetch(`${urls.api}/auth/mock?redirect=${encodeURIComponent("https://evil.example/steal")}`, { redirect: "manual" });
    assert.equal(res.status, 400);
});

test("forged OAuth state sends an error back to the app", async () => {
    const browser = new Client();
    await browser.get(`${urls.api}/auth/mock?redirect=${encodeURIComponent(APP_REDIRECT)}`);
    const res = await browser.get(`${urls.api}/auth/mock/callback?code=fake&state=forged`);
    assert.ok(res.url.startsWith(APP_REDIRECT));
    assert.match(new URL(res.url).searchParams.get("error")!, /couldn't complete sign-in/);
});

test("login codes can't be reused", async () => {
    const app = new App(urls.api);
    const done = await app.browser.signIn(urls.api, stamp("reuse"), "Re Use", `?redirect=${encodeURIComponent(APP_REDIRECT)}`);
    const code = new URL(done.url).searchParams.get("code");
    assert.equal((await app.call("POST", "/auth/exchange", { code })).status, 200);
    assert.equal((await app.call("POST", "/auth/exchange", { code })).status, 400);
});

test("full journey: onboarding, admin approval, ride with OTP", async () => {
    const riderEmail = stamp("rider");
    const driverEmail = stamp("driver");
    const rider = await onboard(urls.api, "rider", riderEmail);
    const driver = await onboard(urls.api, "driver", driverEmail, { vehicleType: "auto" });

    // Pending drivers can't work yet.
    assert.equal((await driver.call("POST", "/driver/online", { online: true })).status, 403);

    // Admin (web) approves the driver.
    const admin = new Client();
    let page = await admin.signIn(urls.admin, "admin@example.test", "Admin");
    assert.match(page.text, /Platform overview/);
    const driverId = users.getByEmail(driverEmail)!.id;
    page = await admin.get(`${urls.admin}/drivers/${driverId}`);
    const doc = page.text.match(/\/documents\/([0-9a-f-]+\.png)/)![1];
    assert.equal((await admin.get(`${urls.admin}/documents/${doc}`)).status, 200);
    page = await admin.post(`${urls.admin}/drivers/${driverId}/approve`, {}, page);
    assert.match(page.text, /Driver approved/);
    assert.equal((await driver.ok("GET", "/me")).next, "ready");

    // Driver shares GPS and goes online.
    await driver.ok("POST", "/driver/location", { lat: 19.09, lng: 72.91 });
    const online = await driver.ok("POST", "/driver/online", { online: true });
    assert.equal(online.driver.isOnline, true);

    // Rider gets a quote and books an auto.
    const quote = await rider.ok("POST", "/rides/estimate", { pickup: GHATKOPAR, drop: POWAI });
    assert.equal(quote.options.length, 3);
    assert.ok(quote.route.geometry.length >= 2);
    const { ride } = await rider.ok("POST", "/rides", { pickup: GHATKOPAR, drop: POWAI, vehicleType: "auto", fare: 1 });
    assert.equal(ride.status, "requested");
    assert.ok(ride.fare > 1, "fare is set by the server");
    assert.equal(ride.otp, null, "no OTP before a driver is assigned");

    // Drivers can't book; strangers can't see the ride.
    assert.equal((await driver.call("POST", "/rides", { pickup: GHATKOPAR, drop: POWAI, vehicleType: "auto" })).status, 403);
    const stranger = await onboard(urls.api, "rider", stamp("stranger"));
    assert.equal((await stranger.call("GET", `/rides/${ride.id}`)).status, 404);

    // Driver sees and accepts the request.
    const requests = await driver.ok("GET", "/driver/requests");
    assert.ok(requests.rides.some((r: { id: number }) => r.id === ride.id));
    await driver.ok("POST", `/rides/${ride.id}/accept`);

    // Rider sees the driver, their position and the OTP.
    const active = (await rider.ok("GET", "/rides/active")).ride;
    assert.equal(active.status, "accepted");
    assert.match(active.otp, /^\d{4}$/);
    assert.deepEqual(active.driver.location, { lat: 19.09, lng: 72.91 });
    const driverView = (await driver.ok("GET", "/rides/active")).ride;
    assert.equal(driverView.otp, null, "the driver never sees the OTP");

    await driver.ok("POST", `/rides/${ride.id}/arrived`);
    const wrong = await driver.call("POST", `/rides/${ride.id}/start`, { otp: active.otp === "0000" ? "1111" : "0000" });
    assert.equal(wrong.status, 400);
    await driver.ok("POST", `/rides/${ride.id}/start`, { otp: active.otp });
    const done = await driver.ok("POST", `/rides/${ride.id}/complete`);
    assert.equal(done.ride.status, "completed");
    assert.equal(done.ride.paymentStatus, "paid", "cash is collected by the driver");

    const earnings = await driver.ok("GET", "/driver/earnings");
    assert.equal(earnings.earnings.total.amount, done.ride.fare);
    const history = await rider.ok("GET", "/rides");
    assert.equal(history.rides[0].id, ride.id);

    // Suspending the rider revokes their app token.
    page = await admin.get(`${urls.admin}/users`);
    await admin.post(`${urls.admin}/users/${users.getByEmail(riderEmail)!.id}/status`, { status: "suspended" }, page);
    assert.equal((await rider.call("GET", "/me")).status, 401);
});

test("live updates: the socket says refresh when a ride changes", async () => {
    const rider = await onboard(urls.api, "rider", stamp("live"));
    const socket = new WebSocket(urls.api.replace("http", "ws") + "/ws");
    const messages: string[] = [];
    await new Promise<void>((resolve, reject) => {
        socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token: rider.token }));
        socket.onerror = reject;
        socket.onmessage = (event) => {
            messages.push(JSON.parse(String(event.data)).type);
            if (messages.includes("ready")) resolve();
        };
    });
    const started = Date.now();
    await rider.ok("POST", "/rides", { pickup: GHATKOPAR, drop: POWAI, vehicleType: "bike" });
    await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
            if (messages.includes("refresh")) {
                clearInterval(timer);
                resolve();
            }
        }, 20);
    });
    socket.close();
    assert.ok(messages.includes("refresh"));
    // Pushed from the domain event, not the 10 s fallback poll.
    assert.ok(Date.now() - started < 2000, `refresh took ${Date.now() - started} ms`);
});
