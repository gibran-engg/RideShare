import { Redirect } from "expo-router";
import { DriverHome } from "../components/DriverHome";
import { RiderHome } from "../components/RiderHome";
import { useSession } from "../lib/session";

export default function Home() {
    const { status, me } = useSession();
    if (status === "signed-out") return <Redirect href="/welcome" />;
    if (!me) return null;
    if (me.next !== "ready") return <Redirect href="/onboarding" />;
    return me.user.role === "driver" ? <DriverHome /> : <RiderHome />;
}
