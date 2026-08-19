// FILE: ui/engineBusy.js
// v946 — "interlude" overlay for covering unavoidable engine stalls.
//
// A CSS-animated DOM overlay (NOT WebGL) so it keeps MOVING even while the main
// thread is blocked — CSS animations run on the compositor thread, independent of
// frozen JS. (A WebGL-rendered spinner can't animate during a main-thread block;
// this can.) Use the runHeavy() wrapper around a known-heavy synchronous op: it
// shows the overlay, YIELDS one paint (critical — otherwise the overlay never
// draws before the block), runs the op, then hides.
//
//   await window.engineBusy.runHeavy("Flooding…", () => flood.lake({...}), { style:"mix" });
//   window.engineBusy.show({ style:"lore" });  /* … */  window.engineBusy.hide();
//   window.engineBusy.demo("mix");             // preview a style for ~2.6s
//   window.engineBusy.setVideo("/clips/wait.mp4");  // optional in-overlay video
//
// style: "spinner" | "lore" | "video" | "mix" | "auto". Mix-and-match via opts:
//   { label, lore (string | true=random), tip, video (url), style }

const LORE = [
    "The kaiju stirs in the deep…",
    "Folding the terrain into being…",
    "Recompiling the dream…",
    "Counting voxels by candlelight…",
    "The civilizations hold their breath…",
    "Aligning the ley-lines of the grid…",
    "Stacking cubes into mountains…",
    "Letting the water find its level…",
    "Waking the render daemons…",
    "Negotiating with the GPU…",
];

let root = null, els = null, demoTimer = null;

function storedVideo() {
    try { return localStorage.getItem("voxelengine.interludeVideo") || ""; } catch { return ""; }
}

function injectCss() {
    if (document.getElementById("engineBusyCss")) return;
    const s = document.createElement("style");
    s.id = "engineBusyCss";
    s.textContent = `
    @keyframes ebSpin { to { transform: rotate(360deg); } }
    @keyframes ebPulse { 0%,100%{opacity:.35;} 50%{opacity:1;} }
    @keyframes ebBounce { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-14px);} }
    #engineBusy { position:fixed; inset:0; z-index:2147483600; display:none; align-items:center; justify-content:center;
      background:rgba(4,6,13,.82); -webkit-backdrop-filter:blur(3px); backdrop-filter:blur(3px); font-family:ui-monospace,'Antonio',monospace; }
    #engineBusy.on { display:flex; }
    #engineBusy .eb-panel { min-width:280px; max-width:min(560px,86vw); padding:22px 26px; border-radius:6px 6px 6px 22px;
      background:linear-gradient(180deg,#0a1422,#0a0d18); border:1px solid #2f628f;
      box-shadow:0 0 40px rgba(90,150,255,.25), inset 0 0 0 1px #14304a; color:#cfe6ff; text-align:center; }
    #engineBusy .eb-ring { width:52px; height:52px; border-radius:50%; border:5px solid #173656; border-top-color:#9ac8ff; animation:ebSpin .9s linear infinite; margin:0 auto 14px; }
    #engineBusy .eb-cubes { display:flex; gap:7px; justify-content:center; margin:0 auto 14px; }
    #engineBusy .eb-cubes i { width:13px; height:13px; background:#9ac8ff; display:block; animation:ebBounce .9s ease-in-out infinite; }
    #engineBusy .eb-cubes i:nth-child(2){ animation-delay:.12s; background:#ffb14e; }
    #engineBusy .eb-cubes i:nth-child(3){ animation-delay:.24s; }
    #engineBusy .eb-cubes i:nth-child(4){ animation-delay:.36s; background:#ffb14e; }
    #engineBusy .eb-bar { height:8px; border-radius:4px; background:#59f; margin:0 auto 14px; width:64px; animation:ebPulse 1.1s ease-in-out infinite; }
    #engineBusy .eb-label { font-size:15px; letter-spacing:.06em; color:#9ac8ff; text-transform:uppercase; margin-bottom:6px; }
    #engineBusy .eb-loretitle { font-size:13px; color:#ffb14e; letter-spacing:.08em; text-transform:uppercase; margin-bottom:4px; }
    #engineBusy .eb-lore { font-size:14px; color:#cfe6ff; line-height:1.45; }
    #engineBusy .eb-tip { font-size:12px; color:#7fa8d8; margin-top:10px; }
    #engineBusy video.eb-video { width:100%; max-height:300px; border-radius:4px; margin-bottom:12px; background:#000; display:block; }
    `;
    document.head.appendChild(s);
}

