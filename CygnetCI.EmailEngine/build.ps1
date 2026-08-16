# Publish the EmailEngine as a self-contained Windows service (no .NET install needed).
param(
    [string]$Runtime = "win-x64",
    [string]$OutputPath = ".\publish\win-x64"
)
$ErrorActionPreference = "Stop"
Write-Host "Publishing CygnetCI.EmailEngine ($Runtime)..." -ForegroundColor Cyan

dotnet publish .\CygnetCI.EmailEngine.csproj `
    -c Release -r $Runtime --self-contained true `
    -p:PublishSingleFile=false -o $OutputPath

Write-Host "`nDone -> $OutputPath" -ForegroundColor Green
Write-Host @"

Install as a Windows service (run in an elevated prompt):
  sc.exe create "CygnetCI EmailEngine" binPath= "<full-path>\CygnetCI.EmailEngine.exe" start= auto
  sc.exe start  "CygnetCI EmailEngine"

Before starting: edit appsettings.json in the publish folder with your DB
connection string and RabbitMQ credentials.
"@ -ForegroundColor Yellow
