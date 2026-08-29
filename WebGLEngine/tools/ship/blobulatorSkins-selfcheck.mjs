// WebGLEngine/tools/ship/blobulatorSkins-selfcheck.mjs -- v4128
//
// Run: node tools/ship/blobulatorSkins-selfcheck.mjs   (a few seconds; skips cleanly without a browser)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES blobulator.html + blobulator-gpu.html -- and the two bugs it exists for share ONE SHAPE: both were
// reachable only from a control nobody presses on load, so every check this tree had said green.
//
// *** BUG ONE: A CRASH BEHIND A SHORT-CIRCUIT. *** blobulator.html's river frame read `wLY` and `cs` eight
// lines ABOVE the `const` that declares them. A const is hoisted but not initialised, so that is a temporal-
// dead-zone ReferenceError -- and it sat behind `if (SKIN_CYCLE[skinIdx] !== "native")`. native is the DEFAULT,
// so the expression was never evaluated until somebody picked another skin. Keith did: "i clicked the skin:
// lava button and there is no render shown", console filling at 60 Hz. A page-load smoke test cannot see this.
// So section 2 CYCLES EVERY SKIN and fails on any page error -- the default is the one state already proven.
//
// *** BUG TWO: A HANDLER THAT WAS A SYNTAX ERROR, IN THREE PAGES AT ONCE. *** The HUD's show/hide control was
// written onclick="this.closest(\'#hud\')..." -- a backslash-escaped quote, which is invalid inside an HTML
// attribute and makes the handler unparseable rather than merely wrong. Keith read the symptom exactly as it
// looked: the hamburger "does not move/drag/activate". Section 3 checks the idiom across the tree, because the
// same broken line was copied into blobulator.html, blobulator-gpu.html and box3d-blobs.html.
//
// *** WHAT IT DELIBERATELY DOES NOT FLAG: *** webtorrent.html contains the same \' sequence INSIDE A JAVASCRIPT
// STRING, where the escape is correct and required. A check that grepped for the characters alone would have
// "fixed" working code, so section 3 tests for the pattern in an ATTRIBUTE rather than anywhere in the file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import http from "node:http";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("blobulatorSkins-selfcheck -- two bugs that only a non-default control could reach\n");

const src = fs.readFileSync(path.join(ENG, "blobulator.html"), "utf8");

