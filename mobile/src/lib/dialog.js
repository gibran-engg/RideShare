import { Alert, Platform } from "react-native";

/**
 * Ask the user to confirm an action; resolves true if they did.
 * react-native-web's Alert does nothing, so the browser shows its own confirm dialog instead.
 */
export function confirmAction(title, message, { confirm = "OK", cancel = "Cancel", destructive = false } = {}) {
    if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    return new Promise((resolve) => {
        Alert.alert(title, message, [
            { text: cancel, style: "cancel", onPress: () => resolve(false) },
            { text: confirm, style: destructive ? "destructive" : "default", onPress: () => resolve(true) }
        ]);
    });
}
