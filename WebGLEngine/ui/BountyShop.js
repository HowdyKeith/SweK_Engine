// FILE: ui/BountyShop.js
// Round 42 — bounty spending modal. Press G near allied civ in FP mode
// to open. Three purchases:
//   - REPAIR BIG GUN  (5)  — clears broken state instantly
//   - REFILL REACTOR  (3)  — fills energy to max
//   - +25 MAX ENERGY  (10) — permanent upgrade, capped at 200
// Closes on ESC / Escape, on clicking outside the panel, or on purchase.

const COSTS = {
    repair:    5,
    refill:    3,
    upgrade:   10,
};

const UPGRADE_AMOUNT = 25;

export class BountyShop {

    constructor(opts = {}) {
        this.playerCombat = opts.playerCombat ?? null;
        this.playerEnergy = opts.playerEnergy ?? null;
        this.weaponSystem = opts.weaponSystem ?? null;
        this.visible = false;
        this._buildDOM();
        this.hide();
    }

    _buildDOM() {
        // Backdrop
        const backdrop = document.createElement("div");
        backdrop.style.position = "fixed";
        backdrop.style.top = "0";
        backdrop.style.left = "0";
        backdrop.style.width = "100%";
        backdrop.style.height = "100%";
        backdrop.style.background = "rgba(0,0,0,0.6)";
        backdrop.style.zIndex = "25000";
        backdrop.style.display = "flex";
        backdrop.style.alignItems = "center";
        backdrop.style.justifyContent = "center";
        backdrop.style.pointerEvents = "auto";
        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) this.hide();
        });

        // Panel
        const panel = document.createElement("div");
        panel.style.background = "linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)";
        panel.style.border = "2px solid #ffcc00";
        panel.style.borderRadius = "8px";
        panel.style.padding = "24px 28px";
        panel.style.minWidth = "440px";
        panel.style.boxShadow = "0 0 30px rgba(255, 204, 0, 0.4)";
        panel.style.fontFamily = "ui-monospace, Consolas, monospace";
        panel.style.color = "#cfd";
        panel.addEventListener("click", (e) => e.stopPropagation());

        const header = document.createElement("div");
        header.textContent = "ALLIED OUTPOST — RESUPPLY";
        header.style.color = "#ffcc00";
        header.style.fontSize = "14px";
        header.style.letterSpacing = "2.5px";
        header.style.marginBottom = "8px";
        panel.appendChild(header);

        const subhead = document.createElement("div");
        subhead.id = "shop-subhead";
        subhead.style.fontSize = "12px";
        subhead.style.color = "#88ddff";
        subhead.style.marginBottom = "16px";
        panel.appendChild(subhead);
        this._subhead = subhead;

        // Three purchase buttons
        const makeButton = (label, cost, action) => {
            const b = document.createElement("button");
            b.style.display = "block";
            b.style.width = "100%";
            b.style.background = "linear-gradient(180deg, #1a3a4a, #0a2030)";
            b.style.color = "#cfd";
            b.style.border = "1px solid #4af";
            b.style.borderRadius = "4px";
            b.style.padding = "10px 14px";
            b.style.margin = "6px 0";
            b.style.fontFamily = "inherit";
            b.style.fontSize = "13px";
            b.style.letterSpacing = "1.5px";
            b.style.cursor = "pointer";
            b.style.textAlign = "left";
            b.style.transition = "background 0.1s, border-color 0.1s";
            const labelSpan = document.createElement("span");
            labelSpan.textContent = label;
            const costSpan = document.createElement("span");
            costSpan.style.float = "right";
            costSpan.style.color = "#fc6";
            costSpan.textContent = `${cost} bounty`;
            b.append(labelSpan, costSpan);
            b.addEventListener("mouseenter", () => {
                b.style.background = "linear-gradient(180deg, #2a4a5a, #1a3040)";
                b.style.borderColor = "#9cf";
            });
            b.addEventListener("mouseleave", () => {
                b.style.background = "linear-gradient(180deg, #1a3a4a, #0a2030)";
                b.style.borderColor = "#4af";
            });
            b.addEventListener("click", () => {
                if (action()) this.hide();
            });
            return { btn: b, labelSpan, costSpan };
        };

        this._repairBtn = makeButton("REPAIR BIG GUN", COSTS.repair, () => this._buyRepair());
        this._refillBtn = makeButton("REFILL REACTOR", COSTS.refill, () => this._buyRefill());
        this._upgradeBtn = makeButton(`+${UPGRADE_AMOUNT} MAX ENERGY`, COSTS.upgrade, () => this._buyUpgrade());
        panel.append(this._repairBtn.btn, this._refillBtn.btn, this._upgradeBtn.btn);

        const footer = document.createElement("div");
        footer.style.fontSize = "10px";
        footer.style.color = "#888";
        footer.style.marginTop = "10px";
        footer.style.textAlign = "right";
        footer.textContent = "ESC or click outside to close";
        panel.appendChild(footer);

        backdrop.appendChild(panel);
        document.body.appendChild(backdrop);
        this._backdrop = backdrop;

        // Esc closes
        document.addEventListener("keydown", (e) => {
            if (this.visible && e.code === "Escape") this.hide();
        });
    }

    show() {
        this.visible = true;
        this._backdrop.style.display = "flex";
        this._refreshState();
    }

    hide() {
        this.visible = false;
        this._backdrop.style.display = "none";
    }

    _refreshState() {
        const bounty = this.playerCombat?.bounty ?? 0;
        const broken = this.weaponSystem?.isBroken?.() ?? false;
        const max = this.playerEnergy?.max ?? 100;
        const cur = this.playerEnergy?.current ?? 0;

        this._subhead.textContent = `BOUNTY: ${bounty}   |   REACTOR: ${cur.toFixed(0)}/${max}   |   BIG GUN: ${broken ? "BROKEN" : "OK"}`;

        // Disable buttons that can't be purchased
        const disable = (entry, why) => {
            entry.btn.disabled = true;
            entry.btn.style.opacity = "0.4";
            entry.btn.style.cursor = "not-allowed";
            entry.btn.title = why;
        };
        const enable = (entry) => {
            entry.btn.disabled = false;
            entry.btn.style.opacity = "1";
            entry.btn.style.cursor = "pointer";
            entry.btn.title = "";
        };
        if (bounty < COSTS.repair || !broken) disable(this._repairBtn, !broken ? "big gun is OK" : "not enough bounty");
        else enable(this._repairBtn);

        if (bounty < COSTS.refill || cur >= max) disable(this._refillBtn, cur >= max ? "reactor full" : "not enough bounty");
        else enable(this._refillBtn);

        if (bounty < COSTS.upgrade || max >= 200) disable(this._upgradeBtn, max >= 200 ? "max upgrade reached" : "not enough bounty");
        else enable(this._upgradeBtn);
    }

    // -------- purchase actions --------

    _buyRepair() {
        if (!this.playerCombat || !this.weaponSystem) return false;
        if (this.playerCombat.bounty < COSTS.repair) return false;
        if (!this.weaponSystem.isBroken()) return false;
        this.playerCombat.bounty -= COSTS.repair;
        this.weaponSystem.brokenUntil = 0;
        console.log(`[Shop] big gun repaired — ${COSTS.repair} bounty spent (${this.playerCombat.bounty} left)`);
        return true;
    }

    _buyRefill() {
        if (!this.playerCombat || !this.playerEnergy) return false;
        if (this.playerCombat.bounty < COSTS.refill) return false;
        if (this.playerEnergy.current >= this.playerEnergy.max) return false;
        this.playerCombat.bounty -= COSTS.refill;
        this.playerEnergy.refill();
        console.log(`[Shop] reactor refilled — ${COSTS.refill} bounty spent (${this.playerCombat.bounty} left)`);
        return true;
    }

    _buyUpgrade() {
        if (!this.playerCombat || !this.playerEnergy) return false;
        if (this.playerCombat.bounty < COSTS.upgrade) return false;
        if (this.playerEnergy.max >= 200) return false;
        this.playerCombat.bounty -= COSTS.upgrade;
        this.playerEnergy.raiseMax(UPGRADE_AMOUNT);
        console.log(`[Shop] +${UPGRADE_AMOUNT} max energy — now ${this.playerEnergy.max} (${this.playerCombat.bounty} bounty left)`);
        return true;
    }
}
