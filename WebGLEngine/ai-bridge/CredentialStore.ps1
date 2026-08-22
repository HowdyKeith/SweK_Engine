<#
  CredentialStore.ps1 - PowerShell access to the same Windows Credential Manager
  vault used by CredentialStore.bas / AIKeys.bas. Secrets are stored UTF-16LE so
  they round-trip byte-for-byte between VBA and PowerShell.

  Dot-source for interactive use:
      . .\CredentialStore.ps1
      Save-ApiKey -Provider gemini -Secret 'AIza...'
      Get-ApiKey  -Provider gemini
      Get-AIKeyStatus

  Or call as a script (this is what the voxel-engine Node bridge does):
      powershell -NoProfile -ExecutionPolicy Bypass -File CredentialStore.ps1 -Get -Provider gemini
#>
param(
    [switch]$Get,
    [switch]$Save,
    [switch]$Remove,
    [ValidateSet('grok','gemini','openai','claude')][string]$Provider,
    [string]$Target,
    [string]$Secret
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CredMan {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public struct CREDENTIAL {
        public uint Flags; public uint Type;
        public IntPtr TargetName; public IntPtr Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize; public IntPtr CredentialBlob;
        public uint Persist; public uint AttributeCount;
        public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName;
    }
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool CredWriteW(ref CREDENTIAL credential, uint flags);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool CredReadW(string target, uint type, uint flags, out IntPtr credential);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool CredDeleteW(string target, uint type, uint flags);
    [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr buffer);
}
"@ -ErrorAction SilentlyContinue

$script:CRED_GENERIC = 1
$script:CRED_PERSIST_LOCAL = 2
$script:ProviderMap = @{ grok='Grok'; gemini='Gemini'; openai='OpenAI'; claude='Anthropic' }

function Resolve-Target {
    param([string]$Target, [string]$Provider)
    if ($Provider) { return "SmartHomeVBA/" + $script:ProviderMap[$Provider] }
    return $Target
}

function Save-ApiKey {
    param([string]$Target, [string]$Provider, [Parameter(Mandatory)][string]$Secret)
    $t = Resolve-Target -Target $Target -Provider $Provider
    if (-not $t) { throw "Specify -Provider or -Target" }
    $blob = [System.Text.Encoding]::Unicode.GetBytes($Secret)
    $blobPtr = [Runtime.InteropServices.Marshal]::AllocHGlobal($blob.Length)
    [Runtime.InteropServices.Marshal]::Copy($blob, 0, $blobPtr, $blob.Length)
    $cred = New-Object CredMan+CREDENTIAL
    $cred.Type = $script:CRED_GENERIC
    $cred.Persist = $script:CRED_PERSIST_LOCAL
    $cred.TargetName = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni($t)
    $cred.UserName   = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni("SmartHomeVBA")
    $cred.CredentialBlobSize = $blob.Length
    $cred.CredentialBlob = $blobPtr
    $ok = [CredMan]::CredWriteW([ref]$cred, 0)
    [Runtime.InteropServices.Marshal]::FreeHGlobal($blobPtr)
    [Runtime.InteropServices.Marshal]::FreeCoTaskMem($cred.TargetName)
    [Runtime.InteropServices.Marshal]::FreeCoTaskMem($cred.UserName)
    if (-not $ok) { throw "CredWriteW failed (Win32 $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))" }
    return $true
}

function Get-ApiKey {
    param([string]$Target, [string]$Provider)
    $t = Resolve-Target -Target $Target -Provider $Provider
    if (-not $t) { throw "Specify -Provider or -Target" }
    $ptr = [IntPtr]::Zero
    if (-not [CredMan]::CredReadW($t, $script:CRED_GENERIC, 0, [ref]$ptr)) { return $null }
    try {
        $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type]([CredMan+CREDENTIAL]))
        if ($cred.CredentialBlobSize -gt 0) {
            $bytes = New-Object byte[] $cred.CredentialBlobSize
            [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
            return [System.Text.Encoding]::Unicode.GetString($bytes)
        }
        return ""
    } finally { [CredMan]::CredFree($ptr) }
}

function Remove-ApiKey {
    param([string]$Target, [string]$Provider)
    $t = Resolve-Target -Target $Target -Provider $Provider
    return [CredMan]::CredDeleteW($t, $script:CRED_GENERIC, 0)
}

function Get-AIKeyStatus {
    foreach ($p in 'grok','gemini','openai','claude') {
        $k = Get-ApiKey -Provider $p
        $state = if ([string]::IsNullOrEmpty($k)) { 'not set' } else { "set ($($k.Length) chars, ...$($k.Substring([Math]::Max(0,$k.Length-4))))" }
        '{0,-8}: {1}' -f $p, $state
    }
}

# Optional: call a provider straight from PowerShell (key auto-pulled from vault).
function Invoke-AIChat {
    param([Parameter(Mandatory)][ValidateSet('grok','gemini','openai','claude')][string]$Provider,
          [Parameter(Mandatory)][string]$Prompt, [string]$Model)
    $key = Get-ApiKey -Provider $Provider
    if (-not $key) { throw "No $Provider key in vault. Save-ApiKey -Provider $Provider -Secret '...'" }
    switch ($Provider) {
        { $_ -in 'grok','openai' } {
            $url = if ($_ -eq 'grok') { 'https://api.x.ai/v1/chat/completions' } else { 'https://api.openai.com/v1/chat/completions' }
            if (-not $Model) { $Model = if ($_ -eq 'grok') { 'grok-2-latest' } else { 'gpt-4o-mini' } }
            $b = @{ model=$Model; messages=@(@{ role='user'; content=$Prompt }) } | ConvertTo-Json -Depth 6
            $r = Invoke-RestMethod -Uri $url -Method Post -Headers @{ Authorization="Bearer $key" } -ContentType 'application/json' -Body $b
            return $r.choices[0].message.content
        }
        'claude' {
            if (-not $Model) { $Model = 'claude-sonnet-4-6' }
            $b = @{ model=$Model; max_tokens=1024; messages=@(@{ role='user'; content=$Prompt }) } | ConvertTo-Json -Depth 6
            $r = Invoke-RestMethod -Uri 'https://api.anthropic.com/v1/messages' -Method Post -Headers @{ 'x-api-key'=$key; 'anthropic-version'='2023-06-01' } -ContentType 'application/json' -Body $b
            return $r.content[0].text
        }
        'gemini' {
            if (-not $Model) { $Model = 'gemini-2.5-flash' }
            $url = "https://generativelanguage.googleapis.com/v1beta/models/$Model`:generateContent"
            $b = @{ contents=@(@{ parts=@(@{ text=$Prompt }) }) } | ConvertTo-Json -Depth 8
            $r = Invoke-RestMethod -Uri $url -Method Post -Headers @{ 'x-goog-api-key'=$key } -ContentType 'application/json' -Body $b
            return $r.candidates[0].content.parts[0].text
        }
    }
}

# ---- Script-mode dispatch (used by the Node bridge; silent, prints result) ----
if ($Get)        { Get-ApiKey    -Target $Target -Provider $Provider }
elseif ($Save)   { [void](Save-ApiKey -Target $Target -Provider $Provider -Secret $Secret); "stored" }
elseif ($Remove) { [void](Remove-ApiKey -Target $Target -Provider $Provider); "removed" }
