import { Redirect } from "expo-router";

// The sign-in browser returns to rideshare://auth. The session code handles the result;
// if the router also opens this route, just go back to the start.
export default function AuthReturn() {
    return <Redirect href="/" />;
}
