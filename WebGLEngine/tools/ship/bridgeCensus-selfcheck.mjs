// WebGLEngine/tools/ship/bridgeCensus-selfcheck.mjs -- v3009
//
// EVERY BRIDGE, ENUMERATED AND EXERCISED -- not trusted because it exists.
//
// The pattern is MCP Inspector's (modelcontextprotocol/inspector), whose CLI mode does exactly two things:
// `--method tools/list` to INVENTORY what a server offers, then `--method tools/call` to EXERCISE each one. The
// inventory alone proves nothing; a tool can be advertised and broken, and the point of the tool is that you
// find that out before a model does.
//
// SweK has THIRTY bridges, each owning a route prefix through an owns()/handle() pair, and NOTHING HAS EVER
// ENUMERATED THEM. Individual bridges have gates. The SET has never been checked. So a bridge could be written,
// tested, and never dispatched in server.js -- dead code carrying a route table, which is the "declared but
// unreachable" class this whole session has been finding in pages, modules, lints and gates.
//
// THREE THINGS ARE ASKED OF EVERY BRIDGE, and each is a different way to be broken:
//   IS IT REQUIRED?     a bridge server.js never imports cannot answer anything.
//   IS IT DISPATCHED?   requiring it is not routing to it -- that is one line apart and silently wrong.
//   DOES owns() WORK?   a prefix it does not claim is a route nobody reaches; a lookalike it DOES claim is a
//                       route it steals from another bridge.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");

// v3011 -- the UI-reachability ratchet. MAY SHRINK, MAY NEVER GROW.
// TWO remain, and the second was UNCOVERED by v3021's rename rather than created by it:
//   policyMassBridge   (/policymass)
//   benchCollectBridge (/fleetbench) -- it counted as VISIBLE while it was called /bench, because "/bench"
//                      appears on server.html FOR A DIFFERENT BRIDGE. The UI check matches a substring, so a
//                      bridge could inherit another bridge's visibility just by sharing a prefix. Renaming it
//                      to something unambiguous made the truth show up as a number going the wrong way.
//
// Named here rather than hidden behind a pattern: a wildcard excuse is how a class of unreachable things stops
// being visible, and this baseline has now caught the same class twice.
// v3030 -- ONE remains: benchCollectBridge (/fleetbench). policymass came off after being the last named entry
// since v3011 -- and it was built at v2856 SPECIFICALLY to give a CLI-only tool a front door, then never got one.
const UI_BASELINE = 1;

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- the inventory ---------------------------------------------------------------------------------------
const files = fs.readdirSync(path.join(ENG, "ai-bridge"))
    .filter((f) => /Bridge\.js$/.test(f))
    .sort();

const bridges = [];
for (const f of files) {
    let mod = null, err = null;
    try { mod = require(path.join(ENG, "ai-bridge", f)); } catch (e) { err = String((e && e.message) || e); }
    bridges.push({
        file: f,
        loaded: !!mod, err,
        owns: mod && typeof mod.owns === "function" ? mod.owns : null,
        prefix: mod && typeof mod.PREFIX === "string" ? mod.PREFIX : null,
        required: new RegExp('require\\("\\./' + f.replace(".", "\\.") + '"\\)').test(server),
    });
}

// ---- 1. THE INVENTORY IS REAL --------------------------------------------------------------------------------
{
    ok("the census found the bridges", bridges.length >= 15, bridges.length + " *Bridge.js files");
    const broken = bridges.filter((b) => !b.loaded);
    ok("!! every bridge LOADS", broken.length === 0,
       broken.length ? broken.map((b) => b.file + ": " + (b.err || "").slice(0, 50)).join(" | ") : "all require cleanly");
}

// ---- 2. REQUIRED IS NOT DISPATCHED, AND BOTH ARE CHECKED --------------------------------------------------------
{
    const notRequired = bridges.filter((b) => b.loaded && b.owns && !b.required);
    ok("!! every owns()-bearing bridge is REQUIRED by server.js", notRequired.length === 0,
       notRequired.length ? "NEVER IMPORTED: " + notRequired.map((b) => b.file).join(", ")
                          : bridges.filter((b) => b.owns).length + " route-owning bridges, all imported");

    // Dispatch is a SEPARATE fact from import -- one line apart, and silently wrong if missed.
    const undispatched = bridges.filter((b) => {
        if (!b.owns || !b.required) return false;
        const varName = b.file.replace(/\.js$/, "");
        return !new RegExp(varName + "\\.owns\\(").test(server);
    });
    ok("!! ...and DISPATCHED, which is a different fact", undispatched.length === 0,
       undispatched.length ? "IMPORTED BUT NEVER ROUTED: " + undispatched.map((b) => b.file).join(", ") +
                             " -- dead code carrying a route table"
                           : "every imported route-owner is also dispatched");
}

