// Romaji → kana konvertor va ekrandagi hiragana/katakana klaviatura.

// ---------- Romaji jadvali ----------
const T = {};
const add = (r, k) => { T[r] = k; };
const V = { a: "あ", i: "い", u: "う", e: "え", o: "お" };
Object.entries(V).forEach(([r, k]) => add(r, k));
const rows = {
  k: "かきくけこ", g: "がぎぐげご", s: "さしすせそ", z: "ざじずぜぞ", t: "たちつてと", d: "だぢづでど",
  n: "なにぬねの", h: "はひふへほ", b: "ばびぶべぼ", p: "ぱぴぷぺぽ", m: "まみむめも", r: "らりるれろ",
};
for (const [c, ks] of Object.entries(rows)) "aiueo".split("").forEach((v, i) => add(c + v, ks[i]));
add("ya", "や"); add("yu", "ゆ"); add("yo", "よ"); add("yi", "い"); add("ye", "いぇ");
add("wa", "わ"); add("wo", "を"); add("wi", "うぃ"); add("we", "うぇ"); add("wu", "う");
add("shi", "し"); add("chi", "ち"); add("tsu", "つ"); add("fu", "ふ"); add("ji", "じ");
add("si", "し"); add("ti", "ち"); add("tu", "つ"); add("hu", "ふ"); add("zi", "じ"); add("di", "ぢ"); add("du", "づ");
add("la", "ぁ"); add("li", "ぃ"); add("lu", "ぅ"); add("le", "ぇ"); add("lo", "ぉ");
add("xa", "ぁ"); add("xi", "ぃ"); add("xu", "ぅ"); add("xe", "ぇ"); add("xo", "ぉ");
add("lya", "ゃ"); add("lyu", "ゅ"); add("lyo", "ょ"); add("xya", "ゃ"); add("xyu", "ゅ"); add("xyo", "ょ");
add("ltu", "っ"); add("xtu", "っ"); add("ltsu", "っ"); add("xtsu", "っ"); add("xwa", "ゎ");
add("nn", "ん"); add("n'", "ん"); add("xn", "ん");
const yoon = { ky: "き", gy: "ぎ", ny: "に", hy: "ひ", by: "び", py: "ぴ", my: "み", ry: "り", dy: "ぢ" };
for (const [c, k] of Object.entries(yoon)) { add(c + "a", k + "ゃ"); add(c + "u", k + "ゅ"); add(c + "o", k + "ょ"); add(c + "i", k + "ぃ"); add(c + "e", k + "ぇ"); }
for (const [c, k] of Object.entries({ sh: "し", sy: "し", ch: "ち", ty: "ち", cy: "ち", j: "じ", jy: "じ", zy: "じ" })) {
  add(c + "a", k + "ゃ"); add(c + "u", k + "ゅ"); add(c + "o", k + "ょ"); add(c + "e", k + "ぇ");
}
add("fa", "ふぁ"); add("fi", "ふぃ"); add("fe", "ふぇ"); add("fo", "ふぉ"); add("fyu", "ふゅ");
add("va", "ゔぁ"); add("vi", "ゔぃ"); add("vu", "ゔ"); add("ve", "ゔぇ"); add("vo", "ゔぉ");
add("tsa", "つぁ"); add("tsi", "つぃ"); add("tse", "つぇ"); add("tso", "つぉ");
add("thi", "てぃ"); add("dhi", "でぃ"); add("twu", "とぅ"); add("dwu", "どぅ");
add("-", "ー"); add(".", "。"); add(",", "、"); add("?", "？"); add("!", "！"); add("~", "〜");
add("[", "「"); add("]", "」");
const MAXLEN = 4;
const CONS = "bcdfghjklmpqrstvwxyz";

export const toKata = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
export const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

