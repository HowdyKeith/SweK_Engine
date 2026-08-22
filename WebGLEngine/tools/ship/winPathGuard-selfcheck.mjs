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
// ASSEMBLED so this file stays out of its own scan, the same care BAD_PATHNAME's spelling already takes.
const RE_PATHNAME_ANY = new RegExp("new URL\\([^)]*import\\.meta\\.url\\s*\\)\\s*\\." + "pathname");
// the drive-letter strip: a slice(1) or replace guarded on /^\/[A-Za-z]:/ -- percent-decoding is orthogonal.
const RE_DRIVE_STRIP = /\^\\\/\[A-Za-z\]:/;
// The OFFENCE is the comparison, not the fragment. Every sentence about this bug contains the fragment.
const BAD_GUARD_RE = /import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/;
// Line-wise, like v3126's stripper: a non-greedy /* */ span once ate 965,179 characters of server.js.
const stripComments = (src) => src.split("\n")
    .filter((L) => { const t = L.trim(); return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")); })
    .join("\n");
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
