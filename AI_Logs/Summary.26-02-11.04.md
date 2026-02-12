# Summary 26-02-11.04 — Light theme & CSS theming overhaul

## What was done

Replaced the dark-blue theme with a Chrome-like light theme and restructured all
CSS colour management to follow best practices for easy future theme changes.

### Theming architecture

- **Single source of truth:** All colour variables are defined in `src/index.css`
  under `:root`. No component file contains any hardcoded colour value.
- **Accent derivation:** Two CSS custom-property primitives (`--cb-hue: 240` and
  `--cb-sat: 70%`) are extracted from the CallerBuddy.svg logo colour
  `rgb(25, 25, 140)`. All accent shades (`--cb-accent`, `--cb-accent-hover`,
  `--cb-accent-light`, `--cb-accent-subtle`, `--cb-progress`, `--cb-singing`)
  are derived via `hsl()`/`hsla()` from these two primitives. Changing them
  re-themes every accent at once.
- **Organised variable groups:** ~30 variables organised into categories:
  - Accent primitives & derived shades
  - Surfaces (bg, panel-bg, tab-bar-bg, menu-bg, input-bg)
  - Text hierarchy (fg, fg-secondary, fg-tertiary, fg-on-accent)
  - Borders (border, border-strong)
  - Interactive states (hover, active, shadow)
  - Semantic colours (success, error, singing, patter)
  - Tab bar & progress slider specifics
- **Future dark mode:** Adding a dark theme would only require a
  `@media (prefers-color-scheme: dark)` or `.dark` class block that redefines
  these same variables — no component changes needed.

### Visual result

- White/light-gray surfaces matching Chrome's default appearance
- Dark text (`#202124`) with secondary/tertiary text levels
- Light gray borders (`#dadce0`)
- Deep blue accent from the SVG logo for buttons, active tabs, links, selected
  items
- `color-scheme: light` (was `dark`)

## Files touched

| File | Change |
|---|---|
| `src/index.css` | Complete overhaul — expanded from 8 variables to ~30 organised theme variables; switched to light colour scheme |
| `src/components/app-shell.ts` | Replaced all hardcoded colours and fallback values with `var(--cb-*)` references |
| `src/components/tab-bar.ts` | Same |
| `src/components/welcome-view.ts` | Same |
| `src/components/song-play.ts` | Same (largest change — had the most hardcoded rgba/hex values) |
| `src/components/playlist-play.ts` | Same |
| `src/components/playlist-editor.ts` | Same |
| `index.html` | Updated `<meta name="theme-color">` from `#1a1a2e` to `#dee1e6` |
| `public/manifest.json` | Updated `theme_color` to `#dee1e6` and `background_color` to `#ffffff` |

## Why

User requested a light theme modelled on Chrome's default appearance, with accent
colours derived from the CallerBuddy.svg blue. Also requested best-practice CSS
organisation so that theme changes are centralised and easy — no scattered
hardcoded colours.

## Verification

- `npx tsc --noEmit` passes cleanly
- Grep confirms zero hardcoded hex/rgb colour values remain in component files
- No linter errors introduced
