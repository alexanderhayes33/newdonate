@echo off
title Restart Node Server
echo Checking for existing node server.js process...

REM ค้นหา PID ของ node ที่รัน server.js
for /f "tokens=2 delims=," %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV ^| findstr /I "node"') do (
    for /f "tokens=2,* delims=," %%b in ('wmic process where "name='node.exe'" get CommandLine^,ProcessId /FORMAT:CSV ^| findstr /I "server.js"') do (
        echo Killing existing node server.js process PID: %%b
        taskkill /PID %%b /F >nul 2>&1
    )
)

echo Starting new server.js...
start "" node server.js
echo Done.
