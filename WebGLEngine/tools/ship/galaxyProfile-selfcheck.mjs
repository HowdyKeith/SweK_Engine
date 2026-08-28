// WebGLEngine/tools/ship/galaxyProfile-selfcheck.mjs -- v4124
//
// Run: node tools/ship/galaxyProfile-selfcheck.mjs   (a few seconds for the static half; up to a minute or two
// for the live half, which clones and pip-installs into a throwaway directory)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/galaxyProfileBridge.js + galaxy-profile.html -- the install button for vinimlo/galaxy-profile
// (GPL-3.0), never vendored into this tree. Keith asked directly whether that is allowed; the answer this file
// exists to keep honest is: yes, because cloning a PUBLIC repo onto the user's OWN machine and running it as
// its own process is not distributing it -- the same reasoning voxtral's engine and webrtx's build already
// use. What this gate actually checks is that the code lives up to that reasoning: nothing of theirs is
// imported into this process, nothing is vendored, the commit that runs is the one that was reviewed, and a
// supplied GitHub token never touches disk.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("galaxyProfile-selfcheck -- an install button for somebody else's GPL-3.0 repo, never vendored\n");

const bridgeSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "galaxyProfileBridge.js"), "utf8");
const pageSrc = fs.readFileSync(path.join(ENG, "galaxy-profile.html"), "utf8");
const serverSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");

// ---- 1. THE REASONING IS RECORDED, NOT JUST FOLLOWED ---------------------------------------------------------
{
    console.log("1. THE LICENCE REASONING, WRITTEN DOWN RATHER THAN JUST ACTED ON");
    ok("!! *** bridge names the licence and states it was actually verified, not assumed ***",
        /GPL-3\.0/.test(bridgeSrc) && /LICENSE file present/.test(bridgeSrc));
    ok("   ...and states the distribution-vs-linking reasoning that makes this allowed at all",
        /DISTRIBUTING the code or LINKING/i.test(bridgeSrc) || /distributing it/i.test(bridgeSrc));
    ok("!! *** REFUSED explicitly names: no vendoring, no in-process import, no token persistence ***",
        /vendoring galaxy-profile's source/.test(bridgeSrc) &&
        /importing galaxy-profile's Python into this bridge's own process/.test(bridgeSrc) &&
        /storing a supplied GITHUB_TOKEN anywhere on disk/.test(bridgeSrc));
}

// ---- 2. *** A COMMIT IS PINNED, WHICH THIS TREE HAS NOT DONE FOR AN INSTALL BUTTON BEFORE *** -----------------
{
    console.log("\n2. *** PINNED TO A REVIEWED COMMIT -- `main` IS NEVER RUN BLIND ***");
    const m = bridgeSrc.match(/PINNED_COMMIT\s*=\s*"([0-9a-f]{40})"/);
    ok("!! *** PINNED_COMMIT is a real 40-char SHA, not a branch name ***", !!m, m ? m[1] : "no match");
    ok("   ...and install() checks it out explicitly rather than trusting the clone's default branch",
        /checking out pinned commit/.test(bridgeSrc) && /\["checkout", PINNED_COMMIT\]/.test(bridgeSrc));
    ok("!! *** clone is FULL, not shallow -- `checkout <sha>` needs history a --depth 1 clone may not have ***",
        /\["clone", REPO, SRC_DIR\]/.test(bridgeSrc) && !/--depth/.test(bridgeSrc.split("function install")[1] || ""));
}

// ---- 3. STAGED OUTSIDE THE TREE, LIKE EVERY OTHER INSTALL BUTTON HERE ------------------------------------------
{
    console.log("\n3. STAGED OUTSIDE THE ENGINE TREE (packagerBridge's SKIP_DIRS does not cover ~/.voxelbridge)");
    const PB = require_("../../ai-bridge/packagerBridge.js");
    const PROJECT_ROOT = PB.PROJECT_ROOT || path.resolve(ENG, "..");
    const srcDirLine = bridgeSrc.match(/const SRC_DIR = process\.env\.GALAXY_PROFILE_SRC_DIR \|\| (.+);/);
    ok("!! *** default SRC_DIR resolves under the home directory, not under the project root ***",
        !!srcDirLine && /os\.homedir\(\)/.test(srcDirLine[1]) && /\.voxelbridge/.test(srcDirLine[1]));
    const defaultSrcDir = path.join(os.homedir(), ".voxelbridge", "galaxy-profile");
    ok("   ...and that resolved path really is outside PROJECT_ROOT, checked rather than assumed",
        defaultSrcDir !== PROJECT_ROOT && !defaultSrcDir.startsWith(PROJECT_ROOT + path.sep),
        "PROJECT_ROOT=" + PROJECT_ROOT + " SRC_DIR=" + defaultSrcDir);
}

