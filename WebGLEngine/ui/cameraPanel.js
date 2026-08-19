// FILE: ui/cameraPanel.js
// VERSION: v2 (v1487 — merged engine + real-camera sources)
//
// The CAMERA panel (Cameras minitab). MERGES two source families behind one
// vertical left toolbar:
//   * ENGINE cameras — the Primary camera + each registered TV-wall screen, with
//     the original TV-wall layout (1x1 / 2x2 / 3x2), snap-primary-to-screen, and
//     reset-to-spawn behavior.
//   * REAL cameras — every go2rtc stream (CloudEdge / RTSP / ONVIF) the box knows
//     about, shown live in the content pane (WebRTC / snapshot / MJPEG), the same
//     feeds the standalone cams.html page uses.
//
// Pick any source from the left rail; the content pane on the right shows it.

export class CameraPanel {
    constructor({ parent, camera, tvWall }) {
        this.camera = camera;
        this.tvWall = tvWall;
        this.spawnState = { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.yaw, pitch: camera.pitch };
        this._lastRefresh = 0;
        this._lastScreenCount = -1;
        this._lastStreamPoll = -1e9;
        this._streams = [];                 // go2rtc stream names
        this._g2 = (typeof location !== "undefined") ? (location.protocol + "//" + location.hostname + ":1984") : "";
        try { this._mode = localStorage.getItem("swek.cams.mode") || "webrtc"; } catch { this._mode = "webrtc"; }
        this._sel = { kind: "engine", key: "primary" };   // engine:primary | engine:<screenIdx> | real:<name>
        this._contentKey = "";              // guards needless iframe reloads
        this._glCanvas = (typeof document !== "undefined") ? document.getElementById("glCanvas") : null;
        this._cap = (typeof document !== "undefined") ? document.createElement("canvas") : null;
        if (this._cap) { this._cap.width = 192; this._cap.height = 108; }
        this._railThumbs = [];              // [{kind,key,el}] live previews in the rail
        this._lastThumbCap = -1e9;
        this._lastRealThumb = -1e9;
        this._build(parent ?? document.body);
    }

    update(tNowMs) {
        if (tNowMs - this._lastRefresh >= 250) { this._lastRefresh = tNowMs; this._refreshEnginePoses(); }
        if (typeof window !== "undefined" && window.__swekPollsPaused) return;   // v1870 — hold network polling (streams + snapshot frames) while Settings is open
        if (tNowMs - this._lastStreamPoll >= 4000) { this._lastStreamPoll = tNowMs; this._pollStreams(); }
        if (this._railThumbs.length) this._refreshThumbs(tNowMs);
    }

    // Live preview wall: engine cams captured from the rendered glCanvas (this runs
    // post-scene in the same rAF, so the drawing buffer is still valid); real cams use
    // go2rtc snapshot frames.
    _refreshThumbs(t) {
        if (t - this._lastThumbCap >= 700 && this._glCanvas && this._cap) {
            this._lastThumbCap = t;
            let ok = false;
            try { this._cap.getContext("2d").drawImage(this._glCanvas, 0, 0, this._cap.width, this._cap.height); ok = true; } catch {}
            if (ok) {
                const cw = this._glCanvas.width || 1, ch = this._glCanvas.height || 1;
                const wallActive = !!(this.tvWall && (this.tvWall.cols > 1 || this.tvWall.rows > 1));
                for (const tt of this._railThumbs) {
                    if (tt.kind !== "engine") continue;
                    const ctx = tt.el.getContext("2d"); if (!ctx) continue;
                    try {
                        const sc = (tt.key !== "primary") ? (this.tvWall.screens[tt.key]) : null;
                        const vp = (wallActive && sc) ? sc.viewport : null;   // [x,y,w,h] GL (bottom-left)
                        if (vp) {
                            const sx = vp[0] / cw * this._cap.width;
                            const syTop = (ch - (vp[1] + vp[3])) / ch * this._cap.height;
                            ctx.drawImage(this._cap, sx, syTop, vp[2] / cw * this._cap.width, vp[3] / ch * this._cap.height, 0, 0, tt.el.width, tt.el.height);
                        } else {
                            ctx.drawImage(this._cap, 0, 0, tt.el.width, tt.el.height);
                        }
                    } catch {}
                }
            }
        }
        if (t - this._lastRealThumb >= 3000) {
            this._lastRealThumb = t;
            for (const tt of this._railThumbs) {
                if (tt.kind !== "real") continue;
                // v1581 - back off when go2rtc (:1984) is down so the console isn't spammed with
                // frame.jpeg connection-refused every 3s. After 3 misses, retry only every 30s; a
                // successful load resets it.
                if (!tt._wired) { tt._wired = true; tt.el.addEventListener("error", () => { tt._fails = (tt._fails || 0) + 1; }); tt.el.addEventListener("load", () => { tt._fails = 0; }); }
                if ((tt._fails || 0) >= 3) { if (t - (tt._lastRetry || 0) < 30000) continue; tt._lastRetry = t; }
                tt.el.src = this._g2 + "/api/frame.jpeg?src=" + encodeURIComponent(tt.key) + "&t=" + Date.now();
            }
        }
    }

