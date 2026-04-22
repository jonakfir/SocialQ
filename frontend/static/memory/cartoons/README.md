# Cartoon Art — "Good with Faces" memory game

Drop one image per emotion here. The engine auto-picks up files named by
emotion `id` (see `src/lib/memoryGame/emotions.ts`). The card renderer prefers
`.webp` over `.png`, and uses `<name>@2x.png` when the device pixel ratio is ≥ 2
(standard retina fallback — see `Card.svelte`).

## Conventions

- **Name**: exactly the emotion `id`, lowercase, no spaces. e.g. `happy.png`,
  `overjoyed.webp`, `hopeful.png`.
- **Format**: `.webp` is preferred for size; `.png` works as a fallback.
- **Aspect ratio**: square (1:1) with transparent background. The card front
  is white, so transparent PNGs render cleanly.
- **Size**: ≥ 512×512 is plenty. Retina users will get `@2x.png` if provided.
- **Style**: keep the feelings-wheel color palette in mind — each emotion has
  a hex color (see `emotions.ts`) that's used as the card border.

If a file is missing for an emotion, the engine falls back to that emotion's
emoji — so partial rollouts are safe.

## All 44 emotion ids

### Tier 1 — Core (7)
- `happy`, `sad`, `angry`, `fearful`, `disgusted`, `surprised`, `bad`

### Tier 2 — Mid-level (25)
**Happy family**: `joyful`, `content`, `peaceful`, `proud`, `grateful`, `inspired`
**Sad family**: `lonely`, `depressed`, `hurt`, `hopeless`
**Angry family**: `furious`, `frustrated`, `hostile`, `humiliated`
**Fearful family**: `anxious`, `overwhelmed`, `insecure`
**Disgusted family**: `revolted`, `judgmental`
**Surprised family**: `amazed`, `confused`, `excited`
**Bad family**: `bored`, `ashamed`, `tired`

### Tier 3 — Granular (17)
**Under joyful**: `overjoyed`, `delighted`, `elated`
**Under content**: `amused`, `relieved`
**Under peaceful**: `hopeful`, `serene`
**Under lonely**: `abandoned`, `isolated`
**Under furious**: `enraged`, `bitter`
**Under frustrated**: `annoyed`, `impatient`
**Under anxious**: `worried`, `terrified`
**Under amazed**: `astonished`, `awestruck`

---

*JRW alpha art motif goes here. Partial drops are fine.*
