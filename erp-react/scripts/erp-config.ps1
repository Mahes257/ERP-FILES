# Shared helpers for the ERP Windows setup/preflight scripts.
# Dot-source this file; nothing here writes to the database or prints secrets.
#
# .env format: KEY=VALUE lines, comments start with '#'. The same file is read by
# Spring Boot (spring.config.import=optional:file:.env[.properties]).

function Get-ErpRepoRoot {
    param([Parameter(Mandatory = $true)][string]$ScriptDir)
    return (Resolve-Path -LiteralPath (Join-Path $ScriptDir '..')).Path
}

function Read-ErpEnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $values }
    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        $trim = $line.Trim()
        if ($trim.Length -eq 0) { continue }
        if ($trim.StartsWith('#')) { continue }
        $idx = $trim.IndexOf('=')
        if ($idx -lt 1) { continue }
        $key = $trim.Substring(0, $idx).Trim()
        $value = $trim.Substring($idx + 1).Trim()
        if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        # Spring reads this file with java.util.Properties, where a backslash
        # escapes the next character. Set-ErpEnvValue doubles them, so undo that
        # here to hand MySQL the real value.
        $value = $value.Replace('\\', '\')
        $values[$key] = $value
    }
    return $values
}

function Set-ErpEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value
    )
    $lines = @()
    if (Test-Path -LiteralPath $Path) {
        $lines = @([System.IO.File]::ReadAllLines($Path))
    }
    $pattern = '^\s*' + [regex]::Escape($Key) + '\s*='
    # Properties-escape backslashes so values survive java.util.Properties
    # parsing (Spring reads .env that way).
    $escaped = $Value.Replace('\', '\\')
    $replaced = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $pattern) {
            $lines[$i] = "$Key=$escaped"
            $replaced = $true
        }
    }
    if (-not $replaced) { $lines += "$Key=$escaped" }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($Path, $lines, $utf8NoBom)
}

function New-ErpJwtSecret {
    # 48 random bytes -> 64 Base64 chars: a valid HMAC key well above 256 bits.
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

function Test-ErpTcpPort {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port,
        [int]$TimeoutMs = 3000
    )
    # A plain TcpClient is IPv4-only, while Vite may listen on ::1 only, so try
    # both families before declaring a port closed.
    foreach ($family in @([System.Net.Sockets.AddressFamily]::InterNetwork, [System.Net.Sockets.AddressFamily]::InterNetworkV6)) {
        $client = $null
        try {
            $client = New-Object -TypeName System.Net.Sockets.TcpClient -ArgumentList $family
            $task = $client.ConnectAsync($HostName, $Port)
            if ($task.Wait($TimeoutMs) -and $client.Connected) { return $true }
        } catch {
            # try the next address family
        } finally {
            if ($client) { $client.Close() }
        }
    }
    return $false
}

function Find-MySqlClient {
    $cmd = Get-Command mysql.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidates = @()
    foreach ($root in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ([string]::IsNullOrWhiteSpace($root)) { continue }
        $mysqlRoot = Join-Path $root 'MySQL'
        if (-not (Test-Path -LiteralPath $mysqlRoot)) { continue }
        foreach ($dir in Get-ChildItem -LiteralPath $mysqlRoot -Directory -ErrorAction SilentlyContinue) {
            $exe = Join-Path $dir.FullName 'bin\mysql.exe'
            if (Test-Path -LiteralPath $exe) { $candidates += $exe }
        }
    }
    if ($candidates.Count -eq 0) { return $null }
    return ($candidates | Sort-Object -Property { (Get-Item -LiteralPath $_).LastWriteTime } | Select-Object -Last 1)
}

function Invoke-MySqlScalar {
    # Runs a read-only query. The password travels through a temporary client
    # option file (deleted immediately), never through the process arguments.
    param(
        [Parameter(Mandatory = $true)][string]$MySqlExe,
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$User,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Password,
        [string]$Database = '',
        [Parameter(Mandatory = $true)][string]$Sql
    )
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        $content = "[client]`r`nuser=$User`r`npassword=$Password`r`nhost=$HostName`r`nport=$Port`r`n"
        [System.IO.File]::WriteAllText($tmp, $content, (New-Object System.Text.UTF8Encoding($false)))
        $arguments = @("--defaults-extra-file=$tmp", '--batch', '--skip-column-names', '-e', $Sql)
        if (-not [string]::IsNullOrWhiteSpace($Database)) { $arguments += $Database }
        # Windows PowerShell 5.1 turns a native command's stderr into a
        # terminating error when $ErrorActionPreference is Stop, so relax it
        # around the call and report through the exit code instead.
        $previousPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $output = & $MySqlExe @arguments 2>&1
            $exitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousPreference
        }
        return [pscustomobject]@{
            ExitCode = $exitCode
            Output   = (($output | ForEach-Object { [string]$_ }) -join "`n").Trim()
        }
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

function Get-ErpDbSettings {
    param([Parameter(Mandatory = $true)][hashtable]$Settings)
    $hostName = if ($Settings.ContainsKey('ERP_DATABASE_HOST') -and $Settings['ERP_DATABASE_HOST']) { $Settings['ERP_DATABASE_HOST'] } else { 'localhost' }
    $port = 3306
    if ($Settings.ContainsKey('ERP_DATABASE_PORT') -and $Settings['ERP_DATABASE_PORT']) {
        [int]$parsed = 0
        if ([int]::TryParse($Settings['ERP_DATABASE_PORT'], [ref]$parsed) -and $parsed -gt 0) { $port = $parsed }
    }
    $name = if ($Settings.ContainsKey('ERP_DATABASE_NAME') -and $Settings['ERP_DATABASE_NAME']) { $Settings['ERP_DATABASE_NAME'] } else { 'erp_db' }
    return [pscustomobject]@{ Host = $hostName; Port = $port; Name = $name }
}

function Write-ErpStep {
    param([string]$Message)
    Write-Host "  $Message"
}

function Write-ErpOk {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-ErpWarn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-ErpError {
    param([string]$Message, [string[]]$Hints = @())
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    foreach ($hint in $Hints) { Write-Host "        $hint" -ForegroundColor Red }
}
