import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { WS_URL } from "./api";

/**
 * Calls onRefresh whenever the server says something on screen changed
 * (ride status, driver position, new requests, admin approval). Reconnects automatically
 * and refreshes on start and whenever the app comes back to the foreground.
 */
export function useLiveUpdates(onRefresh, enabled = true) {
    const callback = useRef(onRefresh);
    useEffect(() => {
        callback.current = onRefresh;
    });

    useEffect(() => {
        if (!enabled) return undefined;
        // Initial load, then on every change.
        callback.current();
        let socket = null;
        let retryTimer = null;
        let closed = false;
        let attempt = 0;

        async function connect() {
            const token = await SecureStore.getItemAsync("rideshare.token");
            if (!token || closed) return;
            socket = new WebSocket(WS_URL);
            socket.onopen = () => {
                attempt = 0;
                socket.send(JSON.stringify({ type: "auth", token }));
            };
            socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === "refresh" || message.type === "signed-out") callback.current();
                } catch {
                    // ignore malformed messages
                }
            };
            socket.onclose = () => {
                if (closed) return;
                attempt += 1;
                retryTimer = setTimeout(connect, Math.min(15000, 1000 * 2 ** attempt));
            };
            socket.onerror = () => {};
        }

        connect();
        const appState = AppState.addEventListener("change", (state) => {
            if (state === "active") callback.current();
        });

        return () => {
            closed = true;
            clearTimeout(retryTimer);
            appState.remove();
            if (socket) socket.close();
        };
    }, [enabled]);
}
