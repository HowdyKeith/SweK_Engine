// Self-check for ev/esAccount.js + the `start` blocks in ev/esData.js.
//
//   node ev/tools/es-start-selfcheck.mjs
//   node ev/tools/es-start-selfcheck.mjs /path/to/endless-sky/data
//
// The default start hands you 480,000 credits and a mortgage for exactly the same amount. Without the
// mortgage, the "classic Endless Sky experience" -- whose own description promises *you will begin in
// debt* -- is just free money. Now that there is a clock (v2174) there is something to charge interest on.
//
// The nice thing about this maths is that the game checks it for us. In the intro conversation the loan
// broker reads the answer aloud: "You are borrowing 480,000 credits, to be repaid over the course of one
// year. Your daily interest rate is 0.4%, which means that your daily payments are 2,503 credits, and by
// the end of the year you will have paid... 433,567 credits in interest." Both numbers are asserted below,
// against the same start block the game ships.

import { parseES, parseESFiles } from "../esParse.js";
import { buildUniverseFromES } from "../esData.js";
import { createConditionStore } from "../esConditions.js";
import { createEsMissionRunner } from "../esMissions.js";
import { payment, makePayment, missPayment, makeAccount, makeMortgage, totalDebt, step, lround, SCORE_MIN, SCORE_MAX } from "../esAccount.js";
import { makeDate } from "../esDate.js";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

// --- 1. the banker's own numbers ---------------------------------------------------------------
{
    const m = makeMortgage("Mortgage", 480000, 0.004, 365);
    ok("the daily payment on the default mortgage is 2,503 credits, as the banker says", payment(m) === 2503);

    const acct = makeAccount({ credits: 480000, mortgages: [{ name: "Mortgage", principal: 480000, interest: 0.004, term: 365 }] });
    let days = 0, paid = 0;
    while (acct.mortgages.length && days < 2000) { acct.credits += 4000; paid += step(acct).mortgagesPaid; days++; }
    ok("...and it is cleared in exactly one year", days === 365);
    ok("...having paid 433,567 credits in interest, as the banker also says", paid - 480000 === 433567);
    ok("the debt is gone, not merely small", totalDebt(acct) === 0 && acct.mortgages.length === 0);
    ok("a year of payments made lifts the credit score by a point a day", acct.score === Math.min(SCORE_MAX, 400 + 365));
}

// --- 2. the edges of the formula ----------------------------------------------------------------
{
    ok("no term means the whole principal is due at once", payment(makeMortgage("x", 1000, 0.01, 0)) === 1000);
    ok("no interest is a straight division", payment(makeMortgage("x", 1000, 0, 4)) === 250);
    ok("...rounded, not truncated", payment(makeMortgage("x", 1000, 0, 3)) === 333);
    ok("a payment is always at least one credit", payment(makeMortgage("x", 1, 0.004, 365)) === 1);
    ok("lround takes halves away from zero, as ES's does", lround(2.5) === 3 && lround(-2.5) === -3);
}

// --- 3. a missed payment is not a deferred one ---------------------------------------------------
{
    const m = makeMortgage("x", 1000, 0.01, 10);
    const due = payment(m);
    missPayment(m);
    ok("missing a payment grows the principal by a day's interest", m.principal === 1010);
    ok("...and does not advance the term", m.term === 10);

    // ES accrues the day's interest and THEN subtracts the payment. Surprising, and load-bearing.
    const n = makeMortgage("x", 1000, 0.01, 10);
    const p = makePayment(n);
    ok("a payment is made against the interest-inflated principal", n.principal === 1010 - p && n.term === 9);
    ok("...and the amount owed today is what Payment() said it was", p === due);

    // miss every payment and you owe more than you borrowed, on a schedule that expired
    const acct = makeAccount({ credits: 0, mortgages: [{ name: "x", principal: 1000, interest: 0.01, term: 10 }] });
    for (let i = 0; i < 10; i++) step(acct);
    ok("ten missed payments leave you deeper in debt than you began", totalDebt(acct) > 1000);
    ok("...on a term that never moved", acct.mortgages[0].term === 10);
    ok("...and a credit score five points lower each day", acct.score === 400 - 5 * 10);
}

// --- 4. the order of the day: salaries, maintenance, then all-or-nothing mortgages ----------------
{
    // Not enough for the mortgage: it is missed entirely rather than part-paid.
    const a = makeAccount({ credits: 100, mortgages: [{ name: "x", principal: 480000, interest: 0.004, term: 365 }] });
    const r = step(a);   // 2,503 due, 100 in the bank
    ok("a mortgage payment you cannot afford is missed, not part-paid", r.missed && a.credits === 100 && a.mortgages[0].principal > 480000);
    ok("...and it says so", r.message.includes("missed a mortgage payment"));

    // Salaries CAN be part-paid, and the remainder is carried.
    const b = makeAccount({ credits: 30 });
    const rb = step(b, { salaries: 100 });
    ok("salaries can be paid in part", b.credits === 0 && b.salariesOwed === 70);
    ok("...and you are told", rb.message.includes("crew salaries"));
    b.credits = 1000;
    step(b, { salaries: 0 });
    ok("...and the back wages come out of the next day you can afford them", b.salariesOwed === 0 && b.credits === 930);

    // Salaries take priority over maintenance.
    const c = makeAccount({ credits: 50 });
    step(c, { salaries: 50, maintenance: 50 });
    ok("crew are paid before the mechanic", c.salariesOwed === 0 && c.maintenanceDue === 50);

    // Only one complaint per day, even when everything goes wrong.
    const d = makeAccount({ credits: 0, mortgages: [{ name: "x", principal: 100, interest: 0.1, term: 5 }] });
    const rd = step(d, { salaries: 10, maintenance: 10 });
    ok("a ruinous day produces one message, not three", rd.message.split(".").filter(Boolean).length === 1);

    ok("the score floors at 200", (() => { const e = makeAccount({ credits: 0, score: 201, mortgages: [{ name: "x", principal: 9, interest: 0.1, term: 5 }] }); step(e); step(e); return e.score === SCORE_MIN; })());
    ok("...and caps at 800", (() => { const e = makeAccount({ credits: 10, score: 799 }); step(e); step(e); return e.score === SCORE_MAX; })());
    ok("a day with no debts and no crew is quiet", step(makeAccount({ credits: 10 })).message === "");
}

