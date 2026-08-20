// ai-bridge/youtubeUpload.js -- upload an mp4 to YouTube via the Data API v3 RESUMABLE upload. Two steps: initiate
// (POST the snippet+status metadata, read the upload URL from the Location header), then PUT the file bytes to that
// URL. It reuses SweK's existing Google OAuth: getToken() mints an access token carrying every consented scope, so
// once youtube.upload is consented the same token source works. The real HTTP is rig-only (needs a Cloud project +
// the youtube.upload scope + upload quota); the request construction + metadata payload are verified here.
"use strict";
const fs = require("fs");
const UPLOAD_INIT = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const YT_SCOPE = "https://www.googleapis.com/auth/youtube.upload";

function buildMetadata(meta = {}) {
    return {
        snippet: { title: String(meta.title || "SweK Engine").slice(0, 100), description: String(meta.description || "").slice(0, 5000), tags: Array.isArray(meta.tags) ? meta.tags.slice(0, 30) : [], categoryId: meta.categoryId || "28" },   // 28 = Science & Technology
        status: { privacyStatus: ["public", "unlisted", "private"].includes(meta.privacyStatus) ? meta.privacyStatus : "private", selfDeclaredMadeForKids: false, embeddable: true }
    };
}
async function uploadVideo({ accessToken, filePath, meta = {}, fetchImpl } = {}) {
    const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null); if (!f) throw new Error("no fetch");
    if (!accessToken) throw new Error("no access token -- authorize Google with the youtube.upload scope first");
    if (!fs.existsSync(filePath)) throw new Error("file not found: " + filePath);
    const bytes = fs.statSync(filePath).size, body = buildMetadata(meta);
    const init = await f(UPLOAD_INIT, { method: "POST", headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(bytes), "X-Upload-Content-Type": "video/mp4" }, body: JSON.stringify(body) });
    if (!init.ok) throw new Error("upload init failed: HTTP " + init.status + " " + (await init.text().catch(() => "")).slice(0, 200));
    const uploadUrl = init.headers.get("location"); if (!uploadUrl) throw new Error("no resumable upload URL returned");
    const put = await f(uploadUrl, { method: "PUT", headers: { Authorization: "Bearer " + accessToken, "Content-Type": "video/mp4", "Content-Length": String(bytes) }, body: fs.createReadStream(filePath), duplex: "half" });
    const j = await put.json().catch(() => ({}));
    if (!put.ok || !j.id) throw new Error("upload failed: HTTP " + put.status + " " + JSON.stringify(j).slice(0, 200));
    return { ok: true, videoId: j.id, url: "https://youtu.be/" + j.id, watch: "https://www.youtube.com/watch?v=" + j.id, privacyStatus: (j.status && j.status.privacyStatus) || body.status.privacyStatus };
}
module.exports = { uploadVideo, buildMetadata, UPLOAD_INIT, YT_SCOPE };
