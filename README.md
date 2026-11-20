# Kanji Dojo

112 ta kanji (ユニット 1–10) ni yodlash va test qilish sayti.

**Sayt:** https://diyorbek4523.github.io/kanji/

- 4 xil savol turi (kanji → o'qilishi, o'qilishi → kanji, rasm → kanji, kanji → ma'no), 4–12 variant
- Unit tanlash, xatolar ustida ishlash, natijalar tarixi, reyting
- **Lug'at** (1–7 mavzu, 265 so'z): so'z → ma'no, ma'no → so'z, kanji → o'qilishi, klaviaturada yozib javob
- **Gaplar** (1–7 mavzu, 176 gap): tarjima (variantli va yozma), so'zlarni tartiblash, bo'sh joyni to'ldirish, har bir gap uchun grammatik izoh
- Ichki hiragana/katakana klaviatura (゛ ゜ 小, きゃ/きって kabi birikmalar) va lotin harflardan avtomatik kana
- Har kim o'z login-paroli bilan kiradi; admin panel

Yangi mavzu qo'shish: `vocab-data.js` (so'zlar) va `sentence-data.js` (grammatika va gaplar).

Texnik: GitHub Pages (sahifalar) + Firebase Auth va Firestore (login va natijalar).
Firestore xavfsizlik qoidalari — `firestore.rules`.
