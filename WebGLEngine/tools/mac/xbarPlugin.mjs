// FILE: tools/mac/xbarPlugin.mjs
// VERSION: v4163 -- put a SweK readout in the macOS menubar, without writing a line of Swift.
//
// Keith: "some of the github mac projects allow you to set your own panel."
//
// *** THEY MOSTLY SHARE ONE FORMAT, SO THIS TARGETS THE FORMAT AND NOT AN APP. *** xbar (MIT) and SwiftBar
// (MIT) both run BitBar-style plugins -- SwiftBar says so in as many words: "SwiftBar can run any existing
// BitBar\\xbar plugin." A plugin is just AN EXECUTABLE THAT PRINTS TEXT: the lines before `---` are the
// menubar, the lines after are the dropdown, and `| key=value` after a line sets colour, a link, an SF Symbol.
// The refresh interval is the FILENAME: `swek-cpu.3s.js` runs every three seconds. So there is no app to
// install from us, no Swift, and no lock-in to whichever menubar host is fashionable.
//
// *** IT REUSES ui/runnerGauge.mjs RATHER THAN RE-DECIDING ANYTHING. *** The domain, the stale/dead states and
// the null-is-not-zero rule are all gated there; a menubar plugin that made those calls again would be a
// second implementation of the only part worth arguing about. This file is a RENDERER: same numbers, different
// surface.
//
// *** AND THE ONE THING THAT MAKES xbar PLUGINS FAIL IN PRACTICE IS BAKED IN. *** A menubar app launched from
// Finder does NOT inherit a login shell's PATH, so `#!/usr/bin/env node` is the classic way these die -- the
// plugin works when you test it in a terminal and shows nothing at all in the menubar. The generator writes
// the ABSOLUTE interpreter path it was run with, so the plugin runs in the environment it will actually meet.
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";   // v4169 -- the CLI guard below

/**
 * *** THE RUNNER'S OWN GLYPHS CONTAINED THE SEPARATOR, AND THE GATE CAUGHT IT BY LOOKING AT THE OUTPUT. ***
 * ui/runnerGauge.mjs's ASCII_RUNNER is ["|>", "/>", "->", "\\>"] -- fine in a browser, and in a menubar the
 * leading "|" IS the parameter delimiter, so escaping mangled every frame into "\u00a6>". These are the same
 * four strides with the pipe replaced by a bar that is not grammar. The gauge keeps its frames; the RENDERER
 * brings its own, which is the correct place for a surface's constraint to live.
 */
export const MENUBAR_RUNNER = ["!>", "/>", "->", "\\>", "!>", "/>", "->", "\\>"];

/** xbar's line grammar is `text | key=value ...`, so a pipe inside the TEXT ends the text. A JSON value can
 *  certainly contain one. Newlines would start a whole new menu item, which is worse. */
export function xbarEscape(s) {
    return String(s == null ? "" : s).replace(/\|/g, "\u00a6").replace(/[\r\n]+/g, " ").trim();
}

/**
 * `{name}.{time}.{ext}` -- the interval lives in the FILENAME, which is the part everyone forgets.
 *
 * *** THE EXTENSION DEFAULTS TO .mjs AND THAT IS NOT COSMETIC -- MEASURED BY RUNNING IT. *** xbar's examples
 * are all `.sh`/`.js`, and the host does not care either way: the shebang decides the interpreter. NODE cares.
 * A `.js` file with no `package.json` beside it is parsed as CommonJS first, and this plugin uses `import`, so
 * node prints to stderr on EVERY REFRESH:
 *
 *     [MODULE_TYPELESS_PACKAGE_JSON] Warning: ... doesn't parse as CommonJS.
 *     Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
 *
 * It still works -- and that is the trap, because it looks fine. At a 3-second refresh that is a re-parse and
 * a stderr line twenty times a minute, in a host that may well surface stderr as a plugin error. `.mjs` costs
 * nothing and the warning goes away.
 */
export function pluginFilename(label, refresh = "3s", ext = "mjs") {
    const safe = String(label || "swek").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "swek";
    if (!/^\d+(ms|s|m|h|d)$/.test(String(refresh))) throw new Error("refresh must look like 10s, 1m, 500ms -- got " + refresh);
    return "swek-" + safe + "." + refresh + "." + ext;
}

