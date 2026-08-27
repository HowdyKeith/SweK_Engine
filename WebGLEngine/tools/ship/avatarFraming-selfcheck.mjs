// WebGLEngine/tools/ship/avatarFraming-selfcheck.mjs -- v4033
//
// Run: node tools/ship/avatarFraming-selfcheck.mjs   (needs Chromium; skips cleanly without)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// THREE REAL AVATAR-FRAMING BUGS SHIPPED WITH ZERO RENDERING VERIFICATION, because nothing in this tree ever
// actually looked at a rendered frame of any of these three pages before this file existed:
//
//   (1) face/avatarStage.js's avatarModel() scaled the mesh from rawBBox (RobotExpressive's UNSKINNED bind
//       pose, ~0.026 units tall) while the GPU had already skinned it to its true ~4.5-unit pose BEFORE uModel
//       applies -- a ~172x compounding error. MEASURED: a headless render of avatarstage.html?glb=RobotExpressive
//       before the fix shows the diorama's pet llama alone, correctly scaled, with NO ROBOT VISIBLE AT ALL --
//       the camera sits inside solid, back-face-culled geometry.
//   (2) face/robotFaceAvatar.js's _updateRootFollow() eased the camera's look target toward joint 0's ABSOLUTE
//       world position, on the assumption (never measured) that RobotExpressive's in-place clips keep it near
//       the origin. It does not: joint 0 sits at world (-0.003, 2.370, -0.021). The offset added itself on top
//       of BODY_LOOK_Y (already the robot's own vertical mid), pointing the camera at y=4.58 -- ABOVE the
//       robot's own head (top 4.44). Keith's report, reproduced exactly: headroom above, cropped from the chest
//       down, no legs.
//   (3) blob-avatar.html's orbit camera shipped at dist:3.0 against a figure whose balls (core/head/arms/foot)
//       span roughly +-1.5 world units from origin -- so close the metaball surface fills the entire canvas
//       and no silhouette is recognisable. Keith: "A lot of the edges action on the Blob avatar scene are off
//       screen."
//
// ALL THREE ARE VERIFIED HERE BY RENDERING, not by reading source. A source-level check that the right variable
// name appears somewhere would have passed on the ORIGINAL, broken code too -- avatarModel() referencing
// rawBBox was never a syntax error, just a wrong answer that looked exactly like a right one until a real frame
// was decoded and measured. The measurement is a plain non-background pixel FRACTION of the canvas: sample the
// four corners for the background colour (adaptive, since three different pages use three different
// backgrounds), count pixels whose luminance differs from it by more than a stated margin, divide by the
// canvas area. No screenshot files are compared pixel-for-pixel -- animation timing, autonomous reactions and
// the metaball mesh's own triangulation make an exact-match baseline the wrong tool here; a coverage RANGE is
// the claim this bug class actually breaks (too little coverage: the subject is invisible or nearly so; for
// blob-avatar specifically, too MUCH coverage is the other failure mode -- a camera parked inside the geometry
// fills the frame with one indistinct near-background-toned surface).
//
// A MINIMAL PNG DECODER IS INLINED rather than a dependency, because tools/render-qa's pngjs is an opt-in
// devDependency (`cd tools/render-qa && npm install`) and this gate must run from a bare clone. It decodes
// exactly what Playwright's page.screenshot() produces: 8-bit, non-interlaced RGB or RGBA. That is a narrower
// claim than "decodes any PNG", and the narrower claim is the true one -- this never has to read a file this
// tree did not just write.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { noComments } from "./sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("avatarFraming-selfcheck -- three cameras that never had a rendered frame checked, now do\n");

