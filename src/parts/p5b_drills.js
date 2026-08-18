/* ============================================================
   p5b_drills.js — timed drills: Mental Math, Sequences, Fermi Estimation.
   ============================================================
   Concatenated BEFORE p5_games.js (boot must evaluate last); no top-level
   executable statements, declarations only.

   All three games share one engine, runDrill(S), which owns the quiz loop:
   exam format (duration vs question count), typing vs multiple choice,
   skips, Enter-to-submit vs auto-advance, wrong-answer penalties, the
   timer, the results screen, and best-score persistence
   (state.drillBests["<game>:<mode>"], saved through Store).

   Each game object supplies a settings screen (start()), a question
   generator (gen() -> {q | qh, a, tol?, disp, sub?, choices?, note?}),
   and presets. Answers are parsed with parseAnswer() from p3, so players
   can type fractions, percents, and k/M/B/T suffixes anywhere.

   Scoring modes:
     binary   +1 per correct; optional −1 per wrong answer (penalize).
     scored   Fermi mode — partial credit in [0,1] per question. Math
              estimates score on relative error (3% off ≈ 0.9); real-world
              estimates score on log10 ratio (within ×1.26 ≈ 0.9, a factor
              of 10 = 0). A question at ≥ 0.9 counts as "correct".
   ============================================================ */

const ri = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const fmtClock = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
function fmtBig(v) {
  const av = Math.abs(v);
  if (av >= 1e12) return +(v / 1e12).toPrecision(3) + "T";
  if (av >= 1e9)  return +(v / 1e9).toPrecision(3) + "B";
  if (av >= 1e6)  return +(v / 1e6).toPrecision(3) + "M";
  if (av >= 1e4)  return Math.round(v).toLocaleString("en-US");
  return String(Number.isInteger(v) ? v : Math.round(v * 100) / 100);
}
const gcd2 = (a, b) => b ? gcd2(b, a % b) : a;

/* Build 4 multiple-choice options (as display strings) around the answer. */
function mcChoices(a, disp, step) {
  const s = Math.max(1, Math.round(Math.abs(step || a * 0.1) ) || 1);
  const cands = [a + s, a - s, a + 2 * s, a - 2 * s, a + 1, a - 1, a + s + 1];
  const out = [disp];
  for (const c of cands) {
    const d = String(c);
    if (!out.includes(d)) out.push(d);
    if (out.length === 4) break;
  }
  return shuffleArr(out);
}

/* ---------- shared settings controls ---------- */
function drillSettingsHTML(o) {
  return `<div class="settings-grid">
    <div class="quote-field"><label>Exam format</label>
      <select id="dsFormat">
        <option value="time" ${o.format !== "count" ? "selected" : ""}>Duration</option>
        <option value="count" ${o.format === "count" ? "selected" : ""}>Number of questions</option>
      </select></div>
    <div class="quote-field" id="dsTimeWrap"><label>Minutes</label>
      <input type="number" id="dsMin" value="${o.min}" min="0.5" max="60" step="0.5"></div>
    <div class="quote-field hidden" id="dsCountWrap"><label>Questions</label>
      <input type="number" id="dsCount" value="${o.count}" min="1" max="200"></div>
    ${o.noFmt ? "" : `<div class="quote-field"><label>Answer format</label>
      <select id="dsAnsFmt"><option value="type">Typing in</option><option value="mc">Multiple choice</option></select></div>`}
    <div class="quote-field"><label>Allow skips</label>
      <select id="dsSkip"><option value="1">Enabled</option><option value="0">Disabled</option></select></div>
    ${o.noMove ? "" : `<div class="quote-field"><label>Movement</label>
      <select id="dsMove"><option value="enter">Press Enter</option><option value="auto">Auto-advance</option></select></div>
    <div class="quote-field"><label>Penalize wrong</label>
      <select id="dsPen"><option value="0">Disabled</option><option value="1" ${o.pen ? "selected" : ""}>Enabled (−1)</option></select></div>`}
  </div>`;
}
function bindDrillSettings() {
  $("#dsFormat").addEventListener("change", () => {
    const t = $("#dsFormat").value === "time";
    $("#dsTimeWrap").classList.toggle("hidden", !t);
    $("#dsCountWrap").classList.toggle("hidden", t);
  });
}
function readDrillSettings() {
  return {
    format: $("#dsFormat").value,
    seconds: Math.round(clamp(+$("#dsMin").value || 2, 0.5, 60) * 60),
    count: Math.round(clamp(+$("#dsCount").value || 20, 1, 200)),
    ansFmt: $("#dsAnsFmt") ? $("#dsAnsFmt").value : "type",
    skip: $("#dsSkip").value === "1",
    auto: $("#dsMove") ? $("#dsMove").value === "auto" : false,
    pen: $("#dsPen") ? $("#dsPen").value === "1" : false,
  };
}
function drillBestChips(gameId) {
  const rows = Object.entries(state.drillBests || {}).filter(([k]) => k.startsWith(gameId + ":"));
  if (!rows.length) return "";
  return `<div class="small muted mt8">Bests: ${rows.map(([k, v]) =>
    `<span class="badge">${esc(k.split(":")[1])} · ${v.score}</span>`).join(" ")}</div>`;
}

