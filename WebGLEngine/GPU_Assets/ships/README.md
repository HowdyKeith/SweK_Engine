# ES ship models (.glb)

Drop `.glb` ship models here, then open **es-box3d-fly3d.html**, click **Ship models**, and assign a
file to a class (raider / marauder / corsair / unknown). Files here are served at
`/GPU_Assets/ships/<name>.glb` and appear in the picker's suggestion list (`/assets/list`).

- Static-mesh `.glb` works best (no skinning). Nose is normalized to **+X**; use the picker's facing
  control (0/90/180/270) if a model points the wrong way.
- Assignments by URL/path persist (localStorage); a locally-picked file lasts only the session.
- Classification: a ship whose name/class contains raider/marauder/corsair maps to that class; anything
  else is `unknown`. See `ev/esShipModelsCore.js`.
