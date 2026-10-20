# Ride-Sharing Platform

A ride-sharing platform inspired by Ola and Uber: an **Android/iOS app** with a dark monochrome map, a **Node.js backend**, and a **Node.js admin website**.

Why things are built the way they are: see **[decision.md](decision.md)**.

| Part | Folder | What it is |
|---|---|---|
| **Mobile app** | `mobile/` | Expo (React Native) app for **riders and drivers**: sign in with Google/Apple, onboarding, map, booking, live trip tracking. Also runs in a desktop browser for development and demos |
| **API** | `backend/` | Node + Express JSON API, WebSocket live updates, OAuth sign-in, OpenStreetMap search/routing |
| **Admin app** | `apps/admin/` | Node + EJS website: verify drivers, monitor rides, manage users, SMS and audit logs |
| Dev sign-in | `mock-oauth/` | Local OpenID Connect provider for development (off in production) |
| Shared core | `shared/` | Database (SQLite), rides, fares, drivers, OTP, tokens, OAuth |

## Actors

- Rider
- Driver
- Admin

## External Systems

- **Map**: OpenStreetMap. Dark monochrome tiles from **MapTiler** (`MAPTILER_KEY` in `.env`; without a key the apps fall back to CARTO, which shows an "API KEY REQUIRED" watermark). The apps get the tile URL from `/api/config`. Place search via **Nominatim**, road routes/ETA via **OSRM**, all called through the API.
- **Identity**: Google and Apple (OpenID Connect). Dev sign-in for local testing.
- **SMS / Messaging**: console provider (messages are logged and visible in the Admin app).

## Architecture

The system context diagram is in `architecture/`.

```
 Phone (Expo app) ──HTTPS/WS──► backend (API :3000) ──► shared/ ──► SQLite (data/rideshare.db)
        │                           │   ├─ OSM: Nominatim (search), OSRM (routes)
        │ sign-in (in-app browser)  │   └─ SMS (console)
        └──► Google / Apple / dev ──┘
 Browser ─────────────────────────► apps/admin (:3002) ──► shared/
```

## Run it

You need **Node.js 22.18+** (24 recommended; the backend is TypeScript that Node runs directly) on the PC and, on your phone, the **Expo Go** app (App Store / Play Store). The phone and PC must be on the **same Wi-Fi**.

```bash
npm install
npm run seed      # demo accounts + a few past rides (optional)
npm run dev       # API :3000, Admin :3002, dev sign-in :4000
```

In a second terminal:

```bash
cd mobile
npm install
npm start
```

Scan the QR code with the iPhone camera (or the Expo Go app on Android). On the welcome screen tap **Dev sign-in** and pick an account:

| Account | Use it to |
|---|---|
| `rider@example.test` | Book rides |
| `driver@example.test` | Accept rides (approved car driver) |
| `newrider@example.test` / `newdriver@example.test` | Go through onboarding from scratch |
| `admin@example.test` | Admin app at http://localhost:3002 |

In development, SMS codes are printed in the terminal and also shown on the verify screen.

> One phone can only be one user at a time. To play rider and driver together, use a second phone, a browser tab (below), or sign out and switch.

### Run it in the browser (no phone)

For development and demos on the PC, start the app for the browser instead of `npm start`:

```bash
cd mobile
npm run web
```

Open http://localhost:5173 (exactly this address; sign-in returns there). It's the same app and code as on the phone, shown at phone width. Each tab has its own sign-in, so you can be the rider in one tab and the driver in another. The same server still shows the QR code for phones.

How it fits together: the web dev server (Expo/Metro) forwards `/api` and `/web` to the API (`mobile/metro.config.js`), so the browser uses the backend's existing web sign-in (`/web/auth/:provider` → `/signed-in`) and no CORS is needed; live updates connect to `ws://localhost:3000/ws` directly. Browser-only code lives in `*.web.js` files (`MonoMap.web.js` draws the map with Leaflet, `token.web.js` keeps the sign-in per tab) or behind `Platform.OS === "web"`; none of it is in the Android/iOS builds. If the browser has no location, rider and driver both start at the default spot (Ghatkopar) so they still match.

### Troubleshooting

- **"Can't reach the RideShare server"**: the phone must be on the same Wi-Fi. The app uses the PC's IP from Expo. Check the API at `http://<PC-IP>:3000/api/health` in the phone's browser. If Windows Firewall asks, allow Node.js.
- **Blank map**: map tiles load from `basemaps.cartocdn.com`, so the phone needs internet.
- **C: drive full**: the npm cache is set to `D:\.npm-cache` by `.npmrc`.

