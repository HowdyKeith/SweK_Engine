# cred-manager.ps1 - v1130
# Read/write/delete GENERIC credentials in the Windows Credential Manager via the
# advapi32 API. Used by winCredBridge.js to keep the GitHub token + Gmail app
# password in the OS vault instead of a plaintext json file. The secret for "set"
# is passed via the CRED_SECRET env var (not the command line, so it isn't visible
# in the process list). Emits one compact JSON line.
param([string]$Action, [string]$Target)
$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CredMan {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags; public uint Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
    public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode, EntryPoint="CredWriteW")]
  public static extern bool CredWrite(ref CREDENTIAL credential, uint flags);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode, EntryPoint="CredReadW")]
  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode, EntryPoint="CredDeleteW")]
  public static extern bool CredDelete(string target, uint type, uint flags);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr cred);
}
"@

function Write-Cred($target, $secret) {
  $blob = [System.Text.Encoding]::Unicode.GetBytes($secret)
  $cred = New-Object CredMan+CREDENTIAL
  $cred.Type = 1            # CRED_TYPE_GENERIC
  $cred.TargetName = $target
  $cred.CredentialBlobSize = $blob.Length
  $cred.CredentialBlob = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($blob.Length)
  [System.Runtime.InteropServices.Marshal]::Copy($blob, 0, $cred.CredentialBlob, $blob.Length)
  $cred.Persist = 2         # CRED_PERSIST_LOCAL_MACHINE
  $cred.UserName = $env:USERNAME
  $ok = [CredMan]::CredWrite([ref]$cred, 0)
  $errc = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  [System.Runtime.InteropServices.Marshal]::FreeHGlobal($cred.CredentialBlob)
  if (-not $ok) { throw "CredWrite failed ($errc)" }
}

function Read-Cred($target) {
  $ptr = [IntPtr]::Zero
  $ok = [CredMan]::CredRead($target, 1, 0, [ref]$ptr)
  if (-not $ok) { return $null }
  try {
    $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type]([CredMan+CREDENTIAL]))
    if ($cred.CredentialBlobSize -le 0) { return "" }
    $bytes = New-Object byte[] $cred.CredentialBlobSize
    [System.Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
    return [System.Text.Encoding]::Unicode.GetString($bytes)
  } finally { [CredMan]::CredFree($ptr) }
}

try {
  switch ($Action) {
    "set" { Write-Cred $Target $env:CRED_SECRET; '{"ok":true}' }
    "get" {
      $s = Read-Cred $Target
      if ($null -eq $s) { '{"ok":true,"found":false}' }
      else { (@{ ok = $true; found = $true; secret = $s } | ConvertTo-Json -Compress) }
    }
    "del" { $ok = [CredMan]::CredDelete($Target, 1, 0); (@{ ok = [bool]$ok } | ConvertTo-Json -Compress) }
    default { '{"ok":false,"error":"bad action"}' }
  }
} catch {
  (@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress)
}
