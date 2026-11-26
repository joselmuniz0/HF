# HF Coach — UI/UX system and user color customization

## Objective
Begin a controlled visual redesign without changing existing training/video-analysis logic. Establish reusable design tokens and mobile-first layout rules. The default HF Coach theme uses the Argentine national flag as its inspiration; every user can change the accent color from the general user menu.

## Default theme: Argentina
- Primary accent (celeste): `#75AADB`
- Accent highlight (sun): `#F6B40E` — reserved for highlights, not primary action buttons by default
- White: `#FFFFFF`
- Neutral background/surface/text tokens must support both light and dark appearance and maintain readable contrast.
- The flag is inspiration for the color palette, not a requirement to use literal flag graphics throughout the UI.

## Personalization
In the general user menu, add a **Appearance / Color theme** entry:
1. Default: Argentina (celeste).
2. Palette presets (curated accessible choices).
3. Custom color selector (hex and native color picker, where supported).
4. Preview of buttons, links, active tabs, selected controls and focus state.
5. Save / Cancel / Restore default.
6. The chosen accent must not replace semantic colors (success, warning, error), and text/background combinations must preserve contrast. If a user chooses a low-contrast color, derive accessible foreground and/or use a safe contrast fallback.

## Persistence
- Unauthenticated/guest: persist on device.
- Signed-in account: persist as a user preference and load on login across devices, while retaining a local cache for fast startup/offline use.
- Preference should be scoped to the user's profile, never global to the app or shared with another account on the same device.
- Use a schema compatible with existing profile/preferences data; do not introduce a migration until the current profile structure is inspected.

## Design tokens
Implement semantic tokens, not direct color literals in component styles:
- `--hf-accent`
- `--hf-accent-foreground`
- `--hf-accent-soft`
- `--hf-focus-ring`
- `--hf-surface`, `--hf-surface-raised`, `--hf-background`
- `--hf-text`, `--hf-text-muted`, `--hf-border`
- semantic status tokens remain independent.

## UI redesign priorities
1. Header and general navigation: eliminate title/button overlap; make navigation compact and responsive.
2. Video analysis: clearly grouped athlete, movement, video upload and analyze action; keep the working five-lift selector.
3. Dashboard.
4. Athlete profile.
5. Planning.
6. Library and secondary forms.

## UX constraints
- Mobile-first, touch targets at least 44 CSS px where practical.
- Keep visible content hierarchy and consistent spacing, radius, typography, iconography.
- Active/selected states must be distinguishable without color alone.
- Avoid decorative gradients, excessive cards, and oversized navigation.
- No functional regressions; verify Android and web after each module.
- Preserve the lift selector labels and options as validated by the audit.

## Rollout
Work in branch `feature/ui-system-argentina`, based on the verified Android selector audit branch. Implement theme tokens and color preference first, then header/navigation and Video Analysis. Do not merge into main or publish until user testing approves.
