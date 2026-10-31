@echo off
setlocal EnableDelayedExpansion

echo.
echo ============================================================
echo   Vishak ERP - Full Stack Startup
echo ============================================================
echo.
echo   This script starts:
echo     1. MySQL            (port 3306)
echo     2. ERP Backend      (Spring Boot - port 8080)
echo     3. CAD Worker       (isolated JVM - no port)
echo     4. ERP Frontend     (Vite dev server - port 5173)
echo.
echo   The CAD conversion worker is the same artifact in worker mode
echo   (--erp.cad.worker.mode=true). It binds no port, so it is invisible
echo   from the network: it coordinates with the ERP only through the
echo   shared database queue. Started here so no manual second window is
echo   needed - see erp-backend/docs/cad-conversion-deployment.md.
echo.
echo   Production is part of the integrated ERP backend and is
echo   served on port 8080 together with Marketing, Sales, CRM,
echo   CPR, Purchase, Engineering Design and the rest of the ERP.
echo.

set "ROOT=%~dp0"
set "ERP_BACKEND=%ROOT%erp-backend"
set "ERP_HEALTH_URL=http://localhost:8080/v1/actuator/health"

REM ============================================================
REM  CHECK: configuration + MySQL
REM ============================================================
echo [1/6] Checking configuration and MySQL...
REM Reads erp-backend\.env, provisions a JWT secret if one is missing, checks
REM the configured MySQL host/port and verifies erp_db read-only. A missing or
REM unusable configuration is reported in plain words before anything starts.
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\preflight.ps1"
if errorlevel 1 (
    echo.
    echo [ERROR] Preflight failed. Fix the problem above, then run this file again.
    echo         First run on this laptop? Run setup.bat once.
    exit /b 1
)
echo.

REM ============================================================
REM  CHECK: Java
REM ============================================================
echo [2/6] Checking Java...
where java >NUL 2>&1
if errorlevel 1 (
    echo [ERROR] Java is not available in PATH.
    echo         Please install Java 21+ and add to PATH.
    exit /b 1
)
for /f "tokens=3" %%v in ('java -version 2^>^&1 ^| findstr /i "version"') do set "JAVA_VER=%%v"
echo [OK] Java %JAVA_VER%
echo.

REM ============================================================
REM  CHECK: Node.js
REM ============================================================
echo [3/6] Checking Node.js...
where node >NUL 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not available in PATH.
    exit /b 1
)
for /f %%v in ('node --version') do set "NODE_VER=%%v"
echo [OK] Node.js %NODE_VER%
echo.

REM ============================================================
REM  START: ERP Backend (port 8080)
REM ============================================================
echo [4/6] Starting ERP Backend on port 8080...
if not exist "%ERP_BACKEND%" (
    echo [ERROR] ERP backend directory not found: %ERP_BACKEND%
    exit /b 1
)

REM Check if already running
netstat -ano 2>NUL | findstr ":8080" | findstr "LISTENING" >NUL 2>&1
if not errorlevel 1 (
    echo [SKIP] ERP backend already running on port 8080.
) else (
    start "ERP-Backend" cmd /c "cd /d %ERP_BACKEND% && call mvnw.cmd spring-boot:run"
    echo [OK] ERP backend starting in background window...
)
echo.

REM ============================================================
REM  WAIT for the ERP backend to be healthy
REM ============================================================
echo Waiting for the ERP backend to report healthy (up to 120 seconds)...
set "WAIT_COUNT=0"

:wait_loop
if !WAIT_COUNT! GEQ 120 goto wait_timeout

call :backend_healthy
if "!HEALTHY!"=="1" (
    echo [OK] ERP backend is ready and healthy: %ERP_HEALTH_URL%
    goto wait_done
)

REM ping-based sleep: works with stdin redirected (timeout does not).
ping -n 3 127.0.0.1 >NUL 2>&1
set /a WAIT_COUNT+=2
goto wait_loop

:wait_timeout
echo [WARN] ERP backend did not report healthy within !WAIT_COUNT! seconds.
echo         Check the ERP-Backend window for errors.
echo         If port 8080 is already taken by a different process, identify it with:
echo             netstat -ano ^| findstr :8080
echo         and stop it only when it is not this ERP:
echo             taskkill /PID ^<pid^> /F
echo         Continuing anyway...
:wait_done
echo.

