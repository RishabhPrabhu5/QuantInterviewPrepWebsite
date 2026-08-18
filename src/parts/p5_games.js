/* ============================================================
   p5_games.js — part 5 of 6. The Trading Floor, plus the app's boot code.
   ============================================================
   Sections below, in order:
     1. helpers      randn() Box-Muller, clamp, pick, setupCanvas (DPR-aware)
     2. Floor        the game hub and the timer registry
     3. DiceGame     market making on the sum of hidden dice
     4. VolGame      fitting a vol smile against noisy and stale quotes
     5. FermiGame    a live limit order book on an estimation question
     6. BOOT         the code that actually starts the app — see bottom

   BOOT ORDER MATTERS. The last lines of this file are the app's entry point,
   and they run only because every const in p2-p4 has already been evaluated
   by then. switchView is wrapped there to call Floor.stopAll() on any
   navigation away from the floor, which is what prevents a game's interval
   callbacks from firing into a DOM that no longer exists.

   TIMER DISCIPLINE. Games are driven by setTimeout/setInterval, never rAF.
   Always schedule through Floor.after()/Floor.every() so the handle lands in
   Floor.timers and stopAll() can cancel it; a bare setTimeout here leaks a
   callback that will throw on a destroyed view.

   SHARED DESIGN. All three games mix INFORMED and NOISE counterparties, and
   all three decompose the player's P&L along that split at settlement,
   because the lesson is the decomposition rather than the total: a market
   maker's profit is noise income minus the informed tax. Bots value the
   contract, compare that value to the player's quotes, and trade when they
   see edge — the player is always the passive side except in FermiGame.
   Settlement P&L flows through addPnl() into the session tracker in p3.

   Per-game notes:
     DiceGame   truth = sum of n hidden dice; model fair value is revealed
                dice + 3.5 per unrevealed one. 3 rounds with progressive
                reveals, ~35% of arrivals informed. Quote size caps fills per
                side. Settlement reports markouts vs informed and vs noise.
     VolGame    a hidden true smile (base + skew*m + curv*m^2) with per-strike
                noise and, above level 1, deliberately STALE quotes. The
                player drags mid-vols on canvas and sets one spread; 20 orders
                then arrive and each fill is marked to truth. Penalties fire
                on negative butterflies and adjacent-strike cliffs — the same
                convexity and monotonicity checks a real fitter runs.
     FermiGame  a genuine continuous double-auction: submit() crosses against
                resting orders best-price-first, executes at the resting
                price, and rests any remainder. 10 bots in 5 styles
                (informed / fund / anchored / momentum / noise) with per-style
                mean-reversion kappa toward truth requote every ~650 ms.
                Player gets limit and market orders on both sides. Settles at
                the researched answer from FERMI_MARKETS after 3 minutes.

   Charts are hand-rolled Canvas 2D. setupCanvas() handles devicePixelRatio,
   so draw in CSS pixels and let it scale; colors come from the p1 palette.
   ============================================================ */
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function setupCanvas(c, hCss) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth || 600;
  c.width = Math.round(w * dpr); c.height = Math.round(hCss * dpr);
  c.style.height = hCss + "px";
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h: hCss };
}

const Floor = {
  timers: [],
  after(fn, ms) { const id = setTimeout(fn, ms); this.timers.push(id); return id; },
  every(fn, ms) { const id = setInterval(fn, ms); this.timers.push(id); return id; },
  stopAll() { this.timers.forEach(id => { clearTimeout(id); clearInterval(id); }); this.timers = []; },

  renderHub() {
    this.stopAll();
    $("#view-floor").innerHTML = `
      <h1>Trading Floor</h1>
      <p class="lede">Simulated versions of the games real desks run in final rounds, plus the timed drills from the online
      assessments. Bots include informed flow — if your quotes are careless, you <i>will</i> be picked off, just like onsite.
      Game PnL accumulates in the session tracker; drills keep best scores per mode.</p>
      <h2 class="mt24">Market games</h2>
      <div class="game-grid">
        <div class="game-card" data-game="dice">
          <div class="g-icon">🎲</div><h3>Dice Market Making</h3>
          <p>Quote a two-sided market on the sum of hidden dice. Dice reveal between rounds; informed bots know more than you. Classic Jane Street / Optiver final-round game.</p>
          <div class="g-skills"><span class="badge">fair value</span><span class="badge">spread sizing</span><span class="badge">adverse selection</span></div>
        </div>
        <div class="game-card" data-game="vol">
          <div class="g-icon">📉</div><h3>Fit the Vol Curve</h3>
          <p>Noisy — and some stale — option quotes across strikes. Drag your curve, set your width, then survive the order flow. Marked against the hidden true smile.</p>
          <div class="g-skills"><span class="badge">curve fitting</span><span class="badge">no-arbitrage</span><span class="badge">options</span></div>
        </div>
        <div class="game-card" data-game="fermi">
          <div class="g-icon">🌍</div><h3>Fermi Market</h3>
          <p>A live 3-minute order book on an estimation question, against a crowd of bots — informed, anchored, momentum, noise. Settles at the researched answer.</p>
          <div class="g-skills"><span class="badge">estimation</span><span class="badge">order book</span><span class="badge">price discovery</span></div>
        </div>
        <div class="game-card" data-game="hs">
          <div class="g-icon">🎴</div><h3>High Show</h3>
          <p>A shuffled deck of N sequential cards from a hidden start K. Keep the best M — but rejecting cards costs you, under a penalty function you choose. Then estimate K and your own P&L before the reveal.</p>
          <div class="g-skills"><span class="badge">optimal stopping</span><span class="badge">inference</span><span class="badge">P&L tracking</span></div>
          ${floorBestChips("hs", "game")}
        </div>
        <div class="game-card" data-game="bmr">
          <div class="g-icon">♠</div><h3>Black − Red</h3>
          <p>Poker-shaped market making: hole cards, a board that reveals street by street, and a contract on Σ black − Σ red across every card dealt. Quote each street; bots who know their own cards trade against you.</p>
          <div class="g-skills"><span class="badge">market making</span><span class="badge">card counting</span><span class="badge">adverse selection</span></div>
          ${floorBestChips("br", "game")}
        </div>
      </div>
      <h2 class="mt24">Timed drills</h2>
      <div class="game-grid">
        <div class="game-card" data-game="mm">
          <div class="g-icon">⚡</div><h3>Mental Math Sprint</h3>
          <p>The Optiver/Akuna front door: timed arithmetic with presets or a fully custom operation mix — decimals, fractions, powers, roots. Auto-advance or Enter-to-submit, optional −1 per miss.</p>
          <div class="g-skills"><span class="badge">speed</span><span class="badge">accuracy</span><span class="badge">80-in-8</span></div>
          ${floorBestChips("mm", "drill")}
        </div>
        <div class="game-card" data-game="seq">
          <div class="g-icon">🔢</div><h3>Sequence Completion</h3>
          <p>Fill the blank in generated sequences — arithmetic through interleaved and recursive patterns, typed or multiple choice, against the clock.</p>
          <div class="g-skills"><span class="badge">pattern spotting</span><span class="badge">OA prep</span></div>
          ${floorBestChips("seq", "drill")}
        </div>
        <div class="game-card" data-game="fest">
          <div class="g-icon">🧮</div><h3>Fermi Estimation</h3>
          <p>Rapid-fire estimation with partial credit: math questions scored on relative error, real-world questions on order of magnitude. Suffixes accepted — 4.2M, 1.5B.</p>
          <div class="g-skills"><span class="badge">estimation</span><span class="badge">Five Rings style</span></div>
          ${floorBestChips("fermi", "drill")}
        </div>
      </div>`;
    $$("#view-floor .game-card").forEach(c => c.addEventListener("click", () => {
      ({ dice: DiceGame, vol: VolGame, fermi: FermiGame, hs: HighShow, bmr: BlackRed,
         mm: MentalDrill, seq: SeqDrill, fest: FermiDrill })[c.dataset.game].start();
    }));
  },
  backBtn() { return `<button class="btn sm ghost" id="floorBack">← All games</button>`; },
  bindBack() { $("#floorBack").addEventListener("click", () => this.renderHub()); },
};

