import { StyleSheet, Text, View } from "react-native";
import { useSession } from "../lib/session";
import { colors } from "../lib/theme";

/** Shared by the phone map (MonoMap.js) and the browser map (MonoMap.web.js). */

/**
 * Dark map tiles and their credit line, from the server's /api/config: MapTiler when
 * MAPTILER_KEY is set in the root .env, otherwise CARTO. The URLs are @2x (512px) images.
 * null until the config has loaded, so the map never flashes the wrong tiles.
 */
export function useMapTiles() {
    const { config } = useSession();
    return config?.map ? { url: config.map.tileUrl, attribution: config.map.attribution } : null;
}

export function toLatLng(point) {
    return { latitude: point.lat, longitude: point.lng };
}

export function regionAround(point, delta = 0.02) {
    return { ...toLatLng(point), latitudeDelta: delta, longitudeDelta: delta };
}

export function Attribution({ text }) {
    if (!text) return null;
    return <Text style={styles.attribution} pointerEvents="none">{text}</Text>;
}

/** Fixed pin in the middle of the screen for choosing a spot by moving the map. */
export function CenterPin({ label }) {
    return (
        <View pointerEvents="none" style={styles.centerWrap}>
            {label ? <Text style={styles.centerLabel}>{label}</Text> : null}
            <View style={styles.centerHead} />
            <View style={styles.centerStem} />
        </View>
    );
}

const styles = StyleSheet.create({
    attribution: {
        position: "absolute",
        right: 6,
        bottom: 2,
        fontSize: 9,
        color: colors.faint
    },
    centerWrap: {
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        // Lift the pin so its tip, not its centre, marks the spot.
        paddingBottom: 44
    },
    centerLabel: {
        backgroundColor: colors.white,
        color: colors.black,
        fontWeight: "700",
        fontSize: 12,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        marginBottom: 6,
        overflow: "hidden"
    },
    centerHead: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: colors.white,
        borderWidth: 6,
        borderColor: colors.black
    },
    centerStem: { width: 3, height: 18, backgroundColor: colors.white }
});
