// WebGLEngine/ai-bridge/tools/peer-selfhost-selfcheck.mjs — v2245
//
// Guards the fleet self-filter: a peer URL whose host is one of THIS box's own addresses (any adapter,
// including virtual Hyper-V/WSL NICs like 192.168.237.1) must be rejected so it never lands in the roster
// as a phantom peer that autoPull wastes cycles probing -- while REAL peers, including a real box on the
// same virtual subnet, are still accepted.
//
//   run: node ai-bridge/tools/peer-selfhost-selfcheck.mjs

import os from "os";
import { createRequire } from "module";

// Simulate Galaxina: a real NIC + a virtual Hyper-V NIC, before assetSync reads them.
os.networkInterfaces = () => ({
    "vEthernet (Default Switch)": [{ address: "192.168.237.1", family: "IPv4", internal: false }],
    "Ethernet": [{ address: "192.168.10.56", family: "IPv4", internal: false }],
});
os.hostname = () => "Galaxina";

const require = createRequire(import.meta.url);
const as = require("../assetSync.js");
const isPeer = as.isLanPeerUrl;

let pass = 0, total = 0;
const ok = (n, c) => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}`); } };

console.log("peer-selfhost-selfcheck: own addresses are not peers");
ok("own virtual NIC 192.168.237.1 rejected", isPeer("http://192.168.237.1:8787") === false);
ok("own real NIC 192.168.10.56 rejected", isPeer("http://192.168.10.56:8787") === false);
ok("own name Galaxina.local rejected", isPeer("http://Galaxina.local:8787") === false);
ok("localhost rejected", isPeer("http://localhost:8787") === false);
ok("127.0.0.1 rejected", isPeer("http://127.0.0.1:8787") === false);

console.log("peer-selfhost-selfcheck: real peers still accepted");
ok("MacBook 192.168.10.42 accepted", isPeer("http://192.168.10.42:8787") === true);
ok("a real box on the same virtual subnet (.237.2) accepted", isPeer("http://192.168.237.2:8787") === true);
ok("another box's mDNS name accepted", isPeer("http://macbook-pro.local:8787") === true);

console.log("peer-selfhost-selfcheck: junk still rejected");
ok("docker 172.17.0.2 rejected", isPeer("http://172.17.0.2:8787") === false);
ok("public host rejected", isPeer("http://api.github.com:8787") === false);

console.log(`\npeer-selfhost-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
