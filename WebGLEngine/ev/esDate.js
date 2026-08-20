// ES's calendar, to the day.
//
// The engine had no clock at all. `esMissions.advanceDate()` existed and was called by nothing;
// `eventQueue` was declared, drained, and never filled; `dispatch()` fired `event "war begins" 30 60`
// immediately, discarding the delay (228 places in the base game); 400 missions carried a `deadline`
// that could never expire; and every `days since start` condition read zero because `player.date` was a
// shape nobody constructed. One day per system entry fixes all of it.
//
// The day-count below is Endless Sky's own (Date::DaysSinceEpoch, source/Date.cpp at master), not a
// re-derivation: proleptic Gregorian, counted from year 1, leap years at the end of each cycle. Day 1
// is 1 Jan of year 1. It must agree exactly, because saved condition values like "days since epoch"
// are compared against numbers ES's own data files were written around.

const MDAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Every ES start begins here (data/starts.txt: `date 16 11 3013`, all of them).
const ES_START = { day: 16, month: 11, year: 3013 };

function isLeap(year) { return !(year % 4) && (!!(year % 100) || !(year % 400)); }

function daysSinceEpoch(year, month, day) {
    let d = day + MDAYS[month - 1];
    if (month > 2 && isLeap(year)) d++;
    // Start from year 1 so the leap years fall at the very end of each cycle.
    let y = year - 1;
    d += 146097 * Math.floor(y / 400); y %= 400;   // four centuries = 365.2425*400 days
    d += 36524 * Math.floor(y / 100); y %= 100;    // a century that is not divisible by 400
    d += 1461 * Math.floor(y / 4); y %= 4;         // four years = 4*365 + 1
    d += 365 * y;
    return d;
}

// The inverse. ES never needs it (it carries y/m/d and adds days by carrying), but we store the day
// count and rebuild the date, so this has to be exact -- es-date-selfcheck round-trips a century.
function fromEpochDay(n) {
    let year = Math.max(1, Math.floor(n / 365.2425) + 1);
    while (daysSinceEpoch(year, 1, 1) > n) year--;
    while (daysSinceEpoch(year + 1, 1, 1) <= n) year++;
    let month = 1;
    while (month < 12 && daysSinceEpoch(year, month + 1, 1) <= n) month++;
    return { year, month, day: n - daysSinceEpoch(year, month, 1) + 1 };
}

// The object esConditions reads: day / month / year / epochDay / dayOfYear.
function makeDate(year, month, day) {
    const epochDay = daysSinceEpoch(year, month, day);
    return { year, month, day, epochDay, dayOfYear: epochDay - daysSinceEpoch(year, 1, 1) + 1 };
}
function dateFromEpochDay(n) { const p = fromEpochDay(n); return makeDate(p.year, p.month, p.day); }
function addDays(date, n) { return dateFromEpochDay(date.epochDay + (n | 0)); }
function startDate() { return makeDate(ES_START.year, ES_START.month, ES_START.day); }

// "16 Nov 3013" -- ES's default DMY format.
function formatDate(date) { return `${date.day} ${MONTH[date.month - 1]} ${date.year}`; }

export { MDAYS, MONTH, ES_START, isLeap, daysSinceEpoch, fromEpochDay, makeDate, dateFromEpochDay, addDays, startDate, formatDate };
if (typeof module !== "undefined" && module.exports)
    module.exports = { MDAYS, MONTH, ES_START, isLeap, daysSinceEpoch, fromEpochDay, makeDate, dateFromEpochDay, addDays, startDate, formatDate };
