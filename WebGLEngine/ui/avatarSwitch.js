// WebGLEngine/ui/avatarSwitch.js — v3555
// ---------------------------------------------------------------------------------------------------------------
// THE AVATAR CORNER BUTTON — three surfaces in one box, and only ever ONE of them alive.
//
// server.html shows the SVG robot beside the gauges. This adds a small button at the TOP RIGHT OF THE AVATAR
// PANEL that rotates it through three, all framed in the same box so the layout never moves:
//
//     svg    -- ui/swekRobot.js, the procedural robot with the brain. Cheap, always available, turns red on errors.
//     rigged -- RobotExpressive, the real rigged GLB, through avatarstage with camdock=1 so the panel owns the
//               camera and the in-iframe selfie button is hidden. Framed identically to the avatar view.
//     blob   -- blob-avatar.html, the Blobulator kept as an avatar (Avataro / Avatarina).
//
// *** THIS IS DELIBERATELY NOT THE SANDBOX'S AVATAR ROTATION. *** The main render window already cycles avatars,
// and Keith asked specifically that it not be swapped in here. Two rotations that look alike and mean different
// things is worse than one -- so this carries its OWN three-entry list, and touching the sandbox's is out of
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
    { id: "blob", label: "\ud83e\udee7", title: "Blobulator avatar — Avataro / Avatarina, the reactive metaball avatar", kind: "frame",
      src: "/blob-avatar.html?embed=1" },
    // v3556 -- the two heavy ones, added last on purpose. Each carries a `heavy` note so the button can say what
    // it is about to cost BEFORE the click, rather than after the download starts.
    { id: "blobgpu", label: "\u26a1", title: "Blobulator GPU — WebGPU raymarched SDF (needs a WebGPU browser)", kind: "frame",
      src: "/blobulator-gpu.html?embed=1", heavy: "WebGPU", needsWebGPU: true },
    { id: "thead", label: "\ud83d\udde3", title: "Talking head — MediaPipe face tracking and speech (~12 MB on first use)", kind: "frame",
      src: "/thead.html?embed=1", heavy: "~12 MB MediaPipe bundle on first use" },
    // v3998 -- THE FACE-MUSCLES SURFACE, PLACED DELIBERATELY AS THE NEXT STOP AFTER THE TALKING HEAD.
    // Keith: "we added the Google face muscles api ability, can we rotate that as the next choice after
    // Wireframe?" -- the POSITION is the request, and the two belong adjacent for a reason: the talking head is
    // driven by AUDIO AMPLITUDE and this one by MediaPipe FaceLandmarker BLENDSHAPES, which is Google's own name
    // for muscle activations. Same idea, opposite input, one click apart on the switch.
    //
    // It carries the SAME ~12 MB warning because it is the SAME MediaPipe bundle -- and if the talking head has
    // already been opened this session the model is cached, so the second of the pair is usually instant. The
    // warning is still stated rather than guessed: a button that promises "instant" and then downloads 12 MB is
    // worse than one that over-warns.
    { id: "facemuscles", label: "\ud83d\ude2e", title: "Face muscles \u2014 MediaPipe blendshapes driving a face from your camera (~12 MB on first use)", kind: "frame",
      src: "/face-mirror.html?embed=1", heavy: "~12 MB MediaPipe bundle on first use" },
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
