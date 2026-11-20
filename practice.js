// Lug'at va Gaplar bo'limlari: sahifalar, test turlari, natija saqlash.
import {
  doc, getDoc, getDocs, collection, query, orderBy, limit, writeBatch,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { VOCAB, LESSONS } from "./vocab-data.js";
import { SENTENCES, GRAMMAR, SENT_LESSONS } from "./sentence-data.js";
import { attachKana, normJP, toHira } from "./kana.js";

let C; // app.js dan beriladigan yordamchilar
export function initPractice(ctx) { C = ctx; }

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const MASTER = 3, CLEAR = 2;

export const VMAP = {}; VOCAB.forEach(v => VMAP[v.id] = v);
export const SMAP = {}; SENTENCES.forEach(s => SMAP[s.id] = s);
const GMAP = {}; Object.values(GRAMMAR).flat().forEach(g => GMAP[g.id] = g);

// Ma'nosi bir-biriga juda yaqin so'zlar — biri ikkinchisiga chalg'ituvchi variant bo'lmaydi
const SYN = [["だれ", "どなた"], ["なん", "なに"], ["あのひと", "あのかた"], ["せんせい", "きょうし"], ["ちち", "おとうさん"], ["はは", "おかあさん"],
  ["プレゼント", "おみやげ"], ["かいしゃいん", "しゃいん"], ["これ", "この"], ["それ", "その"], ["あれ", "あの"], ["ここ", "こちら"], ["そこ", "そちら"],
  ["あそこ", "あちら"], ["どこ", "どちら"], ["ノート", "てちょう"], ["えんぴつ", "シャープペンシル"], ["コンピューター", "パソコン"],
  ["でんしゃ", "ふつう", "きゅうこう", "とっきゅう", "しんかんせん"], ["あさ", "けさ"], ["ばん", "こんばん"], ["にく", "ぎゅうにく", "ぶたにく", "とりにく"],
  ["おさけ", "ワイン", "ビール"], ["はい", "ええ"], ["かいしゃ", "じむしょ"], ["コンピューター", "パソコン"], ["かします", "あげます"], ["かります", "もらいます"],
  ["おしえます", "ならいます"], ["よみます", "べんきょうします"], ["ごはん", "ばんごはん", "ひるごはん", "あさごはん"]];
const synOf = kana => new Set(SYN.filter(g => g.includes(kana)).flat());

const isKata = s => /^[゠-ヿー・]+$/.test(s);
const lessonsLabel = ls => (!ls || !ls.length) ? "—" : ls.length === LESSONS.length ? `1–${LESSONS[LESSONS.length - 1]} (hammasi)` : ls.join(", ");
const wordHTML = v => `<span class="w-kana">${esc(v.kana)}</span>${v.kanji ? `<span class="w-kanji">${esc(v.kanji)}</span>` : ""}`;

// Gapni chiroyli ko'rsatish: yuklamalardan keyin bo'sh joy
const PARTICLES = ["は", "も", "の", "を", "に", "へ", "で", "と", "から", "まで"];
const QWORDS = ["なん", "なに", "だれ", "どなた", "どこ", "どちら", "いつ", "いくら", "なんじ", "なんさい", "なんようび", "なんばん", "なんがい"];
const QSYN = { なん: ["なに"], なに: ["なん"], だれ: ["どなた"], どなた: ["だれ"], どこ: ["どちら"], どちら: ["どこ"] };
const PEXCL = { は: ["も"], も: ["は"], を: ["は", "も"], に: ["へ", "と"], へ: ["に"], と: ["に"] };
const PTAUGHT = { は: 1, も: 1, の: 1, に: 4, から: 4, まで: 4, と: 4, へ: 5, で: 5, を: 6 };
// Bo'laklar orasiga bo'sh joy: keyingi bo'lak yuklama yoki です/じゃ bo'lmasa (darslikdagidek: わたしは ときどき テニスを します。)
export const jpText = chunks => chunks.map((c, i) => {
  const n = chunks[i + 1];
  if (n === undefined) return c;
  const glue = PARTICLES.includes(n) || /^(です|じゃ|では)/.test(n);
  return c + (glue ? "" : " ");
}).join("");
const sentKey = chunks => normJP(chunks.join(""));

function grammarHTML(ids) {
  const gs = (ids || []).map(id => GMAP[id]).filter(Boolean);
  if (!gs.length) return "";
  return `<div class="gr-notes">${gs.map(g => `<div class="gr-note"><b>${esc(g.p)}</b><span>${esc(g.uz)}</span></div>`).join("")}</div>`;
}
const sayBtn = text => `<button type="button" class="btn sm ghost" data-speak="${esc(text)}">🔊</button>`;

// ================= Statistika =================
async function loadStats(kind, uid = C.S.user.uid) {
  const snap = await getDoc(doc(C.db, "users", uid, "meta", kind === "vocab" ? "vstats" : "sstats"));
  return snap.exists() ? (snap.data().k || {}) : {};
}
function summarize(stats, items) {
  let r = 0, t = 0, mastered = 0; const review = [];
  items.forEach(it => { const s = stats[it.id]; if (!s) return; r += s.r; t += s.seen; if (s.s >= MASTER && !s.rv) mastered++; if (s.rv) review.push(it); });
  return { acc: pct(r, t), answered: t, mastered, review };
}
export async function practiceSummaries(uid) {
  const [vs, ss] = await Promise.all([loadStats("vocab", uid), loadStats("sent", uid)]);
  return { vocab: summarize(vs, VOCAB), sent: summarize(ss, SENTENCES), vs, ss };
}

async function saveAttempt(kind, cfg, results, duration) {
  const uid = C.S.user.uid, now = Date.now();
  const stats = await loadStats(kind);
  for (const a of results) {
    const s = stats[a.k] || (stats[a.k] = { seen: 0, r: 0, w: 0, s: 0, rv: 0 });
    s.seen++; s.t = now;
    if (a.ok) { s.r++; s.s++; if (s.rv && s.s >= CLEAR) s.rv = 0; } else { s.w++; s.s = 0; s.rv = 1; }
  }
  const correct = results.filter(a => a.ok).length;
  const aref = doc(collection(C.db, "users", uid, "attempts"));
  const p = C.S.profile;
  const b = writeBatch(C.db);
  b.set(aref, { kind, createdAt: now, mode: cfg.mode, units: cfg.lessons, opts: cfg.opts, total: results.length, correct,
    duration, review: !!cfg.review, answers: results });
  b.set(doc(C.db, "users", uid, "meta", kind === "vocab" ? "vstats" : "sstats"), { k: stats });
  const upd = { attempts: (p.attempts || 0) + 1, total: (p.total || 0) + results.length, correct: (p.correct || 0) + correct, lastSeen: now };
  b.update(doc(C.db, "users", uid), upd);
  await b.commit();
  Object.assign(C.S.profile, upd);
  return aref.id;
}

// ================= Umumiy test "qobig'i" =================
// q: { k, qt, label, prompt, kind:'choice'|'type'|'order', options:[{key,text,html}], answer, accepted:[], tiles:[], optClass, explain }
function runQuiz(kind, cfg, questions, title) {
  C.page(`
  <div class="quiz" id="quiz">
    <div class="qbar">
      <div class="qmeta"><span id="q-count">—</span><span class="dot">·</span><span>${esc(title)}</span></div>
      <div class="qmeta r"><span class="pill ok" id="q-ok">✓ 0</span><span class="pill bad" id="q-bad">✗ 0</span><span class="pill" id="q-time">0:00</span></div>
    </div>
    <div class="progress"><i id="q-prog"></i></div>
    <div class="card qcard">
      <div class="qtype" id="q-type"></div>
      <div class="prompt" id="q-prompt"></div>
      <div id="q-body"></div>
      <div class="explain" id="q-explain" hidden></div>
      <div class="qfoot">
        <label class="toggle"><input type="checkbox" id="auto" checked> To'g'ri bo'lsa avtomatik o'tish</label>
        <div><button class="btn ghost" id="finish">Yakunlash</button><button class="btn primary" id="next" disabled>Keyingi →</button></div>
      </div>
    </div>
  </div>
  <div class="card narrow center" id="saving" hidden><div class="big-kanji spin">終</div><p>Natija saqlanmoqda…</p></div>`, kind === "vocab" ? "vocab" : "sent");

  const el = { count: $("#q-count"), ok: $("#q-ok"), bad: $("#q-bad"), time: $("#q-time"), prog: $("#q-prog"), type: $("#q-type"),
    prompt: $("#q-prompt"), body: $("#q-body"), explain: $("#q-explain"), next: $("#next"), finish: $("#finish"), auto: $("#auto") };
  try { el.auto.checked = localStorage.getItem("kanjiAuto") !== "0"; } catch (e) {}
  el.auto.onchange = () => { try { localStorage.setItem("kanjiAuto", el.auto.checked ? "1" : "0"); } catch (e) {} };
  let idx = 0, answered = false, okN = 0, badN = 0, autoTimer = null, saving = false, checkFn = null;
  const results = [], t0 = Date.now();
  const timer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); el.time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }, 1000);

  function render() {
    const q = questions[idx];
    answered = false; checkFn = null; el.next.disabled = true; el.explain.hidden = true;
    el.count.textContent = `${idx + 1} / ${questions.length}`;
    el.prog.style.width = `${(idx / questions.length) * 100}%`;
    el.type.textContent = q.label;
    el.prompt.innerHTML = q.prompt;
    if (q.kind === "choice") {
      el.body.innerHTML = `<div class="opts ${q.optClass || "mean-opts"} n${q.options.length}">${q.options.map((o, i) =>
        `<button class="opt" data-i="${i}">${i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : ""}<span>${o.html || esc(o.text)}</span></button>`).join("")}</div>`;
    } else if (q.kind === "type") {
      el.body.innerHTML = `
        <div class="type-box"><input id="ans" class="ans-input" placeholder="Javobni yozing (kana)…" lang="ja">
          <button class="btn primary" id="check">Tekshirish</button></div>
        <div id="kb"></div>`;
      const inp = $("#ans");
      const kb = attachKana(inp, $("#kb"), { onEnter: () => check() });
      if (q.kata) kb.setKata(true);
      const check = () => { if (answered) return; kb.finalize(); const v = inp.value.trim(); if (!v) return inp.focus(); finishTyped(v); };
      $("#check").onclick = check;
      checkFn = check;
      if (!matchMedia("(pointer: coarse)").matches) inp.focus();
    } else if (q.kind === "order") {
      el.body.innerHTML = `<div class="order-target" id="ot"><span class="muted ot-ph">So'zlarni to'g'ri tartibda bosing…</span></div>
        <div class="order-bank" id="ob">${q.tiles.map((t, i) => `<button class="tile-w" data-i="${i}">${esc(t)}</button>`).join("")}</div>
        <div class="order-act"><button class="btn ghost sm" id="oclear">Tozalash</button><button class="btn primary" id="check">Tekshirish</button></div>`;
      const picked = [];
      const draw = () => {
        $("#ot").innerHTML = picked.length ? picked.map((i, j) => `<button class="tile-w in" data-j="${j}">${esc(q.tiles[i])}</button>`).join("") : `<span class="muted ot-ph">So'zlarni to'g'ri tartibda bosing…</span>`;
        [...$("#ob").children].forEach(b => b.classList.toggle("used", picked.includes(+b.dataset.i)));
      };
      $("#ob").onclick = e => { const b = e.target.closest(".tile-w"); if (!b || answered || picked.includes(+b.dataset.i)) return; picked.push(+b.dataset.i); draw(); };
      $("#ot").onclick = e => { const b = e.target.closest(".tile-w"); if (!b || answered) return; picked.splice(+b.dataset.j, 1); draw(); };
      $("#oclear").onclick = () => { if (answered) return; picked.length = 0; draw(); };
      const check = () => { if (answered || picked.length < q.tiles.length) return; finishTyped(picked.map(i => q.tiles[i]).join(""), true); };
      $("#check").onclick = check;
      checkFn = check;
    }
  }
  function mark(ok, chosenText, note = "") {
    answered = true;
    const q = questions[idx];
    ok ? okN++ : badN++;
    el.ok.textContent = `✓ ${okN}`; el.bad.textContent = `✗ ${badN}`;
    results.push({ k: q.k, qt: q.qt, ok, ch: String(chosenText).slice(0, 80) });
    el.explain.className = "explain " + (ok ? "is-ok" : "is-bad");
    el.explain.innerHTML = `<div class="verdict">${ok ? "To'g'ri! 🎉" : "Xato — to'g'ri javob:"}</div>${note ? `<div class="kc-wrong">${note}</div>` : ""}${q.explain}`;
    el.explain.hidden = false; el.next.disabled = false;
    el.next.textContent = idx + 1 < questions.length ? "Keyingi →" : "Natijani ko'rish →";
    if (ok && el.auto.checked && !note) autoTimer = setTimeout(next, 1300); else el.next.focus();
  }
  function chooseOpt(i) {
    if (answered || saving) return;
    const q = questions[idx]; if (q.kind !== "choice") return;
    const o = q.options[i]; if (!o) return;
    const ok = o.key === q.answer;
    [...el.body.querySelectorAll(".opt")].forEach((b, j) => { b.disabled = true;
      b.classList.add(q.options[j].key === q.answer ? "right" : j === i ? "wrong" : "dim"); });
    mark(ok, o.text);
  }
  function finishTyped(v, isOrder = false) {
    const q = questions[idx];
    const nv = normJP(v);
    const acc = q.accepted.map(normJP);
    let ok = acc.includes(nv), note = "";
    if (!ok && acc.map(toHira).includes(toHira(nv))) { ok = true; note = "To'g'ri, lekin katakana/hiragana farqiga e'tibor bering."; }
    const inp = $("#ans"); if (inp) { inp.disabled = true; inp.classList.add(ok ? "ok" : "bad"); }
    if (isOrder) $("#ot").classList.add(ok ? "ok" : "bad");
    mark(ok, v, ok ? note : `Siz yozgan: <b>${esc(v)}</b>`);
  }
  function next() {
    clearTimeout(autoTimer);
    if (!answered) return;
    if (idx + 1 < questions.length) { idx++; render(); } else finish();
  }
  async function finish() {
    if (saving) return;
    if (!results.length) return C.go(kind === "vocab" ? "#/vocab" : "#/sent");
    saving = true; clearInterval(timer);
    $("#quiz").hidden = true; $("#saving").hidden = false;
    try {
      const aid = await saveAttempt(kind, cfg, results, Math.round((Date.now() - t0) / 1000));
      C.go(`#/result/${C.S.user.uid}/${aid}`);
    } catch (e) {
      console.error(e);
      $("#saving").innerHTML = `<p>Natijani saqlab bo'lmadi: ${esc(e.message)}</p><button class="btn primary" id="retry">Qayta urinish</button>`;
      $("#retry").onclick = () => { saving = false; finish(); };
    }
  }
  el.body.addEventListener("click", e => { const b = e.target.closest(".opt"); if (b) chooseOpt(+b.dataset.i); });
  el.next.onclick = next;
  el.finish.onclick = () => { if (!results.length || confirm("Testni hozir yakunlaysizmi? Javob berilgan savollar saqlanadi.")) finish(); };
  const onKey = e => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "Enter") { e.preventDefault(); if (answered) next(); else if (checkFn) checkFn(); return; }
    if (/^[0-9]$/.test(e.key)) chooseOpt(e.key === "0" ? 9 : +e.key - 1);
  };
  document.addEventListener("keydown", onKey);
  C.setCleanup(() => { document.removeEventListener("keydown", onKey); clearInterval(timer); clearTimeout(autoTimer); });
  if (!questions.length) { el.prompt.textContent = "Savol topilmadi."; return; }
  render();
}

