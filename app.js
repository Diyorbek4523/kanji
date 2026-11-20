// Kanji Dojo — GitHub Pages + Firebase (Auth + Firestore)
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider, deleteUser,
  setPersistence, browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, orderBy,
  limit, writeBatch, where,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_USERNAME, SITE_NAME } from "./firebase-config.js";
import { KANJI } from "./kanji-data.js";
import { initPractice, viewVocabHome, viewVocabQuiz, viewSentHome, viewSentQuiz, describeAnswer, QT_LABEL, kindLabel, lessonsLabel, practiceSummaries } from "./practice.js";

// ---------------- Sozlamalar ----------------
const MASTER_STREAK = 3;   // ketma-ket 3 marta to'g'ri = o'zlashtirilgan
const REVIEW_CLEAR = 2;    // xato kanji ketma-ket 2 marta to'g'ri topilsa ro'yxatdan chiqadi
const EMAIL_DOMAIN = "kanjidojo.app";
const UNITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const MODES = {
  k2h: "Kanji → o'qilishi", h2k: "O'qilishi → kanji", p2k: "Rasm va ma'no → kanji",
  k2m: "Kanji → ma'no", mix: "Aralash",
};
const KMAP = {}; KANJI.forEach(k => KMAP[k.id] = k);
const UNIT_IDS = {}; UNITS.forEach(u => UNIT_IDS[u] = KANJI.filter(k => k.u === u).map(k => k.id));

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
setPersistence(auth, browserLocalPersistence).catch(() => {});

