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

// List video dari VPS
let videoList = [];
let downloadedVideos = new Set();

// Fungsi helper untuk scan folder downloads
function scanDownloadedVideos() {
    const files = fs.readdirSync(DOWNLOAD_DIR);
    downloadedVideos = new Set(files);
}

// Panggil saat awal agar ada fallback
scanDownloadedVideos();

// Start TCP client untuk menerima list video
connectToServer("localhost", 8080, (list) => {
    if (list && list.length > 0) {
        videoList = list; // update playlist baru
        console.log("Received video list:", videoList);

        // Mulai worker download
        const downloadWorker = new Worker("./worker/download.js", {
            workerData: { videoList, downloadDir: DOWNLOAD_DIR },
        });

        downloadWorker.on("message", (msg) => {
            if (msg.status === "downloaded") {
                downloadedVideos.add(msg.filename);
                console.log("Downloaded:", msg.filename);
            }
        });
    } else {
        console.log("TCP server tidak merespon, menggunakan playlist lokal");
    }
});

// Serve video page
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.get("/", (req, res) => {
    res.render("video", {
        videoList,
        downloadedVideos,
        downloadDir: "/downloads",
    });
});

// Serve folder downloads statically
app.use("/downloads", express.static(DOWNLOAD_DIR));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
