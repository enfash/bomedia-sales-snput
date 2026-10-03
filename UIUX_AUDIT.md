# BOMedia UI/UX Audit

Date: 2026-07-18
Scope: high-level review of the landing page, app shell, cashier dashboard, mobile navigation, bottom navigation, theme system, and new-sale entry flow.

## Overall assessment

The app is already moving in a practical product direction: cashier-first tasks are visible, touch targets are generally large, the dashboard uses operational metrics, and the new-sale flow has a useful sticky review bar. The biggest improvement opportunity is not adding more decoration. It is reducing duplicated navigation, standardizing tokens, simplifying dense forms, and making state, hierarchy, and next actions more predictable.

## What is working well

- **Clear role-based entry point.** The landing screen sends staff directly to the cashier workflow with one obvious primary action.
- **Persistent operational shell.** Desktop users get a permanent sidebar, while mobile users get a header, drawer, and bottom navigation.
- **Good mobile priority.** The cashier dashboard emphasizes daily jobs, revenue, collection progress, pending sync, and common actions.
- **Helpful flow structure.** New sales are organized into client, material, dimensions, cart, and review stages.
- **Touch target intent.** The theme explicitly raises icon-button hit areas toward 44px targets.
- **Offline/sync confidence.** Sync status is present in both desktop and mobile navigation.

## Main design-principle gaps

### 1. Navigation is overexposed on mobile

Mobile users currently have a fixed top app bar, a hamburger drawer, and a floating bottom navigation. These three systems overlap. The drawer contains a broader menu, the bottom nav contains five frequent destinations, and the top bar also carries multiple utilities. This makes the shell feel powerful but busy.

**Recommendation**

- Keep bottom navigation for the five most common cashier tasks.
- Keep the drawer only for secondary destinations and settings.
- Move lower-frequency tools, such as sound, refresh, sync details, and theme, behind a compact status/action menu.
- Make labels consistent across navigation systems. For example, `Dashboard`, `Home`, and `Dash` should resolve to one label per role.

### 2. Visual hierarchy is inconsistent across surfaces

The app uses strong cards, chips, icon boxes, heavy weights, uppercase captions, shadows, and colorful status marks. Individually these patterns are useful, but together they compete for attention.

**Recommendation**

- Create a strict hierarchy ladder:
  1. Page title and one primary action.
  2. Section title and current state.
  3. Data rows and inputs.
  4. Secondary metadata.
- Reserve primary color for actions and selected states, not every icon container.
- Use fewer all-caps micro-labels. They are useful for dense operational metadata, but too many uppercase labels make the UI feel noisy.

### 3. The design token system is not fully centralized

The MUI theme defines role-based primary colors, typography, shape, and component overrides. However, many components still hardcode hex values, rgba values, and one-off shadows. This makes the product harder to polish consistently.

**Recommendation**

- Move recurring values into semantic tokens: `surfaceMuted`, `surfaceRaised`, `statusSuccessBg`, `statusWarningBg`, `statusDangerBg`, `cashierAccent`, `adminAccent`.
- Replace direct hex usage in component styles with `theme.palette` or `alpha(theme.palette...)`.
- Consider OKLCH color tokens for better perceptual consistency in light and dark mode.

### 4. Forms are accurate but cognitively heavy

The new-sale form asks for client, quote lookup, material, dimensions, pricing, stock preview, warnings, cart, initial payment, and job status. This is appropriate for the task, but the current display exposes a lot at once.

**Recommendation**

- Convert the flow into progressive sections with clearer completion states:
  - Customer
  - Material
  - Job details
  - Payment
  - Review
- Keep the sticky summary bar, but make it the main progress anchor: item count, total, balance, and review action.
- Hide quote lookup under a “Load existing quote” disclosure unless it is used frequently.
- Group width, height, quantity, and unit toggle into a single measurement module with a clearer visual relationship.

### 5. Accessibility needs more systematic coverage

Some controls have accessible labels, and the app avoids very small touch targets in the theme. There are still risks: icon-only buttons do not all expose labels, fixed bottom bars can obscure page content, dense chip text can be very small, and color is sometimes the main status signal.

**Recommendation**

- Add `aria-label` to every icon-only button.
- Ensure status chips use text plus icon or shape, not color alone.
- Raise tiny chip text from `0.5rem` and `0.5625rem` where it communicates important status.
- Verify focus states for custom button-like `Box` elements.
- Add enough bottom padding to every mobile page that has the floating bottom nav or sticky summary.

## Priority fixes

### High impact, low risk

1. **Unify navigation labels and destinations.** Use one nav config per role and derive sidebar, mobile drawer, and bottom nav from it.
2. **Create semantic status components.** Replace one-off chip styles with a shared status badge for payment, job, stock, and sync states.
3. **Centralize color and spacing tokens.** Reduce hardcoded `#ffffff`, `#C8472E`, `#f59e0b`, and repeated rgba strings.
4. **Reduce mobile top-bar utilities.** Keep only menu, brand/role, and one status affordance. Move extras into a menu.
5. **Increase tiny operational text.** Important labels under 11px should be raised, especially in dashboard cards and chips.

### Medium impact

1. **Refactor new-sale flow into progressive modules.** Keep all current functionality, but show fewer competing panels at the same time.
2. **Improve empty states.** Give every empty list a next action and a concise reason.
3. **Add role-aware page templates.** Standardize title, subtitle, actions, content width, and bottom padding across admin and cashier pages.
4. **Improve responsive spacing rhythm.** Use smaller top padding on mobile pages that already sit below a fixed header.
5. **Add a first-run hint for AI Log.** Explain when to use manual entry versus AI Log.

### Strategic polish

1. **Define a design context document.** The project currently has no `PRODUCT.md` or `DESIGN.md` for brand and product principles. Adding them will make future UI work more consistent.
2. **Use OKLCH/tinted neutrals.** The current palette uses direct hex and pure white in places. Tinted neutrals will feel less generic and more branded.
3. **Reduce repeated card patterns.** Use rows, sheets, inline groups, and section dividers where cards are not necessary.
4. **Make motion purposeful.** Keep tap feedback and entry transitions, but ensure reduced-motion behavior covers Framer Motion animations too.

## Suggested design principles for this app

- **Cashier speed over visual flourish.** The default path should help a cashier log a sale quickly while a customer is waiting.
- **One obvious next action.** Each page should have one dominant action and secondary actions should be visually quieter.
- **Operational confidence.** Sync, payment, stock, and job status should always be understandable at a glance.
- **Progressive complexity.** Expert tools like quote loading, AI extraction, stock warnings, and payment allocation should appear when relevant, not all at once.
- **Role clarity.** Admin and cashier experiences should share structure, but use clear role labels and avoid mixing destinations unexpectedly.

## Recommended next implementation order

1. Navigation config and label cleanup.
2. Shared `StatusBadge` and tokenized status colors.
3. New-sale form simplification and disclosure for quote loading.
4. Accessibility pass on icon buttons, custom buttons, status colors, and small text.
5. Product/design documentation for future consistency.