/* ============================================================
   THE DRILL ENGINE
   ============================================================ */
function runDrill(S) {
  Floor.stopAll();
  const timed = S.format === "time";
  const queue = timed ? null : Array.from({ length: S.count }, () => S.gen());
  const results = [];
  let score = 0, correct = 0, wrong = 0, skipped = 0;
  let cur = null, penalized = false, answered = false, over = false;
  const t0 = Date.now();
  const endT = t0 + S.seconds * 1000;

  $("#view-floor").innerHTML = `
    <div class="row spread">${Floor.backBtn()}
      <div class="row" style="gap:10px">
        <span class="badge">${esc(S.modeLabel)}</span>
        <span class="timer-big" id="drTimer"></span>
      </div></div>
    <h2 class="mt16">${S.icon} ${esc(S.title)}</h2>
    <div class="card mt16">
      <div class="row spread">
        <div class="stat-tiles">
          <div class="stat-tile"><div class="k">Score</div><div class="v" id="drScore">0</div></div>
          <div class="stat-tile"><div class="k">Correct</div><div class="v" id="drRight">0</div></div>
          <div class="stat-tile"><div class="k">Wrong</div><div class="v" id="drWrong">0</div></div>
        </div>
        <button class="btn sm ghost" id="drEnd">Finish now</button>
      </div>
      <div class="drill-q" id="drQ"></div>
      <div class="drill-sub" id="drSub"></div>
      <div id="drAns"></div>
      <div class="drill-fb" id="drFb"></div>
      <div class="row mt16" style="justify-content:center; gap:10px" id="drCtl"></div>
    </div>`;
  Floor.bindBack();
  $("#drEnd").addEventListener("click", () => end());

  const scoreDisp = () => { $("#drScore").textContent = S.scored ? (Math.round(score * 10) / 10) : score;
                           $("#drRight").textContent = correct; $("#drWrong").textContent = wrong; };
  const tick = () => {
    if (over) return;
    if (timed) {
      const left = Math.max(0, (endT - Date.now()) / 1000);
      $("#drTimer").textContent = fmtClock(left);
      $("#drTimer").classList.toggle("low", left < 10);
      if (left <= 0) end();
    } else {
      $("#drTimer").textContent = `${results.length}/${S.count} · ${fmtClock((Date.now() - t0) / 1000)}`;
    }
  };
  Floor.every(tick, 250);

  function userVal(raw) {
    const p = parseAnswer(raw);
    return p ? (p.pct ? p.v / 100 : p.v) : null;
  }
  const isRight = x => x !== null && Math.abs(x - cur.a) <= (cur.tol ?? Math.max(1e-9, Math.abs(cur.a) * 1e-9));

  function next() {
    if (over) return;
    penalized = false; answered = false;
    if (!timed && !queue.length) return end();
    cur = timed ? S.gen() : queue.shift();
    $("#drQ").innerHTML = cur.qh || esc(cur.q);
    $("#drSub").textContent = cur.sub || "";
    $("#drFb").textContent = ""; $("#drFb").style.color = "";
    renderAnswer();
    renderCtl();
    tick();
  }

  function renderAnswer() {
    if (S.ansFmt === "mc" && cur.choices) {
      $("#drAns").innerHTML = `<div class="mc-grid">${cur.choices.map(c =>
        `<button class="btn" data-mc="${esc(c)}">${esc(c)}</button>`).join("")}</div>`;
      $$("#drAns [data-mc]").forEach(b => b.addEventListener("click", () => {
        if (answered || over) return;
        if (b.dataset.mc === cur.disp) {
          score++; correct++;
          results.push({ q: cur.q, given: b.dataset.mc, ans: cur.disp, ok: true });
          scoreDisp(); next();
        } else {
          wrong++;
          if (S.pen && !penalized) { score--; penalized = true; }
          results.push({ q: cur.q, given: b.dataset.mc, ans: cur.disp, ok: false });
          b.classList.add("mc-bad");
          scoreDisp();
          Floor.after(() => next(), 350);
          answered = true;
        }
      }));
    } else {
      $("#drAns").innerHTML = `<div class="drill-ans">
        <input id="drIn" autocomplete="off" placeholder="answer">
        ${S.auto && !S.scored ? "" : `<button class="btn primary" id="drGo">Enter ↵</button>`}
      </div>`;
      const inp = $("#drIn");
      if (S.auto && !S.scored) {
        inp.addEventListener("input", () => { if (!over && isRight(userVal(inp.value))) onCorrect(inp.value); });
      } else {
        inp.addEventListener("keydown", e => { if (e.key === "Enter") answered ? next() : submit(); });
        $("#drGo").addEventListener("click", () => answered ? next() : submit());
      }
      inp.focus();
    }
  }

  function renderCtl() {
    $("#drCtl").innerHTML = S.skip ? `<button class="btn sm" id="drSkip">Skip →</button>` : "";
    if (S.skip) $("#drSkip").addEventListener("click", () => {
      if (over || answered) return;
      skipped++;
      if (timed) results.push({ q: cur.q, given: "(skipped)", ans: cur.disp, ok: false, skip: true });
      else queue.push(cur);                        // come back to it later
      next();
    });
  }

  function onCorrect(raw) {
    score++; correct++;
    results.push({ q: cur.q, given: raw.trim(), ans: cur.disp, ok: true });
    scoreDisp(); next();
  }

  function submit() {
    const raw = $("#drIn").value;
    const x = userVal(raw);
    if (x === null) { $("#drFb").textContent = "Couldn't parse that — plain number, fraction, or 4.2M."; return; }
    if (S.scored) {
      const s = Math.round(S.scoreFn(x, cur.a, cur) * 100) / 100;
      score += s; (s >= 0.9 ? correct++ : wrong++);
      results.push({ q: cur.q, given: raw.trim(), ans: cur.disp, s });
      answered = true;
      $("#drIn").disabled = true;
      $("#drFb").style.color = s >= 0.9 ? "var(--good)" : s > 0.4 ? "var(--warning)" : "var(--critical)";
      $("#drFb").textContent = `truth ≈ ${cur.disp} — score ${s.toFixed(2)}` + (cur.note ? " · " + cur.note : "");
      $("#drGo").textContent = "Next →";
      scoreDisp();
      return;
    }
    if (isRight(x)) return onCorrect(raw);
    wrong++;
    if (S.pen && !penalized) { score--; penalized = true; $("#drFb").textContent = "✗ −1 — keep trying or skip."; }
    else $("#drFb").textContent = "✗ not it — keep trying" + (S.skip ? " or skip." : ".");
    $("#drFb").style.color = "var(--critical)";
    $("#drIn").classList.add("flash-bad");
    Floor.after(() => { const i = $("#drIn"); if (i) i.classList.remove("flash-bad"); }, 400);
    scoreDisp();
  }

  function end() {
    if (over) return;
    over = true;
    Floor.stopAll();
    const elapsed = (Date.now() - t0) / 1000;
    const finalScore = S.scored ? Math.round(score * 10) / 10 : score;
    const key = S.id + ":" + S.modeKey;
    if (!state.drillBests) state.drillBests = {};
    const prev = state.drillBests[key];
    const isBest = !prev || finalScore > prev.score;
    if (isBest) { state.drillBests[key] = { score: finalScore }; }
    logEvent("drill", S.id, correct > 0 && correct >= wrong);
    Store.save();
    const rate = elapsed > 0 ? Math.round(correct / (elapsed / 60) * 10) / 10 : 0;
    const acc = correct + wrong ? Math.round(100 * correct / (correct + wrong)) : null;
    $("#view-floor").innerHTML = `
      <div class="row spread">${Floor.backBtn()}<span class="badge">${esc(S.modeLabel)}</span></div>
      <h2 class="mt16">${S.icon} ${esc(S.title)} — done</h2>
      <div class="result-banner">
        <div class="row" style="gap:8px; flex-wrap:wrap">
          <div class="stat-tile"><div class="k">Score</div><div class="v ${finalScore > 0 ? "pos" : finalScore < 0 ? "neg" : ""}">${finalScore}</div></div>
          <div class="stat-tile"><div class="k">Correct</div><div class="v">${correct}</div></div>
          <div class="stat-tile"><div class="k">Wrong</div><div class="v">${wrong}</div></div>
          <div class="stat-tile"><div class="k">Skipped</div><div class="v">${skipped}</div></div>
          <div class="stat-tile"><div class="k">Accuracy</div><div class="v">${acc === null ? "—" : acc + "%"}</div></div>
          <div class="stat-tile"><div class="k">Pace</div><div class="v">${rate}/min</div></div>
          <div class="stat-tile"><div class="k">Best (${esc(S.modeKey)})</div><div class="v">${state.drillBests[key].score}${isBest && prev ? " ★" : isBest ? " ★" : ""}</div></div>
        </div>
        ${results.length ? `<div class="mt16" style="max-height:260px; overflow-y:auto">
          ${results.slice(0, 200).map(r => `<div class="rev-row">
            <span>${esc(r.q)}</span><span class="muted">${esc(String(r.given))}</span><span>${esc(String(r.ans))}</span>
            <span style="color:${r.skip ? "var(--warning)" : (r.ok || r.s >= 0.9) ? "var(--good)" : "var(--critical)"}">${r.skip ? "→" : r.s !== undefined ? r.s.toFixed(2) : r.ok ? "✓" : "✗"}</span>
          </div>`).join("")}</div>` : `<p class="small muted mt8">No questions answered.</p>`}
        <div class="row mt16" style="gap:10px">
          <button class="btn primary" id="drAgain">Run it again</button>
          <button class="btn" id="drSettings">Change settings</button>
        </div>
      </div>`;
    Floor.bindBack();
    $("#drAgain").addEventListener("click", S.again);
    $("#drSettings").addEventListener("click", S.settings);
  }

  next();
}

