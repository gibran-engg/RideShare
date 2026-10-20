import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../lib/session";
import { colors } from "../lib/theme";

export default function RootLayout() {
    return (
        <SafeAreaProvider>
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
        </SafeAreaProvider>
    );
}
