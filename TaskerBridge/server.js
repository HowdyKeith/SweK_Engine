// =============================================================================
// TaskerBridge — a single-purpose web server + control panel.
//
// It serves ONE panel and dispatches its button presses to ONE set of backends.
// This instance fires Tasker (Android) tasks; clone the folder and swap
// config.json to make a slim panel for anything else (e.g. an Excel/VBA
// interface that POSTs to your smart transmitter).
//
// Core backends (autoremote / tasker_http / ha) use Node's built-in fetch — NO
// npm install needed. The mqtt backend is optional: `npm i mqtt` to enable it.
//
//   node server.js          # reads config.json, or config.example.json as a fallback
// =============================================================================

const http = require("http");
const fs   = require("fs");
const fsp  = require("fs/promises");
const path = require("path");

const ROOT        = __dirname;
const PUBLIC      = path.join(ROOT, "public");
const CONFIG_PATH = path.join(ROOT, "config.json");

function loadConfig() {
  const p = fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : path.join(ROOT, "config.example.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
let config = loadConfig();

const MIME = {
  ".html":"text/html; charset=utf-8", ".css":"text/css", ".js":"text/javascript",
  ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png", ".ico":"image/x-icon",
};

// ---- backend dispatch -------------------------------------------------------
async function dispatch(task) {
  switch (task.backend) {
    case "autoremote":  return triggerAutoRemote(task);
    case "tasker_http": return triggerTaskerHttp(task);
    case "ha":          return triggerHA(task);
    case "mqtt":        return triggerMqtt(task);
    default: throw new Error("unknown backend: " + task.backend);
  }
}

// AutoRemote (joaomgcd cloud): a GET to the sendmessage endpoint triggers the
// matching AutoRemote profile in Tasker. Works from anywhere.
async function triggerAutoRemote(task) {
  const key = config.backends?.autoremote?.key;
  if (!key) throw new Error("set config.backends.autoremote.key (your AutoRemote key)");
  const url = "https://autoremotejoaomgcd.appspot.com/sendmessage?key="
    + encodeURIComponent(key) + "&message=" + encodeURIComponent(task.message || task.id);
  const r = await fetch(url);
  return { via: "autoremote", status: r.status, message: task.message || task.id };
}

// Direct LAN: POST/GET to the phone's own Tasker HTTP Request server (Tasker 6.2+).
async function triggerTaskerHttp(task) {
  const base = config.backends?.tasker_http?.baseUrl;
  if (!base) throw new Error("set config.backends.tasker_http.baseUrl (e.g. http://192.168.11.50:1821)");
  const url = base.replace(/\/+$/, "") + (task.path || "/");
  const method = (task.method || "POST").toUpperCase();
  const opts = { method };
  if (method !== "GET" && task.body != null) {
    opts.body = typeof task.body === "string" ? task.body : JSON.stringify(task.body);
    opts.headers = { "Content-Type": typeof task.body === "string" ? "text/plain" : "application/json" };
  }
  const r = await fetch(url, opts);
  return { via: "tasker_http", status: r.status, url };
}

// Home Assistant service call (pairs with the TaskerHA HACS integration, which
// exposes tasker.perform_task etc.). Ties Tasker into your HA add-on.
async function triggerHA(task) {
  const ha = config.backends?.ha || {};
  if (!ha.baseUrl || !ha.token) throw new Error("set config.backends.ha.baseUrl and .token (long-lived token)");
  const url = ha.baseUrl.replace(/\/+$/, "") + "/api/services/"
    + (task.domain || "tasker") + "/" + (task.service || "perform_task");
  const r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": "Bearer " + ha.token, "Content-Type": "application/json" },
    body: JSON.stringify(task.data || {}),
  });
  return { via: "ha", status: r.status, service: (task.domain||"tasker")+"."+(task.service||"perform_task") };
}

// MQTT publish — the natural path through your VBA smart transmitter (it speaks
// MQTT). The phone runs an MQTT-Client Tasker plugin subscribed to the topic.
let _mqttClient = null;
async function triggerMqtt(task) {
  const m = config.backends?.mqtt || {};
  if (!m.url) throw new Error("set config.backends.mqtt.url (e.g. mqtt://192.168.11.10:1883)");
  let mqtt;
  try { mqtt = require("mqtt"); }
  catch { throw new Error("mqtt backend needs the optional package — run: npm i mqtt"); }
  if (!_mqttClient) _mqttClient = mqtt.connect(m.url, { username: m.username || undefined, password: m.password || undefined });
  const c = _mqttClient;
  await new Promise((resolve, reject) => {
    const pub = () => c.publish(task.topic, String(task.payload ?? ""), {}, (e) => e ? reject(e) : resolve());
    if (c.connected) pub();
    else { c.once("connect", pub); c.once("error", reject); }
  });
  return { via: "mqtt", status: 200, topic: task.topic };
}

// ---- http plumbing ----------------------------------------------------------
function sendJson(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(s) });
  res.end(s);
}
function readBody(req) {
  return new Promise((resolve) => { let b = ""; req.on("data", c => b += c); req.on("end", () => resolve(b)); });
}
async function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const fp = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, ""));
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); return res.end("forbidden"); }
  try {
    const data = await fsp.readFile(fp);
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  try {
    if (url === "/api/tasks") {
      const tasks = (config.tasks || []).map(t => ({ id: t.id, label: t.label, icon: t.icon || "▶", backend: t.backend, group: t.group || null }));
      return sendJson(res, 200, { ok: true, name: config.name || "Tasker Bridge", tasks });
    }
    if (url === "/api/trigger" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const task = (config.tasks || []).find(t => t.id === body.id);
      if (!task) return sendJson(res, 404, { ok: false, error: "unknown task id: " + body.id });
      try {
        const result = await dispatch(task);
        return sendJson(res, 200, { ok: true, id: task.id, label: task.label, result });
      } catch (e) {
        return sendJson(res, 200, { ok: false, id: task.id, error: String(e.message || e) });
      }
    }
    if (url === "/api/reload")  { config = loadConfig(); return sendJson(res, 200, { ok: true, tasks: (config.tasks || []).length }); }
    if (url === "/api/health")  return sendJson(res, 200, { ok: true, name: config.name || "Tasker Bridge" });
    return serveStatic(req, res);
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: String(e.message || e) });
  }
});

const PORT = config.port || 8790;
server.listen(PORT, () => console.log(`[TaskerBridge] serving on http://localhost:${PORT}  — open it on your phone via this machine's LAN IP`));
