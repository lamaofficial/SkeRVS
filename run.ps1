# run.ps1
# 启动后端
Start-Process powershell -ArgumentList "-NoExit -Command `".\.venv\Scripts\python -m uvicorn src.api.main:app --reload --port 8000`""

# 等待1秒确保后端启动
Start-Sleep -Seconds 1

# 启动前端
Start-Process powershell -ArgumentList "-NoExit -Command `"cd .\frontend\; npm run dev`""

Write-Host "后端运行在: http://localhost:8000" -ForegroundColor Green
Write-Host "前端运行在: http://localhost:5173 (默认Vite端口)" -ForegroundColor Green
Write-Host "按任意键停止所有进程..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")