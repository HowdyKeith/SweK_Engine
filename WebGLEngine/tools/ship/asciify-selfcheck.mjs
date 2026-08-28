// WebGLEngine/tools/ship/asciify-selfcheck.mjs
//
// Run: node tools/ship/asciify-selfcheck.mjs   (~3.7s -- MEASURED)
//
// v3322 -- ASCII RENDERING, TAKEN AS A TECHNIQUE RATHER THAN AS A DEPENDENCY.
//
// Keith on DavidHDev/canvas-ui: "the ascii object is amazing. if we could view our avatar or other 3d objects
// through that, that would be very cool." Their components are React/Vue/Svelte source. *** THE TECHNIQUE NEEDS
// NOTHING: luminance into a character ramp is arithmetic over pixels. *** So the module takes RGBA in and
// returns text -- no canvas, no DOM, no GL -- which is exactly what makes the whole claim checkable on a box
// with no GPU.
//
// AND IT ALSO ANSWERS THE npm QUESTION HONESTLY. The bar is not "npm is bad": the ai-bridge already installs
// packages. It is that NOTHING IN WebGLEngine/*.html MAY NEED COMPILING, because a phone peer opens those pages
// in a browser with no toolchain. An idea ports; a build step is a permanent cost paid by every peer.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noComments, codeOnly } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const { asciify, glyphFor, RAMP, CELL_ASPECT, toColoredHTML } =
    await import(pathToFileURL(path.join(ROOT, "tools", "render-qa", "asciify.mjs")).href);
const page = fs.readFileSync(path.join(ROOT, "ascii-object.html"), "utf8");
// v3331 -- THE NO-CONTEXT MESSAGE IS TEXT THE PAGE SHOWS A PERSON, NOT A COMMENT ABOUT IT. So the assertion runs
// through noComments (comments stripped, STRINGS KEPT) rather than prose(): matching raw would let a commented-out
// copy of the sentence satisfy a check about what the page RENDERS, which is the false pass this view exists to stop.
const pageNC = noComments(page);

const solid = (w, h, r, g, b, a = 255) => {
    const p = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < p.length; i += 4) { p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = a; }
    return p;
};

