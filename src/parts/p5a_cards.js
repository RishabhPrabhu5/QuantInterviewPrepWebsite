/* ============================================================
   p5a_cards.js — card games: High Show and Black − Red.
   ============================================================
   Concatenated BEFORE p5_games.js because p5 ends with the boot code, which
   must evaluate last. These objects are referenced only from
   Floor.renderHub's click handlers, so their definition order relative to
   Floor/pick/clamp does not matter — but for that same reason this file must
   contain NO top-level executable statements, only declarations.

   HighShow   optimal stopping: N sequential cards from a hidden start K
              (K ≤ 3N), shuffled; keep M of them, rejections may be penalized
              under one of five penalty functions. Ends with the player
              estimating K and their own net P&L before the reveal. Session
              PnL contribution = net result minus the no-skill baseline
              (taking the first M cards), plus estimate bonuses.
   BlackRed   poker-shaped market making: everyone gets 2 hole cards, 5 board
              cards reveal Pre-flop → Flop → Turn → River, and the contract
              settles to Σ(black ranks) − Σ(red ranks) over ALL dealt cards.
              The player quotes a two-sided market each street; bots — who
              each know their own hole cards — trade 1 lot against it.
              Endgame asks the player to compute the true value and estimate
              their own PnL before settlement. Actual PnL flows to addPnl().
   ============================================================ */

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ============================================================
   HIGH SHOW
   ============================================================ */
