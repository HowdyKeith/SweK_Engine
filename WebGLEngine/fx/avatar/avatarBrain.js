// fx/avatar/avatarBrain.js -- lets Avataro drive ITSELF. Each tick it encodes its own state (energy since the last
// reaction, mood, whether it's in cooldown, a slow circadian phase, how much is already happening) and either asks the
// GPU Brain (a window.__swekBrainInfer-style infer -> per-reaction scores) or, with no brain present, runs a built-in
// autonomous policy: mood-weighted reaction picks spaced by a cooldown so it doesn't twitch. The result is a blob that
// dances, looks around and high-fives on its own -- persisting, not performing. Pure + verified (rng/clock injectable).
"use strict";
const ENERGETIC = ["dance", "highFive", "wave", "bounce"], CALM = ["nod", "rotateHead", "wave"];

function makeAvatarDriver(avatar, opts = {}) {
    const infer = opts.infer || null;
    // v2422 -- the pools were hardcoded to Avataro's move names, so driving a DIFFERENT creature (the pet, which wags
    // and perks instead of dancing) would pick moves it doesn't have. Filter the pools to what this subject can
    // actually do, and fall back to all of its own moves when nothing matches.
    const _pools = opts.pools || { energetic: ENERGETIC, calm: CALM };
    const rng = opts.rng || Math.random;
    const now = opts._now || (() => Date.now() / 1000);
    let sinceReaction = 0, mood = opts.mood == null ? 0.5 : opts.mood, cooldown = 0, last = null;
    const reactions = avatar.reactions;
    const _e = _pools.energetic.filter(r => reactions.indexOf(r) >= 0), _c = _pools.calm.filter(r => reactions.indexOf(r) >= 0);
    const POOL_E = _e.length ? _e : reactions, POOL_C = _c.length ? _c : reactions;
    function encode() { return [Math.min(1, sinceReaction / 4), mood, cooldown > 0 ? 1 : 0, Math.sin(now() * 0.3) * 0.5 + 0.5, Math.min(1, avatar.active.length / 3)]; }
    function decode(out) { let bi = -1, bv = 0.5; for (let i = 0; i < reactions.length && i < out.length; i++) if (out[i] > bv) { bv = out[i]; bi = i; } return bi >= 0 ? reactions[bi] : null; }
    function pickWeighted() { const pool = mood > 0.5 ? POOL_E : POOL_C; return pool[Math.floor(rng() * pool.length)]; }
    function step(dt) {
        sinceReaction += dt; cooldown = Math.max(0, cooldown - dt);
        mood += (rng() - 0.5) * dt * 0.15; mood = Math.max(0, Math.min(1, mood));
        if (cooldown > 0) return null;
        let choice = null;
        if (infer) { try { const out = infer(encode()); if (out && out.length != null) choice = decode(out); } catch (e) {} }
        if (choice === null && sinceReaction > (1.6 + rng() * 2.4)) choice = pickWeighted();
        if (choice && avatar.react(choice)) { sinceReaction = 0; cooldown = 1.4 + rng(); last = choice; return choice; }   // only fire what it can actually do
        return null;
    }
    return { step, encode, decode, get mood() { return mood; }, set mood(m) { mood = m; }, get last() { return last; } };
}
export { makeAvatarDriver };
if (typeof module !== "undefined" && module.exports) module.exports = { makeAvatarDriver };
