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

  /* ---- Reference policy ---------------------------------------------------
     "Beat take-the-first-M" is a very low bar, so it says little about play.
     This builds an actual optimal-stopping policy by backward induction and
     then measures it honestly.

     buildPolicy() solves V[r][m] = expected total with r cards still to see
     and m picks left, integrating over the deck's value distribution:
         V[r][m] = E_v[ max( v + V[r-1][m-1],  V[r-1][m] − penalty(v, i) ) ]
     with i = N−r+1 the turn index, and the skip branch dropped when r−1 < m
     (too few cards left to reject any more). The expectation treats each card
     as an iid draw from the deck, which is not exactly true — the deck is
     dealt without replacement — so the TABLE is an approximation.

     referenceScore() therefore does not trust the table's own value. It
     re-runs the induced accept/reject rule over real shuffles of the real
     deck, which is sampling without replacement, and averages the realised
     net. The result is an unbiased estimate of what this policy actually
     scores on your configuration.

     With NO penalty the answer is exact and needs no search at all: rejecting
     is free, so taking a card only when it ranks in the top m of what is left
     secures the M highest cards of the deck every time. referenceFor() returns
     that closed form and skips the DP. (Verified against a brute-force solver
     over all orderings for small decks: 19.0 / 31.0 / 25.0 on N7M1, N7M2,
     N16M1 — exactly the top-M sums.)

     With a penalty the DP is used, and it is NEAR-optimal rather than optimal:
     brute force puts it within 0.0–1.9% on small decks, the shortfall coming
     from the iid approximation. So an efficiency a shade over 100% means you
     matched it, not that the meter broke.

     Either way the policy knows K. That makes it a ceiling rather than a fair
     opponent: it never had to do the inference half of the game.  */
  /* Exact when rejecting is free, DP-and-simulate otherwise. Returns the
     score plus whether it is exact, so the write-up can say which. */
  referenceFor() {
    if (this.penType === "none") {
      let top = 0;
      for (let j = 0; j < this.M; j++) top += this.K + this.N - 1 - j;
      return { score: top, exact: true, sims: 0 };
    }
    const sims = this.N > 150 ? 800 : 2000;
    return { score: this.referenceScore(this.buildPolicy(), sims), exact: false, sims };
  },

  buildPolicy() {
    const N = this.N, M = this.M;
    // O(N² · M · nv) cell updates; subsample the value grid rather than hang
    // the tab on a 300-card deck with a large keep count.
    const stride = Math.max(1, Math.ceil((N * N * M) / 1.2e7));
    const vals = [];
    for (let j = 0; j < N; j += stride) vals.push(this.K + j);
    const nv = vals.length;
    const W = M + 1;
    const V = new Float64Array((N + 1) * W);
    for (let r = 1; r <= N; r++) {
      const i = N - r + 1;
      const top = Math.min(M, r);
      for (let m = 1; m <= top; m++) {
        const contTake = V[(r - 1) * W + (m - 1)];
        const contSkip = V[(r - 1) * W + m];
        const mustTake = (r - 1) < m;
        let acc = 0;
        for (let z = 0; z < nv; z++) {
          const v = vals[z];
          const take = v + contTake;
          acc += mustTake ? take : Math.max(take, contSkip - this.penFor(v, i));
        }
        V[r * W + m] = acc / nv;
      }
    }
    return { V, W };
  },

  referenceScore(pol, sims) {
    const N = this.N, M = this.M, W = pol.W, V = pol.V;
    const base = Array.from({ length: N }, (_, j) => this.K + j);
    let tot = 0;
    for (let s = 0; s < sims; s++) {
      const ord = shuffleArr(base.slice());
      let m = M, gain = 0, pen = 0;
      for (let t = 1; t <= N && m > 0; t++) {
        const r = N - t + 1;                       // cards left including this one
        const v = ord[t - 1];
        const take = v + V[(r - 1) * W + (m - 1)];
        const skip = V[(r - 1) * W + m] - this.penFor(v, t);
        if ((r - 1) < m || take >= skip) { gain += v; m--; }
        else pen += this.penFor(v, t);
      }
      tot += gain - pen;
    }
    return tot / sims;
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
    const refInfo = this.referenceFor();
    const ref = refInfo.score;
    const eff = ref > 0 ? net / ref : null;                // % of reference achieved
    const kOk = estK === this.K, kNear = Math.abs(estK - this.K) <= 2;
    const pOk = Number.isFinite(estP) && Math.abs(estP - net) <= Math.max(5, 0.05 * Math.abs(net));
    const bonus = (kOk ? 25 : kNear ? 10 : 0) + (pOk ? 15 : 0);
    const session = Math.round(skill + bonus);
    addPnl(session);
    const best = eff === null ? { html: "" }
      : recordGameBest("hs", `N${this.N}/keep${this.M}/${this.penType}`, Math.round(eff * 1000) / 10, "efficiency %");
    $("#hsStage").innerHTML = `
      <div class="result-banner">
        <h3>K was <span class="mono">${this.K}</span> — deck ran ${this.K} … ${this.K + this.N - 1}</h3>
        <div class="row mt8" style="gap:8px; flex-wrap:wrap">
          <div class="stat-tile"><div class="k">Gain</div><div class="v pos">${gain}</div></div>
          <div class="stat-tile"><div class="k">Penalty</div><div class="v ${pen > 0 ? "neg" : ""}">−${pen}</div></div>
          <div class="stat-tile"><div class="k">Net P&L</div><div class="v ${net > 0 ? "pos" : "neg"}">${net}</div></div>
          <div class="stat-tile"><div class="k">Naive baseline</div><div class="v">${Math.round(par * 10) / 10}</div></div>
          <div class="stat-tile"><div class="k">${refInfo.exact ? "Optimal play" : "Reference policy"}</div><div class="v">${Math.round(ref * 10) / 10}</div></div>
          <div class="stat-tile"><div class="k">Efficiency</div><div class="v ${eff === null ? "" : eff >= 0.98 ? "pos" : eff < 0.85 ? "neg" : ""}">${eff === null ? "—" : Math.round(eff * 1000) / 10 + "%"}</div></div>
          <div class="stat-tile"><div class="k">Skill vs naive</div><div class="v ${skill > 0 ? "pos" : skill < 0 ? "neg" : ""}">${skill > 0 ? "+" : ""}${Math.round(skill * 10) / 10}</div></div>
          <div class="stat-tile"><div class="k">Session PnL</div><div class="v ${session > 0 ? "pos" : session < 0 ? "neg" : ""}">${fmtMoney(session)}</div></div>
        </div>
        ${best.html}
        <div class="small mt8" style="color:var(--ink-2); display:flex; flex-direction:column; gap:6px">
          <div>• K estimate ${estK || estK === 0 ? estK : "—"}: ${kOk ? "✓ exact (+25)" : kNear ? "≈ within 2 (+10)" : "✗ off by " + Math.abs(estK - this.K)}.
            Your evidence was the ${this.turn} values you saw; the smallest was ${Math.min(...this.order.slice(0, this.turn))}. The minimum of ${this.turn} draws from a run of ${this.N}
            sits above K by about (N−1)/(t+1) = ${Math.round(10 * (this.N - 1) / (this.turn + 1)) / 10} on average, so subtracting that from your lowest card is the estimator —
            it lands at ${Math.round(Math.min(...this.order.slice(0, this.turn)) - (this.N - 1) / (this.turn + 1))}.</div>
          <div>• P&L estimate ${Number.isFinite(estP) ? estP : "—"}: ${pOk ? "✓ within tolerance (+15)" : "✗ actual was " + net}.${this.multHidden ? " The hidden multiplier was 2(N+K)/(N+4) = " + (Math.round(this.mult * 100) / 100) + "." : ""}</div>
          <div>• Naive baseline is taking the first ${this.M} cards blind: EV = M × (K + (N−1)/2) = ${Math.round(par * 10) / 10}. Clearing it only means you did something rather than nothing.</div>
          <div>• <b>The real bar is ${Math.round(ref * 10) / 10}</b> — ${refInfo.exact
              ? `exactly optimal play. With no penalty, rejecting costs nothing, so accepting only when a card ranks in the top m of what remains secures the ${this.M} highest cards (${this.K + this.N - 1} down to ${this.K + this.N - this.M}) every single time.`
              : `a near-optimal policy, from backward induction over V[r][m] = E[max(take, skip − penalty)] measured across ${refInfo.sims} real shuffles of this deck. It sits within about 2% of true optimal, so a shade over 100% means you matched it.`} You reached
            ${eff === null ? "—" : Math.round(eff * 1000) / 10 + "%"} of it${eff === null ? "" : eff >= 0.98 ? " — that is optimal play." : eff >= 0.9 ? " — solid, the gap is a few marginal accepts." : " — there is real money in your thresholds."}.
            That policy knows K, so it skips the inference you had to do; treat it as the ceiling, not the par.</div>
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
      (A=1 … K=13; clubs/spades +, hearts/diamonds −). Each street you quote a two-sided market <b>with size</b>, and
      bots take as much of it as their edge justifies. Carry position and you pay a risk charge every street.</p>
      <div class="card mt16">
        <div class="settings-grid">
          <div class="quote-field"><label>Bots</label>
            <select id="brBots"><option>2</option><option selected>3</option><option>4</option><option>5</option></select></div>
          <div class="quote-field"><label>Max size per side</label>
            <input type="number" id="brMax" value="5" min="1" max="20"></div>
          <div class="quote-field"><label>Position limit</label>
            <input type="number" id="brLim" value="10" min="1" max="50"></div>
          <div class="quote-field"><label>Risk charge <span class="muted">/lot/street</span></label>
            <input type="number" id="brInv" value="0.5" min="0" max="5" step="0.1"></div>
        </div>
        <div class="row mt12"><button class="btn primary" id="brStart">Deal →</button></div>
        <div class="small muted mt8">Size is the whole game. The deck sums to zero, so E[unseen card] = −(sum you can see)/(cards you can't) —
        but a bot only lifts your offer in size when it is <i>confident</i>, and every lot it takes is a lot you were wrong about.
        Quoting 5-up pre-flop, when everyone's information edge over you is at its largest, is how you get run over.</div>
      </div>
      <div id="brStage"></div>`;
    Floor.bindBack();
    $("#brStart").addEventListener("click", () => this.newGame());
  },

  newGame() {
    const deck = [];
    for (const [suit, red] of [["♠", false], ["♣", false], ["♥", true], ["♦", true]])
      for (let r = 1; r <= 13; r++)
        deck.push({ r, suit, red, v: red ? -r : r, label: ({ 1: "A", 11: "J", 12: "Q", 13: "K" }[r] || String(r)) });
    shuffleArr(deck);
    const nb = +$("#brBots").value;
    this.maxSize = clamp(Math.round(+$("#brMax").value || 5), 1, 20);
    this.posLimit = clamp(Math.round(+$("#brLim").value || 10), 1, 50);
    this.invRate = clamp(+$("#brInv").value || 0, 0, 5);
    this.you = deck.splice(0, 2);
    const pool = shuffleArr(this.STYLES.slice());
    this.bots = Array.from({ length: nb }, (_, i) => ({ id: i + 1, cards: deck.splice(0, 2), style: pool[i % pool.length] }));
    this.board = deck.splice(0, 5);
    this.trueV = [...this.you, ...this.board, ...this.bots.flatMap(b => b.cards)].reduce((a, c) => a + c.v, 0);
    this.phase = 0; this.tape = []; this.trades = []; this.cash = 0; this.pos = 0; this.invCost = 0;
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
    const room = { buy: this.posLimit - this.pos, sell: this.posLimit + this.pos };
    $("#brStage").innerHTML = `
      <div class="card mt16">
        <div class="row spread">
          <h3>${this.PHASES[this.phase]} — make your market</h3>
          <div class="stat-tiles">
            <div class="stat-tile"><div class="k">Position</div><div class="v ${this.pos > 0 ? "pos" : this.pos < 0 ? "neg" : ""}">${this.pos > 0 ? "+" : ""}${this.pos}</div><div class="k">limit ±${this.posLimit}</div></div>
            <div class="stat-tile"><div class="k">Cash</div><div class="v ${this.cash > 0 ? "pos" : this.cash < 0 ? "neg" : ""}">${Math.round(this.cash * 10) / 10}</div></div>
            <div class="stat-tile"><div class="k">Risk charge</div><div class="v ${this.invCost > 0 ? "neg" : ""}">−${Math.round(this.invCost * 10) / 10}</div></div>
            <div class="stat-tile"><div class="k">Lots done</div><div class="v">${this.trades.reduce((a, t) => a + t.qty, 0)}</div></div>
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
          <div class="quote-field"><label>Bid size <span class="muted">(buy up to ${Math.max(0, room.buy)})</span></label>
            <input type="number" class="bid-in" id="brBidSz" value="1" min="0" max="${this.maxSize}"></div>
          <div class="quote-field"><label>Your ask</label><input type="number" step="any" class="ask-in" id="brAsk"></div>
          <div class="quote-field"><label>Ask size <span class="muted">(sell up to ${Math.max(0, room.sell)})</span></label>
            <input type="number" class="ask-in" id="brAskSz" value="1" min="0" max="${this.maxSize}"></div>
          <button class="btn primary" id="brQuote" style="align-self:flex-end">Quote it →</button>
          <span class="small" id="brErr" style="color:var(--critical); align-self:flex-end"></span>
        </div>
        <div class="small muted mt8">Max ${this.maxSize} per side. Fills stop at the position limit, and you are charged
        ${this.invRate} per lot of |position| at the end of every street.</div>
      </div>
      <div class="card mt16 pad-sm"><div class="tape" id="brTape">${this.tape.join("") || `<span class="t-info">The tape is empty — quote and the bots will act.</span>`}</div></div>`;
    const tp = $("#brTape"); tp.scrollTop = tp.scrollHeight;
    $("#brQuote").addEventListener("click", () => this.submit());
    $$("#brStage input").forEach(el => el.addEventListener("keydown", e => { if (e.key === "Enter") this.submit(); }));
    $("#brBid").focus();
  },

  /* A bot's fair value: everything it can see, plus the unseen dealt cards
     marked at the conditional mean implied by the deck summing to zero. */
  botEV(b, nRev) {
    const seen = [...b.cards, ...this.board.slice(0, nRev)];
    const seenSum = seen.reduce((a, c) => a + c.v, 0);
    const unseenDealt = 2 + 2 * (this.bots.length - 1) + (5 - nRev);
    return seenSum + unseenDealt * (0 - seenSum) / (52 - seen.length) + b.style.noise * randn();
  },

  submit() {
    const bid = +$("#brBid").value, ask = +$("#brAsk").value;
    const bidSz = Math.round(+$("#brBidSz").value), askSz = Math.round(+$("#brAskSz").value);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || !(ask > bid)) {
      $("#brErr").textContent = "Need bid < ask, both numbers."; return;
    }
    if (!Number.isFinite(bidSz) || !Number.isFinite(askSz) || bidSz < 0 || askSz < 0 || bidSz > this.maxSize || askSz > this.maxSize) {
      $("#brErr").textContent = `Sizes must be between 0 and ${this.maxSize}.`; return;
    }
    if (!bidSz && !askSz) { $("#brErr").textContent = "Quote size on at least one side."; return; }

    const ph = this.PHASES[this.phase], nRev = this.REVEAL[this.phase];
    this.tape.push(`<div class="t-me">[${ph}] you quote ${bidSz} @ ${bid} / ${ask} @ ${askSz}</div>`);

    // Size left on each side of YOUR quote; bots consume it in random order so
    // that no bot is structurally first in line to the good fills.
    let bidLeft = bidSz, askLeft = askSz;
    for (const b of shuffleArr(this.bots.slice())) {
      const ev = this.botEV(b, nRev);
      const buyEdge = ev - ask - b.style.t;    // bot lifts your offer -> you go short
      const sellEdge = bid - ev - b.style.t;   // bot hits your bid     -> you go long
      const scale = Math.max(b.style.t, 0.5);
      if (buyEdge > 0 && askLeft > 0) {
        const room = this.posLimit + this.pos;                       // lots you may still sell
        const qty = Math.min(Math.ceil(buyEdge / scale), askLeft, room);
        if (qty > 0) {
          this.trades.push({ bot: b, side: "buy", px: ask, qty, phase: ph });
          this.cash += ask * qty; this.pos -= qty; askLeft -= qty;
          this.tape.push(`<div class="t-buy">[${ph}] bot ${b.id} · ${b.style.n} BUYS ${qty} @ ${ask}</div>`);
        } else if (room <= 0) {
          this.tape.push(`<div class="t-warn">[${ph}] bot ${b.id} wanted your offer — position limit blocked it</div>`);
        }
      } else if (sellEdge > 0 && bidLeft > 0) {
        const room = this.posLimit - this.pos;                       // lots you may still buy
        const qty = Math.min(Math.ceil(sellEdge / scale), bidLeft, room);
        if (qty > 0) {
          this.trades.push({ bot: b, side: "sell", px: bid, qty, phase: ph });
          this.cash -= bid * qty; this.pos += qty; bidLeft -= qty;
          this.tape.push(`<div class="t-sell">[${ph}] bot ${b.id} · ${b.style.n} SELLS ${qty} @ ${bid}</div>`);
        } else if (room <= 0) {
          this.tape.push(`<div class="t-warn">[${ph}] bot ${b.id} wanted to hit your bid — position limit blocked it</div>`);
        }
      } else {
        this.tape.push(`<div class="t-info">[${ph}] bot ${b.id} · ${b.style.n} passes</div>`);
      }
    }

    const charge = Math.abs(this.pos) * this.invRate;
    if (charge > 0) {
      this.invCost += charge;
      this.tape.push(`<div class="t-warn">[${ph}] carry ${this.pos > 0 ? "+" : ""}${this.pos} overnight — risk charge ${Math.round(charge * 100) / 100}</div>`);
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
        <p class="small muted mt16">You are carrying <b>${this.pos > 0 ? "+" : ""}${this.pos}</b> into settlement and have paid
        <b>${Math.round(this.invCost * 100) / 100}</b> in risk charges. Two questions — do the arithmetic, don't eyeball it:</p>
        <div class="quote-panel">
          <div class="quote-field"><label>True value (Σ black − Σ red)</label><input type="number" id="brEstV"></div>
          <div class="quote-field"><label>Your PnL estimate <span class="muted">(after charges)</span></label><input type="number" step="any" id="brEstP"></div>
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
    const gross = this.cash + this.pos * V;
    const pnl = Math.round((gross - this.invCost) * 100) / 100;
    addPnl(Math.round(pnl));
    const lots = this.trades.reduce((a, t) => a + t.qty, 0);
    const perTrade = this.trades.map(t => ({ ...t, pnl: (t.side === "buy" ? t.px - V : V - t.px) * t.qty }));
    const vsPunter = perTrade.filter(t => t.bot.style.n === "punter").reduce((a, t) => a + t.pnl, 0);
    const vsSharp = perTrade.filter(t => t.bot.style.n !== "punter").reduce((a, t) => a + t.pnl, 0);
    const edgePerLot = lots ? (gross / lots) : 0;
    const vOk = estV === V;
    const pOk = Number.isFinite(estP) && Math.abs(estP - pnl) <= Math.max(5, 0.1 * Math.abs(pnl));
    const best = recordGameBest("br", `${this.bots.length}b/${this.maxSize}up`, pnl, "PnL");
    $("#brStage").innerHTML = `
      <div class="result-banner">
        <h3>True value: <span class="mono">${V > 0 ? "+" : ""}${V}</span></h3>
        <div class="row mt8" style="gap:8px; flex-wrap:wrap">
          <div class="stat-tile"><div class="k">Net PnL</div><div class="v ${pnl > 0 ? "pos" : pnl < 0 ? "neg" : ""}">${fmtMoney(pnl)}</div></div>
          <div class="stat-tile"><div class="k">Trading gross</div><div class="v ${gross > 0 ? "pos" : gross < 0 ? "neg" : ""}">${fmtMoney(gross)}</div></div>
          <div class="stat-tile"><div class="k">Risk charges</div><div class="v ${this.invCost > 0 ? "neg" : ""}">−${Math.round(this.invCost * 100) / 100}</div></div>
          <div class="stat-tile"><div class="k">Lots traded</div><div class="v">${lots}</div></div>
          <div class="stat-tile"><div class="k">Edge per lot</div><div class="v ${edgePerLot > 0 ? "pos" : edgePerLot < 0 ? "neg" : ""}">${lots ? (Math.round(edgePerLot * 100) / 100) : "—"}</div></div>
          <div class="stat-tile"><div class="k">Final position</div><div class="v">${this.pos > 0 ? "+" : ""}${this.pos}</div></div>
          <div class="stat-tile"><div class="k">vs punter flow</div><div class="v ${vsPunter > 0 ? "pos" : vsPunter < 0 ? "neg" : ""}">${fmtMoney(vsPunter)}</div></div>
          <div class="stat-tile"><div class="k">vs sharper flow</div><div class="v ${vsSharp > 0 ? "pos" : vsSharp < 0 ? "neg" : ""}">${fmtMoney(vsSharp)}</div></div>
        </div>
        ${best.html}
        <div class="small mt8" style="color:var(--ink-2); display:flex; flex-direction:column; gap:6px">
          <div>• True value ${Number.isFinite(estV) ? estV : "—"}: ${vOk ? "✓ exact." : "✗ it was " + V + " — settlement arithmetic has to be automatic."}</div>
          <div>• PnL estimate ${Number.isFinite(estP) ? estP : "—"}: ${pOk ? "✓ close enough." : "✗ actual " + pnl + ". PnL = cash + position × value − risk charges."}</div>
          <div>• <b>Edge per lot</b> is the number that matters, not gross: ${lots ? "you traded " + lots + " lots for " + (Math.round(edgePerLot * 100) / 100) + " each" : "you traded nothing"}.
          Trading more lots at a thinner edge is how a book blows up quietly.</div>
          <div>• The decomposition is the lesson: profit against punters and losses against sharp/tight flow means your size was
          available to exactly the people who knew something. Bots take size in proportion to their edge — so a big fill is bad
          news, and the right response is to move your market, not to repeat the quote.</div>
          ${this.invCost > 0 ? `<div>• You paid ${Math.round(this.invCost * 100) / 100} to carry inventory. Flat at the end of each street costs nothing; a position you keep because you like it has to earn its charge.</div>` : ""}
        </div>
        ${perTrade.length ? `<div class="mt16" style="max-height:180px; overflow-y:auto">
          ${perTrade.map(t => `<div class="rev-row"><span>[${t.phase}] bot ${t.bot.id} · ${t.bot.style.n} ${t.side === "buy" ? "bought" : "sold"} ${t.qty}</span>
            <span>@ ${t.px}</span><span></span>
            <span style="color:${t.pnl > 0 ? "var(--good)" : t.pnl < 0 ? "var(--critical)" : "var(--ink-muted)"}">${t.pnl > 0 ? "+" : ""}${Math.round(t.pnl * 100) / 100}</span></div>`).join("")}
        </div>` : `<p class="small muted mt8">No bot traded — your markets were wide enough to be safe and too wide to learn anything.</p>`}
        <div class="row mt16"><button class="btn primary" id="brAgain">Deal again</button></div>
      </div>`;
    $("#brAgain").addEventListener("click", () => this.start());
  },
};
