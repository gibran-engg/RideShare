import { useEffect, useState } from "react";
import * as Location from "expo-location";

// Used until GPS answers (or if location is denied): Ghatkopar, Mumbai.
export const FALLBACK_LOCATION = { lat: 19.0863, lng: 72.9081 };

function toPoint(position) {
    return { lat: position.coords.latitude, lng: position.coords.longitude };
}

/** Current position with permission handling. { location, status: "loading"|"granted"|"denied" } */
export function useCurrentLocation() {
    const [state, setState] = useState({ location: null, status: "loading" });

    useEffect(() => {
        let active = true;
        (async () => {
            const { granted } = await Location.requestForegroundPermissionsAsync();
            if (!granted) {
                if (active) setState({ location: FALLBACK_LOCATION, status: "denied" });
                return;
            }
            // A cached fix is instant; then refine with a fresh one.
            const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
            if (last && active) setState({ location: toPoint(last), status: "granted" });
            try {
                const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                if (active) setState({ location: toPoint(current), status: "granted" });
            } catch {
                if (active && !last) setState({ location: FALLBACK_LOCATION, status: "denied" });
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    return state;
}

/** Follow the phone's position while `enabled` (drivers on duty). */
export function useWatchLocation(enabled, onChange) {
    useEffect(() => {
        if (!enabled) return undefined;
        let subscription = null;
        let cancelled = false;
        (async () => {
            const { granted } = await Location.requestForegroundPermissionsAsync();
            if (!granted || cancelled) return;
            subscription = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, distanceInterval: 30, timeInterval: 10000 },
                (position) => onChange(toPoint(position))
            );
            if (cancelled) subscription.remove();
        })();
        return () => {
            cancelled = true;
            if (subscription) subscription.remove();
        };
        // onChange is intentionally not a dependency: callers pass inline functions.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);
}
