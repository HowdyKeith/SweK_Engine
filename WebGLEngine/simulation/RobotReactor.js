// FILE: simulation/RobotReactor.js
// VERSION: v1 — round 267
//
// Wires engine events to the KPop LISTENER robot's rigged animation
// clips. RobotExpressive.glb ships with 14 clips (Dance, Death, Idle,
// Jump, No, Punch, Running, Sitting, Standing, ThumbsUp, Walking,
// WalkJump, Wave, Yes). The user shouldn't have to call
// kpop.speak({action:"happy"}) by hand for each engine moment — most
// of these clips have natural triggers we can attach to.
//
// Event → expression map (kept here, not in robotFaceAvatar, because
// these are engine-side decisions; the avatar just plays whatever
// clip it's told). robotFaceAvatar's EMOTION_TO_CLIP map handles the
// final string-to-clip resolution.
//
//   kaiju_spawn (near)      → wave        (Wave)
//   kaiju_death             → happy       (ThumbsUp)  + sometimes dance
//   kaiju_ranged_attack     → alert       (Punch)
//   civ_destroyed           → sad         (No)
//   civ_emerged             → wave        (Wave)
//   weather_changed:rain    → sad         (No)
//   weather_changed:storm   → alert       (Punch)
//   weather_changed:clear   → happy       (ThumbsUp)
//   demo_complete           → happy
//   demo_start              → wave
//   ai_pipeline:started     → wave (subtle)
//   ai_pipeline:completed   → feed        (Yes)
//   ai_pipeline:failed      → sad         (No)
//   asset_loaded            → feed        (Yes)
//   player_damaged          → sad
//   day_phase:dawn          → wave
//   day_phase:dusk          → sleep       (Sitting)
//   day_phase:night         → sleep
//
// Throttling: each clip has a per-clip cooldown so a stream of events
// of the same type (a kaiju wave with 6 deaths in 2s) only triggers
// one reaction. Default cooldown is 3s, overridable per mapping.

const DEFAULT_COOLDOWN_MS = 3000;

// Per-emotion cooldowns. Tighter cooldowns for "alert" so the robot
// can respond to multiple kaiju attacks in quick succession; longer
// for "dance" so it doesn't loop awkwardly. Round 267 — added the
// four newly-mapped clips (Death/Running/Standing/WalkJump) with
// generous cooldowns since they're dramatic and shouldn't fire often.
const COOLDOWNS = {
    alert:   1500,
    happy:   2500,
    wave:    3500,
    sad:     2500,
    feed:    1800,
    play:    3500,
    sleep:   8000,
    dance:   12000,
    speak:   1200,
    neutral: 800,
    death:   30000,       // catastrophic — sparse
    run:     6000,        // chase / flee sequences
    stand:   6000,        // attention / achievement
    stride:  8000,        // parkour / leap
};

export class RobotReactor {
    constructor({ pipAvatar, civEventBus = null, kaijuManager = null,
                  router = null, eventBus = null } = {}) {
        this.pip          = pipAvatar;
        this.civEventBus  = civEventBus;
        this.kaijuManager = kaijuManager;
        this.router       = router;
        this.eventBus     = eventBus;
        this._lastFired   = new Map();   // emotion → timestamp
        this._enabled     = true;
        this._installListeners();
    }

    // Drop reactions on the floor when something else wants the rig
    // (e.g., palChat is running a long-form dialog and we don't want
    // a kaiju_death yanking the clip mid-sentence).
    setEnabled(b) { this._enabled = !!b; }

    // Public test surface — fire any emotion now, bypassing cooldown.
    // Useful for "robot.react('happy')" in the console.
    fire(emotion, opts = {}) {
        if (!this.pip?.setExpression) return false;
        if (!opts.force && !this._canFire(emotion)) return false;
        try {
            this.pip.setExpression({ Voice: "M1", expression: emotion });
            this._lastFired.set(emotion, performance.now());
            return true;
        } catch (e) {
            console.warn("[RobotReactor] fire failed:", e);
            return false;
        }
    }

    _canFire(emotion) {
        if (!this._enabled) return false;
        const cd = COOLDOWNS[emotion] ?? DEFAULT_COOLDOWN_MS;
        const last = this._lastFired.get(emotion) ?? 0;
        return performance.now() - last >= cd;
    }

    _installListeners() {
        // Civ event bus — primary signal source for kaiju/civ happenings
        if (this.civEventBus?.subscribe) {
            this.civEventBus.subscribe((evt) => this._onCivEvent(evt));
        }

        // ai:activity DOM events (from OllamaClient — round 265)
        if (typeof window !== "undefined") {
            window.addEventListener("ai:activity", (ev) => {
                const d = ev?.detail;
                if (!d) return;
                if (d.event === "completed") this.fire("feed");
                else if (d.event === "failed") this.fire("sad");
                else if (d.event === "started") this.fire("wave");
            });

            // Weather changes — exposed by WeatherSystem on window.weather
            window.addEventListener("voxelengine:weather", (ev) => {
                const d = ev?.detail || {};
                if      (d.kind === "rain")  this.fire("sad");
                else if (d.kind === "storm") this.fire("alert");
                else if (d.kind === "clear") this.fire("happy");
                else if (d.kind === "snow")  this.fire("wave");
            });

            // Day/night transitions
            window.addEventListener("voxelengine:dayphase", (ev) => {
                const phase = ev?.detail?.phase;
                if      (phase === "dawn")  this.fire("wave");
                else if (phase === "dusk")  this.fire("sleep");
                else if (phase === "night") this.fire("sleep");
                else if (phase === "noon")  this.fire("happy");
            });

            // Demo lifecycle (fired from main.js wherever sequences run)
            window.addEventListener("voxelengine:demo_start", () => this.fire("wave"));
            window.addEventListener("voxelengine:demo_complete", () => {
                // 25% chance the robot busts out a dance for a completed
                // demo — keeps it from getting predictable.
                if (Math.random() < 0.25) this.fire("dance");
                else this.fire("happy");
            });

            // Player damage / death (kaiju system fires kaiju:player_damaged
            // when it hits the player; main.js fires player_died on game over)
            window.addEventListener("voxelengine:player_damaged", () => this.fire("sad"));

            // Asset loaded via Ollama/Trellis pipeline
            window.addEventListener("voxelengine:asset_loaded", () => this.fire("feed"));
        }
    }

