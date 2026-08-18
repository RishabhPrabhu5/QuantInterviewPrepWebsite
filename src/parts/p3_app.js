/* ============================================================
   p3_app.js — part 3 of 6. State, persistence, and three of the five views.
   ============================================================
   Sections below, in order:
     1. `state` + `Store`      the single state object and its localStorage wrapper
     2. helpers                $/$$ selectors, esc(), formatters, solved predicates
     3. tab router             switchView() — the only way views change
     4. answer checking        parseAnswer() / checkAnswer() / fmtExpected()
     5. Roadmap view           stages, topic cards, firm playbooks
     6. Question Bank view     filters, list, and the question modal
     7. Progress view          skill scores, recommendations, review queue, I/O

   RENDERING MODEL. No framework and no reactivity: each view owns a render
   function that rebuilds its subtree from a template string and re-binds its
   listeners. Mutating `state` does nothing visible until you call the render
   function again — so every mutation site ends with an explicit
   `Store.save()` and the relevant re-render. All interpolated content goes
   through esc(), which covers & < > " (single quotes are not escaped, which
   is safe only because every attribute in this file is double-quoted).

   PERSISTENCE. `Store` keys off "deskprep_progress_v1" and feature-detects
   localStorage in a try/catch at definition time (`Store.ok`). Sandboxed
   previews block storage entirely, so every call site must tolerate ok ===
   false; the Progress tab surfaces a banner explaining the degraded mode.
   Bump the KEY string only alongside a migration, since old blobs are read
   with Object.assign and unknown fields are ignored.

   ANSWER CHECKING is the subtle part. parseAnswer() normalizes currency
   symbols, thousands separators, unicode minus, percents, k/M/B/T suffixes
   and fractions into a number plus a "was a percent" flag. checkAnswer()
   then builds a candidate list — the parsed value, plus value/100 when the
   spec is `pct` and the user typed a bare number — and accepts if any
   candidate lands in tolerance. Verdicts are ok | near | wrong | invalid;
   `near` exists so that a rounding slip reads differently from a wrong
   method. Tolerance rules, which the question data depends on:
     - t:"f"       within spec.factor either direction; 2x factor => near
     - integer v   exact, with a near band of max(1, 2%)
     - otherwise   max(abs, rel * |v|) with rel defaulting to 0.01

   SCORING. qSolved() is true if the checker was ever satisfied OR the user
   self-rated Good/Easy, so the bank is honor-system by design. topicSkill()
   blends both signals — first-try 1.0, eventual 0.7, miss 0.12, ratings
   0.1/0.45/0.85/1.0 — and takes the max when both exist. It returns null for
   untouched topics, which the Progress view renders separately rather than
   as a zero, so that "not tried" never looks like "failed".
   ============================================================ */
const state = {
  ratings: {},          // qid -> 1(again) 2(hard) 3(good) 4(easy)
  qstats: {},           // qid -> {att, ok, first}  (answer-check outcomes)
  codingStatus: {},     // pid -> 'passed' | 'attempted'
  codingAtt: {},        // pid -> run count
  drillBests: {},       // "<drill>:<mode>" -> {score}   (timed drills, p5b)
  history: [],          // [{t, kind:'q'|'code', id, ok}]
  pnlTotal: 0,
  view: "roadmap",
  bankFilters: { topic: "all", firm: "all", diff: "all", status: "all" },
};

