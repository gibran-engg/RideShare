import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MonoMap, PlaceMarker, regionAround, Route, toLatLng } from "./MonoMap";
import { TopBar } from "./TopBar";
import { Button, ErrorText, Pill, Sheet } from "./ui";
import { api } from "../lib/api";
import { useLiveUpdates } from "../lib/live";
import { useCurrentLocation, useWatchLocation } from "../lib/location";
import { useSession } from "../lib/session";
import { colors, money, radius, space, type, VEHICLE_ICONS } from "../lib/theme";

const FIT_PADDING = { top: 140, right: 60, bottom: 380, left: 60 };

/** Open turn-by-turn directions in the phone's maps app. */
function navigateTo(point) {
    const url = Platform.select({
        ios: `maps://?daddr=${point.lat},${point.lng}`,
        default: `google.navigation:q=${point.lat},${point.lng}`
    });
    Linking.openURL(url).catch(() =>
        Linking.openURL(`https://www.openstreetmap.org/directions?to=${point.lat}%2C${point.lng}`)
    );
}

export function DriverHome() {
    const mapRef = useRef(null);
    const { me, refresh } = useSession();
    const { location: initialLocation, status: locationStatus } = useCurrentLocation();
    const [position, setPosition] = useState(null);
    const [online, setOnline] = useState(Boolean(me?.driver?.isOnline));
    const [ride, setRide] = useState(null);
    const [requests, setRequests] = useState([]);
    const [earnings, setEarnings] = useState(null);
    const [otp, setOtp] = useState("");
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);

    const here = position || initialLocation;
    const vehicle = me?.driver?.vehicle;

    // Report GPS to the server: once at start, then continuously while online or on a trip.
    const report = useCallback(async (point) => {
        setPosition(point);
        try {
            await api("/api/driver/location", { method: "POST", body: point });
        } catch {
            // Next update will retry.
        }
    }, []);
    useEffect(() => {
        if (initialLocation && locationStatus === "granted") {
            api("/api/driver/location", { method: "POST", body: initialLocation }).catch(() => {});
        }
    }, [initialLocation, locationStatus]);
    useWatchLocation(online || Boolean(ride), report);

    const load = useCallback(async () => {
        try {
            const [{ ride: current }, { earnings: summary }] = await Promise.all([
                api("/api/rides/active"),
                api("/api/driver/earnings")
            ]);
            setRide(current);
            setEarnings(summary);
            if (!current) {
                const { rides: open } = await api("/api/driver/requests");
                setRequests(open);
            } else {
                setRequests([]);
            }
            setError(null);
        } catch (err) {
            setError(err.message);
        }
    }, []);

    useLiveUpdates(() => {
        load();
        refresh().catch(() => {});
    });

    useEffect(() => {
        if (!ride || !mapRef.current) return;
        const points = [ride.pickup, ride.drop];
        if (here && ["accepted", "arrived"].includes(ride.status)) points.splice(1, 1, here);
        mapRef.current.fitToCoordinates(points.map(toLatLng), { edgePadding: FIT_PADDING, animated: true });
    }, [ride?.id, ride?.status]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (initialLocation && !ride) mapRef.current?.animateToRegion(regionAround(initialLocation, 0.04), 600);
    }, [initialLocation]); // eslint-disable-line react-hooks/exhaustive-deps

    async function act(name, fn) {
        setBusy(name);
        setError(null);
        try {
            await fn();
            await load();
        } catch (err) {
            setError(err.message);
            await load();
        } finally {
            setBusy(null);
        }
    }

    function toggleOnline() {
        if (!online && locationStatus !== "granted") {
            Alert.alert("Location needed", "Turn on location so riders nearby can find you.", [
                { text: "Not now", style: "cancel" },
                { text: "Open settings", onPress: () => Linking.openSettings() }
            ]);
            return;
        }
        act("online", async () => {
            const { driver } = await api("/api/driver/online", { method: "POST", body: { online: !online } });
            setOnline(driver.isOnline);
        });
    }

    function release() {
        Alert.alert("Release this ride?", "It goes back to other drivers.", [
            { text: "Keep ride", style: "cancel" },
            { text: "Release", style: "destructive", onPress: () => act("cancel", () => api(`/api/rides/${ride.id}/cancel`, { method: "POST", body: {} })) }
        ]);
    }

    return (
        <View style={styles.screen}>
            <MonoMap
                ref={mapRef}
                initialRegion={regionAround(here || { lat: 19.0863, lng: 72.9081 }, 0.05)}
                showsUserLocation={locationStatus === "granted"}
                showsMyLocationButton={false}
            >
                {ride ? (
                    <>
                        <Route coordinates={ride.route} />
                        <PlaceMarker point={ride.pickup} kind="pickup" title={ride.pickup.name} />
                        <PlaceMarker point={ride.drop} kind="drop" title={ride.drop.name} />
                    </>
                ) : (
                    requests.map((request) => <PlaceMarker key={request.id} point={request.pickup} kind="pickup" title={`${money(request.fare)} · ${request.pickup.name}`} />)
                )}
            </MonoMap>

            <TopBar>
                <Pill active={online}>{online ? "Online" : "Offline"}</Pill>
            </TopBar>

            {ride ? (
                <Sheet>
                    <Pill active>{ride.statusLabel}</Pill>
                    <Text style={type.title}>
                        {ride.status === "in_progress" ? `To ${ride.drop.name}` : `Pick up ${ride.rider.name}`}
                    </Text>
                    <Text style={type.small} numberOfLines={2}>
                        {ride.status === "in_progress" ? ride.drop.name : ride.pickup.name} · {money(ride.fare)} · {ride.distanceKm} km
                    </Text>

                    {ride.status === "accepted" ? (
                        <View style={styles.actions}>
                            <Button style={styles.flex} title="Navigate" variant="secondary" onPress={() => navigateTo(ride.pickup)} />
                            <Button style={styles.flex} title="I've arrived" loading={busy === "arrived"} onPress={() => act("arrived", () => api(`/api/rides/${ride.id}/arrived`, { method: "POST", body: {} }))} />
                        </View>
                    ) : null}

                    {["accepted", "arrived"].includes(ride.status) ? (
                        <View style={styles.otpRow}>
                            <TextInput
                                value={otp}
                                onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 4))}
                                placeholder="Rider's OTP"
                                placeholderTextColor={colors.faint}
                                keyboardType="number-pad"
                                maxLength={4}
                                style={styles.otpInput}
                            />
                            <Button
                                style={styles.flex}
                                title="Start trip"
                                disabled={otp.length !== 4}
                                loading={busy === "start"}
                                onPress={() => act("start", async () => {
                                    await api(`/api/rides/${ride.id}/start`, { method: "POST", body: { otp } });
                                    setOtp("");
                                })}
                            />
                        </View>
                    ) : null}

                    {ride.status === "in_progress" ? (
                        <View style={styles.actions}>
                            <Button style={styles.flex} title="Navigate" variant="secondary" onPress={() => navigateTo(ride.drop)} />
                            <Button style={styles.flex} title="Complete trip" loading={busy === "complete"} onPress={() => act("complete", () => api(`/api/rides/${ride.id}/complete`, { method: "POST", body: {} }))} />
                        </View>
                    ) : null}

                    <ErrorText>{error}</ErrorText>
                    <View style={styles.actions}>
                        {ride.rider.phone ? <Button small style={styles.flex} title="Call rider" variant="secondary" onPress={() => Linking.openURL(`tel:${ride.rider.phone}`)} /> : null}
                        {["accepted", "arrived"].includes(ride.status) ? <Button small style={styles.flex} title="Release ride" variant="danger" onPress={release} /> : null}
                    </View>
                </Sheet>
            ) : (
                <Sheet>
                    <View style={styles.header}>
                        <View>
                            <Text style={type.label}>Today</Text>
                            <Text style={styles.earnings}>{money(earnings?.today.amount)}</Text>
                            <Text style={type.small}>{earnings?.today.trips || 0} trips · {VEHICLE_ICONS[vehicle?.type]} {vehicle?.plate}</Text>
                        </View>
                        <Button small title={online ? "Go offline" : "Go online"} variant={online ? "secondary" : "primary"} loading={busy === "online"} onPress={toggleOnline} />
                    </View>
                    {!online ? (
                        <Text style={type.small}>Go online to receive ride requests for your {vehicle?.type} nearby.</Text>
                    ) : requests.length === 0 ? (
                        <Text style={type.small}>Waiting for requests near you… New ones appear here instantly.</Text>
                    ) : (
                        <ScrollView style={styles.requests} contentContainerStyle={{ gap: space(2.5) }}>
                            {requests.map((request) => (
                                <View key={request.id} style={styles.request}>
                                    <View style={styles.requestHead}>
                                        <Text style={styles.requestFare}>{money(request.fare)}</Text>
                                        <Text style={type.small}>{request.pickupDistanceKm} km away</Text>
                                    </View>
                                    <Text style={type.body} numberOfLines={1}>● {request.pickup.name}</Text>
                                    <Text style={type.body} numberOfLines={1}>■ {request.drop.name}</Text>
                                    <Text style={type.small}>{request.distanceKm} km trip · ~{request.durationMin} min · {request.rider.name}</Text>
                                    <Button
                                        title="Accept"
                                        loading={busy === `accept-${request.id}`}
                                        onPress={() => act(`accept-${request.id}`, () => api(`/api/rides/${request.id}/accept`, { method: "POST", body: {} }))}
                                    />
                                </View>
                            ))}
                        </ScrollView>
                    )}
                    <ErrorText>{error}</ErrorText>
                </Sheet>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    earnings: { color: colors.text, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
    actions: { flexDirection: "row", gap: space(3) },
    otpRow: { flexDirection: "row", gap: space(3), alignItems: "center" },
    otpInput: {
        width: 140,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        color: colors.text,
        fontSize: 22,
        fontWeight: "800",
        letterSpacing: 6,
        textAlign: "center",
        paddingVertical: space(3)
    },
    requests: { maxHeight: 330 },
    request: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space(4), gap: space(1.5) },
    requestHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    requestFare: { color: colors.text, fontSize: 24, fontWeight: "900" }
});