REM ============================================================
REM  START: CAD Conversion Worker (separate JVM, no port)
REM  The same artifact in worker mode, so a heavy CAD engine can
REM  never block ERP request threads. Skipped when one is already
REM  running on this host (the guide specifies one worker per host).
REM ============================================================
echo [5/6] Starting CAD conversion worker...
call :cad_worker_running
if "!CAD_WORKER_RUNNING!"=="1" (
    echo [SKIP] CAD conversion worker already running on this host.
) else (
    start "ERP-CAD-Worker" cmd /c "cd /d %ERP_BACKEND% && call mvnw.cmd spring-boot:run -Dspring-boot.run.arguments=--erp.cad.worker.mode=true"
    echo [OK] CAD conversion worker starting (same artifact, worker mode, no port)...
    REM Give it a moment so a startup failure (missing DB, bad engine
    REM config) is not silently swallowed by the frontend taking over.
    ping -n 7 127.0.0.1 >NUL 2>&1
    call :cad_worker_running
    if "!CAD_WORKER_RUNNING!"=="1" (
        echo [OK] CAD conversion worker process is up ^(heartbeat: GET /v1/cad-conversion/health^).
    ) else (
        echo [WARN] CAD conversion worker did not stay up.
        echo        Run it in its own window to see the log:
        echo          cd erp-backend ^&^& set ERP_CAD_WORKER_MODE=true ^&^& call mvnw.cmd spring-boot:run
    )
)
echo.

REM ============================================================
REM  START: ERP Frontend (Vite dev server)
REM ============================================================
echo [6/6] Starting ERP Frontend (Vite)...
echo.
echo ============================================================
echo   All services:
echo     - MySQL:       http://localhost:3306
echo     - ERP Backend: http://localhost:8080
echo       (Marketing, Sales, CRM, CPR, Purchase, Production,
echo        Engineering Design and other ERP modules)
echo     - CAD Worker:  no port (isolated JVM; see
echo        erp-backend/docs/cad-conversion-deployment.md)
echo     - ERP Frontend: http://localhost:5173
echo.
echo   To stop all services, close this window plus the backend and
echo   CAD-Worker windows.
echo ============================================================
echo.

REM The dev server is pinned to 5173 (strictPort in vite.config.js), so a busy
REM port is a hard error here instead of a silent move to another port.
netstat -ano 2>NUL | findstr ":5173" | findstr "LISTENING" >NUL 2>&1
if not errorlevel 1 (
    REM Something owns 5173. If it is this ERP's own dev server, reuse it
    REM instead of failing or starting a second copy.
    powershell -NoProfile -Command "$isErp = $false; try { $r = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 3; if ($r.Content -match 'VISHAK TECH') { $isErp = $true } } catch {}; if ($isErp) { exit 0 } else { exit 1 }"
    if not errorlevel 1 (
        echo [SKIP] ERP frontend already running on http://localhost:5173 - not starting another one.
        exit /b 0
    )
    echo [ERROR] Port 5173 is already in use by another program. The frontend is fixed to 5173.
    for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do echo         PID: %%p
    echo         Identify: netstat -ano ^| findstr :5173
    echo         Stop it:  taskkill /PID ^<pid^> /F
    exit /b 1
)
npm run dev

echo.
echo ============================================================
echo   ERP Frontend stopped.
echo   Backend window may still be running.
echo ============================================================

goto :eof

REM ============================================================
REM  HELPER: cad_worker_running -> sets CAD_WORKER_RUNNING to 1
REM  when a CAD worker JVM (--erp.cad.worker.mode=true) is
REM  already running on this host. The worker binds no port, so
REM  its process is the only local evidence; the native process
REM  list is read through PowerShell. Only java.exe is considered: the
REM  marker also appears in the command line of this very search.
REM ============================================================
:cad_worker_running
set "CAD_WORKER_RUNNING=0"
where powershell >NUL 2>&1
if errorlevel 1 goto :eof
powershell -NoProfile -Command "$me = $PID; if (Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'java.exe' -and $_.ProcessId -ne $me -and $_.CommandLine -like '*erp.cad.worker.mode=true*' }) { exit 0 } else { exit 1 }" >NUL 2>&1
if not errorlevel 1 set "CAD_WORKER_RUNNING=1"
goto :eof

REM ============================================================
REM  HELPER: backend_healthy -> sets HEALTHY to 1 when the ERP
REM  backend's existing health endpoint reports "UP".
REM  curl / PowerShell are tried first; the listening socket is
REM  only a last resort when no HTTP client is available.
REM ============================================================
:backend_healthy
set "HEALTHY=0"

where curl >NUL 2>&1
if not errorlevel 1 goto check_with_curl

where powershell >NUL 2>&1
if not errorlevel 1 goto check_with_powershell

goto check_with_socket

:check_with_curl
curl -s --max-time 3 -f "%ERP_HEALTH_URL%" 2>NUL | findstr /i /c:"UP" >NUL 2>&1
if not errorlevel 1 set "HEALTHY=1"
goto :eof

:check_with_powershell
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 '%ERP_HEALTH_URL%'; if ($r.Content -match 'UP') { exit 0 } } catch {} ; exit 1" >NUL 2>&1
if not errorlevel 1 set "HEALTHY=1"
goto :eof

:check_with_socket
netstat -ano 2>NUL | findstr ":8080" | findstr "LISTENING" >NUL 2>&1
if not errorlevel 1 set "HEALTHY=1"
goto :eof
