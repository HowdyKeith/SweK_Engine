# PetFBI board — Google Sheets backing (setup)

This makes the posting board a shared Google Sheet so **remote admins** see the
same reports and claims. One person (the owner) sets it up once; everyone else
just pastes a URL + secret.

## Owner — one-time setup
1. Create a Google Sheet (name it anything, e.g. "PetFBI Board").
2. **Extensions ▸ Apps Script.** Delete the stub, paste in `Code.gs` from this folder.
3. Near the top, set `var SECRET = "..."` to a long random string. Remember it.
4. In the editor, run `setupSheet` once (it creates the `Board` tab + headers).
   Approve the permission prompt the first time.
5. **Deploy ▸ New deployment ▸ Web app.**
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
   - Deploy, then **copy the Web app URL** (ends in `/exec`).
6. In the engine, open **PetFBI panel ▸ Backing**, paste the `/exec` URL and the
   SECRET, click **Use sheet**. The board is now sheet-backed.

## Other admins
- They install the engine, open the **PetFBI panel ▸ Backing**, and paste the
  **same** URL + SECRET the owner gives them, then **Use sheet**.
- That's it — every bridge now reads/writes the one sheet. Claims are atomic
  (LockService), so two admins can't grab the same report.

## Notes
- The URL+secret are stored in `~/.voxelbridge/petfbi.json` (mode 600), **outside
  the project**, so packaging the engine never leaks them.
- "Use local" reverts a bridge to its own `petfbi-board.json` (single machine).
- Re-deploy the script (Deploy ▸ Manage deployments ▸ edit ▸ new version) if you
  change `Code.gs`. The `/exec` URL stays the same across versions of one deployment.
- Want stronger auth than a shared secret? Switch *Who has access* to a Google
  Workspace domain, or move to a service account — but the shared secret is the
  low-friction path and fine for a volunteer board.
