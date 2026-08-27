// FILE: ai-bridge/envoySolar.js
// Pull solar + battery values STRAIGHT FROM THE ENPHASE IQ GATEWAY over the LAN — no Home Assistant.
//
// Direction: Envoy -> bridge -> engine/panel. This is the sibling of haSolar.js and it deliberately
// speaks the SAME latest() contract, so GET /ha/solar's consumers (the Pip panel, window.solar,
// the ball-light mood tie-in) work against either source without knowing which one answered.
// haSolar reads HA's copy of the truth; this reads the truth. Pick one with SOLAR_SOURCE.
//
// ---------------------------------------------------------------------------------------------
// *** THE TRAP THIS MODULE EXISTS TO NOT FALL INTO: production.json's storage[] IS THE LEGACY AC
// BATTERY SECTION. *** Every "query your Envoy" writeup on the internet reaches for
// `production.json -> storage[0] -> percentFull`, and on a system with IQ Batteries (Encharge /
// IQ Battery 5P) that array reports percentFull: 0, activeCount: 0, state: "idle" FOREVER. It is
// not empty and it is not broken; it is a different product's slot. A reader who trusts it
// concludes the battery is flat while the battery is fine — a number that is WRONG rather than
// MISSING, which is the expensive kind.
//
// So battery state is resolved through an ORDERED CASCADE and the module REPORTS WHICH SOURCE
// ANSWERED (see `batterySource` in latest()). A silent fallback would reintroduce the same trap
// one layer up: if secctrl is unreachable and we quietly serve the legacy zeros, the panel shows a
// confident 0% and nothing says why.
//
//   1. /ivp/ensemble/secctrl      -> ENC_agg_soc            aggregate SoC across the array. PREFERRED.
//   2. /ivp/ensemble/inventory    -> mean(percentFull)      per-battery, averaged. Used if 1 is absent.
//   3. /production.json storage[] -> percentFull            LEGACY ACB ONLY. Used only if 1 and 2 are
//                                                          absent AND it reports a live battery
//                                                          (activeCount > 0), because a dead zero here
//                                                          is indistinguishable from a real zero.
//
// ---------------------------------------------------------------------------------------------
// GETTING A TOKEN (required — the gateway stopped serving open local endpoints in firmware D7):
//
//   1. Go to  https://entrez.enphaseenergy.com/entrez_tokens
//   2. Sign in with your normal Enphase Enlighten app credentials.
//   3. In "Select System", start typing your system name (it is at the top of the Enlighten app's
//      menu screen), then pick your gateway from the list.
//   4. It hands you a long JWT. Homeowner tokens are valid ~1 year; commissioning tokens ~12 hours.
//   5. Put it in ai-bridge/envoy.config.json as { "ENVOY_TOKEN": "..." } or export ENVOY_TOKEN.
//
// The token is a BEARER CREDENTIAL FOR YOUR HOUSE. envoy.config.json sits beside ha.config.json and
// belongs in .gitignore for the same reason; this file never logs it, not even truncated.
//
// FINDING THE GATEWAY IP — three ways, cheapest first, and this module tries them in this order:
//
//   1. mDNS, AUTOMATIC AND PREFERRED. The gateway advertises `_enphase-envoy._tcp.local` with its
//      serial in the TXT record. ai-bridge/mdnsDiscovery.js already browses mDNS, so discovery is a
//      service type added to its TYPES list rather than a second scanner — see discover() below.
//      This is how Home Assistant finds it too, which is why it works on a normal home LAN.
//   2. The name `envoy.local` (mDNS single-name resolution). Works on macOS and most Linux with
//      avahi; flaky on Windows without Bonjour installed, which is exactly why it is not first.
//   3. Told to us: ENVOY_IP / envoy.config.json. Always wins if set — an explicit answer beats a
//      discovered one, because the person typing it can see the router and we cannot.
//
//   To read it off the router instead: it appears in the DHCP client table as "envoy" or
//   "Enphase-<serial>". `arp -a | grep -i enphase` finds it on a Mac/Linux box on the same subnet.
//
// ---------------------------------------------------------------------------------------------
// HTTP, NOT HTTPS, WHERE THE GATEWAY ALLOWS IT. The gateway serves the same JSON on port 80 and on
// a self-signed 443. JackKelly/envoy_recorder hits plain `http://<ip>/ivp/pdm/device_data` and
// sidesteps the certificate entirely; we do the same and keep HTTPS (with rejectUnauthorized off,
// unavoidable for a self-signed device cert on your own LAN) as the fallback for firmware that
// redirects. Both paths carry the same Bearer token.
//
// HONEST SCOPE, STATED HERE BECAUSE IT IS THE WHOLE LIMIT OF THIS FILE: *** NOTHING BELOW HAS BEEN
// RUN AGAINST A REAL GATEWAY FROM THIS BUILD. *** The sandbox this was written in has no LAN and no
// Envoy. What IS gated headlessly (envoySolar-selfcheck.mjs) is the parsing, the cascade ORDER, the
// source labelling, the unit mapping and the graceful-degradation contract, all against recorded
// fixtures. Pointing it at the real gateway is the rig-side step, and until somebody does that, the
// live half is UNVERIFIED rather than working.
"use strict";
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const CFG_FILE = path.join(__dirname, "envoy.config.json");
const POLL_MS = Math.max(5000, Number(process.env.ENVOY_POLL_MS) || 15000);
const log = (...a) => console.log("[envoy]", ...a);

