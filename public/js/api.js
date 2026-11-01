// public/js/api.js — لایه‌ی ارتباط با سرور

async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    throw new Error(data?.error || `خطا در ارتباط با سرور (${res.status})`);
  }
  return data;
}

export const api = {
  state: () => request('GET', '/api/state'),

  saveProfile: (p) => request('PUT', '/api/profile', p),

  createCourse: (c) => request('POST', '/api/courses', c),
  updateCourse: (id, c) => request('PUT', `/api/courses/${id}`, c),
  deleteCourse: (id) => request('DELETE', `/api/courses/${id}`),

  createSession: (s) => request('POST', '/api/sessions', s),
  updateSession: (id, s) => request('PUT', `/api/sessions/${id}`, s),
  deleteSession: (id) => request('DELETE', `/api/sessions/${id}`),

  uploadBook: (formData, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/books');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data?.error || `خطا در آپلود (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('آپلود فایل ناموفق بود'));
      xhr.send(formData);
    }),

  addBookFromUrl: (payload) => request('POST', '/api/books/from-url', payload),
  getBook: (id) => request('GET', `/api/books/${id}`),
  deleteBook: (id) => request('DELETE', `/api/books/${id}`),
  updateChapters: (bookId, chapters) => request('PUT', `/api/books/${bookId}/chapters`, { chapters }),

  getChapter: (id) => request('GET', `/api/chapters/${id}`),
  makeSummary: (id, payload) => request('POST', `/api/chapters/${id}/summary`, payload),
  makeQuiz: (id, payload) => request('POST', `/api/chapters/${id}/quiz`, payload),
  makePptx: (id) => request('POST', `/api/chapters/${id}/pptx`),
  saveAttempt: (id, payload) => request('POST', `/api/chapters/${id}/attempt`, payload),
  checkShort: (id, given, answer) => request('POST', `/api/chapters/${id}/check-short`, { given, answer }),

  createExam: (e) => request('POST', '/api/exams', e),
  updateExam: (id, e) => request('PUT', `/api/exams/${id}`, e),
  deleteExam: (id) => request('DELETE', `/api/exams/${id}`),
  saveReminders: (r) => request('PUT', '/api/settings/reminders', r),

  saveAi: (cfg) => request('PUT', '/api/settings/ai', cfg),
  testAi: () => request('POST', '/api/settings/ai/test'),
};