// ---- 3. owns() IS EXERCISED, not assumed ---------------------------------------------------------------------------
{
    const withPrefix = bridges.filter((b) => b.owns && b.prefix);
    ok("route-owning bridges declare a PREFIX", withPrefix.length >= 3, withPrefix.length + " declare one");

    const wrongSelf = withPrefix.filter((b) => !b.owns(b.prefix + "/status") && !b.owns(b.prefix));
    ok("!! every bridge CLAIMS its own prefix", wrongSelf.length === 0,
       wrongSelf.length ? "DOES NOT OWN ITSELF: " + wrongSelf.map((b) => b.file + " (" + b.prefix + ")").join(", ")
                        : "a prefix a bridge does not claim is a route nobody reaches");

    // A lookalike must NOT be claimed -- /nearsharefoo is not /nearshare, and stealing it breaks another bridge.
    const greedy = withPrefix.filter((b) => b.owns(b.prefix + "-lookalike/x") || b.owns(b.prefix + "x"));
    ok("!! ...and REJECTS a lookalike", greedy.length === 0,
       greedy.length ? "TOO GREEDY: " + greedy.map((b) => b.file).join(", ") + " -- it would steal another bridge's routes"
                     : "prefix matching is exact, so no bridge swallows a neighbour's namespace");

    // No two bridges may claim the same path.
    //
    // v3021 -- THIS PROBED THE WRONG PATH AND MISSED A REAL COLLISION FOR TWELVE ROUNDS. It synthesised
    // `prefix + "/status"` and asked whether two bridges both owned it. benchBridge (greedy: startsWith
    // PREFIX + "/") and benchCollectBridge (exact: /collect and /score) BOTH declared "/bench" -- and
    // "/bench/status" is claimed by only the greedy one, so the probe came back clean while
    // /bench/collect and /bench/score were being swallowed whole. benchCollectBridge was UNREACHABLE from
    // v2985 to v3020 and its own gate passed throughout, because the gate called handle() directly.
    //
    // A synthetic probe tests the probe. Ask about the routes each bridge ACTUALLY declares.
    const routesOf = (b) => {
        const src = fs.readFileSync(path.join(ENG, "ai-bridge", b.file), "utf8");
        const out = new Set([b.prefix]);
        for (const m of src.matchAll(/PREFIX \+ "(\/[a-z-]+)"/g)) out.add(b.prefix + m[1]);
        for (const m of src.matchAll(/"(\/[a-z]+\/[a-z-]+)"/g)) if (m[1].startsWith(b.prefix + "/")) out.add(m[1]);
        return [...out];
    };
    const clashes = [];
    for (const a of withPrefix) for (const b of withPrefix) {
        if (a.file >= b.file) continue;
        for (const probe of [...routesOf(a), ...routesOf(b)]) {
            if (a.owns(probe) && b.owns(probe)) { clashes.push(a.file + " and " + b.file + " both claim " + probe); break; }
        }
    }
    ok("!! no two bridges claim the same route", clashes.length === 0,
       clashes.length ? clashes.join(" | ") : "first match wins in server.js, so an overlap is a silent hijack");
}

