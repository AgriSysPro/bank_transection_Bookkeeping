@echo off
echo ========================================================
echo   Starting BookKeeper Local Server on Port 8123...
echo ========================================================
echo.
echo Opening http://localhost:8123 in your browser...
start http://localhost:8123/
powershell -NoProfile -ExecutionPolicy Bypass -File .claude\static-server.ps1 -Port 8123 -Root .
pause