// ================= Umumiy: mavzu tanlash formasi =================
function lessonPicker(lessons, saved) {
  return `<div class="setup-head"><h2>1. Mavzular</h2>
    <div class="quick"><button type="button" data-ls="all" class="chip-btn">Hammasi</button><button type="button" data-ls="none" class="chip-btn ghost">Tozalash</button></div></div>
    <div class="lesson-chips">${lessons.map(l => `<label class="lchip"><input type="checkbox" name="l" value="${l}" ${saved.includes(String(l)) ? "checked" : ""}><span>${l}-mavzu</span></label>`).join("")}</div>`;
}
function wirePicker(form) {
  form.querySelectorAll("[data-ls]").forEach(b => b.onclick = () => {
    form.querySelectorAll("input[name=l]").forEach(x => x.checked = b.dataset.ls === "all"); form.dispatchEvent(new Event("change"));
  });
}
const parseLs = s => { const all = String(s || "").split(/[^0-9]+/).map(Number).filter(n => n >= 1); return [...new Set(all)].sort((a, b) => a - b); };
const seg = (name, items, def) => `<div class="seg">${items.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" ${String(v) === String(def) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>`;

// ================= LUG'AT =================
const VMODES = {
  w2m: ["So'z → ma'no", "ほん → kitob", "Yaponcha so'z — o'zbekcha ma'nosini toping"],
  m2w: ["Ma'no → so'z", "kitob → ほん", "O'zbekcha ma'no — yaponcha so'zni toping"],
  k2r: ["Kanji → o'qilishi", "本 → ほん", "Kanjida yozilgan so'zning o'qilishini toping"],
  type: ["Yozib javob", "kitob → ⌨️", "Ma'noni ko'rib, so'zni kana klaviaturada yozasiz"],
  mix: ["Aralash", "🎲", "Hammasi aralash"],
};

