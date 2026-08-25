// WebGLEngine/tools/ship/avatarServerViews-selfcheck.mjs
//
// Run: node tools/ship/avatarServerViews-selfcheck.mjs   (needs Chromium for section 5; skips cleanly without)
// RUNTIME 26.6s MEASURED (median of 3 -- 26731/26553/26626 -- with date(1) around the run). Was 10.0s at v3998;
// v3999 added section 4 (pure, ~40 ms) and three live subsections to section 5: the cheer/error/cheer sequence
// that proves the hysteresis re-arms (~3.2 s), a full server.html load driving the relay from its real head
// (~8 s), and a second browser context that watches for external MediaPipe requests (~4.5 s). Almost all of the
// cost is still real headless Chromium: eleven page loads now, five of them mounting MediaPipe-capable views
// into an iframe and waiting long enough for the inner document to exist before reading it.
//
// GATES avatar-server.html's View picker, which had no gate at all.
//
// *** ui/avatarSwitch-embed-selfcheck.mjs STATES THE RULE AS A CLASS AND ITS REACH IS ONE CALLER. *** That gate
// says "every mode whose src carries a query flag must be a page that reads that flag", and it reads MODES out
// of ui/avatarSwitch.js. avatar-server.html has a SECOND picker that appends ?embed=1 to every src it mounts,
// and it was never in scope -- so pipboy-models.html and shipavatar.html received that flag and ignored it for
// their whole lives, which is exactly the blob-avatar defect of v3656 in a place nobody was looking.
//
// A RULE WITH ONE ENFORCER COVERS ONE CALLER. This is the second enforcer.
//
// *** AND SECTION 5 IS KEITH'S ACTUAL REPORT: *** "it shows the title 'wireframe head Show' at the top, and
// that should not be seen on Server.html". thead.html has hidden its own chrome on ?embed=1 since v3656 and the
// showcase nav pill sailed straight through it, because that hide list names elements in the page's MARKUP and
// the pill is INJECTED BY A SCRIPT afterwards. A hide list cannot name an element that does not exist yet. So
// the guard went into ui/showcaseNav.js, and this drives a real browser to prove the pill is absent in the
// frame while still present on the standalone page -- because "it does not render" and "it never renders" are
// different claims and only one of them is wanted.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const HOST = fs.readFileSync(path.join(ENG, "avatar-server.html"), "utf8");
// every <option value="..."> inside the View select, in document order
const SELECT = (HOST.match(/<select id="host"[\s\S]*?<\/select>/) || [""])[0];
const VIEWS = [...SELECT.matchAll(/<option value="([^"]+)"[^>]*>([^<]*)</g)].map((m) => ({ src: m[1], label: m[2].trim() }));

