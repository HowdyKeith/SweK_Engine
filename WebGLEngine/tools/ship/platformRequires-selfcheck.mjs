// platformRequires-selfcheck.mjs -- v3334. THE CATALOG CAN NOW SAY "THIS MACHINE CANNOT RUN THIS", AND THIS
// GATE IS ABOUT THE FOUR WAYS THAT COULD BE WORTH LESS THAN IT LOOKS.
//
//   1. the field exists and nothing reads it        -> a schema that decorates instead of deciding
//   2. it refuses on the wrong axis                 -> an arch refusal reported as an OS-version one
//   3. a requirement it cannot evaluate passes      -> the check stops checking, silently
//   4. the checker throws and the install proceeds  -> the refusal engine becomes a way in
//
// Every verdict below is DRIVEN against an injected environment rather than read out of source, because the
// machines that matter -- an Intel Mac on macOS 12, an M-series on macOS 26 -- are not this one, and a refusal
// nobody has watched fire might not fire.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const require_ = createRequire(import.meta.url);

let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (label, cond, note) => { console.log("  " + (cond ? "PASS" : "FAIL") + "  " + label + (note ? "   " + note : "")); if (!cond) failed++; };

const PR = require_(path.join(ENG, "ai-bridge", "platformRequires.js"));
const cat = JSON.parse(fs.readFileSync(path.join(ENG, "ai-bridge", "install_catalog.json"), "utf8"));
const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");

const MACHINES = {
    stellarAtlas: { platform: "darwin", arch: "x64", macosVersion: "12.7" },   // the real Intel Mac
    mSeriesNew: { platform: "darwin", arch: "arm64", macosVersion: "26.1" },
    mSeriesOld: { platform: "darwin", arch: "arm64", macosVersion: "15.4" },
    mSeriesBlind: { platform: "darwin", arch: "arm64", macosVersion: null },
    galaxina: { platform: "win32", arch: "x64", macosVersion: null },          // the Windows hub
};

// The census is computed HERE rather than in section 5, because two checks above it now DERIVE their
// numbers from it instead of carrying typed ones.
const PLAT = /\b(arm64|x86_64|x64|Intel|Apple Silicon|macOS[- ]?only|Windows[- ]?only|Linux[- ]?only|Pascal|sm_61|CUDA|Metal)\b/i;
const ids = Object.keys(cat).filter((k) => !k.startsWith("_"));
const declared = ids.filter((k) => cat[k] && cat[k].requires);
const proseOnly = ids.filter((k) => cat[k] && !cat[k].requires && PLAT.test(String(cat[k].description || "")));

