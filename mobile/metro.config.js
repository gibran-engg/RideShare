// https://docs.expo.dev/guides/customizing-metro/
const http = require("node:http");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// In the browser the app calls its own origin. Forward the API and the backend's web sign-in
// pages (/web/auth/*) to the RideShare API, like the dev proxy the backend expects for web.
// Phones talk to the API directly, so this never affects them.
const API = { host: "127.0.0.1", port: Number(process.env.API_PORT) || 3000 };
const FORWARDED = /^\/(api|web)(\/|\?|$)/;

config.server.enhanceMiddleware = (metroMiddleware) => (req, res, next) => {
    if (!FORWARDED.test(req.url)) return metroMiddleware(req, res, next);

    const upstream = http.request(
        {
            ...API,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, "x-forwarded-for": req.socket.remoteAddress, "x-forwarded-proto": "http" }
        },
        (response) => {
            res.writeHead(response.statusCode, response.headers);
            response.pipe(res);
        }
    );
    upstream.on("error", () => {
        if (res.headersSent) return res.destroy();
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Can't reach the RideShare API on port ${API.port}. Is "npm run dev" running?` }));
    });
    req.pipe(upstream);
};

module.exports = config;
