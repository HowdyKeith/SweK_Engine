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
//
// ---- v4663 -- AND IT WATCHED A THIRD SPELLING SHIP, WHICH IS THE LESSON THIS FILE ALREADY WROTE DOWN -------
//
// Keith's rig at v4649: tools/ship/fsrPage-selfcheck.mjs died with ERR_UNSUPPORTED_ESM_URL_SCHEME. The scan
// below was green for it, twice over, because the detector was NAME-BASED:
//
//     import(tmp + "?" + Math.random())          `tmp` does not end in Path/File/Dir/Full/Abs, and the
//                                                 pattern demanded the whole argument be one expression
//     s.replace(/from "\.\//g, `from "${ENG}/`)   not import() syntax AT ALL -- a source rewrite that MAKES
//                                                 specifiers, which no regex over call sites can reach
//
// And it had missed a second file the same way: tools/terrain-parity.mjs calls `import(join(here, ...))` with
// `join` destructured from node:path, so `path\.(?:join|resolve)` never matched it.
//
// The v3900 note forty lines down says it outright -- A GUARD THAT KNOWS ONE SPELLING OF A DEFECT WILL WATCH
// THE OTHER SPELLING SHIP -- and the answer to that at v3900 was a second regex for a second spelling, which
// is the same shape of fix one round later. So the rule is INVERTED now: instead of listing the ways a
// specifier can be wrong, it asks what makes one RIGHT. A dynamic import is safe when its argument is a whole
// string literal, when it BEGINS with a literal carrying a scheme or a relative root, or when pathToFileURL
// appears in it. Everything else is an offender, and a new way of building a path is one by default rather
// than by being added to a list.
//
// *** THE ONE SHAPE IT STILL CANNOT DECIDE IS NAMED RATHER THAN EXEMPTED QUIETLY: *** a bare identifier or
// member expression -- `import(u)`, `import(p)`, `import(bare)`, `import(THREE_CDN)`. Whether that is a URL
// depends on a value this file does not have, and most of the eighteen live instances are FUNCTION PARAMETERS
// whose callers are elsewhere. They are counted and reported, not asserted on. The count going UP is the
// signal; a reader who wants one settled has to follow it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const SKIP = /node_modules|[\\/]\.git|[\\/]vendor|GPU_Assets|demos_code/;

