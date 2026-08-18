# DeskPrep — Quant Interview Prep (project context)

Context handoff from the Cowork session that built v1–v3 of this app. Read this before making changes.

## Who this is for

Rishabh (CMU) is prepping for quant trading/research interviews at top firms (Jane Street, SIG, Citadel, HRT, Jump, D. E. Shaw, Five Rings, Optiver, IMC, Tower). He has real interview experience — e.g. a Jump Trading data screen where he was given two years of pet + insurance-claim data and asked to predict year-2 claims. The app's Data & ML track is modeled directly on that.

- GitHub repo: https://github.com/RishabhPrabhu5/QuantInterviewPrepWebsite
- Local checkout: `/Users/rprabhu/Library/CloudStorage/OneDrive-andrew.cmu.edu(2)/Coding Projects/Quant_Interview_Prep`

## What the app is

A **single-file HTML app** (`index.html`) — no server, no framework, no build step to use. Open it in a browser. Everything (CSS, data, logic) is inlined.

`index.html` is **generated**: source lives in `src/parts/`, concatenated by `./build.sh`. **Never edit index.html directly** — edit the part, rebuild.

| Part | Contents |
|---|---|
| `p1_head.html` | HTML shell, all CSS (dark trading theme), nav tabs, modal scrim |
| `p2_data.js` | `STAGES`, `TOPICS` (12), `QUESTIONS` (78), `FIRMS` (10 w/ topic weights), `FERMI_MARKETS` (10) |
| `p3_app.js` | `state`, `Store` (persistence), tab router, roadmap, question bank + answer checker, Progress tab |
| `p4_coding.js` | `CODING_PROBLEMS` (16), Pyodide `Runtime`, python test-harness builder, `Coach`, `Coding` UI |
| `p5a_cards.js` | `HighShow`, `BlackRed` card games (concatenated before p5; declarations only) |
| `p5b_drills.js` | `runDrill` engine + `MentalDrill`, `SeqDrill`, `FermiDrill`, `REAL_FERMI` bank |
| `p5_games.js` | `Floor` hub + `DiceGame`, `VolGame`, `FermiGame`; boot code at the bottom — must stay last |
| `p6_tail.html` | closing tags |

## Feature summary (v3, all working & browser-tested)

1. **Roadmap** — 4 stages → 12 topics with progress bars; firm playbooks with per-topic weight bars; click-through drills filter the bank.
2. **Question Bank** — 78 original questions (title/prompt/hint/solution/diff/firms). 64 have machine-checkable answers (`ans` field); 14 are discussion questions (self-rated). Filters: topic/firm/difficulty/status. Modal flow: answer input → check → feedback → auto-open solution on correct → self-rate (Again/Hard/Good/Easy).
3. **Coding** — two tracks, real Python in-browser via Pyodide:
   - *Algorithms* (10): warmups → HRT/Jump-hard (matching engine w/ price-time priority, running median two-heap, sliding-window max, trapping rain water, course-schedule cycle detection).
   - *Data & ML* (6): 3 warmups + 3 messy-data→prediction problems with preloaded deterministic datasets and MAE-based hidden grading bars (see "Data problem invariants").
   - *Desk Coach* under every problem: live lint as you type (python `compile()` when runtime loaded, bracket checks otherwise), 3 staged hints per problem, regex-checklist "Review my code", offline syntax KB chat; optional user-supplied Anthropic API key (⚙) for real conversational coaching — key held in page memory only, direct browser→api.anthropic.com calls with `anthropic-dangerous-direct-browser-access` header.