// ---- 0. the fix is present in source (fast, no browser needed) ---------------------------------------------
{
    const avSrc = noComments(fs.readFileSync(path.join(ROOT, "face", "avatarStage.js"), "utf8"));
    ok("!! avatarModel() sources its scale/centering from posedBBox when available, not rawBBox alone",
        /function avatarModel\(\)\{[\s\S]{0,400}?const b=posedBBox\|\|rawBBox/.test(avSrc),
        "the mesh is already skinned to its posed size BEFORE uModel applies (A_VERT: skin() runs first) -- " +
        "a scale derived from the bind pose compounds with that, not replaces it");

    const rfSrc = noComments(fs.readFileSync(path.join(ROOT, "face", "robotFaceAvatar.js"), "utf8"));
    ok("!! _updateRootFollow() tracks DISPLACEMENT from a captured baseline, not an absolute joint position",
        /_rootFollowBaseX/.test(rfSrc) && /animator !== _rootFollowAnimatorRef/.test(rfSrc),
        "an in-place clip's root joint can sit anywhere in world space (RobotExpressive's is nowhere near the " +
        "origin) -- only MOVEMENT away from where it started means genuine locomotion");

    const blobSrc = fs.readFileSync(path.join(ROOT, "blob-avatar.html"), "utf8");
    const distMatch = blobSrc.match(/makeOrbitControls\(\{[^}]*dist:\s*([\d.]+)/);
    ok("!! blob-avatar.html's initial camera distance clears the figure's own extent (balls span roughly +-1.5)",
        distMatch && parseFloat(distMatch[1]) >= 5.0,
        "dist=" + (distMatch ? distMatch[1] : "not found") + " -- 3.0 (the shipped default) put the camera " +
        "inside the metaball surface; the figure needs meaningfully more room than its own half-extent");
}

// ---- minimal PNG decoder: 8-bit, non-interlaced RGB/RGBA only, exactly what page.screenshot() writes -------
function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
function decodePNG(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
    let off = 8, width = 0, height = 0, colorType = 0;
    const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
        const data = buf.subarray(off + 8, off + 8 + len);
        if (type === "IHDR") {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            if (data.readUInt8(8) !== 8) throw new Error("only 8-bit PNG supported");
            colorType = data.readUInt8(9);
            if (data.readUInt8(12) !== 0) throw new Error("interlaced PNG not supported");
        } else if (type === "IDAT") idat.push(data);
        else if (type === "IEND") break;
        off += 8 + len + 4;
    }
    const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : (() => { throw new Error("unsupported color type " + colorType); })();
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels, out = Buffer.alloc(height * stride);
    let rp = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[rp++], rowStart = y * stride, prevRowStart = (y - 1) * stride;
        for (let x = 0; x < stride; x++) {
            const rb = raw[rp++];
            const a = x >= channels ? out[rowStart + x - channels] : 0;
            const b = y > 0 ? out[prevRowStart + x] : 0;
            const c = (y > 0 && x >= channels) ? out[prevRowStart + x - channels] : 0;
            let v;
            if (filter === 0) v = rb; else if (filter === 1) v = (rb + a) & 0xff; else if (filter === 2) v = (rb + b) & 0xff;
            else if (filter === 3) v = (rb + ((a + b) >> 1)) & 0xff; else if (filter === 4) v = (rb + paeth(a, b, c)) & 0xff;
            else throw new Error("bad PNG filter type " + filter);
            out[rowStart + x] = v;
        }
    }
    return { width, height, channels, data: out };
}

// adaptive background subtraction: sample the four corners for the page's own background colour (three
// different pages, three different backgrounds), then count pixels whose luminance departs from it.
function subjectFraction(img) {
    const { width, height, channels, data } = img;
    const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
    const corners = [[0, 0], [width - 10, 0], [0, height - 10], [width - 10, height - 10]];
    let bl = 0, bn = 0;
    for (const [cx, cy] of corners) for (let y = cy; y < cy + 10; y++) for (let x = cx; x < cx + 10; x++) {
        const i = (y * width + x) * channels; bl += lum(data[i], data[i + 1], data[i + 2]); bn++;
    }
    const bg = bl / bn;
    let drawn = 0;
    for (let i = 0; i < data.length; i += channels) if (Math.abs(lum(data[i], data[i + 1], data[i + 2]) - bg) > 12) drawn++;
    return drawn / (width * height);
}

// ---- 1. the browser half -------------------------------------------------------------------------------------
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) {
    console.log("\navatarFraming-selfcheck: the source half passed; the render half SKIPPED -- " + skip);
    process.exit(fails ? 1 : 0);
}

const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
async function shotFraction(url, selector) {
    const page = await (await b.newContext({ viewport: { width: 900, height: 700 } })).newPage();
    await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        const p = path.join(ROOT, decodeURIComponent(u.pathname));
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            const ext = path.extname(p);
            const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html"
                : ext === ".glb" ? "model/gltf-binary" : ext === ".json" ? "application/json" : "text/plain";
            return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
        }
        return route.fulfill({ status: 404, body: "not found" });
    });
    await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(3500);
    const buf = await page.locator(selector).screenshot().catch(() => null);
    await page.close();
    if (!buf) return null;
    return subjectFraction(decodePNG(buf));
}

