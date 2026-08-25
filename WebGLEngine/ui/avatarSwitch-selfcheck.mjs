// WebGLEngine/ui/avatarSwitch-selfcheck.mjs — v3555
//
// Run: node ui/avatarSwitch-selfcheck.mjs   (~0.1s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// Three avatar surfaces in one box on server.html, rotated by a corner button: the SVG robot, RobotExpressive
// through avatarstage, and the Blobulator avatar.
//
// *** THE LOAD-BEARING RULE IS THAT ONLY ONE IS EVER MOUNTED. *** Two of the three are iframes running WebGL,
// and hiding an iframe with display:none LEAVES IT RENDERING -- a second GPU context burning frames behind a
// panel nobody is looking at, on a page whose entire job is showing you what the machine is doing. So switching
// TEARS DOWN the previous surface. The SVG mode then costs nothing, which matters because it is the default.
//
// AND THE SVG IS THE FALLBACK RATHER THAN AN EQUAL: if the rigged GLB is absent -- it was missing from the
// release entirely until v3554 -- the panel returns to the SVG robot AND NAMES THE MISSING FILE, because an
// empty box looks like a rendering bug and a named absence does not.
//
// The DOM here is a small stub rather than a browser: what is being checked is the SWITCHING LOGIC, and that is
// the part that can be wrong in a way nobody notices.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODES, nextMode, modeById, mountAvatarSwitch, headProbe } from "./avatarSwitch.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- a DOM stub just big enough to drive the module ---------------------------------------------------------
function stubDom() {
    const mk = (tag) => {
        const el = {
            tagName: tag.toUpperCase(), style: {}, children: [], dataset: {}, _events: {},
            appendChild(c) { this.children.push(c); c._parent = this; return c; },
            remove() { const p = this._parent; if (p) p.children = p.children.filter((x) => x !== this); },
            setAttribute(k, v) { this[k] = v; }, addEventListener(k, f) { this._events[k] = f; },
            click() { this._events.click && this._events.click(); },
        };
        return el;
    };
    global.document = { createElement: mk };
    global.window = {};
    return mk;
}
const mk = stubDom();
const store = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; })();
const iframes = (host) => host.children.filter((c) => c.tagName === "IFRAME");

// ---- 1. THREE MODES, CYCLING, WRAPPING ------------------------------------------------------------------------
{
    ok("!! six surfaces, cheapest first: SVG robot, rigged GLB, Blobulator, WebGPU Blobulator, talking head, face muscles",
       MODES.length === 6 && MODES.map((m) => m.id).join(",") === "svg,rigged,blob,blobgpu,thead,facemuscles",
       MODES.map((m) => m.id).join(" -> ") + " — the HEAVY ones are LAST on purpose, so a stray click lands " +
       "on something cheap rather than starting a 12 MB download");
    ok("!! the button cycles and WRAPS, so it cannot dead-end on the last one",
       nextMode("svg") === "rigged" && nextMode("rigged") === "blob" && nextMode("blob") === "blobgpu"
       && nextMode("blobgpu") === "thead" && nextMode("thead") === "facemuscles" && nextMode("facemuscles") === "svg");
    // v3998 -- Keith: "we added the Google face muscles api ability, can we rotate that as the next choice after
    // Wireframe?" The POSITION is the request, so a later reorder that kept both modes but separated them would
    // be a silent undo of it. Asserted as ADJACENCY rather than as an index, so inserting a cheap mode earlier
    // in the list stays free.
    ok("!! *** the face-muscles surface is the NEXT CHOICE AFTER the talking head ***",
       MODES.findIndex((m) => m.id === "facemuscles") === MODES.findIndex((m) => m.id === "thead") + 1,
       "audio amplitude drives one and MediaPipe blendshapes -- Google's own word for muscle activations -- " +
       "drive the other: same idea, opposite input, and they belong one click apart");
    // ...and the cheap-first principle above has to SURVIVE the addition, or the note explaining it is decoration
    ok("!! ...and every heavy surface is still at the END, which is what makes a stray click safe",
       MODES.map((m) => !!m.heavy).lastIndexOf(false) < MODES.findIndex((m) => !!m.heavy),
       MODES.map((m) => m.id + (m.heavy ? "*" : "")).join(" -> ") + "   (* = declares a download cost)");
    ok("!! the three expensive modes DECLARE their cost, so the button can say it before the click",
       MODES.filter((m) => m.heavy).length === 3 &&
       /12 MB/.test(MODES.find((m) => m.id === "thead").heavy) &&
       /12 MB/.test(MODES.find((m) => m.id === "facemuscles").heavy) &&
       /WebGPU/.test(MODES.find((m) => m.id === "blobgpu").heavy),
       "MediaPipe is ~12 MB on first use and WebGPU is not everywhere — a cost discovered after the click is a " +
       "cost the reader never agreed to");
    ok("!! ...and the talking head is the MediaPipe one (a Google API) rather than the wireframe or the mirror",
       /thead\.html/.test(MODES.find((m) => m.id === "thead").src),
       "thead.html carries BOTH MediaPipe face tracking and speechSynthesis; face-mirror.html tracks without " +
       "speaking and face.html speaks without tracking");
    // I ASSERTED "rigged" HERE AND THE RIGHT ANSWER IS "svg". An unrecognised stored mode should land on the
    // FIRST surface, not the second: the first is the cheap default, and a value written by an older build has
    // no claim on which mode you meant. The code was right; the expectation was not.
    ok("...and an unknown mode falls to the FIRST rather than throwing",
       nextMode("nonsense") === "svg" && modeById("nonsense").id === "svg",
       "a stored value from an older build must not brick the panel, and must not silently pick a heavy mode");
    ok("!! the rigged mode uses camdock=1 so the PANEL owns the camera, framed as the avatar view",
       /camdock=1/.test(modeById("rigged").src) && /glb=RobotExpressive/.test(modeById("rigged").src),
       modeById("rigged").src);
    ok("...and the blob mode points at the Blobulator AVATAR, not the stage or the studio",
       /blob-avatar\.html/.test(modeById("blob").src),
       modeById("blob").src + " — Avataro / Avatarina, the reactive metaball avatar");
}