const Store = {
  KEY: "deskprep_progress_v1",
  ok: (() => { try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return true; } catch (e) { return false; } })(),
  save() {
    if (!this.ok) return;
    try {
      localStorage.setItem(this.KEY, JSON.stringify({
        ratings: state.ratings, qstats: state.qstats, codingStatus: state.codingStatus,
        codingAtt: state.codingAtt, drillBests: state.drillBests,
        history: state.history.slice(-200), pnlTotal: state.pnlTotal,
        drafts: (typeof Coding !== "undefined") ? Coding.drafts : {},
      }));
    } catch (e) {}
  },
  load() {
    if (!this.ok) return;
    try {
      const d = JSON.parse(localStorage.getItem(this.KEY) || "null");
      if (!d) return;
      Object.assign(state.ratings, d.ratings || {});
      Object.assign(state.qstats, d.qstats || {});
      Object.assign(state.codingStatus, d.codingStatus || {});
      Object.assign(state.codingAtt, d.codingAtt || {});
      Object.assign(state.drillBests, d.drillBests || {});
      state.history = d.history || [];
      state.pnlTotal = d.pnlTotal || 0;
      this._drafts = d.drafts || {};
    } catch (e) {}
  },
  exportJson() {
    const blob = new Blob([JSON.stringify({
      ratings: state.ratings, qstats: state.qstats, codingStatus: state.codingStatus,
      codingAtt: state.codingAtt, drillBests: state.drillBests,
      history: state.history, pnlTotal: state.pnlTotal,
      drafts: (typeof Coding !== "undefined") ? Coding.drafts : {}, exported: new Date().toISOString(),
    }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "deskprep-progress.json";
    a.click();
    URL.revokeObjectURL(a.href);
  },
  importJson(file, done) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        Object.assign(state.ratings, d.ratings || {});
        Object.assign(state.qstats, d.qstats || {});
        Object.assign(state.codingStatus, d.codingStatus || {});
        Object.assign(state.codingAtt, d.codingAtt || {});
        Object.assign(state.drillBests, d.drillBests || {});
        state.history = d.history || state.history;
        state.pnlTotal = d.pnlTotal ?? state.pnlTotal;
        if (d.drafts && typeof Coding !== "undefined") Object.assign(Coding.drafts, d.drafts);
        this.save(); done(true);
      } catch (e) { done(false); }
    };
    r.readAsText(file);
  },
  reset() {
    state.ratings = {}; state.qstats = {}; state.codingStatus = {}; state.codingAtt = {};
    state.drillBests = {}; state.history = []; state.pnlTotal = 0;
    if (typeof Coding !== "undefined") Coding.drafts = {};
    if (this.ok) try { localStorage.removeItem(this.KEY); } catch (e) {}
  },
};

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const fmtMoney = v => (v < 0 ? "−$" : "$") + Math.abs(v).toFixed(0);
const topicById = id => TOPICS.find(t => t.id === id);
const firmById = id => FIRMS.find(f => f.id === id);
const DIFF_LABEL = { 1: ["easy","Easy"], 2: ["medium","Medium"], 3: ["hard","Hard"] };

function qSolved(q) { return (state.qstats[q.id] && state.qstats[q.id].ok) || (state.ratings[q.id] || 0) >= 3; }
function bankSolvedCount() { return QUESTIONS.filter(qSolved).length; }
function codeSolvedCount() { return Object.values(state.codingStatus).filter(s => s === "passed").length; }

function logEvent(kind, id, ok) {
  state.history.push({ t: Date.now(), kind, id, ok });
  if (state.history.length > 400) state.history.shift();
}

function updatePill() {
  $("#pillSolved").textContent = bankSolvedCount() + codeSolvedCount();
  const p = $("#pillPnl");
  p.textContent = fmtMoney(state.pnlTotal);
  p.style.color = state.pnlTotal > 0 ? "var(--good)" : state.pnlTotal < 0 ? "var(--critical)" : "";
}
function addPnl(v) { state.pnlTotal += v; updatePill(); Store.save(); }

/* ---------- tabs ---------- */
$("#mainTabs").addEventListener("click", e => {
  const btn = e.target.closest(".tab-btn"); if (!btn) return;
  switchView(btn.dataset.view);
});
function switchView(v) {
  state.view = v;
  $$("#mainTabs .tab-btn").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  $$("main .view").forEach(s => s.classList.toggle("active", s.id === "view-" + v));
  if (v === "roadmap") renderRoadmap();
  if (v === "bank") renderBank();
  if (v === "coding") Coding.render();
  if (v === "floor") Floor.renderHub();
  if (v === "progress") renderProgress();
}

/* ============================================================
   ANSWER CHECKING
   ============================================================ */
function parseAnswer(raw) {
  let s = String(raw).trim().toLowerCase().replace(/[$,\s]/g, "").replace(/−/g, "-");
  if (!s) return null;
  let pct = false;
  if (s.endsWith("%")) { pct = true; s = s.slice(0, -1); }
  let mult = 1;
  const sufMap = { k: 1e3, m: 1e6, mm: 1e6, b: 1e9, bn: 1e9, t: 1e12 };
  const sufMatch = s.match(/(k|mm|m|bn|b|t)$/);
  if (sufMatch && !/e[-+]?\d+$/.test(s)) { mult = sufMap[sufMatch[1]]; s = s.slice(0, -sufMatch[1].length); }
  let v;
  if (s.includes("/")) {
    const [a, b] = s.split("/");
    const na = parseFloat(a), nb = parseFloat(b);
    if (isNaN(na) || isNaN(nb) || nb === 0) return null;
    v = na / nb;
  } else {
    v = parseFloat(s);
    if (isNaN(v)) return null;
  }
  v *= mult;
  return { v, pct };
}