export async function viewVocabHome(params) {
  C.loading();
  const stats = await loadStats("vocab");
  const sum = summarize(stats, VOCAB);
  let saved = {}; try { saved = JSON.parse(localStorage.getItem("vocabSetup") || "{}"); } catch (e) {}
  const savedL = saved.l || [String(LESSONS[0])];
  const tab = Math.max(1, Math.min(LESSONS[LESSONS.length - 1], parseInt(params.get("tab")) || 1));
  C.page(`
  <section class="hero"><div><h1>Lug'at · 語彙</h1><p class="muted">${VOCAB.length} ta so'z, ${LESSONS.length} ta mavzu. Variantli yoki klaviaturada yozib javob bering.</p></div>
    <div class="kpis"><div class="kpi"><b>${sum.mastered}<small>/${VOCAB.length}</small></b><span>o'zlashtirilgan</span></div>
    <div class="kpi"><b>${sum.acc}<small>%</small></b><span>aniqlik</span></div></div></section>
  ${sum.review.length ? `<a class="review-banner" href="#/vquiz?review=1&mode=mix&opts=8&n=100">
    <div class="rb-kanji rb-words">${sum.review.slice(0, 8).map(v => `<span>${esc(v.kana)}</span>`).join("")}${sum.review.length > 8 ? `<em>+${sum.review.length - 8}</em>` : ""}</div>
    <div class="rb-text"><b>Xatolar ustida ishlash</b><span>${sum.review.length} ta so'zda adashgansiz.</span></div><span class="btn primary">Boshlash →</span></a>` : ""}
  <form class="card setup" id="vsetup">
    ${lessonPicker(LESSONS, savedL)}
    <h2>2. Savol turi</h2>
    <div class="modes">${Object.entries(VMODES).map(([k, [l, d, s]]) => `<label class="mode"><input type="radio" name="mode" value="${k}" ${k === (saved.mode || "mix") ? "checked" : ""}>
      <span class="mode-box"><span class="mode-demo"><b>${d}</b></span><strong>${l}</strong><small>${s}</small></span></label>`).join("")}</div>
    <div class="two">
      <div><h2>3. Variantlar soni</h2>${seg("opts", [[4, 4], [6, 6], [8, 8], [10, 10], [12, 12]], saved.opts || 8)}</div>
      <div><h2>4. Savollar soni</h2>${seg("n", [[10, 10], [20, 20], [30, 30], [50, 50], [300, "Hammasi"]], saved.n || 20)}</div>
    </div>
    <div class="setup-go"><span id="sel-info" class="muted"></span><button class="btn primary big" id="go">Testni boshlash →</button></div>
  </form>
  <section class="card">
    <div class="sec-head"><h2>So'zlar ro'yxati</h2></div>
    <div class="unit-tabs">${LESSONS.map(l => `<a class="${l === tab ? "on" : ""}" href="#/vocab?tab=${l}">${l}-mavzu</a>`).join("")}</div>
    <div class="tbl-wrap"><table class="tbl vtable"><tr><th></th><th>So'z</th><th>Kanji</th><th>Ma'nosi</th><th></th></tr>
      ${VOCAB.filter(v => v.l === tab).map(v => { const s = stats[v.id];
        return `<tr><td class="vp">${v.p || ""}</td><td class="jk2">${esc(v.kana)}${v.alt.length ? ` <small class="muted">(${v.alt.map(esc).join(", ")})</small>` : ""}</td><td class="jk">${esc(v.kanji)}</td>
          <td>${esc(v.uz)} ${s ? (s.rv ? `<span class="tag bad">xato</span>` : s.s >= MASTER ? `<span class="tag ok">✓</span>` : "") : ""}</td><td class="r">${sayBtn(v.kana)}</td></tr>`; }).join("")}
    </table></div>
  </section>`, "vocab");
  const form = $("#vsetup");
  wirePicker(form);
  const upd = () => {
    const ls = [...form.querySelectorAll("input[name=l]:checked")].map(x => +x.value);
    const n = VOCAB.filter(v => ls.includes(v.l)).length;
    $("#sel-info").textContent = ls.length ? `${ls.length} ta mavzu · ${n} ta so'z` : "Kamida bitta mavzu tanlang";
    $("#go").disabled = !ls.length;
  };
  form.onchange = upd; upd();
  form.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(form), l = fd.getAll("l");
    try { localStorage.setItem("vocabSetup", JSON.stringify({ l, mode: fd.get("mode"), opts: fd.get("opts"), n: fd.get("n") })); } catch (e2) {}
    C.go(`#/vquiz?l=${l.join(",")}&mode=${fd.get("mode")}&opts=${fd.get("opts")}&n=${fd.get("n")}`);
  };
}

