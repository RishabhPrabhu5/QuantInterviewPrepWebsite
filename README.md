# DeskPrep — Quant Interview Prep

A single-file quant interview prep app: open `index.html` in any modern browser. No server, no build step required to *use* it.

## Features

- **Roadmap** — 4 staged tracks across 12 topics, progress fed by your results, plus playbooks for 10 firms (Jane Street, SIG, Citadel, HRT, Jump, D. E. Shaw, Five Rings, Optiver, IMC, Tower) with per-topic weightings.
- **Question Bank** — 78 original questions in the style of top-firm interviews, with hints, worked solutions, and an answer checker (64 auto-graded: fractions, decimals, percents, order-of-magnitude for Fermi; 14 discussion questions self-rated).
- **Coding** — real Python in the browser via Pyodide. Two tracks:
  - *Algorithms*: HRT/Jump-style screens (matching engine, running median, sliding-window max, …) with hidden tests.
  - *Data & ML*: preloaded messy datasets (sentinels, NaNs, case-corrupted categoricals, duplicated rows) you clean, model, and get graded on by held-out MAE — modeled on Jump's data screen.
  - *Desk Coach*: live syntax review as you type, staged hints, checklist code review; optionally connect your own Anthropic API key (⚙ in the coach panel) for conversational AI coaching. The key stays in page memory only.
- **Trading Floor** — three bot-market games: dice-sum market making with progressive reveals and informed flow, vol-curve fitting against a hidden smile with no-arb penalties, and a 3-minute Fermi estimation market with a live order book.
- **Progress** — solved tracking, first-try accuracy, weakest-topic skill assessment, auto-collected review queue, recommendations, JSON export/import. Persists via localStorage when opened locally.

## Development

Source lives in `src/parts/` (one file per section); `./build.sh` concatenates them into `index.html`. Edit parts, rebuild, refresh.

| Part | Contents |
|---|---|
| `p1_head.html` | HTML shell, theme CSS |
| `p2_data.js` | question bank, firm profiles, Fermi market data |
| `p3_app.js` | state, persistence, roadmap, question bank, answer checker, progress tab |
| `p4_coding.js` | coding problems, Pyodide runner, Desk Coach |
| `p5_games.js` | the three trading games |
| `p6_tail.html` | closing tags |

Notes:
- The Python runtime loads from a CDN on first "Run tests" (pandas ~15 MB extra for the Data & ML track). Everything else is fully offline.
- To host it, GitHub Pages works as-is (Settings → Pages → deploy from branch, root).

## Roadmap

Planned next: React + Vite port with per-question data files, spaced-repetition review scheduling, and an expanded (~150+) question bank.
