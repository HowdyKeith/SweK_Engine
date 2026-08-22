// ui/adsbLayer.js — v1113
// Live ADS-B aircraft shown as world-anchored labels over the world (best with
// Real Terrain loaded). Pulls from the bridge's /adsb/nearby (adsb.lol), maps
// each plane's lat/lon to world coords relative to the centre, dead-reckons
// between polls for smooth motion, and draws a heading-rotated glyph + callsign
// + altitude via window.worldLabels. Toggle: window.adsb.start() / .stop().
//
// Coordinate model: Real Terrain centres its grid on the world origin (0,0), so
// the plane's offset from centre (in metres) maps to world X (east) / Z (north),
// scaled by cfg.voxPerKm. Altitude is compressed (cfg.voxPer1000ft) so cruising
// traffic sits in a visible band rather than thousands of voxels up.

const DEG = Math.PI / 180;

import { classifyAircraft } from "./aircraftClass.js";

export function installAdsb() {
    const cfg = {
        distNm: 40,        // fetch radius, nautical miles
        voxPerKm: 6,       // horizontal: world voxels per km (compression)
        voxPer1000ft: 4,   // vertical: voxels per 1000 ft
        baseY: 30,         // world Y at 0 ft
        pollMs: 12000,     // refresh cadence (polite to adsb.lol)
        maxPlanes: 80,
        invertZ: true,     // north = -Z; flip if planes look mirrored
    };
    const planes = new Map();   // hex -> { lat, lon, altFt, heading, speedKt, callsign, onGround, seen }
    let on = false, pollTimer = null, raf = null, center = null, lastFrame = 0;

    const fmtAlt = (ft) => ft >= 18000 ? ("FL" + Math.round(ft / 100)) : (Math.round(ft / 100) * 100 + "ft");

    function llToWorld(lat, lon, altFt) {
        const dN = (lat - center.lat) * 111320;
        const dE = (lon - center.lon) * 111320 * Math.cos(center.lat * DEG);
        const vpm = cfg.voxPerKm / 1000;
        return [dE * vpm, cfg.baseY + (altFt / 1000) * cfg.voxPer1000ft, (cfg.invertZ ? -dN : dN) * vpm];
    }

    function labelHtml(p) {
        const rot = (p.heading || 0).toFixed(0);
        const k = classifyAircraft(p);
        return '<span title="' + k.name + '" style="display:inline-block;transform:rotate(' + rot + 'deg);color:' + k.color + ';">' + k.glyph + '</span> ' +
               '<b style="color:#dff;">' + (p.callsign || "?") + '</b>' +
               '<span style="color:#9bb;"> ' + (p.onGround ? "GND" : fmtAlt(p.altFt)) + '</span>';
    }

    async function resolveCenter() {
        const rt = window.realTerrain;
        if (rt && rt._lastCenter && isFinite(rt._lastCenter.lat)) return { lat: rt._lastCenter.lat, lon: rt._lastCenter.lon, source: "real terrain" };
        if (window.engineLocation) { try { return await window.engineLocation.get(); } catch {} }
        return null;
    }

    async function poll() {
        if (!on) return;
        if (!center) { center = await resolveCenter(); if (!center) { console.warn("[adsb] no location — load Real Terrain or allow geolocation"); return; } }
        try {
            const r = await fetch(`/adsb/nearby?lat=${center.lat.toFixed(5)}&lon=${center.lon.toFixed(5)}&dist=${cfg.distNm}`, { cache: "no-store" });
            const j = await r.json();
            if (!j.ok) { console.warn("[adsb]", j.error); return; }
            const now = performance.now();
            const wl = window.worldLabels;
            for (const a of (j.aircraft || []).slice(0, cfg.maxPlanes)) {
                const p = planes.get(a.hex) || {};
                Object.assign(p, { lat: a.lat, lon: a.lon, altFt: a.altFt || 0, heading: a.heading || 0, speedKt: a.speedKt || 0, callsign: a.callsign, type: a.type || "", category: a.category || "", onGround: !!a.onGround, seen: now });
                planes.set(a.hex, p);
                const id = "adsb:" + a.hex, pos = llToWorld(p.lat, p.lon, p.altFt);
                if (wl) {
                    if (wl.labels && wl.labels.has(id)) wl.update(id, { pos, html: labelHtml(p) });
                    else wl.add(id, { pos, html: labelHtml(p), bg: "rgba(4,12,20,0.62)", border: "1px solid rgba(120,200,255,0.28)", fontSize: 10, hideBehindCamera: true });
                }
            }
            for (const [hex, p] of [...planes]) if (now - p.seen > cfg.pollMs * 2.5) { window.worldLabels?.remove?.("adsb:" + hex); planes.delete(hex); }
            window.kpop?.info?.("ADS-B", (j.count || planes.size) + " aircraft nearby");
        } catch (e) { console.warn("[adsb] poll failed:", e.message); }
    }

    // per-frame dead-reckoning keeps motion smooth between 12s polls (pos only)
    function frame(t) {
        if (!on) return;
        const dt = lastFrame ? Math.min(0.1, (t - lastFrame) / 1000) : 0; lastFrame = t;
        const wl = window.worldLabels;
        if (center && wl) for (const [hex, p] of planes) {
            if (!p.onGround && p.speedKt > 0 && dt > 0) {
                const d = p.speedKt * 0.514444 * dt, br = (p.heading || 0) * DEG;
                p.lat += (d * Math.cos(br)) / 111320;
                p.lon += (d * Math.sin(br)) / (111320 * Math.cos(p.lat * DEG));
            }
            const id = "adsb:" + hex;
            if (wl.labels && wl.labels.has(id)) wl.update(id, { pos: llToWorld(p.lat, p.lon, p.altFt) });
        }
        if (models3D && center && window.planeMesh && (t - lastMeshSync > 100)) {
            lastMeshSync = t;
            const list = [];
            for (const [hex, p] of planes) { const pos = llToWorld(p.lat, p.lon, p.altFt); list.push({ hex, x: pos[0], y: pos[1], z: pos[2], yaw: (p.heading || 0) * DEG, cls: classifyAircraft(p).cls }); }
            try { window.planeMesh.sync(list); } catch {}
        }
        raf = requestAnimationFrame(frame);
    }

    // v1444 — "allowed" flag (default ON) decoupled from running. Being allowed does
    // NOT auto-start on boot; aircraft only load when an app calls request() AND a
    // location is available (no unsolicited adsb.lol fetch / geolocation prompt).
    const lsBool = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v === "1"; } catch { return d; } };
    let allow = lsBool("voxelengine.adsb.allow", true);
    let models3D = lsBool("voxelengine.adsb.models3d", true);   // v1447 — show 3D plane meshes
    let lastMeshSync = 0;
    function setModels3D(v) { models3D = !!v; try { localStorage.setItem("voxelengine.adsb.models3d", models3D ? "1" : "0"); } catch {} if (!models3D) { try { window.planeMesh?.clear?.(); } catch {} } return status(); }
    function setAllow(v) { allow = !!v; try { localStorage.setItem("voxelengine.adsb.allow", allow ? "1" : "0"); } catch {} if (!allow) stop(); return status(); }
    async function request() { if (!allow) return status(); const c = center || await resolveCenter(); if (!c) return status(); return start(); }

    function start() {
        if (on) return status();
        on = true; center = null;
        poll(); pollTimer = setInterval(poll, cfg.pollMs);
        lastFrame = 0; raf = requestAnimationFrame(frame);
        console.log("[adsb] started — aircraft from adsb.lol via the bridge");
        return status();
    }
    function stop() {
        on = false;
        if (pollTimer) clearInterval(pollTimer); pollTimer = null;
        if (raf) cancelAnimationFrame(raf); raf = null;
        for (const [hex] of planes) window.worldLabels?.remove?.("adsb:" + hex);
        try { window.planeMesh?.clear?.(); } catch {}
        planes.clear();
        return status();
    }
    function config(c = {}) { Object.assign(cfg, c); return { ok: true, cfg }; }
    function recenter() { center = null; return status(); }
    // v1445 — current aircraft list for the shared radar scope (read by window.radar).
    function planesList() { const out = []; for (const [hex, p] of planes) { const k = classifyAircraft(p); out.push({ hex, lat: p.lat, lon: p.lon, altFt: p.altFt, heading: p.heading, callsign: p.callsign, type: p.type || "", category: p.category || "", onGround: !!p.onGround, cls: k.cls, glyph: k.glyph, color: k.color }); } return out; }
    function status() { return { ok: true, on, allow, models3D, planes: planes.size, center: center, cfg, ctr: center }; }

    window.adsb = { start, stop, config, recenter, status, request, setAllow, setModels3D, planes: planesList };
    console.log("[adsb] window.adsb.start() / .stop() / .config({distNm,voxPerKm,voxPer1000ft,baseY}) — live aircraft over the world");
}
