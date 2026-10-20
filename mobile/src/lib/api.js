import Constants from "expo-constants";

/**
 * Where the backend lives.
 * - EXPO_PUBLIC_API_URL wins (use it for an HTTPS tunnel, needed for Google sign-in on a phone).
 * - Otherwise in development we reuse the host the Expo dev server runs on (your PC's
 *   Wi-Fi IP), with the API's port 3000.
 */
function resolveApiUrl() {
    if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
    const hostUri = Constants.expoConfig?.hostUri || Constants.linkingUri || "";
    const host = hostUri.replace(/^[a-z]+:\/\//, "").split(":")[0].split("/")[0];
    return `http://${host || "localhost"}:3000`;
}

export const API_URL = resolveApiUrl();
export const WS_URL = API_URL.replace(/^http/, "ws") + "/ws";

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
        throw new ApiError(0, `Can't reach the RideShare server at ${API_URL}. Is it running, and is your phone on the same Wi-Fi?`);
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
