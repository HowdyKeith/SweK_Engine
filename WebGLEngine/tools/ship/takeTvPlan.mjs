// WebGLEngine/tools/ship/takeTvPlan.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/takeTvPlan.mjs --installed pm.txt [--disabled pmd.txt] [--home home.txt] [--wifi wifi.txt] [--request a.b,c.d] [--allow e.f] [--out plan.json] [--undo undo.sh]
//      node tools/ship/takeTvPlan.mjs --adb <ip[:port]> [same options]            (READ-ONLY: runs four adb reads and nothing else)
//
// THE COMMAND FOR tv/tvDebloat.mjs. NO EXPORTS ON PURPOSE (the library is held by this file and graded by tools/ship/tvDebloat-selfcheck.mjs, section 8).
//
// *** IT PLANS; IT DOES NOT DISABLE ANYTHING. *** With --adb it runs exactly four commands on the TV, all of them reads:
//     pm list packages                       what is installed
//     pm list packages -d                    what is already disabled (so undo never turns on what the owner had off)
//     cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME      who answers Home
//     dumpsys wifi                           who owns the saved networks (setupwraith deletes them when it is disabled)
// and tools/ship/tvDebloat-selfcheck.mjs drives this file with a fake adb to hold it to those four. Without --adb it reads the same four outputs from files you captured yourself.
// The plan is printed; --out writes it as JSON (the backup included) and --undo writes the script that puts back exactly what the plan turned off. Applying the plan is a separate,
// confirmed, per-step act on a TV you are prepared to factory-reset, and is not written (tools/ship/nextRounds.mjs: tv-debloat-executor-needs-a-tv-to-lose).
"use strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { parseOrExit } from "./cliArgs.mjs";
import { loadKnowledge } from "../../tv/tvPackages.mjs";
import { planDebloat, parsePmList, parseHomeClaims, parseWifiOwners } from "../../tv/tvDebloat.mjs";

const cli = parseOrExit("takeTvPlan", {
    values: { "--installed": "path", "--disabled": "path", "--home": "path", "--wifi": "path", "--adb": "string", "--request": "string", "--allow": "string", "--out": "path", "--undo": "path" },
    flags: [],
});
const v = cli.values;
const list = (s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined);

let installedTxt, disabledTxt = "", homeTxt = "", wifiTxt = "";
if (v["--adb"]) {
    if (!/^[A-Za-z0-9._:-]+$/.test(v["--adb"])) { console.error("takeTvPlan: --adb takes a host or host:port, not " + JSON.stringify(v["--adb"])); process.exit(2); }
    // the four reads, and only these; connect first (a no-op when already connected)
    spawnSync("adb", ["connect", v["--adb"]], { encoding: "utf8" });
    const sh = (...args) => { const r = spawnSync("adb", ["-s", v["--adb"], "shell", ...args], { encoding: "utf8", timeout: 60000 }); return r.status === 0 ? r.stdout : null; };
    installedTxt = sh("pm", "list", "packages");
    if (!installedTxt || !/package:/.test(installedTxt)) { console.error("takeTvPlan: could not read the package list from " + v["--adb"] + " (is USB/Network debugging on and the TV allowing this computer?). Nothing was changed."); process.exit(1); }
    disabledTxt = sh("pm", "list", "packages", "-d") || "";
    homeTxt = sh("cmd", "package", "query-activities", "--brief", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.HOME") || "";
    wifiTxt = sh("dumpsys", "wifi") || "";
} else {
    if (!v["--installed"]) { console.error("takeTvPlan: give --installed <file of `pm list packages`> or --adb <ip>"); process.exit(2); }
    installedTxt = fs.readFileSync(v["--installed"], "utf8");
    if (v["--disabled"]) disabledTxt = fs.readFileSync(v["--disabled"], "utf8");
    if (v["--home"]) homeTxt = fs.readFileSync(v["--home"], "utf8");
    if (v["--wifi"]) wifiTxt = fs.readFileSync(v["--wifi"], "utf8");
}

const K = await loadKnowledge();
const homeClaims = parseHomeClaims(homeTxt);
const tv = { installed: parsePmList(installedTxt), disabled: parsePmList(disabledTxt), homeClaims, homePackage: homeClaims.length ? homeClaims[0].split("/")[0] : null, wifiOwners: parseWifiOwners(wifiTxt) };
const plan = planDebloat(K, tv, { request: list(v["--request"]), allow: list(v["--allow"]) });

console.log("[takeTvPlan] " + tv.installed.length + " packages installed, " + tv.disabled.length + " already disabled, Home answered by " + (tv.homePackage || "(not read)") + ", Wi-Fi owners " + (tv.wifiOwners ? tv.wifiOwners.join(", ") : "(not read)"));
console.log("[takeTvPlan] THIS IS A PLAN. NOTHING WAS CHANGED ON THE TV, AND THIS COMMAND CANNOT CHANGE IT.");
console.log("[takeTvPlan] would disable " + plan.steps.length + ", skipped " + plan.skipped.length + ", refused " + plan.refusals.length + "   (knowledge from " + K.sources.map((s) => s.name + "@" + s.commit.slice(0, 7)).join(", ") + ")");
for (const s of plan.steps) console.log("  disable  " + s.pkg.padEnd(52) + " [" + s.class + "]  " + s.why.slice(0, 90));
for (const s of plan.skipped) console.log("  skip     " + s.pkg.padEnd(52) + " [" + (s.class || "-") + "]  " + s.why.slice(0, 90));
for (const s of plan.refusals) console.log("  REFUSED  " + s.pkg.padEnd(52) + " [" + (s.class || "-") + "]  " + s.why.slice(0, 90));
if (v["--out"]) { fs.writeFileSync(v["--out"], JSON.stringify(plan, null, 1) + "\n"); console.log("[takeTvPlan] wrote " + v["--out"] + " (the plan and the backup of the state before it)"); }
if (v["--undo"]) { fs.writeFileSync(v["--undo"], plan.undoScript); console.log("[takeTvPlan] wrote " + v["--undo"] + " (re-enables exactly the " + plan.steps.length + " planned packages)"); }