const HighShow = {
  PEN: {
    none:    { name: "No penalty",                 hint: "Reject freely — pure optimal stopping." },
    linear:  { name: "Linear — flat per reject",   hint: "Default multiplier: N ÷ 10 per rejected card." },
    turn:    { name: "On turn — i × mult",         hint: "Rejecting the i-th card shown costs i × mult. Default mult = 2(N+K)/(N+4) — it depends on the hidden K, so the running penalty stays hidden until the reveal." },
    rejects: { name: "On value — v × mult",        hint: "Rejecting a card of value v costs v × mult. Default mult = 1/4." },
    turnval: { name: "Turn × value — v·i × mult",  hint: "Rejecting value v on turn i costs v × i × mult. Default mult = 1/8." },
  },

  start() {
    Floor.stopAll();
    $("#view-floor").innerHTML = `
      <div class="row spread">${Floor.backBtn()}<span class="muted small">an optimal-stopping game with teeth</span></div>
      <h2 class="mt16">🎴 High Show</h2>
      <p class="lede">A deck of <b>N</b> sequential cards runs from a hidden start <b>K</b> (K is random, at most 3N) up to K+N−1,
      shuffled. Each turn one card is shown: <b>cash out</b> (keep it) or <b>see another</b> — but rejecting can cost you,
      depending on the penalty function. Once you've kept the required number, you'll estimate K and your own net P&L
      before anything is revealed.</p>
      <div class="card mt16">
        <div class="row" style="gap:16px; align-items:flex-end">
          <div class="quote-field"><label>Deck size N</label><input type="number" id="hsN" value="50" min="5" max="300"></div>
          <div class="quote-field"><label>Cards to keep</label><input type="number" id="hsM" value="5" min="1"></div>
          <div class="quote-field"><label>Penalty</label>
            <select id="hsPen">${Object.entries(this.PEN).map(([k, p]) =>
              `<option value="${k}" ${k === "linear" ? "selected" : ""}>${p.name}</option>`).join("")}</select></div>
          <div class="quote-field"><label>Multiplier <span class="muted">(blank = default)</span></label>
            <input type="text" id="hsParam" placeholder="auto" style="width:110px"></div>
          <button class="btn primary" id="hsStart">Deal →</button>
        </div>
        <div class="small muted mt8" id="hsPenHint">${this.PEN.linear.hint}</div>
        <div class="small mt8" id="hsErr" style="color:var(--critical)"></div>
      </div>
      <div id="hsStage"></div>`;
    Floor.bindBack();
    $("#hsPen").addEventListener("change", () => { $("#hsPenHint").textContent = this.PEN[$("#hsPen").value].hint; });
    $("#hsStart").addEventListener("click", () => this.newGame());
  },

  newGame() {
    const N = clamp(Math.round(+$("#hsN").value || 50), 5, 300);
    const M = Math.round(+$("#hsM").value || 5);
    if (!(M >= 1 && M < N)) { $("#hsErr").textContent = "Cards to keep must be at least 1 and smaller than N."; return; }
    $("#hsErr").textContent = "";
    this.N = N; this.M = M;
    this.penType = $("#hsPen").value;
    this.K = 1 + Math.floor(Math.random() * 3 * N);
    this.order = shuffleArr(Array.from({ length: N }, (_, i) => this.K + i));
    const raw = parseFloat($("#hsParam").value);
    const userMult = Number.isFinite(raw) ? raw : null;
    const defs = { none: 0, linear: N / 10, turn: 2 * (N + this.K) / (N + 4), rejects: 0.25, turnval: 0.125 };
    this.mult = userMult ?? defs[this.penType];
    this.multHidden = this.penType === "turn" && userMult === null; // default depends on K
    this.turn = 0; this.selected = []; this.rejected = []; this.pen = 0;
    this.renderTurn();
  },

  penFor(v, i) {
    switch (this.penType) {
      case "linear":  return this.mult;
      case "turn":    return i * this.mult;
      case "rejects": return v * this.mult;
      case "turnval": return v * i * this.mult;
      default:        return 0;
    }
  },

  renderTurn() {
    this.turn++;
    const cur = this.order[this.turn - 1];
    const gain = this.selected.reduce((a, b) => a + b, 0);
    const canReject = (this.N - this.turn) >= (this.M - this.selected.length);
    $("#hsStage").innerHTML = `
      <div class="card mt16">
        <div class="stat-tiles">
          <div class="stat-tile"><div class="k">Turn</div><div class="v">${this.turn}</div></div>
          <div class="stat-tile"><div class="k">Kept</div><div class="v">${this.selected.length} / ${this.M}</div></div>
          <div class="stat-tile"><div class="k">Rejected</div><div class="v">${this.rejected.length}</div></div>
          <div class="stat-tile"><div class="k">Gain</div><div class="v pos">${gain}</div></div>
          <div class="stat-tile"><div class="k">Penalty</div><div class="v ${this.pen > 0 ? "neg" : ""}">${this.multHidden ? "hidden" : "−" + (Math.round(this.pen * 100) / 100)}</div></div>
        </div>
        <div style="text-align:center; padding:22px 0 8px">
          <div class="pcard big">${cur}</div>
          <div class="row mt16" style="justify-content:center; gap:12px">
            <button class="btn primary" id="hsKeep">💰 Cash out</button>
            <button class="btn" id="hsSee" ${canReject ? "" : "disabled"}>See another →</button>
          </div>
          ${canReject ? "" : `<div class="small muted mt8">Exactly enough cards remain — you must take the rest.</div>`}
        </div>
        ${this.selected.length ? `<div class="card-row mt16"><span class="small muted">kept:</span>${this.selected.map(v => `<span class="pcard">${v}</span>`).join("")}</div>` : ""}
        ${this.rejected.length ? `<div class="card-row mt8"><span class="small muted">rejected:</span>${this.rejected.map(r => `<span class="pcard dim">${r.v}</span>`).join("")}</div>` : ""}
      </div>`;
    $("#hsKeep").addEventListener("click", () => {
      this.selected.push(cur);
      if (this.selected.length === this.M) this.endForm(); else this.renderTurn();
    });
    $("#hsSee").addEventListener("click", () => {
      this.rejected.push({ v: cur, i: this.turn });
      this.pen += this.penFor(cur, this.turn);
      this.renderTurn();
    });
  },

  endForm() {
    const gain = this.selected.reduce((a, b) => a + b, 0);
    $("#hsStage").innerHTML = `
      <div class="card mt16">
        <h3>All ${this.M} cards kept — now the estimates</h3>
        <div class="card-row mt8"><span class="small muted">your cards:</span>${this.selected.map(v => `<span class="pcard">${v}</span>`).join("")}</div>
        <p class="small muted mt8">Before the reveal: what do you think the smallest card in the deck (K) was, and what is your
        net profit — gain ${this.multHidden ? "minus a penalty you'll have to reason about" : "of " + gain + " minus the penalty"}?</p>
        <div class="quote-panel">
          <div class="quote-field"><label>Estimate of K</label><input type="number" id="hsEstK"></div>
          <div class="quote-field"><label>Estimate of net P&L</label><input type="number" id="hsEstP" step="any"></div>
          <button class="btn primary" id="hsReveal" style="align-self:flex-end">Reveal →</button>
        </div>
      </div>`;
    $("#hsReveal").addEventListener("click", () => this.settle());
    $("#hsEstK").focus();
  },

  settle() {
    const estK = Math.round(+$("#hsEstK").value);
    const estP = +$("#hsEstP").value;
    const gain = this.selected.reduce((a, b) => a + b, 0);
    const pen = Math.round(this.pen * 100) / 100;
    const net = Math.round((gain - pen) * 100) / 100;
    const par = this.M * (this.K + (this.N - 1) / 2);      // EV of taking the first M cards, no rejects
    const skill = net - par;
    const kOk = estK === this.K, kNear = Math.abs(estK - this.K) <= 2;
    const pOk = Number.isFinite(estP) && Math.abs(estP - net) <= Math.max(5, 0.05 * Math.abs(net));
    const bonus = (kOk ? 25 : kNear ? 10 : 0) + (pOk ? 15 : 0);
    const session = Math.round(skill + bonus);
    addPnl(session);
    $("#hsStage").innerHTML = `
      <div class="result-banner">
        <h3>K was <span class="mono">${this.K}</span> — deck ran ${this.K} … ${this.K + this.N - 1}</h3>
        <div class="row mt8" style="gap:8px; flex-wrap:wrap">
          <div class="stat-tile"><div class="k">Gain</div><div class="v pos">${gain}</div></div>
          <div class="stat-tile"><div class="k">Penalty</div><div class="v ${pen > 0 ? "neg" : ""}">−${pen}</div></div>
          <div class="stat-tile"><div class="k">Net P&L</div><div class="v ${net > 0 ? "pos" : "neg"}">${net}</div></div>
          <div class="stat-tile"><div class="k">Naive baseline</div><div class="v">${Math.round(par * 10) / 10}</div></div>
          <div class="stat-tile"><div class="k">Skill vs naive</div><div class="v ${skill > 0 ? "pos" : skill < 0 ? "neg" : ""}">${skill > 0 ? "+" : ""}${Math.round(skill * 10) / 10}</div></div>
          <div class="stat-tile"><div class="k">Session PnL</div><div class="v ${session > 0 ? "pos" : session < 0 ? "neg" : ""}">${fmtMoney(session)}</div></div>
        </div>
        <div class="small mt8" style="color:var(--ink-2); display:flex; flex-direction:column; gap:6px">
          <div>• K estimate ${estK || estK === 0 ? estK : "—"}: ${kOk ? "✓ exact (+25)" : kNear ? "≈ within 2 (+10)" : "✗ off by " + Math.abs(estK - this.K)}.
            Your best evidence was the ${this.turn} card values you saw — min seen ${Math.min(...this.order.slice(0, this.turn))}, and E[min of ${this.turn} draws] ≈ K + (N−${this.turn ? this.turn : 1}·spacing)… the minimum you observed overshoots K by about N/${this.turn + 1}.</div>
          <div>• P&L estimate ${Number.isFinite(estP) ? estP : "—"}: ${pOk ? "✓ within tolerance (+15)" : "✗ actual was " + net}.${this.multHidden ? " The hidden multiplier was 2(N+K)/(N+4) = " + (Math.round(this.mult * 100) / 100) + "." : ""}</div>
          <div>• Baseline is taking the first ${this.M} cards blind: EV = M × (K + (N−1)/2) = ${Math.round(par * 10) / 10}. Beating it means your accept/reject thresholds earned more than the penalties cost.</div>
          <div>• Strategy shape: with m picks left and r cards remaining, accept a card in roughly the top m/r fraction of the values you believe remain — and every penalty lowers that bar. Early rejects are cheap information about K; late rejects are expensive.</div>
        </div>
        <div class="row mt16"><button class="btn primary" id="hsAgain">Play again</button></div>
      </div>`;
    $("#hsAgain").addEventListener("click", () => this.start());
  },
};

