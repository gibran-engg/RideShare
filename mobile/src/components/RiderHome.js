import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CenterPin, MonoMap, PlaceMarker, regionAround, Route, toLatLng } from "./MonoMap";
import { PlaceSearch } from "./PlaceSearch";
import { TopBar } from "./TopBar";
import { Button, Choice, Divider, ErrorText, Pill, Sheet } from "./ui";
import { api } from "../lib/api";
import { confirmAction } from "../lib/dialog";
import { useLiveUpdates } from "../lib/live";
import { useCurrentLocation } from "../lib/location";
import { colors, money, radius, space, type, VEHICLE_ICONS } from "../lib/theme";

const FIT_PADDING = { top: 140, right: 60, bottom: 420, left: 60 };

export function RiderHome() {
    const mapRef = useRef(null);
    const { location, status: locationStatus } = useCurrentLocation();

    const [pickup, setPickup] = useState(null);
    const [drop, setDrop] = useState(null);
    // idle | search-pickup | search-drop | pin-pickup | pin-drop | quote
    const [mode, setMode] = useState("idle");
    const [center, setCenter] = useState(null);
    const [quote, setQuote] = useState(null);
    const [vehicleType, setVehicleType] = useState("car");
    const [ride, setRide] = useState(null);
    const [finished, setFinished] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const activeId = useRef(null);

    // Default pickup: where the phone is.
    useEffect(() => {
        if (!location || pickup) return;
        mapRef.current?.animateToRegion(regionAround(location, 0.015), 600);
        api(`/api/places/reverse?lat=${location.lat}&lng=${location.lng}`)
            .then(({ place }) => setPickup((current) => current || { ...location, name: place.name || "Current location" }))
            .catch(() => setPickup((current) => current || { ...location, name: "Current location" }));
    }, [location, pickup]);

    const loadActive = useCallback(async () => {
        try {
            const { ride: current } = await api("/api/rides/active");
            if (current) {
                activeId.current = current.id;
                setRide(current);
            } else if (activeId.current) {
                // The ride just ended: show how it finished.
                const { ride: ended } = await api(`/api/rides/${activeId.current}`);
                activeId.current = null;
                setRide(null);
                setFinished(ended);
            }
        } catch (err) {
            setError(err.message);
        }
    }, []);

    useLiveUpdates(loadActive);

    // Keep the map framed on what matters for the current ride.
    useEffect(() => {
        if (!ride || !mapRef.current) return;
        const points = [ride.pickup, ride.drop];
        if (ride.driver?.location && ["accepted", "arrived"].includes(ride.status)) points.splice(1, 1, ride.driver.location);
        mapRef.current.fitToCoordinates(points.map(toLatLng), { edgePadding: FIT_PADDING, animated: true });
    }, [ride?.status, ride?.driver?.location?.lat, ride?.driver?.location?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

    const quoteRequest = useRef(0);

    /** Set the pickup or drop, and price the trip as soon as both ends are known. */
    async function choose(kind, place) {
        const nextPickup = kind === "pickup" ? place : pickup;
        const nextDrop = kind === "drop" ? place : drop;
        if (kind === "pickup") setPickup(place);
        else setDrop(place);
        if (!nextPickup || !nextDrop) {
            setMode("idle");
            return;
        }

        const id = ++quoteRequest.current;
        setMode(quote ? "quote" : "idle");
        setBusy(true);
        setError(null);
        try {
            const data = await api("/api/rides/estimate", { method: "POST", body: { pickup: nextPickup, drop: nextDrop } });
            if (id !== quoteRequest.current) return;
            setQuote(data);
            setMode("quote");
            mapRef.current?.fitToCoordinates([toLatLng(nextPickup), toLatLng(nextDrop)], { edgePadding: FIT_PADDING, animated: true });
        } catch (err) {
            if (id === quoteRequest.current) setError(err.message);
        } finally {
            if (id === quoteRequest.current) setBusy(false);
        }
    }

    async function confirmPin() {
        if (!center) return;
        setBusy(true);
        try {
            const { place } = await api(`/api/places/reverse?lat=${center.lat}&lng=${center.lng}`);
            setBusy(false);
            await choose(mode === "pin-pickup" ? "pickup" : "drop", { lat: center.lat, lng: center.lng, name: place.name });
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    async function requestRide() {
        setBusy(true);
        setError(null);
        try {
            const { ride: created } = await api("/api/rides", { method: "POST", body: { pickup, drop, vehicleType } });
            activeId.current = created.id;
            setRide(created);
            setQuote(null);
            setDrop(null);
            setMode("idle");
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function cancelRide() {
        const confirmed = await confirmAction("Cancel this ride?", "Your driver will be notified.", {
            confirm: "Cancel ride",
            cancel: "Keep ride",
            destructive: true
        });
        if (!confirmed) return;
        try {
            await api(`/api/rides/${ride.id}/cancel`, { method: "POST", body: {} });
            await loadActive();
        } catch (err) {
            setError(err.message);
        }
    }

    function resetTrip() {
        setDrop(null);
        setQuote(null);
        setMode("idle");
        setError(null);
    }

    const choosing = mode === "pin-pickup" || mode === "pin-drop";
    const selected = quote?.options.find((option) => option.type === vehicleType);

    return (
        <View style={styles.screen}>
            <MonoMap
                ref={mapRef}
                initialRegion={regionAround(location || { lat: 19.0863, lng: 72.9081 }, 0.03)}
                showsUserLocation={locationStatus === "granted"}
                showsMyLocationButton={false}
                onRegionChangeComplete={(region) => setCenter({ lat: region.latitude, lng: region.longitude })}
            >
                {ride ? (
                    <>
                        <Route coordinates={ride.route} />
                        <PlaceMarker point={ride.pickup} kind="pickup" title={ride.pickup.name} />
                        <PlaceMarker point={ride.drop} kind="drop" title={ride.drop.name} />
                        <PlaceMarker point={ride.driver?.location} kind="car" title={ride.driver?.name} />
                    </>
                ) : !choosing ? (
                    <>
                        {quote ? <Route coordinates={quote.route.geometry} /> : null}
                        <PlaceMarker point={pickup} kind="pickup" title="Pickup" />
                        <PlaceMarker point={drop} kind="drop" title="Drop" />
                    </>
                ) : null}
            </MonoMap>

            {choosing ? <CenterPin label={mode === "pin-pickup" ? "Pickup here" : "Drop here"} /> : null}
            <TopBar>{ride ? <Pill active>{ride.statusLabel}</Pill> : null}</TopBar>

            {/* ---------- Bottom sheet ---------- */}
            {ride ? (
                <ActiveRideSheet ride={ride} onCancel={cancelRide} error={error} />
            ) : finished ? (
                <Sheet>
                    <Pill active={finished.status === "completed"}>{finished.statusLabel}</Pill>
                    <Text style={type.title}>{finished.status === "completed" ? `You've arrived · ${money(finished.fare)}` : "Ride cancelled"}</Text>
                    <Text style={type.small}>{finished.pickup.name} → {finished.drop.name}</Text>
                    {finished.status === "completed" ? <Text style={type.small}>Please pay your driver {money(finished.fare)}.</Text> : null}
                    <Button title="Done" onPress={() => setFinished(null)} />
                </Sheet>
            ) : choosing ? (
                <Sheet>
                    <Text style={type.heading}>{mode === "pin-pickup" ? "Set pickup point" : "Set drop point"}</Text>
                    <Text style={type.small}>Move the map so the pin sits on the spot.</Text>
                    <ErrorText>{error}</ErrorText>
                    <Button title="Confirm location" loading={busy} onPress={confirmPin} />
                    <Button title="Back" variant="secondary" onPress={() => setMode(quote ? "quote" : "idle")} />
                </Sheet>
            ) : mode === "quote" && quote ? (
                <Sheet>
                    <TripSummary pickup={pickup} drop={drop} onEditPickup={() => setMode("search-pickup")} onEditDrop={() => setMode("search-drop")} />
                    <ScrollView style={styles.options} contentContainerStyle={{ gap: space(2) }}>
                        {quote.options.map((option) => (
                            <Choice
                                key={option.type}
                                icon={VEHICLE_ICONS[option.type]}
                                title={option.label}
                                subtitle={`${option.seats} seat${option.seats > 1 ? "s" : ""} · ${option.durationMin} min · ${option.distanceKm} km`}
                                right={money(option.fare)}
                                selected={vehicleType === option.type}
                                onPress={() => setVehicleType(option.type)}
                            />
                        ))}
                    </ScrollView>
                    {quote.route.source === "estimate" ? <Text style={type.small}>Road route unavailable; distance is estimated.</Text> : null}
                    <ErrorText>{error}</ErrorText>
                    <Button title={selected ? `Request ${selected.label} · ${money(selected.fare)}` : "Request ride"} loading={busy} onPress={requestRide} />
                    <Pressable onPress={resetTrip} hitSlop={8}>
                        <Text style={[type.small, styles.center]}>Start over</Text>
                    </Pressable>
                </Sheet>
            ) : (
                <Sheet>
                    <Text style={type.title}>Where to?</Text>
                    <TripSummary
                        pickup={pickup}
                        drop={drop}
                        onEditPickup={() => setMode("search-pickup")}
                        onEditDrop={() => setMode("search-drop")}
                    />
                    {busy ? <Text style={type.small}>Getting prices…</Text> : null}
                    {locationStatus === "denied" ? (
                        <Text style={type.small}>
                            Location is off, so we can’t set your pickup automatically.{" "}
                            {Platform.OS === "web" ? (
                                "Allow location for this site in your browser, then reload."
                            ) : (
                                <Text style={styles.link} onPress={() => Linking.openSettings()}>Open settings</Text>
                            )}
                        </Text>
                    ) : null}
                    <ErrorText>{error}</ErrorText>
                </Sheet>
            )}

            {mode === "search-pickup" || mode === "search-drop" ? (
                <PlaceSearch
                    title={mode === "search-pickup" ? "Pickup" : "Where to?"}
                    near={location}
                    onClose={() => setMode(quote ? "quote" : "idle")}
                    onChooseOnMap={() => {
                        const target = mode === "search-pickup" ? pickup : drop || pickup;
                        if (target) mapRef.current?.animateToRegion(regionAround(target, 0.008), 400);
                        setMode(mode === "search-pickup" ? "pin-pickup" : "pin-drop");
                    }}
                    onPick={(place) => {
                        choose(mode === "search-pickup" ? "pickup" : "drop", { lat: place.lat, lng: place.lng, name: place.name });
                    }}
                />
            ) : null}
        </View>
    );
}

function TripSummary({ pickup, drop, onEditPickup, onEditDrop }) {
    return (
        <View style={styles.trip}>
            <Pressable onPress={onEditPickup} style={styles.tripRow} accessibilityLabel="Change pickup">
                <View style={styles.dot} />
                <Text style={styles.tripText} numberOfLines={1}>{pickup ? pickup.name : "Finding your location…"}</Text>
            </Pressable>
            <Divider />
            <Pressable onPress={onEditDrop} style={styles.tripRow} accessibilityLabel="Choose destination">
                <View style={styles.square} />
                <Text style={[styles.tripText, !drop && styles.placeholder]} numberOfLines={1}>{drop ? drop.name : "Search destination"}</Text>
            </Pressable>
        </View>
    );
}

function ActiveRideSheet({ ride, onCancel, error }) {
    const canCancel = ["requested", "accepted", "arrived"].includes(ride.status);
    const driver = ride.driver;
    return (
        <Sheet>
            <Text style={type.title}>{ride.statusLabel}</Text>
            {ride.status === "requested" ? (
                <Text style={type.small}>Looking for a nearby {ride.vehicleType}. This updates automatically.</Text>
            ) : null}
            {driver ? (
                <View style={styles.driver}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{driver.name?.[0] || "?"}</Text></View>
                    <View style={{ flex: 1 }}>
                        <Text style={type.heading}>{driver.name}</Text>
                        <Text style={type.small}>{[driver.vehicle.color, driver.vehicle.make, driver.vehicle.model].filter(Boolean).join(" ")}</Text>
                    </View>
                    <Text style={styles.plate}>{driver.vehicle.plate}</Text>
                </View>
            ) : null}
            {ride.otp ? (
                <View style={styles.otpRow}>
                    <Text style={type.small}>Share this code with your driver to start</Text>
                    <View style={styles.otp}>
                        {ride.otp.split("").map((digit, index) => (
                            <Text key={index} style={styles.otpDigit}>{digit}</Text>
                        ))}
                    </View>
                </View>
            ) : null}
            <View style={styles.tripMeta}>
                <Text style={type.small} numberOfLines={1}>{ride.pickup.name} → {ride.drop.name}</Text>
                <Text style={styles.fare}>{money(ride.fare)}</Text>
            </View>
            <ErrorText>{error}</ErrorText>
            <View style={styles.actions}>
                {driver?.phone ? <Button style={{ flex: 1 }} title="Call driver" variant="secondary" onPress={() => Linking.openURL(`tel:${driver.phone}`)} /> : null}
                {canCancel ? <Button style={{ flex: 1 }} title="Cancel" variant="danger" onPress={onCancel} /> : null}
            </View>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { textAlign: "center" },
    link: { color: colors.text, textDecorationLine: "underline" },
    options: { maxHeight: 230 },
    trip: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
    tripRow: { flexDirection: "row", alignItems: "center", gap: space(3), padding: space(4) },
    tripText: { color: colors.text, fontSize: 16, flex: 1 },
    placeholder: { color: colors.muted },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.white },
    square: { width: 10, height: 10, backgroundColor: colors.white },
    driver: { flexDirection: "row", alignItems: "center", gap: space(3) },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
    avatarText: { color: colors.black, fontWeight: "800", fontSize: 20 },
    plate: { color: colors.black, backgroundColor: colors.white, fontWeight: "800", paddingHorizontal: space(2.5), paddingVertical: space(1.5), borderRadius: 6, overflow: "hidden", letterSpacing: 1 },
    otpRow: { gap: space(2) },
    otp: { flexDirection: "row", gap: space(2) },
    otpDigit: { color: colors.white, fontSize: 28, fontWeight: "900", borderWidth: 1.5, borderColor: colors.white, borderRadius: 10, width: 48, textAlign: "center", paddingVertical: space(1.5) },
    tripMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(3) },
    fare: { color: colors.text, fontSize: 20, fontWeight: "800" },
    actions: { flexDirection: "row", gap: space(3) }
});
