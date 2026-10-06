const http = require("http");

const server = http.createServer((req, res) => {

    // GET /
    if (req.url === "/" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Welcome to Ride-Sharing!");
    }

    // GET /rides
    else if (req.url === "/rides" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Here are the rides.");
    }

    // POST /rides
    else if (req.url === "/rides" && req.method === "POST") {

        let body = "";

        // Receive request body
        req.on("data", (chunk) => {
            body += chunk;
        });

        // Body completely received
        req.on("end", () => {

            const ride = JSON.parse(body);

            console.log("Pickup:", ride.pickup);
            console.log("Destination:", ride.destination);

            const response = {
                message: "Ride created successfully",
                pickup: ride.pickup,
                destination: ride.destination
            };

            res.writeHead(201, {
                "Content-Type": "application/json"
            });

            res.end(JSON.stringify(response));
        });
    }

    // Everything else
    else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Route not found");
    }

});

server.listen(3000, () => {
    console.log("Ride-Sharing server running on http://localhost:3000");
});