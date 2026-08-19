// esPilot.js -- the pilot file. Serializes the player's whole game state to a plain JSON blob and
// manages named save slots in localStorage. Pure + storage-only: the live-state <-> blob glue (rebuilding
// the mission runner, entering the saved system) lives in ev.html, because only it holds those globals.
//
// The ES save state is essentially the condition store's backing `esPlayer` (conditions, reputation,
// visited systems/planets, licenses, cargo, date) plus a few plain fields (ship id, credits, location,
// account) and the EV-side ControlBits. Sets are stored as arrays; the date as its integer epochDay.

const SLOT = "swek.es.pilot.";       // per-slot key prefix
const INDEX = "swek.es.pilots";      // JSON array of slot names, most-recent-first
const SCHEMA = 1;

function store() {
    try { return (typeof localStorage !== "undefined") ? localStorage : (globalThis.localStorage || null); } catch { return null; }
}

// --- serialization (pure) ---------------------------------------------------------------------------

// Build a save blob from a plain state bag. Everything already primitive; caller converts Sets->arrays
// and pulls date.epochDay before calling, so this stays a dumb, testable shape.
function serializePilot(s) {
    s = s || {};
    return {
        schema: SCHEMA,
        savedAt: Date.now(),
        name: (s.pilotName || "Pilot").slice(0, 40),
        shipId: s.shipId != null ? s.shipId : null,
        shipName: s.shipName || null,
        cargo: s.cargo || {},
        cargoHold: s.cargoHold != null ? (s.cargoHold | 0) : 100,
        outfits: s.outfits || {},
        credits: Math.round(s.credits || 0),
        systemId: s.systemId != null ? s.systemId : null,
        planetId: s.planetId != null ? s.planetId : null,
        es: s.esActive ? {
            conditions: s.conditions || {},
            reputation: s.reputation || {},
            visitedSystems: s.visitedSystems || [],
            visitedPlanets: s.visitedPlanets || [],
            licenses: s.licenses || [],
            cargo: s.esCargo || {},
            dateEpochDay: s.dateEpochDay != null ? (s.dateEpochDay | 0) : null,
            account: s.account || null,
            startId: s.startId || null,
            activeMissions: Array.isArray(s.esActiveMissions) ? s.esActiveMissions : [],
        } : null,
        bits: Array.isArray(s.bits) ? s.bits : [],
        evActive: Array.isArray(s.evActive) ? s.evActive : [],
    };
}

// Validate + normalize a blob loaded from storage (defensive against hand-edits / older shapes).
function normalizePilot(b) {
    if (!b || typeof b !== "object") return null;
    return serializePilot({
        pilotName: b.name, shipId: b.shipId, shipName: b.shipName, cargo: b.cargo, cargoHold: b.cargoHold,
        outfits: b.outfits, credits: b.credits, systemId: b.systemId, planetId: b.planetId,
        esActive: !!b.es,
        conditions: b.es && b.es.conditions, reputation: b.es && b.es.reputation,
        visitedSystems: b.es && b.es.visitedSystems, visitedPlanets: b.es && b.es.visitedPlanets,
        licenses: b.es && b.es.licenses, esCargo: b.es && b.es.cargo, dateEpochDay: b.es && b.es.dateEpochDay,
        account: b.es && b.es.account, startId: b.es && b.es.startId, esActiveMissions: b.es && b.es.activeMissions,
        bits: b.bits, evActive: b.evActive,
    });
}

// --- storage (localStorage slots) -------------------------------------------------------------------

function readIndex() { const ls = store(); if (!ls) return []; try { const a = JSON.parse(ls.getItem(INDEX) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } }
function writeIndex(a) { const ls = store(); if (!ls) return; try { ls.setItem(INDEX, JSON.stringify(a)); } catch {} }

// Save a blob under a name. Newest name floats to the front of the index (for "Continue").
function savePilot(name, blob) {
    const ls = store(); if (!ls || !name) return { ok: false, why: "no storage" };
    try {
        ls.setItem(SLOT + name, JSON.stringify(blob));
        const idx = readIndex().filter((n) => n !== name); idx.unshift(name); writeIndex(idx);
        return { ok: true };
    } catch (e) { return { ok: false, why: (e && e.message) || "save failed" }; }
}

function loadPilot(name) { const ls = store(); if (!ls || !name) return null; try { return normalizePilot(JSON.parse(ls.getItem(SLOT + name))); } catch { return null; } }

function deletePilot(name) { const ls = store(); if (!ls) return false; try { ls.removeItem(SLOT + name); writeIndex(readIndex().filter((n) => n !== name)); return true; } catch { return false; } }

// Slot summaries for a "Load / Continue" list, newest first.
function listPilots() {
    const ls = store(); if (!ls) return [];
    return readIndex().map((name) => {
        try { const b = JSON.parse(ls.getItem(SLOT + name)); return { name, savedAt: b && b.savedAt, credits: b && b.credits, shipName: b && b.shipName, systemId: b && b.systemId }; }
        catch { return { name, savedAt: 0 }; }
    });
}

function mostRecentPilot() { const idx = readIndex(); return idx.length ? idx[0] : null; }

export { serializePilot, normalizePilot, savePilot, loadPilot, deletePilot, listPilots, mostRecentPilot, SCHEMA };
if (typeof module !== "undefined" && module.exports)
    module.exports = { serializePilot, normalizePilot, savePilot, loadPilot, deletePilot, listPilots, mostRecentPilot, SCHEMA };