function checkAnswer(spec, raw) {
  const p = parseAnswer(raw);
  if (!p) return { verdict: "invalid" };
  const candidates = [p.pct ? p.v / 100 : p.v];
  if (spec.pct && !p.pct) candidates.push(p.v / 100);      // typed "18" meaning 18%
  if (spec.t === "f") {
    for (const c of candidates) {
      if (c > 0 && Math.max(c / spec.v, spec.v / c) <= spec.factor) return { verdict: "ok", val: c };
    }
    const c = candidates[0];
    if (c > 0 && Math.max(c / spec.v, spec.v / c) <= spec.factor * 2) return { verdict: "near", val: c };
    return { verdict: "wrong", val: c };
  }
  const isInt = Number.isInteger(spec.v) && spec.abs === undefined && spec.rel === undefined;
  const tol = isInt ? 1e-9 : Math.max(spec.abs ?? 0, (spec.rel ?? 0.01) * Math.abs(spec.v), 1e-9);
  for (const c of candidates) {
    if (Math.abs(c - spec.v) <= tol) return { verdict: "ok", val: c };
  }
  const best = candidates[0];
  const nearTol = isInt ? Math.max(1, Math.abs(spec.v) * 0.02) : tol * 1.8;
  if (Math.abs(best - spec.v) <= nearTol) return { verdict: "near", val: best };
  return { verdict: "wrong", val: best };
}

function fmtExpected(spec) {
  const v = spec.v;
  if (spec.t === "f") {
    if (v >= 1e9) return (v / 1e9) + "B";
    if (v >= 1e6) return (v / 1e6) + "M";
    if (v >= 1e3) return (v / 1e3) + "k";
    return String(v);
  }
  return Math.abs(v) < 0.01 && v !== 0 ? v.toPrecision(2) : String(Math.round(v * 10000) / 10000);
}

/* ============================================================
   ROADMAP
   ============================================================ */
function topicProgress(tid) {
  const qs = QUESTIONS.filter(q => q.topic === tid);
  const done = qs.filter(qSolved).length;
  return { done, total: qs.length, pct: qs.length ? Math.round(100 * done / qs.length) : 0 };
}