{
    ok("!! *** brightness picks the glyph: black is the ramp's first, white its last ***",
        asciify(solid(20, 20, 0, 0, 0), 20, 20, { cols: 4 }).text[0] === RAMP[0] &&
        asciify(solid(20, 20, 255, 255, 255), 20, 20, { cols: 4 }).text[0] === RAMP[RAMP.length - 1],
        "the entire claim in one line, and it is checkable without a GPU because the module takes PIXELS, not a " +
        "canvas. THAT SEPARATION IS WHAT MAKES THIS A GATE INSTEAD OF A SCREENSHOT");

    // *** REC. 601 LUMA, NOT A FLAT MEAN. *** A flat (r+g+b)/3 makes pure green and pure blue equally bright --
    // and SweK's entire palette is green, so that is the one channel a naive average gets most wrong here.
    const g = asciify(solid(8, 8, 0, 255, 0), 8, 8, { cols: 2 }).text[0];
    const b = asciify(solid(8, 8, 0, 0, 255), 8, 8, { cols: 2 }).text[0];
    ok("!! ...and green is far brighter than blue, because it is luma and not a flat mean",
        RAMP.indexOf(g) > RAMP.indexOf(b) + 3,
        "green -> '" + g + "', blue -> '" + b + "'. A FLAT MEAN WOULD MAKE THEM IDENTICAL, and SweK's palette is " +
        "green from end to end -- the exact case that would have looked fine and been wrong");

    ok("!! *** transparent becomes SPACE, not the darkest glyph ***",
        asciify(solid(8, 8, 0, 0, 0, 0), 8, 8, { cols: 2 }).text[0] === " ",
        "a transparent background averages to ZERO LUMINANCE and would fill the frame with a solid block -- an " +
        "object silhouetted on darkness, which is the opposite of what an ASCII view is for. Alpha is ASKED " +
        "ABOUT rather than assumed away");
}
{
    // A SQUARE INPUT MUST NOT PRODUCE A SQUARE GRID. Cells are ~2:1, so sampling square cells stretches the
    // image vertically -- the step naive ASCII renderers skip and the reason most come out squashed.
    const r = asciify(solid(100, 100, 128, 128, 128), 100, 100, { cols: 50 });
    ok("!! ...and the cell aspect is corrected 2:1, so a circle stays a circle",
        r.rows === 25 && CELL_ASPECT === 2,
        r.cols + " cols x " + r.rows + " rows from a square frame. HALF AS MANY ROWS AS COLUMNS IS THE CORRECTION; " +
        "equal counts would mean the renderer never made it");

    ok("...and the ramp is short on purpose",
        RAMP.length === 10,
        "a seventy-character ramp looks impressive and QUANTISES NOISE INTO VISIBLE BANDS, because adjacent " +
        "glyphs stop differing in perceived weight. Short and honest beats long and decorative");

    let threw = 0;
    try { asciify(null, 10, 10); } catch { threw++; }
    try { asciify(solid(4, 4, 0, 0, 0), 4, 4, { cols: 0 }); } catch { threw++; }
    ok("...and bad input refuses rather than returning empty text",
        threw === 2,
        "empty text renders as a blank panel and reads as 'the source did not load' -- the convincing-nothing " +
        "failure this tree has refused five times");
}
{
    ok("!! *** the page's source is the REAL wireframe head module, not a copy of its shape ***",
        /face\/wireframeHead\.js/.test(page) && /buildWireframeHead\(THREE\)/.test(page),
        "the same module thead.html draws and the Pip-Boy's screen 1 renders (v3239, v3240). ONE DEFINITION, " +
        "THREE CONSUMERS -- if the head changes, this changes, which is the whole reason it was extracted");

    ok("!! ...and it flips readPixels' bottom-up rows",
        /H - 1 - y/.test(page),
        "readPixels returns BOTTOM-UP and asciify walks top-down. Without the flip the head renders UPSIDE DOWN " +
        "and looks like a bug in the sampler rather than a coordinate convention");

    ok("...and a missing WebGL context is NAMED, not left blank",
        /no WebGL context/.test(pageNC) && /What is missing here is the SOURCE FRAME/.test(pageNC),
        "the sampler needs no GPU and is gated headlessly; only the SOURCE FRAME does. An empty pre would blame " +
        "the wrong half");
}

// ---- COLOR, ADDITIVE AND OFF BY DEFAULT (v4049) -----------------------------------------------------------------------
// Keith: "monochrome by default, but we would want to be able to switch to color." The glyph choice is still
// LUMA ALONE either way -- color is a second fact reported about a cell, not a second scheme for picking its
// character -- so these checks assert the two never diverge on which glyph is chosen, only on what colors comes back.
{
    const mono = asciify(solid(8, 8, 10, 200, 30), 8, 8, { cols: 2 });
    ok("!! by default there is no colors field at all -- existing callers pay nothing for a feature they don't use",
        mono.colors === undefined, JSON.stringify(mono));

    const col = asciify(solid(8, 8, 10, 200, 30), 8, 8, { cols: 2, color: true });
    ok("!! {color:true} does not change WHICH GLYPH a cell gets -- only adds a second fact about it",
        col.text === mono.text, "mono: " + JSON.stringify(mono.text) + "  colored: " + JSON.stringify(col.text));
    ok("!! ...and the color it reports is the cell's real average RGB, not a re-derived approximation",
        Array.isArray(col.colors) && col.colors[0][0][0] === 10 && col.colors[0][0][1] === 200 && col.colors[0][0][2] === 30,
        JSON.stringify(col.colors));

    const trans = asciify(solid(8, 8, 200, 30, 30, 0), 8, 8, { cols: 2, color: true });
    ok("!! a transparent (space) cell reports null, not the color underneath the alpha it was told to ignore",
        trans.text[0] === " " && trans.colors[0][0] === null,
        "text='" + trans.text[0] + "' color=" + JSON.stringify(trans.colors[0][0]));

    let threwColor = 0;
    try { toColoredHTML(mono); } catch { threwColor++; }
    ok("!! toColoredHTML refuses a result that was never asciify()'d with {color:true}",
        threwColor === 1, "a monochrome result has no .colors to render, and silently producing plain HTML from " +
        "it would look like 'color mode' rendered nothing rather than reporting it was never asked for");

    // TWO cells, SAME color -- must merge into ONE span, not two. A colored grid rebuilt every frame as one
    // span per glyph is thousands of DOM nodes a run-length pass removes for free on any roughly-continuous surface.
    const twoSame = asciify(solid(16, 8, 80, 160, 40), 16, 8, { cols: 2, color: true });
    const htmlSame = toColoredHTML(twoSame);
    ok("!! two adjacent same-colored cells become ONE span, not one span per glyph",
        (htmlSame.match(/<span/g) || []).length === 1 && /rgb\(80,160,40\)/.test(htmlSame),
        htmlSame);

    // Build a frame whose left half is red and right half is blue -- two colors, must be two spans, one per run.
    const halfHalf = new Uint8ClampedArray(16 * 8 * 4);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        const isLeft = x < 8;
        halfHalf[i] = isLeft ? 220 : 20; halfHalf[i + 1] = 20; halfHalf[i + 2] = isLeft ? 20 : 220; halfHalf[i + 3] = 255;
    }
    const halfRes = asciify(halfHalf, 16, 8, { cols: 4, color: true });
    const halfHtml = toColoredHTML(halfRes);
    // 4 cols, left two red and right two blue -- a REAL color change must still break the run: exactly 2 spans
    // (one red, one blue), not 1 (merged across the change) and not 4 (merging never happening at all).
    ok("!! a real color CHANGE across a row still splits the run -- not merged away, not exploded to one-per-glyph",
        (halfHtml.match(/<span/g) || []).length === 2 &&
        /rgb\(220,20,20\)/.test(halfHtml) && /rgb\(20,20,220\)/.test(halfHtml),
        halfHtml);
}

