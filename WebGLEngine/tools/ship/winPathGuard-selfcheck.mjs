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
// The slash-stripping helper form `new URL(rel, import.meta.url).pathname` (report.js, brain.js _localPath)
// is SAFE and is not flagged -- it has a rel argument and strips the leading slash itself. This gate greps the
// tree for the two unsafe forms so they cannot come back. The sabotage below reintroduces one and this fails.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BAD_PATHNAME = "new URL(import.meta.url).pathname";
const BAD_GUARD = "`file://${process.argv[1]}`";
// ASSEMBLED FROM PIECES so this file does not match its own scan -- the same care the header already takes
// with the two literals above, and the trap windowsImport-selfcheck names in its own sabotage block.
const RE_PATHNAME_ANY = new RegExp("new URL\\([^)]*import\\.meta\\.url\\s*\\)\\s*\\." + "pathname");
// the drive-letter strip in either of its shipped spellings: a slice(1) guarded on /^\/[A-Za-z]:/, or a
// replace of that same prefix. Percent-decoding is orthogonal and not required for safety.
const RE_DRIVE_STRIP = /\^\\\/\[A-Za-z\]:/;
const SKIP = new Set(["node_modules", ".git", "vendor", "rt", "__pycache__"]);
// THE DEFECT IS THE COMPARISON, not the template literal on its own. Assembled so this file stays out of its
// own scan, the same care the literals above already take.
const RE_MAIN_GUARD = new RegExp("import\\.meta\\.url\\s*===\\s*`file://\\$\\{" + "process\\.argv\\[1\\]\\}`");
/** Blank line comments, block comments and string/template bodies -- prose must not read as code. */
function codeOnly(t) {
    const out = [];
    let inBlock = false;
    for (const line of String(t).split("\n")) {
        const trimmed = line.trimStart();
        if (inBlock) { if (/\*\//.test(line)) inBlock = false; out.push(""); continue; }
        if (trimmed.startsWith("/*")) { if (!/\*\//.test(trimmed.slice(2))) inBlock = true; out.push(""); continue; }
        if (trimmed.startsWith("//")) { out.push(""); continue; }
        out.push(line);
    }
    // a mention inside a quoted string is prose too -- orphanTriage-selfcheck holds the idiom in a message
    return out.join("\n").replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

function walk(dir, hits) {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const p = path.join(dir, name), st = statSync(p);
        if (st.isDirectory()) walk(p, hits);
        else if (name === "winPathGuard-selfcheck.mjs") continue;   // this file holds the patterns as search literals
        else if (/\.(mjs|js)$/.test(name)) {
            const raw = readFileSync(p, "utf8"), rel = path.relative(ROOT, p);
            // *** v3901 -- THE SCAN READS CODE, NOT PROSE, AND UNTIL NOW IT READ BOTH. *** BAD_GUARD is a
            // FRAGMENT, so any file that DISCUSSES the idiom matched it: main.js, orphanTriage.mjs and
            // orphanTriage-selfcheck.mjs all explain the trap at length and were reported as committing it.
            // That is the same prose-as-code confusion boundaryLint solves with codeOnly() and that this tree
            // has now paid for more than a dozen times -- most recently at v3900, where the corpus builder's
            // <script> rule ate 95% of the changelog because the changelog TALKS ABOUT script tags.
            //
            // AND THE GUARD IS MATCHED ON THE COMPARISON, NOT THE FRAGMENT. `file://${...}` appearing anywhere
            // is not a defect; `import.meta.url === ` + that template IS. Narrowing the pattern and blanking
            // comments and strings are two different fixes and BOTH are needed: the first stops a URL built
            // for some other purpose being called a bug, the second stops a comment being called code.
            const s = codeOnly(raw);
            if (s.includes(BAD_PATHNAME)) hits.push(rel + "  [new URL(import.meta.url).pathname]");
            if (RE_MAIN_GUARD.test(s)) hits.push(rel + "  [file://${process.argv[1]} guard]");
            // *** v3901 -- THE REL-ARGUMENT FORM IS ONLY SAFE IF IT STRIPS, AND THIS GATE CHECKED ONLY THE
            // FIRST HALF OF ITS OWN RULE. *** The header above says the helper form is safe because "it has a
            // rel argument AND STRIPS THE LEADING SLASH ITSELF" -- but the literal test only looked for the
            // no-rel spelling, so `new URL("../..", import.meta.url).pathname` with no strip walked straight
            // through. SEVEN FILES WERE DOING IT. Keith's rig proved it the expensive way: detectionMap died
            // with ENOENT on 'C:\C:\Intel\SweK_Engine_v3849\...' -- the doubled drive letter this gate exists
            // to prevent, produced by a spelling it was not looking at.
            //
            // THE STRIP IS WHAT MAKES IT SAFE, so the strip is what is looked for: brain/report.js and
            // brain/brain.js both do `if (/^\/[A-Za-z]:/.test(s)) s = s.slice(1)` inside _localPath, and stay
            // correctly silent. A file that takes .pathname off import.meta.url and never drive-strips is
            // flagged whatever the first argument is.
            if (RE_PATHNAME_ANY.test(s) && !RE_DRIVE_STRIP.test(s)) {
                hits.push(rel + "  [new URL(rel, import.meta.url).pathname with no drive-letter strip]");
            }
        }
    }
}

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const hits = [];
walk(ROOT, hits);
ok("!! no source file uses the Windows-fragile path idioms", hits.length === 0,
   hits.length === 0
     ? "the tree is clean: no `new URL(import.meta.url).pathname` and no `file://${process.argv[1]}` guard -- fileURLToPath and pathToFileURL are used instead, so paths and main-module detection survive Windows."
     : hits.length + " offending occurrence(s): " + hits.slice(0, 6).join(" ; "));

console.log(fails ? "\nwinPathGuard-selfcheck: " + fails + " FAILED" : "\nwinPathGuard-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