function renderRoadmap() {
  const el = $("#view-roadmap");
  let html = `
    <h1>Roadmap</h1>
    <p class="lede">Work the stages in order. A question counts as cleared when you <b>answer it correctly</b> in the checker
    or rate it Good/Easy after solving. The Progress tab tracks accuracy and tells you what to drill.</p>
    <div class="row mt16" style="gap:18px">
      <div class="stat-tile"><div class="k">Questions cleared</div><div class="v">${bankSolvedCount()} / ${QUESTIONS.length}</div></div>
      <div class="stat-tile"><div class="k">Coding solved</div><div class="v">${codeSolvedCount()} / ${CODING_PROBLEMS.length}</div></div>
      <div class="stat-tile"><div class="k">Trading PnL</div><div class="v ${state.pnlTotal>0?"pos":state.pnlTotal<0?"neg":""}">${fmtMoney(state.pnlTotal)}</div></div>
    </div>`;
  for (const st of STAGES) {
    const topics = TOPICS.filter(t => t.stage === st.id);
    const allDone = topics.every(t => { const p = topicProgress(t.id); return p.total && p.done === p.total; });
    html += `
      <div class="stage ${allDone ? "done" : ""}">
        <div class="stage-num">${st.id.slice(1)}</div>
        <div class="stage-head"><div><h2>${esc(st.name)}</h2><div class="muted small">${esc(st.desc)}</div></div></div>
        <div class="topic-grid">
          ${topics.map(t => {
            const p = topicProgress(t.id);
            return `<div class="topic-card" data-topic="${t.id}">
              <div class="t-name"><span>${t.icon}</span> ${esc(t.name)}</div>
              <div class="t-desc">${esc(t.desc)}</div>
              <div class="progress-track"><div class="progress-fill" style="width:${p.pct}%"></div></div>
              <div class="t-meta"><span>${p.done}/${p.total} cleared</span><span>${p.pct}%</span></div>
            </div>`;
          }).join("")}
        </div>
      </div>`;
  }
  html += `
    <div class="mt32">
      <h2>Firm playbooks</h2>
      <p class="muted small" style="max-width:70ch">What each desk actually screens for, and how their loops run.</p>
      <div class="firm-grid mt16">
        ${FIRMS.map(f => {
          const top = Object.entries(f.weights).sort((a,b) => b[1]-a[1]).slice(0,5);
          return `<div class="firm-card">
            <h3>${esc(f.name)} <span class="style">${esc(f.style)}</span></h3>
            <p>${esc(f.blurb)}</p>
            <p class="small muted" style="margin-top:8px"><b style="color:var(--ink-2)">Process:</b> ${esc(f.process)}</p>
            <div class="weights">
              ${top.map(([tid,w]) => `
                <div class="wrow"><span>${esc(topicById(tid).name.split("·")[0].trim())}</span>
                <div class="wbar"><i style="width:${Math.round(w*100)}%"></i></div></div>`).join("")}
            </div>
            <div class="mt8"><button class="btn sm ghost" data-firmdrill="${f.id}">Drill ${esc(f.name)} questions →</button></div>
          </div>`;
        }).join("")}
      </div>
    </div>`;
  el.innerHTML = html;
  $$(".topic-card", el).forEach(c => c.addEventListener("click", () => {
    state.bankFilters = { topic: c.dataset.topic, firm: "all", diff: "all", status: "all" };
    switchView("bank");
  }));
  $$("[data-firmdrill]", el).forEach(b => b.addEventListener("click", () => {
    state.bankFilters = { topic: "all", firm: b.dataset.firmdrill, diff: "all", status: "all" };
    switchView("bank");
  }));
}

/* ============================================================
   QUESTION BANK
   ============================================================ */
function renderBank() {
  const el = $("#view-bank");
  const f = state.bankFilters;
  el.innerHTML = `
    <h1>Question Bank</h1>
    <p class="lede">${QUESTIONS.length} original questions in the style of the top desks. Most have an answer checker —
    commit to a number <i>before</i> touching the hint. Wrong answers land in your review queue automatically.</p>
    <div class="filters">
      <select id="fTopic">
        <option value="all">All topics</option>
        ${TOPICS.map(t => `<option value="${t.id}" ${f.topic===t.id?"selected":""}>${esc(t.name)}</option>`).join("")}
      </select>
      <select id="fFirm">
        <option value="all">All firms</option>
        ${FIRMS.map(fr => `<option value="${fr.id}" ${f.firm===fr.id?"selected":""}>${esc(fr.name)}</option>`).join("")}
      </select>
      <select id="fDiff">
        <option value="all">All difficulties</option>
        <option value="1" ${f.diff==="1"?"selected":""}>Easy</option>
        <option value="2" ${f.diff==="2"?"selected":""}>Medium</option>
        <option value="3" ${f.diff==="3"?"selected":""}>Hard</option>
      </select>
      <select id="fStatus">
        <option value="all">Any status</option>
        <option value="new" ${f.status==="new"?"selected":""}>Unseen</option>
        <option value="weak" ${f.status==="weak"?"selected":""}>Needs review</option>
        <option value="done" ${f.status==="done"?"selected":""}>Cleared</option>
      </select>
      <span class="muted small" id="bankCount"></span>
    </div>
    <div class="qlist" id="qList"></div>`;
  ["fTopic","fFirm","fDiff","fStatus"].forEach(id => $("#"+id).addEventListener("change", () => {
    state.bankFilters = { topic: $("#fTopic").value, firm: $("#fFirm").value, diff: $("#fDiff").value, status: $("#fStatus").value };
    renderQList();
  }));
  renderQList();
}

function questionStatus(q) {
  if (qSolved(q)) return "done";
  const st = state.qstats[q.id];
  if ((st && st.att > 0) || state.ratings[q.id]) return "weak";
  return "new";
}

