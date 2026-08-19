// ui/wledLayer.js — v1115
// Frontend WLED control (window.wled) + opt-in reactions to engine events.
// All control flows through the bridge's /wled/* routes (which no-op until an IP
// is set in Settings -> WLED Lights). React mode flashes/tints the strip on
// kaiju attacks, defeats, level-ups, and weather changes.

export function installWled() {
    const post = (p, b) => fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
    const get = (p) => fetch(p, { cache: "no-store" }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));

    let react = false, ambient = [255, 180, 90], lastFlash = 0;
    const WEATHER_COLOR = { clear: [255, 180, 90], cloudy: [120, 130, 150], rain: [60, 120, 220], snow: [200, 220, 255], storm: [150, 80, 220], blizzard: [180, 200, 255] };

    const color = (rgb, bri) => post("/wled/color", { rgb, bri });
    const power = (on) => post("/wled/power", { on });
    const effect = (opts) => post("/wled/effect", opts || {});
    const info = () => get("/wled/info");
    const getConfig = () => get("/wled/config");
    const config = (d) => post("/wled/config", d || {});

    function setAmbient(rgb) { ambient = rgb; if (react) color(rgb); }
    function flash(rgb, ms = 400) {
        if (!react) return;
        const now = performance.now(); if (now - lastFlash < 300) return; lastFlash = now;
        color(rgb).then(() => setTimeout(() => { if (react) color(ambient); }, ms));
    }

    const onWeather = (e) => { if (!react) return; const c = WEATHER_COLOR[e.detail && e.detail.kind]; if (c) setAmbient(c); };
    const onAttack = () => flash([255, 40, 30], 350);
    const onDefeat = () => flash([60, 230, 120], 450);
    const onLevel = () => flash([255, 210, 60], 600);

    window.addEventListener("engine:weatherChanged", onWeather);
    window.addEventListener("engine:kaijuAttack", onAttack);
    window.addEventListener("engine:kaijuDefeated", onDefeat);
    window.addEventListener("engine:falloutLevelUp", onLevel);

    try { if (localStorage.getItem("voxelengine.wledReact") === "1") react = true; } catch {}

    function setReact(on) {
        react = !!on;
        try { localStorage.setItem("voxelengine.wledReact", react ? "1" : "0"); } catch {}
        if (react) { color(ambient); window.kpop?.info?.("WLED", "reacting to engine events"); }
        return { ok: true, react };
    }
    function status() { return { ok: true, react, ambient }; }

    window.wled = { color, power, effect, info, getConfig, config, react: setReact, setAmbient, flash, status };
    console.log("[wled] window.wled.config({ip}) then .color([r,g,b]) / .react(true) — set the IP in Settings -> WLED Lights");
}
