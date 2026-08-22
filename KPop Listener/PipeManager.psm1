<#=====================================================================
  PipeManager.psm1
  • List every named pipe + owner processes
  • Kill owners (with confirmation)
  • GUI launches automatically when the file is executed directly
=====================================================================#>

# -------------------------------------------------
#  INTERNAL HELPERS (not exported)
# -------------------------------------------------
function Get-PipeData {
    $pipeNames = [System.IO.Directory]::GetFiles('\\.\pipe\')
    $lookup = @{}
    $handles = Get-CimInstance Win32_ProcessHandle -Filter "HandleType='File' AND Name LIKE '%pipe%'" -ErrorAction SilentlyContinue
    foreach ($h in $handles) {
        $name = $h.Name -replace '^.*(\\\\.\\pipe\\[^\\]+).*$','$1'
        if ($pipeNames -contains $name) {
            $pid = $h.ProcessId
            if (-not $lookup.ContainsKey($name)) { $lookup[$name] = @() }
            $lookup[$name] += $pid
        }
    }

    foreach ($full in $pipeNames) {
        $short = ($full -split '\\')[-1]
        $pids  = $lookup[$full] | Sort-Object -Unique
        $procs = foreach ($p in $pids) {
            try { Get-Process -Id $p -ErrorAction Stop | Select-Object Id,Name,Path }
            catch { [pscustomobject]@{Id=$p; Name='<Orphaned>'; Path=$null} }
        }
        [pscustomobject]@{
            PipeName   = $short
            FullPath   = $full
            OwnerPIDs  = $pids
            Owners     = $procs
            OwnerCount = $pids.Count
        }
    }
}

# -------------------------------------------------
#  PUBLIC FUNCTIONS (exported)
# -------------------------------------------------
function Get-NamedPipe {
    Get-PipeData | Sort-Object PipeName
}
function Stop-PipeOwner {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$PipeName,
        [switch]$Force
    )
    $matches = Get-NamedPipe | Where-Object PipeName -like $PipeName
    if (-not $matches) { Write-Warning "No pipe matching '$PipeName'." ; return }

    foreach ($pipe in $matches) {
        foreach ($pid in $pipe.OwnerPIDs) {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            $msg = "Kill $($proc.ProcessName) (PID $pid) owning pipe '$($pipe.PipeName')?"
            if ($Force -or $PSCmdlet.ShouldProcess($proc.ProcessName, $msg)) {
                try {
                    Stop-Process -Id $pid -Force -ErrorAction Stop
                    Write-Host "Killed PID $pid – pipe will disappear." -ForegroundColor Green
                } catch { Write-Error $_ }
            }
        }
    }
}

# -------------------------------------------------
#  GUI (runs only when the .psm1 is executed directly)
# -------------------------------------------------
if ($MyInvocation.MyCommand.Path -and $MyInvocation.InvocationName -eq $MyInvocation.MyCommand.Name) {
    # We are being *run* (not imported) → launch GUI
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    # ---------- Form ----------
    $form = [System.Windows.Forms.Form]@{
        Text          = 'Named Pipe Manager'
        Size          = [System.Drawing.Size]::new(920, 620)
        StartPosition = 'CenterScreen'
        Font          = [System.Drawing.Font]::new('Segoe UI', 9)
    }

    # ---------- DataGrid ----------
    $grid = [System.Windows.Forms.DataGridView]@{
        Dock          = 'Fill'
        AutoSizeColumnsMode = 'Fill'
        AllowUserToAddRows = $false
        ReadOnly      = $true
        SelectionMode = 'FullRowSelect'
        ColumnHeadersHeightSizeMode = 'AutoSize'
    }
    $form.Controls.Add($grid)

    # ---------- Buttons ----------
    $btnRefresh = [System.Windows.Forms.Button]@{
        Text   = 'Refresh'
        Dock   = 'Bottom'
        Height = 36
    }
    $btnKill = [System.Windows.Forms.Button]@{
        Text   = 'Kill Selected Owner(s)'
        Dock   = 'Bottom'
        Height = 36
        BackColor = [System.Drawing.Color]::IndianRed
        ForeColor = [System.Drawing.Color]::White
    }
    $btnClose = [System.Windows.Forms.Button]@{
        Text   = 'Close'
        Dock   = 'Bottom'
        Height = 36
    }

    $panel = [System.Windows.Forms.Panel]@{
        Dock = 'Bottom'
        Height = 42
    }
    $panel.Controls.AddRange(@($btnClose, $btnKill, $btnRefresh))
    $form.Controls.Add($panel)

    # ---------- Refresh Logic ----------
    function Update-Grid {
        $data = Get-NamedPipe
        $grid.DataSource = $null
        $grid.DataSource = [System.Collections.ArrayList]($data | ForEach-Object {
            [pscustomobject]@{
                Pipe      = $_.PipeName
                Owners    = ($_.Owners.Name -join ', ')
                PIDs      = ($_.OwnerPIDs -join ', ')
                Count     = $_.OwnerCount
            }
        })
        $grid.Columns['Pipe'].Width   = 180
        $grid.Columns['Owners'].Width = 260
        $grid.Columns['PIDs'].Width   = 120
        $grid.Columns['Count'].Width  = 60
    }

    $btnRefresh.Add_Click({ Update-Grid })
    $btnClose.Add_Click({ $form.Close() })

    # ---------- Kill Logic ----------
    $btnKill.Add_Click({
        $rows = $grid.SelectedRows
        if ($rows.Count -eq 0) { [System.Windows.Forms.MessageBox]::Show('Select one or more rows first.','No selection') ; return }

        $pipes = foreach ($r in $rows) { $r.Cells['Pipe'].Value }
        $msg = "Kill owner(s) of pipe(s):`n" + ($pipes -join "`n") + "`n`nContinue?"
        if ([System.Windows.Forms.MessageBox]::Show($msg,'Confirm Kill','YesNo','Warning') -eq 'Yes') {
            foreach ($p in $pipes) { Stop-PipeOwner -PipeName $p -Force }
            Start-Sleep -Milliseconds 600
            Update-Grid
        }
    })

    # ---------- Auto-refresh timer ----------
    $timer = [System.Windows.Forms.Timer]@{ Interval = 3000 ; Enabled = $true }
    $timer.Add_Tick({ Update-Grid })
    $form.Add_Shown({ Update-Grid })

    # ---------- Show ----------
    [System.Windows.Forms.Application]::Run($form)
    exit
}

# -------------------------------------------------
#  EXPORT PUBLIC API
# -------------------------------------------------
Export-ModuleMember -Function Get-NamedPipe, Stop-PipeOwner