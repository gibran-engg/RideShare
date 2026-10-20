import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api, API_URL, setAuthToken, setUnauthorizedHandler } from "./api";
import { clearToken, loadToken, saveToken } from "./token";

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
        await clearToken();
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
            const token = await loadToken();
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

    /** Swap the one-time code from the sign-in redirect for an app token. */
    const completeSignIn = useCallback(async (code) => {
        const { token } = await api("/api/auth/exchange", { method: "POST", body: { code } });
        await saveToken(token);
        setAuthToken(token);
        await refresh();
        setStatus("signed-in");
    }, [refresh]);

    /**
     * OAuth sign-in: open the provider in an in-app browser via the backend, which sends us
     * back to rideshare://auth (or exp://.../--/auth in Expo Go) with a one-time code.
     */
    const signIn = useCallback(async (provider) => {
        if (Platform.OS === "web") {
            // Browser: the backend's web sign-in returns to the /signed-in screen, which finishes it.
            window.location.assign(`/web/auth/${provider}`);
            return new Promise(() => {});
        }

        const redirect = Linking.createURL("auth");
        const startUrl = `${API_URL}/auth/${provider}?redirect=${encodeURIComponent(redirect)}`;
        const result = await WebBrowser.openAuthSessionAsync(startUrl, redirect);
        if (result.type !== "success") return { cancelled: true };

        const { queryParams } = Linking.parse(result.url);
        if (queryParams?.error) throw new Error(String(queryParams.error));
        if (!queryParams?.code) throw new Error("Sign-in didn't complete. Please try again.");

        await completeSignIn(String(queryParams.code));
        return { cancelled: false };
    }, [completeSignIn]);

    const signOut = useCallback(async () => {
        try {
            await api("/api/auth/logout", { method: "POST" });
        } catch {
            // Signing out locally is what matters.
        }
        await signOutLocally();
    }, [signOutLocally]);

    const value = useMemo(
        () => ({ status, me, config, refresh, signIn, completeSignIn, signOut, setMe }),
        [status, me, config, refresh, signIn, completeSignIn, signOut]
    );
    return createElement(SessionContext.Provider, { value }, children);
}

export function useSession() {
    return useContext(SessionContext);
}
