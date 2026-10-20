import express from "express";
import swaggerUi from "swagger-ui-express";
import { activity, config, db } from "@rideshare/shared";
import { errorHandler, notFound, requestContext } from "./core/errors.ts";
import { openApiDocument } from "./core/openapi.ts";
import activityRouter from "./features/activity/router.ts";
import authRouter from "./features/auth/router.ts";
import { mobileBrowserRouter, webBrowserRouter } from "./features/auth/sign-in.ts";
import driversRouter from "./features/drivers/router.ts";
import mockCheckout from "./features/payments/mock-checkout.ts";
import paymentsRouter, { webhookRouter } from "./features/payments/router.ts";
import placesRouter from "./features/places/router.ts";
import ridesRouter from "./features/rides/router.ts";
import systemRouter from "./features/system/router.ts";
import usersRouter from "./features/users/router.ts";

db.open();
activity.startRecording();

/** Version 1 of the JSON API. Also served at /api for apps built before versioning. */
const v1 = express.Router();
for (const feature of [systemRouter, authRouter, usersRouter, driversRouter, placesRouter, ridesRouter, paymentsRouter, activityRouter]) {
    v1.use(feature);
}

const app = express();
app.disable("x-powered-by");
// Behind an HTTPS tunnel, a proxy or the web app's dev server, trust X-Forwarded-* headers.
app.set("trust proxy", config.isProduction || config.urls.api.startsWith("https://") ? 1 : "loopback");

app.use(requestContext);

// Signed webhooks need the raw body, so they are mounted before the JSON parser.
app.use("/api/v1", webhookRouter);
app.use(express.json({ limit: "100kb" }));

app.get("/", (req, res) => {
    res.json({
        message: "Welcome to RideShare API",
        version: "1",
        docs: "/docs",
        openapi: "/api/v1/openapi.json",
        health: "/api/v1/health"
    });
});
app.get("/api/v1/openapi.json", (req, res) => {
    res.json(openApiDocument());
});
if (!config.isProduction) {
    app.use(
        "/docs",
        swaggerUi.serve,
        swaggerUi.setup(undefined, { swaggerOptions: { url: "/api/v1/openapi.json" }, customSiteTitle: "RideShare API" })
    );
}
app.use("/api/v1", v1);
app.use("/api", v1);

// Browser parts of sign-in (redirects to Google/Apple/dev and back to the app), and the test-mode checkout page.
app.use(mobileBrowserRouter());
app.use("/web", webBrowserRouter());
app.use(mockCheckout);

app.use(notFound);
app.use(errorHandler);

export default app;
