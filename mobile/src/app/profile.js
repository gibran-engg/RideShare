import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Pill } from "../components/ui";
import { API_URL } from "../lib/api";
import { useSession } from "../lib/session";
import { colors, radius, space, type, VEHICLE_ICONS } from "../lib/theme";

function Row({ label, value }) {
    return (
        <View style={styles.row}>
            <Text style={type.small}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
        </View>
    );
}

export default function Profile() {
    const { me, signOut } = useSession();
    if (!me) return null;
    const { user, driver } = me;

    async function logOut() {
        await signOut();
        router.replace("/welcome");
    }

    return (
        <SafeAreaView style={styles.screen}>
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
                        <Text style={styles.back}>←</Text>
                    </Pressable>
                </View>
                <View style={styles.avatar}><Text style={styles.avatarText}>{(user.name || "?")[0]}</Text></View>
                <Text style={type.title}>{user.name}</Text>
                <Pill active>{user.role}</Pill>

                <View style={styles.card}>
                    <Row label="Email" value={user.email} />
                    <Row label="Phone" value={user.phone} />
                    {driver ? (
                        <>
                            <Row label="Vehicle" value={`${VEHICLE_ICONS[driver.vehicle.type]} ${[driver.vehicle.color, driver.vehicle.make, driver.vehicle.model].filter(Boolean).join(" ")}`} />
                            <Row label="Registration" value={driver.vehicle.plate} />
                            <Row label="Licence" value={driver.licenseNumber} />
                        </>
                    ) : null}
                </View>

                <Button title="Ride history" variant="secondary" onPress={() => router.push("/history")} />
                <Button title="Sign out" variant="danger" onPress={logOut} />
                <Text style={styles.footer}>Server: {API_URL}{"\n"}Map data © OpenStreetMap contributors © CARTO</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space(5), gap: space(4) },
    header: { flexDirection: "row" },
    back: { color: colors.text, fontSize: 26 },
    avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
    avatarText: { color: colors.black, fontSize: 30, fontWeight: "900" },
    card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space(4), gap: space(3) },
    row: { gap: space(1) },
    value: { color: colors.text, fontSize: 16 },
    footer: { ...type.small, fontSize: 11, textAlign: "center", marginTop: space(4) }
});
