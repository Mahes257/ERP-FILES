# Daily preflight for the ERP backend/frontend.
#
# Read-only with respect to MySQL. It may create/complete erp-backend\.env
# (JWT secret only) but never prints a secret and never starts anything.
#
# Exit codes: 0 = ready, 1 = configuration/environment problem (message printed).

[CmdletBinding()]
param(
    [string]$EnvFile = '',
    [switch]$SkipDatabaseQuery
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'erp-config.ps1')

$root = Get-ErpRepoRoot -ScriptDir $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $root 'erp-backend\.env'
}

$exampleFile = Join-Path $root 'erp-backend\.env.example'

# ---------------------------------------------------------------- configuration
if (-not (Test-Path -LiteralPath $EnvFile)) {
    Write-ErpError "Backend configuration not found: $EnvFile" @(
        'Run setup.bat once (it creates the file and asks for your MySQL login),',
        "or copy $exampleFile to .env and fill in ERP_DATABASE_USERNAME / ERP_DATABASE_PASSWORD / ERP_JWT_SECRET."
    )
    exit 1
}

$settings = Read-ErpEnvFile -Path $EnvFile

# A missing JWT secret is generated once and stored in the local .env, so every
# installation signs tokens with its own key. The value is never printed.
if (-not $settings.ContainsKey('ERP_JWT_SECRET') -or [string]::IsNullOrWhiteSpace($settings['ERP_JWT_SECRET'])) {
    $secret = New-ErpJwtSecret
    Set-ErpEnvValue -Path $EnvFile -Key 'ERP_JWT_SECRET' -Value $secret
    $settings['ERP_JWT_SECRET'] = $secret
    Write-ErpOk "Generated a new JWT signing secret in $EnvFile (value not shown; it stays on this machine)."
}

$dbUser = if ($settings.ContainsKey('ERP_DATABASE_USERNAME')) { $settings['ERP_DATABASE_USERNAME'] } else { '' }
$dbPass = if ($settings.ContainsKey('ERP_DATABASE_PASSWORD')) { $settings['ERP_DATABASE_PASSWORD'] } else { '' }

$missingUser = [string]::IsNullOrWhiteSpace($dbUser)
$missingPass = [string]::IsNullOrWhiteSpace($dbPass)
$placeholderPass = (-not $missingPass) -and ($dbPass.StartsWith('change-me') -or $dbPass -eq '<password>')

if ($missingUser -or $missingPass -or $placeholderPass) {
    Write-ErpError "MySQL credentials are not configured in $EnvFile" @(
        'Set ERP_DATABASE_USERNAME and ERP_DATABASE_PASSWORD to the login that may read erp_db on THIS laptop.',
        'Run setup.bat to be prompted, or edit .env directly. The app never falls back to root or an empty password.'
    )
    exit 1
}

if ($settings.ContainsKey('ERP_PORT') -and $settings['ERP_PORT'] -and $settings['ERP_PORT'] -ne '8080') {
    Write-ErpWarn "ERP_PORT=$($settings['ERP_PORT']) is set in .env; start-all.bat, the Vite proxy and the docs all expect 8080. Change it back unless you also changed those."
}

$db = Get-ErpDbSettings -Settings $settings
if ($settings.ContainsKey('ERP_DATABASE_URL') -and $settings['ERP_DATABASE_URL']) {
    $url = $settings['ERP_DATABASE_URL']
    if ($url -match 'createDatabaseIfNotExist') {
        Write-ErpWarn 'ERP_DATABASE_URL contains createDatabaseIfNotExist - remove it so the backend can never create a database.'
    }
    $parsed = [regex]::Match($url, '^jdbc:mysql://(?<host>[^:/?]+)(?::(?<port>\d+))?/(?<db>[^?;]+)')
    if ($parsed.Success) {
        $db = [pscustomobject]@{
            Host = $parsed.Groups['host'].Value
            Port = if ($parsed.Groups['port'].Success) { [int]$parsed.Groups['port'].Value } else { 3306 }
            Name = $parsed.Groups['db'].Value
        }
    }
}

# --------------------------------------------------------------------- MySQL
if (-not (Test-ErpTcpPort -HostName $db.Host -Port $db.Port)) {
    Write-ErpError "MySQL is not reachable at $($db.Host):$($db.Port)." @(
        'Start the MySQL service (services.msc -> MySQL80, or: net start MySQL80).',
        "If MySQL runs on another host or port, set ERP_DATABASE_HOST / ERP_DATABASE_PORT in $EnvFile.",
        'Do not move the ERP to different ports to work around this: 8080 and 5173 are fixed.'
    )
    exit 1
}
Write-ErpOk "MySQL answers at $($db.Host):$($db.Port)."

$mysql = Find-MySqlClient
if ($mysql -and -not $SkipDatabaseQuery) {
    $query = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$($db.Name)';"
    $result = Invoke-MySqlScalar -MySqlExe $mysql -HostName $db.Host -Port $db.Port -User $dbUser -Password $dbPass -Sql $query
    if ($result.ExitCode -ne 0) {
        $detail = ($result.Output -split "`n" | Where-Object { $_ -match '\S' } | Select-Object -First 1)
        Write-ErpError "MySQL rejected the login or the query: $detail" @(
            "Check ERP_DATABASE_USERNAME / ERP_DATABASE_PASSWORD in $EnvFile (the password is not shown).",
            "The database name is '$($db.Name)'; this project never creates or re-initialises it.",
            'Run setup.bat to enter the credentials again.'
        )
        exit 1
    }
    $tables = 0
    [void][int]::TryParse($result.Output, [ref]$tables)
    if ($tables -le 0) {
        Write-ErpError "Database '$($db.Name)' exists but has no tables on $($db.Host):$($db.Port)." @(
            'This project will not create the schema for you on an existing-data laptop.',
            'Restore the backup of erp_db, or follow docs/database-deployment.md section 3 for a deliberate fresh setup.'
        )
        exit 1
    }
    Write-ErpOk "Database '$($db.Name)' is present with $tables tables (read-only check; nothing was changed)."
} else {
    Write-ErpWarn 'mysql.exe was not found, so the database itself was not checked - the backend will verify the login and schema when it starts.'
}

# --------------------------------------------------------------------- ports
function Test-ErpPortOwned {
    param([int]$Port, [string]$Path, [string]$What)
    # "localhost" covers both IPv4 and IPv6 loopback (Vite may bind ::1 only).
    if (-not (Test-ErpTcpPort -HostName 'localhost' -Port $Port)) { return }
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port$Path" -UseBasicParsing -TimeoutSec 3
        Write-ErpOk "$What already answers on port $Port (it will be reused, not started twice)."
    } catch {
        Write-ErpError "Port $Port is in use by another program ($What is fixed to this port)." @(
            "Identify it:  netstat -ano | findstr :$Port",
            'Inspect the PID:  tasklist /FI "PID eq <pid>"',
            'Stop it only if it is not the ERP:  taskkill /PID <pid> /F'
        )
        exit 1
    }
}

Test-ErpPortOwned -Port 8080 -Path '/v1/actuator/health' -What 'The ERP backend'
Test-ErpPortOwned -Port 5173 -Path '/' -What 'The ERP frontend'

exit 0
