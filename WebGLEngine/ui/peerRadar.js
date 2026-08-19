// FILE: ui/peerRadar.js
// v1510 — NETWORK / PRESENCE RADAR (distinct from the NEXRAD weather radar in radarLayer.js).
//
// A draggable scope that shows SweK peers (and, later, Home Assistant / consoles / games) as
// blips on a "virtual peer map". Peers have no physical position, so each is pinned at a STABLE
// angle (hash of its URL) on a ring chosen by kind. A "scan" fires a radiating circle from the
// centre; as that circle's radius passes a blip's ring, the blip registers (fades in) — so new
// peers literally appear on the emanating scan. Blips persist across scans; a peer that stops
// responding (drops out of discovery) fades out and is removed.
//
// Mini by default; hover (or click to pin) expands to the full scope. Gated to the sandbox by
// main.js (show on enter, hide on leave). API: window.peerRadar = { show, hide, hideChrome, toggle, scan,
// refresh, status, setExternal(list), addKind(kind, def) }.

export function installPeerRadar() {
    if (window.peerRadar && window.peerRadar._installed) return window.peerRadar;

    // ---- entity kinds: ring (0..1 of scope radius) + colour + glyph. Extensible via addKind() ----
    const KINDS = {
        peer:      { ring: 0.68, color: "#2bd6ff", glyph: "\u25C8", label: "SweK peer" },   // v1546 - pulled in from 0.86: at 0.86 the blip+halo rode the outer ring, which left almost no margin in the small (126px) minimized scope and read as spilling off; 0.68 seats it clearly inside at BOTH sizes
        ha:        { ring: 0.50, color: "#ffb14e", glyph: "\u2302", label: "Home Assistant" },
        ps3:       { ring: 0.64, color: "#6aa6ff", glyph: "\uD83C\uDFAE", label: "PS3" },
        xbox:      { ring: 0.64, color: "#9fe88f", glyph: "\uD83C\uDFAE", label: "Xbox" },
        fallout:   { ring: 0.30, color: "#b6ff3a", glyph: "\u2622", label: "Fallout" },
        starfield: { ring: 0.30, color: "#ff9a4e", glyph: "\u2737", label: "Starfield" },
        game:      { ring: 0.30, color: "#ff5a6a", glyph: "\u25C9", label: "Game" },
        plane:     { ring: 0.50, color: "#9fd6ff", glyph: "\u2708", label: "Aircraft" },   // v1511 planes mode
        kaiju:     { ring: 0.50, color: "#ff5a6a", glyph: "\uD83E\uDD96", label: "Kaiju" },  // v1511 assets mode
        asset:     { ring: 0.50, color: "#7fe9c0", glyph: "\u25AA", label: "Asset" },
        phone:     { ring: 0.72, color: "#c89bff", glyph: "\uD83D\uDCF1", label: "Phone" },        // v1540 connected control clients
        androidtv: { ring: 0.72, color: "#ffd24e", glyph: "\uD83D\uDCFA", label: "Android TV" },   // v1540 Shield / TV control clients
        cloud:     { ring: 0.42, color: "#b69bff", glyph: "\u2601", label: "Cloud peer" },          // v1619 remote peers via the rendezvous server
    };

    const blips = new Map();    // id -> { id, kind, label, url, angle, ring, alpha, target, live, revealed }
    let external = [];          // injected non-peer entities (HA/console/game), set by setExternal()
    // v1511 — ONE radar, three modes. The engine can switch via setMode(); a button cycles them.
    //   network = SweK peers (hash-angle layout)   assets = in-world entities (kaiju/assets, real x/z)
    //   planes  = live ADS-B aircraft (real x/z)
    let _mode = "network";
    const MODES = ["network", "assets", "planes", "compass"];   // v1737 - compass is a 4th view (heading + floor-plane gyro)
    const MODE_LABEL = { network: "Computers", assets: "Game assets", planes: "Aircraft", compass: "Compass" };
    let _sweepPrev = 0;   // sweep-arm angle (continuous). v1692 - ping rings are no longer auto-fired; they radiate ONLY on actual pings.
    let _pulses = [], _sweepWatch = 0, _sweepSeen = 0;   // pool of expanding ping rings (one per real probe)
    let _searching = false, _lastLonely = 0;            // v1621 — active "still lonely?" LAN peer sweep state
    const PULSE_MS = 1400, FADE_PER_S = 1.8, STALE_MS = 12000, SWEEP_MS = 4000, TAU = Math.PI * 2, PULSE_POOL = 8;
    const R = 46, CX = 50, CY = 50;   // SVG scope geometry (100x100 viewBox)

    function hashAngle(s) { let h = 0; s = String(s || ""); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return ((h >>> 0) % 3600) / 3600 * Math.PI * 2; }
    // v1542 — did the sweep arm pass `target` going prev->cur this frame (angles mod 2pi)?
    function angBetween(prev, cur, target) { const n = (x) => ((x % TAU) + TAU) % TAU; prev = n(prev); cur = n(cur); target = n(target); return (prev <= cur) ? (target > prev && target <= cur) : (target > prev || target <= cur); }
    function hostOf(url) { try { return new URL(url).host; } catch { return String(url || "").replace(/^https?:\/\//, "").replace(/\/.*$/, ""); } }
    // v1616 — gossiped friendly names (ip -> name), pulled from /net/names. Lets the radar + panel show a real
    // name for a box whose UDP beacon never reached us (Wi-Fi AP isolation), as long as the name gossiped here
    // over TCP. Refreshed on a light throttle; a slightly stale map is fine since names change rarely.
    const _gname = {};
    let _namesAt = 0;
    let _selfIps = new Set();   // v1967 — this box's own LAN IPs, so the radar never blips itself
    let _selfIpsAt = 0;
    function ipOf(url) { return hostOf(url).split(":")[0]; }
    // v1853 — a peer must be a LAN box, never a public host. Guards every peer list against junk like
    // "api.github.com:8787" (which leaked in when the netMeter recorded outbound GitHub-API traffic as
    // a "peer"). Accepts localhost/*.local/192.168.x/10.x/172.16.x/127.x; rejects any public hostname,
    // 169.254.x link-local, 172.17-31.x docker/wsl, 100.64.x CGNAT.
    function _isLanPeer(url) {
        let host = ipOf(url); if (!host) return false; host = host.toLowerCase();
        if (host === "localhost" || host.endsWith(".local")) return true;
        const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/); if (!m) return false;
        const a = +m[1], b = +m[2];
        if (a === 192 && b === 168) return true;
        if (a === 10) return true;
        if (a === 172 && b === 16) return true;
        if (a === 127) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;   // v1896 — Tailscale tailnet (100.64.0.0/10). Was missing here, so VPN peers never blipped even though the server + assetSync filters accept them.
        return false;
    }
    async function loadNames() { try { const j = await fetch("/net/names", { cache: "no-store" }).then(r => r.json()); if (j && j.ok && Array.isArray(j.names)) for (const e of j.names) { if (e && e.ip && e.name) _gname[e.ip] = e.name; } } catch {} }
    // v1837 — timeout-guarded JSON fetch. The peers panel awaited a chain of fetches with no
    // timeout; if any route stalled (a slow/dead peer probe behind /net/stats, /peer/list, etc.)
    // the whole render froze on "scanning…" forever. This caps each call so a stall can't hang
    // the panel — a timed-out call just returns null and the merge continues with what it has.
    function _fetchJSON(url, ms) {
        return new Promise((resolve) => {
            let done = false;
            const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
            const t = setTimeout(() => { if (done) return; done = true; try { ctrl && ctrl.abort(); } catch {} resolve(null); }, ms || 4000);
            fetch(url, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
                .then(r => r.json())
                .then(j => { if (done) return; done = true; clearTimeout(t); resolve(j); })
                .catch(() => { if (done) return; done = true; clearTimeout(t); resolve(null); });
        });
    }
    function nameOf(url, fallback) { return _gname[ipOf(url)] || fallback || hostOf(url); }
    function ringFor(kind) { return (KINDS[kind] || KINDS.peer).ring; }
    function kindForEntity(k) { const s = String(k || "").toLowerCase(); if (/kaiju|ogre|monster|boss|king|queen/.test(s)) return "kaiju"; return "asset"; }

    function upsert(kind, id, opts) {
        let b = blips.get(id);
        if (!b) { b = { id, kind, angle: hashAngle(id), ring: ringFor(kind), alpha: 0, target: 1, live: true, revealed: false }; blips.set(id, b); }
        b.kind = kind; b.ring = ringFor(kind);
        if (opts) Object.assign(b, opts);
        b.live = true; b.target = 1; b.lastSeen = Date.now();
        return b;
    }

    // ---- DOM ----
    let root = null, scope = null, blipG = null, sweepEl = null, label = null, _modeBtn = null, _kf = false, _pinned = false, _raf = 0, _docked = false, _dockEl = null, _reDockTimer = 0;
    let _dockSize = 88, _poppedOut = false;                 // v1746 - hover pops the docked mini radar out as a floating overlay
    const _peerSeen = new Map();                            // v1746 - url -> last-seen ts, so known peers show immediately + don't flicker
    let _lastCamSig = null, _autoCompass = false, _compassRevertAt = 0, _modeBeforeCompass = null;   // v1746 - world-move -> compass, then revert
    let _compassHost = null, _gyro = null, _svgEl = null;   // v1737 - compass view mode
    let pos = { right: 16, bottom: 16 };

    function injectKeyframes() { if (_kf) return; _kf = true; try { const st = document.createElement("style"); st.textContent = "@keyframes swekPeerSweep{to{transform:rotate(360deg)}}"; document.head.appendChild(st); } catch {} }

    function build() {
        injectKeyframes();
        root = document.createElement("div");
        Object.assign(root.style, {
            position: "fixed", right: pos.right + "px", bottom: pos.bottom + "px", zIndex: "99990",
            width: "126px", height: "126px", borderRadius: "50%", overflow: "hidden",
            background: "radial-gradient(circle at 50% 50%, rgba(8,20,28,0.92), rgba(4,9,14,0.96))",
            border: "1px solid #1c4a5e", boxShadow: "0 0 18px rgba(43,150,255,0.25)",
            transition: "width .18s ease, height .18s ease, box-shadow .18s ease", cursor: "grab", display: "none",
        });
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        Object.assign(svg.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
        // range rings + crosshair
        let g = "";
        for (const r of [R * 0.33, R * 0.66, R]) g += `<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="#1f5f78" stroke-width="0.5" opacity="0.7"/>`;
        g += `<line x1="${CX - R}" y1="${CY}" x2="${CX + R}" y2="${CY}" stroke="#1f5f78" stroke-width="0.4" opacity="0.5"/>`;
        g += `<line x1="${CX}" y1="${CY - R}" x2="${CX}" y2="${CY + R}" stroke="#1f5f78" stroke-width="0.4" opacity="0.5"/>`;
        g += `<circle cx="${CX}" cy="${CY}" r="1.6" fill="#7fe9ff"/>`;   // "you" at centre
        const rings = document.createElementNS("http://www.w3.org/2000/svg", "g");
        rings.innerHTML = g; svg.appendChild(rings);
        // ping rings - one expands per ACTUAL ping (real network probe). Multiple can radiate at once (a LAN scan
        // fires one per probed IP), so a small pool cycles. NOT ornamental / not auto-fired.
        _pulses = [];
        for (let i = 0; i < PULSE_POOL; i++) {
            const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            c.setAttribute("cx", CX); c.setAttribute("cy", CY); c.setAttribute("r", "0");
            c.setAttribute("fill", "none"); c.setAttribute("stroke", "#2bd6ff"); c.setAttribute("stroke-width", "0.8"); c.style.opacity = "0";
            svg.appendChild(c); _pulses.push({ el: c, t0: 0, color: "#2bd6ff" });
        }
        // rotating sweep wedge
        sweepEl = document.createElementNS("http://www.w3.org/2000/svg", "g");
        sweepEl.style.transformOrigin = `${CX}px ${CY}px`;
        sweepEl.style.animation = "none";   // v1542 — JS now drives the sweep angle so it can re-ping blips it crosses
        sweepEl.innerHTML = `<defs><linearGradient id="swekSweepGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2bd6ff" stop-opacity="0.35"/><stop offset="1" stop-color="#2bd6ff" stop-opacity="0"/></linearGradient></defs><path d="M${CX} ${CY} L${CX + R} ${CY} A${R} ${R} 0 0 0 ${CX + R * 0.94} ${CY - R * 0.34} Z" fill="url(#swekSweepGrad)"/><line x1="${CX}" y1="${CY}" x2="${CX + R}" y2="${CY}" stroke="#2bd6ff" stroke-width="0.6" opacity="0.7"/>`;
        svg.appendChild(sweepEl);
        // blips layer
        blipG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        svg.appendChild(blipG);
        _svgEl = svg;   // v1737 - so compass mode can hide the scan scope
        root.appendChild(svg);
        // v1737 - compass mode overlay: a GyroCompass renders into this host when _mode === "compass"; hidden otherwise.
        _compassHost = document.createElement("div");
        Object.assign(_compassHost.style, { position: "absolute", inset: "0", display: "none", alignItems: "center", justifyContent: "center", pointerEvents: "none" });
        root.appendChild(_compassHost);
        // floating label (full view) — v1539: bigger + clickable (network mode -> opens the peer panel)
        label = document.createElement("div");
        Object.assign(label.style, { position: "absolute", left: "6px", bottom: "5px", right: "6px", font: "11px ui-monospace,monospace", color: "#9fd6ff", textAlign: "center", pointerEvents: "none", cursor: "pointer", opacity: "0", transition: "opacity .15s", textShadow: "0 1px 2px #000" });
        label.addEventListener("click", (e) => { if (_mode === "network") { e.stopPropagation(); openNetworkPanel(); } });
        root.appendChild(label);

        // v1511 — mode button (cycles network/assets/planes); engine can also call setMode()
        const modeBtn = document.createElement("button");
        Object.assign(modeBtn.style, { position: "absolute", left: "50%", top: "5px", transform: "translateX(-50%)", font: "8px ui-monospace,monospace", color: "#bfe7ff", background: "rgba(8,28,40,0.85)", border: "1px solid #1c4a5e", borderRadius: "8px", padding: "1px 7px", cursor: "pointer", zIndex: "3", whiteSpace: "nowrap" });
        modeBtn.textContent = MODE_LABEL[_mode];
        modeBtn.addEventListener("mousedown", (e) => e.stopPropagation());
        modeBtn.addEventListener("click", (e) => { e.stopPropagation(); _autoCompass = false; _modeBeforeCompass = null; setMode(MODES[(MODES.indexOf(_mode) + 1) % MODES.length]); });
        root.appendChild(modeBtn); _modeBtn = modeBtn;

        // v1511 — click a peer blip (network mode) to open that peer's server.html in a new tab
        blipG.addEventListener("click", (e) => {
            const u = e.target && e.target.getAttribute && e.target.getAttribute("data-url");
            if (u) { e.stopPropagation(); try { window.open(u.replace(/\/+$/, "") + "/server.html", "_blank", "noopener"); } catch {} }
        });

        // v1956 — hover pop-out jitter fix. When docked, expand() moves `root` to position:fixed, which
        // yanks it out from under the cursor -> mouseleave fires -> collapse -> cursor is over it again ->
        // mouseenter -> expand… an infinite flicker. Fix: (1) collapse only when the pointer is genuinely
        // outside the radar's CURRENT rect (re-checked on mouseleave), and (2) small settle delay so the
        // reposition can't self-trigger. Pinned click still overrides.
        let _leaveTimer = 0;
        root.addEventListener("mouseenter", () => { if (_leaveTimer) { clearTimeout(_leaveTimer); _leaveTimer = 0; } if (!_pinned) expand(true); });
        root.addEventListener("mouseleave", (e) => {
            if (_pinned) return;
            if (_leaveTimer) clearTimeout(_leaveTimer);
            // defer, then only collapse if the cursor is truly not over the radar now (its rect just moved).
            _leaveTimer = setTimeout(() => {
                _leaveTimer = 0;
                try {
                    const r = root.getBoundingClientRect();
                    const x = (e && e.clientX) || 0, y = (e && e.clientY) || 0;
                    const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
                    if (!inside) expand(false);
                } catch { expand(false); }
            }, 90);
        });
        root.addEventListener("click", (e) => { if (_dragMoved) return; _pinned = !_pinned; expand(_pinned); scan(); });
        makeDraggable(root);
        document.body.appendChild(root);
    }

    function expand(big) {
        if (!root) return;
        // v1733/v1746 - docked into STATUS, resizing in place spilled the slot. Instead, hover POPS the radar OUT into a
        // floating overlay anchored to its dock slot, while the slot keeps its footprint so the gauge row doesn't reflow.
        if (_docked) {
            const slot = root.parentElement;
            if (big) {
                try {
                    const r = root.getBoundingClientRect();
                    if (slot) { slot.style.minWidth = slot.offsetWidth + "px"; slot.style.minHeight = slot.offsetHeight + "px"; }
                    const ES = 240, W = (window.innerWidth || 1200), H = (window.innerHeight || 800);
                    // v1956 — grow OUTWARD FROM THE CENTER of the docked radar so the pointer stays inside the
                    // popped-out overlay (was: anchored bottom-right, which could land away from the cursor and
                    // immediately re-collapse). Clamp to the viewport.
                    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                    let left = Math.max(8, Math.min(Math.round(cx - ES / 2), W - ES - 8));
                    let top  = Math.max(8, Math.min(Math.round(cy - ES / 2), H - ES - 8));
                    Object.assign(root.style, { position: "fixed", left: left + "px", top: top + "px", right: "auto", bottom: "auto", width: ES + "px", height: ES + "px", zIndex: "9300", boxShadow: "0 0 30px rgba(43,150,255,0.45)" });
                    _poppedOut = true;
                } catch {}
            } else {
                try {
                    Object.assign(root.style, { position: "relative", left: "auto", top: "auto", right: "auto", bottom: "auto", width: _dockSize + "px", height: _dockSize + "px", zIndex: "1", boxShadow: "0 0 18px rgba(43,150,255,0.25)" });
                    if (slot) { slot.style.minWidth = ""; slot.style.minHeight = ""; }
                    _poppedOut = false;
                } catch {}
            }
            if (label) { label.style.opacity = big ? "1" : "0"; label.style.pointerEvents = big ? "auto" : "none"; }
            return;
        }
        root.style.width = root.style.height = big ? "300px" : "126px";
        root.style.boxShadow = big ? "0 0 30px rgba(43,150,255,0.4)" : "0 0 18px rgba(43,150,255,0.25)";
        if (label) { label.style.opacity = big ? "1" : "0"; label.style.pointerEvents = big ? "auto" : "none"; }
    }

    let _dragMoved = false;
    function makeDraggable(el) {
        let drag = false, sx = 0, sy = 0, ox = 0, oy = 0;
        el.addEventListener("mousedown", (e) => { drag = true; _dragMoved = false; sx = e.clientX; sy = e.clientY; const r = el.getBoundingClientRect(); ox = r.left; oy = r.top; el.style.cursor = "grabbing"; });
        window.addEventListener("mousemove", (e) => { if (!drag) return; if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 3) _dragMoved = true; el.style.left = (ox + e.clientX - sx) + "px"; el.style.top = (oy + e.clientY - sy) + "px"; el.style.right = "auto"; el.style.bottom = "auto"; });
        window.addEventListener("mouseup", () => { if (drag) { drag = false; el.style.cursor = "grab"; } });
    }

    // ---- data ----
    // project a real world (x,z) onto the scope: auto-range to the farthest item so blips always fit.
    function layoutWorld(items, fallbackKind) {
        let maxD = 1;
        for (const it of items) { const d = Math.hypot(it.x || 0, it.z || 0); if (d > maxD) maxD = d; }
        const range = maxD * 1.08;
        const ids = new Set();
        for (const it of items) {
            const id = (it.id != null ? String(it.id) : (fallbackKind + ":" + (it.label || (it.x + "," + it.z))));
            ids.add(id);
            const dist = Math.hypot(it.x || 0, it.z || 0);
            const b = upsert(it.kind || fallbackKind, id, { label: it.label || "", url: it.url || "" });
            b.angle = Math.atan2(it.z || 0, it.x || 0);
            b.ring = Math.min(0.92, (dist / range) * 0.9 + 0.04);   // origin -> centre, farthest -> rim
        }
        return ids;
    }

    async function refresh() {
        if (_mode === "compass") { if (label) label.textContent = "Compass"; return; }   // v1737 - heading view; no peer scan
        if (_mode === "network") {
            if (Date.now() - _namesAt > 12000) { _namesAt = Date.now(); loadNames(); }   // v1616 — refresh ip->name table (fire-and-forget)
            // v1967 — self-exclusion: this box was blipping ITSELF (e.g. "Galaxina" appearing twice) because
            // discovery / saved-roster can include our own LAN IP. Load our own IPs (cheap, cached) and drop
            // any peer whose host IP is one of them, so the radar only shows OTHER machines.
            if (Date.now() - _selfIpsAt > 30000) { _selfIpsAt = Date.now(); try { pingFetch("/net/info", { cache: "no-store" }).then(r => r.json()).then(j => { if (j && Array.isArray(j.lanIps)) _selfIps = new Set(j.lanIps.map(String)); }).catch(() => {}); } catch {} }
            const _isSelf = (u) => { try { return _selfIps.has(ipOf(u)); } catch { return false; } };
            let live = [];
            try { const j = await pingFetch("/sync/discovered", { cache: "no-store" }).then(r => r.json()); if (j && j.ok) live = j.discovered || []; } catch {}
            live = live.filter(function(p){ const u = p.url || p; return _isLanPeer(u) && !_isSelf(u); });   // v1853 never blip a public host; v1967 never blip self
            let saved = [], savedMeta = [];
            try { const j = await pingFetch("/sync/peers", { cache: "no-store" }).then(r => r.json()); if (j && j.ok) { savedMeta = (j.peers || []).map(p => (typeof p === "string" ? { url: p } : p)).filter(p => p && p.url && _isLanPeer(p.url) && !_isSelf(p.url)); saved = savedMeta.map(p => p.url); } } catch {}
            // v1846 — dedup the SAME machine seen at multiple IPs into ONE row, keyed by its stable
            // identity id (id = sha256(secret)[:16], survives IP changes). Build a url->id map from both
            // the live caps (caps.id) and the saved-peer annotations, then key each peer blip by id when
            // known (else the url). Two IPs of one box (e.g. Galaxina at .8 and .54) collapse to one.
            const _urlToId = new Map();
            for (const p of live) { const url = p.url || p; const id = p.caps && p.caps.id; if (url && id) _urlToId.set(url, id); }
            for (const p of savedMeta) { if (p.url && p.id) _urlToId.set(p.url, p.id); }
            const _peerKey = (url) => _urlToId.get(url) || url;   // identity id if known, else the url itself
            const liveUrls = new Set();
            for (const p of live) { const url = p.url || p; if (!url) continue; liveUrls.add(url); const caps = p.caps || {}; upsert("peer", _peerKey(url), { label: nameOf(url, caps.host), url, saved: saved.includes(url), full: !!caps.gpu, caps }); }
            // v1611 — also show SAVED peers that UDP discovery didn't return (Wi-Fi AP isolation blocks the
            // broadcast, or a peer changed IP). v1616 — labeled by gossiped name when known, else host:IP, so a
            // configured box shows its real name without needing a hand-assigned one. v1846 — a saved IP that
            // resolves to an already-shown machine (same id) is skipped so it doesn't add a duplicate row.
            const _shownKeys = new Set([...liveUrls].map(_peerKey));
            for (const u of saved) { if (!u || liveUrls.has(u)) continue; const k = _peerKey(u); if (_shownKeys.has(k)) continue; _shownKeys.add(k); liveUrls.add(u); upsert("peer", k, { label: nameOf(u), url: u, saved: true, savedOnly: true, caps: {} }); }
            // v1853 — which peers did we actually CONFIRM this poll (discovered live OR an active inbound link)?
            // Only these count toward "N peers". A saved-but-silent box still shows (dimmed) so an AP-isolated
            // peer isn't hidden, but it no longer inflates the count — that's why the radar read "6" when only
            // one other machine was really online.
            const _confirmedKeys = new Set();
            for (const p of live) { const url = p.url || p; if (url) _confirmedKeys.add(_peerKey(url)); }
            for (const b of blips.values()) { if (b.kind === "peer") b.confirmed = _confirmedKeys.has(b.id); }
            // v1746 - "assume the current peers are correct, then re-test": remember every peer we just saw, and keep showing
            // a recently-seen peer even if THIS poll's discovery missed it (Wi-Fi AP isolation drops the odd beacon). The
            // active probe still runs every poll; a peer only falls off after the grace window with no sighting. De-flickers.
            const _now = Date.now(), GRACE = 45000;
            for (const u of liveUrls) _peerSeen.set(u, _now);
            for (const [u, ts] of _peerSeen) {
                if (_now - ts >= GRACE) { _peerSeen.delete(u); continue; }
                const k = _peerKey(u);
                if (!liveUrls.has(u) && !_shownKeys.has(k)) { _shownKeys.add(k); liveUrls.add(u); upsert("peer", k, { label: nameOf(u), url: u, saved: saved.includes(u), graced: true, caps: {} }); }
            }
            // a peer blip is live if ANY of its urls is in liveUrls (blip.id is the identity id, so compare via _peerKey).
            const _liveKeys = new Set([...liveUrls].map(_peerKey));
            for (const b of blips.values()) { if (b.kind === "peer" && !_liveKeys.has(b.id)) { b.live = false; b.target = 0; } }
            // v1853 — a peer counts if it was CONFIRMED live this poll, or confirmed within the grace window
            // (so a briefly-missed real peer doesn't flicker out of the count). Saved-but-never-confirmed
            // boxes render but don't count.
            for (const b of blips.values()) { if (b.kind === "peer" && b.confirmed) b._confirmedAt = _now; }
            // v1539 — spread peers EVENLY around the ring instead of hash angles: 2 -> opposite,
            // 3 -> 120deg apart, N -> 360/N, all equidistant. Stable order by url so a peer keeps
            // its slot; recomputed each refresh so adding/dropping a peer re-balances the spread.
            const livePeers = [...blips.values()].filter(b => b.kind === "peer" && b.live && b._confirmedAt && (_now - b._confirmedAt) < GRACE).sort((a, b) => String(a.url).localeCompare(String(b.url)));
            const NP = livePeers.length;
            livePeers.forEach((b, i) => { b.angle = (i / Math.max(1, NP)) * Math.PI * 2 - Math.PI / 2; });   // first peer at top (12 o'clock)
            // v1621 — "still lonely?" test: with NO peers showing, ask the bridge to actively sweep the LAN for
            // unannounced SweK engines (the UDP beacon misses peers when the AP blocks broadcast). While the sweep
            // runs the radar radiates faster + amber. Throttled to once every ~30s.
            if (NP === 0 && Date.now() - _lastLonely > 30000) {
                _lastLonely = Date.now(); _searching = true; _watchSweepProgress();
                pingFetch("/net/sweep", { cache: "no-store" }).then(r => r.json()).then(j => { if (j && j.found && j.found.length) refresh(); }).catch(() => {}).finally(() => { setTimeout(() => { _searching = false; }, 2500); });
            }
            const extIds = new Set();
            for (const e of external) { if (!e || !e.id || !KINDS[e.kind]) continue; extIds.add(e.id); upsert(e.kind, e.id, { label: e.label || KINDS[e.kind].label, url: e.url || "" }); }
            // v1540 — connected control clients (phones / Android TV / Shield) as their own blips.
            // window.phoneRoster() = [{id, role, name, agoMs}] of clients currently linked to THIS engine.
            try {
                const roster = (typeof window.phoneRoster === "function") ? (window.phoneRoster() || []) : [];
                for (const c of roster) {
                    if (!c || (c.agoMs != null && c.agoMs > 12000)) continue;   // only recently-seen
                    const s = ((c.name || "") + " " + (c.role || "")).toLowerCase();
                    const kind = /(tv|shield|androidtv|android tv|cast|chromecast|google tv|fire ?tv)/.test(s) ? "androidtv" : "phone";
                    const id = "client:" + (c.id || c.name || s);
                    extIds.add(id);
                    upsert(kind, id, { label: c.name || (kind === "androidtv" ? "Android TV" : (c.role || "Phone")) });
                }
            } catch {}
            // v1619 — remote peers from the cloud rendezvous directory (off-LAN boxes/users), as their own kind.
            try {
                const cd = await pingFetch("/cloud/directory", { cache: "no-store" }).then(r => r.json()).catch(() => null);
                if (cd && cd.ok && Array.isArray(cd.peers)) {
                    let selfId = ""; try { const cs = await pingFetch("/cloud/status", { cache: "no-store" }).then(r => r.json()); selfId = cs && cs.id || ""; } catch {}
                    for (const p of cd.peers) {
                        if (!p || !p.id || p.id === selfId) continue;
                        const id = "cloud:" + p.id; extIds.add(id);
                        upsert("cloud", id, { label: (p.name || p.id) + (p.kind && p.kind !== "engine" ? (" \u00b7 " + p.kind) : ""), url: "" });
                    }
                }
            } catch {}
            for (const b of blips.values()) { if (b.kind !== "peer" && !extIds.has(b.id)) { b.live = false; b.target = 0; } }
        } else if (_mode === "assets") {
            let ents = [];
            try { ents = (window.renderBridge && window.renderBridge.getVisibleEntities && window.renderBridge.getVisibleEntities()) || []; } catch {}
            if (!ents.length) { try { ents = ((window.engineSnapshot && window.engineSnapshot()) || {}).ents || []; } catch {} }
            const items = ents.filter(e => e && e.x != null).slice(0, 160).map((e, i) => ({ id: "ent" + i, x: e.x || 0, z: e.z || 0, kind: kindForEntity(e.k || e.kind), label: e.k || e.kind || "" }));
            const ids = layoutWorld(items, "game");
            for (const b of blips.values()) { if (!ids.has(b.id)) { b.live = false; b.target = 0; } }
        } else if (_mode === "planes") {
            let planes = [];
            try { planes = (window.adsb && window.adsb.planes && window.adsb.planes()) || []; } catch {}
            const items = planes.filter(p => p && (p.x != null || p.lon != null)).slice(0, 120).map((p, i) => ({ id: "ac" + (p.hex || p.icao || i), x: (p.x != null ? p.x : 0), z: (p.z != null ? p.z : 0), kind: "plane", label: p.flight || p.callsign || p.hex || "" }));
            const ids = layoutWorld(items, "plane");
            for (const b of blips.values()) { if (!ids.has(b.id)) { b.live = false; b.target = 0; } }
        }
        return status();
    }

    // fire ONE ping ring (a real probe happened). Also notifies robots (their antenna tip ripples). Pool-recycled.
    function ping(opts) {
        opts = opts || {};
        const color = opts.color || (_searching ? "#ffb14e" : "#2bd6ff");
        let p = _pulses.find(x => !x.t0); if (!p && _pulses.length) p = _pulses.reduce((a, b) => (a.t0 <= b.t0 ? a : b));
        if (p) { p.t0 = performance.now(); p.color = color; if (p.el) p.el.setAttribute("stroke", color); }
        try { window.dispatchEvent(new CustomEvent("swek:ping", { detail: { color } })); } catch {}
    }
    // wrap a real network fetch so each probe radiates a ring
    function pingFetch(url, init) { try { ping(); } catch {} return fetch(url, init); }
    // while the LAN sweep runs (can take minutes), ring once per newly-probed IP (staggered, capped per poll)
    function _watchSweepProgress() {
        if (_sweepWatch) return; _sweepSeen = 0;
        const poll = () => {
            fetch("/net/sweep-progress", { cache: "no-store" }).then(r => r.json()).then(j => {
                if (j && j.ok) {
                    const n = Math.min(6, Math.max(0, (j.done || 0) - _sweepSeen)); _sweepSeen = j.done || 0;
                    for (let i = 0; i < n; i++) setTimeout(() => ping({ color: "#ffb14e" }), i * 28);
                    if (j.busy) { _sweepWatch = setTimeout(poll, 180); return; }
                }
                _sweepWatch = 0;
            }).catch(() => { _sweepWatch = 0; });
        };
        _sweepWatch = setTimeout(poll, 120);
    }

    function scan() {
        ping();   // a manual scan is a real probe
        // new/unrevealed live blips re-arm so they pop as a ring passes their ring
        for (const b of blips.values()) if (b.live && b.alpha < 0.1) b.revealed = false;
        refresh();
        return status();
    }

    // ---- animation loop ----
    let _last = 0;
    function tick(now) {
        if (!root || root.style.display === "none") { _raf = 0; return; }
        const dt = Math.min(0.05, (now - (_last || now)) / 1000); _last = now;
        // v1746 - world-move auto-compass (mini radar only): when the camera position/yaw changes, briefly flip to the
        // compass heading view, then revert to whatever the radar was showing. A manual mode change cancels the revert.
        if (_docked) {
            try {
                const cam = (typeof window !== "undefined") ? window.camera : null;
                if (cam && cam.position) {
                    const sig = Math.round(cam.position.x) + "," + Math.round(cam.position.y) + "," + Math.round(cam.position.z) + "," + (Number(cam.yaw) || 0).toFixed(2);
                    if (_lastCamSig !== null && sig !== _lastCamSig) {
                        if (_mode !== "compass") { _modeBeforeCompass = _mode; _autoCompass = true; setMode("compass"); }
                        if (_autoCompass) _compassRevertAt = now + 4000;   // keep extending while it moves; revert ~4s after it stops
                    }
                    _lastCamSig = sig;
                }
                if (_autoCompass && _mode === "compass" && now > _compassRevertAt) { _autoCompass = false; const back = _modeBeforeCompass || "network"; _modeBeforeCompass = null; setMode(back); }
            } catch {}
        }
        // ping rings — radiate ONLY on actual pings (ping()/pingFetch). Animate every active ring in the pool.
        let pulseR = -1, anyPulse = false;
        for (const p of _pulses) {
            if (!p.t0) continue; anyPulse = true;
            const k = (now - p.t0) / PULSE_MS;
            if (k >= 1) { p.t0 = 0; if (p.el) p.el.style.opacity = "0"; }
            else if (p.el) { const r = Math.max(0, k * R); p.el.setAttribute("r", r.toFixed(1)); p.el.style.opacity = ((_searching ? 0.85 : 0.6) * (1 - k)).toFixed(2); if (r > pulseR) pulseR = r; }
        }
        // v1542 — JS-driven sweep arm angle (so we can detect when it crosses a blip)
        const sweepNorm = ((now % SWEEP_MS) / SWEEP_MS) * TAU;
        if (sweepEl) sweepEl.style.transform = "rotate(" + (sweepNorm * 180 / Math.PI).toFixed(1) + "deg)";
        // blips: reveal on pulse crossing, fade toward target, prune
        let h = "", liveCount = 0;
        for (const b of [...blips.values()]) {
            const ringR = Math.min(b.ring * R, R - 6);   // v1546 - keep blip+halo (max ~5.8u) inside the outer ring so nothing rides/overflows the rim in the tiny minimized scope
            if (b.live && !b.revealed) { if (!anyPulse || pulseR >= ringR) b.revealed = true; }   // pop when a ping ring reaches its ring (or instantly when idle)
            // v1542 — sweep-arm re-ping: the spinning radius line crossing this blip's angle gives a soft
            // (sub-discovery) highlight that decays over one revolution -> faded as the arm/pulse comes back
            if (b.live && b.revealed && angBetween(_sweepPrev, sweepNorm, b.angle)) b.sweepHL = 1;
            b.sweepHL = Math.max(0, (b.sweepHL || 0) - dt / (SWEEP_MS / 1000));
            const want = (b.live && b.revealed) ? 1 : 0;
            b.alpha += (want - b.alpha) * Math.min(1, dt * FADE_PER_S);
            if (!b.live && b.alpha < 0.02) { blips.delete(b.id); continue; }
            if (b.alpha < 0.02) continue;
            if (b.live) liveCount++;
            const a = b.angle, x = CX + Math.cos(a) * ringR, y = CY + Math.sin(a) * ringR;
            const k = KINDS[b.kind] || KINDS.peer;
            let col = k.color;
            if (b.kind === "peer" && !b.full) col = "#8aa0b0";   // CPU-only / client peer rendered dimmer than a GPU "full" engine
            const sweepHL = b.sweepHL || 0;
            const ringHL = (pulseR >= 0 && Math.abs(pulseR - ringR) < 2) ? 1.7 : 1;   // pulse crossing the ring = full discovery pop
            const hl = Math.max(ringHL, 1 + sweepHL * 0.35);   // sweep ping is gentler than discovery
            const clickable = (_mode === "network" && b.kind === "peer" && b.url) ? ` data-url="${b.url}" style="cursor:pointer;pointer-events:auto"` : "";
            h += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2.0 * hl).toFixed(1)}" fill="${col}" opacity="${b.alpha.toFixed(2)}"${clickable}/>`;
            h += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(3.4 * hl).toFixed(1)}" fill="none" stroke="${col}" stroke-width="${(0.4 + sweepHL * 0.5).toFixed(2)}" opacity="${(b.alpha * (0.5 + sweepHL * 0.45)).toFixed(2)}"/>`;
            if (_pinned || root.offsetWidth > 200) {
                let lab = (b.label || "").slice(0, 16);
                if (b.kind === "peer") lab += b.full ? " \u00b7GPU" : " \u00b7CPU";
                h += `<text x="${x.toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="3.4" fill="${col}" text-anchor="middle" opacity="${(b.alpha * 0.9).toFixed(2)}"${clickable}>${lab}</text>`;
            }
        }
        _sweepPrev = sweepNorm;
        blipG.innerHTML = h;
        if (label) {
            const n = liveCount, noun = _mode === "network" ? "peer" : (_mode === "planes" ? "aircraft" : "entity");
            label.textContent = MODE_LABEL[_mode] + " \u00b7 " + (n ? (n + " " + noun + (n === 1 ? "" : (noun === "aircraft" ? "" : "s")) + (_mode === "network" ? " \u2014 click to open" : "")) : "scanning\u2026");
        }
        _raf = requestAnimationFrame(tick);
    }
    function startLoop() { if (!_raf) { _last = performance.now(); _raf = requestAnimationFrame(tick); } }

    let _pollTimer = 0;
    function show() {
        if (!root) build();
        if (root.style.display !== "none") return status();
        root.style.display = "block";
        startLoop(); scan();
        if (!_pollTimer) _pollTimer = setInterval(() => { if (typeof window !== "undefined" && window.__swekPollsPaused) return; if (root && root.style.display !== "none") refresh(); }, 4000);
        return status();
    }
    // v3237 -- *** "HIDDEN" AND "NOT NEEDED" ARE DIFFERENT CLAIMS AND hide() COLLAPSED THEM. ***
    // hide() stops the poll timer AND cancels the rAF as well as hiding the element -- correct when nobody is
    // looking, wrong when somebody is reading the DATA without wanting the overlay. ui/pipboyWireframe.js was
    // doing exactly that: installPeerRadar() is a SINGLETON, so the Pip-Boy took the shared radar, called hide()
    // on it, and then drew from a radar it had just switched off. Its canvas kept animating its sweep and range
    // rings over a field that could never update, so AN EMPTY RADAR AND A STOPPED RADAR LOOKED IDENTICAL --
    // which is why pipboyWireframe's header could claim "RADAR reuses the shared window.peerRadar (same
    // blips/modes)" and be wrong for as long as it has existed. KEITH SPOTTED IT ON THE RIG; NOTHING IN THE CODE
    // COULD HAVE.
    //
    // dockInto() already solved this for the STATUS panel by setting _docked so hide() no-ops -- but it needs a
    // DOM SLOT to move into, and a consumer that wants no overlay at all has nowhere to put it. hideChrome() is
    // that case: THE ELEMENT GOES, THE WORK CONTINUES.
    function hideChrome() {
        if (root) root.style.display = "none";
        return status();
    }

    function hide() {
        if (_docked) return status();   // v1559 — when docked into the STATUS panel it stays put
        if (root) root.style.display = "none";
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = 0; }
        if (_raf) { cancelAnimationFrame(_raf); _raf = 0; }
        return status();
    }
    // v1559 — relocate the radar from its fixed bottom-right corner into a host element
    // (the STATUS panel title bar). It becomes a normal inline-flow child, pinned visible.
    function dockInto(el, size) {
        if (!el || !el.appendChild) return (window.peerRadar || null);
        if (!root) build();
        _docked = true;
        _dockEl = el;   // remember the slot so we can re-assert if a STATUS rebuild orphans us
        const S = Math.max(60, size || 88); _dockSize = S;
        try {
            el.style.display = "flex"; el.style.alignItems = "center";
            Object.assign(root.style, { position: "relative", right: "auto", bottom: "auto", left: "auto", top: "auto",
                width: S + "px", height: S + "px", zIndex: "1", marginLeft: "auto", flex: "0 0 auto" });
            root.style.display = "none";   // force show()'s full start path below
            el.appendChild(root);
        } catch {}
        try { show(); } catch {}
        // v2708 — the disappears-after-load bug: the STATUS panel rebuilds after first paint and replaces the slot,
        // orphaning the radar into a detached node. Re-assert once a second: if we're docked but no longer a child of a
        // live slot, re-append to the current one (hud.radarSlot follows the rebuild). A no-op while we stay attached.
        if (!_reDockTimer) {
            _reDockTimer = setInterval(() => {
                if (!_docked || !root) return;
                const slot = (typeof window !== "undefined" && window.hud && window.hud.radarSlot) || _dockEl;
                if (slot && slot.isConnected && root.parentNode !== slot) {
                    try { slot.appendChild(root); if (root.style.display === "none") show(); } catch {}
                }
            }, 1000);
        }
        return window.peerRadar;
    }
    function toggle() { return (root && root.style.display !== "none") ? hide() : show(); }
    function status() { return { ok: true, visible: !!(root && root.style.display !== "none"), mode: _mode, blips: blips.size, pinned: _pinned }; }
    function setExternal(list) { external = Array.isArray(list) ? list : []; if (root && root.style.display !== "none") refresh(); return status(); }
    function setMode(m) {
        if (!MODES.includes(m) || m === _mode) return status();
        _mode = m; blips.clear();   // fresh scan in the new mode
        if (_modeBtn) _modeBtn.textContent = MODE_LABEL[_mode];
        _applyCompassMode();   // v1737 - swap the compass overlay in/out of the scope
        if (root && root.style.display !== "none") scan();
        return status();
    }
    // v1737 - compass mode: hide the scan scope and host a GyroCompass (heading + floor-plane gyro) inside the radar.
    function _applyCompassMode() {
        const on = (_mode === "compass");
        try {
            if (_compassHost) _compassHost.style.display = on ? "flex" : "none";
            if (_svgEl) _svgEl.style.display = on ? "none" : "block";
            if (on && !_gyro && _compassHost) {
                import("./gyroCompass.js").then((m) => { if (_mode === "compass" && !_gyro && _compassHost) { _gyro = new m.GyroCompass({ camera: (typeof window !== "undefined" ? window.camera : null), size: 200 }); _gyro.mount(_compassHost); } }).catch(() => {});
            } else if (!on && _gyro) { try { _gyro.unmount(); } catch {} _gyro = null; }
        } catch {}
    }
    function addKind(kind, def) { if (kind && def) KINDS[kind] = Object.assign({ ring: 0.5, color: "#888", glyph: "\u25CF", label: kind }, def); }

    // v1539 — clickable network panel (from the footer label). Peer details + quick controls.
    let _netPanel = null, _netTimer = 0;
    function _ago(ts) { const t = (typeof ts === "number") ? ts : Date.parse(ts); if (!Number.isFinite(t)) return "unknown"; const s = Math.max(0, Math.round((Date.now() - t) / 1000)); if (s < 60) return s + "s ago"; if (s < 3600) return Math.round(s / 60) + "m ago"; return Math.round(s / 3600) + "h ago"; }   // v1606 — guard non-numeric ts (was rendering "NaNh ago")
    async function openNetworkPanel() {
        if (_netPanel) { try { document.body.removeChild(_netPanel); } catch {} _netPanel = null; return; }   // toggle
        const ov = document.createElement("div");
        ov.style.cssText = "position:fixed;inset:0;z-index:9200;background:rgba(2,8,14,0.72);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;font:12px ui-monospace,monospace;";   // v1733 - above the dock (9086) + STATUS (9090) so it reads over the gauges
        const box = document.createElement("div");
        box.style.cssText = "width:min(560px,92vw);max-height:82vh;overflow:auto;background:#08121a;border:1px solid #1c4a5e;border-radius:12px;padding:16px 18px;box-shadow:0 18px 60px rgba(0,0,0,.6);color:#cfe7f5;";
        ov.appendChild(box); _netPanel = ov;
        const close = () => { try { clearInterval(_netTimer); } catch {} _netTimer = 0; try { document.body.removeChild(ov); } catch {} _netPanel = null; };
        ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
        const head = document.createElement("div"); head.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;";
        const h = document.createElement("div"); h.textContent = "Network peers"; h.style.cssText = "font-size:15px;font-weight:bold;color:#7fdfff;flex:1;";
        const rescan = document.createElement("button"); rescan.textContent = "\u21bb Rescan"; rescan.style.cssText = "background:#10293a;color:#9ed5ff;border:1px solid #245;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit;";
        const x = document.createElement("button"); x.textContent = "\u2715"; x.style.cssText = "background:#1a1014;color:#f88;border:1px solid #422;border-radius:6px;padding:4px 9px;cursor:pointer;font:inherit;";
        x.onclick = close; rescan.onclick = () => render();
        head.append(h, rescan, x); box.appendChild(head);
        // v1541 — target selector: point the services + transmit meters at this node or a peer.
        let _target = "";
        const tb = (path) => (_target ? _target.replace(/\/+$/, "") : "") + path;
        const fmtBps = (b) => { b = b || 0; if (b < 1024) return b + " B/s"; if (b < 1048576) return (b / 1024).toFixed(1) + " KB/s"; return (b / 1048576).toFixed(2) + " MB/s"; };
        const ipOnly = (u) => { try { return new URL(u).hostname; } catch { return String(u || "").replace(/^https?:\/\//, "").replace(/[:\/].*/, ""); } };
        const _ipLabels = {};   // ip -> friendly host label (from discovered peers)
        const ipLabel = (ip) => _ipLabels[ip] || ip;
        const tgtRow = document.createElement("div"); tgtRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:11px;color:#8fb3c8;";
        const tgtLbl = document.createElement("span"); tgtLbl.textContent = "Target:"; tgtLbl.style.flex = "none";
        const tgtSel = document.createElement("select"); tgtSel.style.cssText = "flex:1;background:#0c1822;color:#cfe7f5;border:1px solid #245;border-radius:6px;padding:4px 6px;font:inherit;";
        const o0 = document.createElement("option"); o0.value = ""; o0.textContent = "This node"; tgtSel.appendChild(o0);
        tgtSel.onchange = () => { _target = tgtSel.value; renderServices(); poll(); };
        tgtRow.append(tgtLbl, tgtSel); box.appendChild(tgtRow);
        const activity = document.createElement("div"); activity.style.cssText = "font-size:11px;color:#8fb3c8;margin-bottom:4px;min-height:14px;"; box.appendChild(activity);
        const barWrap = document.createElement("div"); barWrap.style.cssText = "height:5px;border-radius:3px;background:#0e2230;overflow:hidden;margin-bottom:8px;opacity:.35;transition:opacity .3s;"; const bar = document.createElement("div"); bar.style.cssText = "height:100%;width:0%;background:linear-gradient(90deg,#2bd6ff,#7fe9c0);transition:width .4s;"; barWrap.appendChild(bar); box.appendChild(barWrap);
        const clientsLine = document.createElement("div"); clientsLine.style.cssText = "font-size:10px;color:#b69bff;margin-bottom:10px;min-height:12px;"; box.appendChild(clientsLine);
        const list = document.createElement("div"); box.appendChild(list);
        const note = document.createElement("div"); note.style.cssText = "margin-top:12px;font-size:10px;color:#5f7488;line-height:1.5;border-top:1px solid #14303e;padding-top:8px;";
        note.textContent = "Pick a Target to manage this node or a peer: service toggles + the live transmit meter (per-link, by remote IP) follow the selection. Meters show each node's inbound links; what you pull FROM a peer shows on that peer's meter.";
        box.appendChild(note);
        document.body.appendChild(ov);
        async function render() {
            list.innerHTML = "<div style='color:#8fb3c8;'>scanning\u2026</div>";
            try {
            let discovered = [], saved = [], savedMeta2 = [], prog = null;
            { const j = await _fetchJSON("/sync/discovered", 4000); if (j && j.ok) discovered = j.discovered || []; }
            { const j = await _fetchJSON("/sync/peers", 4000); if (j && j.ok) { savedMeta2 = (j.peers || []).map(p => (typeof p === "string" ? { url: p } : p)).filter(p => p && p.url); saved = savedMeta2.map(p => p.url); } }
            { const j = await _fetchJSON("/sync/progress", 4000); if (j && j.ok) prog = j; }
            await loadNames();   // v1616 — fresh ip->name table for the rows + selector below
            const pr = prog && prog.progress;
            if (pr && pr.active) activity.textContent = "\u21c5 syncing: " + (pr.note || ((pr.done || 0) + "/" + (pr.total || "?") + " files"));
            else activity.textContent = (prog && prog.lastAuto) ? ("last model sync " + _ago(prog.lastAuto)) : "no sync in progress";
            list.innerHTML = "";
            // v1611 — merge THREE sources so configured AND currently-connected boxes always show, labeled by
            // IP, even when UDP discovery is empty (Wi-Fi AP isolation) or a peer changed IP. The IP is the
            // name; no hand-assigned Saved Name is required. discovered = UDP beacon; saved = configured peers;
            // linked = active inbound links from /net/stats (the boxes actually talking to this node right now).
            let _linkIps = [], _selfIps = [];
            { const j = await _fetchJSON("/net/stats", 4000); if (j && j.ok) _linkIps = (j.peers || []).map(pp => pp && pp.ip).filter(Boolean); }
            { const j = await _fetchJSON("/net/info", 4000); if (j) _selfIps = (j.lanIps || []).map(String); }
            const _norm = (u) => String(u || "").replace(/\/+$/, "");
            const _self = new Set(_selfIps);
            // v1612 — exclude loopback AND this box's own LAN IP(s); a browser on .40 viewing .40 shows up as an
            // inbound link from 192.168.50.40, which is SELF, not a peer.
            const _isLoop = (ip) => /^(::1|127\.|0\.0\.0\.0|localhost)/i.test(String(ip || "")) || _self.has(String(ip));
            const _byUrl = new Map();
            for (const p of discovered) { const u = _norm(p.url); if (u) _byUrl.set(u, { url: u, caps: p.caps || {}, lastSeen: p.lastSeen, src: "discovered" }); }
            for (const u0 of saved) { const u = _norm(u0); if (u && !_byUrl.has(u)) _byUrl.set(u, { url: u, caps: {}, src: "saved" }); }
            for (const ip of _linkIps) { if (_isLoop(ip)) continue; const u = "http://" + ip + ":8787"; if (_byUrl.has(u)) _byUrl.get(u).linked = true; else _byUrl.set(u, { url: u, caps: {}, src: "linked", linked: true }); }
            // v1734 - fold in the server's sticky presence list so a peer that briefly dropped from discovery/links (but was
            // seen within the grace window) stays in the panel instead of flickering out.
            { const pj = await _fetchJSON("/peer/list", 4000); if (pj && pj.ok && Array.isArray(pj.peers)) { for (const pp of pj.peers) { const u = _norm(pp && pp.url); if (u && !_byUrl.has(u)) _byUrl.set(u, { url: u, caps: {}, src: pp.remembered ? "remembered" : "linked", linked: !pp.remembered }); } } }
            discovered = [..._byUrl.values()];   // reassign so the rest of render() uses the merged list
            discovered = discovered.filter(function(e){ return _isLanPeer(e.url); });   // v1853 — drop public hosts (api.github.com etc.) from every source
            // v1846 — collapse the SAME machine seen at multiple IPs into ONE row, keyed by its stable
            // identity id (caps.id = sha256(secret)[:16], survives IP changes) resolved from the saved-peer
            // annotations too. One box on two IPs (e.g. Galaxina at .8 and .54, or a leftover Docker-era IP)
            // becomes a single entry; the richest one (discovered/linked, with caps) wins.
            { const _sIds = new Map(); for (const p of savedMeta2) if (p.url && p.id) _sIds.set(_norm(p.url), p.id);
              const _rank = (e) => (e.caps && e.caps.host ? 4 : 0) + (e.linked ? 3 : 0) + (e.src === "discovered" ? 2 : 0) + (e.src === "saved" ? 0 : 1);
              const _byId = new Map(); const _passthru = [];
              for (const e of discovered) { const id = (e.caps && e.caps.id) || _sIds.get(_norm(e.url)); if (!id) { _passthru.push(e); continue; } const prev = _byId.get(id); if (!prev || _rank(e) > _rank(prev)) { if (prev && prev.linked) e.linked = true; _byId.set(id, e); } else if (e.linked) prev.linked = true; }
              discovered = _passthru.concat([..._byId.values()]);
            }
            if (!discovered.length) { list.innerHTML = "<div style='color:#8fb3c8;'>no peers discovered, saved, or linked \u2014 is network discovery on? (Settings \u2192 Network / mDNS)</div>"; return; }
            discovered.sort((a, b) => String(a.url || "").localeCompare(String(b.url || "")));
            // rebuild the target selector + ip->label map from discovered peers (keep current pick)
            const prevT = tgtSel.value; tgtSel.innerHTML = "";
            const oo = document.createElement("option"); oo.value = ""; oo.textContent = "This node"; tgtSel.appendChild(oo);
            for (const p of discovered) { const u = (p.url || "").replace(/\/+$/, ""); if (!u) continue; const host = _gname[ipOnly(u)] || (p.caps && p.caps.host) || hostOf(u); _ipLabels[ipOnly(u)] = host; const o = document.createElement("option"); o.value = u; o.textContent = host + " \u00b7 " + ipOnly(u); tgtSel.appendChild(o); }
            if ([...tgtSel.options].some(o => o.value === prevT)) tgtSel.value = prevT; _target = tgtSel.value;
            for (const p of discovered) {
                const url = p.url || ""; const caps = p.caps || {};
                const row = document.createElement("div"); row.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 6px;border-bottom:1px solid #112733;";
                const dot = document.createElement("span"); dot.style.cssText = "width:9px;height:9px;border-radius:50%;flex:none;background:" + (caps.gpu ? "#9fe88f" : "#2bd6ff") + ";";
                const main = document.createElement("div"); main.style.cssText = "flex:1;min-width:0;";
                const t1 = document.createElement("div"); t1.style.cssText = "color:#dceaf5;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
                t1.textContent = (_gname[ipOnly(url)] || caps.host || hostOf(url)) + (caps.version ? "  \u00b7 v" + caps.version : "") + (caps.gpu ? "  \u00b7 GPU" : "");
                const t2 = document.createElement("div"); t2.style.cssText = "color:#6f8aa0;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
                t2.textContent = url + "  \u00b7 " + (p.linked ? "linked" : (p.src || (saved.includes(url) ? "saved" : "discovered"))) + (p.lastSeen ? ("  \u00b7 " + _ago(p.lastSeen)) : "");
                main.append(t1, t2);
                const assetN = document.createElement("span"); assetN.style.cssText = "color:#7fe9c0;font-size:10px;flex:none;";
                const open = document.createElement("button"); open.textContent = "Open"; open.style.cssText = "background:#10293a;color:#9ed5ff;border:1px solid #245;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit;flex:none;";
                open.onclick = () => { try { window.open(url.replace(/\/+$/, "") + "/server.html", "_blank", "noopener"); } catch {} };
                row.append(dot, main, assetN, open); list.appendChild(row);
                fetch(url.replace(/\/+$/, "") + "/sync/status", { cache: "no-store" }).then(r => r.json()).then(s => { const n = s && (s.count != null ? s.count : (s.models != null ? s.models : (s.files != null ? s.files : null))); if (n != null) assetN.textContent = n + " assets"; }).catch(() => {});
            }
            } catch (e) {
                // never leave the panel stuck on "scanning…" — show what went wrong instead.
                list.innerHTML = "<div style='color:#caa05a;'>couldn't finish the peer scan: " + String(e && e.message || e) + "</div>";
            }
        }
        // v1541 — live transmit meter for the selected target (its inbound links, by remote IP).
        const txWrap = document.createElement("div"); txWrap.style.cssText = "margin-top:12px;border-top:1px solid #14303e;padding-top:10px;";
        const txTitle = document.createElement("div"); txTitle.textContent = "Transmit (live)"; txTitle.style.cssText = "font-size:11px;color:#7fdfff;font-weight:bold;margin-bottom:6px;";
        const txSummary = document.createElement("div"); txSummary.style.cssText = "font-size:12px;color:#cfe2f0;margin-bottom:6px;";
        const torrentLine = document.createElement("div"); torrentLine.style.cssText = "font-size:11px;color:#7fe0c0;margin-bottom:6px;display:none;";   // v1637 — BiglyBT throughput (this node only)
        const txList = document.createElement("div"); txWrap.append(txTitle, txSummary, torrentLine, txList); box.insertBefore(txWrap, note);
        // service toggles (target-aware: this node, or a peer via its open /bgsvc + /go2rtc routes).
        const svcWrap = document.createElement("div"); svcWrap.style.cssText = "margin-top:12px;border-top:1px solid #14303e;padding-top:10px;";
        const svcTitle = document.createElement("div"); svcTitle.textContent = "Services"; svcTitle.style.cssText = "font-size:11px;color:#7fdfff;font-weight:bold;margin-bottom:6px;";
        const svcList = document.createElement("div"); svcWrap.append(svcTitle, svcList); box.insertBefore(svcWrap, note);

        // v1840 — Asset edit lock: freeze sync, reorganize GPU_Assets freely, unlock to push deletes/
        // moves to peers. One box at a time across the LAN (a lease). Merge semantics on unlock.
        const lockWrap = document.createElement("div"); lockWrap.style.cssText = "margin-top:12px;border-top:1px solid #14303e;padding-top:10px;";
        const lockTitle = document.createElement("div"); lockTitle.textContent = "Asset edit lock"; lockTitle.style.cssText = "font-size:11px;color:#7fdfff;font-weight:bold;margin-bottom:6px;";
        const lockMsg = document.createElement("div"); lockMsg.style.cssText = "font-size:11px;color:#8fb3c8;margin-bottom:6px;min-height:14px;";
        const lockBtn = document.createElement("button"); lockBtn.style.cssText = "font-size:11px;padding:3px 12px;border-radius:6px;cursor:pointer;background:#14241a;color:#9fe;border:1px solid #2a5a3a;";
        lockWrap.append(lockTitle, lockMsg, lockBtn); box.insertBefore(lockWrap, note);
        let _lockState = { locked: false, mine: false };
        async function refreshLock() {
            try { const j = await _fetchJSON("/sync/lock/status", 4000); if (j && j.ok) _lockState = j; } catch {}
            if (_lockState.locked && _lockState.mine) {
                lockMsg.innerHTML = "<span style='color:#ffd479;'>\uD83D\uDD12 You're editing assets \u2014 sync is paused. Reorganize your GPU_Assets folder (delete / move / rename), then Unlock &amp; push.</span>";
                lockBtn.textContent = "\uD83D\uDD13 Unlock & push to peers"; lockBtn.disabled = false;
                lockBtn.style.background = "#2a1a0a"; lockBtn.style.color = "#ffd479"; lockBtn.style.borderColor = "#6a4a20";
            } else if (_lockState.locked && !_lockState.mine) {
                lockMsg.innerHTML = "<span style='color:#caa05a;'>\uD83D\uDD12 " + ((_lockState.ownerName || _lockState.owner || "another box")) + " is editing assets \u2014 sync is paused until they unlock.</span>";
                lockBtn.textContent = "\uD83D\uDD12 Locked by a peer"; lockBtn.disabled = true;
                lockBtn.style.background = "#241018"; lockBtn.style.color = "#caa05a"; lockBtn.style.borderColor = "#5a3020";
            } else {
                lockMsg.textContent = "Lock to reorganize your GPU_Assets (delete / move / rename) without sync interfering, then unlock to push the changes to peers.";
                lockBtn.textContent = "\uD83D\uDD12 Lock assets for editing"; lockBtn.disabled = false;
                lockBtn.style.background = "#14241a"; lockBtn.style.color = "#9fe"; lockBtn.style.borderColor = "#2a5a3a";
            }
        }
        lockBtn.onclick = async () => {
            lockBtn.disabled = true;
            if (_lockState.locked && _lockState.mine) {
                lockMsg.textContent = "Unlocking + pushing your deletes/moves to peers\u2026";
                try { const r = await fetch("/sync/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(x => x.json());
                    if (r && r.ok) lockMsg.innerHTML = "<span style='color:#9fe88f;'>\u2713 Unlocked. Propagated " + (r.propagated || 0) + " delete(s) to " + (r.peers || 0) + " peer(s). Sync resumed.</span>";
                    else lockMsg.textContent = "\u2717 " + ((r && r.error) || "unlock failed");
                } catch (e) { lockMsg.textContent = "\u2717 " + (e && e.message || e); }
            } else {
                lockMsg.textContent = "Locking assets across the LAN\u2026";
                try { const r = await fetch("/sync/lock", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(x => x.json());
                    if (r && r.ok) lockMsg.innerHTML = "<span style='color:#ffd479;'>\uD83D\uDD12 Locked. Sync is paused \u2014 reorganize your folder now.</span>";
                    else lockMsg.textContent = "\u2717 " + ((r && r.error) || "couldn't lock");
                } catch (e) { lockMsg.textContent = "\u2717 " + (e && e.message || e); }
            }
            setTimeout(refreshLock, 800);
        };
        refreshLock();
        function svcRow(id, label, running, onToggle) {
            const r = document.createElement("div"); r.style.cssText = "display:flex;align-items:center;gap:8px;padding:5px 4px;";
            const d = document.createElement("span"); d.style.cssText = "width:8px;height:8px;border-radius:50%;flex:none;background:" + (running ? "#9fe88f" : "#555f6b") + ";";
            const nm = document.createElement("div"); nm.textContent = label; nm.style.cssText = "flex:1;color:#cfe2f0;font-size:11px;";
            const btn = document.createElement("button"); btn.textContent = running ? "Stop" : "Start"; btn.style.cssText = "background:" + (running ? "#2a1416" : "#16302a") + ";color:" + (running ? "#f8a" : "#9fe88f") + ";border:1px solid " + (running ? "#4a2030" : "#2a4a3a") + ";border-radius:6px;padding:3px 12px;cursor:pointer;font:inherit;flex:none;";
            btn.onclick = () => { btn.disabled = true; btn.textContent = "\u2026"; Promise.resolve(onToggle(!running)).then(() => setTimeout(renderServices, 700)).catch(() => { btn.disabled = false; btn.textContent = running ? "Stop" : "Start"; }); };
            r.append(d, nm, btn); return r;
        }
        async function renderServices() {
            const tname = _target ? ((tgtSel.options[tgtSel.selectedIndex] && tgtSel.options[tgtSel.selectedIndex].textContent) || hostOf(_target)) : "this node";
            svcTitle.textContent = "Services \u2014 " + tname;
            const rows = [];
            try { const j = await fetch(tb("/bgsvc/status"), { cache: "no-store" }).then(r => r.json()); if (j && j.services) for (const id of Object.keys(j.services)) { const s = j.services[id]; rows.push(svcRow(id, s.label || id, !!s.running, (on) => fetch(tb(on ? "/bgsvc/start" : "/bgsvc/stop"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }))); } } catch {}
            try { const g = await fetch(tb("/go2rtc/status"), { cache: "no-store" }).then(r => r.json()); const run = !!(g && (g.running || (g.ok && g.up))); rows.push(svcRow("go2rtc", "go2rtc (cameras)", run, (on) => fetch(tb(on ? "/go2rtc/start" : "/go2rtc/stop"), { method: "POST" }))); } catch {}
            svcList.innerHTML = ""; if (!rows.length) svcList.innerHTML = "<div style='color:#6f8aa0;font-size:10px;'>no managed services detected (or peer unreachable)</div>"; else rows.forEach(r => svcList.appendChild(r));
        }
        async function poll() {
            if (!_netPanel) return;
            if (typeof window !== "undefined" && window.__swekPollsPaused) return;   // v1641 — hold while Settings is open
            let prog = null; { const j = await _fetchJSON("/sync/progress", 4000); if (j && j.ok) prog = j; }
            const pr = prog && prog.progress;
            if (pr && pr.active) { const pct = pr.total ? Math.round((pr.done || 0) / pr.total * 100) : 50; activity.textContent = "\u21c5 syncing " + (pr.note || ((pr.done || 0) + "/" + (pr.total || "?") + " files")) + (pr.total ? "  " + pct + "%" : ""); bar.style.width = pct + "%"; barWrap.style.opacity = "1"; }
            else { activity.textContent = (prog && prog.lastAuto) ? ("last model sync " + _ago(prog.lastAuto)) : "no sync in progress"; bar.style.width = "0%"; barWrap.style.opacity = "0.35"; }
            let roster = []; try { roster = (typeof window.phoneRoster === "function") ? (window.phoneRoster() || []) : []; } catch {}
            const live = roster.filter(c => c && (c.agoMs == null || c.agoMs < 12000));
            clientsLine.textContent = live.length ? ("\uD83D\uDCF1 " + live.length + " control client" + (live.length === 1 ? "" : "s") + ": " + live.map(c => c.name || c.role || "client").join(", ")) : "no phones / TVs connected";
            // live transmit meter for the selected target (its inbound links, attributed by remote IP)
            let ns = null; { const j = await _fetchJSON(tb("/net/stats"), 4000); if (j) ns = j; }
            if (ns && ns.ok) {
                txSummary.textContent = "\u2193 " + fmtBps(ns.inBps) + "     \u2191 " + fmtBps(ns.outBps) + "     \u00b7 " + (ns.sockets || 0) + " links";
                const ps = (ns.peers || []).slice(0, 8);
                txList.innerHTML = "";
                if (!ps.length) txList.innerHTML = "<div style='color:#6f8aa0;font-size:10px;'>no active links</div>";
                else for (const pp of ps) { const r = document.createElement("div"); r.style.cssText = "display:flex;gap:8px;font-size:10px;color:#9fb6c8;padding:2px 4px;"; const a = document.createElement("span"); a.style.cssText = "flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"; a.textContent = ipLabel(pp.ip); const bb = document.createElement("span"); bb.style.flex = "none"; bb.textContent = "\u2193" + fmtBps(pp.inBps) + "  \u2191" + fmtBps(pp.outBps); r.append(a, bb); txList.appendChild(r); }
            } else { txSummary.textContent = "(no /net/stats \u2014 target on an older build?)"; txList.innerHTML = ""; }
            // v1637 — BiglyBT throughput, shown only for this node (torrents are this box's own activity).
            if (!_target) {
                try { const tj = await fetch("/torrent/status", { cache: "no-store" }).then(r => r.json()); if (tj && tj.ok && tj.session && (tj.session.down || tj.session.up || tj.count)) { torrentLine.style.display = "block"; torrentLine.textContent = "\uD83E\uDDF2 torrents  \u2193 " + fmtBps(tj.session.down) + "    \u2191 " + fmtBps(tj.session.up) + "    \u00b7 " + tj.count + " (" + (tj.session.active || 0) + " active)"; } else torrentLine.style.display = "none"; } catch { torrentLine.style.display = "none"; }
            } else torrentLine.style.display = "none";
        }
        render(); renderServices(); poll(); _netTimer = setInterval(() => { poll(); try { refreshLock(); } catch {} }, 1500);
    }

    window.peerRadar = { _installed: true, show, hide, hideChrome, toggle, scan, ping, refresh, status, setMode, mode: () => _mode, setExternal, addKind, openPanel: openNetworkPanel, dockInto, _blips: blips, _kinds: KINDS };
    return window.peerRadar;
}
