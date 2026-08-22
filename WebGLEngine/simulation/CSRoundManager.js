// FILE: simulation/CSRoundManager.js
// VERSION: v1 — round 324
//
// CS-style round state machine. Wraps a CSBomb and tracks round-level
// state: timer, score, win conditions, plant zones.
//
// State machine:
//
//   WAITING  (pre-round, 3s grace; player can move; no plant possible)
//     → LIVE
//   LIVE     (1:55 round timer; T can plant in zone)
//     → PLANT_TICK (bomb is PLANTING; round continues)
//     → BOMB_PLANTED (bomb on the ground, 35s; CT can defuse)
//     → time runs out → CT wins → ROUND_OVER
//   BOMB_PLANTED
//     → bomb defused → CT wins → ROUND_OVER
//     → bomb explodes → T wins → ROUND_OVER
//   ROUND_OVER (5s post-round; show winner; then auto-start next round)
//     → next round → WAITING
//
// "Single-player" simplification: with no bots, the player can switch
// "roles" implicitly. Plant the bomb (as T), then go defuse it (as CT)
// before the 35s timer runs out — speedrun mode. The round system
// still tracks scores correctly: bomb explodes = T wins +1; bomb
// defused = CT wins +1; time runs out without plant = CT wins +1.
//
// Real T-vs-CT matches arrive when bots land in a later round.

import { CSBomb, BOMB_STATE, pointInZone, distSqXZ, DEFUSE_RADIUS } from "./CSBomb.js";

export const ROUND_STATE = Object.freeze({
    IDLE:           "idle",            // before any round has started
    WAITING:        "waiting",         // pre-round grace
    LIVE:           "live",            // round in progress, no plant yet
    BOMB_PLANTED:   "bomb_planted",    // bomb ticking, defusable
    ROUND_OVER:     "round_over",      // brief post-round pause
});

export const WINNER = Object.freeze({
    T:    "t",
    CT:   "ct",
    DRAW: "draw",
});

export const TIMINGS = Object.freeze({
    WAITING_S:    3.0,
    LIVE_S:     115.0,    // 1:55
    ROUND_OVER_S: 5.0,
});

// v542 — buy economy. Money persists across rounds within a match; rewards
// on round result (win / loss with an escalating loss bonus) and bomb plant.
export const ECONOMY = Object.freeze({
    START_MONEY:      800,
    MAX_MONEY:        16000,
    REWARD_WIN:       3250,
    REWARD_LOSS_BASE: 1400,
    REWARD_LOSS_STEP: 500,    // per consecutive round lost
    REWARD_LOSS_MAX:  3400,
    REWARD_PLANT:     300,
    REWARD_KILL:      300,
    BUY_TIME_S:       8.0,    // buy window: all of WAITING + first 8s of LIVE
    KIT_COST:         400,
});

