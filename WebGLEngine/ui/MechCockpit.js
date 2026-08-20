// FILE: ui/MechCockpit.js
// Round 40 — FP-mode cockpit overlay. Heavy-industrial Jaeger-style
// frame: brow with status + warning lights, console with EJECT button,
// side rails with rivets. All HTML/CSS — sits on top of the canvas as
// a non-interactive frame (pointer-events: none) except for the EJECT
// button itself (clickable). Visible only in FP mode.

export class MechCockpit {

    constructor() {
        this.visible = false;
        this.flashState = false;     // alternating tick for blink animations
        this._flashTimer = 0;

        this._buildDOM();
        this.hide();
    }

    _buildDOM() {
        const root = document.createElement("div");
        root.style.position = "fixed";
        root.style.top = "0";
        root.style.left = "0";
        root.style.width = "100%";
        root.style.height = "100%";
        root.style.pointerEvents = "none";   // canvas remains interactive
        root.style.zIndex = "15000";
        root.style.fontFamily = "ui-monospace, Consolas, monospace";

        // ----- TOP BROW -----
        const brow = document.createElement("div");
        brow.style.position = "absolute";
        brow.style.top = "0";
        brow.style.left = "0";
        brow.style.width = "100%";
        brow.style.height = "62px";
        brow.style.background = "linear-gradient(180deg, #1a1a1a 0%, #2a2a2a 70%, #050505 100%)";
        brow.style.borderBottom = "3px solid #444";
        brow.style.boxShadow = "inset 0 -8px 16px rgba(255, 100, 0, 0.15)";
        brow.style.display = "flex";
        brow.style.alignItems = "center";
        brow.style.padding = "0 24px";
        brow.style.gap = "18px";

        // Status text
        const status = document.createElement("div");
        status.id = "mech-status";
        status.style.color = "#ff6";
        status.style.fontSize = "13px";
        status.style.fontWeight = "bold";
        status.style.letterSpacing = "2.5px";
        status.style.textShadow = "0 0 8px #ff6, 0 0 4px #fa3";
        status.textContent = "JAEGER MK-VII — DRIVERS LINKED";
        brow.appendChild(status);

        // Warning lights (3 indicators)
        const lights = document.createElement("div");
        lights.style.marginLeft = "auto";
        lights.style.display = "flex";
        lights.style.gap = "12px";
        const makeLight = (label, baseColor) => {
            const wrap = document.createElement("div");
            wrap.style.display = "flex";
            wrap.style.flexDirection = "column";
            wrap.style.alignItems = "center";
            wrap.style.fontSize = "9px";
            wrap.style.letterSpacing = "1.4px";
            wrap.style.color = "#aaa";
            const dot = document.createElement("div");
            dot.style.width = "16px";
            dot.style.height = "16px";
            dot.style.borderRadius = "50%";
            dot.style.background = baseColor;
            dot.style.boxShadow = "0 0 6px " + baseColor + ", inset -2px -2px 4px rgba(0,0,0,0.5)";
            dot.style.border = "1.5px solid #222";
            wrap.appendChild(dot);
            const t = document.createElement("div");
            t.textContent = label;
            t.style.marginTop = "2px";
            wrap.appendChild(t);
            return { wrap, dot };
        };
        const armorLight = makeLight("ARMOR", "#3f3");
        const ammoLight  = makeLight("AMMO",  "#3cf");
        const ejectLight = makeLight("EJECT", "#444");
        lights.append(armorLight.wrap, ammoLight.wrap, ejectLight.wrap);
        brow.appendChild(lights);
        this._armorLight = armorLight.dot;
        this._ammoLight  = ammoLight.dot;
        this._ejectLight = ejectLight.dot;

        root.appendChild(brow);

        // ----- BOTTOM CONSOLE -----
        const console = document.createElement("div");
        console.style.position = "absolute";
        console.style.bottom = "0";
        console.style.left = "0";
        console.style.width = "100%";
        console.style.height = "108px";
        console.style.background = "linear-gradient(0deg, #0a0a0a 0%, #1a1a1a 30%, #2c2c2c 80%, #1a1a1a 100%)";
        console.style.borderTop = "3px solid #444";
        console.style.boxShadow = "inset 0 8px 18px rgba(255, 80, 0, 0.12)";
        console.style.display = "flex";
        console.style.alignItems = "center";
        console.style.padding = "10px 28px";
        console.style.gap = "20px";

        // Left gauges
        const gaugeBlock = document.createElement("div");
        gaugeBlock.style.display = "flex";
        gaugeBlock.style.flexDirection = "column";
        gaugeBlock.style.gap = "5px";
        gaugeBlock.style.minWidth = "190px";

        // Energy gauge — bar segment
        const energyRow = document.createElement("div");
        energyRow.style.display = "flex";
        energyRow.style.alignItems = "center";
        energyRow.style.gap = "8px";
        const energyLbl = document.createElement("span");
        energyLbl.textContent = "REACTOR";
        energyLbl.style.color = "#fc8";
        energyLbl.style.fontSize = "10px";
        energyLbl.style.letterSpacing = "1.5px";
        energyLbl.style.minWidth = "60px";
        const energyTrack = document.createElement("div");
        energyTrack.style.width = "120px";
        energyTrack.style.height = "13px";
        energyTrack.style.background = "#000";
        energyTrack.style.border = "1px solid #444";
        energyTrack.style.boxShadow = "inset 0 0 6px rgba(0,0,0,0.8)";
        const energyFill = document.createElement("div");
        energyFill.style.height = "100%";
        energyFill.style.width = "100%";
        energyFill.style.background = "linear-gradient(90deg, #f00, #fa0, #6f6)";
        energyFill.style.transition = "width 0.15s linear";
        energyTrack.appendChild(energyFill);
        energyRow.append(energyLbl, energyTrack);
        gaugeBlock.appendChild(energyRow);
        this._energyFill = energyFill;

        // Bounty display
        const bountyRow = document.createElement("div");
        bountyRow.style.display = "flex";
        bountyRow.style.alignItems = "center";
        bountyRow.style.gap = "8px";
        const bountyLbl = document.createElement("span");
        bountyLbl.textContent = "BOUNTY";
        bountyLbl.style.color = "#fc8";
        bountyLbl.style.fontSize = "10px";
        bountyLbl.style.letterSpacing = "1.5px";
        bountyLbl.style.minWidth = "60px";
        const bountyVal = document.createElement("span");
        bountyVal.textContent = "0";
        bountyVal.style.color = "#fc6";
        bountyVal.style.fontSize = "20px";
        bountyVal.style.fontWeight = "bold";
        bountyVal.style.textShadow = "0 0 6px #fc6";
        bountyRow.append(bountyLbl, bountyVal);
        gaugeBlock.appendChild(bountyRow);
        this._bountyVal = bountyVal;

        console.appendChild(gaugeBlock);

        // Round 41 — weapon block: current name + mode + heat bar
        const weaponBlock = document.createElement("div");
        weaponBlock.style.display = "flex";
        weaponBlock.style.flexDirection = "column";
        weaponBlock.style.gap = "5px";
        weaponBlock.style.minWidth = "200px";
        weaponBlock.style.borderLeft = "1px solid #444";
        weaponBlock.style.paddingLeft = "16px";

        // Weapon name + mode (top row)
        const wRow = document.createElement("div");
        wRow.style.display = "flex";
        wRow.style.alignItems = "baseline";
        wRow.style.gap = "8px";
        const wLbl = document.createElement("span");
        wLbl.textContent = "WEAPON";
        wLbl.style.color = "#fc8";
        wLbl.style.fontSize = "10px";
        wLbl.style.letterSpacing = "1.5px";
        const wName = document.createElement("span");
        wName.textContent = "FIST";
        wName.style.color = "#9cf";
        wName.style.fontSize = "16px";
        wName.style.fontWeight = "bold";
        wName.style.textShadow = "0 0 6px #9cf";
        const wMode = document.createElement("span");
        wMode.textContent = "";
        wMode.style.color = "#fc6";
        wMode.style.fontSize = "11px";
        wMode.style.letterSpacing = "1px";
        wRow.append(wLbl, wName, wMode);
        weaponBlock.appendChild(wRow);
        this._wName = wName;
        this._wMode = wMode;

        // Heat bar (only for big gun)
        const heatRow = document.createElement("div");
        heatRow.style.display = "flex";
        heatRow.style.alignItems = "center";
        heatRow.style.gap = "8px";
        const heatLbl = document.createElement("span");
        heatLbl.textContent = "HEAT";
        heatLbl.style.color = "#fc8";
        heatLbl.style.fontSize = "10px";
        heatLbl.style.letterSpacing = "1.5px";
        heatLbl.style.minWidth = "60px";
        const heatTrack = document.createElement("div");
        heatTrack.style.width = "120px";
        heatTrack.style.height = "11px";
        heatTrack.style.background = "#000";
        heatTrack.style.border = "1px solid #444";
        heatTrack.style.boxShadow = "inset 0 0 6px rgba(0,0,0,0.8)";
        const heatFill = document.createElement("div");
        heatFill.style.height = "100%";
        heatFill.style.width = "0%";
        heatFill.style.background = "linear-gradient(90deg, #fc6, #f80, #f00)";
        heatFill.style.transition = "width 0.1s linear";
        heatTrack.appendChild(heatFill);
        heatRow.append(heatLbl, heatTrack);
        weaponBlock.appendChild(heatRow);
        this._heatFill = heatFill;
        this._heatLbl = heatLbl;

        console.appendChild(weaponBlock);

        // Center spacer
        const spacer = document.createElement("div");
        spacer.style.flex = "1";
        console.appendChild(spacer);

        // EJECT button — big red emergency
        const eject = document.createElement("button");
        eject.id = "mech-eject-btn";
        eject.textContent = "⚠ EJECT ⚠";
        eject.title = "Press X to eject + self-destruct";
        eject.style.pointerEvents = "auto";
        eject.style.background = "radial-gradient(ellipse, #c00, #800)";
        eject.style.color = "#fff";
        eject.style.border = "3px solid #ff0";
        eject.style.borderRadius = "8px";
        eject.style.padding = "12px 22px";
        eject.style.fontFamily = "inherit";
        eject.style.fontSize = "14px";
        eject.style.fontWeight = "bold";
        eject.style.letterSpacing = "2.5px";
        eject.style.cursor = "pointer";
        eject.style.boxShadow = "0 0 20px rgba(255, 0, 0, 0.6), inset 0 -3px 8px rgba(0,0,0,0.4)";
        eject.style.textShadow = "0 0 6px #f00";
        eject.style.transition = "transform 0.08s, box-shadow 0.08s";
        eject.addEventListener("mousedown", () => {
            eject.style.transform = "scale(0.96)";
            eject.style.boxShadow = "0 0 26px rgba(255, 0, 0, 0.95), inset 0 3px 10px rgba(0,0,0,0.6)";
        });
        eject.addEventListener("mouseup", () => {
            eject.style.transform = "";
            eject.style.boxShadow = "0 0 20px rgba(255, 0, 0, 0.6), inset 0 -3px 8px rgba(0,0,0,0.4)";
        });
        eject.addEventListener("click", () => {
            // Caller wires onEject via setEjectHandler
            if (this._onEject) this._onEject();
        });
        console.appendChild(eject);
        this._ejectBtn = eject;

        // Right rivet panel
        const rivets = document.createElement("div");
        rivets.style.display = "flex";
        rivets.style.gap = "5px";
        rivets.style.marginLeft = "auto";
        for (let i = 0; i < 5; i++) {
            const r = document.createElement("div");
            r.style.width = "10px";
            r.style.height = "10px";
            r.style.borderRadius = "50%";
            r.style.background = "radial-gradient(#888, #222)";
            r.style.boxShadow = "inset -1.5px -1.5px 3px rgba(0,0,0,0.7)";
            rivets.appendChild(r);
        }
        console.appendChild(rivets);

        root.appendChild(console);

        // ----- SIDE RAILS -----
        const makeSide = (side) => {
            const s = document.createElement("div");
            s.style.position = "absolute";
            s.style.top = "62px";
            s.style.bottom = "108px";
            s.style[side] = "0";
            s.style.width = "28px";
            s.style.background = "linear-gradient(" + (side === "left" ? "90deg" : "270deg")
                                + ", #1a1a1a 0%, #2a2a2a 60%, #0a0a0a 100%)";
            s.style.boxShadow = "inset " + (side === "left" ? "-" : "")
                              + "4px 0 8px rgba(255, 80, 0, 0.1)";
            // Rivet column
            const col = document.createElement("div");
            col.style.position = "absolute";
            col.style.top = "20px";
            col.style.bottom = "20px";
            col.style[side] = "8px";
            col.style.width = "10px";
            col.style.display = "flex";
            col.style.flexDirection = "column";
            col.style.justifyContent = "space-around";
            for (let i = 0; i < 9; i++) {
                const r = document.createElement("div");
                r.style.width = "9px";
                r.style.height = "9px";
                r.style.borderRadius = "50%";
                r.style.background = "radial-gradient(#999, #222)";
                r.style.boxShadow = "inset -1px -1px 2px rgba(0,0,0,0.7)";
                col.appendChild(r);
            }
            s.appendChild(col);
            return s;
        };
        root.appendChild(makeSide("left"));
        root.appendChild(makeSide("right"));

        // ----- CENTER OVERLAY (eject countdown lives here) -----
        const overlay = document.createElement("div");
        overlay.style.position = "absolute";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.display = "flex";
        overlay.style.flexDirection = "column";
        overlay.style.alignItems = "center";
        overlay.style.justifyContent = "center";
        overlay.style.pointerEvents = "none";
        overlay.style.opacity = "0";
        overlay.style.transition = "opacity 0.3s";
        const warningTxt = document.createElement("div");
        warningTxt.style.color = "#f33";
        warningTxt.style.fontSize = "30px";
        warningTxt.style.fontWeight = "bold";
        warningTxt.style.letterSpacing = "5px";
        warningTxt.style.textShadow = "0 0 16px #f00, 0 0 8px #f80";
        warningTxt.textContent = "WARNING";
        const countdownTxt = document.createElement("div");
        countdownTxt.style.color = "#f00";
        countdownTxt.style.fontSize = "120px";
        countdownTxt.style.fontWeight = "bold";
        countdownTxt.style.textShadow = "0 0 30px #f00, 0 0 12px #fff";
        countdownTxt.style.fontFamily = "ui-monospace, monospace";
        countdownTxt.textContent = "";
        const subTxt = document.createElement("div");
        subTxt.style.color = "#fc6";
        subTxt.style.fontSize = "16px";
        subTxt.style.letterSpacing = "3.5px";
        subTxt.style.textShadow = "0 0 8px #fc6";
        subTxt.textContent = "PREPARE FOR FORCED EJECTION";
        overlay.append(warningTxt, countdownTxt, subTxt);
        root.appendChild(overlay);
        this._overlay = overlay;
        this._countdownTxt = countdownTxt;

        // ----- COFFIN VIEWPORT (vignette during eject flight) -----
        const coffin = document.createElement("div");
        coffin.style.position = "absolute";
        coffin.style.top = "0";
        coffin.style.left = "0";
        coffin.style.width = "100%";
        coffin.style.height = "100%";
        coffin.style.pointerEvents = "none";
        coffin.style.opacity = "0";
        coffin.style.transition = "opacity 0.6s";
        coffin.style.boxShadow = "inset 0 0 200px 80px #000, inset 0 0 100px 40px #000";
        coffin.style.background = "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.7) 70%, #000 95%)";
        root.appendChild(coffin);
        this._coffin = coffin;

        // Round 42 — separate damage-flash overlay (red rim, decays fast)
        const dmgFlash = document.createElement("div");
        dmgFlash.style.position = "absolute";
        dmgFlash.style.top = "0";
        dmgFlash.style.left = "0";
        dmgFlash.style.width = "100%";
        dmgFlash.style.height = "100%";
        dmgFlash.style.pointerEvents = "none";
        dmgFlash.style.opacity = "0";
        dmgFlash.style.boxShadow = "inset 0 0 180px 50px rgba(255, 30, 30, 0.6)";
        dmgFlash.style.transition = "opacity 0.18s";
        root.appendChild(dmgFlash);
        this._dmgFlash = dmgFlash;

        // Round 42 — shield rim (blue glow, sustained while shield up)
        const shieldRim = document.createElement("div");
        shieldRim.style.position = "absolute";
        shieldRim.style.top = "0";
        shieldRim.style.left = "0";
        shieldRim.style.width = "100%";
        shieldRim.style.height = "100%";
        shieldRim.style.pointerEvents = "none";
        shieldRim.style.opacity = "0";
        shieldRim.style.boxShadow = "inset 0 0 160px 40px rgba(80, 200, 255, 0.45)";
        shieldRim.style.transition = "opacity 0.25s";
        root.appendChild(shieldRim);
        this._shieldRim = shieldRim;

        document.body.appendChild(root);
        this._root = root;
    }

