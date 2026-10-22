// WebGLEngine/tv/tvDebloat.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// A DRY-RUN PLANNER FOR TURNING PACKAGES OFF ON AN ANDROID TV. IT EXECUTES NOTHING AND CANNOT: this file has no I/O, no
// child process and no network. It takes the text three read-only adb commands printed and returns a PLAN -- what it would
// disable and why, what it refused and why, the backup that records the state before, and the script that puts back exactly
// what the plan turned off. Whatever runs the plan later is a separate, confirmed, per-step act on a TV the owner chose.
//
// *** WHY A PLANNER FIRST, AND WHY THE RULES ARE THE ONES THEY ARE. *** The three repositories this knowledge comes from
// (tv/tvPackages.mjs) agree on one thing above all: a TV can be left unbootable by disabling the wrong package, and the cure is a
// factory reset. tv-detox: "a few TVs got stuck at the logo or kept restarting". tv-vibehack: an original Mi TV Stick never booted
// again after a list took six Android core packages (its issue 884), and tools/disable.sh has refused such lists ever since with NO
// override. So the rules here are hard-coded refusals first and conveniences second:
//
//   1. A name that is not a package name is refused outright. The commands are BUILT from these strings; a name with a space or a
//      semicolon in it would be a shell command, not a package.
//   2. core and never packages are refused whoever asks. contested/keep/mixed/unknown are refused unless the caller NAMES them in
//      `allow`, which is how a person says "yes, this one, I know" -- and the plan records that they did.
//   3. A stock home screen is only let through the HOME GUARD: it must not be the last thing that can answer Home. The setup wizard,
//      the settings apps, a vendor's FallbackHome and a factory-test activity do not count as a home (a Mi TV 4A handed Home to its
//      factory test screen). If nothing else can answer Home, the launcher stays on.
//   4. com.google.android.tungsten.setupwraith owns the Wi-Fi networks saved during first-run setup, and Android deletes them the moment
//      it is disabled: the TV drops off Wi-Fi and takes adb with it. It is skipped unless the saved networks are READ and none belong
//      to it. If they cannot be read, it stays on -- the safe side of not knowing.
//   5. Only packages that are installed and not already disabled are planned, so undo never re-enables something the owner had off.
//
// NOT CLAIMED: that any plan is safe for the TV it is run on. It is the plan the three sources' measurements support, and the first
// run belongs on a TV that can be reset.
"use strict";

const PKG = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const HOME_NOT_A_HOME = [/\/[^ ]*FallbackHome$/, /factorytest|factory_test|factorymode/i];
const HOME_NOT_COUNTED = new Set(["com.google.android.tungsten.setupwraith", "com.android.tv.settings", "com.android.settings", "com.android.provision"]);
export const SETUPWRAITH = "com.google.android.tungsten.setupwraith";

