// FILE: ai-bridge/sheetsBridge.js
// VERSION: v1 (v798 — Google Sheets full integration)
//
// Node-side Google Sheets read/write via the googleapis package.
// Authenticates with a service-account JSON file (no user OAuth dance
// — service accounts have their own identity and don't need browser
// flow). The user generates the service account key once in Google
// Cloud Console and drops the JSON at the configured path.
//
// SETUP — one-time:
//   1. Go to https://console.cloud.google.com/ → create a new project
//   2. APIs & Services → Enable APIs → enable "Google Sheets API"
//   3. Credentials → Create credentials → Service Account
//      - Name it (e.g. "voxel-engine-sheets")
//      - Skip role grant (sheets are shared per-document below)
//   4. After creation, click the service account → Keys → Add Key →
//      Create new key → JSON. Download the JSON file.
//   5. Save the JSON to a path the bridge can read, e.g.
//      C:\VoxelBAK\sheets-creds.json
//   6. For each Sheet you want to access:
//      - Open the Sheet in Google Sheets
//      - Share button → paste the service account email
//        (it's the `client_email` field in the JSON)
//      - Give it Editor or Viewer access depending on read-only vs write
//   7. Set the creds path: POST /sheets/config { credsPath: "..." }
//      (the install panel or initial setup writes this)
//
// API:
//   read(spreadsheetId, range)
//     → { values: [[...row1], [...row2], ...] }
//   write(spreadsheetId, range, values, valueInputOption = "USER_ENTERED")
//     → { updatedRange, updatedRows, updatedColumns, updatedCells }
//   append(spreadsheetId, range, values)
//     → adds rows at the end of the table starting at `range`
//   status() → { ready: bool, credsPath, clientEmail, error }

const fs = require("fs");

let _client = null;          // cached google.sheets() client
let _config = { credsPath: null, clientEmail: null, error: null };

/**
 * Build the sheets client lazily on first request.
 * Returns { sheets, error }.
 */
function _ensureClient() {
    if (_client) return { sheets: _client, error: null };
    if (!_config.credsPath) return { sheets: null, error: "sheets: credsPath not configured (POST /sheets/config)" };
    if (!fs.existsSync(_config.credsPath)) return { sheets: null, error: `sheets: creds file missing at ${_config.credsPath}` };
    let google;
    try {
        google = require("googleapis").google;
    } catch (e) {
        return { sheets: null, error: "sheets: googleapis package not installed (npm install googleapis in ai-bridge)" };
    }
    try {
        const creds = JSON.parse(fs.readFileSync(_config.credsPath, "utf-8"));
        _config.clientEmail = creds.client_email;
        const auth = new google.auth.JWT(
            creds.client_email,
            null,
            creds.private_key,
            ["https://www.googleapis.com/auth/spreadsheets"]
        );
        _client = google.sheets({ version: "v4", auth });
        return { sheets: _client, error: null };
    } catch (e) {
        return { sheets: null, error: `sheets: creds load failed: ${e.message}` };
    }
}

function setConfig(cfg) {
    if (cfg?.credsPath) {
        _config.credsPath = cfg.credsPath;
        _config.error = null;
        _client = null;       // force reload on next call
    }
    return status();
}

function status() {
    const c = _ensureClient();
    return {
        ready: !!c.sheets,
        credsPath: _config.credsPath,
        clientEmail: _config.clientEmail,
        error: c.error,
    };
}

async function read(spreadsheetId, range) {
    const c = _ensureClient();
    if (!c.sheets) return { error: c.error };
    if (!spreadsheetId) return { error: "sheets.read: missing spreadsheetId" };
    if (!range)         return { error: "sheets.read: missing range (e.g. 'Sheet1!A1:Z100')" };
    try {
        const resp = await c.sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });
        return {
            range: resp.data.range,
            values: resp.data.values || [],
            majorDimension: resp.data.majorDimension || "ROWS",
        };
    } catch (e) {
        return { error: `sheets.read: ${e.message}` };
    }
}

async function write(spreadsheetId, range, values, valueInputOption = "USER_ENTERED") {
    const c = _ensureClient();
    if (!c.sheets) return { error: c.error };
    if (!Array.isArray(values)) return { error: "sheets.write: values must be 2D array of cells" };
    try {
        const resp = await c.sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption,
            requestBody: { values },
        });
        return {
            updatedRange: resp.data.updatedRange,
            updatedRows: resp.data.updatedRows,
            updatedColumns: resp.data.updatedColumns,
            updatedCells: resp.data.updatedCells,
        };
    } catch (e) {
        return { error: `sheets.write: ${e.message}` };
    }
}

async function append(spreadsheetId, range, values, valueInputOption = "USER_ENTERED") {
    const c = _ensureClient();
    if (!c.sheets) return { error: c.error };
    if (!Array.isArray(values)) return { error: "sheets.append: values must be 2D array" };
    try {
        const resp = await c.sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption,
            insertDataOption: "INSERT_ROWS",
            requestBody: { values },
        });
        return {
            updates: resp.data.updates,   // { updatedRange, updatedRows, ... }
            tableRange: resp.data.tableRange,
        };
    } catch (e) {
        return { error: `sheets.append: ${e.message}` };
    }
}

module.exports = { setConfig, status, read, write, append };
