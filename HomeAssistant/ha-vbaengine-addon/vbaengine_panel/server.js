// FILE: vbaengine_panel/server.js
// Minimal static file server for the ingress panel. HA ingress proxies
// requests to http://<container>:INGRESS_PORT/ and strips the ingress prefix,
// so the container just sees normal paths. The served HTML MUST use RELATIVE
// asset paths (./main.js, not /main.js) — absolute paths break under the
// dynamic /api/hassio_ingress/<token>/ base. See www/index.html.
"use strict";
const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT = parseInt(process.env.INGRESS_PORT || "8099", 10);
const ROOT = path.join(__dirname, "www");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript",
  ".mjs":  "text/javascript",
  ".css":  "text/css",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".wasm": "application/wasm",
  ".glb":  "model/gltf-binary",
  ".bin":  "application/octet-stream",
};

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/" || u === "") u = "/index.html";
  const fp = path.normalize(path.join(ROOT, u));
  // prevent path traversal outside ROOT
  if (fp !== ROOT && !fp.startsWith(ROOT + path.sep)) {
    res.writeHead(403); return res.end("forbidden");
  }
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(fp).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(buf);
  });
});

server.listen(PORT, () =>
  console.log(`[vbaengine_panel] ingress static server listening on :${PORT}`));
