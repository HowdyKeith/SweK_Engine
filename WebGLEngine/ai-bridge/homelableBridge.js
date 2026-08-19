// ai-bridge/homelableBridge.js
//
// The borrow. homelable (Pouzor/homelable) owns the part SweK deliberately does not: the Zigbee / Z-Wave / MQTT / Proxmox
// topology of the house. This reads homelable's device inventory and normalises it into SweK device records, so those
// IoT devices can show up on the radar and in panels WITHOUT SweK growing an MQTT or Zigbee stack of its own. Read-only.
//
// Verified against Pouzor/homelable (2026): an MCP server on port 8001 (header X-API-Key: mcp_sk_...), whose get_canvas
// tool returns the full node list -- each node carrying id, type, name, mac, status, and canvas x/y. The Zigbee mesh
// (coordinator / routers / end devices) is imported into that same node list from Zigbee2MQTT through HA's broker. The
// homelable key stays in homelable; SweK only holds whatever the operator pastes into its own config to read.
//
// fetchCanvas is rig-side I/O (it talks to a running homelable). parseCanvas and toRadarBlips are pure and gated.

// homelable node type -> a SweK radar/device kind. Covers homelable's 20 node types + 3 Zigbee types; anything unknown
// falls back to "device" so a new homelable type never crashes the read, it just shows as a generic device.
const HL_KIND = {
    isp: "infra", router: "infra", firewall: "infra", switch: "infra", access_point: "infra", cpl: "infra",
    server: "server", proxmox: "server", vm: "server", lxc: "server", nas: "server", docker_host: "server", docker_container: "server",
    iot: "iot", camera: "camera", printer: "iot",
    computer: "host", laptop: "host", mobile: "mobile",
    zigbee_coordinator: "zigbee", zigbee_router: "zigbee", zigbee_end_device: "zigbee",
    generic: "device",
};

function kindFor(type) { return HL_KIND[String(type || "").toLowerCase()] || "device"; }

// Normalise a homelable canvas payload into SweK device records. Accepts { nodes: [...] } or a bare array.
function parseCanvas(canvas) {
    const nodes = Array.isArray(canvas) ? canvas : (canvas && (canvas.nodes || canvas.data)) || [];
    const out = [];
    for (const n of nodes) {
        if (!n) continue;
        const id = n.id != null ? String(n.id) : (n.mac || n.name || "");
        if (!id) continue;
        const status = n.status != null ? String(n.status).toLowerCase() : "";
        out.push({
            id,
            label: n.label || n.name || n.hostname || id,
            type: n.type || "generic",
            kind: kindFor(n.type),
            mac: n.mac || "",
            online: status ? (status === "online" || status === "up" || status === "ok") : (n.online === true),
            x: typeof n.x === "number" ? n.x : null,
            y: typeof n.y === "number" ? n.y : null,
        });
    }
    return out;
}

// Turn normalised devices into radar-manager blips. Devices with a homelable canvas position use it (flat x/z); the
// rest are laid out on a ring by a stable hash of their id, so every device still lands somewhere sensible.
function toRadarBlips(devices) {
    return (devices || []).map((d, i) => {
        let x = d.x, z = d.y;
        if (x == null || z == null) {
            let h = 0; for (const c of d.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
            const a = (h % 3600) / 3600 * Math.PI * 2;
            x = Math.cos(a); z = Math.sin(a);
        }
        return { id: "hl:" + d.id, type: d.kind, label: d.label, x, z, online: d.online };
    });
}

// Rig-side: pull the canvas from a running homelable over MCP (get_canvas). fetchImpl injected for testability.
async function fetchCanvas(baseUrl, apiKey, fetchImpl) {
    const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return { ok: false, error: "no fetch" };
    const url = String(baseUrl || "").replace(/\/+$/, "") + "/mcp/";
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_canvas", arguments: {} } };
    try {
        const r = await f(url, { method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": apiKey || "" }, body: JSON.stringify(body) });
        const j = await r.json();
        // MCP wraps tool output in result.content[].text (JSON string) or result.structuredContent; be tolerant.
        let canvas = j && j.result && j.result.structuredContent;
        if (!canvas && j && j.result && Array.isArray(j.result.content)) {
            const t = j.result.content.find((c) => c && c.type === "text");
            if (t) { try { canvas = JSON.parse(t.text); } catch { canvas = null; } }
        }
        if (!canvas) canvas = j && (j.result || j);
        return { ok: true, devices: parseCanvas(canvas) };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

module.exports = { HL_KIND, kindFor, parseCanvas, toRadarBlips, fetchCanvas };
