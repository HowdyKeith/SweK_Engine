// FILE: simulation/SnarkyListener.js
// VERSION: v1 — round 267
//
// Subscribes to the CivilizationEventBus and generates short,
// sarcastic commentary on what just happened. Designed to give the
// robot personality during long runs where the user is just watching
// — a deadpan "moose" narrator that comments on kaiju arrivals,
// civilization births and collapses, OGRE activity, etc.
//
// Output routes through two channels:
//   - VISUAL (always on when enabled): triggers pipAvatar.setExpression()
//     with an appropriate clip, so the robot's body language matches
//     the snark. Free; no TTS cost.
//   - AUDIBLE (off by default; toggled via console): calls
//     kpop.speak({Voice:"M1", Text}) which goes through palChat's TTS
//     bridge. Costs a TTS round-trip; not on by default to avoid
//     cluttering the audio mix.
//
// Console API (installed on window.snark):
//   .enable()                    — start listening
//   .disable()                   — stop listening
//   .muted [boolean]             — getter/setter; when true, visual only
//   .unmute() / .mute()          — shortcuts for muted=false/true
//   .test([type])                — fire a synthetic event for verification
//   .lines                       — peek snark history (last 20)
//
// Throttling: a global rate limit (DEFAULT 6 seconds) prevents the
// robot from talking over itself when a burst of events fires
// (kaiju_clash spawns several kaiju_engage events). Per-event-type
// cooldowns are also enforced so the same line doesn't repeat.

const SNARK_LINES = {
    kaiju_spawn: [
        { text: "Oh great, another one.", action: "no" },
        { text: "Where do they keep coming from.", action: "alert" },
        { text: "Statistics suggest you should be alarmed.", action: "alert" },
        { text: "Note the entrance — very dramatic.", action: "wave" },
    ],
    kaiju_death: [
        { text: "And that's how that goes.", action: "happy" },
        { text: "One down. Many to go.", action: "happy" },
        { text: "Thoughts and prayers.", action: "wave" },
        { text: "Good riddance.", action: "happy" },
    ],
    kaiju_king_rises: [
        { text: "Promoted. Mostly bad news for everyone else.", action: "death" },
        { text: "A king. Of course it's a king.", action: "no" },
        { text: "Everyone please panic responsibly.", action: "alert" },
    ],
    kaiju_queen_rises: [
        { text: "A queen has emerged. Lovely.", action: "no" },
        { text: "Royalty arrives. Probably won't autograph.", action: "wave" },
    ],
    kaiju_clash: [
        { text: "Now they're fighting each other. Fascinating.", action: "alert" },
        { text: "Both of you, please continue.", action: "happy" },
    ],
    kaiju_engage: [
        { text: "Combat has begun. As predicted.", action: "stand" },
        { text: "Engaging hostile. Or being engaged by it.", action: "alert" },
    ],
    kaiju_ranged_attack: [
        { text: "It's throwing things. Adults shouldn't do that.", action: "no" },
        { text: "Incoming projectile. Pretend to look surprised.", action: "alert" },
    ],
    kaiju_hit: [
        { text: "Ow.", action: "no" },
        { text: "That was not nothing.", action: "alert" },
    ],
    kaiju_death_rattle: [
        { text: "Last words. Or last roar. Whichever.", action: "wave" },
    ],
    birth: [
        { text: "A new civilian. Welcome to the chaos.", action: "happy" },
        { text: "Population: marginally higher.", action: "wave" },
    ],
    collapse: [
        { text: "Civilization collapsed. Sometimes things collapse.", action: "sad" },
        { text: "Architects could have done more.", action: "no" },
    ],
    civ_victory: [
        { text: "A win. Surprising.", action: "happy" },
        { text: "Add this to the history they will not write down.", action: "happy" },
    ],
    civ_conflict: [
        { text: "Two civilizations disagree. Resolved by violence.", action: "alert" },
    ],
    civ_tower: [
        { text: "Tower constructed. Tall.", action: "happy" },
    ],
    ogre: [
        { text: "OGRE deployment online. Brace yourselves.", action: "stand" },
        { text: "Did anyone get clearance for that?", action: "no" },
    ],
    hellspawn_summoned: [
        { text: "Portal opened. To somewhere unpleasant.", action: "death" },
        { text: "Hellspawn arriving. Set out the good china.", action: "no" },
    ],
    summon_kaiju: [
        { text: "Summon ritual confirmed. Hindsight is overrated.", action: "alert" },
    ],
    kaiju_metal_tree_drop: [
        { text: "It just dropped a metal tree. Bold.", action: "alert" },
    ],
    kaiju_portal_drop: [
        { text: "Through the portal. Like luggage.", action: "wave" },
    ],
    kaiju_emergence: [
        { text: "Something has emerged. Spoiler: it's not friendly.", action: "alert" },
    ],
    weather_change: [
        { text: "Weather noticed. Carry an umbrella maybe.", action: "neutral" },
    ],
    // Catchall used when no specific line exists for the event type
    _default: [
        { text: "Something happened. Probably important.", action: "neutral" },
        { text: "Noted.", action: "neutral" },
    ],
};

