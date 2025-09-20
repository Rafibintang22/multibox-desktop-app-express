const { createClient } = require("redis");

const client = createClient({
    url: process.env.REDIS_URL,
});

client.on("error", (err) => console.error("Redis Client Error", err));

async function connectRedis() {
    if (!client.isOpen) {
        await client.connect();
    }
}

// Simpan schedule terakhir
async function saveLastSchedule(schedule) {
    await connectRedis();
    await client.set("lastSchedule", JSON.stringify(schedule));
}

// Ambil schedule terakhir
async function loadLastSchedule() {
    await connectRedis();
    const data = await client.get("lastSchedule");
    return data ? JSON.parse(data) : null;
}

module.exports = { saveLastSchedule, loadLastSchedule, connectRedis };
