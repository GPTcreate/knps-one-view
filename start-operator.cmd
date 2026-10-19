@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
  py -3 prepare_operator.py
) else (
  python prepare_operator.py
)
pause
