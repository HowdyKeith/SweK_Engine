// petfbiPipeline.js -- the PetFBI report->post pipeline (steps 2-6).
//
// Reads the JSON snapshot exported from Keith's workbook (PetFBI/config/
// petfbi-sheets.json) so EVERY tunable layer lives in the spreadsheet:
//   Key         -- report-text parse rules (used by the board parsers already)
//   HTMLKey     -- page-HTML grabs (GPS / pet pic / flyer / reunited flag)
//   Templates   -- post text by [status][type] with [PLACEHOLDER] + gender fill
//   Pages       -- town -> FB page routing (town page + statewide)
//   UrlTemplates, Gender
//
// Pipeline per report:
//   2. fetchPage(url)         -> raw HTML
//      grabFromHtml(html,src) -> { GEO_LONG, GEO_LAT, PETPIC, FLYER, reunited }
//   3. downloadImages(...)    -> Pet.jpg / Map.png / Flyer.png at local paths
//   4. composePost(report)    -> filled post text (status x type, gender pronouns)
//   5. routePages(report)     -> [{page, images:[...]}] town + statewide
//   6. assemble(report)       -> { text, images{}, pages[] } handed to the poster
//
// Nothing here auto-posts. The output is the composed text + local image paths;
// the human-driven file-dialog injection (VBA/Python) is the post step.

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

// ---------------------------------------------------------------------------
// snapshot
// ---------------------------------------------------------------------------
const SNAPSHOT_PATH = process.env.PETFBI_SHEETS ||
    path.join(__dirname, "..", "..", "PetFBI", "config", "petfbi-sheets.json");

let _snap = null, _snapMtime = 0;
function loadSnapshot() {
    // hot-reload if the file changed (so a re-sync is picked up without restart)
    try {
        const st = fs.statSync(SNAPSHOT_PATH);
        if (!_snap || st.mtimeMs !== _snapMtime) {
            _snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
            _snapMtime = st.mtimeMs;
        }
    } catch (e) {
        if (!_snap) throw new Error("PetFBI sheets snapshot not found at " + SNAPSHOT_PATH + " (run sync_sheets.py)");
    }
    return _snap;
}
function sheets() { return loadSnapshot().sheets; }

