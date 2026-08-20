// v939 — Tasker bridge (engine → bridge → Tasker on your phone / Android VM).
// Config lives in the Settings panel's "Tasker" tab (transport + endpoints/keys,
// stored in localStorage). This reads that config and POSTs /tasker/trigger to the
// Node bridge (same-origin, like avatarPublish/tvOverlay); the bridge relays to
// Tasker via the chosen transport (Tasker HTTP server / Join / MQTT / AutoRemote).
//
//   window.taskerTrigger("flash_lights")
//   window.taskerTrigger("autoinput_tap", { x: 540, y: 1200 })
//
// Returns a promise resolving to { ok, transport, code, error }.

function tk(key) {
    try { return localStorage.getItem("voxelengine.tasker." + key) || ""; }
    catch { return ""; }
}

window.taskerTrigger = function (command, params) {
    const body = {
        transport:     tk("transport") || "tasker_http",
        httpUrl:       tk("httpUrl"),
        joinKey:       tk("joinKey"),
        joinDevice:    tk("joinDevice"),
        autoremoteKey: tk("autoremoteKey"),
        mqttTopic:     tk("mqttTopic"),
        command:       command,
        params:        params || {},
    };
    return fetch("/tasker/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));
};

// --- v940 (R2) — config + macro registry, cached on the bridge so the PHONE can
// fire macros by id (it has no copy of this device's localStorage).
function tkConfig() {
    return {
        transport:     tk("transport") || "tasker_http",
        httpUrl:       tk("httpUrl"),
        joinKey:       tk("joinKey"),
        joinDevice:    tk("joinDevice"),
        autoremoteKey: tk("autoremoteKey"),
        mqttTopic:     tk("mqttTopic"),
    };
}
function tkMacros() {
    try { const j = JSON.parse(localStorage.getItem("voxelengine.tasker.macros") || "[]"); return Array.isArray(j) ? j : []; }
    catch { return []; }
}
function tkSetMacros(arr) {
    try { localStorage.setItem("voxelengine.tasker.macros", JSON.stringify(arr || [])); } catch {}
}

// Push current config + macros to the bridge cache.
window.taskerSync = function () {
    return fetch("/tasker/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: tkConfig(), macros: tkMacros() }),
    }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));
};

window.taskerMacros = {
    get: tkMacros,
    set: (arr) => { tkSetMacros(arr); return window.taskerSync(); },
};

// Fire a saved macro by id (bridge uses its cached config + creds).
window.taskerFire = function (id, params) {
    return fetch("/tasker/fire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id, params: params || {} }),
    }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));
};

// v943 — Join direct push (engine → phone notification). Uses the Settings Join
// creds; opts: { text, title, url, icon }.
window.joinPush = function (opts) {
    opts = opts || {};
    return fetch("/join/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apikey: tk("joinKey"), deviceId: tk("joinDevice"), text: opts.text, title: opts.title, url: opts.url, icon: opts.icon }),
    }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));
};

// Seed a starter macro (Keith's AutoInput-controlled VM app) the first time, then
// push config+macros to the bridge on boot so the phone is ready after a restart.
try {
    if (!tkMacros().length) {
        tkSetMacros([{ id: "vm_app", label: "AutoInput: my VM app", command: "vm_app", params: {} }]);
    }
    window.taskerSync();
} catch {}

console.log("[tasker] ready — window.taskerTrigger / taskerFire(id) / taskerMacros / taskerSync; configure in Settings → Tasker");
