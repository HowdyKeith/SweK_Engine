// v937 — TvOverlay bridge. Lets the WebGL engine push notifications to a
// TvOverlay Android-TV app WITHOUT going through the VBA workbook: the engine
// POSTs to this Node bridge (same-origin, like avatarPublish), and the bridge
// forwards to TvOverlay's REST API. Point the bridge at the TV by setting the
// TV_OVERLAY_URL env var (e.g. TV_OVERLAY_URL=http://192.168.11.50:5678).
//
//   window.tvNotify("Kaiju!", "Spawned at sector 7", { image:"mdi:alert", corner:"top_end", duration:6 })
//   window.tvFixed("hp", "Shield 80%", { icon:"mdi:shield", iconColor:"#33d6ff" })
//
// Both return a promise resolving to the bridge result ({ok, transport, ...}).
// opts can carry ANY TvOverlay field: image (mdi:NAME / URL / Base64), video (RTSP/
// HLS/DASH URL), largeIcon, smallIcon, smallIconColor, corner (top_end/top_start/
// bottom_end/bottom_start), duration (s); fixed adds icon, iconColor, messageColor,
// borderColor, backgroundColor, shape, expiration. opts.transport "rest"|"mqtt"
// forces a path; opts.topic overrides the MQTT topic.

function post(path, payload) {
    return fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
    }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));
}

window.tvNotify = function (title, message, opts) {
    return post("/tv/notify", Object.assign({ title: title, message: message }, opts || {}));
};

window.tvFixed = function (id, message, opts) {
    return post("/tv/fixed", Object.assign({ id: id, message: message }, opts || {}));
};

// Concrete wired event: announce on the TV once when the engine bridge comes
// up. Safe by default — the bridge no-ops unless TV_OVERLAY_URL is set.
let _announced = false;
window.addEventListener("engine:bridge-up", () => {
    if (_announced) return;
    _announced = true;
    try {
        window.tvNotify("SweK Engine", "Engine online", { image: "mdi:cube-outline", corner: "top_end", duration: 5 });
    } catch {}
});

console.log("[tvOverlay] ready — window.tvNotify(title,msg,opts) / window.tvFixed(id,msg,opts)");