console.log("avatarServerViews-selfcheck -- does every avatar view read the flag it is sent, and does the gallery pill stay out of the frame?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE PICKER PARSES, AND EVERY VIEW IT OFFERS IS A PAGE THAT EXISTS ***");
{
    ok("the View select was found and has options", VIEWS.length >= 5, VIEWS.length + ": " + VIEWS.map((v) => v.src).join(", "));
    const missing = VIEWS.filter((v) => !fs.existsSync(path.join(ENG, v.src.split("?")[0])));
    ok("!! every option points at a page in the tree", missing.length === 0,
        missing.length ? "MISSING: " + missing.map((v) => v.src).join(", ") : "all present");
    const unlabelled = VIEWS.filter((v) => v.label.length < 4);
    ok("...and every one is labelled, because a picker of filenames is not a picker", unlabelled.length === 0);
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE FLAG IS SENT, AND EVERY PAGE IT IS SENT TO READS IT ***");
{
    // the caller half -- if this stops appending embed=1, the callee half below is checking a contract nobody
    // is honouring any more, which is the two-sidedness v3656 built into the original rule
    ok("!! the picker still appends ?embed=1 to every src it mounts",
        /embed=1/.test(HOST) && /frame\.src = src \+ \(src\.indexOf\("\?"\) < 0 \? "\?" : "&"\) \+ "embed=1"/.test(HOST),
        "a flag the caller stopped sending would leave every page below reading something that never arrives");

    const deaf = VIEWS.filter((v) => {
        const src = fs.readFileSync(path.join(ENG, v.src.split("?")[0]), "utf8");
        return !/get\("embed"\)/.test(src) && !/embed=1/.test(src) && !/"embed"/.test(src);
    });
    ok("!! *** EVERY view page READS ?embed=1 -- no exceptions, declared or otherwise ***", deaf.length === 0,
        deaf.length ? "DEAF TO THE FLAG: " + deaf.map((v) => v.src).join(", ")
                    : VIEWS.map((v) => v.src.split("?")[0]).join(", "));
    report("pipboy-models.html and shipavatar.html were both deaf until v3998, and neither was a declared " +
           "exception -- they were simply outside the reach of the gate that states the rule");

    // and reading the flag has to DO something: a page that parses it and hides nothing is deaf with extra steps
    const inert = VIEWS.filter((v) => {
        const src = fs.readFileSync(path.join(ENG, v.src.split("?")[0]), "utf8");
        if (!/get\("embed"\)/.test(src)) return false;
        return !/display:\s*none/i.test(src) && !/data-embed/.test(src);
    });
    ok("!! ...and each one HIDES something on it, rather than parsing it and shrugging", inert.length === 0,
        inert.length ? "READS BUT DOES NOTHING: " + inert.map((v) => v.src).join(", ") : "all act on it");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE FACE-MUSCLES VIEW SITS WHERE IT WAS ASKED TO SIT ***");
{
    const iHead = VIEWS.findIndex((v) => v.src.startsWith("thead.html"));
    const iFace = VIEWS.findIndex((v) => v.src.startsWith("face-mirror.html"));
    ok("the wireframe head is still offered", iHead >= 0);
    ok("!! the face-muscles view is offered", iFace >= 0, iFace >= 0 ? VIEWS[iFace].label : "ABSENT");
    // Keith: "can we rotate that as the next choice after Wireframe?" -- position is the request, so a silent
    // reorder is a silent undo of it.
    ok("!! *** ...and it is the NEXT CHOICE AFTER the wireframe head ***", iFace === iHead + 1,
        `wireframe at ${iHead}, face muscles at ${iFace}`);
    const src = fs.readFileSync(path.join(ENG, "face-mirror.html"), "utf8");
    ok("!! the page it points at really is the MediaPipe blendshape one",
        /FaceLandmarker/i.test(src) && /blendshape/i.test(src),
        "blendshapes are the Google API's own name for muscle activations, which is what makes this the " +
        "face-muscles view rather than a second head");
}

// ---------------------------------------------------------------------------
// v3999 -- Keith: "we want to hide camera when it is shown on server.html. server.html is self driven avatars."
// then: "Would we be able to generate the animations that the other avatars show, but with the face expressions?"
//
// *** THE ANSWER COST NO NEW INTERFACE, WHICH IS EXACTLY WHY IT NEEDS A GATE. *** ui/faceExpression.js and
// ui/faceRig.js both consume "anything with snapshot() -> { active, blendShapes }" and neither has ever known
// it was talking to a camera. ui/faceMoves.js is a SECOND PRODUCER for that one interface. A duck-typed seam
// has no compiler behind it: the day faceExpression starts reading a twelfth coefficient, or moves its smile
// threshold, NOTHING breaks at build time -- the face just quietly stops cheering. These checks are the only
// thing standing where a type would be.
console.log("\n4. *** ONE CONSUMER, TWO PRODUCERS: THE ENGINE'S MOVES ARRIVE IN THE CAMERA'S OWN SHAPE ***");
{
    const { MOVES, MOVE_MS, EMITTED, expressionFor, toBlendShapes, createMoveFaceSource } =
        await import("../../ui/faceMoves.js");
    const FEXP = fs.readFileSync(path.join(ENG, "ui", "faceExpression.js"), "utf8");
    const TRACK = fs.readFileSync(path.join(ENG, "face", "MediaPipeFaceTracker.js"), "utf8");

    // (a) THE SHAPE. Read off the CAMERA's file rather than restated here, so a tracker that changes its
    // snapshot contract fails this instead of silently diverging from the second producer.
    ok("the camera tracker still returns { active, blendShapes } from snapshot()",
        /snapshot\s*\(\s*\)\s*\{/.test(TRACK) && /active:/.test(TRACK) && /blendShapes:/.test(TRACK));
    ok("...and the consumer still reads it as { categories: [{ categoryName, score }] }",
        /Array\.isArray\(blendShapes\.categories\)/.test(FEXP) && /c\.categoryName === name/.test(FEXP));

    const snap = createMoveFaceSource({ now: () => 1000, subscribe: null }).snapshot();
    const cats = snap && snap.blendShapes && snap.blendShapes.categories;
    ok("!! *** faceMoves' snapshot() IS THAT SHAPE -- the seam holds without a type to hold it ***",
        snap.active === true && Array.isArray(cats) && cats.length === EMITTED.length &&
        cats.every((c) => typeof c.categoryName === "string" && Number.isFinite(c.score)),
        Array.isArray(cats) ? cats.length + " categories" : "NOT AN ARRAY");
    // *** THE DIRECTION IS THE WHOLE CHECK, AND THE FIRST VERSION HAD IT BACKWARDS. *** Asking "is every name
    // faceMoves emits one faceRig reads?" is true of ANY subset -- it passed a sabotage run that deleted a
    // coefficient outright, because the filter simply ran over a shorter list. It has to run the other way:
    // every name the CONSUMER looks up must be one the producer emits, or that channel silently reads 0.
    // Pointing it round found eyeWideLeft, eyeWideRight and mouthFunnel missing from the day this shipped.
    const RIG = fs.readFileSync(path.join(ENG, "ui", "faceRig.js"), "utf8");
    const rigReads = [...RIG.matchAll(/\b(?:score|pair)\(bs,\s*([^)]*)\)/g)]
        .flatMap((m) => [...m[1].matchAll(/"([A-Za-z]+)"/g)].map((x) => x[1]));
    ok("faceRig's blendshape lookups are still readable from its source", rigReads.length >= 10,
        rigReads.length + " lookups: " + rigReads.join(", "));
    const unfed = rigReads.filter((n) => !EMITTED.includes(n));
    ok("!! *** EVERY NAME faceRig LOOKS UP IS ONE faceMoves EMITS -- no channel silently reading 0 ***",
        unfed.length === 0,
        unfed.length ? "NOT EMITTED: " + [...new Set(unfed)].join(", ") : rigReads.length + "/" + rigReads.length + " fed");
    const feRead = [...FEXP.matchAll(/\b(?:score|pair)\(bs,\s*([^)]*)\)/g)]
        .flatMap((m) => [...m[1].matchAll(/"([A-Za-z]+)"/g)].map((x) => x[1]));
    ok("!! ...and so is every name faceExpression looks up", feRead.length > 0 && feRead.every((n) => EMITTED.includes(n)),
        feRead.join(", "));

    // (b) THE CLOCK IS AN ARGUMENT. Everything below depends on this: a face on Date.now() could only be
    // checked by watching it.
    let tick = 0;
    const mk = () => createMoveFaceSource({ now: () => tick, subscribe: null });
    const a = mk(), b2 = mk();
    tick = 7321;
    a.setMove("dance"); b2.setMove("dance");
    ok("!! two sources on the same injected clock agree exactly -- nothing here reads a wall clock",
        JSON.stringify(a.snapshot()) === JSON.stringify(b2.snapshot()));
    // *** COMPARING TWO BACK-TO-BACK CALLS PROVES NOTHING, AND A SABOTAGE RUN SAID SO. *** Adding a real
    // Date.now() read to expressionFor sailed through the naive version, because two calls a microsecond apart
    // see the SAME millisecond. So the clock and the RNG are HIJACKED: Date.now and performance.now advance a
    // second on every read and Math.random never repeats, which makes any hidden read of either visible as a
    // difference between two otherwise identical calls.
    const realNow = Date.now, realRand = Math.random;
    const realPerf = typeof performance !== "undefined" ? performance.now : null;
    let hijack = 0, pureA = "", pureB = "", snapA = "", snapB = "";
    try {
        Date.now = () => (hijack += 1000);
        Math.random = () => ((hijack += 1) % 97) / 97;
        if (realPerf) performance.now = () => (hijack += 1000);
        pureA = JSON.stringify(expressionFor("dance", 0.4, 3.1, true));
        pureB = JSON.stringify(expressionFor("dance", 0.4, 3.1, true));
        const s1 = createMoveFaceSource({ now: () => 5000, subscribe: null });
        const s2 = createMoveFaceSource({ now: () => 5000, subscribe: null });
        s1.setMove("spin"); s2.setMove("spin");
        snapA = JSON.stringify(s1.snapshot()); snapB = JSON.stringify(s2.snapshot());
    } finally {
        Date.now = realNow; Math.random = realRand;
        if (realPerf) performance.now = realPerf;
    }
    ok("!! *** expressionFor is PURE even with the clock and the RNG rigged to change on every read ***",
        pureA === pureB && pureA.length > 2, pureA === pureB ? "identical" : "DIVERGED -- something in there reads a clock");
    ok("!! ...and so is a whole source built on an injected clock", snapA === snapB && snapA.length > 2);

    // (c) *** THE COUPLING WITH NO LINK. *** faceExpression fires bot.play("cheer") when the smile pair crosses
    // SMILE_ON. That number is read OUT OF ITS FILE, not restated: a threshold that moves must fail here rather
    // than turn the cheer into a face that grins and does nothing.
    const mSm = FEXP.match(/opts\.smile != null \? opts\.smile : ([\d.]+)/);
    const mJaw = FEXP.match(/opts\.jawOpen != null \? opts\.jawOpen : ([\d.]+)/);
    ok("faceExpression's thresholds are still readable from its source", !!mSm && !!mJaw,
        mSm && mJaw ? `SMILE_ON ${mSm[1]}, JAW ${mJaw[1]}` : "REGEX MISSED -- this section is checking nothing");
    if (mSm && mJaw) {
        const SMILE_ON = Number(mSm[1]), JAW = Number(mJaw[1]);
        const cheer = expressionFor("cheer", 0.2, 0.2, false);
        ok("!! *** THE CHEER FACE CROSSES faceExpression's SMILE_ON, so the robot actually cheers ***",
            cheer.mouthSmileLeft > SMILE_ON && cheer.mouthSmileRight > SMILE_ON,
            `smile ${cheer.mouthSmileLeft.toFixed(2)} vs SMILE_ON ${SMILE_ON}`);
        ok("!! ...and its jaw crosses the mouth-open threshold too", cheer.jawOpen > JAW,
            `jaw ${cheer.jawOpen.toFixed(2)} vs ${JAW}`);
        const idle = expressionFor("idle", 0, 0, false);
        ok("...while the IDLE face stays well under it -- a face that cheers constantly is not cheering",
            idle.mouthSmileLeft < SMILE_ON - 0.15,
            `idle smile ${idle.mouthSmileLeft.toFixed(2)}, SMILE_OFF ${(SMILE_ON - 0.15).toFixed(2)}`);
    }

    // (d) THE ERROR FACE STARES. A blink is the one motion that reads as "fine"; the alarm must not have it.
    let blinked = false, smiled = false;
    for (let ms = 0; ms < 9000; ms += 25) {
        const e = expressionFor("error", ms / 1000, ms / 1000, false);
        if (e.eyeBlinkLeft > 0 || e.eyeBlinkRight > 0) blinked = true;
        if (e.mouthSmileLeft > 0.02) smiled = true;
    }
    ok("!! the error face never blinks and never smiles across 9 s", !blinked && !smiled,
        `blinked ${blinked}, smiled ${smiled}`);
    // ...and every OTHER face does blink, or the "stares" reading has no contrast to be read against
    let idleBlinks = 0;
    for (let ms = 0; ms < 9000; ms += 10) if (expressionFor("idle", 0, ms / 1000, false).eyeBlinkLeft > 0.5) idleBlinks++;
    ok("...and the resting face DOES blink, which is what makes the stare mean anything", idleBlinks > 0,
        idleBlinks + " sampled frames with eyes more than half shut in 9 s");

    // *** eyeBlink AND eyeWide ARE THE SAME EYELID PULLING BOTH WAYS. *** faceRig maps both onto one lid, so a
    // frame reporting the eyes shut AND wide open renders as neither -- and this escaped the first sabotage
    // pass, which is why it exists: multiplying eyeWide by three sailed through every other check in here.
    // The invariant is that they cannot sum past a whole eyelid, which the (1 - blink) factor guarantees.
    let clash = null;
    for (const mv of MOVES) for (let ms = 0; ms < 9000; ms += 5) {
        const e = expressionFor(mv, 0.4, ms / 1000, false);
        const sum = e.eyeBlinkLeft + e.eyeWideLeft;
        if (sum > 1.001) clash = `${mv} at ${(ms / 1000).toFixed(2)}s: blink ${e.eyeBlinkLeft.toFixed(2)} + wide ${e.eyeWideLeft.toFixed(2)} = ${sum.toFixed(2)}`;
    }
    ok("!! no frame ever reports the eyes shut and wide open at the same time", clash === null,
        clash || "blink + wide stays within one eyelid across every move");

    // (e) NO DEAD MOVES. v3436's rule, applied to an animation table: an advertised entry that moves no
    // observable is a defect, not a placeholder. Every move must differ from idle on some emitted coefficient.
    const asVec = (mv) => EMITTED.map((n) => expressionFor(mv, 0.35, 2.0, false)[n]);
    const base = asVec("idle");
    const dead = MOVES.filter((mv) => mv !== "idle" &&
        asVec(mv).every((v, i) => Math.abs(v - base[i]) < 1e-6));
    ok("!! *** EVERY declared move MOVES something -- no entry in MOVES is decoration ***", dead.length === 0,
        dead.length ? "DEAD: " + dead.join(", ") : MOVES.filter((m) => m !== "idle").join(", ") + " all differ from idle");
    ok("...and every move has a duration, so none of them is stuck on", 
        MOVES.filter((m) => m !== "idle").every((m) => Number.isFinite(MOVE_MS[m]) && MOVE_MS[m] > 0),
        JSON.stringify(MOVE_MS));
    // every coefficient, every move, every phase: finite and inside [0,1]. MediaPipe scores are probabilities
    // and a consumer that clamps is not a consumer that should have to.
    let bad = null;
    for (const mv of MOVES) for (let ph = 0; ph < 5; ph += 0.13) {
        const e = expressionFor(mv, ph, ph * 1.7, ph > 2);
        for (const n of EMITTED) if (!(Number.isFinite(e[n]) && e[n] >= 0 && e[n] <= 1)) bad = `${mv} ${n} ${e[n]}`;
    }
    ok("!! every coefficient stays a finite probability in [0,1] for every move and phase", bad === null, bad || "clean");
    ok("...and toBlendShapes emits them in the declared order, because a consumer that indexed would be reading a different muscle",
        toBlendShapes(expressionFor("wave", 0, 0, false)).categories.map((c) => c.categoryName).join(",") === EMITTED.join(","));

    // (f) A MOVE DECAYS. Otherwise the first error the engine hits leaves a scowl on the avatar forever.
    tick = 0;
    const src = createMoveFaceSource({ now: () => tick, subscribe: null });
    src.setMove("error");
    tick = 100;  const during = src.move();
    tick = 100 + MOVE_MS.error + 50; const after = src.move();
    ok("!! a move decays back to idle when its time is up", during === "error" && after === "idle",
        `at 100 ms: ${during}; at ${100 + MOVE_MS.error + 50} ms: ${after}`);
    // AND AN UNKNOWN NAME IS IGNORED rather than latched. The relay is a closed set on the sending side; this
    // is the receiving side refusing anyway, because one guard on a two-sided channel is one guard.
    src.setMove("rm -rf");
    tick = 100 + MOVE_MS.error + 60;
    ok("...and a name outside MOVES is refused on arrival, not just on departure", src.move() === "idle", src.move());

    // (g) THE RELAY. A frame cannot hear its parent's window events, so avatarSwitch posts them in -- and a
    // postMessage bridge is a channel INTO the page, so both the target and the payload are narrowed.
    const SW = fs.readFileSync(path.join(ENG, "ui", "avatarSwitch.js"), "utf8");
    ok("!! the relay targets location.origin, never \"*\"",
        /postMessage\(msg, location\.origin\)/.test(SW) && !/postMessage\([^)]*,\s*"\*"\)/.test(SW),
        "a wildcard target hands whatever is in that frame to any document that happens to be there");
    const relayNames = (SW.match(/const MOVE_NAMES = \[([^\]]*)\]/) || [, ""])[1]
        .split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean);
    ok("!! ...and it only ever forwards names faceMoves declares -- the two lists agree",
        relayNames.length === MOVES.length && relayNames.every((n) => MOVES.includes(n)),
        relayNames.join(",") + "  vs  " + MOVES.join(","));

    // (h) THE ROBOT IS BUILT ON LOAD, NOT ON A BUTTON. This is the actual bug Keith was looking at: in the
    // camera path the robot is created inside start(), and with the controls hidden that path can never run,
    // so the panel showed a 0x0 host. Section 5 measures the box; this proves the intent in the source.
    const FM = fs.readFileSync(path.join(ENG, "face-mirror.html"), "utf8");
    ok("!! face-mirror's embed block hides the camera controls",
        /html\[data-embed="1"\] \.controls/.test(FM) && /#btn-start/.test(FM) && /#btn-stop/.test(FM));
    ok("!! ...and builds the robot itself rather than waiting for a button that is no longer there",
        /createSwekRobot\(\{ width: 120, height: 176 \}\)/.test(FM) && /createMoveFaceSource\(\)/.test(FM),
        "a hidden start button plus a robot built inside start() is an empty 0x0 panel, which is what it was");
    ok("...and the camera path above it is untouched, so the standalone page still mirrors a real face",
        /new MediaPipeFaceTracker\(\)/.test(FM));
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE REAL BROWSER: NO PILL OVER THE HEAD, NO CAMERA IN THE PANEL, AND A FACE THAT STILL MOVES ***");
{
    const nav = fs.readFileSync(path.join(ENG, "ui", "showcaseNav.js"), "utf8");
    ok("!! showcaseNav guards on BOTH the embed flag and the frame test",
        /get\("embed"\) === "1"/.test(nav) && /window\.top !== window\.self/.test(nav),
        "the flag is this tree's convention; the frame test catches an embedder that never got the memo");
    ok("...and a cross-origin frame, where reading window.top THROWS, counts as embedded",
        /catch \(e\) \{ return true; \}/.test(nav),
        "the safe direction: a missing pill on a showcase is a nuisance, one welded over an avatar is the bug");

    const { chromium, from } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, from, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-3 read source, and source cannot show what renders");
    } else {
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const ctx = await b.newContext();
        const pg = await ctx.newPage();
        await pg.route("**/*", (route) => {
            const u = new URL(route.request().url());
            const p = path.join(ENG, decodeURIComponent(u.pathname));
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                const ext = path.extname(p);
                const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html"
                    : ext === ".css" ? "text/css" : ext === ".json" ? "application/json" : "text/plain";
                return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
            }
            return route.fulfill({ status: 404, body: "not found" });
        });
        await pg.setViewportSize({ width: 1100, height: 760 });

        // (a) STANDALONE: the pill is the page's navigation and MUST be there
        await pg.goto("http://localhost:8787/thead.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(900);
        const standalone = await pg.evaluate(() => !!document.getElementById("swekShowcaseNav"));
        ok("!! standalone thead.html still shows the gallery pill -- the fix removed a leak, not the feature",
            standalone === true, standalone ? "present" : "ABSENT -- the guard is too wide");

        // (b) EMBEDDED the way avatar-server mounts it
        await pg.goto("http://localhost:8787/thead.html?embed=1", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(900);
        const flagged = await pg.evaluate(() => !!document.getElementById("swekShowcaseNav"));
        ok("!! *** ?embed=1 alone is enough to keep the pill out ***", flagged === false,
            flagged ? "STILL PRESENT -- this is exactly what Keith is looking at" : "absent");

        // (c) IN THE REAL HOST, in a real iframe
        await pg.goto("http://localhost:8787/avatar-server.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(600);
        await pg.selectOption("#host", "thead.html");
        await pg.waitForTimeout(1600);
        const inFrame = await pg.evaluate(() => {
            const f = document.getElementById("view");
            const d = f && f.contentDocument;
            return { src: (f && f.getAttribute("src")) || "", pill: d ? !!d.getElementById("swekShowcaseNav") : null };
        });
        ok("...and avatar-server really mounted it with the flag", /thead\.html\?embed=1/.test(inFrame.src), inFrame.src);
        ok("!! *** AND INSIDE THE AVATAR PANEL THERE IS NO PILL OVER THE HEAD ***", inFrame.pill === false,
            inFrame.pill === null ? "could not read the frame document" : (inFrame.pill ? "STILL THERE" : "gone"));

        // (c2) THE OTHER MOUNT PATH. ui/avatarSwitch.js is what server.html itself mounts -- the corner avatar
        // surface with the cycle button -- and it is a SECOND caller of the same pages. Keith said "also on
        // Server.html", so proving the frame is clean here and not there would answer the wrong half.
        const { MODES } = await import("../../ui/avatarSwitch.js");
        const framed = MODES.filter((m) => m.src);
        ok("!! every framed surface the server.html switch mounts carries ?embed=1",
            framed.every((m) => /[?&]embed=1/.test(m.src)),
            framed.map((m) => m.id).join(", "));
        for (const id of ["thead", "facemuscles"]) {
            const m = MODES.find((x) => x.id === id);
            await pg.goto("http://localhost:8787" + m.src, { waitUntil: "load" }).catch(() => {});
            await pg.waitForTimeout(900);
            const pill = await pg.evaluate(() => !!document.getElementById("swekShowcaseNav"));
            ok(`!! ...and ${id} (${m.src}) renders NO gallery pill`, pill === false, pill ? "STILL PRESENT" : "clean");
        }

        // (d) the new view mounts and hides its own chrome.
        // BACK TO THE HOST FIRST -- (c2) navigated this page away to check the two srcs directly, and #host
        // only exists on avatar-server.html. The first run of this gate timed out here for exactly that reason.
        await pg.goto("http://localhost:8787/avatar-server.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(600);
        await pg.selectOption("#host", "face-mirror.html");
        await pg.waitForTimeout(2400);   // the embed block dynamic-imports three modules before the robot exists
        const face = await pg.evaluate(() => {
            const f = document.getElementById("view"), d = f && f.contentDocument;
            if (!d) return null;
            const vis = (el) => !!el && getComputedStyle(el).display !== "none";
            return {
                src: f.getAttribute("src") || "",
                embedded: d.documentElement.getAttribute("data-embed") === "1",
                h1: vis(d.querySelector(".header h1")),
                metrics: vis(d.getElementById("metrics")),
                robot: vis(d.getElementById("robot-host")),
                robotW: Math.round((d.getElementById("robot-host") || {}).getBoundingClientRect ? d.getElementById("robot-host").getBoundingClientRect().width : 0),
                robotH: Math.round((d.getElementById("robot-host") || {}).getBoundingClientRect ? d.getElementById("robot-host").getBoundingClientRect().height : 0),
                start: vis(d.getElementById("btn-start")),
                faceState: (d.getElementById("face-state") || {}).textContent || "",
            };
        });
        ok("!! the face-muscles view mounts with the flag", !!face && /face-mirror\.html\?embed=1/.test(face.src), face && face.src);
        ok("!! ...and reads it", !!face && face.embedded === true);
        ok("!! ...and hides the full page's title and metrics grid", !!face && !face.h1 && !face.metrics,
            face ? `h1 ${face.h1}, metrics ${face.metrics}` : "");
        // *** v3999 REVERSES v3998 HERE, AND THE OLD REASON IS LEFT ON THE PAGE RATHER THAN QUIETLY DELETED. ***
        // v3998 asserted the camera button STAYED, on the reasoning that a view which opened the webcam on load
        // would be a permission prompt nobody asked for. That reasoning was sound and it was answering the wrong
        // question. Keith: "we want to hide camera when it is shown on server.html. server.html is self driven
        // avatars." The button is not made safer by being opt-in; it does not belong on that surface at all,
        // because the surface is showing what the MACHINE is doing. So the camera goes, and the face keeps
        // moving -- driven by ui/faceMoves.js instead.
        ok("!! *** THE CAMERA CONTROLS ARE GONE FROM THE PANEL ***", !!face && face.start === false,
            face ? `start button visible: ${face.start}` : "");
        ok("!! ...and the robot is there anyway, with a real box rather than the 0x0 host this used to show",
            !!face && face.robot === true && face.robotW > 40 && face.robotH > 40,
            face ? `robot ${face.robotW}x${face.robotH}` : "");
        report("before v3999 this measured 0x0: the robot was built inside start(), and start() is on a button " +
               "that v3999 hides -- so hiding the camera alone would have left an empty panel");
        ok("!! ...and it says so, rather than leaving the camera page's status text behind",
            !!face && /self-driven/i.test(face.faceState || ""), face ? JSON.stringify(face.faceState) : "");

        // (e) *** THE MOVE MAKES IT ACROSS THE FRAME BOUNDARY. *** Everything in section 4 is one side or the
        // other of a postMessage; this is the only check that the two sides are connected. A relay that posts
        // and a listener that never fires both pass every source test ever written.
        //
        // AND THE SECOND CHEER IS THE REAL ONE. faceExpression fires bot.play("cheer") on the RISING EDGE of the
        // smile pair, with hysteresis: it will not fire again until the smile has dropped back under SMILE_OFF.
        // A source that latched its move -- or a listener that only ever heard the first message -- would pass
        // the first cheer and fail the third step, which is why the sequence is cheer, error, cheer.
        const moved = await pg.evaluate(async () => {
            const f = document.getElementById("view"), d = f && f.contentDocument;
            if (!d || !f.contentWindow) return null;
            const cheerOn = () => !!d.querySelector('#robot-host [class*="fx-cheer"]');
            const post = (m) => f.contentWindow.postMessage({ type: "swek:move", move: m }, location.origin);
            const wait = (ms) => new Promise((r) => setTimeout(r, ms));
            const before = !!d.querySelector("#robot-host > *");
            post("cheer"); await wait(900);
            const first = cheerOn();
            // the error face has smile 0, which takes the pair back under SMILE_OFF and re-arms the edge;
            // 1400 ms also outlasts bot.play's own 1600 ms fx timer, so the class must be gone on its own
            post("error"); await wait(1400);
            const cleared = !cheerOn();
            post("cheer"); await wait(900);
            const second = cheerOn();
            return { before, first, cleared, second };
        });
        ok("the robot really is mounted inside the frame", !!moved && moved.before === true);
        ok("!! *** A swek:move POSTED FROM THE HOST REACHES THE FACE AND THE ROBOT CHEERS ***",
            !!moved && moved.first === true,
            moved ? `fx-cheer present: ${moved.first}` : "could not reach the frame document");
        report("the whole chain in one assertion: host postMessage -> frame listener -> faceMoves.setMove -> " +
               "snapshot() blendshapes -> faceExpression's SMILE_ON -> bot.play(\"cheer\")");
        ok("...and it clears itself rather than sticking", !!moved && moved.cleared === true);
        ok("!! *** AND IT CHEERS AGAIN -- the source is not latched and the hysteresis really re-arms ***",
            !!moved && moved.second === true,
            moved ? `second fx-cheer: ${moved.second}` : "");

        // (f) *** KEITH'S ACTUAL PAGE, AND THE ONE THING NOTHING ELSE IN HERE COVERS. *** Everything above posts
        // the message from the GATE, which proves the frame listens and proves nothing about the host. Deleting
        // the relay in ui/avatarSwitch.js passed every other check in this file. avatar-server.html does not use
        // avatarSwitch at all -- server.html does, and server.html is the page Keith named: "we want to hide
        // camera when it is shown on server.html. server.html is self driven avatars."
        //
        // So this drives the WHOLE chain from its real head: a swek:move CustomEvent on server.html's own
        // window -- the same event ui/swekRobot.js has dispatched since v1690 -- through avatarSwitch's relay,
        // across the frame boundary, into faceMoves, out as blendshapes, and back onto the robot as a cheer.
        await pg.goto("http://localhost:8787/server.html", { waitUntil: "domcontentloaded" }).catch(() => {});
        await pg.waitForTimeout(4000);
        const chain = await pg.evaluate(async () => {
            if (!window._avatarSwitch) return { reason: "server.html did not expose _avatarSwitch" };
            window._avatarSwitch.set("facemuscles");
            await new Promise((r) => setTimeout(r, 3000));
            const f = document.querySelector("#dialsRobot iframe"), d = f && f.contentDocument;
            if (!d) return { reason: "the switch mounted no readable frame" };
            const mounted = !!d.querySelector("#robot-host > *");
            const camera = !!d.querySelector("#btn-start") &&
                getComputedStyle(d.getElementById("btn-start")).display !== "none";
            // the REAL event, on the REAL host window -- not a postMessage from the test
            window.dispatchEvent(new CustomEvent("swek:move", { detail: { move: "cheer" } }));
            await new Promise((r) => setTimeout(r, 900));
            return { src: f.getAttribute("src"), mounted, camera,
                     cheering: !!d.querySelector('#robot-host [class*="fx-cheer"]') };
        });
        ok("server.html's own avatar switch mounts the face-muscles surface",
            !!chain && /face-mirror\.html\?embed=1/.test(chain.src || ""), chain && (chain.src || chain.reason));
        ok("!! *** AND ON SERVER.HTML THERE IS NO CAMERA BUTTON IN THE AVATAR PANEL ***",
            !!chain && chain.camera === false && chain.mounted === true,
            chain ? `camera ${chain.camera}, robot mounted ${chain.mounted}` : "");
        ok("!! *** A REAL swek:move ON SERVER.HTML'S WINDOW REACHES THE FACE THROUGH avatarSwitch'S RELAY ***",
            !!chain && chain.cheering === true,
            chain ? `fx-cheer in the frame: ${chain.cheering}` : "");
        report("this is the only check in this file that exercises the HOST half of the relay -- deleting the " +
               "window listener in ui/avatarSwitch.js passes every other assertion here");

        // (g) THE MEASURED COST. The `heavy` note on both MediaPipe modes says "~12 MB on first use"; with the
        // camera controls hidden, neither embedded mount requests a byte of it. MEASURED, not reasoned about.
        const ctx2 = await b.newContext();
        const pg2 = await ctx2.newPage();
        const external = [];
        await pg2.route("**/*", (route) => {
            const u = new URL(route.request().url());
            if (u.hostname !== "localhost") { external.push(u.href); return route.abort(); }
            const p = path.join(ENG, decodeURIComponent(u.pathname));
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                const ext = path.extname(p);
                const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html"
                    : ext === ".css" ? "text/css" : ext === ".json" ? "application/json" : "text/plain";
                return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
            }
            return route.fulfill({ status: 404, body: "not found" });
        });
        for (const u of ["/thead.html?embed=1", "/face-mirror.html?embed=1"]) {
            await pg2.goto("http://localhost:8787" + u, { waitUntil: "load" }).catch(() => {});
            await pg2.waitForTimeout(2200);
        }
        const mp = external.filter((h) => /mediapipe|jsdelivr|face_landmarker/i.test(h));
        ok("!! neither embedded MediaPipe view fetches the ~12 MB bundle -- the camera-free face is free",
            mp.length === 0, mp.length ? "FETCHED: " + mp.join(", ") : "zero external MediaPipe requests");
        report("so the `heavy` note on thead and facemuscles now OVER-warns for the embedded mount. Left " +
               "standing on purpose: over-warning is the safe direction, and `heavy` also drives v3556's " +
               "heavy-last ORDERING invariant, which is its own round to unpick");
        await ctx2.close();

        await ctx.close();
        await b.close();
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
