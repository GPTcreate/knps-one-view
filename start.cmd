@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
  py -3 launcher.py
) else (
  python launcher.py
)
if errorlevel 1 pause
