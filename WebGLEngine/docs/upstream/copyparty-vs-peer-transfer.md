# copyparty's up2k against SweK's peer transfer

**Verified at v3166.** 9001/copyparty, MIT, ~45k stars, 1.8k forks, active (security advisories through 2026).
Python 2 or 3, all dependencies optional, one file. http(s) / WebDAV / SFTP / FTP(S) / TFTP / SMB. Runs in
Termux on Android and a-Shell on iOS.

## The comparison, because we built the same thing at v3143-v3161

|                | SweK peer Grab                          | copyparty up2k                              |
|----------------|-----------------------------------------|---------------------------------------------|
| direction      | PULL -- the Grab fetches a walked tree  | PUSH -- the client uploads                  |
| who hashes     | the SENDER, on request (`?hash=1`)      | the CLIENT, whole file, BEFORE starting     |
| hash           | SHA-256                                 | SHA-512                                     |
| resume unit    | the last VERIFIED CONTIGUOUS chunk      | **the server names WHICH chunks to resend** |
| parallelism    | serial, one ranged GET                  | parallel, non-contiguous, into the final file |
| dedup          | none                                    | identical content hardlinked                |
| state          | none                                    | none required for the protocol              |

## *** WHERE THEIRS IS BETTER, AND IT IS A REAL FINDING ABOUT OUR CODE ***

up2k's handshake sends the client's hashlist and **the server replies with a list of chunks to reupload**. A
transfer with a hole in the middle re-sends exactly those chunks.

Ours resumes from the FIRST bad chunk and DISCARDS EVERYTHING AFTER IT. That was gated at v3143 as correct, with
the reason "a gap cannot be verified" -- and **that reason is only true without a chunk list.** v3160 added
`/peer/dl/manifest`, which is exactly a chunk list. We have had the means to verify each chunk independently
since then and have not used it: `verifiedPrefix` still walks forward and stops at the first mismatch.

So the improvement is available to our own code and does not require adopting anything: verify EVERY chunk
against the manifest, and request only the ones that fail. On a 70 MB build with one corrupt chunk in the
middle, that is the difference between re-fetching half the file and re-fetching one megabyte.

**Their drawback, stated by them, is real too:** up2k requires the client to hash the ENTIRE file before an
upload can begin. Ours hashes on the sending side on request, so a Grab starts immediately.

## What copyparty is registered FOR here

**The phone peers.** `android-peer.html` and `ios-peer.html` mention file transfer ZERO times -- the phone peers
run the physics subset and cannot move a file. copyparty runs in Termux and a-Shell, which are exactly those two
environments, and needs only Python.

## What it is NOT for

**The engine-to-engine Grab.** That path pulls a walked directory from a trusted peer under `_isTrustedReq` and
the PIN gate. copyparty has its own accounts and volumes, and putting it under the trusted path would mean TWO
AUTH SYSTEMS FOR ONE MESH -- the two-things-wearing-one-label shape, in the place where it is worst.

## And autoRun is deliberately OFF

go2rtc sets `autoRun: true` because a camera server with nothing to serve is harmless. A FILE SERVER that starts
itself is a decision about what is exposed and to whom, and copyparty's own README warns that running it bare
"will give everyone read/write access to the current folder". That is Keith's choice to make, not a registry's.

Their releases page carries real CVEs and a Discord `@everyone` for vulnerabilities. That is good practice AND it
means running it on the LAN has a maintenance cost attached; the port is 3923 by default and wants checking
against `swek_free_port`.
