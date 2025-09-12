const express = require("express");
const path = require("path");
const fs = require("fs");
const { Worker } = require("worker_threads");
const { connectToServer } = require("./tcpClient");

const app = express();
const PORT = 8081;

// Folder tempat simpan video
const DOWNLOAD_DIR = path.join(__dirname, "downloads");
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

let videoList = [];
let downloadedVideos = {}; // { scheduleId: Set(files) }

// scan semua folder schedule
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

scanDownloadedVideos();

// TCP client (terima schedule dari server)
connectToServer("localhost", 9000, (schedule) => {
    if (schedule && schedule.contents && schedule.contents.length > 0) {
        // Bungkus dalam array supaya konsisten dengan worker
        videoList = [schedule];
        console.log("Received schedule:", videoList);

        // worker download
        const downloadWorker = new Worker("./worker/download.js", {
            workerData: { videoList, downloadDir: DOWNLOAD_DIR },
        });

        downloadWorker.on("message", (msg) => {
            if (msg.status === "downloaded") {
                if (!downloadedVideos[msg.scheduleId]) {
                    downloadedVideos[msg.scheduleId] = new Set();
                }
                downloadedVideos[msg.scheduleId].add(msg.filename);
                console.log(`Downloaded [Schedule ${msg.scheduleId}]: ${msg.filename}`);
            }
        });
    } else {
        console.log("TCP server tidak merespon, gunakan folder downloads lokal");
        scanDownloadedVideos();
        videoList = Object.keys(downloadedVideos).map((id) => ({
            schedule_id: id,
            contents: Array.from(downloadedVideos[id]).map((f) => ({
                title: f,
                url: `/downloads/schedule_${id}/${f}`,
            })),
        }));
    }
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.get("/", (req, res) => {
    scanDownloadedVideos();

    if (!videoList || videoList.length === 0) {
        // fallback ke local downloads
        videoList = Object.keys(downloadedVideos).map((id) => ({
            schedule_id: id,
            contents: Array.from(downloadedVideos[id]).map((f) => ({
                title: f,
                url: `/downloads/schedule_${id}/${f}`,
            })),
        }));
    } else {
        // pakai local file jika sudah didownload
        videoList = videoList.map((schedule) => {
            const sid = schedule.schedule_id.toString();
            return {
                ...schedule,
                contents: schedule.contents.map((content) => {
                    const filename = decodeURIComponent(content.title);
                    if (downloadedVideos[sid] && downloadedVideos[sid].has(filename)) {
                        return { ...content, url: `/downloads/schedule_${sid}/${filename}` };
                    }
                    return content;
                }),
            };
        });
    }

    res.render("video", { videoList });
});

// Serve folder downloads statically
app.use("/downloads", express.static(DOWNLOAD_DIR));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