    _onCivEvent(evt) {
        if (!evt?.type) return;
        switch (evt.type) {
            case "kaiju_spawn":
            case "kaiju_emergence":
            case "summon_kaiju":
                this.fire("wave");
                break;

            case "kaiju_engage":
            case "kaiju_clash":
                this.fire("alert");
                break;

            case "kaiju_death":
                // Rare dance reaction on death — celebratory but not
                // every time. The kaiju roster is dense in late game;
                // dancing on every death would be exhausting.
                if (Math.random() < 0.15) this.fire("dance");
                else this.fire("happy");
                break;

            case "kaiju_victory":
                // Kaiju won — civ died. Dramatic.
                if (Math.random() < 0.3) this.fire("death");      // floor-flop sometimes
                else this.fire("sad");
                break;

            case "kaiju_king_rises":
                // Round 267 — king rises is one of the biggest moments
                // in the game. Use the Death clip for the dramatic
                // floor-flop response. 30s cooldown so we don't burn
                // it on minor escalations.
                this.fire("death");
                break;

            case "kaiju_queen_rises":
                this.fire("sad");
                break;

            case "kaiju_ranged_attack":
            case "kaiju_throws":
            case "kaiju_metal_tree_drop":
                this.fire("alert");
                break;

            case "kaiju_duel":
                this.fire("alert");
                break;

            case "kaiju_death_rattle":
                // King's last attack — feels weighty enough to want
                // a strong reaction. Use dance to celebrate the kill
                // (only kings emit death rattles, so it's already rare).
                this.fire("dance");
                break;

            case "summon_hellspawn_kaiju":
                // Hellspawn is catastrophic — Death clip captures the
                // weight better than "alert" or "no".
                this.fire("death");
                break;

            // ---- Civilization lifecycle ----
            case "civ_destroyed":
            case "collapse":
                this.fire("sad");
                break;

            case "civ_emerged":
            case "civ_appeared":
            case "birth":
                this.fire("wave");
                break;

            case "death":
                // Civ death — less dramatic than collapse (just one
                // unit dying, not a whole civ falling). Still sad.
                this.fire("sad");
                break;

            case "expand":
            case "civ_victory":
                this.fire("happy");
                break;

            case "civ_retaliates":
                this.fire("happy");
                break;

            case "civ_fires_counter":
                // Defender shot back at a kaiju — stand-at-attention
                // beats happy here, it reads as "watching the action".
                this.fire("stand");
                break;

            case "civ_conflict":
                // Two civs fighting each other — neither is great
                this.fire("sad");
                break;

            case "hellspawn_summoned":
            case "kaiju_portal_drop":
                this.fire("alert");
                break;

            // ---- Tech / megaprojects ----
            case "tech_advance":
            case "tech_walls_complete":
                this.fire("happy");
                break;

            case "tech_watchtowers_complete":
                // Watchtowers complete — standing-at-attention reads
                // as "everything's secure now". Persistent clip (no
                // auto-revert).
                this.fire("stand");
                break;

            case "megaproject_start":
                this.fire("wave");
                break;

            case "megaproject_complete":
                // Big achievement → dance. Long cooldown (12s) on the
                // dance clip prevents back-to-back dance loops.
                this.fire("dance");
                break;

            // ---- Weather ----
            case "weather_thunder":
                this.fire("play");        // Jump — startled by thunder
                break;

            case "weather_change":
                // Weather change handler runs separately below in
                // _installListeners (it parses .kind to choose). This
                // case is here for completeness if civEvents publishes
                // the basic event without details.
                this.fire("stand");
                break;

            case "ogre:start":
                this.fire("wave");
                break;

            case "mech_eject_armed":
                this.fire("alert");
                break;

            default:
                // Unknown event — log once at debug level so we can
                // discover new event types worth wiring.
                if (!this._loggedUnknown) this._loggedUnknown = new Set();
                if (!this._loggedUnknown.has(evt.type)) {
                    this._loggedUnknown.add(evt.type);
                    // console.debug("[RobotReactor] unmapped event:", evt.type);
                }
                break;
        }
    }
}

// Console hook so robot.react("happy") etc. works
export function installRobotReactorConsoleAPI(reactor) {
    if (typeof window === "undefined") return;
    window.robot = {
        react: (emotion, opts) => reactor.fire(emotion, opts),
        on:    () => reactor.setEnabled(true),
        off:   () => reactor.setEnabled(false),
        emotions: () => Object.keys(COOLDOWNS),
        // Round 267 — quick tour of the 14 RobotExpressive clips.
        // Walks through each at 3.5s intervals so we can verify the
        // rig + auto-revert behavior in one console call.
        tour: () => {
            const seq = ["wave", "happy", "feed", "alert", "play",
                         "dance", "sad", "stand", "run", "stride",
                         "sleep", "death", "neutral"];
            seq.forEach((e, i) => {
                setTimeout(() => {
                    console.log(`[robot.tour] ${e}`);
                    reactor.fire(e, { force: true });
                }, i * 3500);
            });
        },
    };
    console.log("[robot] try `robot.react(\"dance\")`, `robot.emotions()`, or `robot.tour()` for a clip walkthrough");
}
