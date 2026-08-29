// tools/ship/bunNative.mjs -- WHICH OF BUN'S ADVERTISED NATIVE APIS ARE ON THIS BOX, AND WOULD THEY SAVE US
// ANYTHING.
//
// Run: bun tools/ship/bunNative.mjs        (or: node tools/ship/bunNative.mjs, which reports "not bun")
//      add --json for the /runtime/native route
//
// v4006 -- Keith asked "can we make a test Bun.WebView page?" after reading that Bun 1.4 ships native
// replacements for Playwright, Sharp, marked, node-pty, node-cron and others -- "so what are the new features
// of bun.exe ... and other dependencies that we will not have to install since it would be included in
// Bun.exe".
//
// *** THE HONEST PAGE IS A PROBE, NOT A DEMONSTRATION. *** On the bun this tree has (1.3.11), Bun.WebView is
// UNDEFINED. A page that "used" it would either be a mock -- a demonstration of something that is not there --
// or it would throw on load and teach the reader that the feature is broken rather than absent. ABSENT AND
// BROKEN ARE DIFFERENT FACTS, and this tree has a standing rule about exactly that pair.
//
// *** AND `IT WOULD REPLACE X` IS ONLY INTERESTING IF WE USE X. *** The article's list -- Knex, pg, Sharp,
// marked, node-pty, node-cron, jest, webpack -- is largely a list of packages this project does not depend on,
// so "kills your dependencies" would kill none of ours. Each row below therefore carries THE PACKAGE IT WOULD
// REPLACE AND WHETHER ai-bridge/package.json ACTUALLY LISTS IT, read from the file rather than remembered.
// A saving nobody was paying for is not a saving.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// fileURLToPath, NOT .pathname -- v3937's rule, and I wrote .pathname here on the first draft of a file added
// in the same session that fixed three other instances of it. On Windows `new URL(...).pathname` yields
// "/C:/dir" and every join after it is wrong.
const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Each row: the API, what it is claimed to replace, and why we would care.
const CLAIMED = [
    { api: "WebView",   replaces: ["puppeteer-core", "playwright", "playwright-core"],
      why: "browser automation. THE ONE THAT WOULD MATTER MOST HERE: 20 gates import tools/ship/playwrightResolve.mjs, and the live half of every page gate is Chromium." },
    { api: "SQL",       replaces: ["pg", "mysql2", "knex", "typeorm", "better-sqlite3"],
      why: "a database client. This tree stores JSON on disk and has no SQL dependency at all." },
    { api: "Image",     replaces: ["sharp", "jimp"],
      why: "image resizing and conversion." },
    { api: "Markdown",  replaces: ["marked", "markdown-it"],
      why: "markdown rendering." },
    { api: "Terminal",  replaces: ["node-pty"],
      why: "a pseudo-terminal, which is a native add-on and the usual reason a clean install fails." },
    { api: "cron",      replaces: ["node-cron", "agenda", "node-schedule"],
      why: "scheduled work inside the process." },
    { api: "redis",     replaces: ["ioredis", "redis"],
      why: "a Redis client." },
    { api: "Glob",      replaces: ["glob", "fast-glob"],
      why: "file matching." },
    { api: "YAML",      replaces: ["yaml", "js-yaml"],
      why: "YAML parsing." },
    { api: "semver",    replaces: ["semver"],
      why: "version comparison." },
];

function deps() {
    // READ, not remembered. The whole point of the `usedHere` column is that it is derived from the manifest.
    // require() is not defined in an ES module -- the first draft used it and every row reported "?" for
    // whether we actually depend on the package. A COLUMN THAT IS ALL UNKNOWNS LOOKS LIKE A COLUMN.
    try {
        const j = JSON.parse(fs.readFileSync(path.join(ENGINE, "ai-bridge", "package.json"), "utf8"));
        return Object.assign({}, j.dependencies, j.devDependencies, j.optionalDependencies);
    } catch { return null; }
}

const isBun = typeof Bun !== "undefined" && !!Bun.version;

function surface() {
    const installed = deps();
    return CLAIMED.map((row) => {
        const t = isBun ? typeof Bun[row.api] : "undefined";
        const present = t !== "undefined";
        const used = installed ? row.replaces.filter((p) => Object.prototype.hasOwnProperty.call(installed, p)) : null;
        return { api: "Bun." + row.api, present, type: t, replaces: row.replaces,
                 usedHere: used, why: row.why };
    });
}

