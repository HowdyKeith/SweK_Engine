// FILE: ui/playerEnergyHUD.js
// VERSION: v1
//
// Round 31 — bottom-of-screen energy bar for first-person mode. Hidden
// in observer mode. Cyan fill, turns yellow at <40% / red at <20% /
// briefly flashes red when an action was denied for low energy.

export class PlayerEnergyHUD {
    constructor() {
        this.root = document.createElement("div");
        Object.assign(this.root.style, {
            position: "absolute",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "320px",
            height: "20px",
            background: "rgba(0, 0, 0, 0.55)",
            border: "1px solid rgba(180, 220, 255, 0.4)",
            borderRadius: "3px",
            zIndex: "10001",
            display: "none",       // hidden until FP
            overflow: "hidden",
            fontFamily: "monospace",
            fontSize: "11px",
            color: "white",
        });

        this.fill = document.createElement("div");
        Object.assign(this.fill.style, {
            position: "absolute",
            top: "0", left: "0", bottom: "0",
            width: "100%",
            background: "linear-gradient(90deg, #6cf, #9df)",
            transition: "width 0.1s linear, background 0.2s",
        });
        this.root.appendChild(this.fill);

        this.label = document.createElement("div");
        Object.assign(this.label.style, {
            position: "absolute",
            inset: "0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textShadow: "0 0 3px black",
            letterSpacing: "1px",
        });
        this.root.appendChild(this.label);

        document.body.appendChild(this.root);
    }

    update(playerEnergy, mode) {
        if (mode !== "fp") {
            this.root.style.display = "none";
            return;
        }
        this.root.style.display = "block";

        const frac = playerEnergy.fraction();
        const pct = Math.floor(frac * 100);
        this.fill.style.width = `${pct}%`;

        // Color logic: flash red on denial, else by remaining energy
        if (playerEnergy.isFlashing()) {
            this.fill.style.background = "#f44";
        } else if (frac < 0.20) {
            this.fill.style.background = "linear-gradient(90deg, #f44, #f88)";
        } else if (frac < 0.40) {
            this.fill.style.background = "linear-gradient(90deg, #fb4, #fd6)";
        } else {
            this.fill.style.background = "linear-gradient(90deg, #6cf, #9df)";
        }

        const locked = playerEnergy._cooldownLockout > 0;
        if (locked){ this.fill.style.background = "#a33"; this.root.style.opacity = "0.82"; }
        else { this.root.style.opacity = "1"; }
        const sprinting = playerEnergy._sprintActive;
        this.label.textContent = locked ? "RECHARGING…" : `ENERGY ${pct}/100${sprinting ? " ⚡" : ""}`;
    }
}
