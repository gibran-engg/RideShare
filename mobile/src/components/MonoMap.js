import { forwardRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, UrlTile } from "react-native-maps";
import { colors } from "../lib/theme";

// Dark monochrome OpenStreetMap tiles (CARTO "Dark Matter").
export const TILE_URL = "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png";
export const ATTRIBUTION = "© OpenStreetMap contributors © CARTO";

export function toLatLng(point) {
    return { latitude: point.lat, longitude: point.lng };
}

export function regionAround(point, delta = 0.02) {
    return { ...toLatLng(point), latitudeDelta: delta, longitudeDelta: delta };
}

/**
 * Full-screen map that only shows OSM tiles: on Android the Google base map is turned off
 * (mapType "none"); on iOS the tile layer replaces Apple's map content.
 */
export const MonoMap = forwardRef(function MonoMap({ children, style, ...props }, ref) {
    return (
        <View style={[StyleSheet.absoluteFill, style]}>
            <MapView
                ref={ref}
                style={StyleSheet.absoluteFill}
                mapType={Platform.OS === "android" ? "none" : "standard"}
                userInterfaceStyle="dark"
                showsPointsOfInterest={false}
                showsCompass={false}
                showsBuildings={false}
                showsTraffic={false}
                toolbarEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                {...props}
            >
                <UrlTile urlTemplate={TILE_URL} maximumZ={20} tileSize={512} shouldReplaceMapContent zIndex={-1} />
                {children}
            </MapView>
            <Text style={styles.attribution} pointerEvents="none">{ATTRIBUTION}</Text>
        </View>
    );
});

/** White route line. `coordinates` is [[lat, lng], ...] from the API. */
export function Route({ coordinates }) {
    if (!coordinates || coordinates.length < 2) return null;
    return (
        <Polyline
            coordinates={coordinates.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))}
            strokeColor={colors.white}
            strokeWidth={4}
            lineJoin="round"
            lineCap="round"
        />
    );
}

/** Pickup = white dot, drop = white square, car = black disc with white border. */
export function PlaceMarker({ point, kind = "pickup", title }) {
    if (!point) return null;
    return (
        <Marker coordinate={toLatLng(point)} title={title} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={kind === "drop" ? styles.drop : kind === "car" ? styles.car : styles.pickup}>
                {kind === "car" ? <Text style={styles.carIcon}>▲</Text> : <View style={styles.inner} />}
            </View>
        </Marker>
    );
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
    pickup: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: colors.white,
        alignItems: "center",
        justifyContent: "center"
    },
    drop: {
        width: 20,
        height: 20,
        backgroundColor: colors.white,
        alignItems: "center",
        justifyContent: "center"
    },
    inner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.black },
    car: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: colors.black,
        borderWidth: 2,
        borderColor: colors.white,
        alignItems: "center",
        justifyContent: "center"
    },
    carIcon: { color: colors.white, fontSize: 12, fontWeight: "900" },
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