/**
 * The plugin script.
 *
 * `engineRoot` is baked in absolutely, because a menubar host has no working directory worth relying on, and
 * `nodePath` likewise. Both are reported by the gate so a moved tree fails loudly rather than silently
 * printing nothing.
 */
export function buildPlugin({
    url = "http://127.0.0.1:8787/sync/load",
    jsonPath = "cpuPct",
    min = 0, max = 100, curve = "linear",
    label = "cpu", title = "SweK CPU",
    engineRoot, nodePath = process.execPath,
    open = "",
} = {}) {
    if (!engineRoot) throw new Error("engineRoot is required -- a menubar plugin has no working directory to fall back on");
    // *** v4482 -- THIS WAS `"file://" + gauge`, WHICH IS CORRECT ONLY BY LUCK AND ONLY ON POSIX. ***
    // Two ways it is wrong. A path containing a SPACE -- /Users/k/My SweK/WebGLEngine -- yields an import
    // specifier with a raw space in it, which is not a URL and which the plugin fails to parse at the only
    // moment nobody is watching: a menubar refresh. And on Windows path.join returns backslashes, so the
    // specifier becomes file://\Users\... with no drive letter and no third slash. THIS MODULE ALREADY
    // IMPORTS pathToFileURL, one screen up, for the CLI guard -- it percent-encodes and it emits the third
    // slash, and on an ordinary POSIX path it produces the identical string this was concatenating by hand.
    // Found because tools/ship/xbarPlugin-selfcheck went red nine ways on Keith's Windows rig and green here.
    const gauge = path.join(engineRoot, "ui", "runnerGauge.mjs");
    return `#!${nodePath}
// <xbar.title>${xbarEscape(title)}</xbar.title>
// <xbar.desc>A SweK Engine reading in the menubar. Generated by tools/mac/xbarPlugin.mjs -- edit the
//   generator, not this file.</xbar.desc>
// <xbar.dependencies>node</xbar.dependencies>
//
// The shebang above is an ABSOLUTE interpreter path on purpose: a menubar app launched from Finder does not
// inherit a login shell's PATH, and \`#!/usr/bin/env node\` is how these plugins silently show nothing.
import { pickPath, rateFor, feedState, frameAt } from ${JSON.stringify(pathToFileURL(gauge).href)};
const FRAMES = ${JSON.stringify(MENUBAR_RUNNER)};

const URL_ = ${JSON.stringify(url)};
const PATH_ = ${JSON.stringify(jsonPath)};
const DOMAIN = ${JSON.stringify({ min, max, curve })};

const esc = (s) => String(s == null ? "" : s).replace(/\\|/g, "\\u00a6").replace(/[\\r\\n]+/g, " ").trim();

(async () => {
  let json = null, err = null;
  try {
    const ac = new AbortController();
    // A menubar plugin that hangs freezes its slot until the host kills it, so the fetch is bounded well
    // inside the refresh interval.
    const t = setTimeout(() => ac.abort(), 2500);
    const r = await fetch(URL_, { signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error("http " + r.status);
    json = await r.json();
  } catch (e) { err = e && e.message ? e.message : String(e); }

  const value = json ? pickPath(json, PATH_) : undefined;
  // *** THE FEED IS "NOW OR NEVER" HERE, WHICH IS THE ONE REAL DIFFERENCE FROM THE BROWSER PANEL. *** The
  // panel keeps a lastOk across polls; a plugin is a fresh process every refresh and remembers nothing. So a
  // failed fetch is simply "no answer", and there is no way for it to look like an idle reading.
  const feed = feedState(err ? null : Date.now());
  const r = rateFor(value, DOMAIN);
  const moving = feed.moving && r.fps > 0;
  const frame = FRAMES[frameAt(Date.now(), moving ? r.fps : 0, FRAMES.length)];
  const shown = (value === null || value === undefined || value === "") ? "--" : value;

  console.log(esc(frame + " " + shown) + (moving ? "" : " | color=#8e9bb0"));
  console.log("---");
  console.log(esc(${JSON.stringify(title)}) + " | size=11 color=#8e9bb0");
  console.log(esc(URL_ + "  ->  " + PATH_) + " | size=11 color=#8e9bb0");
  console.log(esc("domain " + DOMAIN.min + ".." + DOMAIN.max + " (" + DOMAIN.curve + ")") + " | size=11 color=#8e9bb0");
  if (err) console.log(esc("no answer: " + err) + " | size=11 color=#ff9d9d");
  else if (r.why) console.log(esc(r.why) + " | size=11 color=#ffd479");
  else console.log(esc(r.fps.toFixed(1) + " fps") + " | size=11 color=#8fe0ae");
  ${open ? `console.log("Open SweK | href=" + ${JSON.stringify(open)});` : ""}
  console.log("Refresh | refresh=true");
})();
`;
}

