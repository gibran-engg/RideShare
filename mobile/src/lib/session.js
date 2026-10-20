import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api, API_URL, setAuthToken, setUnauthorizedHandler } from "./api";

const TOKEN_KEY = "rideshare.token";
const SessionContext = createContext(null);

/**
 * Signed-in state for the whole app.
 *   status: "loading" | "signed-out" | "signed-in"
 *   me:     { user, driver, next } from GET /api/me
 */
export function SessionProvider({ children }) {
    const [status, setStatus] = useState("loading");
    const [me, setMe] = useState(null);
    const [config, setConfig] = useState(null);

    const signOutLocally = useCallback(async () => {
        setAuthToken(null);
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        setMe(null);
        setStatus("signed-out");
    }, []);

    const refresh = useCallback(async () => {
        const data = await api("/api/me");
        setMe(data);
        return data;
    }, []);

    // Restore a saved token on launch.
    useEffect(() => {
        setUnauthorizedHandler(() => signOutLocally());
        (async () => {
            api("/api/config").then(setConfig).catch(() => {});
            const token = await SecureStore.getItemAsync(TOKEN_KEY);
            if (!token) return setStatus("signed-out");
            setAuthToken(token);
            try {
                await refresh();
                setStatus("signed-in");
            } catch (err) {
                if (err.status === 401 || err.status === 403) return signOutLocally();
                // Server unreachable: stay signed in, screens show the error and retry.
                setStatus("signed-in");
            }
        })();
    }, [refresh, signOutLocally]);

    /**
     * OAuth sign-in: open the provider in an in-app browser via the backend, which sends us
     * back to rideshare://auth (or exp://.../--/auth in Expo Go) with a one-time code.
     */
    const signIn = useCallback(async (provider) => {
        const redirect = Linking.createURL("auth");
        const startUrl = `${API_URL}/auth/${provider}?redirect=${encodeURIComponent(redirect)}`;
        const result = await WebBrowser.openAuthSessionAsync(startUrl, redirect);
        if (result.type !== "success") return { cancelled: true };

        const { queryParams } = Linking.parse(result.url);
        if (queryParams?.error) throw new Error(String(queryParams.error));
        if (!queryParams?.code) throw new Error("Sign-in didn't complete. Please try again.");

        const { token } = await api("/api/auth/exchange", { method: "POST", body: { code: String(queryParams.code) } });
        await SecureStore.setItemAsync(TOKEN_KEY, token);
        setAuthToken(token);
        await refresh();
        setStatus("signed-in");
        return { cancelled: false };
    }, [refresh]);

    const signOut = useCallback(async () => {
        try {
            await api("/api/auth/logout", { method: "POST" });
        } catch {
            // Signing out locally is what matters.
        }
        await signOutLocally();
    }, [signOutLocally]);

    const value = useMemo(
        () => ({ status, me, config, refresh, signIn, signOut, setMe }),
        [status, me, config, refresh, signIn, signOut]
    );
    return createElement(SessionContext.Provider, { value }, children);
}

export function useSession() {
    return useContext(SessionContext);
}
