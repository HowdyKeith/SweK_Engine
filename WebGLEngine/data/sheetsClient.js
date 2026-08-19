// FILE: data/sheetsClient.js
// VERSION: v1 (v798 — Google Sheets engine-side client)
//
// Talks to the Node bridge's /sheets/* endpoints. Exposes window.sheets
// for console/script use.
//
// BRIDGE PATH RESOLUTION: by default, talks to http://localhost:8765
// (the AI bridge's default). Override via bridgeUrl param.
//
// API:
//   window.sheets.status()
//     → { ready, credsPath, clientEmail, error }
//
//   window.sheets.configure({ credsPath: "C:/VoxelBAK/sheets-creds.json" })
//     → status snapshot (call once at setup time)
//
//   window.sheets.read(spreadsheetId, range)
//     → { values: [[...row1], ...], range, majorDimension }
//
//   window.sheets.write(spreadsheetId, range, values)
//     → { updatedRange, updatedRows, updatedColumns, updatedCells }
//
//   window.sheets.append(spreadsheetId, range, values)
//     → { updates, tableRange }
//
// Quick usage:
//   const { values } = await window.sheets.read("1AbcDefGhi...", "Items!A1:D100");
//   await window.sheets.append("1AbcDefGhi...", "Log!A:C", [["timestamp", "kaiju", "kill"]]);

const DEFAULT_BRIDGE_URL = "http://localhost:8765";

class SheetsClient {
    constructor(bridgeUrl = DEFAULT_BRIDGE_URL) {
        this.bridgeUrl = bridgeUrl;
    }

    async status() {
        try {
            const resp = await fetch(`${this.bridgeUrl}/sheets/status`);
            return await resp.json();
        } catch (e) {
            return { ready: false, error: `bridge unreachable: ${e.message}` };
        }
    }

    async configure(cfg) {
        const resp = await fetch(`${this.bridgeUrl}/sheets/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cfg),
        });
        return await resp.json();
    }

    async read(spreadsheetId, range) {
        if (!spreadsheetId) throw new Error("sheets.read: missing spreadsheetId");
        if (!range)         throw new Error("sheets.read: missing range (e.g. 'Sheet1!A1:Z100')");
        const url = `${this.bridgeUrl}/sheets/read?id=${encodeURIComponent(spreadsheetId)}&range=${encodeURIComponent(range)}`;
        const resp = await fetch(url);
        return await resp.json();
    }

    async write(spreadsheetId, range, values, valueInputOption) {
        if (!Array.isArray(values)) throw new Error("sheets.write: values must be 2D array");
        const resp = await fetch(`${this.bridgeUrl}/sheets/write`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ spreadsheetId, range, values, valueInputOption }),
        });
        return await resp.json();
    }

    async append(spreadsheetId, range, values, valueInputOption) {
        if (!Array.isArray(values)) throw new Error("sheets.append: values must be 2D array");
        const resp = await fetch(`${this.bridgeUrl}/sheets/append`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ spreadsheetId, range, values, valueInputOption }),
        });
        return await resp.json();
    }
}

export function installSheetsGlobal(bridgeUrl) {
    if (typeof window === "undefined") return null;
    const client = new SheetsClient(bridgeUrl);
    window.sheets = {
        status:    ()              => client.status(),
        configure: (cfg)           => client.configure(cfg),
        read:      (id, range)     => client.read(id, range),
        write:     (id, range, v)  => client.write(id, range, v),
        append:    (id, range, v)  => client.append(id, range, v),
        _ref: client,
    };
    console.log("[Sheets] ready — window.sheets.{status, configure({credsPath}), read(id, range), write/append(id, range, values)}");
    return client;
}

export { SheetsClient };
