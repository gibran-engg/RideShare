// Browser version of token.js. SecureStore doesn't exist on the web, so the token is kept in
// sessionStorage: each tab has its own sign-in (rider in one tab, driver in another), it
// survives a reload, and closing the tab signs out. Fine for development and demos; a public
// web app would want an HttpOnly cookie instead.
const TOKEN_KEY = "rideshare.token";

export async function loadToken() {
    try {
        return window.sessionStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export async function saveToken(token) {
    try {
        window.sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
        // Storage blocked (private mode): the sign-in lasts until the page reloads.
    }
}

export async function clearToken() {
    try {
        window.sessionStorage.removeItem(TOKEN_KEY);
    } catch {
        // Nothing stored.
    }
}
