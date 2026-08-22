// FILE: ui/kaijuStaminaHud.js
// VERSION: v1
//
// Round 124 — first-person kaiju drive stamina indicator. Lives in the
// lower-left corner of the screen and shows the controlled kaiju's
// stamina (0..1) as a horizontal bar with a label naming the kaiju
// being driven.
//
// Display is gated by camera.mode === "kaiju_drive" — appears when the
// player enters drive mode, vanishes when they exit. The bar color
// shifts from green (full stamina) through yellow (>0.25) to red
// (<0.25) so the player gets a glance-level read on whether to
// keep sprinting.
//
// Polls camera + kaiju each frame from main.js's update loop via
// the .update() method. Zero-allocation in the hot path: DOM updates
// only when the visible state changes (mode, name, or coarse
// stamina bucket).

export class KaijuStaminaHud {

    constructor(camera, canvas = null) {
        this.camera = camera;
        // v777 — canvas-relative crosshair positioning. If no canvas
        // provided, falls back to viewport-center which is wrong when
        // the canvas isn't full-window.
        this.canvas = canvas;
        this._lastMode    = null;
        this._lastName    = null;
        this._lastStamPct = -1;     // rounded to int percent for cheap diff

        // v795 — hit-flash overlay. Full-viewport red vignette via inset
        // box-shadow. Becomes visible (opacity 1 → 0 over 300ms) when the
        // driven kaiju takes damage. Updated from the kaiju's _lastHitMs
        // timestamp in update().
        const flash = document.createElement("div");
        flash.id = "kaiju-hit-flash";
        Object.assign(flash.style, {
            position: "fixed",
            inset: "0",
            pointerEvents: "none",
            zIndex: "1090",
            boxShadow: "inset 0 0 120px 40px rgba(255, 40, 30, 0.75)",
            opacity: "0",
            transition: "opacity 80ms linear",
        });
        document.body.appendChild(flash);
        this.hitFlash = flash;
        this._hitFlashAt = 0;
        this._lastHitMs  = 0;        // last known kaiju._lastHitMs we processed

        // ---- DOM ----
        const root = document.createElement("div");
        root.id = "kaiju-stamina-hud";
        Object.assign(root.style, {
            position: "fixed",
            left:     "18px",
            bottom:   "18px",
            padding:  "8px 12px",
            background: "rgba(0, 0, 0, 0.55)",
            border:   "1px solid rgba(140, 200, 255, 0.4)",
            borderRadius: "6px",
            fontFamily: "monospace",
            fontSize: "12px",
            color:    "#cfd",
            zIndex:   "1100",
            display:  "none",                  // hidden until kaiju_drive
            pointerEvents: "none",
            minWidth: "200px",
        });
        const label = document.createElement("div");
        label.style.marginBottom = "5px";
        label.style.fontWeight = "bold";
        label.style.color = "#9cf";
        label.textContent = "kaiju drive";
        root.appendChild(label);

        // v774 (round 31) — STAMINA label + bar
        const stamLabel = document.createElement("div");
        Object.assign(stamLabel.style, {
            fontSize: "10px",
            color: "#9ec",
            marginBottom: "2px",
            letterSpacing: "0.05em",
        });
        stamLabel.textContent = "STAMINA";
        root.appendChild(stamLabel);

        const barTrack = document.createElement("div");
        Object.assign(barTrack.style, {
            width: "180px",
            height: "8px",
            background: "rgba(40, 40, 40, 0.8)",
            border: "1px solid rgba(80, 80, 80, 0.8)",
            borderRadius: "3px",
            overflow: "hidden",
            position: "relative",
        });
        const barFill = document.createElement("div");
        Object.assign(barFill.style, {
            position: "absolute",
            left: "0", top: "0", bottom: "0",
            width: "100%",
            background: "#4f9",            // updated per tick
            transition: "width 80ms linear",
        });
        barTrack.appendChild(barFill);
        root.appendChild(barTrack);

        // v774 (round 31) — WEAPON ENERGY label + bar
        const energyLabel = document.createElement("div");
        Object.assign(energyLabel.style, {
            fontSize: "10px",
            color: "#9cf",
            marginTop: "6px",
            marginBottom: "2px",
            letterSpacing: "0.05em",
        });
        energyLabel.textContent = "ENERGY";
        root.appendChild(energyLabel);

        const energyTrack = document.createElement("div");
        Object.assign(energyTrack.style, {
            width: "180px",
            height: "8px",
            background: "rgba(40, 40, 40, 0.8)",
            border: "1px solid rgba(80, 80, 80, 0.8)",
            borderRadius: "3px",
            overflow: "hidden",
            position: "relative",
        });
        const energyFill = document.createElement("div");
        Object.assign(energyFill.style, {
            position: "absolute",
            left: "0", top: "0", bottom: "0",
            width: "100%",
            background: "#4cf",            // cyan baseline; recolored per tick
            transition: "width 80ms linear",
        });
        energyTrack.appendChild(energyFill);
        root.appendChild(energyTrack);

        const hint = document.createElement("div");
        Object.assign(hint.style, {
            marginTop: "6px",
            fontSize: "10px",
            opacity: "0.6",
            color: "#ace",
        });
        hint.textContent = "WASD move · Shift sprint · Space jump · LMB fire · K exit";
        root.appendChild(hint);

        document.body.appendChild(root);
        this.root = root;
        this.label = label;
        this.barFill = barFill;
        this.energyFill = energyFill;
        this.energyTrack = energyTrack;
        this._lastEnergyPct = -1;
        this._lastFireMs = 0;

        // v775 (round 31 polish) — crosshair reticle. Small ring + dot
        // at screen center. Visible only in kaiju_drive. Shifts color
        // based on whether the player is over a valid target (managed
        // by the update tick reading k._lastCrosshairHit, set by the
        // camera/HUD readout below).
        const cross = document.createElement("div");
        cross.id = "kaiju-crosshair";
        Object.assign(cross.style, {
            position: "fixed",
            left: "50%",
            top: "50%",
            width: "18px",
            height: "18px",
            marginLeft: "-9px",
            marginTop: "-9px",
            border: "1.5px solid rgba(160, 220, 255, 0.7)",
            borderRadius: "50%",
            pointerEvents: "none",
            zIndex: "1099",
            display: "none",
            boxShadow: "0 0 6px rgba(0,0,0,0.7), inset 0 0 0 5px rgba(0,0,0,0)",
        });
        // Dot in the center via ::after via a child since inline doesn't
        // support pseudo-elements
        const dot = document.createElement("div");
        Object.assign(dot.style, {
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "3px",
            height: "3px",
            marginLeft: "-1.5px",
            marginTop: "-1.5px",
            background: "rgba(220, 240, 255, 0.95)",
            borderRadius: "50%",
        });
        cross.appendChild(dot);
        document.body.appendChild(cross);
        this.cross = cross;
        this.crossRing = cross;   // alias so update() reads clearly

        // v776 — target label below the crosshair. Shows "name · 12m"
        // when the player is aimed at a valid civ/tank, hidden otherwise.
        const targetLabel = document.createElement("div");
        Object.assign(targetLabel.style, {
            position: "fixed",
            left: "50%",
            top: "50%",
            marginTop: "16px",            // sits just below the reticle
            transform: "translate(-50%, 0)",
            padding: "2px 8px",
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(140,200,255,0.4)",
            borderRadius: "4px",
            color: "#cfd",
            fontFamily: "monospace",
            fontSize: "11px",
            pointerEvents: "none",
            zIndex: "1099",
            display: "none",
            whiteSpace: "nowrap",
            textShadow: "0 1px 2px rgba(0,0,0,0.8)",
        });
        document.body.appendChild(targetLabel);
        this.targetLabel = targetLabel;
        this._lastTargetName = null;
        this._lastTargetDist = -1;

        // v776 — attack preview line in the main HUD widget. Above the
        // stamina bar; shows the kaiju's current primary attack name +
        // energy cost so the player knows what their click will fire.
        const attackLine = document.createElement("div");
        Object.assign(attackLine.style, {
            fontSize: "10px",
            color: "#fda",
            marginBottom: "6px",
            letterSpacing: "0.04em",
        });
        attackLine.textContent = "—";
        // Insert before the STAMINA label by reaching into root
        root.insertBefore(attackLine, stamLabel);
        this.attackLine = attackLine;
        this._lastAttackText = null;
    }

