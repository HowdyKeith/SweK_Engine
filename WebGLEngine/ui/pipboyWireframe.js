// ui/pipboyWireframe.js — v1694
// Our own procedural WIREFRAME Pip-Boy: the default "no model picked" stand-in, switchable back to from the picker.
// A real working unit so we are never staring at an empty stage and the screen/light/radar feeds are proven live.
//
//   import { createPipboyWireframe } from "/ui/pipboyWireframe.js";
//   const pip = createPipboyWireframe(THREE);   scene.add(pip.group);  ... loop: pip.update(dt);
//
// MAIN screen now CYCLES Pip-Boy-style pages while the unit rotates: STATS (animated vault-figure + live CPU/RAM/GPU),
// INV, MAP (live peer dots), DATA. RADAR reuses the shared window.peerRadar (same blips/modes), CYCLES through its
// modes (Computers -> Game assets -> Aircraft), and draws LIVE expanding ping rings on every real "swek:ping". The
// stick figure does a small set of avatar moves. The 3 left lights can be blinked, recoloured, or driven by a solar
// battery level. A wireframe forearm SLEEVE + ARM run through the unit (worn on the arm).
//
// API: { group, update(dt), setLight(i,state), blink(i,color,ms), setLightColor(i,hex), setBattery(pct),
//        setScreen1(fn), setScreen1Texture(tex|null), setScreen2(fn), setMainPage(i), ping(), dispose, canvases, lights }

