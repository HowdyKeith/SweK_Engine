// WebGLEngine/ui/avatarSwitch.js — v3555
// ---------------------------------------------------------------------------------------------------------------
// THE AVATAR CORNER BUTTON — eight surfaces in one box, and only ever ONE of them alive.
//
// server.html shows the SVG robot beside the gauges. This adds a small button at the TOP RIGHT OF THE AVATAR
// PANEL that rotates it through eight, all framed in the same box so the layout never moves:
//
//     svg              -- ui/swekRobot.js, the procedural robot with the brain. Cheap, always available, turns red on errors.
//     rigged           -- avatarstage's rigged GLB, whichever avatar is starred (RobotExpressive by default),
//                          through avatarstage with camdock=1 so the panel owns the camera and the in-iframe
//                          selfie button is hidden. Framed identically to the avatar view.
//     stickwoman       -- v4033. RobotWoman.glb by name, not by favorite -- one click to this exact avatar.
//     robotexpressive2 -- v4033. RobotExpressive.glb by name, same reason. Named "2" because "rigged" already
//                          shows this GLB by default; the id says so is unambiguous rather than colliding on "robotexpressive".
//     blob             -- blob-avatar.html, the Blobulator kept as an avatar (Avataro / Avatarina).
//
// *** THIS IS DELIBERATELY NOT THE SANDBOX'S AVATAR ROTATION. *** The main render window already cycles avatars,
// and Keith asked specifically that it not be swapped in here. Two rotations that look alike and mean different
// things is worse than one -- so this carries its OWN list, and touching the sandbox's is out of
// scope by design rather than by omission.
//
// *** ONLY ONE SURFACE IS MOUNTED AT A TIME, AND THAT IS THE LOAD-BEARING PART. *** The two heavy modes are
// iframes running WebGL. Hiding one with display:none leaves it RENDERING -- a second GPU context burning frames
// behind a panel nobody is looking at, on a page whose entire job is showing you what the machine is doing. So
// switching TEARS DOWN the previous surface and builds the next. The SVG mode therefore costs nothing at all,
// which matters because it is the default.
//
// AND THE SVG IS THE FALLBACK, NOT AN EQUAL. If the rigged GLB is missing -- it was absent from the release
// entirely until v3554 -- the panel returns to the SVG robot AND SAYS SO, rather than showing an empty box that
// looks like a rendering bug.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { describeWebGPU } from "./webgpuProbe.mjs";

