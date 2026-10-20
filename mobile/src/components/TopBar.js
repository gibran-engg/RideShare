import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space } from "../lib/theme";

/** Floating round buttons over the map. */
export function TopBar({ children }) {
    const insets = useSafeAreaInsets();
    return (
        <View style={[styles.bar, { top: insets.top + space(2) }]} pointerEvents="box-none">
            <RoundButton label="☰" accessibilityLabel="Menu" onPress={() => router.push("/profile")} />
            <View style={styles.middle} pointerEvents="box-none">{children}</View>
            <RoundButton label="⏱" accessibilityLabel="Ride history" onPress={() => router.push("/history")} />
        </View>
    );
}

export function RoundButton({ label, onPress, accessibilityLabel, style }) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            onPress={onPress}
            hitSlop={8}
            style={({ pressed }) => [styles.round, pressed && { opacity: 0.7 }, style]}
        >
            <Text style={styles.roundText}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    bar: { position: "absolute", left: space(4), right: space(4), flexDirection: "row", alignItems: "center", gap: space(3) },
    middle: { flex: 1, alignItems: "center" },
    round: {
        width: 46,
        height: 46,
        borderRadius: radius.pill,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center"
    },
    roundText: { color: colors.text, fontSize: 18 }
});
