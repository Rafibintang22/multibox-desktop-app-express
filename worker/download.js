const { workerData, parentPort } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { pipeline } = require("stream");
const { promisify } = require("util");

const streamPipeline = promisify(pipeline);
const { videoList, downloadDir } = workerData;

async function downloadContent(scheduleId, content) {
    return new Promise((resolve, reject) => {
        const scheduleDir = path.join(downloadDir, `schedule_${scheduleId}`);
        if (!fs.existsSync(scheduleDir)) fs.mkdirSync(scheduleDir, { recursive: true });

        const filename = decodeURIComponent(content.title);
        const filepath = path.join(scheduleDir, filename);

        if (fs.existsSync(filepath)) {
            console.log(`✅ Already exists: ${filename}`);
            return resolve({ scheduleId, filename });
        }

        console.log(`⬇️ Start downloading [${scheduleId}] ${filename} from ${content.url}`);

        const file = fs.createWriteStream(filepath);
        const client = content.url.startsWith("https") ? https : http;

        const options = new URL(content.url);
        options.headers = {
            "User-Agent": "NodeDownloader",
            Accept: "*/*",
        };

        const req = client.get(options, (res) => {
            if (res.statusCode !== 200) {
                fs.unlink(filepath, () => {});
                return reject(new Error(`Request Failed: ${res.statusCode}`));
            }

            streamPipeline(res, file)
                .then(() => {
                    parentPort.postMessage({ status: "downloaded", scheduleId, filename });
                    resolve({ scheduleId, filename });
                })
                .catch((err) => {
                    fs.unlink(filepath, () => {});
                    reject(err);
                });
        });

        req.on("error", (err) => {
            fs.unlink(filepath, () => {});
            reject(err);
        });
    });
}

async function startDownload() {
    for (const schedule of videoList) {
        for (const content of schedule.contents) {
            try {
                await downloadContent(schedule.schedule_id, content);
            } catch (err) {
                console.error("❌ Download failed:", err.message);
                parentPort.postMessage({
                    status: "error",
                    scheduleId: schedule.schedule_id,
                    error: err.message,
                });
            }
        }
    }
}

startDownload();
