// WebGLEngine/ev/evChecks.mjs — referential-integrity + range sanity checks for a parsed EV universe.
// Pure: takes the object from buildUniverse(), returns a report. Shared by the in-engine "Check data" button and the
// headless ev-selfcheck.mjs CLI. The point is to catch byte-offset drift: if a parser field offset is wrong, the values
// it reads are garbage that won't resolve against the rest of the universe, so the resolve rates crater. Against a real,
// complete EV data file nearly every reference should resolve; a low rate is the tell that an offset moved.

const ID_FLOOR = 128;   // EV resource ids start at 128 — anything below is "none / independent / unused"

function lvl(ok, total) { return total === 0 ? "warn" : (ok / total >= 0.9 ? "pass" : (ok / total >= 0.5 ? "warn" : "fail")); }
function pct(ok, total) { return total ? Math.round(ok / total * 100) : 100; }
function detail(ok, total) { return total ? (ok + "/" + total + " resolve (" + pct(ok, total) + "%)") : "no references to check"; }

function finish(checks) {
    const fails = checks.filter((c) => c.level === "fail").length;
    const warns = checks.filter((c) => c.level === "warn").length;
    return { ok: fails === 0, fails, warns, total: checks.length, checks };
}

// Run the full battery. Returns { ok, fails, warns, total, checks:[{name, level:"pass"|"warn"|"fail", detail}] }.
function runEvChecks(uni) {
    const checks = [];
    const add = (name, level, det) => checks.push({ name, level, detail: det });
    if (!uni) { add("universe", "fail", "no universe to check"); return finish(checks); }

    const govts = uni.govts || {}, dudes = uni.dudes || {}, fleets = uni.fleets || {};
    const shipById = uni.shipById || {}, systemById = uni.systemById || {}, spobs = uni.spobs || {};
    const systems = uni.systems || [];
    const nG = Object.keys(govts).length, nD = Object.keys(dudes).length, nF = Object.keys(fleets).length;
    const nShip = Object.keys(shipById).length, nSys = systems.length || Object.keys(systemById).length, nSpob = Object.keys(spobs).length;

    // 1) structural presence + Nova hard caps (a gross over-read blows past these)
    add("systems present", nSys > 0 ? "pass" : "fail", nSys + " systems, " + nSpob + " stellars");
    add("ships present", nShip > 0 ? "pass" : "fail", nShip + " ships");
    add("govts present", nG > 0 ? "pass" : "warn", nG + " governments");
    add("dudes present", nD > 0 ? "pass" : "warn", nD + " dude types");
    add("fleets present", nF > 0 ? "pass" : "warn", nF + " fleets");
    if (nG > 256 || nD > 512 || nF > 256) add("table sizes within Nova caps", "warn", "govts " + nG + "/256, dudes " + nD + "/512, fleets " + nF + "/256");

    // helper: score a flat list of id references against a lookup map (ids below the floor are skipped as "none")
    const ref = (name, items, lookup) => {
        let ok = 0, total = 0;
        for (const v of items) { if (v == null || v < ID_FLOOR) continue; total++; if (lookup[v] != null) ok++; }
        add(name, lvl(ok, total), detail(ok, total));
    };
    const refMany = (name, rows, pick, lookup) => {
        let ok = 0, total = 0;
        for (const row of rows) for (const v of pick(row)) { if (v == null || v < ID_FLOOR) continue; total++; if (lookup[v] != null) ok++; }
        add(name, lvl(ok, total), detail(ok, total));
    };

    // 2) dude -> govt / ships
    ref("dude.govt -> govts", Object.values(dudes).map((d) => d.govt), govts);
    refMany("dude.shipTypes -> ships", Object.values(dudes), (d) => d.shipTypes || [], shipById);

    // 3) fleet -> ships / govt
    refMany("fleet.lead+escorts -> ships", Object.values(fleets), (f) => [f.lead, ...(f.escorts || [])], shipById);
    ref("fleet.govt -> govts", Object.values(fleets).map((f) => f.govt), govts);

    // 4) syst -> govt / dudeTypes / links / nav
    ref("syst.govt -> govts", systems.map((s) => s.govt), govts);
    { let ok = 0, total = 0;
      for (const s of systems) for (const v of (s.dudeTypes || [])) {
          if (v >= ID_FLOOR && v <= 639) { total++; if (dudes[v] != null) ok++; }          // dude id
          else if (v <= -ID_FLOOR && v >= -383) { total++; if (fleets[-v] != null) ok++; }  // fleet id (negated)
      }
      add("syst.dudeTypes -> dudes/fleets", lvl(ok, total), detail(ok, total)); }
    refMany("syst.links -> systems", systems, (s) => s.links || [], systemById);
    refMany("syst.nav -> stellars", systems, (s) => s.nav || [], spobs);

    // 5) govt class/ally/enemy value sanity — these are small class numbers; huge values smell like offset drift
    { let wild = 0, total = 0;
      for (const g of Object.values(govts)) for (const v of [...(g.classes || []), ...(g.allies || []), ...(g.enemies || [])]) { total++; if (v > 9999) wild++; }
      add("govt class/ally/enemy in range", wild === 0 ? "pass" : (wild < total * 0.1 ? "warn" : "fail"), wild + " wild of " + total + " values"); }

    return finish(checks);
}

export { runEvChecks };
