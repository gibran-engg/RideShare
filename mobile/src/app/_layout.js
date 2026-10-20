import { Platform, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../lib/session";
import { colors } from "../lib/theme";

export default function RootLayout() {
    const app = (
        <SessionProvider>
            <StatusBar style="light" />
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.bg },
                    animation: "fade"
                }}
            />
        </SessionProvider>
    );
    return (
        <SafeAreaProvider>
            {Platform.OS === "web" ? (
                // In a desktop browser, show the app at phone width in the middle of the window.
                <View style={styles.page}>
                    <View style={styles.phone}>{app}</View>
                </View>
            ) : (
                app
            )}
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.black, alignItems: "center" },
    phone: {
        flex: 1,
        width: "100%",
        maxWidth: 430,
        overflow: "hidden",
        backgroundColor: colors.bg,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: colors.border
    }
});