export const MODES = [
    { id: "svg", label: "\ud83e\udd16", title: "SweK robot (SVG) — cheap, always available, turns red on errors", kind: "svg" },
    // v3743 -- saver=0. This corner surface is an avatar FOCUS view; without it, avatarstage's idle screensaver
    // (v993) fires after ~75s and cycles focus->surf->boids->pendulum->gears->cradle->bird->wave->diorama. Half
    // those scenes carry NO avatar, so on the server console RobotExpressive would simply be "not in frame at
    // all" until you moved the pointer. saver=0 holds the focus scene; the avatar stays put.
    { id: "rigged", label: "\ud83e\uddcd", title: "RobotExpressive — the rigged GLB, framed as the avatar view", kind: "frame",
      src: "/avatarstage.html?voice=M1&glb=RobotExpressive&camdock=1&embed=1&pet=0&saver=0", frameFromBox: true, needs: "/GPU_Assets/RobotExpressive.glb" },
    // v4033 -- Keith: "RobotExpressive can be choice 4 on Server.html. and we can have StickWoman be choice 3."
    // Named slots, so each named avatar is one click away instead of routed through the "rigged" slot's
    // favorite-of-the-moment (which shows whatever GLB is starred, RobotExpressive by default -- unchanged above).
    { id: "stickwoman", label: "\ud83d\udc57", title: "StickWoman — RobotWoman.glb, framed as the avatar view", kind: "frame",
      src: "/avatarstage.html?voice=M1&glb=RobotWoman&camdock=1&embed=1&pet=0&saver=0", frameFromBox: true, needs: "/GPU_Assets/RobotWoman.glb" },
    { id: "robotexpressive2", label: "\ud83e\udd16", title: "RobotExpressive — RobotExpressive.glb, framed as the avatar view", kind: "frame",
      src: "/avatarstage.html?voice=M1&glb=RobotExpressive&camdock=1&embed=1&pet=0&saver=0", frameFromBox: true, needs: "/GPU_Assets/RobotExpressive.glb" },
    { id: "blob", label: "\ud83e\udee7", title: "Blobulator avatar — Avataro / Avatarina, the reactive metaball avatar", kind: "frame",
      src: "/blob-avatar.html?embed=1" },
    // v3556 -- the two heavy ones, added last on purpose. Each carries a `heavy` note so the button can say what
    // it is about to cost BEFORE the click, rather than after the download starts.
    { id: "blobgpu", label: "\u26a1", title: "Blobulator GPU — WebGPU raymarched SDF (needs a WebGPU browser)", kind: "frame",
      src: "/blobulator-gpu.html?embed=1", heavy: "WebGPU", needsWebGPU: true },
    { id: "thead", label: "\ud83d\udde3", title: "Talking head — MediaPipe face tracking and speech (~12 MB on first use)", kind: "frame",
      src: "/thead.html?embed=1", heavy: "~12 MB MediaPipe bundle on first use" },
    // v4046 -- Keith: "so can we have a krbn avatar switch to on server.html?" The same rigged GLB the "rigged"
    // slot shows, drawn by Krbn as a PENCIL SKETCH instead of shaded WebGL -- graphite on paper, the one surface
    // in this rotation that is not a screen-lit render.
    //
    // *** IT IS `heavy` FOR A REASON THE OTHER TWO ARE NOT: THE COST IS PER FRAME, FOREVER, ON THE MAIN
    // THREAD. *** blobgpu's cost is a WebGPU context and thead's is a one-time ~12 MB download; this one is
    // ~0.5s of CPU EVERY time it redraws (krbn.html measured ~708 ms, krbn-compare ~520 ms). So the page draws
    // a still and advances the orbit on a timer rather than animating, and the button says so before the click.
    // A pencil renderer that pretended to run at 60fps would not be a pencil renderer -- which is exactly the
    // bug v4042 found on krbn-compare.html's own "krbn" pane, where the label was real and the drawing was not.
    //
    // PLACED SECOND-TO-LAST, NOT LAST: v4033 made gauges3000 the explicit final choice at Keith's request ("the
    // last avatar choice, can we swap out the gauges and avatar scene..."), and this file's own gate asserts it.
    // Appending here would have silently overruled a stated preference to save one edit -- and the gate caught
    // exactly that on the first attempt.
    //
    // `needs` names the GLB, same probe as the rigged slots, so a missing asset falls back to the SVG robot AND
    // SAYS SO. It deliberately does NOT declare a need on /vendor/krbn: the page reports that absence in its own
    // box with the route to fix it, and asserting the same fact here would put it in two places with two
    // different messages.
    { id: "krbn", label: "✏️", title: "Krbn pencil avatar — the rigged GLB drawn as a graphite sketch (redraws every ~2.6s; a pencil frame costs ~0.5s of CPU)", kind: "frame",
      src: "/krbn-avatar.html?glb=RobotExpressive", heavy: "~0.5s of CPU per redraw, on the main thread",
      needs: "/GPU_Assets/RobotExpressive.glb" },
    // v4033 -- Keith: "the last avatar choice, can we swap out the gauges and avatar scene, and swap in the
    // WebGPU gauges and avatar we already made? I think that is called Avatar3000." The page is gauges3000.html
    // ("Gauges 3000" in its own demo:title -- close enough a name that the swap is unambiguous): a WebGPU
    // fragment-shader energy core ringed by an LCARS gauge cluster, with a Canvas2D fallback when WebGPU is
    // unavailable so it never needs a `needsWebGPU` gate of its own the way blobgpu does. facemuscles (Google's
    // MediaPipe blendshape face, ~12 MB on first use) is REMOVED from this rotation rather than kept alongside --
    // "swap out ... swap in" was the request, not "add"; face-mirror.html itself is untouched and still reachable
    // elsewhere (the universal viewer, direct URL), only this switch's rotation drops it.
    { id: "gauges3000", label: "\ud83c\udf00", title: "Gauges 3000 \u2014 WebGPU energy-core avatar ringed by an LCARS gauge cluster (Canvas2D fallback)", kind: "frame",
      src: "/gauges3000.html?embed=1" },

];

// v3557 -- THE ROTATION IS NOW BASE MODES PLUS PROMOTED FAVOURITES, and the favourites come from the SANDBOX'S
// store rather than a second list of our own. The switch chooses WHICH KIND of surface; the star chooses WHICH
// GLB the rigged surface shows. Two axes, kept separate, which is why the star is its own button.
let _extra = [];
export const setExtraModes = (list) => { _extra = Array.isArray(list) ? list : []; return allModes(); };
export const allModes = () => MODES.concat(_extra);

export const nextMode = (id) => {
    const all = allModes();
    const i = all.findIndex((m) => m.id === id);
    return all[(i < 0 ? 0 : i + 1) % all.length].id;
};
export const modeById = (id) => allModes().find((m) => m.id === id) || MODES[0];

const STORE_KEY = "swek.serverAvatarMode";

