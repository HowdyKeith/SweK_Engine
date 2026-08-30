// WebGLEngine/tools/ship/xbarPlugin-selfcheck.mjs -- v4163
//
// Run: node tools/ship/xbarPlugin-selfcheck.mjs   (fast -- generates a plugin and RUNS it against a stub)
//
// GATES tools/mac/xbarPlugin.mjs.
//
// Keith: "some of the github mac projects allow you to set your own panel." xbar (MIT) and SwiftBar (MIT) both
// run BitBar-format plugins -- SwiftBar: "SwiftBar can run any existing BitBar\xbar plugin" -- so this targets
// THE FORMAT and no app. A plugin is an executable that prints: lines before `---` are the menubar, lines
// after are the dropdown, `| key=value` styles a line, and the refresh interval is the FILENAME.
//
// *** THE CHECKS THAT MATTER ARE ABOUT THE ENVIRONMENT A MENUBAR HOST PROVIDES, WHICH IS ALMOST NONE. *** No
// PATH worth relying on, no working directory, and stderr that may be shown as an error. Every one of those
// has bitten a plugin in the wild and each is asserted below.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlugin, pluginFilename, xbarEscape, describePlugin, MENUBAR_RUNNER } from "../mac/xbarPlugin.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("xbarPlugin-selfcheck -- a SweK readout in a menubar that provides nothing\n");

// ---- 1. the filename IS the configuration -------------------------------------------------------------------
console.log("1. the filename carries the refresh interval");
{
    ok("!! {name}.{time}.{ext}", pluginFilename("cpu", "3s") === "swek-cpu.3s.mjs" && pluginFilename("VBA parts", "1m") === "swek-vba-parts.1m.mjs",
        "the interval is not a setting inside the file -- changing it means renaming");
    let threw = false; try { pluginFilename("x", "3 seconds"); } catch { threw = true; }
    ok("!! a refresh the host cannot parse is refused at generation, not discovered in the menubar", threw,
        "a malformed interval makes a host treat the whole name as the plugin name and never refresh it");
    // *** .mjs, AND THE REASON WAS MEASURED BY RUNNING IT. ***
    ok("!! *** the extension defaults to .mjs, because node parses a .js plugin as CommonJS first ***",
        pluginFilename("cpu").endsWith(".mjs"),
        "a .js plugin using import still WORKS -- and warns to stderr on EVERY refresh, twenty times a minute " +
        "at 3s, in a host that may surface stderr as a plugin error. The host does not care about the " +
        "extension; the shebang picks the interpreter");
    ok("...and describePlugin names the two things that silently break an install",
        /chmod/.test(describePlugin().mustBeExecutable) && /FILENAME/.test(describePlugin().note));
}

// ---- 2. the line grammar -------------------------------------------------------------------------------------
console.log("\n2. `text | key=value` -- and text containing a pipe");
{
    ok("!! a pipe in the TEXT is escaped, or it ends the text and the rest becomes parameters",
        xbarEscape("a|b") === "a¦b", JSON.stringify(xbarEscape("a|b")) + " -- a JSON value can certainly contain one");
    ok("!! newlines are flattened, or one item becomes several",
        xbarEscape("a\nb") === "a b" && xbarEscape("a\r\nb") === "a b");
    ok("...null and undefined render as empty rather than the words", xbarEscape(null) === "" && xbarEscape(undefined) === "");
}

// ---- 3. THE ENVIRONMENT A MENUBAR HOST GIVES YOU -------------------------------------------------------------
console.log("\n3. no PATH, no working directory");
{
    let threw = false; try { buildPlugin({}); } catch { threw = true; }
    ok("!! generating without an engineRoot is refused", threw,
        "a menubar host has no working directory worth relying on, so a relative import cannot resolve");
    const src = buildPlugin({ engineRoot: "/Users/k/SweK_Engine/WebGLEngine" });
    // *** CHECK LINE ONE, NOT THE FILE. *** The first draft searched the whole source for "/usr/bin/env" and
    // found it in the COMMENT that explains why /usr/bin/env is wrong -- v3449's founding defect for the third
    // time in this session. A shebang is line one by definition, so that is the only line worth reading.
    const shebang = src.split("\n")[0];
    ok("!! *** the shebang is an ABSOLUTE interpreter path, not /usr/bin/env node ***",
        /^#!\//.test(shebang) && !/\/usr\/bin\/env/.test(shebang),
        "a menubar app launched from Finder does not inherit a login shell's PATH -- the classic way these " +
        "plugins work in a terminal and show NOTHING in the menubar");
    ok("!! no runner frame contains the parameter separator",
        MENUBAR_RUNNER.every((f) => !f.includes("|")),
        "the gauge's own frames start with '|', which IS the grammar -- the renderer brings menubar-safe ones");
    ok("!! the gauge is imported by absolute file:// URL", /import \{[^}]*\} from "file:\/\/\/Users\/k\/SweK_Engine/.test(src));
    ok("!! the fetch is bounded, so a hung endpoint cannot freeze the slot",
        /AbortController/.test(src) && /setTimeout\(\(\) => ac\.abort\(\), \d+\)/.test(src),
        "a plugin that hangs holds its menubar slot until the host kills it");
}

