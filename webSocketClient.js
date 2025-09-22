const WebSocket = require("ws");

function connectToServer(url, onSchedule) {
    const ws = new WebSocket(url);

    ws.on("open", () => {
        console.log(`Connected to WebSocket server at ${url}`);
    });

    ws.on("message", (message) => {
        try {
            const schedule = JSON.parse(message.toString());
            console.log("Received schedule:", schedule);
            onSchedule(schedule);
        } catch (err) {
            console.error("Failed to parse schedule:", err);
        }
    });

    ws.on("close", () => {
        console.log("WebSocket connection closed, trying to reconnect in 5s");
        setTimeout(() => connectToServer(url, onSchedule), 5000);
    });

    ws.on("error", (err) => {
        console.error("WebSocket Error:", err.message);
        ws.close();
    });

    // optional: log kalau server kirim ping (jarang terjadi, biasanya auto dibalas oleh ws lib)
    ws.on("ping", () => {
        console.log("📡 received PING from server, sending PONG from");
    });

    ws.on("pong", () => {
        console.log("📨 received PONG from server");
    });
}

module.exports = { connectToServer };
