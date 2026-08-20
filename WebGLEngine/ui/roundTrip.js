// FILE: ui/roundTrip.js
// VERSION: v1 -- v3243
//
// THE SIX RULES FOR A ROUND-TRIP CONTROL, IN ONE PLACE.
//
// A round-trip control is one POPULATED FROM A FETCHED VALUE and READ BACK INTO A REQUEST BODY. If the fetch
// fails, the control holds a browser default -- empty string, unchecked, zero, the first option -- and the next
// save writes that default as though somebody had chosen it. The census counts 103 distinct such controls across
// 34 files and THREE OF THEM ARE GUARDED.
//
// *** THE COMMON THREAD IS OMIT RATHER THAN SEND. *** A save that skips a field it never loaded cannot overwrite
// a good value with a default. Everything below is that one idea, said six ways because the browser has six
// different ways of spelling "nothing".
//
// KEITH'S RULES, VERBATIM IN EFFECT:
//   text (52)      leave empty with a placeholder, omit from save
//   textarea (5)   leave empty with a placeholder, omit from save
//   number (7)     leave empty, omit from save          -- NOT zero: 0 is a value somebody may have chosen
//   checkbox (18)  set indeterminate, omit from save    -- UNCHECKED AND UNKNOWN ARE DIFFERENT CLAIMS
//   select (10)    prepend a disabled option, omit from save
//   password (11)  leave empty with a placeholder, omit unless typed
//
// *** THEY LIVE HERE AND NOWHERE ELSE. *** Six decisions restated at 103 call sites is the defect this whole
// session has been about -- MODES in nine files, the gate-file walk in three, a mesher's liveness in four
// records, stated runtime in 59 of 82 headers, page-index's 256 against pageReach's 315. THE SECOND COPY IS
// NEVER THE ONE THAT GETS UPDATED. roundTrip-selfcheck fails if the rules appear anywhere else.
//
//   import { applyLoaded, collectIfKnown, isKnown } from "/ui/roundTrip.js";
//   applyLoaded(el, j.someField);                 // undefined/null -> the unknown state for that kind
//   collectIfKnown(body, "someField", el);        // writes body.someField ONLY if the control knows its value

const UNKNOWN_TEXT = "\u2014 not loaded \u2014";
const UNKNOWN_PASSWORD = "\u2014 unchanged \u2014";
const UNKNOWN_OPTION_VALUE = "__swek_unknown__";

/** What kind of control is this, in the vocabulary the rules are written in. */
export function kindOf(el) {
    if (!el || !el.tagName) return "unknown";
    const tag = el.tagName.toLowerCase();
    if (tag === "select") return "select";
    if (tag === "textarea") return "textarea";
    if (tag !== "input") return "unknown";
    const t = String(el.type || "text").toLowerCase();
    if (t === "checkbox") return "checkbox";
    if (t === "password") return "password";
    if (t === "number" || t === "range") return "number";
    return "text";
}

/**
 * Does this control currently hold a value somebody chose?
 *
 * *** THE UNKNOWN STATE IS READ BACK FROM THE CONTROL, NOT REMEMBERED IN A PARALLEL MAP. *** A side table of
 * "which fields failed to load" is a second copy of the truth that goes stale the moment a user types -- and
 * the whole point is that typing MAKES it known. The DOM already holds that fact; this asks it.
 */
export function isKnown(el) {
    switch (kindOf(el)) {
        case "checkbox": return !el.indeterminate;
        case "select":   return el.value !== UNKNOWN_OPTION_VALUE;
        case "password": return String(el.value || "") !== "";   // typed = known; blank = leave it alone
        default:         return String(el.value || "") !== "";
    }
}

/**
 * Put a loaded value into a control -- or put the control into its unknown state.
 *
 * `undefined` and `null` mean NOT LOADED. Note that this is deliberately NOT the same test as falsy: false, 0
 * and "" are values somebody may have chosen, and treating them as absent is exactly the bug being fixed.
 */
export function applyLoaded(el, value) {
    if (!el) return false;
    const known = value !== undefined && value !== null;
    const kind = kindOf(el);

    if (kind === "checkbox") {
        el.indeterminate = !known;
        if (known) el.checked = !!value;
        return known;
    }
    if (kind === "select") {
        let opt = el.querySelector('option[value="' + UNKNOWN_OPTION_VALUE + '"]');
        if (!known) {
            if (!opt) {
                opt = document.createElement("option");
                opt.value = UNKNOWN_OPTION_VALUE; opt.textContent = UNKNOWN_TEXT; opt.disabled = true;
                el.insertBefore(opt, el.firstChild);
            }
            el.value = UNKNOWN_OPTION_VALUE;
        } else {
            if (opt) opt.remove();
            el.value = String(value);
        }
        return known;
    }
    if (kind === "password") {
        el.value = "";                                   // NEVER echo a secret back into the DOM
        el.placeholder = known ? UNKNOWN_PASSWORD : UNKNOWN_TEXT;
        return known;
    }
    // text, textarea, number
    el.value = known ? String(value) : "";
    if ("placeholder" in el) el.placeholder = known ? (el.dataset.rtPlaceholder || "") : UNKNOWN_TEXT;
    return known;
}

/**
 * Write a control's value into a request body ONLY if it is known.
 *
 * *** THE OMISSION IS THE POINT AND IT IS SILENT ON PURPOSE. *** A save that skipped a field and said so would
 * be a warning on every unrelated form; a save that skips it and carries on is what stops a failed load from
 * becoming a written default. What must NEVER happen is sending the browser's idea of empty.
 */
export function collectIfKnown(body, key, el) {
    if (!body || !el || !isKnown(el)) return false;
    switch (kindOf(el)) {
        case "checkbox": body[key] = !!el.checked; break;
        case "number": {
            const n = Number(el.value);
            if (!Number.isFinite(n)) return false;       // "abc" is not a number and not a zero
            body[key] = n; break;
        }
        default: body[key] = el.value;
    }
    return true;
}

/** The unknown-state strings, exported so a gate can assert them rather than re-typing them. */
export const UNKNOWN = { TEXT: UNKNOWN_TEXT, PASSWORD: UNKNOWN_PASSWORD, OPTION: UNKNOWN_OPTION_VALUE };
