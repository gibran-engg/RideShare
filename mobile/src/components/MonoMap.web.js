import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Attribution, useMapTiles } from "./mapCommon";
import { colors } from "../lib/theme";

/**
 * Browser version of MonoMap.js, drawn with Leaflet. It accepts the props and ref methods the
 * screens use from react-native-maps (initialRegion, onRegionChangeComplete, animateToRegion,
 * fitToCoordinates, ...) so the screens don't need to know which one they got.
 */
export { CenterPin, regionAround, toLatLng } from "./mapCommon";

const MapContext = createContext(null);
// Maps that were torn down. When fast refresh rebuilds the map in development, markers and
// routes still see the old one for a moment and must not draw on it.
const removedMaps = new WeakSet();

function regionBounds({ latitude, longitude, latitudeDelta, longitudeDelta }) {
    return L.latLngBounds(
        [latitude - latitudeDelta / 2, longitude - longitudeDelta / 2],
        [latitude + latitudeDelta / 2, longitude + longitudeDelta / 2]
    );
}

export const MonoMap = forwardRef(function MonoMap(
    { children, style, initialRegion, scrollEnabled = true, zoomEnabled = true, showsUserLocation = false, onRegionChangeComplete },
    ref
) {
    const container = useRef(null);
    const mapRef = useRef(null);
    const [map, setMap] = useState(null);
    const tiles = useMapTiles();
    const onRegionChange = useRef(onRegionChangeComplete);
    useEffect(() => {
        onRegionChange.current = onRegionChangeComplete;
    });

    useLayoutEffect(() => {
        const instance = L.map(container.current, {
            zoomControl: false,
            attributionControl: false,
            zoomSnap: 0.25,
            minZoom: 1,
            dragging: scrollEnabled,
            scrollWheelZoom: zoomEnabled,
            doubleClickZoom: zoomEnabled,
            touchZoom: zoomEnabled,
            boxZoom: false,
            keyboard: false
        });
        if (initialRegion) instance.fitBounds(regionBounds(initialRegion), { animate: false });
        instance.on("moveend", () => {
            const center = instance.getCenter();
            const bounds = instance.getBounds();
            onRegionChange.current?.({
                latitude: center.lat,
                longitude: center.lng,
                latitudeDelta: bounds.getNorth() - bounds.getSouth(),
                longitudeDelta: bounds.getEast() - bounds.getWest()
            });
        });
        const resize = new ResizeObserver(() => instance.invalidateSize());
        resize.observe(container.current);

        mapRef.current = instance;
        setMap(instance);
        return () => {
            resize.disconnect();
            removedMaps.add(instance);
            instance.remove();
            mapRef.current = null;
        };
        // Like react-native-maps, initialRegion and the gesture flags only apply when the map opens.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const tileUrl = tiles?.url;
    useEffect(() => {
        if (!map || removedMaps.has(map) || !tileUrl) return undefined;
        // The @2x (512px) tiles drawn at 256px: normal-size labels, sharp on high-DPI screens.
        const layer = L.tileLayer(tileUrl, { tileSize: 256, maxZoom: 20 }).addTo(map);
        layer.bringToBack();
        return () => {
            layer.remove();
        };
    }, [map, tileUrl]);

    useImperativeHandle(ref, () => ({
        animateToRegion(region, duration = 500) {
            mapRef.current?.flyToBounds(regionBounds(region), { duration: duration / 1000 });
        },
        fitToCoordinates(coordinates, { edgePadding = {}, animated = true } = {}) {
            const instance = mapRef.current;
            if (!instance || !coordinates.length) return;
            const { top = 0, right = 0, bottom = 0, left = 0 } = edgePadding;
            // Phone-sized padding can be more than a short browser window has room for.
            const size = instance.getSize();
            const scale = Math.min(1, (size.y * 0.7) / (top + bottom || 1), (size.x * 0.7) / (left + right || 1));
            instance.fitBounds(
                L.latLngBounds(coordinates.map((point) => [point.latitude, point.longitude])),
                { paddingTopLeft: [left * scale, top * scale], paddingBottomRight: [right * scale, bottom * scale], animate: animated, maxZoom: 17 }
            );
        }
    }));

    // The browser's own location, like the phone map's user dot.
    useEffect(() => {
        if (!map || removedMaps.has(map) || !showsUserLocation || !navigator.geolocation) return undefined;
        let dot = null;
        const watch = navigator.geolocation.watchPosition(
            ({ coords }) => {
                const at = [coords.latitude, coords.longitude];
                if (dot) dot.setLatLng(at);
                else dot = L.circleMarker(at, { radius: 7, weight: 3, color: colors.white, fillColor: colors.muted, fillOpacity: 1, interactive: false }).addTo(map);
            },
            () => {},
            { maximumAge: 60000 }
        );
        return () => {
            navigator.geolocation.clearWatch(watch);
            dot?.remove();
        };
    }, [map, showsUserLocation]);

    return (
        <View style={[StyleSheet.absoluteFill, style]}>
            <div ref={container} style={{ position: "absolute", inset: 0, background: colors.bg }} />
            {map ? <MapContext.Provider value={map}>{children}</MapContext.Provider> : null}
            <Attribution text={tiles?.attribution} />
        </View>
    );
});

/** White route line. `coordinates` is [[lat, lng], ...] from the API. */
export function Route({ coordinates }) {
    const map = useContext(MapContext);
    useEffect(() => {
        if (removedMaps.has(map) || !coordinates || coordinates.length < 2) return undefined;
        const line = L.polyline(coordinates, { color: colors.white, weight: 4, opacity: 1, lineJoin: "round", lineCap: "round", interactive: false });
        line.addTo(map);
        return () => {
            line.remove();
        };
    }, [map, coordinates]);
    return null;
}

/** Pickup = white dot, drop = white square, car = black disc with white border. */
function markerIcon(kind) {
    const size = kind === "car" ? 30 : kind === "drop" ? 20 : 22;
    const shell =
        kind === "car"
            ? `background:${colors.black};border:2px solid ${colors.white};border-radius:50%`
            : `background:${colors.white};border-radius:${kind === "drop" ? "0" : "50%"}`;
    const inner =
        kind === "car"
            ? `<span style="color:${colors.white};font:900 12px sans-serif">▲</span>`
            : `<span style="width:8px;height:8px;border-radius:50%;background:${colors.black}"></span>`;
    return L.divIcon({
        className: "",
        iconSize: [size, size],
        html: `<div style="box-sizing:border-box;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;${shell}">${inner}</div>`
    });
}

export function PlaceMarker({ point, kind = "pickup", title }) {
    const map = useContext(MapContext);
    const lat = point?.lat;
    const lng = point?.lng;
    useEffect(() => {
        if (removedMaps.has(map) || lat == null || lng == null) return undefined;
        // `title` shows as a tooltip on hover, the browser's version of the phone's callout.
        const marker = L.marker([lat, lng], { icon: markerIcon(kind), title: title || "", keyboard: false }).addTo(map);
        return () => {
            marker.remove();
        };
    }, [map, lat, lng, kind, title]);
    return null;
}