/* ============================================================
   MENTAL MATH
   ============================================================ */
const MentalDrill = {
  id: "mm",
  MODES: {
    easy:    { label: "Easy — add & subtract", min: 2 },
    medium:  { label: "Medium — four operations", min: 2 },
    hard:    { label: "Hard — decimals, fractions, big products", min: 4 },
    optiver: { label: "Optiver 80-in-8 style", min: 8, pen: true },
    akuna:   { label: "Akuna style — harder mix", min: 8, pen: true },
    custom:  { label: "Custom", min: 2 },
  },
  PRESETS: {
    easy:    { add: [1, 2, 99, 1],  mul: 0,               dec: 0, frac: 0, pow: 0,          root: 0 },
    medium:  { add: [1, 2, 199, 0], mul: [1, 2, 19, 2, 19], dec: 0, frac: 0, pow: [1, 2, 20], root: 0 },
    hard:    { add: [1, 12, 999, 0], mul: [1, 5, 99, 2, 49], dec: 1, frac: 1, pow: [1, 2, 30], root: [1, "int", 2, 40] },
    optiver: { add: [1, 2, 999, 0], mul: [1, 2, 99, 2, 19], dec: 1, frac: 1, pow: 0,          root: 0 },
    akuna:   { add: [1, 12, 999, 0], mul: [1, 11, 99, 2, 49], dec: 1, frac: 1, pow: [1, 2, 25], root: [1, "int", 2, 30] },
  },

  start() {
    Floor.stopAll();
    $("#view-floor").innerHTML = `
      <div class="row spread">${Floor.backBtn()}<span class="muted small">the Optiver front door: speed × accuracy</span></div>
      <h2 class="mt16">⚡ Mental Math Sprint</h2>
      <p class="lede">Timed arithmetic in the style of the trading OAs. Pick a preset or build a custom mix —
      the operations panel below follows the preset and can be tweaked before you start.</p>
      <div class="card mt16">
        <div class="row" style="gap:16px; align-items:flex-end">
          <div class="quote-field"><label>Game mode</label>
            <select id="mmMode">${Object.entries(this.MODES).map(([k, m]) =>
              `<option value="${k}">${m.label}</option>`).join("")}</select></div>
        </div>
        ${drillSettingsHTML({ format: "time", min: 2, count: 20 })}
        <div class="mt16"><h3 class="small" style="text-transform:uppercase; letter-spacing:.8px; color:var(--ink-muted)">Operations</h3>
          <div class="ops-row"><label><input type="checkbox" id="opAdd" checked> add / subtract</label>
            <input type="number" id="opAddLo" value="2"> to <input type="number" id="opAddHi" value="99">
            <label><input type="checkbox" id="opAddNN" checked> non-negative answers</label></div>
          <div class="ops-row"><label><input type="checkbox" id="opMul"> multiply / divide</label>
            <input type="number" id="opMulLo" value="2"> to <input type="number" id="opMulHi" value="19">
            <span class="muted">· division results</span> <input type="number" id="opDivLo" value="2"> to <input type="number" id="opDivHi" value="19"></div>
          <div class="ops-row"><label><input type="checkbox" id="opDec"> decimals</label>
            <label><input type="checkbox" id="opDecF"> fancy (leading zeros, e.g. 0.0075)</label></div>
          <div class="ops-row"><label><input type="checkbox" id="opFrac"> fractions (denominators ≤ 12)</label></div>
          <div class="ops-row"><label><input type="checkbox" id="opPow"> squares & cubes</label>
            <input type="number" id="opPowLo" value="2"> to <input type="number" id="opPowHi" value="20"></div>
          <div class="ops-row"><label><input type="checkbox" id="opRoot"> roots (√ and ∛)</label>
            <select id="opRootMode"><option value="int">integer answers</option><option value="dec">decimal (1 dp)</option></select>
            <input type="number" id="opRootLo" value="2"> to <input type="number" id="opRootHi" value="40"></div>
        </div>
        <div class="row mt16"><button class="btn primary" id="mmStart">Start →</button></div>
        ${drillBestChips("mm")}
      </div>`;
    Floor.bindBack();
    bindDrillSettings();
    $("#mmMode").addEventListener("change", () => this.applyPreset($("#mmMode").value));
    $("#mmStart").addEventListener("click", () => this.launch());
  },

  applyPreset(mode) {
    const p = this.PRESETS[mode];
    const m = this.MODES[mode];
    if (m.min) $("#dsMin").value = m.min;
    if ($("#dsPen")) $("#dsPen").value = m.pen ? "1" : "0";
    if (!p) return;                                 // custom: leave the panel alone
    const set = (id, v) => { const el = $("#" + id); if (el) el.type === "checkbox" ? el.checked = !!v : el.value = v; };
    set("opAdd", p.add[0]); set("opAddLo", p.add[1]); set("opAddHi", p.add[2]); set("opAddNN", p.add[3]);
    set("opMul", p.mul); if (p.mul) { set("opMulLo", p.mul[1]); set("opMulHi", p.mul[2]); set("opDivLo", p.mul[3]); set("opDivHi", p.mul[4]); }
    set("opDec", p.dec === 1 || (Array.isArray(p.dec) && p.dec[0])); set("opDecF", 0);
    set("opFrac", p.frac);
    set("opPow", p.pow); if (p.pow) { set("opPowLo", p.pow[1]); set("opPowHi", p.pow[2]); }
    set("opRoot", p.root); if (p.root) { $("#opRootMode").value = p.root[1]; set("opRootLo", p.root[2]); set("opRootHi", p.root[3]); }
  },

  launch(prev) {
    const cfg = prev || {
      mode: $("#mmMode").value,
      ...readDrillSettings(),
      ops: {
        add: { on: $("#opAdd").checked, lo: +$("#opAddLo").value || 2, hi: +$("#opAddHi").value || 99, nn: $("#opAddNN").checked },
        mul: { on: $("#opMul").checked, lo: +$("#opMulLo").value || 2, hi: +$("#opMulHi").value || 19,
               dlo: +$("#opDivLo").value || 2, dhi: +$("#opDivHi").value || 19 },
        dec: { on: $("#opDec").checked, fancy: $("#opDecF").checked },
        frac: { on: $("#opFrac").checked },
        pow: { on: $("#opPow").checked, lo: +$("#opPowLo").value || 2, hi: +$("#opPowHi").value || 20 },
        root: { on: $("#opRoot").checked, mode: $("#opRootMode").value, lo: +$("#opRootLo").value || 2, hi: +$("#opRootHi").value || 40 },
      },
    };
    runDrill({
      id: "mm", icon: "⚡", title: "Mental Math Sprint",
      modeKey: cfg.mode, modeLabel: this.MODES[cfg.mode].label,
      format: cfg.format, seconds: cfg.seconds, count: cfg.count,
      ansFmt: cfg.ansFmt, skip: cfg.skip, auto: cfg.auto, pen: cfg.pen,
      gen: this.buildGen(cfg.ops),
      again: () => this.launch(cfg), settings: () => this.start(),
    });
  },

  buildGen(ops) {
    const kinds = [];
    if (ops.add.on) kinds.push("add", "sub");
    if (ops.mul.on) kinds.push("mul", "div");
    if (ops.dec.on) kinds.push("dadd", "dmul");
    if (ops.frac.on) kinds.push("frac");
    if (ops.pow.on) kinds.push("pow");
    if (ops.root.on) kinds.push("root");
    if (!kinds.length) kinds.push("add", "sub");
    return () => {
      switch (pick(kinds)) {
        case "add": { const a = ri(ops.add.lo, ops.add.hi), b = ri(ops.add.lo, ops.add.hi);
          return { q: `${a} + ${b}`, a: a + b, disp: String(a + b), choices: mcChoices(a + b, String(a + b), 10) }; }
        case "sub": { let a = ri(ops.add.lo, ops.add.hi), b = ri(ops.add.lo, ops.add.hi);
          if (ops.add.nn && b > a) [a, b] = [b, a];
          return { q: `${a} − ${b}`, a: a - b, disp: String(a - b), choices: mcChoices(a - b, String(a - b), 10) }; }
        case "mul": { const a = ri(ops.mul.lo, ops.mul.hi), b = ri(ops.mul.lo, ops.mul.hi);
          return { q: `${a} × ${b}`, a: a * b, disp: String(a * b), choices: mcChoices(a * b, String(a * b), Math.max(2, a)) }; }
        case "div": { const d = ri(Math.max(2, ops.mul.lo), ops.mul.hi), q = ri(ops.mul.dlo, ops.mul.dhi);
          return { q: `${d * q} ÷ ${d}`, a: q, disp: String(q), choices: mcChoices(q, String(q), 3) }; }
        case "dadd": { const sc = ops.dec.fancy ? 10000 : 100;
          const a = ri(1, 99 * (sc / 10)) / sc, b = ri(1, 99 * (sc / 10)) / sc, plus = Math.random() < 0.5;
          const v = Math.round((plus ? a + b : a - b) * sc) / sc;
          return { q: `${a} ${plus ? "+" : "−"} ${b}`, a: v, tol: 1e-6, disp: String(v), choices: mcChoices(v, String(v), 0).map(String) }; }
        case "dmul": { const a = ri(11, 999) / 100, b = ri(2, 12);
          const v = Math.round(a * b * 100) / 100;
          return { q: `${a} × ${b}`, a: v, tol: 1e-6, disp: String(v) }; }
        case "frac": { const d1 = ri(2, 12), d2 = ri(2, 12), n1 = ri(1, d1 - 1), n2 = ri(1, d2 - 1);
          const op = pick(["+", "−", "×"]);
          let p, q2;
          if (op === "+") { p = n1 * d2 + n2 * d1; q2 = d1 * d2; }
          else if (op === "−") { p = n1 * d2 - n2 * d1; q2 = d1 * d2; }
          else { p = n1 * n2; q2 = d1 * d2; }
          const g = gcd2(Math.abs(p), q2) || 1; p /= g; q2 /= g;
          const disp = q2 === 1 ? String(p) : `${p}/${q2}`;
          return { q: `${n1}/${d1} ${op} ${n2}/${d2}`, a: p / q2, tol: 0.006, disp, sub: "fraction or decimal both accepted" }; }
        case "pow": { const x = ri(ops.pow.lo, ops.pow.hi), cube = Math.random() < 0.35 && x <= 30;
          const v = cube ? x ** 3 : x ** 2;
          return { q: `${x}${cube ? "³" : "²"}`, a: v, disp: String(v), choices: mcChoices(v, String(v), 2 * x) }; }
        case "root": { if (ops.root.mode === "int") {
            const r = ri(ops.root.lo, ops.root.hi), cube = Math.random() < 0.35 && r <= 12;
            return { q: `${cube ? "∛" : "√"}${cube ? r ** 3 : r ** 2}`, a: r, disp: String(r), choices: mcChoices(r, String(r), 2) };
          }
          const x = ri(10, 999), v = Math.round(Math.sqrt(x) * 10) / 10;
          return { q: `√${x}`, a: v, tol: 0.05, disp: "≈ " + v, sub: "to the nearest tenth" }; }
      }
    };
  },
};