// ---- 4. IT ACTUALLY RUNS, AND PRINTS SOMETHING A HOST CAN READ -----------------------------------------------
console.log("\n4. generated, executed, and parsed back");
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xbar-"));
    // A STUB ENDPOINT, so this gate needs no bridge running. The plugin cannot tell the difference.
    const { createServer } = await import("node:http");
    const srv = createServer((req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ok: true, cpuPct: 73, cores: 8 })); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const url = "http://127.0.0.1:" + srv.address().port + "/sync/load";
    const file = path.join(tmp, pluginFilename("cpu", "3s"));
    fs.writeFileSync(file, buildPlugin({ engineRoot: ENG, url, open: "http://127.0.0.1:1/x" }), { mode: 0o755 });

    // *** ASYNC, AND THE FIRST DRAFT'S execFileSync IS WHY. *** The stub server lives in THIS process, and a
    // synchronous exec blocks this event loop -- so the server could never answer, the plugin's fetch timed
    // out, and the gate reported the plugin broken when the HARNESS was. A test that blocks the thing it is
    // testing against measures only itself.
    let out = "", err = "";
    try { const r0 = await run(file, { encoding: "utf8", timeout: 15000 }); out = r0.stdout; err = r0.stderr; }
    catch (e) { out = (e.stdout || "").toString(); err = (e.stderr || e.message || "").toString(); }
    const lines = out.trim().split("\n");
    const sep = lines.indexOf("---");
    ok("!! it runs and prints a menubar line then a separator", lines.length > 2 && sep === 1, JSON.stringify(lines[0]));
    ok("!! the menubar line carries the value from the endpoint", /73/.test(lines[0]), lines[0]);
    ok("!! a live value is NOT greyed out", !/color=#8e9bb0/.test(lines[0]), "grey is reserved for a feed that is not answering");
    ok("!! the dropdown states the endpoint, the path and the domain",
        lines.slice(sep).some((l) => l.includes(url)) && lines.slice(sep).some((l) => /domain 0\.\.100/.test(l)));
    ok("!! and it offers a refresh the host understands", lines.some((l) => /\| refresh=true$/.test(l)));
    // *** NOTHING ON stderr. *** This is the .mjs decision, verified rather than argued.
    ok("!! *** it writes NOTHING to stderr, which is what the .mjs extension buys ***", err.trim() === "",
        err.trim() ? "stderr: " + err.trim().slice(0, 160) : "clean -- a host that surfaces stderr sees nothing");
    ok("...every styled line uses the parameter grammar", lines.filter((l) => l.includes("|")).every((l) => /\|\s*\w+=/.test(l)));

    // A DEAD ENDPOINT MUST GREY OUT, not show a stale or invented number.
    srv.close();
    await new Promise((r) => setTimeout(r, 50));
    let out2 = "";
    try { out2 = (await run(file, { encoding: "utf8", timeout: 15000 })).stdout; }
    catch (e) { out2 = (e.stdout || "").toString(); }
    const l2 = out2.trim().split("\n");
    ok("!! *** with the endpoint gone, the menubar line greys out and shows no number ***",
        /color=#8e9bb0/.test(l2[0]) && /--/.test(l2[0]), JSON.stringify(l2[0]));
    ok("!! ...and the dropdown says WHY rather than just failing", l2.some((l) => /no answer:/.test(l)),
        (l2.find((l) => /no answer:/.test(l)) || "").slice(0, 90));
    fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- 5. ONE IMPLEMENTATION -----------------------------------------------------------------------------------
console.log("\n5. it decides nothing of its own");
{
    const gen = fs.readFileSync(path.join(ENG, "tools/mac/xbarPlugin.mjs"), "utf8");
    ok("!! the plugin imports the SAME gauge the browser panel uses",
        /runnerGauge\.mjs/.test(gen) && /pickPath, rateFor, feedState, frameAt/.test(gen),
        "the domain rule, the stale states and null-is-not-zero are gated once, in ui/runnerGauge.mjs");
    ok("!! and it re-derives none of them", !/function rateFor|function feedState|function pickPath/.test(gen),
        "a menubar plugin that made those calls again would be a second implementation of the only part worth arguing about");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
            "\nunchecked here: xbar or SwiftBar actually rendering it. Neither is installed on this box and " +
            "neither is macOS -- what IS checked is that the plugin runs, prints the documented grammar, and " +
            "stays silent on stderr.");
process.exit(fails ? 1 : 0);