// --- 5. the start blocks ---------------------------------------------------------------------------
{
    const uni = buildUniverseFromES(parseES([
        'government "Rep"',
        'planet "Home"', '\tgovernment "Rep"', '\tdescription "d"',
        'system "Here"', '\tpos 0 0', '\tgovernment "Rep"', '\tobject "Home"', '\t\tdistance 100',
        'start "default"',
        '\tname "The Classic"',
        '\tdescription `You begin in debt.`',
        '\tdescription `\tAnd must pay it off.`',
        '\tthumbnail "scene/home"',
        '\tdate 16 11 3013',
        '\tsystem "Here"', '\tplanet "Home"',
        '\tconversation "intro"',
        '\taccount', '\t\tcredits 480000', '\t\tscore 400',
        '\t\tmortgage Mortgage', '\t\t\tprincipal 480000', '\t\t\tinterest 0.004', '\t\t\tterm 365',
        '\tset "license: Pilot\'s"', '\tset "start: default"',
        'start "locked"',
        '\tname "Later"', '\tdate 1 1 3014', '\tsystem "Here"', '\tplanet "Home"',
        '\tto unlock', '\t\thas "campaign done"',
        '\taccount', '\t\tcredits 1',
        'start "nowhere"',
        '\tname "Broken"', '\tdate 1 1 3014', '\tsystem "Missing"', '\tplanet "Gone"',
    ].join("\n")));
    uni.systemById = {}; for (const s of uni.systems) uni.systemById[s.id] = s;

    ok("starts load", uni.counts.starts === 2);
    ok("a start pointing nowhere is dropped, not guessed at", uni.counts.startsDropped === 1 && !uni.starts.some((s) => s.id === "nowhere"));

    const st = uni.starts.find((s) => s.id === "default");
    ok("the display name is read", st.name === "The Classic");
    ok("several description lines join", st.description.split("\n").length === 2);
    ok("the date is data, not a constant we chose", st.date.day === 16 && st.date.month === 11 && st.date.year === 3013);
    ok("the system and planet resolve to ids", uni.systemById[st.system].name === "Here" && uni.spobs[st.planet].name === "Home");
    ok("the conversation is named", st.conversation === "intro");
    ok("the account is loaded", st.account.credits === 480000 && st.account.score === 400);
    ok("...with its mortgage", st.account.mortgages.length === 1 && st.account.mortgages[0].principal === 480000
        && st.account.mortgages[0].interest === 0.004 && st.account.mortgages[0].term === 365);
    ok("everything ES does not recognise becomes a condition assignment", st.conditions.length === 2);
    ok("...and `set` is not a special case", st.conditions.every((c) => c.tokens[0] === "set"));

    const locked = uni.starts.find((s) => s.id === "locked");
    ok("a start behind `to unlock` is marked, not hidden", locked.locked === true && st.locked === false);
    ok("a start with no mortgage owes nothing", locked.account.mortgages.length === 0);

    // and it applies through the same machinery a mission's `on offer` uses
    const store = createConditionStore({ conditions: {}, credits: 0, date: makeDate(st.date.year, st.date.month, st.date.day) }, uni);
    const run = createEsMissionRunner(uni, store, {});
    run.apply({ children: st.conditions });
    ok("applying a start sets its conditions", store.get("license: Pilot's") === 1 && store.get("start: default") === 1);
    ok("...and the clock starts on the start's date", run.date().day === 16 && run.date().year === 3013);
}

// --- 6. optional: the real starts -----------------------------------------------------------------
const dir = process.argv[2];
if (dir && fs.existsSync(dir)) {
    const gather = (d) => { let o = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith("_")) continue; const p = path.join(d, e.name); if (e.isDirectory()) o = o.concat(gather(p)); else if (e.name.endsWith(".txt")) o.push(p); } return o; };
    const uni = buildUniverseFromES(parseESFiles(gather(dir).map((f) => fs.readFileSync(f, "utf8"))));
    console.log("");
    console.log(`  (real data: ${uni.counts.starts} starts, ${uni.counts.startsDropped} dropped)`);
    ok("real data: all five starts load and none is dropped", uni.counts.starts === 5 && uni.counts.startsDropped === 0);
    ok("real data: every start lands the pilot on a planet that exists", uni.starts.every((s) => uni.spobs[s.planet]));
    ok("real data: every start begins on 16 Nov 3013", uni.starts.every((s) => s.date.day === 16 && s.date.month === 11 && s.date.year === 3013));
    ok("real data: exactly one start is locked (Hai Origins)", uni.starts.filter((s) => s.locked).length === 1);
    const def = uni.starts.find((s) => s.id === "default");
    ok("real data: the default start is the one in debt", def.account.mortgages.length === 1 && def.account.credits === 480000);
    ok("real data: ...and its daily payment is the banker's 2,503", payment(makeMortgage("m", def.account.mortgages[0].principal, def.account.mortgages[0].interest, def.account.mortgages[0].term)) === 2503);
    ok("real data: one start gives you money and no debt (Birthday Surprise)",
        uni.starts.some((s) => !s.locked && !s.account.mortgages.length && s.account.credits > 0));
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