// Romaji qatorini kanaga aylantiradi. final=true bo'lsa oxiridagi "n" ham ん bo'ladi.
// Natija: { out, rest } — rest — hali tugallanmagan lotin harflar (masalan "k", "ky").
export function romajiToKana(src, { kata = false, final = false } = {}) {
  let out = "", i = 0;
  const s = src;
  const emit = (k, upper) => { out += (kata || upper) ? toKata(k) : k; };
  while (i < s.length) {
    const ch = s[i];
    const lower = s.slice(i, i + MAXLEN).toLowerCase();
    if (!/[a-zA-Z'\-.,?!~\[\]]/.test(ch)) { out += ch; i++; continue; }
    const upper = /[A-Z]/.test(ch);
    const c0 = lower[0], c1 = lower[1];
    // ikkilangan undosh → っ (nn bundan mustasno)
    if (c1 && c0 === c1 && CONS.includes(c0) && c0 !== "n") { emit("っ", upper); i++; continue; }
    if (c0 === "t" && c1 === "c" && lower[2] === "h") { emit("っ", upper); i++; continue; }
    // "nn" + unli/y → ん (bitta n yeyiladi, ikkinchisi keyingi bo'g'inga o'tadi): konnichiha → こんにちは
    if (c0 === "n" && c1 === "n" && lower[2] && "aiueo".includes(lower[2])) { emit("ん", upper); i++; continue; }
    // n + undosh (y va n dan tashqari) → ん
    if (c0 === "n" && c1 && CONS.includes(c1) && c1 !== "y" && c1 !== "n") { emit("ん", upper); i++; continue; }
    let matched = false;
    for (let len = Math.min(MAXLEN, s.length - i); len > 0; len--) {
      const k = T[lower.slice(0, len)];
      if (k) { emit(k, upper); i += len; matched = true; break; }
    }
    if (matched) continue;
    // tugallanmagan bo'lishi mumkin: qolgan qism biror kalitning boshi bo'lsa — kutamiz
    const restStr = lower;
    const isPrefix = Object.keys(T).some(k => k.startsWith(restStr) && k.length > restStr.length);
    if (isPrefix && i + restStr.length >= s.length) {
      if (final && restStr === "n") { emit("ん", upper); i++; continue; }
      if (final) { out += s.slice(i); return { out, rest: "" }; }
      return { out, rest: s.slice(i) };
    }
    out += ch; i++;
  }
  return { out, rest: "" };
}

// ---------- Ekrandagi klaviatura ----------
const GRID = [
  "あいうえお", "かきくけこ", "さしすせそ", "たちつてと", "なにぬねの",
  "はひふへほ", "まみむめも", "や ゆ よ", "らりるれろ", "わ を ん",
];
const DAKU = { か: "が", き: "ぎ", く: "ぐ", け: "げ", こ: "ご", さ: "ざ", し: "じ", す: "ず", せ: "ぜ", そ: "ぞ", た: "だ", ち: "ぢ", つ: "づ", て: "で", と: "ど", は: "ば", ひ: "び", ふ: "ぶ", へ: "べ", ほ: "ぼ", う: "ゔ" };
const HANDAKU = { は: "ぱ", ひ: "ぴ", ふ: "ぷ", へ: "ぺ", ほ: "ぽ" };
const SMALL = { あ: "ぁ", い: "ぃ", う: "ぅ", え: "ぇ", お: "ぉ", や: "ゃ", ゆ: "ゅ", よ: "ょ", つ: "っ", わ: "ゎ" };
const inv = o => Object.fromEntries(Object.entries(o).map(([a, b]) => [b, a]));
const DAKU_R = inv(DAKU), HANDAKU_R = inv(HANDAKU), SMALL_R = inv(SMALL);

// Oxirgi belgini ゛/゜/kichik shaklga aylantirish (qayta bosilsa — orqaga)
function transformLast(text, kind) {
  if (!text) return text;
  const last = text.slice(-1), isK = /[ァ-ヶ]/.test(last), h = toHira(last);
  let r = null;
  if (kind === "daku") r = DAKU[h] || DAKU_R[h] || (HANDAKU_R[h] ? DAKU[HANDAKU_R[h]] : null);
  if (kind === "handaku") r = HANDAKU[h] || HANDAKU_R[h] || (DAKU_R[h] && HANDAKU[DAKU_R[h]]) || null;
  if (kind === "small") r = SMALL[h] || SMALL_R[h];
  if (!r) return text;
  if (kind === "daku" && DAKU_R[h]) r = DAKU_R[h];
  if (kind === "handaku" && HANDAKU_R[h]) r = HANDAKU_R[h];
  return text.slice(0, -1) + (isK ? toKata(r) : r);
}

// input — <input> element. Klaviatura shu inputga yozadi va romaji ham avtomatik aylanadi.
export function attachKana(input, holder, { onEnter } = {}) {
  let kata = false, nums = false;
  const conv = (final = false) => {
    const v = input.value;
    const m = v.match(/[a-zA-Z'\-.,?!~\[\]]+$/);
    if (!m && !final) return;
    // butun qatorni qayta aylantiramiz (kana qismi o'zgarmaydi)
    const { out, rest } = romajiToKana(v, { kata, final });
    const nv = out + rest;
    if (nv !== v) { input.value = nv; }
  };
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("spellcheck", "false");
  input.addEventListener("input", e => { if (!e.isComposing) conv(false); });
  input.addEventListener("compositionend", () => conv(false));
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); conv(true); onEnter && onEnter(); }
  });
  input.addEventListener("blur", () => conv(true));

  const insert = s => {
    conv(true);
    const st = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, st) + s + input.value.slice(en);
    const p = st + s.length; input.setSelectionRange?.(p, p);
  };
  const render = () => {
    const ch = c => kata ? toKata(c) : c;
    const rowsHtml = nums
      ? ["1234567890", "。、？！「」ー〜"].map(r => `<div class="kb-row">${[...r].map(c => `<button type="button" class="kb-k" data-c="${c}">${c}</button>`).join("")}</div>`).join("")
      : `<div class="kb-grid">${GRID.map(r => `<div class="kb-col">${[...r].map(c => c === " " ? `<span class="kb-k kb-empty"></span>` : `<button type="button" class="kb-k" data-c="${ch(c)}">${ch(c)}</button>`).join("")}</div>`).join("")}</div>`;
    holder.innerHTML = `
      <div class="kb ${kata ? "is-kata" : ""}">
        ${rowsHtml}
        <div class="kb-row kb-fn">
          <button type="button" class="kb-k kb-mode ${!kata && !nums ? "on" : ""}" data-f="hira">あ</button>
          <button type="button" class="kb-k kb-mode ${kata && !nums ? "on" : ""}" data-f="kata">ア</button>
          <button type="button" class="kb-k kb-mode ${nums ? "on" : ""}" data-f="nums">1?</button>
          <button type="button" class="kb-k" data-f="daku" title="dakuten: か→が">゛</button>
          <button type="button" class="kb-k" data-f="handaku" title="handakuten: は→ぱ">゜</button>
          <button type="button" class="kb-k" data-f="small" title="kichik: や→ゃ, つ→っ">小</button>
          <button type="button" class="kb-k" data-c="ー">ー</button>
          <button type="button" class="kb-k kb-wide" data-c=" ">␣</button>
          <button type="button" class="kb-k kb-del" data-f="del">⌫</button>
        </div>
        <div class="kb-quick">${["ゃ", "ゅ", "ょ", "っ"].map(c => `<button type="button" class="kb-k" data-c="${ch(c)}">${ch(c)}</button>`).join("")}
          <span class="kb-hint">Kompyuterda lotincha ham yozsa bo'ladi: <b>kya</b> → ${ch("きゃ")}, <b>kitte</b> → ${ch("きって")}, <b>nn</b> → ${ch("ん")}${kata ? "" : ", katta harf → katakana"}</span></div>
      </div>`;
  };
  holder.addEventListener("pointerdown", e => { if (e.target.closest(".kb-k")) e.preventDefault(); });
  holder.addEventListener("click", e => {
    const b = e.target.closest("button.kb-k"); if (!b) return;
    if (b.dataset.c !== undefined) insert(b.dataset.c);
    const f = b.dataset.f;
    if (f === "hira") { kata = false; nums = false; render(); }
    if (f === "kata") { kata = true; nums = false; render(); }
    if (f === "nums") { nums = !nums; render(); }
    if (f === "daku" || f === "handaku" || f === "small") { conv(true); input.value = transformLast(input.value, f); }
    if (f === "del") { conv(true); input.value = [...input.value].slice(0, -1).join(""); }
    if (!matchMedia("(pointer: coarse)").matches) input.focus();
  });
  render();
  return { finalize: () => conv(true), setKata: k => { kata = k; render(); } };
}

// Javoblarni solishtirish uchun normallashtirish
export function normJP(s) {
  return String(s || "")
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/[\s　、。，．,.！？!?「」『』“”"'・\-－〜~…]/g, "")
    .replace(/[―‐]/g, "ー");
}
