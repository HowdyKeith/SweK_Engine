# SweK Engine — cloud rendezvous + signaling + shared-room server

One tiny dependency-free Node server that lets your engine boxes **and** remote people (e.g. PetFBI admins) find
and reach each other across networks/NAT, without anyone being on the same LAN. It does three things, all tiny
JSON so it stays inside the Google Cloud free-tier egress:

- **Directory** — boxes/clients `POST /register`; everyone reads `GET /directory`. Cross-network discovery.
- **WebRTC signaling** — `POST /signal` / `GET /signal?id=ME` relay SDP/ICE so two peers can open a *direct*
  P2P connection. The media/data then flows peer-to-peer, **not** through this server (so it costs ~nothing).
- **Shared room** — `GET/POST /room/:id`, a small shared key-value store with an optimistic-lock (`ifRev`). One
  home for cross-network shared state like the **PetFBI posting board** (claim / posted / live), so distributed
  admins don't double-post.

> **Run a SINGLE instance** — state is in-memory. Cloud Run: `--min-instances=1 --max-instances=1`. A VM is
> always single-instance. For a personal rendezvous that's plenty.

## Persistence (v1626)
The room store (which backs the PetFBI board) is saved to `rendezvous-state.json` and reloaded on boot, so the
board survives a restart. Writes are debounced + atomic, and a `SIGTERM` (what Cloud Run sends on shutdown)
flushes first. Directory / signaling / announce / image blobs are deliberately NOT persisted — they're
heartbeat/TTL-transient and rebuild on their own.

- **e2-micro VM:** works out of the box — the file lands next to `server.js` on the persistent disk.
- **Cloud Run:** the container filesystem is ephemeral (a cold start wipes it). To persist there, mount a volume
  and point the server at it: `--add-volume ... --add-volume-mount ...` (or a GCS FUSE volume), then set
  `--set-env-vars SWEK_STATE_DIR=/mnt/state`. Without a mounted volume the board still works in-session but won't
  survive a cold start — which is the main reason the e2-micro is the better home for a board you care about.


## Auth
Set `SWEK_TOKEN` to a shared secret. Clients send it as `?token=...` or `Authorization: Bearer ...`. If unset,
the server runs **open** and warns at boot — set it before exposing publicly.

---

## Option 1 — Cloud Run (serverless, scales to zero)

```sh
cd cloud/swek-rendezvous
gcloud run deploy swek-rendezvous \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances=1 --max-instances=1 \
  --set-env-vars SWEK_TOKEN=YOUR_LONG_RANDOM_TOKEN
```

`--allow-unauthenticated` exposes the HTTPS URL publicly; your `SWEK_TOKEN` is the gate. Cloud Run gives you a
`https://swek-rendezvous-xxxx.run.app` URL with TLS already terminated. The free tier covers 2M requests/month.

## Option 2 — Always-free e2-micro VM

> **The console defaults are NOT free.** "Create an instance" defaults to **e2-medium** (~$25/mo) with a
> **balanced** boot disk. For the always-free tier you must change two things:
> 1. **Machine type → `e2-micro`** (General purpose → E2 series → e2-micro: 2 shared vCPU / 1 GB). 1 GB is plenty —
>    this server is tiny pure-Node with no dependencies.
> 2. **Boot disk → Standard persistent disk** (OS and storage → Boot disk → change type to *Standard*, ≤30 GB).
>    The free tier covers 30 GB-months of **standard** PD only; a *balanced* disk costs ~$1/mo.
>
> Region must be **us-west1 / us-central1 / us-east1** (only one free e2-micro per *billing account*, across all
> projects). Heads-up: the **Monthly estimate** panel shows list price (~$6-7) and does **not** subtract the free
> tier — the actual bill for e2-micro + 30 GB standard + a free region is **$0** (a balanced disk leaves ~$1).

