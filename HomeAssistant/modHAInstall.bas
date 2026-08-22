Attribute VB_Name = "modHAInstall"
Option Explicit
' ============================================================
' MODULE: modHAInstall.bas
' One-button install of the VBA Engine Home Assistant panel add-on.
'
' Two paths, picked automatically:
'   (A) EASY (default): opens the official "My Home Assistant" redirect that
'       adds the add-on repository to the user's HA. They click ADD, then
'       INSTALL > START in the store. This is the standard community-add-on
'       flow (the "Add to my Home Assistant" badge) — no token, works for
'       anyone. As easy as it gets.
'   (B) ZERO-TOUCH (optional): if HA_BASE_URL + HA_TOKEN are filled in, POSTs
'       to the Supervisor API to add the repository automatically. Needs a
'       long-lived access token from HA (Profile > Security > Long-lived tokens).
'
' Wire to a button via modDemoRegistry (the "Install HA Panel" sheet button) or
' call InstallHAPanel directly. Verify in Excel/HA — untested here.
' ============================================================

' Your add-on repository (GitHub). Replace YOURNAME after you push the repo.
Private Const HA_ADDON_REPO_URL As String = "https://github.com/YOURNAME/ha-vbaengine-addon"

' Optional zero-touch path. Leave both blank to use the easy "My HA" redirect.
Private Const HA_BASE_URL As String = ""      ' e.g. "http://homeassistant.local:8123"
Private Const HA_TOKEN    As String = ""      ' long-lived access token

Public Sub InstallHAPanel()
    If Len(HA_BASE_URL) > 0 And Len(HA_TOKEN) > 0 Then
        InstallViaSupervisorAPI
    Else
        InstallViaMyHomeAssistant
    End If
End Sub

' ---- (A) the standard, easiest path -------------------------------------
Private Sub InstallViaMyHomeAssistant()
    Dim url As String
    url = "https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=" _
          & URLEncode(HA_ADDON_REPO_URL)
    OpenURL url
    MsgBox "Home Assistant is opening to add the add-on repository." & vbCrLf & vbCrLf & _
           "In HA:  click ADD  >  find 'VBA Engine Panel' in the store  >  INSTALL  >  START" & vbCrLf & _
           "then enable 'Show in sidebar'.", vbInformation, "Install HA Panel"
End Sub

' ---- (B) zero-touch via the Supervisor API ------------------------------
Private Sub InstallViaSupervisorAPI()
    On Error GoTo Fallback
    SupervisorPost "/api/hassio/store/repositories", "{""repository"":""" & HA_ADDON_REPO_URL & """}"
    SupervisorPost "/api/hassio/store/reload", "{}"
    MsgBox "Repository added to Home Assistant via the Supervisor API." & vbCrLf & _
           "Open the Add-on Store and click INSTALL on 'VBA Engine Panel' " & _
           "(the resolved slug is repo-specific, so the final install is one click in HA).", _
           vbInformation, "Install HA Panel"
    Exit Sub
Fallback:
    MsgBox "Supervisor API call failed (" & Err.Description & ")." & vbCrLf & _
           "Opening the standard 'My Home Assistant' install instead.", vbExclamation
    InstallViaMyHomeAssistant
End Sub

Private Sub SupervisorPost(ByVal pathPart As String, ByVal json As String)
    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP.6.0")
    http.Open "POST", HA_BASE_URL & pathPart, False
    http.setRequestHeader "Authorization", "Bearer " & HA_TOKEN
    http.setRequestHeader "Content-Type", "application/json"
    http.send json
    If http.Status < 200 Or http.Status >= 300 Then _
        Err.Raise vbObjectError, , "HTTP " & http.Status & " " & Left$(http.responseText, 200)
End Sub

' ---- alternative: the existing iframe route (no GitHub repo needed) --------
' Shells the engine's ha\install.ps1 (panel_iframe over Samba). Use this if you
' haven't published the add-on repo yet and just want the engine iframed into
' the sidebar. Set EngineHaDir to where the engine's ha\ folder lives.
Private Const ENGINE_HA_DIR As String = ""   ' e.g. "C:\VoxelEngine\ha"
Public Sub InstallHAPanelIframe()
    Dim dir As String
    dir = ENGINE_HA_DIR
    If Len(dir) = 0 Then dir = ThisWorkbook.Path & "\ha"   ' fallback: alongside the workbook
    Dim script As String: script = dir & "\install.ps1"
    CreateObject("WScript.Shell").Run _
        "powershell -NoProfile -ExecutionPolicy Bypass -File """ & script & """", 1, True
    MsgBox "Ran the iframe-panel installer (ha\install.ps1). After it finishes, " & _
           "restart Home Assistant; 'Engine Console' appears in the sidebar.", vbInformation, "Install HA Panel"
End Sub

' ---- helpers ------------------------------------------------------------
Private Sub OpenURL(ByVal url As String)
    On Error Resume Next
    CreateObject("WScript.Shell").Run """" & url & """", 1, False
    On Error GoTo 0
End Sub

Private Function URLEncode(ByVal s As String) As String
    Dim i As Long, c As String, code As Long, out As String
    For i = 1 To Len(s)
        c = Mid$(s, i, 1): code = AscW(c)
        If (code >= 48 And code <= 57) Or (code >= 65 And code <= 90) Or _
           (code >= 97 And code <= 122) Or InStr("-_.~", c) > 0 Then
            out = out & c
        Else
            out = out & "%" & Right$("0" & Hex$(code), 2)
        End If
    Next i
    URLEncode = out
End Function
