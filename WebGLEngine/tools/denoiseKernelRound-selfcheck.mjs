// WebGLEngine/tools/denoiseKernelRound-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/denoiseKernelRound-selfcheck.mjs      (seconds: no device; the round itself runs on the rig)
//
// THE REGISTERED KERNEL-TABLE ROUND, HELD. tools/denoiseKernelRound.mjs times the page's set for an adapter against a challenger IN THE PAGE and decides by a rule written
// before any run. This holds the rule and the command's refusals; the timing is the rig's (docs/real-hardware-denoiser-layers.md).
//
//   1  THE MEDIANS     a ladder's GPU medians by size, only the sizes every set was timed at on the GPU's clock
//   2  THE RULE        only sizes of 512 or more timed in every repeat count, at least two of them; at EVERY such size the median ratio incumbent / challenger at least 1.02
//                      AND the challenger faster in at least 4 of 5 repeats; and the page's own check that timing changed no image
//   3  THE COMMAND     it refuses an unknown option, a challenger that is not a timed set, and a repeat count outside 1-20, before any browser
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as K from "./denoiseKernelRound.mjs";

const CMD = fileURLToPath(new URL("./denoiseKernelRound.mjs", import.meta.url)), ENG = path.resolve(path.dirname(CMD), "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

console.log("denoiseKernelRound-selfcheck -- the registered kernel-table round\n");

console.log("1. THE MEDIANS");
await section(() => {
    const row = (W, H, ms, skipped = false) => ({ W, H, skipped, gpu: { median: ms } });   // a skipped row may still carry a number: it must not count
    const L = { rows: { a: [row(256, 256, 5), row(512, 512, 20), row(1024, 1024, 80)], b: [row(256, 256, 4), row(512, 512, 19), row(1024, 1024, 70, true)] } };
    const m = K.mediansOf(L, ["a", "b"]);
    ok("!! a ladder's GPU medians by size, only where every set was timed on the GPU's clock (a size one set skipped is left out)", JSON.stringify(m) === JSON.stringify({ "256x256": { a: 5, b: 4 }, "512x512": { a: 20, b: 19 } }));
});

console.log("2. THE RULE");
await section(() => {
    const rep = (r512, r1024, r1080 = r1024) => ({ "256x256": { inc: 1, ch: 10 }, "512x512": { inc: r512, ch: 1 }, "1024x1024": { inc: r1024, ch: 1 }, "1920x1080": { inc: r1080, ch: 1 } });
    const five = (...rs) => rs.map((r) => rep(...r));
    const win = K.decide(five([1.05, 1.04], [1.03, 1.03], [1.04, 1.05], [1.02, 1.06], [0.99, 1.04]), "inc", "ch");
    ok("!! THE CHALLENGER REPLACES the incumbent when, at every size of 512 or more, its median ratio is at least 1.02 and it won 4 of 5 repeats (256 x 256, where it lost badly, does not count)", win.replace && win.entry === "ch" && win.sizes.length === 3 && win.sizes.every((s) => s.holds) && win.sizes[0].wins === 4, win.reason);
    const thin = K.decide(five([1.05, 1.019], [1.03, 1.019], [1.04, 1.019], [1.02, 1.019], [1.04, 1.019]), "inc", "ch");
    ok("!! a median of 1.019 at ONE size is not enough -- the incumbent stays, and says which size failed", !thin.replace && thin.entry === "inc" && /1024x1024 median 1\.019/.test(thin.reason));
    const three = K.decide(five([1.1, 1.1], [1.1, 1.1], [0.9, 1.1], [0.9, 1.1], [1.1, 1.1]), "inc", "ch");
    ok("!! a median over 1.02 with only 3 of 5 repeats won is not enough", !three.replace && three.sizes[0].wins === 3 && three.sizes[0].median >= 1.02);
    const outlier = K.decide(five([1.03, 1.03], [1.03, 1.03], [1.03, 1.03], [1.03, 1.03], [0.5, 0.5]), "inc", "ch");
    ok("!! it is the MEDIAN, not the mean: four repeats at 1.03 and one wild 0.5 (a mean of 0.92) still replace", outlier.replace && Math.abs(outlier.sizes[0].median - 1.03) < 1e-12);
    const one = K.decide([{ "256x256": { inc: 2, ch: 1 }, "512x512": { inc: 2, ch: 1 } }], "inc", "ch"), changed = K.decide(five([1.1, 1.1], [1.1, 1.1], [1.1, 1.1], [1.1, 1.1], [1.1, 1.1]), "inc", "ch", { invisible: false });
    ok("!! fewer than two sizes of 512 or more is no decision; a page that found timing changed an image is no decision either", !one.replace && /only 1 size/.test(one.reason) && !changed.replace && /changed an image/.test(changed.reason));
    ok("!! the rule's numbers are the registered ones: 512, 1.02, 4/5, two sizes", K.MIN_SIDE === 512 && K.MIN_RATIO === 1.02 && K.WIN_SHARE === 4 / 5 && K.MIN_SIZES === 2);
});

console.log("3. THE COMMAND");
await section(() => {
    const run = (...x) => spawnSync(process.execPath, [CMD, ...x], { encoding: "utf8", timeout: 60000, cwd: ENG });
    const bad = run("--speed", "1"), ch = run("--challenger", "r99"), rp = run("--challenger", "r57p", "--repeats", "0");
    ok("!! it refuses an unknown option, a challenger that is not a timed set, and a repeat count outside 1-20, before any browser", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && ch.status === 2 && /--challenger is one of/.test(ch.stderr) && rp.status === 2 && /--repeats is a whole number/.test(rp.stderr));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 10 mutants of tools/denoiseKernelRound.mjs, each in a hard-linked copy of the tree: ALL 10 RED (sizes under 512 counted, the ratio inverted, the wins
// ignored, one size enough to replace, one size enough to decide, the page's image check ignored, a skipped size kept, the challenger and the repeat count unchecked, the mean
// for the median) -- two of them (the skipped size, the mean) GREEN at first, as the skipped row carried no number and no case had an outlier; both are in the cases now.
// The whole command was run once on this box's SwiftShader with --allow-software --no-native: the page route answered (key and incumbent read off the page) and the report
// said it decided nothing.
