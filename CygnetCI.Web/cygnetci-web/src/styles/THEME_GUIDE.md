# CygnetCI Theme Guide

This guide explains how to customize the CygnetCI application theme using the centralized `theme.css` file.

## Overview

All theme variables are defined in `/src/styles/theme.css`. This file contains:
- **Colors**: Brand colors, semantic colors, status colors, neutrals
- **Typography**: Font families, sizes, weights, line heights
- **Spacing**: Consistent spacing values
- **Border Radius**: Corner rounding values
- **Shadows**: Box shadow definitions
- **Transitions**: Animation timing
- **Component Styles**: Pre-built component classes

## Quick Start

### Changing the Primary Brand Color

To change the main yellow/gold color throughout the app:

```css
/* In theme.css, modify these lines: */
--color-primary: #FEB114;        /* Change to your desired color */
--color-primary-hover: #E59D00;  /* Darker shade for hover states */
--color-primary-light: #FFF5E1;  /* Lighter shade for backgrounds */
--color-primary-dark: #CC8F00;   /* Even darker shade */
```

### Changing the Secondary/Dark Color

To change the dark blue color used in headers and navigation:

```css
--color-secondary: #081D2B;       /* Change to your desired dark color */
--color-secondary-light: #0F2A3D;
--color-secondary-dark: #051419;
```

### Changing Status Colors

To customize the colors for different pipeline/task statuses:

```css
--color-status-running: #3b82f6;   /* Blue */
--color-status-success: #10b981;   /* Green */
--color-status-failed: #ef4444;    /* Red */
--color-status-pending: #f59e0b;   /* Orange */
```

### Changing Typography

To update fonts across the entire application:

```css
/* Change font family */
--font-sans: 'Your Font', -apple-system, BlinkMacSystemFont, sans-serif;

/* Adjust font sizes */
--font-size-base: 1rem;      /* Base font size */
--font-size-lg: 1.125rem;    /* Larger text */
--font-size-2xl: 1.5rem;     /* Headings */
```

## Using Theme Variables

### In CSS Files

Use CSS variables anywhere in your stylesheets:

```css
.my-component {
  background-color: var(--color-primary);
  color: var(--text-inverse);
  padding: var(--spacing-md);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  transition: var(--transition-fast);
}

.my-component:hover {
  background-color: var(--color-primary-hover);
}
```

### In React Components (Inline Styles)

```tsx
<div style={{
  backgroundColor: 'var(--color-primary)',
  padding: 'var(--spacing-md)',
  borderRadius: 'var(--radius-lg)'
}}>
  Content
</div>
```

### Using Utility Classes

The theme includes pre-built utility classes:

```tsx
<div className="bg-primary text-inverse rounded-lg shadow-lg">
  Content
</div>

<button className="btn btn-primary">
  Click Me
</button>

<span className="badge badge-success">
  Active
</span>
```

## Common Customization Examples

### Example 1: Change to Blue Theme

```css
/* In theme.css */
--color-primary: #3b82f6;        /* Blue */
--color-primary-hover: #2563eb;  /* Darker blue */
--color-primary-light: #dbeafe;  /* Light blue background */
--color-primary-dark: #1e40af;   /* Dark blue */
```

### Example 2: Change to Purple Theme

```css
/* In theme.css */
--color-primary: #8b5cf6;        /* Purple */
--color-primary-hover: #7c3aed;  /* Darker purple */
--color-primary-light: #ede9fe;  /* Light purple background */
--color-primary-dark: #6d28d9;   /* Dark purple */
```

### Example 3: Increase Spacing Throughout

```css
/* In theme.css */
--spacing-xs: 0.5rem;    /* Was 0.25rem */
--spacing-sm: 0.75rem;   /* Was 0.5rem */
--spacing-md: 1.25rem;   /* Was 1rem */
--spacing-lg: 2rem;      /* Was 1.5rem */
--spacing-xl: 2.5rem;    /* Was 2rem */
```

### Example 4: More Rounded Corners

```css
/* In theme.css */
--radius-sm: 0.5rem;     /* Was 0.375rem */
--radius-md: 0.75rem;    /* Was 0.5rem */
--radius-lg: 1rem;       /* Was 0.75rem */
--radius-xl: 1.5rem;     /* Was 1rem */
```

## Color Categories Explained

### Brand Colors
- `--color-primary`: Main accent color (buttons, links, highlights)
- `--color-secondary`: Secondary color (headers, navigation)

### Semantic Colors
- `--color-success`: Positive actions (save, confirm, active)
- `--color-warning`: Cautionary actions (pending, review)
- `--color-error`: Negative actions (delete, fail, cancel)
- `--color-info`: Informational (help, tips, notifications)

### Status Colors
- `--color-status-running`: For active processes
- `--color-status-success`: For completed successfully
- `--color-status-failed`: For failures
- `--color-status-pending`: For queued items

### Neutral Colors
- Gray scale from 50 (lightest) to 900 (darkest)
- Used for backgrounds, borders, and text

## Dark Mode Support

The theme automatically adapts to dark mode based on system preferences. To customize dark mode:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --background-primary: #0a0a0a;    /* Change dark background */
    --text-primary: #ededed;          /* Change dark text */
    /* Add more overrides as needed */
  }
}
```

## Component Classes

The theme includes ready-to-use component classes:

### Buttons
```html
<button class="btn btn-primary">Primary Button</button>
<button class="btn btn-secondary">Secondary Button</button>
```

### Cards
```html
<div class="card">
  Card content
</div>
```

### Inputs
```html
<input type="text" class="input" placeholder="Enter text" />
```

### Badges
```html
<span class="badge badge-success">Success</span>
<span class="badge badge-warning">Warning</span>
<span class="badge badge-error">Error</span>
<span class="badge badge-info">Info</span>
```

## Best Practices

1. **Always use CSS variables** instead of hardcoded colors
   - ✅ `color: var(--color-primary)`
   - ❌ `color: #FEB114`

2. **Use semantic naming** for better maintainability
   - ✅ `var(--color-success)`
   - ❌ `var(--color-green)`

3. **Test changes** across different pages to ensure consistency

4. **Document custom changes** if you add new variables

5. **Use utility classes** when possible for consistency
   - ✅ `<div className="bg-primary rounded-lg">`
   - ⚠️ `<div style={{ background: 'var(--color-primary)' }}>`

## Migration from Hardcoded Values

If you have components with hardcoded colors, replace them with theme variables:

### Before:
```tsx
<button className="bg-[#FEB114] text-[#081D2B] rounded-lg">
  Click Me
</button>
```

### After:
```tsx
<button className="btn btn-primary">
  Click Me
</button>

// Or with inline styles:
<button style={{
  backgroundColor: 'var(--color-primary)',
  color: 'var(--color-secondary)'
}}>
  Click Me
</button>
```

## Need Help?

- All variables are documented in `theme.css`
- Each section has clear comments explaining usage
- Variables follow consistent naming patterns for easy discovery

## Quick Reference

### Most Commonly Changed Variables

```css
/* Primary brand color (yellow/gold) */
--color-primary: #FEB114;

/* Secondary brand color (dark blue) */
--color-secondary: #081D2B;

/* Success color (green) */
--color-success: #10b981;

/* Error color (red) */
--color-error: #ef4444;

/* Base font size */
--font-size-base: 1rem;

/* Base spacing unit */
--spacing-md: 1rem;

/* Base border radius */
--radius-md: 0.5rem;
```

---

**Last Updated**: January 2026
**Version**: 1.0.0