function _readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } }

// Creds resolved on every call (not cached at require time) so a token written later via a config
// endpoint is picked up without restarting the bridge — the same rule haSolar._creds() follows.
function _creds() {
    const c = _readJson(CFG_FILE);
    return {
        ip: (process.env.ENVOY_IP || c.ENVOY_IP || "").trim(),
        token: (process.env.ENVOY_TOKEN || c.ENVOY_TOKEN || "").trim(),
        serial: (process.env.ENVOY_SERIAL || c.ENVOY_SERIAL || "").trim(),
    };
}

const cache = {
    available: false, lastOkMs: 0, values: {},
    host: "", hostSource: "", batterySource: "none", lastError: "",
};

/**
 * The gateway's mDNS service type. Added to mdnsDiscovery.js's TYPES so the existing browser finds
 * it; kept as a named export so the gate can assert the two agree rather than trusting a comment.
 */
const MDNS_TYPE = "enphase-envoy";

/**
 * Ask the ALREADY-RUNNING mDNS browser what it has seen. Deliberately does NOT start a second
 * discovery stack: mdnsDiscovery.js owns the multicast socket, and two browsers on 224.0.0.251:5353
 * is how you get the "UDP multicast panics on Bun/Windows" class of bug the camera and Roku
 * discoverers already document.
 * @returns {{ip:string, serial:string}|null}
 */
function discover() {
    let mdns = null;
    try { mdns = require("./mdnsDiscovery.js"); } catch { return null; }
    let list = [];
    try { list = mdns.list(MDNS_TYPE) || []; } catch { return null; }
    for (const s of list) {
        const ip = (s.addresses || []).find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
        if (!ip) continue;
        // The gateway publishes its serial as TXT "serialnum" (older firmware: "serial").
        const txt = s.txt || {};
        return { ip, serial: String(txt.serialnum || txt.serial || "").trim() };
    }
    return null;
}

/**
 * Where to reach the gateway, and WHY — the "why" travels with the answer because a host that came
 * from a stale mDNS cache and a host somebody typed fail differently and deserve different advice.
 * @returns {{host:string, source:string}}
 */
function resolveHost() {
    const { ip } = _creds();
    if (ip) return { host: ip, source: "configured" };
    const found = discover();
    if (found && found.ip) return { host: found.ip, source: "mdns" };
    return { host: "envoy.local", source: "mdns-name" };
}

