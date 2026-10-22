import { z } from "zod";
import * as auth from "../../../../services/auth/oidc.ts";
import config from "../../../../lib/config.ts";
import * as db from "../../../../db/index.ts";
import * as fare from "../../../../services/rides/fare.ts";
import * as rides from "../../../../services/rides/service.ts";
import { createModule } from "../../core/route.ts";

/** Public endpoints: health check and the settings the apps need before sign-in. */
const { router, add } = createModule();
const tags = ["Meta"];

add(
    {
        method: "get",
        path: "/health",
        summary: "Liveness and database check",
        tags,
        auth: false,
        response: z.object({
            status: z.enum(["ok", "degraded"]),
            service: z.string(),
            database: z.string(),
            schemaVersion: z.number().nullable()
        })
    },
    (input, req, res) => {
        let schemaVersion: number | null = null;
        try {
            schemaVersion = db.schemaVersion();
        } catch {
            res.status(503);
            return { status: "degraded", service: "rideshare-api", database: "unavailable", schemaVersion };
        }
        return { status: "ok", service: "rideshare-api", database: "ok", schemaVersion };
    }
);

add(
    {
        method: "get",
        path: "/config",
        summary: "Public settings the apps need before sign-in",
        tags,
        auth: false,
        response: z.object({
            providers: z.array(z.object({ id: z.string(), label: z.string(), enabled: z.boolean() })),
            vehicles: z.array(z.object({ type: z.string(), label: z.string(), seats: z.number() })),
            paymentMethods: z.array(z.string()),
            matchRadiusKm: z.number(),
            map: z.object({ configured: z.boolean(), styleUrl: z.string().nullable(), tileUrl: z.string(), attribution: z.string() })
        })
    },
    () => ({
        providers: auth.providerList(),
        vehicles: fare.VEHICLE_TYPES.map((type) => ({ type, label: fare.RATE_CARD[type].label, seats: fare.RATE_CARD[type].seats })),
        paymentMethods: ["cash", "card", "upi"],
        matchRadiusKm: rides.MATCH_RADIUS_KM,
        // Vector style for MapLibre (web); raster tiles for react-native-maps (phone).
        map: {
            configured: config.map.configured,
            styleUrl: config.map.styleUrl,
            tileUrl: config.map.tileUrl,
            attribution: config.map.attribution
        }
    })
);

export default router;
