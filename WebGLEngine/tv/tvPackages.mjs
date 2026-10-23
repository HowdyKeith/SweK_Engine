// WebGLEngine/tv/tvPackages.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// WHAT A PACKAGE ON A TV IS, ACCORDING TO THREE OTHER PEOPLE'S MEASUREMENTS, AND WHAT SweK DOES ABOUT THE DISAGREEMENT.
//
// tv/tvPackages.json is baked by tools/ship/takeTvPackages.mjs from ansub/tv-detox, gathin23/tv-vibehack (CleanYourTV) and
// simbasjungles/free-my-tv, all MIT, each with the commit its lists came from. This file turns that record into one verdict
// per package. It is the READ-ONLY half of SweK's TV debloat: nothing here talks to a TV, and tv/tvDebloat.mjs, which plans
// against it, executes nothing either.
//
// *** THE THREE SOURCES DISAGREE, AND THE DISAGREEMENT IS THE FINDING. *** tv-detox lists com.google.android.tungsten.setupwraith
// as one the TV needs to start; tv-vibehack's own lists disable it on 85 of 227 TVs and keep it on 11. tv-detox calls
// com.android.providers.calendar untouchable; tv-vibehack's CORE_OK allows it and disables it on 11 TVs. Both are right ABOUT
// THEIR TVs, and a debloater that took the union of what anyone had disabled would brick the TV that is the 12th. So the order
// below is "the strictest source wins by default", and a package one source forbids and another has disabled is CONTESTED:
// refused unless the caller names it, and the caller's naming is recorded in the plan.
//
//   core        tv-vibehack's CORE_RE minus CORE_OK. Android itself can stop booting (an original Mi TV Stick never came back).
//               NO OPTION OVERRIDES THIS. It is a refusal, not a warning.
//   launcher    one of tv-detox's LAUNCHERS (the stock home screens). Disabling the one that owns Home with nothing else to answer
//               it leaves a TV with no home screen; only tv/tvDebloat.mjs's Home guard may let it through, never this table.
//   never       tv-detox's NEVER list (the TV needs it to start or keep working) that is not core.
//   contested   NEVER or KEEP in one source and DISABLED on at least one real TV in another. Refused by default.
//   keep        tv-detox's KEEP list: a feature carrier (casting, voice, remote service). Ask the person; never a default.
//   safe        tv-detox SAFE, or free-my-tv's DEBLOAT, or tv-vibehack consensus (disabled on 10+ TVs and at least four times as
//               often as it is kept). The only class a default plan disables.
//   mixed       tv-vibehack has it disabled on some TVs and kept on others and nobody else speaks: not a default.
//   unknown     nobody has an opinion. Left alone.
//
// NOT CLAIMED: that "safe" is safe on YOUR TV. It is the class that real TVs most often survived, and the plan still asks first.
"use strict";

/** Build the knowledge object from a baked record (the JSON), so a gate can feed it a fixture as easily as the real file. */
export function makeKnowledge(data) {
    const re = new RegExp(data.vibehack.coreRe);
    const ok = new RegExp(data.vibehack.coreOk);
    const never = new Set(data.detox.never), keep = new Set(data.detox.keep), safe = new Set(data.detox.safe);
    const launchers = new Set(data.detox.launchers);
    const fmt = new Set(data.freemytv.debloat);
    const freq = data.vibehack.freq;
    const names = data.detox.names || {};

    const isCore = (pkg) => re.test(pkg) && !ok.test(pkg);

    function verdict(pkg) {
        const f = freq[pkg] || null;
        const disabledOn = f ? f[0] : 0, keptOn = f ? f[1] : 0;
        const ev = { disabledOn, keptOn, detox: never.has(pkg) ? "never" : keep.has(pkg) ? "keep" : safe.has(pkg) ? "safe" : null, freemytv: fmt.has(pkg), name: names[pkg] || null };
        const out = (cls, why) => ({ pkg, class: cls, why, evidence: ev });
        if (isCore(pkg)) return out("core", "Android's own core package (tv-vibehack CORE_RE): with it disabled the TV may not boot again");
        if (launchers.has(pkg)) return out("launcher", "a stock home screen: only the Home guard may let it be disabled, and only once another home screen answers");
        if (never.has(pkg) || keep.has(pkg)) {
            if (disabledOn > 0) return out("contested", (never.has(pkg) ? "tv-detox says the TV needs it" : "tv-detox says it carries a feature") + ", and tv-vibehack's lists disable it on " + disabledOn + " of " + data.vibehack.devices + " TVs (kept on " + keptOn + ")");
            return out(never.has(pkg) ? "never" : "keep", never.has(pkg) ? "tv-detox: the TV needs it to start or keep working" : "tv-detox: it carries a feature (casting, voice, remote); ask before turning it off");
        }
        if (safe.has(pkg) || fmt.has(pkg)) return out("safe", safe.has(pkg) ? "tv-detox: commonly preinstalled junk" : "free-my-tv switches it off by itself");
        if (disabledOn >= 10 && disabledOn >= 4 * keptOn) return out("safe", "tv-vibehack consensus: disabled on " + disabledOn + " TVs, kept on " + keptOn);
        if (disabledOn > 0 && keptOn > 0) return out("mixed", "tv-vibehack has it disabled on " + disabledOn + " TVs and kept on " + keptOn + ", and nobody else speaks");
        if (disabledOn > 0) return out("mixed", "disabled on " + disabledOn + " TVs but too few to call it consensus");
        return out("unknown", "no source has an opinion; left alone");
    }

    /** Every place two sources disagree, for a person to read. */
    function conflicts() {
        const rows = [];
        for (const p of [...never, ...keep]) {
            const f = freq[p];
            if (f && f[0] > 0 && !isCore(p)) rows.push({ pkg: p, detox: never.has(p) ? "never" : "keep", disabledOn: f[0], keptOn: f[1] });
        }
        for (const p of safe) {
            const f = freq[p];
            if (f && f[1] > f[0]) rows.push({ pkg: p, detox: "safe", disabledOn: f[0], keptOn: f[1] });
        }
        return rows.sort((a, b) => b.disabledOn - a.disabledOn || (a.pkg < b.pkg ? -1 : 1));
    }

    function census() {
        const all = new Set([...never, ...keep, ...safe, ...fmt, ...launchers, ...Object.keys(freq)]);
        const by = {};
        for (const p of all) { const c = verdict(p).class; by[c] = (by[c] || 0) + 1; }
        return { packages: all.size, byClass: by };
    }

    return Object.freeze({ verdict, isCore, conflicts, census, devices: data.vibehack.devices, sources: data.sources });
}

/** Node only: read the baked record from beside this file. Pages that want the knowledge fetch the JSON and call makeKnowledge. */
export async function loadKnowledge() {
    const fs = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const f = path.join(path.dirname(fileURLToPath(import.meta.url)), "tvPackages.json");
    return makeKnowledge(JSON.parse(fs.readFileSync(f, "utf8")));
}