// ---- 1. SOMETHING ACTUALLY READS IT ---------------------------------------------------------------------------
ok("!! *** the install path READS `requires` -- a schema nothing consults is decoration ***",
    /platformRequires\.js/.test(noComments(srv)) && /checkRequires\(item\.requires/.test(noComments(srv)),
    "matched through noComments so a commented-out check cannot satisfy a claim about a live one");

ok("...and it refuses with 409, not 400",
    /requirements_not_met/.test(noComments(srv)) && /409/.test(noComments(srv)),
    "the request was well formed and the row is real -- THE MACHINE is the problem. A 400 would have somebody " +
    "hunting a typo in their own request");

// ---- 2. THE REFUSAL LANDS ON THE RIGHT AXIS, PER MACHINE -------------------------------------------------------
const tf = cat["turbo-fieldfare"] && cat["turbo-fieldfare"].requires;
ok("!! turbo-fieldfare declares its requirement in DATA", !!tf && Array.isArray(tf.arch) && tf.arch.includes("arm64"),
    "it was the instance that forced this field: pure arm64 + Metal against an Intel Mac");

const vIntel = PR.checkRequires(tf, MACHINES.stellarAtlas);
const vNew = PR.checkRequires(tf, MACHINES.mSeriesNew);
const vOld = PR.checkRequires(tf, MACHINES.mSeriesOld);
say("turbo-fieldfare verdicts -- Intel Mac: " + (vIntel.ok ? "ALLOW" : "REFUSE") +
    " | M-series macOS 26: " + (vNew.ok ? "ALLOW" : "REFUSE") +
    " | M-series macOS 15: " + (vOld.ok ? "ALLOW" : "REFUSE"));

ok("!! *** the Intel Mac is refused ON ARCHITECTURE, and the message says an upgrade will not help ***",
    !vIntel.ok && vIntel.unmet.some((u) => u.field === "arch") &&
    /architecture refusal is not fixed by an OS upgrade/i.test(PR.explain("turbo-fieldfare", vIntel, tf)),
    "the checklist used to frame the Mac risk as an OS-VERSION risk only, which is exactly how this one was " +
    "nearly missed. A refusal that reads as a version problem sends somebody to upgrade a machine that will " +
    "still not run it");

ok("!! ...and the SAME row ALLOWS a machine that qualifies", vNew.ok,
    "a checker that refused everything is indistinguishable from one that works, on a fleet where nothing " +
    "qualifies -- this is the half that proves it discriminates");

ok("...and an M-series that is merely too OLD is refused on the VERSION, not the architecture",
    !vOld.ok && vOld.unmet.some((u) => u.field === "macosMin") && !vOld.unmet.some((u) => u.field === "arch"),
    "two different fixes: buy nothing vs update the OS. Reporting one as the other wastes the afternoon");

// ---- 3. UNKNOWN IS NOT SATISFIED --------------------------------------------------------------------------------
const vBlind = PR.checkRequires(tf, MACHINES.mSeriesBlind);
ok("!! *** a version that could NOT BE READ is UNMET, never assumed adequate ***",
    !vBlind.ok && vBlind.unmet.some((u) => u.field === "macosMin" && u.unknown === true),
    "a version that could not be determined and a version that is high enough are different facts, and " +
    "treating the first as the second is how a check quietly stops checking");

ok("...and an unrecognised requirement field does not pass as satisfied",
    !PR.checkRequires({ osx: ["darwin"] }, MACHINES.galaxina).ok,
    "a future field name typo'd into a row would otherwise be silently ignored, which is the whole failure " +
    "class this file was built to end");

ok("...and the macOS version is READ from the machine, never derived from the Darwin kernel number",
    /sw_vers/.test(noComments(srv)) && !/os\.release\(\)[\s\S]{0,40}macos/i.test(noComments(srv)),
    "os.release() on darwin reports the DARWIN kernel version and the mapping to macOS shifts; a table of it " +
    "would be a second declaration nobody maintains");

// ---- 4. LEGACY ROWS ARE UNTOUCHED, AND THE CHECK FAILS CLOSED ----------------------------------------------------
ok("!! a row with NO `requires` behaves exactly as before",
    PR.checkRequires(undefined, MACHINES.galaxina).ok === true && PR.checkRequires(undefined, MACHINES.galaxina).declared === false,
    // v3335 -- DERIVED, not typed. This read "99 of 102" and was 85 of 102 one round later. A number that must
    // be edited every time a row is declared eventually will not be.
    (ids.length - declared.length) + " of " + ids.length + " rows declare nothing, and a field that broke them " +
    "on arrival would be reverted within a day. DECLARED and SATISFIED are reported as separate facts");

ok("!! *** the requirement check FAILS CLOSED ***",
    /requirement_check_failed/.test(noComments(srv)),
    "a refusal engine that throws must not become a way to install anything -- an unchecked requirement is " +
    "not a satisfied one");

// ---- 5. THE UNDECLARED ROWS: RATCHETED, NOT SWEPT ------------------------------------------------------------------
// A crude count near a hundred is an unasked question, so ask it -- but the answer here is a CANDIDATE LIST, not
// a defect list, and the difference is the point of this whole round.
say("catalog rows: " + ids.length + " -- declaring `requires`: " + declared.length + " (" + declared.join(", ") + ")");
say("rows whose DESCRIPTION mentions a platform word but declare nothing: " + proseOnly.length + " -- CANDIDATES TO READ, NOT DEFECTS");

// *** 14, AND MY EARLIER FIGURE OF 22 WAS NOT A REDUCTION -- IT WAS A DIFFERENT PATTERN. *** That scan also
// counted winget, WebView2, Gatekeeper, "universal" and "macOS 1x"; PLAT above does not. TWO MEASUREMENTS OF
// TWO DIFFERENT QUANTITIES, COMPARED AS IF THEY WERE ONE -- the second time in two rounds I have done that with
// my own counts, and the honesty check below is what said so rather than my remembering. With THIS pattern the
// figure was 17 before this round declared three rows. A DEBT, NOT A TARGET.
// *** v3335: ALL FOURTEEN WERE READ AND THE DEBT IS NOW ZERO, SO THE RATCHET BECOMES A WALL. *** A wall is
// only affordable at zero -- the sole way to break it is a NEW row arriving with a platform constraint stated
// in English, which is exactly the moment somebody should be made to read it. If this ever goes red, the fix is
// to READ the row and give it a `requires` block, NEVER to raise a baseline.
ok("!! *** no row states a platform constraint in prose alone ***", proseOnly.length === 0,
    proseOnly.length === 0
        ? "fourteen were read at v3335: SEVEN are genuinely win32 (PowerShell plus hardcoded C:\\VoxelBAK paths " +
          "into the Windows portable -- reading settles it) and SEVEN were read and DELIBERATELY LEFT " +
          "UNCONSTRAINED. Undeclared: " + (ids.length - declared.length) + " rows that mention no platform word at all"
        : "NEW prose-only row(s): " + proseOnly.join(", ") + " -- READ the row and declare `requires`, do not raise a baseline");

// *** A DECISION NOT TO CONSTRAIN LOOKS EXACTLY LIKE AN ABSENCE FROM OUTSIDE THE ROW THAT RECORDS IT. *** So a
// `requires` carrying only a `why` is a first-class outcome: the row WAS read, and found to need nothing. An
// EMPTY one would be indistinguishable from a typo, which is why the why is required rather than optional.
// v3336 -- THREE STATES, NOT TWO. The gate itself only knew CONSTRAINED and UNCONSTRAINED, and the first row
// added after it shipped was neither: ARDY's constraint is real and unmeasured. Counting it as unconstrained
// would have had this gate assert that it ALLOWS every machine -- which is the claim the row exists to avoid.
const unknownState = declared.filter((k) => cat[k].requires.unknown === true);
const unconstrained = declared.filter((k) => !unknownState.includes(k) && !["os", "arch", "macosMin"].some((f) => f in cat[k].requires));
say("declared: " + declared.length + " -- constrained: " + (declared.length - unconstrained.length - unknownState.length) +
    ", read-and-deliberately-unconstrained: " + unconstrained.length + ", real-but-unmeasured: " + unknownState.length);
ok("!! every read-but-unconstrained row carries its REASON",
    unconstrained.length > 0 && unconstrained.every((k) => typeof cat[k].requires.why === "string" && cat[k].requires.why.length > 30),
    "a bare {} would be indistinguishable from a typo, and 'nobody has looked at this yet' from 'somebody " +
    "looked and it needs nothing'");

ok("!! *** a row whose constraint is REAL BUT UNMEASURED refuses EVERY machine, and says so ***",
    unknownState.length > 0 && unknownState.every((k) =>
        Object.values(MACHINES).every((m) => PR.checkRequires(cat[k].requires, m).ok === false) &&
        typeof cat[k].requires.why === "string" && cat[k].requires.why.length > 30),
    "READ-AND-NEEDS-NOTHING and READ-BUT-NOT-YET-MEASURED are different facts, and collapsing them would let a " +
    "real constraint hide inside the word 'unconstrained'. Fail closed, the same direction as an unreadable " +
    "macOS version -- and it clears the moment somebody measures it. Rows: " + unknownState.join(", "));

ok("...and an unconstrained row really does ALLOW every machine",
    unconstrained.every((k) => Object.values(MACHINES).every((m) => PR.checkRequires(cat[k].requires, m).ok)),
    "driven across all five, because a `why`-only block that accidentally refused something would be the " +
    "worst outcome of this round: rows quietly switched off by a documentation field");

// THE TWO ROWS A KEYWORD SCAN GETS BACKWARDS, PINNED. patch-triton is the sharper of the two: 'Linux-only'
// describes TRITON, and the row exists to comment triton OUT precisely because it is Linux-only -- so the row
// is FOR the non-Linux case. A sweep driven by the scan would have constrained it to the one platform it is
// not for.
ok("!! *** patch-triton is NOT Linux-only -- the scan reads it backwards ***",
    !!cat["patch-triton"].requires && !cat["patch-triton"].requires.os &&
    PR.checkRequires(cat["patch-triton"].requires, MACHINES.galaxina).ok,
    "second row in two rounds where the keyword and the meaning point opposite ways, after raycast-llm. THIS " +
    "IS THE ARGUMENT AGAINST THE SWEEP, stated as a check rather than as a paragraph");

// ---- 6. THE CORRECTION, PINNED SO IT CANNOT DRIFT BACK ---------------------------------------------------------------
const rl = cat["raycast-llm"] && cat["raycast-llm"].requires;
ok("!! *** raycast-llm is macOS-only and NOT Apple-Silicon-only, and I reported the opposite ***",
    !!rl && Array.isArray(rl.os) && rl.os.includes("darwin") && !rl.arch &&
    PR.checkRequires(rl, MACHINES.stellarAtlas).ok === true,
    "its row pulls a SMALLER model on Intel because CPU-only inference is slow there, and a bigger one on " +
    "Apple Silicon -- it supports BOTH. My scan matched 'Apple Silicon' and 'Intel' in one description and " +
    "read the pair as an exclusion. IT MUST STILL ALLOW STELLAR ATLAS, and this check is what says so");

const ac = cat["app-apple-container"] && cat["app-apple-container"].requires;
ok("...and app-apple-container IS Apple-Silicon-only, so the two are told apart",
    !!ac && Array.isArray(ac.arch) && ac.arch.includes("arm64") &&
    PR.checkRequires(ac, MACHINES.stellarAtlas).ok === false,
    "its cmdsMac previously echoed install instructions with NO arch check, so on an Intel Mac it recommended " +
    "software that cannot run. Two Mac rows, two different constraints, and prose could not tell them apart");

// ---- 7. THE CHECKLIST LEARNED THE LESSON ------------------------------------------------------------------------
const chk = fs.readFileSync(path.resolve(ENG, "..", "docs", "VERIFY_EXTERNAL.md"), "utf8");
ok("!! VERIFY_EXTERNAL.md item 4 now asks about ARCHITECTURE on the Mac side",
    /ARCHITECTURE BEFORE VERSION/.test(chk) && /uname -m/.test(chk),
    "it framed the Mac risk as an OS-version risk and named architecture only for the Windows box. A checklist " +
    "that would not have caught the miss it exists to catch is worth amending the day the miss happens");

ok("...and it tells the next person to declare, and NOT to derive it from a scan",
    /requires/.test(chk) && /do not derive the block from a keyword scan/i.test(chk),
    "the instruction and the reason travel together, because the reason is the part that stops somebody " +
    "writing the sweep");

console.log(failed ? "platformRequires-selfcheck: " + failed + " FAILED" : "platformRequires-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