// page.route intercepts every request regardless of origin, so any http(s) URL works as the base.
async function shot2(urlPath, selector) { return shotFraction("http://localhost/" + urlPath, selector); }

let robot, stage, blob;
try { robot = await shot2("RobotExpressive.html", "#robot-canvas"); } catch (e) { robot = { error: String(e && e.message || e) }; }
try { stage = await shot2("avatarstage.html?glb=RobotExpressive", "#stageCanvas"); } catch (e) { stage = { error: String(e && e.message || e) }; }
try { blob = await shot2("blob-avatar.html", "#c"); } catch (e) { blob = { error: String(e && e.message || e) }; }
await b.close();

if (typeof robot === "number") {
    // v4033 -- 0.08 was the first guess and it was too loose: a LIVE sabotage of _updateRootFollow (reverting
    // it to ease toward joint 0's absolute position) rendered at 0.1315, comfortably above 0.08, so the render
    // check passed on genuinely broken code and only the source check above caught it. MEASURED broken range
    // is 0.13-0.15 (both the archived pre-fix screenshot and the live sabotage land there); fixed is 0.20-0.30.
    // 0.17 sits in the gap with margin on both sides.
    ok("!! RobotExpressive.html renders a substantial, in-frame figure (v4033 root-follow fix)",
        robot > 0.17, "subject fraction " + robot.toFixed(4) + " -- the pre-fix render (root joint's absolute " +
        "position pushing the camera above the head) measures 0.13-0.15 on a cropped chest-up view; a correctly " +
        "framed full figure measures 0.20-0.30 across several poses");
} else {
    ok("!! RobotExpressive.html renders a substantial, in-frame figure (v4033 root-follow fix)", false,
        "render failed: " + JSON.stringify(robot));
}

if (typeof stage === "number") {
    ok("!! avatarstage.html?glb=RobotExpressive shows the avatar at all (v4033 avatarModel scale fix)",
        stage > 0.06, "subject fraction " + stage.toFixed(4) + " -- the pre-fix render showed the pet llama " +
        "ALONE at 0.035 (the ~172x-oversized robot's camera sat inside solid geometry); fixed renders measure " +
        "0.12-0.18 across diorama/focus/duo scenes");
} else {
    ok("!! avatarstage.html?glb=RobotExpressive shows the avatar at all (v4033 avatarModel scale fix)", false,
        "render failed: " + JSON.stringify(stage));
}

if (typeof blob === "number") {
    ok("!! blob-avatar.html frames the figure within the canvas, neither invisible nor filling the whole frame",
        blob > 0.05 && blob < 0.55, "subject fraction " + blob.toFixed(4) + " -- the pre-fix dist:3.0 camera " +
        "sat inside the metaball surface (measured near 1.0, one indistinct curved surface edge-to-edge); " +
        "fixed renders across idle/wave/dance measure 0.17-0.24");
} else {
    ok("!! blob-avatar.html frames the figure within the canvas, neither invisible nor filling the whole frame",
        false, "render failed: " + JSON.stringify(blob));
}