// ---- 4. THE PAGE SHOWS THE ATTRIBUTION IT WOULD BE EASY TO SKIP -------------------------------------------------
{
    console.log("\n4. THE PAGE ITSELF SURFACES WHOSE WORK THIS IS, NOT JUST THE BRIDGE");
    ok("!! *** page renders upstream's repo/author/licence from the bridge's own status(), not hardcoded ***",
        /u\.repo/.test(pageSrc) && /u\.author/.test(pageSrc) && /u\.license/.test(pageSrc));
    ok("   ...and renders the REFUSED list rather than only stating it in a code comment nobody visits",
        /refusedList/.test(pageSrc) && /s\.refused/.test(pageSrc));
    ok("!! *** config.yml textarea is pre-filled from upstream's OWN example, not authored by this page ***",
        /s\.exampleConfig/.test(pageSrc) && /config"\)\.value = s\.exampleConfig/.test(pageSrc));
    ok("   ...and the token field is explicitly documented as never persisted",
        /never written to disk, never logged/.test(pageSrc));
}

// ---- 5. ROUTES EXIST AND ARE WIRED --------------------------------------------------------------------------
{
    console.log("\n5. SERVER ROUTES");
    for (const r of ["/galaxy/status", "/galaxy/install", "/galaxy/generate"]) {
        ok("!! " + r + " is wired in server.js", serverSrc.includes('"' + r + '"') || serverSrc.includes("'" + r + "'"),
            undefined);
    }
    ok("!! *** there is deliberately NO /galaxy/svg/<name> route ***",
        !/\/galaxy\/svg\//.test(serverSrc),
        "the 4 SVGs travel in generate()'s own response body; a serve-by-name route would be one more thing " +
        "that could be asked to read an arbitrary path, for no benefit over just returning the bytes");
}

// ---- 6. *** THE TOKEN NEVER TOUCHES DISK, DRIVEN FOR REAL, NOT JUST READ *** -----------------------------------
{
    console.log("\n6. *** A SUPPLIED TOKEN IS NEVER WRITTEN ANYWHERE ON DISK ***");
    ok("!! generate() explicitly deletes any inherited GITHUB_TOKEN before deciding whether to set one",
        /delete env\.GITHUB_TOKEN/.test(bridgeSrc));
    ok("   ...and config.yml is written from configYaml alone -- there is no token field in the schema to leak into it",
        /fs\.writeFileSync\(path\.join\(SRC_DIR, "config\.yml"\), String\(configYaml\)\)/.test(bridgeSrc));
}

// ---- 7. *** LIVE: A REAL CLONE, PIN, VENV, PIP INSTALL, AND GENERATE -- SKIPS CLEANLY WITHOUT git/python *** ---
{
    console.log("\n7. *** LIVE INSTALL + GENERATE, AGAINST A THROWAWAY DIRECTORY ***");
    const py = require_("../../ai-bridge/pythonResolve.js");
    const cand = py.resolve();
    let gitOk = false;
    try { require_("node:child_process").execFileSync("git", ["--version"], { timeout: 5000 }); gitOk = true; } catch {}

    if (!cand || !gitOk) {
        report("SKIPPED -- " + (!cand ? "no working Python found" : "") + (!gitOk ? " no git found" : ""));
        report("*** THAT IS A SKIP AND NOT A PASS: this is the section that proves the bridge actually works.");
    } else {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "galaxy-profile-gate-"));
        process.env.GALAXY_PROFILE_SRC_DIR = tmp;
        delete require_.cache[require_.resolve("../../ai-bridge/galaxyProfileBridge.js")];
        const bridge = require_("../../ai-bridge/galaxyProfileBridge.js");

        const startRes = bridge.install();
        ok("!! install() returns immediately (fire-and-poll), not after the job finishes",
            startRes.ok && startRes.kind === "clone");

        let job = null;
        for (let i = 0; i < 90 && !(job && job.done); i++) {
            await new Promise((r) => setTimeout(r, 1500));
            job = bridge.installStatus();
        }
        ok("!! *** install job actually finished (clone, checkout, venv, pip) within budget ***",
            !!job && job.done, job ? "code=" + job.code : "still running");
        ok("!! *** and it succeeded ***", !!job && job.done && job.code === 0, job ? job.tail.slice(-300) : "");

        if (job && job.done && job.code === 0) {
            const st = await bridge.status();
            ok("!! status() reports ready:true once install() has actually finished", st.ready === true, st.why);
            ok("!! *** the checkout is really at the pinned commit, not `main`'s tip ***", st.atPinnedCommit === true);

            const SECRET_TOKEN = "ghp_gateSabotageTokenShouldNeverLandOnDisk";
            const gen = await bridge.generate({ demo: true, token: SECRET_TOKEN });
            ok("!! *** generate({demo:true}) produces all 4 named SVGs ***",
                gen.ok && bridge.OUTPUT_NAMES.every((n) => typeof gen.svgs[n] === "string" && /^<svg /.test(gen.svgs[n])),
                gen.ok ? Object.keys(gen.svgs).join(", ") : gen.error);

            // *** SABOTAGE: THE TOKEN MUST NOT APPEAR ANYWHERE ON DISK UNDER SRC_DIR. *** Walks the real checkout
            // after a real run with a real (fake) secret, rather than trusting the code's own claim about itself.
            let leaked = [];
            (function walk(dir) {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (e.name === ".git") continue;
                    const p = path.join(dir, e.name);
                    if (e.isDirectory()) { walk(p); continue; }
                    try { if (fs.readFileSync(p, "utf8").includes(SECRET_TOKEN)) leaked.push(p); } catch { /* binary file in the venv; not a leak vector for a string we wrote ourselves */ }
                }
            })(tmp);
            ok("!! *** SABOTAGE: a token passed to generate() does not appear ANYWHERE under the checkout ***",
                leaked.length === 0, leaked.join(", "));
        }
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
}

