// WebGLEngine/ui/avatarSwitch-embed-selfcheck.mjs -- v3656
//
// Run: node ui/avatarSwitch-embed-selfcheck.mjs
//
// *** A FLAG THE CALLER SENDS AND THE CALLEE NEVER READS IS NOT A FEATURE WITH A BUG -- IT IS TWO FILES THAT
// NEVER MET, AND NOTHING IN THIS TREE COULD SEE IT. ui/avatarSwitch.js has mounted "/blob-avatar.html?embed=1"
// since v3555 and blob-avatar.html contained ZERO occurrences of the word "embed" for a hundred versions. The
// page rendered every local control on top of the avatar inside a 143x210 panel, and the only reason anybody
// found out is that Keith looked at it. ***
//
// THE RULE IS THE CLASS, NOT THE INCIDENT: every mode whose src carries a query flag must be a page that reads
// that flag. It is a two-sided check -- it fails if the caller stops sending OR the callee stops reading.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MODES } from "./avatarSwitch.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
// *** ONE FLAG IS UNREAD ON PURPOSE AND IS DECLARED RATHER THAN EXCUSED. avatarstage.html's own header says
// "?voice=M1   cosmetic label (PIP passes it)" -- the PIP sends it, the stage does not consult it, and that is
// the documented contract. A DECLARED EXCEPTION WITH A REASON IS NOT THE SAME AS A WEAKENED RULE: if a second
// flag ever needs to go on this list, that is a decision somebody has to write down here. ***
const UNREAD_BY_DESIGN = new Set(["voice"]);

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

