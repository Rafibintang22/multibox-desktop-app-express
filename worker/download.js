const { workerData, parentPort } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const { videoList, downloadDir } = workerData;

// 🔽 Download file dari URL
async function downloadContent(scheduleId, content) {
    return new Promise((resolve, reject) => {
        const scheduleDir = path.join(downloadDir, `schedule_${scheduleId}`);
        if (!fs.existsSync(scheduleDir)) fs.mkdirSync(scheduleDir, { recursive: true });

        const filename = decodeURIComponent(content.title);
        const filepath = path.join(scheduleDir, filename);

        if (fs.existsSync(filepath)) return resolve({ scheduleId, filename });

        const file = fs.createWriteStream(filepath);
        const client = content.url.startsWith("https") ? https : http;

        client
            .get(content.url, (res) => {
                if (res.statusCode !== 200) {
                    fs.unlink(filepath, () => {});
                    return reject(new Error(`Request Failed: ${res.statusCode}`));
                }
                res.pipe(file);
                file.on("finish", () => {
                    file.close(() => {
                        parentPort.postMessage({ status: "downloaded", scheduleId, filename });
                        resolve({ scheduleId, filename });
                    });
                });
            })
            .on("error", (err) => {
                fs.unlink(filepath, () => {});
                reject(err);
            });
    });
}

// 🚀 Jalankan download semua konten
async function startDownload() {
    for (const schedule of videoList) {
        for (const content of schedule.contents) {
            try {
                await downloadContent(schedule.schedule_id, content);
            } catch (err) {
                console.error("Download failed:", err.message);
            }
        }
    }
}

startDownload();