/** `pm list packages` output -> sorted package names. Tolerates CRLF and the "package:" prefix. */
export function parsePmList(text) {
    return [...new Set(String(text || "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("package:"))
        .map((l) => l.slice(8).split(/\s+/)[0]).filter((p) => PKG.test(p)))].sort();
}

/** `cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME` output -> ["pkg/.Activity", ...]. */
export function parseHomeClaims(text) {
    return [...new Set(String(text || "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter((l) => /^[A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+$/.test(l)))].sort();
}

/** `dumpsys wifi` output -> the app components that own saved networks (the cname=... tokens), or null when none can be read. */
export function parseWifiOwners(text) {
    const owners = [...String(text || "").matchAll(/cname=([^\s]+)/g)].map((m) => m[1]);
    return owners.length ? [...new Set(owners)].sort() : null;
}

/**
 * Plan a debloat.
 * @param {object} knowledge  makeKnowledge(...) from tv/tvPackages.mjs
 * @param {object} tv         { installed: string[], disabled: string[], homeClaims: string[], wifiOwners: string[]|null, homePackage: string|null }
 * @param {object} opts       { request?: string[] (explicit names; default: every installed 'safe' package), allow?: string[] (contested/keep/mixed/unknown names the person accepts) }
 */
export function planDebloat(knowledge, tv, opts = {}) {
    const installed = new Set(tv.installed || []);
    const alreadyOff = new Set(tv.disabled || []);
    const allow = new Set(opts.allow || []);
    const explicit = Array.isArray(opts.request);
    const request = explicit ? [...new Set(opts.request)] : [...installed].filter((p) => PKG.test(p) && knowledge.verdict(p).class === "safe").sort();

    const steps = [], skipped = [], refusals = [];
    const planned = new Set();
    const refuse = (pkg, why, cls = null) => refusals.push({ pkg, class: cls, why });
    const skip = (pkg, why, cls = null) => skipped.push({ pkg, class: cls, why });

    for (const pkg of request) {
        if (typeof pkg !== "string" || !PKG.test(pkg)) { refuse(String(pkg).slice(0, 80), "not a package name; commands are built from these strings, so a name with a space or a semicolon is refused outright"); continue; }
        const v = knowledge.verdict(pkg);
        if (v.class === "core") { refuse(pkg, v.why + ". NO OPTION OVERRIDES THIS", v.class); continue; }
        if (v.class === "never") { refuse(pkg, v.why, v.class); continue; }
        if (v.class === "launcher") continue;                       // decided by the Home guard below, once the rest of the plan is known
        if (!installed.has(pkg)) { skip(pkg, "not installed on this TV", v.class); continue; }
        if (alreadyOff.has(pkg)) { skip(pkg, "already disabled; left as the owner had it, so undo will not turn it on", v.class); continue; }
        if (v.class !== "safe" && !allow.has(pkg)) { refuse(pkg, v.why + ". Refused unless named in `allow`", v.class); continue; }
        steps.push({ pkg, class: v.class, why: v.why + (v.class !== "safe" ? " [ALLOWED BY NAME]" : ""), allowedByName: v.class !== "safe" });
        planned.add(pkg);
    }

    // ---- the Home guard: a stock launcher may go only if something else that is a real home keeps answering Home ----------
    const claims = (tv.homeClaims || []);
    for (const pkg of request) {
        if (!PKG.test(String(pkg)) || knowledge.verdict(pkg).class !== "launcher") continue;
        if (!installed.has(pkg)) { skip(pkg, "not installed on this TV", "launcher"); continue; }
        if (alreadyOff.has(pkg)) { skip(pkg, "already disabled", "launcher"); continue; }
        if (!tv.homePackage && claims.length === 0) { skip(pkg, "could not tell who owns Home, so the Home guard could not run; a launcher is never disabled blind", "launcher"); continue; }
        const others = claims
            .filter((c) => !HOME_NOT_A_HOME.some((re) => re.test(c)))
            .map((c) => c.split("/")[0])
            .filter((p) => !HOME_NOT_COUNTED.has(p) && p !== pkg && !planned.has(p) && !alreadyOff.has(p));
        if (others.length === 0) { skip(pkg, "it owns Home and no other real home screen would stay enabled to answer it; make the new launcher Home first", "launcher"); continue; }
        steps.push({ pkg, class: "launcher", why: "a stock home screen; " + others[0] + " will answer Home", allowedByName: false });
        planned.add(pkg);
    }

    // ---- setupwraith owns first-run Wi-Fi networks ----------------------------------------------------------------------
    const si = steps.findIndex((s) => s.pkg === SETUPWRAITH);
    if (si >= 0) {
        const owners = tv.wifiOwners;
        if (!owners) { const [s] = steps.splice(si, 1); planned.delete(SETUPWRAITH); skip(s.pkg, "could not read which app owns the saved Wi-Fi networks, so it stays on: disabling it deletes the networks it owns and takes adb off the TV", s.class); }
        else if (owners.some((o) => o.includes("setupwraith"))) { const [s] = steps.splice(si, 1); planned.delete(SETUPWRAITH); skip(s.pkg, "the saved Wi-Fi network belongs to it; forget the network and join it again in Settings first (it then belongs to the system)", s.class); }
    }

    const order = { safe: 0, mixed: 1, unknown: 1, keep: 2, contested: 3, launcher: 4 };
    steps.sort((a, b) => (order[a.class] ?? 9) - (order[b.class] ?? 9) || (a.pkg < b.pkg ? -1 : 1));
    for (const s of steps) { s.command = "pm disable-user --user 0 " + s.pkg; s.undo = "pm enable " + s.pkg; s.ask = true; }

    const undoScript = ["#!/bin/sh", "# Puts back exactly what the plan turned off -- and nothing the owner already had disabled.", "# Run with the TV reachable: sh undo.sh <TV_IP>", ...[...steps].reverse().map((s) => 'adb -s "$1" shell ' + s.undo)].join("\n") + "\n";
    return {
        executes: false,
        steps, skipped, refusals,
        backup: { installed: [...installed].sort(), disabled: [...alreadyOff].sort(), homePackage: tv.homePackage || null, homeClaims: claims },
        undoScript,
        summary: { requested: request.length, planned: steps.length, skipped: skipped.length, refused: refusals.length },
    };
}