function renderQList() {
  const f = state.bankFilters;
  const list = QUESTIONS.filter(q =>
    (f.topic === "all" || q.topic === f.topic) &&
    (f.firm === "all" || q.firms.includes(f.firm)) &&
    (f.diff === "all" || String(q.diff) === f.diff) &&
    (f.status === "all" || questionStatus(q) === f.status)
  );
  $("#bankCount").textContent = list.length + " question" + (list.length === 1 ? "" : "s");
  const ICONS = { new: "·", weak: "↻", done: "✓" };
  const COLORS = { new: "var(--ink-muted)", weak: "var(--warning)", done: "var(--good)" };
  $("#qList").innerHTML = list.map(q => {
    const st = questionStatus(q);
    const [cls, lbl] = DIFF_LABEL[q.diff];
    return `<div class="qrow" data-q="${q.id}">
      <div class="status-ic" style="color:${COLORS[st]}">${ICONS[st]}</div>
      <div>
        <div class="q-title">${esc(q.title)}</div>
        <div class="q-tags">
          <span class="badge">${topicById(q.topic).icon} ${esc(topicById(q.topic).name.split("·")[0].trim())}</span>
          ${q.firms.slice(0,3).map(fid => `<span class="badge firm">${esc(firmById(fid).name)}</span>`).join("")}
          ${q.ans ? "" : `<span class="badge">discussion</span>`}
        </div>
      </div>
      <div class="q-right"><span class="badge ${cls}">${lbl}</span></div>
    </div>`;
  }).join("") || `<div class="muted" style="padding:30px;text-align:center">No questions match these filters.</div>`;
  $$("#qList .qrow").forEach(r => r.addEventListener("click", () => openQuestion(r.dataset.q)));
}

