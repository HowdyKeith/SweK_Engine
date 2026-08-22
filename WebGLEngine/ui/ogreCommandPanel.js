// ui/ogreCommandPanel.js — v1486
// The OGRE crew's fused sensor view: a human-commander panel that stitches the per-seat
// published state (the sensor-gated, enemy-trust-filtered view from mpOgre) into one
// top-down "surround view" of the battlefield — like a BMW's camera-fused 3D view, but
// built from the OGRE's own sensors. You only see as far as the sensors reach (the fog
// ring), and sections fed by an enemy-held seat read COMPROMISED.
//
// Pick a seat (Commander / Driver / Gunner main|under / Engineer) and the view reshapes
// to that station. Click open ground to steer (driver), click a contact to designate
// fire (gunner), use the engineer row to direct the nanite swarm. Talks to the relay via
// the global window.ogreCommander (seat/steer/fire/repair) + polls /mp/ogre/state.

let _panelEl = null, _poll = null, _canvas = null, _ctx = null;
let _room = "main", _seat = "commander", _lastState = null, _blits = [];

function _cmdr() { return (typeof window !== "undefined") ? window.ogreCommander : null; }
function _token() { const c = _cmdr(); return c && c.status ? (c.status().token || "") : ""; }

// world (x,z) <-> screen (px,py), OGRE-centered, scaled so the sensor ring fits.
function _proj(state) {
    const W = _canvas.width, H = _canvas.height;
    const cx = W / 2, cy = H / 2;
    const range = (state && state.sensors && state.sensors.range) || 120;
    const ppu = (Math.min(W, H) / 2 * 0.86) / Math.max(20, range);
    const ox = (state && state.ogre && state.ogre.x) || 0;
    const oz = (state && state.ogre && state.ogre.z) || 0;
    return {
        cx, cy, ppu, range,
        toS: (wx, wz) => [cx + (wx - ox) * ppu, cy + (wz - oz) * ppu],
        toW: (sx, sy) => [ox + (sx - cx) / ppu, oz + (sy - cy) / ppu],
    };
}

function _draw() {
    if (!_ctx) return;
    const st = _lastState || {};
    const W = _canvas.width, H = _canvas.height;
    _ctx.clearRect(0, 0, W, H);
    // unknown space beyond sensors
    _ctx.fillStyle = "#05080c"; _ctx.fillRect(0, 0, W, H);
    const p = _proj(st);
    // sensed area (inside the sensor ring) is lit
    _ctx.save();
    _ctx.beginPath(); _ctx.arc(p.cx, p.cy, p.range * p.ppu, 0, Math.PI * 2); _ctx.clip();
    _ctx.fillStyle = "#0a131c"; _ctx.fillRect(0, 0, W, H);
    // range grid rings
    _ctx.strokeStyle = "#16283a"; _ctx.lineWidth = 1;
    for (let r = 0.25; r <= 1.001; r += 0.25) { _ctx.beginPath(); _ctx.arc(p.cx, p.cy, p.range * p.ppu * r, 0, Math.PI * 2); _ctx.stroke(); }
    _ctx.restore();
    // sensor ring (the fog boundary)
    _ctx.strokeStyle = "#2f6f9e"; _ctx.lineWidth = 1.5;
    _ctx.beginPath(); _ctx.arc(p.cx, p.cy, p.range * p.ppu, 0, Math.PI * 2); _ctx.stroke();

    // HQ (nav section — present only if the driver feed is shared)
    if (st.hq) {
        const [hx, hy] = p.toS(st.hq.x, st.hq.z);
        _ctx.fillStyle = "#e6b94f"; _ctx.beginPath(); _ctx.moveTo(hx, hy - 7); _ctx.lineTo(hx + 6, hy + 5); _ctx.lineTo(hx - 6, hy + 5); _ctx.closePath(); _ctx.fill();
        _ctx.fillStyle = "#caa23f"; _ctx.font = "9px system-ui"; _ctx.fillText("HQ", hx + 8, hy + 4);
    }
    // commander steer marker
    if (st.commanded && st.hq) { /* heading drawn via OGRE arrow below */ }

    // defender contacts (targets section — present only if a gunner feed is shared)
    _blits = [];
    const fired = st.firing;
    for (const d of (st.defendersList || [])) {
        const [sx, sy] = p.toS(d.x, d.z);
        const hpFrac = d.hp != null ? Math.max(0.1, Math.min(1, d.hp / 100)) : 1;
        const designated = (fired != null && d.id === fired);
        _ctx.fillStyle = designated ? "#ff5d5d" : "#ff9b6b";
        _ctx.beginPath(); _ctx.arc(sx, sy, designated ? 5.5 : 4, 0, Math.PI * 2); _ctx.fill();
        if (designated) { _ctx.strokeStyle = "#ff5d5d"; _ctx.lineWidth = 1; _ctx.beginPath(); _ctx.arc(sx, sy, 9, 0, Math.PI * 2); _ctx.stroke(); }
        // tiny hp pip
        _ctx.fillStyle = "rgba(255,255,255," + (0.25 + hpFrac * 0.5) + ")"; _ctx.fillRect(sx - 5, sy + 6, 10 * hpFrac, 1.5);
        _blits.push({ x: sx, y: sy, id: d.id });
    }

    // the OGRE at center + heading toward its current target
    let ha = 0;
    if (st.commanded && st.hq && st.ogre) ha = Math.atan2(st.hq.x - st.ogre.x, st.hq.z - st.ogre.z);
    else if (st.hq && st.ogre) ha = Math.atan2(st.hq.x - st.ogre.x, st.hq.z - st.ogre.z);
    _ctx.save(); _ctx.translate(p.cx, p.cy); _ctx.rotate(ha);
    _ctx.fillStyle = "#6fe0a0"; _ctx.fillRect(-6, -6, 12, 12);
    _ctx.fillStyle = "#bfffe0"; _ctx.beginPath(); _ctx.moveTo(0, -11); _ctx.lineTo(4, -5); _ctx.lineTo(-4, -5); _ctx.closePath(); _ctx.fill();
    _ctx.restore();
}

