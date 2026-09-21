// tools/ship/winPathGuard-selfcheck.mjs
//
// Run: node tools/ship/winPathGuard-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Two idioms read fine on Linux and break silently on Windows, and both cost a rig-test round in v2758:
//   1. `new URL(import.meta.url).pathname` yields "/C:/dir/file" on Windows; path.join then prepends the
//      current drive and you get "C:\C:\dir" -- every file read against it fails ENOENT. Use fileURLToPath.
//   2. `import.meta.url === `file://${process.argv[1]}`` never matches on Windows (backslashes, and file://
//      vs file:///), so the CLI main-module block never runs -- `--save` and even the fingerprint MASTER
//      print silently do nothing. Use pathToFileURL(process.argv[1]).href.
//   3. `import.meta.url.endsWith(process.argv[1].split("/").pop())` -- THE SAME BUG WEARING A DIFFERENT
//      SPELLING, and this gate did not know about it for a thousand versions. On Windows argv[1] holds
//      backslashes, so split("/") returns a ONE-ELEMENT array and .pop() is THE WHOLE ABSOLUTE PATH; the
//      endsWith is false and the main block never runs. TWENTY FILES carried it, and the only two anybody
//      noticed were the two toolFrontDoor happens to run -- the other eighteen were silent on Keith's box
//      with nothing watching. Use pathToFileURL where the file may import node:url; where it may NOT (a
//      browser page imports it), split on BOTH separators and anchor the match with a leading "/".
// The slash-stripping helper form `new URL(rel, import.meta.url).pathname` (report.js, brain.js _localPath)
// is SAFE and is not flagged -- it has a rel argument and strips the leading slash itself. This gate greps the
// tree for the two unsafe forms so they cannot come back. The sabotage below reintroduces one and this fails.
import { noComments, codeOnly } from "./sourceScan.mjs";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BAD_PATHNAME = "new URL(import.meta.url).pathname";
// ASSEMBLED so this file stays out of its own scan, the same care BAD_PATHNAME's spelling already takes.
const RE_PATHNAME_ANY = new RegExp("new URL\\([^)]*import\\.meta\\.url\\s*\\)\\s*\\." + "pathname");
// the drive-letter strip: a slice(1) or replace guarded on /^\/[A-Za-z]:/ -- percent-decoding is orthogonal.
const RE_DRIVE_STRIP = /\^\\\/\[A-Za-z\]:/;
// The OFFENCE is the comparison, not the fragment. Every sentence about this bug contains the fragment.
//
// *** v4648 -- THIS MATCHED ONE SPELLING OF THREE, AND REPORTED "THE TREE IS CLEAN" WHILE EIGHT FILES
// CARRIED IT. *** The old pattern required the BACKTICK form verbatim. Two others do the identical damage:
//
//   "file://" + process.argv[1]                 string concatenation  -- refreshReleases, releaseLedger, krbnEmit
//   new URL(`file://${process.argv[1]}`).href   wrapped in a URL      -- treeRead, recordReach, detourScale, surfaceProbe
//
// The URL form is the nastier of the two, because it LOOKS careful. It is not: new URL() does not repair a
// backslash path or a missing third slash, it just parses the broken string into a broken URL.
//
// FOUND BY KEITH RUNNING THE SHIP ON THE RIG, not by this gate. `node tools/ship/refreshReleases.mjs`
// printed NOTHING -- no fetch, no write, no error, exit 0 -- because its whole CLI hangs off
// `const RUN = ... === "file://" + process.argv[1]`, and on Windows that is permanently false. The one box
// holding the token to refresh the release ledger is the one box where the tool silently does nothing.
//
// *** AND THIS FILE'S OWN HEADER ALREADY RECORDS THE LESSON IT THEN FAILED TO APPLY: *** item 3 says of the
// basename form, "THE SAME BUG WEARING A DIFFERENT SPELLING, and this gate did not know about it for a
// thousand versions." That was the second spelling. These are the third and fourth, and a zero from a
// detector that reads one spelling is the count-standing-in-for-a-property shape, not an all-clear.
// *** EVERY PATTERN CARRIES THE COMPARISON, AND THE FIRST DRAFT OF THIS WIDENING DID NOT. ***
// This gate matches against noComments(), which KEEPS string bodies, and its own note explains why that is
// still sound: "Prose quotes the fragment; only code writes `import.meta.url === ...`". My first two URL
// patterns matched the FRAGMENT alone, so they immediately reported krbnVendor-selfcheck.mjs and
// ddaPrecisionReport-selfcheck.mjs -- two gates whose evidence STRINGS quote this very bug. That is v3936's
// trap in its fourth spelling, re-entered by the round widening the detector that exists to hold it.
// `URLRHS` is therefore only ever used on the right-hand side of the comparison.
const ARGV_URL = "(?:`file:" + "//\\$\\{\\s*process\\.argv\\[1\\]\\s*\\}`"      // `file://${argv[1]}`
               + "|[\"']file:" + "//[\"']\\s*\\+\\s*process\\.argv\\[1\\])";       // "file://" + argv[1]