// ---------------- Yordamchilar ----------------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const readings = k => k.kun.length ? k.on.join("・") + " ／ " + k.kun.join("・") : k.on.join("・");
const fmtDt = ts => {
  if (!ts) return "—";
  const d = new Date(ts); const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fmtDur = s => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, "0")}`;
const unitsLabel = u => (!u || u.length === 10) ? "1–10 (hammasi)" : u.join(", ");
const scoreCls = (c, t) => "s" + Math.floor(pct(c, t) / 25);
const parseUnits = s => { const u = [...new Set(String(s || "").split(/[^0-9]+/).map(Number).filter(n => n >= 1 && n <= 10))].sort((a, b) => a - b); return u.length ? u : UNITS.slice(); };
const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;

const app = $("#app");
let flashMsg = null;
const flash = (m, cat = "ok") => { flashMsg = { m, cat }; };
const go = h => { if (location.hash === h) route(); else location.hash = h; };

// ---------------- Holat ----------------
const S = { user: null, profile: null, kstats: null, ready: false };

async function loadProfile() {
  const snap = await getDoc(doc(db, "users", S.user.uid));
  S.profile = snap.exists() ? snap.data() : null;
  return S.profile;
}
async function loadKstats(uid = S.user.uid) {
  const snap = await getDoc(doc(db, "users", uid, "meta", "kstats"));
  const k = snap.exists() ? (snap.data().k || {}) : {};
  if (uid === S.user.uid) S.kstats = k;
  return k;
}

function overview(ks) {
  ks = ks || {};
  const units = UNITS.map(u => {
    const ids = UNIT_IDS[u]; let right = 0, tot = 0, mastered = 0, review = 0;
    ids.forEach(i => { const s = ks[i]; if (!s) return; right += s.r; tot += s.seen;
      if (s.s >= MASTER_STREAK && !s.rv) mastered++; if (s.rv) review++; });
    return { u, n: ids.length, mastered, review, acc: pct(right, tot), tried: tot > 0 };
  });
  const review = Object.keys(ks).filter(i => ks[i].rv && KMAP[i]).map(i => KMAP[i]).sort((a, b) => ks[b.id].w - ks[a.id].w);
  const weak = Object.keys(ks).filter(i => ks[i].w && KMAP[i]).sort((a, b) => (ks[b].w - ks[a].w) || (ks[a].r - ks[b].r)).slice(0, 15).map(i => [KMAP[i], ks[i]]);
  let right = 0, tot = 0; Object.values(ks).forEach(s => { right += s.r; tot += s.seen; });
  return { units, review, weak, mastered: units.reduce((a, x) => a + x.mastered, 0), acc: pct(right, tot), answered: tot };
}

// ---------------- Header ----------------
function renderHeader(active) {
  const me = S.profile;
  $("#nav").innerHTML = me ? `
    <a href="#/" class="${active === "home" ? "on" : ""}">Kanji</a>
    <a href="#/vocab" class="${active === "vocab" ? "on" : ""}">Lug'at</a>
    <a href="#/sent" class="${active === "sent" ? "on" : ""}">Gaplar</a>
    <a href="#/study" class="${active === "study" ? "on" : ""}">Yodlash</a>
    <a href="#/history" class="${active === "history" ? "on" : ""}">Natijalarim</a>
    ${me.isAdmin ? `<a href="#/admin" class="${active === "admin" ? "on" : ""}">Admin</a>` : ""}` : "";
  $("#usermenu").hidden = !me;
  if (me) $("#um-name").textContent = me.username;
}

function page(html, active) {
  renderHeader(active);
  const f = flashMsg ? `<div class="flash ${flashMsg.cat}">${esc(flashMsg.m)}</div>` : "";
  flashMsg = null;
  app.innerHTML = f + html;
  window.scrollTo(0, 0);
}
const loading = () => { app.innerHTML = `<div class="card narrow center"><div class="big-kanji spin">待</div><p class="muted">Yuklanmoqda…</p></div>`; };
const errorPage = (msg, k = "無") => page(`<div class="card narrow center"><div class="big-kanji">${k}</div><p>${esc(msg)}</p><a class="btn" href="#/">Bosh sahifaga</a></div>`);

// ---------------- Kirish / ro'yxatdan o'tish ----------------
function viewAuth(mode) {
  const reg = mode === "register";
  page(`
  <div class="auth">
    <div class="auth-art" aria-hidden="true"><span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span>山</span><span>川</span></div>
    <form class="card auth-card" id="authf">
      <h1>${reg ? "Ro'yxatdan o'tish" : "Kirish"}</h1>
      <p class="muted">${reg ? "O'zingizga login va parol o'ylab toping — natijalaringiz profilingizda saqlanadi." : "112 ta kanjini o'yin tarzida yodlang va bilimingizni sinang."}</p>
      <div id="autherr"></div>
      <label>Login<input name="username" autocomplete="username" required autofocus></label>
      <label>Parol${reg ? " <small>(kamida 6 belgi)</small>" : ""}<input type="password" name="password" autocomplete="${reg ? "new-password" : "current-password"}" required></label>
      ${reg ? `<label>Parolni takrorlang<input type="password" name="password2" autocomplete="new-password" required></label>` : ""}
      <button class="btn primary wide" id="authbtn">${reg ? "Profil yaratish" : "Kirish"}</button>
      <p class="switch">${reg ? `Profilingiz bormi? <a href="#/login">Kirish</a>` : `Profilingiz yo'qmi? <a href="#/register">Ro'yxatdan o'ting</a>`}</p>
    </form>
  </div>`);
  const f = $("#authf"), err = m => { $("#autherr").innerHTML = `<div class="flash error">${esc(m)}</div>`; $("#authbtn").disabled = false; };
  f.onsubmit = async e => {
    e.preventDefault();
    const username = f.username.value.trim(), lc = username.toLowerCase(), pw = f.password.value;
    $("#authbtn").disabled = true;
    if (!USERNAME_RE.test(username)) return err("Login 3–20 belgidan iborat bo'lsin: lotin harflari, raqamlar, _ yoki .");
    try {
      const un = await getDoc(doc(db, "usernames", lc));
      if (reg) {
        if (pw.length < 6) return err("Parol kamida 6 belgi bo'lsin.");
        if (pw !== f.password2.value) return err("Parollar bir xil emas.");
        if (un.exists()) return err("Bu login band. Boshqasini tanlang.");
        const email = `${lc}-${Math.random().toString(36).slice(2, 8)}@${EMAIL_DOMAIN}`;
        S.registering = true;
        let cred;
        try { cred = await createUserWithEmailAndPassword(auth, email, pw); }
        catch (e1) { S.registering = false; throw e1; }
        const uid = cred.user.uid, now = Date.now();
        const b = writeBatch(db);
        b.set(doc(db, "usernames", lc), { uid, email });
        b.set(doc(db, "users", uid), {
          username, username_lc: lc, email, isAdmin: lc === ADMIN_USERNAME.toLowerCase(), disabled: false,
          createdAt: now, lastSeen: now, attempts: 0, total: 0, correct: 0, mastered: 0, review: 0,
        });
        try { await b.commit(); }
        catch (e2) {
          console.error(e2); await deleteUser(cred.user).catch(() => {}); S.registering = false;
          return err("Bu login band yoki saqlab bo'lmadi. Boshqa login bilan urinib ko'ring.");
        }
        S.registering = false;
        flash(`Xush kelibsiz, ${username}! Profilingiz yaratildi.`);
        await onAuth(cred.user);
      } else {
        if (!un.exists()) return err("Login yoki parol noto'g'ri.");
        await signInWithEmailAndPassword(auth, un.data().email, pw);
        // onAuthStateChanged qolganini qiladi
      }
    } catch (e) {
      console.error(e);
      const c = e.code || "";
      if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) err("Login yoki parol noto'g'ri.");
      else if (c.includes("too-many-requests")) err("Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.");
      else if (c.includes("network")) err("Internet aloqasini tekshiring.");
      else err("Xatolik: " + (e.message || c));
    }
  };
}

function viewPassword() {
  page(`<form class="card narrow" id="pwf"><h1>Parolni o'zgartirish</h1><div id="pwerr"></div>
    <label>Hozirgi parol<input type="password" name="old" required autocomplete="current-password"></label>
    <label>Yangi parol (kamida 6 belgi)<input type="password" name="n1" required autocomplete="new-password"></label>
    <label>Yangi parolni takrorlang<input type="password" name="n2" required autocomplete="new-password"></label>
    <button class="btn primary wide">Saqlash</button></form>`);
  const f = $("#pwf"), err = m => $("#pwerr").innerHTML = `<div class="flash error">${esc(m)}</div>`;
  f.onsubmit = async e => {
    e.preventDefault();
    if (f.n1.value.length < 6) return err("Yangi parol kamida 6 belgi bo'lsin.");
    if (f.n1.value !== f.n2.value) return err("Yangi parollar bir xil emas.");
    try {
      await reauthenticateWithCredential(S.user, EmailAuthProvider.credential(S.user.email, f.old.value));
      await updatePassword(S.user, f.n1.value);
      flash("Parol o'zgartirildi."); go("#/");
    } catch (e) { err((e.code || "").includes("credential") || (e.code || "").includes("wrong-password") ? "Hozirgi parol noto'g'ri." : "Xatolik: " + e.message); }
  };
}

// ---------------- Bosh sahifa ----------------
async function viewHome() {
  loading();
  const me = S.profile;
  const [ks, recentSnap, topSnap] = await Promise.all([
    loadKstats(),
    getDocs(query(collection(db, "users", S.user.uid, "attempts"), orderBy("createdAt", "desc"), limit(5))),
    getDocs(query(collection(db, "users"), orderBy("mastered", "desc"), limit(15))),
  ]);
  const ov = overview(ks);
  const recent = recentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const top = topSnap.docs.map(d => d.data()).filter(u => u.attempts > 0 && !u.disabled)
    .sort((a, b) => (b.mastered - a.mastered) || (b.correct - a.correct)).slice(0, 10);
  const modeInfo = {
    k2h: ["日", "にち・ひ", "Kanji ko'rsatiladi — o'qilishini topasiz"], h2k: ["にち・ひ", "日", "O'qilishi berilgan — kanjini topasiz"],
    p2k: ["☀️", "日", "Rasm va ma'no — kanjini topasiz"], k2m: ["日", "kun", "Kanji — o'zbekcha ma'nosini topasiz"],
    mix: ["🎲", "", "Hammasi aralash — eng yaxshi mashq"],
  };
  page(`
  <section class="hero">
    <div><h1>こんにちは, ${esc(me.username)}!</h1><p class="muted">Unitlarni tanlang, savol turini belgilang — va boshladik.</p></div>
    <div class="kpis">
      <div class="kpi"><b>${ov.mastered}<small>/112</small></b><span>o'zlashtirilgan</span></div>
      <div class="kpi"><b>${ov.acc}<small>%</small></b><span>aniqlik</span></div>
      <div class="kpi"><b>${me.attempts || 0}</b><span>test ishlangan</span></div>
    </div>
  </section>
  ${ov.review.length ? `
  <a class="review-banner" href="#/quiz?review=1&mode=mix&opts=8&n=112">
    <div class="rb-kanji">${ov.review.slice(0, 12).map(k => `<span>${k.k}</span>`).join("")}${ov.review.length > 12 ? `<em>+${ov.review.length - 12}</em>` : ""}</div>
    <div class="rb-text"><b>Xatolar ustida ishlash</b><span>${ov.review.length} ta kanjida adashgansiz. Har biri ketma-ket 2 marta to'g'ri topilsa ro'yxatdan chiqadi.</span></div>
    <span class="btn primary">Boshlash →</span>
  </a>` : ""}
  <form class="card setup" id="setup">
    <div class="setup-head"><h2>1. Unitlar</h2>
      <div class="quick"><button type="button" data-sel="all" class="chip-btn">Hammasi</button><button type="button" data-sel="1-5" class="chip-btn">1–5</button><button type="button" data-sel="6-10" class="chip-btn">6–10</button><button type="button" data-sel="none" class="chip-btn ghost">Tozalash</button></div>
    </div>
    <div class="units">${ov.units.map((u, i) => `
      <label class="unit"><input type="checkbox" name="u" value="${u.u}" ${i === 0 ? "checked" : ""}>
        <span class="unit-box">
          <span class="unit-top"><b>Unit ${u.u}</b><small>${u.n} ta</small></span>
          <span class="unit-k">${UNIT_IDS[u.u].slice(0, 7).map(i => KMAP[i].k).join("")}${UNIT_IDS[u.u].length > 7 ? "…" : ""}</span>
          <span class="bar"><i style="width:${pct(u.mastered, u.n)}%"></i></span>
          <span class="unit-foot">${u.mastered}/${u.n} o'zlashtirilgan${u.review ? ` · <em>${u.review} xato</em>` : ""}</span>
        </span></label>`).join("")}
    </div>
    <h2>2. Savol turi</h2>
    <div class="modes">${Object.entries(MODES).map(([key, label]) => `
      <label class="mode"><input type="radio" name="mode" value="${key}" ${key === "mix" ? "checked" : ""}>
        <span class="mode-box"><span class="mode-demo"><b>${modeInfo[key][0]}</b>${modeInfo[key][1] ? `<i>→</i><b>${modeInfo[key][1]}</b>` : ""}</span>
        <strong>${label}</strong><small>${modeInfo[key][2]}</small></span></label>`).join("")}
    </div>
    <div class="two">
      <div><h2>3. Variantlar soni</h2>
        <div class="seg">${[4, 6, 8, 10, 12].map(n => `<label><input type="radio" name="opts" value="${n}" ${n === 8 ? "checked" : ""}><span>${n}</span></label>`).join("")}</div>
        <p class="hint">Variant ko'p bo'lsa, taxmin qilish qiyinlashadi — xotira kuchliroq ishlaydi.</p></div>
      <div><h2>4. Savollar soni</h2>
        <div class="seg">${[[10, "10"], [20, "20"], [30, "30"], [50, "50"], [112, "Hammasi"]].map(([n, l]) => `<label><input type="radio" name="n" value="${n}" ${n === 20 ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>
        <p class="hint">Tanlangan unitlarda kanji kamroq bo'lsa, hammasi so'raladi.</p></div>
    </div>
    <div class="setup-go"><span id="sel-info" class="muted"></span><button class="btn primary big" id="go">Testni boshlash →</button></div>
  </form>
  <div class="two">
    <section class="card"><h2>Oxirgi testlarim</h2>
      ${recent.length ? `<table class="tbl">${recent.map(a => `<tr>
        <td><a href="#/result/${S.user.uid}/${a.id}">${fmtDt(a.createdAt)}</a></td>
        <td>${attLabel(a)}</td>
        <td class="r"><span class="score ${scoreCls(a.correct, a.total)}">${a.correct}/${a.total}</span></td></tr>`).join("")}</table>`
      : `<p class="muted">Hali test ishlamadingiz. Birinchisini boshlang!</p>`}
    </section>
    <section class="card"><h2>Reyting 🏆</h2>
      ${top.length ? `<table class="tbl">${top.map((t, i) => `<tr class="${t.username === me.username ? "me" : ""}">
        <td class="rank">${i + 1}</td><td>${esc(t.username)}</td>
        <td class="r"><b>${t.mastered}</b> <small class="muted">kanji · ${pct(t.correct, t.total)}%</small></td></tr>`).join("")}</table>`
      : `<p class="muted">Reyting hali bo'sh.</p>`}
    </section>
  </div>`, "home");

  const form = $("#setup"), boxes = [...form.querySelectorAll("input[name=u]")];
  try {
    const saved = JSON.parse(localStorage.getItem("kanjiSetup") || "null");
    if (saved) {
      boxes.forEach(b => b.checked = saved.u.includes(b.value));
      ["mode", "opts", "n"].forEach(k => { const el = form.querySelector(`input[name=${k}][value="${saved[k]}"]`); if (el) el.checked = true; });
    }
  } catch (e) {}
  const upd = () => {
    const sel = boxes.filter(b => b.checked).map(b => +b.value);
    const cnt = sel.reduce((s, u) => s + UNIT_IDS[u].length, 0);
    $("#sel-info").textContent = sel.length ? `${sel.length} ta unit · ${cnt} ta kanji` : "Kamida bitta unit tanlang";
    $("#go").disabled = !sel.length;
  };
  form.querySelectorAll("[data-sel]").forEach(b => b.onclick = () => {
    const v = b.dataset.sel;
    boxes.forEach(x => { const u = +x.value; x.checked = v === "all" || (v === "1-5" && u <= 5) || (v === "6-10" && u >= 6); });
    upd();
  });
  form.onchange = upd;
  form.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(form), u = fd.getAll("u");
    try { localStorage.setItem("kanjiSetup", JSON.stringify({ u, mode: fd.get("mode"), opts: fd.get("opts"), n: fd.get("n") })); } catch (e2) {}
    go(`#/quiz?u=${u.join(",")}&mode=${fd.get("mode")}&opts=${fd.get("opts")}&n=${fd.get("n")}`);
  };
  upd();
}