// ---- THE PIP-BOY'S OWN SCREEN, AS ASCII (v3323) ----------------------------------------------------------------------
{
    const host = fs.readFileSync(path.join(ROOT, "pipboy-models.html"), "utf8");

    ok("!! *** ?screen1=ascii draws the SAME rig through the sampler, not a second head ***",
        /asciify\(flip, 256, 216/.test(host) && /screen1=ascii|screen1"\) \|\| "texture"/.test(host) &&
        (host.match(/buildWireframeHead\(THREE\)/g) || []).length === 1,
        "TWO MODES OVER ONE SOURCE: both paths render the same rig into the same target and only the last step " +
        "differs. A SECOND HEAD FOR THE ASCII VIEW would be the copy this tree spends its rounds removing, and " +
        "would drift the moment either was touched");

    ok("!! ...and it hands the texture back before painting",
        /setScreen1Texture\(null\)/.test(host),
        "without it the material KEEPS SAMPLING THE RENDER TARGET while the 2D callback paints underneath, " +
        "unseen -- a mode that appears to do nothing while running correctly");

    ok("...and the default is unchanged",
        /\|\| "texture"/.test(host),
        "a new mode that altered what everybody already sees would be A PREFERENCE WEARING A FEATURE'S CLOTHES");
}

// ---- THE ASCII AVATAR, A SIBLING TO krbn-avatar.html, NOT A REPLACEMENT (v4050) ----------------------------------
{
    const AA = fs.readFileSync(path.join(ROOT, "ascii-avatar.html"), "utf8");
    const AAC = codeOnly(AA);     // code shapes
    const AAS = noComments(AA);   // string values -- krbn-avatar's own section 11 note on why both are used

    ok("!! it shares tools/krbn/glbMesh.js's loadGLTF rather than a third fetch/parse copy",
       /from "\.\/tools\/krbn\/glbMesh\.js"/.test(AAS) && /loadGLTF\(src, GLTFLoader\)/.test(AAC),
       "krbn-avatar.html and krbn-compare.html already share this exact fetch/arrayBuffer/parse boilerplate; " +
       "a third hand-rolled copy here is the second-copy defect this tree keeps finding, a third time");
    ok("!! it shares ui/modelPicker.js's live-load control rather than a fourth picker",
       /from "\.\/ui\/modelPicker\.js"/.test(AAS) && /mountModelPicker\(\{/.test(AAC),
       "favourites, the RobotExpressive preset and the file input are now used by THREE pages -- a page that " +
       "rebuilt this would drift from the read-only-favourites rule the moment either was touched");
    ok("!! it imports asciify AND toColoredHTML from the ONE sampler module, not a copy of the technique",
       /from "\.\/tools\/render-qa\/asciify\.mjs"/.test(AAS) && /asciify\(flipped, size\.w, size\.h/.test(AAC) &&
       /toColoredHTML\(r\)/.test(AAC),
       "ascii-object.html already proved the technique on the wireframe head; this generalises the SOURCE, not the sampler");

    ok("!! color defaults OFF, per Keith: 'monochrome by default, but we would want to be able to switch to color'",
       /let colorOn = false;/.test(AAC),
       "a page that shipped defaulting to color would have answered a different question than the one asked");
    ok("!! ...and the toggle is the ONLY thing that changes -- textContent (plain) vs innerHTML (colored spans)",
       /if \(colorOn\) out\.innerHTML = toColoredHTML\(r\); else out\.textContent = r\.text;/.test(AAC.replace(/ +/g, " ")),
       "asciify's own contract: color is a second FACT about a cell, never a second scheme for choosing its glyph");

    // *** THE LOAD-BEARING NEGATIVE THIS PAGE ACTUALLY SHIPPED WRONG ONCE, MEASURED BEFORE THE FIX EXISTED. ***
    // A fresh Object3D's matrixWorld is IDENTITY until updateMatrixWorld runs; neither GLTFLoader.parse() nor
    // three's own Box3.setFromObject calls it. Measuring the box first read every node as parented at the
    // origin with no chained transform at all -- MEASURED: bounding-sphere radius 194.6 (a human figure should
    // be a few units), and the resulting frame was blank on every cell (0 of 839 characters non-space) because
    // the camera sat nowhere near the model.
    ok("!! updateMatrixWorld runs BEFORE the framing Box3 is measured, not after -- or the box measures nothing real",
       /gltf\.scene\.updateMatrixWorld\(true\);[\s\S]{0,120}new THREE\.Box3\(\)\.setFromObject\(gltf\.scene\)/.test(AAC),
       "MEASURED before this ordering existed: radius 194.6 and a frame with ZERO non-blank characters -- the " +
       "camera was aimed at a box computed from every node's untouched IDENTITY world matrix");

    // *** THIS PAGE DELIBERATELY HAS NO STICKY loadErr, UNLIKE krbn-avatar.html -- AND THAT WAS A DECISION,
    // NOT AN OMISSION. *** krbn-avatar.html's draw() re-asserts a ROUTINE status every tick, so a load error
    // there gets overwritten within one redraw cycle unless something makes it sticky. This frame() never
    // re-asserts a routine status -- `#msg` is written exactly once per load EVENT -- so there is nothing for
    // a stale write to overwrite. A sticky-loadErr guard was written here FIRST (copied from krbn-avatar
    // before testing this page's actual failure mode) and then REMOVED: it only ever froze the display on a
    // LATER failed pick, since a failed pick never touches `group` either way, and freezing a still-good
    // model under a NEW pick's error is worse UX than letting it keep animating. The two checks below assert
    // the actual invariant this page relies on instead of copying krbn-avatar's mechanism uncritically.
    // frameBody is sliced from AAS (comments stripped, STRINGS KEPT) rather than AAC, because the one allowed
    // say() call in frame() is identified by its literal message text -- and codeOnly() BLANKS string contents,
    // which is the exact trap this tree's own v4021 rule and section 11's note above both name. Sliced up to
    // the NEXT top-level function (boot()) rather than a fixed length, so this cannot silently start reading
    // into a different function's say() calls if frame() grows or shrinks.
    const frameBody = AAS.slice(AAS.indexOf("function frame() {"), AAS.indexOf("(async function boot()")).replace(/\s+/g, " ");
    const sayCallsInFrame = (frameBody.match(/say\(/g) || []).length;
    ok("!! frame() calls say() at most ONCE -- inside the sampling catch, reporting a NEW failure, never a routine status",
       sayCallsInFrame === 1 && /catch \(e\) \{ say\("could not sample the frame/.test(frameBody),
       sayCallsInFrame + " say() call(s) in frame() -- a routine 'still fine' write every ~16ms is exactly the " +
       "mechanism that stomped krbn-avatar's error message within one cycle; this page must never grow one");
    // \bgroup = also matches the TOP-LEVEL DECLARATION's initializer ("let group = null") -- that is not a
    // reassignment, so it is excluded explicitly rather than by accident of the count landing on 1.
    const groupAssignments = (AAC.match(/\bgroup = /g) || []).length;
    ok("!! `group` is assigned in exactly ONE place OUTSIDE its declaration -- the success path only",
       groupAssignments === 2 && /let group = null/.test(AAC) && (AAC.match(/\bgroup = newGroup\b/g) || []).length === 1,
       groupAssignments + " total (1 declaration + 1 reassignment expected) -- a failed pick reaching a SECOND " +
       "reassignment site would be able to touch the last-good model");
    ok("...and both failure returns in loadAvatar happen BEFORE that assignment, not after",
       /say\("could not load " \+ label[^;]*true\); return; \}/.test(AAS) &&
       /say\(label \+ " has no scene to render", true\); return; \}/.test(AAS) &&
       AAS.indexOf('say("could not load " + label') < AAS.indexOf("group = newGroup") &&
       AAS.indexOf('has no scene to render') < AAS.indexOf("group = newGroup"),
       "a failure branch that fell through to the assignment would replace a working model with a broken one");

    ok("!! swapping models disposes the OLD group's geometry/materials/textures, not just detaching it",
       /disposeObject3D\(oldGroup\)/.test(AAC) && /function disposeObject3D\(obj\)/.test(AAC),
       "a live-load control that only detaches leaves GPU memory behind on every pick -- a slow leak across " +
       "however many models get tried, the geometry/texture analogue of the 'second GPU context nobody is " +
       "looking at' this tree already refuses for whole contexts");
    ok("...and teardown cancels the rAF loop and disposes the renderer",
       /pagehide[\s\S]{0,200}cancelAnimationFrame\(raf\)/.test(AAS) && /renderer\.dispose\(\)/.test(AAC),
       "ui/avatarSwitch.js REMOVES the iframe rather than hiding it, but the rAF loop does not know that until told");

    const SW = fs.readFileSync(path.join(ROOT, "ui", "avatarSwitch.js"), "utf8");
    const SWC = noComments(SW);
    ok("!! it is in the avatar rotation, right after krbn, and is NOT declared heavy",
       SWC.indexOf('id: "krbn"') > 0 && SWC.indexOf('id: "ascii"') > SWC.indexOf('id: "krbn"') &&
       SWC.indexOf('id: "gauges3000"') > SWC.indexOf('id: "ascii"') &&
       !/id: "ascii"[\s\S]{0,300}heavy:/.test(SWC),
       "asciify() is arithmetic over a frame already in the framebuffer -- there is no per-click cost worth " +
       "warning about the way there is for krbn's ~0.5s pencil frame, blobgpu's WebGPU requirement, or thead's " +
       "12 MB download");

    let chromium = null;
    try {
        const pw = await import(pathToFileURL(path.join(ROOT, "tools", "ship", "playwrightResolve.mjs")).href);
        const { createRequire } = await import("node:module");
        const req2 = createRequire(import.meta.url);
        const rr = pw.resolvePlaywright(req2);
        if (!pw.browserSkipReason(rr.chromium, rr.from, pw.HEADLESS_SHELL)) chromium = { mod: rr.chromium, shell: pw.HEADLESS_SHELL };
    } catch {}
    if (!chromium) {
        console.log("  ----  live ascii-avatar test SKIPPED -- no headless Chromium available here");
    } else if (!fs.existsSync("/tmp/fixture-icosa.glb")) {
        console.log("  ----  live ascii-avatar test SKIPPED -- no /tmp/fixture-icosa.glb test fixture on this box");
    } else {
        const http = await import("node:http");
        const srv = http.default.createServer((rq, rs) => {
            const p = decodeURIComponent((rq.url || "/").split("?")[0]);
            if (p === "/test-fixture.glb") { rs.writeHead(200, { "Content-Type": "model/gltf-binary" }); rs.end(fs.readFileSync("/tmp/fixture-icosa.glb")); return; }
            const full = path.join(ROOT, p === "/" ? "/ascii-avatar.html" : p);
            if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { rs.writeHead(404); rs.end("nf"); return; }
            const ext = path.extname(full);
            const ct = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript", ".glb":"model/gltf-binary" }[ext] || "application/octet-stream";
            rs.writeHead(200, { "Content-Type": ct }); rs.end(fs.readFileSync(full));
        });
        await new Promise((res) => srv.listen(0, "127.0.0.1", res));
        const port = srv.address().port;
        const browser = await chromium.mod.launch({ executablePath: chromium.shell });
        try {
            const page = await browser.newPage();
            const errs = [];
            page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
            await page.addInitScript(() => {
                localStorage.setItem("voxelEngine.kpopFavorites", JSON.stringify([
                    { url: "/test-fixture.glb", label: "Icosa" },
                    { url: "/GPU_Assets/GenuinelyMissing.glb", label: "Ghost" },
                ]));
            });
            await page.setViewportSize({ width: 143, height: 210 });
            await page.goto(`http://127.0.0.1:${port}/ascii-avatar.html`, { waitUntil: "networkidle", timeout: 40000 });
            await page.waitForFunction(() => document.querySelector("#msg").textContent.includes("RobotExpressive"), { timeout: 15000 }).catch(() => {});
            await page.waitForTimeout(500);
            const outText = await page.textContent("#out");
            const nonBlank = outText.replace(/[\s\n]/g, "").length;
            ok("!! the default model renders as REAL ascii -- non-space characters, not a blank frame",
               nonBlank > 20, nonBlank + " non-space characters (the identity-matrixWorld bug measured ZERO here)");
            ok("...with zero page errors", errs.length === 0, errs[0] || "clean");

            await page.click("#colorToggle");
            await page.waitForTimeout(200);
            const colored = await page.evaluate(() => document.getElementById("out").innerHTML);
            ok("!! the color toggle actually produces colored spans, not plain text relabelled",
               /<span style="color:rgb\(/.test(colored), colored.slice(0, 120));

            await page.selectOption("#modelSel", { label: "★ Icosa" });
            await page.waitForFunction(() => /test-fixture/.test(document.querySelector("#msg").textContent), { timeout: 15000 }).catch(() => {});
            const afterIcosa = await page.textContent("#msg");
            ok("!! picking a favourite REPLACES the model -- status line names the new one",
               /test-fixture/.test(afterIcosa), afterIcosa);

            const outBeforeGhost = await page.textContent("#out");
            await page.selectOption("#modelSel", { label: "★ Ghost" });
            await page.waitForFunction(() => document.querySelector("#msg").classList.contains("err"), { timeout: 15000 }).catch(() => {});
            const errMsg = await page.textContent("#msg");
            // this page redraws every ~16ms rather than krbn-avatar's ~2.6s -- ~90 ticks pass in this one wait,
            // so this is a stricter wall-clock test of the SAME user-visible claim (the error stays readable),
            // even though the mechanism differs (nothing here ever overwrites #msg, rather than a sticky guard).
            await page.waitForTimeout(1500);
            const errMsgLater = await page.textContent("#msg");
            const classLater = await page.getAttribute("#msg", "class");
            const outAfterGhost = await page.textContent("#out");
            ok("!! the error message is unchanged ~90 redraw ticks later -- nothing in the render loop overwrote it",
               /err/.test(classLater || "") && errMsgLater === errMsg,
               "at t0: \"" + errMsg + "\"  at t+1.5s (~90 frames later): \"" + errMsgLater + "\"");
            ok("!! *** AND THE LAST-GOOD MODEL KEPT ANIMATING UNDER THAT ERROR, RATHER THAN FREEZING. *** " +
               "the turntable rotation is still visibly turning ~90 frames after a LATER pick failed",
               outAfterGhost !== outBeforeGhost && outAfterGhost.replace(/[\s\n]/g, "").length > 20,
               "a frozen display would read as 'the whole page broke', not 'that one pick failed' -- group.rotation.y " +
               "keeps advancing because a failed pick never reassigns `group`, so frame() has nothing NEW to freeze on");
        } finally { await browser.close(); srv.close(); }
    }
}

console.log();
console.log("  ----  WHAT THIS DOES NOT PROVE: that it looks good. The glyph mapping, the aspect and the alpha");
console.log("  ----  rule are arithmetic and are checked; whether a head reads as a head at 100 columns is");
console.log("  ----  Keith's eye on ascii-object.html.");
if (fails) { console.log("asciify-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("asciify-selfcheck: all checks pass");
