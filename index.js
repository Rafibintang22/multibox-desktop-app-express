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

// List video dan file yang sudah didownload
let videoList = [];
let downloadedVideos = new Set();

// Fungsi scan folder downloads
function scanDownloadedVideos() {
    if (!fs.existsSync(DOWNLOAD_DIR)) return;
    const files = fs.readdirSync(DOWNLOAD_DIR);
    downloadedVideos = new Set(files);
}

// Panggil awal untuk fallback
scanDownloadedVideos();

// Start TCP client
connectToServer("localhost", 8080, (list) => {
    if (list && list.length > 0) {
        videoList = list;
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
        console.log("TCP server tidak merespon, gunakan playlist lokal");
        // fallback ke downloads
        scanDownloadedVideos();
        videoList = Array.from(downloadedVideos).map((f) => `/downloads/${f}`);
    }
});

// Set EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Render halaman video
app.get("/", (req, res) => {
    // Pastikan selalu ada playlist dari folder downloads jika kosong
    scanDownloadedVideos();
    if (videoList.length === 0) {
        videoList = Array.from(downloadedVideos).map((f) => `/downloads/${f}`);
    } else {
        // gunakan local copy jika sudah di-download
        videoList = videoList.map((url) => {
            const filename = decodeURIComponent(url.split("/").pop());
            return downloadedVideos.has(filename) ? `/downloads/${filename}` : url;
        });
    }

    res.render("video", { videoList });
});

// Serve folder downloads statically
app.use("/downloads", express.static(DOWNLOAD_DIR));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
