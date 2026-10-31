@echo off
REM Frontend-only development server (Vite).
REM For the full stack (MySQL + backend + CAD worker + frontend), use start-all.bat.
setlocal
cd /d "%~dp0"
REM The Vite dev server is pinned to port 5173 (strictPort) in vite.config.js.
npm run dev