// ---------------- Kanji kartochkasi ----------------
function cardHTML(k, extra = "") {
  return `
    <div class="kc-main"><div class="kc-kanji">${esc(k.k)}</div><div class="kc-pic">${k.p}</div></div>
    <div class="kc-body">
      <div class="kc-mean">${esc(k.m)} <span class="kc-unit">Unit ${k.u} · №${k.id}</span></div>
      <div class="kc-read"><span class="lab">ON</span>${k.on.map(esc).join("・")}</div>
      <div class="kc-read"><span class="lab kun">KUN</span>${k.kun.length ? k.kun.map(esc).join("・") : "—"}</div>
      <div class="kc-ex"><b>${esc(k.ex.w)}</b> <span>${esc(k.ex.r)}</span> — ${esc(k.ex.m)}</div>
      <div class="kc-mn">💡 ${esc(k.mn)}</div>
      <button type="button" class="btn sm ghost kc-say" data-say="${k.id}">🔊 Eshitish</button>
      ${extra}
    </div>`;
}
function speak(k) {
  if (!("speechSynthesis" in window)) return;
  const parts = [...k.kun.map(x => x.replace(/[()]/g, "")), ...k.on].filter(x => x && x !== "だち");
  const u = new SpeechSynthesisUtterance(parts.join("、") + "。" + k.ex.r);
  u.lang = "ja-JP"; u.rate = 0.85;
  const v = speechSynthesis.getVoices().find(v => (v.lang || "").toLowerCase().startsWith("ja")); if (v) u.voice = v;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
document.addEventListener("click", e => { const b = e.target.closest("[data-say]"); if (b) speak(KMAP[b.dataset.say]); });
if ("speechSynthesis" in window) speechSynthesis.getVoices();

// ---------------- Test ----------------
let quizCleanup = null;
async function viewQuiz(params) {
  loading();
  const review = params.get("review") === "1";
  const mode = MODES[params.get("mode")] ? params.get("mode") : "mix";
  const nOpt = Math.max(4, Math.min(12, parseInt(params.get("opts")) || 8));
  const nQ = Math.max(5, Math.min(112, parseInt(params.get("n")) || 20));
  let units = parseUnits(params.get("u"));
  let pool;
  if (review) {
    const ks = await loadKstats();
    pool = overview(ks).review;
    if (!pool.length) { flash("Xatolar ro'yxatingiz bo'sh — barakalla! Oddiy test ishlang."); return go("#/"); }
    units = [...new Set(pool.map(k => k.u))].sort((a, b) => a - b);
  } else pool = KANJI.filter(k => units.includes(k.u));
  const cfg = { mode, opts: nOpt, n: nQ, units, review };

  page(`
  <div class="quiz" id="quiz">
    <div class="qbar">
      <div class="qmeta"><span id="q-count">—</span><span class="dot">·</span><span>${review ? "Xatolar ustida ishlash" : "Unit " + units.join(", ")}</span></div>
      <div class="qmeta r"><span class="pill ok" id="q-ok">✓ 0</span><span class="pill bad" id="q-bad">✗ 0</span><span class="pill" id="q-time">0:00</span></div>
    </div>
    <div class="progress"><i id="q-prog"></i></div>
    <div class="card qcard">
      <div class="qtype" id="q-type"></div>
      <div class="prompt" id="q-prompt"></div>
      <div class="opts" id="q-opts"></div>
      <div class="explain" id="q-explain" hidden></div>
      <div class="qfoot">
        <label class="toggle"><input type="checkbox" id="auto" checked> To'g'ri bo'lsa avtomatik o'tish</label>
        <div><button class="btn ghost" id="finish">Yakunlash</button><button class="btn primary" id="next" disabled>Keyingi →</button></div>
      </div>
    </div>
    <p class="hint center">Klaviatura: <kbd>1</kbd>–<kbd>9</kbd>, <kbd>0</kbd> — variant tanlash, <kbd>Enter</kbd> — keyingi savol</p>
  </div>
  <div class="card narrow center" id="saving" hidden><div class="big-kanji spin">終</div><p>Natija saqlanmoqda…</p></div>`, "home");

  const TYPES = ["k2h", "h2k", "p2k", "k2m"];
  const TYPE_LABEL = { k2h: "Bu kanji qanday o'qiladi?", h2k: "Qaysi kanji shunday o'qiladi?", p2k: "Rasm va ma'noga mos kanjini toping", k2m: "Bu kanjining ma'nosi nima?" };
  const answerOf = (k, t) => t === "k2h" ? readings(k) : t === "k2m" ? k.m : k.k;
  const promptOf = (k, t) => t === "h2k" ? readings(k) : t === "p2k" ? k.p + k.m : k.k;
  const unitPool = KANJI.filter(k => units.includes(k.u));
  function buildOptions(k, t) {
    const right = answerOf(k, t), pkey = promptOf(k, t), want = nOpt - 1, chosen = [], seen = new Set([right]);
    const tryAdd = c => {
      if (chosen.length >= want || c.id === k.id) return;
      const a = answerOf(c, t);
      if (seen.has(a) || promptOf(c, t) === pkey) return;
      if (t === "h2k" && readings(c) === readings(k)) return;
      seen.add(a); chosen.push(c);
    };
    shuffle(KANJI.filter(c => c.u === k.u)).slice(0, Math.ceil(want / 2)).forEach(tryAdd);
    shuffle(unitPool).forEach(tryAdd);
    shuffle(KANJI).forEach(tryAdd);
    return shuffle([k, ...chosen]).map(c => ({ id: c.id, text: answerOf(c, t) }));
  }
  const questions = shuffle(pool).slice(0, Math.min(nQ, pool.length)).map(k => {
    const t = mode === "mix" ? TYPES[Math.floor(Math.random() * 4)] : mode;
    return { k, t, options: buildOptions(k, t) };
  });

  const el = { count: $("#q-count"), ok: $("#q-ok"), bad: $("#q-bad"), time: $("#q-time"), prog: $("#q-prog"), type: $("#q-type"),
    prompt: $("#q-prompt"), opts: $("#q-opts"), explain: $("#q-explain"), next: $("#next"), finish: $("#finish"), auto: $("#auto") };
  try { el.auto.checked = localStorage.getItem("kanjiAuto") !== "0"; } catch (e) {}
  el.auto.onchange = () => { try { localStorage.setItem("kanjiAuto", el.auto.checked ? "1" : "0"); } catch (e) {} };

  let idx = 0, answered = false, okN = 0, badN = 0, autoTimer = null, saving = false;
  const results = [], t0 = Date.now();
  const timer = setInterval(() => { el.time.textContent = fmtDur(Math.floor((Date.now() - t0) / 1000)); }, 1000);

  function render() {
    const q = questions[idx], k = q.k;
    answered = false; el.next.disabled = true; el.explain.hidden = true;
    el.count.textContent = `${idx + 1} / ${questions.length}`;
    el.prog.style.width = `${(idx / questions.length) * 100}%`;
    el.type.textContent = TYPE_LABEL[q.t];
    if (q.t === "k2h" || q.t === "k2m") el.prompt.innerHTML = `<div class="p-kanji">${esc(k.k)}</div>`;
    else if (q.t === "h2k") el.prompt.innerHTML = `<div class="p-read">${esc(readings(k))}</div>`;
    else el.prompt.innerHTML = `<div class="p-pic">${k.p}</div><div class="p-mean">${esc(k.m)}</div>`;
    const big = q.t === "h2k" || q.t === "p2k";
    el.opts.className = "opts " + (big ? "kanji-opts" : q.t === "k2h" ? "read-opts" : "mean-opts") + " n" + q.options.length;
    el.opts.innerHTML = q.options.map((o, i) => `<button class="opt" data-i="${i}">${i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : ""}<span>${esc(o.text)}</span></button>`).join("");
  }
  function choose(i) {
    if (answered || saving) return;
    const q = questions[idx], opt = q.options[i]; if (!opt) return;
    answered = true;
    const ok = opt.id === q.k.id;
    ok ? okN++ : badN++;
    el.ok.textContent = `✓ ${okN}`; el.bad.textContent = `✗ ${badN}`;
    results.push({ k: q.k.id, qt: q.t, ok, ch: opt.text });
    [...el.opts.children].forEach((b, j) => { b.disabled = true;
      b.classList.add(q.options[j].id === q.k.id ? "right" : j === i ? "wrong" : "dim"); });
    const w = KMAP[opt.id];
    const extra = ok ? "" : `<div class="kc-wrong">Siz tanlagan: <b>${esc(w.k)}</b> — ${esc(readings(w))} — ${esc(w.m)}</div>`;
    el.explain.className = "explain kcard " + (ok ? "is-ok" : "is-bad");
    el.explain.innerHTML = `<div class="verdict">${ok ? "To'g'ri! 🎉" : "Xato — mana to'g'ri javob:"}</div>` + cardHTML(q.k, extra);
    el.explain.hidden = false; el.next.disabled = false;
    el.next.textContent = idx + 1 < questions.length ? "Keyingi →" : "Natijani ko'rish →";
    if (ok && el.auto.checked) autoTimer = setTimeout(next, 1100); else el.next.focus();
  }
  function next() {
    clearTimeout(autoTimer);
    if (!answered) return;
    if (idx + 1 < questions.length) { idx++; render(); } else finish();
  }
  async function finish() {
    if (saving) return;
    if (!results.length) return go("#/");
    saving = true; clearInterval(timer);
    $("#quiz").hidden = true; $("#saving").hidden = false;
    try {
      const aid = await saveAttempt(cfg, results, Math.round((Date.now() - t0) / 1000));
      go(`#/result/${S.user.uid}/${aid}`);
    } catch (e) {
      console.error(e);
      $("#saving").innerHTML = `<p>Natijani saqlab bo'lmadi: ${esc(e.message)}</p><button class="btn primary" id="retry">Qayta urinish</button>`;
      $("#retry").onclick = () => { saving = false; $("#saving").innerHTML = `<div class="big-kanji spin">終</div><p>Natija saqlanmoqda…</p>`; finish(); };
    }
  }
  el.opts.onclick = e => { const b = e.target.closest(".opt"); if (b) choose(+b.dataset.i); };
  el.next.onclick = next;
  el.finish.onclick = () => { if (!results.length || confirm("Testni hozir yakunlaysizmi? Javob berilgan savollar saqlanadi.")) finish(); };
  const onKey = e => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "Enter") { e.preventDefault(); next(); return; }
    if (/^[0-9]$/.test(e.key)) choose(e.key === "0" ? 9 : +e.key - 1);
  };
  document.addEventListener("keydown", onKey);
  quizCleanup = () => { document.removeEventListener("keydown", onKey); clearInterval(timer); clearTimeout(autoTimer); };
  if (!questions.length) { el.prompt.textContent = "Savol topilmadi."; return; }
  render();
}

