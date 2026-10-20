import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MonoMap, regionAround } from "../components/MonoMap";
import { ErrorText, Sheet } from "../components/ui";
import { FALLBACK_LOCATION } from "../lib/location";
import { useSession } from "../lib/session";
import { colors, radius, space, type } from "../lib/theme";

const PROVIDER_STYLE = {
    google: { label: "Continue with Google", icon: "G" },
    // The Apple logo glyph only exists in Apple's system font.
    apple: { label: "Continue with Apple", icon: Platform.OS === "ios" ? "" : "●" },
    mock: { label: "Dev sign-in", icon: "⚙" }
};

export default function Welcome() {
    const { status, config, signIn } = useSession();
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (status === "signed-in") router.replace("/");
    }, [status]);

    // Always show Google and Apple; ones not set up on the server are disabled.
    const providers = config?.providers || [
        { id: "google", enabled: false },
        { id: "apple", enabled: false }
    ];

    async function start(provider) {
        setError(null);
        setBusy(provider);
        try {
            const result = await signIn(provider);
            if (!result.cancelled) router.replace("/");
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(null);
        }
    }

    return (
        <View style={styles.screen}>
            <MonoMap initialRegion={regionAround(FALLBACK_LOCATION, 0.08)} scrollEnabled={false} zoomEnabled={false} />
            <View style={styles.shade} pointerEvents="none" />

            <View style={styles.brand}>
                <Text style={styles.logo}>rideshare</Text>
                <Text style={styles.tagline}>Your city. Your ride.</Text>
            </View>

            <Sheet>
                <Text style={type.title}>Get moving</Text>
                <Text style={type.small}>One account to ride or drive. New here? We’ll set you up after you sign in.</Text>
                {providers.map((provider) => {
                    const look = PROVIDER_STYLE[provider.id];
                    const disabled = !provider.enabled || Boolean(busy);
                    const primary = provider.id === "google";
                    return (
                        <Pressable
                            key={provider.id}
                            accessibilityRole="button"
                            accessibilityState={{ disabled }}
                            disabled={disabled}
                            onPress={() => start(provider.id)}
                            style={({ pressed }) => [
                                styles.provider,
                                primary ? styles.providerPrimary : styles.providerSecondary,
                                disabled && styles.providerDisabled,
                                pressed && { opacity: 0.8 }
                            ]}
                        >
                            <Text style={[styles.providerIcon, primary && styles.providerTextPrimary]}>{look.icon}</Text>
                            <Text style={[styles.providerText, primary && styles.providerTextPrimary]}>
                                {busy === provider.id ? "Opening…" : look.label}
                            </Text>
                            {!provider.enabled ? <Text style={styles.soon}>not set up</Text> : null}
                        </Pressable>
                    );
                })}
                <ErrorText>{error}</ErrorText>
                <Text style={styles.legal}>By continuing you agree to RideShare’s terms and privacy policy.</Text>
            </Sheet>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    shade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
    brand: { position: "absolute", top: 90, left: space(6), right: space(6) },
    logo: { color: colors.white, fontSize: 44, fontWeight: "900", letterSpacing: -1.5 },
    tagline: { color: colors.muted, fontSize: 16, marginTop: space(1) },
    provider: {
        minHeight: 54,
        borderRadius: radius.md,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space(3)
    },
    providerPrimary: { backgroundColor: colors.white },
    providerSecondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    providerDisabled: { opacity: 0.4 },
    providerIcon: { color: colors.text, fontSize: 18, fontWeight: "900", width: 20, textAlign: "center" },
    providerText: { color: colors.text, fontSize: 16, fontWeight: "700" },
    providerTextPrimary: { color: colors.black },
    soon: { color: colors.faint, fontSize: 11, marginLeft: space(1) },
    legal: { ...type.small, fontSize: 11, textAlign: "center" }
});