    // ---- build -------------------------------------------------------

    _build(parent) {
        const wrap = document.createElement("div");
        Object.assign(wrap.style, {
            position: "absolute", top: "12px", right: "12px",
            background: "rgba(0,0,0,0.62)", border: "1px solid rgba(0,255,220,0.25)",
            borderRadius: "4px", color: "#ddd", fontFamily: "monospace", fontSize: "11px",
            width: "330px", maxWidth: "94vw", height: "100%", maxHeight: "100%",
            boxSizing: "border-box", display: "flex", flexDirection: "column",
            pointerEvents: "auto", userSelect: "none", zIndex: "9100",
        });

        const header = document.createElement("div");
        header.textContent = "\uD83D\uDCF7 Cameras";
        Object.assign(header.style, { fontWeight: "bold", padding: "8px 10px 6px", color: "#0fc", flex: "0 0 auto" });
        wrap.appendChild(header);

        // body: [ left rail | content ]
        const body = document.createElement("div");
        Object.assign(body.style, { display: "flex", flex: "1", minHeight: "0" });
        wrap.appendChild(body);

        this._rail = document.createElement("div");
        Object.assign(this._rail.style, {
            width: "112px", flex: "0 0 auto", borderRight: "1px solid rgba(255,255,255,0.12)",
            overflowY: "auto", padding: "4px 4px 8px", display: "flex", flexDirection: "column", gap: "2px",
        });
        body.appendChild(this._rail);

        this._content = document.createElement("div");
        Object.assign(this._content.style, { flex: "1", minWidth: "0", overflow: "auto", padding: "6px 8px" });
        body.appendChild(this._content);

        parent.appendChild(wrap);
        this._wrap = wrap; this.root = wrap;
        this._rebuildRail();
        this._showContent(true);
    }

    // ---- left rail ---------------------------------------------------

