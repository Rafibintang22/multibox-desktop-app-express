const express = require("express");
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { Worker } = require("worker_threads");
const { connectToServer } = require("./webSocketClient");
const { saveLastSchedule, loadLastSchedule } = require("./storage");

const app = express();
const PORT = 8081;

const DOWNLOAD_DIR = path.join(__dirname, "downloads");
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

let videoList = [];
let downloadedVideos = {};
let clients = [];

function scanDownloadedVideos() {
    if (!fs.existsSync(DOWNLOAD_DIR)) return;
    const schedules = fs
        .readdirSync(DOWNLOAD_DIR, { withFileTypes: true })
        .filter((dir) => dir.isDirectory())
        .map((dir) => dir.name);

    downloadedVideos = {};
    for (const scheduleFolder of schedules) {
        const scheduleId = scheduleFolder.replace("schedule_", "");
        const files = fs.readdirSync(path.join(DOWNLOAD_DIR, scheduleFolder));
        downloadedVideos[scheduleId] = new Set(files);
    }
}

// Load last schedule dari Redis saat start
(async () => {
    const last = await loadLastSchedule();
    if (last) {
        videoList = [last];
        console.log("Last schedule loaded from Redis:", last.schedule_id);
    }
})();

function getPlaylistForClient(schedule) {
    const sid = schedule.schedule_id;
    return schedule.contents.map((c) => {
        const filename = decodeURIComponent(c.title);
        if (downloadedVideos[sid]?.has(filename)) {
            return {
                title: filename,
                url: `/downloads/schedule_${sid}/${encodeURIComponent(filename)}`,
            };
        } else {
            return { title: filename, url: c.url }; // streaming
        }
    });
}

connectToServer(
    `wss://cms.pivods.com/api/v1/device/connect?api_key=${process.env.API_KEY}`,
    async (schedule) => {
        if (schedule && schedule.contents?.length > 0) {
            videoList = [schedule];
            await saveLastSchedule(schedule);
            console.log("Schedule baru diterima & disimpan ke Redis:", schedule.schedule_id);

            // Broadcast streaming playlist
            broadcast({
                schedule_id: schedule.schedule_id,
                contents: getPlaylistForClient(schedule),
            });

            // Worker download
            const downloadWorker = new Worker("./worker/download.js", {
                workerData: { videoList, downloadDir: DOWNLOAD_DIR },
            });

            downloadWorker.on("message", (msg) => {
                if (msg.status === "downloaded") {
                    if (!downloadedVideos[msg.scheduleId])
                        downloadedVideos[msg.scheduleId] = new Set();
                    downloadedVideos[msg.scheduleId].add(msg.filename);
                    console.log(`Downloaded [Schedule ${msg.scheduleId}]: ${msg.filename}`);

                    // Broadcast update ke client supaya main dari downloads
                    const updatedSchedule = videoList[0];
                    broadcast({
                        schedule_id: updatedSchedule.schedule_id,
                        contents: getPlaylistForClient(updatedSchedule),
                    });
                }
            });
        } else {
            console.log("Tidak ada schedule dari server, fallback ke local downloads");
            scanDownloadedVideos();
            videoList = Object.keys(downloadedVideos).map((id) => ({
                schedule_id: id,
                contents: Array.from(downloadedVideos[id]).map((f) => ({
                    title: f,
                    url: `/downloads/schedule_${id}/${encodeURIComponent(f)}`,
                })),
            }));
            broadcast(videoList[0] || { schedule_id: 0, contents: [] });
        }
    }
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.get("/", (req, res) => {
    scanDownloadedVideos();

    if (!videoList || videoList.length === 0) {
        videoList = Object.keys(downloadedVideos).map((id) => ({
            schedule_id: id,
            contents: Array.from(downloadedVideos[id]).map((f) => ({
                title: f,
                url: `/downloads/schedule_${id}/${f}`,
            })),
        }));
    } else {
        videoList = videoList.map((schedule) => {
            const sid = schedule.schedule_id.toString();
            return {
                ...schedule,
                contents: schedule.contents.map((content) => {
                    const filename = decodeURIComponent(content.title);
                    if (downloadedVideos[sid] && downloadedVideos[sid].has(filename)) {
                        return {
                            ...content,
                            url: `/downloads/schedule_${sid}/${encodeURIComponent(filename)}`,
                        };
                    }
                    return content;
                }),
            };
        });
    }

    res.render("video", { videoList });
});

// SSE untuk update playlist live
app.get("/events", (req, res) => {
    res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
    });
    res.flushHeaders();

    clients.push(res);

    req.on("close", () => {
        clients = clients.filter((c) => c !== res);
    });
});

function broadcast(schedule) {
    const data = `data: ${JSON.stringify(schedule)}\n\n`;
    clients.forEach((c) => c.write(data));
}

app.use("/downloads", express.static(DOWNLOAD_DIR));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