4. **Trading Floor** — five market games + three timed drills (expanded Aug 2026 at Rishabh's request; the old "deprioritized" note no longer applies): dice-sum market making, vol-curve fitting, Fermi order-book market, High Show (optimal stopping w/ 5 penalty functions, hidden K estimated at the end), Black − Red (poker-shaped market making, bots trade your quotes street by street). Drills share `runDrill` in p5b (duration/count, typing/MC, skips, auto-advance, −1 penalties, per-mode bests in `state.drillBests`): Mental Math (presets incl. Optiver 80-in-8 style + custom ops), Sequences (3 difficulty pools), Fermi estimation (math scored on relative error, real-world on log10 ratio, ≥0.9 = correct). Game PnL flows into the session tracker.
5. **Progress** — solved counts, first-try accuracy, per-topic skill scores (blend of checker results + self-ratings, weakest first) with drill buttons, "Focus next" recommendations, auto-collected review queue (misses + Again/Hard), recent activity log, JSON export/import, reset.
6. **Persistence** — `Store` wraps localStorage (key `deskprep_progress_v1`) behind a feature-detect try/catch; falls back to in-memory (claude.ai artifact previews block storage — a banner in Progress explains). Coding drafts persist too.

## Owner preferences (learned, respect these)

- **Difficulty calibration**: Rishabh found standard difficulty labels inflated. Classics (ropes, Bayes test, coupon collector, 25 horses) are Easy/Medium for him. "Hard" must be *actually* hard (100 prisoners, ABRACADABRA, attenuation bias, orthant probabilities tier). Current mix: 38 easy / 29 medium / 11 hard.
- **Coding bar**: HRT/Jump level. He wants problems that would appear in real screens, not toy warmups (warmups exist but are labeled as such).
- **Data problems**: messy realistic data (mixed-case categoricals, sentinels like −1/0/−999, NaNs, duplicated rows) → clean → model → predict, graded on held-out MAE with thresholds that force real modeling (group means must fail the hidden bar).
- **Trading floor**: actively growing again (Aug 2026) — he asked for High Show, Black − Red, and the three drills. Match the existing informed-vs-noise decomposition style when adding games.
- **Answer input**: he wants to type answers and get graded feedback, not just self-rate. Wrong answers must feed the review queue and skill tracking.

## Critical invariants (break these and grading breaks)

- **Data problem datasets are deterministic**: generated in-page by `setup` python strings using `np.random.default_rng(7)` (pets), `(11)` (ticks), `(21)` (rent). **Do not change seeds, generation order, or row counts** — every expected test value was computed from these exact streams. Verified values: ticks `{'n_good': 470, 'vwap': 100.64}`; pets naive MAE ≈ 101.2, species-mean ≈ 65 (fails hidden bar 55), reference lstsq ≈ 41.7; rent naive ≈ 620, hidden bar 220, reference ≈ 134.
- **Test harness semantics** (`buildRunnerScript` in p4): tests are python expression pairs `{call, expected}` eval'd in a namespace `_g` after `import pandas as pd / numpy as np` (data mode), then `setup`, then user code. Comparison `_deep_eq`: floats `isclose(rel=1e-6, abs=1e-9)`, recursive lists/dicts, bools exact.
- **Answer checker** (`checkAnswer` in p3): specs `{t:'n'|'f', v, rel?, abs?, pct?, factor?, label}`. Integer `v` with no explicit tol ⇒ exact match required, near-band = max(1, 2%). `pct:1` accepts bare numbers as percents (18 ⇒ 0.18). `'f'` (Fermi) grades within `factor`× either direction. Parser accepts fractions, %, k/M/B/T suffixes, scientific, −.
- **Pyodide loading**: tries jsdelivr v0.26.4 → cdnjs fallbacks; pandas via `loadPackage`. Sandboxed previews may block CDNs entirely — every failure path has a graceful in-app message. Don't remove the fallbacks.

## Design system

Dark theme from a validated dataviz palette (CSS vars in p1): page `#0d0d0d`, surface `#1a1a19`, series blue `#3987e5` / orange `#d95926` (validated pair on dark), good `#0ca30c`, critical `#d03b3b`, warning `#fab219`, ink `#fff/#c3c2b7/#898781`, grid `#2c2c2a`. Bid/ask = good/critical. Truth curves = dashed orange, player/series = blue. Keep charts on canvas with muted grid + mono labels, sans-serif UI (`system-ui`).

## Verification workflow (used for every release; keep doing this)

1. `./build.sh`, then extract the `<script>` body and `node --check` it.
2. Python harness test: replicate `buildRunnerScript` output with CPython (+pandas) — all 16 reference solutions must pass all tests, and lazy solutions (global mean, uncleaned groupby) must fail the hidden bars.
3. Playwright headless run: click every tab, answer a question wrong+right, run a coding problem, play a dice round, settle vol + Fermi games, reload to verify persistence roundtrip, assert zero `pageerror`s.
4. Screenshot and eyeball layout.

## State of the world (as of handoff)

- Repo is committed locally in the Cowork sandbox and delivered to Rishabh as `deskprep-repo.bundle`; **the push to GitHub has NOT been confirmed** — the Cowork sandbox git proxy refused (repo not in session sources). First job in a repo-attached session: verify remote state, push `main` if empty, or reconcile if Rishabh already pushed the bundle.
- A PAT was pasted into the old chat and should be revoked — never needed again once the session has repo access; remind him if relevant.
- GitHub Pages suggested but not yet enabled (works as-is: deploy from branch, root, `index.html`).

## Agreed roadmap (not yet built)

1. **React + Vite port** ("v4"): components per section, question bank as JSON data files, localStorage + **spaced-repetition scheduler** on top of the review queue, code-split Pyodide loading, deployable to Pages/Vercel. Carry over ALL v3 behavior (answer checking, coach, tracking).
2. **Content growth**: bank toward 150+ questions (respect the difficulty calibration), more Data & ML problems — next one discussed: a time-series trade/quote alignment problem with a look-ahead-bias trap.
3. **Trading floor improvements**: deferred until Rishabh asks.