// ---------------------------------------------------------------------------
// (2) HTMLKey grabber -- apply the sheet-driven (left,right) rules to page HTML.
//     Mirrors the Key-sheet substring approach, but for the fetched page.
//     The VBA reads coords out of an unquoted form (it strips quotes first), so
//     we match Keith's exact delimiters against a quote-stripped copy for the
//     geo_* rules, and against the raw HTML for tag-based rules (og:image).
// ---------------------------------------------------------------------------
function between(hay, left, right) {
    if (!left) return "";
    const i = hay.indexOf(left);
    if (i < 0) return "";
    const start = i + left.length;
    if (!right) return hay.slice(start).trim();
    const j = hay.indexOf(right, start);
    if (j < 0) return "";
    return hay.slice(start, j).trim();
}
// Keith's HTMLKey delimiters use a literal backslash before ':' (e.g.
// "geo_longitude\:") because in the page JSON the field looks like
//   geo_longitude\":\"-71.39...\" after his Chr(34)-strip leaves the escape.
// We normalize by trying the rule as-written AND with backslashes removed, so
// the sheet value works whether or not the escape survives.
function grabRule(html, htmlNoQuotes, rule) {
    const variants = [rule.left];
    if (rule.left.includes("\\")) variants.push(rule.left.replace(/\\/g, ""));
    const rvariants = [rule.right];
    if (rule.right && rule.right.includes("\\")) rvariants.push(rule.right.replace(/\\/g, ""));
    for (const src of [htmlNoQuotes, html]) {
        for (const L of variants) {
            for (const R of rvariants) {
                const v = between(src, L, R);
                if (v) return v;
            }
        }
    }
    return "";
}
function grabFromHtml(html, source = "petfbi") {
    const sh = sheets();
    const rules = (sh.HTMLKey || []).filter(r => (r.source || "petfbi") === source || !r.source);
    const noQuotes = html.replace(/"/g, "");
    const out = {};
    for (const r of rules) {
        if (r.target === "REUNITED") { out.reunited = html.indexOf(r.left) >= 0; continue; }
        const v = grabRule(html, noQuotes, r);
        if (v) out[r.target] = v;
    }
    // pet pic: PETPIC (og:image) preferred, else PETPIC_ALT (picture_file) -> base URL
    const url = (sh.UrlTemplates || {});
    let petPic = out.PETPIC || "";
    if (!petPic && out.PETPIC_ALT) {
        const base = (url.PETPIC_BASE || "https://images.petfbi.org/{file}");
        petPic = base.replace("{file}", out.PETPIC_ALT);
    }
    return {
        geoLong: out.GEO_LONG || "",
        geoLat: out.GEO_LAT || "",
        petPic,
        reunited: !!out.reunited,
        _raw: out,
    };
}

// build the report page + flyer URLs from the snapshot's UrlTemplates
function reportPageUrl(id, emailName) {
    const t = (sheets().UrlTemplates || {}).REPORT_PAGE || "https://petfbi.org/api/view/{ID}/{EMAILNAME}#/";
    return t.replace("{ID}", encodeURIComponent(id)).replace("{EMAILNAME}", encodeURIComponent(emailName || ""));
}
function flyerUrl(id) {
    const t = (sheets().UrlTemplates || {}).FLYER_URL || "https://petfbi.org/admin.html#/flyer/{ID}";
    return t.replace("{ID}", encodeURIComponent(id));
}

// ---------------------------------------------------------------------------
// fetch + download (plain http/https; no deps)
// ---------------------------------------------------------------------------
function fetchText(url, { timeout = 20000 } = {}) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith("https") ? https : http;
        const req = lib.get(url, { headers: { "User-Agent": "Mozilla/5.0 (SweK PetFBI pipeline)" } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume(); return resolve(fetchText(res.headers.location, { timeout }));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode + " for " + url)); }
            let data = ""; res.setEncoding("utf8");
            res.on("data", (c) => data += c);
            res.on("end", () => resolve(data));
        });
        req.on("error", reject);
        req.setTimeout(timeout, () => { req.destroy(new Error("timeout fetching " + url)); });
    });
}
function downloadTo(url, dest, { timeout = 25000 } = {}) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith("https") ? https : http;
        const req = lib.get(url, { headers: { "User-Agent": "Mozilla/5.0 (SweK PetFBI pipeline)" } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume(); return resolve(downloadTo(res.headers.location, dest, { timeout }));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode + " for " + url)); }
            try { fs.mkdirSync(path.dirname(dest), { recursive: true }); } catch {}
            const f = fs.createWriteStream(dest);
            res.pipe(f);
            f.on("finish", () => f.close(() => resolve({ dest, bytes: fs.statSync(dest).size })));
            f.on("error", reject);
        });
        req.on("error", reject);
        req.setTimeout(timeout, () => { req.destroy(new Error("timeout downloading " + url)); });
    });
}

