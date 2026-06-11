# CLAUDE.md — BOMedia Daily Sales Record App

## What this project is
An internal tool for logging daily sales at BOMedia (large format printing).
Not public-facing — used by staff and cashiers.

## Stack
- **Framework:** Next.js (App Router) + TypeScript
- **Backend:** Google Sheets (data lives in sheets, accessed via API)
- **AI:** Gemini API integration
- **Current UI:** Tailwind CSS  ← being migrated away from (see below)

## Current task: migrate the UI from Tailwind to MUI
The goal is **visual consistency**. Right now buttons and components are styled
ad hoc per page and drift out of sync. We're moving to MUI so components are
defined once and reused everywhere.

### Hard rules for the migration
1. **`theme.ts` is the single source of truth** for colors, fonts, spacing,
   radius, and component styles. NEVER style a button (or other component)
   inline. If something needs a new style, add it to the theme.
2. **Preserve all business logic untouched.** The Google Sheets backend, the
   Gemini integration, sales ID handling, and cashier session logic are not a
   styling concern — do not rewrite them during the UI migration. Only rebuild
   the *views*, then reconnect them to the existing logic.
3. **App Router needs MUI's cache provider** or styles break on first load.
   Use `@mui/material-nextjs` with `AppRouterCacheProvider` wrapping the app
   in `app/layout.tsx`, alongside `ThemeProvider` and `CssBaseline`.
4. **No ALL-CAPS buttons** and no heavy default Material shadows — these make
   MUI look stock. The theme already handles this; keep it that way.
5. Preserve the **cashier portal's amber/orange identity** (mapped to the
   theme's `warning` palette slot).

### Migration order
1. Wire up the theme + providers (`theme.ts`, `app/layout.tsx`).
2. Build the shared app shell (nav / layout) once.
3. Migrate screen by screen, reconnecting each to existing logic:
   - Sales entry form (do this first — exercises buttons, inputs, cards)
   - Records table
   - Cashier portal
4. Remove Tailwind only after all screens are migrated and verified.

## How I want you to work
- Before changing a screen, show me the plan for that screen and wait for OK.
- Migrate one screen at a time; don't touch multiple screens in one pass.
- After each screen, tell me what to run/click to verify it still works.
- If a change would touch backend or business logic, stop and flag it first.
