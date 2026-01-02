# PowerShell script to fix all status badge colors to use white text
# Changes light backgrounds (100) with dark text (800) to bold backgrounds (600) with white text

$srcPath = "d:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Web\cygnetci-web\src\app"

Write-Host "Fixing status badge colors across all files..." -ForegroundColor Green

# Define replacements for status badges
$replacements = @(
    # Green status badges (success, active, online, completed)
    @{
        Pattern = 'bg-green-100 text-green-700'
        Replace = 'bg-green-600 text-white'
        Description = "Green status badges (100/700 -> 600/white)"
    },
    @{
        Pattern = 'bg-green-100 text-green-800'
        Replace = 'bg-green-600 text-white'
        Description = "Green status badges (100/800 -> 600/white)"
    },

    # Red status badges (failed, error, inactive)
    @{
        Pattern = 'bg-red-100 text-red-700'
        Replace = 'bg-red-600 text-white'
        Description = "Red status badges (100/700 -> 600/white)"
    },
    @{
        Pattern = 'bg-red-100 text-red-800'
        Replace = 'bg-red-600 text-white'
        Description = "Red status badges (100/800 -> 600/white)"
    },

    # Blue status badges (running, analyzing, info)
    @{
        Pattern = 'bg-blue-100 text-blue-700'
        Replace = 'bg-blue-600 text-white'
        Description = "Blue status badges (100/700 -> 600/white)"
    },
    @{
        Pattern = 'bg-blue-100 text-blue-800'
        Replace = 'bg-blue-600 text-white'
        Description = "Blue status badges (100/800 -> 600/white)"
    },
    @{
        Pattern = 'bg-blue-100 text-blue-500'
        Replace = 'bg-blue-600 text-white'
        Description = "Blue status badges (100/500 -> 600/white)"
    },

    # Amber/Yellow status badges (pending, warning)
    @{
        Pattern = 'bg-amber-100 text-amber-700'
        Replace = 'bg-amber-600 text-white'
        Description = "Amber status badges (100/700 -> 600/white)"
    },
    @{
        Pattern = 'bg-amber-100 text-amber-800'
        Replace = 'bg-amber-600 text-white'
        Description = "Amber status badges (100/800 -> 600/white)"
    },
    @{
        Pattern = 'bg-yellow-100 text-yellow-700'
        Replace = 'bg-amber-600 text-white'
        Description = "Yellow status badges (100/700 -> amber-600/white)"
    },
    @{
        Pattern = 'bg-yellow-100 text-yellow-800'
        Replace = 'bg-amber-600 text-white'
        Description = "Yellow status badges (100/800 -> amber-600/white)"
    },

    # Gray status badges (queued, inactive, offline)
    @{
        Pattern = 'bg-gray-100 text-gray-700'
        Replace = 'bg-gray-600 text-white'
        Description = "Gray status badges (100/700 -> 600/white)"
    },
    @{
        Pattern = 'bg-gray-100 text-gray-800'
        Replace = 'bg-gray-600 text-white'
        Description = "Gray status badges (100/800 -> 600/white)"
    },

    # Purple status badges (if any)
    @{
        Pattern = 'bg-purple-100 text-purple-700'
        Replace = 'bg-purple-600 text-white'
        Description = "Purple status badges (100/700 -> 600/white)"
    },
    @{
        Pattern = 'bg-purple-100 text-purple-800'
        Replace = 'bg-purple-600 text-white'
        Description = "Purple status badges (100/800 -> 600/white)"
    }
)

$fileCount = 0
$totalReplacements = 0

# Process all TSX files
Get-ChildItem -Path $srcPath -Filter "*.tsx" -Recurse | ForEach-Object {
    $file = $_
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content
    $fileReplacements = 0

    foreach ($replacement in $replacements) {
        $newContent = $content -replace $replacement.Pattern, $replacement.Replace
        if ($newContent -ne $content) {
            $matches = ([regex]::Matches($content, $replacement.Pattern)).Count
            $fileReplacements += $matches
            Write-Host "  - $($replacement.Description): $matches replacements" -ForegroundColor Yellow
            $content = $newContent
        }
    }

    if ($content -ne $originalContent) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $fileCount++
        $totalReplacements += $fileReplacements
        Write-Host "Fixed: $($file.Name) ($fileReplacements changes)" -ForegroundColor Cyan
    }
}

Write-Host "`nSummary:" -ForegroundColor Green
Write-Host "  Files modified: $fileCount" -ForegroundColor Green
Write-Host "  Total replacements: $totalReplacements" -ForegroundColor Green
Write-Host "`nDone! All status badges now use white text on bold colored backgrounds." -ForegroundColor Green
