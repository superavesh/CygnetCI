# CygnetCI Theme Implementation Guide

## Overview
This document explains the centralized theme implementation for CygnetCI with a clean blue-green-white color scheme.

## Theme Files

### 1. `src/styles/theme.css`
Contains CSS variables for the entire application:
- Brand colors (blue, green)
- Semantic colors (success, warning, error, info)
- Status colors (pipeline, agent states)
- Neutral grays
- Typography, spacing, shadows, etc.

**Usage**: Reference these CSS variables when needed:
```css
color: var(--color-primary);
background: var(--background-page);
```

### 2. `src/styles/color-fixes.css`
Global CSS overrides to fix common color inconsistencies:
- Fixes heading colors (h1, h2, h3 should be gray, not white)
- Fixes icon colors based on context
- Fixes button and hover states
- Uses `!important` to override inline Tailwind classes

**Important**: This file is automatically imported in `layout.tsx`.

### 3. `fix-colors.ps1` (One-time Utility)
PowerShell script that performs bulk find-and-replace operations to fix color inconsistencies across all TSX files.

**Run when**: You notice widespread color issues or after major updates.

```powershell
powershell -ExecutionPolicy Bypass -File fix-colors.ps1
```

## Color Usage Guidelines

### Text Colors

| Element | Color Class | Usage |
|---------|-------------|-------|
| Page headings (h1) | `text-gray-900` | Main page titles |
| Section headings (h2) | `text-gray-800` | Section titles |
| Subsection headings (h3) | `text-gray-800` | Subsection titles |
| Body text | `text-gray-700` or `text-gray-900` | Regular content |
| Secondary text | `text-gray-600` | Descriptions, captions |
| Muted text | `text-gray-500` | Timestamps, metadata |
| Links | `text-blue-600` | Clickable links |
| White text | `text-white` | **ONLY** inside blue/dark backgrounds |

### Button Colors

| Button Type | Background | Text | Usage |
|-------------|------------|------|-------|
| Primary | `bg-blue-500 hover:bg-blue-600` | `text-white` | Main actions (Submit, Create, Save) |
| Secondary | `bg-white border-gray-300 hover:bg-gray-100` | `text-gray-700` | Cancel, Close |
| Success | `bg-green-600 hover:bg-green-700` | `text-white` | Success actions (Download CSV) |
| Danger | `bg-red-600 hover:bg-red-700` | `text-white` | Delete, Remove |

### Icon Colors

| Icon Purpose | Color Class | Examples |
|--------------|-------------|----------|
| Primary action icons | `text-blue-600` | Upload (in content areas) |
| Success/Complete | `text-green-600` | CheckCircle |
| Error/Failed | `text-red-600` | XCircle, Trash2 |
| Warning | `text-amber-600` | AlertTriangle, Clock (pending) |
| Neutral/Secondary | `text-gray-500` or `text-gray-600` | RefreshCw, Search, Edit, Download |
| Decorative (in headings) | `text-gray-600` | Database, Upload, FileText (in h1/h2) |
| Loading | `text-blue-500` | Loader with animate-spin |
| Inside buttons | `currentColor` | Inherits button text color |

### Background Colors

| Element | Color Class | Usage |
|---------|-------------|-------|
| Page background | `bg-gray-50` | Main page wrapper |
| Cards | `bg-white` | Content cards, modals |
| Header | `bg-white` | Top navigation bar |
| Sidebar | `bg-white` | Left navigation menu |
| Active sidebar item | `bg-blue-50` | Currently selected nav item |
| Hover states | `hover:bg-gray-50` or `hover:bg-blue-50` | Interactive elements |
| Modal backdrop | `bg-black bg-opacity-50` | Modal overlay |
| Gradients (buttons) | `bg-gradient-to-br from-blue-500 to-blue-600` | Primary buttons, modal headers |
| Gradients (icons) | `bg-gradient-to-br from-blue-500 to-blue-600` | Avatar backgrounds |

### Border Colors

| Element | Color Class | Usage |
|---------|-------------|-------|
| Default borders | `border-gray-200` | Cards, dividers |
| Input borders | `border-gray-300` | Form inputs |
| Focus ring | `focus:ring-blue-500` | Focused inputs |
| Hover borders | `hover:border-blue-400` | Interactive cards |
| Active borders | `border-blue-500` | Active sidebar items |

## Status Colors

### Pipeline/Task Status (Bold colors with white text)
- **Running**: `bg-blue-600 text-white`
- **Success/Completed**: `bg-green-600 text-white`
- **Failed**: `bg-red-600 text-white`
- **Pending**: `bg-amber-600 text-white`
- **Queued**: `bg-gray-600 text-white`
- **Analyzing**: `bg-blue-600 text-white`

### Agent Status (Bold colors with white text)
- **Online/Active**: `bg-green-600 text-white`
- **Offline/Inactive**: `bg-gray-600 text-white`
- **Busy**: `bg-amber-600 text-white`

## Common Mistakes to Avoid

### ❌ Don't Do This
```tsx
<h1 className="text-white">Page Title</h1>  // White text on white background!
<Database className="text-blue-500" />  // Too much blue
<button className="text-white hover:text-white">  // Redundant
<CheckCircle className="text-blue-500" />  // Should be green for success
```

### ✅ Do This Instead
```tsx
<h1 className="text-gray-900">Page Title</h1>
<Database className="text-gray-600" />
<button className="bg-blue-500 text-white hover:bg-blue-600">
<CheckCircle className="text-green-600" />
```

## Reference Pages

The following pages have the **correct** color implementation:
1. **transfer/page.tsx** - Reference for form colors, button colors, icon usage
2. **customers/page.tsx** - Reference for table colors, badges, modals
3. **users/page.tsx** - Reference for avatars, tabs, form inputs

## Making Theme Changes

### Option 1: Update CSS Variables (Recommended)
Edit `src/styles/theme.css` to change colors globally:
```css
:root {
  --color-primary: #3b82f6;  /* Change this to update all primary blue */
  --color-secondary: #10b981; /* Change this to update all green */
}
```

### Option 2: Run Color Fix Script
If pages have incorrect colors, run the PowerShell script:
```powershell
cd CygnetCI.Web\cygnetci-web
powershell -ExecutionPolicy Bypass -File fix-colors.ps1
```

### Option 3: Manual Updates
For specific components, update the Tailwind classes directly:
- Use `text-gray-900` for headings
- Use `text-gray-600` for descriptions
- Use `bg-blue-500` for primary buttons
- Use `text-blue-600` for links

## Dark Mode (Future)
The theme.css includes dark mode variables but they are currently disabled. To enable:
1. Remove the `@media (prefers-color-scheme: dark)` block comment
2. Test all pages for contrast and readability
3. Update any hardcoded colors to use CSS variables

## Troubleshooting

### Problem: Text is invisible (white on white)
**Solution**: Check for `text-white` outside of buttons/badges. Replace with `text-gray-900`.

### Problem: Too much blue everywhere
**Solution**: Icons in headings should be `text-gray-600`, not `text-blue-500`.

### Problem: Success indicators showing blue
**Solution**: Use `text-green-600` for CheckCircle and success states.

### Problem: Build error with color-fixes.css
**Solution**: Ensure no invalid CSS pseudo-classes. Only use standard CSS selectors.

## Summary

The theme is now centralized with three layers:
1. **CSS Variables** (`theme.css`) - Foundation colors
2. **Global Overrides** (`color-fixes.css`) - Fix common issues automatically
3. **Component Classes** - Tailwind utilities in TSX files

This approach balances flexibility with consistency, making it easy to maintain and update the color scheme.
