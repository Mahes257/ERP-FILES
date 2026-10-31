# First-run setup for the ERP on Windows.
#
#   setup.bat                 interactive wizard (recommended first run)
#   setup.bat -CheckOnly      only inspect this laptop, change nothing
#   setup.bat -Force          reconfigure an existing erp-backend\.env
#   setup.bat -SkipInstall    skip the npm ci step
#
# It never creates, drops or migrates a database, never prints a password and
# never writes a secret anywhere except the local (git-ignored) .env file.

[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$Force,
    [switch]$SkipInstall,
    [switch]$SkipVerify,
    [string]$EnvFile = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'erp-config.ps1')

$root = Get-ErpRepoRoot -ScriptDir $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $root 'erp-backend\.env'
}
$envExample = Join-Path $root 'erp-backend\.env.example'
$problems = 0

# A double-clicked bat has a console (hidden typing works). When stdin is
# redirected (scripted run, CI), prompts read the pipe without echoing input.
$script:Interactive = -not [Console]::IsInputRedirected

function Read-ErpAnswer {
    param([string]$Prompt, [string]$Default)
    $label = if ([string]::IsNullOrWhiteSpace($Default)) { $Prompt } else { "$Prompt [$Default]" }
    if ($script:Interactive) {
        $answer = Read-Host $label
    } else {
        Write-Host "$label`:"
        $answer = [Console]::In.ReadLine()
        if ($null -eq $answer) { $answer = '' }
    }
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    return $answer
}

Write-Host ''
Write-Host '============================================================'
Write-Host '  Vishak ERP - first-run setup'
Write-Host '============================================================'
Write-Host ''

# ------------------------------------------------------------------ prerequisites
Write-Host '[1/5] Checking Java...'
$javaOk = $false
$javaCmd = Get-Command java.exe -ErrorAction SilentlyContinue
if (-not $javaCmd) {
    Write-ErpError 'Java is not on PATH.' @('Install JDK 21 (https://adoptium.net) and reopen this window.')
    $problems++
} else {
    # cmd /c merges stderr into stdout: Windows PowerShell 5.1 would otherwise
    # turn "java -version" output (written to stderr) into a terminating error.
    $javaLine = (cmd /c "java -version 2>&1" | Select-Object -First 1) -as [string]
    $match = [regex]::Match($javaLine, 'version "(?<major>\d+)')
    if ($match.Success) {
        $major = [int]$match.Groups['major'].Value
        if ($major -ge 21) {
            Write-ErpOk "Java $major detected."
            $javaOk = $true
        } else {
            Write-ErpError "Java $major is too old; the backend targets Java 21." @('Install JDK 21 and make sure it is first on PATH.')
            $problems++
        }
    } else {
        Write-ErpWarn "Could not read the Java version from: $javaLine"
    }
}

Write-Host '[2/5] Checking Node.js and npm...'
$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-ErpError 'Node.js is not on PATH.' @('Install Node.js 22 LTS (Vite needs >= 20.19) and reopen this window.')
    $problems++
} else {
    $nodeVersion = (& node --version) -as [string]
    $nodeMatch = [regex]::Match($nodeVersion, '^v(?<major>\d+)\.(?<minor>\d+)')
    if ($nodeMatch.Success) {
        $major = [int]$nodeMatch.Groups['major'].Value
        $minor = [int]$nodeMatch.Groups['minor'].Value
        if ($major -gt 20 -or ($major -eq 20 -and $minor -ge 19)) {
            Write-ErpOk "Node.js $nodeVersion detected."
        } else {
            Write-ErpError "Node.js $nodeVersion is too old; Vite 8 needs >= 20.19." @('Install Node.js 22 LTS.')
            $problems++
        }
    }
}
if (-not $npmCmd) {
    Write-ErpError 'npm was not found (it ships with Node.js).' @('Reinstall Node.js 22 LTS.')
    $problems++
} else {
    Write-ErpOk "npm $((& npm --version) -as [string]) detected."
}

if (-not (Test-Path -LiteralPath (Join-Path $root 'package-lock.json'))) {
    Write-ErpWarn 'package-lock.json is missing; npm ci will not be possible.'
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'erp-backend\mvnw.cmd'))) {
    Write-ErpError 'The Maven wrapper (erp-backend\mvnw.cmd) is missing from this copy.' @('Re-extract the project ZIP; the wrapper is required.')
    $problems++
}

# ------------------------------------------------------------------ configuration
Write-Host '[3/5] Checking existing configuration...'
$settings = Read-ErpEnvFile -Path $EnvFile
if (Test-Path -LiteralPath $EnvFile) {
    Write-ErpOk "Found $EnvFile (credentials are read from it; nothing is printed)."
} else {
    Write-ErpWarn "No $EnvFile yet - it will be created in this run."
}

$db = Get-ErpDbSettings -Settings $settings