export function createPipboyWireframe(THREE, opts = {}) {
    const GREEN = 0x37e07a, DIM = 0x1c5a30, SCREEN_BG = "#04140b", INK = "#6effa0";
    const group = new THREE.Group(); group.name = "swek-pipboy-wireframe";
    const _disposables = [];

    function wireBox(w, h, d, color = GREEN) {
        const geo = new THREE.BoxGeometry(w, h, d), edges = new THREE.EdgesGeometry(geo);
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
        const seg = new THREE.LineSegments(edges, mat); _disposables.push(geo, edges, mat); return seg;
    }
    function wireCyl(r, len, color, radSegs = 14, hSegs = 3, op = 0.5) {
        const g = new THREE.CylinderGeometry(r, r, len, radSegs, hSegs, true), w = new THREE.WireframeGeometry(g);
        const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: op });
        const seg = new THREE.LineSegments(w, m); _disposables.push(g, w, m); return seg;
    }
    function screenPlane(w, h, cv) {
        const tex = new THREE.CanvasTexture(cv); if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        _disposables.push(tex, mat, mesh.geometry); return { mesh, tex };
    }
    function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

    // ---- body + bezels + knob ----
    group.add(wireBox(2.0, 1.4, 0.72));
    const bezel = wireBox(1.18, 1.0, 0.10); bezel.position.set(-0.30, 0.05, 0.34); group.add(bezel);
    const radarBezel = wireBox(0.66, 0.66, 0.10); radarBezel.position.set(0.60, 0.18, 0.34); group.add(radarBezel);
    const sideHousing = wireBox(0.46, 0.36, 0.10); sideHousing.position.set(0.60, -0.40, 0.34); group.add(sideHousing);
    const knobGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.12, 18);
    const knobMat = new THREE.LineBasicMaterial({ color: DIM, transparent: true, opacity: 0.85 });
    const knob = new THREE.LineSegments(new THREE.EdgesGeometry(knobGeo), knobMat);
    knob.rotation.x = Math.PI / 2; knob.position.set(-0.78, -0.50, 0.34); group.add(knob);
    _disposables.push(knobGeo, knobMat, knob.geometry);

    // ---- forearm sleeve + arm (the Pip-Boy is worn on the arm; a wireframe arm pokes through a tube) ----
    // v1839 — tube moved behind the body (z=-0.50) and enlarged: radius 0.46 -> 0.66 so the top of the
    // sleeve reaches ~the top indicator light (y=+0.30). Center raised to y=-0.38 so the bottom stays put
    // (bottom = -0.38 - 0.66 = -1.04, unchanged) while the top rises to -0.38 + 0.66 = +0.28. Arm bore
    // grown to match (0.30 -> 0.44) so it still fills the wider sleeve.
    const sleeve = wireCyl(0.66, 2.1, GREEN, 18, 2, 0.45); sleeve.rotation.z = Math.PI / 2; sleeve.position.set(0, -0.38, -0.50); group.add(sleeve);
    const arm = wireCyl(0.44, 3.4, DIM, 14, 4, 0.5); arm.rotation.z = Math.PI / 2; arm.position.set(0, -0.38, -0.50); group.add(arm);

    // ---- screens ----
    const mainCv = canvas(512, 432), mainCtx = mainCv.getContext("2d");
    const radarCv = canvas(320, 320), radarCtx = radarCv.getContext("2d");
    const cv2 = canvas(256, 192), ctx2 = cv2.getContext("2d");
    const mainScreen = screenPlane(1.06, 0.9, mainCv); mainScreen.mesh.position.set(-0.30, 0.05, 0.40); group.add(mainScreen.mesh);
    const radarScreen = screenPlane(0.58, 0.58, radarCv); radarScreen.mesh.position.set(0.60, 0.18, 0.40); group.add(radarScreen.mesh);
    const screen2 = screenPlane(0.40, 0.30, cv2); screen2.mesh.position.set(0.60, -0.40, 0.40); group.add(screen2.mesh);

    // ---- 3 left indicator lights ----
    const LIGHT_COLORS = { off: 0x123322, green: 0x37ff8a, amber: 0xffc04e, red: 0xff5a5a };
    let _batteryPct = null, _batteryTint = null;
    const lights = [];
    for (let i = 0; i < 3; i++) {
        const g = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), m = new THREE.MeshBasicMaterial({ color: LIGHT_COLORS.green });
        const puck = new THREE.Mesh(g, m); puck.rotation.x = Math.PI / 2; puck.position.set(-0.92, 0.30 - i * 0.27, 0.40);
        group.add(puck); _disposables.push(g, m);
        lights.push({ mesh: puck, mat: m, base: "green", hex: null, blinkUntil: 0, blinkHex: 0xffffff });
    }
    function _hexOf(state) { return LIGHT_COLORS[state] != null ? LIGHT_COLORS[state] : LIGHT_COLORS.green; }
    function setLight(i, state) { const L = lights[i]; if (!L) return; L.base = state; L.hex = null; }
    function setLightColor(i, hex) { const L = lights[i]; if (!L) return; L.hex = hex; }                 // arbitrary colour (e.g. solar battery)
    function blink(i, color, ms) { const L = lights[i]; if (!L) return; L.blinkHex = (color != null ? color : 0xffffff); L.blinkUntil = (typeof performance !== "undefined" ? performance.now() : Date.now()) + (ms || 700); }
    function setBattery(pct) {   // colour the bottom light by a battery level (solar): green > amber > red; also tints the radar
        const L = lights[2]; if (!L) return; const p = Math.max(0, Math.min(100, pct | 0));
        _batteryPct = p; const hx = p > 50 ? 0x37ff8a : (p > 20 ? 0xffc04e : 0xff5a5a);
        L.hex = hx; _batteryTint = "#" + hx.toString(16).padStart(6, "0");
    }

    // ---- shared radar (same data + modes as the STATUS scope) + live ping rings ----
    // v3237 -- *** THIS DREW FROM A RADAR IT HAD JUST SWITCHED OFF. ***
    // installPeerRadar() is a SINGLETON, so the line below takes the SHARED radar -- the same one the main
    // render window fills with planes and peers. It then called .hide() to keep the overlay off the Pip-Boy
    // scene, and hide() stops the poll timer AND cancels the rAF as well as hiding the element. Blips stopped
    // updating for EVERYBODY, while this canvas kept animating its sweep and range rings over a field that could
    // never change: AN EMPTY RADAR AND A STOPPED RADAR RENDER IDENTICALLY, which is exactly why the header above
    // could keep promising live blips and be wrong the whole time.
    //
    // hideChrome() hides the element and leaves the work running. THE FALLBACK TO hide() IS DELIBERATE: an older
    // peerRadar without hideChrome should still get its overlay hidden rather than throwing, and the readout
    // below NAMES a stopped radar instead of drawing an empty one.
    let _radar = (typeof window !== "undefined" && window.peerRadar) || null;
    if (!_radar) { try { import("./peerRadar.js").then(m => { try { _radar = m.installPeerRadar(); if (_radar && _radar.hideChrome) _radar.hideChrome(); else if (_radar && _radar.hide) _radar.hide(); } catch {} }).catch(() => {}); } catch {} }
    let _scanT = 0, _modeT = 0, _pings = [], _figMove = "idle", _figMoveUntil = 0;
    const MODES = ["network", "assets", "planes"];
    const _now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    try {
        // a real ping radiates a ring here (synced with the main radar) AND blinks the top light
        window.addEventListener("swek:ping", () => { _pings.push(_now()); if (_pings.length > 24) _pings.shift(); try { blink(0, 0x37ff8a, 280); } catch (e) {} });
        // the SweK robot's move drives BOTH the stick figure and a light blink (demo chrome on events)
        window.addEventListener("swek:move", (e) => {
            const mv = (e && e.detail && e.detail.move) || "idle";
            const dur = mv === "dance" ? 4200 : mv === "cheer" ? 3200 : mv === "error" ? 1200 : 2000;
            _figMove = mv; _figMoveUntil = _now() + dur;
            if (mv === "wave") blink(1, 0x37ff8a, 700);
            else if (mv === "cheer") { blink(0, 0x37ff8a, 900); blink(1, 0x37ff8a, 900); blink(2, 0x37ff8a, 900); }
            else if (mv === "nod") blink(1, 0xffc04e, 500);
            else if (mv === "dance") { blink(0, 0x37ff8a, 1400); blink(2, 0x6effa0, 1400); }
            else if (mv === "error") blink(2, 0xff5a5a, 1200);
        });
        // on pages that carry the engine toast / civ buses, blink the lights on those events too
        if (window.toast && window.toast.subscribe) window.toast.subscribe(function (text, kind) { try { if (kind === "error") blink(2, 0xff5a5a, 900); else if (kind === "success") { blink(0, 0x37ff8a, 700); blink(1, 0x37ff8a, 700); } else blink(1, 0x37ff8a, 500); } catch (e) {} });
        if (window.civEvents && window.civEvents.subscribe) window.civEvents.subscribe(function (evt) { try { if (!evt || !evt.type) return; if (evt.type === "kaiju_death") { blink(0, 0x37ff8a, 700); blink(1, 0x37ff8a, 700); } else if (evt.type === "model_placed") blink(1, 0xffc04e, 500); } catch (e) {} });
    } catch {}
    function pumpRadar(now) {
        try { if (_radar && _radar.scan && now - _scanT > 4000) { _scanT = now; _radar.scan(); } } catch {}
        if (opts.cycleRadarModes !== false && _radar && _radar.setMode && now - _modeT > 12000) {   // show all modes in turn
            _modeT = now; try { const cur = (_radar.mode && _radar.mode()) || "network"; _radar.setMode(MODES[(MODES.indexOf(cur) + 1) % MODES.length]); } catch {}
        }
    }

    // ---- stats poll + computer name ----
    let _stats = { cpu: 0, ram: 0, gpu: 0 }, _statT = 0, _name = "SWEK", _solarT = 0;
    function pollStats(now) {
        if (now - _statT < 2500) return; _statT = now;
        try { fetch("/system/stats", { cache: "no-store" }).then(r => r.json()).then(j => { if (!j) return;
            _stats.cpu = (j.cpu && Number.isFinite(j.cpu.utilPct)) ? Math.round(j.cpu.utilPct) : 0;
            _stats.ram = (j.mem && Number.isFinite(j.mem.usedPct)) ? Math.round(j.mem.usedPct) : 0;
            _stats.gpu = (j.gpu && Number.isFinite(j.gpu.utilPct)) ? Math.round(j.gpu.utilPct) : null;
        }).catch(() => {}); } catch {}
    }
    function pollSolar(now) {   // the REAL HA/solar sensor (haSolar.js -> GET /ha/solar -> roles.battery.state %)
        if (now - _solarT < 10000) return; _solarT = now;
        try { fetch("/ha/solar", { cache: "no-store" }).then(r => r.json()).then(sj => {
            if (sj && sj.available && sj.roles && sj.roles.battery) { const p = parseFloat(sj.roles.battery.state); if (Number.isFinite(p)) setBattery(p); }
        }).catch(() => {}); } catch {}
    }
    try { fetch("/self/whoami", { cache: "no-store" }).then(r => r.json()).then(j => { if (j && j.name) _name = String(j.name).toUpperCase(); }).catch(() => {}); } catch {}

    // ---- main-screen pages (cycle while rotating) ----
    let _custom1 = opts.drawMain || null, _custom2 = opts.draw2nd || null;
    // v3240 -- *** SCREEN 1 CAN TAKE A LIVE TEXTURE, NOT JUST A 2D DRAW CALLBACK. ***
    // setScreen1(fn) hands out a 2D context, which is the right shape for a readout and the wrong one for a 3D
    // rig: face/wireframeHead.js composes THREE objects, and neither it nor thead.html can draw into a 2D ctx.
    // The proper answer in three.js is RENDER TO TEXTURE -- and the renderer belongs to the HOST, not to this
    // module, so the host renders the rig into a WebGLRenderTarget and hands the texture here.
    //
    // THE CANVAS TEXTURE IS KEPT, NOT DISPOSED. Passing null restores the pages that were there -- STATS, INV,
    // MAP, DATA -- because a screen that could only be handed away once would make this a one-way door, and the
    // canvas path is still what every other consumer uses.
    //
    // *** THE 2D PAINT IS SKIPPED WHILE A TEXTURE IS MOUNTED. *** Repainting a canvas nobody samples is work
    // that produces nothing, and worse, it would leave the old page half-drawn underneath -- so a reader
    // wondering why STATS looks frozen would be looking at a canvas that IS frozen for a reason.
    let _screen1Tex = null, _texParked = null;
    function setScreen1Texture(tex) {
        _screen1Tex = tex || null;
        mainScreen.mesh.material.map = _screen1Tex || mainScreen.tex;
        mainScreen.mesh.material.needsUpdate = true;
        return !!_screen1Tex;
    }
    function setScreen1(fn) { _custom1 = fn; }
    function setScreen2(fn) { _custom2 = fn; }
    // v3241 -- BRAIN joins the cycle. Keith asked for "a GPU brain live view in a pip boy screen, but in green
    // view" -- and GREEN IS NOT A THEME APPLIED HERE, IT IS THE PALETTE THIS UNIT ALREADY DRAWS IN: the same INK
    // and SCREEN_BG every other page uses. A page that reached for its own colours would be the second copy of
    // the palette, which is this session's most repeated defect in a smaller costume.
    const PAGES = ["STATS", "INV", "MAP", "DATA", "BRAIN"];
    let _page = 0, _pageT = 0;
    function setMainPage(i) { _page = ((i | 0) % PAGES.length + PAGES.length) % PAGES.length; }

    function frame(ctx, W, H, title) {
        ctx.fillStyle = SCREEN_BG; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = "rgba(60,220,140,0.25)"; ctx.lineWidth = 2; ctx.strokeRect(8, 8, W - 16, H - 16);
        // tab strip
        ctx.font = "bold 17px ui-monospace,monospace"; ctx.textAlign = "left"; let tx = 26;
        for (const p of PAGES) { ctx.fillStyle = (p === title) ? INK : "rgba(60,220,140,0.32)"; ctx.fillText(p, tx, 40); tx += ctx.measureText(p).width + 22; }
        ctx.font = "16px ui-monospace,monospace"; ctx.textAlign = "right"; ctx.fillStyle = "rgba(110,255,160,0.8)";
        ctx.fillText(_name + "  " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), W - 26, 40);
        ctx.strokeStyle = "rgba(60,220,140,0.4)"; ctx.beginPath(); ctx.moveTo(20, 52); ctx.lineTo(W - 20, 52); ctx.stroke();
    }
    function stickFigure(ctx, fx, fy, t) {
        // mirror the SweK robot's CURRENT move (set by the "swek:move" event); fall back to idle when none is active
        const move = (_now() < _figMoveUntil) ? _figMove : "idle", ph = t * 4;
        const headDy = (move === "nod") ? Math.abs(Math.sin(ph * 1.4)) * 9 : 0;
        let lA, rA, lL = -30, rL = 30;
        if (move === "wave") { rA = [46, -54 + Math.sin(ph) * 16]; lA = [-44, 6]; }
        else if (move === "cheer") { rA = [40, -60]; lA = [-40, -60]; }
        else if (move === "dance") { rA = [40 + Math.sin(ph) * 8, -18 + Math.sin(ph) * 30]; lA = [-40 - Math.sin(ph) * 8, -18 - Math.sin(ph) * 30]; lL = -30 + Math.sin(ph) * 16; rL = 30 - Math.sin(ph) * 16; }
        else if (move === "error") { const j = Math.sin(ph * 3) * 6; rA = [44 + j, 6]; lA = [-44 + j, 6]; }
        else { rA = [44, 6]; lA = [-44, 6]; }                                                      // idle / nod
        ctx.strokeStyle = INK; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(fx, fy - 46 + headDy, 26, 0, Math.PI * 2); ctx.stroke();          // head
        ctx.beginPath();
        ctx.moveTo(fx, fy - 20); ctx.lineTo(fx, fy + 44);                                          // torso
        ctx.moveTo(fx, fy - 6); ctx.lineTo(fx + lA[0], fy + lA[1]);                                 // L arm
        ctx.moveTo(fx, fy - 6); ctx.lineTo(fx + rA[0], fy + rA[1]);                                 // R arm
        ctx.moveTo(fx, fy + 44); ctx.lineTo(fx + lL, fy + 100);                                     // L leg
        ctx.moveTo(fx, fy + 44); ctx.lineTo(fx + rL, fy + 100);                                     // R leg
        ctx.stroke();
    }
    function pageStats(ctx, W, H, t) {
        frame(ctx, W, H, "STATS");
        ctx.fillStyle = INK; ctx.font = "18px ui-monospace,monospace"; ctx.textAlign = "left";
        ctx.fillText("HP 25/100", 26, 84);
        stickFigure(ctx, W * 0.27, 210, t);
        const bars = [["CPU", _stats.cpu, "#ffb14e"], ["RAM", _stats.ram, "#37ff8a"], ["GPU", _stats.gpu == null ? 0 : _stats.gpu, "#b69bff"]];
        let by = 150; const bx = W * 0.52, bw = W * 0.40;
        for (const [lab, val, col] of bars) {
            ctx.fillStyle = INK; ctx.font = "18px ui-monospace,monospace"; ctx.textAlign = "left"; ctx.fillText(lab, bx, by - 6);
            ctx.strokeStyle = "rgba(60,220,140,0.4)"; ctx.strokeRect(bx, by, bw, 16);
            ctx.fillStyle = col; ctx.fillRect(bx + 1, by + 1, Math.max(0, Math.min(1, val / 100)) * (bw - 2), 14);
            ctx.fillStyle = INK; ctx.textAlign = "right"; ctx.fillText((val | 0) + "%", bx + bw, by - 6); by += 48;
        }
        ctx.fillStyle = "rgba(110,255,160,0.85)"; ctx.font = "bold 22px ui-monospace,monospace"; ctx.textAlign = "center";
        ctx.fillText("SweK \u00b7 Wireframe Pip-Boy", W / 2, H - 26);
    }
    function pageInv(ctx, W, H) {
        frame(ctx, W, H, "INV");
        const items = [["RadAway", "x3"], ["Stimpak", "x5"], ["SweK Engine", "v" + (window.ENGINE_VERSION || "")], ["Nuka-Cola", "x12"], ["Bobblehead", "x1"], ["Fusion Core", "x2"]];
        ctx.font = "20px ui-monospace,monospace"; let y = 96;
        for (let i = 0; i < items.length; i++) { const sel = i === (Math.floor(performance.now() / 1400) % items.length);
            ctx.fillStyle = sel ? INK : "rgba(110,255,160,0.5)"; ctx.textAlign = "left"; ctx.fillText((sel ? "> " : "  ") + items[i][0], 30, y);
            ctx.textAlign = "right"; ctx.fillText(items[i][1], W - 30, y); y += 42; }
    }
    function pageMap(ctx, W, H) {
        frame(ctx, W, H, "MAP");
        ctx.strokeStyle = "rgba(60,220,140,0.25)"; ctx.lineWidth = 1;
        for (let gx = 40; gx < W - 20; gx += 56) { ctx.beginPath(); ctx.moveTo(gx, 62); ctx.lineTo(gx, H - 30); ctx.stroke(); }
        for (let gy = 70; gy < H - 20; gy += 56) { ctx.beginPath(); ctx.moveTo(24, gy); ctx.lineTo(W - 20, gy); ctx.stroke(); }
        const cx = W / 2, cy = H / 2 + 20;
        try { const blips = _radar && _radar._blips, kinds = (_radar && _radar._kinds) || {};
            if (blips) for (const b of blips.values()) { if ((b.alpha || 0) <= 0.05) continue; const k = kinds[b.kind] || {};
                const rr = Math.min(b.ring || 0.6, 0.9) * (Math.min(W, H) * 0.40);
                ctx.fillStyle = k.color || "#2bd6ff"; ctx.beginPath(); ctx.arc(cx + Math.cos(b.angle) * rr, cy + Math.sin(b.angle) * rr, 5, 0, Math.PI * 2); ctx.fill(); } } catch {}
        ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx - 7, cy + 7); ctx.lineTo(cx + 7, cy + 7); ctx.closePath(); ctx.fill();   // you
        ctx.font = "16px ui-monospace,monospace"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(110,255,160,0.8)"; ctx.fillText("YOU ARE HERE", cx, H - 22);
    }
    function pageData(ctx, W, H) {
        frame(ctx, W, H, "DATA");
        let peers = 0; try { peers = [..._radar._blips.values()].filter(b => b.kind === "peer" && b.live).length; } catch {}
        const rows = ["UNIT . . . . . " + _name, "BUILD . . . . v" + (window.ENGINE_VERSION || "?"), "CPU . . . . . " + _stats.cpu + "%", "RAM . . . . . " + _stats.ram + "%", "SOLAR . . . . " + (_batteryPct == null ? "--" : _batteryPct + "%"), "PEERS . . . . " + peers];
        ctx.font = "20px ui-monospace,monospace"; ctx.textAlign = "left"; let y = 100;
        for (const r of rows) { ctx.fillStyle = "rgba(110,255,160,0.85)"; ctx.fillText(r, 30, y); y += 44; }
    }
    // ---- GPU brain, live ----
    // POLLED AT THE SAME 2.5s CADENCE AS THE STATS PAGE, from /ai/brain/health -- the endpoint server.html's own
    // GPU Brain panel uses, so the Pip-Boy and the panel cannot disagree about what the brain is doing. Reading
    // the mind page instead would have meant a second interpretation of the same facts.
    //
    // *** A FAILED FETCH IS NOT AN IDLE BRAIN, AND THE SCREEN SAYS WHICH. *** _brain stays null until an answer
    // arrives; null draws "NO BRIDGE", a live answer draws the state. Rendering a hopeful "IDLE" over a server
    // that never replied is the empty-radar mistake this unit already made once (v3237).
    let _brain = null, _brainT = 0, _brainErr = "";
    function pollBrain(now) {
        if (now - _brainT < 2500) return; _brainT = now;
        try {
            fetch("/ai/brain/health", { cache: "no-store" })
                .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
                .then((j) => { _brain = j && j.ok ? j : null; _brainErr = (j && !j.ok) ? "refused" : ""; })
                .catch((e) => { _brain = null; _brainErr = String((e && e.message) || e).slice(0, 24); });
        } catch (e) { _brain = null; _brainErr = "no fetch"; }
    }
    function pageBrain(ctx, W, H) {
        ctx.fillStyle = SCREEN_BG; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.font = "bold 26px ui-monospace,monospace";
        ctx.fillText("GPU BRAIN", 26, 46);
        ctx.strokeStyle = "rgba(60,220,140,0.35)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(26, 58); ctx.lineTo(W - 26, 58); ctx.stroke();

        const b = _brain;
        if (!b) {
            ctx.font = "22px ui-monospace,monospace"; ctx.fillStyle = "rgba(255,190,120,0.95)";
            ctx.fillText("NO BRIDGE", 26, 112);
            ctx.font = "16px ui-monospace,monospace"; ctx.fillStyle = "rgba(110,255,160,0.6)";
            ctx.fillText(_brainErr ? "(" + _brainErr + ")" : "waiting for /ai/brain/health", 26, 142);
            ctx.fillText("A SILENT BRIDGE IS NOT AN IDLE BRAIN.", 26, 176);
            return;
        }
        const ms = (v) => (v == null ? "--" : v < 1000 ? v + "ms" : (v / 1000).toFixed(1) + "s");
        const rows = [
            ["state", String(b.state || "?")],
            ["solving", b.solving ? "YES" : "no"],
            ["fed", b.fed ? "YES" : "no"],
            ["last solve", ms(b.lastSolveMsAgo)],
            ["last feed", ms(b.lastFeedMsAgo)],
            ["fields", String(b.fieldPosts || 0)],
            ["experience", String(b.experience || 0)],
            ["backend", String(b.solverBackend || "--") + (b.solverTruncated ? " !" : "")],
            ["brains", String(b.registeredBrains || 0)],
        ];
        ctx.font = "19px ui-monospace,monospace";
        let y = 92;
        for (const [k, v] of rows) {
            ctx.fillStyle = "rgba(110,255,160,0.62)"; ctx.fillText(k, 26, y);
            // SOLVING AND TRUNCATED ARE THE TWO THAT MATTER AT A GLANCE, so only they get full brightness.
            const hot = (k === "solving" && b.solving) || (k === "backend" && b.solverTruncated);
            ctx.fillStyle = hot ? "#b6ffd0" : "rgba(110,255,160,0.92)";
            ctx.fillText(v, 210, y);
            y += 30;
        }
        if (b.detail) {
            ctx.font = "15px ui-monospace,monospace"; ctx.fillStyle = "rgba(110,255,160,0.55)";
            ctx.fillText(String(b.detail).slice(0, 40), 26, H - 22);
        }
    }

    const PAGE_FNS = { STATS: pageStats, INV: pageInv, MAP: pageMap, DATA: pageData, BRAIN: pageBrain };

    function drawMain(ctx, t) { const W = mainCv.width, H = mainCv.height; (PAGE_FNS[PAGES[_page]] || pageStats)(ctx, W, H, t); mainScreen.tex.needsUpdate = true; }

    function drawRadar(ctx, now) {
        const W = radarCv.width, H = radarCv.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 10;
        ctx.fillStyle = SCREEN_BG; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = _batteryTint || "#3cdc8c"; ctx.lineWidth = 2;   // tinted by solar battery
        for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(cx, cy, R * i / 3, 0, Math.PI * 2); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke(); ctx.restore();
        // live ping rings — one per real "swek:ping" (synced with the main radar)
        const PING_MS = 1400;
        for (let i = _pings.length - 1; i >= 0; i--) { const age = now - _pings[i]; if (age > PING_MS) { _pings.splice(i, 1); continue; }
            const k = age / PING_MS; ctx.globalAlpha = 0.7 * (1 - k); ctx.strokeStyle = "#37ff8a"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, k * R), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
        // continuous sweep arm
        const ang = (now / 1000) % (Math.PI * 2) * 0.9, gx = cx + Math.cos(ang) * R, gy = cy + Math.sin(ang) * R;
        const grad = ctx.createLinearGradient(cx, cy, gx, gy); grad.addColorStop(0, "rgba(60,255,160,0)"); grad.addColorStop(1, "rgba(60,255,160,0.85)");
        ctx.strokeStyle = grad; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(gx, gy); ctx.stroke();
        try { const blips = _radar && _radar._blips, kinds = (_radar && _radar._kinds) || {};
            if (blips && blips.size) for (const b of blips.values()) { if ((b.alpha || 0) <= 0.04) continue; const k = kinds[b.kind] || {};
                const rr = Math.min(b.ring || 0.6, 0.92) * R; ctx.globalAlpha = Math.min(1, b.alpha || 1); ctx.fillStyle = k.color || "#2bd6ff";
                ctx.beginPath(); ctx.arc(cx + Math.cos(b.angle) * rr, cy + Math.sin(b.angle) * rr, 4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; } } catch {}
        // v3237 -- *** AN EMPTY RADAR AND A STOPPED RADAR RENDER IDENTICALLY, AND THAT IS THE WHOLE BUG. ***
        // The sweep and the range rings animate from this canvas's own loop, so a radar that has been switched
        // off looks exactly like a quiet neighbourhood. status() reports whether the source is actually running;
        // when it is not, SAY SO ON THE SCREEN rather than drawing a convincing nothing. v3120's rule in a
        // different subsystem: UNSUPPORTED IS A CAPABILITY, NOT A FAILURE -- and neither is silence.
        try {
            const st = _radar && _radar.status && _radar.status();
            if (!_radar) {
                ctx.fillStyle = "rgba(255,190,120,0.95)"; ctx.font = "15px ui-monospace,monospace"; ctx.textAlign = "center";
                ctx.fillText("NO RADAR SOURCE", radarCv.width / 2, radarCv.height - 14);
            } else if (st && st.blips === 0) {
                ctx.fillStyle = "rgba(110,255,160,0.55)"; ctx.font = "13px ui-monospace,monospace"; ctx.textAlign = "center";
                ctx.fillText("0 CONTACTS", radarCv.width / 2, radarCv.height - 14);
            }
        } catch {}
        let modeLabel = "RADAR"; try { const m = _radar && _radar.mode && _radar.mode(); if (m) modeLabel = ({ network: "COMPUTERS", assets: "GAME ASSETS", planes: "AIRCRAFT" })[m] || m.toUpperCase(); } catch {}
        ctx.fillStyle = "rgba(120,230,170,0.9)"; ctx.font = "bold 20px ui-monospace,monospace"; ctx.textAlign = "center"; ctx.fillText(modeLabel, cx, H - 8);
        radarScreen.tex.needsUpdate = true;
    }
    // v3238 -- SCREEN 2 IS A TALKING HEAD NOW, AND THE CLOCK IT REPLACED IS STILL THERE AS A FOOTER.
    //
    // *** THE MOUTH IS DRIVEN BY speechSynthesis.speaking, WHICH IS A REAL SIGNAL, AND IT IS NOT LIP-SYNC. ***
    // This screen repaints every 200ms -- FIVE FRAMES A SECOND -- and there is no viseme stream, so a mouth
    // animated to look like phonemes would be an animation that merely CORRELATES with speech. Keith's own words
    // for the ragdoll round apply exactly: NOT THEATRE, BUT DEMONSTRATION. So the mouth reports one fact it can
    // actually know -- whether the browser is speaking right now -- and the screen SAYS "SPEAKING" beside it
    // rather than implying more resolution than 5fps can carry.
    //
    // WHY A 2D FACE AND NOT ONE OF THE FOUR HEAD PAGES: thead.html is three.js on its own canvas and
    // face/robotFaceAvatar.js is WebGL2 with a GLB and a SkeletalAnimator, also on its own canvas and exporting
    // NOTHING -- neither can draw into an arbitrary 2D context, and neither is co-resident with this scene.
    // setScreen2(fn) hands out a 2D ctx, so a 2D face is what fits. A CONSUMER CAN STILL OVERRIDE IT: setScreen2
    // replaces this entirely, which is how anything richer would arrive.
    let _blinkT = 0, _blink = false, _mouth = 0;
    function drawHead2(ctx, W, H) {
        const cx = W / 2, cy = H * 0.44, R = Math.min(W, H) * 0.26;
        let speaking = false;
        try { speaking = !!(typeof speechSynthesis !== "undefined" && speechSynthesis.speaking); } catch {}
        // Blink on a timer; open the mouth only while speech is actually playing.
        const now = Date.now();
        if (now - _blinkT > (_blink ? 140 : 3200 + Math.random() * 2600)) { _blinkT = now; _blink = !_blink; }
        _mouth = speaking ? Math.min(1, _mouth + 0.5) : Math.max(0, _mouth - 0.34);

        ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.86, R, 0, 0, Math.PI * 2); ctx.stroke();
        const ey = cy - R * 0.22, ex = R * 0.40;
        ctx.lineWidth = 4;
        for (const sx of [-1, 1]) {
            ctx.beginPath();
            if (_blink) { ctx.moveTo(cx + sx * ex - 13, ey); ctx.lineTo(cx + sx * ex + 13, ey); }
            else ctx.ellipse(cx + sx * ex, ey, 11, 13, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        const mh = 5 + _mouth * (R * 0.42);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.40, R * 0.36, mh / 2, 0, 0, Math.PI * 2); ctx.stroke();

        ctx.textAlign = "center"; ctx.font = "16px ui-monospace,monospace";
        ctx.fillStyle = speaking ? "rgba(110,255,160,0.95)" : "rgba(110,255,160,0.35)";
        ctx.fillText(speaking ? "SPEAKING" : "IDLE", cx, cy + R * 1.55);
    }

    function draw2nd(ctx) {
        const W = cv2.width, H = cv2.height;
        ctx.fillStyle = SCREEN_BG; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = "rgba(60,220,140,0.3)"; ctx.lineWidth = 2; ctx.strokeRect(6, 6, W - 12, H - 12);
        drawHead2(ctx, W, H);
        // THE CLOCK STAYS, SMALLER. It was the least important thing on this screen and that is exactly why it
        // was the one to give up space -- but removing it outright would be deleting a working readout to make
        // room for a new one, which is not the same as replacing it.
        ctx.textAlign = "center"; ctx.font = "17px ui-monospace,monospace"; ctx.fillStyle = "rgba(110,255,160,0.75)";
        ctx.fillText(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + "  \u00b7  SweK", W / 2, H - 18);
        screen2.tex.needsUpdate = true;
    }

    // ---- update loop ----
    let _paintT = 0, _t = 0;
    function update(dt) {
        const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
        _t += (dt || 0.016);
        // v3242 -- *** A LIVE BRAIN TAKES SCREEN 1, AND GIVES IT BACK. ***
        // Keith: "we do want the gpu brain to show on screen 1 when it is active." Active means SOLVING -- the
        // health endpoint's own word for it, not a guess assembled from other fields. While it solves, the page
        // cycle stops on BRAIN and any mounted texture is PARKED; when it goes quiet the texture returns and the
        // cycle resumes where a cycle should.
        //
        // THE TEXTURE IS PARKED, NOT DROPPED. The head on screen 1 (v3240) is a render target the HOST owns and
        // keeps rendering into; forgetting it here would mean the host had to notice and re-mount, which is a
        // second place that has to know about the first. IT COMES BACK BY ITSELF.
        //
        // *** AND "ACTIVE" IS NOT "REACHABLE". *** A brain that answers health but is not solving does NOT take
        // the screen -- that would pin BRAIN permanently on any box running the bridge, which is the opposite of
        // telling you something is happening.
        const brainLive = !!(_brain && _brain.solving);
        if (brainLive) {
            if (_screen1Tex) { _texParked = _screen1Tex; setScreen1Texture(null); }
            _page = PAGES.indexOf("BRAIN");
            _pageT = now;
        } else {
            if (_texParked) { const t = _texParked; _texParked = null; setScreen1Texture(t); }
            if (now - _pageT > 7000) { _pageT = now; if (!_custom1) _page = (_page + 1) % PAGES.length; }   // cycle main pages
        }
        for (const L of lights) {
            if (now < L.blinkUntil) { const on = (Math.floor(now / 120) % 2) === 0; L.mat.color.setHex(on ? L.blinkHex : 0x0a1f14); continue; }
            if (L.hex != null) { L.mat.color.setHex(L.hex); continue; }
            if (L.base === "off") { L.mat.color.setHex(LIGHT_COLORS.off); continue; }
            const base = new THREE.Color(_hexOf(L.base)), k = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(_t * 2.2 + lights.indexOf(L)));
            L.mat.color.copy(base).multiplyScalar(k);
        }
        pumpRadar(now); pollStats(now); pollSolar(now); pollBrain(now);
        if (now - _paintT > 200) { _paintT = now;
            if (!_screen1Tex) { try { (_custom1 ? _custom1(mainCtx, mainCv) : drawMain(mainCtx, _t)); } catch {} }
            try { drawRadar(radarCtx, now); } catch {}
            try { (_custom2 ? _custom2(ctx2, cv2) : draw2nd(ctx2)); } catch {}
        }
    }
    function ping() { try { _pings.push((typeof performance !== "undefined" ? performance.now() : Date.now())); } catch {} }
    function dispose() { try { for (const d of _disposables) { try { d.dispose && d.dispose(); } catch {} } } catch {} try { group.parent && group.parent.remove(group); } catch {} }

    return { group, update, setLight, blink, setLightColor, setBattery, setScreen1, setScreen1Texture, setScreen2, setMainPage, ping, dispose,
        canvases: { main: mainCv, radar: radarCv, second: cv2 }, lights: () => lights.map(l => l.base) };
}