const URLRHS = "(?:new URL\\(\\s*)?" + ARGV_URL;
const BAD_GUARD_RES = Object.freeze([
    new RegExp("import\\.meta\\.url\\s*===\\s*" + URLRHS),
    new RegExp(URLRHS + "[^\\n]{0,24}===\\s*import\\.meta\\.url"),
]);
// *** AND THE COMPARISON ANCHOR IS NOT ENOUGH EITHER, WHICH THE RE-RUN MEASURED. ***
// This gate's note says prose is excluded because "only code writes `import.meta.url === ...`". That was
// true when it was written and is now false: krbnVendor-selfcheck.mjs and ddaPrecisionReport-selfcheck.mjs
// both quote THE WHOLE COMPARISON inside an evidence string, recording this very bug. So the rule gets the
// same two-stage treatment BAD_PATHNAME already has -- noComments as the cheap prefilter, codeOnly to
// CONFIRM -- rather than a third round of trying to out-word the prose.
//
// codeOnly blanks string and template BODIES, measured on both forms:
//   `import.meta.url === "file://" + process.argv[1]`        ->  import.meta.url === "" + process.argv[1]
//   `import.meta.url === new URL(`file://${argv[1]}`).href`  ->  import.meta.url === new URL(``).href
//   the prose above, in a string                             ->  ok("")
// The argv reference survives the concat form and is destroyed in the template form, so the confirmations
// are written to what is LEFT rather than to what was there. Comparing import.meta.url against a URL built
// from ANY literal is the defect whatever the literal said -- the only correct right-hand side is
// pathToFileURL(...).href -- so the second pattern loses nothing by not seeing the body.
// *** AND THE FIRST DRAFT OF THESE THREE BROKE THE RULE THIS GATE ALREADY HAD. ***
// Sabotage SC-3 reintroduced the ORIGINAL backtick spelling -- the one offence this file has always caught
// -- and went ZERO RED. Under codeOnly that form is `import.meta.url === ``', comparing against a bare empty
// literal, and all three confirmations demanded either a `+ process.argv[1]` or a `new URL(`. A widening
// that drops the case it was widening FROM is worse than no widening, because the old coverage looked intact.
// The shape to confirm is simply: import.meta.url compared against A LITERAL, wrapped in new URL() or not.
// Only pathToFileURL(...).href is a correct right-hand side, so nothing legitimate lives in that space.
const BAD_GUARD_CODE_RES = Object.freeze([
    /import\.meta\.url\s*===\s*(?:new URL\(\s*)?["'`]{2}/,
    /["'`]{2}\s*\+\s*process\.argv\[1\][^\n]{0,24}===\s*import\.meta\.url/,
]);
const BAD_GUARD_CODE = { test: (src) => BAD_GUARD_CODE_RES.some((re) => re.test(src)) };
const BAD_GUARD_RE = { test: (src) => BAD_GUARD_RES.some((re) => re.test(src)) };
// (3) THE BASENAME GUARD. Three patterns, because two different things can be wrong with it.
//   - split("/") on argv[1] is unconditionally wrong: it is a PATH, and half the world spells paths with
//     backslashes. There is no context in which this is the right split.
//   - an UNANCHORED endsWith is wrong even once the split is fixed: `.../loopScope.mjs`.endsWith("Scope.mjs")
//     is true, so `node tools/ship/someScope.mjs` could wake a loaded sibling's main block. The leading "/"
//     is what makes it a basename comparison rather than a suffix comparison.
//   - and the basename form is an EXEMPTION, not a style: it is weaker than pathToFileURL identity and is
//     only available because the file may carry no `node:` specifier. THE EXEMPTION IS RE-DERIVED FROM THE
//     FILE rather than trusted, the way toolFrontDoor re-derives its page-door reasons: a file that already
//     imports node: something COULD use the strong form, so a basename guard there is unfinished, not exempt.
const RE_ARGV_SPLIT_SLASH = /process\.argv\[1\]\.split\("\/"\)/;
const RE_ENDSWITH_ARGV    = /import\.meta\.url\.endsWith\([^;]*process\.argv\[1\]/;
const RE_ANCHORED_BASE    = /import\.meta\.url\.endsWith\(\s*"\/"\s*\+\s*process\.argv\[1\]\.split\(/;
const RE_NODE_SPECIFIER   = /from\s+"node:|require\("node:/;
// Line-wise, like v3126's stripper: a non-greedy /* */ span once ate 965,179 characters of server.js.
// v4423 -- *** A SECOND, WEAKER COPY OF A RULE THE TREE ALREADY HAS RIGHT. ***
// This was a line filter: it dropped lines that BEGIN with //, and a TRAILING comment on a code line survived
// it untouched. main.js's and brain/brain.js's version notes are exactly that shape --
// `const ENGINE_VERSION = "v4423";   // <the round note>` -- so the moment this round's note quoted the idiom
// in prose, the gate reported main.js and brain.js as offenders. THE HEADER OF THIS VERY FILE EXPLAINS THAT
// TRAP: "the sentence describing the bug is not the bug", written at v3936 after the same thing happened.
// tools/ship/sourceScan.mjs's codeOnly() has handled trailing comments, and string bodies, since it was
// written; measured on main.js, the fragment survives the local stripper and does not survive codeOnly. One
// owner, imported -- which is v4420's finding about isDocumentary, in a third place.
//
// *** AND codeOnly() IS THE WRONG ONE, WHICH COST A DETOUR WORTH RECORDING. *** It blanks STRING BODIES as
// well as comments, and this gate's guards live in strings and regex literals: RE_ANCHORED_BASE looks for the
// leading "/" that makes an endsWith a basename comparison, and RE_DRIVE_STRIP for the /^\/[A-Za-z]:/ test.
// Blank those and every correctly-guarded file reads as unguarded -- 22 hits became 14 NEW false ones. Two
// strippers, two questions: noComments() for "what does this file SAY", codeOnly() for "what does it DO".
//
// *** v4535 -- AND THE ANSWER IS NOT ONE STRIPPER FOR THE FILE, IT IS ONE PER QUESTION. *** The paragraph
// above is right that codeOnly() cannot be this gate's only stripper, and it drew the wrong conclusion from
// it: that noComments() therefore has to serve every rule. It does not. THE OFFENCE AND THE EXEMPTION ARE
// DIFFERENT QUESTIONS AND WANT DIFFERENT INSTRUMENTS -- "what does this file DO" for the thing being
// forbidden, "what does it SAY" for the evidence that earns a pass. v4451's round note in gateSweep.mjs
// QUOTES the pathname idiom, inside a STRING rather than a comment, to record that a new gate reintroduced
// it; noComments keeps string bodies, so this gate read the sentence about the bug as the bug -- v3936's
// trap in its third spelling, after raw source and after trailing comments.
//
// MEASURED over the whole tree, per rule, before changing anything (4 files differ at all):
//   gateSweep.mjs      literal 1 -> 0, rel-form 1 -> 0   the v4451 round note; prose, in a string
//   reportDoors.mjs    literal 1 -> 1, rel-form 1 -> 1   REAL code, and it stays caught
//   brain/brain.js     drive-strip exemption 1 -> 0      *** and report.js the same ***
// That last row is the whole reason the exemption keeps its old instrument: the strip is a REGEX LITERAL,
// `/^\/[A-Za-z]:/`, and codeOnly blanks regex bodies exactly as it blanks strings. Run the exemption through
// it and the two files that drive-strip CORRECTLY become two new false reds -- the same 22-became-14 shape
// the paragraph above paid for, just narrowed to one rule. So: offence in code, exemption in text.
const stripComments = (src) => noComments(src);
const stripToCode   = (src) => codeOnly(src);
const SKIP = new Set(["node_modules", ".git", "vendor", "rt", "__pycache__"]);

// *** v4535 -- ONE WALK, BECAUSE THE SECOND ONE ASKED A QUESTION THE FIRST ALREADY HAD THE ANSWER TO. ***
// This gate read, stripped and regex-tested every file in the tree TWICE: once here for the offences, and
// again below to count the basename guards that earned their exemption. 1,478 files, two full noComments
// passes, and the second walk's only output was ONE INTEGER. Measured serially, that put the gate at
// 3,122 / 3,055 / 3,204 / 3,285 ms -- OVER the 3,000 ms quick-sweep budget, which is why it ran at ship time
// in none of the 112 versions between its v4423 repair and the rotation that re-timed it. A gate nobody runs
// caught nothing: reportDoors reintroduced the pathname idiom in that window and stood.
// The count is now taken during the walk that was already happening. Same files, same stripper, same number.
function walk(dir, hits, tally) {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const p = path.join(dir, name), st = statSync(p);
        if (st.isDirectory()) walk(p, hits, tally);
        else if (name === "winPathGuard-selfcheck.mjs") continue;   // this file holds the patterns as search literals
        else if (/\.(mjs|js)$/.test(name)) {
            const raw = readFileSync(p, "utf8"), rel = path.relative(ROOT, p);
            // *** v3936 -- THE SENTENCE DESCRIBING THE BUG IS NOT THE BUG. *** This read raw source with
            // includes(), so every COMMENT teaching the rule and every STRING quoting it counted as an offence:
            // main.js's own note about main-module detection, and orphanTriage's two paragraphs about the
            // commonest spelling, were all reported as Windows-fragile code. That is the keyword-probe trap --
            // a regex over raw source cannot tell what a file DOES from what it SAYS -- and it makes the honest
            // response to a red gate "delete the explanation", which is exactly backwards.
            //
            // Comments are stripped, and the guard is matched as THE COMPARISON rather than as a fragment.
            // Prose quotes the fragment; only code writes `import.meta.url === ...`. Measured when this changed:
            // 40 real guards, 0 prose, and the four surviving prose hits went to zero without a word being
            // reworded. The pathname form is a complete expression already, so stripping comments is enough.
            const s = stripComments(raw);   // what the file SAYS: comments gone, strings and regexes kept
            // *** AND THE SECOND STRIPPER IS PAID FOR ONLY WHERE IT CAN CHANGE AN ANSWER. *** Running
            // codeOnly over all 1,478 files unconditionally cost this gate 3,259 -> 3,937/4,120/3,956 ms
            // serially, which is OVER THE 3,000 ms QUICK-SWEEP BUDGET -- and this gate came back into view
            // in the first place only because a rotation brought it under. A repair that re-hides the gate
            // it repairs is not a repair. noComments RETAINS EVERYTHING codeOnly RETAINS AND MORE (it keeps
            // string and regex bodies; nothing else differs), so a file whose TEXT lacks the idiom cannot
            // have it in its CODE, and the cheap read is a sound prefilter for the dear one. Measured over
            // the whole tree before relying on it: 4 files match either way, and NOT ONE matches under
            // codeOnly without matching under noComments. Cost after: back to ~2,800 ms.
            const said = RE_PATHNAME_ANY.test(s) || s.includes(BAD_PATHNAME);
            const c = said ? stripToCode(raw) : s;
            if (c.includes(BAD_PATHNAME)) hits.push(rel + "  [new URL(import.meta.url).pathname]");
            // Prefilter on the text, CONFIRM in code -- see BAD_GUARD_CODE_RES above. noComments retains
            // everything codeOnly retains, so a file whose text lacks the idiom cannot have it in its code,
            // and the dear stripper is paid for only where it can change the answer.
            if (BAD_GUARD_RE.test(s) && BAD_GUARD_CODE.test(said ? c : stripToCode(raw))) {
                hits.push(rel + "  [file://${process.argv[1]} guard]");
            }
            // *** v3937 -- AND THE REL-ARGUMENT FORM, WHICH THIS GATE'S OWN RULE COVERS AND ITS TEST DID NOT. ***
            // The header says the helper form is safe because "it has a rel argument AND STRIPS THE LEADING SLASH
            // ITSELF". Only the first half was ever checked: BAD_PATHNAME is the literal no-rel spelling, so
            // `new URL("../..", import.meta.url).pathname` with no strip sailed through, in FIVE FILES. Keith's
            // rig proved it the expensive way -- detectionMap died with ENOENT on 'C:\C:\Intel\SweK_Engine_v3849
            // \...\devices.mjs', the doubled drive letter this gate exists to prevent, produced by a spelling it
            // was not looking at.
            //
            // THE STRIP IS WHAT MAKES IT SAFE, SO THE STRIP IS WHAT IS LOOKED FOR. brain/report.js and
            // brain/brain.js both do `if (/^\/[A-Za-z]:/.test(s)) s = s.slice(1)` inside _localPath and stay
            // correctly silent; a file that takes .pathname off import.meta.url and never drive-strips is
            // flagged whatever its first argument is.
            // OFFENCE read from code, EXEMPTION read from text -- see the v4535 note by the strippers.
            if (RE_PATHNAME_ANY.test(c) && !RE_DRIVE_STRIP.test(s)) hits.push(rel + "  [rel .pathname, no drive-letter strip]");
            // *** v3941 -- THE THIRD IDIOM. *** See the header: twenty files ran their main block on Linux
            // and nowhere else, and eighteen of them had no gate looking.
            if (RE_ANCHORED_BASE.test(s)) tally.baseGuards++;   // the exemption census, in the walk that is already reading the file
            if (RE_ARGV_SPLIT_SLASH.test(s)) hits.push(rel + "  [argv[1].split(\"/\") -- a path is not slash-only]");
            else if (RE_ENDSWITH_ARGV.test(s)) {
                if (!RE_ANCHORED_BASE.test(s)) hits.push(rel + "  [unanchored endsWith guard -- a suffix is not a basename]");
                else if (RE_NODE_SPECIFIER.test(s)) hits.push(rel + "  [basename guard in a file that CAN import node:url -- use pathToFileURL]");
            }
        }
    }
}

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const hits = [], tally = { baseGuards: 0 };
walk(ROOT, hits, tally);
const baseGuards = tally.baseGuards;
// Counted rather than asserted at a number: this set SHRINKS when a file stops being browser-imported and
// GROWS when a new page-side tool gains a CLI, and pinning it would make either one look like a regression.
// v4423 -- *** THIS LINE SHOWED SIX OF TWENTY-TWO, AND THE OTHER SIXTEEN WERE REACHABLE ONLY BY EDITING THE
// GATE. *** It read hits.slice(0, 6), so 144 rounds of readers saw six filenames and no way to know what else
// was there. A list nobody can see is a list nobody acts on -- v4379's finding about RIG_ONLY -- and it is the
// best available explanation for why this red stood as long as it did. Every hit is printed now, one per line.
// The cost is a long failure message on a red run, which is the run where a long message is worth having.
ok("!! no source file uses the Windows-fragile path idioms", hits.length === 0,
   hits.length === 0
     ? "the tree is clean: no `new URL(import.meta.url).pathname`, no `file://${process.argv[1]}` guard, and " +
       "no slash-only or unanchored basename guard -- fileURLToPath and pathToFileURL are used instead, so " +
       "paths and main-module detection survive Windows. The " + baseGuards + " file(s) that DO compare " +
       "basenames each earned it: no `node:` specifier, because a browser page imports them."
     : hits.length + " offending occurrence(s), ALL of them:\n           " + hits.join("\n           "));

console.log(fails ? "\nwinPathGuard-selfcheck: " + fails + " FAILED" : "\nwinPathGuard-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
