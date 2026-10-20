import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space, type } from "../lib/theme";

export function Button({ title, onPress, variant = "primary", disabled, loading, style, small }) {
    const isPrimary = variant === "primary";
    const isDanger = variant === "danger";
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            disabled={disabled || loading}
            style={({ pressed }) => [
                styles.button,
                small && styles.buttonSmall,
                isPrimary ? styles.primary : styles.secondary,
                isDanger && styles.danger,
                (disabled || loading) && styles.disabled,
                pressed && styles.pressed,
                style
            ]}
        >
            {loading ? (
                <ActivityIndicator color={isPrimary ? colors.black : colors.white} />
            ) : (
                <Text style={[styles.buttonText, small && styles.buttonTextSmall, isPrimary ? styles.primaryText : styles.secondaryText, isDanger && styles.dangerText]}>
                    {title}
                </Text>
            )}
        </Pressable>
    );
}

/** Panel pinned to the bottom of the screen, above the map. */
export function Sheet({ children, style }) {
    const insets = useSafeAreaInsets();
    return <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space(4)) }, style]}>{children}</View>;
}

export function Field({ label, hint, error, style, ...props }) {
    return (
        <View style={[styles.field, style]}>
            {label ? <Text style={styles.label}>{label}</Text> : null}
            <TextInput placeholderTextColor={colors.faint} selectionColor={colors.white} style={styles.input} {...props} />
            {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={type.small}>{hint}</Text> : null}
        </View>
    );
}

export function Choice({ title, subtitle, icon, selected, onPress, right, style }) {
    return (
        <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={onPress}
            style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed, style]}
        >
            {icon ? <Text style={styles.choiceIcon}>{icon}</Text> : null}
            <View style={styles.flex}>
                <Text style={styles.choiceTitle}>{title}</Text>
                {subtitle ? <Text style={type.small}>{subtitle}</Text> : null}
            </View>
            {right ? <Text style={styles.choiceRight}>{right}</Text> : null}
        </Pressable>
    );
}

export function ErrorText({ children }) {
    if (!children) return null;
    return <Text style={styles.error} accessibilityRole="alert">{children}</Text>;
}

export function Pill({ children, active }) {
    return (
        <View style={[styles.pill, active && styles.pillActive]}>
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{children}</Text>
        </View>
    );
}

export function Divider() {
    return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    button: {
        minHeight: 52,
        borderRadius: radius.md,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space(5)
    },
    buttonSmall: { minHeight: 38, paddingHorizontal: space(4), borderRadius: radius.sm },
    primary: { backgroundColor: colors.white },
    secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
    danger: { borderColor: colors.danger },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.8 },
    buttonText: { fontSize: 16, fontWeight: "700" },
    buttonTextSmall: { fontSize: 14 },
    primaryText: { color: colors.black },
    secondaryText: { color: colors.text },
    dangerText: { color: colors.danger },
    sheet: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.bg,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        borderTopWidth: 1,
        borderColor: colors.border,
        paddingTop: space(5),
        paddingHorizontal: space(5),
        gap: space(3)
    },
    field: { gap: space(1.5) },
    label: type.label,
    input: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        color: colors.text,
        fontSize: 16,
        paddingHorizontal: space(3.5),
        paddingVertical: space(3)
    },
    error: { color: colors.danger, fontSize: 14 },
    choice: {
        flexDirection: "row",
        alignItems: "center",
        gap: space(3),
        padding: space(3.5),
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: colors.border,
        backgroundColor: colors.surface
    },
    choiceSelected: { borderColor: colors.white, backgroundColor: colors.surface2 },
    choiceIcon: { fontSize: 26 },
    choiceTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
    choiceRight: { fontSize: 18, fontWeight: "800", color: colors.text },
    pill: {
        paddingHorizontal: space(3),
        paddingVertical: space(1.5),
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignSelf: "flex-start"
    },
    pillActive: { backgroundColor: colors.white, borderColor: colors.white },
    pillText: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
    pillTextActive: { color: colors.black },
    divider: { height: 1, backgroundColor: colors.border }
});
