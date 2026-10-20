import express from "express";
import type { Request, Response, Router } from "express";
import { AppError, auth, config, sessionMiddleware, tokens, users } from "@rideshare/shared";
import type { AppKey, UserRow } from "@rideshare/shared";

/**
 * Sign-in for both apps, in three steps:
 *   1. The app opens the browser at the API's /auth/:provider (mobile) or /web/auth/:provider (web).
 *   2. After the OAuth/OIDC flow the browser is sent back with ?code=<one-time code>
 *      (mobile: to its deep link; web: to <WEB_URL>/signed-in).
 *   3. The app swaps the code: POST /api/v1/auth/exchange { code } -> { token, user }.
 */

function withParams(url: string, params: Record<string, string>): string {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${new URLSearchParams(params)}`;
}

function loginRedirect(user: UserRow, target: string): string {
    if (user.status === "suspended") return withParams(target, { error: "Your account is suspended. Please contact RideShare support." });
    return withParams(target, { code: tokens.issueLoginCode(user.id) });
}

function validRedirect(value: unknown): value is string {
    return typeof value === "string" && value.length < 500 && config.appRedirectPrefixes.some((prefix) => value.startsWith(prefix));
}

/** Mobile: the app passes its deep link (?redirect=rideshare://auth or exp://...). */
export function mobileBrowserRouter(): Router {
    const router = express.Router();
    // A short-lived cookie session only carries PKCE/state across the provider redirect.
    router.use("/auth", sessionMiddleware("rideshare-auth.sid", { crossSitePost: true }));
    router.use(
        auth.createAuthRouter({
            appKey: "mobile",
            baseUrl: config.urls.api,
            startContext(req) {
                if (!validRedirect(req.query.redirect)) throw new AppError("BAD_REQUEST", "Open sign-in from the RideShare app.");
                return { redirect: req.query.redirect };
            },
            onSignIn(req, profile, { extra }) {
                const { user } = users.signIn(profile, "mobile");
                return loginRedirect(user, (extra as { redirect: string }).redirect);
            },
            onError(req: Request, res: Response, message: string, extra: unknown) {
                const redirect = (extra as { redirect?: string } | null)?.redirect;
                if (validRedirect(redirect)) return res.redirect(withParams(redirect, { error: message }));
                res.status(400).type("text").send(`${message} Please return to the RideShare app.`);
            }
        })
    );
    return router;
}

/**
 * Web: mounted at /web, reached through the web app's own origin (Vite proxies /web to the API),
 * so Google can redirect to http://localhost:5173/web/auth/google/callback with no tunnel.
 * Always returns to the fixed <WEB_URL>/signed-in page: there is no redirect parameter to abuse.
 */
export function webBrowserRouter(): Router {
    const router = express.Router();
    const appKey: AppKey = "web";
    const signedIn = `${config.urls.web}/signed-in`;
    router.use("/auth", sessionMiddleware("rideshare-web-auth.sid", { crossSitePost: true }));
    router.use(
        auth.createAuthRouter({
            appKey,
            baseUrl: `${config.urls.web}/web`,
            onSignIn(req, profile) {
                const { user } = users.signIn(profile, "web");
                return loginRedirect(user, signedIn);
            },
            onError(req, res, message) {
                res.redirect(withParams(signedIn, { error: message }));
            }
        })
    );
    return router;
}
