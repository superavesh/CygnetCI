# PowerShell script to fix all color inconsistencies globally
# This replaces incorrect colors in all TSX files at once

$srcPath = "d:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Web\cygnetci-web\src\app"

Write-Host "Fixing color inconsistencies across all files..." -ForegroundColor Green

# Define replacements based on transfer page patterns
$replacements = @(
    # Fix text-white in headings (should be text-gray-900 or text-gray-800)
    @{
        Pattern = 'className="([^"]*\s)?text-3xl font-bold text-white(\s[^"]*)?'
        Replace = 'className="$1text-3xl font-bold text-gray-900$2'
        Description = "Page h1 headings (text-white -> text-gray-900)"
    },
    @{
        Pattern = 'className="([^"]*\s)?text-xl font-semibold text-white(\s[^"]*)?'
        Replace = 'className="$1text-xl font-semibold text-gray-800$2'
        Description = "Section h2 headings (text-white -> text-gray-800)"
    },
    @{
        Pattern = 'className="([^"]*\s)?text-2xl font-bold text-white(\s[^"]*)?'
        Replace = 'className="$1text-2xl font-bold text-gray-900$2'
        Description = "Modal h2 headings (text-white -> text-gray-900)"
    },
    @{
        Pattern = 'className="([^"]*\s)?text-lg font-semibold text-white(\s[^"]*)?'
        Replace = 'className="$1text-lg font-semibold text-gray-800$2'
        Description = "Subsection h3 headings (text-white -> text-gray-800)"
    },

    # Fix text-white in regular text (should be text-gray-900 or text-gray-600)
    @{
        Pattern = 'className="([^"]*\s)?text-sm font-medium text-white(\s[^"]*)?'
        Replace = 'className="$1text-sm font-medium text-gray-900$2'
        Description = "Small medium text (text-white -> text-gray-900)"
    },
    @{
        Pattern = 'className="([^"]*\s)?text-sm font-semibold text-white(\s[^"]*)?'
        Replace = 'className="$1text-sm font-semibold text-gray-900$2'
        Description = "Small semibold text (text-white -> text-gray-900)"
    },

    # Fix Database/Upload icons (should be gray-600)
    @{
        Pattern = '<Database className="h-8 w-8 text-blue-500"'
        Replace = '<Database className="h-8 w-8 text-gray-600"'
        Description = "Database icons (text-blue-500 -> text-gray-600)"
    },
    @{
        Pattern = '<Upload className="h-6 w-6 text-blue-500"'
        Replace = '<Upload className="h-6 w-6 text-gray-600"'
        Description = "Upload icons in headers (text-blue-500 -> text-gray-600)"
    },
    @{
        Pattern = '<FileText className="h-6 w-6 text-blue-500"'
        Replace = '<FileText className="h-6 w-6 text-gray-600"'
        Description = "FileText icons in headers (text-blue-500 -> text-gray-600)"
    },

    # Fix CheckCircle icons (should be green-600 for success)
    @{
        Pattern = '<CheckCircle className="h-5 w-5 text-blue-500"'
        Replace = '<CheckCircle className="h-5 w-5 text-green-600"'
        Description = "CheckCircle success icons (text-blue-500 -> text-green-600)"
    },
    @{
        Pattern = '<CheckCircle className="h-10 w-10 text-blue-500"'
        Replace = '<CheckCircle className="h-10 w-10 text-green-600"'
        Description = "Large CheckCircle icons (text-blue-500 -> text-green-600)"
    },

    # Fix hover states with wrong colors
    @{
        Pattern = 'hover:bg-orange-50'
        Replace = 'hover:bg-blue-50'
        Description = "Hover background (orange -> blue)"
    },
    @{
        Pattern = 'hover:from-\[blue-600\]'
        Replace = 'hover:from-blue-600'
        Description = "Button gradient hover (bracket syntax -> proper)"
    },
    @{
        Pattern = 'hover:to-\[blue-500\]'
        Replace = 'hover:to-blue-600'
        Description = "Button gradient hover (bracket syntax -> proper)"
    },
    @{
        Pattern = 'hover:text-\[blue-600\]'
        Replace = 'hover:text-blue-700'
        Description = "Text hover (bracket syntax -> proper)"
    },
    @{
        Pattern = 'hover:text-green-900'
        Replace = 'hover:text-blue-700'
        Description = "Link hover (green -> blue)"
    },
    @{
        Pattern = 'hover:text-white'
        Replace = 'hover:text-gray-900'
        Description = "Button text hover (white -> gray)"
    },

    # Fix modal button backgrounds
    @{
        Pattern = 'bg-\[#0F2A3D\]'
        Replace = 'bg-gray-600'
        Description = "Close button background (dark hex -> gray-600)"
    },

    # Fix completed status color
    @{
        Pattern = 'text-blue-500''}>[\s\n]*\{selectedScript\.analysis_status\}'
        Replace = 'text-green-600''}>$1{selectedScript.analysis_status}'
        Description = "Completed status color (blue -> green)"
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
Write-Host "`nDone! All color inconsistencies have been fixed." -ForegroundColor Green