export class CSRoundManager {
    /**
     * @param {Object} cfg
     * @param {Object} cfg.getPlayerPos  () => {x,y,z} — read camera position
     * @param {string} cfg.playerSide    "t" | "ct" (set when round starts)
     * @param {Object} [cfg.plantZones]  {a: {x0,x1,z0,z1}, b: {...}}
     * @param {Function} [cfg.onWinner]  (winner, reason) => void
     * @param {Function} [cfg.onBombExplode] ({x,y,z}) => void  — particles/audio
     * @param {Function} [cfg.onBombPlanted] ({x,y,z}) => void  — spawn prop (v325)
     * @param {Function} [cfg.onBombRemoved] () => void          — despawn prop (v325)
     * @param {Function} [cfg.onBombPulse]   ({x,y,z}, urgency) => void
     *        called ~5×/sec while planted; urgency in [0..1] grows as fuse decreases
     */
    constructor(cfg = {}) {
        this.getPlayerPos = cfg.getPlayerPos || (() => ({ x: 0, y: 0, z: 0 }));
        this.playerSide   = cfg.playerSide || "t";
        this.plantZones   = cfg.plantZones || { a: null, b: null };
        this.onWinner     = cfg.onWinner   || null;
        this.onBombExplode = cfg.onBombExplode || null;
        this.onBombPlanted = cfg.onBombPlanted || null;
        this.onBombRemoved = cfg.onBombRemoved || null;
        this.onBombPulse   = cfg.onBombPulse   || null;
        // v327 — fired on every round start (round 1 + every subsequent
        // round). Callbacks: respawn bots, respawn player, reset weapons.
        this.onRoundStart = cfg.onRoundStart || null;

        // v326 — team-alive providers for wipe win conditions.
        // Each returns the number of alive entities on that team
        // (bots + player if applicable). main.js wires these to
        // CSBotManager + fpsShooter.health/active.
        this.getTAlive  = cfg.getTAlive  || null;
        this.getCTAlive = cfg.getCTAlive || null;

        // v328 — bot plant/defuse intent providers. Round manager
        // queries these each tick to know if a bot wants to plant or
        // defuse. Returning a bot starts the action with that bot as
        // owner. Returning null causes any active bot-owned action to
        // cancel.
        this.getBotPlanter  = cfg.getBotPlanter  || null;
        this.getBotDefuser  = cfg.getBotDefuser  || null;
        // v540 — does the player currently hold a defuse kit? (speeds defuse)
        this.getPlayerHasKit = cfg.getPlayerHasKit || null;
        // v542 — fired when the player buys an item; engine grants the effect
        this.onPurchase = cfg.onPurchase || null;

        // v330 — bomb-carrier model. The bomb has a designated carrier
        // (player or specific bot). Only the carrier can plant. When
        // carrier dies, bomb drops at their last known position; any
        // T entity walking near picks it up.
        //
        //   getInitialCarrierId() => "player" | botId — called once
        //     per round to designate who starts holding the bomb
        //   getCarrierPos(carrierId) => {x,z} | null — query carrier's
        //     current world position. Returns null if carrier is dead.
        //   getPickupCandidate(bx, bz, radius) => actorId | null —
        //     when bomb is dropped, find a nearby T entity (player or
        //     bot) to pick it up
        this.getInitialCarrierId = cfg.getInitialCarrierId || null;
        this.getCarrierPos       = cfg.getCarrierPos       || null;
        this.getPickupCandidate  = cfg.getPickupCandidate  || null;
        this.onBombDropped       = cfg.onBombDropped       || null;
        this.onBombPickedUp      = cfg.onBombPickedUp      || null;

        this.state = ROUND_STATE.IDLE;
        this._stateTime = 0;       // seconds in current state
        this._roundTime = 0;       // seconds remaining in LIVE phase

        this.scores = { t: 0, ct: 0 };
        this.roundNumber = 0;

        // v542 — buy economy (player's cash; persists across rounds in a match)
        this.money = ECONOMY.START_MONEY;
        this._lossStreak = 0;

        // Bomb instance. Owned by us so the lifecycle is tightly bound to
        // round transitions.
        this.bomb = new CSBomb({ initialHolder: this.playerSide });

        // Track whether the E key is held this tick. main.js calls
        // setInteractHeld(true/false) on key events.
        this._interactHeld = false;
        this._interactWasHeld = false;

        // Last "winner" message for HUD inspection.
        this.lastResult = null;    // { winner, reason }

        // v325 — pulse cadence accumulator
        this._pulseAcc = 0;
        this._bombPropSpawned = false;

        // v328 — which actor currently owns the plant/defuse action.
        //   "player" | botEntityId | null
        // Set when bomb transitions HELD → PLANTING or PLANTED → DEFUSING.
        // Cleared when bomb transitions out of PLANTING/DEFUSING or
        // when the owner becomes ineligible (dies / leaves zone).
        this._actionOwner = null;

        // v330 — cache last known carrier position (for drop location
        // when carrier suddenly becomes null)
        this._lastCarrierX = 0;
        this._lastCarrierZ = 0;
        // v536 — brief re-pickup suppression after a voluntary drop so the
        // carrier can walk away instead of instantly grabbing the bomb back.
        this._dropCooldown = 0;
    }

    /** v328 — exposed for CSBotManager so it can freeze the right bot. */
    getActionOwnerId() {
        return this._actionOwner;
    }

    // -- Public API ---------------------------------------------------------

