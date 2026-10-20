import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Choice, ErrorText, Field, Pill } from "../components/ui";
import { api } from "../lib/api";
import { useLiveUpdates } from "../lib/live";
import { useSession } from "../lib/session";
import { colors, radius, space, type, VEHICLE_ICONS } from "../lib/theme";

const STEPS = { profile: 1, verify: 2, driver: 3, rejected: 3, pending: 4 };

export default function Onboarding() {
    const { status, me, refresh, setMe, signOut } = useSession();
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        if (status === "signed-out") router.replace("/welcome");
        else if (me && me.next === "ready") router.replace("/home");
    }, [status, me]);

    // While waiting for review, an admin's approval refreshes this screen.
    useLiveUpdates(() => refresh().catch(() => {}), me?.next === "pending" || me?.next === "rejected");

    if (!me) return null;
    const step = editing && me.next === "rejected" ? "driver" : me.next;
    const isDriver = me.user.role === "driver";

    return (
        <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <View style={styles.topRow}>
                        <Text style={type.label}>
                            Step {STEPS[step] || 1} of {isDriver || step === "profile" ? 4 : 2}
                        </Text>
                        <Pressable onPress={signOut} hitSlop={10}>
                            <Text style={type.small}>Sign out</Text>
                        </Pressable>
                    </View>

                    {step === "profile" && <ProfileStep me={me} onDone={setMe} />}
                    {step === "verify" && <VerifyStep me={me} onDone={setMe} onBack={() => setMe({ ...me, next: "profile" })} />}
                    {step === "driver" && <DriverStep me={me} onDone={(data) => { setEditing(false); setMe(data); }} />}
                    {(step === "pending" || step === "rejected") && (
                        <ReviewStep me={me} onFix={() => setEditing(true)} />
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function useSubmit() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    async function run(fn) {
        setBusy(true);
        setError(null);
        try {
            await fn();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }
    return { busy, error, run };
}

function ProfileStep({ me, onDone }) {
    const [role, setRole] = useState(me.user.role || null);
    const [name, setName] = useState(me.user.name || "");
    const [phone, setPhone] = useState(me.user.phone ? me.user.phone.replace(/^\+91/, "") : "");
    const { busy, error, run } = useSubmit();
    const roleLocked = Boolean(me.user.role);

    return (
        <View style={styles.stack}>
            <Text style={type.title}>Welcome{me.user.name ? `, ${me.user.name.split(" ")[0]}` : ""}</Text>
            <Text style={type.small}>Signed in as {me.user.email}</Text>

            <Text style={[type.label, styles.section]}>How will you use RideShare?</Text>
            <Choice icon="🧍" title="I want to ride" subtitle="Book bikes, autos and cabs" selected={role === "rider"} onPress={() => !roleLocked && setRole("rider")} />
            <Choice icon="🚗" title="I want to drive" subtitle="Earn with your vehicle. Needs licence and RC." selected={role === "driver"} onPress={() => !roleLocked && setRole("driver")} />

            <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
            <Field
                label="Mobile number"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder="98765 43210"
                hint="We'll text you a code. Indian numbers get +91 automatically."
            />
            <ErrorText>{error}</ErrorText>
            <Button
                title="Continue"
                loading={busy}
                disabled={!role}
                onPress={() => run(async () => onDone(await api("/api/onboarding/profile", { method: "POST", body: { role, name, phone } })))}
            />
        </View>
    );
}

function VerifyStep({ me, onDone, onBack }) {
    const [code, setCode] = useState("");
    const { busy, error, run } = useSubmit();
    const [info, setInfo] = useState(null);

    return (
        <View style={styles.stack}>
            <Text style={type.title}>Verify your phone</Text>
            <Text style={type.small}>
                Enter the 6-digit code sent to {me.user.phone}.{" "}
                <Text style={styles.link} onPress={onBack}>Wrong number?</Text>
            </Text>
            {me.devSms ? <Text style={styles.dev}>Dev mode, SMS not really sent: “{me.devSms}”</Text> : null}
            <Field
                value={code}
                onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                placeholder="••••••"
                style={styles.codeField}
            />
            <ErrorText>{error}</ErrorText>
            {info ? <Text style={type.small}>{info}</Text> : null}
            <Button
                title="Verify"
                loading={busy}
                disabled={code.length !== 6}
                onPress={() => run(async () => onDone(await api("/api/onboarding/verify", { method: "POST", body: { code } })))}
            />
            <Button
                title="Send a new code"
                variant="secondary"
                onPress={() => run(async () => {
                    onDone(await api("/api/onboarding/resend", { method: "POST" }));
                    setInfo("New code sent.");
                })}
            />
        </View>
    );
}

async function pickDocument(fromCamera) {
    const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
        Alert.alert("Permission needed", fromCamera ? "Allow camera access to photograph your document." : "Allow photo access to choose your document.");
        return null;
    }
    const options = {
        mediaTypes: ["images"],
        quality: 0.7,
        // Ask iOS for JPEG instead of HEIC so admins can view it in a browser.
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible
    };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    const mimeType = asset.mimeType === "image/png" ? "image/png" : "image/jpeg";
    return { uri: asset.uri, name: asset.fileName || `document.${mimeType === "image/png" ? "png" : "jpg"}`, type: mimeType };
}

function DocumentPicker({ label, value, onChange, alreadyUploaded }) {
    function choose() {
        Alert.alert(label, "Add a clear photo of the whole document.", [
            { text: "Take photo", onPress: async () => onChange((await pickDocument(true)) || value) },
            { text: "Choose from library", onPress: async () => onChange((await pickDocument(false)) || value) },
            { text: "Cancel", style: "cancel" }
        ]);
    }
    return (
        <Pressable onPress={choose} style={({ pressed }) => [styles.doc, value && styles.docDone, pressed && { opacity: 0.8 }]}>
            <Text style={styles.docTitle}>{label}</Text>
            <Text style={type.small}>{value ? `✓ ${value.name}` : alreadyUploaded ? "Uploaded. Tap to replace." : "Tap to add a photo"}</Text>
        </Pressable>
    );
}

function DriverStep({ me, onDone }) {
    const existing = me.driver;
    const [values, setValues] = useState({
        licenseNumber: existing?.licenseNumber || "",
        vehicleType: existing?.vehicle.type || null,
        vehicleMake: existing?.vehicle.make || "",
        vehicleModel: existing?.vehicle.model || "",
        vehiclePlate: existing?.vehicle.plate || "",
        vehicleColor: existing?.vehicle.color || ""
    });
    const [licenseDoc, setLicenseDoc] = useState(null);
    const [rcDoc, setRcDoc] = useState(null);
    const { busy, error, run } = useSubmit();
    const set = (key) => (value) => setValues((current) => ({ ...current, [key]: value }));
    const ready = values.vehicleType && (licenseDoc || existing) && (rcDoc || existing);

    function submit() {
        run(async () => {
            const form = new FormData();
            Object.entries(values).forEach(([key, value]) => form.append(key, value || ""));
            if (licenseDoc) form.append("licenseDoc", licenseDoc);
            if (rcDoc) form.append("rcDoc", rcDoc);
            onDone(await api("/api/onboarding/driver", { method: "POST", form }));
        });
    }

    return (
        <View style={styles.stack}>
            <Text style={type.title}>Licence & vehicle</Text>
            <Text style={type.small}>An admin checks these before you can take rides. Usually within a day.</Text>
            {existing?.rejectionReason ? <Text style={styles.warning}>Needs changes: {existing.rejectionReason}</Text> : null}

            <Field label="Driving licence number" value={values.licenseNumber} onChangeText={set("licenseNumber")} autoCapitalize="characters" placeholder="MH02 20190012345" />

            <Text style={[type.label, styles.section]}>Vehicle type</Text>
            <View style={styles.row}>
                {["bike", "auto", "car"].map((vehicle) => (
                    <Choice
                        key={vehicle}
                        style={styles.flex}
                        icon={VEHICLE_ICONS[vehicle]}
                        title={vehicle[0].toUpperCase() + vehicle.slice(1)}
                        selected={values.vehicleType === vehicle}
                        onPress={() => set("vehicleType")(vehicle)}
                    />
                ))}
            </View>

            <View style={styles.row}>
                <Field style={styles.flex} label="Make" value={values.vehicleMake} onChangeText={set("vehicleMake")} placeholder="Maruti" />
                <Field style={styles.flex} label="Model" value={values.vehicleModel} onChangeText={set("vehicleModel")} placeholder="Dzire" />
            </View>
            <View style={styles.row}>
                <Field style={styles.flex} label="Registration" value={values.vehiclePlate} onChangeText={set("vehiclePlate")} autoCapitalize="characters" placeholder="MH 02 AB 1234" />
                <Field style={styles.flex} label="Colour" value={values.vehicleColor} onChangeText={set("vehicleColor")} placeholder="White" />
            </View>

            <DocumentPicker label="Driving licence" value={licenseDoc} onChange={setLicenseDoc} alreadyUploaded={Boolean(existing)} />
            <DocumentPicker label="Vehicle RC" value={rcDoc} onChange={setRcDoc} alreadyUploaded={Boolean(existing)} />

            <ErrorText>{error}</ErrorText>
            <Button title="Submit for review" loading={busy} disabled={!ready} onPress={submit} />
        </View>
    );
}

function ReviewStep({ me, onFix }) {
    const driver = me.driver;
    const rejected = me.next === "rejected";
    return (
        <View style={styles.stack}>
            <Pill active={!rejected}>{rejected ? "Changes needed" : "In review"}</Pill>
            <Text style={type.title}>{rejected ? "Your documents need changes" : "We’re checking your documents"}</Text>
            {rejected ? (
                <Text style={styles.warning}>{driver.rejectionReason}</Text>
            ) : (
                <Text style={type.small}>You’ll get an SMS, and this screen will update by itself once you’re approved.</Text>
            )}
            <View style={styles.card}>
                <Text style={type.body}>{VEHICLE_ICONS[driver.vehicle.type]}  {[driver.vehicle.color, driver.vehicle.make, driver.vehicle.model].filter(Boolean).join(" ")}</Text>
                <Text style={styles.mono}>{driver.vehicle.plate}</Text>
                <Text style={type.small}>Licence {driver.licenseNumber}</Text>
            </View>
            <Button title={rejected ? "Fix and resubmit" : "Edit submission"} variant={rejected ? "primary" : "secondary"} onPress={onFix} />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space(5), paddingBottom: space(10) },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space(6) },
    stack: { gap: space(3.5) },
    section: { marginTop: space(2) },
    row: { flexDirection: "row", gap: space(2.5) },
    flex: { flex: 1 },
    link: { color: colors.text, textDecorationLine: "underline" },
    dev: { color: colors.muted, backgroundColor: colors.surface, borderRadius: radius.sm, padding: space(3), fontSize: 13 },
    codeField: { marginTop: space(2) },
    warning: { color: colors.text, backgroundColor: colors.surface2, borderLeftWidth: 3, borderLeftColor: colors.danger, padding: space(3), borderRadius: radius.sm },
    doc: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.md, padding: space(4), gap: space(1) },
    docDone: { borderStyle: "solid", borderColor: colors.white },
    docTitle: { ...type.body, fontWeight: "700" },
    card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space(4), gap: space(1.5), borderWidth: 1, borderColor: colors.border },
    mono: { color: colors.text, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 16, letterSpacing: 1 }
});
