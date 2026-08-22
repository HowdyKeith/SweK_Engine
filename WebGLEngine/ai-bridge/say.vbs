' say.vbs - v1025  (local text-to-speech via Windows SAPI, zero install)
'   cscript //NoLogo //B say.vbs @voices                  -> list installed voices
'   cscript //NoLogo //B say.vbs <textfile> [wav] [rate] [voiceSubstr]
'     <textfile> UTF-8 text to speak; [wav] save to that path instead of aloud;
'     [rate] -10..10; [voiceSubstr] picks the first voice whose name contains it.
Option Explicit
On Error Resume Next

Dim args : Set args = WScript.Arguments
If args.Count < 1 Then WScript.Quit 2

Dim v : Set v = CreateObject("SAPI.SpVoice")
If Err.Number <> 0 Or v Is Nothing Then WScript.StdErr.Write "no-sapi" : WScript.Quit 4

If args(0) = "@voices" Then
    Dim toks, tk : Set toks = v.GetVoices()
    For Each tk In toks
        WScript.StdOut.WriteLine tk.GetDescription()
    Next
    WScript.Quit 0
End If

' read the UTF-8 text file
Dim s : Set s = CreateObject("ADODB.Stream")
s.Charset = "utf-8" : s.Open : s.LoadFromFile args(0)
Dim txt : txt = s.ReadText : s.Close
If Err.Number <> 0 Then WScript.Quit 3

Dim wavPath : If args.Count >= 2 Then wavPath = args(1) Else wavPath = ""
If args.Count >= 3 And Len(args(2)) > 0 Then v.Rate = CInt(args(2))
If args.Count >= 4 And Len(args(3)) > 0 Then
    Dim toks2, t2 : Set toks2 = v.GetVoices()
    For Each t2 In toks2
        If InStr(LCase(t2.GetDescription()), LCase(args(3))) > 0 Then Set v.Voice = t2 : Exit For
    Next
End If

If Len(wavPath) > 0 Then
    Dim fsx : Set fsx = CreateObject("SAPI.SpFileStream")
    fsx.Format.Type = 22                 ' SAFT22kHz16BitMono
    fsx.Open wavPath, 3                   ' SSFMCreateForWrite
    Set v.AudioOutputStream = fsx
    v.Speak txt
    fsx.Close
Else
    v.Speak txt                          ' speak aloud on this PC
End If
If Err.Number <> 0 Then WScript.Quit 5
WScript.Quit 0
