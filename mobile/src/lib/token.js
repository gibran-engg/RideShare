import * as SecureStore from "expo-secure-store";

// The app's sign-in token, kept in the iOS Keychain / Android Keystore.
// The browser uses token.web.js instead of this file.
const TOKEN_KEY = "rideshare.token";

export function loadToken() {
    return SecureStore.getItemAsync(TOKEN_KEY);
}

export function saveToken(token) {
    return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function clearToken() {
    return SecureStore.deleteItemAsync(TOKEN_KEY);
}