// ---------------------------------------------------------------------------
// (4) template compose -- fill Templates[status][type] with the report fields
//     and resolve the gender pronouns, exactly like the VBA/Key pipeline.
// ---------------------------------------------------------------------------
// map a board report's status(new/needsinfo/claimed/posted/archived) + kind
// (lost/found/reunited) to the Templates sheet's status key (Lost/Found/...).
function templateStatusFor(report) {
    const k = String(report.kind || "").toLowerCase();
    if (k === "found") return "Found";
    if (k === "reunited") return "Found"; // reunited pets aren't normally posted; Found text is the closest if forced
    if (k === "spotted") return "Spotted";
    if (k === "deceased") return "Deceased";
    return "Lost";
}
function templateTypeFor(report) {
    const t = String(report.petType || "").trim();
    const known = ["Cat", "Dog", "Bird", "Rabbit", "Lizard", "Other", "Mammal"];
    return known.includes(t) ? t : "Other";
}
function composePost(report) {
    const sh = sheets();
    const status = templateStatusFor(report);
    const type = templateTypeFor(report);
    const tpl = (sh.Templates[status] && (sh.Templates[status][type] || sh.Templates[status].Other)) || "";
    if (!tpl) return { ok: false, error: `no template for ${status}/${type}` };

    // field map: report fields -> [PLACEHOLDER]s. Board reports carry a subset;
    // fields we don't have collapse to empty (the templates tolerate blanks).
    const loc = parseLocation(report.location || "");
    const fields = {
        "[TOWN]": loc.town, "[STATE]": loc.state, "[ZIP]": loc.zip,
        "[STREET]": report.street || loc.street || "", "[NEIGHBORHOOD]": report.landmark || "",
        "[AREA]": loc.area || "", "[NAME]": report.petName || "", "[COLOR]": report.color || "",
        "[BREED]": report.breed || "", "[DATE]": report.date || "", "[COLLAR]": report.collar || "",
        "[DESCRIPTION]": report.notes || report.description || "", "[COMMENT]": report.comment || "",
        "[EMAIL]": report.email || "", "[PHONE1]": report.phone1 || "", "[PHONE2]": report.phone2 || "",
        "[PETIDNUM]": report.reportId || "", "[EMAILNAME]": report.emailName || "",
    };
    let text = tpl;
    for (const [k, v] of Object.entries(fields)) text = text.split(k).join(v);
    // gender pronouns
    const g = (sh.Gender || {})[report.sex] || null;
    if (g) for (const [k, v] of Object.entries(g)) text = text.split(k).join(v);
    // any unresolved [GENDER-*] with no sex -> neutral
    text = text.replace(/\[GENDER-HE\/SHE\]/g, "they").replace(/\[GENDER-HER\/HIS\]/g, "their");
    // tidy: collapse the double-spaces the blank fields leave behind
    text = text.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    return { ok: true, status, type, text };
}
// light location splitter: "Street, Town, County, STATE, US, ZIP." style.
// PetFBI location lines end with the country ("US") and a zip; the real 2-letter
// STATE is the token just before "US". We prefer a known US state abbreviation
// and never treat "US" as the state.
const US_STATES = new Set(("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN " +
    "MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC").split(" "));
function parseLocation(s) {
    const out = { town: "", state: "", zip: "", street: "", area: "" };
    if (!s) return out;
    const parts = s.replace(/\.$/, "").split(",").map(x => x.trim()).filter(Boolean);
    for (const p of parts) {
        const cleaned = p.replace(/\.$/, "");
        if (/^\d{5}(-?\d{0,4})?$/.test(cleaned.split(/\s+/)[0])) out.zip = cleaned.split(/\s+/)[0];
        else if (US_STATES.has(cleaned.toUpperCase())) out.state = cleaned.toUpperCase();
    }
    if (parts.length >= 1) out.street = parts[0];
    if (parts.length >= 2) out.town = parts[1];
    // area = the descriptive middle (town..just-before-state/country), excluding street
    const stop = parts.findIndex(p => US_STATES.has(p.toUpperCase()) || p.toUpperCase() === "US");
    out.area = parts.slice(1, stop > 1 ? stop : undefined).join(", ");
    return out;
}

// ---------------------------------------------------------------------------
// (5) routing -- town page + statewide, from the {STATE} Pages sheet.
//     Statewide tags: Town=="Default" (MA Lost Pets, gets pic+map),
//     Town=="DOG"/"CAT"/"BIRD" (official, gets flyer), matched by type.
// ---------------------------------------------------------------------------
function routePages(report) {
    const sh = sheets();
    const loc = parseLocation(report.location || "");
    const state = (loc.state || "MA").toUpperCase();
    const list = (sh.Pages && sh.Pages[state]) || [];
    const type = String(report.petType || "").toUpperCase();
    const townLc = (loc.town || "").toLowerCase();

    const picks = [];
    // town page: match the report's town against the Town column (which may be a
    // comma-list of towns per page). We match flexibly -- exact first, then a
    // whole-word contains either direction ("West Brookfield" <-> "Brookfield")
    // -- mirroring the VBA's contains-match, but guarded to whole words so
    // "Brook" doesn't hit "Brookline".
    if (townLc) {
        const words = townLc.split(/\s+/);
        const matchTown = (cell) => {
            const towns = cell.toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
            for (const t of towns) {
                if (t === townLc) return true;                       // exact
                const tw = t.split(/\s+/);
                // whole-word overlap: the report town's last word (the base name)
                // matches the cell town's last word, e.g. "west brookfield"~"brookfield"
                if (tw[tw.length - 1] === words[words.length - 1]) return true;
            }
            return false;
        };
        const tp = list.find(p => p.town && matchTown(p.town));
        if (tp) picks.push({ role: "town", ...tp, images: ["pet", "map"] });
    }
    // statewide default (MA Lost Pets): pic + map
    const def = list.find(p => (p.town || "").toLowerCase() === "default");
    if (def) picks.push({ role: "statewide", ...def, images: ["pet", "map"] });
    // official statewide by type (Lost Dogs/Cats Massachusetts): flyer
    const official = list.find(p => (p.town || "").toUpperCase() === type);
    if (official) picks.push({ role: "official", ...official, images: ["flyer"] });

    return picks;
}

