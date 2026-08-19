// WebGLEngine/ev/esMissions.js — Endless Sky mission + event runner. Sits on ev/esConditions.js:
// it decides what's offerable, walks a mission through offer -> accept -> (waypoints/stopovers) ->
// complete/fail, keeps the ES lifecycle condition keys ("<name>: offered/active/done/..."), moves
// credits/cargo/passengers, and applies events (condition sets + system link/government changes).
//
//   import { createConditionStore } from "./esConditions.js";
//   import { createEsMissionRunner } from "./esMissions.js";
//   const store = createConditionStore(player, uni);
//   const run = createEsMissionRunner(uni, store, { toast, onDialog, onConversation });
//   const offers = run.available(planetName, systemName, planetObj, { board: "job" });
//   run.offer(m); run.accept(m); ... run.onArrive(planetId, systemId);
//
// Faithful for: lifecycle + condition bookkeeping, `to offer` gating, source/destination filters
// (planet name, or government + attributes + jump `distance`), payment/fine, `event`/`fail` dispatch,
// event world-changes. NPC combat objectives are driven by ev/esCombat.js (spawn on system entry; kill/
// save/evade/accompany/board/disable resolution gates completion). Honest stubs still: conversation
// branch outcomes (treated as text; acceptance defaults to accepted), full LocationFilter (near/not),
// and the scan/capture/assist/provoke events until the flight layer reports them.
//
// v2174 -- THE CLOCK. One day passes per system entry (Engine::EnterSystem -> PlayerInfo::AdvanceDate).
// Each day, in ES's order: the date advances, scheduled events whose day has come are applied, then any
// mission whose deadline is now in the past fails. Before this the clock did not exist: advanceDate()
// was called by nothing, eventQueue was drained and never filled, `event "war" 30 60` fired instantly
// (228 places in the base game), 400 deadlines could never expire, and `days since start` read zero.

"use strict";

import { evaluateTest, applyActions, findChild } from "./esConditions.js";
import { startDate, dateFromEpochDay, daysSinceEpoch } from "./esDate.js";   // v2174 -- the game clock
import { buildSubstitutions } from "./esSubs.js";                            // v2177 -- mission-local <token>s
import { buildFilter, bareName, matchesPlanet, makeEnv } from "./esLocation.js";   // v2179 -- one LocationFilter
import { createNpcTracker } from "./esCombat.js";
import { spawnFleet, spawnShip } from "./esFleets.js";

function tokJoin(n) { return n.tokens.join(" "); }
function child(n, key) { return findChild(n, key); }
function children(n, key) { const out = []; if (n && n.children) for (const c of n.children) if (c.tokens[0] === key) out.push(c); return out; }
function firstText(n) {
    // best-effort short brief: the `description` or `name` value token
    const d = child(n, "description"); if (d && d.tokens[1]) return d.tokens[1];
    const nm = child(n, "name"); if (nm && nm.tokens[1]) return nm.tokens[1];
    return "";
}

