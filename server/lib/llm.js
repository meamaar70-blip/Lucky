// server/lib/llm.js
// اتصال اختیاری به هر سرویس سازگار با OpenAI (OpenAI, OpenRouter, Groq, Ollama, ...)
// اگر تنظیم نشده باشد، همه‌چیز با موتور محلی انجام می‌شود.

const TIMEOUT_MS = 90_000;

function endpoint(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  if (/\/chat\/completions$/.test(base)) return base;
  if (/\/v1$/.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

async function chat(ai, messages, { json = false, temperature = 0.3, maxTokens = 2400 } = {}) {
  const url = endpoint(ai.baseUrl);
  if (!url || !ai.apiKey) throw new Error('اتصال هوش مصنوعی تنظیم نشده است');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify({
        model: ai.model,
        temperature,
        max_tokens: maxTokens,
        messages,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`سرویس هوش مصنوعی خطا داد (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('پاسخ خالی از سرویس هوش مصنوعی');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(content) {
  const trimmed = String(content).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('پاسخ JSON معتبر نبود');
  }
}

const SYSTEM = `تو یک دستیار تحصیلی فارسی‌زبان دقیق و خوش‌بیان هستی.
فقط بر اساس متن ارائه‌شده از کتاب کار می‌کنی و چیزی از خودت اضافه نمی‌کنی.
همیشه فارسی روان و ساده می‌نویسی و پاسخ را فقط در قالب JSON خواسته‌شده برمی‌گردانی.`;

export async function testConnection(ai) {
  const content = await chat(
    ai,
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: 'فقط این JSON را برگردان: {"ok":true,"message":"سلام"}' },
    ],
    { json: true, maxTokens: 100 },
  );
  return parseJson(content);
}

export async function llmSummary(ai, { chapterTitle, courseTitle, text, depth = 'medium' }) {
  const depthMap = {
    short: 'حداکثر ۱۲۰ کلمه، فقط مهم‌ترین نکات',
    medium: 'حدود ۲۵۰ کلمه با ساختار منطقی',
    long: 'حدود ۵۰۰ کلمه، جامع و بخش‌بندی‌شده',
  };
  const content = await chat(
    ai,
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `متن فصل «${chapterTitle}» از کتاب «${courseTitle}»:
"""
${text.slice(0, 18000)}
"""

خلاصه‌ای از این فصل بساز با این شرایط: ${depthMap[depth] ?? depthMap.medium}
پاسخ را دقیقاً در این ساختار JSON بده:
{
  "paragraph": "خلاصه پیوسته در یک یا دو پاراگراف",
  "sections": [{"title": "عنوان بخش", "body": "توضیح ۲ تا ۵ جمله‌ای"}],
  "keyPoints": [{"text": "نکته کلیدی در یک جمله"}],
  "terms": [{"term": "اصطلاح", "definition": "تعریف کوتاه بر اساس متن"}]
}
تعداد sections بین ۳ تا ۶، keyPoints بین ۵ تا ۱۰ و terms بین ۵ تا ۱۰ باشد.`,
      },
    ],
    { json: true, maxTokens: 3000 },
  );
  const data = parseJson(content);
  return {
    title: chapterTitle,
    depth,
    paragraph: String(data.paragraph ?? '').trim(),
    keyPoints: (data.keyPoints ?? []).map((p) => ({ text: String(p.text ?? p).trim() })).filter((p) => p.text),
    terms: (data.terms ?? []).map((t) => ({
      term: String(t.term ?? '').trim(),
      context: String(t.definition ?? t.context ?? '').trim(),
    })).filter((t) => t.term),
    sections: (data.sections ?? []).map((s) => ({
      title: String(s.title ?? '').trim(),
      body: String(s.body ?? '').trim(),
    })).filter((s) => s.title && s.body),
    engine: 'ai',
  };
}

export async function llmQuiz(ai, { chapterTitle, text, count = 10 }) {
  const content = await chat(
    ai,
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `از متن زیر برای فصل «${chapterTitle}» دقیقاً ${count} سؤال تستی بساز.
متن:
"""
${text.slice(0, 16000)}
"""
ترکیب سؤال‌ها: حدود ۶۰٪ چهارگزینه‌ای، ۲۰٪ درست/نادرست، ۲۰٪ پاسخ کوتاه. سؤال‌ها فقط از مطالب همین متن باشند و پاسخ صریح داشته باشند.
ساختار JSON:
{
  "questions": [
    {
      "type": "mcq" | "tf" | "short",
      "statement": "متن سؤال یا صورت جای خالی",
      "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
      "answerIndex": 0,
      "answer": "پاسخ درست (برای tf: درست یا نادرست)",
      "explanation": "توضیح کوتاه بر اساس متن",
      "difficulty": "آسان" | "متوسط" | "سخت"
    }
  ]
}
برای tf گزینه‌ها ["درست","نادرست"] باشد و answerIndex 0 یا 1. برای short گزینه‌ها را نگذار.`,
      },
    ],
    { json: true, maxTokens: 4000 },
  );
  const data = parseJson(content);
  const questions = (data.questions ?? [])
    .map((q, i) => {
      const type = ['mcq', 'tf', 'short'].includes(q.type) ? q.type : 'mcq';
      let options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : [];
      let answerIndex = Number.isInteger(q.answerIndex) ? q.answerIndex : -1;
      let answer = String(q.answer ?? (options[answerIndex] || '')).trim();
      if (type === 'tf') {
        options = ['درست', 'نادرست'];
        answerIndex = /نادرست|غلط|false/i.test(answer) ? 1 : 0;
        answer = options[answerIndex];
      }
      if (type !== 'short' && (answerIndex < 0 || answerIndex >= options.length)) {
        const idx = options.findIndex((o) => o === answer);
        answerIndex = idx >= 0 ? idx : 0;
      }
      return {
        id: `q${i + 1}`,
        type,
        prompt:
          type === 'tf'
            ? 'این جمله را با توجه به متن درس بسنجید:'
            : type === 'short'
              ? 'به این پرسش پاسخ کوتاه بدهید:'
              : 'گزینه‌ی درست را انتخاب کنید:',
        statement: String(q.statement ?? '').trim(),
        ...(type === 'short' ? {} : { options, answerIndex }),
        answer,
        explanation: String(q.explanation ?? '').trim(),
        difficulty: ['آسان', 'متوسط', 'سخت'].includes(q.difficulty) ? q.difficulty : 'متوسط',
      };
    })
    .filter((q) => q.statement && (q.type === 'short' || q.answer));
  if (!questions.length) throw new Error('سؤالی تولید نشد');
  return {
    questions,
    meta: {
      count: questions.length,
      mcq: questions.filter((q) => q.type === 'mcq').length,
      tf: questions.filter((q) => q.type === 'tf').length,
      short: questions.filter((q) => q.type === 'short').length,
      engine: 'ai',
    },
  };
}
