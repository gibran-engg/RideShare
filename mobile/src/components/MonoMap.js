import { forwardRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, UrlTile } from "react-native-maps";
import { Attribution, toLatLng, useMapTiles } from "./mapCommon";
import { colors } from "../lib/theme";

// The browser uses MonoMap.web.js instead of this file.
export { CenterPin, regionAround, toLatLng } from "./mapCommon";

/**
 * Full-screen map that only shows OSM tiles: on Android the Google base map is turned off
 * (mapType "none"); on iOS the tile layer replaces Apple's map content.
 */
export const MonoMap = forwardRef(function MonoMap({ children, style, ...props }, ref) {
    const tiles = useMapTiles();
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
                {tiles ? <UrlTile urlTemplate={tiles.url} maximumZ={20} tileSize={512} shouldReplaceMapContent zIndex={-1} /> : null}
                {children}
            </MapView>
            <Attribution text={tiles?.attribution} />
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

const styles = StyleSheet.create({
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
    carIcon: { color: colors.white, fontSize: 12, fontWeight: "900" }
});