function openQuestion(qid) {
  const q = QUESTIONS.find(x => x.id === qid);
  const [cls, lbl] = DIFF_LABEL[q.diff];
  const st = state.qstats[q.id] || { att: 0, ok: false, first: false };
  const ansBlock = q.ans ? `
    <div class="ans-card" id="ansCard">
      <label>Your answer — ${esc(q.ans.label || "final value")}</label>
      ${st.ok ? `
        <div class="mt8"><span class="solved-chip">✓ Solved${st.first ? " on the first try" : ""}</span>
        <span class="muted small"> · reference: ${esc(fmtExpected(q.ans))}</span></div>` : `
        <div class="ans-row2">
          <input type="text" id="ansIn" placeholder="e.g. 2/11, 0.18, 18%, 4.2M" autocomplete="off">
          <button class="btn primary" id="ansCheck">Check</button>
        </div>
        <div class="ans-fb" id="ansFb"></div>
        <div class="small muted mt8">${st.att ? st.att + " attempt" + (st.att > 1 ? "s" : "") + " so far · " : ""}accepts fractions, decimals, %, and k/M/B suffixes</div>`}
    </div>` : `
    <div class="ans-card"><label>Discussion question</label>
      <div class="small mt8" style="color:var(--ink-2)">No single number to check — talk your answer out loud (seriously: out loud), then open the solution and self-rate against it. Structure &gt; conclusion.</div>
    </div>`;
  $("#qModal").innerHTML = `
    <div class="row spread">
      <div class="row" style="gap:8px">
        <span class="badge">${topicById(q.topic).icon} ${esc(topicById(q.topic).name)}</span>
        <span class="badge ${cls}">${lbl}</span>
        ${q.firms.map(fid => `<span class="badge firm">${esc(firmById(fid).name)}</span>`).join("")}
      </div>
      <button class="btn sm ghost" id="qClose">✕ close</button>
    </div>
    <h2 class="mt16">${esc(q.title)}</h2>
    <div class="q-body">${esc(q.prompt)}</div>
    ${ansBlock}
    <div class="reveal-box" id="hintBox"><button>💡 Show hint</button>
      <div class="reveal-content">${esc(q.hint)}</div></div>
    <div class="reveal-box" id="solBox"><button>📖 Show solution</button>
      <div class="reveal-content">${esc(q.solution)}</div></div>
    <div class="rate-row">
      <span class="muted small">Self-rate the solve:&nbsp;</span>
      <button class="btn sm" data-rate="1" style="border-color:rgba(208,59,59,.6)">Again</button>
      <button class="btn sm" data-rate="2" style="border-color:rgba(250,178,25,.5)">Hard</button>
      <button class="btn sm" data-rate="3" style="border-color:rgba(12,163,12,.5)">Good</button>
      <button class="btn sm" data-rate="4" style="border-color:rgba(12,163,12,.8)">Easy</button>
      <span class="small muted" id="rateEcho">${state.ratings[q.id] ? "rated " + ["","Again","Hard","Good","Easy"][state.ratings[q.id]] : ""}</span>
    </div>`;
  $("#qModalScrim").classList.add("open");
  $("#qClose").addEventListener("click", closeQuestion);
  $$("#qModal .reveal-box > button").forEach(b =>
    b.addEventListener("click", () => b.parentElement.classList.toggle("open")));
  $$("#qModal [data-rate]").forEach(b => b.addEventListener("click", () => {
    state.ratings[q.id] = +b.dataset.rate;
    $("#rateEcho").textContent = "rated " + ["","Again","Hard","Good","Easy"][+b.dataset.rate];
    logEvent("q", q.id, +b.dataset.rate >= 3);
    updatePill(); Store.save(); renderQList();
  }));
  const checkBtn = $("#ansCheck");
  if (checkBtn) {
    const doCheck = () => {
      const raw = $("#ansIn").value;
      if (!raw.trim()) return;
      const s = state.qstats[q.id] || (state.qstats[q.id] = { att: 0, ok: false, first: false });
      const res = checkAnswer(q.ans, raw);
      const fb = $("#ansFb");
      if (res.verdict === "invalid") {
        fb.className = "ans-fb near";
        fb.textContent = "Couldn't parse that — try a plain number, a fraction like 2/11, a percent like 18%, or 4.2M.";
        return;
      }
      s.att++;
      if (res.verdict === "ok") {
        s.ok = true; s.first = s.att === 1;
        logEvent("q", q.id, true);
        fb.className = "ans-fb good";
        fb.textContent = s.first
          ? "✓ Correct, first try. Read the solution anyway — the method matters as much as the number."
          : `✓ Correct (attempt ${s.att}). Open the solution and make sure your path was the clean one.`;
        $("#solBox").classList.add("open");
        updatePill(); Store.save(); renderQList();
        setTimeout(() => openQuestion(qid), 900);
      } else if (res.verdict === "near") {
        logEvent("q", q.id, false);
        fb.className = "ans-fb near";
        fb.textContent = "Close but outside tolerance — check rounding, sign, or whether they asked for a probability vs a percent.";
        Store.save();
      } else {
        logEvent("q", q.id, false);
        fb.className = "ans-fb bad";
        fb.textContent = s.att === 1
          ? "✗ Not it. Re-read the prompt for the trap, or take the hint."
          : "✗ Still off. This one's now in your review queue — take the hint, or study the solution and come back tomorrow.";
        Store.save(); renderQList();
      }
    };
    checkBtn.addEventListener("click", doCheck);
    $("#ansIn").addEventListener("keydown", e => { if (e.key === "Enter") doCheck(); });
    $("#ansIn").focus();
  }
}
function closeQuestion() { $("#qModalScrim").classList.remove("open"); }
$("#qModalScrim").addEventListener("click", e => { if (e.target === $("#qModalScrim")) closeQuestion(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeQuestion(); });

/* ============================================================
   PROGRESS TAB — solved tracking + skill gaps
   ============================================================ */
function topicSkill(tid) {
  const qs = QUESTIONS.filter(q => q.topic === tid);
  let sum = 0, n = 0, attempted = 0;
  for (const q of qs) {
    const st = state.qstats[q.id];
    const r = state.ratings[q.id] || 0;
    let sig = null;
    if (st && st.att > 0) sig = st.ok ? (st.first ? 1 : 0.7) : 0.12;
    if (r) sig = Math.max(sig ?? 0, [0, 0.1, 0.45, 0.85, 1][r]);
    if (sig !== null) { sum += sig; n++; attempted++; }
  }
  return { score: n ? sum / n : null, attempted, total: qs.length };
}

function relTime(t) {
  const d = Date.now() - t;
  if (d < 60e3) return "just now";
  if (d < 3600e3) return Math.floor(d / 60e3) + "m ago";
  if (d < 86400e3) return Math.floor(d / 3600e3) + "h ago";
  return Math.floor(d / 86400e3) + "d ago";
}

function renderProgress() {
  const el = $("#view-progress");
  const attempts = Object.values(state.qstats).filter(s => s.att > 0);
  const firstTry = attempts.filter(s => s.ok && s.first).length;
  const accuracy = attempts.length ? Math.round(100 * firstTry / attempts.length) : null;
  const skills = TOPICS.map(t => ({ t, ...topicSkill(t.id) }));
  const assessed = skills.filter(s => s.score !== null).sort((a, b) => a.score - b.score);
  const untouched = skills.filter(s => s.score === null);
  const queue = QUESTIONS.filter(q => questionStatus(q) === "weak");
  const codeByMode = m => {
    const ps = CODING_PROBLEMS.filter(p => p.mode === m);
    return { solved: ps.filter(p => state.codingStatus[p.id] === "passed").length, total: ps.length,
             unsolvedHard: ps.filter(p => p.diff === 3 && state.codingStatus[p.id] !== "passed") };
  };
  const algo = codeByMode("algo"), data = codeByMode("data");
  const recent = state.history.slice(-12).reverse();

  el.innerHTML = `
    <h1>Progress</h1>
    <p class="lede">${Store.ok
      ? "Everything here auto-saves in this browser. Export a backup before switching machines."
      : "⚠ This embedded preview can't persist storage — progress lives only in this session. Download the file and open it locally for auto-save, or use Export below."}</p>
    <div class="row mt16" style="gap:12px">
      <div class="stat-tile"><div class="k">Bank cleared</div><div class="v">${bankSolvedCount()} / ${QUESTIONS.length}</div></div>
      <div class="stat-tile"><div class="k">First-try accuracy</div><div class="v">${accuracy === null ? "—" : accuracy + "%"}</div></div>
      <div class="stat-tile"><div class="k">Coding solved</div><div class="v">${codeSolvedCount()} / ${CODING_PROBLEMS.length}</div></div>
      <div class="stat-tile"><div class="k">Review queue</div><div class="v">${queue.length}</div></div>
      <div class="stat-tile"><div class="k">Trading PnL</div><div class="v ${state.pnlTotal>0?"pos":state.pnlTotal<0?"neg":""}">${fmtMoney(state.pnlTotal)}</div></div>
    </div>

    <div class="two-col mt24">
      <div>
        <div class="card">
          <h2>Skill assessment</h2>
          <p class="small muted">Score blends answer-checker results (first-try &gt; eventual &gt; miss) with your self-ratings. Weakest first — that's your study order.</p>
          ${assessed.length ? `<div class="skill-rows">
            ${assessed.map(s => `
              <div class="skill-row">
                <span class="nm">${s.t.icon} ${esc(s.t.name.split("·")[0].trim())}</span>
                <div class="skill-track"><div class="skill-fill" style="width:${Math.round(s.score * 100)}%"></div></div>
                <span class="pct">${Math.round(s.score * 100)}% · ${s.attempted}/${s.total} tried</span>
                <button class="btn sm ghost" data-drill="${s.t.id}">drill →</button>
              </div>`).join("")}
          </div>` : `<div class="muted small mt8">No signal yet — answer some questions and this fills in.</div>`}
          ${untouched.length ? `<div class="mt16 small muted">Untouched: ${untouched.map(s =>
            `<button class="btn sm ghost" data-drill="${s.t.id}">${s.t.icon} ${esc(s.t.name.split("·")[0].trim())}</button>`).join(" ")}</div>` : ""}
        </div>

        <div class="card mt16">
          <h2>Focus next</h2>
          ${(() => {
            const recs = [];
            if (assessed.length && assessed[0].score < 0.7)
              recs.push(`Your weakest assessed topic is <b>${esc(assessed[0].t.name)}</b> (${Math.round(assessed[0].score*100)}%) — drill it before adding new topics.`);
            if (queue.length >= 3)
              recs.push(`${queue.length} questions sit in your review queue — clear those first; re-solving misses is the highest-yield 20 minutes in interview prep.`);
            if (untouched.length)
              recs.push(`${untouched.length} topics have zero attempts${untouched.some(s=>s.t.stage==="s2") ? ", including core probability — cover those before firm-specific prep" : ""}.`);
            if (algo.unsolvedHard.length)
              recs.push(`Unsolved hard algo: ${algo.unsolvedHard.map(p => esc(p.title)).join(", ")} — the HRT/Jump screens live there.`);
            if (data.unsolvedHard.length)
              recs.push(`Unsolved hard Data &amp; ML: ${data.unsolvedHard.map(p => esc(p.title)).join(", ")}.`);
            if (!recs.length) recs.push("Nothing urgent — raise difficulty: filter the bank to Hard, or replay the trading games at the highest level.");
            return `<div class="small mt8" style="color:var(--ink-2); display:flex; flex-direction:column; gap:8px">${recs.map(r => `<div>• ${r}</div>`).join("")}</div>`;
          })()}
        </div>

        <div class="card mt16">
          <h2>Coding tracks</h2>
          <div class="skill-rows">
            <div class="skill-row">
              <span class="nm">⌨ Algorithms</span>
              <div class="skill-track"><div class="skill-fill" style="width:${Math.round(100*algo.solved/algo.total)}%"></div></div>
              <span class="pct">${algo.solved}/${algo.total}</span>
              <button class="btn sm ghost" id="goAlgo">open →</button>
            </div>
            <div class="skill-row">
              <span class="nm">📊 Data &amp; ML</span>
              <div class="skill-track"><div class="skill-fill" style="width:${Math.round(100*data.solved/data.total)}%"></div></div>
              <span class="pct">${data.solved}/${data.total}</span>
              <button class="btn sm ghost" id="goData">open →</button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <h3>Review queue</h3>
          <p class="small muted">Missed or rated Again/Hard — not yet cleared.</p>
          <div class="mt8" style="display:flex; flex-direction:column; gap:7px; max-height:300px; overflow-y:auto">
            ${queue.length ? queue.map(q => `
              <div class="queue-row" data-q="${q.id}">
                <span class="small" style="font-weight:650">${esc(q.title)}</span>
                <span class="badge ${DIFF_LABEL[q.diff][0]}">${DIFF_LABEL[q.diff][1]}</span>
              </div>`).join("") : `<div class="muted small">Empty — misses land here automatically.</div>`}
          </div>
        </div>
        <div class="card mt16">
          <h3>Recent activity</h3>
          <div class="mt8">
            ${recent.length ? recent.map(h => {
              const name = h.kind === "q" ? (QUESTIONS.find(q => q.id === h.id) || {}).title
                : h.kind === "drill" ? ({ mm: "Mental math drill", seq: "Sequence drill", fermi: "Fermi drill" })[h.id]
                : (CODING_PROBLEMS.find(p => p.id === h.id) || {}).title;
              return `<div class="act-row"><span class="when">${relTime(h.t)}</span><span style="color:${h.ok ? "var(--good)" : "var(--critical)"}">${h.ok ? "✓" : "✗"}</span><span>${esc(name || h.id)}</span></div>`;
            }).join("") : `<div class="muted small">Nothing yet.</div>`}
          </div>
        </div>
        <div class="card mt16">
          <h3>Progress data</h3>
          <div class="row mt8" style="gap:8px">
            <button class="btn sm" id="expBtn">⬇ Export</button>
            <button class="btn sm" id="impBtn">⬆ Import</button>
            <button class="btn sm danger" id="rstBtn">Reset all</button>
            <input type="file" id="impFile" accept=".json" class="hidden">
          </div>
          <div class="small muted mt8">${Store.ok ? "Auto-save: on (this browser)." : "Auto-save unavailable here — export to keep your progress."}</div>
        </div>
      </div>
    </div>`;
  $$("[data-drill]", el).forEach(b => b.addEventListener("click", () => {
    state.bankFilters = { topic: b.dataset.drill, firm: "all", diff: "all", status: "all" };
    switchView("bank");
  }));
  $$(".queue-row", el).forEach(r => r.addEventListener("click", () => { switchView("bank"); openQuestion(r.dataset.q); }));
  $("#goAlgo").addEventListener("click", () => { Coding.mode = "algo"; switchView("coding"); });
  $("#goData").addEventListener("click", () => { Coding.mode = "data"; switchView("coding"); });
  $("#expBtn").addEventListener("click", () => Store.exportJson());
  $("#impBtn").addEventListener("click", () => $("#impFile").click());
  $("#impFile").addEventListener("change", e => {
    if (e.target.files[0]) Store.importJson(e.target.files[0], ok => { renderProgress(); updatePill(); });
  });
  $("#rstBtn").addEventListener("click", () => {
    if (confirm("Wipe all progress (ratings, answers, coding status, PnL)?")) { Store.reset(); renderProgress(); updatePill(); }
  });
}