// ---- 4. DISPATCHED IS NOT FINDABLE (v3011) ----------------------------------------------------------------------
//
// THE CENSUS I WROTE LAST ROUND ASKED TWO QUESTIONS AND THE ANSWER TO BOTH WAS ALREADY YES FOR THE BRIDGE THAT
// WAS BROKEN. nearShareBridge was required, dispatched, gated, and MENTIONED NOWHERE IN server.html -- so the
// only way to reach it was to know the URL. Third time this project has caught me shipping something nobody can
// find (ui/fitCanvas.js at v2880, ui/machine.mjs at v2988, this).
//
// A route prefix is read from the SOURCE rather than by requiring the module: several bridges start timers on
// import, and a census that hangs is a census nobody runs.
{
    const ui = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    const declared = [];
    for (const f of files) {
        const s = fs.readFileSync(path.join(ENG, "ai-bridge", f), "utf8");
        const m = s.match(/const PREFIX\s*=\s*["\']([^"\']+)["\']/);
        // ONLY a leading slash makes it a ROUTE prefix. winCredBridge declares PREFIX = "SweKEngine:", which is a
        // CREDENTIAL NAMESPACE, not a URL -- counting it as an unreachable route would be a false positive
        // dressed as a finding, and the fix would have been to link a page that should not exist.
        if (m && m[1].startsWith("/")) declared.push({ file: f, prefix: m[1] });
    }
    ok("bridges declaring a ROUTE prefix are found", declared.length >= 8, declared.length + " with a leading-slash PREFIX");

    // v3214 -- *** THIS CHECK ASSERTED THE ARRANGEMENT, NOT THE PROPERTY, AND moduleHistoryBridge WAS A FALSE
    // POSITIVE FOR IT. *** It required the ROUTE STRING to appear in server.html. But a bridge's front door is
    // normally a PAGE: server.html links module-history.html, and that page calls /modulehistory five times, so
    // the route is reachable by a person in two clicks -- and the census called it "findable only by knowing
    // the URL". The property is REACHABILITY FROM THE FRONT DOOR, and reachability is one hop.
    //
    // *** ONE HOP, NOT ARBITRARY DEPTH, AND THE LIMIT IS DELIBERATE. *** Following links transitively would let
    // any page reached from any page launder a route into "reachable", which is how this kind of check becomes
    // a wildcard that passes everything. A page linked from server.html is a front door; a page linked from
    // that page is a room.
    const hop = new Set();
    // THE LEADING SLASH IS NOT OPTIONAL DECORATION: server.html writes href="/module-history.html", and my first
    // version of this regex required the name to start with a letter -- so it matched nothing and the hop found
    // no pages at all, leaving the false positive exactly where it was. The scan looked like it worked.
    for (const m of ui.matchAll(/["']\/?([A-Za-z0-9._-]+\.html)["']/g)) hop.add(m[1]);
    // v3964 -- *** A PANEL MODULE IS A HOP TOO, AND MISSING IT MADE THIS LINE SAY SOMETHING FALSE. ***
    // server.html `import { mountGithubPanel } from "./ui/githubPanel.js"` -- the GitHub drawer's entire UI
    // lives in that module, and v3964 put the clone->verify chain's two buttons in it. The scan followed only
    // .html links, so the route read as "findable only by knowing the URL" while sitting behind a labelled
    // button on the front door. That is the same shape as the eleven pages v3959 accused of not existing: a
    // lookup narrower than the sentence describing it. A module server.html IMPORTS is reachable in one hop by
    // exactly the argument the .html hop already makes -- still one hop, still not transitive.
    for (const m of ui.matchAll(/from\s+["']\.?\/?((?:ui|engine|render)\/[A-Za-z0-9._\/-]+\.m?js)["']/g)) hop.add(m[1]);
    const linkedPages = [...hop].filter((f) => fs.existsSync(path.join(ENG, f)))
                                .map((f) => { try { return fs.readFileSync(path.join(ENG, f), "utf8"); } catch { return ""; } });
    const reachable = (prefix) => new RegExp(prefix.slice(1), "i").test(ui) ||
                                  linkedPages.some((src) => src.includes(prefix));
    const unmentioned = declared.filter((d) => !reachable(d.prefix));
    ok("!! every route-owning bridge is REACHABLE from the front door", unmentioned.length <= UI_BASELINE,
       unmentioned.length ? "NO UI: " + unmentioned.map((d) => d.file + " (" + d.prefix + ")").join(", ") +
                            " -- dispatched and gated and findable only by knowing the URL"
                          : "every declared route prefix appears in server.html");
    ok("...and the baseline is a number in the source", UI_BASELINE === 1,
       "only fleetbench remains: real debt, named rather than excused into a wildcard");
}

console.log(fails ? "\nbridgeCensus-selfcheck: " + fails + " FAILED" : "\nbridgeCensus-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
