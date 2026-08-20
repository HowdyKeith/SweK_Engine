# Google Sheets Integration — One-Time Setup

The Sheets bridge uses a **service-account** (not user OAuth) so you don't need a browser auth flow on the engine side. The service account has its own identity; you grant it access to specific Sheets by sharing them with its email.

## Steps

### 1. Install the npm package
Run from the install panel: **sheets-googleapis** (or manually):
```powershell
cd path\to\WebGLEngine\ai-bridge
npm install googleapis --no-save
```

### 2. Create a Google Cloud project
1. Go to <https://console.cloud.google.com/>
2. Top bar → project dropdown → **New Project**. Name it (e.g. "voxel-engine") and create.

### 3. Enable the Sheets API
1. With your new project selected, go to **APIs & Services → Library**
2. Search "Google Sheets API"
3. Click it → **Enable**

### 4. Create a service account
1. **APIs & Services → Credentials → Create credentials → Service account**
2. Service account name: e.g. `voxel-engine-sheets`
3. Skip the optional role/access grants — sheets are shared per-document.
4. Click **Done**.

### 5. Generate the JSON key
1. Click into the new service account
2. **Keys** tab → **Add Key → Create new key → JSON**
3. A JSON file downloads. Save it somewhere stable (e.g. `C:\VoxelBAK\sheets-creds.json`).
4. Open the JSON in a text editor — note the `client_email` value (looks like `voxel-engine-sheets@voxel-engine-12345.iam.gserviceaccount.com`).

### 6. Share each Sheet you want to use
1. Open the Sheet in your browser
2. Click **Share**
3. Paste the `client_email` from step 5
4. Pick access: **Viewer** if read-only, **Editor** if you want to write
5. Uncheck "Notify people"
6. **Share**

### 7. Configure the bridge
Once the bridge is running (default `http://localhost:8765`):

From browser console:
```js
await window.sheets.configure({ credsPath: "C:/VoxelBAK/sheets-creds.json" });
await window.sheets.status();
// → { ready: true, credsPath: "...", clientEmail: "voxel-engine-sheets@..." }
```

Or via raw fetch:
```
POST http://localhost:8765/sheets/config
Content-Type: application/json
{ "credsPath": "C:/VoxelBAK/sheets-creds.json" }
```

## Use

### Read a range
```js
const r = await window.sheets.read("1AbcDefGhi_yourSheetIdFromUrl", "Items!A1:D100");
// r = { values: [["Name","HP","Atk","Def"], ["Drunken Elephant", 30, 12, 8], ...] }
```

The spreadsheet ID is the long string in the Sheet URL between `/d/` and `/edit`.

### Write to a range
```js
await window.sheets.write("1AbcDefGhi...", "Items!A5:D5", [["Spider", 20, 8, 4]]);
// → { updatedRange, updatedRows: 1, updatedColumns: 4, updatedCells: 4 }
```

### Append rows to a table
```js
await window.sheets.append("1AbcDefGhi...", "Log!A:C",
                            [["2026-06-03T19:42:00Z", "k_42", "kill: civ_warwick"]]);
// → adds a row after the last filled row in the table starting at Log!A
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `googleapis package not installed` | Run `npm install googleapis` in ai-bridge |
| `creds file missing at <path>` | Path doesn't exist OR backslashes need to be forward-slashes in the JSON config (Windows) |
| `sheets.read: The caller does not have permission` | Service account email wasn't shared on the target Sheet |
| `sheets.read: Unable to parse range` | Range syntax should be `'SheetName!A1:Z100'` — single quotes around sheet name if it has spaces |
| `bridge unreachable` | AI bridge not running. Start it via `First_Start_AI_Bridge.bat`. |

## Security note

The credentials JSON is a private key. **Do not commit it to git** or share it. Service accounts have access to anything they're shared into — if a sheet is unshared from them, access revokes immediately.

If a key leaks, regenerate it: Cloud Console → Credentials → click the service account → Keys → delete the old key, create a new one.
