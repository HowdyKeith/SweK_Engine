// Self-check for ev/esDate.js — Endless Sky's calendar, to the day.
//
//   node ev/tools/es-date-selfcheck.mjs
//
// This has to be exact, not approximately right. ES's own data compares saved condition values like
// "days since epoch" against numbers its writers computed with Date::DaysSinceEpoch. An off-by-one in
// a leap-year rule would not crash anything; it would quietly shift a story beat by a day, forever.
// So the day count is cross-checked against the proleptic Gregorian calendar, from year 1 to year 3100.

import { MDAYS, ES_START, isLeap, daysSinceEpoch, fromEpochDay, makeDate, dateFromEpochDay, addDays, startDate, formatDate } from "../esDate.js";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

// JS's Date maps years 0-99 onto 1900-1999, so the two-digit years need the explicit setter.
const gregorian = (y, m, d) => { const t = new Date(0); t.setUTCFullYear(y, m - 1, d); t.setUTCHours(0, 0, 0, 0); return Math.round(t.getTime() / 86400000); };

// --- 1. the day count agrees with the Gregorian calendar, everywhere ------------------------
{
    const anchor = daysSinceEpoch(1970, 1, 1);
    ok("1 Jan 1970 is 719163 days after 1 Jan of year 1", anchor === 719163);
    ok("day 1 is 1 Jan of year 1", JSON.stringify(fromEpochDay(1)) === JSON.stringify({ year: 1, month: 1, day: 1 }));

    let bad = 0, n = 0;
    for (let y = 1; y <= 3100; y += 3)
        for (const [m, d] of [[1, 1], [2, 28], [3, 1], [6, 15], [12, 31]]) {
            n++;
            if (daysSinceEpoch(y, m, d) - anchor !== gregorian(y, m, d)) bad++;
        }
    ok(`the day count matches Gregorian on all ${n} sampled dates, year 1 to 3100`, bad === 0);

    // the leap rule, stated three ways because it is the only place this can go wrong
    ok("a year divisible by 4 is a leap year", isLeap(2024) && isLeap(3016));
    ok("...unless it is divisible by 100", !isLeap(1900) && !isLeap(2100) && !isLeap(3100));
    ok("...unless it is also divisible by 400", isLeap(2000) && isLeap(2400));
    ok("29 Feb exists in a leap year", daysSinceEpoch(2000, 3, 1) - daysSinceEpoch(2000, 2, 28) === 2);
    ok("...and not otherwise", daysSinceEpoch(1900, 3, 1) - daysSinceEpoch(1900, 2, 28) === 1);
    ok("the month table is ES's own", MDAYS.length === 12 && MDAYS[2] === 59 && MDAYS[11] === 334);
}

// --- 2. the inverse is exact ------------------------------------------------------------------
{
    let bad = 0;
    const from = daysSinceEpoch(2900, 1, 1), to = daysSinceEpoch(3100, 1, 1);   // 200 years across the ES era
    for (let n = from; n < to; n++) {
        const p = fromEpochDay(n);
        if (daysSinceEpoch(p.year, p.month, p.day) !== n) bad++;
    }
    ok(`fromEpochDay round-trips every one of ${to - from} days across the ES era`, bad === 0);
    ok("...and across a leap day", dateFromEpochDay(daysSinceEpoch(3016, 2, 29)).day === 29);
    ok("...and at a century boundary", dateFromEpochDay(daysSinceEpoch(3100, 3, 1)).month === 3);
}

// --- 3. the date object esConditions reads ------------------------------------------------------
{
    const d = makeDate(3013, 11, 16);
    ok("makeDate carries day/month/year", d.day === 16 && d.month === 11 && d.year === 3013);
    ok("...and the epoch day", d.epochDay === daysSinceEpoch(3013, 11, 16));
    ok("...and the day of the year ('days since year start')", d.dayOfYear === 320);
    ok("1 Jan is day-of-year 1, not 0", makeDate(3013, 1, 1).dayOfYear === 1);
    ok("31 Dec of a leap year is day-of-year 366", makeDate(3016, 12, 31).dayOfYear === 366);
}

// --- 4. every ES start begins on 16 Nov 3013 -----------------------------------------------------
{
    ok("the start date is data/starts.txt's", ES_START.day === 16 && ES_START.month === 11 && ES_START.year === 3013);
    ok("startDate() builds it", startDate().epochDay === daysSinceEpoch(3013, 11, 16));
    ok("it formats the way ES prints it", formatDate(startDate()) === "16 Nov 3013");
}

// --- 5. adding days, which is what the clock does one turn at a time ------------------------------
{
    const s = startDate();
    ok("a day passes", formatDate(addDays(s, 1)) === "17 Nov 3013");
    ok("a month rolls over", formatDate(addDays(s, 30)) === "16 Dec 3013");
    ok("a year rolls over", formatDate(addDays(s, 46)) === "1 Jan 3014");
    ok("adding zero is a no-op", addDays(s, 0).epochDay === s.epochDay);
    ok("time can run backwards, for a test if not for a pilot", addDays(s, -1).day === 15);
    ok("a leap day is not skipped", formatDate(addDays(makeDate(3016, 2, 28), 1)) === "29 Feb 3016");
    ok("...and is skipped when it should be", formatDate(addDays(makeDate(3015, 2, 28), 1)) === "1 Mar 3015");

    // 365 single steps must land where one 365-day jump lands
    let d = makeDate(3013, 1, 1);
    for (let i = 0; i < 365; i++) d = addDays(d, 1);
    ok("365 single steps == one 365-day jump", d.epochDay === addDays(makeDate(3013, 1, 1), 365).epochDay);
    ok("...and 3013 was not a leap year", formatDate(d) === "1 Jan 3014");
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
