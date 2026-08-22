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
    const offenders = [], loaderOffenders = [];
    for (const f of files) {
        let src = ""; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
        // import( path.join(...) )  or  import( someAbsolutePathVariable )
        for (const m of code.matchAll(/import\(\s*(path\.(?:join|resolve)\([^)]*\)|[A-Za-z_$][\w$]*(?:Path|File|Dir|Full|Abs))\s*\)/g)) {
            offenders.push(path.relative(ENG, f).replace(/\\/g, "/") + " -> import(" + m[1].slice(0, 46) + ")");
        }
    }
    // *** v3900 -- THE SAME DEFECT WEARS A SECOND SHAPE AND THIS SCAN COULD NOT SEE IT. *** `--import` and
    // `--experimental-loader` hand their argument to THE SAME ESM RESOLVER as import(), so a raw path breaks
    // there identically -- but it is a spawn ARGUMENT, not call syntax, so the regex above walks straight past
    // it. collisionCensus.mjs did exactly this: `spawnSync(execPath, ["--import", HOOK, rel])` with HOOK a
    // path.join. On Keith's rig every one of its seven spawned gates died before running a line, and the census
    // reported FIVE failures from that ONE cause -- seven gates "failing", no stats dumped, both blind checks
    // starved of data and an empty positive control.
    //
    // A GUARD THAT KNOWS ONE SPELLING OF A DEFECT WILL WATCH THE OTHER SPELLING SHIP. Same lesson as v3126's
    // four faces of the self-reference trap, and as this morning's readsPlantedKnob grep counting one plant
    // shape under a name that said all of them.
    for (const f of files) {
        let src = ""; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
        // THE CALL FORM IS LISTED FIRST so `pathToFileURL(HOOK).href` matches as one expression rather than
        // as the bare identifier `pathToFileURL` -- which is exactly what the first version of this check did,
        // and it duly reported the line this round had just FIXED. A checker that cannot read the correct form
        // teaches you to ignore it.
        const ARG = /["'`]--(?:import|experimental-loader)["'`]\s*,\s*([A-Za-z_$][\w$.]*\s*\([^()]*\)(?:\.\w+)*|path\.(?:join|resolve)\([^)]*\)|[A-Za-z_$][\w$.]*)/g;
        for (const m of code.matchAll(ARG)) {
            const arg = m[1].trim();
            let safe;
            if (/^pathToFileURL\s*\(/.test(arg)) safe = true;                 // converted at the call site
            else if (/^path\.(?:join|resolve)/.test(arg)) safe = false;        // a raw path, inline
            else if (/\(/.test(arg)) safe = false;                            // some other call producing a path
            // a bare variable is safe only if this file assigns it through pathToFileURL
            else safe = new RegExp("(?:const|let|var)\\s+" + arg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
                                   "\\s*=\\s*[^;]*pathToFileURL").test(code);
            if (!safe) loaderOffenders.push(path.relative(ENG, f).replace(/\\/g, "/") + " -> --import " + arg);
        }
    }
    ok("!! NO dynamic import is given a raw filesystem path", offenders.length === 0,
       offenders.length ? "WOULD CRASH ON WINDOWS: " + offenders.slice(0, 4).join(" | ")
                        : files.length + " files scanned -- on Windows an absolute path starts with C:, and 'c:' parses as a URL SCHEME, so the loader throws ERR_UNSUPPORTED_ESM_URL_SCHEME");
    ok("!! ...and NO --import / --experimental-loader FLAG is given one either", loaderOffenders.length === 0,
       loaderOffenders.length ? "WOULD DIE ON WINDOWS BEFORE RUNNING A LINE: " + loaderOffenders.slice(0, 4).join(" | ")
                              : "the loader flags resolve through the same ESM machinery as import(), so a raw " +
                                "path fails there identically -- and it is a spawn ARGUMENT rather than call " +
                                "syntax, so the scan above cannot see it");
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