// ---- v4052: THE PET LLAMA'S HEAD ACTUALLY SITS ON ITS NECK -------------------------------------------------
// Keith: "could we put the avatar pet head on top of the neck, and the neck is half the height?"
//
// *** THE HEAD WAS ALREADY IN THE RIGHT PLACE. THE NECK HAD A FLIPPED SIGN AND ROUGHLY DOUBLE THE LENGTH. ***
// buildCylinder spans y 0->1 (base at the origin, NOT centred), so the neck's top cap is
// base + len*(0, cos tilt, sin tilt). As drawn -- base (0,0.46,0.13), tilt -0.5, len 0.30 -- that top landed at
// (0, 0.723, -0.014): up and BACKWARD, toward the tail. The head was drawn at (0, 0.60, 0.22), so it floated
// 0.12 below and 0.23 forward of the neck's end, and the neck pointed at nothing.
//
// SOLVED BACKWARD FROM THE HEAD'S OWN COORDINATES, the neck it was placed for has tilt
// atan2(0.22-0.13, 0.60-0.46) = +0.571 rad and length hypot(...) = 0.1664. So the tilt SIGN was inverted and
// the length was nearly doubled -- two independent errors -- and Keith's eyeballed "half the height"
// (0.30 -> 0.15) lands within 0.017 of the length the head itself implies. The head barely moved.
//
// The head is DERIVED from the neck now rather than typed as a second position, which is the whole reason the
// two could disagree; these checks hold that, and hold the tilt pointing at the NOSE rather than the tail.
{
    const AS = noComments(fs.readFileSync(path.join(ROOT, "face", "avatarStage.js"), "utf8"));
    const num = (re) => { const m = AS.match(re); return m ? parseFloat(m[1]) : NaN; };
    const base = (() => { const m = AS.match(/const NECK_BASE=\[([-\d.]+),([-\d.]+),([-\d.]+)\]/); return m ? [+m[1], +m[2], +m[3]] : null; })();
    const tilt = num(/NECK_TILT=([-\d.]+)/), len = num(/NECK_LEN=([-\d.]+)/);

    ok("!! the llama's neck is described by named constants, not three hand-typed transforms",
        !!base && Number.isFinite(tilt) && Number.isFinite(len),
        base ? "base " + JSON.stringify(base) + ", tilt " + tilt + ", len " + len : "NECK_BASE/TILT/LEN not found");

    ok("!! *** the HEAD is DERIVED from the neck, so the two cannot drift apart again ***",
        /const HEAD=\[NECK_BASE\[0\], NECK_BASE\[1\]\+NECK_LEN\*Math\.cos\(NECK_TILT\), NECK_BASE\[2\]\+NECK_LEN\*Math\.sin\(NECK_TILT\)\]/.test(AS.replace(/\s+/g, " ")),
        "a second hand-typed position IS the defect -- the head was at (0,0.60,0.22) while the neck ended at (0,0.723,-0.014)");

    ok("!! ...and the head/snout/ears are drawn from HEAD, never from absolute coordinates",
        /mTranslate\(HEAD\[0\],HEAD\[1\],HEAD\[2\]\)/.test(AS) &&
        /mTranslate\(HEAD\[0\],HEAD\[1\]-0\.03,HEAD\[2\]\+0\.11\)/.test(AS) &&
        /mTranslate\(HEAD\[0\]\+sx\*0\.045,HEAD\[1\]\+0\.10,HEAD\[2\]-0\.03\)/.test(AS),
        "the face has to travel WITH the head, or fixing the head just moves the gap to the snout");

    if (base && Number.isFinite(tilt) && Number.isFinite(len)) {
        // *** THE SIGN. *** The snout is drawn at HEAD z +0.11 and the tail at z -0.26, so +z IS the nose
        // direction. A negative tilt leans the neck toward the TAIL, which is exactly the shipped bug.
        ok("!! *** the neck leans toward the NOSE (+z), not the tail -- the sign that was inverted ***",
            tilt > 0, "tilt " + tilt + " rad; the snout sits at +z and the tail at -0.26, so a negative tilt " +
            "puts the head over the llama's own back");

        // and the length agrees with what the head's original placement implied (0.1664), i.e. Keith's "half".
        const IMPLIED = Math.hypot(0.60 - base[1], 0.22 - base[2]);
        ok("!! ...and the neck length matches the one the head's own original position implied",
            Math.abs(len - IMPLIED) < 0.03,
            "len " + len + " vs " + IMPLIED.toFixed(4) + " implied by the head at (0,0.60,0.22) -- the old 0.30 " +
            "was off by " + (0.30 - IMPLIED).toFixed(4) + ", which is why the head floated clear of it");

        const top = [base[0], base[1] + len * Math.cos(tilt), base[2] + len * Math.sin(tilt)];
        ok("!! ...and the resulting head still lands where the llama already looked right (it barely moved)",
            Math.abs(top[1] - 0.60) < 0.05 && Math.abs(top[2] - 0.22) < 0.05,
            "head now (" + top.map((n) => n.toFixed(3)).join(", ") + ") vs the old hand-placed (0, 0.600, 0.220) " +
            "-- fixing the neck must not restyle the pet, only connect it");
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
