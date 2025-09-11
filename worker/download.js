const { workerData, parentPort } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const http = require("http"); // pakai http untuk URL http
const https = require("https");

const { videoList, downloadDir } = workerData;

function downloadVideo(url) {
    return new Promise((resolve, reject) => {
        const filename = path.basename(decodeURIComponent(url)); // decode %20
        const filepath = path.join(downloadDir, filename);

        if (fs.existsSync(filepath)) return resolve(filename);

        const file = fs.createWriteStream(filepath);
        const client = url.startsWith("https") ? https : http;

        client
            .get(url, (res) => {
                if (res.statusCode !== 200) {
                    fs.unlink(filepath, () => {});
                    return reject(new Error(`Failed to get '${url}' (${res.statusCode})`));
                }

                res.pipe(file);
                file.on("finish", () => {
                    file.close(() => {
                        parentPort.postMessage({ status: "downloaded", filename });
                        resolve(filename);
                    });
                });
            })
            .on("error", (err) => {
                fs.unlink(filepath, () => {});
                reject(err);
            });
    });
}

// Download semua video secara paralel
async function startDownload() {
    try {
        const promises = videoList.map((url) => downloadVideo(url));
        await Promise.all(promises);
        console.log("All videos downloaded!");
    } catch (err) {
        console.error("Error downloading videos:", err);
    }
}

startDownload();