/* ============================================================
   SEQUENCES
   ============================================================ */
const SeqDrill = {
  id: "seq",
  MODES: {
    easy:    { label: "Easy", pools: ["e"], min: 3 },
    medium:  { label: "Medium", pools: ["m"], min: 4 },
    hard:    { label: "Hard", pools: ["h"], min: 5 },
    mixed:   { label: "Mixed", pools: ["e", "m", "h"], min: 4 },
    optiver: { label: "Optiver-style — fast & clean", pools: ["e", "m"], min: 4 },
    imc:     { label: "IMC-style — patterned", pools: ["m"], min: 4 },
    sig:     { label: "SIG-style — layered", pools: ["m", "h"], min: 5 },
  },

  GENS: {
    e: [
      () => { const a = ri(1, 40), d = ri(2, 15) * pick([1, 1, -1]); return Array.from({ length: 6 }, (_, i) => a + i * d); },
      () => { const a = ri(1, 6), r = pick([2, 3]); return Array.from({ length: 6 }, (_, i) => a * r ** i); },
      () => { const n0 = ri(1, 7); return Array.from({ length: 6 }, (_, i) => (n0 + i) ** 2); },
      () => { const n0 = ri(1, 5); return Array.from({ length: 5 }, (_, i) => (n0 + i) ** 3); },
      () => { const n0 = ri(1, 6); return Array.from({ length: 6 }, (_, i) => (n0 + i) * (n0 + i + 1) / 2); },
      () => { let a = ri(1, 6), b = ri(2, 9); const s = [a, b]; while (s.length < 7) s.push(s.at(-1) + s.at(-2)); return s; },
      () => { const a = ri(1, 20), d1 = ri(2, 9), d2 = ri(2, 9) + 9; const s = [a];
        for (let i = 0; i < 6; i++) s.push(s.at(-1) + (i % 2 ? d2 : d1)); return s; },
    ],
    m: [
      () => { const a = ri(1, 5), b = ri(1, 6), c = ri(0, 9); return Array.from({ length: 6 }, (_, i) => a * i * i + b * i + c); },
      () => { const a1 = ri(1, 20), d1 = ri(2, 9), a2 = ri(30, 90), d2 = -ri(2, 9); const s = [];
        for (let i = 0; i < 4; i++) { s.push(a1 + i * d1); s.push(a2 + i * d2); } return s; },
      () => { const k = pick([2, 3]), c = ri(1, 6) * pick([1, -1]); let x = ri(1, 5); const s = [x];
        while (s.length < 6) { x = k * x + c; s.push(x); } return s; },
      () => { const P = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71];
        const i0 = ri(0, 13); return P.slice(i0, i0 + 6); },
      () => { const b = pick([2, 3]), c = ri(1, 9) * pick([1, -1]);
        return Array.from({ length: 6 }, (_, i) => b ** (i + 1) + c); },
      () => { const add = ri(2, 7), mul = 2; let x = ri(1, 6); const s = [x];
        for (let i = 0; i < 6; i++) { x = i % 2 ? x + add : x * mul; s.push(x); } return s; },
      () => { const n0 = ri(1, 7); return Array.from({ length: 6 }, (_, i) => (n0 + i) ** 2 + (n0 + i)); },
    ],
    h: [
      () => { const a1 = ri(1, 15), d = ri(3, 9), g0 = ri(1, 4), r = pick([2, 3]); const s = [];
        for (let i = 0; i < 4; i++) { s.push(a1 + i * d); s.push(g0 * r ** i); } return s; },
      () => { let a = ri(1, 4), b = ri(2, 6); const c = ri(1, 5), s = [a, b];
        while (s.length < 7) s.push(s.at(-1) + s.at(-2) + c); return s; },
      () => { let x = ri(1, 4); const s = [x]; for (let k = 2; k <= 6; k++) { x *= k; s.push(x); } return s; },
      () => { const P = [2, 3, 5, 7, 11, 13, 17, 19, 23]; let x = ri(1, 9); const s = [x];
        for (const p of P.slice(0, 6)) { x += p; s.push(x); } return s; },
      () => Array.from({ length: 7 }, (_, i) => 2 ** (i + 1) - (i + 1)),
      () => { const n0 = ri(2, 6); return Array.from({ length: 6 }, (_, i) => (n0 + i) ** 3 - (n0 + i)); },
      () => { let x = ri(2, 5); const s = [x]; for (let i = 1; i < 6; i++) { x = x * 2 - i; s.push(x); } return s; },
    ],
  },

  start() {
    Floor.stopAll();
    $("#view-floor").innerHTML = `
      <div class="row spread">${Floor.backBtn()}<span class="muted small">spot the generator, not just the next number</span></div>
      <h2 class="mt16">🔢 Sequence Completion</h2>
      <p class="lede">A sequence with one hidden term — work out the rule, fill the blank. Patterns range from plain
      arithmetic to interleaved and recursive generators, in the style of the trading OAs' sequence screens.</p>
      <div class="card mt16">
        <div class="row" style="gap:16px; align-items:flex-end">
          <div class="quote-field"><label>Game mode</label>
            <select id="sqMode">${Object.entries(this.MODES).map(([k, m]) =>
              `<option value="${k}" ${k === "medium" ? "selected" : ""}>${m.label}</option>`).join("")}</select></div>
        </div>
        ${drillSettingsHTML({ format: "time", min: 4, count: 15 })}
        <div class="row mt16"><button class="btn primary" id="sqStart">Start →</button></div>
        ${drillBestChips("seq")}
      </div>`;
    Floor.bindBack();
    bindDrillSettings();
    $("#sqMode").addEventListener("change", () => { $("#dsMin").value = this.MODES[$("#sqMode").value].min; });
    $("#sqStart").addEventListener("click", () => this.launch());
  },

  launch(prev) {
    const cfg = prev || { mode: $("#sqMode").value, ...readDrillSettings() };
    const pools = this.MODES[cfg.mode].pools;
    runDrill({
      id: "seq", icon: "🔢", title: "Sequence Completion",
      modeKey: cfg.mode, modeLabel: this.MODES[cfg.mode].label,
      format: cfg.format, seconds: cfg.seconds, count: cfg.count,
      ansFmt: cfg.ansFmt, skip: cfg.skip, auto: cfg.auto, pen: cfg.pen,
      gen: () => this.makeQ(pools),
      again: () => this.launch(cfg), settings: () => this.start(),
    });
  },

  makeQ(pools) {
    for (let tries = 0; tries < 20; tries++) {
      const seq = pick(this.GENS[pick(pools)])();
      if (seq.some(v => !Number.isFinite(v) || Math.abs(v) > 99999)) continue;
      const bi = ri(2, seq.length - 1);
      const a = seq[bi];
      const qh = seq.map((v, i) => i === bi ? `<span class="seq-blank">?</span>` : esc(String(v))).join(",&nbsp; ");
      const step = Math.abs(seq[bi] - seq[bi - 1]) || 3;
      return { q: seq.map((v, i) => i === bi ? "_" : v).join(", "), qh, a, disp: String(a),
               choices: mcChoices(a, String(a), step), sub: "fill the blank" };
    }
    return { q: "2, 4, _, 8, 10", qh: "2,&nbsp; 4,&nbsp; <span class='seq-blank'>?</span>,&nbsp; 8,&nbsp; 10",
             a: 6, disp: "6", choices: ["4", "5", "6", "7"], sub: "fill the blank" };
  },
};