async function saveAttempt(cfg, results, duration) {
  const uid = S.user.uid, now = Date.now();
  const ks = await loadKstats();
  for (const a of results) {
    const s = ks[a.k] || (ks[a.k] = { seen: 0, r: 0, w: 0, s: 0, rv: 0 });
    s.seen++; s.t = now;
    if (a.ok) { s.r++; s.s++; if (s.rv && s.s >= REVIEW_CLEAR) s.rv = 0; }
    else { s.w++; s.s = 0; s.rv = 1; }
  }
  const ov = overview(ks);
  const correct = results.filter(a => a.ok).length;
  const aref = doc(collection(db, "users", uid, "attempts"));
  const p = S.profile;
  const b = writeBatch(db);
  b.set(aref, { createdAt: now, mode: cfg.mode, units: cfg.units, opts: cfg.opts, total: results.length, correct,
    duration, review: !!cfg.review, answers: results });
  b.set(doc(db, "users", uid, "meta", "kstats"), { k: ks });
  const upd = { attempts: (p.attempts || 0) + 1, total: (p.total || 0) + results.length, correct: (p.correct || 0) + correct,
    mastered: ov.mastered, review: ov.review.length, lastSeen: now };
  b.update(doc(db, "users", uid), upd);
  await b.commit();
  Object.assign(S.profile, upd);
  return aref.id;
}