say("1. EVERY FLAG A MODE SENDS MUST BE READ BY THE PAGE IT SENDS IT TO.");
const rows = [];
for (const m of MODES) {
    if (!m.src) continue;
    const [file, query] = m.src.split("?");
    const abs = path.join(root, file.replace(/^\//, ""));
    const flags = [...new URLSearchParams(query || "").keys()].filter((f) => !UNREAD_BY_DESIGN.has(f));
    // v3657 -- frameFromBox appends ?frame= AT MOUNT TIME from the measured box, so it never appears in the
    // static src. A flag that is only visible at runtime is exactly the kind this rule was written to catch,
    // so it is added to the list explicitly rather than being invisible to the check that exists for it.
    if (m.frameFromBox) flags.push("frame");
    const src = existsSync(abs) ? readFileSync(abs, "utf8") : null;
    for (const f of flags) {
        const read = src ? new RegExp("[\"\']" + f + "[\"\']").test(src) : false;
        rows.push({ mode: m.id, file, flag: f, exists: !!src, read });
    }
}
for (const r of rows) say("     " + r.mode.padEnd(8) + " " + r.file.padEnd(24) + " ?" + r.flag.padEnd(8) +
    (r.exists ? (r.read ? "  read" : "  *** NOT READ ***") : "  *** PAGE MISSING ***"));
ok("every mounted page exists", rows.every((r) => r.exists));
ok("!! and every flag it is sent is a string that page actually contains", rows.every((r) => r.read),
    "the check is deliberately a TEXT test rather than a behaviour test -- it cannot prove the page ACTS on the " +
    "flag, only that the two files know the same word. That is the whole defect it was written for: they did not");
ok("the rigged surface carries the two the panel needs", (() => {
    const rig = MODES.find((m) => m.id === "rigged");
    return /embed=1/.test(rig.src) && /pet=0/.test(rig.src);
})(), "embed=1 hides the stage chrome and tightens the framing; pet=0 removes the wandering pet, which was the " +
    "only thing small enough to land in a 143x210 box");
ok("svg is still first and rigged still second", MODES[0].id === "svg" && MODES[1].id === "rigged");

// ---- THE BOX WIDTH (v3770, REWRITTEN AT v4414) --------------------------------------------------------------
// *** THERE ARE TWO WIDTHS DECLARED FOR ONE BOX AND ONLY ONE OF THEM IS LIVE. mountAvatarSwitch declares
// `width = 143` as its default and THE ONLY CALLER IN THE TREE PASSES ITS OWN -- server.html asked for 163 at
// v3555, 193 at v3743 and 223 at v3770, and the default has never once been used. That is not a bug today; it
// is a SECOND DECLARATION nobody compares, and this tree's most repeated failure is exactly that shape. THIS
// CHECK DOES NOT FORCE THEM EQUAL -- the default is a sensible fallback for a caller that has no opinion --
// IT ASSERTS THAT THE LIVE ONE IS STATED EXPLICITLY, so widening the box can never be done by editing the
// default and wondering why nothing moved. ***
//
// *** v4414 -- THE CALLER STOPPED TYPING A WIDTH, AND THIS CHECK WENT RED AND SAID THE RIGHT THING. *** Its
// own failure line read "REWRITE THIS LINE TO NAME THE NEW CALLER, do not weaken it", and that is what this
// is. v4414 retired the SVG dials and gave the avatar the whole of #dialsRow, so a typed width became the
// defect it had been guarding against from the other side: A NUMBER TYPED BESIDE A BOX IS RIGHT AT EXACTLY
// ONE WINDOW WIDTH BY LUCK. server.html now passes sizeFromHost:true and the box is MEASURED from the host.
//
// SO THE PROPERTY IS UNCHANGED AND ITS SHAPE HAS TWO CASES: the one caller states its sizing either as a
// literal `width:` (a typed box) or as `sizeFromHost: true` WITH a `minSize:` (a measured box). What it may
// never do is state neither, because that is the silent fall into 143 this check has existed for since v3770.
//
// *** AND minSize IS REQUIRED RATHER THAN OPTIONAL, BECAUSE IT IS THE SAME DEFECT ONE LEVEL DOWN. *** A caller
// that says sizeFromHost:true and no minSize inherits `minSize = 96` -- a second declaration of a floor
// nobody compares, which is this check's own subject wearing a different name. A measured box still has one
// typed number in it and that number has to be stated where the measuring is asked for.
{
    const src = readFileSync(new URL("../server.html", import.meta.url), "utf8");
    // The call is matched to its closing brace before either shape is read, so "width:" belonging to some
    // other call on the page can never be counted as this one's.
    const mounts = [...src.matchAll(/mountAvatarSwitch\(\{([^}]*)\}/g)].map((m) => m[1]);
    const typed = mounts.filter((a) => /\bwidth:\s*(\d+)/.test(a)).map((a) => Number(/\bwidth:\s*(\d+)/.exec(a)[1]));
    const measured = mounts.filter((a) => /\bsizeFromHost:\s*true/.test(a));
    const measuredFloored = measured.filter((a) => /\bminSize:\s*(\d+)/.test(a));
    const stated = typed.length + measured.length;
    say("mountAvatarSwitch callers in server.html: " + mounts.length +
        "  -- typed width " + typed.length + " " + JSON.stringify(typed) +
        ", measured (sizeFromHost) " + measured.length);
    ok("!! *** server.html STATES how the avatar box is sized rather than inheriting the default ***",
        mounts.length === 1 && stated === 1,
        "the one caller must pass EITHER a literal width: OR sizeFromHost:true, and it passes " + stated +
        " of them; ui/avatarSwitch.js defaults to 143 AND THAT DEFAULT IS DEAD CODE. If this ever finds zero, " +
        "somebody deleted the sizing and the box silently fell back to 143 -- REWRITE THIS LINE TO NAME THE " +
        "NEW CALLER, do not weaken it");
    ok("!! and a MEASURED box states its own floor, because minSize is the same second declaration one level down",
        measured.length === measuredFloored.length,
        measured.length + " caller(s) ask to be measured and " + measuredFloored.length + " state a minSize; " +
        "the rest inherit minSize = 96 from ui/avatarSwitch.js, which is exactly the unread default this " +
        "whole section exists to keep out of the live path");
    ok("!! and the stage aspect is DERIVED from the box, never typed beside it",
        /width \/ height/.test(readFileSync(new URL("./avatarSwitch.js", import.meta.url), "utf8")),
        "frameFromBox computes width/height at mount time, so changing the box cannot leave a stale framing " +
        "constant behind -- which is why widening it is a one-number edit");
}

console.log("avatarSwitch-embed-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