export async function viewVocabQuiz(params) {
  C.loading();
  const review = params.get("review") === "1";
  const mode = VMODES[params.get("mode")] ? params.get("mode") : "mix";
  const nOpt = Math.max(4, Math.min(12, parseInt(params.get("opts")) || 8));
  const nQ = Math.max(5, Math.min(300, parseInt(params.get("n")) || 20));
  let lessons = parseLs(params.get("l")).filter(l => LESSONS.includes(l));
  if (!lessons.length) lessons = [LESSONS[0]];
  let pool;
  if (review) {
    const st = await loadStats("vocab");
    pool = summarize(st, VOCAB).review;
    if (!pool.length) { C.flash("Lug'at bo'yicha xatolar yo'q — barakalla!"); return C.go("#/vocab"); }
    lessons = [...new Set(pool.map(v => v.l))].sort((a, b) => a - b);
  } else pool = VOCAB.filter(v => lessons.includes(v.l));
  const lessonPool = VOCAB.filter(v => lessons.includes(v.l));

  const pickType = v => {
    let t = mode === "mix" ? ["w2m", "m2w", "k2r", "type"][Math.floor(Math.random() * 4)] : mode;
    if (t === "k2r" && !v.kanji) t = mode === "k2r" ? "w2m" : "m2w";
    return t;
  };
  const distractors = (v, keyFn, want) => {
    const syn = synOf(v.kana), used = new Set([keyFn(v)]), out = [];
    const ok = c => c.id !== v.id && !syn.has(c.kana) && c.uz !== v.uz && !v.alt.includes(c.kana) && !used.has(keyFn(c)) && keyFn(c);
    const tryAdd = c => { if (out.length < want && ok(c)) { used.add(keyFn(c)); out.push(c); } };
    shuffle(VOCAB.filter(c => c.l === v.l)).slice(0, Math.ceil(want / 2)).forEach(tryAdd);
    shuffle(lessonPool).forEach(tryAdd);
    shuffle(VOCAB).forEach(tryAdd);
    return out;
  };
  const explain = v => `<div class="vcard"><div class="vc-p">${v.p || ""}</div><div><div class="vc-w">${wordHTML(v)}</div><div class="vc-m">${esc(v.uz)}</div>
    ${v.alt.length ? `<div class="muted">Boshqa shakli: ${v.alt.map(esc).join(", ")}</div>` : ""}<div class="muted small">${v.l}-mavzu</div></div>${sayBtn(v.kana)}</div>`;

  const questions = shuffle(pool).slice(0, Math.min(nQ, pool.length)).map(v => {
    const qt = pickType(v);
    const base = { k: v.id, qt, explain: explain(v) };
    if (qt === "w2m") {
      const opts = shuffle([v, ...distractors(v, c => c.uz, nOpt - 1)]);
      return { ...base, label: "Bu so'zning ma'nosi nima?", kind: "choice", answer: v.id, optClass: "mean-opts",
        prompt: `<div class="p-word">${wordHTML(v)}</div>`, options: opts.map(c => ({ key: c.id, text: c.uz })) };
    }
    if (qt === "m2w") {
      const opts = shuffle([v, ...distractors(v, c => c.kana, nOpt - 1)]);
      return { ...base, label: "Yaponchasini toping", kind: "choice", answer: v.id, optClass: "word-opts",
        prompt: `<div class="p-pic">${v.p || "❔"}</div><div class="p-mean">${esc(v.uz)}</div>`, options: opts.map(c => ({ key: c.id, text: c.kana, html: wordHTML(c) })) };
    }
    if (qt === "k2r") {
      const opts = shuffle([v, ...distractors(v, c => c.kana, nOpt - 1)]);
      return { ...base, label: "Bu so'z qanday o'qiladi?", kind: "choice", answer: v.id, optClass: "read-opts",
        prompt: `<div class="p-kanji p-kanji-w">${esc(v.kanji)}</div>`, options: opts.map(c => ({ key: c.id, text: c.kana })) };
    }
    return { ...base, label: isKata(v.kana) ? "Yaponchasini yozing (katakana)" : "Yaponchasini yozing", kind: "type", kata: isKata(v.kana),
      accepted: [v.kana, ...v.alt], prompt: `<div class="p-pic">${v.p || "❔"}</div><div class="p-mean">${esc(v.uz)}</div>` };
  });
  runQuiz("vocab", { mode, lessons, opts: nOpt, review }, questions, review ? "Lug'at · xatolar" : `Lug'at · ${lessons.join(", ")}-mavzu`);
}

