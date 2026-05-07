# Summary 2026-05-06.03 — Document landscape vs portrait; zoom from `visualViewport.scale`

## Content

- Expanded `main.ts` banner: landscape usually **looks** OK because **the same wrong
  layout width** (~980px) is fitted into a **wide** window (mild
  `visualViewport.scale`, e.g. ~0.77) vs **narrow** portrait (~0.37)—not because
  metrics are correct.
- Listed **accurate signals**: `screen.*`, `visualViewport.scale`, `outerWidth`;
  `innerWidth` unreliable as ground truth on this WebAPK.
- `syncZoomCompensation()` now prefers **`zoom ≈ 1 / visualViewport.scale`**
  when scale &lt; 1 (neutralize shrink), else `innerWidth / expectedEdge`.
- BACKLOG updated; version `0.1.0-pre.27`.
