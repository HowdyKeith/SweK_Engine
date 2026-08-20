# PetFBI board — SharePoint backing (via Power Automate)

This hosts the shared board in **SharePoint/Microsoft 365** instead of Google
Sheets. The bridge talks plain HTTP+secret (the same contract as the Apps
Script backing), so the Microsoft side is a **Power Automate flow** with an
"When an HTTP request is received" trigger that reads/writes a SharePoint
**Excel table** (or a SharePoint **list**).

Why a flow and not direct Graph API? A Node bridge talking to SharePoint Excel
directly needs an Azure AD app registration + OAuth tokens — heavy, and the
secret would have to live on every admin's machine. A Power Automate HTTP flow
runs as the owner, keeps credentials on Microsoft's side, and is just a URL +
shared secret to the bridge — identical in spirit to the Google Apps Script
path, and it works the same for every admin.

## What you build (owner, once)
1. In SharePoint, make an Excel file (or list) with a table named `Board` and
   columns: `id, title, petType, status, link, mapUrl, notes, claimedBy,
   postedBy, ts, claimedAt, postedAt`.
2. In **Power Automate**, create an instant cloud flow with the trigger
   **"When an HTTP request is received"**. Set the request body JSON schema to
   accept `{ secret, action, id, title, petType, link, mapUrl, notes, who }`.
3. First action: a **Condition** — if `secret` ≠ your shared secret, **Respond**
   `{ "ok": false, "error": "bad secret" }` and terminate.
4. Switch on `action`:
   - `list`   → **List rows** from the table → Respond `{ ok:true, reports:[…] }`
   - `add`    → generate an id, **Add a row** → Respond `{ ok:true, report:{…} }`
   - `claim`  → **Get row** by id; if status is `posted` or claimed by someone
     else, Respond an error; else **Update row** status=claimed, claimedBy=who
   - `unclaim`/`posted`/`update`/`remove` → the matching Update/Delete row
5. **Save** the flow and copy the trigger's **HTTP POST URL**.

   For atomic claims (so two admins can't grab the same report), enable the
   flow's **concurrency control → degree 1** so claim operations serialize —
   the SharePoint analog of Apps Script's LockService.

6. The bridge calls the flow with GET-style `?action=list&secret=…` won't work
   (the HTTP trigger is POST-only), so the bridge sends **POST** for every op,
   including list. (The bridge already does this for the sharepoint backend.)

## Wire it in the engine
- PetFBI panel ▸ **Backing**: paste the flow's HTTP POST URL + your shared
  secret, click **Use SharePoint**. Other admins paste the same URL + secret.
- Stored in `~/.voxelbridge/petfbi.json` (mode 600, outside the project), so
  packaging the engine never leaks it.

## Notes
- The contract is the same JSON the Apps Script uses — return shapes:
  `{ok:true, reports:[…]}` for list, `{ok:true, report:{…}}` for mutations,
  `{ok:false, error:"…"}` on failure.
- "Use local" reverts a bridge to its own `petfbi-board.json`.
- Prefer Google? Use `PetFBI/google-sheets/` instead — same board, either host.
