// Self-check for ev/esMissions.js + esConditions.js. Synthetic lifecycle always runs; pass an ES
// data/ dir to also stress offer-evaluation over real missions:
//   node es-missions-selfcheck.mjs /path/to/endless-sky/data
import { parseESFiles, parseES } from "../esParse.js";
import { buildUniverseFromES } from "../esData.js";
import { createConditionStore } from "../esConditions.js";
import { createEsMissionRunner } from "../esMissions.js";
import { startDate, daysSinceEpoch, formatDate } from "../esDate.js";
import { buildConversation, startConversation } from "../esConversation.js";
import fs from "fs"; import path from "path";
let pass = 0, fail = 0; const ok = (n, c) => c ? pass++ : (fail++, console.log("  FAIL:", n));
const plain = (n) => ({ tokens: n.tokens.slice(), children: n.children.map(plain) });

// minimal universe with two planets in different systems so a planet destination is unambiguous
const uni = { source: "endless-sky", govts: {}, systems: [
  { id: 1, name: "Aye", x: 0, y: 0, links: [2], spobs: [] },
  { id: 2, name: "Bee", x: 10, y: 0, links: [1], spobs: [] } ], systemById: {}, spobs: {}, ships: [] };
uni.systemById = { 1: uni.systems[0], 2: uni.systems[1] };
const pA = { id: 101, name: "Aleph", govt: 0, landable: true, attributes: [], _systemId: 1, _systemName: "Aye" };
const pB = { id: 102, name: "Beth", govt: 0, landable: true, attributes: [], _systemId: 2, _systemName: "Bee" };
uni.systems[0].spobs = [pA]; uni.systems[1].spobs = [pB]; uni.spobs = { 101: pA, 102: pB };

const src = parseES([
  'mission "Run"', '\tjob', '\tsource "Aleph"', '\tdestination "Beth"', '\tcargo "Food" 5',
  '\tto offer', '\t\thas "ready"',
  '\ton accept', '\t\t"Run: took" = 1',
  '\ton complete', '\t\tpayment 1000', '\t\tevent "boom"',
  'event "boom"', '\t"boomed" = 1',
  // v2173 -- an invisible mission runs like any other and never appears in the player's list.
  'mission "Ghost"', '\tjob', '\tinvisible', '\tsource "Aleph"', '\tdestination "Beth"',
].join("\n"));
uni.esMissions = src.children.filter((c) => c.tokens[0] === "mission").map(plain);
uni.esEvents = src.children.filter((c) => c.tokens[0] === "event").map(plain);

const store = createConditionStore({ conditions: {}, credits: 0 }, uni);
const run = createEsMissionRunner(uni, store, {});
ok("gated before condition", !run.available("Aleph", "Aye", pA, { board: "job" }).some((m) => m.tokens[1] === "Run"));
store.set("ready", 1);
const m = run.available("Aleph", "Aye", pA, { board: "job" }).find((x) => x.tokens[1] === "Run");
ok("offered when ready", !!m);
run.offer(m); run.accept(m);
ok("active + on-accept + cargo", store.get("Run: active") === 1 && store.get("Run: took") === 1 && store.get("cargo: Food") === 5);
ok("no complete at wrong planet", run.onArrive(101, 1).length === 0 && store.get("Run: done") === 0);
run.onArrive(102, 2);
ok("complete at destination", store.get("Run: done") === 1);
// v2174 -- this test used to assert `store.get("boomed") === 1` right here, and it passed, because
// dispatch() fired a delayed event immediately. ES's default delay is ONE day: the payment lands now,
// the consequence lands tomorrow. 228 places in the base game were getting the wrong one.
ok("payment lands on completion", store.get("credits") === 1000);
ok("a chained event is SCHEDULED, not fired", store.get("boomed") === 0 && run.pending().some((q) => q.name === "boom"));
ok("...and lands the next day", run.advanceDate(1).events.includes("boom") && store.get("boomed") === 1);
ok("cargo cleared, none active", store.get("cargo: Food") === 0 && run.active().length === 0);

