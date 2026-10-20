import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../lib/api";
import { colors, radius, space, type } from "../lib/theme";

/**
 * Full-screen search for a pickup or drop point (OpenStreetMap / Nominatim via the API).
 * Calls onPick(place) or onChooseOnMap().
 */
export function PlaceSearch({ title, near, onPick, onChooseOnMap, onClose }) {
    const insets = useSafeAreaInsets();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const latest = useRef(0);
    const searching = query.trim().length >= 3;

    useEffect(() => {
        const q = query.trim();
        if (q.length < 3) return undefined;
        // Debounce: the free search service allows about one request per second.
        const timer = setTimeout(async () => {
            const id = ++latest.current;
            setLoading(true);
            try {
                const params = new URLSearchParams({ q, ...(near ? { lat: String(near.lat), lng: String(near.lng) } : {}) });
                const data = await api(`/api/places/search?${params}`);
                if (id === latest.current) {
                    setResults(data.places);
                    setError(data.places.length ? null : "No places found. Try another name, or choose on the map.");
                }
            } catch (err) {
                if (id === latest.current) setError(err.message);
            } finally {
                if (id === latest.current) setLoading(false);
            }
        }, 600);
        return () => clearTimeout(timer);
    }, [query, near]);

    return (
        <View style={[styles.screen, { paddingTop: insets.top + space(3) }]}>
            <View style={styles.header}>
                <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Back">
                    <Text style={styles.back}>←</Text>
                </Pressable>
                <Text style={type.heading}>{title}</Text>
            </View>
            <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Search a place or address"
                placeholderTextColor={colors.faint}
                selectionColor={colors.white}
                style={styles.input}
                returnKeyType="search"
            />
            <Pressable onPress={onChooseOnMap} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <Text style={styles.icon}>⌖</Text>
                <View style={styles.flex}>
                    <Text style={styles.name}>Choose on map</Text>
                    <Text style={type.small}>Move the map to put the pin on the exact spot</Text>
                </View>
            </Pressable>
            {searching && loading ? <ActivityIndicator color={colors.white} style={{ marginTop: space(4) }} /> : null}
            {searching && error ? <Text style={[type.small, styles.message]}>{error}</Text> : null}
            <FlatList
                data={searching ? results : []}
                keyboardShouldPersistTaps="handled"
                keyExtractor={(item, index) => `${item.lat},${item.lng},${index}`}
                renderItem={({ item }) => (
                    <Pressable onPress={() => onPick(item)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                        <Text style={styles.icon}>●</Text>
                        <View style={styles.flex}>
                            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                            <Text style={type.small} numberOfLines={1}>{[item.area, item.address].filter(Boolean).join(" · ")}</Text>
                        </View>
                        {item.distanceKm != null ? <Text style={type.small}>{item.distanceKm} km</Text> : null}
                    </Pressable>
                )}
            />
            <Text style={styles.credit}>Search by OpenStreetMap Nominatim</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, paddingHorizontal: space(4) },
    header: { flexDirection: "row", alignItems: "center", gap: space(3), marginBottom: space(3) },
    back: { color: colors.text, fontSize: 26 },
    input: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        color: colors.text,
        fontSize: 17,
        paddingHorizontal: space(4),
        paddingVertical: space(3.5),
        marginBottom: space(2)
    },
    row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(3.5), borderBottomWidth: 1, borderBottomColor: colors.border },
    pressed: { opacity: 0.6 },
    icon: { color: colors.text, fontSize: 16, width: 22, textAlign: "center" },
    flex: { flex: 1 },
    name: { color: colors.text, fontSize: 16, fontWeight: "600" },
    message: { marginTop: space(3) },
    credit: { ...type.small, fontSize: 10, textAlign: "center", paddingVertical: space(2) }
});