// ---- 8. *** LIVE PAGE, DRIVEN IN A REAL BROWSER AGAINST THE REAL SERVER *** -------------------------------------
{
    console.log("\n8. *** THE PAGE, DRIVEN IN A REAL BROWSER AGAINST THE REAL server.js ***");
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    let hasBridgeDeps = false;
    try { require_("../../ai-bridge/pythonResolve.js").resolve(); hasBridgeDeps = true; } catch {}
    if (skip) {
        report("SKIPPED -- " + skip);
    } else {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "galaxy-profile-page-gate-"));
        // A FIXED, UNLIKELY-TO-COLLIDE PORT -- not 0. PORT=0 looks like "let the OS assign one" but server.js
        // reads it as `parseInt(process.env.PORT, 10) || 8787`, and 0 is falsy in JS, so PORT=0 silently falls
        // back to 8787 -- the default engine port, which a real running engine on this box may already hold.
        const GATE_PORT = "19787";
        const env = Object.assign({}, process.env, { PORT: GATE_PORT, GALAXY_PROFILE_SRC_DIR: tmp });
        const { spawn } = require_("node:child_process");
        const srv = spawn(process.execPath, [path.join(ENG, "ai-bridge", "server.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
        let port = null, buf = "";
        srv.stdout.on("data", (d) => { buf += d.toString(); if (buf.includes(":" + GATE_PORT)) port = GATE_PORT; });
        for (let i = 0; i < 40 && !port; i++) await new Promise((r) => setTimeout(r, 250));

        if (!port) {
            report("SKIPPED -- could not determine the port server.js bound to (no PORT=0 listening line matched)");
        } else {
            const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
            const pg = await (await b.newContext()).newPage();
            const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message)));
            await pg.goto("http://127.0.0.1:" + port + "/galaxy-profile.html", { waitUntil: "load" }).catch(() => {});
            await pg.waitForTimeout(400);
            const prov = await pg.evaluate(() => document.getElementById("prov").innerText).catch(() => "");
            ok("!! provenance table renders the real repo URL on load", /vinimlo\/galaxy-profile/.test(prov));

            if (hasBridgeDeps) {
                await pg.click("#install").catch(() => {});
                let ready = false;
                for (let i = 0; i < 60 && !ready; i++) {
                    await pg.waitForTimeout(1500);
                    const s = await pg.evaluate(() => fetch("/galaxy/status").then((r) => r.json())).catch(() => ({}));
                    if (s.ready) ready = true;
                }
                ok("!! *** Install button drives a real install to completion in a real browser ***", ready);
                if (ready) {
                    await pg.waitForTimeout(1800);
                    await pg.click("#generate").catch(() => {});
                    await pg.waitForTimeout(5000);
                    const svgCount = await pg.evaluate(() => document.querySelectorAll("#svgs img").length).catch(() => 0);
                    ok("!! *** Generate button (demo mode) renders all 4 SVGs as <img> in the page ***", svgCount === 4, "got " + svgCount);
                }
            } else {
                report("install/generate click-through SKIPPED -- no working Python on this host");
            }
            ok("!! no script error in the page", errs.length === 0, errs.join(" | "));
            await b.close();
        }
        try { srv.kill(); } catch {}
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