/* ============================================================
   FERMI ESTIMATION DRILL
   ============================================================ */
const REAL_FERMI = [
  { q: "World population", a: 8.1e9 },
  { q: "US population", a: 3.4e8 },
  { q: "Cars in operation worldwide", a: 1.5e9 },
  { q: "Commercial flight departures worldwide per day", a: 1e5 },
  { q: "Earth's circumference, in km", a: 40075 },
  { q: "Height of Mount Everest, in meters", a: 8849 },
  { q: "Distance from Earth to the Moon, in km", a: 384400 },
  { q: "Age of the universe, in years", a: 1.38e10 },
  { q: "Neurons in a human brain", a: 8.6e10 },
  { q: "Cells in a human body", a: 3.7e13 },
  { q: "Hairs on a typical human head", a: 1e5 },
  { q: "Human heartbeats per day", a: 1.05e5 },
  { q: "Breaths a person takes per day", a: 2e4 },
  { q: "Liters in an Olympic swimming pool", a: 2.5e6 },
  { q: "Seconds in a decade", a: 3.156e8 },
  { q: "US annual births", a: 3.6e6 },
  { q: "US households", a: 1.3e8 },
  { q: "Words in a typical novel", a: 90000 },
  { q: "McDonald's restaurants worldwide", a: 41000 },
  { q: "Starbucks stores worldwide", a: 39000 },
  { q: "Books held by the Library of Congress", a: 4e7, note: "~39M books; ~170M items total" },
  { q: "Golf balls that fit in a school bus", a: 6.6e5, note: "≈43 m³ × 64% packing ÷ 41.6 cm³" },
  { q: "Piano tuners in the Chicago metro area", a: 80 },
  { q: "Daily Google searches", a: 8.5e9 },
  { q: "iPhones sold per year", a: 2.3e8 },
  { q: "Emails sent worldwide per day", a: 3.5e11 },
  { q: "Weight of a typical car, in kg", a: 1500 },
  { q: "Cruising speed of a Boeing 737, in km/h", a: 850 },
  { q: "Flight distance New York → London, in km", a: 5570 },
  { q: "Cost of a new Boeing 737, in USD", a: 1.2e8 },
  { q: "US vehicle-miles driven per year", a: 3.2e12 },
  { q: "Miles of paved road in the US", a: 2.8e6 },
  { q: "Active satellites orbiting Earth", a: 9000, note: "≈2024; growing fast" },
  { q: "Countries in the world (UN members)", a: 193 },
  { q: "US federal budget, USD per year", a: 6.8e12 },
  { q: "Total US equity market capitalization, USD", a: 5.5e13 },
  { q: "New cars sold worldwide per year", a: 7.5e7 },
  { q: "Steps an average person takes per day", a: 5000 },
  { q: "Pizza slices eaten in the US per day", a: 3e7, note: "the famous 350-per-second figure" },
  { q: "Average depth of the ocean, in meters", a: 3700 },
];

