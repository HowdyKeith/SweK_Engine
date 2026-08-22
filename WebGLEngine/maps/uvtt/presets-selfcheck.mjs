// maps/uvtt/presets-selfcheck.mjs -- v3818
//
// Run: node maps/uvtt/presets-selfcheck.mjs
//
// *** THE SEVEN MAPS KEITH SUPPLIED, SHIPPED AS PRESETS SO uvtt.html HAS SOMETHING TO SHOW BEFORE ANYBODY
// HAS A FILE. *** They are stored VERBATIM -- not reformatted, not repaired, not stripped of their placeholder
// images -- so a preset exercises the same path a file dropped from a cartographer's site does. A preset that
// has been quietly cleaned up is a test of nothing.
//
// WHAT IS GRADED HERE, AND WHY EACH ONE:
//   1. THE LIST IS ONE LIST. The dropdown and this gate both read maps/uvtt/presets.mjs. A list typed into
//      the page and a list typed into the gate would agree until the day somebody added an eighth map.
//   2. EVERY FILE PARSES AND FITS ITS OWN DECLARED map_size -- a preset that renders off the edge of its grid
//      would look like a loader bug forever.
//   3. THE MAP ART IS CLASSIFIED FROM THE BYTES. This is the one that cost a round: see below.
//
// *** THE THING THAT WAS ACTUALLY WRONG WAS IN THE PAGE, NOT IN KEITH'S FILES. ***
// uvtt.html handed the `image` field to an <img> and waited. It had an onload and NO onerror, so the two
// keep-60 maps -- whose image field is the literal string "MapImage" -- failed into silence and drew a bare
// floor with no explanation. Worse, the OTHER five carry the classic 68-byte 1x1 grey-alpha PNG, which
// SUCCEEDS: one pixel stretched over the whole map, and the loader then sets the floor material to white, so
// the honest brown floor was replaced by a stretched pixel and the map read as BLANK rather than as bare.
//
// AND ADDING onerror DID NOT FIX IT RELIABLY, WHICH IS THE PART WORTH KEEPING. Measured over repeated runs of
// the same seven presets in a real browser: keep-60-lvl2 got its note on one run and not the next. Both keep
// files carry the SAME failing data URL, and once the browser has failed that URL it does not reliably
// re-fire either event on a fresh Image. *** THE VERDICT DEPENDED ON A CACHE, WHICH IS NOT A PROPERTY OF THE
// MAP. *** So describeMapArt reads the PNG header instead -- synchronously, before any Image exists -- and
// that is what this gate can therefore check without a browser at all.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UVTT_PRESETS, UVTT_PRESET_DIR } from "./presets.mjs";
import { describeMapArt, MIN_ART_PX } from "./mapArt.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

console.log("1. EVERY ENTRY IN THE LIST IS A FILE, AND EVERY FILE IS A UVTT");
const loaded = [];
{
    for (const p of UVTT_PRESETS) {
        const full = path.join(ENG, UVTT_PRESET_DIR, p.file);
        if (!existsSync(full)) { ok("!! " + p.file + " exists", false, "missing at " + full); continue; }
        let d = null;
        try { d = JSON.parse(readFileSync(full, "utf8")); }
        catch (e) { ok("!! " + p.file + " parses", false, e.message); continue; }
        const ms = d.resolution && d.resolution.map_size;
        const pts = [];
        for (const poly of (d.line_of_sight || [])) for (const q of poly) pts.push(q);
        const oob = pts.filter((q) => q.x < 0 || q.y < 0 || q.x > ms.x || q.y > ms.y);
        const portalOob = (d.portals || []).filter((q) => q.position.x > ms.x || q.position.y > ms.y);
        loaded.push({ p, d, ms });
        ok("!! " + p.file.padEnd(24) + " " + ms.x + "x" + ms.y + ", " + (d.line_of_sight || []).length +
           " wall runs, " + (d.portals || []).length + " portals, " + (d.lights || []).length + " lights",
            !!ms && ms.x > 0 && ms.y > 0 && oob.length === 0 && portalOob.length === 0,
            oob.length ? oob.length + " wall points outside the declared grid" :
            portalOob.length ? portalOob.length + " portals outside the grid" : "all geometry inside its own grid");
    }
    ok("!! the list and the folder agree", loaded.length === UVTT_PRESETS.length,
        loaded.length + " of " + UVTT_PRESETS.length + " entries resolved");
}

console.log("\n2. THE PAGE READS THE LIST RATHER THAN CARRYING ITS OWN COPY");
{
    const page = readFileSync(path.join(ENG, "uvtt.html"), "utf8");
    ok("!! uvtt.html imports maps/uvtt/presets.mjs", /maps\/uvtt\/presets\.mjs/.test(page),
        "so adding a map to the manifest puts it in the dropdown with no second edit");
    ok("!! ...and does NOT hard-code any preset filename",
        !UVTT_PRESETS.some((p) => page.includes(p.file)),
        "not one of the seven filenames appears in the page. A DROPDOWN TYPED BY HAND IS A SECOND LIST, and " +
        "the two agree right up until somebody adds the eighth map to one of them");
    ok("!! presets go through loadText, the same function a dropped file goes through",
        /loadText\(await r\.text\(\)\)/.test(page),
        "so a preset that renders proves the REAL path rather than a demo path built beside it");
    ok("!! and the art verdict is taken from the bytes, not from an Image event",
        /describeMapArt\(data\.image\)/.test(page) && !/im\.naturalWidth/.test(page),
        "measured intermittent the other way: same failing data URL, cached, and the event did not re-fire");
}

