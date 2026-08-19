// WebGLEngine/tools/ship/windowsImport-selfcheck.mjs -- v2997
//
// Run: node tools/ship/windowsImport-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// A BUG THIS SANDBOX CAN NEVER SEE, CAUGHT STATICALLY SO IT DOES NOT HAVE TO.
//
// Keith ran the suite on Windows with Node 24 and THREE gates died mid-run with the same crash:
//
//     Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node are supported
//     by the default ESM loader. On Windows, absolute paths must be valid file:// URLs. Received protocol 'c:'
//
// `await import(path.join(ENG, "world", "treeSpawner.js"))` works perfectly on Linux, where an absolute path
// begins with "/" and the loader tolerates it. On Windows it begins with "C:", and "c:" parses as a URL SCHEME.
// The gate does not fail -- IT DIES, taking every check after it, so a partial run reads as a shorter suite
// rather than a broken one. biomeSpawnWiring passed nine checks and then vanished.
//
// I COULD NOT HAVE FOUND THIS BY RUNNING ANYTHING. Every gate in this tree passes on Linux. It took a rig run on
// the machine that actually has C: drives -- which is the whole argument for the cross-arch and rig work, made
// concretely rather than in principle.
//
// SO THE CHECK IS STATIC. It reads the source and asks whether any dynamic import is handed a filesystem path
// rather than a file:// URL. That question has the same answer on every platform, which is exactly the property
// a cross-platform bug needs its guard to have.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const SKIP = /node_modules|[\\/]\.git|[\\/]vendor|GPU_Assets|demos_code/;
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

function walk(dir, out = []) {
    let es = []; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of es) {
        const f = path.join(dir, e.name);
        if (SKIP.test(f)) continue;
        if (e.isDirectory()) walk(f, out);
        else if (/\.(mjs|js)$/.test(e.name)) out.push(f);
    }
    return out;
}

// ---- 1. NO DYNAMIC IMPORT MAY BE HANDED A FILESYSTEM PATH -------------------------------------------------------
{
    const files = walk(ENG);
    const offenders = [];
    for (const f of files) {
        let src = ""; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
        // import( path.join(...) )  or  import( someAbsolutePathVariable )
        for (const m of code.matchAll(/import\(\s*(path\.(?:join|resolve)\([^)]*\)|[A-Za-z_$][\w$]*(?:Path|File|Dir|Full|Abs))\s*\)/g)) {
            offenders.push(path.relative(ENG, f).replace(/\\/g, "/") + " -> import(" + m[1].slice(0, 46) + ")");
        }
    }
    ok("!! NO dynamic import is given a raw filesystem path", offenders.length === 0,
       offenders.length ? "WOULD CRASH ON WINDOWS: " + offenders.slice(0, 4).join(" | ")
                        : files.length + " files scanned -- on Windows an absolute path starts with C:, and 'c:' parses as a URL SCHEME, so the loader throws ERR_UNSUPPORTED_ESM_URL_SCHEME");
    ok("...and the scan covered the whole tree", files.length > 500, files.length + " source files");
}

// ---- 2. THE FIXED CALLERS USE pathToFileURL ------------------------------------------------------------------------
{
    const fixed = ["render/holoPicture-selfcheck.mjs", "tools/ship/biomeSpawnWiring-selfcheck.mjs",
                   "tools/ship/roundhouseDevices-selfcheck.mjs", "tools/ship/deviceBridge-selfcheck.mjs"];
    for (const rel of fixed) {
        const src = fs.readFileSync(path.join(ENG, rel), "utf8");
        ok(path.basename(rel) + " converts the path to a file:// URL", /pathToFileURL\(/.test(src) && /import\(pathToFileURL/.test(src),
           "these are the three that died on Keith's machine, plus one that would have next");
    }
}

// ---- 3. IT CAN FAIL, and the sabotage is the exact crashing form --------------------------------------------------------
{
    // ASSEMBLED, NOT WRITTEN. Spelling the crashing line out literally makes THIS FILE an offender in its own
    // whole-tree scan -- which it duly reported. That is the third variant of one mistake in this project: prose
    // read as code in a COMMENT (the /codemap fix note), then in a STRING that describes a tool (nearShare's
    // Bluetooth note), and now in a TEST FIXTURE. An exemption for this file would have been the easy fix and
    // the wrong one: it would put the scanner's own blind spot exactly where a future offender could hide.
    const bad = "const m = await " + "import(" + "path.join(ENG, \"world\", \"treeSpawner.js\"));";
    const re = /import\(\s*(path\.(?:join|resolve)\([^)]*\)|[A-Za-z_$][\w$]*(?:Path|File|Dir|Full|Abs))\s*\)/;
    ok("!! SABOTAGE: the exact line that crashed IS matched", re.test(bad),
       "biomeSpawnWiring line 40, verbatim -- it passed nine checks and then the process died");
    ok("...and the corrected form is NOT matched", !re.test('await import(pathToFileURL(path.join(ENG, "x.js")).href)'),
       "so the check tracks the defect rather than the word 'import'");
}

console.log(fails ? "\nwindowsImport-selfcheck: " + fails + " FAILED" : "\nwindowsImport-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
