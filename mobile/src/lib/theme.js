// Dark monochrome palette: black, greys and white only.
export const colors = {
    bg: "#0B0B0B",
    surface: "#151515",
    surface2: "#1F1F1F",
    border: "#2C2C2C",
    text: "#F5F5F5",
    muted: "#8C8C8C",
    faint: "#5A5A5A",
    white: "#FFFFFF",
    black: "#000000",
    danger: "#FF6B6B"
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

export const space = (n) => n * 4;

export const type = {
    title: { fontSize: 26, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
    heading: { fontSize: 18, fontWeight: "700", color: colors.text },
    body: { fontSize: 15, color: colors.text },
    small: { fontSize: 13, color: colors.muted },
    label: { fontSize: 12, fontWeight: "700", color: colors.muted, letterSpacing: 1, textTransform: "uppercase" }
};

export function money(amount) {
    return `₹${Math.round(amount || 0).toLocaleString("en-IN")}`;
}

export const VEHICLE_ICONS = { bike: "🏍", auto: "🛺", car: "🚗" };
