// server/lib/persian.js
// ابزارهای پایه‌ی متن فارسی: نرمال‌سازی، توکن‌سازی، تشخیص جمله، ارقام

const DIGIT_MAP = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

const CHAR_MAP = {
  'ي': 'ی', 'ى': 'ی', 'ﻯ': 'ی', 'ﻰ': 'ی',
  'ك': 'ک', 'ﻙ': 'ک', 'ﻚ': 'ک',
  'ة': 'ه', 'ۀ': 'ه', 'ﻩ': 'ه', 'ﻪ': 'ه',
  'أ': 'ا', 'إ': 'ا', 'ٱ': 'ا', 'آ': 'آ', 'ٲ': 'آ',
  'ؤ': 'و', 'ئ': 'ی',
  '\u0640': '',      // کشیده (tatweel)
  '\u200f': '', '\u200e': '', '\u202a': '', '\u202b': '', '\u202c': '', // کنترل جهت
  '\u00a0': ' ',
  '“': '"', '”': '"', '«': '"', '»': '"',
  '﷼': 'ریال',
};

/** ارقام لاتین را به فارسی تبدیل می‌کند (برای نمایش) */
export function toFaDigits(input) {
  return String(input ?? '').replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

/** ارقام فارسی/عربی را به لاتین تبدیل می‌کند (برای محاسبه) */
export function toEnDigits(input) {
  return String(input ?? '').replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] ?? d);
}

/** نرمال‌سازی کامل برای تحلیل متن */
export function normalize(input) {
  if (!input) return '';
  let s = String(input);
  // حذف اعراب
  s = s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
  // یکسان‌سازی حروف
  s = s.replace(/[^\u0000-\u007F]/g, (ch) => CHAR_MAP[ch] ?? ch);
  s = toEnDigits(s);
  // فاصله‌های تکراری
  s = s.replace(/[ \t]+/g, ' ');
  return s.trim();
}

/**
 * نرمال‌سازی مخصوص استخراج متن PDF.
 * در PDF های فارسی گاهی حروف به شکل «ارائه» (presentation forms) ذخیره می‌شوند.
 */
export function normalizePdfText(input) {
  let s = String(input ?? '');
  s = s.replace(/[\uFB50-\uFDFF\uFE70-\uFEFF]/g, (ch) => {
    // NFKC ارائۀ تک‌حرفی را به حرف پایه تبدیل می‌کند
    try { return ch.normalize('NFKC'); } catch { return ch; }
  });
  s = normalize(s);
  // در متن PDF گاهی کلمات به هم چسبیده‌اند؛ بین حروف فارسی و لاتین فاصله اصلاح نمی‌شود
  return s;
}

/** توکن‌های کلمه‌ای (با پشتیبانی نیم‌فاصله) */
export function words(text) {
  const s = normalize(text).toLowerCase();
  return s.match(/[\p{L}\p{N}\u200c]+/gu) ?? [];
}

const STOPWORDS = new Set(`و در به از که این را با است برای آن یک تا هم نیز بر اما یا اگر هر باید شود شد شده میکند میکنیم میکند میکند کرد کردن بود بودن دارد داشت داشتن داشتند داریم دارید دارم داری دار داری
ما شما او آنها ایشان من تو وی خود خویش همه هیچ برخی دیگر دیگران بایست بتوان
چه کدام کجا چرا چگونه کی کدامیک آیا البته بله خیر
بعد قبل بین روی زیر بالا پایین پیش پس هنگام زمانی زمان دوره مدت
چون چونکه زیرا بنابراین پس بنابراین ضمن ضمن آنکه اگرچه گرچه بلکه ولی اما
مثل مانند همان همین همانطور طور طریق طریقۀ مورد باب زمینه رابطه نسبت
دو سه چهار پنج شش هفت هشت نه ده صد هزار میلیون میلیارد اول دوم سوم چهارم پنجم ششم
نیست نیستند نبود نباشند میتوان میتوانند میتوانیم میتوانید میتواند بتواند
شوند میشود میشوند شوند بشود بکند بکنند بدهد بدهند
+ - = % / \\ * ( ) [ ] { } < > , . ; : ! ? « » " ' \` ~ @ # $ ^ & | _ …
۱ ۱ ۲ ۳ ۴ ۵ ۶ ۷ ۸ ۹ ۰ 0 1 2 3 4 5 6 7 8 9
صفحه فصل بخش شکل جدول نمودار مثال تمرین پرسش پرسش‌های پاسخ کتاب نویسنده مترجم انتشارات چاپ ویراست ناشر
که‌ها های هایی هایش ها تر ترین آنها آنان همین همچنین همچنین علاوه بلکه چنان چنانکه چنین
الف ب پ ت ث ج چ ح خ د ذ ر ز ژ س ش ص ض ط ظ ع غ ف ق ک گ ل م ن و ه ی
است. ست اند ایم اید
will the and of to in a an is are was were be been being this that these those for with as by on at from or it its not no than then then there their they we you i he she his her our your
about into over under more most such can could may might should would do does did done have has had having
ازها داده داده‌اند گرفت گرفته گیرد گیرند آید آیند آورد آوردند ساخت ساختند
یک‌سری سری تعدادی مجموعه گروه نوع انواع گونه حالت حالتی
`.split(/\s+/).filter(Boolean));