    _railBtn(label, active, onClick, tint, thumb) {
        const b = document.createElement("div");
        Object.assign(b.style, {
            padding: "3px 4px", borderRadius: "3px", cursor: "pointer",
            border: "1px solid " + (active ? (tint || "rgba(0,255,220,0.6)") : "rgba(255,255,255,0.12)"),
            background: active ? "rgba(0,255,220,0.10)" : "transparent",
            display: "flex", flexDirection: "column", gap: "2px",
        });
        if (thumb) {
            let tEl;
            if (thumb.kind === "real") { tEl = document.createElement("img"); tEl.style.cssText = "width:100%;height:52px;object-fit:cover;border-radius:2px;background:#000;display:block;"; }
            else { tEl = document.createElement("canvas"); tEl.width = 96; tEl.height = 54; tEl.style.cssText = "width:100%;height:52px;border-radius:2px;background:#06090d;display:block;"; }
            b.appendChild(tEl);
            this._railThumbs.push({ kind: thumb.kind, key: thumb.key, el: tEl });
        }
        const lab = document.createElement("div");
        lab.textContent = label;
        Object.assign(lab.style, { fontSize: "10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: active ? "#aef" : "#bcd", textAlign: "center" });
        b.appendChild(lab);
        b.addEventListener("click", onClick);
        return b;
    }

    _railHeading(text) {
        const h = document.createElement("div");
        h.textContent = text;
        Object.assign(h.style, { fontSize: "9px", letterSpacing: ".5px", textTransform: "uppercase", color: "#5fae9e", margin: "6px 2px 1px" });
        return h;
    }

    _rebuildRail() {
        this._rail.innerHTML = "";
        this._railThumbs = [];
        // ENGINE sources
        this._rail.appendChild(this._railHeading("Engine"));
        this._rail.appendChild(this._railBtn("Primary",
            this._sel.kind === "engine" && this._sel.key === "primary",
            () => { this._sel = { kind: "engine", key: "primary" }; this._rebuildRail(); this._showContent(true); },
            null, { kind: "engine", key: "primary" }));
        const screens = (this.tvWall && this.tvWall.screens) || [];
        for (let i = 0; i < screens.length; i++) {
            this._rail.appendChild(this._railBtn("Screen " + (i + 1),
                this._sel.kind === "engine" && this._sel.key === i,
                () => { this._sel = { kind: "engine", key: i }; this._rebuildRail(); this._showContent(true); },
                null, { kind: "engine", key: i }));
        }
        // REAL sources (go2rtc)
        this._rail.appendChild(this._railHeading("Cameras"));
        if (!this._streams.length) {
            const none = document.createElement("div");
            none.textContent = "(none)";
            Object.assign(none.style, { fontSize: "9px", color: "#667", padding: "2px 6px" });
            this._rail.appendChild(none);
        } else {
            for (const name of this._streams) {
                this._rail.appendChild(this._railBtn(name,
                    this._sel.kind === "real" && this._sel.key === name,
                    () => { this._sel = { kind: "real", key: name }; this._rebuildRail(); this._showContent(true); },
                    "rgba(255,140,90,0.7)", { kind: "real", key: name }));
            }
        }
        this._lastScreenCount = screens.length;
        this._lastThumbCap = -1e9; this._lastRealThumb = -1e9;   // force a fresh thumb pass
    }

    // ---- content -----------------------------------------------------

    _showContent(force) {
        const key = this._sel.kind + ":" + this._sel.key + ":" + this._mode;
        if (!force && key === this._contentKey) return;
        this._contentKey = key;
        this._content.innerHTML = "";
        if (this._sel.kind === "real") return this._showRealCam(this._sel.key);
        return this._showEngineCam(this._sel.key);
    }

    _showEngineCam(key) {
        const isPrimary = key === "primary";
        const title = document.createElement("div");
        title.textContent = isPrimary ? "Primary camera" : "Screen " + (key + 1);
        Object.assign(title.style, { color: "#0fc", fontWeight: "bold", marginBottom: "4px" });
        this._content.appendChild(title);

        this._poseEl = document.createElement("div");
        Object.assign(this._poseEl.style, { fontSize: "10px", color: "#9cc", fontVariantNumeric: "tabular-nums", marginBottom: "8px" });
        this._content.appendChild(this._poseEl);

        // primary action
        const act = document.createElement("div");
        act.textContent = isPrimary ? "\u21A9 Reset Primary to spawn" : "\u2192 Snap Primary to this screen";
        Object.assign(act.style, { padding: "4px 8px", border: "1px solid rgba(0,255,220,0.4)", borderRadius: "3px", cursor: "pointer", display: "inline-block", marginBottom: "10px" });
        act.addEventListener("click", () => {
            if (isPrimary) this._resetToSpawn();
            else { const s = this.tvWall.screens[key]; if (s) this._snapTo(s.camera); }
        });
        this._content.appendChild(act);

        // TV-wall layout (engine "monitor wall")
        const lh = document.createElement("div"); lh.textContent = "Wall layout:"; Object.assign(lh.style, { fontSize: "10px", opacity: ".7", marginBottom: "3px" });
        this._content.appendChild(lh);
        const row = document.createElement("div"); Object.assign(row.style, { display: "flex", gap: "4px" });
        for (const [label, c, r] of [["1\u00d71", 1, 1], ["2\u00d72", 2, 2], ["3\u00d72", 3, 2]]) {
            const b = document.createElement("div"); b.textContent = label;
            Object.assign(b.style, { padding: "2px 8px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "2px", cursor: "pointer", flex: "1", textAlign: "center" });
            b.addEventListener("click", () => { try { this.tvWall.setLayout(c, r); } catch {} });
            row.appendChild(b);
        }
        this._content.appendChild(row);
        this._refreshEnginePoses();
    }

    _showRealCam(name) {
        const bar = document.createElement("div");
        Object.assign(bar.style, { display: "flex", gap: "4px", alignItems: "center", marginBottom: "6px" });
        const title = document.createElement("div"); title.textContent = name;
        Object.assign(title.style, { color: "#ff9b6b", fontWeight: "bold", flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
        bar.appendChild(title);
        const sel = document.createElement("select");
        Object.assign(sel.style, { background: "#0a0e14", color: "#cde", border: "1px solid #345", borderRadius: "3px", fontSize: "10px" });
        for (const [v, t] of [["webrtc", "Live"], ["snapshot", "Snapshot"], ["mjpeg", "MJPEG"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; if (v === this._mode) o.selected = true; sel.appendChild(o); }
        sel.onchange = () => { this._mode = sel.value; try { localStorage.setItem("swek.cams.mode", this._mode); } catch {} this._showContent(true); };
        bar.appendChild(sel);
        const big = document.createElement("div"); big.textContent = "\u26F6"; big.title = "Fullscreen";
        Object.assign(big.style, { cursor: "pointer", padding: "1px 5px", border: "1px solid #345", borderRadius: "3px" });
        big.addEventListener("click", () => this._openBig(name));
        bar.appendChild(big);
        this._content.appendChild(bar);

        const enc = encodeURIComponent(name);
        const viewer = document.createElement("div");
        Object.assign(viewer.style, { width: "100%", borderRadius: "4px", overflow: "hidden", background: "#000", aspectRatio: "16/9" });
        if (this._mode === "snapshot") {
            const img = document.createElement("img"); img.style.cssText = "width:100%;height:100%;object-fit:contain;";
            let _snapFails = 0; img.addEventListener("error", () => { _snapFails++; }); img.addEventListener("load", () => { _snapFails = 0; });
            const tick = () => { if (_snapFails >= 3 && Date.now() - (this._snapLastRetry || 0) < 30000) return; if (_snapFails >= 3) this._snapLastRetry = Date.now(); img.src = this._g2 + "/api/frame.jpeg?src=" + enc + "&t=" + Date.now(); };   // v1581 - same go2rtc backoff
            tick(); this._snapTimer && clearInterval(this._snapTimer); this._snapTimer = setInterval(tick, 2000);
            viewer.appendChild(img);
        } else if (this._mode === "mjpeg") {
            const img = document.createElement("img"); img.style.cssText = "width:100%;height:100%;object-fit:contain;"; img.src = this._g2 + "/api/stream.mjpeg?src=" + enc;
            viewer.appendChild(img);
        } else {
            const ifr = document.createElement("iframe"); ifr.allow = "autoplay"; ifr.style.cssText = "width:100%;height:100%;border:0;";
            ifr.src = this._g2 + "/stream.html?src=" + enc + "&mode=webrtc&controls=0";
            viewer.appendChild(ifr);
        }
        this._content.appendChild(viewer);

        const note = document.createElement("div");
        Object.assign(note.style, { fontSize: "9px", color: "#778", marginTop: "5px" });
        note.innerHTML = 'Add/remove cameras in <a href="/cloudedge.html" target="_blank" style="color:#9bd6ff">camera setup</a> (CloudEdge / RTSP / ONVIF).';
        this._content.appendChild(note);
    }

    _openBig(name) {
        const enc = encodeURIComponent(name);
        const ov = document.createElement("div");
        Object.assign(ov.style, { position: "fixed", inset: "0", background: "rgba(0,0,0,0.92)", zIndex: "10000", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" });
        const close = document.createElement("div"); close.textContent = "\u00d7 close"; Object.assign(close.style, { color: "#cde", cursor: "pointer", alignSelf: "flex-end", padding: "10px 16px" }); close.onclick = () => ov.remove();
        const ifr = document.createElement("iframe"); ifr.allow = "autoplay"; Object.assign(ifr.style, { width: "92vw", height: "82vh", border: "0", borderRadius: "6px" });
        ifr.src = this._g2 + "/stream.html?src=" + enc + "&mode=" + (this._mode === "snapshot" ? "webrtc" : this._mode);
        ov.append(close, ifr); document.body.appendChild(ov);
    }

    // ---- data --------------------------------------------------------

    _refreshEnginePoses() {
        if (this._sel.kind !== "engine" || !this._poseEl) return;
        const cam = this._sel.key === "primary" ? this.camera : (this.tvWall.screens[this._sel.key] && this.tvWall.screens[this._sel.key].camera);
        if (!cam) return;
        const p = cam.position;
        this._poseEl.textContent = "pos " + p.x.toFixed(0) + ", " + p.y.toFixed(0) + ", " + p.z.toFixed(0) + "  yaw " + (cam.yaw || 0).toFixed(2);
        // rebuild the rail if the screen count changed
        const sc = (this.tvWall && this.tvWall.screens || []).length;
        if (sc !== this._lastScreenCount) this._rebuildRail();
    }

    async _pollStreams() {
        let names = [];
        try {
            const s = await fetch("/go2rtc/streams", { cache: "no-store" }).then(r => r.json());
            names = (s && s.streams) || [];
        } catch {}
        const changed = names.length !== this._streams.length || names.some((n, i) => n !== this._streams[i]);
        this._streams = names;
        if (changed) this._rebuildRail();
    }

    _snapTo(otherCam) {
        this.camera.position.x = otherCam.position.x;
        this.camera.position.y = otherCam.position.y;
        this.camera.position.z = otherCam.position.z;
        this.camera.yaw = otherCam.yaw; this.camera.pitch = otherCam.pitch;
    }

    _resetToSpawn() {
        const s = this.spawnState;
        this.camera.position.x = s.x; this.camera.position.y = s.y; this.camera.position.z = s.z;
        this.camera.yaw = s.yaw; this.camera.pitch = s.pitch;
    }
}