function build() {
    if (root) return;
    injectCss();
    root = document.createElement("div");
    root.id = "engineBusy";
    root.innerHTML = `
      <div class="eb-panel">
        <video class="eb-video" autoplay muted loop playsinline style="display:none"></video>
        <div class="eb-ring" data-eb="ring"></div>
        <div class="eb-cubes" data-eb="cubes"><i></i><i></i><i></i><i></i></div>
        <div class="eb-bar" data-eb="bar"></div>
        <div class="eb-label" data-eb="label">Working…</div>
        <div class="eb-loretitle" data-eb="loretitle" style="display:none">Interlude</div>
        <div class="eb-lore" data-eb="lore" style="display:none"></div>
        <div class="eb-tip" data-eb="tip" style="display:none"></div>
      </div>`;
    document.body.appendChild(root);
    els = {
        video: root.querySelector("video"),
        ring: root.querySelector('[data-eb="ring"]'),
        cubes: root.querySelector('[data-eb="cubes"]'),
        bar: root.querySelector('[data-eb="bar"]'),
        label: root.querySelector('[data-eb="label"]'),
        loretitle: root.querySelector('[data-eb="loretitle"]'),
        lore: root.querySelector('[data-eb="lore"]'),
        tip: root.querySelector('[data-eb="tip"]'),
    };
}

function show(opts = {}) {
    build();
    const style = opts.style || (opts.lore || opts.tip ? "lore" : opts.video ? "video" : "spinner");
    const vid = opts.video || storedVideo();
    const showSpinner = style === "spinner" || style === "mix" || style === "auto";
    const showLore = style === "lore" || style === "mix" || style === "auto" || opts.lore != null;
    const showVideo = (style === "video" || style === "mix" || !!opts.video) && !!vid;

    els.ring.style.display = showSpinner ? "block" : "none";
    els.cubes.style.display = showSpinner ? "flex" : "none";
    els.bar.style.display = showSpinner ? "block" : "none";

    els.label.textContent = opts.label || "Working…";
    els.label.style.display = opts.label === false ? "none" : "block";

    if (showLore) {
        const text = (opts.lore === true || opts.lore == null) ? LORE[(Math.random() * LORE.length) | 0] : String(opts.lore);
        els.loretitle.style.display = "block"; els.lore.style.display = "block"; els.lore.textContent = text;
    } else { els.loretitle.style.display = "none"; els.lore.style.display = "none"; }

    if (opts.tip) { els.tip.style.display = "block"; els.tip.textContent = "💡 " + opts.tip; }
    else els.tip.style.display = "none";

    if (showVideo) { els.video.style.display = "block"; if (els.video.getAttribute("src") !== vid) els.video.src = vid; try { els.video.play?.(); } catch {} }
    else { els.video.style.display = "none"; try { els.video.pause?.(); } catch {} }

    root.classList.add("on");
}

function hide() {
    if (!root) return;
    root.classList.remove("on");
    try { els.video.pause?.(); } catch {}
}

// Double-rAF + a macrotask: gives the browser a real chance to PAINT the overlay
// before we hand control to a blocking synchronous op.
function nextPaint() {
    return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 0))));
}

async function runHeavy(label, fn, opts = {}) {
    show(Object.assign({ label }, opts));
    await nextPaint();
    try { return await fn(); }
    finally { hide(); }
}

function demo(style = "mix", ms = 2600) {
    clearTimeout(demoTimer);
    show({ style, label: "Preview interlude", tip: "preview only" });
    demoTimer = setTimeout(hide, ms);
}

window.engineBusy = {
    show, hide, runHeavy, demo, lore: LORE,
    setVideo: (url) => { try { localStorage.setItem("voxelengine.interludeVideo", url || ""); } catch {} },
    getVideo: storedVideo,
};
console.log("[engineBusy] ready — window.engineBusy.runHeavy(label, fn, {style}); demo('spinner'|'lore'|'mix'|'video')");

export {};
