import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorText, Pill } from "../components/ui";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { colors, money, radius, space, type, VEHICLE_ICONS } from "../lib/theme";

function when(value) {
    if (!value) return "";
    const date = new Date(`${value.replace(" ", "T")}Z`);
    return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function History() {
    const { me } = useSession();
    const [rides, setRides] = useState(null);
    const [error, setError] = useState(null);
    const isDriver = me?.user.role === "driver";

    useEffect(() => {
        api("/api/rides").then((data) => setRides(data.rides)).catch((err) => setError(err.message));
    }, []);

    return (
        <SafeAreaView style={styles.screen}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
                    <Text style={styles.back}>←</Text>
                </Pressable>
                <Text style={type.title}>{isDriver ? "Your trips" : "Your rides"}</Text>
            </View>
            <ErrorText>{error}</ErrorText>
            {!rides && !error ? <ActivityIndicator color={colors.white} /> : null}
            <FlatList
                data={rides || []}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={{ gap: space(2.5), paddingBottom: space(10) }}
                ListEmptyComponent={rides ? <Text style={[type.small, styles.empty]}>No rides yet.</Text> : null}
                renderItem={({ item }) => (
                    <View style={styles.card}>
                        <View style={styles.row}>
                            <Text style={type.small}>{when(item.times.requested)} · {VEHICLE_ICONS[item.vehicleType]}</Text>
                            <Pill active={item.status === "completed"}>{item.statusLabel}</Pill>
                        </View>
                        <Text style={type.body} numberOfLines={1}>● {item.pickup.name}</Text>
                        <Text style={type.body} numberOfLines={1}>■ {item.drop.name}</Text>
                        <View style={styles.row}>
                            <Text style={type.small}>
                                {isDriver ? item.rider.name : item.driver?.name || "No driver"} · {item.distanceKm} km
                            </Text>
                            <Text style={styles.fare}>{money(item.fare)}</Text>
                        </View>
                    </View>
                )}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space(4) },
    header: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(4) },
    back: { color: colors.text, fontSize: 26 },
    card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space(4), gap: space(1.5) },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space(2) },
    fare: { color: colors.text, fontWeight: "800", fontSize: 16 },
    empty: { textAlign: "center", marginTop: space(10) }
});
