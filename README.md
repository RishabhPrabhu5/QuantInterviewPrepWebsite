# DeskPrep — Quant Interview Prep

A single-file quant trading interview trainer: **open `index.html` in any modern browser.** No server, no framework, no install, no build step required to *use* it. Question bank with graded answers, real Python running in the browser, and three simulated market-making games.

Everything runs client-side. Progress persists to `localStorage`. The only network access is a CDN fetch of the Python runtime, and only when you click "Run tests."

---

## Contents

- [Features](#features)
- [Running it](#running-it)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
- [Data model reference](#data-model-reference)
- [Extending the app](#extending-the-app)
- [Grading invariants](#grading-invariants)
- [Verification workflow](#verification-workflow)
- [Design system](#design-system)
- [Roadmap](#roadmap)

---

## Features

### Roadmap
Four staged tracks across 12 topics, from mental math through options and Fermi estimation. Progress bars are fed by your actual results. Includes playbooks for 10 firms — Jane Street, SIG, Citadel, HRT, Jump, D. E. Shaw, Five Rings, Optiver, IMC, Tower — each with an interview-process summary and a per-topic weighting that doubles as a click-through drill filter.

### Question Bank
**78 original questions** in the style of top-firm interviews, each with a hint and a worked solution that ends in the desk translation of the math (gambler's ruin → transaction costs, expected-max-of-*n*-normals → multiple-testing correction, and so on).

- **64 are auto-graded.** Type an answer and get feedback. The parser accepts fractions (`2/11`), decimals, percents, scientific notation, and `k`/`M`/`B`/`T` suffixes; Fermi questions grade within an order-of-magnitude factor.
- **14 are discussion questions** — no single number, self-rated against the solution.
- Difficulty split: 38 easy / 29 medium / 11 hard. "Hard" means *actually* hard (100 prisoners, ABRACADABRA via optional stopping, attenuation bias, Gaussian orthant probabilities).
- Misses and Again/Hard ratings feed the review queue and per-topic skill scores automatically.

### Coding
Real Python in the browser via [Pyodide](https://pyodide.org/). Two tracks:

- **Algorithms** (10) — HRT/Jump-style screens. Warmups (two-sum, buy-and-sell-once) up through the real thing: a **limit-order matching engine** with best-price-then-FIFO priority and partial fills, a two-heap **running median**, monotonic-deque **sliding-window max**, trapping rain water, and dependency-graph cycle detection.
- **Data & ML** (6) — the research screen. Three warmups (`pct_change`, `cummax` drawdown, rolling SMA crossover), then three problems with deliberately filthy preloaded datasets: mixed-case categoricals, `-1`/`0`/`-999` missing-value sentinels, NaNs, duplicated rows from a simulated merge bug, and fat-fingered prices. You clean, feature-engineer, fit, and predict — graded on held-out MAE with thresholds set so that group means alone fail the hidden bar.

Every problem has hidden tests alongside the visible ones, and a collapsible reference solution.

### Desk Coach
Sits under every coding problem, in three escalating layers:

1. **Live syntax review as you type** — once Pyodide has loaded, this is a real Python `compile()` call, so it reports genuine `SyntaxError` line numbers. Before that it falls back to bracket-balance checks.
2. **Offline coach** — three staged hints per problem, a regex checklist code review tuned per problem (*"Duplicated training pets are still in — `drop_duplicates(subset='pet_id')`"*), pandas/heapq anti-pattern detection (`iterrows`, row loops), and a syntax knowledge base covering groupby, merges, dummies, `lstsq`, imputation, rolling windows, heaps, and deques.
3. **Optional conversational coaching** — connect your own Anthropic API key via the ⚙ panel for a Socratic coach that sees the problem, your current code, and your latest test failures. The key is held in page memory only, never persisted, and requests go directly from your browser to `api.anthropic.com`.

### Trading Floor
Three bot-driven games, all with informed flow mixed into the order flow, so careless quotes get picked off exactly as they would onsite.

- **Dice market making** — quote two-sided on the sum of *n* hidden dice across three rounds with progressive reveals. ~35% of arriving bots have peeked. Settlement decomposes your P&L into *versus informed* and *versus noise*, which is the actual lesson.
- **Vol curve fitting** — drag your mid-vol curve across strikes on a canvas. Some quotes are noisy, some are flat-out stale, and a true smile hides underneath. Then 20 orders hit you and you're marked to truth, minus $200 per no-arbitrage violation (negative butterfly, adjacent-strike cliff) — the same convexity and monotonicity checks a real vol fitter runs.
- **Fermi market** — a live three-minute continuous limit order book on an estimation question, against 10 bots in five behavioral styles (informed, fundamental, anchored, momentum, noise) with per-style mean-reversion toward truth. Settles at the researched answer, with a derivation panel.

### Progress
Solved counts, first-try accuracy, per-topic skill scores (weakest first, since that's your study order), "Focus next" recommendations, the auto-collected review queue, a recent-activity log, and JSON export/import.

---

## Running it

```bash
open index.html
```

That's the whole story for using it. For development:

```bash
./build.sh          # concatenate src/parts/* -> index.html
```

**Never edit `index.html` directly** — it is generated output and the next build will silently overwrite your changes. Edit the relevant file in `src/parts/`, rebuild, refresh the browser.

**Hosting:** GitHub Pages works as-is — Settings → Pages → deploy from branch, root. No build action needed, since `index.html` is committed.

**Offline behavior:** everything works offline except the coding tracks. The Python runtime downloads from a CDN on the first "Run tests" (the Data & ML track pulls pandas + numpy, roughly 15 MB more, once). Sandboxed environments that block CDN scripts will fail gracefully with an in-app explanation rather than breaking.

---

## Repository layout

```
index.html            generated single-file app — do not edit (231 KB)
build.sh              cat the six parts into index.html
CLAUDE.md             context handoff for AI coding sessions
src/parts/
  p1_head.html        HTML shell, all CSS, nav tabs, modal scrim
  p2_data.js          STAGES, TOPICS, QUESTIONS, FIRMS, FERMI_MARKETS
  p3_app.js           state, Store, tab router, answer checker, bank, Progress
  p4_coding.js        CODING_PROBLEMS, Pyodide Runtime, test harness, Coach, Coding UI
  p5_games.js         Floor hub, DiceGame, VolGame, FermiGame, boot
  p6_tail.html        closing tags
```

The split is by section, and the concatenation order is load order. `p1` opens `<style>`/`<body>`/`<script>`; `p2`–`p5` are the script body; `p6` closes the tags.

---

## Architecture

No framework, no bundler, no modules. One `<script>` block in which the parts share top-level `const` declarations by concatenation order — `p3` can reference `CODING_PROBLEMS` from `p4` because everything is evaluated before the boot code at the bottom of `p5` runs.

**Rendering.** Five `<section>` views, one per tab. `switchView(name)` toggles `.active` and calls that view's render function, which rebuilds its subtree with a template string and re-binds listeners. There is no virtual DOM and no reactive layer: state changes are followed by an explicit re-render call. All interpolated content passes through an `esc()` helper.

**State.** A single global `state` object:

```js
state = {
  ratings,      // qid -> 1 (again) | 2 (hard) | 3 (good) | 4 (easy)
  qstats,       // qid -> { att, ok, first }   answer-checker outcomes
  codingStatus, // pid -> 'passed' | 'attempted'
  codingAtt,    // pid -> run count
  history,      // [{ t, kind: 'q'|'code', id, ok }], capped
  pnlTotal,     // cumulative trading-game P&L
  view, bankFilters
}
```

**Persistence.** `Store` wraps `localStorage` under the key `deskprep_progress_v1`, behind a feature-detect `try/catch` so that sandboxed previews which block storage degrade to in-memory rather than throwing (the Progress tab shows a banner explaining this). Coding drafts persist alongside progress. Export/import moves the whole blob as JSON.

**Python execution.** `Runtime` lazily loads Pyodide, trying jsDelivr `v0.26.4` first and falling back through two cdnjs mirrors; pandas and numpy load on demand for the Data & ML track only. `buildRunnerScript()` then generates a Python harness that:

1. execs the problem's `setup` string (dataset generation) into a namespace `_g`,
2. execs the user's code into the same namespace,
3. `eval`s each test's `call` and `expected` expressions with stdout captured,
4. compares with a `_deep_eq` that uses `math.isclose(rel_tol=1e-6, abs_tol=1e-9)` on numerics, recurses through lists and dicts, and compares bools exactly,
5. returns JSON, which the UI renders per test case.

The trade-off worth knowing: setup and user code share one namespace, so a determined user can read the held-out truth arrays directly. That is acceptable for a solo practice tool — it is honor-system by construction, like the reference solutions.

**Games** run on `setTimeout`/`setInterval` handles collected in `Floor.timers` so that `Floor.stopAll()` can cancel everything on navigation; `switchView` is wrapped at boot to call it. Charts are hand-rolled Canvas 2D with device-pixel-ratio scaling.

---

## Data model reference

### A question (`p2_data.js`)

```js
{
  id: "p1",                    // unique, stable — progress is keyed on it
  topic: "prob1",              // must match a TOPICS id
  diff: 1,                     // 1 easy | 2 medium | 3 hard
  firms: ["js", "sig"],        // must match FIRMS ids
  title: "Sum is 8, given a six",
  prompt: "...",               // the question as asked
  hint: "...",                 // one nudge, revealed on demand
  solution: "...",             // worked solution; \n for line breaks
  ans: { t: "n", v: 0.18182, rel: 0.03, pct: 1, label: "P(sum = 8 | at least one 6)" }
}
```

Omit `ans` entirely to make it a discussion question.

### Answer specs

| Field | Meaning |
|---|---|
| `t` | `"n"` for a numeric answer, `"f"` for Fermi order-of-magnitude |
| `v` | the correct value |
| `rel` | relative tolerance (default `0.01` when neither `rel` nor `abs` is given) |
| `abs` | absolute tolerance |
| `factor` | `t:"f"` only — accept anything within this multiplicative factor either direction |
| `pct` | `1` means a bare `18` is also read as `18%`, i.e. `0.18` |
| `label` | shown above the input, tells the user what units to answer in |

An integer `v` with no explicit tolerance requires an exact match, with a "close" band of `max(1, 2%)`.

### A coding problem (`p4_coding.js`)

```js
{
  id: "a7", mode: "algo",      // "algo" | "data"
  diff: 3,
  title: "Running Median",
  desc: `...`,                 // statement, example, and the target complexity
  hints: [ "...", "...", "..." ],        // staged, revealed one at a time
  review: [ { re: "heapq", miss: "No heapq usage — ..." } ],  // regex checklist
  setup: TICKS_SETUP,          // optional Python string, data mode only
  starter: `def running_median(nums):\n    pass\n`,
  solution: `...`,             // reference implementation
  tests: [ { call: "...", expected: "...", show: true, label: "..." } ]
}
```

`show: false` makes a test hidden — it still runs and still gates the pass, but the user sees only the label or "hidden test *n*". The function name the tests call is inferred from `starter` via `/def\s+(\w+)/`, so the starter's signature is load-bearing.

---

## Extending the app

**Adding a question.** Append an object to `QUESTIONS` in `p2_data.js` (there is a `QUESTIONS.push(...)` block at the bottom for later additions), using a fresh `id`. Reuse existing `topic` and `firms` ids. Rebuild. Nothing else needs touching: the roadmap counts, filters, skill scoring, and review queue all derive from the array.

**Adding a coding problem.** Append to `CODING_PROBLEMS` in `p4_coding.js`. Write the reference solution first, then derive the expected test values *by running it* — never by hand. If the problem needs a dataset, add a `setup` string and see the invariants below.

**Adding a Fermi market.** Append to `FERMI_MARKETS` with `{ q, unit, truth, tick, decimals, derivation }`. Pick `tick` so the book reads cleanly at the scale of `truth`, and make `unit` explicit ("millions of seconds") since players quote in it.

---

## Grading invariants

Break any of these and grading silently breaks.

**Datasets are deterministic and their expected values are hard-coded.** They are generated in-page by Python `setup` strings seeded with `np.random.default_rng(7)` (pets), `(11)` (ticks), `(21)` (rent). **Do not change the seeds, the generation order, or the row counts** — every expected test value was computed from those exact random streams. Verified reference values:

| Problem | Baseline | Hidden bar | Reference solution |
|---|---|---|---|
| Clean the Tick Tape | — | exact: `{'n_good': 470, 'vwap': 100.64}` | — |
| Pet Insurance Claims | naive mean MAE ≈ 101.2 | MAE < 55 (species means ≈ 65 **fail**) | `lstsq` ≈ 41.7 |
| Rent Prediction | naive mean MAE ≈ 620 | MAE < 220 | full clean + `lstsq` ≈ 134 |

The hidden bars are calibrated so that lazy solutions provably fail: a global mean loses to the baseline, and group means alone miss the bar. If you change a dataset, re-derive every bar.

**Pyodide fallbacks exist for a reason.** Sandboxed and embedded environments block some CDNs entirely. Every failure path already has a graceful in-app message — don't remove the fallback chain or the error handling.

---

## Verification workflow

Run all four before any release.

1. **Build and syntax-check.** `./build.sh`, then extract the `<script>` body and `node --check` it. The parts are not individually valid programs, so check the concatenation.
2. **Python harness test.** Replicate `buildRunnerScript()`'s output under CPython with pandas installed. All 16 reference solutions must pass all tests — *and* deliberately lazy solutions (global mean, uncleaned groupby) must fail the hidden bars.
3. **Headless browser run.** Click every tab; answer a question wrong, then right; run a coding problem; play a dice round; settle the vol and Fermi games; reload to confirm the persistence round-trip. Assert zero page errors.
4. **Screenshot and eyeball the layout.**

---

## Design system

Dark theme only, built from a validated dataviz palette. CSS custom properties live at the top of `p1_head.html`.

| Token | Value | Use |
|---|---|---|
| `--page` / `--surface` | `#0d0d0d` / `#1a1a19` | page and card backgrounds |
| `--ink` / `--ink-2` / `--ink-muted` | `#fff` / `#c3c2b7` / `#898781` | text hierarchy |
| `--s1` / `--s2` | `#3987e5` blue / `#d95926` orange | validated series pair on dark |
| `--good` / `--critical` | `#0ca30c` / `#d03b3b` | also bid / ask |
| `--warning` | `#fab219` | needs-review state |
| `--grid` | `#2c2c2a` | chart gridlines |

Conventions: player and primary series are blue; truth curves are dashed orange; charts are Canvas with muted grid and monospace tick labels; UI text is `system-ui`, numbers are monospace.

---

## Roadmap

1. **React + Vite port ("v4")** — components per section, question bank extracted to JSON data files, a spaced-repetition scheduler layered on the review queue, code-split Pyodide loading. Must carry over all current behavior: answer checking, the coach, and progress tracking.
2. **Content growth** — bank toward 150+ questions, respecting the difficulty calibration. More Data & ML problems; next one planned is time-series trade/quote alignment with a look-ahead-bias trap.
3. **Trading floor improvements** — deferred.