/** What a host will actually read back, so a caller can show it before installing anything. */
export function describePlugin(o = {}) {
    const file = pluginFilename(o.label || "cpu", o.refresh || "3s");
    return {
        filename: file,
        refresh: o.refresh || "3s",
        whyMjs: "node parses a .js plugin as CommonJS first and warns on every refresh; the host does not care " +
                "about the extension because the shebang picks the interpreter",
        installTo: "~/Library/Application Support/xbar/plugins/  (or SwiftBar's plugin folder)",
        mustBeExecutable: "chmod +x -- a plugin without the bit set is skipped silently",
        note: "the interval is the FILENAME; changing it means renaming the file, not editing it",
    };
}

// ---------------------------------------------------------------------------------------------------------
// *** v4169 -- THE CLI, BECAUSE A GENERATOR NOBODY CAN RUN IS A FUNCTION NOBODY CALLS. ***
//
// This module builds an xbar/SwiftBar plugin and, until now, nothing invoked it but its own gate --
// referenceKind counted it among the orphans held out of the census by a sentence. A generator's natural
// caller is a person at a shell, so it gets the entry point it always needed.
//
// The main-module guard is the standard ESM one. It is deliberately NOT `process.argv[1].endsWith(...)`:
// that reads true for any path merely ending in the name, and on Windows the separators differ from the URL
// form -- the same class of path bug that ate every backslash in shadowedHelper's node -e string at v4166.
//
//   node tools/mac/xbarPlugin.mjs --out ~/Library/Application\ Support/xbar/plugins
//   node tools/mac/xbarPlugin.mjs --json cpuPct --label cpu --refresh 3s --print
//
// It writes NOTHING without --out, and prints the plugin to stdout instead: a tool whose default action
// installs a file into somebody's menubar directory is a tool that surprises its first user.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const argv = process.argv.slice(2);
    const flag = (name, dflt = null) => {
        const i = argv.indexOf("--" + name);
        return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : (argv.includes("--" + name) ? true : dflt);
    };
    const engineRoot = String(flag("engine-root", path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")));
    const label = String(flag("label", "cpu"));
    const refresh = String(flag("refresh", "3s"));
    const body = buildPlugin({
        engineRoot, label,
        url: String(flag("url", "http://127.0.0.1:8787/sync/load")),
        jsonPath: String(flag("json", "cpuPct")),
        min: Number(flag("min", 0)), max: Number(flag("max", 100)),
        curve: String(flag("curve", "linear")),
        title: String(flag("title", "SweK " + label)),
        open: String(flag("open", "")),
    });
    const outDir = flag("out", null);
    if (!outDir || outDir === true) {
        process.stdout.write(body);
        process.stderr.write("\n[xbarPlugin] printed to stdout. Pass --out <xbar plugins dir> to install as "
            + pluginFilename(label, refresh) + " (chmod 755).\n");
    } else {
        const file = path.join(String(outDir), pluginFilename(label, refresh));
        fs.mkdirSync(String(outDir), { recursive: true });
        fs.writeFileSync(file, body);
        // THE EXECUTABLE BIT IS THE WHOLE INSTALL: xbar skips a plugin without it, silently and with no error
        // anywhere, which is the single most common way one of these appears not to work.
        fs.chmodSync(file, 0o755);
        process.stderr.write("[xbarPlugin] wrote " + file + " (mode 755). xbar picks it up on its next scan.\n");
    }
}