console.log("\n3. THE MAP ART, CLASSIFIED -- AND ALL SEVEN ARE GEOMETRY-ONLY");
{
    const counts = {};
    for (const { p, d } of loaded) {
        const a = describeMapArt(d.image);
        counts[a.reason] = (counts[a.reason] || 0) + 1;
        ok("   " + p.file.padEnd(24) + " -> " + a.reason.padEnd(12) +
           (a.width ? a.width + "x" + a.height + " " : "") + a.bytes + "B",
            a.reason === "placeholder" || a.reason === "not-png",
            a.why || "usable art");
    }
    ok("!! *** NOT ONE OF THE SEVEN CARRIES REAL MAP ART ***",
        (counts.placeholder || 0) === 5 && (counts["not-png"] || 0) === 2,
        "five 1x1 placeholders and two \"MapImage\" strings. THAT IS FINE AND IT IS THE POINT: these are " +
        "geometry-only maps and the loader now SAYS so, where before five of them silently painted a " +
        "stretched pixel over the floor and two failed into nothing");
}

console.log("\n4. THE CLASSIFIER ITSELF, ON CASES THE SHIPPED FILES DO NOT COVER");
{
    // A real 4x4 PNG, built here rather than borrowed, so the "usable" branch is exercised at all. Without
    // this the gate would only ever have seen the rejecting paths and "usable" would be untested code.
    const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
    const chunk = (tag, data) => {
        const out = Buffer.alloc(8 + data.length + 4);
        out.writeUInt32BE(data.length, 0); out.write(tag, 4); data.copy(out, 8);
        out.writeUInt32BE(crc(Buffer.concat([Buffer.from(tag), data])), 8 + data.length); return out;
    };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(4, 4);
    ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const png4 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr)]).toString("base64");
    const good = describeMapArt(png4);
    ok("!! a real 4x4 PNG IS usable", good.usable && good.width === 4 && good.height === 4,
        "reason=" + good.reason + " " + good.width + "x" + good.height + " -- the accepting branch is " +
        "exercised, so this gate is not only ever watching things be rejected");

    ok("an absent image field is 'absent', not an error", describeMapArt(undefined).reason === "absent");
    ok("an empty string is 'absent' too", describeMapArt("").reason === "absent");
    ok("!! the placeholder threshold is a NAMED constant, not a literal in a branch",
        MIN_ART_PX === 3, "MIN_ART_PX = " + MIN_ART_PX +
        " -- 1x1 and 2x2 are placeholders, 3x3 up is somebody's actual map");
}

console.log("\n5. THE PAIRS POINT AT EACH OTHER");
{
    const byFile = new Map(UVTT_PRESETS.map((p) => [p.file, p]));
    const paired = UVTT_PRESETS.filter((p) => p.pairsWith);
    let symmetric = true;
    for (const p of paired) {
        const other = byFile.get(p.pairsWith);
        if (!other || other.pairsWith !== p.file) symmetric = false;
    }
    ok("!! every pairsWith names a preset that names it back", symmetric && paired.length === 4,
        paired.length + " paired entries (tower lvl1/lvl2 and keep lvl1/lvl2). A ONE-WAY LINK WOULD READ AS " +
        "A MISSING FILE to anybody following it from the wrong end");
    say("NOT CLAIMED: that the loader STACKS a pair. uvtt.html's Levels slider generates levels from ONE map " +
        "rather than composing two files, so tower lvl1 + lvl2 are two separate loads that happen to share a " +
        "staircase coordinate at (22,20). *** WIRING THE SLIDER TO A REAL PAIR IS A ROUND OF ITS OWN and the " +
        "manifest carries pairsWith so that round has somewhere to start. ***");
}

console.log("\n6. SABOTAGE");
{
    ok("!! SABOTAGE: the 1x1 placeholder IS rejected",
        describeMapArt("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=").reason === "placeholder",
        "the exact 68-byte image five of the shipped maps carry -- and the one that used to SUCCEED and paint " +
        "a stretched pixel over the whole floor");
    ok("!! SABOTAGE: a non-base64 string IS rejected", describeMapArt("MapImage").reason === "not-png",
        "the exact string the two keep-60 files carry");
    ok("!! SABOTAGE: base64 that is not a PNG IS rejected",
        describeMapArt(Buffer.from("this is definitely not a png at all").toString("base64")).reason === "not-png",
        "decodes cleanly and is still not an image -- so the check is on the SIGNATURE and not on whether " +
        "base64 happened to parse");
}

say("\nWHAT THIS DOES NOT DO: it never draws anything. VERIFIED SEPARATELY IN A REAL BROWSER at v3818 -- all " +
    "seven presets load through loadText with no page error, all seven report their art verdict on three " +
    "consecutive runs (it was 6-of-7 and intermittent before the byte-level classifier), and each one's " +
    "canvas screenshot is 8 to 12 times the size of the empty canvas, which is geometry being drawn rather " +
    "than a status line claiming it. *** WHETHER THE DUNGEONS LOOK RIGHT IS KEITH'S READING. ***");

console.log("\npresets-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