// *** WHAT MAKES A SPECIFIER RIGHT, WHICH IS THE QUESTION WITH ONE ANSWER. *** The v4663 note in the header
// says why these replaced a list of ways to be wrong.
/** One whole string literal with no interpolation: "three", "node:fs", "./x.mjs" -- already a specifier. */
const WHOLE_LITERAL = /^(["'`])(?:(?!\1)[^\\]|\\.)*\1$/;
/** The expression STARTS with a literal carrying a scheme or a relative/absolute-URL root, so whatever is
 *  concatenated after it lands inside a URL: `"file://" + path.join(...)`, `"./" + name`. */
const URL_ROOTED = /^["'`](?:\.|\/|node:|file:|data:|https?:|blob:)/;
/** A bare identifier or member expression, possibly with literal `||` fallbacks. Whether it holds a URL is a
 *  fact about a VALUE, and this file only has text -- see the header. Counted, never asserted on. */
const BARE_NAME = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\s*\|\|\s*(["'`]).*?\1)*$/;

/**
 * The ARGUMENT of every real `import(` on one line, read by balancing parentheses rather than by a regex.
 *
 * *** BOTH SHORTCUTS WERE TRIED AND BOTH LIED, IN OPPOSITE DIRECTIONS. *** A non-greedy `[^;]*?\)` stops at
 * the FIRST close paren, so `import(require("url").pathToFileURL(p).href)` came back as `require("url"` --
 * with the pathToFileURL that makes it correct cut off, reporting a fixed line as broken. And `\bimport\(`
 * matches after a DOT, so `window.asset.import(vox.voxUrl, x, y, z)` -- an ordinary method that happens to be
 * called import -- was read as a dynamic import of three arguments.
 */
/** Does THIS file give `name` a value that is already a URL -- pathToFileURL, or a literal with a scheme? */
function assignedAsUrl(src, name) {
    if (!name) return false;
    const re = new RegExp("(?:const|let|var)\\s+" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=\\s*([^;\\n]*)");
    const m = re.exec(src);
    return !!m && (/pathToFileURL/.test(m[1]) || URL_ROOTED.test(m[1].trim()));
}

/**
 * *** THE WHOLE RULE, IN ONE PLACE, SO THE SABOTAGE DRIVES WHAT THE SCAN USES. *** Section 3 used to hold its
 * own copy of the detector regex, which means a sabotage could pass against a pattern the scan no longer ran.
 * @returns "safe" | "offender" | "undecidable"
 */
export function classifySpecifier(arg, src = "") {
    const a = String(arg || "").trim();
    if (!a) return "safe";
    if (WHOLE_LITERAL.test(a)) return "safe";
    if (URL_ROOTED.test(a)) return "safe";
    if (/pathToFileURL/i.test(a)) return "safe";
    if (/^import\.meta/.test(a)) return "safe";
    if (BARE_NAME.test(a)) return "undecidable";
    if (assignedAsUrl(src, (a.match(/^[A-Za-z_$][\w$]*/) || [""])[0])) return "safe";
    return "offender";
}

function importArgs(line) {
    const out = [];
    for (let i = 0; (i = line.indexOf("import(", i)) !== -1; i += 7) {
        const before = line[i - 1];
        if (before !== undefined && /[.\w$]/.test(before)) continue;   // .import( or someImport(
        let depth = 1, j = i + 7, q = null;
        for (; j < line.length && depth > 0; j++) {
            const c = line[j];
            if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
            if (c === '"' || c === "'" || c === "`") q = c;
            else if (c === "(") depth++;
            else if (c === ")") depth--;
        }
        if (depth === 0) out.push(line.slice(i + 7, j - 1).trim());
    }
    return out;
}
/**
 * *** v4676 -- THE THIRD SHAPE, AND THIS SCAN COULD NOT SEE IT EITHER. ***
 *
 * importArgs above reads dynamic `import(` CALLS. The --import scan below reads spawn ARGUMENTS. Neither
 * looks at a STATIC import statement that is WRITTEN INTO A FILE THIS GATE GENERATES -- and that is where
 * the defect landed next. thrownRow-selfcheck built its fixtures with
 *
 *     const NET = `import { reportThrows } from ${JSON.stringify(MOD)};\n`;   // MOD = path.join(...)
 *
 * which on POSIX resolves and on Windows becomes `from "C:\\SweK_src\\..."`, where node reads "C:" as a
 * PROTOCOL and answers ERR_UNSUPPORTED_ESM_URL_SCHEME. Every generated fixture then died at its first line,
 * so the gate returned exit 1 with ZERO FAIL rows and all four of its sections went red at once -- the
 * CONTROL among them, which is the tell, because a fixture that does not throw cannot fail for a reason
 * about throwing. wasmTeardown-selfcheck carried the identical line. BOTH WERE WRITTEN THE SAME WEEK v4646
 * FIXED TEN SPELLINGS OF THIS, by the same hand, in files sitting beside the fix.
 *
 * The classifier was never wrong; it was never ASKED. The surface is what was missing, so the surface is
 * added rather than the rule widened: a template literal whose text contains `from ${...}` is an import
 * statement under construction, and its interpolation is a specifier.
 */
export function generatedImportArgs(src) {
    const out = [];
    // `from ${EXPR}` and `from "${EXPR}"` / '...' / `...` -- the quote may be inside or outside the hole,
    // and both spellings appear in this tree (thrownRow used the first, fsrPage the second).
    // *** AND THE FIRST SPELLING OF THIS REGEX COUNTED PROSE, WHICH IS THE DEFECT THIS TREE HAS NOW FOUND
    // IN ITS OWN SCANNERS MORE TIMES THAN ANY OTHER. *** Matching `from ${...}` alone hit four sentences on
    // the first run -- brain.js's "the DUNGEON's trained head", KitScatter's "placed N from ${folder}",
    // ringFloorPhase's and slugNapalm's report lines -- because English puts "from" in front of an
    // interpolation constantly. An import statement is not the word `from`; it is `import` ... `from`, and
    // requiring both on one line is what separates the two. Backtick and newline are excluded so a match
    // cannot run out of one template literal and into the next.
    for (const m of String(src || "").matchAll(/\bimport\b[^;\n`]{0,160}?\bfrom\s+["'`]?\$\{([^{}]*)\}/g)) {
        let arg = m[1].trim();
        // *** JSON.stringify IS A QUOTE, NOT A SPECIFIER, and leaving it on made the rule reject the REPAIR.
        // *** The generated line is `from ${JSON.stringify(MOD)}`, so the encode supplies the quotation marks
        // that a literal would have written by hand. Classified as-is, the first identifier is `JSON` and the
        // file is asked whether it assigned a URL to something called JSON -- which it never does, so a
        // CORRECTLY repaired `const MOD = pathToFileURL(...).href` was still reported as an offender. The
        // wrapper is unwrapped here, in the surface, rather than in classifySpecifier: what the encode does
        // is specific to generating source, and the dynamic-import rule should not learn about it.
        const enc = /^JSON\.stringify\s*\(([\s\S]*)\)$/.exec(arg);
        if (enc) arg = enc[1].trim();
        // *** AND A BARE NAME IS RESOLVED HERE, BECAUSE ON THIS SURFACE IT IS DECIDABLE. ***
        // classifySpecifier answers "undecidable" to a lone identifier and that is right for a dynamic
        // import(), where the value can come from anywhere -- twenty of those are reported and not asserted
        // on. It is the wrong answer here: the module a generated fixture imports is assigned in the SAME
        // FILE, a few lines up, so the rule can simply read it. Left unresolved, `from ${JSON.stringify(MOD)}`
        // came back undecidable, undecidable is not an offender, and the defect that took four rows red on
        // the rig would have gone on passing its own detector.
        const bare = /^[A-Za-z_$][\w$]*$/.test(arg) &&
            new RegExp("(?:const|let|var)\\s+" + arg + "\\s*=\\s*([^;\\n]*)").exec(src);
        if (bare) arg = bare[1].trim();
        if (arg) out.push(arg);
    }
    return out;
}

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (l) => console.log("  ----  " + l);

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
    const offenders = [], loaderOffenders = [], undecidable = [];
    for (const f of files) {
        let src = ""; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        // *** PRE-FILTERED ON THE RAW TEXT BEFORE LEXING, AND THAT IS A BUDGET FACT, NOT A TIDY-UP. ***
        // codeOnly is a character-by-character lexer. Running it over all 4,117 files took this gate from
        // 639 ms to 3,390 -- past the 3,000 ms ceiling, which would have stopped it running at ship time at
        // all and made the repair strictly worse than the defect it fixed. "import(" is a NECESSARY condition
        // for every offender the regex below can find, and skipping the files without it costs one indexOf.
        // *** v4676 -- AND THE GENERATED SURFACE MUST BE ASKED BEFORE THIS PRE-FILTER, WHICH IS A THIRD
        // SIGHTING OF ONE MISTAKE IN ONE FILE. *** The line below is a budget pre-filter, and its comment is
        // right about why: "import(" IS a necessary condition for every offender the DYNAMIC scan can find.
        // It is not one for a generated STATIC import -- `import { x } from ${p}` contains no "import(" --
        // so the first draft of the new rule sat behind a filter written for the old question and never saw
        // a single file. Measured: with the rule below the pre-filter the whole-tree scan reported ZERO
        // offenders while thrownRow-selfcheck.mjs carried the defect verbatim. A necessary condition for one
        // question is not a necessary condition for the next one, and reusing it is how a scan goes quiet
        // without going wrong. Its own condition is `${` -- no interpolation, no generated specifier -- and
        // it reads RAW source, so it costs an indexOf and no lexing.
        if (src.includes("${")) {
            // @vite-ignore is read raw here rather than through codeOnly: the expensive lexer is the thing
            // the pre-filter below exists to avoid, and a browser marker is a file-wide flag either way.
            const browserGen = /@vite-ignore/.test(src);
            // *** v4676b -- AND THE FIFTH SIGHTING OF THE ONE MISTAKE, IN THE FILE WHOSE HEADER NAMES IT. ***
            // This scan reads RAW source on purpose, because what it is looking for IS string content. Raw
            // also means COMMENTS, and the round note describing this very defect is a comment -- so the
            // moment v4676's note landed on main.js's and brain/brain.js's ENGINE_VERSION line, quoting
            // `import { reportThrows } from ${JSON.stringify(MOD)}` verbatim, the whole-tree scan reported
            // both files as offenders. The gate's own header has been warning about this since v4622:
            // "spelling the crashing line out literally makes THIS FILE an offender in its own whole-tree
            // scan", four sightings listed, and the fifth arrived by a route none of them took -- the note
            // is not in this file at all, it is in the two files every round edits.
            //
            // noComments is the right instrument and not codeOnly: it drops comments and KEEPS strings,
            // which is precisely the half this rule needs. It is the expensive lexer, so it runs only on
            // files the cheap raw pass already matched -- a handful, not 4,241.
            const genSrc = generatedImportArgs(src).length ? noComments(src) : src;
            for (const arg of generatedImportArgs(genSrc)) {
                if (browserGen) continue;
                if (classifySpecifier(arg, src) !== "offender") continue;
                offenders.push(path.relative(ENG, f).replace(/\\/g, "/") +
                    " -> GENERATED import from " + arg.slice(0, 54));
            }
        }
        if (!src.includes("import(")) continue;
        // *** codeOnly AND NOT TWO REGEXES, AND THIS FILE'S OWN HEADER ALREADY KNEW WHY. *** Section 3 below
        // assembles its fixture from fragments rather than spelling it out, because "spelling the crashing
        // line out literally makes THIS FILE an offender in its own whole-tree scan", and it names that as
        // the third sighting of one mistake: prose read as code in a comment, then in a string, then in a
        // test fixture. The whole-tree scan here stripped COMMENTS and not STRINGS, so the fourth sighting
        // was this gate counting its own failure text. Of the four offenders it reported from v4622 to
        // v4641, exactly ONE was a dynamic import: trellisAutoRig-selfcheck.mjs, fixed in the same round as
        // this. The other three were the finding itself, quoted back -- redCensus.mjs's WHY_V4622 entry
        // explaining it, and the two copies register-audit.mjs keeps of the recorded FAIL line. THAT IS A
        // FEEDBACK LOOP AND NOT A MISCOUNT: recording the finding CREATED offenders, so the number could
        // only ever grow by being written down, and no amount of fixing real code could reach zero.
        // tools/ship/sourceScan.mjs's codeOnly is the tree's own lexer for exactly this -- it blanks string
        // CONTENT as well as comments, keeping the quotes and the escapes -- and it is what the rest of the
        // tree's censuses already use.
        // *** LINE-INDEXED, BECAUSE codeOnly BLANKS STRING CONTENT AND THE RULE BELOW NEEDS TO READ IT. ***
        // The question "does this specifier begin with file:// or with ./" cannot be asked of blanked text --
        // every literal there is `""`. codeOnly does preserve LINE structure (measured: 269 lines in, 269
        // out), so it is used to say WHICH LINES really hold a dynamic import, and the raw line is what the
        // rule is applied to. That keeps the v4622 lesson -- this gate counting its own prose four times --
        // without giving up the one thing the prose scan could see.
        const codeLines = codeOnly(src).split("\n");
        const rawLines = src.split("\n");
        // A browser's loader is not node's: see the v4620 note that used to sit here. Both markers are
        // file-wide rather than per-call, which is the only level a line scan can ask at.
        const browserFile = /@vite-ignore/.test(src) || /import\(\s*["'`]\//.test(codeOnly(src));
        for (let i = 0; i < rawLines.length; i++) {
            if (!/\bimport\(/.test(codeLines[i] || "")) continue;
            for (const arg of importArgs(rawLines[i])) {
                if (!arg) continue;
                // *** A CONCATENATION THAT STARTS AT A VARIABLE IS DECIDED BY WHAT THIS FILE ASSIGNS TO IT,
                // which is the same move the --import scan below already makes -- and it is the line that
                // separates the defect from its correct form. `tmp + "?" + Math.random()` where tmp came from
                // mkdtempSync is fsrPage's crash; `reportUrl + "?scenario=" + name` where reportUrl came from
                // pathToFileURL is smoke-report.mjs, and correct. Both are a bare name followed by a plus.
                const verdict = classifySpecifier(arg, src);
                if (verdict === "safe") continue;
                if (browserFile) continue;
                if (verdict === "undecidable") { undecidable.push(path.relative(ENG, f).replace(/\\/g, "/") +
                    ":" + (i + 1) + " -> import(" + arg + ")"); continue; }
                offenders.push(path.relative(ENG, f).replace(/\\/g, "/") + ":" + (i + 1) +
                    " -> import(" + arg.slice(0, 54) + ")");
            }
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
        // Same lexer as section 1 above, and the same budget reason -- see the note there. Pre-filtered on
        // THIS section's own necessary condition: the ARG regex below cannot match unless one of the two flag
        // spellings appears literally, so the lexer only runs on a file that could produce a finding.
        if (!src.includes("--import") && !src.includes("--experimental-loader")) continue;
        const code = codeOnly(src);
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
    // *** THE UNDECIDABLE SET, REPORTED WITH ITS NAMES RATHER THAN EXEMPTED QUIETLY. *** `import(u)` is a URL
    // or a path depending on a value this file does not have, and most of these are FUNCTION PARAMETERS whose
    // callers are in other files. Four were read by hand at v4663 and all four are correct -- server.js's `u`
    // is pathToFileURL(...).href, gunnerPolicy's `nodeOnly` is a relative literal split in two to dodge a
    // static-import guard, physicsAi's `bare` is a package name, recordDrift's `p` is always "./x.mjs" from
    // its own call sites. They are counted so that the count going UP is visible; a reader who wants one of
    // them settled has to follow it, and that is the honest cost of a static check.
    report(`UNDECIDABLE, not asserted on: ${undecidable.length} dynamic imports take a bare identifier`);
    if (undecidable.length) report("   " + undecidable.slice(0, 6).join(" | "));
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

// ---- 3. IT CAN FAIL, and the sabotages are the exact crashing forms -------------------------------------------
{
    // ASSEMBLED, NOT WRITTEN. Spelling the crashing line out literally makes THIS FILE an offender in its own
    // whole-tree scan -- which it duly reported. That is the third variant of one mistake in this project: prose
    // read as code in a COMMENT (the /codemap fix note), then in a STRING that describes a tool (nearShare's
    // Bluetooth note), and now in a TEST FIXTURE. An exemption for this file would have been the easy fix and
    // the wrong one: it would put the scanner's own blind spot exactly where a future offender could hide.
    //
    // *** AND SECTION 3 USED TO HOLD ITS OWN COPY OF THE DETECTOR. *** It tested a regex written out here
    // rather than the one section 1 ran, so a sabotage could pass against a pattern the scan had stopped
    // using -- a check grading its own copy. It drives classifySpecifier now, which is the rule itself.
    const J = "path." + "join(ENG, \"world\", \"treeSpawner.js\")";
    ok("!! SABOTAGE: the exact line that crashed IS an offender", classifySpecifier(J) === "offender",
       "biomeSpawnWiring line 40, verbatim -- it passed nine checks and then the process died");
    // v4663 -- the two shapes the NAME-BASED detector walked past, both real, both from Keith's rig.
    ok("!! SABOTAGE: fsrPage's form -- a temp path concatenated with a cache-buster -- IS an offender",
       classifySpecifier('tmp + "?" + Math.random()', 'const tmp = path.join(fs.mkdtempSync(os.tmpdir()), "page.mjs");') === "offender",
       "the old pattern needed the WHOLE argument to be one expression AND the variable to be named " +
       "something ending in Path/File/Dir/Full/Abs. This one is neither, and it died on the rig at v4649");
    ok("!! SABOTAGE: terrain-parity's form -- join() destructured from node:path -- IS an offender",
       classifySpecifier('join(here, "..", "world", "world.js")') === "offender",
       "the old pattern matched `path.join(` and `path.resolve(` by name, so a destructured import of the " +
       "same function was invisible to it");
    ok("...and the corrected form is NOT an offender",
       classifySpecifier('pathToFileURL(path.join(ENG, "x.js")).href') === "safe",
       "so the check tracks the defect rather than the word 'import'");

    // *** v4676 -- THE GENERATED-IMPORT SURFACE, DRIVEN ON THE TWO LINES THAT ACTUALLY SHIPPED. *** Both of
    // these were written the same week v4646 fixed ten spellings of this defect, by the same hand, in files
    // sitting next to the fix -- and both came back from the rig at v4667 as "exit 1, NO FAILING ROW".
    const SHIPPED_THROWNROW = 'const MOD = path.join(ENG, "tools", "ship", "thrownRow.mjs");\n' +
                              'const NET = `import { reportThrows } from ${JSON.stringify(MOD)};`;';
    const SHIPPED_WASM = 'const body = `import { initNode, mod } from ${JSON.stringify(path.join(ENG, "a/b.mjs"))};`;';
    const offends = (src) => generatedImportArgs(src).some((a) => classifySpecifier(a, src) === "offender");

    ok("!! *** SABOTAGE: thrownRow's shipped line -- a path.join'd module imported by a GENERATED fixture -- IS an offender ***",
       offends(SHIPPED_THROWNROW),
       "on POSIX it resolves; on Windows it reads from \"C:\\\\...\" and node answers " +
       "ERR_UNSUPPORTED_ESM_URL_SCHEME, so every fixture died at line one and the gate printed no row at all");
    ok("!! ...and wasmTeardown's identical line is too",
       offends(SHIPPED_WASM),
       "two files, one defect, one week -- which is the argument for a surface rather than a habit");
    ok("...and BOTH repairs are silent",
       !offends('const MOD = pathToFileURL(path.join(ENG, "a.mjs")).href;\n' +
                'const NET = `import { reportThrows } from ${JSON.stringify(MOD)};`;') &&
       !offends('const ENG_URL = pathToFileURL(ENG).href;\nconst b = `import x from "${ENG_URL}/ui/a.mjs";`;'),
       "the file:// form and fsrPage's named-URL-const form, which is the spelling v4646 already put in the tree");

    // *** AND THE CONTROL THAT COST THE FIRST DRAFT OF THIS RULE. *** Matching `from ${...}` alone flagged
    // FOUR SENTENCES on its first whole-tree run -- brain.js, KitScatter, ringFloorPhase, slugNapalm --
    // because English puts "from" in front of an interpolation constantly. This tree has now found itself
    // counting its own prose more times than any other single mistake.
    // *** v4676b -- THE FIFTH SIGHTING, AND IT CAME FROM THE ROUND NOTE. *** The header lists four times this
    // gate read its own subject as code. The fifth was not in this file: v4676's note quotes the defective
    // line verbatim, every round writes its note onto main.js's and brain/brain.js's version line, and both
    // went red in the whole-tree scan the moment it shipped. The scan reads raw source deliberately -- the
    // thing it hunts IS string content -- and raw includes comments. noComments drops comments and keeps
    // strings, which is exactly the half needed, so it is applied before the rule and behind a cheap match.
    ok("!! *** the round note that DESCRIBES this defect is not an instance of it ***",
       generatedImportArgs(noComments(
           'const ENGINE_VERSION = "v4676";   // the fixture did `import { x } from ${JSON.stringify(MOD)}` and died\n'
       )).length === 0,
       "main.js and brain/brain.js carry the note on their version line, so a comment-blind rule makes every " +
       "round that writes about this defect an instance of it -- a scanner counting its own prose, which " +
       "this file's header has now recorded five times");
    ok("...and the SAME line as real code still is one, so stripping comments did not blunt the rule",
       generatedImportArgs(noComments(
           'const MOD = path.join(ENG, "a.mjs");\nconst NET = `import { x } from ${JSON.stringify(MOD)}`;\n'
       )).some((a) => classifySpecifier(a, 'const MOD = path.join(ENG, "a.mjs");') === "offender"),
       "the comment strip removes prose, not code -- asserted in both directions because a strip that " +
       "removed the finding too would make every row above pass vacuously");

    ok("!! CONTROL: PROSE containing 'from ${...}' is NOT an import, even when it also says 'import'",
       !offends('console.log(`[kitScatter] placed ${n} from "${folder}" now`);') &&
       !offends('console.log(`could not import ${name} from ${where}`);') &&
       generatedImportArgs('console.log(`placed ${n} from "${folder}"`);').length === 0,
       "an import statement is not the word `from`; it is `import` ... `from` on one line, and requiring " +
       "both is the whole difference between a rule and a permanent red");
    // *** THE CONTROL THAT KEEPS THE RULE FROM BEING "EVERYTHING IS AN OFFENDER". *** A rule that said yes to
    // every argument would pass all four rows above and make the whole-tree scan a permanent red.
    ok("!! CONTROL: an ordinary bare specifier and a relative literal are SAFE, so the rule is not a blanket no",
       classifySpecifier('"three"') === "safe" && classifySpecifier('"./sourceScan.mjs"') === "safe" &&
       classifySpecifier('"file://" + path.join(ENG, "x.js")') === "safe" &&
       classifySpecifier('reportUrl + "?scenario=" + name', 'const reportUrl = pathToFileURL(join(here, "../brain/report.js")).href;') === "safe",
       "4,228 files scan clean today; a rule that rejected package names would report hundreds and be turned off");
}

// ---- 4. THE SHAPE NO CALL-SITE SCAN CAN REACH, HELD BY ITS ONE KNOWN INSTANCE ----------------------------------
{
    // fsrPage-selfcheck died TWICE on the rig for one reason in two places. The second is not an import(
    // call at all: it REWRITES the page's source so that `from "./x.mjs"` becomes `from "<engine root>/x.mjs"`,
    // and then imports the rewritten file. The specifier is manufactured by a string replace, which no scan
    // over call sites can see. There is no general detector here and this file does not pretend to have one --
    // a regex for `from "${...}` matches an ordinary console.log in simulation/KitScatter.js, and a guard
    // that cries wolf on a log line is a guard nobody reads. What there IS is the instance, held.
    const FSR = fs.readFileSync(path.join(ENG, "tools/ship/fsrPage-selfcheck.mjs"), "utf8");
    ok("*** fsrPage rewrites the page's imports through a file:// URL, not through a filesystem path ***",
       /const ENG_URL = pathToFileURL\(ENG\)\.href;/.test(FSR) && /from "\$\{ENG_URL\}/.test(FSR) &&
       !/from "\$\{ENG\}/.test(FSR),
       "on this box `${ENG}/render/jitter.mjs` is an absolute path and node's loader tolerates it; on the rig " +
       "it is C:\\... and the scheme is `c:`. The gate died before its first row, twice, and the scan above " +
       "could not have caught this half at all");
}

console.log(fails ? "\nwindowsImport-selfcheck: " + fails + " FAILED" : "\nwindowsImport-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
