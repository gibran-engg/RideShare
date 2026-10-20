# Decision log

Every product and technical decision for RideShare, newest at the bottom of each section.
**Who** shows whether a decision was made by the project owner (you) or proposed by Claude and accepted.

---

## Round 1: first version (web apps)

| # | Decision | Who | Why |
|---|---|---|---|
| 1 | Build two apps: a **User app** (riders + drivers) and an **Admin app** | Owner | Riders and drivers share one sign-in; admin work is separate. |
| 2 | Sign-in with **OAuth 2.0 / OpenID Connect**, Authorization Code flow + PKCE, `state` and `nonce` | Claude | Current best practice for apps signing in through Google/Apple. |
| 3 | **Google** as the first identity provider, plus a local **dev sign-in** provider for testing | Owner | Real accounts in production, no credentials needed to develop. |
| 4 | Delete the uncommitted React/Vite `frontend/` | Owner | Replaced by the new apps. |
| 5 | **SQLite** via Node's built-in `node:sqlite` | Claude | No database server or native build to install. |
| 6 | Mock Map API, SMS and payment services behind small interfaces | Claude | Lets the whole flow run locally; real providers can be swapped in. |
| 7 | Admin access is an email **allowlist** (`ADMIN_EMAILS`), re-checked on every request | Claude | Simple, and removing an email revokes access immediately. |

## Round 2: simplify, Android, real map (current)

The owner found round 1 over-complicated and asked for a monochrome map interface, Google/Apple sign-in, a real map API and an Android app.

