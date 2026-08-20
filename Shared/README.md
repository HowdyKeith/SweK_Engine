# Shared modules (import into BOTH workbooks)

Per the two-workbook design: VBAEngine (the full OpenGL/D3D11 engine) and
VBAVoxelEngine (the WebGL-linked workbook) each build from their own folder PLUS
this Shared/ folder. These are the functions either workbook wants.

- `modEngineBridge.bas` — bridge client (POST state / drain directives).
- `Net/` — standalone networking pulled out of the VBA smart transmitter
  (does NOT require the transmitter to be running).

Build a workbook = import `<Workbook>/` + `Shared/` into your VBASync blank.