// ---------------- Natija ----------------
function attLabel(a) {
  const k = a.kind || "kanji";
  if (k === "kanji") return a.review ? "Kanji · xatolar" : "Kanji · Unit " + unitsLabel(a.units);
  return kindLabel(k) + (a.review ? " · xatolar" : " · " + lessonsLabel(a.units) + "-mavzu");
}
const modeLabel = a => (a.kind || "kanji") === "kanji" ? (MODES[a.mode] || a.mode) : String(a.mode || "").split(",").map(m => QT_LABEL[m] || (m === "mix" ? "Aralash" : m)).join(", ");

async function viewPracticeResult(uid, aid, a, usnap) {
  const p = pct(a.correct, a.total), wrong = a.answers.filter(x => !x.ok), mine = uid === S.user.uid, kind = a.kind;
  const title = p >= 90 ? "素晴らしい! Ajoyib!" : p >= 70 ? "よくできました! Yaxshi!" : p >= 50 ? "がんばって! Yomon emas" : "Mashq qilamiz! 頑張ろう";
  const base = kind === "vocab" ? "#/vquiz" : "#/squiz";
  const again = kind === "vocab" ? `${base}?l=${(a.units || []).join(",")}&mode=${a.mode}&opts=${a.opts}&n=${a.total}`
    : `${base}?l=${(a.units || []).join(",")}&t=${a.mode}&opts=${a.opts}&n=${a.total}`;
  const reviewUrl = kind === "vocab" ? "#/vquiz?review=1&mode=mix&opts=8&n=100" : "#/squiz?review=1&t=u2j,j2u,order,fill&opts=6&n=100";
  page(`
  <section class="card result-head">
    <div class="ring" style="--p:${p}"><div><b>${p}%</b><span>${a.correct}/${a.total}</span></div></div>
    <div class="rh-text"><h1>${title}</h1>
      <p class="muted">${usnap ? `<b>${esc(usnap.data()?.username)}</b> · ` : ""}${fmtDt(a.createdAt)} · ${esc(attLabel(a))} · ${esc(modeLabel(a))} · vaqt ${fmtDur(a.duration)}</p>
      <div class="actions">
        ${mine && wrong.length ? `<a class="btn primary" href="${reviewUrl}">Xatolar ustida ishlash</a>` : ""}
        ${mine && !a.review ? `<a class="btn" href="${again}">Yana shu test</a>` : ""}
        <a class="btn ghost" href="${mine ? (kind === "vocab" ? "#/vocab" : "#/sent") : "#/admin/user/" + uid}">${mine ? "Orqaga" : "← Orqaga"}</a>
      </div></div>
  </section>
  ${wrong.length ? `<h2 class="sec">Xatolar — shularni takrorlang</h2>
  <div class="wrong-list">${wrong.map(x => { const d = describeAnswer(kind, x); return `
    <div class="card wcard2"><div class="w2-main">${d.main}</div><div class="w2-sub">${d.sub}</div>
      <div class="wc">Sizning javobingiz: <s>${esc(x.ch)}</s> · <span class="muted">${esc(QT_LABEL[x.qt] || x.qt)}</span></div>${d.gram || ""}</div>`; }).join("")}
  </div>` : ""}
  <h2 class="sec">Barcha javoblar</h2>
  <div class="card"><div class="tbl-wrap"><table class="tbl"><tr><th>#</th><th>${kind === "vocab" ? "So'z" : "Gap"}</th><th>Turi</th><th>Javob</th><th class="r">Natija</th></tr>
    ${a.answers.map((x, i) => { const d = describeAnswer(kind, x); return `<tr><td class="muted">${i + 1}</td><td><div class="jp-s">${d.main}</div><small class="muted">${d.sub}</small></td>
      <td>${esc(QT_LABEL[x.qt] || x.qt)}</td><td>${esc(x.ch)}</td>
      <td class="r">${x.ok ? `<span class="tag ok">✓</span>` : `<span class="tag bad">✗</span>`}</td></tr>`; }).join("")}
  </table></div></div>`, mine ? "history" : "admin");
}

