# PowerShell script to fix ALL status badge colors including components
# Changes ALL light backgrounds with dark text to bold backgrounds with white text

$srcPath = "d:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Web\cygnetci-web\src"

Write-Host "Fixing ALL status badge colors in app and components..." -ForegroundColor Green

# Define all possible status badge patterns
$replacements = @(
    # Green status (success, completed, active, online, healthy, running services)
    @{ Pattern = "bg-green-100 text-green-700"; Replace = "bg-green-600 text-white"; Desc = "Green 100/700 -> 600/white" },
    @{ Pattern = "bg-green-100 text-green-800"; Replace = "bg-green-600 text-white"; Desc = "Green 100/800 -> 600/white" },
    @{ Pattern = "bg-green-500 text-white"; Replace = "bg-green-600 text-white"; Desc = "Green 500 -> 600" },

    # Red status (failed, error, down, stopped)
    @{ Pattern = "bg-red-100 text-red-700"; Replace = "bg-red-600 text-white"; Desc = "Red 100/700 -> 600/white" },
    @{ Pattern = "bg-red-100 text-red-800"; Replace = "bg-red-600 text-white"; Desc = "Red 100/800 -> 600/white" },
    @{ Pattern = "bg-red-500 text-white"; Replace = "bg-red-600 text-white"; Desc = "Red 500 -> 600" },

    # Blue status (running, in-progress, info)
    @{ Pattern = "bg-blue-100 text-blue-700"; Replace = "bg-blue-600 text-white"; Desc = "Blue 100/700 -> 600/white" },
    @{ Pattern = "bg-blue-100 text-blue-800"; Replace = "bg-blue-600 text-white"; Desc = "Blue 100/800 -> 600/white" },
    @{ Pattern = "bg-blue-500 text-white"; Replace = "bg-blue-600 text-white"; Desc = "Blue 500 -> 600" },

    # Yellow/Amber status (warning, pending, busy)
    @{ Pattern = "bg-yellow-100 text-yellow-700"; Replace = "bg-amber-600 text-white"; Desc = "Yellow 100/700 -> amber-600/white" },
    @{ Pattern = "bg-yellow-100 text-yellow-800"; Replace = "bg-amber-600 text-white"; Desc = "Yellow 100/800 -> amber-600/white" },
    @{ Pattern = "bg-yellow-500 text-black"; Replace = "bg-amber-600 text-white"; Desc = "Yellow 500/black -> amber-600/white" },
    @{ Pattern = "bg-yellow-500 text-white"; Replace = "bg-amber-600 text-white"; Desc = "Yellow 500 -> amber-600" },
    @{ Pattern = "bg-amber-100 text-amber-700"; Replace = "bg-amber-600 text-white"; Desc = "Amber 100/700 -> 600/white" },
    @{ Pattern = "bg-amber-100 text-amber-800"; Replace = "bg-amber-600 text-white"; Desc = "Amber 100/800 -> 600/white" },

    # Gray status (offline, queued, unknown, inactive)
    @{ Pattern = "bg-gray-100 text-gray-700"; Replace = "bg-gray-600 text-white"; Desc = "Gray 100/700 -> 600/white" },
    @{ Pattern = "bg-gray-100 text-gray-800"; Replace = "bg-gray-600 text-white"; Desc = "Gray 100/800 -> 600/white" },
    @{ Pattern = "bg-gray-500 text-white"; Replace = "bg-gray-600 text-white"; Desc = "Gray 500 -> 600" },
    @{ Pattern = "bg-gray-400 text-white"; Replace = "bg-gray-600 text-white"; Desc = "Gray 400 -> 600" },

    # Purple status
    @{ Pattern = "bg-purple-100 text-purple-700"; Replace = "bg-purple-600 text-white"; Desc = "Purple 100/700 -> 600/white" },
    @{ Pattern = "bg-purple-100 text-purple-800"; Replace = "bg-purple-600 text-white"; Desc = "Purple 100/800 -> 600/white" },

    # Orange status (critical)
    @{ Pattern = "bg-orange-100 text-orange-700"; Replace = "bg-red-600 text-white"; Desc = "Orange 100/700 -> red-600/white" },
    @{ Pattern = "bg-orange-100 text-orange-800"; Replace = "bg-red-600 text-white"; Desc = "Orange 100/800 -> red-600/white" },
    @{ Pattern = "bg-orange-500 text-white"; Replace = "bg-red-600 text-white"; Desc = "Orange 500 -> red-600" }
)

$fileCount = 0
$totalReplacements = 0
$filesProcessed = @{}

# Process all TSX and TS files
Get-ChildItem -Path $srcPath -Filter "*.tsx" -Recurse | ForEach-Object {
    $file = $_
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content
    $fileReplacements = 0

    foreach ($replacement in $replacements) {
        $newContent = $content -replace [regex]::Escape($replacement.Pattern), $replacement.Replace
        if ($newContent -ne $content) {
            $matches = ([regex]::Matches($content, [regex]::Escape($replacement.Pattern))).Count
            $fileReplacements += $matches
            $content = $newContent
        }
    }

    if ($content -ne $originalContent) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $fileCount++
        $totalReplacements += $fileReplacements
        $relativePath = $file.FullName.Replace($srcPath + "\", "")
        Write-Host "Fixed: $relativePath ($fileReplacements changes)" -ForegroundColor Cyan
        $filesProcessed[$relativePath] = $fileReplacements
    }
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Summary:" -ForegroundColor Green
Write-Host "  Files modified: $fileCount" -ForegroundColor Green
Write-Host "  Total replacements: $totalReplacements" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nDone! All status badges now use white text on bold colored backgrounds." -ForegroundColor Green