    setEjectHandler(fn) { this._onEject = fn; }

    show() { this.visible = true;  this._root.style.display = "block"; }
    hide() { this.visible = false; this._root.style.display = "none";  }

    // Round 42 — call when player takes damage. Pumps shake intensity
    // (0..1) which decays in update(), and flashes the red rim.
    shake(intensity = 0.5) {
        this._shakeIntensity = Math.max(this._shakeIntensity ?? 0, intensity);
        if (this._dmgFlash) this._dmgFlash.style.opacity = String(Math.min(1, intensity * 0.9));
    }

    setShieldActive(active) { this._shieldActive = active; }

    // Energy 0..1, bounty integer, low-energy = pulse alarm light red
    update(dt, { energyFrac = 1, bounty = 0, ejectArmed = false, weapon = null,
                 autoEject = null, shieldActive = false } = {}) {
        if (!this.visible) return;
        this._flashTimer += dt;
        if (this._flashTimer > 0.5) { this._flashState = !this._flashState; this._flashTimer = 0; }

        this._energyFill.style.width = (Math.max(0, Math.min(1, energyFrac)) * 100) + "%";
        this._bountyVal.textContent = String(bounty);

        // Round 42 — shake decay + dmg flash. Position transform decays
        // over ~0.4s; the red rim (_dmgFlash) decays via CSS transition.
        if (!this._shakeIntensity) this._shakeIntensity = 0;
        if (this._shakeIntensity > 0) {
            const ox = (Math.random() - 0.5) * this._shakeIntensity * 12;
            const oy = (Math.random() - 0.5) * this._shakeIntensity * 12;
            this._root.style.transform = `translate(${ox}px, ${oy}px)`;
            this._shakeIntensity = Math.max(0, this._shakeIntensity - dt * 2.5);
            if (this._shakeIntensity === 0 && this._dmgFlash) {
                this._dmgFlash.style.opacity = "0";
            }
        } else {
            this._root.style.transform = "";
        }

        // Round 42 — shield rim (independent of damage flash + coffin)
        if (this._shieldRim) {
            this._shieldRim.style.opacity = shieldActive ? "1" : "0";
        }

        // Round 42 — auto-eject countdown banner (only shows when armed)
        if (autoEject && autoEject.remaining != null) {
            this._overlay.style.opacity = "1";
            this._countdownTxt.textContent = "";
            // Reuse warning text via a label substitution
            this._overlay.children[0].textContent = "REACTOR CRITICAL";
            this._overlay.children[0].style.color = "#fa3";
            this._overlay.children[2].textContent = `AUTO-EJECT IN ${autoEject.remaining.toFixed(1)}s — RECOVER ENERGY TO ABORT`;
        } else if (this._overlay.children[0].textContent === "REACTOR CRITICAL") {
            // Restore default warning text once auto-eject clears
            this._overlay.style.opacity = "0";
            this._overlay.children[0].textContent = "WARNING";
            this._overlay.children[0].style.color = "#f33";
            this._overlay.children[2].textContent = "PREPARE FOR FORCED EJECTION";
        }

        // Round 41 — weapon name + heat
        if (weapon) {
            this._wName.textContent = weapon.broken ? "BROKEN" : weapon.currentName;
            this._wName.style.color = weapon.broken ? "#f33" : "#9cf";
            this._wName.style.textShadow = "0 0 6px " + (weapon.broken ? "#f33" : "#9cf");
            // Mode shown only for big_gun
            this._wMode.textContent = weapon.current === "big_gun"
                ? `[${weapon.bigGunMode.toUpperCase()}]  (B=cycle)`
                : "";
            this._heatFill.style.width = (Math.max(0, Math.min(1, weapon.heatFrac)) * 100) + "%";
            // Heat label flashes red when warning threshold hit
            if (weapon.heatWarn) {
                this._heatLbl.style.color = this._flashState ? "#f33" : "#fc8";
            } else {
                this._heatLbl.style.color = "#fc8";
            }
        }

        // Armor light: green normal, blink red below 30%
        if (energyFrac < 0.3) {
            this._armorLight.style.background = this._flashState ? "#f33" : "#420";
            this._armorLight.style.boxShadow = "0 0 " + (this._flashState ? "10px" : "3px") + " #f33, inset -2px -2px 4px rgba(0,0,0,0.5)";
        } else {
            this._armorLight.style.background = "#3f3";
            this._armorLight.style.boxShadow = "0 0 6px #3f3, inset -2px -2px 4px rgba(0,0,0,0.5)";
        }

        // Eject light: armed (yellow) → countdown blink red
        if (ejectArmed) {
            this._ejectLight.style.background = this._flashState ? "#f55" : "#600";
            this._ejectLight.style.boxShadow = "0 0 12px #f55";
        } else {
            this._ejectLight.style.background = "#444";
            this._ejectLight.style.boxShadow = "0 0 3px #222";
        }
    }

    showOverlay(countdown) {
        if (!this.visible) return;
        this._overlay.style.opacity = "1";
        if (countdown != null) this._countdownTxt.textContent = countdown;
    }
    hideOverlay() {
        this._overlay.style.opacity = "0";
        this._countdownTxt.textContent = "";
    }

    showCoffin() { this._coffin.style.opacity = "1"; this._coffinForceOn = true; this._inFlight = true; }
    hideCoffin() { this._coffin.style.opacity = "0"; this._coffinForceOn = false; this._inFlight = false; }
}