    /** Begin round 1. Resets scores, resets bomb, transitions to WAITING. */
    startMatch(opts = {}) {
        this.scores.t = 0;
        this.scores.ct = 0;
        this.roundNumber = 0;
        this.money = ECONOMY.START_MONEY;   // v542 — fresh economy each match
        this._lossStreak = 0;
        this.lastResult = null;
        this.playerSide = opts.side || this.playerSide;
        this._beginRound();
    }

    /** Force-end the current round with a given winner.
     *  Used by tests and by future bot logic (e.g. all CTs dead). */
    endRound(winner, reason = "manual") {
        if (this.state === ROUND_STATE.ROUND_OVER ||
            this.state === ROUND_STATE.IDLE) return;
        this._concludeRound(winner, reason);
    }

    /** True if the round is in a state where plant/defuse keys matter. */
    isActive() {
        return this.state === ROUND_STATE.LIVE ||
               this.state === ROUND_STATE.BOMB_PLANTED;
    }

    /** Called by main.js on E keydown/keyup. */
    setInteractHeld(held) {
        this._interactHeld = !!held;
    }

    /** Returns HUD-friendly snapshot. Called every render frame; cheap. */
    snapshot() {
        return {
            state:        this.state,
            scores:       { ...this.scores },
            roundNumber:  this.roundNumber,
            roundTime:    this._roundTime,
            playerSide:   this.playerSide,
            bomb: {
                state:           this.bomb.state,
                planted:         this.bomb.isPlanted(),
                carrier:         this.bomb.carrierId,
                dropped:         this.bomb.dropped,
                timeRemaining:   this.bomb.timeRemaining(),
                plantProgress:   this.bomb.plantProgress(),
                defuseProgress:  this.bomb.defuseProgress(),
                defuseHasKit:    this.bomb.defuseHasKit(),
            },
            playerHasKit: this._playerHasKit(),
            money:        this.money,
            canBuy:       this._canBuy(),
            kitCost:      ECONOMY.KIT_COST,
            lastResult: this.lastResult,
            inPlantZone: this._isPlayerInPlantZone(),
            nearBomb:    this._isPlayerNearBomb(),
        };
    }

    /**
     * Step the round forward by `dt` seconds. main.js calls this every
     * frame. Drives state transitions, bomb tick, score updates.
     *
     * dt is carried across state transitions within a single tick:
     * if WAITING completes mid-tick, the leftover time is applied to
     * LIVE in the same call. This matters mostly for tests; runtime
     * dt is capped at 0.1s.
     */
    tick(dt) {
        // WAITING — drains until grace expires, then falls through to LIVE
        if (this.state === ROUND_STATE.WAITING) {
            this._stateTime += dt;
            if (this._stateTime < TIMINGS.WAITING_S) return;
            const overshoot = this._stateTime - TIMINGS.WAITING_S;
            this._transition(ROUND_STATE.LIVE);
            this._roundTime = TIMINGS.LIVE_S;
            dt = overshoot;
            // Fall through to LIVE handler with remaining dt
        }

        if (this.state === ROUND_STATE.LIVE) {
            this._roundTime -= dt;
            if (this._dropCooldown > 0) this._dropCooldown -= dt;   // v536 — re-pickup suppression

            // v330 — carrier tracking. Each tick, query the carrier's
            // current position. If alive (callback returns non-null),
            // cache position. If dead/missing (returns null), drop
            // the bomb at the last cached position. Then check for
            // pickup candidates if dropped.
            this._tickCarrier();

            // Handle interact-key edges for planting
            this._handleInteract(dt);

            // Step the bomb (planting progress)
            const transition = this.bomb.tick(dt);
            if (transition === "planted") {
                this._transition(ROUND_STATE.BOMB_PLANTED);
                this._actionOwner = null;   // v328 — plant complete, ready for defuse
                if (this.playerSide === "t") this._award(ECONOMY.REWARD_PLANT);   // v542 — plant bonus
                // v325 — notify callback so main.js can spawn the bomb prop
                if (this.onBombPlanted) {
                    try { this.onBombPlanted(this.bomb.location()); } catch {}
                }
                this._bombPropSpawned = true;
                this._pulseAcc = 0;
                return;
            }

            // Time runs out with no plant → CT wins
            if (this._roundTime <= 0 && !this.bomb.isPlanted()) {
                this._concludeRound(WINNER.CT, "time expired, no plant");
                return;
            }

            // v326 — team-wipe win conditions in LIVE (no bomb planted yet)
            if (this._checkTeamWipe()) return;
            return;
        }

        if (this.state === ROUND_STATE.BOMB_PLANTED) {
            // No more round-timer; bomb fuse drives the clock
            this._handleInteract(dt);

            const transition = this.bomb.tick(dt);
            if (transition === "exploded") {
                if (this.onBombExplode) {
                    try { this.onBombExplode(this.bomb.location()); } catch {}
                }
                this._concludeRound(WINNER.T, "bomb exploded");
                return;
            } else if (transition === "defused") {
                this._concludeRound(WINNER.CT, "bomb defused");
                return;
            }

            // v326 — team-wipe win conditions in BOMB_PLANTED phase.
            // Note: in CS, after plant the round CANNOT end on all-T-dead
            // (the bomb keeps ticking even with no Ts alive — CTs must
            // defuse or eat the explosion). But all-CT-dead does end the
            // round as T win since no one can defuse.
            if (this.getCTAlive && this.getCTAlive() === 0) {
                this._concludeRound(WINNER.T, "all CTs eliminated, no defuser left");
                return;
            }

            // v325 — periodic pulse while planted, accelerating with urgency.
            this._pulseAcc += dt;
            const urgency = 1 - (this.bomb.timeRemaining() / 35.0);
            const interval = 0.7 - urgency * 0.58;
            if (this._pulseAcc >= interval) {
                this._pulseAcc = 0;
                if (this.onBombPulse) {
                    try { this.onBombPulse(this.bomb.location(), urgency); } catch {}
                }
            }
            return;
        }

        if (this.state === ROUND_STATE.ROUND_OVER) {
            this._stateTime += dt;
            if (this._stateTime >= TIMINGS.ROUND_OVER_S) {
                this._beginRound();
            }
            return;
        }
    }

