/* 浏览器适配层：把 Electron preload 暴露的 window.api 用浏览器能力等价实现。
   Electron 版会被 preload 注入 api，这里直接跳过；网页版则接管全部能力。
   数据存储在浏览器 IndexedDB（不支持时退回 localStorage），文件走系统下载。 */
(function () {
  if (window.api && typeof window.api.loadData === 'function') return;

  const DB_NAME = 'hr-recruit-web';
  const STORE = 'kv';
  const DATA_KEY = 'hr-data';
  const APP_VERSION = '1.0.0';

  /* ---------------- IndexedDB ---------------- */
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      let req;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch (err) {
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  function idbGet(key) {
    return openDb().then(
      (db) =>
        new Promise((resolve) => {
          if (!db) {
            resolve(null);
            return;
          }
          try {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
            req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
            req.onerror = () => resolve(null);
          } catch (err) {
            resolve(null);
          }
        })
    );
  }

  function idbPut(key, value) {
    return openDb().then(
      (db) =>
        new Promise((resolve) => {
          if (!db) {
            resolve(false);
            return;
          }
          try {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(value, key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
          } catch (err) {
            resolve(false);
          }
        })
    );
  }

  async function kvGet(key) {
    const v = await idbGet(key);
    if (v !== null) return v;
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  async function kvPut(key, value) {
    const ok = await idbPut(key, value);
    if (!ok) {
      try {
        window.localStorage.setItem(key, value);
      } catch (err) {
        /* 容量不足时忽略 */
      }
    }
    return true;
  }

  /* ---------------- 文件选择 ---------------- */
  const ACCEPT =
    '.docx,.doc,.pdf,.xlsx,.xls,.xlsm,.csv,.txt,.md,.rtf,.html,.htm,.xml,.json,' +
    '.jpg,.jpeg,.png,.webp,.bmp,.gif,.tif,.tiff';

  function pickWithInput(options) {
    const o = options || {};
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = o.accept || ACCEPT;
      if (o.multiple) input.multiple = true;
      input.style.display = 'none';
      document.body.appendChild(input);

      let changeFired = false;
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        input.remove();
        resolve(v);
      };

      input.addEventListener('change', () => {
        changeFired = true;
        const files = [...(input.files || [])];
        if (!files.length) {
          finish({ canceled: true, files: [] });
          return;
        }
        if (o.readText) {
          const reader = new FileReader();
          reader.onload = () => finish({ canceled: false, path: files[0].name, content: String(reader.result || '') });
          reader.onerror = () => finish({ canceled: true, files: [] });
          reader.readAsText(files[0]);
          return;
        }
        Promise.resolve(window.HR.browserParse.parseFileList(files)).then(
          (parsed) => finish({ canceled: false, files: parsed }),
          (err) => finish({ canceled: false, files: files.map((f) => ({ name: f.name, text: '', note: '', error: err.message || '解析失败' })) })
        );
      });

      // 浏览器无法直接感知取消，用窗口重新聚焦兜底
      window.addEventListener(
        'focus',
        () => {
          setTimeout(() => {
            if (!changeFired) finish({ canceled: true, files: [] });
          }, 600);
        },
        { once: true }
      );

      input.click();
    });
  }

  /* ---------------- 下载 ---------------- */
  function downloadText(opts) {
    const o = opts || {};
    const name = o.defaultPath || '导出文件_' + Date.now() + '.txt';
    const body = String(o.content == null ? '' : o.content);
    const content = o.bom ? '\uFEFF' + body : body;
    const mime = /\.csv$/i.test(name)
      ? 'text/csv;charset=utf-8'
      : /\.json$/i.test(name)
        ? 'application/json;charset=utf-8'
        : 'text/plain;charset=utf-8';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return Promise.resolve({ canceled: false, path: name + '（已下载到浏览器下载目录）' });
  }

  /* ---------------- clipboard ---------------- */
  async function copyText(text) {
    const t = String(text == null ? '' : text);
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  /* ---------------- 对外 API（与 preload 保持一致） ---------------- */
  window.api = {
    __env: 'web',

    loadData: async () => {
      const raw = await kvGet(DATA_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (err) {
        return null;
      }
    },

    saveData: async (data) => {
      await kvPut(DATA_KEY, JSON.stringify(data || {}));
      return { ok: true, path: '浏览器本地存储（IndexedDB）' };
    },

    replaceData: async (data) => window.api.saveData(data),

    pickResumeFiles: () => pickWithInput({ multiple: true }),

    parsePaths: () => Promise.resolve([]),

    parseFiles: (files) => window.HR.browserParse.parseFileList(files || []),

    saveTextFile: (opts) => downloadText(opts),

    /* 网页版没有主进程，只能直连接口。若对方未开放 CORS，浏览器会拦截，
       此时返回明确错误提示，而不是静默失败。 */
    aiChat: async (opts) => {
      const o = opts || {};
      const base = String(o.baseUrl || '').trim().replace(/\/+$/, '');
      if (!base) return { ok: false, error: '未配置 API Base URL' };
      if (!o.apiKey) return { ok: false, error: '未配置 API Key' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const payload = {
          model: o.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: String(o.system || '') },
            { role: 'user', content: String(o.user || '') }
          ],
          temperature: o.temperature == null ? 0.2 : o.temperature
        };
        if (o.jsonMode) payload.response_format = { type: 'json_object' };
        const res = await fetch(base + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + o.apiKey },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        const raw = await res.text();
        let data = null;
        try {
          data = JSON.parse(raw);
        } catch (err) {
          data = null;
        }
        if (!res.ok) {
          const msg =
            (data && data.error && (data.error.message || data.error.code)) ||
            (raw ? raw.slice(0, 200) : 'HTTP ' + res.status);
          return { ok: false, error: String(msg) };
        }
        const content =
          data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!content) return { ok: false, error: '接口返回内容为空' };
        return { ok: true, text: String(content) };
      } catch (err) {
        const msg =
          err && err.name === 'AbortError'
            ? '请求超时（30 秒未响应）'
            : (err && err.message) || '请求失败（可能是对方接口未开放跨域 CORS）';
        return { ok: false, error: msg };
      } finally {
        clearTimeout(timer);
      }
    },

    getDataPath: () => Promise.resolve({ dir: '浏览器本地存储', file: 'IndexedDB · ' + DB_NAME }),

    exportData: async () => {
      let data = window.HR.data.raw;
      const raw = await kvGet(DATA_KEY);
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch (err) {
          /* 用内存里的数据兜底 */
        }
      }
      return downloadText({
        defaultPath: 'HR招聘数据_' + new Date().toISOString().slice(0, 10) + '.json',
        content: JSON.stringify(
          Object.assign({}, data, { exportedAt: new Date().toISOString(), app: 'HR 招聘管理系统' }),
          null,
          2
        )
      });
    },

    importData: () =>
      new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.style.display = 'none';
        document.body.appendChild(input);

        let changeFired = false;
        let done = false;
        const finish = (v) => {
          if (done) return;
          done = true;
          input.remove();
          resolve(v);
        };

        input.addEventListener('change', () => {
          changeFired = true;
          const f = input.files && input.files[0];
          if (!f) {
            finish({ canceled: true });
            return;
          }
          const reader = new FileReader();
          reader.onload = async () => {
            let parsed;
            try {
              parsed = JSON.parse(String(reader.result || ''));
            } catch (err) {
              finish({ canceled: false, error: 'invalid-json', from: f.name });
              return;
            }
            if (!parsed || typeof parsed !== 'object') {
              finish({ canceled: false, error: 'invalid-json', from: f.name });
              return;
            }
            await kvPut(DATA_KEY, JSON.stringify(parsed));
            finish({ canceled: false, from: f.name, data: parsed });
          };
          reader.onerror = () => finish({ canceled: false, error: 'read-error', from: f.name });
          reader.readAsText(f);
        });

        window.addEventListener(
          'focus',
          () => {
            setTimeout(() => {
              if (!changeFired) finish({ canceled: true });
            }, 600);
          },
          { once: true }
        );

        input.click();
      }),

    openDataFolder: () => Promise.resolve(false),

    openPath: () => Promise.resolve(false),
    showItemInFolder: () => Promise.resolve(false),
    minimizeWindow: () => Promise.resolve(false),

    copyText: copyText,

    getAppInfo: () => Promise.resolve({
      name: 'HR 招聘管理系统',
      version: APP_VERSION + '（网页版）',
      userDataPath: '浏览器本地存储（IndexedDB）',
      dataFilePath: '浏览器本地存储 · 当前浏览器 · ' + DB_NAME,
      electron: '—',
      node: '—',
      chrome: (navigator.userAgent.match(/(?:Chrome|Edg)\/[\d.]+/) || ['浏览器'])[0],
      platform: 'web'
    }),

    getPathForFile: () => '',

    onParseProgress: (cb) => {
      if (window.HR.browserParse) window.HR.browserParse.setProgressHandler(cb);
    }
  };
})();