async function viewResult(uid, aid) {
  loading();
  if (uid !== S.user.uid && !S.profile.isAdmin) return errorPage("Bu natijani ko'rishga ruxsat yo'q.", "禁");
  const [snap, usnap] = await Promise.all([getDoc(doc(db, "users", uid, "attempts", aid)),
    uid === S.user.uid ? Promise.resolve(null) : getDoc(doc(db, "users", uid))]);
  if (!snap.exists()) return errorPage("Natija topilmadi.");
  if (snap.data().kind && snap.data().kind !== "kanji") return viewPracticeResult(uid, aid, snap.data(), usnap);
  const a = snap.data(), p = pct(a.correct, a.total), wrong = a.answers.filter(x => !x.ok), mine = uid === S.user.uid;
  const title = p >= 90 ? "素晴らしい! Ajoyib!" : p >= 70 ? "よくできました! Yaxshi!" : p >= 50 ? "がんばって! Yomon emas" : "Mashq qilamiz! 頑張ろう";
  page(`
  <section class="card result-head">
    <div class="ring" style="--p:${p}"><div><b>${p}%</b><span>${a.correct}/${a.total}</span></div></div>
    <div class="rh-text"><h1>${title}</h1>
      <p class="muted">${usnap ? `<b>${esc(usnap.data()?.username)}</b> · ` : ""}${fmtDt(a.createdAt)} · ${a.review ? "Xatolar ustida ishlash" : "Unit " + unitsLabel(a.units)} · ${MODES[a.mode]} · ${a.opts} variant · vaqt ${fmtDur(a.duration)}</p>
      <div class="actions">
        ${mine && wrong.length ? `<a class="btn primary" href="#/quiz?review=1&mode=mix&opts=${a.opts}&n=112">Xatolar ustida ishlash (${wrong.length})</a>` : ""}
        ${mine && !a.review ? `<a class="btn" href="#/quiz?u=${a.units.join(",")}&mode=${a.mode}&opts=${a.opts}&n=${a.total}">Yana shu test</a>` : ""}
        <a class="btn ghost" href="${mine ? "#/" : "#/admin/user/" + uid}">${mine ? "Bosh sahifa" : "← Orqaga"}</a>
      </div></div>
  </section>
  ${wrong.length ? `<h2 class="sec">Xato qilingan kanjilar — shularni takrorlang</h2>
  <div class="wrong-grid">${wrong.map(x => { const k = KMAP[x.k]; return `
    <div class="card wcard"><div class="wk">${k.k}</div><div>
      <div class="wm">${k.p} ${esc(k.m)}</div><div class="wr">${esc(readings(k))}</div>
      <div class="wc">Siz tanlagan: <s>${esc(x.ch)}</s></div><div class="wmn">💡 ${esc(k.mn)}</div></div></div>`; }).join("")}
  </div>` : ""}
  <h2 class="sec">Barcha javoblar</h2>
  <div class="card"><table class="tbl"><tr><th>#</th><th>Kanji</th><th>Savol turi</th><th>Javob</th><th class="r">Natija</th></tr>
    ${a.answers.map((x, i) => `<tr><td class="muted">${i + 1}</td><td class="jk">${KMAP[x.k].k}</td><td>${MODES[x.qt] || x.qt}</td><td>${esc(x.ch)}</td>
      <td class="r">${x.ok ? `<span class="tag ok">✓</span>` : `<span class="tag bad">✗</span>`}</td></tr>`).join("")}
  </table></div>`, mine ? "history" : "admin");
}

// ---------------- Natijalar tarixi (o'zim yoki admin ko'rinishi) ----------------
async function viewHistory(uid) {
  loading();
  const adminView = uid !== S.user.uid;
  if (adminView && !S.profile.isAdmin) return errorPage("Bu sahifa faqat admin uchun.", "禁");
  const [usnap, ks, asnap, ps] = await Promise.all([
    getDoc(doc(db, "users", uid)), loadKstats(uid),
    getDocs(query(collection(db, "users", uid, "attempts"), orderBy("createdAt", "desc"), limit(100))),
    practiceSummaries(uid),
  ]);
  if (!usnap.exists()) return errorPage("Foydalanuvchi topilmadi.");
  const who = usnap.data(), ov = overview(ks), atts = asnap.docs.map(d => ({ id: d.id, ...d.data() }));
  page(`
  ${adminView ? `<p><a href="#/admin">← Admin panel</a></p>
  <section class="card admin-user">
    <div><h1>${esc(who.username)} ${who.isAdmin ? `<span class="tag">admin</span>` : ""} ${who.disabled ? `<span class="tag bad">bloklangan</span>` : ""}</h1>
      <p class="muted">Ro'yxatdan o'tgan: ${fmtDt(who.createdAt)} · Oxirgi faollik: ${fmtDt(who.lastSeen)}</p></div>
    <div class="admin-actions">
      <button class="btn sm ghost" data-act="toggle_admin">${who.isAdmin ? "Adminlikdan olish" : "Admin qilish"}</button>
      <button class="btn sm ghost" data-act="toggle_block">${who.disabled ? "Blokdan chiqarish" : "Bloklash"}</button>
      <button class="btn sm ghost" data-act="reset_stats">Natijalarni tozalash</button>
      <button class="btn sm danger" data-act="delete">O'chirish</button>
    </div>
  </section>` : `<h1>Natijalarim</h1>`}
  <div class="kpis row">
    <div class="kpi"><b>${ov.mastered}<small>/112</small></b><span>o'zlashtirilgan</span></div>
    <div class="kpi"><b>${ov.acc}<small>%</small></b><span>umumiy aniqlik</span></div>
    <div class="kpi"><b>${ov.answered}</b><span>javob berilgan</span></div>
    <div class="kpi"><b>${who.attempts || 0}</b><span>test</span></div>
  </div>
  <div class="two">
    ${[["vocab", "Lug'at", ps.vocab, "#/vquiz?review=1&mode=mix&opts=8&n=100", "#/vocab"], ["sent", "Gaplar", ps.sent, "#/squiz?review=1&t=u2j,j2u,order,fill&opts=6&n=100", "#/sent"]].map(([k, t, sm, rv, home]) => `
    <section class="card"><div class="sec-head"><h2>${t}</h2>${!adminView ? `<a class="btn sm" href="${home}">Ochish</a>` : ""}</div>
      <p><b>${sm.mastered}</b> ta o'zlashtirilgan · aniqlik <b>${sm.acc}%</b> · ${sm.answered} ta javob</p>
      ${sm.review.length ? `<p class="muted">Xatolar ro'yxatida: ${sm.review.length} ta ${!adminView ? `· <a href="${rv}">xatolar bo'yicha test</a>` : ""}</p>
        <div class="kanji-chips small-chips">${sm.review.slice(0, 20).map(it => `<span class="kchip"><small>${esc(k === "vocab" ? it.kana : it.uz)}</small></span>`).join("")}</div>` : `<p class="muted">Xatolar yo'q.</p>`}
    </section>`).join("")}
  </div>
  <section class="card"><h2>Kanji: unitlar bo'yicha</h2><div class="unit-rows">
    ${ov.units.map(u => `<div class="urow"><b>Unit ${u.u}</b><span class="bar"><i style="width:${pct(u.mastered, u.n)}%"></i></span>
      <span>${u.mastered}/${u.n}</span><span class="muted">${u.tried ? u.acc + "% aniqlik" : "boshlanmagan"}</span>
      ${adminView ? "<span></span>" : `<a href="#/study?units=${u.u}">yodlash</a>`}</div>`).join("")}
  </div></section>
  <section class="card">
    <div class="sec-head"><h2>Kanji: xatolar ro'yxati <small class="muted">(${ov.review.length})</small></h2>
      ${ov.review.length && !adminView ? `<a class="btn primary sm" href="#/quiz?review=1&mode=mix&opts=8&n=112">Xatolar bo'yicha test</a>` : ""}</div>
    ${ov.review.length ? `<div class="kanji-chips">${ov.review.map(k => `<span class="kchip" title="${esc(k.m)} — ${esc(readings(k))}"><b>${k.k}</b><small>${esc(k.m)}</small><em>✗${ks[k.id].w}</em></span>`).join("")}</div>
      <p class="hint">Kanji ketma-ket 2 marta to'g'ri topilganda bu ro'yxatdan avtomatik chiqadi.</p>` : `<p class="muted">Xatolar yo'q. 🎉</p>`}
  </section>
  ${ov.weak.length ? `<section class="card"><h2>Eng ko'p adashilgan kanjilar</h2><table class="tbl">
    <tr><th>Kanji</th><th>Ma'no</th><th>O'qilishi</th><th class="r">To'g'ri</th><th class="r">Xato</th></tr>
    ${ov.weak.map(([k, s]) => `<tr><td class="jk">${k.k}</td><td>${esc(k.m)}</td><td>${esc(readings(k))}</td><td class="r">${s.r}</td><td class="r"><b class="red">${s.w}</b></td></tr>`).join("")}
  </table></section>` : ""}
  <section class="card"><h2>Testlar tarixi</h2>
    ${atts.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th>Sana</th><th>Bo'lim</th><th>Turi</th><th>Variant</th><th>Vaqt</th><th class="r">Natija</th></tr>
      ${atts.map(a => `<tr><td><a href="#/result/${uid}/${a.id}">${fmtDt(a.createdAt)}</a></td><td>${esc(attLabel(a))}</td>
        <td>${esc(modeLabel(a))}</td><td>${a.opts}</td><td>${fmtDur(a.duration)}</td>
        <td class="r"><span class="score ${scoreCls(a.correct, a.total)}">${a.correct}/${a.total} · ${pct(a.correct, a.total)}%</span></td></tr>`).join("")}
    </table></div>` : `<p class="muted">Hali test yo'q.</p>`}
  </section>`, adminView ? "admin" : "history");

  if (adminView) app.querySelectorAll("[data-act]").forEach(b => b.onclick = () => adminAction(uid, who, b.dataset.act, atts));
}

async function adminAction(uid, who, act, atts) {
  const self = uid === S.user.uid;
  try {
    if (act === "toggle_admin") {
      if (self) return alert("O'zingizning admin huquqingizni olib tashlay olmaysiz.");
      await updateDoc(doc(db, "users", uid), { isAdmin: !who.isAdmin });
      flash("Admin huquqi o'zgartirildi.");
    } else if (act === "toggle_block") {
      if (self) return alert("O'zingizni bloklay olmaysiz.");
      await updateDoc(doc(db, "users", uid), { disabled: !who.disabled });
      flash(who.disabled ? "Blokdan chiqarildi." : "Foydalanuvchi bloklandi — u endi kira olmaydi.");
    } else if (act === "reset_stats" || act === "delete") {
      if (act === "delete" && self) return alert("O'zingizni o'chira olmaysiz.");
      if (!confirm(act === "delete" ? `${who.username} butunlay o'chiriladi. Davom etasizmi?` : `${who.username} ning barcha natijalari o'chiriladi. Davom etasizmi?`)) return;
      const all = await getDocs(collection(db, "users", uid, "attempts"));
      const refs = [...all.docs.map(d => d.ref), ...["kstats", "vstats", "sstats"].map(m => doc(db, "users", uid, "meta", m))];
      for (let i = 0; i < refs.length; i += 400) {
        const b = writeBatch(db); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit();
      }
      if (act === "delete") {
        const b = writeBatch(db);
        b.delete(doc(db, "usernames", who.username_lc)); b.delete(doc(db, "users", uid));
        await b.commit();
        flash(`${who.username} o'chirildi. U shu login bilan qayta ro'yxatdan o'tishi mumkin.`);
        return go("#/admin");
      }
      await updateDoc(doc(db, "users", uid), { attempts: 0, total: 0, correct: 0, mastered: 0, review: 0 });
      flash(`${who.username} natijalari tozalandi.`);
    }
    route();
  } catch (e) { console.error(e); alert("Xatolik: " + e.message); }
}

