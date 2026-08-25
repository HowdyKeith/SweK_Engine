// WebGLEngine/tools/ship/avatarServerViews-selfcheck.mjs
//
// Run: node tools/ship/avatarServerViews-selfcheck.mjs   (needs Chromium for section 4; skips cleanly without)
// RUNTIME 10.0s MEASURED (median of 3 -- 9998/10028/10027 -- with date(1) around the run). Almost all of it is
// section 4: a real headless Chromium loading eight pages, four of them mounting MediaPipe-capable views into
// an iframe and waiting long enough for the inner document to exist before reading it. Measured with date(1).
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
// *** AND SECTION 4 IS KEITH'S ACTUAL REPORT: *** "it shows the title 'wireframe head Show' at the top, and
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
console.log("\n4. *** THE REAL BROWSER: THE GALLERY PILL IS GONE FROM THE FRAME AND STILL THERE ON ITS OWN PAGE ***");
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
        await pg.waitForTimeout(1800);
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
                start: vis(d.getElementById("btn-start")),
            };
        });
        ok("!! the face-muscles view mounts with the flag", !!face && /face-mirror\.html\?embed=1/.test(face.src), face && face.src);
        ok("!! ...and reads it", !!face && face.embedded === true);
        ok("!! ...and hides the full page's title and metrics grid", !!face && !face.h1 && !face.metrics,
            face ? `h1 ${face.h1}, metrics ${face.metrics}` : "");
        ok("!! ...while KEEPING the blendshape-driven robot and the camera button",
            !!face && face.robot === true && face.start === true,
            face ? `robot ${face.robot}, start ${face.start}` : "");
        report("the camera button stays on purpose: a view that opened the webcam on load would be a permission " +
               "prompt nobody asked for, in a panel the user may only have been passing through");

        await ctx.close();
        await b.close();
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