function _esc(s) { return String(s == null ? "" : s).replace(/[<>&]/g, ""); }

function _renderStatus(statusEl, st, withheld, seats) {
    const bar = (label, frac, col) => "<div style='display:flex;align-items:center;gap:6px;margin:2px 0;'><span style='width:54px;color:#8aa;font-size:10px'>" + label + "</span><span style='flex:1;height:7px;background:#11202c;border-radius:4px;overflow:hidden;display:inline-block'><span style='display:block;height:100%;width:" + Math.round(Math.max(0, Math.min(1, frac)) * 100) + "%;background:" + col + "'></span></span></div>";
    let h = "";
    if (st.sensors) h += bar("Sensors", st.sensors.hp / (st.sensors.maxHp || 100), "#2f9ee0") ;
    if (st.nanites) h += bar("Nanites", st.nanites.pool / (st.nanites.max || 100), "#9b6bff") + "<div style='font-size:9px;color:#778;margin:-2px 0 2px 60px'>mode: " + _esc(st.nanites.mode) + "</div>";
    if (st.ammo) h += "<div style='font-size:10px;color:#9aa;margin:2px 0'>Shells " + (st.ammo.shells | 0) + " &nbsp; Fuel " + (st.ammo.fuel | 0) + "</div>";
    // crew strip
    const seatList = seats || {};
    let crew = "";
    for (const k of Object.keys(seatList)) { const en = seatList[k] === "enemy"; crew += "<span style='font-size:9px;padding:1px 5px;border-radius:8px;margin:1px;display:inline-block;background:" + (en ? "#3a1414" : "#13301f") + ";color:" + (en ? "#ff8a8a" : "#8fe0a8") + ";border:1px solid " + (en ? "#5a1e1e" : "#1e4a2e") + "'>" + _esc(k) + (en ? " \u2620" : "") + "</span>"; }
    if (crew) h += "<div style='margin-top:4px'>" + crew + "</div>";
    if (withheld && withheld.length) h += "<div style='margin-top:4px;color:#ff7676;font-size:10px;font-weight:600'>\u26A0 FEED COMPROMISED: " + withheld.map(_esc).join(", ") + "</div>";
    if (!st.sensors && !st.hq && !st.defendersList) h += "<div style='color:#778;font-size:10px'>no feed — host this room or wait for state</div>";
    statusEl.innerHTML = h;
}

async function _tick(statusEl) {
    let st = null, withheld = null, seats = null;
    try {
        const r = await fetch("/mp/ogre/state?room=" + encodeURIComponent(_room) + "&token=" + encodeURIComponent(_token())).then(x => x.json());
        if (r && r.ok) { st = r.state || {}; withheld = r.withheld || []; seats = r.seats || {}; }
    } catch {}
    _lastState = st || {};
    _draw();
    _renderStatus(statusEl, _lastState, withheld, seats);
}