function createEsMissionRunner(uni, store, hooks = {}) {
    const rnd = hooks.rnd || Math.random;   // v2174 -- event delays are drawn from [min, max]
    const toast = hooks.toast || (() => {});
    const onDialog = hooks.onDialog || (() => {});
    const onConversation = hooks.onConversation || (() => {});
    const rng = hooks.rng || Math.random;

    // ----- indexes -----
    const missionsByName = new Map();
    for (const m of (uni.esMissions || [])) if (m.tokens[1] != null) missionsByName.set(m.tokens[1], m);
    const eventsByName = new Map();
    for (const e of (uni.esEvents || [])) if (e.tokens[1] != null) eventsByName.set(e.tokens[1], e);

    const spobByName = new Map(), systemByName = new Map();
    for (const s of uni.systems) systemByName.set(s.name, s);
    for (const k in uni.spobs) { const sp = uni.spobs[k]; if (sp.name) spobByName.set(sp.name, sp); }
    const govtName = (id) => (uni.govts[id] && uni.govts[id].name) || null;

    // jump-distance BFS between systems (for `distance` / `near` filters), memoized from a source
    function jumpDist(fromSysId, toSysId) {
        if (fromSysId === toSysId) return 0;
        const seen = new Set([fromSysId]); let frontier = [fromSysId], d = 0;
        while (frontier.length && d < 40) {
            d++; const next = [];
            for (const id of frontier) { const s = uni.systemById[id]; if (!s) continue; for (const l of s.links) { if (seen.has(l)) continue; if (l === toSysId) return d; seen.add(l); next.push(l); } }
            frontier = next;
        }
        return Infinity;
    }

    // ----- active state -----
    const active = [];   // { name, node, dest:{planetId,systemId}, waypoints:Set, stopovers:Set, cargo, passengers, pay }

    // NPC combat-objective tracker: spawns each accepted mission's `npc` ships when the player reaches the
    // right system and resolves kill/save/evade/accompany/… so completion can gate on combat, not just
    // arrival. runBlock lets an npc `on <trigger>` reuse this file's action dispatch (payment/event/fail/…).
    const npc = createNpcTracker(uni, store, {
        toast,
        rng,
        runBlock: (node, ctx) => { const r = applyActions(node, store); dispatch(r.skipped, ctx || {}); },
        evalTest: (node) => evaluateTest(node, store),
        spawner: { spawnFleet, spawnShip },
    });

    // lifecycle condition keys ES maintains, used for cross-mission gating
    const lkey = (name, phase) => `${name}: ${phase}`;
    const mark = (name, phase) => store.set(lkey(name, phase), 1);
    const isMarked = (name, phase) => store.get(lkey(name, phase)) !== 0;

    function classify(m) {
        if (child(m, "job")) return "job";
        if (child(m, "landing")) return "landing";
        if (child(m, "assisting")) return "assisting";
        if (child(m, "boarding")) return "boarding";
        return "landing";   // default offer trigger
    }

    // does a planet satisfy a source/destination spec node? spec is either bare `source "Planet"`
    // (name in tokens[1]) or a filter block (children: government/attributes/distance).
    // v2179 -- one LocationFilter, in ev/esLocation.js. This function used to ignore every key it did not
    // recognise, which across the base game meant 773 of them -- 567 `not` blocks among them. Ignoring a
    // `not` does not narrow a filter; it inverts it, and a mission whose source is "any Republic world,
    // NOT Earth" was offered on Earth. It also read `distance 3` as min=3 max=3 rather than max=3.
    const filterCache = new WeakMap();
    const filterOf = (node) => { let f = filterCache.get(node); if (!f) { f = buildFilter(node); filterCache.set(node, f); } return f; };
    function locEnv(fromSysId) {
        return makeEnv(uni, {
            origin: fromSysId,
            visitedSystems: store.player && store.player.visitedSystems,
            visitedPlanets: store.player && store.player.visitedPlanets,
        });
    }
    function planetMatches(spec, planet, fromSysId) {
        if (!spec) return true;
        const bn = bareName(spec);
        if (bn) return planet.name === bn;
        return matchesPlanet(filterOf(spec), planet, locEnv(fromSysId));
    }

    // choose a concrete destination planet for a mission from its destination spec + a source system
    function pickDestination(m, fromSysId) {
        const spec = child(m, "destination");
        if (!spec) return null;
        if (spec.tokens.length >= 2 && (!spec.children || !spec.children.length)) {
            const sp = spobByName.get(spec.tokens[1]); return sp ? { planetId: sp.id, systemId: sp._systemId, name: sp.name } : null;
        }
        const matches = [];
        for (const s of uni.systems) for (const sp of s.spobs) if (sp.landable && planetMatches(spec, sp, fromSysId)) matches.push({ planetId: sp.id, systemId: s.id, name: sp.name });
        if (!matches.length) return null;
        return matches[Math.floor(rng() * matches.length)];
    }

    // ----- offering -----
    function available(planetName, systemName, planetObj, opts = {}) {
        const board = opts.board || null;   // "job" | "landing" | null(any)
        const sys = systemByName.get(systemName);
        const fromSysId = sys ? sys.id : null;
        const planet = planetObj || spobByName.get(planetName) || { name: planetName, govt: 0, attributes: [] };
        const out = [];
        for (const m of missionsByName.values()) {
            const name = m.tokens[1];
            if (isMarked(name, "active") || isMarked(name, "done")) continue;
            if (isMarked(name, "offered") && !child(m, "repeat")) continue;
            const type = classify(m);
            if (board === "job" && type !== "job") continue;
            if (board === "landing" && type === "job") continue;
            if (!planetMatches(child(m, "source"), planet, fromSysId)) continue;
            const toOffer = child(m, "to offer");
            if (toOffer && !evaluateTest(toOffer, store)) continue;
            out.push(m);
        }
        // v2205 -- and now ES's actual rule decides which of them the player is shown. The old arbitrary
        // `if (out.length >= 20) break;` cap is gone: it truncated the candidate list BEFORE the rule ran,
        // so a priority mission sitting at index 21 was silently never offered.
        return opts.raw ? out : chooseOffers(out);
    }

    // dispatch the non-condition verbs applyActions returns as "skipped"
    // v2178 -- a conversation is a DECISION, not a side effect. dispatch no longer fires a hook for it; it
    // records it on the ctx and lets the caller play it and come back with ES's own outcome word.
    // The same is true of `dialog`, which in ES is a yes/no panel when it appears in `on offer`.
    function dispatch(skipped, ctx) {
        for (const t of skipped) {
            const v = t[0];
            if (v === "payment") { const base = +t[1] || 0, perTon = +t[2] || 0; store.add("credits", base + perTon * (ctx.cargo || 0)); ctx.pay = (ctx.pay || 0) + base + perTon * (ctx.cargo || 0); }
            else if (v === "fine") { store.add("credits", -(+t[1] || 0)); }
            else if (v === "debt") { store.add("credits", -(+t[1] || 0)); }
            else if (v === "event") { scheduleEventIn(t[1], t[2], t[3]); }   // v2174 -- `event <name> <min> [max]` days from now
            else if (v === "fail") { const target = t[1] || ctx.name; failMission(target); }
            else if (v === "dialog") { ctx.dialog = t.slice(1).join(" "); }
            // A conversation is either a NAME (look it up in uni.conversations) or an inline node.
            else if (v === "conversation") { ctx.conversation = { name: t.length > 1 ? t.slice(1).join(" ") : null, node: ctx.convNode || null }; }
            // v2178 -- 93 conversation actions write to the pilot's log. `log <text>` or
            // `log <category> <heading> <text>`. Kept, because a campaign that never explains itself is
            // half a campaign, and the panel that shows it is a small thing to add later.
            else if (v === "log") { logbook.push(t.length >= 4 ? { category: t[1], heading: t[2], text: t[3] } : { category: null, heading: null, text: t.slice(1).join(" ") }); }
            // give/take/outfit/mute/music/mark/unmark -> the flight and outfit layers, when they exist
            else if (ctx.unhandled) ctx.unhandled.push(v);
        }
    }
    const logbook = [];

    // The phases that MAY gate a mission. Everything else plays its conversation for the flavour and
    // carries on: nothing hangs on how you answer a `on complete` conversation except, sometimes, dying.
    function runOn(m, phase, ctx) {
        const blk = child(m, "on " + phase) || (m.children || []).find((c) => tokJoin(c) === "on " + phase);
        if (!blk) return ctx;
        const r = applyActions(blk, store);
        // v2177 -- 1,623 of the game's conversations are written INLINE inside an `on` block, and
        // applyActions hands back token arrays, which drops the children. Find the node itself.
        ctx.convNode = (blk.children || []).find((c) => c.tokens[0] === "conversation" && c.children && c.children.length) || null;
        // ES (Mission::Load): a mission may carry its own `substitutions` block, 66 of them in the base
        // game. They are layered over the global ones for this mission's text and nobody else's.
        ctx.subs = buildSubstitutions({ children: (m.children || []).filter((c) => c.tokens[0] === "substitutions") });
        dispatch(r.skipped, ctx);
        // `on offer` is the one phase whose conversation DECIDES. Every other phase plays for flavour.
        if (phase !== "offer") {
            if (ctx.conversation) onConversation(ctx.conversation.name, ctx.conversation.node, ctx);
            if (ctx.dialog) onDialog(ctx.dialog);
        }
        return ctx;
    }

    // v2205 -- WHICH MISSION GETS OFFERED. The runner had no answer: `available()` handed back whatever
    // order the map happened to hold, capped at an arbitrary twenty. ES has a real rule, and it is four
    // flags and a sort (PlayerInfo.cpp, `StepMissions`):
    //
    //   `priority`          if ANY available mission has it, only priority and non-blocking may offer.
    //   `non-blocking`      exempt from both rules: it neither blocks minors nor is blocked by priority.
    //   `minor`             offered only if nothing else is competing. "This is to avoid having two or
    //                       three missions pop up as soon as you enter the spaceport."
    //   `offer precedence`  a stable sort, DESCENDING. Ties keep alphabetical order, because the Set the
    //                       missions come out of is alphabetical.
    //
    // AND THE LINE THAT LOOKS LIKE A BUG AND IS NOT. Excess minors are erased from the FRONT of a list
    // sorted by DESCENDING precedence, so "the minor mission with the lowest precedence is the one that
    // will be offered." ES's own comment says so. A reasonable person implementing this from the field
    // name would keep the highest, and be wrong on 302 missions.
    const hasPriority = (m) => !!child(m, "priority");
    const isNonBlocking = (m) => !!child(m, "non-blocking");
    const isMinor = (m) => !!child(m, "minor");
    // In the data it is written `"offer precedence" 5` -- QUOTED, so the two words are ONE token, because
    // ES's parser takes `node.Token(0)` as the key. An unquoted `offer precedence 5` is not this key at all;
    // ES would read the key as `offer` and warn. A first draft of the fixture below wrote it unquoted, and
    // the reader was "fixed" to match invalid ES. All 32 in the base game are quoted.
    const offerPrecedence = (m) => { const c = child(m, "offer precedence"); return c ? (+c.tokens[1] || 0) : 0; };
    // `blocked <message>`: what the player is told when a mission WOULD offer but they have no room for it.
    // The runner does not know the ship's hold; it hands the message to whoever does.
    const blockedText = (m) => { const c = child(m, "blocked"); return c ? c.tokens.slice(1).join(" ") : null; };

    // v2211 -- SMUGGLING. `illegal`, `stealth` and `apparent payment` -- 158 uses across the base game, and
    // the runner read none of them, so a mission that was meant to be dangerous to carry was carried for
    // free.
    //
    //   `illegal <fine>`             a scan of your hold costs you this many credits.
    //   `illegal <fine> "<message>"` ...and the authorities say this instead of the default.
    //   `stealth`                    being scanned at all FAILS the mission. Not a fine: a failure.
    //   `apparent payment <n>`       what the mission SAYS it pays. The real payment is on `on complete`.
    //
    // `Mission::ParseContraband` reads `illegal` and `stealth`, and both were legal as children of `cargo`
    // once; ES warns about that spelling now and still accepts it. So does this.
    //
    // A NEGATIVE FINE IS NOT A FINE. It is an ATROCITY: `CargoHold::IllegalCargoFine` returns -1 and stops
    // looking. Carrying it is not something you pay for.
    const contrabandNode = (m, key) => child(m, key) || (child(m, "cargo") && child(child(m, "cargo"), key)) || null;
    const fineOf = (m) => { const c = contrabandNode(m, "illegal"); return c ? (+c.tokens[1] || 0) : 0; };
    const fineMessage = (m) => { const c = contrabandNode(m, "illegal"); return c && c.tokens.length >= 3 ? c.tokens.slice(2).join(" ") : null; };
    const failIfDiscovered = (m) => !!contrabandNode(m, "stealth");
    const isAtrocity = (m) => fineOf(m) < 0;
    // `Mission::DisplayedPayment` -- the apparent payment if there is one, otherwise the real one. A mission
    // may therefore LOOK like it pays five thousand and pay fifty, or the reverse, and both are used.
    const apparentPayment = (m) => { const c = child(m, "apparent payment"); return c ? (+c.tokens[1] || 0) : 0; };

    // THE ASYMMETRY, AND ITS REASON. `CargoHold::IllegalCargoFine`:
    //
    //   outfits        totalFine = max(totalFine, fine / 2)      -- HALVED, and a MAXIMUM
    //   mission cargo  totalFine += fine                         -- SUMMED
    //
    // ES's own comment: fines for illegal mission cargo "are added together to avoid the player being able
    // to stack multiple illegal jobs at once and avoid the bulk of the penalties when fined." Anybody
    // implementing this from the field name would take the maximum of everything, and would be wrong on
    // every player who ever carried two contraband jobs at once.
    //
    // A FAILED MISSION'S CARGO IS NOT FINED, and one atrocity ends the count wherever it is found.
    function illegalCargoFine(missions, { outfitFines = [], ignoresIllegals = false, ignoresAtrocities = false } = {}) {
        let total = 0;
        for (const f of outfitFines) {
            if (f < 0) return { fine: ignoresAtrocities ? 0 : -1, atrocity: true, message: null };
            total = Math.max(total, Math.floor(f / 2));
        }
        for (const m of missions) {
            const f = fineOf(m);
            if (f < 0) return { fine: ignoresAtrocities ? 0 : -1, atrocity: true, message: fineMessage(m) };
            if (m.failed) continue;                       // a failed mission's cargo is nobody's business
            if (ignoresIllegals) continue;
            total += f;
        }
        return { fine: total, atrocity: false, message: null };
    }

    // A scan happened. `stealth` is not a fine, it is a FAILURE: being discovered at all ends the mission,
    // whether or not the cargo was worth fining you for. The fine is computed over what you are still
    // carrying, and a mission the scan just failed is still in your hold at the moment of the scan -- ES
    // fines first and fails after, which is why `illegalCargoFine` is given the list before the filter.
    function onScanned(missions, opts = {}) {
        const carried = missions.filter((m) => !m.failed);
        const res = illegalCargoFine(carried, opts);
        return { ...res, failed: carried.filter(failIfDiscovered) };
    }

    // The whole rule, on a list of candidates that already passed `to offer` and their location filters.
    function chooseOffers(candidates) {
        // Alphabetical first: ES's `Set` yields them that way, and the precedence sort below is STABLE, so
        // alphabetical order survives a tie. Sorting by precedence without this makes ties arbitrary.
        const missions = candidates.slice().sort((a, b) => String(a.tokens[1]).localeCompare(String(b.tokens[1])));
        // Stable sort, descending. Array.prototype.sort is stable in every engine this runs in.
        missions.sort((a, b) => offerPrecedence(b) - offerPrecedence(a));

        const nonBlocking = missions.filter(isNonBlocking).length;

        if (missions.some(hasPriority)) {
            return missions.filter((m) => hasPriority(m) || isNonBlocking(m));
        }
        if (missions.length > 1 + nonBlocking) {
            // Erase minors from the FRONT -- the highest precedence first -- and stop the moment the list is
            // small enough. The survivor is the LOWEST-precedence minor.
            const out = missions.slice();
            let i = 0;
            while (i < out.length) {
                if (isMinor(out[i])) {
                    out.splice(i, 1);
                    if (out.length <= 1 + nonBlocking) break;
                } else i++;
            }
            return out;
        }
        return missions;
    }

    function cargoTons(m) { const c = child(m, "cargo"); return c ? (+c.tokens[2] || 0) : 0; }
    function passengerCount(m) { const p = child(m, "passengers"); return p ? (+p.tokens[1] || 0) : 0; }

    // v2178 -- the offer no longer decides anything by itself. It runs `on offer` and hands back whatever
    // that block wants the player to see: a conversation (1,220 of the base game's 2,270 missions), a
    // yes/no dialog (44), or nothing at all (a job you take off the board). The caller plays it and
    // returns with ES's own outcome word through resolveOffer().
    function offer(m) {
        const name = m.tokens[1];
        mark(name, "offered");
        const ctx = { name, cargo: cargoTons(m) };
        runOn(m, "offer", ctx);
        return {
            name, brief: firstText(m),
            canAccept: !isMarked(name, "declined") && !isMarked(name, "failed"),
            conversation: ctx.conversation || null,
            dialog: ctx.dialog || null,
            subs: ctx.subs || [],
        };
    }

    // ES's ConversationPanel hands PlayerInfo::MissionCallback one of these. ACCEPT/LAUNCH take the
    // mission; DECLINE/FLEE refuse it for good; DEFER/DEPART put it back on the board to be offered again;
    // DIE/EXPLODE end the game and settle nothing.
    function resolveOffer(m, outcome) {
        const name = m.tokens[1];
        // The word here is `refused`. The obvious alternative is also the name of an ES mission key we do
        // not handle, and es-coverage's drift guard scans the raw source -- comments included -- for any
        // declared-vs-reported mismatch. It caught this. A coincidence of vocabulary is not a reason to
        // weaken the guard, so the return value moved instead.
        if (outcome === "accept") return accept(m) ? "accepted" : "refused";
        if (outcome === "decline") { decline(m); return "declined"; }
        if (outcome === "defer") {
            // Deferring is not declining. Clear the `offered` mark so `available()` will show it again --
            // otherwise a mission you asked to think about would never come back.
            store.set(lkey(name, "offered"), 0);
            return "deferred";
        }
        if (outcome === "die") { toast("You died."); return "died"; }
        return "ignored";
    }

    // v2164 -- ES gates the mission lifecycle on FOUR condition blocks, not one. `to offer`
    // was implemented; `to accept`, `to complete` and `to fail` were parsed by nobody. The
    // coverage reporter counted them in real ES master: to offer 2237 (read), to fail 174,
    // to accept 102, to complete 100 -- i.e. 376 live gates silently ignored, which let a
    // mission complete when Endless Sky says it must not. findChild matches tokens.join(" "),
    // so the two-word key works.
    //   absent block  -> pass (an ungated mission is not blocked)
    //   present block -> must evaluate true
    function gate(node, key) {
        const c = child(node, key);
        return !c || evaluateTest(c, store);
    }

    // `to fail`: whenever it becomes true the mission fails, wherever the player is. Called
    // on arrival and on jump so it can't only fire at a destination the player never reaches.
    function checkFailures() {
        const failed = [];
        for (const rec of active.slice()) {
            const c = child(rec.node, "to fail");
            if (c && evaluateTest(c, store)) { failMission(rec.name); failed.push(rec.name); }
        }
        return failed;
    }

    function accept(m) {
        const name = m.tokens[1];
        if (isMarked(name, "active") || isMarked(name, "done")) return false;
        if (!gate(m, "to accept")) { toast("Cannot accept: " + name); return false; }
        const sys = null;
        const fromSysId = store.player && store.player.system != null ? store.player.system : null;
        const dest = pickDestination(m, fromSysId);
        const cargo = cargoTons(m), passengers = passengerCount(m);
        mark(name, "active"); store.set(lkey(name, "offered"), 0);
        if (cargo) store.add("cargo: " + ((child(m, "cargo").tokens[1]) || "Mission Cargo"), cargo);
        if (passengers) store.add("passengers", passengers);
        // v2173 -- `invisible` (351 missions in the base game). ES keeps an invisible mission out of the
        // player's mission list and off the map (Mission::IsVisible, read by MissionPanel + PlayerInfo);
        // it is still offered, accepted and run. It is a display rule, not a gameplay one. Until now
        // nothing read the key at all -- the corrected coverage table is what surfaced that.
        const rec = { name, node: m, dest, visible: !child(m, "invisible"), deadline: deadlineFor(m, fromSysId, dest),
            waypoints: new Set(children(m, "waypoint").map((w) => w.tokens[1])),
            stopovers: new Set(children(m, "stopover").map((s) => s.tokens[1])), cargo, passengers, pay: 0 };
        active.push(rec);
        runOn(m, "accept", rec);
        npc.armMission(rec);   // parse this mission's `npc` blocks; they spawn on the right system entry
        toast("Mission accepted: " + name);
        return true;
    }

    // ES (Mission::Load + Instantiate):
    //   `deadline <d> <m> <y>`  -> an absolute date
    //   `deadline`              -> multiplier += 2
    //   `deadline <base>`       -> base += base
    //   `deadline <base> <mult>`-> base += base, multiplier += mult
    // and then, at the moment you accept:  deadline = today + base + multiplier * jumps.
    // ES counts jumps through the mission's waypoints and stopovers (Mission::CalculateJumps); we count
    // the direct source -> destination distance. A courier run with a detour therefore gets slightly less
    // time from us than from ES. Named here rather than hidden.
    function deadlineFor(m, fromSysId, dest) {
        const nodes = children(m, "deadline");
        if (!nodes.length) return null;
        let base = 0, mult = 0;
        for (const n of nodes) {
            if (n.tokens.length >= 4) {
                const d = +n.tokens[1], mo = +n.tokens[2], y = +n.tokens[3];
                if (Number.isFinite(d) && Number.isFinite(mo) && Number.isFinite(y)) return daysSinceEpoch(y, mo, d);
            } else if (n.tokens.length === 1) mult += 2;
            else { base += +n.tokens[1] || 0; if (n.tokens.length >= 3) mult += +n.tokens[2] || 0; }
        }
        if (!base && !mult) return null;
        const jumps = (dest && dest.systemId != null && fromSysId != null) ? jumpDist(fromSysId, dest.systemId) : 0;
        return today() + base + mult * (Number.isFinite(jumps) ? jumps : 0);
    }

    function decline(m) { const name = m.tokens[1]; mark(name, "declined"); runOn(m, "decline", { name }); }

    // The board button. If `on offer` produced something for the player to answer, the host is asked to
    // present it and to call back with the outcome; if it produced nothing (a job), the mission is simply
    // taken, as it is in ES.
    function takeOffer(m, redraw) {
        const o = offer(m);
        const settle = (outcome) => { resolveOffer(m, outcome); if (redraw) redraw(); };
        if (o.conversation && hooks.onOffer) { hooks.onOffer(o, settle); return; }
        if (o.dialog && hooks.onOffer) { hooks.onOffer(o, settle); return; }
        settle("accept");
        return o;
    }
    function abort(m) { const name = (m.tokens ? m.tokens[1] : m); const rec = active.find((a) => a.name === name); if (rec) removeActive(rec); mark(name, "aborted"); if (m.children) runOn(m, "abort", { name }); }

    function removeActive(rec) {
        const i = active.indexOf(rec); if (i >= 0) active.splice(i, 1);
        if (rec.cargo) store.add("cargo: " + ((child(rec.node, "cargo") && child(rec.node, "cargo").tokens[1]) || "Mission Cargo"), -rec.cargo);
        if (rec.passengers) store.add("passengers", -rec.passengers);
    }

    function completeMission(rec) {
        mark(rec.name, "done"); store.set(lkey(rec.name, "active"), 0);
        const ctx = { name: rec.name, cargo: rec.cargo, pay: 0 };
        runOn(rec.node, "complete", ctx);
        removeActive(rec);
        toast(`Mission complete: ${rec.name}` + (ctx.pay ? ` · +${ctx.pay.toLocaleString()} cr` : ""));
        return ctx;
    }
    function failMission(name) {
        const rec = active.find((a) => a.name === name);
        mark(name, "failed");
        if (rec) { store.set(lkey(name, "active"), 0); runOn(rec.node, "fail", { name }); removeActive(rec); }
        else { const m = missionsByName.get(name); if (m) runOn(m, "fail", { name }); }
    }

    // arriving somewhere: advance waypoints/stopovers, complete missions whose destination is here AND
    // whose NPC combat objectives are satisfied (kill/board/save/accompany/…). A `save`/`accompany` NPC
    // that died fails the mission here instead of completing it.
    function onArrive(planetId, systemId) {
        const completed = [];
        checkFailures();             // v2164 -- `to fail` can trip before anything else resolves
        npc.onArriveDestination();   // resolve `accompany` (surviving ships arrived with the player)
        const sysName = (uni.systemById[systemId] && uni.systemById[systemId].name) || null;
        const planet = uni.spobs[planetId];
        const planetName = planet ? planet.name : null;
        for (const rec of active.slice()) {
            if (sysName && rec.waypoints.has(sysName)) rec.waypoints.delete(sysName);
            if (planetName && rec.stopovers.has(planetName)) rec.stopovers.delete(planetName);
            const atDest = rec.dest && (rec.dest.planetId != null ? rec.dest.planetId === planetId : rec.dest.systemId === systemId);
            const ready = rec.waypoints.size === 0 && rec.stopovers.size === 0;
            if (npc.missionFailed(rec.name)) { failMission(rec.name); npc.clearMission(rec.name); continue; }
            if (atDest && ready && npc.missionReady(rec.name) && gate(rec.node, "to complete")) { completed.push(completeMission(rec)); npc.clearMission(rec.name); }
        }
        return completed;
    }

    // ----- the clock -----------------------------------------------------------------------
    // `store.player.date` is the object esConditions reads for day/month/year/"days since epoch"/
    // "days since start". Nobody ever built it, so every date condition in the game read zero. If the
    // caller has not set one, start where every ES start does: 16 Nov 3013.
    if (store.player && !store.player.date) store.player.date = startDate();
    if (store.player && store.player.startEpochDay == null)
        store.player.startEpochDay = store.player.date ? store.player.date.epochDay : 0;
    const today = () => (store.player && store.player.date ? store.player.date.epochDay : 0);

    // ----- events: apply condition sets + world changes to uni -----
    const eventQueue = [];   // { name, epochDay }

    // ES: GameAction `event <name> [minDays=1] [maxDays=minDays]`, the delay drawn uniformly from the
    // range at instantiation (GameAction::Instantiate), then PlayerInfo::AddEvent applies it at once if
    // that day has already passed. Note the DEFAULT IS ONE DAY, not zero -- a bare `event "x"` is
    // tomorrow's news, not today's.
    function scheduleEvent(name, epochDay) {
        if (!eventsByName.has(name)) return false;
        if (epochDay <= today()) return applyEvent(name);
        eventQueue.push({ name, epochDay });
        return true;
    }
    function scheduleEventIn(name, minDays, maxDays) {
        let lo = minDays != null && Number.isFinite(+minDays) ? Math.trunc(+minDays) : 1;
        let hi = maxDays != null && Number.isFinite(+maxDays) ? Math.trunc(+maxDays) : lo;
        if (hi < lo) { const t = lo; lo = hi; hi = t; }
        const delay = lo + Math.floor(rnd() * (hi - lo + 1));
        return scheduleEvent(name, today() + delay);
    }

    function applyEvent(name) {
        const ev = eventsByName.get(name);
        if (!ev) return false;
        ev._fired = true;
        const r = applyActions(ev, store);   // top-level condition assignments apply; blocks -> skipped
        for (const blk of r.skipped) applyEventBlockFromNode(ev);   // walk structured blocks
        return true;
    }
    function applyEventBlockFromNode(ev) {
        for (const c of ev.children) {
            const k = c.tokens[0];
            if (k === "system") {
                const s = systemByName.get(c.tokens[1]); if (!s) continue;
                for (const cc of c.children) {
                    if (cc.tokens[0] === "link") { const t = systemByName.get(cc.tokens[1]); if (t && !s.links.includes(t.id)) { s.links.push(t.id); if (!t.links.includes(s.id)) t.links.push(s.id); } }
                    else if (cc.tokens[0] === "unlink") { const t = systemByName.get(cc.tokens[1]); if (t) { s.links = s.links.filter((x) => x !== t.id); t.links = t.links.filter((x) => x !== s.id); } }
                    else if (cc.tokens[0] === "government") { const gid = [...Object.values(uni.govts)].find((g) => g.name === cc.tokens[1]); if (gid) s.govt = gid.id; }
                }
            } else if (k === "planet") {
                const sp = spobByName.get(c.tokens[1]); if (!sp) continue;
                for (const cc of c.children) if (cc.tokens[0] === "government") { const g = [...Object.values(uni.govts)].find((x) => x.name === cc.tokens[1]); if (g) sp.govt = g.id; }
            }
        }
    }
    // ES: a mission fails once the deadline is STRICTLY in the past (Mission::CheckDeadline: `deadline <
    // today`). The day of the deadline is still yours.
    function checkDeadlines() {
        const t = today(), failed = [];
        for (const rec of active.slice()) {
            if (rec.deadline == null || rec.deadline >= t) continue;
            failed.push(rec.name);
            toast("Deadline missed: " + rec.name);
            failMission(rec.name);
            npc.clearMission(rec.name);
        }
        return failed;
    }

    // One turn of the clock. ES does exactly this, in exactly this order, once per system entry
    // (Engine::EnterSystem -> PlayerInfo::AdvanceDate): the day advances, the events whose day has
    // arrived fire, then the missions you can no longer deliver on time fail.
    function advanceDate(days = 1) {
        const events = [], failed = [];
        for (let i = 0; i < Math.max(1, days | 0); i++) {
            if (store.player) store.player.date = dateFromEpochDay(today() + 1);
            const t = today();
            // A fired event may itself schedule another; drain until nothing more is due today.
            for (let guard = 0; guard < 64; guard++) {
                const q = eventQueue.find((e) => e.epochDay <= t);
                if (!q) break;
                eventQueue.splice(eventQueue.indexOf(q), 1);
                applyEvent(q.name); events.push(q.name);
            }
            failed.push(...checkDeadlines());
        }
        return { date: store.player ? store.player.date : null, events, failed };
    }

    // Combat event from the flight view. `entity` is the killed/boarded/scanned ship; if it belongs to a
    // mission NPC the tracker attributes it and may complete/fail the mission. type defaults to "destroy".
    // Returns any missions that just failed as a result (so the UI can surface them immediately).
    function recordEvent(entity, type = "destroy") {
        npc.recordEvent(entity, type);
        const failed = [];
        for (const rec of active.slice()) if (npc.missionFailed(rec.name)) { failMission(rec.name); npc.clearMission(rec.name); failed.push(rec.name); }
        return failed;
    }
    // Legacy no-arg path (EV kept a running counter); kept so ev.html's EV branch is undisturbed.
    function recordKill(entity) { if (entity) return recordEvent(entity, "destroy"); for (const rec of active) rec._kills = (rec._kills || 0) + 1; return []; }
    // The player jumped: resolve `evade`, drop off-system NPCs, spawn nothing (that happens on entry).
    function onPlayerJump(fromSysId, toSysId) { npc.onPlayerJump(fromSysId, toSysId); checkFailures(); }   // v2164 -- `to fail` may trip mid-flight
    // Entering a system: spawn this system's mission NPCs. Returns ship entities to add to the flight scene.
    function onSystemEnter(systemId, around, opts) { return npc.onSystemEnter(systemId, around, opts || {}); }

    // ES (PlayerInfo::New): a root event carrying an absolute `date` is scheduled for that date when a
    // new game begins -- 12 of them in the base game. We have no save/load yet, so a runner is only ever
    // constructed for a new game; when saves land, this must move behind that check.
    for (const [evName, evNode] of eventsByName) {
        const dn = child(evNode, "date");
        if (dn && dn.tokens.length >= 4) {
            const d = +dn.tokens[1], mo = +dn.tokens[2], y = +dn.tokens[3];
            if (Number.isFinite(d) && Number.isFinite(mo) && Number.isFinite(y)) scheduleEvent(evName, daysSinceEpoch(y, mo, d));
        }
    }

    // v2318 -- the pilot file must reload a mission mid-flight EXACTLY as it stood: its (possibly random)
    // destination, deadline, and remaining waypoints/stopovers -- NOT re-derived, which would re-roll a random
    // destination or extend the deadline. snapshotActive() serializes the live recs; restoreActive() rebuilds
    // them verbatim (node relinked by name) and re-arms their NPC combat objectives.
    function snapshotActive() {
        return active.map((r) => ({ name: r.name, dest: r.dest, deadline: r.deadline, visible: r.visible !== false,
            waypoints: [...(r.waypoints || [])], stopovers: [...(r.stopovers || [])],
            cargo: r.cargo || 0, passengers: r.passengers || 0, pay: r.pay || 0 }));
    }
    function restoreActive(list) {
        active.length = 0; if (!Array.isArray(list)) return 0;
        let n = 0;
        for (const s of list) {
            if (!s || !s.name) continue;
            const m = missionsByName.get(s.name); if (!m) continue;   // node gone (data changed) -> skip, never crash
            const rec = { name: s.name, node: m, dest: s.dest || null, visible: s.visible !== false,
                deadline: s.deadline != null ? s.deadline : null,
                waypoints: new Set(s.waypoints || []), stopovers: new Set(s.stopovers || []),
                cargo: s.cargo || 0, passengers: s.passengers || 0, pay: s.pay || 0 };
            active.push(rec);
            try { npc.armMission(rec); } catch (e) {}
            n++;
        }
        return n;
    }

    return {
        available, chooseOffers, snapshotActive, restoreActive,
        hasPriority, isMinor, isNonBlocking, offerPrecedence, blockedText,
        fineOf, fineMessage, failIfDiscovered, isAtrocity, apparentPayment, illegalCargoFine, onScanned, offer, resolveOffer, takeOffer, accept, decline, abort, onArrive, applyEvent, advanceDate,
        scheduleEvent, scheduleEventIn, checkDeadlines, date: () => (store.player ? store.player.date : null),
        // v2175 -- news items carry a `to show` condition block. It is the same grammar the mission gates
        // use, so it is evaluated by the same code rather than a second, subtly different one.
        test: (node) => { try { return !!evaluateTest(node, store); } catch (e) { return false; } },
        // v2176 -- a start's opening state is a list of condition assignments, and ES applies them with
        // the same machinery as a mission's `on offer` (StartConditions::Load falls through to
        // conditions.Add). So do we, rather than growing a second, subtly different applier.
        // v2178 -- a conversation's `action` block is not just condition assignments: 93 of them write to
        // the pilot's log, 106 install an outfit, 79 pay you, 20 schedule an event, 11 fail a mission.
        // They run through the SAME dispatch a mission's `on` block does, rather than a second one.
        apply: (node, ctx) => {
            try {
                const c = ctx || {};
                const r = applyActions(node, store);
                dispatch(r.skipped, c);
                return r;
            } catch (e) { return null; }
        },
        logbook: () => logbook.slice(),
        pending: () => eventQueue.map((q) => ({ name: q.name, epochDay: q.epochDay })),
        recordKill, recordEvent, onSystemEnter, onPlayerJump, checkFailures, npcState: (name) => npc.npcState(name),
        // The player's mission list. Invisible missions are running -- they simply do not appear, exactly
        // as in ES. `{ all: true }` is for anything that needs the real set (tests, debug, save).
        active: (opts) => (opts && opts.all ? active.slice() : active.filter((r) => r.visible !== false)),
        missionsByName, eventsByName,
        // ---- browser UI seam: mirror the EV mission object's methods ----
        render(spob) {
            if (typeof document === "undefined") return;
            const el = document.getElementById("portMissions"); if (!el) return;
            const sysName = spob && spob._systemName;
            const offers = available(spob.name, sysName, spob, { board: "job" });
            el.innerHTML = offers.map((m) => {
                const nm = (child(m, "name") && child(m, "name").tokens[1]) || m.tokens[1];
                const brief = firstText(m).slice(0, 220);
                return `<div class="missionCard" style="border:1px solid var(--edge);border-radius:8px;padding:8px;margin:6px 0">
                    <div style="font-weight:600">${escapeHtml(nm)}</div>
                    <div style="color:var(--dim);font-size:12px;margin:3px 0">${escapeHtml(brief)}</div>
                    <button class="btn" data-esm="${escapeHtml(m.tokens[1])}" style="font-size:12px">Accept</button></div>`;
            }).join("") || '<div style="color:var(--dim)">No jobs available here.</div>';
            // v2178 -- taking a mission is not the same as being offered one. 1,220 of the base game's
            // missions answer that with a conversation; the host plays it and calls resolveOffer().
            el.querySelectorAll("[data-esm]").forEach((b) => b.onclick = () => { const m = missionsByName.get(b.dataset.esm); if (m) takeOffer(m, () => this.render(spob)); });
        },
        renderBar(spob) {
            if (typeof document === "undefined") return;
            const body = document.getElementById("svcBody"); if (!body) return;
            const sysName = spob && spob._systemName;
            const offers = available(spob.name, sysName, spob, { board: "landing" });
            body.innerHTML = offers.map((m) => {
                const nm = (child(m, "name") && child(m, "name").tokens[1]) || m.tokens[1];
                return `<div style="padding:6px 0;border-bottom:1px solid var(--edge)"><b>${escapeHtml(nm)}</b>
                    <div style="color:var(--dim);font-size:12px">${escapeHtml(firstText(m).slice(0, 240))}</div>
                    <button class="btn" data-esm="${escapeHtml(m.tokens[1])}" style="font-size:12px;margin-top:4px">Accept</button></div>`;
            }).join("") || '<div style="color:var(--dim)">Nothing of interest in the bar.</div>';
            body.querySelectorAll("[data-esm]").forEach((b) => b.onclick = () => { const m = missionsByName.get(b.dataset.esm); if (m) takeOffer(m, () => this.renderBar(spob)); });
            const sp = document.getElementById("svcPanel"); if (sp) sp.classList.remove("hide");
        },
    };
}

function escapeHtml(s) { return String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }

if (typeof module !== "undefined" && module.exports) module.exports = { createEsMissionRunner };
export { createEsMissionRunner };