    // -- Internals ----------------------------------------------------------

    _beginRound() {
        this.roundNumber++;
        this.bomb.reset(this.playerSide);
        this._roundTime = TIMINGS.LIVE_S;
        this._bombPropSpawned = false;
        this._pulseAcc = 0;
        this._actionOwner = null;
        // v330 — assign initial carrier. main.js callback returns
        // "player" if T side, else first T bot's id.
        if (this.getInitialCarrierId) {
            try {
                const cid = this.getInitialCarrierId();
                if (cid != null) this.bomb.assignInitialCarrier(cid);
            } catch {}
        }
        this._transition(ROUND_STATE.WAITING);
        // v327 — fire round-start callback so main.js can respawn
        // bots + player + reset weapons. Defensive try/catch so a
        // failing handler doesn't stall the round.
        if (this.onRoundStart) {
            try { this.onRoundStart(this.roundNumber); } catch (e) {
                console.warn("[CSRound] onRoundStart threw:", e?.message ?? e);
            }
        }
    }

    _concludeRound(winner, reason) {
        if (winner === WINNER.T)  this.scores.t++;
        if (winner === WINNER.CT) this.scores.ct++;
        this.lastResult = { winner, reason };
        // v542 — economy: reward the player's team for the round result
        if (winner === this.playerSide) {
            this._award(ECONOMY.REWARD_WIN);
            this._lossStreak = 0;
        } else if (winner !== WINNER.DRAW) {
            const bonus = Math.min(ECONOMY.REWARD_LOSS_MAX,
                ECONOMY.REWARD_LOSS_BASE + this._lossStreak * ECONOMY.REWARD_LOSS_STEP);
            this._award(bonus);
            this._lossStreak++;
        }
        if (this.onWinner) {
            try { this.onWinner(winner, reason); } catch {}
        }
        // If the bomb didn't end the round (e.g. time expired), make
        // sure it's not still ticking.
        if (this.bomb.isLive()) this.bomb.forceIdle();
        // v325 — release the prop entity if one was spawned
        if (this._bombPropSpawned && this.onBombRemoved) {
            try { this.onBombRemoved(); } catch {}
        }
        this._bombPropSpawned = false;
        this._actionOwner = null;   // v328 — clear before next round begins
        this._transition(ROUND_STATE.ROUND_OVER);
    }

