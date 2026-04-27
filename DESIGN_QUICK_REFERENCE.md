# BOMedia UI Upgrades - Quick Reference Guide

## Color Scheme

### Admin Portal (Indigo/Purple)

- **Primary**: `hsl(243 75% 59%)` - #2e388d (Indigo)
- **Accent**: `hsl(243 75% 96%)` - Light indigo for backgrounds
- **Use**: Admin dashboard, records management, data-focused features

### Cashier Portal (Amber/Orange)

- **Primary**: `hsl(38 92% 50%)` - #f59e0b (Amber)
- **Accent**: `hsl(38 92% 96%)` - Light amber for backgrounds
- **Use**: Cashier sales entry, transaction handling, warm/approachable feel

## Typography Scale

```
h1: 36px, font-black, tracking-tight          ← Logo, hero titles
h2: 24px, font-bold, tracking-tight           ← Section headers
h3: 18px, font-bold                           ← Subsection headers
label: 14px, font-semibold, text-muted        ← Form labels
body: 16px, font-medium                       ← Regular text
```

## Component Color Reference

### Material Types (Record Cards)

| Material        | Color  | Class                           |
| --------------- | ------ | ------------------------------- |
| Flex            | Blue   | `bg-blue-100 text-blue-700`     |
| SAV             | Purple | `bg-purple-100 text-purple-700` |
| Blockout        | Gray   | `bg-gray-100 text-gray-600`     |
| Vinyl           | Rose   | `bg-rose-100 text-rose-700`     |
| Mesh            | Indigo | `bg-indigo-100 text-indigo-700` |
| Window Graphics | Cyan   | `bg-cyan-100 text-cyan-700`     |

### Status Badges

| Status       | Color  | Usage                             |
| ------------ | ------ | --------------------------------- |
| Settled      | Green  | `bg-emerald-100 text-emerald-700` |
| Part-payment | Amber  | `bg-amber-100 text-amber-700`     |
| In Progress  | Blue   | `bg-blue-100 text-blue-700`       |
| Syncing      | Indigo | `bg-indigo-100 text-indigo-700`   |

## Component Heights (Accessibility)

- **Touch Targets**: `min-h-[44px]` (WCAG AA standard)
- **Input Fields**: `h-12` (48px)
- **Button**: `h-12` (48px)
- **FAB**: `h-14` (56px) for thumb reach
- **Card Padding**: `p-5` or `p-6` for comfortable tapping

## Mobile Breakpoints

- **Mobile**: < 768px (md breakpoint)
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

## Key Files for Customization

| Feature    | File                               | Key Section                |
| ---------- | ---------------------------------- | -------------------------- |
| Logo       | `components/logo.tsx`              | SVG path for B icon        |
| Colors     | `app/globals.css`                  | `:root` and `.theme-amber` |
| Bottom Nav | `components/bottom-nav.tsx`        | `primaryClass` variable    |
| FAB        | `components/floating-sale-fab.tsx` | Color classes              |
| Fonts      | `app/globals.css`                  | `font-family` in body      |

## Common Modifications

### Change Cashier Theme Color

In `app/globals.css`, update `.theme-amber`:

```css
.theme-amber {
  --primary: 38 92% 50%; /* Change this HSL value */
  --primary-foreground: 0 0% 100%;
  /* ... */
}
```

### Update Logo SVG

In `components/logo.tsx`, modify the `<path>` elements inside the `<svg>` to change the B icon design.

### Adjust Material Colors

In `components/material-badge.tsx`, modify the `getColors()` function to update badge colors.

### Change Typography

In `app/globals.css`, update the `@layer base` section with new font sizes and weights.

## Portal Detection Logic

```tsx
// Check if on cashier portal
const isCashier = pathname?.startsWith("/cashier");

// Check if on admin portal
const isAdmin = pathname?.startsWith("/bom03");

// Both portals share bottom nav
const isCashierOrAdmin = isCashier || isAdmin;
```

## Mobile-Responsive Components

- **Bottom Navigation**: Visible only on mobile (`md:hidden`)
- **FAB**: Mobile-only, replaces button on desktop
- **Modals**: Center dialog on desktop, bottom sheet drawer on mobile
- **Bottom Sticky Summary**: Mobile-only drawer

## Theme Application

The `ThemeWrapper` component automatically applies the `theme-amber` class to the entire layout when the pathname starts with `/cashier`:

```tsx
<div className={cn(
  "flex min-h-screen",
  isCashier && "theme-amber"  // ← Applies warm colors
)}>
```

This cascades to all child components, allowing CSS to use:

```css
color: hsl(var(--primary)); /* Uses indigo OR amber */
```

---

**Last Updated**: April 21, 2026
**Version**: 1.0 - Complete Design Upgrade
