// WebGLEngine/ev/esAccount.js — Endless Sky's accounting, once a day.
//
// The default start hands you 480,000 credits and a mortgage for exactly the same amount. Without the
// mortgage the "classic Endless Sky experience" -- the one whose own description says *you will begin in
// debt* -- is just free money. Now that there is a clock (v2174), there is something to charge interest
// on.
//
// From endless-sky/source/Mortgage.cpp and source/Account.cpp at master. The amortization formula is
// the standard one, and it is worth reproducing exactly rather than approximating: the game's own intro
// conversation has the banker read the answer aloud. 480,000 at 0.4% daily over 365 days is 2,503
// credits a day, and es-start-selfcheck asserts that number against his line.
//
//   payment = principal * i * (1+i)^term / ((1+i)^term - 1),  at least 1 credit
//
// A missed payment is not deferred: the principal grows by a day's interest and the term does not move.
// A made payment accrues that same interest FIRST and then subtracts -- Mortgage::MakePayment calls
// MissPayment() before it touches the principal, which is surprising enough to be worth saying out loud.

"use strict";

const SCORE_MIN = 200, SCORE_MAX = 800, SCORE_UP = 1, SCORE_DOWN = 5;

// ES rounds with lround: half away from zero. JS's Math.round is half UP, which disagrees on negatives
// and on exact .5 for negative values. Principals are positive, but the helper is honest about it.
function lround(x) { return x < 0 ? -Math.round(-x) : Math.round(x); }

function payment(m) {
    if (!m.term) return m.principal;
    if (!m.interest) return lround(m.principal / m.term);
    const power = Math.pow(1 + m.interest, m.term);
    return Math.max(1, lround(m.principal * m.interest * power / (power - 1)));
}

// The principal grows by one day's interest. The term does not move, so the debt outlives the schedule.
function missPayment(m) { m.principal += lround(m.principal * m.interest); return m; }

// ES accrues the day's interest and THEN subtracts the payment (Mortgage::MakePayment -> MissPayment).
function makePayment(m) {
    const p = payment(m);
    missPayment(m);
    m.principal -= p;
    m.term -= 1;
    return p;
}

function makeMortgage(name, principal, interest, term) {
    return { name: name || "Mortgage", principal: Math.max(0, Math.round(principal || 0)), interest: +interest || 0, term: Math.max(0, Math.trunc(term) || 0) };
}

function makeAccount(opts = {}) {
    return {
        credits: Math.round(opts.credits || 0),
        score: opts.score != null ? opts.score : 400,      // ES's default (Account::Load)
        salariesOwed: 0, maintenanceDue: 0,
        mortgages: (opts.mortgages || []).map((m) => makeMortgage(m.name, m.principal, m.interest, m.term)),
    };
}

function totalDebt(acct) { let t = 0; for (const m of acct.mortgages) t += m.principal; return t; }

// One day. Crew salaries first, then maintenance -- both may be paid in part and the remainder carried.
// A mortgage payment is all or nothing: you make it, or you miss it and the principal swells.
//
// We pass salaries = maintenance = 0 today: the flight layer models neither a crew nor ship upkeep.
// The plumbing is here so that when it does, this does not have to be rewritten.
function step(acct, opts = {}) {
    const salaries = Math.max(0, Math.round(opts.salaries || 0));
    const maintenance = Math.max(0, Math.round(opts.maintenance || 0));
    acct.salariesOwed += salaries;
    acct.maintenanceDue += maintenance;

    const msgs = [];
    let missed = false;

    if (acct.salariesOwed) {
        if (acct.salariesOwed > acct.credits) {
            const paid = Math.max(acct.credits, 0);
            acct.salariesOwed -= paid; acct.credits -= paid;
            missed = true; msgs.push("You could not pay all your crew salaries.");
        } else { acct.credits -= acct.salariesOwed; acct.salariesOwed = 0; }
    }
    if (acct.maintenanceDue) {
        if (acct.maintenanceDue > acct.credits) {
            const paid = Math.max(acct.credits, 0);
            acct.maintenanceDue -= paid; acct.credits -= paid;
            if (!missed) msgs.push("You could not pay all your maintenance costs.");
            missed = true;
        } else { acct.credits -= acct.maintenanceDue; acct.maintenanceDue = 0; }
    }

    let mortgagesPaid = 0;
    for (const m of acct.mortgages) {
        const due = payment(m);
        if (due > acct.credits) {
            missPayment(m);
            if (!missed) msgs.push("You missed a mortgage payment.");
            missed = true;
        } else {
            const paid = makePayment(m);
            acct.credits -= paid;
            mortgagesPaid += paid;
        }
    }
    // A mortgage whose principal has been paid down is gone. `term` running out does not end it: miss
    // enough payments and you owe more than you borrowed, on a schedule that expired.
    acct.mortgages = acct.mortgages.filter((m) => m.principal > 0);

    acct.score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, acct.score + (missed ? -SCORE_DOWN : SCORE_UP)));
    return { missed, mortgagesPaid, message: msgs.join(" "), credits: acct.credits, debt: totalDebt(acct), score: acct.score };
}

export { payment, makePayment, missPayment, makeMortgage, makeAccount, totalDebt, step, lround, SCORE_MIN, SCORE_MAX };
if (typeof module !== "undefined" && module.exports)
    module.exports = { payment, makePayment, missPayment, makeMortgage, makeAccount, totalDebt, step, lround, SCORE_MIN, SCORE_MAX };