const PER_TYPE_COOLDOWN_MS = 15_000;     // same event type repeats no faster than this
const GLOBAL_COOLDOWN_MS   =  6_000;     // any snark fires no faster than this

export class SnarkyListener {
    constructor({ civEvents, pipAvatar, kpop } = {}) {
        this.civEvents = civEvents;
        this.pipAvatar = pipAvatar;
        this.kpop = kpop;
        this.enabled = false;
        this.muted = true;                  // default muted = visual-only
        this._unsubscribe = null;
        this._lastFireMs = 0;
        this._lastByType = new Map();      // type → ms
        this._recentLines = new Set();     // dedup ring buffer of recent lines
        this._lineHistory = [];            // pretty log for debugging
        this._lineHistoryMax = 20;
    }

    enable() {
        if (this.enabled) return;
        if (!this.civEvents?.subscribe) {
            console.warn("[snark] civEvents has no subscribe method — can't enable");
            return;
        }
        this._unsubscribe = this.civEvents.subscribe((evt) => this._onEvent(evt));
        this.enabled = true;
        console.log(`[snark] enabled (${this.muted ? "muted/visual-only" : "audible"})`);
    }

    disable() {
        if (!this.enabled) return;
        if (typeof this._unsubscribe === "function") this._unsubscribe();
        this._unsubscribe = null;
        this.enabled = false;
        console.log("[snark] disabled");
    }

    mute()    { this.muted = true;  console.log("[snark] muted (visual only)"); }
    unmute()  { this.muted = false; console.log("[snark] unmuted (audible)"); }

    test(type = "kaiju_spawn") {
        // Bypass the cooldown for a deliberate test
        const prev = { last: this._lastFireMs, perType: this._lastByType.get(type) };
        this._lastFireMs = 0;
        this._lastByType.delete(type);
        this._onEvent({ type, _test: true });
        if (prev.last != null)    this._lastFireMs = prev.last;
        if (prev.perType != null) this._lastByType.set(type, prev.perType);
    }

    get lines() { return this._lineHistory.slice(); }

    _onEvent(evt) {
        if (!evt?.type) return;
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        if (now - this._lastFireMs < GLOBAL_COOLDOWN_MS) return;
        const lastType = this._lastByType.get(evt.type) || 0;
        if (now - lastType < PER_TYPE_COOLDOWN_MS) return;
        const bank = SNARK_LINES[evt.type] || SNARK_LINES._default;
        // Prefer a line we haven't used very recently (small dedup
        // ring). If everything in the bank is recent, just pick any.
        let pick = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            const candidate = bank[Math.floor(Math.random() * bank.length)];
            if (!this._recentLines.has(candidate.text)) { pick = candidate; break; }
        }
        if (!pick) pick = bank[Math.floor(Math.random() * bank.length)];
        this._recentLines.add(pick.text);
        // Trim recent set after it grows (keep last ~6)
        if (this._recentLines.size > 6) {
            const first = this._recentLines.values().next().value;
            this._recentLines.delete(first);
        }
        this._lastFireMs = now;
        this._lastByType.set(evt.type, now);
        this._lineHistory.push({ ms: Math.round(now), type: evt.type, text: pick.text });
        if (this._lineHistory.length > this._lineHistoryMax) this._lineHistory.shift();
        // Always do the visual: expression on the robot.
        try {
            this.pipAvatar?.setExpression?.({ Voice: "M1", expression: pick.action });
        } catch (e) {
            console.warn("[snark] setExpression failed:", e);
        }
        if (!this.muted) {
            // Audible — kpop.speak routes through palChat's TTS path.
            try {
                this.kpop?.speak?.({ Voice: "M1", Text: pick.text });
            } catch (e) {
                console.warn("[snark] kpop.speak failed:", e);
            }
        } else {
            // Muted — still post the text to the listener iframe as a
            // silent "speak" so the robot mouths it without TTS audio.
            // Saves the TTS cost while still giving visual feedback.
            try {
                if (this.pipAvatar?.speak) {
                    this.pipAvatar.speak({ Voice: "M1", Text: pick.text });
                }
            } catch {}
        }
    }
}

// Console hookup helper. Called once from main.js after construction.
export function installSnarkyConsoleAPI(snark) {
    if (typeof window === "undefined") return;
    window.snark = {
        enable:  () => snark.enable(),
        disable: () => snark.disable(),
        mute:    () => snark.mute(),
        unmute:  () => snark.unmute(),
        get muted()    { return snark.muted; },
        set muted(v)   { v ? snark.mute() : snark.unmute(); },
        test:    (type) => snark.test(type),
        get lines()    { return snark.lines; },
        types:   () => Object.keys(SNARK_LINES).filter(k => k !== "_default").sort(),
    };
    console.log("[snark] window.snark ready. 'snark.enable()' to start. Muted by default.");
}
