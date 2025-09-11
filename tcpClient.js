const net = require("net");

function connectToServer(host, port, onSchedule) {
    const client = new net.Socket();

    client.connect(port, host, () => {
        console.log(`Connected to TCP server at ${host}:${port}`);
    });

    client.on("data", (data) => {
        try {
            const schedule = JSON.parse(data.toString());
            console.log("Received video list:", schedule);
            onSchedule(schedule);
        } catch (err) {
            console.error("Failed to parse video list:", err);
        }
    });

    client.on("close", () => console.log("TCP connection closed"));
    client.on("error", (err) => console.error("TCP Error:", err));
}

module.exports = { connectToServer };