// ================= GAPLAR =================
const STYPES = {
  u2j: ["O'zbekcha → yaponcha", "Tarjimani variantlardan tanlang"],
  j2u: ["Yaponcha → o'zbekcha", "Ma'nosini variantlardan tanlang"],
  order: ["So'zlarni tartiblash", "Tayyor so'zlardan to'g'ri gap tuzing"],
  fill: ["Bo'sh joyni to'ldirish", "Tushib qolgan yuklama yoki so'roq so'zni toping"],
  type: ["Yozib tarjima qilish", "O'zbekcha gapni klaviaturada yaponchaga tarjima qiling"],
};

export async function viewSentHome(params) {
  C.loading();
  const stats = await loadStats("sent");
  const sum = summarize(stats, SENTENCES);
  let saved = {}; try { saved = JSON.parse(localStorage.getItem("sentSetup") || "{}"); } catch (e) {}
  const savedL = saved.l || [String(SENT_LESSONS[0])];
  const savedT = saved.t || ["u2j", "j2u", "order", "fill"];
  const tab = Math.max(1, Math.min(SENT_LESSONS[SENT_LESSONS.length - 1], parseInt(params.get("tab")) || 1));
  C.page(`
  <section class="hero"><div><h1>Gaplar · 文</h1><p class="muted">${SENTENCES.length} ta gap. Har bir mavzu gaplarida faqat shu mavzugacha o'tilgan so'z va grammatika ishlatilgan.</p></div>
    <div class="kpis"><div class="kpi"><b>${sum.mastered}<small>/${SENTENCES.length}</small></b><span>o'zlashtirilgan</span></div>
    <div class="kpi"><b>${sum.acc}<small>%</small></b><span>aniqlik</span></div></div></section>
  ${sum.review.length ? `<a class="review-banner" href="#/squiz?review=1&t=u2j,j2u,order,fill&opts=6&n=100">
    <div class="rb-text"><b>Xatolar ustida ishlash</b><span>${sum.review.length} ta gapda adashgansiz.</span></div><span class="btn primary">Boshlash →</span></a>` : ""}
  <form class="card setup" id="ssetup">
    ${lessonPicker(SENT_LESSONS, savedL)}
    <h2>2. Topshiriq turlari <small class="muted">(bir nechtasini tanlash mumkin)</small></h2>
    <div class="modes">${Object.entries(STYPES).map(([k, [l, s]]) => `<label class="mode"><input type="checkbox" name="t" value="${k}" ${savedT.includes(k) ? "checked" : ""}>
      <span class="mode-box"><strong>${l}</strong><small>${s}</small></span></label>`).join("")}</div>
    <div class="two">
      <div><h2>3. Variantlar soni</h2>${seg("opts", [[4, 4], [5, 5], [6, 6], [8, 8]], saved.opts || 6)}</div>
      <div><h2>4. Savollar soni</h2>${seg("n", [[10, 10], [20, 20], [30, 30], [200, "Hammasi"]], saved.n || 20)}</div>
    </div>
    <div class="setup-go"><span id="sel-info" class="muted"></span><button class="btn primary big" id="go">Boshlash →</button></div>
  </form>
  <section class="card">
    <div class="sec-head"><h2>Grammatika va gaplar</h2></div>
    <div class="unit-tabs">${SENT_LESSONS.map(l => `<a class="${l === tab ? "on" : ""}" href="#/sent?tab=${l}">${l}-mavzu</a>`).join("")}</div>
    <div class="gr-list">${(GRAMMAR[tab] || []).map(g => `<div class="gr-card"><div class="gr-p">${esc(g.p)}</div><p>${esc(g.uz)}</p>
      ${g.ex.map(x => `<div class="gr-ex">${esc(x)} ${sayBtn(x)}</div>`).join("")}</div>`).join("")}</div>
    <h3 class="sec">Gaplar</h3>
    <div class="tbl-wrap"><table class="tbl stable">${SENTENCES.filter(s => s.l === tab).map(s => `<tr>
      <td class="jp-s">${esc(jpText(s.chunks))}</td><td>${esc(s.uz)} ${s.id.startsWith("w") ? `<span class="tag">darslik</span>` : ""}</td><td class="r">${sayBtn(jpText(s.chunks))}</td></tr>`).join("")}</table></div>
  </section>`, "sent");
  const form = $("#ssetup");
  wirePicker(form);
  const upd = () => {
    const ls = [...form.querySelectorAll("input[name=l]:checked")].map(x => +x.value);
    const ts = form.querySelectorAll("input[name=t]:checked").length;
    const n = SENTENCES.filter(s => ls.includes(s.l)).length;
    $("#sel-info").textContent = !ls.length ? "Kamida bitta mavzu tanlang" : !ts ? "Kamida bitta topshiriq turini tanlang" : `${ls.length} ta mavzu · ${n} ta gap`;
    $("#go").disabled = !ls.length || !ts;
  };
  form.onchange = upd; upd();
  form.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(form), l = fd.getAll("l"), t = fd.getAll("t");
    try { localStorage.setItem("sentSetup", JSON.stringify({ l, t, opts: fd.get("opts"), n: fd.get("n") })); } catch (e2) {}
    C.go(`#/squiz?l=${l.join(",")}&t=${t.join(",")}&opts=${fd.get("opts")}&n=${fd.get("n")}`);
  };
}