// ---------------- Admin panel ----------------
async function viewAdmin() {
  if (!S.profile.isAdmin) return errorPage("Bu sahifa faqat admin uchun.", "禁");
  loading();
  const snap = await getDocs(collection(db, "users"));
  const users = snap.docs.map(d => ({ uid: d.id, ...d.data() })).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  const tot = users.reduce((s, u) => ({ n: s.n + (u.attempts || 0), t: s.t + (u.total || 0), c: s.c + (u.correct || 0) }), { n: 0, t: 0, c: 0 });
  page(`<h1>Admin panel</h1>
  <div class="kpis row">
    <div class="kpi"><b>${users.length}</b><span>foydalanuvchi</span></div>
    <div class="kpi"><b>${tot.n}</b><span>test ishlangan</span></div>
    <div class="kpi"><b>${tot.t}</b><span>javob</span></div>
    <div class="kpi"><b>${pct(tot.c, tot.t)}<small>%</small></b><span>o'rtacha aniqlik</span></div>
  </div>
  <section class="card"><h2>Foydalanuvchilar</h2><div class="tbl-wrap"><table class="tbl">
    <tr><th>Login</th><th>Ro'yxatdan o'tgan</th><th>Oxirgi faollik</th><th class="r">Testlar</th><th class="r">Aniqlik</th><th class="r">O'zlashtirgan</th><th class="r">Xatolar</th><th></th></tr>
    ${users.map(u => `<tr><td><b>${esc(u.username)}</b> ${u.isAdmin ? `<span class="tag">admin</span>` : ""}${u.disabled ? ` <span class="tag bad">blok</span>` : ""}</td>
      <td class="muted">${fmtDt(u.createdAt)}</td><td>${fmtDt(u.lastSeen)}</td><td class="r">${u.attempts || 0}</td>
      <td class="r">${pct(u.correct, u.total)}%</td><td class="r">${u.mastered || 0}/112</td><td class="r">${u.review || 0}</td>
      <td class="r"><a class="btn sm" href="#/admin/user/${u.uid}">Batafsil</a></td></tr>`).join("")}
  </table></div></section>
  <section class="card"><div class="sec-head"><h2>Hamma uchun eng qiyin kanjilar</h2><button class="btn sm" id="hardbtn">Hisoblash</button></div>
    <div id="hard"><p class="muted">Barcha foydalanuvchilar statistikasidan eng ko'p xato qilingan kanjilarni hisoblaydi.</p></div></section>`, "admin");
  $("#hardbtn").onclick = async () => {
    $("#hard").innerHTML = `<p class="muted">Hisoblanmoqda…</p>`;
    const agg = {};
    const all = await Promise.all(users.filter(u => u.attempts).map(u => loadKstats(u.uid).catch(() => ({}))));
    all.forEach(ks => Object.entries(ks).forEach(([id, s]) => { const a = agg[id] || (agg[id] = { w: 0, s: 0 }); a.w += s.w; a.s += s.seen; }));
    const hard = Object.entries(agg).filter(([, a]) => a.w).sort((x, y) => (y[1].w / y[1].s - x[1].w / x[1].s) || (y[1].w - x[1].w)).slice(0, 20);
    $("#hard").innerHTML = hard.length ? `<div class="kanji-chips">${hard.map(([id, a]) => `<span class="kchip"><b>${KMAP[id].k}</b><small>${esc(KMAP[id].m)}</small><em>${pct(a.w, a.s)}% xato</em></span>`).join("")}</div>` : `<p class="muted">Hali ma'lumot yo'q.</p>`;
  };
}