## Sign-in (OAuth 2.0 / OpenID Connect)

```
App ── opens in-app browser ──► API /auth/google?redirect=rideshare://auth
API ── Authorization Code + PKCE + state + nonce ──► Google / Apple
Provider ──► API callback: ID token verified, account found or created
API ──► rideshare://auth?code=<one-time code> ──► App
App ── POST /api/auth/exchange {code} ──► API ──► bearer token (stored in SecureStore)
```

The same flow serves Google, Apple and dev sign-in. Accounts with the same **verified** email are linked.

### Enable Google sign-in

Google won't redirect to a private Wi-Fi address, so the API needs a public **HTTPS** URL:

1. Start a tunnel to the API, for example `cloudflared tunnel --url http://localhost:3000`, and note the `https://…trycloudflare.com` URL.
2. Google Cloud Console → APIs & Services → [Credentials](https://console.cloud.google.com/apis/credentials) → **Create OAuth client ID** → *Web application*. Add these redirect URIs:
   - `https://<tunnel>/auth/google/callback`
   - `http://localhost:3002/auth/google/callback` (Admin app)
3. In the root `.env`, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `API_URL=https://<tunnel>`.
4. In `mobile/.env`, set `EXPO_PUBLIC_API_URL=https://<tunnel>`, then restart both.

### Enable Sign in with Apple

This needs an Apple Developer account. The button shows as "not set up" until it's configured.

1. developer.apple.com → Identifiers → create a **Services ID** and enable *Sign in with Apple*. Set the domain to your tunnel/host and the return URL to `https://<API host>/auth/apple/callback`.
2. Keys → create a key with *Sign in with Apple* enabled and download the `.p8` file.
3. Set `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY_PATH` in `.env`.

Apple posts its response back to the server (`form_post`). The backend handles this, including the cross-site cookie it needs over HTTPS.

## App flow

**Onboarding**: choose ride or drive → name and phone → SMS code. Drivers also add licence and vehicle details and photograph their licence and RC, then wait for an admin to approve them. The screen updates by itself when they're approved.

**Rider**:
1. The map opens on your location, which is the default pickup.
2. Tap **Where to?** and search a place, or choose it on the map with the centre pin.
3. The route is drawn, with fare and ETA for bike, auto and car.
4. Request the ride, then watch the driver's car approach.
5. Share the 4-digit OTP with the driver.
6. At the end the app shows the fare. Payments are out of scope, so you pay the driver directly.

**Driver**:
1. Go online. Your GPS position is shared while you're online or on a trip.
2. Requests within 12 km for your vehicle type pop up. Accept one.
3. **Navigate** opens your maps app. Tap **I've arrived**.
4. Enter the rider's OTP to start the trip, then complete it. Earnings are shown on the map screen.

Live updates use a WebSocket (`/ws`). The app is told to refresh when its ride changes, the driver moves, a new request arrives, or an admin acts.

## Admin app

Open http://localhost:3002 and sign in with an email from `ADMIN_EMAILS`. From there you can:
- review drivers and their documents, and approve them or request changes (the driver gets an SMS)
- see live and past rides, and cancel a ride
- suspend users (this also signs them out of the app)
- read the SMS and audit logs

## API

All `/api` routes except health, config and the exchange step need `Authorization: Bearer <token>`.

| Method | Path | |
|---|---|---|
| GET | `/api/health`, `/api/config` | Status; providers, map tiles, vehicles |
| GET | `/auth/:provider?redirect=` | Starts sign-in (browser) |
| POST | `/api/auth/exchange`, `/api/auth/logout` | Code → token; revoke token |
| GET | `/api/me` | User, driver profile, next onboarding step |
| POST | `/api/onboarding/profile`, `/verify`, `/resend`, `/driver` (multipart) | Onboarding |
| GET | `/api/places/search?q=&lat=&lng=`, `/api/places/reverse?lat=&lng=` | OpenStreetMap search |
| POST | `/api/rides/estimate`, `/api/rides` | Quote; book (fare computed on the server) |
| GET | `/api/rides/active`, `/api/rides`, `/api/rides/:id` | Current ride, history, one ride |
| POST | `/api/rides/:id/cancel` | Rider cancels / driver releases |
| POST | `/api/rides/:id/accept`, `/arrived`, `/start` `{otp}`, `/complete` | Driver trip steps |
| GET/POST | `/api/driver/requests`, `/location`, `/online`, `/earnings` | Driver |
| WS | `/ws` | Send `{type:"auth", token}`; receive `{type:"refresh"}` |

## Building the Android app

Expo Go is for development. For an installable Android app (`.apk`/`.aab`):

- **Cloud build (no Android SDK needed):** `npx eas-cli@latest build -p android --profile preview` (needs a free Expo account).
- **Local build:** install Android Studio on D: and run `npx expo run:android`.

For store builds, `react-native-maps` on Android still uses the Google Maps SDK engine, even though it shows only OpenStreetMap tiles. Add a (free-tier) key under `plugins` → `react-native-maps` → `androidGoogleMapsApiKey` in `mobile/app.json`. To avoid Google entirely, switch the map to MapLibre (see decision 14).

## Tests

```bash
npm test
```

There are 35 tests (`npm run check` also type-checks, lints and enforces 80% line coverage). They cover the ride state machine, migrations, payment webhook signatures, idempotent booking, card/UPI checkout, ride and trip history, activity timelines, the admin user page, the OpenAPI document, and OAuth sign-in → token → onboarding with document upload → admin approval → booking → OTP → completion, the WebSocket updates, and checks that forged sign-ins, reused login codes, strangers viewing rides and app-set fares are all rejected. Tests use a temporary database and never call the public OpenStreetMap servers.

Mobile checks: `cd mobile && npx eslint src metro.config.js && npx expo-doctor`. To check that the phone builds still bundle after a change made for the browser: `npx expo export --platform ios --platform android`.

## Project structure

Each feature is split the same way: HTTP in `backend/src/features/<feature>/` (router + schemas), business logic and SQL in `shared/src/features/<feature>/` (service + repository), so the admin app reuses the same rules.

```
backend/src/
├── features/
│   ├── auth/       router.ts (code exchange, logout)  sign-in.ts (Google/Apple/dev redirects)
│   ├── users/      router.ts (me, onboarding)  schemas.ts
│   ├── drivers/    router.ts (driver onboarding, online, location, earnings)  schemas.ts  documents.ts (uploads)
│   ├── rides/      router.ts (estimate, book, trip steps, history)  schemas.ts
│   ├── places/     router.ts (search, reverse geocoding)  schemas.ts
│   ├── payments/   router.ts (checkout, webhook, history)  schemas.ts  mock-checkout.ts (test-mode pay page)
│   ├── activity/   router.ts (timeline)  schemas.ts
│   └── system/     router.ts (health, config)
├── core/           route.ts (validation + OpenAPI per route), openapi.ts, auth.ts, idempotency.ts, errors.ts, realtime.ts, schemas.ts
├── app.ts          wiring: /api/v1 (+ /api alias), /docs, sign-in, checkout page
└── main.ts         HTTP server + WebSocket, graceful shutdown

shared/src/
├── features/
│   ├── auth/       service.ts (tokens, login codes)  repository.ts  oidc.ts (OAuth/OIDC flow)
│   ├── users/      service.ts  repository.ts  otp.ts (phone codes)
│   ├── drivers/    service.ts  repository.ts
│   ├── rides/      service.ts  repository.ts  state.ts (ride state machine)  fare.ts
│   ├── places/     service.ts (OpenStreetMap search and routing)
│   ├── payments/   service.ts  repository.ts  gateway.ts (payment provider interface + test-mode mock)
│   └── activity/   service.ts (timeline from domain events)  repository.ts
├── core/           config, errors, events, types, pagination, idempotency, sms, audit, web/ (sessions, CSRF, views)
├── db/             index.ts (connection, transactions, migration runner)  migrations/*.sql
└── index.ts        public API of the package
shared/views/, shared/public/   layout, styles and script for the admin pages

apps/admin/      Admin website (Express + EJS): server.ts, routes.ts, views/
mock-oauth/      Dev-only OpenID Connect provider
mobile/          Expo app (src/app = screens via Expo Router, src/components, src/lib; *.web.js = browser versions)
scripts/         dev.ts (runs API + admin + dev sign-in), seed.ts, reset.ts, migrate.ts
tests/           domain, services, api-v1 and e2e tests + helpers/
architecture/    System context diagram
decision.md      Decision log
```