/* ============================================================
   BLACK − RED
   ============================================================ */
const BlackRed = {
  STYLES: [
    { n: "sharp",  t: 1.2, noise: 1.5 },
    { n: "quant",  t: 2.5, noise: 3.0 },
    { n: "tight",  t: 5.0, noise: 2.0 },
    { n: "punter", t: 0.6, noise: 8.0 },
  ],
  PHASES: ["Pre-flop", "Flop", "Turn", "River"],
  REVEAL: [0, 3, 4, 5],

  start() {
    Floor.stopAll();
    $("#view-floor").innerHTML = `
      <div class="row spread">${Floor.backBtn()}<span class="muted small">black adds, red subtracts, bots know their own cards</span></div>
      <h2 class="mt16">♠ Black − Red</h2>
      <p class="lede">Everyone — you and each bot — is dealt 2 hidden cards; 5 board cards reveal poker-style
      (pre-flop → flop → turn → river). The contract settles to <b>Σ black ranks − Σ red ranks over every card dealt</b>
      (A=1 … K=13; clubs/spades +, hearts/diamonds −). Each street you quote a two-sided market and the bots trade
      1 lot against it. At the end you compute the true value and estimate your own PnL before settlement.</p>
      <div class="card mt16">
        <div class="row" style="gap:16px; align-items:flex-end">
          <div class="quote-field"><label>Bots</label>
            <select id="brBots"><option>2</option><option selected>3</option><option>4</option><option>5</option></select></div>
          <button class="btn primary" id="brStart">Deal →</button>
        </div>
        <div class="small muted mt8">Tip: the full deck sums to zero, so E[unseen card] is pinned down by what you can see.
        A tight quote pre-flop, when ${""}everyone's information edge is at its largest relative to yours, is how you get picked off.</div>
      </div>
      <div id="brStage"></div>`;
    Floor.bindBack();
    $("#brStart").addEventListener("click", () => this.newGame(+$("#brBots").value));
  },

  newGame(nb) {
    const deck = [];
    for (const [suit, red] of [["♠", false], ["♣", false], ["♥", true], ["♦", true]])
      for (let r = 1; r <= 13; r++)
        deck.push({ r, suit, red, v: red ? -r : r, label: ({ 1: "A", 11: "J", 12: "Q", 13: "K" }[r] || String(r)) });
    shuffleArr(deck);
    this.you = deck.splice(0, 2);
    const pool = shuffleArr(this.STYLES.slice());
    this.bots = Array.from({ length: nb }, (_, i) => ({ id: i + 1, cards: deck.splice(0, 2), style: pool[i % pool.length] }));
    this.board = deck.splice(0, 5);
    this.trueV = [...this.you, ...this.board, ...this.bots.flatMap(b => b.cards)].reduce((a, c) => a + c.v, 0);
    this.phase = 0; this.tape = []; this.trades = []; this.cash = 0; this.pos = 0;
    this.renderPhase();
  },

  cardHTML(c, down) {
    return down ? `<span class="pcard down">▮</span>`
                : `<span class="pcard ${c.red ? "red" : ""}">${c.label}${c.suit}</span>`;
  },

  renderPhase() {
    const nRev = this.REVEAL[this.phase];
    const youSum = this.you.reduce((a, c) => a + c.v, 0);
    const boardSum = this.board.slice(0, nRev).reduce((a, c) => a + c.v, 0);
    $("#brStage").innerHTML = `
      <div class="card mt16">
        <div class="row spread">
          <h3>${this.PHASES[this.phase]} — make your market</h3>
          <div class="stat-tiles">
            <div class="stat-tile"><div class="k">Position</div><div class="v">${this.pos > 0 ? "+" : ""}${this.pos}</div></div>
            <div class="stat-tile"><div class="k">Trades</div><div class="v">${this.trades.length}</div></div>
          </div>
        </div>
        <div class="row mt16" style="gap:26px; flex-wrap:wrap">
          <div><div class="small muted">your cards (net ${youSum > 0 ? "+" : ""}${youSum})</div>
            <div class="card-row mt8">${this.you.map(c => this.cardHTML(c)).join("")}</div></div>
          <div><div class="small muted">board${nRev ? ` (visible net ${boardSum > 0 ? "+" : ""}${boardSum})` : ""}</div>
            <div class="card-row mt8">${this.board.map((c, i) => this.cardHTML(c, i >= nRev)).join("")}</div></div>
          <div><div class="small muted">bots</div>
            <div class="card-row mt8">${this.bots.map(b => `<span class="badge">bot ${b.id}</span>`).join("")}</div></div>
        </div>
        <div class="quote-panel">
          <div class="quote-field"><label>Your bid</label><input type="number" step="any" class="bid-in" id="brBid"></div>
          <div class="quote-field"><label>Your ask</label><input type="number" step="any" class="ask-in" id="brAsk"></div>
          <button class="btn primary" id="brQuote" style="align-self:flex-end">Quote it →</button>
          <span class="small" id="brErr" style="color:var(--critical); align-self:flex-end"></span>
        </div>
      </div>
      <div class="card mt16 pad-sm"><div class="tape" id="brTape">${this.tape.join("") || `<span class="t-info">The tape is empty — quote and the bots will act.</span>`}</div></div>`;
    const tp = $("#brTape"); tp.scrollTop = tp.scrollHeight;
    $("#brQuote").addEventListener("click", () => this.submit());
    $("#brAsk").addEventListener("keydown", e => { if (e.key === "Enter") this.submit(); });
    $("#brBid").focus();
  },

  submit() {
    const bid = +$("#brBid").value, ask = +$("#brAsk").value;
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || !(ask > bid)) {
      $("#brErr").textContent = "Need bid < ask, both numbers."; return;
    }
    const ph = this.PHASES[this.phase], nRev = this.REVEAL[this.phase];
    this.tape.push(`<div class="t-me">[${ph}] you quote ${bid} / ${ask}</div>`);
    for (const b of this.bots) {
      const revealed = this.board.slice(0, nRev);
      const seen = [...b.cards, ...revealed];
      const seenSum = seen.reduce((a, c) => a + c.v, 0);
      const unseenDealt = 2 + 2 * (this.bots.length - 1) + (5 - nRev);
      const ev = seenSum + unseenDealt * (0 - seenSum) / (52 - seen.length) + b.style.noise * randn();
      if (ev > ask + b.style.t) {
        this.trades.push({ bot: b, side: "buy", px: ask, phase: ph });
        this.cash += ask; this.pos -= 1;
        this.tape.push(`<div class="t-buy">[${ph}] bot ${b.id} · ${b.style.n} BUYS 1 @ ${ask}</div>`);
      } else if (ev < bid - b.style.t) {
        this.trades.push({ bot: b, side: "sell", px: bid, phase: ph });
        this.cash -= bid; this.pos += 1;
        this.tape.push(`<div class="t-sell">[${ph}] bot ${b.id} · ${b.style.n} SELLS 1 @ ${bid}</div>`);
      } else {
        this.tape.push(`<div class="t-info">[${ph}] bot ${b.id} · ${b.style.n} passes</div>`);
      }
    }
    this.phase++;
    if (this.phase < 4) this.renderPhase(); else this.endForm();
  },

  endForm() {
    $("#brStage").innerHTML = `
      <div class="card mt16">
        <h3>River done — everything on the table</h3>
        <div class="row mt16" style="gap:26px; flex-wrap:wrap">
          <div><div class="small muted">you</div><div class="card-row mt8">${this.you.map(c => this.cardHTML(c)).join("")}</div></div>
          <div><div class="small muted">board</div><div class="card-row mt8">${this.board.map(c => this.cardHTML(c)).join("")}</div></div>
          ${this.bots.map(b => `<div><div class="small muted">bot ${b.id} · ${b.style.n}</div>
            <div class="card-row mt8">${b.cards.map(c => this.cardHTML(c)).join("")}</div></div>`).join("")}
        </div>
        <p class="small muted mt16">Two questions before settlement — do the arithmetic, don't eyeball it:</p>
        <div class="quote-panel">
          <div class="quote-field"><label>True value (Σ black − Σ red)</label><input type="number" id="brEstV"></div>
          <div class="quote-field"><label>Your PnL estimate</label><input type="number" step="any" id="brEstP"></div>
          <button class="btn primary" id="brSettle" style="align-self:flex-end">Settle →</button>
        </div>
      </div>
      <div class="card mt16 pad-sm"><div class="tape">${this.tape.join("")}</div></div>`;
    $("#brSettle").addEventListener("click", () => this.settle());
    $("#brEstV").focus();
  },

  settle() {
    const estV = Math.round(+$("#brEstV").value);
    const estP = +$("#brEstP").value;
    const V = this.trueV;
    const pnl = Math.round((this.cash + this.pos * V) * 100) / 100;
    addPnl(Math.round(pnl));
    const perTrade = this.trades.map(t => ({ ...t, pnl: t.side === "buy" ? t.px - V : V - t.px }));
    const vsPunter = perTrade.filter(t => t.bot.style.n === "punter").reduce((a, t) => a + t.pnl, 0);
    const vsSharp = perTrade.filter(t => t.bot.style.n !== "punter").reduce((a, t) => a + t.pnl, 0);
    const vOk = estV === V;
    const pOk = Number.isFinite(estP) && Math.abs(estP - pnl) <= 5;
    $("#brStage").innerHTML = `
      <div class="result-banner">
        <h3>True value: <span class="mono">${V > 0 ? "+" : ""}${V}</span></h3>
        <div class="row mt8" style="gap:8px; flex-wrap:wrap">
          <div class="stat-tile"><div class="k">Your PnL</div><div class="v ${pnl > 0 ? "pos" : pnl < 0 ? "neg" : ""}">${fmtMoney(pnl)}</div></div>
          <div class="stat-tile"><div class="k">Final position</div><div class="v">${this.pos > 0 ? "+" : ""}${this.pos}</div></div>
          <div class="stat-tile"><div class="k">vs punter flow</div><div class="v ${vsPunter > 0 ? "pos" : vsPunter < 0 ? "neg" : ""}">${fmtMoney(vsPunter)}</div></div>
          <div class="stat-tile"><div class="k">vs sharper flow</div><div class="v ${vsSharp > 0 ? "pos" : vsSharp < 0 ? "neg" : ""}">${fmtMoney(vsSharp)}</div></div>
        </div>
        <div class="small mt8" style="color:var(--ink-2); display:flex; flex-direction:column; gap:6px">
          <div>• True value ${Number.isFinite(estV) ? estV : "—"}: ${vOk ? "✓ exact." : "✗ it was " + V + " — settlement arithmetic has to be automatic."}</div>
          <div>• PnL estimate ${Number.isFinite(estP) ? estP : "—"}: ${pOk ? "✓ within ±5." : "✗ actual " + pnl + ". Track cash and position street by street: PnL = cash + position × value."}</div>
          <div>• The decomposition is the lesson: profit against punters, losses against sharp/tight flow means your quotes leaked
          information value. Bots know 2 cards you can't see — their willingness to trade IS information; move your market when
          they hit you, and note the deck sums to zero, so E[each unseen card] = −(sum you can see)/(cards you can't).</div>
        </div>
        ${perTrade.length ? `<div class="mt16" style="max-height:180px; overflow-y:auto">
          ${perTrade.map(t => `<div class="rev-row"><span>[${t.phase}] bot ${t.bot.id} · ${t.bot.style.n} ${t.side === "buy" ? "bought" : "sold"}</span>
            <span>@ ${t.px}</span><span></span>
            <span style="color:${t.pnl > 0 ? "var(--good)" : t.pnl < 0 ? "var(--critical)" : "var(--ink-muted)"}">${t.pnl > 0 ? "+" : ""}${Math.round(t.pnl * 100) / 100}</span></div>`).join("")}
        </div>` : `<p class="small muted mt8">No bot traded — your markets were wide enough to be safe and too wide to learn anything.</p>`}
        <div class="row mt16"><button class="btn primary" id="brAgain">Deal again</button></div>
      </div>`;
    $("#brAgain").addEventListener("click", () => this.start());
  },
};
