# Summary 2026-04-08 (03) — Tier 3 backlog + Tier 4

## Backlog / product decisions

- **BACKLOG.md**
  - OPFS caching: design note updated to **deferred post–V1** with rationale (complexity vs. uneven offline pain across Android vs desktop/cloud folders).
  - Open issue for OPFS marked **deferred**; ties ZIP onboarding priority to V1 without blocking on OPFS.
  - **ZIP import in V1** called out under Design Decisions (single-ZIP onboarding + heuristics).
  - Features list: ESLint TypeScript setup and Playwright E2E in CI marked **done** with pointers to scripts/workflow.
- **FUTURE.md**
  - Long-form ZIP/lyrics item marked **done** for the V1 slice; notes that multi-ZIP batch remains future work.

## Tier 4 implementation

13. **Data-driven MP3 scoring** — New `src/services/mp3-candidate-scoring.ts` holds `scoreSingleMp3` / `scoreMp3Candidates` with rule tables (`FORMAT_BY_EXT`, vocal filename rules, label-suffix scorer, ordered parenthetical rules). `song-onboarding.ts` re-exports types and delegates scoring.

14. **`song-play` split** — `song-play-styles.ts` (Lit `css` template), `song-play-partials.ts` (`renderPatterControls`, `renderTransport`, `renderSlider` with explicit ctx objects). `song-play.ts` wires partials and keeps behavior/handlers.

15. **ESLint + TypeScript** — `eslint@8`, `@typescript-eslint/parser` + `plugin`, `.eslintrc.json` extends `recommended` for both. `npm run lint` runs on `src/**/*.ts`. Fixed reported issues: fullscreen API typings in `app-shell.ts`, `prefer-const` in `audio-engine.ts`, regex/escape and `no-control-regex` in `html-scraper.ts`.

16. **`useUnknownInCatchVariables`** — Enabled in `tsconfig.json`. Added `formatUnknownError` in `format.ts` and used it in `song-onboard` catch paths; tests in `format.test.ts`.

17. **E2E in CI** — `package.json` `ci` runs `build`, `test`, `lint`, `e2e`. `.github/workflows/deploy-preview.yml` installs Chromium via `npx playwright install --with-deps chromium` before `npm run ci`.

## Files touched (high level)

- Docs: `BACKLOG.md`, `FUTURE.md`
- New: `src/services/mp3-candidate-scoring.ts`, `src/components/song-play-styles.ts`, `src/components/song-play-partials.ts`, `.eslintignore`
- Edited: `song-onboarding.ts`, `song-play.ts`, `format.ts`, `format.test.ts`, `tsconfig.json`, `package.json`, `.eslintrc.json`, workflow, `app-shell.ts`, `audio-engine.ts`, `html-scraper.ts`, `song-onboard.ts`

## Verification

- `npm run ci` (build, Vitest, ESLint, Playwright) passed locally.