const FermiDrill = {
  id: "fermi",
  MODES: {
    both: { label: "Math + Real World" },
    math: { label: "Math only" },
    real: { label: "Real World only" },
  },

  start() {
    Floor.stopAll();
    $("#view-floor").innerHTML = `
      <div class="row spread">${Floor.backBtn()}<span class="muted small">Five Rings territory: fast, defensible numbers</span></div>
      <h2 class="mt16">🧮 Fermi Estimation</h2>
      <p class="lede">Estimate — don't compute. Math questions score on relative error (within ~3% ≈ 0.9);
      real-world questions score on order of magnitude (within ×1.26 ≈ 0.9, a factor of 10 scores zero).
      A question scoring ≥ 0.9 counts as correct. Suffixes work: type 4.2M, 1.5B, 370k.</p>
      <div class="card mt16">
        <div class="row" style="gap:16px; align-items:flex-end">
          <div class="quote-field"><label>Game mode</label>
            <select id="feMode">${Object.entries(this.MODES).map(([k, m]) =>
              `<option value="${k}">${m.label}</option>`).join("")}</select></div>
        </div>
        ${drillSettingsHTML({ format: "time", min: 5, count: 10, noFmt: true, noMove: true })}
        <div class="row mt16"><button class="btn primary" id="feStart">Start →</button></div>
        ${drillBestChips("fermi")}
      </div>`;
    Floor.bindBack();
    bindDrillSettings();
    $("#feStart").addEventListener("click", () => this.launch());
  },

  launch(prev) {
    const cfg = prev || { mode: $("#feMode").value, ...readDrillSettings() };
    runDrill({
      id: "fermi", icon: "🧮", title: "Fermi Estimation",
      modeKey: cfg.mode, modeLabel: this.MODES[cfg.mode].label,
      format: cfg.format, seconds: cfg.seconds, count: cfg.count,
      ansFmt: "type", skip: cfg.skip, auto: false, pen: false,
      scored: true,
      scoreFn: (x, a, q) => {
        if (!(x > 0) || !(a > 0)) return x === a ? 1 : 0;
        return q.kind === "math"
          ? Math.max(0, 1 - Math.abs(x / a - 1) / 0.3)
          : Math.max(0, 1 - Math.abs(Math.log10(x / a)));
      },
      gen: () => this.makeQ(cfg.mode),
      again: () => this.launch(cfg), settings: () => this.start(),
    });
  },

  makeQ(mode) {
    const math = mode !== "real" && (mode === "math" || Math.random() < 0.5);
    if (!math) {
      const r = pick(REAL_FERMI);
      return { q: r.q, a: r.a, kind: "real", disp: fmtBig(r.a), note: r.note, sub: "real-world · scored on order of magnitude" };
    }
    switch (pick(["mul", "div", "inv", "sqrt", "pow", "pct"])) {
      case "mul": { const a = ri(1200, 98000), b = ri(120, 9800);
        return { q: `${a.toLocaleString("en-US")} × ${b.toLocaleString("en-US")}`, a: a * b, kind: "math", disp: fmtBig(a * b), sub: "estimate · scored on relative error" }; }
      case "div": { const X = ri(1e6, 9e8), d = ri(120, 9700);
        return { q: `${X.toLocaleString("en-US")} ÷ ${d.toLocaleString("en-US")}`, a: X / d, kind: "math", disp: fmtBig(X / d), sub: "estimate · scored on relative error" }; }
      case "inv": { const v = ri(11, 970) / 10000;
        return { q: `1 ÷ ${v}`, a: 1 / v, kind: "math", disp: fmtBig(1 / v), sub: "estimate · scored on relative error" }; }
      case "sqrt": { const x = ri(1e5, 9e8);
        return { q: `√${x.toLocaleString("en-US")}`, a: Math.sqrt(x), kind: "math", disp: fmtBig(Math.sqrt(x)), sub: "estimate · scored on relative error" }; }
      case "pow": { const b = ri(3, 9), e = ri(4, 7);
        return { q: `${b}^${e}`, a: b ** e, kind: "math", disp: fmtBig(b ** e), sub: "estimate · scored on relative error" }; }
      case "pct": { const p = ri(2, 95) / 10, Y = ri(1, 900) * 1e5;
        return { q: `${p}% of ${fmtBig(Y)}`, a: p / 100 * Y, kind: "math", disp: fmtBig(p / 100 * Y), sub: "estimate · scored on relative error" }; }
    }
  },
};
