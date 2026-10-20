import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "../lib/session";
import { colors } from "../lib/theme";

/** Sends people to sign-in, onboarding or the map depending on where they are. */
export default function Gate() {
    const { status, me } = useSession();

    if (status === "loading" || (status === "signed-in" && !me)) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={colors.white} />
            </View>
        );
    }
    if (status === "signed-out") return <Redirect href="/welcome" />;
    if (me.next !== "ready") return <Redirect href="/onboarding" />;
    return <Redirect href="/home" />;
}