export async function viewSentQuiz(params) {
  C.loading();
  const review = params.get("review") === "1";
  let types = String(params.get("t") || "").split(",").filter(t => STYPES[t]);
  if (!types.length) types = ["u2j", "j2u", "order", "fill"];
  const nOpt = Math.max(4, Math.min(8, parseInt(params.get("opts")) || 6));
  const nQ = Math.max(5, Math.min(200, parseInt(params.get("n")) || 20));
  let lessons = parseLs(params.get("l")).filter(l => SENT_LESSONS.includes(l));
  if (!lessons.length) lessons = [SENT_LESSONS[0]];
  let pool;
  if (review) {
    const st = await loadStats("sent");
    pool = summarize(st, SENTENCES).review;
    if (!pool.length) { C.flash("Gaplar bo'yicha xatolar yo'q — barakalla!"); return C.go("#/sent"); }
    lessons = [...new Set(pool.map(s => s.l))].sort((a, b) => a - b);
  } else pool = SENTENCES.filter(s => lessons.includes(s.l));
  const maxL = Math.max(...lessons);
  const lessonPool = SENTENCES.filter(s => lessons.includes(s.l));

  const blankable = s => s.chunks.map((c, i) => ({ c, i })).filter(({ c }) => (PARTICLES.includes(c) && (PTAUGHT[c] || 1) <= s.l) || QWORDS.includes(c));
  const fillOptions = (c, l) => {
    if (PARTICLES.includes(c)) {
      const ex = PEXCL[c] || [];
      const taught = PARTICLES.filter(p => p !== c && !ex.includes(p) && (PTAUGHT[p] || 1) <= Math.max(l, maxL));
      return taught.length >= 3 ? taught : PARTICLES.filter(p => p !== c && !ex.includes(p));
    }
    const ex = QSYN[c] || [];
    return QWORDS.filter(q => q !== c && !ex.includes(q));
  };
  const corrupt = s => { // bitta yuklamasi noto'g'ri bo'lgan variantlar
    const out = [];
    s.chunks.forEach((c, i) => {
      if (!PARTICLES.includes(c)) return;
      fillOptions(c, s.l).forEach(p => { const ch = s.chunks.slice(); ch[i] = p; out.push(ch); });
    });
    return shuffle(out);
  };
  const explain = s => `<div class="scard"><div class="jp-s big">${esc(jpText(s.chunks))} ${sayBtn(jpText(s.chunks))}</div>
    <div class="s-uz">${esc(s.uz)}</div>${s.alt.length ? `<div class="muted small">Bu tartib ham to'g'ri: ${s.alt.map(a => esc(jpText(a))).join(" / ")}</div>` : ""}
    ${grammarHTML(s.g)}<div class="muted small">${s.l}-mavzu</div></div>`;

  const make = (s, t) => {
    const base = { k: s.id, qt: t, explain: explain(s) };
    const key = sentKey(s.chunks);
    if (t === "u2j") {
      const want = nOpt - 1, used = new Set([key, ...s.alt.map(sentKey)]), opts = [];
      const add = ch => { const k = sentKey(ch); if (opts.length < want && !used.has(k)) { used.add(k); opts.push(ch); } };
      corrupt(s).slice(0, Math.min(2, Math.floor(want / 2))).forEach(add);
      shuffle(lessonPool.filter(x => x.l === s.l && x.id !== s.id)).forEach(x => add(x.chunks));
      shuffle(lessonPool.filter(x => x.id !== s.id)).forEach(x => add(x.chunks));
      const all = shuffle([s.chunks, ...opts]);
      return { ...base, label: "Yaponcha tarjimasini toping", kind: "choice", optClass: "sent-opts", answer: key,
        prompt: `<div class="p-uz">${esc(s.uz)}</div>`, options: all.map(ch => ({ key: sentKey(ch), text: jpText(ch) })) };
    }
    if (t === "j2u") {
      const want = nOpt - 1, used = new Set([s.uz]), opts = [];
      const add = x => { if (opts.length < want && !used.has(x.uz)) { used.add(x.uz); opts.push(x); } };
      shuffle(lessonPool.filter(x => x.l === s.l && x.id !== s.id)).forEach(add);
      shuffle(lessonPool).forEach(add); shuffle(SENTENCES).forEach(add);
      return { ...base, label: "Bu gapning ma'nosi qaysi?", kind: "choice", optClass: "sent-opts uz-opts", answer: s.id,
        prompt: `<div class="p-jp">${esc(jpText(s.chunks))}</div>`, options: shuffle([s, ...opts]).map(x => ({ key: x.id, text: x.uz })) };
    }
    if (t === "order") {
      let tiles = shuffle(s.chunks); let g = 0;
      while (sentKey(tiles) === key && g++ < 10) tiles = shuffle(s.chunks);
      return { ...base, label: "So'zlardan to'g'ri gap tuzing", kind: "order", tiles,
        accepted: [s.chunks.join(""), ...s.alt.map(a => a.join(""))], prompt: `<div class="p-uz">${esc(s.uz)}</div>` };
    }
    if (t === "fill") {
      const bl = blankable(s);
      const pick = bl[Math.floor(Math.random() * bl.length)];
      const others = shuffle(fillOptions(pick.c, s.l)).slice(0, Math.min(nOpt, 6) - 1);
      const shown = s.chunks.map((c, i) => i === pick.i ? "＿＿" : c);
      return { ...base, label: "Bo'sh joyga mos so'zni qo'ying", kind: "choice", optClass: "read-opts", answer: pick.c,
        prompt: `<div class="p-jp">${esc(jpText(shown)).replace("＿＿", `<span class="blank">？</span>`)}</div><div class="p-uz small">${esc(s.uz)}</div>`,
        options: shuffle([pick.c, ...others]).map(o => ({ key: o, text: o })) };
    }
    // type
    return { ...base, label: "Yaponchaga tarjima qiling (kana bilan yozing)", kind: "type",
      accepted: [s.chunks.join(""), ...s.alt.map(a => a.join(""))], prompt: `<div class="p-uz">${esc(s.uz)}</div>
      <div class="hint">Bo'laklar soni: ${s.chunks.length} · Katakana so'zlar uchun <b>ア</b> tugmasini bosing</div>` };
  };
  const questions = shuffle(pool).slice(0, Math.min(nQ, pool.length)).map(s => {
    let avail = types.filter(t => (t !== "order" || s.chunks.length >= 3) && (t !== "fill" || blankable(s).length));
    if (!avail.length) avail = types.includes("type") ? ["type"] : ["u2j"];
    return make(s, avail[Math.floor(Math.random() * avail.length)]);
  });
  runQuiz("sent", { mode: types.join(","), lessons, opts: nOpt, review }, questions, review ? "Gaplar · xatolar" : `Gaplar · ${lessons.join(", ")}-mavzu`);
}