/**
 * *** THE WEBVIEW TRIAL, AND IT IS A TRIAL RATHER THAN A typeof. ***
 * "The global exists" and "it can open a page and tell me its title" are different claims, and the second is
 * the one that would let anything here stop depending on Chromium. So when the API is present this actually
 * drives it, against a data: URL so the trial needs no network and no file. When it is absent the reason says
 * ABSENT, never "failed" -- a box that has not got a feature has not got a broken one.
 */
async function webviewTrial() {
    if (!isBun) return { ran: false, state: "not-bun", detail: "this probe is running under " + runtimeName() + ", which has no Bun namespace" };
    if (typeof Bun.WebView === "undefined") {
        return { ran: false, state: "absent",
                 detail: "Bun " + Bun.version + " has no Bun.WebView. NOT a failure and not a broken install -- " +
                         "the API is not in this build. Upgrade bun and re-run this probe to find out if it arrives." };
    }
    const t0 = Date.now();
    try {
        const html = "<!doctype html><title>SweK WebView trial</title><h1 id=h>hello from a data URL</h1>";
        const wv = await Bun.WebView.open ? await Bun.WebView.open("data:text/html," + encodeURIComponent(html))
                                          : new Bun.WebView("data:text/html," + encodeURIComponent(html));
        const title = wv && (typeof wv.title === "function" ? await wv.title() : wv.title);
        const text = wv && typeof wv.evaluate === "function"
            ? await wv.evaluate("document.getElementById('h').textContent") : null;
        try { if (wv && typeof wv.close === "function") await wv.close(); } catch {}
        return { ran: true, state: "worked", ms: Date.now() - t0, title: title ?? null, text: text ?? null,
                 detail: "Bun.WebView opened a data: URL and answered. THAT IS THE CLAIM THAT MATTERS: it is " +
                         "the difference between the global existing and the feature being usable." };
    } catch (e) {
        return { ran: true, state: "threw", ms: Date.now() - t0, error: String((e && e.message) || e).slice(0, 300),
                 detail: "the API is PRESENT and did not work when driven. That is a different finding from " +
                         "absent, and it is the one worth reporting upstream." };
    }
}

function runtimeName() {
    if (isBun) return "bun " + Bun.version;
    if (typeof process !== "undefined" && process.versions && process.versions.node) return "node " + process.versions.node;
    return "unknown";
}

export async function probe() {
    const rows = surface();
    const installed = deps();
    const present = rows.filter((r) => r.present);
    const wouldSave = rows.filter((r) => r.present && r.usedHere && r.usedHere.length);
    return {
        runtime: runtimeName(), isBun,
        manifestRead: installed !== null,
        dependencyCount: installed ? Object.keys(installed).length : null,
        rows,
        presentCount: present.length, claimedCount: rows.length,
        // *** THE NUMBER THE QUESTION WAS ACTUALLY ABOUT. *** Not "how many natives does bun have" but "how
        // many packages could we stop installing because of them".
        packagesThisWouldRemove: wouldSave.flatMap((r) => r.usedHere),
        webview: await webviewTrial(),
    };
}

// ---------------------------------------------------------------------------
// pathToFileURL, NOT an endsWith basename guard -- winPathGuard-selfcheck's own rule: this file already
// imports node:url (fileURLToPath, above), so the basename comparison it used to carry was unfinished rather
// than exempt. An unanchored endsWith was also wrong on its own terms (a suffix is not a basename: a sibling
// file ending in the same characters would false-match), on top of never being the strong form available here.
const isMain = typeof process !== "undefined" && process.argv && process.argv[1] &&
    pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
    const r = await probe();
    if (process.argv.includes("--json")) { console.log(JSON.stringify(r, null, 1)); }
    else {
        console.log("runtime: " + r.runtime + (r.manifestRead ? "   (ai-bridge declares " + r.dependencyCount + " packages)" : "   (package.json unreadable)"));
        console.log("");
        for (const row of r.rows) {
            const mark = row.present ? "PRESENT " : "absent  ";
            const use = row.usedHere === null ? "?" : row.usedHere.length ? "WE USE " + row.usedHere.join(", ") : "not used here";
            console.log("  " + mark + row.api.padEnd(14) + use);
        }
        console.log("");
        console.log("  natives present: " + r.presentCount + " of " + r.claimedCount);
        console.log("  packages this would let us drop: " +
            (r.packagesThisWouldRemove.length ? r.packagesThisWouldRemove.join(", ") : "NONE"));
        console.log("");
        console.log("  Bun.WebView: " + r.webview.state);
        console.log("    " + r.webview.detail);
    }
    process.exit(0);
}