// ---------------- Yodlash ----------------
async function viewStudy(params) {
  loading();
  const ks = await loadKstats();
  let sel = new Set(parseUnits(params.get("units") || "1"));
  page(`
  <div class="study-head"><div><h1>Yodlash</h1><p class="muted">Kanjini bosing — rasm, o'qilishi, misol va eslab qolish usuli chiqadi. Ko'rinishlarni yashirib, o'zingizni tekshiring.</p></div>
    <div class="study-tools"><label class="toggle"><input type="checkbox" data-show="pic" checked> Rasm</label><label class="toggle"><input type="checkbox" data-show="read" checked> O'qilishi</label><label class="toggle"><input type="checkbox" data-show="mean" checked> Ma'no</label></div></div>
  <div class="unit-tabs" id="tabs">${UNITS.map(u => `<button type="button" data-u="${u}">Unit ${u}</button>`).join("")}<button type="button" data-u="all" class="ghost">Hammasi</button></div>
  <div class="legend muted"><span class="dot-g"></span> o'zlashtirilgan <span class="dot-r"></span> xatolar ro'yxatida</div>
  <div id="grid" class="study-grid show-pic show-read show-mean"></div>
  <div class="modal" id="modal" hidden><div class="modal-bg" data-close></div>
    <div class="modal-box kcard"><button class="modal-x" data-close aria-label="Yopish">×</button><div id="modal-body"></div>
      <div class="modal-nav"><button class="btn ghost" id="prevk">← Oldingi</button><span id="modal-pos" class="muted"></span><button class="btn ghost" id="nextk">Keyingi →</button></div></div></div>`, "study");
  const grid = $("#grid"), tabs = $("#tabs"), modal = $("#modal");
  let list = [], cur = 0;
  function draw() {
    tabs.querySelectorAll("button[data-u]").forEach(x => x.classList.toggle("on", sel.has(+x.dataset.u)));
    list = KANJI.filter(k => sel.has(k.u));
    let html = "", lastU = 0;
    list.forEach((k, i) => {
      if (k.u !== lastU) { html += `<div class="grid-unit">Unit ${k.u}</div>`; lastU = k.u; }
      const s = ks[k.id], cls = s ? (s.rv ? "rv" : s.s >= MASTER_STREAK ? "ms" : "") : "";
      html += `<button class="tile ${cls}" data-i="${i}"><span class="t-pic">${k.p}</span><span class="t-k">${k.k}</span><span class="t-read">${esc(readings(k))}</span><span class="t-mean">${esc(k.m)}</span></button>`;
    });
    grid.innerHTML = html || `<p class="muted">Unit tanlang.</p>`;
  }
  tabs.onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.u === "all") sel = new Set(UNITS); else { const u = +b.dataset.u; sel.has(u) ? sel.delete(u) : sel.add(u); }
    draw();
  };
  app.querySelectorAll("[data-show]").forEach(c => c.onchange = () => grid.classList.toggle("show-" + c.dataset.show, c.checked));
  function open(i) {
    cur = (i + list.length) % list.length; const k = list[cur], s = ks[k.id];
    const st = s ? `<div class="kc-st">Sizda: ✓ ${s.r} · ✗ ${s.w}${s.rv ? ` · <b class="red">xatolar ro'yxatida</b>` : s.s >= MASTER_STREAK ? ` · <b class="green">o'zlashtirilgan</b>` : ""}</div>` : "";
    $("#modal-body").innerHTML = cardHTML(k, st);
    $("#modal-pos").textContent = `${cur + 1} / ${list.length}`;
    modal.hidden = false;
  }
  grid.onclick = e => { const t = e.target.closest(".tile"); if (t) open(+t.dataset.i); };
  modal.onclick = e => { if (e.target.closest("[data-close]")) modal.hidden = true; };
  $("#prevk").onclick = () => open(cur - 1);
  $("#nextk").onclick = () => open(cur + 1);
  const onKey = e => { if (modal.hidden) return; if (e.key === "Escape") modal.hidden = true; if (e.key === "ArrowRight") open(cur + 1); if (e.key === "ArrowLeft") open(cur - 1); };
  document.addEventListener("keydown", onKey);
  quizCleanup = () => document.removeEventListener("keydown", onKey);
  draw();
}

initPractice({ db, S, page, loading, flash, go, setCleanup: fn => { quizCleanup = fn; } });

// ---------------- Router ----------------
async function route() {
  if (quizCleanup) { quizCleanup(); quizCleanup = null; }
  if (!S.ready) return;
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = h.split("?");
  const params = new URLSearchParams(qs || "");
  const parts = path.split("/").filter(Boolean);
  if (!S.profile) {
    if (parts[0] === "register") return viewAuth("register");
    return viewAuth("login");
  }
  try {
    switch (parts[0]) {
      case undefined: return await viewHome();
      case "login": case "register": return go("#/");
      case "study": return await viewStudy(params);
      case "vocab": return await viewVocabHome(params);
      case "vquiz": return await viewVocabQuiz(params);
      case "sent": return await viewSentHome(params);
      case "squiz": return await viewSentQuiz(params);
      case "quiz": return await viewQuiz(params);
      case "result": return await viewResult(parts[1], parts[2]);
      case "history": return await viewHistory(S.user.uid);
      case "password": return viewPassword();
      case "admin":
        if (parts[1] === "user" && parts[2]) return await viewHistory(parts[2]);
        return await viewAdmin();
      default: return errorPage("Sahifa topilmadi.");
    }
  } catch (e) {
    console.error(e);
    errorPage("Xatolik yuz berdi: " + (e.message || e));
  }
}

window.addEventListener("hashchange", route);
$("#logout").onclick = async () => { await signOut(auth); location.hash = "#/login"; };
document.title = SITE_NAME;

async function onAuth(user) {
  S.user = user; S.profile = null; S.kstats = null;
  if (user) {
    try {
      await loadProfile();
      if (!S.profile) { flash("Bu akkaunt o'chirilgan. Yangi login bilan ro'yxatdan o'ting.", "error"); await signOut(auth); return; }
      if (S.profile.disabled) { flash("Akkauntingiz admin tomonidan bloklangan.", "error"); S.profile = null; await signOut(auth); return; }
      updateDoc(doc(db, "users", user.uid), { lastSeen: Date.now() }).catch(() => {});
    } catch (e) { console.error(e); flash("Ma'lumotlarni yuklab bo'lmadi: " + e.message, "error"); }
  }
  S.ready = true;
  route();
}
onAuthStateChanged(auth, user => { if (!S.registering) onAuth(user); });
