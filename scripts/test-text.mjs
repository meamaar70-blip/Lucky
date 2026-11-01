// scripts/test-text.mjs — آزمون کوچک نرمال‌سازی متن فارسی (بدون وابستگی)
// اجرا: node scripts/test-text.mjs

import { normalize, normalizePdfText, fixLamAlef, sentences, words } from '../server/lib/persian.js';

let pass = 0;
const fails = [];

function eq(actual, expected, label) {
  if (actual === expected) pass += 1;
  else fails.push(`${label}: انتظار «${expected}» ولی «${actual}»`);
}

/* ترکیب «لا» در PDF */
eq(fixLamAlef('معموال'), 'معمولا', 'معموال');
eq(fixLamAlef('باالتر'), 'بالاتر', 'باالتر');
eq(fixLamAlef('اطالعات'), 'اطلاعات', 'اطالعات');
eq(fixLamAlef('کامال'), 'کاملا', 'کامال');
eq(fixLamAlef('اعالم'), 'اعلام', 'اعالم');
eq(fixLamAlef('الزم'), 'لازم', 'الزم');

/* کلمه‌های درست نباید دست بخورند */
for (const w of ['فعال', 'کامل', 'سلام', 'سلامت', 'البته', 'پرونده', 'مثال', 'مالک', 'سالم']) {
  eq(fixLamAlef(w), w, `دست‌نخوردن ${w}`);
}

/* نرمال‌سازی عمومی */
eq(normalize('يک  كتاب'), 'یک کتاب', 'ي/ك عربی');
eq(normalize('  متن   با   فاصله  '), 'متن با فاصله', 'فاصله‌های تکراری');
eq(normalize('۱۲۳'), '123', 'ارقام فارسی');
eq(normalizePdfText('ﻣﻌﻤﻮال'), 'معمولا', 'حروف ارائه (presentation forms)');

/* جمله‌بندی */
// جمله‌های کوتاه‌تر از چهار کلمه عمداً حذف می‌شوند (نویز متن PDF)
const sents = sentences('این جملهٔ اول برای آزمون است. این جملهٔ دوم هم برای آزمون است! آیا این جملهٔ سوم هم می‌ماند؟');
eq(String(sents.length), '3', 'تعداد جمله‌ها');
eq(words('سلام دنیا').length, 2, 'تعداد کلمه');

console.log(`✓ ${pass} آزمون موفق`);
if (fails.length) {
  console.log('✗ ناموفق:');
  fails.forEach((f) => console.log('   ', f));
  process.exit(1);
}