/**
 * Mount the switch. `host` is the element that currently holds the robot (#dialsRobot); `makeSvg` builds the
 * procedural robot, injected rather than imported so this file has no opinion about how the SVG is made.
 *
 * `probe` answers "is this mode's asset actually there" and defaults to a HEAD request. It is injectable so the
 * gate can drive the missing-asset path without a network.
 */
export function mountAvatarSwitch({ host, makeSvg, width = 143, height = 210, probe = null, store = null } = {}) {
    if (!host) return null;
    const mem = store || (() => { try { return window.localStorage; } catch { return null; } })();
    const readMode = () => { try { return (mem && mem.getItem(STORE_KEY)) || "svg"; } catch { return "svg"; } };
    const writeMode = (id) => { try { mem && mem.setItem(STORE_KEY, id); } catch {} };

    host.style.position = host.style.position || "relative";

    const btn = document.createElement("button");
    btn.id = "avatarModeBtn";
    btn.style.cssText = "position:absolute;top:2px;right:2px;z-index:5;width:22px;height:22px;padding:0;" +
        "border:1px solid var(--line);border-radius:6px;background:#0c1410cc;color:#cfe3ff;font-size:12px;" +
        "line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;";
    const note = document.createElement("div");
    note.style.cssText = "position:absolute;left:0;right:0;bottom:0;z-index:4;font:10px ui-monospace,monospace;" +
        "color:#ff9a9a;background:#0c1410dd;padding:2px 4px;border-radius:4px;display:none;text-align:center;";

    let current = null, surface = null;

    /** Tear down whatever is mounted. An iframe left in the DOM keeps rendering, so it is REMOVED, not hidden. */
    function teardown() {
        if (!surface) return;
        if (surface.tagName === "IFRAME") { try { surface.src = "about:blank"; } catch {} }
        surface.remove();
        surface = null;
    }

    function build(mode) {
        teardown();
        if (mode.kind === "svg") {
            const bot = makeSvg ? makeSvg({ width, height }) : null;
            surface = (bot && bot.el) || document.createElement("span");
            host.appendChild(surface);
            window._swekRobot = bot || null;
            return;
        }
        const f = document.createElement("iframe");
        // *** v3657 -- THE PANEL TELLS THE STAGE ITS OWN SHAPE, RATHER THAN THE STAGE GUESSING OR ME TYPING A
        // NUMBER. avatarstage frames for a landscape window; this box is 143x210, TALLER THAN IT IS WIDE, so a
        // full-body framing puts the figure off both edges -- which is what Keith saw. ?frame= is the knob v1017
        // built for exactly this ("tune diorama framing to match the phone"), and the aspect is MEASURED from the
        // box this switch is about to create, so changing width/height above cannot leave a stale constant behind.
        // Only modes that declare frameFromBox get it: sending a flag a page does not read is the defect
        // ui/avatarSwitch-embed-selfcheck.mjs exists to catch, and it would catch this one too. ***
        let src = mode.src;
        if (mode.frameFromBox && height > 0) {
            const a = Math.max(0.31, Math.min(2.99, width / height));   // the stage clamps to (0.3, 3); clamp here too
            src += (src.indexOf("?") >= 0 ? "&" : "?") + "frame=" + a.toFixed(3);
        }
        f.src = src;
        f.width = width; f.height = height;
        f.setAttribute("frameborder", "0");
        f.style.cssText = "border:0;border-radius:8px;background:#05070d;display:block;";
        f.title = mode.title;
        surface = f;
        host.appendChild(f);
    }

    // *** v3999 -- THE HOST'S MOVES, RELAYED INTO THE FRAME. ***
    //
    // ui/swekRobot.js has dispatched `swek:move` on window since v1690, and ui/pipboyWireframe.js has mirrored
    // it onto a stick figure ever since -- but that works because the pip-boy runs in the SAME window. Inside an
    // iframe `window` is the FRAME'S window, so a framed surface never hears the host's events at all.
    //
    // THE RELAY IS ONE-WAY AND CARRIES ONLY A MOVE NAME FROM A CLOSED SET. It is deliberately not "forward every
    // event to the child": a postMessage bridge that passed arbitrary payloads into a frame would be a channel
    // somebody could put anything in, and this needs to carry six words. targetOrigin is the page's own origin
    // rather than "*", because the frames are same-origin pages out of this tree and there is no reason to
    // broadcast to any other.
    const MOVE_NAMES = ["idle", "nod", "wave", "cheer", "spin", "dance", "error"];
    function relay(msg) {
        try {
            if (!surface || surface.tagName !== "IFRAME" || !surface.contentWindow) return;
            surface.contentWindow.postMessage(msg, location.origin);
        } catch (e) {}
    }
    try {
        window.addEventListener("swek:move", (e) => {
            const mv = (e && e.detail && e.detail.move) || "";
            if (MOVE_NAMES.includes(mv)) relay({ type: "swek:move", move: mv });
        });
        // the spoken ticker drives the jaw the same way it drives the SVG robot's setTalking()
        window.addEventListener("swek:talking", (e) => relay({ type: "swek:talking", on: !!(e && e.detail && e.detail.on) }));
    } catch (e) {}

    async function set(id, { announce = true } = {}) {
        const mode = modeById(id);
        // *** WEBGPU ABSENCE IS TREATED EXACTLY LIKE A MISSING FILE. *** A browser without WebGPU renders the
        // GPU blobulator as a blank canvas with a console error nobody on this page will read, which is
        // indistinguishable from a broken panel. Checked BEFORE mounting, and named when it fails.
        // v3666 -- THE VERDICT WAS RIGHT AND THE MESSAGE BLAMED THE WRONG THING. navigator.gpu really was
        // undefined; the CAUSE was that server.html is served from a LAN IP over http, and WebGPU is gated on a
        // SECURE ORIGIN. Same browser, same machine, WebGPU on webgpu.com and none here. ui/webgpuProbe.mjs now
        // owns the distinction and names the fix; this file no longer spells the test itself.
        if (mode.needsWebGPU && typeof navigator !== "undefined" && !navigator.gpu) {
            const why = describeWebGPU({ navigator,
                isSecureContext: (typeof isSecureContext !== "undefined" ? isSecureContext : undefined),
                location: (typeof location !== "undefined" ? location : {}) });
            // v3779 -- THE SHORT LINE INLINE, THE FULL ROUTES ON HOVER. The note sits beside a 223px avatar;
            // three numbered routes there dominate the panel and read as a new failure. The detail is not
            // dropped, it is moved to where somebody can ask for it.
            note.textContent = why.short || why.message;
            note.title = why.message;
            note.style.display = "block";
            current = "svg"; writeMode("svg"); build(modeById("svg"));
            btn.textContent = modeById("svg").label; btn.title = modeById("svg").title;
            return "svg";
        }
        if (mode.needs && probe) {
            const there = await probe(mode.needs);
            if (!there) {
                // FALL BACK AND SAY SO. An empty box looks like a rendering bug; a named absence does not.
                note.textContent = mode.needs.split("/").pop() + " not found \u2014 showing the SVG robot";
                note.style.display = "block";
                current = "svg"; writeMode("svg"); build(modeById("svg"));
                btn.textContent = modeById("svg").label; btn.title = modeById("svg").title;
                return "svg";
            }
        }
        note.style.display = "none";
        current = mode.id;
        if (announce) writeMode(mode.id);
        build(mode);
        btn.textContent = mode.label;
        btn.title = mode.title + "  \u2014  click to switch";
        return mode.id;
    }

    btn.addEventListener("click", () => { set(nextMode(current)); });
    host.appendChild(btn);
    host.appendChild(note);
    set(readMode(), { announce: false });

    return { el: btn, set, get current() { return current; }, next: () => set(nextMode(current)), teardown, MODES };
}

