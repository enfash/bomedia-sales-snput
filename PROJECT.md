# Project: BOMedia Sales & Expense System Update

## Architecture
- **Framework**: Next.js App Router (using MUI for UI components, Zustand for state management).
- **Backend**: Google Sheets API integrated via Route Handlers under `/app/api/`.
- **Offline capabilities**: Service Worker (`/public/sw.js`), Zustand Persist storage, and synchronizer (`components/sync-manager.tsx`).
- **Themes**: Admin Portal (Indigo/Purple, HSL(243 75% 59%)), Cashier Portal (Amber/Orange, HSL(38 92% 50%)).

## Code Layout
- **UI components**: `/components/`
- **Views/Pages**: `/app/bom03/` (Admin), `/app/cashier/` (Cashier)
- **Libraries & Utils**: `/lib/`
- **State**: `/lib/store.ts` (Zustand)
- **Sheets Integration**: `/lib/google-sheets.ts`
- **Static assets**: `/public/`

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | E2E Testing Track | Define test infra and cases (Tiers 1-4) | None | IN_PROGRESS |
| 2 | PWA & Offline Hardening | SW verification, optimistic UI sync, error handling | None | IN_PROGRESS |
| 3 | Code Architecture & Performance | Next.js API route optimization, Zustand state types, performance enhancements | M2 | PLANNED |
| 4 | UI/UX Admin Portal Upgrade | Elevate Admin components, theme coherence, animations | M3 | PLANNED |
| 5 | UI/UX Cashier Portal Upgrade | Elevate Cashier components, orange/amber identity, mobile optimized | M4 | PLANNED |
| 6 | E2E Pass & adversarial hardening (Tier 5) | Integrate all tests, resolve bugs, white-box coverage | M1, M5 | PLANNED |

## Interface Contracts
### Client Store ↔ Server API
- **POST `/api/sales`**: Log sales records
- **POST `/api/expenses`**: Log expense records
- **POST `/api/payments`**: Log additional payments
- **POST `/api/parse-nl`**: NLP prompt parser for AI-assisted entries
- **GET `/api/sales`, `/api/expenses`, `/api/materials`**: Fetch current data
