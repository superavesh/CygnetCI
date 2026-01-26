@echo off
cd /d %~dp0
echo Starting CygnetCI API...
echo Press Ctrl+C to stop
python\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
pause