# ------------------------------------------------------------------ MySQL
Write-Host "[4/5] Checking MySQL at $($db.Host):$($db.Port)..."
$mysqlReachable = Test-ErpTcpPort -HostName $db.Host -Port $db.Port
if (-not $mysqlReachable) {
    $mysqlHints = @(
        'Start the MySQL service: services.msc -> MySQL80 -> Start  (or: net start MySQL80).',
        'If MySQL listens on another port/host, answer the questions below with the right values.',
        'The ERP ports stay 8080 (backend) and 5173 (frontend); do not change them for this.'
    )
    if ($Force) {
        # Reconfiguring: the saved host may be the very thing being replaced.
        Write-ErpWarn "MySQL is not reachable at the saved target $($db.Host):$($db.Port); the new values you enter below will be used instead."
    } else {
        Write-ErpError "MySQL is not reachable at $($db.Host):$($db.Port)." $mysqlHints
        $problems++
    }
} else {
    Write-ErpOk 'MySQL accepts connections on that port.'
}
$mysql = Find-MySqlClient
if ($mysql) {
    Write-ErpOk "mysql client found: $mysql"
} else {
    Write-ErpWarn 'mysql.exe was not found; the login and the database will only be verified when the backend starts.'
}

# ------------------------------------------------------------------ check-only mode
if ($CheckOnly) {
    Write-Host ''
    Write-Host '[5/5] Check-only mode: nothing was written and nothing was started.'
    if (Test-Path -LiteralPath $EnvFile) {
        Write-ErpStep "Effective target: $($db.Host):$($db.Port)/$($db.Name)"
        if ($settings.ContainsKey('ERP_DATABASE_URL') -and $settings['ERP_DATABASE_URL']) {
            Write-ErpStep 'ERP_DATABASE_URL=set (full URL; overrides host/port/name)'
        }
        foreach ($key in @('ERP_DATABASE_HOST', 'ERP_DATABASE_PORT', 'ERP_DATABASE_NAME', 'ERP_DATABASE_USERNAME', 'ERP_DATABASE_PASSWORD', 'ERP_JWT_SECRET')) {
            $state = if ($settings.ContainsKey($key) -and $settings[$key]) { 'set' } else { 'not set' }
            Write-ErpStep "$key=$state"
        }
    }
    exit ($(if ($problems -eq 0) { 0 } else { 1 }))
}

if ($problems -gt 0) {
    Write-Host ''
    Write-ErpError 'Fix the problems above, then run setup.bat again.'
    exit 1
}

# ------------------------------------------------------------------ wizard
if ((Test-Path -LiteralPath $EnvFile) -and -not $Force) {
    Write-Host ''
    Write-ErpOk "Existing configuration kept: $EnvFile"
    Write-ErpStep 'Run setup.bat -Force to change the MySQL login or the database target.'
} else {
    Write-Host ''
    Write-Host '--- MySQL connection for THIS laptop ---'
    $defaultHost = $db.Host
    $defaultPort = $db.Port
    $defaultName = $db.Name
    $defaultUser = if ($settings.ContainsKey('ERP_DATABASE_USERNAME') -and $settings['ERP_DATABASE_USERNAME']) { $settings['ERP_DATABASE_USERNAME'] } else { 'erp_app' }

    $hostAnswer = Read-ErpAnswer -Prompt 'MySQL host' -Default $defaultHost
    $portAnswer = Read-ErpAnswer -Prompt 'MySQL port' -Default ([string]$defaultPort)
    $nameAnswer = Read-ErpAnswer -Prompt 'Database name' -Default $defaultName
    $userAnswer = Read-ErpAnswer -Prompt 'MySQL username' -Default $defaultUser

    [int]$portValue = 3306
    if (-not [int]::TryParse($portAnswer, [ref]$portValue) -or $portValue -le 0) {
        Write-ErpError "Invalid MySQL port: $portAnswer"
        exit 1
    }

    $password = ''
    $attempt = 0
    $verified = $false
    while ($attempt -lt 3 -and -not $verified) {
        $attempt++
        if (-not $script:Interactive) {
            # No console to hide the typing in (scripted run): read the line
            # without echoing it and never write it to output.
            Write-Host "MySQL password for '$userAnswer' (input is hidden):"
            $password = [Console]::In.ReadLine()
            if ($null -eq $password) { $password = '' }
        } else {
            $secure = Read-Host -AsSecureString "MySQL password for '$userAnswer' (input is hidden)"
            $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
            try {
                $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
            } finally {
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
            }
        }
        if ([string]::IsNullOrEmpty($password)) {
            Write-ErpWarn 'An empty password is not accepted; the backend never falls back to root or an empty password.'
            continue
        }
        if (-not $mysql -or $SkipVerify) { break }
        $query = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$nameAnswer';"
        $result = Invoke-MySqlScalar -MySqlExe $mysql -HostName $hostAnswer -Port $portValue -User $userAnswer -Password $password -Sql $query
        if ($result.ExitCode -eq 0) {
            [int]$tables = 0
            [void][int]::TryParse($result.Output, [ref]$tables)
            if ($tables -gt 0) {
                Write-ErpOk "Connected to '$nameAnswer' on $($hostAnswer):$portValue - $tables tables found (read-only check)."
                $verified = $true
            } else {
                Write-ErpError "Database '$nameAnswer' has no tables on this MySQL server." @(
                    'Restore your erp_db backup, or follow docs/database-deployment.md section 3 for a deliberate fresh setup.',
                    'This wizard never creates or initialises a database.'
                )
                exit 1
            }
        } else {
            $detail = ($result.Output -split "`n" | Where-Object { $_ -match '\S' } | Select-Object -First 1)
            Write-ErpWarn "Login/database check failed: $detail"
        }
    }
    if ($mysql -and -not $verified -and -not $SkipVerify) {
        Write-ErpError 'Could not verify the MySQL login after 3 attempts; nothing was written.' @(
            'Check the username, the password and the database name, then run setup.bat again.',
            'If this laptop has no erp_db yet, restore a backup or read docs/database-deployment.md first.'
        )
        exit 1
    }
    if ([string]::IsNullOrEmpty($password)) {
        Write-ErpError 'No MySQL password was entered; nothing was written.' @(
            'An empty password is never accepted (there is no fallback to root or an empty login).',
            'Run setup.bat again and enter the password for the MySQL user you named.'
        )
        exit 1
    }

    if (-not (Test-Path -LiteralPath $EnvFile)) {
        $header = @(
            '# Local configuration for this laptop. Git-ignored; never commit or share it.',
            '# Created by setup.bat. Spring Boot reads this file automatically.'
        )
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllLines($EnvFile, $header, $utf8NoBom)
    }

    Set-ErpEnvValue -Path $EnvFile -Key 'ERP_PORT' -Value '8080'
    Set-ErpEnvValue -Path $EnvFile -Key 'ERP_BASE_URL' -Value 'http://localhost:8080'
    Set-ErpEnvValue -Path $EnvFile -Key 'ERP_DATABASE_HOST' -Value $hostAnswer
    Set-ErpEnvValue -Path $EnvFile -Key 'ERP_DATABASE_PORT' -Value ([string]$portValue)
    Set-ErpEnvValue -Path $EnvFile -Key 'ERP_DATABASE_NAME' -Value $nameAnswer
    Set-ErpEnvValue -Path $EnvFile -Key 'ERP_DATABASE_USERNAME' -Value $userAnswer
    Set-ErpEnvValue -Path $EnvFile -Key 'ERP_DATABASE_PASSWORD' -Value $password
    # Drop a stale full-URL override so host/port/name above are the source of truth.
    $settings = Read-ErpEnvFile -Path $EnvFile
    if ($settings.ContainsKey('ERP_DATABASE_URL') -and $settings['ERP_DATABASE_URL']) {
        Write-ErpWarn 'ERP_DATABASE_URL is also set; it overrides host/port/name. Remove that line if you want the values above to apply.'
    }
    $password = $null
    Write-ErpOk "Wrote MySQL settings to $EnvFile (password not displayed)."
}