// One GET, token attached, HTTP first and HTTPS as the fallback for firmware that redirects.
function _get(host, urlPath, token, timeoutMs = 8000) {
    const attempt = (mod, scheme) => new Promise((resolve, reject) => {
        const req = mod.request({
            host, path: urlPath, method: "GET", timeout: timeoutMs,
            port: scheme === "https" ? 443 : 80,
            headers: { Authorization: "Bearer " + token, Accept: "application/json" },
            // Unavoidable for a self-signed device certificate on your own LAN. Scoped to this
            // request rather than set globally, because NODE_TLS_REJECT_UNAUTHORIZED=0 would
            // disable verification for every other outbound call the bridge makes.
            ...(scheme === "https" ? { rejectUnauthorized: false } : {}),
        }, (res) => {
            let body = "";
            res.on("data", (d) => { body += d; });
            res.on("end", () => {
                if (res.statusCode === 401 || res.statusCode === 403) {
                    return reject(new Error("HTTP " + res.statusCode + " — token rejected or expired (get a new one at https://entrez.enphaseenergy.com/entrez_tokens)"));
                }
                if (res.statusCode >= 400) return reject(new Error("HTTP " + res.statusCode + " on " + urlPath));
                try { resolve(JSON.parse(body)); }
                catch { reject(new Error("non-JSON reply from " + urlPath + " (" + body.slice(0, 60) + ")")); }
            });
        });
        req.on("timeout", () => { req.destroy(new Error("timeout after " + timeoutMs + "ms")); });
        req.on("error", reject);
        req.end();
    });
    return attempt(http, "http").catch(() => attempt(https, "https"));
}

const _num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/**
 * THE CASCADE, AND IT RETURNS ITS SOURCE. See this file's header for why the legacy path is last
 * and why it is additionally gated on activeCount: a zero from storage[] on an IQ Battery system
 * means "wrong slot", not "empty battery", and the two must not be served as the same number.
 * @returns {{soc:number|null, source:string, detail:object}}
 */
function batteryFrom(secctrl, inventory, production) {
    if (secctrl && _num(secctrl.ENC_agg_soc) !== null) {
        return {
            soc: _num(secctrl.ENC_agg_soc), source: "ensemble/secctrl",
            detail: {
                availEnergyWh: _num(secctrl.ENC_agg_avail_energy),
                backupEnergyWh: _num(secctrl.ENC_agg_backup_energy),
            },
        };
    }
    const encs = [];
    for (const grp of (Array.isArray(inventory) ? inventory : [])) {
        for (const d of (grp && Array.isArray(grp.devices) ? grp.devices : [])) {
            const pf = _num(d.percentFull);
            if (pf !== null) encs.push(pf);
        }
    }
    if (encs.length) {
        return {
            soc: encs.reduce((a, b) => a + b, 0) / encs.length,
            source: "ensemble/inventory",
            detail: { batteries: encs.length, each: encs },
        };
    }
    const st = production && Array.isArray(production.storage) ? production.storage[0] : null;
    if (st && _num(st.activeCount) > 0 && _num(st.percentFull) !== null) {
        return {
            soc: _num(st.percentFull), source: "production.json/storage (legacy ACB)",
            detail: { activeCount: _num(st.activeCount), state: st.state || "" },
        };
    }
    // Nothing credible answered. NOT zero — absent. Serving 0 here is the trap this file is about.
    return { soc: null, source: "none", detail: st ? { legacyStoragePresentButIdle: true } : {} };
}

/** Shape a value the way haSolar does, so a panel cannot tell the two sources apart. */
const _val = (state, unit, name) => ({ state, unit, name, ts: Date.now() });

