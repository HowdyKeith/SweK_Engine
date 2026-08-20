// ai-bridge/showcase-export.js — v1452
// Packages a clean, public-showable front-end of the engine into
// "SweK Game FrontEnd.zip" (Settings -> Export SweK Game FrontEnd). It copies the
// web engine (WebGLEngine = ENGINE_ROOT) minus dev/runtime/connector cruft, drops in
// a curated demo allowlist (showcase.json), a friendly landing page, and a one-click
// launcher, then zips it to the user's Downloads. No engine modules are modified or
// removed from the source tree — this only assembles a filtered COPY.
//
// EDIT `SHOWCASE` below to control what ships ("package up what we want").

const path = require("path"), fs = require("fs"), os = require("os"), cp = require("child_process");
const ENGINE_ROOT = path.resolve(__dirname, "..");   // .../WebGLEngine

const SHOWCASE = {
    title: "SweK Engine",
    // demo ids that appear in the showcase menu (the engine filters via showcase.json).
    // dungeon + real-world render are engine FEATURES (dungeonKit / realTerrain), linked
    // from the landing page rather than being demos_code entries.
    demos: ["testfire_skirmish", "city_builder", "kaiju_attacks_city", "aquarium", "rigged_showcase", "multiplayer_ogre", "ocean_ecosystem", "boids"],
    // names skipped anywhere in the tree (dev/runtime/heavy)
    excludeNames: new Set([
        "node_modules", ".git", "__pycache__", "asset_library", ".kpop-wav", "tts-out", "doc-out",
        "debug.log", "debug.log.1", "discovery-cache.json", "use_bun.flag", "sync-peers.json", "skirmish-rooms.json",
        "phonecam.json", "toasts.json", "uitars.json", "gen-queue.json", "twitch-eventsub.json", "camera.json", "discord-voice.json",
        "ha-solar.json", "ha-speaker.json", "ha-cast.json", "ha.config.json", "rgb.config.json", "govee.config.json", "xbox.config.json",
        "fallout.json", "starfield.json", "x4.json", "eve.json", "skyrim.json", "ps3.json", "sysadmin.json", "processes.json", "clip-queue.json",
        "gmail.json", "github.json", "wled.json", "tts.json", "stt.json", "flowhooks.json", "booklore.json", "imagegen.json", "comics.json",
        "mlx.json", "kaggle.json", "kaggle-jobs.json", "keepawake.json", "terminal.json", "go2rtc-mgr.json", "bgservices.json", "autoinstall.json",
        "meshy.json", "diorama.json", "sandbox-scenes.json", "ball.json", "presence-watch.json", "air-watch.json", "doorbell.json", "alexa.json",
        "spacedesk.json", "arrival.json", "board.json", "petfbi-board.json", "petfbi-counts.json", "petfbi-seen.json", "petfbi-workbook.xlsx",
        "emailrules-seen.json", "emailrules-log.json", "emailrules-pending.json", "package-lock.json",
    ]),
    // relative paths (from ENGINE_ROOT) skipped wholesale
    excludeRels: new Set(["GPU_Assets/mods", "vendor/xterm", "ai-bridge/vendor/go2rtc", "ai-bridge/vendor/hls", "ai-bridge/asset_library"]),
    // file extensions skipped (printed minis, big binaries) — keep .glb only outside GPU_Assets
    excludeExt: new Set([".apk", ".stl"]),
};