// ---------------------------------------------------------------------------
// (2+3) fetch the report page, grab GPS/pic/flyer, download images locally.
//       outDir defaults to a per-report folder so multiple reports don't clash.
// ---------------------------------------------------------------------------
async function fetchAndDownload(report, opts = {}) {
    const outDir = opts.outDir || path.join(require("os").tmpdir(), "petfbi", String(report.reportId || Date.now()));
    const source = report.source || "petfbi";
    const result = { ok: false, outDir, images: {}, gps: null, reunited: false };

    // build the page URL: PetFBI uses REPORT_PAGE(id,emailName); PawBoost uses the landing link
    let pageUrl = report.link || "";
    if (source === "petfbi" && report.reportId) pageUrl = reportPageUrl(report.reportId, report.emailName || "");
    if (!pageUrl) return { ...result, error: "no page URL to fetch" };

    let html;
    try { html = await fetchText(pageUrl); }
    catch (e) { return { ...result, error: "fetch failed: " + e.message, pageUrl }; }

    const grabbed = grabFromHtml(html, source);
    result.reunited = grabbed.reunited;
    if (grabbed.geoLat && grabbed.geoLong) result.gps = { lat: grabbed.geoLat, long: grabbed.geoLong };

    // reunited guard: a reunited pet is not posted (VBA rule). Signal + stop.
    if (grabbed.reunited) return { ...result, ok: true, reunited: true, pageUrl, note: "reunited -- do not post" };

    // pet pic
    if (grabbed.petPic) {
        try { const d = await downloadTo(grabbed.petPic, path.join(outDir, "Pet.jpg")); result.images.pet = d.dest; }
        catch (e) { result.images.petError = e.message; }
    }
    // flyer (PetFBI)
    if (source === "petfbi" && report.reportId) {
        const furl = flyerUrl(report.reportId);
        try { const d = await downloadTo(furl, path.join(outDir, "Flyer.png")); result.images.flyer = d.dest; }
        catch (e) { result.images.flyerError = e.message; result.images.flyerUrl = furl; }
    }
    // map from GPS: store the coords + a maps URL; actual static-map render is a
    // follow-on (the VBA used a Google search). We provide the maps link now.
    if (result.gps) {
        result.mapUrl = `https://www.google.com/maps/search/?api=1&query=${result.gps.lat},${result.gps.long}`;
    }
    result.ok = true; result.pageUrl = pageUrl;
    return result;
}

// ---------------------------------------------------------------------------
// (6) assemble -- the full handoff object for the poster.
// ---------------------------------------------------------------------------
async function assemble(report, opts = {}) {
    const composed = composePost(report);
    const pages = routePages(report);
    let fetched = null;
    if (opts.fetch !== false) {
        try { fetched = await fetchAndDownload(report, opts); } catch (e) { fetched = { ok: false, error: e.message }; }
    }
    return {
        ok: !!(composed.ok),
        reportId: report.reportId, source: report.source || "petfbi",
        reunited: !!(fetched && fetched.reunited),
        text: composed.ok ? composed.text : null,
        templateUsed: composed.ok ? `${composed.status}/${composed.type}` : null,
        images: fetched ? fetched.images : {},
        gps: fetched ? fetched.gps : null,
        mapUrl: fetched ? fetched.mapUrl : null,
        pages: pages.map(p => ({ role: p.role, fbPage: p.fbPage, fbURL: p.fbURL, fbPageID: p.fbPageID, images: p.images })),
        error: composed.ok ? null : composed.error,
    };
}

module.exports = {
    loadSnapshot, sheets, grabFromHtml, reportPageUrl, flyerUrl,
    composePost, routePages, parseLocation, fetchAndDownload, assemble,
    // exposed for tests:
    _between: between,
};