async function poll() {
    const { token, serial } = _creds();
    if (!token) { cache.available = false; cache.lastError = "no token"; return; }
    const { host, source } = resolveHost();
    cache.host = host; cache.hostSource = source;
    try {
        // production.json is required; the two ensemble endpoints 404 on a battery-less system, and
        // that is a normal state rather than a failure, so they are allowed to come back null.
        const production = await _get(host, "/production.json?details=1", token);
        const secctrl = await _get(host, "/ivp/ensemble/secctrl", token).catch(() => null);
        const inventory = await _get(host, "/ivp/ensemble/inventory", token).catch(() => null);

        const prod = (production.production || []).find((p) => p.measurementType === "production" && p.activeCount > 0)
            || (production.production || [])[0] || {};
        const cons = (production.consumption || []).find((c) => c.measurementType === "total-consumption")
            || (production.consumption || [])[0] || {};
        const net = (production.consumption || []).find((c) => c.measurementType === "net-consumption") || null;

        const bat = batteryFrom(secctrl, inventory, production);
        cache.batterySource = bat.source;
        cache.batteryDetail = bat.detail;

        const v = {};
        v["envoy.production.power"] = _val(_num(prod.wNow), "W", "Current power production");
        v["envoy.production.today"] = _val(_num(prod.whToday), "Wh", "Energy production today");
        v["envoy.production.lifetime"] = _val(_num(prod.whLifetime), "Wh", "Lifetime production");
        v["envoy.consumption.power"] = _val(_num(cons.wNow), "W", "Current total consumption");
        if (net) v["envoy.grid.power"] = _val(_num(net.wNow), "W", "Current net power (grid)");
        if (bat.soc !== null) v["envoy.battery.soc"] = _val(bat.soc, "%", "Battery state of charge");
        if (bat.detail && bat.detail.availEnergyWh != null) {
            v["envoy.battery.available"] = _val(bat.detail.availEnergyWh, "Wh", "Battery available energy");
        }
        if (serial) v["envoy.serial"] = _val(serial, "", "Gateway serial");

        cache.values = v;
        cache.available = true;
        cache.lastOkMs = Date.now();
        cache.lastError = "";
    } catch (e) {
        // Last good values STAY, flagged stale by latest(). Same contract as haSolar: a gateway that
        // stopped answering for thirty seconds is not a reason to blank a panel.
        cache.available = false;
        cache.lastError = String((e && e.message) || e);
    }
}

let timer = null;

function start() {
    const { token } = _creds();
    if (!token) {
        log("disabled — no token. Get one at https://entrez.enphaseenergy.com/entrez_tokens and put it in ai-bridge/envoy.config.json as { \"ENVOY_TOKEN\": \"...\" } (or export ENVOY_TOKEN).");
        return;
    }
    const { host, source } = resolveHost();
    log(`polling ${host} (found by: ${source}) every ${POLL_MS}ms`);
    poll();
    if (timer) clearInterval(timer);
    timer = setInterval(poll, POLL_MS);
    if (timer.unref) timer.unref();
}

function stop() { if (timer) { clearInterval(timer); timer = null; } }

/**
 * The SAME shape haSolar.latest() returns, plus three fields that only make sense for a direct
 * reader: which host answered, how we found it, and WHICH battery endpoint the number came from.
 * A consumer written against haSolar ignores the extras and works unchanged.
 */
function latest() {
    const v = cache.values;
    return {
        available: cache.available,
        stale: cache.lastOkMs > 0 ? (Date.now() - cache.lastOkMs > POLL_MS * 3) : true,
        lastOkMs: cache.lastOkMs,
        values: v,
        source: "envoy-direct",
        host: cache.host,
        hostSource: cache.hostSource,
        batterySource: cache.batterySource,
        batteryDetail: cache.batteryDetail || {},
        lastError: cache.lastError,
        roles: {
            power: v["envoy.production.power"] || null,
            energyToday: v["envoy.production.today"] || null,
            grid: v["envoy.grid.power"] || null,
            battery: v["envoy.battery.soc"] || null,
        },
    };
}

function getConfig() {
    const c = _creds();
    // NEVER the token. A config endpoint that echoes a bearer credential is how it ends up in a
    // screenshot; the panel only needs to know WHETHER one is set.
    return { ip: c.ip, serial: c.serial, hasToken: !!c.token, pollMs: POLL_MS, host: cache.host, hostSource: cache.hostSource };
}

function setConfig(c) {
    if (c && typeof c === "object") {
        const cur = _readJson(CFG_FILE);
        for (const k of ["ENVOY_IP", "ENVOY_TOKEN", "ENVOY_SERIAL"]) {
            if (c[k] !== undefined) cur[k] = String(c[k] || "").trim();
        }
        try { fs.writeFileSync(CFG_FILE, JSON.stringify(cur, null, 2), { mode: 0o600 }); } catch {}
        try { start(); } catch {}
        poll();
    }
    return getConfig();
}

module.exports = { start, stop, latest, poll, getConfig, setConfig, discover, resolveHost, batteryFrom, MDNS_TYPE };