// ---- 1. THE TDZ, AT SOURCE LEVEL ----------------------------------------------------------------------------
{
    console.log("1. THE RIVER'S DIMENSIONS ARE READ BEFORE THEY ARE USED");
    const declAt = src.indexOf("const wLX = LX * cs, wLY = LY * cs, wLZ = LZ * cs;");
    const useAt = src.indexOf("center: [0, wLY *");
    ok("!! *** wLY is DECLARED before the skin line that reads it (a const read early is a ReferenceError) ***",
        declAt > 0 && useAt > 0 && declAt < useAt,
        declAt < 0 ? "declaration not found" : useAt < 0 ? "use not found"
            : "declared at " + declAt + ", used at " + useAt);
    ok("!! ...and riverDims is destructured ONCE in that block, not once per use",
        (src.match(/const \{ LX, LY, LZ, cs \} = riverDims;/g) || []).length === 1,
        (src.match(/const \{ LX, LY, LZ, cs \} = riverDims;/g) || []).length + " destructuring(s)");
    ok("!! *** the ramp centre is wLY * 0.4, NOT wLY * cs -- wLY already contains cs ***",
        /center: \[0, wLY \* 0\.4, 0\]/.test(src) && !/center: \[0, wLY \* cs/.test(src),
        "multiplying by the cell size twice would put the colour ramp far above the fluid");
}

// ---- 2. *** EVERY SKIN, DRIVEN IN A REAL BROWSER -- THE DEFAULT IS THE ONE ALREADY PROVEN *** ----------------
{
    console.log("\n2. *** EVERY SKIN RENDERS WITHOUT A PAGE ERROR (the crash was one click from default) ***");
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: this is the section that would have caught the crash.");
    } else {
        const srv = http.createServer((rq, rs) => {
            const u = decodeURIComponent(rq.url.split("?")[0]);
            const f = path.join(ENG, u === "/" ? "/blobulator.html" : u);
            if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end("nf"); }
            const e = path.extname(f);
            rs.writeHead(200, { "Content-Type": e === ".js" || e === ".mjs" ? "text/javascript" : e === ".html" ? "text/html" : "application/octet-stream" });
            rs.end(fs.readFileSync(f));
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const port = srv.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await (await b.newContext()).newPage();
        const errs = [];
        pg.on("pageerror", (e) => errs.push(String(e.message)));
        await pg.goto("http://127.0.0.1:" + port + "/blobulator.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(1200);

        const names = [];
        for (let i = 0; i < 6; i++) {
            const label = await pg.evaluate(() => {
                const b2 = [...document.querySelectorAll("button")].find((x) => /^skin:/.test(x.textContent));
                return b2 ? b2.textContent : null;
            }).catch(() => null);
            if (label) names.push(label.replace(/^skin:\s*/, ""));
            await pg.evaluate(() => {
                const b2 = [...document.querySelectorAll("button")].find((x) => /^skin:/.test(x.textContent));
                if (b2) b2.click();
            }).catch(() => {});
            await pg.waitForTimeout(260);
        }
        ok("!! more than one skin exists to cycle (one would make this check vacuous)",
            new Set(names).size >= 2, "saw: " + [...new Set(names)].join(", "));
        ok("!! *** NO page error after cycling every skin ***", errs.length === 0, errs.slice(0, 2).join(" | "));
        ok("   ...and specifically no 'before initialization' ReferenceError",
            !errs.some((e) => /before initialization/.test(e)),
            errs.filter((e) => /before initialization/.test(e))[0] || "none");
        await b.close();
        srv.close();
    }
}

// ---- 3. THE ATTRIBUTE-ESCAPING IDIOM, ACROSS THE TREE --------------------------------------------------------
{
    console.log("\n3. NO BACKSLASH-ESCAPED QUOTE INSIDE AN HTML EVENT ATTRIBUTE");
    // *** THE DISCRIMINATOR IS <script>, AND THE FIRST VERSION OF THIS CHECK GOT IT WRONG. *** Matching
    // on<event>="...\'..." per line flagged petfbi.html, server.html and webtorrent.html -- all three build
    // markup by CONCATENATING JS STRINGS, where \' is correct and required. Reported as a finding those would
    // have been three "fixes" that broke working pages. The real difference is not the characters, it is
    // WHERE THEY LIVE: an attribute in real markup versus one being assembled inside a script. So script
    // blocks are removed first and the test runs on what is actually parsed as HTML.
    const ATTR = /\son[a-z]+="[^"]*\\'/;
    const bad = [];
    for (const f of fs.readdirSync(ENG).filter((f) => f.endsWith(".html"))) {
        const s = fs.readFileSync(path.join(ENG, f), "utf8");
        const markup = s.replace(/<script[\s\S]*?<\/script>/gi, "");
        for (const line of markup.split("\n")) if (ATTR.test(line)) { bad.push(f); break; }
    }
    ok("!! *** no page has \\' inside an on*= attribute (it is a syntax error, not a quoting style) ***",
        bad.length === 0, bad.join(", ") || "none");
    // A NEGATIVE CONTROL, and it is the half that keeps this check honest. These three DO contain the
    // characters, inside JS strings, correctly. If a future edit makes the test naive again they light up.
    const CONTROLS = ["webtorrent.html", "petfbi.html", "server.html"];
    const stillHaveIt = CONTROLS.filter((f) => /\\'/.test(fs.readFileSync(path.join(ENG, f), "utf8")));
    ok("!! *** the three pages that legitimately use \\' in a JS STRING are not flagged ***",
        stillHaveIt.length === CONTROLS.length && !CONTROLS.some((f) => bad.includes(f)),
        "controls still carrying the sequence: " + stillHaveIt.join(", ") +
        " -- flagging these would be three 'fixes' that broke working pages");
}

// ---- 4. THE HUD TOGGLE IS REACHABLE FROM THE WHOLE TITLE LINE ------------------------------------------------
{
    console.log("\n4. THE TITLE LINE TOGGLES, AND THE LINK INSIDE IT STILL NAVIGATES");
    for (const f of ["blobulator.html", "blobulator-gpu.html"]) {
        const s = fs.readFileSync(path.join(ENG, f), "utf8");
        ok("!! " + f + ": the h1 carries a click handler, not only the hamburger",
            /h1\.addEventListener\("click"/.test(s));
        ok("   ...and it skips <a> so a real link is not swallowed by the toggle",
            /ev\.target\.closest\("a"\)/.test(s));
    }
    ok("!! #hud.min hides everything except the title -- which is what 'minimise to the top line' means",
        /#hud\.min > :not\(h1\) \{ display:none; \}/.test(src));
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