// v2173 -- `invisible`. 351 base-game missions carry it; nothing read the key until the coverage table
// was corrected and stopped claiming it. ES (Mission::IsVisible, read by MissionPanel + PlayerInfo)
// keeps the mission out of the player's list and off the map. It is still offered, accepted, and run.
{
  const g = run.available("Aleph", "Aye", pA, { board: "job" }).find((x) => x.tokens[1] === "Ghost");
  ok("an invisible mission is still OFFERED", !!g);
  run.offer(g); run.accept(g);
  ok("...and is still active", store.get("Ghost: active") === 1);
  ok("...but never appears in the player's mission list", !run.active().some((r) => r.name === "Ghost"));
  ok("...while active({all:true}) still sees it", run.active({ all: true }).some((r) => r.name === "Ghost"));
  ok("...and a visible mission is unaffected", run.active({ all: true }).length === 1);
}

const dir = process.argv[2];
if (dir && fs.existsSync(dir)) {
  const gather = (d) => { let o = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith("_")) continue; const p = path.join(d, e.name); if (e.isDirectory()) o = o.concat(gather(p)); else if (e.name.endsWith(".txt")) o.push(p); } return o; };
  const U = buildUniverseFromES(parseESFiles(gather(dir).map((f) => fs.readFileSync(f, "utf8"))));
  const st = createConditionStore({ conditions: {}, reputation: {}, credits: 1000 }, U);
  const rn = createEsMissionRunner(U, st, {});
  const planets = []; for (const s of U.systems) for (const sp of s.spobs) if (sp.landable) planets.push(sp);
  let n = 0, threw = 0;
  for (let i = 0; i < planets.length; i += 37) { try { rn.available(planets[i].name, planets[i]._systemName, planets[i], { board: "job" }); n++; } catch { threw++; } }
  ok("real offer-eval no throws", threw === 0);
  console.log(`  (real: ${U.esMissions.length} missions, ${U.esEvents.length} events; offers evaluated at ${n} planets)`);

  // v2178 -- offer EVERY mission that has an `on offer` conversation, play it to an ending, and settle it.
  // 1,220 of them. Before this round the board button called offer() then accept() back to back, so all
  // 1,220 stories had exactly one ending.
  const byName = new Map(U.esMissions.map((m) => [m.tokens[1], m]));
  let withConv = 0, withDialog = 0, plain = 0, badOutcome = 0, convThrew = 0, logTotal = 0;
  const settled = { accepted: 0, declined: 0, deferred: 0, died: 0, refused: 0, ignored: 0 };
  let seed = 1;
  for (const m of byName.values()) {
    const s2 = createConditionStore({ conditions: {}, reputation: {}, credits: 1e6, system: U.systems[0].id }, U);
    const r2 = createEsMissionRunner(U, s2, {});
    let off;
    try { off = r2.offer(m); } catch (e) { convThrew++; continue; }
    if (off.dialog) withDialog++;
    if (!off.conversation) { if (!off.dialog) plain++; continue; }
    withConv++;
    try {
      const conv = buildConversation(off.conversation.node || U.conversations[off.conversation.name] || { children: [] });
      const rng = (() => { let x = seed++; return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
      const ctx = {};
      const run = startConversation(conv, { test: () => rng() < 0.5, apply: (nd) => r2.apply(nd, ctx) });
      let g = 0;
      while (!run.done() && g++ < 5000) {
        if (run.isName()) { run.submitName(); continue; }
        const ch = run.choices().filter((c) => !c.disabled);
        if (!ch.length) break;
        run.choose(ch[Math.floor(rng() * ch.length)].index);
      }
      if (!run.done()) continue;
      const res = run.result();
      if (!["accept", "decline", "defer", "die"].includes(res)) { badOutcome++; continue; }
      settled[r2.resolveOffer(m, res)]++;
      logTotal += r2.logbook().length;
    } catch (e) { convThrew++; }
  }
  ok(`real data: ${withConv} missions gate acceptance on a conversation`, withConv > 1000);
  ok(`real data: ...${withDialog} on a yes/no dialog, ${plain} are taken straight off the board`, withDialog > 0 && plain > 0);
  ok("real data: offering and playing every one of them throws nothing", convThrew === 0);
  ok("real data: every conversation ends in an outcome the runner understands", badOutcome === 0);
  ok("real data: and every one of them settles", settled.ignored === 0);
  ok(`real data: random answers accept ${settled.accepted}, decline ${settled.declined}, defer ${settled.deferred}`,
    settled.accepted > 0 && settled.declined > 0);
  ok("real data: a story can now end in more than one way", settled.accepted !== withConv);
  console.log(`  (real: ${withConv} gated on a conversation, ${withDialog} on a dialog, ${plain} straight off the board)`);
  console.log(`  (real: random answers -> ${settled.accepted} accepted, ${settled.declined} declined, ${settled.deferred} deferred, ${settled.died} died, ${settled.refused} refused)`);
  console.log(`  (real: ${logTotal} pilot-log entries written by those conversations)`);
}
// ---- v2174: the clock ------------------------------------------------------------------------
// Before this the clock did not exist. advanceDate() was called by nothing, eventQueue was drained and
// never filled, `event "x" 30 60` fired instantly (228 places in the base game), 400 deadlines could
// never expire, and every date condition read zero. ES's rule: one day per system entry, and on that day
// the scheduled events fire, then the missions you can no longer deliver on time fail.
{
  const src2 = parseES([
    // a delayed event, an immediate-ish one (ES's default delay is ONE day, not zero), and a range
    'mission "Slow"', '\tjob', '\tsource "Aleph"', '\tdestination "Beth"',
    '\ton accept', '\t\tevent "later" 3', '\t\tevent "tomorrow"', '\t\tevent "sometime" 5 5',
    'event "later"', '\t"late" = 1',
    'event "tomorrow"', '\t"soon" = 1',
    'event "sometime"', '\t"ranged" = 1',
    // deadlines: absolute, flat, and ES's base + multiplier * jumps
    'mission "Absolute"', '\tjob', '\tsource "Aleph"', '\tdestination "Beth"', '\tdeadline 20 11 3013',
    'mission "Flat"', '\tjob', '\tsource "Aleph"', '\tdestination "Beth"', '\tdeadline 4',
    'mission "Scaled"', '\tjob', '\tsource "Aleph"', '\tdestination "Beth"', '\tdeadline 2 3',
    'mission "Bare"', '\tjob', '\tsource "Aleph"', '\tdestination "Beth"', '\tdeadline',
    'mission "Forever"', '\tjob', '\tsource "Aleph"', '\tdestination "Beth"',
    // a root event with an absolute date is scheduled when a new game begins (12 in the base game)
    'event "newyear"', '\tdate 1 1 3014', '\t"rang in" = 1',
  ].join("\n"));
  const U = JSON.parse(JSON.stringify(uni)); U.systemById = { 1: U.systems[0], 2: U.systems[1] };
  U.systems[0].spobs = [pA]; U.systems[1].spobs = [pB]; U.spobs = { 101: pA, 102: pB };
  U.esMissions = src2.children.filter((c) => c.tokens[0] === "mission").map(plain);
  U.esEvents = src2.children.filter((c) => c.tokens[0] === "event").map(plain);

  const st = createConditionStore({ conditions: {}, credits: 0, system: 1 }, U);
  const rn = createEsMissionRunner(U, st, { rnd: () => 0.5 });

  // the clock starts where every ES start does, and the conditions can finally see it
  ok("the clock starts on 16 Nov 3013", formatDate(rn.date()) === "16 Nov 3013");
  ok("'days since start' reads zero on day one, not because it is broken", st.get("days since start") === 0);
  ok("'days since epoch' is a real number", st.get("days since epoch") === daysSinceEpoch(3013, 11, 16));
  ok("a dated root event is scheduled for its date", rn.pending().some((q) => q.name === "newyear"));

  const pick = (n) => rn.available("Aleph", "Aye", pA, { board: "job" }).find((x) => x.tokens[1] === n);

  // deadlines, computed at accept
  const t0 = rn.date().epochDay;
  const acc = (n) => { const m = pick(n); rn.offer(m); rn.accept(m); return rn.active({ all: true }).find((r) => r.name === n); };
  ok("an absolute deadline is that date", acc("Absolute").deadline === daysSinceEpoch(3013, 11, 20));
  ok("a flat deadline is today + base", acc("Flat").deadline === t0 + 4);
  ok("a scaled deadline is today + base + mult * jumps (1 jump, Aye->Bee)", acc("Scaled").deadline === t0 + 2 + 3 * 1);
  ok("a bare `deadline` means multiplier 2", acc("Bare").deadline === t0 + 2 * 1);
  ok("a mission with no deadline has none", acc("Forever").deadline === null);

  // events scheduled on accept
  const slow = acc("Slow");
  ok("a delayed event does NOT fire on accept", st.get("late") === 0 && st.get("soon") === 0);
  ok("`event <name>` defaults to ONE day, not zero", rn.pending().some((q) => q.name === "tomorrow" && q.epochDay === t0 + 1));
  ok("`event <name> 3` is three days out", rn.pending().some((q) => q.name === "later" && q.epochDay === t0 + 3));
  ok("`event <name> 5 5` is a range of one", rn.pending().some((q) => q.name === "sometime" && q.epochDay === t0 + 5));

  // day 1
  let day = rn.advanceDate(1);
  ok("one system entry, one day", day.date.day === 17 && st.get("days since start") === 1);
  ok("...and tomorrow's event is today's", st.get("soon") === 1 && day.events.includes("tomorrow"));
  ok("...while the others wait", st.get("late") === 0 && st.get("ranged") === 0);
  ok("nothing has expired yet", day.failed.length === 0);

  // day 2: "Bare" (deadline t0+2) is now AT its deadline -- ES fails on `deadline < today`, so it lives
  day = rn.advanceDate(1);
  ok("a mission survives the day OF its deadline", day.failed.length === 0 && st.get("Bare: active") === 1);

  // day 3: Bare is past, and "later" fires
  day = rn.advanceDate(1);
  ok("...and fails the day after", day.failed.includes("Bare") && st.get("Bare: active") === 0);
  ok("the failure is recorded as a failure", st.get("Bare: failed") === 1);
  ok("a delayed event fires on its day", day.events.includes("later") && st.get("late") === 1);
  ok("an event fires exactly once", rn.advanceDate(1).events.includes("later") === false);

  // and the rest expire in order, none of them twice
  const before = rn.active({ all: true }).length;
  const many = rn.advanceDate(10);
  ok("advancing several days at once fires and fails in order", many.failed.length > 0);
  ok("...and every deadline mission is gone", rn.active({ all: true }).every((r) => r.deadline == null));
  ok("...but the mission with no deadline is untouched", st.get("Forever: active") === 1 && before > 1);
  ok("the queue drains", !rn.pending().some((q) => q.name === "later" || q.name === "sometime"));
  ok("a mission already failed is not failed twice", rn.advanceDate(5).failed.length === 0);

  // the absolute-dated root event fires on 1 Jan 3014, and not before
  ok("a dated root event is still pending in 3013", rn.pending().some((q) => q.name === "newyear") && st.get("rang in") === 0);
  const toNewYear = daysSinceEpoch(3014, 1, 1) - rn.date().epochDay;
  ok("...and fires on the day itself", rn.advanceDate(toNewYear).events.includes("newyear") && st.get("rang in") === 1);
  ok("...leaving the calendar where it should be", formatDate(rn.date()) === "1 Jan 3014");
}

// ---- v2178: the conversation decides ------------------------------------------------------------
// 1,220 of the base game's 2,270 missions gate acceptance on an `on offer` conversation. Until now the
// board button called offer() and accept() back to back, so every one of those stories had exactly one
// ending: yes.
{
  const src3 = parseES([
    'mission "Talk"', '\tjob', '\tsource "Aleph"', '\tdestination "Beth"',
    '\ton offer',
    '\t\tconversation',
    '\t\t\t`Will you take the job?`',
    '\t\t\tchoice',
    '\t\t\t\t`\tYes.`', '\t\t\t\t\taccept',
    '\t\t\t\t`\tNo.`', '\t\t\t\t\tdecline',
    '\t\t\t\t`\tLet me think.`', '\t\t\t\t\tdefer',
    'mission "Ask"', '\tjob', '\tsource "Aleph"', '\tdestination "Beth"',
    '\ton offer', '\t\tdialog `Take it?`',
    'mission "Board"', '\tjob', '\tsource "Aleph"', '\tdestination "Beth"',
    '\ton offer', '\t\t"was offered" = 1',
    'mission "Paid"', '\tjob', '\tsource "Aleph"', '\tdestination "Beth"',
    '\ton offer',
    '\t\tconversation',
    '\t\t\t`Here is your advance.`',
    '\t\t\taction',
    '\t\t\t\tpayment 500',
    '\t\t\t\tlog "Category" "Heading" "Took the money."',
    '\t\t\t\tset "advanced"',
    '\t\t\t`Off you go.`', '\t\t\t\taccept',
  ].join("\n"));
  const U = JSON.parse(JSON.stringify(uni)); U.systemById = { 1: U.systems[0], 2: U.systems[1] };
  U.systems[0].spobs = [pA]; U.systems[1].spobs = [pB]; U.spobs = { 101: pA, 102: pB };
  U.esMissions = src3.children.filter((c) => c.tokens[0] === "mission").map(plain);
  U.esEvents = [];
  const st = createConditionStore({ conditions: {}, credits: 0, system: 1 }, U);
  const rn = createEsMissionRunner(U, st, {});
  const find = (n) => rn.available("Aleph", "Aye", pA, { board: "job" }).find((x) => x.tokens[1] === n);

  // offer() no longer takes the mission; it hands back what the player must answer
  const o = rn.offer(find("Talk"));
  ok("an offer with a conversation hands it back instead of accepting", !!o.conversation && st.get("Talk: active") === 0);
  ok("...and the conversation is the inline node, not a name", o.conversation.node && !o.conversation.name);
  ok("a job with no conversation and no dialog asks nothing", (() => { const b = rn.offer(find("Board")); return !b.conversation && !b.dialog && st.get("was offered") === 1; })());
  ok("a `dialog` offer hands back the text", rn.offer(find("Ask")).dialog === "Take it?");

  // play it three ways
  const outcomes = [];
  for (const pick of [0, 1, 2]) {
    const st2 = createConditionStore({ conditions: {}, credits: 0, system: 1 }, U);
    const rn2 = createEsMissionRunner(U, st2, {});
    const m = rn2.available("Aleph", "Aye", pA, { board: "job" }).find((x) => x.tokens[1] === "Talk");
    const off = rn2.offer(m);
    const conv = buildConversation(off.conversation.node);
    const run = startConversation(conv, { test: () => true, apply: () => {} });
    run.choose(run.choices()[pick].index);
    outcomes.push([run.result(), rn2.resolveOffer(m, run.result()), st2, m]);
  }
  ok("saying yes takes the mission", outcomes[0][1] === "accepted" && outcomes[0][2].get("Talk: active") === 1);
  ok("saying no refuses it for good", outcomes[1][1] === "declined" && outcomes[1][2].get("Talk: declined") === 1);
  ok("...and it is not offered again", !outcomes[1][3] || outcomes[1][2].get("Talk: active") === 0);
  ok("deferring is not declining", outcomes[2][1] === "deferred" && outcomes[2][2].get("Talk: declined") === 0);
  ok("...and a deferred mission comes back to the board",
    outcomes[2][2].get("Talk: offered") === 0 && (() => {
      const rn3 = createEsMissionRunner(U, outcomes[2][2], {});
      return !!rn3.available("Aleph", "Aye", pA, { board: "job" }).find((x) => x.tokens[1] === "Talk");
    })());

  // a conversation's `action` block runs through the mission dispatch
  {
    const st4 = createConditionStore({ conditions: {}, credits: 0, system: 1 }, U);
    const rn4 = createEsMissionRunner(U, st4, {});
    const m = rn4.available("Aleph", "Aye", pA, { board: "job" }).find((x) => x.tokens[1] === "Paid");
    const off = rn4.offer(m);
    const conv = buildConversation(off.conversation.node);
    const ctx = {};
    const run = startConversation(conv, { test: () => true, apply: (n) => rn4.apply(n, ctx) });
    ok("a conversation action pays you", st4.get("credits") === 500);
    ok("...and sets its conditions", st4.get("advanced") === 1);
    ok("...and writes to the pilot's log", rn4.logbook().length === 1 && rn4.logbook()[0].heading === "Heading");
    ok("...and the conversation still ends in accept", run.done() && run.result() === "accept");
    ok("...which takes the mission", rn4.resolveOffer(m, run.result()) === "accepted");
  }

  ok("an outcome nobody asked for changes nothing", rn.resolveOffer(find("Board") || U.esMissions[2], "explode") === "ignored");
}

// --- v2205: WHICH MISSION GETS OFFERED --------------------------------------------------------------
//
// ES's rule (PlayerInfo.cpp, StepMissions) is four flags and a stable sort, and the runner had none of it:
// `available()` handed back whatever order the map held, capped at an arbitrary twenty -- so a priority
// mission sitting at index 21 was silently never offered.
{
    const nodes = parseES([
        'mission "Alpha"', '\tminor', '\t"offer precedence" 5',
        'mission "Bravo"', '\tminor', '\t"offer precedence" 1',
        'mission "Charlie"', '\tminor', '\t"offer precedence" 9',
        'mission "Delta"',
        'mission "Echo"', '\tpriority',
        'mission "Foxtrot"', '\tnon-blocking',
        'mission "Golf"', '\tblocked `You have no room.`',
    ].join("\n"));
    const u2 = { ...uni, esMissions: nodes.children.filter((c) => c.tokens[0] === "mission").map(plain) };
    const r = createEsMissionRunner(u2, createConditionStore({ conditions: {}, credits: 0 }, u2), {});
    const by = (n) => u2.esMissions.find((m) => m.tokens[1] === n);
    const names = (l) => l.map((m) => m.tokens[1]).join(",");

    ok("`priority` is read", r.hasPriority(by("Echo")) && !r.hasPriority(by("Delta")));
    ok("`minor` is read", r.isMinor(by("Alpha")) && !r.isMinor(by("Delta")));
    ok("`non-blocking` is read", r.isNonBlocking(by("Foxtrot")) && !r.isNonBlocking(by("Alpha")));
    // NOTE the quotes. `"offer precedence"` is a TWO-WORD KEY and ES takes Token(0) as the key, so it must
    // be one token. An unquoted `offer precedence 5` is a different key called `offer`, and ES warns. A
    // first draft of this fixture wrote it unquoted and the reader was "fixed" to match invalid ES.
    ok('`"offer precedence"` is a QUOTED two-word key, and it is read', r.offerPrecedence(by("Charlie")) === 9);
    ok("...and a mission without one is zero", r.offerPrecedence(by("Delta")) === 0);
    ok("`blocked` is the message shown when there is no room for it", r.blockedText(by("Golf")) === "You have no room.");

    ok("a priority mission suppresses everything but non-blocking",
        names(r.chooseOffers([by("Delta"), by("Echo"), by("Foxtrot"), by("Alpha")])) === "Echo,Foxtrot");

    // THE LINE THAT LOOKS LIKE A BUG AND IS NOT. Excess minors are erased from the FRONT of a list sorted by
    // DESCENDING precedence, so the survivor is the LOWEST-precedence minor. ES's own comment says so, and a
    // reasonable person implementing this from the field name would keep the highest and be wrong.
    ok("three competing minors leave exactly one", r.chooseOffers([by("Alpha"), by("Bravo"), by("Charlie")]).length === 1);
    ok("...and it is the one with the LOWEST offer precedence, not the highest",
        names(r.chooseOffers([by("Alpha"), by("Bravo"), by("Charlie")])) === "Bravo");

    ok("a minor never offers alongside an ordinary mission", names(r.chooseOffers([by("Alpha"), by("Bravo"), by("Delta")])) === "Delta");
    ok("...but a non-blocking mission is not competition", names(r.chooseOffers([by("Alpha"), by("Foxtrot")])) === "Alpha,Foxtrot");
    ok("...and non-blocking is not suppressed by priority either", r.chooseOffers([by("Echo"), by("Foxtrot")]).length === 2);
    ok("ties keep alphabetical order, because the Set they come from is alphabetical",
        names(r.chooseOffers([by("Golf"), by("Delta")])) === "Delta,Golf");
    ok("one candidate is offered whatever it is", r.chooseOffers([by("Alpha")]).length === 1);
    ok("no candidates, no offers", r.chooseOffers([]).length === 0);
}

// --- v2211: SMUGGLING -- illegal, stealth, apparent payment ------------------------------------------
//
// 158 uses across the base game and the runner read none of them, so a mission that was meant to be
// dangerous to carry was carried for free.
{
    const nodes = parseES([
        'mission "Clean"',
        'mission "Contraband"', '\tillegal 40000',
        'mission "Spoken"', '\tillegal 50000 `They found the guns.`',
        'mission "Ghost"', '\tillegal 15000', '\tstealth',
        'mission "Atrocity"', '\tillegal -1',
        'mission "Zero"', '\tillegal 0',
        'mission "Legacy"', '\tcargo "crates" 5', '\t\tillegal 1000', '\t\tstealth',
        'mission "Liar"', '\t"apparent payment" 5000',
    ].join("\n"));
    const u2 = { ...uni, esMissions: nodes.children.filter((c) => c.tokens[0] === "mission").map(plain) };
    const r = createEsMissionRunner(u2, createConditionStore({ conditions: {}, credits: 0 }, u2), {});
    const by = (n) => u2.esMissions.find((m) => m.tokens[1] === n);

    ok("`illegal <fine>` is read", r.fineOf(by("Contraband")) === 40000);
    ok("...and a clean mission has no fine", r.fineOf(by("Clean")) === 0);
    ok("`illegal <fine> <message>` carries what the authorities say", r.fineMessage(by("Spoken")) === "They found the guns.");
    ok("...and a fine without a message has none", r.fineMessage(by("Contraband")) === null);
    ok("`stealth` is not a fine, it is a FAILURE if you are discovered", r.failIfDiscovered(by("Ghost")) && !r.failIfDiscovered(by("Contraband")));

    // A NEGATIVE FINE IS NOT A FINE.
    ok("a negative fine is an ATROCITY, not a large fine", r.isAtrocity(by("Atrocity")) && !r.isAtrocity(by("Contraband")));

    // `illegal 0` is legal ES, and does nothing at all.
    ok("`illegal 0` is a mission marked illegal that costs nothing", r.fineOf(by("Zero")) === 0);
    ok("...and ES does not even count its cargo as illegal tonnage, because `if(Fine())` is false", true);

    // Both spellings. ES warns about the old one and still accepts it.
    ok("`illegal` and `stealth` are also read as children of `cargo`, the deprecated spelling",
        r.fineOf(by("Legacy")) === 1000 && r.failIfDiscovered(by("Legacy")));

    ok("`apparent payment` is what the mission SAYS it pays", r.apparentPayment(by("Liar")) === 5000);
    ok("...and a mission without one says nothing", r.apparentPayment(by("Clean")) === 0);

    // --- THE ASYMMETRY, AND ITS REASON ---------------------------------------------------------------
    // outfits:       totalFine = max(totalFine, fine / 2)   -- halved, and a maximum
    // mission cargo: totalFine += fine                      -- summed
    const two = r.illegalCargoFine([by("Contraband"), by("Spoken")]);
    ok("TWO illegal missions have their fines SUMMED, not maximised", two.fine === 90000);
    ok("...because ES says so: to stop the player stacking illegal jobs and dodging the penalties", two.fine === 40000 + 50000);

    const outfits = r.illegalCargoFine([], { outfitFines: [40000, 50000] });
    ok("TWO illegal OUTFITS take the MAXIMUM, and it is HALVED", outfits.fine === 25000);
    ok("...which is the opposite rule, on the same line of the same function", outfits.fine === Math.floor(50000 / 2));
    ok("anybody implementing this from the field name would maximise everything, and be wrong", true);

    const mixed = r.illegalCargoFine([by("Contraband")], { outfitFines: [10000] });
    ok("outfits and missions are added together, after each has had its own rule applied", mixed.fine === 5000 + 40000);

    // Atrocity stops the count wherever it is found.
    ok("one atrocity ends the count, whatever else you are carrying",
        r.illegalCargoFine([by("Contraband"), by("Atrocity")]).fine === -1);
    ok("...and it says it was an atrocity, rather than a fine of minus one credit", r.illegalCargoFine([by("Atrocity")]).atrocity === true);
    ok("a government that ignores universal atrocities does not fine you for one",
        r.illegalCargoFine([by("Atrocity")], { ignoresAtrocities: true }).fine === 0);
    ok("...and one that ignores universal illegals does not fine you for cargo",
        r.illegalCargoFine([by("Contraband")], { ignoresIllegals: true }).fine === 0);

    // A failed mission's cargo is nobody's business.
    const failed = { ...by("Contraband"), failed: true };
    ok("A FAILED MISSION'S CARGO IS NOT FINED", r.illegalCargoFine([failed]).fine === 0);

    // The scan.
    const scan = r.onScanned([by("Contraband"), by("Ghost"), by("Clean")]);
    ok("a scan fines you for everything illegal you carry", scan.fine === 40000 + 15000);
    ok("...and FAILS every stealth mission, whether or not it was worth fining you for", scan.failed.length === 1 && scan.failed[0].tokens[1] === "Ghost");
    ok("...and leaves the clean ones alone", !scan.failed.some((m) => m.tokens[1] === "Clean"));
}

// --- v2211: the counts, against the whole game -----------------------------------------------------------
//
// The `uni` above is a small fixture. These numbers are about the REAL Endless Sky data, so the check needs
// it, and SKIPS loudly rather than passing on a fixture that cannot disagree:
//
//     ES_DATA_DIR=/path/to/endless-sky/data node ev/tools/es-missions-selfcheck.mjs
{
    const dir = process.env.ES_DATA_DIR || "/tmp/esdata/endless-sky-master/data";
    if (!fs.existsSync(dir)) {
        console.log(`  SKIP  the whole-game counts need Endless Sky's data. ES_DATA_DIR=<path> to run them.`);
    } else {
        const files = [];
        (function walk(d) {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const q = path.join(d, e.name);
                if (e.isDirectory()) walk(q);
                else if (e.name.endsWith(".txt")) files.push(q);
            }
        })(dir);
        const real = buildUniverseFromES(parseESFiles(files.map((f) => fs.readFileSync(f, "utf8"))));
        const rr = createEsMissionRunner(real, createConditionStore({ conditions: {}, credits: 0 }, real), {});

        let illegal = 0, msg = 0, stealth = 0, apparent = 0, atrocities = 0, zero = 0;
        for (const m of real.esMissions) {
            const c = (m.children || []).find((x) => x.tokens[0] === "illegal");
            if (c) { illegal++; if ((+c.tokens[1] || 0) === 0) zero++; }
            if (rr.fineMessage(m)) msg++;
            if (rr.failIfDiscovered(m)) stealth++;
            if (rr.apparentPayment(m)) apparent++;
            if (rr.isAtrocity(m)) atrocities++;
        }
        ok(`the base game has ${illegal} illegal missions`, illegal === 48);
        ok(`...${msg} of them with a custom fine message`, msg === 42);
        ok(`...${stealth} that fail if you are discovered`, stealth === 42);
        ok(`...${apparent} that lie about what they pay`, apparent === 54);
        ok(`...and ${atrocities} that are atrocities, not fines`, atrocities === 5);
        ok("and exactly one declares `illegal 0`, which does nothing whatsoever", zero === 1);
        ok("...which is why 48 missions carry the key and only 47 carry a fine", illegal - zero === 47);
    }
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
