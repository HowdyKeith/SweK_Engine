// bz/tools/bzw-coverage.mjs — report what the .bzw adapter consumes, and guard the report.
//
//   node bz/tools/bzw-coverage.mjs <map.bzw> [more.bzw ...]
//   node bz/tools/bzw-coverage.mjs --selfcheck
//
// The guard is the point. It fires when the table over-claims (a keyword declared here that the adapter
// never quotes) and when it under-claims (a keyword reported as ignored that the adapter plainly reads).
// It scans the raw source, comments included, so a coincidence of vocabulary trips it too. Move the word.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseBZW } from "../bzwParse.js";
import { buildWorld } from "../bzwWorld.js";
import { HANDLED, RECORDED, PARAM_KEYS, coverageReport, formatCoverage } from "../bzCoverage.js";

const BZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function selfcheck() {
    let pass = 0, fail = 0;
    const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));

    // --- 1. a small map with two ignored object types and one ignored parameter ------------------
    const text = [
        "# a comment",
        "world", "name Test", "size 100", "end",
        "box", "position 0 0 0", "size 10 10 5", "end",
        "box", "position 5 5 0", "texsize 4 4", "end",       // <-- ignored parameter: no textures here
        "pyramid", "flipz", "end",
        "physics", "name conveyor", "end",                   // <-- RECORDED, not simulated
        "weapon", "type SW", "end",                          // <-- RECORDED
        "widget", "end",                                     // <-- not a .bzw keyword at all
    ].join("\n");
    const rep = coverageReport(parseBZW(text));

    ok("objects counted", rep.total === 6, `got ${rep.total}`);
    ok("handled = 4 (world/box/box/pyramid)", rep.handledTotal === 4, `got ${rep.handledTotal}`);
    ok("recorded = 2 (physics/weapon)", rep.recordedTotal === 2, `got ${rep.recordedTotal}`);
    ok("physics is recorded, not handled", rep.recorded.some((u) => u.type === "physics") && !rep.handled.some((u) => u.type === "physics"));
    ok("...and not ignored either: it is read, and it does nothing", !rep.unknown.some((u) => u.type === "physics"));
    ok("`widget` is not a .bzw keyword and does not become an object", rep.unknownTotal === 0);
    ok("mesh, arc, cone and sphere are all read now", ["mesh", "arc", "cone", "sphere"].every((k) => HANDLED.has(k)));
    ok("an ignored PARAMETER is reported too", rep.paramUnknown.some((u) => u.type === "box / texsize"));
    ok("...and `matref` is not among them: it is read", !rep.paramUnknown.some((u) => u.type.endsWith("/ matref")));
    ok("a material's own lines are never reported: the block is read whole",
        coverageReport(parseBZW("material\nname x\nshader glow\nend")).paramUnknown.length === 0);
    ok("...and a known one is not", !rep.paramUnknown.some((u) => u.type.endsWith("/ position")));
    ok("`flipz` is a known pyramid parameter", !rep.paramUnknown.some((u) => u.type === "pyramid / flipz"));
    ok("...and would not be on a box", coverageReport(parseBZW("box\nflipz\nend")).paramUnknown.some((u) => u.type === "box / flipz"));
    ok("everything read is 100%", rep.pctHandled === 100);
    ok("...but only 67% is SIMULATED, and the report says both numbers", Math.round(rep.pctSimulated) === 67, `got ${rep.pctSimulated.toFixed(1)}`);

    // a map with nothing we cannot read
    const clean = coverageReport(parseBZW("box\nend\npyramid\nend"));
    ok("a map we fully understand reports 100%", clean.pctHandled === 100 && clean.unknownTotal === 0);

    // objects inside a `define` are counted too -- they are the map as much as anything else
    const grouped = coverageReport(parseBZW("define g\nphysics\nend\nenddef\ngroup g\nend"));
    ok("a recorded object inside a `define` is still counted", grouped.recorded.some((u) => u.type === "physics"));

    // --- 2. the drift guard, in both directions -------------------------------------------------
    // Which source counts is not obvious, and the guard's first run made the distinction for me.
    //
    // bzwParse.js names EVERY object keyword, including `mesh` and `sphere`, because a parser has to know
    // where a block ends before it can know whether it understands it. Quoting a keyword there means
    // "I can find its `end`", not "I read it". So the reverse guard -- the one that catches a keyword
    // reported as ignored while the code quietly consumes it -- reads only the WORLD BUILDER.
    // v2181 -- bzGeom.js joins the builder: an obstacle type it draws is one we handle, and one it names
    // in a comment about what we do NOT draw would be over-claiming. The guard reads both.
    const worldSrc = ["bzwWorld.js", "bzGeom.js", "bzMesh.js", "bzShapes.js", "bzMaterial.js"]
        .map((f) => { try { return fs.readFileSync(path.join(BZ, f), "utf8"); } catch { return ""; } }).join("\n");
    const src = ["bzwWorld.js", "bzwParse.js", "bzdb.js", "bzGeom.js", "bzMesh.js", "bzShapes.js", "bzMaterial.js"]
        .map((f) => { try { return fs.readFileSync(path.join(BZ, f), "utf8"); } catch { return ""; } })
        .join("\n");
    const quoted = (k) => src.includes(`"${k}"`);
    const built = (k) => worldSrc.includes(`"${k}"`);

    const overclaimedObjects = [...HANDLED.keys(), ...RECORDED.keys()].filter((k) => !built(k));
    ok("every HANDLED or RECORDED object type is referenced in the adapter source (no over-claiming)",
        overclaimedObjects.length === 0, overclaimedObjects.length ? "claimed but unread: " + overclaimedObjects.join(", ") : "");

    const declaredParams = new Set();
    for (const s of PARAM_KEYS.values()) for (const k of s) declaredParams.add(k);
    const overclaimedParams = [...declaredParams].filter((k) => !built(k));
    ok("every declared parameter key is referenced too",
        overclaimedParams.length === 0, overclaimedParams.length ? "claimed but unread: " + overclaimedParams.join(", ") : "");

    // The reverse: a word we report as ignored must not be one the adapter actually reads.
    // v2187 -- nothing in the .bzw format is ignored any more, so the reverse guard has only the parameters
    // left to watch: a key we report as an ignored PARAMETER must not be one the builder plainly reads.
    const REPORTED_IGNORED = ["texsize", "phydrv", "smoothbounce", "flatshading", "noclusters", "decorative", "widget"];
    const underclaimed = REPORTED_IGNORED.filter((k) => !HANDLED.has(k) && !RECORDED.has(k) && !declaredParams.has(k) && built(k));
    ok("no keyword reported as ignored is actually read by the adapter (no under-claiming)",
        underclaimed.length === 0, underclaimed.length ? "read but reported ignored: " + underclaimed.join(", ") : "");

    console.log("");
    console.log(`${pass} passed, ${fail} failed`);
    return fail === 0 ? 0 : 1;
}

const args = process.argv.slice(2);
if (args.includes("--selfcheck")) process.exit(selfcheck());

const files = args.filter((a) => !a.startsWith("--"));
if (!files.length) {
    console.log("usage: node bz/tools/bzw-coverage.mjs <map.bzw> [...]  |  --selfcheck");
    process.exit(1);
}
for (const f of files) {
    const parsed = parseBZW(fs.readFileSync(f, "utf8"));
    const w = buildWorld(parsed);
    console.log("== " + f);
    console.log(formatCoverage(coverageReport(parsed)));
    console.log(`world "${w.world.name || "(unnamed)"}" ${w.world.size} units across; `
        + `${w.obstacles.length} obstacles, ${w.links.length} links, ${w.zones.length} zones`);
    console.log("");
}