    _transition(next) {
        this.state = next;
        this._stateTime = 0;
    }

    // v330 — carrier lifecycle. Called from LIVE tick. Three jobs:
    //
    //   1. If we have a carrier, query their current position. Cache
    //      it (for drop fallback). If callback returns null, the
    //      carrier is dead — drop the bomb at last cached position.
    //
    //   2. If bomb is dropped and we're in HELD state, look for a
    //      pickup candidate (any T entity near the drop position).
    //      Transfer carrier on pickup.
    //
    //   3. Fire onBombDropped / onBombPickedUp callbacks so main.js
    //      can spawn/despawn the dropped-bomb prop entity.
    _tickCarrier() {
        const bomb = this.bomb;
        // Skip if bomb is in a state where carrier doesn't matter
        if (bomb.state !== BOMB_STATE.HELD &&
            bomb.state !== BOMB_STATE.PLANTING) return;

        // Case 1: alive carrier — track position
        if (bomb.carrierId != null && !bomb.dropped) {
            if (this.getCarrierPos) {
                let pos;
                try { pos = this.getCarrierPos(bomb.carrierId); } catch { pos = null; }
                if (pos) {
                    this._lastCarrierX = pos.x;
                    this._lastCarrierZ = pos.z;
                } else {
                    // Carrier died — drop the bomb at last known position
                    bomb.drop(this._lastCarrierX, this._lastCarrierZ);
                    // If plant was in progress, cancel it and clear owner
                    if (this._actionOwner === bomb.carrierId ||
                        this._actionOwner === "player") {
                        this._actionOwner = null;
                    }
                    if (this.onBombDropped) {
                        try { this.onBombDropped(bomb.getDropPos()); } catch {}
                    }
                }
            }
        }

        // Case 2: dropped — look for pickup (suppressed briefly after a
        // voluntary drop so the carrier can step away first)
        if (bomb.dropped && this.getPickupCandidate && (this._dropCooldown || 0) <= 0) {
            const PICKUP_RADIUS = 2.0;   // 2 voxels — walk-over pickup
            let candId;
            try {
                candId = this.getPickupCandidate(bomb.dropX, bomb.dropZ, PICKUP_RADIUS);
            } catch { candId = null; }
            if (candId != null) {
                if (bomb.pickup(candId)) {
                    if (this.onBombPickedUp) {
                        try { this.onBombPickedUp(candId); } catch {}
                    }
                }
            }
        }
    }

    /** v330 — check that this actor is the current bomb carrier.
     *  Used by plant logic to gate eligibility. */
    _isCarrier(actorId) {
        return this.bomb.carrierId === actorId;
    }

    /** v540 — whether the player currently holds a defuse kit (via config). */
    _playerHasKit() {
        return !!(this.getPlayerHasKit && this.getPlayerHasKit());
    }

    /** v542 — adjust money, clamped to [0, MAX_MONEY]. Negative = spend. */
    _award(amount) {
        this.money = Math.max(0, Math.min(ECONOMY.MAX_MONEY, this.money + amount));
        return this.money;
    }

    /** v542 — reward for a player kill. Engine calls this on a confirmed frag. */
    awardKill() { return this._award(ECONOMY.REWARD_KILL); }

    /** v542 — buy window: all of WAITING + the first BUY_TIME_S of LIVE. */
    _canBuy() {
        if (this.state === ROUND_STATE.WAITING) return true;
        if (this.state === ROUND_STATE.LIVE &&
            this._roundTime > TIMINGS.LIVE_S - ECONOMY.BUY_TIME_S) return true;
        return false;
    }

    /**
     * v542 — buy an item with money. Returns {ok, ...}. Currently the one
     * purchasable is "kit" (defuse kit). onPurchase(item) lets the engine
     * grant the effect (set the player's kit flag).
     */
    buy(item) {
        if (!this._canBuy()) return { ok: false, reason: "buy time is over" };
        if (item === "kit") {
            if (this._playerHasKit())      return { ok: false, reason: "you already have a kit" };
            if (this.money < ECONOMY.KIT_COST) return { ok: false, reason: "not enough money" };
            this._award(-ECONOMY.KIT_COST);
            if (this.onPurchase) { try { this.onPurchase("kit"); } catch {} }
            return { ok: true, item: "kit", spent: ECONOMY.KIT_COST, money: this.money };
        }
        return { ok: false, reason: "unknown item" };
    }