// ================= Natija sahifasi uchun =================
export function describeAnswer(kind, a) {
  if (kind === "vocab") {
    const v = VMAP[a.k]; if (!v) return { main: esc(a.k), sub: "" };
    return { main: `${esc(v.kana)}${v.kanji ? ` <small>${esc(v.kanji)}</small>` : ""}`, sub: esc(v.uz), v };
  }
  const s = SMAP[a.k]; if (!s) return { main: esc(a.k), sub: "" };
  return { main: esc(jpText(s.chunks)), sub: esc(s.uz), s, gram: grammarHTML(s.g) };
}
export const QT_LABEL = {
  w2m: "So'z → ma'no", m2w: "Ma'no → so'z", k2r: "Kanji → o'qilishi", type: "Yozib javob",
  u2j: "O'zbekcha → yaponcha", j2u: "Yaponcha → o'zbekcha", order: "Tartiblash", fill: "Bo'sh joy",
};
export const kindLabel = k => k === "vocab" ? "Lug'at" : k === "sent" ? "Gaplar" : "Kanji";
export { lessonsLabel };

// 🔊 tugmasi
document.addEventListener("click", e => {
  const b = e.target.closest("[data-speak]"); if (!b || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(b.dataset.speak.replace(/[「」]/g, ""));
  u.lang = "ja-JP"; u.rate = 0.85;
  const v = speechSynthesis.getVoices().find(v => (v.lang || "").toLowerCase().startsWith("ja")); if (v) u.voice = v;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
});
