import Constants from "expo-constants";
import { Platform } from "react-native";

const onWeb = Platform.OS === "web";

/**
 * Where the backend lives.
 * - In the browser: the page's own origin. The web dev server forwards /api and /web to the API
 *   (see metro.config.js), so no CORS is needed.
 * - EXPO_PUBLIC_API_URL wins (use it for an HTTPS tunnel, needed for Google sign-in on a phone).
 * - Otherwise in development we reuse the host the Expo dev server runs on (your PC's
 *   Wi-Fi IP), with the API's port 3000.
 */
function resolveApiUrl() {
    if (onWeb) return window.location.origin;
    if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
    const hostUri = Constants.expoConfig?.hostUri || Constants.linkingUri || "";
    const host = hostUri.replace(/^[a-z]+:\/\//, "").split(":")[0].split("/")[0];
    return `http://${host || "localhost"}:3000`;
}

export const API_URL = resolveApiUrl();
// The dev server only forwards HTTP, so in the browser the live-updates socket goes straight to the API.
export const WS_URL = onWeb ? `ws://${window.location.hostname}:3000/ws` : API_URL.replace(/^http/, "ws") + "/ws";

export class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

let authToken = null;
let onUnauthorized = () => {};

export function setAuthToken(token) {
    authToken = token;
}

export function setUnauthorizedHandler(handler) {
    onUnauthorized = handler;
}

/** JSON request to the API. Throws ApiError with the server's message on failure. */
export async function api(path, { method = "GET", body, form } = {}) {
    let response;
    try {
        response = await fetch(`${API_URL}${path}`, {
            method,
            headers: {
                Accept: "application/json",
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                ...(body ? { "Content-Type": "application/json" } : {})
            },
            body: form || (body ? JSON.stringify(body) : undefined)
        });
    } catch {
        const hint = onWeb ? "Is it running?" : "Is it running, and is your phone on the same Wi-Fi?";
        throw new ApiError(0, `Can't reach the RideShare server at ${API_URL}. ${hint}`);
    }

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        if (response.status === 401 && authToken) onUnauthorized();
        throw new ApiError(response.status, (data && data.error) || `Request failed (${response.status})`);
    }
    return data;
}