export function isStopword(w) {
  return STOPWORDS.has(w);
}

// فعل‌های سبک و پرتکرار که به‌تنهایی «اصطلاح» نیستند
const LIGHT_VERB_RE = new RegExp(
  '^(می|نمی)?[\u200c]?(شود|شوند|شد|شدند|کند|کنند|کرد|کردند|دهد|دهند|داد|دادند|' +
  'باشد|باشند|بود|بودند|دارد|دارند|داشت|داشتند|یابد|یابند|آید|آیند|گردد|گردند|' +
  'رود|روند|خورد|خورند|زد|زدند|بندد|نماید|نمایند|کرده|شده|داده|گرفته|یافته|داشته)$',
);

export function isLightVerb(w) {
  return LIGHT_VERB_RE.test(w);
}

const HEADING_LINE_RE = /^\s*(فصل|بخش|گفتار|درس|واحد|پیوست|ضمیمه|مقدمه|پیش‌گفتار|کتاب‌نامه|واژه‌نامه|chapter|part|unit|section|appendix|introduction|preface)(?=\s|$)/iu;

/** شکستن یک بلوک متنی به جمله‌ها */
function splitSentences(block) {
  const raw = block.split(/(?<=[.؟!?])\s+|(?<=[؛;])\s+/g);
  const out = [];
  for (const chunk of raw) {
    let s = chunk.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    // اگر جمله‌ی بلندی باقی ماند، از محل کاما بشکن
    while (words(s).length > 70) {
      const parts = s.split(/(?<=،)\s+/);
      let buf = '';
      let cut = false;
      for (const p of parts) {
        if (!cut && buf && words(`${buf} ${p}`).length > 45) {
          out.push(buf.trim());
          buf = p;
          cut = true;
        } else buf = buf ? `${buf} ${p}` : p;
      }
      if (buf === s) break;
      s = buf;
    }
    if (words(s).length >= 4) out.push(s);
  }
  return out;
}

const SENT_END = /[.؟!?]\s*$/;

/**
 * جمله‌های متن همراه با شماره‌ی صفحه و نشانه‌ی عنوان.
 * خط‌های نیمه‌کاره‌ی PDF (شکستن سطر و شکستن صفحه) به هم چسبانده می‌شوند.
 * @returns {{text:string, page:number|null, heading?:boolean}[]}
 */
export function sentencesWithPages(text) {
  const norm = normalizePdfText(String(text ?? '')).replace(/\r/g, '');
  const chunks = norm.split(/\[\[\s*صفحه\s*([0-9۰-۹]+)\s*\]\]/g);

  const pages = [];
  for (let i = 0; i < chunks.length; i += 2) {
    const page = i > 0 ? Number(toEnDigits(chunks[i - 1])) || null : null;
    pages.push({ page, body: chunks[i] });
  }

  const out = [];
  let carry = '';
  let carryPage = null;

  for (const { page, body } of pages) {
    const lines = body.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!lines.length) continue;
    if (carry) {
      lines[0] = `${carry} ${lines[0]}`;
      carry = '';
    }

    let buf = '';
    const blocks = [];
    for (const line of lines) {
      const headingLike = HEADING_LINE_RE.test(line) && words(line).length <= 14;
      if (headingLike) {
        if (buf) { blocks.push({ text: buf }); buf = ''; }
        blocks.push({ text: line, heading: true });
        continue;
      }
      buf = buf ? `${buf} ${line}` : line;
      if (SENT_END.test(line)) {
        blocks.push({ text: buf });
        buf = '';
      }
    }
    if (buf) {
      if (SENT_END.test(buf)) blocks.push({ text: buf });
      else { carry = buf; carryPage = page; }
    }

    const blockPage = page ?? carryPage;
    for (const b of blocks) {
      if (b.heading) {
        out.push({ text: b.text, page: blockPage, heading: true });
        continue;
      }
      for (const s of splitSentences(b.text)) out.push({ text: s, page: blockPage });
    }
  }

  if (carry) {
    for (const s of splitSentences(carry)) out.push({ text: s, page: carryPage });
  }
  return out;
}

/** جمله‌بندی متن فارسی (بدون شماره صفحه) */
export function sentences(text) {
  return sentencesWithPages(text).map((s) => s.text);
}

export function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export function truncate(str, n = 120) {
  const s = String(str ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