# ------------------------------------------------------------------ JWT secret
$settings = Read-ErpEnvFile -Path $EnvFile
if (-not $settings.ContainsKey('ERP_JWT_SECRET') -or [string]::IsNullOrWhiteSpace($settings['ERP_JWT_SECRET'])) {
    Set-ErpEnvValue -Path $EnvFile -Key 'ERP_JWT_SECRET' -Value (New-ErpJwtSecret)
    Write-ErpOk 'Generated a new JWT signing secret for this installation (stored in .env, never printed).'
} else {
    Write-ErpOk 'Existing JWT signing secret kept.'
}

# ------------------------------------------------------------------ frontend env
$rootEnv = Join-Path $root '.env'
if (Test-Path -LiteralPath $rootEnv) {
    Write-ErpOk 'Frontend .env already exists; left unchanged.'
} elseif (Test-Path -LiteralPath (Join-Path $root '.env.example')) {
    Copy-Item -LiteralPath (Join-Path $root '.env.example') -Destination $rootEnv
    Write-ErpOk 'Created the frontend .env from .env.example (relative /v1 API, proxy to 8080).'
}

# ------------------------------------------------------------------ dependencies
Write-Host '[5/5] Checking installed dependencies...'
$nodeModules = Join-Path $root 'node_modules'
if ($SkipInstall) {
    Write-ErpWarn 'Install step skipped (-SkipInstall).'
} elseif (Test-Path -LiteralPath $nodeModules) {
    Write-ErpOk 'node_modules is present (run "npm ci" yourself after a lockfile change).'
} else {
    Write-ErpStep 'Installing frontend dependencies with npm ci (this can take a few minutes)...'
    Push-Location $root
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & npm ci
        $npmExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
        Pop-Location
    }
    if ($npmExit -ne 0) {
        Write-ErpError 'npm ci failed.' @('Check your network/proxy, then run "npm ci" in the project folder.')
        exit 1
    }
    Write-ErpOk 'Frontend dependencies installed.'
}
Write-ErpStep 'Backend dependencies download on the first "mvnw.cmd spring-boot:run" (Maven wrapper is included).'

Write-Host ''
Write-Host '============================================================'
Write-Host '  Setup complete'
Write-Host '  Daily start:  start-all.bat'
Write-Host '  App:          http://localhost:5173   (backend: 8080)'
Write-Host '  Re-run this wizard any time with:  setup.bat -Force'
Write-Host '============================================================'
Write-Host ''
exit 0
