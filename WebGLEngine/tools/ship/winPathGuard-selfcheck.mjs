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
import { noComments } from "./sourceScan.mjs";
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
const BAD_GUARD_RE = /import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/;
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
const stripComments = (src) => noComments(src);
const SKIP = new Set(["node_modules", ".git", "vendor", "rt", "__pycache__"]);

function walk(dir, hits) {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const p = path.join(dir, name), st = statSync(p);
        if (st.isDirectory()) walk(p, hits);
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
            const s = stripComments(raw);
            if (s.includes(BAD_PATHNAME)) hits.push(rel + "  [new URL(import.meta.url).pathname]");
            if (BAD_GUARD_RE.test(s)) hits.push(rel + "  [file://${process.argv[1]} guard]");
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
            if (RE_PATHNAME_ANY.test(s) && !RE_DRIVE_STRIP.test(s)) hits.push(rel + "  [rel .pathname, no drive-letter strip]");
            // *** v3941 -- THE THIRD IDIOM. *** See the header: twenty files ran their main block on Linux
            // and nowhere else, and eighteen of them had no gate looking.
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

const hits = [];
walk(ROOT, hits);
// Counted rather than asserted at a number: this set SHRINKS when a file stops being browser-imported and
// GROWS when a new page-side tool gains a CLI, and pinning it would make either one look like a regression.
let baseGuards = 0;
{
    const count = (dir) => { for (const n of readdirSync(dir)) {
        if (SKIP.has(n)) continue;
        const q = path.join(dir, n);
        if (statSync(q).isDirectory()) count(q);
        else if (/\.(mjs|js)$/.test(n) && n !== "winPathGuard-selfcheck.mjs" &&
                 RE_ANCHORED_BASE.test(stripComments(readFileSync(q, "utf8")))) baseGuards++;
    } };
    count(ROOT);
}
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