```sh
# CLI path — already free-tier-correct (e2-micro + standard 30 GB disk in a free region)
gcloud compute instances create swek-rv --machine-type=e2-micro --zone=us-central1-a \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-type=pd-standard --boot-disk-size=30GB
gcloud compute firewall-rules create swek-rv-http --allow=tcp:8787 --target-tags=http-server
# then on the box:
sudo apt-get update && sudo apt-get install -y nodejs
git clone <your repo>   # or scp this folder up
cd swek-rendezvous
SWEK_TOKEN=YOUR_LONG_RANDOM_TOKEN PORT=8787 node server.js
```

Keep it alive with systemd (`/etc/systemd/system/swek-rv.service`):

```ini
[Service]
Environment=SWEK_TOKEN=YOUR_LONG_RANDOM_TOKEN
Environment=PORT=8787
ExecStart=/usr/bin/node /home/USER/swek-rendezvous/server.js
Restart=always
[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now swek-rv`. Note the VM's free egress is **1 GB/month** — fine for directory +
signaling + board, but don't relay bulk traffic through it.

---

## Point the engine at it
In the SweK Engine control panel → **Cloud** section: paste the server URL + token, set a name, enable. The
bridge then registers on a heartbeat and pulls the directory so remote boxes show up by name in the radar.

## API quick reference
| Method | Path | Body | Returns |
|---|---|---|---|
| GET  | `/health` | — | `{ ok, peers, auth }` (no token needed) |
| POST | `/register` | `{ id, name, kind }` | `{ ok, peers:[...] }` |
| GET  | `/directory` | — | `{ ok, peers:[{id,name,kind,lastSeen}] }` |
| POST | `/signal` | `{ to, from, kind, data }` | `{ ok }` |
| GET  | `/signal?id=ME` | — | `{ ok, msgs:[{from,kind,data,ts}] }` |
| GET  | `/room/:id` | — | `{ ok, value, rev, updated }` |
| POST | `/room/:id` | `{ value, ifRev? }` | `{ ok, rev }` or `409 { rev, value }` |
| POST | `/announce` | `{ channel?, ann }` | `{ ok }` |
| GET  | `/announce?channel=&since=` | — | `{ ok, anns:[{ann,ts}] }` |
| GET  | `/board` | — | the PetFBI posting-board page (HTML) |

## PetFBI posting board
Open `https://<your-server>/board`. It prompts once for the token + your name (stored on that device only),
then shows the shared report list. Claim / Mark posted / Release are written to `/room/petfbi-board` with an
optimistic lock, so two admins claiming the same report at once can't both win — the second gets a 409 and
retries on the fresh state. That's the "don't double-post" guarantee. Every admin reaches the same board from
anywhere, no LAN needed.

## TURN relay (optional — symmetric NAT only)
Public STUN handles most networks. If two peers are both behind symmetric NAT, WebRTC needs a TURN relay, which
forwards the media (so it uses bandwidth — **not** inside the free egress; budget for it). Run
[coturn](https://github.com/coturn/coturn) on the same e2-micro (or any host) and enter its `turn:host:3478` URL
+ user + credential in the engine's Cloud panel (under "TURN relay"). The browser adds it to its ICE servers.

## EV presence room (Stellar Atlas co-op)

Lets pilots flying the same EV data file see each other as ghost ships in their system.

- `POST /presence?room=R` with `{ type:"presence", id, name, system, x, y, vx, vy, heading, shipName }`
  stores this pilot's state. `{ type:"leave", id }` removes them.
- `GET /presence?room=R&id=ME` returns `{ peers:[ ...others fresh in the room ] }` (excludes ME, drops
  anyone idle past the 8s TTL).

Packets are tiny JSON and coords are rounded to ints, but this is a light **relay** — egress is N-squared with
players and the always-free VM only allows ~1 GB/month, so it's fine for occasional co-op, not always-on crowds.
The egress-optimal path is WebRTC P2P over the existing `/signal` endpoints (pilots talk directly; the server only
brokers the handshake) — a later upgrade. In the engine (`ev.html` -> Multiplayer), leave the server URL blank to
test two browser tabs on one machine with no server at all (BroadcastChannel).