/**
 * Default probe: HEAD first, so a missing asset is detected without downloading it.
 *
 * *** v3808 -- AND A ONE-BYTE RANGED GET WHEN HEAD DOES NOT ANSWER, BECAUSE A PROBE THAT KNOWS ONLY ONE WAY TO
 * ASK REPORTS A PRESENT FILE AS ABSENT. Keith's server.html shows the RobotExpressive avatar falling back to
 * "not found" WHILE GPU_Assets/RobotExpressive.glb IS ON DISK -- 463,988 bytes of it. NOT ALL STATIC SERVERS
 * IMPLEMENT HEAD: copyparty and several simple file servers answer GET and 405 or 501 a HEAD, and this probe
 * read that refusal as ABSENCE.
 * *** THE FAILURE IS SILENT AND CONFIDENT: the switch does exactly what it should on a missing asset, prints a
 * clear note, and falls back to the SVG robot -- SO THE SYMPTOM LOOKS LIKE A DELIBERATE, WORKING CODE PATH.
 * That is what kept it from being read as a bug for as long as it was. ***
 * The Range header keeps the fallback cheap: one byte, not 464 KB.
 */
export const headProbe = async (url) => {
    try { const r = await fetch(url, { method: "HEAD" }); if (r.ok) return true; } catch { /* fall through */ }
    try {
        const r = await fetch(url, { headers: { Range: "bytes=0-0" } });
        return r.ok;            // 200 (Range ignored) and 206 (honoured) both mean THE FILE IS THERE
    } catch { return false; }
};