export function openOgreCommandPanel() {
    if (_panelEl) { try { _panelEl.remove(); } catch {} _panelEl = null; if (_poll) { clearInterval(_poll); _poll = null; } return; }
    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;top:0;right:0;width:392px;max-width:96vw;height:100vh;z-index:430;background:linear-gradient(180deg,#070b10,#0b1119);border-left:1px solid #1e2c3a;box-shadow:-8px 0 30px rgba(0,0,0,.55);display:flex;flex-direction:column;font:12px system-ui,sans-serif;color:#dde6f2;";
    const hdr = document.createElement("div"); hdr.style.cssText = "padding:9px 13px;border-bottom:1px solid #1c2734;display:flex;justify-content:space-between;align-items:center;";
    hdr.innerHTML = "<b>\uD83D\uDEF0 OGRE Fused Sensor View</b>";
    const x = document.createElement("button"); x.textContent = "\u00d7"; x.style.cssText = "background:#1a2330;color:#cde;border:1px solid #2a3a4a;border-radius:5px;width:24px;height:24px;cursor:pointer;"; x.onclick = openOgreCommandPanel; hdr.appendChild(x);

    // room + seat row
    const ctrl = document.createElement("div"); ctrl.style.cssText = "padding:7px 13px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;border-bottom:1px solid #14202c;";
    const roomIn = document.createElement("input"); roomIn.value = _room; roomIn.style.cssText = "width:64px;background:#0a0e14;color:#cde;border:1px solid #2a3a4a;border-radius:5px;padding:3px 5px;font-size:11px;"; roomIn.onchange = () => { _room = roomIn.value || "main"; };
    ctrl.appendChild(roomIn);
    const seatBtn = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.style.cssText = "background:#16202c;color:#bcd;border:1px solid #25384a;border-radius:5px;padding:3px 7px;font-size:11px;cursor:pointer;"; b.onclick = () => { const c = _cmdr(); if (!c) { alert("Start an OGRE scenario first (window.ogreCommander)"); return; } _seat = label; fn(c); for (const s of ctrl.querySelectorAll("button")) s.style.borderColor = "#25384a"; b.style.borderColor = "#3f86c0"; }; ctrl.appendChild(b); return b; };
    seatBtn("Commander", c => c.command(_room));
    seatBtn("Driver", c => c.driver(_room));
    seatBtn("Gun:main", c => c.gunner(_room, "main"));
    seatBtn("Gun:under", c => c.gunner(_room, "under"));
    seatBtn("Engineer", c => c.engineer(_room));

    // canvas
    const cwrap = document.createElement("div"); cwrap.style.cssText = "padding:8px 13px;";
    _canvas = document.createElement("canvas"); _canvas.width = 362; _canvas.height = 362; _canvas.style.cssText = "width:100%;border-radius:8px;border:1px solid #1c2a38;display:block;cursor:crosshair;background:#05080c;";
    _ctx = _canvas.getContext("2d");
    cwrap.appendChild(_canvas);
    const hint = document.createElement("div"); hint.style.cssText = "font-size:9px;color:#5f7a92;margin-top:3px;"; hint.textContent = "click open ground = steer (driver) \u00b7 click a contact = designate fire (gunner)";
    cwrap.appendChild(hint);

    _canvas.onclick = (ev) => {
        const c = _cmdr(); if (!c) return;
        const rect = _canvas.getBoundingClientRect();
        const px = (ev.clientX - rect.left) * (_canvas.width / rect.width);
        const py = (ev.clientY - rect.top) * (_canvas.height / rect.height);
        // hit-test a contact first (gunner designate)
        for (const b of _blits) { if ((px - b.x) * (px - b.x) + (py - b.y) * (py - b.y) <= 100) { c.fire(b.id); return; } }
        // else steer to the clicked world point (driver)
        const p = _proj(_lastState || {});
        const [wx, wz] = p.toW(px, py);
        c.steer(wx, wz);
    };

    // engineer + auto row
    const eng = document.createElement("div"); eng.style.cssText = "padding:0 13px 8px;display:flex;flex-wrap:wrap;gap:4px;";
    const ebtn = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.style.cssText = "background:#16202c;color:#bcd;border:1px solid #25384a;border-radius:5px;padding:3px 7px;font-size:11px;cursor:pointer;"; b.onclick = () => { const c = _cmdr(); if (c) fn(c); }; eng.appendChild(b); };
    ebtn("Repair", c => c.repair("auto"));
    ebtn("\u2192Shells", c => c.convert("shells"));
    ebtn("\u2192Fuel", c => c.convert("fuel"));
    ebtn("Stop", c => c.repairStop());
    ebtn("Revive", c => c.revive());
    ebtn("Auto seat", c => c.auto(_seat === "Commander" ? "commander" : _seat === "Driver" ? "driver" : _seat.startsWith("Gun") ? "gunner" : _seat === "Engineer" ? "engineer" : "commander"));
    ebtn("Auto off", c => c.auto(false));

    // status
    const status = document.createElement("div"); status.style.cssText = "padding:6px 13px 14px;overflow:auto;flex:1 1 auto;border-top:1px solid #14202c;";

    ov.append(hdr, ctrl, cwrap, eng, status);
    document.body.appendChild(ov);
    _panelEl = ov;
    _tick(status);
    _poll = setInterval(() => _tick(status), 500);
}

if (typeof window !== "undefined") window.ogreCommandPanel = openOgreCommandPanel;