| # | Decision | Who | Why |
|---|---|---|---|
| 8 | **One mobile app for riders and drivers**, built with **React Native / Expo** (JavaScript) | Owner | A real Android app in the same language as the Node backend. |
| 9 | Remove the server-rendered rider/driver web pages (`apps/user`) | Claude | The mobile app replaces them; less code to maintain. |
| 10 | Backend becomes a **JSON API** with bearer tokens and **WebSocket** live updates | Claude | What a mobile app needs; replaces cookies, CSRF and page reloads. |
| 11 | **OpenStreetMap** for the map, search and routing | Owner | Free, no API key. |
| 12 | **Dark monochrome** map style (CARTO "Dark Matter" tiles, white route and markers) | Owner | Requested look. |
| 13 | Place search via **Nominatim**, routes/distance/ETA via **OSRM**, both called **through the backend** | Claude | Keeps the free services' usage policy (one User-Agent, caching) in one place and makes them swappable. Falls back to a straight-line estimate if OSRM is down. |
| 14 | Map drawn with `react-native-maps` + OSM tile overlay (not MapLibre) | Claude | Runs inside **Expo Go** with nothing to install on the PC. MapLibre needs a native build (Android SDK). Trade-off: a standalone Android build of `react-native-maps` still needs a (free-tier) Google Maps SDK key; switching to MapLibre later removes that. |
| 15 | **Payments removed**; a trip ends by showing the fare | Owner | Scope cut. |
| 16 | **Keep** the Admin web app, driver document checks and phone OTP | Owner | Not chosen for removal. |
| 17 | Sign-in on mobile uses the **browser OAuth flow through the backend**, which then hands the app a one-time code swapped for an app token | Claude | Works in Expo Go, and is the only way Sign in with Apple works on Android, so Google and Apple share one flow. |
| 18 | **Google now, Apple wired up but switched off** until Apple Developer credentials exist | Owner | No Apple Developer account yet ($99/yr). |
| 19 | Google sign-in on a phone needs the backend on a **public HTTPS URL** (cloudflared/ngrok tunnel) | Claude (constraint) | Google and Apple refuse redirects to private LAN addresses. Dev sign-in works without a tunnel. |
| 20 | Test on the owner's **iPhone with Expo Go**; Android build later (Android Studio on D: or Expo cloud build) | Owner | Only an iOS device is available; Expo builds the same code for both. |
| 21 | Keep all installs/caches on **D:** (`.npmrc` sets the npm cache to `D:\.npm-cache`) | Owner (constraint) | C: drive is nearly full. |
| 22 | Dev servers bind to the PC's **Wi-Fi IP** (auto-detected, override with `DEV_HOST`) | Claude | The phone must reach the API and dev sign-in over the local network. |
| 23 | App tokens are random 256-bit values stored only as SHA-256 hashes, 30-day expiry, revoked on logout | Claude | Revocable and safe if the database leaks; simpler than JWTs. |
| 24 | Driver location comes from the **phone's GPS** (no fixed list of places) | Claude | Needed for a real map; matching still uses a 12 km radius. |
| 25 | Riders pick pickup/drop by **search or by dragging a pin** on the map | Claude | Standard ride-hailing interaction. |
| 26 | The `.env` file stays out of git, and the dev database can be reset (`data/`) | Claude | Payment columns were removed, so the old dev database is recreated. |
| 27 | ETAs from OSRM are multiplied by a **city traffic factor (1.8, `GEO_TRAFFIC_FACTOR`)** | Claude | OSRM assumes empty roads (it said 6 min for 5.4 km in Mumbai), which made ETAs and time-based fares unrealistically low. |
| 28 | The fare is always **computed on the server** when a ride is booked; any price sent by the app is ignored | Claude | Stops a modified app from choosing its own fare. |
| 29 | The rider sees the trip **OTP**; the driver never receives it from the API | Claude | The OTP proves the right rider got in the car. |
| 30 | Live updates: the app authenticates over the **WebSocket with its first message** (not a URL parameter), then gets `refresh` signals and re-fetches | Claude | Keeps tokens out of URLs/logs; one simple message type for the app to handle. |
| 31 | Mobile sign-in only redirects back to **allow-listed deep links** (`rideshare://`, and `exp://` in development) | Claude | Stops the sign-in flow from being used to send codes to another site. |
| 32 | Admin app's payment screens removed; dashboard shows **fares of completed rides** instead of revenue | Claude | Follows decision 15. |
| 33 | Screens use **Expo Router** (`mobile/src/app`), written in **JavaScript** | Claude | Expo's own guidance for SDK 58; JavaScript matches the backend and keeps the project simple. |
| 34 | Mobile lint uses `eslint-config-expo` with TypeScript **6** pinned as a dev dependency | Claude (constraint) | The lint plugin doesn't support TypeScript 7 yet; installed with `--legacy-peer-deps` because of an unrelated web-only peer conflict. |
| 35 | Removed the Expo template's `LICENSE` file | Claude | It named Expo as copyright holder of your app; choose your own license if you publish. |
| 36 | Document photos are requested as **JPEG on iOS** (not HEIC) | Claude | Admins review documents in a web browser, which can't show HEIC. |
| 37 | Drivers' **"Navigate"** opens the phone's own maps app (Apple Maps / Google Maps), falling back to OpenStreetMap directions | Claude | Turn-by-turn navigation is out of scope for the app itself. |
| 38 | The welcome screen always shows **Google and Apple**; providers not configured on the server appear disabled ("not set up") | Claude | Matches the requested sign-in options while Apple credentials are pending. |
| 39 | Added **DEMO.md**: setup, a scripted 10-minute demo (driver onboarding → admin approval → ride with OTP → admin console), single-phone variant, optional Google sign-in, troubleshooting | Owner | Requested a step-by-step demo guide. |
| 40 | Pin **`react-dom` to 19.3.0** in `mobile/` (installed with `npx expo install react-dom`) | Claude | npm had auto-installed react-dom 19.3.1 (needed by Expo Router's web support), which requires react 19.3.1 while Expo SDK 58 pins react 19.3.0. That peer conflict broke `npm audit fix` and plain installs; matching versions fixes it, so `--legacy-peer-deps` is no longer needed. |
| 41 | **Don't run `npm audit fix --force`** in `mobile/`; keep the remaining audit warnings for now | Claude | All 27 warnings come from 3 advisories (braces, node-forge, uuid) deep inside Expo/Metro build tooling. The only "fix" npm offers downgrades Expo to SDK 44, which would break the app. Updates come from Expo patch releases: run `npx expo install --fix` periodically. |

## Round 3: well-engineered backend (TypeScript), then the web app

The owner asked for a backend "robust and well engineered like the big companies", without over-complicating it, plus working OAuth, a placeholder payment gateway, stored user activity, and rider/driver histories visible in the admin app.

| # | Decision | Who | Why |
|---|---|---|---|
| 42 | Keep **SQLite**; no Postgres/Redis/Docker | Owner | Don't over-complicate. Repositories keep all SQL in one layer, so a move to Postgres later touches only `shared/src/repos`. |
| 43 | Backend, shared core, admin app, dev OAuth, scripts and tests are **TypeScript** (strict) | Owner | Typed services and schemas catch mistakes before they run. |
| 44 | Node runs the `.ts` files directly (type stripping); `tsc` only type-checks. No build step, no `tsx` | Claude | Node 22.18+/24 supports it; one less tool and no `dist/` to keep in sync. Requires "erasable" TypeScript (no enums/namespaces/parameter properties). Engines raised to Node 22.18. |
| 45 | **TypeScript 6.0** pinned for the backend too | Claude (constraint) | typescript-eslint doesn't support TypeScript 7 yet (same as decision 34). |
| 46 | Code is **ES modules** (`"type": "module"`) | Claude | Needed for native TypeScript; the modern Node default. |
| 47 | Layers: **routes → services → repositories**. Route handlers are thin (validate, call a service, serialize), so there is no separate controller file per module | Claude | The plan listed controllers; with handlers this small they would only add files. |
| 48 | The **ride lifecycle is a state machine** (`shared/src/domain/ride-state.ts`); every status change goes through it, with an optimistic lock on `rides.version` | Claude | Illegal moves (completing an unstarted trip, a rider "accepting") are impossible from any endpoint, and two drivers can't both accept. |
| 49 | **Versioned API at `/api/v1`**; `/api` stays as an alias with the old `{ error: "message" }` format | Claude | The phone app keeps working unchanged while new clients get the stable contract. |
| 50 | One error format for v1: `{ error: { code, message, details? } }`, with codes in one catalogue that also fixes their HTTP status | Claude | Clients branch on codes, not on English messages. |
| 51 | **zod validation on every endpoint**, and the **OpenAPI 3.1** document (`/api/v1/openapi.json`, Swagger UI at `/docs` in development) is generated from the same schemas | Claude | Docs can't drift from the code. |
| 52 | **Idempotency-Key** on booking and checkout, stored 24 h per user | Claude | A double tap or network retry never books twice; same convention as Stripe/Razorpay. |
| 53 | **Cursor pagination** (`?cursor=&limit=`) on histories and admin lists | Claude | Stable pages while new rides keep arriving. |
| 54 | **Versioned SQL migrations** (`shared/src/db/migrations`, tracked in `PRAGMA user_version`), applied on start and by `npm run db:migrate` | Claude | Schema changes are reviewed files, and old dev databases upgrade in place. |
| 55 | Services emit **domain events** after committing; the **activity log** and **live updates** subscribe to them | Claude | Services don't need to know who listens. Live updates are now pushed immediately instead of polling every 2 s; a 10 s check remains for changes made by the admin app (another process). |
| 56 | **Payments return as a placeholder** (reverses decision 15): rider picks cash/card/UPI when booking; cash is marked paid at trip end; card/UPI go through a `PaymentGateway` interface with a **test-mode mock** (hosted page, HMAC-signed webhook, idempotent handling, admin refunds) | Owner + Claude | Real providers (Razorpay, Stripe) become one class each. |
| 57 | **Activity timeline per user** (`activity_events`, with IP and user agent) for sign-ins, onboarding, every ride step, payments and admin decisions | Owner | Shown on the new admin user page. `audit_log` stays for admin actions. |
| 58 | Admin app gets a **user page** (rides taken, trips made, payments, activity) and a **Payments** page | Owner | Requested visibility of all rides and trips. |
| 59 | **Web sign-in** at `/web/auth/:provider`, always returning to the fixed `<WEB_URL>/signed-in`; the web app's dev server proxies `/web` to the API | Claude | Google accepts `http://localhost` redirect URIs, so Google sign-in works on the web app without a tunnel, and there's no redirect parameter to abuse. |
| 60 | **MapTiler** for map tiles (`MAPTILER_KEY`), CARTO as fallback | Owner | CARTO's free tiles now show an "API KEY REQUIRED" watermark. |
| 61 | Quality gates: `npm run check` (type-check, ESLint, 80% line coverage), Prettier, and **GitHub Actions** on Node 22 and 24 | Owner | Requested. |
| 62 | **Feature folders**: each feature has `router.ts` + `schemas.ts` in `backend/src/features/<x>/` and `service.ts` + `repository.ts` in `shared/src/features/<x>/`; cross-cutting code in `core/`, database in `db/` | Owner | Code for one feature sits together. `shared/` stays a separate package because the admin app reuses the services. |
| 63 | **SQL only in repositories** (plus small infrastructure logs in `shared/src/core`: SMS, audit, idempotency, sessions) | Claude | Token and OTP queries moved out of their services; services decide transactions. |
| 64 | Removed dead code: `verifyCsrf` (and the CSRF exemption for multipart forms, which no admin form uses), `stopRecording`, `isAppError`, `nextStatuses`, unused re-exports, the duplicate `rasterTileUrl` config field, the empty `frontend/`, mobile `package*.json.backup` files and the finished plan document | Owner | Behaviour unchanged; the CSRF exemption removal makes every admin form post require a token. |
| 65 | Kept: workspaces (one `package.json` per app), one `tests/` folder, the `architecture/` diagram, `mobile/AGENTS.md`, the legacy `/api` alias | Owner | |