// ---- 2. *** ONLY ONE SURFACE IS EVER MOUNTED. *** ----------------------------------------------------------------
{
    const host = mk("span");
    let made = 0;
    const sw = mountAvatarSwitch({ host, makeSvg: () => { made++; return { el: mk("span") }; },
                                   probe: async () => true, store });
    ok("!! it starts on the SVG robot, and no iframe exists at all",
       sw.current === "svg" && iframes(host).length === 0 && made === 1,
       "the default mode costs nothing, which is why it is the default");
    await sw.set("rigged");
    ok("!! switching to the rigged GLB mounts exactly one iframe",
       iframes(host).length === 1, iframes(host).length + " iframe(s)");
    // *** THIS CAUGHT THE WEBGPU FALLBACK WORKING AND MY TEST NOT EXPECTING IT. *** Node defines `navigator`
    // with no `.gpu`, so set("blobgpu") correctly refused and returned to the SVG robot -- the code was right and
    // the assertion assumed a browser. Both paths are now checked, which is more than the original asked for.
    const noGpu = await sw.set("blobgpu");
    ok("!! without WebGPU the GPU blobulator REFUSES and returns to the SVG robot",
       noGpu === "svg" && iframes(host).length === 0,
       "a browser without WebGPU renders that page as a blank canvas with a console error nobody on this page " +
       "will read, which is indistinguishable from a broken panel");
    // navigator is getter-only on Node 22, so it is REDEFINED rather than assigned
    Object.defineProperty(globalThis, "navigator", { value: { gpu: {} }, configurable: true, writable: true });
    await sw.set("blobgpu");
    ok("!! a THIRD switch still leaves exactly one iframe — the cost does not accumulate across six modes",
       iframes(host).length === 1 && /blobulator-gpu/.test(iframes(host)[0].src),
       "six surfaces and one context: with two WebGL frames and a WebGPU one in the list, an accumulating panel " +
       "would be running three renderers behind a gauge row");
    await sw.set("blob");
    ok("!! ...and switching again REPLACES it rather than adding a second",
       iframes(host).length === 1 && /blob-avatar/.test(iframes(host)[0].src),
       "hiding an iframe with display:none leaves it RENDERING — a second WebGL context burning frames behind a " +
       "panel nobody is looking at, on the page whose job is showing you what the machine is doing");
    await sw.set("svg");
    ok("!! returning to the SVG tears the iframe down completely",
       iframes(host).length === 0,
       "and it is REMOVED rather than blanked, so nothing survives to be re-shown by a stray style change");
}

