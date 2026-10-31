@echo off
REM ============================================================
REM  Vishak ERP - first-run setup (Windows)
REM
REM  Double-click this file, or run it from cmd.exe:
REM      setup.bat                 interactive setup
REM      setup.bat -CheckOnly      inspect this laptop, change nothing
REM      setup.bat -Force          reconfigure the MySQL login
REM      setup.bat -SkipInstall    skip "npm ci"
REM      setup.bat -SkipVerify     write .env without the read-only DB login check
REM                                (advanced: MySQL not reachable yet)
REM
REM  It never creates, drops or migrates a database and never prints a
REM  password. Configuration is written to the git-ignored erp-backend\.env.
REM ============================================================
setlocal
cd /d "%~dp0"

where powershell >NUL 2>&1
if errorlevel 1 (
    echo [ERROR] Windows PowerShell was not found. It ships with Windows 10/11;
    echo         run this from a machine where "powershell" works.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1" %*
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" (
    echo [ERROR] Setup did not complete - read the messages above.
) else (
    echo Next step: start-all.bat
)
echo.
pause
exit /b %RC%
