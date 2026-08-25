// FILE: ui/avatarPublish.js
// v927 — publishes the engine's current avatar URL to the bridge so the phone
// phone.html mini-avatar mirrors the PC's current view. Resolves the same way
// demoChrome does (the demoChrome 'avatar' setting → first kpop favorite →
// RobotExpressive fallback). Cheap: re-checks every 8s, POSTs only on change.

function resolveAvatarUrl() {
    try {
        const dc = JSON.parse(localStorage.getItem("voxelEngine.demoChrome") || "null");
        if (dc && typeof dc.avatar === "string" && dc.avatar) return dc.avatar;
    } catch {}
    try {
        const favs = JSON.parse(localStorage.getItem("voxelEngine.kpopFavorites") || "[]");
        if (Array.isArray(favs) && favs[0] && favs[0].url) return favs[0].url;
    } catch {}
    return "RobotExpressive";
}

let _last = null;
// v1469 — render the current avatar to a small PNG and hand it to the bridge so
// the KPop Listener can show it as the toast thumbnail (-AppLogo). Best-effort:
// a detached miniAvatar canvas (frame() leaves a 0-clientWidth canvas at its set
// size), polled until the GLB has loaded, then captured + posted.
async function captureThumb(url) {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 256;
        const mod = await import("/face/miniAvatar.js");
        const mini = mod.mountMiniAvatar(canvas, { url });
        if (!mini || !mini.ok || !mini.capture) { try { mini && mini.destroy(); } catch {} return; }
        let dataURL = null;
        for (let i = 0; i < 30 && !dataURL; i++) { await new Promise(r => setTimeout(r, 200)); dataURL = mini.capture(256); }
        try { mini.destroy(); } catch {}
        if (dataURL) await fetch("/avatar/thumb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataURL, url }) }).catch(() => {});
    } catch { /* capture is best-effort; bridge or WebGL2 may be unavailable */ }
}

async function publish() {
    const url = resolveAvatarUrl();
    if (url === _last) return;
    try {
        const r = await fetch("/avatar/set", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        });
        if (r.ok) { _last = url; captureThumb(url); }   // refresh the toast thumbnail on change
    } catch { /* bridge down — try again next tick */ }
}

publish();
setInterval(publish, 8000);

// expose for an explicit push when the avatar changes (e.g. Avatar Settings)
try { window.publishAvatar = publish; } catch {}

export { publish, resolveAvatarUrl };