// ---- 3. *** A MISSING ASSET FALLS BACK AND SAYS WHICH FILE. *** -----------------------------------------------------
{
    const host = mk("span");
    const sw = mountAvatarSwitch({ host, makeSvg: () => ({ el: mk("span") }),
                                   probe: async (u) => !/RobotExpressive/.test(u), store });
    const landed = await sw.set("rigged");
    ok("!! with the GLB absent, the rigged mode falls back to the SVG robot",
       landed === "svg" && iframes(host).length === 0,
       "rather than mounting an iframe that renders an empty stage");
    // FOUND BY ITS TEXT, NOT BY ITS COLOUR. The first version looked for style.color, and this stub stores
    // cssText without parsing it into properties -- so the finder failed while the code was correct. A test that
    // depends on the stub understanding CSS is testing the stub.
    // MATCHED ON THE MESSAGE, because the button is appended before the note and "first child with text" found
    // the button's emoji instead. Two fixes to one finder: the stub does not parse cssText, and order is not
    // identity.
    const noteEl = host.children.find((c) => typeof c.textContent === "string" && /not found/.test(c.textContent));
    ok("!! ...and it NAMES THE MISSING FILE rather than failing silently",
       noteEl && /RobotExpressive\.glb not found/.test(noteEl.textContent || ""),
       noteEl ? '"' + noteEl.textContent + '"' : "no note rendered — an empty box looks like a rendering bug, a named absence does not");
    ok("...and the blob mode, which needs no asset, still works",
       (await sw.set("blob")) === "blob" && iframes(host).length === 1,
       "one missing asset must not disable the mode that does not use it");
}

// ---- 4. THE SANDBOX ROTATION IS DELIBERATELY UNTOUCHED --------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "ui/avatarSwitch.js"), "utf8");
    ok("!! this carries its OWN three-entry list and does not import the sandbox's avatar cycle",
       !/avatarRegistry|PipAvatar|listenerMenu/.test(src),
       "the main render window already cycles avatars and Keith asked that it not be swapped in here. Two " +
       "rotations that look alike and mean different things is worse than one, so the separation is BY DESIGN " +
       "rather than by omission — and this check is what keeps it that way");
}

// ---- 5. AND server.html USES IT RATHER THAN A SECOND COPY ------------------------------------------------------------
{
    const h = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("!! server.html mounts the switch on the avatar host",
       /mountAvatarSwitch/.test(h) && /dialsRobot/.test(h),
       "and the SVG builder is INJECTED, so this module has no opinion about how the robot is made and there is " +
       "one declaration of that");
}

// ---- THE PROBE ANSWERS TWO KINDS OF SERVER (v3808) ---------------------------------------------------------
// *** KEITH'S server.html SHOWED THE RobotExpressive AVATAR FALLING BACK WHILE GPU_Assets/RobotExpressive.glb
// SITS ON DISK -- 463,988 bytes of it. The probe asked with HEAD and nothing else, and NOT ALL STATIC SERVERS
// IMPLEMENT HEAD: copyparty and several simple file servers answer GET and refuse HEAD with 405 or 501, which
// this probe read as ABSENCE.
// *** THE FAILURE WAS SILENT AND CONFIDENT: the switch did exactly what it should on a missing asset, printed
// a clear note and fell back to the SVG robot -- SO THE SYMPTOM LOOKED LIKE A DELIBERATE, WORKING CODE PATH.
// That is what kept it from reading as a bug. ***
{
    const realFetch = globalThis.fetch;
    try {
        globalThis.fetch = async (u, o) => ((o && o.method === "HEAD") ? { ok: false, status: 405 } : { ok: true, status: 206 });
        ok("!! *** A HEAD-LESS SERVER NO LONGER REPORTS A PRESENT FILE AS ABSENT ***",
            (await headProbe("/GPU_Assets/RobotExpressive.glb")) === true,
            "HEAD refused with 405, the ranged GET answered 206. *** A PROBE THAT KNOWS ONLY ONE WAY TO ASK " +
            "REPORTS A PRESENT FILE AS ABSENT ***");
        globalThis.fetch = async () => ({ ok: false, status: 404 });
        ok("!! and an ABSENT file is still absent, so this is not a loosening",
            (await headProbe("/nope.glb")) === false,
            "both requests refused. The fallback must widen HOW IT ASKS, never WHAT COUNTS AS PRESENT");
        globalThis.fetch = async (u, o) => ((o && o.method === "HEAD") ? { ok: true } : { ok: false });
        ok("!! and a server that DOES answer HEAD is never asked twice",
            (await headProbe("/x.glb")) === true,
            "the ranged GET is a FALLBACK, not a second request on the happy path -- it costs one byte and only " +
            "when HEAD has already failed");
    } finally { globalThis.fetch = realFetch; }
}

console.log(fails ? ("[avatarSwitch-selfcheck] FAILED " + fails) : "[avatarSwitch-selfcheck] all passed");
process.exit(fails ? 1 : 0);
