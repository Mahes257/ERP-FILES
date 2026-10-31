#!/bin/bash
# ============================================================
#   Vishak ERP - Full Stack Startup (Bash)
# ============================================================
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
ERP_BACKEND="$ROOT/erp-backend"
ERP_HEALTH_URL="http://localhost:8080/v1/actuator/health"

echo ""
echo "============================================================"
echo "  Vishak ERP - Full Stack Startup"
echo "============================================================"
echo ""
echo "  This script starts:"
echo "    1. MySQL            (port 3306)"
echo "    2. ERP Backend      (Spring Boot - port 8080)"
echo "    3. CAD Worker       (isolated JVM - no port)"
echo "    4. ERP Frontend     (Vite dev server - port 5173)"
echo ""
echo "  The CAD conversion worker is the same artifact in worker mode"
echo "  (--erp.cad.worker.mode=true). It binds no port, so it is invisible"
echo "  from the network: coordinate with the ERP only through the shared"
echo "  database queue. Started here so no manual second terminal is needed -"
echo "  see erp-backend/docs/cad-conversion-deployment.md."
echo ""
echo "  Production is part of the integrated ERP backend and is"
echo "  served on port 8080 together with Marketing, Sales, CRM,"
echo "  CPR, Purchase, Engineering Design and the rest of the ERP."
echo ""

# --- The CAD worker binds no port, so its own process is the only local
# --- evidence that it is already up. Only a JVM can be the worker: matching
# --- the marker against every process would also match the shell/powershell
# --- performing the search (a `bash -c` wrapper carries the marker in its own
# --- command line). pgrep where available (Linux/macOS); the native java.exe
# --- list on Windows, where MSYS ps cannot see native processes.
cad_worker_running() {
    if command -v pgrep &> /dev/null; then
        pgrep -f 'erp\.cad\.worker\.mode=true' &> /dev/null
        return $?
    fi
    if command -v powershell &> /dev/null; then
        powershell -NoProfile -Command "\$me = \$PID; if (Get-CimInstance Win32_Process | Where-Object { \$_.Name -eq 'java.exe' -and \$_.ProcessId -ne \$me -and \$_.CommandLine -like '*erp.cad.worker.mode=true*' }) { exit 0 } else { exit 1 }" &> /dev/null
        return $?
    fi
    return 1
}

# --- Check MySQL ---
echo "[1/6] Checking MySQL..."
if ! netstat -tlnp 2>/dev/null | grep -q ':3306' && ! ss -tlnp 2>/dev/null | grep -q ':3306'; then
    echo "[WARN] MySQL may not be running on port 3306."
    echo "       Please ensure MySQL is started."
else
    echo "[OK] MySQL is running."
fi
echo ""

# --- Check Java ---
echo "[2/6] Checking Java..."
if ! command -v java &> /dev/null; then
    echo "[ERROR] Java is not available."
    exit 1
fi
echo "[OK] Java $(java -version 2>&1 | head -1)"
echo ""

# --- Check Node ---
echo "[3/6] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not available."
    exit 1
fi
echo "[OK] Node.js $(node --version)"
echo ""

# --- Start ERP Backend (the ONLY backend; Production included) ---
echo "[4/6] Starting ERP Backend on port 8080..."
if ! (ss -tlnp 2>/dev/null | grep -q ':8080' || netstat -tlnp 2>/dev/null | grep -q ':8080'); then
    cd "$ERP_BACKEND"
    ./mvnw spring-boot:run &>/dev/null &
    echo "[OK] ERP backend starting (PID: $!)..."
    cd "$ROOT"
else
    echo "[SKIP] ERP backend already running on port 8080."
fi
echo ""

# --- Wait for the ERP backend to be healthy ---
echo "Waiting for the ERP backend to report healthy (up to 120 seconds)..."
ERP_OK=0
for i in $(seq 1 60); do
    if curl -s --max-time 3 -f "$ERP_HEALTH_URL" 2>/dev/null | grep -qi 'UP'; then
        ERP_OK=1
        break
    fi
    sleep 2
done
if [ "$ERP_OK" -eq 1 ]; then
    echo "[OK] ERP backend is ready and healthy: $ERP_HEALTH_URL"
else
    echo "[WARN] ERP backend did not report healthy within 120 seconds."
    echo "       Check the backend log for errors."
    echo "       If port 8080 is taken by another process, identify it with:"
    echo "         ss -tlnp | grep :8080   (or: lsof -i :8080)"
    echo "       and stop it only when it is not this ERP:"
    echo "         kill <pid>"
    echo "       Continuing anyway..."
fi
echo ""

# --- Start CAD Conversion Worker (separate JVM, no port) ---
# The worker is started here — and NOT as part of the ERP JVM — so a slow or
# crashing CAD engine can never block ERP request threads. It is skipped when
# one is already running on this host: two workers with the same worker id
# would contend for the same heartbeat row, and the deployment guide specifies
# exactly one worker per host.
echo "[5/6] Starting CAD conversion worker..."
if cad_worker_running; then
    echo "[SKIP] CAD conversion worker already running on this host."
else
    (cd "$ERP_BACKEND" && ./mvnw spring-boot:run \
        -Dspring-boot.run.arguments=--erp.cad.worker.mode=true &>/dev/null &)
    echo "[OK] CAD conversion worker starting (same artifact, worker mode, no port)..."
    # Give it a moment so a startup failure (missing DB, bad engine config) is
    # not silently swallowed by the frontend taking over the terminal.
    sleep 5
    if cad_worker_running; then
        echo "[OK] CAD conversion worker process is up (heartbeat: GET /v1/cad-conversion/health)."
    else
        echo "[WARN] CAD conversion worker did not stay up."
        echo "       Run it in its own terminal to see the log:"
        echo "         cd erp-backend && ERP_CAD_WORKER_MODE=true ./mvnw spring-boot:run"
    fi
fi
echo ""

# --- Start Frontend ---
echo "============================================================"
echo "  All services:"
echo "    - MySQL:       http://localhost:3306"
echo "    - ERP Backend: http://localhost:8080"
echo "      (Marketing, Sales, CRM, CPR, Purchase, Production,"
echo "       Engineering Design and other ERP modules)"
echo "    - CAD Worker:  no port (isolated JVM; see"
echo "       erp-backend/docs/cad-conversion-deployment.md)"
echo "    - ERP Frontend: http://localhost:5173"
echo "============================================================"
echo ""

# The dev server is pinned to 5173 (strictPort in vite.config.js), so a busy
# port is a hard error instead of a silent move to another port.
if (ss -tln 2>/dev/null || netstat -tln 2>/dev/null) | grep -q ":5173"; then
    echo "[ERROR] Port 5173 is already in use. The frontend is fixed to 5173."
    echo "        Identify: ss -tlnp | grep :5173   (or: lsof -i :5173)"
    echo "        Stop it:  kill <pid>"
    exit 1
fi
npm run dev