    /**
     * v536 — the player voluntarily drops the bomb. v537 — accepts an
     * optional landing position so callers can throw it forward (the engine
     * computes a forward, wall-clamped landing from the camera). With no
     * argument it drops at the player's feet (legacy behaviour).
     * Only valid when the round is LIVE, the bomb is HELD (not planting /
     * planted / already dropped), and the player is the current carrier.
     * Fires onBombDropped (spawns the prop) and starts a short re-pickup
     * cooldown. Returns true if the bomb was dropped.
     */
    requestDrop(landing = null) {
        const bomb = this.bomb;
        if (this.state !== ROUND_STATE.LIVE) return false;
        if (bomb.state !== BOMB_STATE.HELD || bomb.dropped) return false;
        // When the carrier model is active, only the player-carrier may drop.
        if (this.getCarrierPos && bomb.carrierId !== "player") return false;
        let dropX, dropZ;
        if (landing && Number.isFinite(landing.x) && Number.isFinite(landing.z)) {
            dropX = landing.x; dropZ = landing.z;
        } else {
            let pos = null;
            try { pos = this.getPlayerPos(); } catch { pos = null; }
            dropX = pos?.x ?? this._lastCarrierX;
            dropZ = pos?.z ?? this._lastCarrierZ;
        }
        if (!bomb.drop(dropX, dropZ)) return false;
        this._lastCarrierX = dropX;
        this._lastCarrierZ = dropZ;
        this._dropCooldown = 1.5;
        if (this._actionOwner === "player") this._actionOwner = null;
        if (this.onBombDropped) { try { this.onBombDropped(bomb.getDropPos()); } catch {} }
        return true;
    }

    // v326 — check team-wipe win conditions. Returns true if a side
    // is eliminated and round was concluded. Only call during LIVE.
    _checkTeamWipe() {
        if (!this.getTAlive || !this.getCTAlive) return false;
        const tAlive = this.getTAlive();
        const ctAlive = this.getCTAlive();
        if (tAlive === 0) {
            this._concludeRound(WINNER.CT, "all Ts eliminated");
            return true;
        }
        if (ctAlive === 0) {
            this._concludeRound(WINNER.T, "all CTs eliminated");
            return true;
        }
        return false;
    }