/* ============================================================
   GAME 1 — DICE MARKET MAKING
   ============================================================ */
const DiceGame = {
  start() {
    Floor.stopAll();
    $("#view-floor").innerHTML = `
      <div class="row spread">${Floor.backBtn()}<span class="muted small">$10 per point of dice sum</span></div>
      <h2 class="mt16">🎲 Dice Market Making</h2>
      <p class="lede">A contract settles to the <b>sum of the dice</b>. Each round you post a bid and an ask; bots trade
      against your quotes. Between rounds, dice are revealed. Some bots have peeked — watch your markouts.</p>
      <div class="card mt16">
        <div class="row" style="gap:16px">
          <div class="quote-field"><label>Difficulty</label>
            <select id="diceLevel">
              <option value="3">Novice — 3 dice</option>
              <option value="5" selected>Desk — 5 dice</option>
              <option value="8">Prop — 8 dice</option>
            </select></div>
          <button class="btn primary" id="diceStart" style="align-self:flex-end">Open the market →</button>
        </div>
      </div>
      <div id="diceStage"></div>`;
    Floor.bindBack();
    $("#diceStart").addEventListener("click", () => this.newGame(+$("#diceLevel").value));
  },

  newGame(n) {
    this.n = n;
    this.dice = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
    this.truth = this.dice.reduce((a, b) => a + b, 0);
    this.revealed = 0;
    this.round = 0; this.rounds = 3;
    this.revealPlan = [0, Math.ceil(n / 3), Math.ceil(2 * n / 3)];
    this.pos = 0; this.cash = 0; this.fills = [];
    this.tapeLines = [];
    this.renderStage();
    this.log("Market open. " + n + " dice rolled and hidden. Post your first quote.", "t-info");
  },

  fair() { return this.dice.slice(0, this.revealed).reduce((a, b) => a + b, 0) + 3.5 * (this.n - this.revealed); },

  renderStage(final = false) {
    const f = this.fair();
    $("#diceStage").innerHTML = `
      <div class="game-head mt16">
        <div class="dice-row">${this.dice.map((d, i) =>
          `<div class="die ${i < this.revealed || final ? "revealed" : ""}">${i < this.revealed || final ? d : "?"}</div>`).join("")}
        </div>
        <div class="stat-tiles">
          <div class="stat-tile"><div class="k">Round</div><div class="v">${Math.min(this.round + 1, this.rounds)}/${this.rounds}</div></div>
          <div class="stat-tile"><div class="k">Model fair</div><div class="v">${f.toFixed(1)}</div></div>
          <div class="stat-tile"><div class="k">Position</div><div class="v">${this.pos > 0 ? "+" : ""}${this.pos}</div></div>
          <div class="stat-tile"><div class="k">Cash (pts)</div><div class="v">${this.cash.toFixed(1)}</div></div>
          <div class="stat-tile"><div class="k">Mark PnL</div><div class="v ${this.markPnl() > 0 ? "pos" : this.markPnl() < 0 ? "neg" : ""}">${this.markPnl().toFixed(1)}</div></div>
        </div>
      </div>
      <div class="two-col mt16">
        <div>
          <div class="card" id="diceQuoteCard">
            <h3>Post your market — round ${Math.min(this.round + 1, this.rounds)}</h3>
            <div class="quote-panel">
              <div class="quote-field"><label>Bid</label><input type="number" step="0.5" class="bid-in" id="dBid"></div>
              <div class="quote-field"><label>Ask</label><input type="number" step="0.5" class="ask-in" id="dAsk"></div>
              <div class="quote-field"><label>Max size / side</label><input type="number" class="qty" id="dSize" value="5" min="1" max="20"></div>
              <button class="btn primary" id="dQuote">Post quote</button>
              <button class="btn ghost" id="dPass">Stand aside</button>
            </div>
            <div class="small muted mt8">Unrevealed dice are worth 3.5 in expectation — but the flow knows things you don't. Width is your armor; tightness is your volume.</div>
          </div>
          <div id="diceResult"></div>
        </div>
        <div>
          <h3 class="small" style="margin-bottom:6px">Tape</h3>
          <div class="tape" id="diceTape">${this.tapeLines.join("")}</div>
        </div>
      </div>`;
    const bid = $("#dBid"), ask = $("#dAsk");
    bid.value = (f - 2).toFixed(1); ask.value = (f + 2).toFixed(1);
    $("#dQuote").addEventListener("click", () => this.playRound(+bid.value, +ask.value, Math.max(1, +$("#dSize").value | 0)));
    $("#dPass").addEventListener("click", () => this.playRound(null, null, 0));
    const tape = $("#diceTape"); tape.scrollTop = tape.scrollHeight;
  },

  markPnl() { return this.cash + this.pos * this.fair(); },

  log(msg, cls) {
    this.tapeLines.push(`<div class="${cls || ""}">${msg}</div>`);
    const t = $("#diceTape");
    if (t) { t.innerHTML = this.tapeLines.join(""); t.scrollTop = t.scrollHeight; }
  },

  playRound(bid, ask, size) {
    if (bid !== null && (isNaN(bid) || isNaN(ask) || bid >= ask)) { this.log("Rejected: bid must be strictly below ask.", "t-warn"); return; }
    $("#diceQuoteCard").style.opacity = ".45";
    $$("#diceQuoteCard button, #diceQuoteCard input").forEach(x => x.disabled = true);
    if (bid === null) this.log("You stand aside this round.", "t-info");
    else this.log(`You quote <b>${bid.toFixed(1)} / ${ask.toFixed(1)}</b>, ${size} up.`, "t-me");

    const hidden = this.n - this.revealed;
    const nBots = 4 + Math.floor(Math.random() * 3);
    let bought = 0, sold = 0; // contracts you bought / sold this round
    const arrivals = [];
    for (let i = 0; i < nBots; i++) {
      const informed = Math.random() < 0.35;
      const f = this.fair();
      let est;
      if (informed) {
        const w = 0.75; // informed bots have peeked at most of the hidden dice
        est = w * this.truth + (1 - w) * f + randn() * 0.8 * Math.sqrt(Math.max(hidden, 0.5));
      } else {
        est = f + randn() * (1.2 + 0.9 * hidden);
      }
      arrivals.push({ informed, est, qty: 1 + Math.floor(Math.random() * 3) });
    }

    let delay = 400;
    arrivals.forEach(a => {
      Floor.after(() => {
        if (bid === null) { this.log(`Trader works an order elsewhere — no market to hit.`, "t-info"); return; }
        const canBuy = size - sold, canSell = size - bought;
        if (a.est > ask && canBuy > 0) {
          const q = Math.min(a.qty, canBuy);
          sold += q; this.pos -= q; this.cash += q * ask;
          this.fills.push({ side: "sold", px: ask, q, informed: a.informed });
          this.log(`Trader <span class="t-buy">BUYS ${q} @ ${ask.toFixed(1)}</span> (lifts your offer)`, "");
        } else if (a.est < bid && canSell > 0) {
          const q = Math.min(a.qty, canSell);
          bought += q; this.pos += q; this.cash -= q * bid;
          this.fills.push({ side: "bought", px: bid, q, informed: a.informed });
          this.log(`Trader <span class="t-sell">SELLS ${q} @ ${bid.toFixed(1)}</span> (hits your bid)`, "");
        } else {
          this.log(`Trader looks at your market… passes.`, "t-info");
        }
        const tiles = $$("#diceStage .stat-tile .v");
        if (tiles[2]) tiles[2].textContent = (this.pos > 0 ? "+" : "") + this.pos;
        if (tiles[3]) tiles[3].textContent = this.cash.toFixed(1);
        if (tiles[4]) { const m = this.markPnl(); tiles[4].textContent = m.toFixed(1); tiles[4].className = "v " + (m > 0 ? "pos" : m < 0 ? "neg" : ""); }
      }, delay);
      delay += 350 + Math.random() * 350;
    });

    Floor.after(() => {
      this.round++;
      if (this.round < this.rounds) {
        this.revealed = this.revealPlan[this.round];
        this.log(`— Dice revealed: now showing ${this.dice.slice(0, this.revealed).join(", ")} —`, "t-warn");
        this.renderStage();
      } else {
        this.settle();
      }
    }, delay + 500);
  },

  settle() {
    this.revealed = this.n;
    const pnlPts = this.cash + this.pos * this.truth;
    const dollars = pnlPts * 10;
    addPnl(dollars);
    const informedFills = this.fills.filter(f => f.informed);
    const noiseFills = this.fills.filter(f => !f.informed);
    const fillPnl = f => (f.side === "sold" ? (f.px - this.truth) : (this.truth - f.px)) * f.q;
    const sumP = fs => fs.reduce((a, f) => a + fillPnl(f), 0);
    this.renderStage(true);
    $("#diceQuoteCard").classList.add("hidden");
    $("#diceResult").innerHTML = `
      <div class="result-banner">
        <h3>Settled at <span class="mono">${this.truth}</span> — ${this.dice.join(" + ")}</h3>
        <div class="row mt8" style="gap:10px">
          <div class="stat-tile"><div class="k">PnL</div><div class="v ${dollars > 0 ? "pos" : dollars < 0 ? "neg" : ""}">${fmtMoney(dollars)}</div></div>
          <div class="stat-tile"><div class="k">Fills</div><div class="v">${this.fills.reduce((a, f) => a + f.q, 0)}</div></div>
          <div class="stat-tile"><div class="k">vs informed</div><div class="v ${sumP(informedFills) < 0 ? "neg" : "pos"}">${(sumP(informedFills) * 10).toFixed(0)}</div></div>
          <div class="stat-tile"><div class="k">vs noise</div><div class="v ${sumP(noiseFills) < 0 ? "neg" : "pos"}">${(sumP(noiseFills) * 10).toFixed(0)}</div></div>
        </div>
        <p class="small mt8" style="color:var(--ink-2)">${
          this.fills.length === 0 ? "You never traded — zero PnL, but a market maker who never trades gets fired too. Try quoting tighter." :
          sumP(informedFills) < -0.01 && sumP(noiseFills) > 0.01 ?
            "Textbook microstructure: you made money off noise flow and paid the informed traders. Profit = noise income − informed tax. Widen when the hidden fraction is large; tighten as dice reveal." :
          pnlPts > 0 ? "Clean round. Notice how much of your edge came from re-centering quotes after reveals — information beats spread." :
            "You paid up. Check the tape: were you lifted repeatedly on one side without moving your market? That is the pattern to fix."
        }</p>
        <div class="row mt8">
          <button class="btn primary" id="diceAgain">Run it back</button>
        </div>
      </div>`;
    $("#diceAgain").addEventListener("click", () => this.newGame(this.n));
    this.log(`Settlement: <b>${this.truth}</b>. PnL ${pnlPts.toFixed(1)} pts = ${fmtMoney(dollars)}.`, "t-warn");
  },
};