    update() {
        const cam = this.camera;
        const inMode = (cam?.mode === "kaiju_drive");

        // Mode-change visibility flip
        if (inMode !== (this._lastMode === "kaiju_drive")) {
            this.root.style.display = inMode ? "block" : "none";
            // v775 — crosshair shows/hides with the HUD
            if (this.cross) this.cross.style.display = inMode ? "block" : "none";
            // v776 — target label + attack line follow the same lifecycle
            if (this.targetLabel) this.targetLabel.style.display = "none";   // gated by aim below
            // v782 — audio chime on mode entry / exit
            try {
                if (inMode)                                  window.audio?.play?.("fps_level_start");
                else if (this._lastMode === "kaiju_drive")   window.audio?.play?.("fps_level_clear");
            } catch {}
            this._lastMode = cam.mode;
            // Force redraw on next tick by invalidating cached values
            this._lastName       = null;
            this._lastStamPct    = -1;
            this._lastEnergyPct  = -1;
            this._lastFireMs     = 0;
            this._lastTargetName = null;
            this._lastTargetDist = -1;
            this._lastAttackText = null;
        }
        if (!inMode) return;
        const k = cam._kaijuTarget;
        if (!k) return;

        // v795 — hit-flash. When kaiju._lastHitMs advances past our last
        // observed value, trigger a fresh flash. Opacity then decays
        // linearly over 300ms. Cheap — single DOM style write per frame
        // while flashing, no writes when idle.
        // v798 — per-attack tint: flash color varies with k._lastHitType
        // so different damage types FEEL different (fire flashes orange,
        // ice flashes blue, lightning flashes white, etc.).
        const flashDurMs = 300;
        const nowFlash = (typeof performance !== "undefined") ? performance.now() : Date.now();
        if (k._lastHitMs && k._lastHitMs > this._lastHitMs) {
            this._lastHitMs = k._lastHitMs;
            this._hitFlashAt = nowFlash;
            // v798 — re-tint based on the just-received damage type
            const HIT_FLASH_TINT = {
                "fire":       "255, 130, 30",    // orange
                "ice":        "100, 180, 255",   // cool blue
                "lightning":  "230, 230, 255",   // bright white-blue
                "kinetic":    "255, 80, 60",     // red default
                "energy":     "200, 100, 255",   // magenta
                "acid":       "120, 240, 60",    // sickly green
                "radiation":  "180, 255, 80",    // yellow-green
                "magic":      "220, 100, 255",   // purple
            };
            const rgb = HIT_FLASH_TINT[k._lastHitType] || "255, 40, 30";
            this.hitFlash.style.boxShadow = `inset 0 0 120px 40px rgba(${rgb}, 0.75)`;
        }
        if (this._hitFlashAt) {
            const elapsed = nowFlash - this._hitFlashAt;
            if (elapsed >= flashDurMs) {
                if (this.hitFlash.style.opacity !== "0") this.hitFlash.style.opacity = "0";
                this._hitFlashAt = 0;
            } else {
                const op = (1 - elapsed / flashDurMs).toFixed(2);
                this.hitFlash.style.opacity = op;
            }
        }

        // v776 — auto-exit drive mode if the kaiju we're driving dies.
        // v777 — also show a toast so the player gets an on-screen cue.
        // v788 — 1.5s linger before exit so the death animation reads;
        //        camera stays welded, scene continues to render.
        if (k.isAlive && !k.isAlive()) {
            const nowMs = (typeof performance !== "undefined") ? performance.now() : Date.now();
            if (!this._deathDetectedAt) {
                this._deathDetectedAt = nowMs;
                console.log("[kaiju_drive] controlled kaiju has died — exiting drive mode in 1.5s");
                try { window.toast?.show?.("kaiju has fallen", { kind: "warn", ms: 1500 }); } catch {}
            }
            if (nowMs - this._deathDetectedAt >= 1500) {
                this._deathDetectedAt = null;     // reset for the next entry
                try { cam.setMode?.("observer"); } catch {}
                return;
            }
            // Still lingering — fall through and continue rendering HUD
            // (label / bars dimmed via stamina=0). Don't reset linger state.
        } else if (this._deathDetectedAt) {
            // Edge case: kaiju revived during linger (e.g. via console).
            // Clear the latch so next death detection works.
            this._deathDetectedAt = null;
        }

        // v781 — sprint heading arrow. Shows the committed sprint direction
        // relative to current camera yaw so the player gets visual feedback
        // when free-aiming during sprint. Lazy-created on first sprint.
        const isSprinting = !!cam._sprintActive;
        if (isSprinting && cam._sprintHeading != null) {
            if (!this._sprintArrow) {
                const arrow = document.createElement("div");
                Object.assign(arrow.style, {
                    position: "fixed",
                    left: "50%",
                    top: "50%",
                    width: "44px",
                    height: "44px",
                    marginLeft: "-22px",
                    marginTop: "26px",                // below the reticle
                    pointerEvents: "none",
                    zIndex: "1098",
                    color: "#9eb",
                    fontSize: "22px",
                    textAlign: "center",
                    lineHeight: "44px",
                    textShadow: "0 0 6px rgba(0,0,0,0.8)",
                    transformOrigin: "center",
                });
                arrow.textContent = "↑";
                document.body.appendChild(arrow);
                this._sprintArrow = arrow;
            }
            // Arrow rotation = sprintHeading relative to camera yaw.
            // 0° (up arrow) = running directly forward; +90° = right; -90° = left.
            const relYaw = cam._sprintHeading - cam.yaw;
            // Convert to degrees, rotate the arrow visually
            const deg = (relYaw * 180 / Math.PI);
            this._sprintArrow.style.transform = `rotate(${deg.toFixed(1)}deg)`;
            this._sprintArrow.style.display = "block";
        } else if (this._sprintArrow) {
            this._sprintArrow.style.display = "none";
        }

        // v777 — canvas-relative crosshair positioning. Each frame,
        // read the canvas's bounding rect and put the reticle at its
        // CENTER, not at the viewport center. Falls back to viewport
        // center if no canvas is wired.
        if (this.cross && this.canvas?.getBoundingClientRect) {
            const r = this.canvas.getBoundingClientRect();
            const cx = r.left + r.width  / 2;
            const cy = r.top  + r.height / 2;
            // Note: position uses left/top (NOT transform) so the
            // marginLeft/marginTop -9px centering still works.
            this.cross.style.left = cx + "px";
            this.cross.style.top  = cy + "px";
            if (this.targetLabel) {
                this.targetLabel.style.left = cx + "px";
                this.targetLabel.style.top  = cy + "px";
            }
        }

        // Label = kaiju name + kind. Only update DOM when changed.
        const name = `${k.name || "kaiju"} · ${k.kind || "?"}`;
        if (name !== this._lastName) {
            this.label.textContent = name;
            this._lastName = name;
        }

        // Stamina bar
        const stam = Math.max(0, Math.min(1, k._stamina ?? 1));
        const pct = Math.round(stam * 100);
        if (pct !== this._lastStamPct) {
            this.barFill.style.width = pct + "%";
            // Color: green → yellow → red
            let color;
            if (stam < 0.25)      color = "#f55";
            else if (stam < 0.55) color = "#fc4";
            else                  color = "#4f9";
            this.barFill.style.background = color;
            this._lastStamPct = pct;
        }

        // v774 — Weapon energy bar
        const energy = Math.max(0, Math.min(1, k._weaponEnergy ?? 1));
        const epct = Math.round(energy * 100);
        if (epct !== this._lastEnergyPct) {
            this.energyFill.style.width = epct + "%";
            // Cyan when full → magenta when nearly empty (warns the player)
            let color;
            if (energy < 0.20)      color = "#f4f";   // magenta = depleted
            else if (energy < 0.40) color = "#a8f";   // purple = low
            else                    color = "#4cf";   // cyan = ready
            this.energyFill.style.background = color;
            this._lastEnergyPct = epct;
        }

        // v779 — REFILLING indicator. When energy crashes below 5%
        // (effectively depleted, sustained fire just cut off), show a
        // text tag near the energy bar that pulses until energy
        // climbs back above 30% (enough to fire a couple shots).
        // Latches on at <5%, releases at >30% (hysteresis prevents
        // flicker at threshold).
        if (energy < 0.05 && !this._refillLatch) {
            this._refillLatch = true;
        } else if (energy > 0.30 && this._refillLatch) {
            this._refillLatch = false;
        }
        if (this._refillLatch) {
            if (!this._refillBadge) {
                const badge = document.createElement("div");
                Object.assign(badge.style, {
                    position: "absolute",
                    right: "0",
                    top: "0",
                    fontSize: "9px",
                    color: "#f4f",
                    padding: "0 4px",
                    fontWeight: "bold",
                    letterSpacing: "0.1em",
                    animation: "kaijuRefillPulse 0.7s ease-in-out infinite",
                });
                badge.textContent = "REFILLING";
                this.energyTrack.parentElement?.style && (this.energyTrack.parentElement.style.position = "relative");
                // Place into the HUD root so it's relative to the widget
                this.root.style.position = this.root.style.position || "fixed";
                this.root.appendChild(badge);
                this._refillBadge = badge;
                // Inject the keyframes (idempotent)
                if (!document.getElementById("kaijuRefillPulseKF")) {
                    const style = document.createElement("style");
                    style.id = "kaijuRefillPulseKF";
                    style.textContent = "@keyframes kaijuRefillPulse{0%,100%{opacity:0.45}50%{opacity:1}}";
                    document.head.appendChild(style);
                }
            }
            // v781 — show estimated time to ready (above the 30% release threshold).
            // refillRate = 0.10 + 0.20 * stamina; deficit = 0.30 - energy.
            // ETA in sec = deficit / refillRate.
            const stam = k._stamina ?? 1;
            const refillRate = 0.10 + 0.20 * stam;
            const deficit = Math.max(0, 0.30 - energy);
            const etaSec = (refillRate > 0) ? deficit / refillRate : 99;
            const tag = `REFILLING ${etaSec.toFixed(1)}s`;
            if (this._refillBadge.textContent !== tag) {
                this._refillBadge.textContent = tag;
            }
            this._refillBadge.style.display = "block";
        } else if (this._refillBadge) {
            this._refillBadge.style.display = "none";
        }

        // v775 — fire flash. Detect fire by watching k._lastPlayerFireMs;
        // when it advances past our last-seen value, apply a brief
        // white box-shadow flash to the energy track. The transition
        // back to baseline fades naturally over ~200ms.
        const fireMs = k._lastPlayerFireMs ?? 0;
        if (fireMs && fireMs !== this._lastFireMs) {
            this._lastFireMs = fireMs;
            if (this.energyTrack) {
                this.energyTrack.style.boxShadow = "0 0 10px 2px rgba(255,255,255,0.9), inset 0 0 4px rgba(255,255,255,0.6)";
                this.energyTrack.style.transition = "box-shadow 220ms ease-out";
                // Schedule fade-back
                setTimeout(() => {
                    if (this.energyTrack) this.energyTrack.style.boxShadow = "none";
                }, 50);
            }
        }

        // v777 — cooldown spinner on the reticle. During the 250ms
        // post-fire lockout, dim the crosshair ring and animate its
        // border-color to indicate "wait." Cleaner than a literal
        // spinning arc and handles arbitrary cooldown durations.
        // v778 — more visible: borderColor pulses orange→clear during
        // cooldown so the player can SEE the recharge happening.
        // v780 — color depends on the family just fired: beam=red,
        // aoe=orange, projectile=yellow. v779 cooldowns are family-
        // specific so the indicator window length matches the attack.
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        // Read the family-specific cooldown from the preview (computed earlier this frame)
        const previewFamily = this._lastPreviewFamily;
        const cooldownDuration = (previewFamily === "beam") ? 80
                                : (previewFamily === "aoe") ? 150
                                : 250;
        const cooldownRemainingMs = (fireMs + cooldownDuration) - now;
        if (this.crossRing && cooldownRemainingMs > 0 && cooldownRemainingMs < cooldownDuration) {
            // 0 (just fired) → 1 (cooldown done)
            const t = 1 - (cooldownRemainingMs / cooldownDuration);
            // Family-specific color: beam=red-orange, aoe=orange, projectile=yellow
            const colorBase = (previewFamily === "beam") ? "255, 80, 80"
                            : (previewFamily === "aoe")  ? "255, 130, 50"
                            : "255, 210, 60";
            const alpha = 0.95 * (1 - t * 0.7);   // 0.95 → 0.30
            this.crossRing.style.borderColor = `rgba(${colorBase}, ${alpha.toFixed(2)})`;
            // Slight scale pulse for kinesthetic feedback
            const scale = 1 + 0.15 * (1 - t);
            this.crossRing.style.transform = `scale(${scale.toFixed(3)})`;
        } else if (this.crossRing && this.crossRing.style.transform !== "scale(1)") {
            // Reset post-cooldown — the peek-block above will recolor
            this.crossRing.style.transform = "scale(1)";
        }

        // v776 — crosshair lock indicator + target label + attack preview.
        // Peek what the player is aimed at via the KaijuManager hook
        // (cheap — small N targets, mostly civs).
        const km = (typeof window !== "undefined") ? window.kaijuManager : null;
        const peek = km?.peekCrosshairTarget ? km.peekCrosshairTarget(cam, 60, 3.0) : null;

        if (peek) {
            // Have a target: ring tint reflects mode
            //   markingActive → cyan (you're actively marking via Hold-E, v786)
            //   default       → green (passive aim-acquired)
            if (this.crossRing) {
                this.crossRing.style.borderColor = k._markingActive
                    ? "rgba(110, 220, 255, 0.95)"
                    : "rgba(120, 255, 160, 0.85)";
            }
            const dist = Math.round(peek.dot);
            const tname = peek.name || "target";
            // v782 — lock-acquired ping on rising edge (null → target)
            if (this._lastTargetName === null && tname) {
                try { window.audio?.play?.("highlight"); } catch {}
            }
            if (tname !== this._lastTargetName || dist !== this._lastTargetDist) {
                this.targetLabel.textContent = `${tname} · ${dist}m`;
                this.targetLabel.style.display = "block";
                this._lastTargetName = tname;
                this._lastTargetDist = dist;
            }
        } else {
            // No lock: default blue ring + hide label
            if (this.crossRing) this.crossRing.style.borderColor = "rgba(160, 220, 255, 0.7)";
            if (this._lastTargetName !== null) {
                this.targetLabel.style.display = "none";
                this._lastTargetName = null;
                this._lastTargetDist = -1;
            }
        }

        // v776 — attack preview line: which attack will fire on click
        // and how much energy it'll cost. Tinted red when energy is
        // insufficient so the player sees their click would no-op.
        if (km?.peekPlayerAttack && this.attackLine) {
            const preview = km.peekPlayerAttack(k);
            // v780 — remember family for the cooldown indicator below
            this._lastPreviewFamily = preview?.attack?.family ?? null;
            // v777 — include rotation index "[1/3]" when known
            const rotTag = preview && preview.rotLen > 1
                ? ` [${preview.rotIdx + 1}/${preview.rotLen}]`
                : "";
            const attackText = preview
                ? `${preview.attackName}${rotTag} · cost ${preview.cost.toFixed(2)}`
                : "—";
            // v778 — append "next: <name>" on a second line when rotation has more
            const nextText = (preview?.nextAttackName)
                ? `next: ${preview.nextAttackName}`
                : "";
            const combined = nextText ? `${attackText}\n${nextText}` : attackText;
            if (combined !== this._lastAttackText) {
                // Two-line via innerHTML so we can style the "next" smaller
                if (nextText) {
                    this.attackLine.innerHTML =
                        `${attackText}<br><span style="font-size:9px;opacity:0.65;color:#9be">${nextText}</span>`;
                } else {
                    this.attackLine.textContent = attackText;
                }
                // Red if we can't afford this attack right now
                this.attackLine.style.color = (preview && energy < preview.cost) ? "#f88" : "#fda";
                this._lastAttackText = combined;
            } else if (preview) {
                // Color may need re-evaluating each frame even when text
                // is stable (energy crosses the threshold)
                const wantColor = (energy < preview.cost) ? "#f88" : "#fda";
                if (this.attackLine.style.color !== wantColor) this.attackLine.style.color = wantColor;
            }
        }
    }

    setVisible(v) {
        // Manual override (rarely needed; mode-change handles it).
        this.root.style.display = v ? "block" : "none";
    }
}
