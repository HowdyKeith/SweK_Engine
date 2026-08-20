// WebGLEngine/tools/ship/gateQuality-selfcheck.mjs -- v3071
//
// Run: node tools/ship/gateQuality-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// THE GATES ARE CODE TOO, AND THEY HAVE THEIR OWN CHARACTERISTIC BUGS.
//
// Twice in one session a check pinned to a MECHANISM went red when that mechanism was correctly replaced --
// `fillText` when the reason moved off the canvas, the literal `stream.attachTo(pass);` when a toggle changed
// its argument. Nine times a check hunted a PROSE phrase that had been WRAPPED across two comment lines and
// missed text that was present and correct. Every one of those cost a round, and every one ended with me editing
// the gate. That is the corrosive part: a check that goes red when good code is rearranged teaches people to
// edit gates instead of reading them, and a suite nobody trusts is worse than no suite.
//
// This walks every gate and looks for the two failure modes that are DETECTABLE LEXICALLY. It cannot judge
// whether an assertion is well chosen -- nothing can -- so it does not pretend to. It finds two specific,
// unambiguous shapes and reports a census of a third.
//
// WHY A CENSUS AND NOT A BAN for the third: 500+ gates predate this file. A meta-gate that failed on all of them
// would be switched off within a day, and a switched-off gate is worth nothing. The two hard assertions are the
// ones where a violation is always a defect; the census is where judgement is still required.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly, codeHas, argOf } from "./sourceScan.mjs";
import { growthRegisters } from "../roundhouse/coverage.mjs";
import { gateFiles } from "./staleness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHIP = path.join(ENG, "tools", "ship");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);

// IMPORTS gateFiles(), DOES NOT RE-DERIVE THE PATTERN. singleSource-selfcheck caught this file doing exactly
// what it forbids on its first run -- a meta-gate about gate quality writing a second definition of "a gate
// exists here" would have been the joke writing itself. staleness.mjs owns that walk; this filters it to the
// ship folder, which is a different question and safe to ask locally.
const gates = gateFiles()
    .map((p2) => path.relative(SHIP, p2))
    .filter((r) => r && !r.startsWith("..") && !r.includes(path.sep))
    .sort();