    _handleInteract(dt) {
        const held = this._interactHeld;
        const justPressed  =  held && !this._interactWasHeld;
        const justReleased = !held &&  this._interactWasHeld;

        // ===== PLAYER PLANT (T side, LIVE state) =====
        if (this.state === ROUND_STATE.LIVE && this.playerSide === "t") {
            // v330 — only the bomb carrier can plant. If carrier model
            // is in use (getCarrierPos provided), check eligibility;
            // else allow any T (backward compat for tests without carrier).
            const playerIsCarrier = !this.getCarrierPos ||
                this._isCarrier("player");
            if (held && this.bomb.state === BOMB_STATE.HELD && playerIsCarrier) {
                const zone = this._isPlayerInPlantZone();
                if (zone && justPressed) {
                    const pos = this.getPlayerPos();
                    if (this.bomb.startPlant(pos.x, pos.y, pos.z)) {
                        this._actionOwner = "player";
                    }
                }
            }
            if (this._actionOwner === "player") {
                if (justReleased && this.bomb.state === BOMB_STATE.PLANTING) {
                    this.bomb.cancelPlant();
                    this._actionOwner = null;
                }
                // If player walks out of the zone mid-plant, cancel
                if (this.bomb.state === BOMB_STATE.PLANTING &&
                    !this._isPlayerInPlantZone()) {
                    this.bomb.cancelPlant();
                    this._actionOwner = null;
                }
            }
        }

        // ===== PLAYER DEFUSE (CT side, BOMB_PLANTED state) =====
        if (this.state === ROUND_STATE.BOMB_PLANTED && this.playerSide === "ct") {
            if (held && this.bomb.state === BOMB_STATE.PLANTED) {
                if (this._isPlayerNearBomb() && justPressed) {
                    if (this.bomb.startDefuse(this._playerHasKit())) {
                        this._actionOwner = "player";
                    }
                }
            }
            if (this._actionOwner === "player") {
                if (justReleased && this.bomb.state === BOMB_STATE.DEFUSING) {
                    this.bomb.cancelDefuse();
                    this._actionOwner = null;
                }
                if (this.bomb.state === BOMB_STATE.DEFUSING &&
                    !this._isPlayerNearBomb()) {
                    this.bomb.cancelDefuse();
                    this._actionOwner = null;
                }
            }
        }

        // ===== SINGLE-PLAYER speedrun: T can defuse own bomb =====
        if (this.state === ROUND_STATE.BOMB_PLANTED && this.playerSide === "t") {
            if (held && this.bomb.state === BOMB_STATE.PLANTED) {
                if (this._isPlayerNearBomb() && justPressed) {
                    if (this.bomb.startDefuse(this._playerHasKit())) {
                        this._actionOwner = "player";
                    }
                }
            }
            if (this._actionOwner === "player") {
                if (justReleased && this.bomb.state === BOMB_STATE.DEFUSING) {
                    this.bomb.cancelDefuse();
                    this._actionOwner = null;
                }
                if (this.bomb.state === BOMB_STATE.DEFUSING &&
                    !this._isPlayerNearBomb()) {
                    this.bomb.cancelDefuse();
                    this._actionOwner = null;
                }
            }
        }

        // ===== v328: BOT PLANT (T attacker in zone, bomb HELD) =====
        // Only consider bot actions if player isn't currently the owner.
        // v330 — also gated on bot being the bomb carrier.
        if (this.state === ROUND_STATE.LIVE && this._actionOwner !== "player") {
            const planter = this.getBotPlanter?.();
            // v330 carrier check: if carrier model in use, planter must
            // be the bomb's current carrier
            const planterEligible = planter &&
                (!this.getCarrierPos || this._isCarrier(planter.id));
            if (this._actionOwner == null && planterEligible &&
                this.bomb.state === BOMB_STATE.HELD) {
                if (this.bomb.startPlant(planter.x, planter.y, planter.z)) {
                    this._actionOwner = planter.id;
                }
            } else if (typeof this._actionOwner === "number") {
                // Bot already planting — verify still eligible
                if (!planterEligible || planter.id !== this._actionOwner) {
                    if (this.bomb.state === BOMB_STATE.PLANTING) {
                        this.bomb.cancelPlant();
                    }
                    this._actionOwner = null;
                }
            }
        }

        // ===== v328: BOT DEFUSE (CT defender near bomb, bomb PLANTED) =====
        if (this.state === ROUND_STATE.BOMB_PLANTED && this._actionOwner !== "player") {
            const defuser = this.getBotDefuser?.(this.bomb.x, this.bomb.z, DEFUSE_RADIUS);
            if (this._actionOwner == null && defuser && this.bomb.state === BOMB_STATE.PLANTED) {
                if (this.bomb.startDefuse(defuser.hasKit !== false)) {
                    this._actionOwner = defuser.id;
                }
            } else if (typeof this._actionOwner === "number") {
                if (!defuser || defuser.id !== this._actionOwner) {
                    if (this.bomb.state === BOMB_STATE.DEFUSING) {
                        this.bomb.cancelDefuse();
                    }
                    this._actionOwner = null;
                }
            }
        }

        this._interactWasHeld = held;
    }

    _isPlayerInPlantZone() {
        const pos = this.getPlayerPos();
        const a = this.plantZones.a, b = this.plantZones.b;
        if (a && pointInZone(pos.x, pos.z, a)) return "a";
        if (b && pointInZone(pos.x, pos.z, b)) return "b";
        return null;
    }

    _isPlayerNearBomb() {
        if (!this.bomb.isPlanted()) return false;
        const pos = this.getPlayerPos();
        const r2 = DEFUSE_RADIUS * DEFUSE_RADIUS;
        return distSqXZ(pos.x, pos.z, this.bomb.x, this.bomb.z) <= r2;
    }
}