function copyTree(src, dst, rel = "") {
    const name = path.basename(src);
    if (SHOWCASE.excludeNames.has(name)) return;
    if (rel && SHOWCASE.excludeRels.has(rel)) return;
    const st = fs.statSync(src);
    if (st.isDirectory()) {
        fs.mkdirSync(dst, { recursive: true });
        for (const e of fs.readdirSync(src)) copyTree(path.join(src, e), path.join(dst, e), rel ? rel + "/" + e : e);
    } else {
        const ext = path.extname(name).toLowerCase();
        if (SHOWCASE.excludeExt.has(ext)) return;
        if (ext === ".glb" && rel.startsWith("GPU_Assets/")) return;   // drop bundled sample meshes
        fs.copyFileSync(src, dst);
    }
}

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const LANDING = (title, demos, copy) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;min-height:100%;background:#0a0e14;color:#cfe;font-family:ui-monospace,monospace;display:flex;align-items:center;justify-content:center}
.card{max-width:640px;padding:38px 28px;text-align:center}h1{font-size:30px;margin:0 0 6px;color:#7fd7ff}p{color:#9bb;line-height:1.5}
.btns{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:14px 0 6px}
a.btn{display:inline-block;padding:11px 20px;background:#16202c;color:#cfe;text-decoration:none;border:1px solid #2a3a4c;border-radius:9px;font-size:14px}
a.btn:hover{border-color:#4a7d9d;background:#1b2836}
a.feat{background:#1d4a63;color:#bdf0ff;border-color:#34657d;font-weight:600}
a.ghost{background:transparent;color:#8aa;border-color:#243244;font-size:13px}
.sec{font-size:11px;color:#667;letter-spacing:2px;margin:18px 0 2px}</style></head>
<body><div class="card"><h1>${esc(title)}</h1>
<p>${esc(copy)}</p>
<div class="sec">JUMP RIGHT IN</div>
<div class="btns">
  <a class="btn feat" href="./index.html?go=dungeonwalk">\u2694 Dungeon walk</a>
  <a class="btn feat" href="./index.html?go=real_terrain&rtlat=40.7060&rtlon=-73.9970&rtsize=2000">\uD83C\uDFD9 NYC in 3D</a>
  <a class="btn feat" href="./index.html?go=real_terrain">\uD83C\uDF0D Your neighborhood</a>
</div>
${demos.length ? '<div class="sec">DEMOS</div><div class="btns">' + demos.map(d => `<a class="btn" href="./index.html?go=${encodeURIComponent(d)}">${esc(d.replace(/_/g, " "))}</a>`).join("") + '</div>' : ""}
<p style="margin-top:20px"><a class="btn ghost" href="./index.html">Full engine menu \u2192</a></p>
<p style="margin-top:14px;font-size:11px;color:#667">Runs locally in Chrome via the bundled launcher. Nothing is uploaded.</p>
</div></body></html>`;

const BAT = `@echo off
title SweK Engine Showcase
cd /d "%~dp0WebGLEngine\\ai-bridge"
echo Starting SweK Engine...
where bun >nul 2>nul
if %errorlevel%==0 ( start "" /b bun server.js ) else ( echo Bun not found. Install from https://bun.sh then re-run. & pause & exit /b 1 )
timeout /t 3 >nul
start "" http://localhost:8787/showcase.html
echo.
echo SweK Engine is running at http://localhost:8787/showcase.html
echo Close this window to stop the server.
pause >nul
`;

function zipDir(stageDir, destZip) {
    return new Promise((resolve, reject) => {
        try { fs.mkdirSync(path.dirname(destZip), { recursive: true }); } catch {}
        try { fs.unlinkSync(destZip); } catch {}
        if (process.platform === "win32") {
            cp.execFile("powershell", ["-NoLogo", "-NoProfile", "-Command", "Compress-Archive -Path '" + stageDir.replace(/'/g, "''") + "\\*' -DestinationPath '" + destZip.replace(/'/g, "''") + "' -Force"], { timeout: 900000, windowsHide: true }, (err) => err ? reject(new Error("Compress-Archive: " + (err.message || err))) : resolve());
        } else {
            cp.execFile("zip", ["-rq", destZip, "."], { cwd: stageDir, timeout: 900000 }, (err) => err ? cp.execFile("tar", ["-acf", destZip, "."], { cwd: stageDir, timeout: 900000 }, (e2) => e2 ? reject(new Error("zip/tar failed")) : resolve()) : resolve());
        }
    });
}

async function exportShowcase(opts = {}) {
    const pkgName = "SweK Game FrontEnd";
    const demos = (Array.isArray(opts.demos) && opts.demos.length) ? opts.demos.filter(d => typeof d === "string") : SHOWCASE.demos;
    const title = (opts.title && String(opts.title).trim()) || SHOWCASE.title;
    const copy = (opts.copy && String(opts.copy).trim()) || "A real-time 3D engine demo. Click below to enter, then pick a demo from the menu.";
    const stageRoot = path.join(os.tmpdir(), "swek_showcase_" + Date.now());
    const stage = path.join(stageRoot, pkgName);
    fs.mkdirSync(stage, { recursive: true });
    try {
        copyTree(ENGINE_ROOT, path.join(stage, "WebGLEngine"));
        fs.writeFileSync(path.join(stage, "WebGLEngine", "showcase.json"), JSON.stringify({ title, demos }, null, 2));
        fs.writeFileSync(path.join(stage, "WebGLEngine", "showcase.html"), LANDING(title, demos, copy));
        fs.writeFileSync(path.join(stage, "START_SHOWCASE.bat"), BAT);
        const dest = (opts.dest && path.isAbsolute(opts.dest)) ? opts.dest : path.join(os.homedir(), "Downloads", pkgName + ".zip");
        await zipDir(stage, dest);
        const bytes = fs.statSync(dest).size;
        return { ok: true, path: dest, bytes, demos, title };
    } finally {
        try { fs.rmSync(stageRoot, { recursive: true, force: true }); } catch {}
    }
}

// v1467 — STATIC itch.io build. itch serves a zip of static files (no Node/Bun
// bridge), so we stage the engine at the ZIP ROOT (index.html at top), drop the
// bridge, and inject a shim that no-ops the engine's bridge API calls. Client demos
// run fully in the browser; bridge-only features (multiplayer, distributed AI,
// asset-gen, Kaggle, sync) go inert. No source files are modified — this is a COPY.
const ITCH_DEMOS = ["testfire_skirmish", "city_builder", "kaiju_attacks_city", "aquarium", "ocean_ecosystem", "boids", "chess", "slime_mold", "ant_colony", "alien_swarm"];
const STATIC_SHIM = `// swek-static.js — itch/static build: there is no SweK bridge here, so quietly
// neutralize the engine's bridge API calls (all root-relative like /sync, /kaggle).
// Static assets load via "./" paths or ES imports, so they are never touched.
(function () {
  window.SWEK_STATIC = true;
  var orig = window.fetch ? window.fetch.bind(window) : null;
  if (!orig) return;
  var P = ["/sync", "/mp/", "/kaggle", "/activity", "/gen-queue", "/skirmish", "/assets/ingest", "/assets/sync", "/assets/library", "/avatar/", "/ha/", "/tts", "/stt", "/comfy", "/meshy", "/presence", "/phonecam", "/discovery", "/models/", "/nrc", "/govee", "/wled", "/xbox", "/alexa", "/doorbell", "/board", "/booklore", "/imagegen", "/comics", "/mlx", "/terminal"];
  function bridge(p) { if (!p || p.charAt(0) !== "/") return false; for (var i = 0; i < P.length; i++) { if (p === P[i] || p.indexOf(P[i]) === 0) return true; } return false; }
  function pathOf(u) { try { var s = (typeof u === "string") ? u : (u && u.url) || ""; if (s.indexOf("http") === 0) { try { s = new URL(s).pathname; } catch (e) {} } return s; } catch (e) { return ""; } }
  window.fetch = function (u, o) { if (bridge(pathOf(u))) return Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })); return orig(u, o); };
})();`;

async function exportItchBuild(opts = {}) {
    const pkgName = "SweK Game (itch)";
    const demos = (Array.isArray(opts.demos) && opts.demos.length) ? opts.demos.filter(d => typeof d === "string") : ITCH_DEMOS;
    const title = (opts.title && String(opts.title).trim()) || SHOWCASE.title;
    const stageRoot = path.join(os.tmpdir(), "swek_itch_" + Date.now());
    const stage = path.join(stageRoot, pkgName);
    fs.mkdirSync(stage, { recursive: true });
    try {
        copyTree(ENGINE_ROOT, stage);                                                  // engine at the ZIP ROOT
        try { fs.rmSync(path.join(stage, "ai-bridge"), { recursive: true, force: true }); } catch {}   // no server on itch
        fs.writeFileSync(path.join(stage, "swek-static.js"), STATIC_SHIM);
        const idxPath = path.join(stage, "index.html");                                // inject the shim before the engine boots
        let idx = fs.readFileSync(idxPath, "utf8");
        if (!idx.includes("swek-static.js")) idx = idx.replace(/<head>(\r?\n)?/, (m) => m + '    <script src="./swek-static.js"></script>\n');
        fs.writeFileSync(idxPath, idx);
        fs.writeFileSync(path.join(stage, "showcase.json"), JSON.stringify({ title, demos }, null, 2));
        fs.writeFileSync(path.join(stage, "README_itch.txt"),
            "SweK Engine - itch.io HTML5 build\n\n" +
            "Upload this whole zip to itch.io as the game file and tick 'This file will be played in the browser.'\n" +
            "Set the embed/viewport size (e.g. 1280x720) and enable fullscreen.\n\n" +
            "This is a STATIC build: there is no SweK bridge server, so bridge-only features\n" +
            "(multiplayer, the distributed-AI Battle Network, asset generation, Kaggle, asset sync)\n" +
            "are inert. The pure client demos run fully in the browser.\n\n" +
            "itch AI disclosure: tag the project AI Assisted / AI Code (and Graphics/Audio if used).\n");
        const dest = (opts.dest && path.isAbsolute(opts.dest)) ? opts.dest : path.join(os.homedir(), "Downloads", pkgName + ".zip");
        await zipDir(stage, dest);
        return { ok: true, path: dest, bytes: fs.statSync(dest).size, demos, title };
    } finally {
        try { fs.rmSync(stageRoot, { recursive: true, force: true }); } catch {}
    }
}

module.exports = { exportShowcase, exportItchBuild, SHOWCASE };