/* ============================================================
   GAME 2 — VOL CURVE FITTING
   ============================================================ */
const VolGame = {
  start() {
    Floor.stopAll();
    $("#view-floor").innerHTML = `
      <div class="row spread">${Floor.backBtn()}<span class="muted small">vega $100 per vol pt per lot</span></div>
      <h2 class="mt16">📉 Fit the Vol Curve</h2>
      <p class="lede">The screen shows option implied-vol quotes across strikes. Some are noisy, some are flat-out stale.
      A true smile is hidden underneath. <b>Drag your mid-vol curve</b>, choose your spread, then release the flow —
      you'll be filled wherever traders like your prices, and marked against the truth.</p>
      <div class="card mt16">
        <div class="row" style="gap:16px">
          <div class="quote-field"><label>Level</label>
            <select id="volLevel">
              <option value="1">L1 — gentle smile, honest quotes</option>
              <option value="2" selected>L2 — skew + stale quotes</option>
              <option value="3">L3 — noisy board, wide strikes</option>
            </select></div>
          <button class="btn primary" id="volStart" style="align-self:flex-end">Deal the board →</button>
        </div>
      </div>
      <div id="volStage"></div>`;
    Floor.bindBack();
    $("#volStart").addEventListener("click", () => this.newGame(+$("#volLevel").value));
  },

  newGame(level) {
    this.level = level;
    const nK = level === 1 ? 7 : level === 2 ? 9 : 11;
    const span = level === 3 ? 50 : 40;
    this.strikes = Array.from({ length: nK }, (_, i) => Math.round(100 - span / 2 + i * span / (nK - 1)));
    const base = 16 + Math.random() * 8;
    const skew = level === 1 ? (Math.random() - 0.5) * 1.2 : -(1 + Math.random() * 2.2);
    const curv = 0.5 + Math.random() * (level === 1 ? 0.8 : 1.6);
    this.trueVol = k => { const m = (k - 100) / 10; return base + skew * m + curv * m * m * 0.45; };
    const noiseSd = level === 1 ? 0.5 : level === 2 ? 1.0 : 1.7;
    const nStale = level === 1 ? 0 : level === 2 ? 1 : 2;
    const staleIdx = new Set();
    while (staleIdx.size < nStale) staleIdx.add(1 + Math.floor(Math.random() * (nK - 2)));
    this.market = this.strikes.map((k, i) => {
      let v = this.trueVol(k) + randn() * noiseSd;
      if (staleIdx.has(i)) v += (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 2);
      return clamp(v, 5, 39);
    });
    this.staleIdx = staleIdx;
    this.mids = [...this.market];
    this.spread = 1.2;
    this.done = false;
    this.fills = [];
    this.renderStage();
  },

  renderStage() {
    $("#volStage").innerHTML = `
      <div class="two-col mt16">
        <div>
          <canvas class="game-canvas" id="volCanvas"></canvas>
          <div class="row mt8 spread">
            <div class="row" style="gap:10px">
              <label class="small muted">Spread width</label>
              <input type="range" id="volSpread" min="0.4" max="3" step="0.1" value="${this.spread}">
              <span class="mono small" id="volSpreadLbl">${this.spread.toFixed(1)} pts</span>
            </div>
            <div class="row" style="gap:8px">
              <button class="btn sm ghost" id="volSnap">snap to quotes</button>
              <button class="btn sm ghost" id="volSmooth">smooth curve</button>
              <button class="btn primary" id="volGo">Release the flow ▶</button>
            </div>
          </div>
          <div class="note mt16">Drag the <b style="color:#8db9ef">blue handles</b> vertically. Gray dots are the market's quotes —
          trust them where they agree, override where one looks broken. A kinked curve gets butterflied: smoothness penalties
          $200 per violation (real desks run exactly this check as no-arb constraints).</div>
        </div>
        <div>
          <h3 class="small" style="margin-bottom:6px">Flow</h3>
          <div class="tape" id="volTape"><div class="t-info">Waiting for your curve…</div></div>
          <div id="volResult"></div>
        </div>
      </div>`;
    this.canvas = $("#volCanvas");
    this.draw();
    $("#volSpread").addEventListener("input", e => {
      this.spread = +e.target.value;
      $("#volSpreadLbl").textContent = this.spread.toFixed(1) + " pts";
      this.draw();
    });
    $("#volSnap").addEventListener("click", () => { if (!this.done) { this.mids = [...this.market]; this.draw(); } });
    $("#volSmooth").addEventListener("click", () => {
      if (this.done) return;
      const m = this.mids;
      this.mids = m.map((v, i) => i === 0 || i === m.length - 1 ? v : (m[i - 1] + 2 * v + m[i + 1]) / 4);
      this.draw();
    });
    $("#volGo").addEventListener("click", () => this.runFlow());
    this.bindDrag();
  },

  X(k, w) { const a = this.strikes[0], b = this.strikes[this.strikes.length - 1]; return 48 + (k - a) / (b - a) * (w - 68); },
  Y(v, h) { const lo = 5, hi = 40; return 16 + (hi - v) / (hi - lo) * (h - 48); },
  YtoVol(y, h) { const lo = 5, hi = 40; return hi - (y - 16) / (h - 48) * (hi - lo); },

  draw(showTruth = false) {
    const { ctx, w, h } = setupCanvas(this.canvas, 360);
    ctx.clearRect(0, 0, w, h);
    // grid
    ctx.strokeStyle = "#2c2c2a"; ctx.lineWidth = 1;
    ctx.fillStyle = "#898781"; ctx.font = "11px ui-monospace, monospace";
    for (let v = 10; v <= 35; v += 5) {
      const y = this.Y(v, h);
      ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(w - 12, y); ctx.stroke();
      ctx.fillText(v + "v", 14, y + 4);
    }
    this.strikes.forEach(k => {
      const x = this.X(k, w);
      ctx.fillText(String(k), x - 10, h - 8);
    });
    // player band
    ctx.beginPath();
    this.strikes.forEach((k, i) => { const x = this.X(k, w), y = this.Y(this.mids[i] + this.spread / 2, h); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    for (let i = this.strikes.length - 1; i >= 0; i--) { ctx.lineTo(this.X(this.strikes[i], w), this.Y(this.mids[i] - this.spread / 2, h)); }
    ctx.closePath(); ctx.fillStyle = "rgba(57,135,229,.13)"; ctx.fill();
    // player mid line
    ctx.beginPath(); ctx.strokeStyle = "#3987e5"; ctx.lineWidth = 2;
    this.strikes.forEach((k, i) => { const x = this.X(k, w), y = this.Y(this.mids[i], h); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    // market quotes
    this.market.forEach((v, i) => {
      const x = this.X(this.strikes[i], w), y = this.Y(v, h);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 7);
      ctx.fillStyle = "#898781"; ctx.fill();
      ctx.strokeStyle = "#1a1a19"; ctx.lineWidth = 2; ctx.stroke();
    });
    // truth
    if (showTruth) {
      ctx.beginPath(); ctx.strokeStyle = "#d95926"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      for (let k = this.strikes[0]; k <= this.strikes[this.strikes.length - 1]; k += 0.5) {
        const x = this.X(k, w), y = this.Y(this.trueVol(k), h);
        k === this.strikes[0] ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
    // handles
    this.strikes.forEach((k, i) => {
      const x = this.X(k, w), y = this.Y(this.mids[i], h);
      ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 7);
      ctx.fillStyle = "#3987e5"; ctx.fill();
      ctx.strokeStyle = "#0d0d0d"; ctx.lineWidth = 2; ctx.stroke();
    });
    // fills markers
    this.fills.forEach(f => {
      const x = this.X(f.k, w), y = this.Y(f.px, h);
      ctx.fillStyle = f.side === "sold" ? "#e66767" : "#7fd97f";
      ctx.beginPath();
      if (f.side === "sold") { ctx.moveTo(x, y - 7); ctx.lineTo(x - 5, y + 2); ctx.lineTo(x + 5, y + 2); } // ▲ they bought your ask
      else { ctx.moveTo(x, y + 7); ctx.lineTo(x - 5, y - 2); ctx.lineTo(x + 5, y - 2); }
      ctx.closePath(); ctx.fill();
    });
    // legend
    ctx.font = "11.5px system-ui"; ctx.fillStyle = "#c3c2b7";
    ctx.fillText("● market quotes", w - 300, 18);
    ctx.fillStyle = "#3987e5"; ctx.fillText("― your mid ± spread", w - 200, 18);
    if (showTruth) { ctx.fillStyle = "#d95926"; ctx.fillText("--- true smile", w - 85, 18); }
  },

  bindDrag() {
    let dragging = -1;
    const c = this.canvas;
    const posOf = e => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener("pointerdown", e => {
      if (this.done) return;
      const { x, y } = posOf(e);
      const w = c.clientWidth, h = 360;
      this.strikes.forEach((k, i) => {
        if (Math.abs(this.X(k, w) - x) < 14 && Math.abs(this.Y(this.mids[i], h) - y) < 16) dragging = i;
      });
      if (dragging >= 0) c.setPointerCapture(e.pointerId);
    });
    c.addEventListener("pointermove", e => {
      if (dragging < 0 || this.done) return;
      const { y } = posOf(e);
      this.mids[dragging] = clamp(this.YtoVol(y, 360), 5.5, 39.5);
      this.draw();
    });
    const end = () => dragging = -1;
    c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
  },

  vlog(msg, cls) {
    const t = $("#volTape");
    t.insertAdjacentHTML("beforeend", `<div class="${cls || ""}">${msg}</div>`);
    t.scrollTop = t.scrollHeight;
  },

  runFlow() {
    if (this.done) return;
    this.done = true;
    $("#volGo").disabled = true;
    $("#volTape").innerHTML = "";
    this.vlog("Flow released — 20 orders incoming…", "t-warn");
    const nOrders = 20;
    let i = 0, pnl = 0;
    const vega = 100; // $ per vol pt per lot
    const doOrder = () => {
      const idx = Math.floor(Math.random() * this.strikes.length);
      const k = this.strikes[idx], tv = this.trueVol(k);
      const informed = Math.random() < 0.45;
      const val = informed ? tv + randn() * 0.3 : tv + randn() * 2.4;
      const bidV = this.mids[idx] - this.spread / 2, askV = this.mids[idx] + this.spread / 2;
      const q = 1 + Math.floor(Math.random() * 3);
      if (val > askV) {
        const edge = (askV - tv) * vega * q; pnl += edge;
        this.fills.push({ k, px: askV, side: "sold", q, edge, informed });
        this.vlog(`<span class="t-buy">BUY ${q} lots ${k}-strike @ ${askV.toFixed(1)}v</span> ${informed ? "· sharp-looking flow" : ""}`);
      } else if (val < bidV) {
        const edge = (tv - bidV) * vega * q; pnl += edge;
        this.fills.push({ k, px: bidV, side: "bought", q, edge, informed });
        this.vlog(`<span class="t-sell">SELL ${q} lots ${k}-strike @ ${bidV.toFixed(1)}v</span> ${informed ? "· sharp-looking flow" : ""}`);
      } else {
        this.vlog(`${k}-strike shopper passes on ${bidV.toFixed(1)}/${askV.toFixed(1)}`, "t-info");
      }
      this.draw();
      if (++i < nOrders) Floor.after(doOrder, 260);
      else Floor.after(() => this.settle(pnl), 500);
    };
    doOrder();
  },

  settle(flowPnl) {
    // smoothness / convexity heuristic penalties
    let violations = 0;
    for (let i = 1; i < this.mids.length - 1; i++) {
      const fly = this.mids[i - 1] - 2 * this.mids[i] + this.mids[i + 1];
      if (fly < -1.6) violations++;                      // concave kink — negative butterfly territory
      if (Math.abs(this.mids[i + 1] - this.mids[i]) > 4.5) violations++; // cliff between adjacent strikes
    }
    const penalty = violations * 200;
    const rmse = Math.sqrt(this.strikes.reduce((a, k, i) => a + (this.mids[i] - this.trueVol(k)) ** 2, 0) / this.strikes.length);
    const total = flowPnl - penalty;
    addPnl(total);
    this.draw(true);
    const sharpTax = this.fills.filter(f => f.informed).reduce((a, f) => a + f.edge, 0);
    const noiseInc = this.fills.filter(f => !f.informed).reduce((a, f) => a + f.edge, 0);
    $("#volResult").innerHTML = `
      <div class="result-banner">
        <h3>Marked to the true smile</h3>
        <div class="row mt8" style="gap:8px">
          <div class="stat-tile"><div class="k">Flow PnL</div><div class="v ${flowPnl > 0 ? "pos" : "neg"}">${fmtMoney(flowPnl)}</div></div>
          <div class="stat-tile"><div class="k">Curve penalty</div><div class="v ${penalty ? "neg" : ""}">${penalty ? "−$" + penalty : "$0"}</div></div>
          <div class="stat-tile"><div class="k">Total</div><div class="v ${total > 0 ? "pos" : "neg"}">${fmtMoney(total)}</div></div>
          <div class="stat-tile"><div class="k">Fit RMSE</div><div class="v">${rmse.toFixed(2)}v</div></div>
        </div>
        <p class="small mt8" style="color:var(--ink-2)">
          vs sharp flow: ${fmtMoney(sharpTax)} · vs noise: ${fmtMoney(noiseInc)}.
          ${this.staleIdx.size ? `Stale quotes were at strike${this.staleIdx.size > 1 ? "s" : ""} ${[...this.staleIdx].map(i => this.strikes[i]).join(", ")} — did you fade them or copy them?` : ""}
          ${rmse > 1.5 ? "Your curve strayed from the smile — anchor to the cluster of quotes and let the outliers go." :
            "Tight fit. Now try a tighter spread for more volume, or L" + Math.min(this.level + 1, 3) + "."}
        </p>
        <div class="row mt8"><button class="btn primary" id="volAgain">New board</button></div>
      </div>`;
    $("#volAgain").addEventListener("click", () => this.newGame(this.level));
  },
};

/* ============================================================
   GAME 3 — FERMI MARKET
   ============================================================ */
const FermiGame = {
  start() {
    Floor.stopAll();
    const spec = pick(FERMI_MARKETS);
    this.spec = spec;
    this.tick = spec.tick; this.dec = spec.decimals;
    this.truth = spec.truth;
    this.t = 180; this.over = false;
    this.orders = []; this.oid = 0;
    this.trades = []; this.midHist = [];
    this.pos = 0; this.cash = 0; this.myTrades = [];
    // bots
    const styles = [
      { style: "informed",  n: 2, sd: 0.10, kappa: 0.055, spread: 2.5 },
      { style: "fund",      n: 3, sd: 0.30, kappa: 0.022, spread: 3.5 },
      { style: "anchored",  n: 2, sd: 0.45, kappa: 0.006, spread: 3.0 },
      { style: "momentum",  n: 2, sd: 0.15, kappa: 0.0,   spread: 2.0 },
      { style: "noise",     n: 2, sd: 0.25, kappa: 0.004, spread: 5.0 },
    ];
    this.bots = [];
    let bid = 0;
    for (const s of styles) for (let i = 0; i < s.n; i++) {
      this.bots.push({ id: "b" + bid++, style: s.style, kappa: s.kappa, spreadTicks: s.spread,
        val: this.truth * Math.exp(randn() * s.sd) });
    }
    this.render();
    this.seedBook();
    this.loop = Floor.every(() => this.step(), 650);
    this.clock = Floor.every(() => {
      this.t--;
      const el = $("#fTimer");
      if (el) { el.textContent = Math.floor(this.t / 60) + ":" + String(this.t % 60).padStart(2, "0"); el.classList.toggle("low", this.t <= 30); }
      if (this.t <= 0) this.settle();
    }, 1000);
  },

  fmt(p) { return p.toFixed(this.dec); },
  roundTick(p) { return Math.max(this.tick, Math.round(p / this.tick) * this.tick); },

  render() {
    $("#view-floor").innerHTML = `
      <div class="row spread">${Floor.backBtn()}<span class="muted small">PnL = (settle − your price) × qty, $1 per unit</span></div>
      <div class="card mt16" style="border-color:rgba(57,135,229,.4)">
        <div class="row spread">
          <div>
            <div class="small muted" style="text-transform:uppercase;letter-spacing:.8px">The market settles to the true answer of:</div>
            <h2 style="margin-top:4px">${esc(this.spec.q)}</h2>
            <div class="muted small mt8">Prices are in <b>${esc(this.spec.unit)}</b>. 10 bots are trading — some have done this estimate before. 3 minutes.</div>
          </div>
          <div class="timer-big" id="fTimer">3:00</div>
        </div>
      </div>
      <div class="two-col mt16">
        <div>
          <canvas class="game-canvas" id="fChart"></canvas>
          <div class="card pad-sm mt16">
            <div class="quote-panel" style="margin-top:0">
              <div class="quote-field"><label>Price</label><input type="number" step="${this.tick}" class="qty" id="fPx" style="width:110px"></div>
              <div class="quote-field"><label>Qty</label><input type="number" class="qty" id="fQty" value="5" min="1" max="50" style="width:70px"></div>
              <button class="btn bidb" id="fLimitBuy">Limit BUY</button>
              <button class="btn askb" id="fLimitSell">Limit SELL</button>
              <button class="btn bidb" id="fMktBuy">Mkt BUY</button>
              <button class="btn askb" id="fMktSell">Mkt SELL</button>
              <button class="btn ghost sm" id="fCancel" style="align-self:center">Cancel my orders</button>
            </div>
          </div>
          <div class="row mt8" style="gap:8px">
            <div class="stat-tile"><div class="k">Position</div><div class="v" id="fPos">0</div></div>
            <div class="stat-tile"><div class="k">Avg px</div><div class="v" id="fAvg">—</div></div>
            <div class="stat-tile"><div class="k">Cash</div><div class="v" id="fCash">0</div></div>
            <div class="stat-tile"><div class="k">PnL @ mid</div><div class="v" id="fUpnl">0</div></div>
          </div>
        </div>
        <div>
          <h3 class="small" style="margin-bottom:6px">Order book</h3>
          <div class="book card pad-sm" id="fBook"></div>
          <h3 class="small mt16" style="margin-bottom:6px">Tape</h3>
          <div class="tape" id="fTape" style="height:150px"></div>
        </div>
      </div>
      <div id="fResult"></div>`;
    Floor.bindBack();
    $("#fLimitBuy").addEventListener("click", () => this.userLimit(1));
    $("#fLimitSell").addEventListener("click", () => this.userLimit(-1));
    $("#fMktBuy").addEventListener("click", () => this.userMarket(1));
    $("#fMktSell").addEventListener("click", () => this.userMarket(-1));
    $("#fCancel").addEventListener("click", () => { this.orders = this.orders.filter(o => o.owner !== "me"); this.renderBook(); });
  },

  /* ----- order book engine ----- */
  bestBid() { const b = this.orders.filter(o => o.side === 1); return b.length ? Math.max(...b.map(o => o.px)) : null; },
  bestAsk() { const a = this.orders.filter(o => o.side === -1); return a.length ? Math.min(...a.map(o => o.px)) : null; },
  mid() {
    const b = this.bestBid(), a = this.bestAsk();
    if (b !== null && a !== null) return (b + a) / 2;
    const last = this.trades.length ? this.trades[this.trades.length - 1].px : this.truth * Math.exp(randn() * 0.3);
    return b !== null ? b : a !== null ? a : last;
  },

  submit(owner, side, px, qty, isMarket = false) {
    px = isMarket ? null : this.roundTick(px);
    let remaining = qty;
    const cross = () => this.orders
      .filter(o => o.side === -side && o.owner !== owner && (isMarket || (side === 1 ? o.px <= px : o.px >= px)))
      .sort((x, y) => side === 1 ? x.px - y.px : y.px - x.px)[0];
    let best;
    while (remaining > 0 && (best = cross())) {
      const q = Math.min(remaining, best.qty);
      this.executeTrade(owner, best.owner, side, best.px, q);
      best.qty -= q; remaining -= q;
      if (best.qty <= 0) this.orders = this.orders.filter(o => o !== best);
    }
    if (remaining > 0 && !isMarket) {
      this.orders.push({ id: ++this.oid, owner, side, px, qty: remaining });
    }
    this.renderBook();
  },

  executeTrade(aggOwner, restOwner, aggSide, px, q) {
    this.trades.push({ px, q, t: this.t });
    for (const [owner, side] of [[aggOwner, aggSide], [restOwner, -aggSide]]) {
      if (owner === "me") {
        this.pos += side * q; this.cash -= side * q * px;
        this.myTrades.push({ side, px, q });
        this.updateTiles();
      } else {
        const bot = this.bots.find(b => b.id === owner);
        if (bot) { bot.pos = (bot.pos || 0) + side * q; }
      }
    }
    const mine = aggOwner === "me" || restOwner === "me";
    const t = $("#fTape");
    if (t) {
      t.insertAdjacentHTML("beforeend",
        `<div class="${mine ? "t-me" : aggSide === 1 ? "t-buy" : "t-sell"}">${aggSide === 1 ? "▲" : "▼"} ${q} @ ${this.fmt(px)}${mine ? " — you" : ""}</div>`);
      t.scrollTop = t.scrollHeight;
    }
  },

  userLimit(side) {
    if (this.over) return;
    const px = +$("#fPx").value, qty = Math.max(1, +$("#fQty").value | 0);
    if (!px || px <= 0) return;
    this.submit("me", side, px, qty);
  },
  userMarket(side) {
    if (this.over) return;
    const qty = Math.max(1, +$("#fQty").value | 0);
    this.submit("me", side, 0, qty, true);
  },

  updateTiles() {
    const mid = this.mid();
    $("#fPos").textContent = (this.pos > 0 ? "+" : "") + this.pos;
    const bought = this.myTrades.filter(t => t.side === 1), sold = this.myTrades.filter(t => t.side === -1);
    const avg = this.myTrades.length ?
      (this.myTrades.reduce((a, t) => a + t.px * t.q, 0) / this.myTrades.reduce((a, t) => a + t.q, 0)) : null;
    $("#fAvg").textContent = avg === null ? "—" : this.fmt(avg);
    $("#fCash").textContent = this.cash.toFixed(0);
    const u = this.cash + this.pos * mid;
    const el = $("#fUpnl");
    el.textContent = u.toFixed(0);
    el.className = "v " + (u > 0.5 ? "pos" : u < -0.5 ? "neg" : "");
  },

  seedBook() {
    for (const b of this.bots) {
      const half = b.spreadTicks * this.tick;
      this.submit(b.id, 1, b.val - half, 2 + Math.floor(Math.random() * 6));
      this.submit(b.id, -1, b.val + half, 2 + Math.floor(Math.random() * 6));
    }
    this.midHist.push(this.mid());
    this.renderBook(); this.drawChart(); this.updateTiles();
  },

  step() {
    if (this.over) return;
    // information leak + bot behavior
    const last = this.trades.length ? this.trades[this.trades.length - 1].px : this.mid();
    const acting = this.bots.filter(() => Math.random() < 0.45);
    for (const b of acting) {
      if (b.style === "momentum") {
        const n = this.trades.slice(-6);
        const drift = n.length >= 2 ? (n[n.length - 1].px - n[0].px) : 0;
        b.val = last + drift * (0.8 + Math.random());
      } else {
        b.val += b.kappa * (this.truth - b.val) + randn() * this.tick * (b.style === "noise" ? 4 : 1.2);
      }
      b.val = Math.max(this.tick * 2, b.val);
      // refresh quotes: cancel own, replace around value
      this.orders = this.orders.filter(o => o.owner !== b.id);
      const half = b.spreadTicks * this.tick * (0.7 + Math.random() * 0.8);
      const qb = 1 + Math.floor(Math.random() * 6), qa = 1 + Math.floor(Math.random() * 6);
      this.submit(b.id, 1, b.val - half, qb);
      this.submit(b.id, -1, b.val + half, qa);
      // occasional aggression: cross the market toward value
      if (Math.random() < (b.style === "informed" ? 0.30 : 0.12)) {
        const mid = this.mid();
        if (b.val > mid + this.tick) this.submit(b.id, 1, 0, 1 + Math.floor(Math.random() * 4), true);
        else if (b.val < mid - this.tick) this.submit(b.id, -1, 0, 1 + Math.floor(Math.random() * 4), true);
      }
    }
    this.midHist.push(this.mid());
    if (this.midHist.length > 400) this.midHist.shift();
    this.renderBook(); this.drawChart(); this.updateTiles();
    const pxIn = $("#fPx");
    if (pxIn && !pxIn.value) pxIn.value = this.fmt(this.roundTick(this.mid()));
  },

  renderBook() {
    const el = $("#fBook"); if (!el) return;
    const agg = side => {
      const m = new Map();
      this.orders.filter(o => o.side === side).forEach(o => {
        const key = this.fmt(o.px);
        const e = m.get(key) || { px: o.px, qty: 0, mine: false };
        e.qty += o.qty; e.mine = e.mine || o.owner === "me";
        m.set(key, e);
      });
      return [...m.values()].sort((a, b) => side === 1 ? b.px - a.px : a.px - b.px).slice(0, 6);
    };
    const bids = agg(1), asks = agg(-1);
    const maxQ = Math.max(1, ...bids.map(b => b.qty), ...asks.map(a => a.qty));
    const row = (b, a) => `<tr>
      <td class="${b && b.mine ? "mine" : ""}">${b ? b.qty : ""}</td>
      <td class="bid-px">${b ? this.fmt(b.px) : ""}${b ? `<span class="depth-bar" style="background:var(--good);width:${(b.qty / maxQ) * 60}px"></span>` : ""}</td>
      <td class="ask-px">${a ? this.fmt(a.px) : ""}${a ? `<span class="depth-bar" style="background:var(--critical);width:${(a.qty / maxQ) * 60}px"></span>` : ""}</td>
      <td class="${a && a.mine ? "mine" : ""}">${a ? a.qty : ""}</td>
    </tr>`;
    let html = `<table><tr><th>qty</th><th>bid</th><th>ask</th><th>qty</th></tr>`;
    for (let i = 0; i < Math.max(bids.length, asks.length, 1); i++) html += row(bids[i], asks[i]);
    el.innerHTML = html + "</table>";
  },

  drawChart(final = false) {
    const c = $("#fChart"); if (!c) return;
    const { ctx, w, h } = setupCanvas(c, 240);
    ctx.clearRect(0, 0, w, h);
    const hist = this.midHist;
    if (hist.length < 2) return;
    let lo = Math.min(...hist), hi = Math.max(...hist);
    if (final) { lo = Math.min(lo, this.truth); hi = Math.max(hi, this.truth); }
    const pad = (hi - lo) * 0.15 + this.tick; lo -= pad; hi += pad;
    const X = i => 46 + i / Math.max(hist.length - 1, 1) * (w - 60);
    const Y = p => 12 + (hi - p) / (hi - lo) * (h - 36);
    ctx.strokeStyle = "#2c2c2a"; ctx.fillStyle = "#898781"; ctx.font = "11px ui-monospace, monospace";
    for (let g = 0; g < 4; g++) {
      const p = lo + (hi - lo) * g / 3, y = Y(p);
      ctx.beginPath(); ctx.moveTo(42, y); ctx.lineTo(w - 10, y); ctx.stroke();
      ctx.fillText(this.fmt(p), 2, y + 4);
    }
    ctx.beginPath(); ctx.strokeStyle = "#3987e5"; ctx.lineWidth = 2;
    hist.forEach((p, i) => i ? ctx.lineTo(X(i), Y(p)) : ctx.moveTo(X(i), Y(p)));
    ctx.stroke();
    if (final) {
      const y = Y(this.truth);
      ctx.strokeStyle = "#d95926"; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(42, y); ctx.lineTo(w - 10, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#d95926"; ctx.fillText("truth " + this.fmt(this.truth), w - 120, y - 6);
    }
    ctx.fillStyle = "#c3c2b7"; ctx.font = "11.5px system-ui";
    ctx.fillText("mid price (" + this.spec.unit + ")", 46, 14);
  },

  settle() {
    if (this.over) return;
    this.over = true;
    Floor.stopAll();
    const finalPnl = this.cash + this.pos * this.truth;
    addPnl(finalPnl);
    const vwapAll = this.trades.length ? this.trades.reduce((a, t) => a + t.px * t.q, 0) / this.trades.reduce((a, t) => a + t.q, 0) : this.mid();
    const myVol = this.myTrades.reduce((a, t) => a + t.q, 0);
    const myAvg = myVol ? this.myTrades.reduce((a, t) => a + t.px * t.q, 0) / myVol : null;
    this.drawChart(true);
    const stance = this.pos > 0 ? "net long — you thought the crowd was too low" :
                   this.pos < 0 ? "net short — you thought the crowd was too high" : "flat";
    $("#fResult").innerHTML = `
      <div class="result-banner mt16">
        <h3>Settled: <span class="mono">${this.fmt(this.truth)} ${esc(this.spec.unit)}</span></h3>
        <div class="row mt8" style="gap:8px">
          <div class="stat-tile"><div class="k">Your PnL</div><div class="v ${finalPnl > 0 ? "pos" : finalPnl < 0 ? "neg" : ""}">${fmtMoney(finalPnl)}</div></div>
          <div class="stat-tile"><div class="k">Final position</div><div class="v">${this.pos > 0 ? "+" : ""}${this.pos}</div></div>
          <div class="stat-tile"><div class="k">Your avg px</div><div class="v">${myAvg ? this.fmt(myAvg) : "—"}</div></div>
          <div class="stat-tile"><div class="k">Crowd VWAP</div><div class="v">${this.fmt(vwapAll)}</div></div>
        </div>
        <p class="small mt8" style="color:var(--ink-2)">You finished ${stance}.
          Crowd VWAP ${vwapAll > this.truth ? "overshot" : "undershot"} the truth by ${(Math.abs(vwapAll - this.truth) / this.truth * 100).toFixed(0)}%.
          ${finalPnl > 0 ? "You beat the crowd's estimate — that's the whole job." :
            myVol === 0 ? "You never traded. In these games, a defensible estimate plus small early size beats waiting for certainty." :
            "The market converged against you. Next time: form your own estimate BEFORE looking at the book, then trade the gap."}</p>
        <div class="reveal-box mt16" id="fDeriv"><button>📖 How to build the answer</button>
          <div class="reveal-content">${esc(this.spec.derivation)}</div></div>
        <div class="row mt8"><button class="btn primary" id="fAgain">New question</button></div>
      </div>`;
    $("#fDeriv > button").addEventListener("click", () => $("#fDeriv").classList.toggle("open"));
    $("#fAgain").addEventListener("click", () => this.start());
    const timer = $("#fTimer"); if (timer) timer.textContent = "0:00";
  },
};

/* ============================================================
   BOOT
   ============================================================ */
const _origSwitch = switchView;
switchView = function (v) { if (v !== "floor") Floor.stopAll(); _origSwitch(v); };
Store.load();
if (Store._drafts) Object.assign(Coding.drafts, Store._drafts);
renderRoadmap();
updatePill();
