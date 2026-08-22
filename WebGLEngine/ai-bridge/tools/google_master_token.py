#!/usr/bin/env python3
# google_master_token.py — mint the ha-google-home "master token" from a Google
# email + app password, using gpsoauth (the same library glocaltokens /
# ha-google-home use under the hood). Reads a JSON request on stdin so the
# password never lands in argv / the process list. Prints one JSON line.
#
#   in :  {"email": "...", "password": "<app password>", "androidId": "<16 hex>"}
#   out:  {"ok": true,  "masterToken": "aas_et/...", "email": "..."}
#     or  {"ok": false, "error": "...", "needInstall": true?}
import sys, json


def main():
    try:
        data = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"ok": False, "error": "bad input: " + str(e)})); return
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    android_id = (data.get("androidId") or "0123456789abcdef").strip()
    if not email or not password:
        print(json.dumps({"ok": False, "error": "email and app password are required"})); return
    try:
        import gpsoauth
    except ImportError:
        print(json.dumps({"ok": False, "error": "gpsoauth is not installed", "needInstall": True})); return
    try:
        res = gpsoauth.perform_master_login(email, password, android_id)
    except Exception as e:
        print(json.dumps({"ok": False, "error": "login failed: " + str(e)})); return
    token = res.get("Token") or res.get("token")
    if token:
        print(json.dumps({"ok": True, "masterToken": token, "email": email}))
    else:
        # Surface Google's own error so the user can act on it
        # (BadAuthentication = wrong app password; NeedsBrowser / DeviceManagementRequiredOrSyncDisabled, etc.)
        err = res.get("Error") or res.get("ErrorDetail") or ("unexpected response: " + json.dumps(res)[:200])
        print(json.dumps({"ok": False, "error": str(err)}))


if __name__ == "__main__":
    main()
