import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button, ErrorText } from "../components/ui";
import { useSession } from "../lib/session";
import { colors, space, type } from "../lib/theme";

// Browser sign-in ends here: the backend's /web/auth flow redirects to /signed-in?code=...
// (or ?error=...). Phones finish sign-in in session.js and never open this screen.
export default function SignedIn() {
    const { code, error: failure } = useLocalSearchParams();
    const { status, completeSignIn } = useSession();
    const [error, setError] = useState(null);
    const started = useRef(false);
    const problem = failure ? String(failure) : !code ? "Sign-in didn't complete. Please try again." : null;

    useEffect(() => {
        // Wait for the saved session to load so it can't overwrite the new one.
        if (problem || status === "loading" || started.current) return;
        started.current = true;
        completeSignIn(String(code))
            .then(() => router.replace("/"))
            .catch((err) => setError(err.message));
    }, [problem, status, code, completeSignIn]);

    const message = problem || error;
    return (
        <View style={styles.screen}>
            {message ? (
                <View style={styles.box}>
                    <Text style={type.title}>Sign-in failed</Text>
                    <ErrorText>{message}</ErrorText>
                    <Button title="Back to sign-in" onPress={() => router.replace("/welcome")} />
                </View>
            ) : (
                <ActivityIndicator color={colors.white} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: space(5) },
    box: { alignSelf: "stretch", gap: space(3) }
});