// A regex literal in gate source, with its content.
function regexLiterals(src) {
    const out = [];
    // deliberately crude: a slash-delimited literal on one line that is not a comment and not a division
    for (const line of src.split("\n")) {
        if (/^\s*\/\//.test(line)) continue;
        for (const m of line.matchAll(/\/((?:[^/\\\n]|\\.){6,})\/[gimsuy]*/g)) out.push({ line, body: m[1] });
    }
    return out;
}

// --- 1. LONG CONTIGUOUS PROSE, matched against source that WRAPS ----------------------------------------------
// The nine-times bug. A regex of many plain words run together will fail the moment the sentence it hunts is
// re-wrapped by an editor -- and comment text gets re-wrapped constantly. The fix is to collapse the comment
// markers first, which the offender never does.
{
    // The argument of a call whose OPEN PAREN has just been consumed: walk forward counting parens and stop at
    // the matching close. A fixed-width window cannot do this -- it either truncates a nested call or reaches
    // the next one, and both failures read as "unwrapped" or "wrapped" for the wrong reason.
    // v3726 -- argOf MOVED to sourceScan.mjs, the single home for this tree's source-text utilities, and
    // IMPORTED rather than copied. The reading below is unchanged; this file's own census is the assertion.
    // The idioms meaning "this text was unwrapped before matching". ONE DECLARATION, applied at each site.
    const UNWRAP_IDIOM = /replace\(\/\\n\\s\*\\\/\\\/|noComments\(|\\s\+|\bprose\(|codeOnly\(/;
    const offenders = [], notSource = [], unreadable = [];
    // *** v3677 -- THIS FILE EXCLUDES ITSELF BY IDENTITY, AND UNTIL NOW IT DID SO BY ACCIDENT. *** It carries a
    // PLANTED prose regex as the fixture for its own sabotage check, and the detector counted that plant as a
    // real offender the moment the file-level exemption came off -- it had only ever been exempt because its
    // own code calls noComments(. THE DEFECT LANDING ON THE FILE STUDYING IT, and the tree's standing antidote
    // applies: close it BY IDENTITY from import.meta.url, never by name, so renaming cannot re-admit it.
    const SELF_FILE = path.basename(fileURLToPath(import.meta.url));
    for (const g of gates) {
        if (g === SELF_FILE) continue;
        const src = fs.readFileSync(path.join(SHIP, g), "utf8");
        // does this gate unwrap prose before matching? then it is playing by the rules
        // *** v3676 -- THIS TEST READ RAW SOURCE, SO A COMMENT ABOUT THE FIX COUNTED AS THE FIX. *** Adding one
        // comment line saying noComments( to an offending gate dropped it out of the census -- MEASURED, 19 -> 18,
        // on actionCache-selfcheck.mjs. PROSE-AS-CODE, in the detector whose entire subject is prose-as-code:
        // the defect landing on the file studying it, sixth-plus instance, and this one had been letting real
        // debt out for as long as anybody had written the word in a comment. codeOnly() is the right stripper
        // because this hunts an IDIOM (a call), and it blanks comments AND strings so neither can satisfy it.
        //
        // KNOWN LIMIT, STATED RATHER THAN FIXED HERE: this is still FILE-scoped, so ONE genuine unwrap anywhere
        // in a gate exempts every prose regex in it -- a half-converted file reads as converted. Narrowing it to
        // the SITE is a different and larger change (it would re-admit every partly-converted file at once), and
        // it is named here so the next reader meets the limit instead of rediscovering it.
        // v3677 -- THE FILE-LEVEL SHORT-CIRCUIT IS REMOVED; the same idiom set is applied AT THE SITE below.
        // v3676 fixed this line to read codeOnly(src) so a COMMENT could not satisfy it, and NAMED THE LIMIT
        // IT LEFT: still FILE-scoped, so ONE genuine unwrap anywhere exempted EVERY prose regex in the gate
        // and a half-converted file read as converted. That is what this round closes.
        // v3090 -- WHICH VARIABLES HOLD FILE CONTENT. Traced from readFileSync so the split below is mechanical
        // rather than a guess about naming.
        const fromFile = new Set();
        for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*readFileSync/g)) fromFile.add(m[1]);
        for (const { body } of regexLiterals(src)) {
            // a "prose phrase": >=5 plain words separated by literal spaces, no regex metacharacters between them
            const words = body.match(/^[A-Za-z][A-Za-z'-]*(?: [A-Za-z][A-Za-z'-]*){4,}$/);
            if (!words) continue;
            // v3090 -- IS THIS REGEX EVEN POINTED AT SOURCE? Trying to pay the debt down mechanically found that
            // it is not always. Three shapes were counted as one:
            //   (a) hunting COMMENT text in shipping source -- genuinely fragile, an editor re-wraps it and the
            //       gate reports correct code as undocumented. THE REAL DEBT.
            //   (b) hunting a STRING LITERAL in shipping source -- a string is ONE token and does not get
            //       re-wrapped, so unwrapping would not help and prose() actively breaks it.
            //   (c) hunting a TOOL'S STDOUT -- staleness-selfcheck matches /derived fact:/ against the output of
            //       running verify. There is no source to unwrap and nothing to fix.
            // Only (a) is a debt. The ratchet counted all three, which is the two-things-one-label shape this
            // tree keeps meeting -- found here in the debt COUNTER itself.
            const esc = body.replace(/[-\/\\^$*+?.()|[\]{}]/g, (c) => "\\" + c);
            // *** v3677 -- THE UNWRAP TEST IS PER SITE, AND THE ARGUMENT IS BOUNDED BY ITS OWN CLOSING PAREN.
            // MY FIRST VERSION TOOK A FIXED 160-CHARACTER WINDOW and I wrote in the comment that it was "short
            // enough not to run into the next statement" -- WHICH IS FALSE THE MOMENT TWO CHECKS SHARE A LINE,
            // and this tree writes `/A/.test(x) && /B/.test(noComments(x))` all the time. The window reached
            // the SIBLING call, so a wrapped neighbour cleared a raw site: THE FILE-SCOPE BUG I WAS REMOVING,
            // shrunk to a line. CAUGHT BY THE PLANT, which half-converted a file and did not fire.
            // argOf() walks from `.test(` counting parens and stops at the matching close, so the text tested
            // is EXACTLY this call's argument and nothing beyond it.
            const site = new RegExp("/" + esc + "/[gimsuy]*\\.test\\(").exec(src);
            const siteUnwraps = site ? UNWRAP_IDIOM.test(argOf(src, site.index + site[0].length)) : false;
            const arg = new RegExp("/" + esc + "/[gimsuy]*\\.test\\(\\s*([A-Za-z_$][\\w$.]*)").exec(src);
            // *** v3683 -- AN ARGUMENT THIS PARSER CANNOT READ USED TO DEFAULT TO "SCANS SOURCE", AND THAT IS
            // UNKNOWN TREATED AS GUILTY. *** The old line was `!siteUnwraps && (!arg || fromFile.has(...))`, so
            // when the identifier pattern failed to match -- because the argument is a CALL, an await, or a
            // regex kept in a table and applied somewhere else -- the site was counted as scanning a file.
            // v3103's law: UNKNOWN IS NOT THE DEFAULT. The third state is NAMED AND PRINTED rather than folded
            // into either answer, so nobody has to guess which of the two an unreadable site was counted as.
            //
            // THIS IS NOT A LOOSENING. A site here is only excused from the DEBT LIST, and it lands in a bucket
            // that is reported by name and by count on every run -- where before it was silently indicted. The
            // list may still only shrink, and a site whose argument becomes readable rejoins whichever answer
            // it actually deserves.
            const argUnreadable = !arg;
            const scansSource = !siteUnwraps && !argUnreadable && fromFile.has((arg[1] || "").split(".")[0]);
            // TWO DIFFERENT UNKNOWNS, AND LUMPING THEM WOULD HAVE HIDDEN THE MORE INTERESTING ONE. If there is
            // no `.test(` after the literal at all, IT IS PROBABLY NOT A REGEX: the scan reads noComments, which
            // keeps STRINGS, so a check NAME containing two slashes is lexed as one. syncWalkProbe's entry is
            // exactly that -- "the cold/warm split and the readdir/stat split" yields a phantom
            // /warm split and the readdir/ that no code ever applies. A PHANTOM AND AN UNREADABLE ARGUMENT ARE
            // NOT THE SAME FINDING, and a single "unknown" bucket would have reported the rarer one as the
            // commoner one -- two things wearing one label, which is what this file exists to catch.
            // ONE UNKNOWN BUCKET, NOT TWO. I tried to split it into "argument unreadable" and "not a regex at
            // all", because syncWalkProbe's entry is the latter -- the two slashes inside the check NAME
            // "the cold/warm split and the readdir/stat split", lexed as a literal because this scan keeps
            // STRINGS. THE SPLIT WAS DROPPED BECAUSE THE DISCRIMINATOR I REACHED FOR MISFIRED: testing whether
            // the literal survives codeOnly called TWELVE sites phantoms, including claimsGate's, WHICH IS A
            // REAL REGEX kept in a table and applied later as pat.test(m). A classifier that is wrong about
            // eleven of twelve is not a finding, it is a guess with a count attached -- so it is not shipped.
            // The three sites are excused on the SAME true statement either way: THIS PARSER CANNOT READ WHAT
            // THEY APPLY THE PATTERN TO, so it must not assert that they scan a file.
            const bucket = !siteUnwraps && argUnreadable ? unreadable : (scansSource ? offenders : notSource);
            bucket.push(g + ": /" + body.slice(0, 52) + "/");
        }
    }
    // A RATCHET, NOT A WALL. The first run found 46 gates carrying this, written over hundreds of versions
    // before sourceScan existed. Failing all 46 would get this file switched off within a day, and a
    // switched-off gate is worth nothing -- so the assertion is that the number MUST NOT GROW.
    //
    // BASELINE IS A DEBT, NOT A TARGET. Every one of these is a check that will one day go red on correct code
    // because someone re-wrapped a comment. Lowering this number is the point; raising it is a regression. When
    // you fix some, lower BASELINE in the same commit, or the ratchet stops ratcheting.
    // v3090 -- LOWERED FROM 46. Eleven gates were converted to prose() and re-run green; the primitive that
    // makes the correct form a single call now exists in sourceScan. Each conversion was KEPT only if the gate
    // still passed afterwards, and thirty-two were REVERTED because they went red -- which is how shapes (b)
    // and (c) above were discovered rather than assumed.
    // v3106 -- LOWERED FROM 25, AND THE WAY IT WAS LOWERED IS THE FINDING. v3090 converted PER FILE: it
    // rewrote every prose regex in a file and reverted the WHOLE FILE if any one broke, which is why 32 went
    // back. Doing it PER REGEX instead -- try one, run the gate, revert only that one, carry on with the rest
    // of the same file -- got cast-selfcheck three of its four, where the file approach had returned all four.
    //
    // 38 REGEXES WERE ATTEMPTED. 10 ROUTE THROUGH prose() AND STAY GREEN. 28 BREAK. And that 28 is the real
    // result: a regex that breaks when comments are the only thing left WAS NEVER HUNTING A COMMENT. It was
    // matching a string literal, or generated text, or code -- none of which an editor re-wraps, and none of
    // which this debt was ever about.
    //
    // SO THE NUMBER BELOW IS A CEILING ON DEBT, NOT A MEASURE OF IT. v3090 split the counter by whether the
    // .test() ARGUMENT came from readFileSync; that separates "points at a file" from "points at stdout", and
    // it does NOT separate "hunts a comment" from "hunts a string inside that same file". Only trying the
    // conversion separates those, and trying it is what this round did.
    // v3139 -- THE BASELINE IS NOW A LIST, NOT A COUNT.
    //
    // It was `const BASELINE = 19` and the gate read 22, so it could say "three too many" AND NOT WHICH THREE.
    // Keith asked which three to look at and I could not answer from the gate's own output: it truncates its
    // offender list at five and compares only a total. A COUNT CANNOT NAME A NEWCOMER -- exactly the failure
    // v3138 had just fixed one file over, where a frozen 43 could not say which controls it meant.
    //
    // AND I DECLINED TO GUESS. Reimplementing the detector standalone gave 36 rather than 22, because the real
    // one carries filters that reproduction did not; naming three files out of a looser scan would have sent
    // somebody to the wrong gates with confidence. The fix is for the gate to name them, permanently.
    //
    // THE LIST IS FROZEN FROM WHAT IS ACTUALLY THERE, which means it records the three unnoticed arrivals as
    // part of the baseline rather than pretending they are absent. That is deliberate and it is NOT the same as
    // raising 19 to 22: a count of 22 would ratify the debt silently, while a NAMED list says exactly which
    // entries are owed and lets any future arrival be spotted the moment it appears.
    // *** v3677 -- THE LIST GOES 19 -> 43 AND THE NUMBER WENT UP BECAUSE THE DETECTOR GOT HONEST, NOT BECAUSE
    // DEBT ARRIVED. *** Removing the FILE-level exemption made 24 sites visible that had been exempt for as
    // long as their gate happened to call an unwrapper ANYWHERE in itself -- a half-converted file read as
    // converted, which is the limit v3676 named at this check and this round closes. Every one of the 24 is in
    // a file NOTHING TOUCHED THIS SESSION; they are debt MADE VISIBLE, not debt created.
    //
    // THEY ARE FROZEN RATHER THAN CONVERTED, AND THE PRECEDENT IS THIS FILE'S OWN: v3139 froze the list from
    // what was actually there for exactly this reason, because A NAMED LIST SAYS WHICH ENTRIES ARE OWED where a
    // raised count would ratify them silently. Converting 24 in one pass is v3090's per-file sweep, which is
    // how 32 conversions went back; and v3106 MEASURED that 28 of 38 attempted conversions BREAK, because a
    // regex that breaks when comments are the only thing left WAS NEVER HUNTING A COMMENT.
    //
    // THE LIST MAY ONLY SHRINK FROM HERE, and it is now a HARDER list to be on than it was yesterday: an entry
    // can no longer be cleared by a sibling site in the same file.
    if (process.env.SWEK_FREEZE_PROSE_DEBT) {
        fs.writeFileSync(path.join(SHIP, "prose-debt-baseline.json"), JSON.stringify(offenders.sort(), null, 1));
        console.log("  ----  froze " + offenders.length + " offenders to prose-debt-baseline.json");
    }
    const BASELINE_LIST = JSON.parse(fs.readFileSync(path.join(SHIP, "prose-debt-baseline.json"), "utf8"));
    const BASELINE = BASELINE_LIST.length;
    say("prose regexes pointed at SOURCE without unwrapping: " + offenders.length + " (baseline " + BASELINE + ")");
    // v3683 -- the third state, printed BY NAME AND BY COUNT so it can never be a quiet place to put things.
    say("argument NOT READABLE by this parser -- a call, an await, or a regex applied elsewhere. NOT counted as " +
        "scanning source, because UNKNOWN IS NOT THE DEFAULT: " + unreadable.length);
    for (const u of unreadable) say("    unreadable  " + u);
    // syncWalkProbe's entry is not a regex at all -- the two slashes in its check NAME -- and that is stated
    // here rather than auto-classified, because the classifier that would have said so got eleven others wrong.
    say("prose regexes NOT pointed at source (a string literal, or a tool's stdout): " + notSource.length +
        " -- counted as debt until v3090 and not fixable by unwrapping");
    say("of the " + offenders.length + " remaining, EVERY ONE was individually converted to prose() at v3106 and " +
        "reverted because its gate went red -- so none of them hunts a comment, and the count above is a ceiling " +
        "on debt rather than a measure of it");
    for (const o of offenders.slice(0, 5)) say("    " + o);
    if (offenders.length > 5) say("    ...and " + (offenders.length - 5) + " more");
    ok("!! the prose-matching debt does not GROW",
        // NAMED comparison, not a count: an arrival and a departure that cancel would leave the total alone.
        offenders.every((o) => BASELINE_LIST.includes(o)),
        // *** v3676 -- THE MESSAGE NOW NAMES THEM, WHICH IS THE ONE THING THIS CHECK EXISTS TO DO. *** Its own
        // header records why the check was rewritten from a count to a NAMED comparison: "It was
        // `const BASELINE = 19` and the gate read 22, so it could say THREE TOO MANY AND NOT WHICH THREE." The
        // comparison was fixed and THE MESSAGE WAS NOT -- it printed a suggestion about unwrapping comments and
        // never said which gate to unwrap them in, so the red was unactionable for exactly the reason the
        // rewrite was supposed to remove. A NAMED COMPARISON THAT REPORTS A NUMBER IS STILL A COUNT.
        // AND THE BRANCH WAS WRONG TOO: it selected on `offenders.length > BASELINE`, so an arrival and a
        // departure that CANCEL would leave the length equal, take the else branch, and print
        // "N <= BASELINE" -- a reassuring line on a genuine failure. The condition above is a set test; the
        // message is now derived from the SAME set difference rather than from a length.
        (() => {
            const news = offenders.filter((o) => !BASELINE_LIST.includes(o));
            const gone = BASELINE_LIST.filter((o) => !offenders.includes(o));
            return news.length
                ? "NEW offender(s), " + news.length + ": " + news.join(" | ") +
                  (gone.length ? "   (and " + gone.length + " baselined one(s) no longer present: " + gone.join(" | ") + ")" : "") +
                  "   -- unwrap the comment first (src.replace(/\\n\\s*\\/\\/\\s?/g, \" \")) or use noComments()"
                : offenders.length + " <= " + BASELINE + " -- a sentence re-wrapped across two comment lines defeats a contiguous regex on text that is present and correct; that cost nine rounds this session";
        })());
    ok("...and the baseline is honest: it matches what is actually there", offenders.length === BASELINE || offenders.length < BASELINE,
        // v3676 -- THE THIRD CASE WAS MISSING AND IT IS THE ONE THAT MATTERS: this ternary had only "below" and
        // "at", so ABOVE the baseline printed "at baseline" -- A FAILING LINE THAT READS LIKE A PASSING ONE, on
        // the check whose whole job is saying whether the baseline is honest.
        offenders.length < BASELINE ? "DOWN " + (BASELINE - offenders.length) + " from baseline -- lower BASELINE to lock the gain in"
            : offenders.length === BASELINE ? "at baseline"
            : "ABOVE baseline by " + (offenders.length - BASELINE) + " (" + offenders.length + " against " + BASELINE + ")");
}

// --- 2. A GATE THAT GREPS SHIPPING SOURCE MUST GO THROUGH sourceScan ------------------------------------------
// Census, with the reason. codeOnly() blanks comments AND strings (use it for an IDIOM); noComments() keeps
// strings (use it for TEXT the code contains). A gate that greps raw source will one day report the sentence
// explaining a rule as a violation of it -- which happened four times before sourceScan existed.
{
    const readsSource = [], usesScan = [];
    for (const g of gates) {
        const src = fs.readFileSync(path.join(SHIP, g), "utf8");
        const reads = /readFileSync\(\s*(new URL|path\.join)/.test(src);
        if (!reads) continue;
        readsSource.push(g);
        if (/from "\.\/sourceScan\.mjs"/.test(src)) usesScan.push(g);
    }
    const pct = readsSource.length ? Math.round(100 * usesScan.length / readsSource.length) : 0;
    say("gates that read shipping source: " + readsSource.length + "   of those, using sourceScan: " + usesScan.length + " (" + pct + "%)");
    const without = readsSource.filter((g) => !usesScan.includes(g));
    say("not yet through sourceScan: " + (without.length ? without.slice(0, 10).join(" ") + (without.length > 10 ? " (+" + (without.length - 10) + ")" : "") : "none"));
    ok("the census is real: some gates DO read shipping source", readsSource.length >= 10, readsSource.length + " of " + gates.length + " gates");
    ok("...and sourceScan is genuinely in use, not merely available", usesScan.length >= 5, usesScan.length + " gates");
}

// --- 3. A REGISTER THE TREE IS MEANT TO GROW, WITH ITS SIZE PINNED -------------------------------------------
// v3084 -- FIVE INSTANCES IN THREE ROUNDS, every one a check that went red BECAUSE THE WORK SUCCEEDED:
// REFINEMENT_KNOBS pinned at === 5, eligible.length === 4, a tally requiring two rejections, an eligibility
// window with a CEILING of 8, and the battery size pinned at === 4. A register exists to be filled in; asserting
// how full it is right now turns every contribution into a red gate, and that teaches people to edit gates
// instead of reading them -- the corrosive outcome section 1 was written to prevent.
//
// THIS ONE IS A WALL, NOT A RATCHET, because the scope is small and known: only assertions on the MEMBERSHIP of
// a named growth register. Object.keys(REGISTER).length compared with === or an upper bound is always wrong;
// >= a floor is the correct shape, and tools/roundhouse/coverage.mjs is the primitive to reach for.
//
// WHAT IT DELIBERATELY DOES NOT FLAG, because the distinction is real and not lexical:
//   REFINEMENT_KNOBS.chaos.values.length === 4   is CORRECT and must stay an equality. It is a claim about the
//   DEVICE -- chaosDefaults clamps count to [3, 6], so the sweep reaches the clamp and cannot say more. Raise
//   the clamp and that check SHOULD go red, because the sentence it guards becomes false. Pinned to a fact about
//   the apparatus is right; pinned to how much work has been done is the debt, and only MEMBERSHIP of the
//   register itself is reliably the second kind. A count of RESULTS (rs.length) is the same debt and is NOT
//   detectable here -- it looks identical to a fixture count. Named rather than silently missed.
{
    // v3086 -- THIS WAS A TYPED LIST OF FOUR NAMES, WHICH IS THE HOLE THE WALL WAS BUILT TO CLOSE. A fifth
    // register would not be covered until somebody remembered to add it: a manual step beside the ritual,
    // surviving exactly as long as a habit -- the same shape as the changelog that froze for forty versions.
    // A WALL WITH A TYPED LIST OF WHAT IT GUARDS IS A WALL WITH A DOOR IN IT. Now DERIVED from the convention
    // every register already keeps -- an exported UPPER_SNAKE object whose entries carry a why -- so a new
    // register is covered the moment it exists, with nobody remembering anything.
    const RDIR = path.resolve(SHIP, "..", "roundhouse");
    const discovered = growthRegisters(() => fs.readdirSync(RDIR), (f) => fs.readFileSync(path.join(RDIR, f), "utf8"));
    const REGISTERS = discovered.map((d) => d.name);
    say("growth registers DISCOVERED, not typed: " + discovered.map((d) => d.name + " <- " + d.file).join(", "));
    // TENTH PROSE-AS-CODE SLIP, AND THE DETECTOR CAUGHT ITSELF ON ITS FIRST RUN. My hand-rolled stripper only
    // removed comments, so the scan matched the SABOTAGE FIXTURES below -- string literals inside this very file
    // -- and reported two offenders that are tests of the detector. A gate that forbids an idiom must NAME that
    // idiom, so its own source always contains what it hunts, which is exactly why v3045 built sourceScan.
    // codeOnly() blanks comments AND string literals, so the fixtures vanish and real code survives: the
    // documented tool for "is this idiom in the code", used here instead of a tenth hand-rolled regex.
    const pinned = (src) => {
        const noC = codeOnly(src);
        const out = [];
        for (const R of REGISTERS) {
            const rx = new RegExp("Object\\.keys\\(\\s*" + R + "\\s*\\)\\.length\\s*(===|==|<=|<)\\s*(\\d+)", "g");
            for (const m of noC.matchAll(rx)) out.push(R + ".length " + m[1] + " " + m[2]);
        }
        return out;
    };
    const offenders = [], notSource = [];
    for (const g of gates) {
        for (const hit of pinned(fs.readFileSync(path.join(SHIP, g), "utf8"))) offenders.push(g + ": " + hit);
    }
    say("gates pinning a growth register\u0027s membership by equality or ceiling: " + offenders.length);
    for (const o of offenders) say("    " + o);
    ok("!! no gate pins the SIZE of a register the tree is meant to grow",
        offenders.length === 0,
        offenders.length
            ? "use >= a floor, or coverageClaim() from tools/roundhouse/coverage.mjs -- an equality or a ceiling " +
              "on a register turns the next contribution into a red gate"
            : "checked " + REGISTERS.length + " named registers across " + gates.length + " gates. Five instances " +
              "of this were fixed in v3081, v3083 and v3084; the wall is what stops a sixth");

    // POWER, both directions. Without these the check above passes trivially and a regex that quietly stopped
    // matching would look exactly like a clean tree.
    ok("SABOTAGE: the v3081 form IS detected",
        pinned("ok(\"five knobs is not a lab\", Object.keys(REFINEMENT_KNOBS).length === 5, \"...\");").length === 1,
        "the literal line this file failed to catch when it was written");
    ok("SABOTAGE: a CEILING is detected too, not only an equality",
        pinned("ok(\"x\", Object.keys(NUISANCE_KNOBS).length <= 8);").length === 1,
        "the v3084 instance was \u0027>= 4 && <= 8\u0027 -- the floor was right and the ceiling was the bug");
    ok("...and a FLOOR is correctly left alone",
        pinned("ok(\"x\", Object.keys(LIBM_CONTROLS).length >= 2);").length === 0,
        "a register may grow; >= is the only shape that survives it");
    ok("!! a NEW register is covered the moment it exists, with nobody adding its name",
        (() => {
            const synth = 'export const FRESH_REGISTER = {\n    thing: {\n        why: "a sentence long enough to be the ceremony every register in this tree keeps",\n    },\n};\n';
            const seen = growthRegisters(() => ["synthetic.mjs"], () => synth);
            return seen.length === 1 && seen[0].name === "FRESH_REGISTER";
        })(),
        "v3084 guarded four names somebody typed. This is the difference between a rule and a list");
    ok("...and something merely SHOUTY is not mistaken for a register",
        growthRegisters(() => ["x.mjs"], () => 'export const MAX_RETRIES = {\n    a: 1,\n};\n').length === 0,
        "an exported UPPER_SNAKE object whose entries carry no why is a constant, not a register -- walling it " +
        "off would put a rule around something nobody is meant to grow");
    ok("...and an entry\u0027s own values array is NOT flagged",
        pinned("ok(\"the clamp\", REFINEMENT_KNOBS.chaos.values.length === 4);").length === 0,
        "that is a claim about the DEVICE clamp and must stay an equality -- flagging it would train people to " +
        "loosen a correct check");
}

// --- 4. THE DETECTORS HAVE POWER ------------------------------------------------------------------------------
// Without this the two sections above pass trivially once the tree is clean, and a regex that quietly stopped
// matching would look exactly like a healthy codebase.
{
    const planted = 'ok("x", /the early Z cost is stated rather than discovered/.test(src));';
    const found = regexLiterals(planted).some(({ body }) => /^[A-Za-z][A-Za-z'-]*(?: [A-Za-z][A-Za-z'-]*){4,}$/.test(body));
    ok("SABOTAGE: a long contiguous prose regex IS detected", found);

    const safe = 'const prose = src.replace(/\\n\\s*\\/\\/\\s?/g, " "); ok("x", /the early Z cost is stated/.test(prose));';
    ok("...and a gate that unwraps first is not reported", /replace\(\/\\n\\s\*\\\/\\\/|\\s\+/.test(safe));

    ok("...a short or metacharacter-bearing regex is not mistaken for prose", (() => {
        const s2 = 'ok("x", /uniform1i\\(u:uBricks, 1\\)/.test(t));';
        return !regexLiterals(s2).some(({ body }) => /^[A-Za-z][A-Za-z'-]*(?: [A-Za-z][A-Za-z'-]*){4,}$/.test(body));
    })());
}

// --- 4. THE THIRD SHAPE, reported rather than assertable -------------------------------------------------------
// An assertion pinned to a long literal fragment of SHIPPING CODE is the mechanism trap -- it breaks when the
// code is correctly rearranged. But "long literal code fragment" and "precise assertion" look identical from
// here, and some of those pins are exactly right (FRAG_SRC must keep its unorm form). So: counted, listed, and
// left to judgement.
{
    const suspects = [];
    for (const g of gates) {
        const src = fs.readFileSync(path.join(SHIP, g), "utf8");
        for (const { body } of regexLiterals(src)) {
            // escaped punctuation typical of pinned code, and long
            const escapes = (body.match(/\\[().{}[\]|*+?$^]/g) || []).length;
            if (body.length > 60 && escapes >= 6) suspects.push(g + ": /" + body.slice(0, 44) + ".../");
        }
    }
    say("long pinned-code regexes (mechanism-trap candidates): " + suspects.length);
    for (const s of suspects.slice(0, 6)) say("    " + s);
    if (suspects.length > 6) say("    ...and " + (suspects.length - 6) + " more");
    ok("this shape is REPORTED, not failed -- some pins are exactly right", true,
        "FRAG_SRC keeping its unorm form is a pin worth having; a try/catch line's exact wording is not, and nothing here can tell them apart");
}

console.log("gateQuality-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
