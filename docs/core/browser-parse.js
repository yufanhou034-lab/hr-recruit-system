/* 浏览器端文件解析（仅网页版使用；Electron 版由主进程 parsers.js 解析）
   解析库按需从 CDN 懒加载，依次尝试 jsDelivr → unpkg → npmmirror，提高国内可用性。 */
(function () {
  const HR = window.HR;

  const V = { mammoth: '1.8.0', pdfjs: '3.11.174', xlsx: '0.18.5', tesseract: '5.1.1' };

  const CDN = {
    mammoth: [
      'https://cdn.jsdelivr.net/npm/mammoth@' + V.mammoth + '/mammoth.browser.min.js',
      'https://unpkg.com/mammoth@' + V.mammoth + '/mammoth.browser.min.js',
      'https://registry.npmmirror.com/mammoth/' + V.mammoth + '/files/mammoth.browser.min.js'
    ],
    pdfjs: [
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + V.pdfjs + '/build/pdf.min.js',
      'https://unpkg.com/pdfjs-dist@' + V.pdfjs + '/build/pdf.min.js',
      'https://registry.npmmirror.com/pdfjs-dist/' + V.pdfjs + '/files/build/pdf.min.js'
    ],
    pdfWorker: [
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + V.pdfjs + '/build/pdf.worker.min.js',
      'https://unpkg.com/pdfjs-dist@' + V.pdfjs + '/build/pdf.worker.min.js',
      'https://registry.npmmirror.com/pdfjs-dist/' + V.pdfjs + '/files/build/pdf.worker.min.js'
    ],
    xlsx: [
      'https://cdn.jsdelivr.net/npm/xlsx@' + V.xlsx + '/dist/xlsx.full.min.js',
      'https://unpkg.com/xlsx@' + V.xlsx + '/dist/xlsx.full.min.js',
      'https://registry.npmmirror.com/xlsx/' + V.xlsx + '/files/dist/xlsx.full.min.js'
    ],
    tesseract: [
      'https://cdn.jsdelivr.net/npm/tesseract.js@' + V.tesseract + '/dist/tesseract.min.js',
      'https://unpkg.com/tesseract.js@' + V.tesseract + '/dist/tesseract.min.js',
      'https://registry.npmmirror.com/tesseract.js/' + V.tesseract + '/files/dist/tesseract.min.js'
    ]
  };

  let progressCb = null;

  function emit(payload) {
    if (progressCb) {
      try {
        progressCb(payload);
      } catch (err) {
        /* ignore */
      }
    }
  }

  const EXT_SHEET = ['xlsx', 'xlsm', 'xls', 'xlsb', 'ods'];
  const EXT_TEXT = ['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'log', 'text', 'srt', 'vtt'];
  const EXT_WEB = ['html', 'htm', 'xhtml', 'xml', 'mht', 'mhtml'];
  const EXT_IMG = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'avif'];

  function extOf(name) {
    const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function cjkCount(s) {
    const m = String(s || '').match(/[\u4e00-\u9fa5]/g);
    return m ? m.length : 0;
  }

  function latinCount(s) {
    const m = String(s || '').match(/[A-Za-z]{2,}/g);
    return m ? m.length : 0;
  }

  /* ---------------- CDN 懒加载 ---------------- */
  function loadScript(urls) {
    return new Promise((resolve, reject) => {
      let i = 0;
      const tryNext = () => {
        if (i >= urls.length) {
          reject(new Error('解析库加载失败，请检查网络后重试'));
          return;
        }
        const url = urls[i++];
        const s = document.createElement('script');
        s.src = url;
        s.onload = () => resolve();
        s.onerror = () => {
          s.remove();
          tryNext();
        };
        document.head.appendChild(s);
      };
      tryNext();
    });
  }

  async function ensureMammoth() {
    if (window.mammoth) return window.mammoth;
    await loadScript(CDN.mammoth);
    if (!window.mammoth) throw new Error('Word 解析库加载失败');
    return window.mammoth;
  }

  async function ensurePdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    await loadScript(CDN.pdfjs);
    if (!window.pdfjsLib) throw new Error('PDF 解析库加载失败');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker[0];
    return window.pdfjsLib;
  }

  async function ensureXlsx() {
    if (window.XLSX) return window.XLSX;
    await loadScript(CDN.xlsx);
    if (!window.XLSX) throw new Error('表格解析库加载失败');
    return window.XLSX;
  }

  async function ensureTesseract() {
    if (window.Tesseract) return window.Tesseract;
    await loadScript(CDN.tesseract);
    if (!window.Tesseract) throw new Error('OCR 组件加载失败');
    return window.Tesseract;
  }

  /* ---------------- 编码 / 二进制抢救 ---------------- */
  function dec(enc, buf) {
    try {
      return new TextDecoder(enc, { fatal: false }).decode(buf);
    } catch (err) {
      return null;
    }
  }

  function headHex(buf, n) {
    const b = new Uint8Array(buf, 0, Math.min(n || 8, buf.byteLength));
    return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  const isZip = (buf) => /^504b(0304|0506|0708)/.test(headHex(buf, 4));
  const isOle = (buf) => headHex(buf, 8) === 'd0cf11e0a1b11ae1';

  const COMMON =
    '的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感工组项目经历负责部经理主管职责范围教育学校专业学历本科硕士沟通协作团队能力熟练办公软件数据表格团队精神主动积极招聘渠道简历筛选面试安排入离职办理员工关系培训绩效薪酬社保公积金劳动合同时习岗位要求优先考虑时间地点城市公司行业经验职责任职';

  function commonRatio(s) {
    const chars = String(s || '').match(/[\u4e00-\u9fa5]/g) || [];
    if (chars.length < 4) return 0;
    let hit = 0;
    for (const c of chars) if (COMMON.indexOf(c) >= 0) hit++;
    return hit / chars.length;
  }

  function tidyBinary(source) {
    if (!source) return '';
    const keep =
      /[^\u4e00-\u9fa5\u3000-\u303f\u2014\u2018\u2019\u201c\u201d\u2026\uff01-\uff5e\uffe0-\uffe5A-Za-z0-9\r\n\t .,:;!?()\[\]{}@#&%+*/\\|"'\-_=<>~$^`]/g;
    const seen = new Set();
    const out = [];
    String(source)
      .replace(keep, '\n')
      .split('\n')
      .forEach((raw) => {
        const t = raw.replace(/\s+/g, ' ').trim();
        if (!t) return;
        const cj = cjkCount(t);
        const la = latinCount(t);
        const ok =
          la >= 2 ||
          (cj >= 3 && commonRatio(t) >= 0.3) ||
          (cj >= 1 && t.length <= 12 && commonRatio(t) >= 0.4);
        if (!ok) return;
        if (seen.has(t)) return;
        seen.add(t);
        out.push(t);
      });
    return out.join('\n');
  }

  function salvageBinary(buf) {
    const candidates = [dec('utf-16le', buf), dec('gbk', buf), dec('utf-8', buf)].filter(Boolean);
    let best = '';
    let bestScore = -Infinity;
    candidates.forEach((t) => {
      const bad = (t.match(/\uFFFD/g) || []).length;
      const score = cjkCount(t) * 2 + latinCount(t) * 3 - bad * 4;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    });
    return tidyBinary(best);
  }

  async function readTextSmart(file) {
    const buf = await file.arrayBuffer();
    const b = new Uint8Array(buf);
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return dec('utf-8', buf) || '';
    if (b[0] === 0xff && b[1] === 0xfe) return dec('utf-16le', buf) || '';
    if (b[0] === 0xfe && b[1] === 0xff) return dec('utf-16be', buf) || dec('utf-8', buf) || '';
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (err) {
      /* 不是纯 UTF-8，继续比对 */
    }
    const gbk = dec('gbk', buf);
    const utf = dec('utf-8', buf);
    const badRatio = (t) => (t ? (t.match(/\uFFFD/g) || []).length / t.length : 1);
    if (gbk && badRatio(gbk) <= badRatio(utf)) return gbk;
    return utf || gbk || '';
  }

  function stripRtf(source) {
    let t = String(source || '')
      .replace(/\\'([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\u(-?\d+)\s?\??/g, (m, d) => {
        let n = parseInt(d, 10);
        if (n < 0) n += 65536;
        return String.fromCharCode(n);
      })
      .replace(/\{\\\*[^{}]*\}/g, '')
      .replace(/\\par[d]?/g, '\n')
      .replace(/\\line/g, '\n')
      .replace(/\\tab/g, '\t')
      .replace(/\\sect\b[^\\]*/g, '\n')
      .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
      .replace(/[{}]/g, '');
    t = t.replace(/[\u0080-\u00ff]{2,}/g, (run) => {
      try {
        return new TextDecoder('gbk').decode(new Uint8Array([...run].map((c) => c.charCodeAt(0))));
      } catch (err) {
        return run;
      }
    });
    return t;
  }

  function stripHtml(source) {
    return String(source || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  /* ---------------- 各格式解析 ---------------- */
  async function parsePdf(buffer) {
    const pdfjs = await ensurePdfJs();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const parts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      parts.push(tc.items.map((it) => it.str).join(' '));
    }
    const text = parts.join('\n');
    if (cjkCount(text) < 20 && latinCount(text) < 10) {
      throw new Error('未提取到文字层，可能是扫描件/图片版 PDF，请改用图片上传或直接粘贴文字');
    }
    return text;
  }

  async function parseSheet(buffer) {
    const XLSX = await ensureXlsx();
    const wb = XLSX.read(buffer, { type: 'array' });
    const parts = [];
    (wb.SheetNames || []).forEach((name) => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
      if (csv && csv.trim()) parts.push('【工作表：' + name + '】\n' + csv.trim());
    });
    if (!parts.length) throw new Error('表格里没有可读内容');
    return parts.join('\n\n');
  }

  let ocrWorkerPromise = null;

  async function getOcrWorker() {
    if (ocrWorkerPromise) return ocrWorkerPromise;
    ocrWorkerPromise = (async () => {
      const T = await ensureTesseract();
      return T.createWorker('chi_sim+eng', 1, {
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        logger: (m) => {
          if (m && m.status) {
            emit({
              phase: 'progress',
              name: '',
              message: '图片识别中（' + m.status + (m.progress ? ' ' + Math.round(m.progress * 100) + '%' : '') + '）'
            });
          }
        }
      });
    })().catch((err) => {
      ocrWorkerPromise = null;
      throw err;
    });
    return ocrWorkerPromise;
  }

  async function parseImage(file) {
    emit({ phase: 'progress', name: file.name, message: '正在准备中文 OCR 模型（首次约 15–20MB，需联网）' });
    let worker;
    try {
      worker = await getOcrWorker();
    } catch (err) {
      throw new Error('OCR 组件初始化失败（首次使用需联网下载中文语言包）：' + (err.message || err));
    }
    const { data } = await worker.recognize(file);
    const text = (data && data.text) || '';
    if (cjkCount(text) < 10 && latinCount(text) < 5) {
      throw new Error('图片里没有识别到足够文字，建议换清晰截图或直接粘贴文字');
    }
    return text;
  }

  /** 解析单个 File 对象，返回 { text, note } */
  async function parseOne(file) {
    const ext = extOf(file.name);
    const mime = String(file.type || '').toLowerCase();
    const buffer = await file.arrayBuffer();

    if (EXT_IMG.indexOf(ext) >= 0 || mime.indexOf('image/') === 0) {
      return { text: await parseImage(file), note: 'OCR 识别' };
    }
    if (ext === 'pdf' || headHex(buffer, 4) === '25504446') {
      return { text: await parsePdf(buffer), note: '' };
    }
    if (EXT_SHEET.indexOf(ext) >= 0) return { text: await parseSheet(buffer), note: '' };

    if (ext === 'docx' || (ext === 'wps' && isZip(buffer))) {
      try {
        const mammoth = await ensureMammoth();
        const r = await mammoth.extractRawText({ arrayBuffer: buffer });
        if ((r.value || '').trim()) return { text: r.value, note: '' };
      } catch (err) {
        /* 落到通用分支 */
      }
    }
    if (ext === 'rtf' || String(dec('utf-8', buffer) || '').slice(0, 5) === '{\\rtf') {
      return { text: stripRtf(dec('latin1', buffer) || dec('utf-8', buffer) || ''), note: '' };
    }
    if (EXT_WEB.indexOf(ext) >= 0) {
      return { text: stripHtml(dec('utf-8', buffer) || dec('gbk', buffer) || ''), note: '' };
    }
    if (EXT_TEXT.indexOf(ext) >= 0 || mime.indexOf('text/') === 0) {
      return { text: await readTextSmart(file), note: '' };
    }
    if (ext === 'doc' || ext === 'wps' || isOle(buffer)) {
      const t = salvageBinary(buffer);
      if (t && t.trim().length > 20) return { text: t, note: '旧格式 .doc，已尽力提取，建议核对' };
      throw new Error('旧版 .doc 无法在浏览器里解析，请在 Word 中另存为 .docx 后重试');
    }
    if (ext === 'odt' || ext === 'odp' || ext === 'pptx') {
      throw new Error('暂不支持 ' + ext + ' 格式，请另存为 .docx 或 .pdf 后重试');
    }

    const asText = await readTextSmart(file).catch(() => null);
    if (asText && cjkCount(asText) + latinCount(asText) > 10) return { text: asText, note: '' };
    const salvaged = salvageBinary(buffer);
    if (salvaged && salvaged.trim()) return { text: salvaged, note: '未知格式，已尽力提取' };
    throw new Error('无法识别该格式，请改用 .docx / .pdf / .txt 或直接粘贴文字');
  }

  function cleanText(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** 批量解析 File 列表，返回与主进程一致的 [{name,text,note,error}] */
  async function parseFileList(fileList) {
    const files = [...fileList];
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      emit({ phase: 'start', index: i, total: files.length, name: f.name });
      try {
        const r = await parseOne(f);
        const text = cleanText(r.text);
        if (!text) throw new Error('未提取到文字内容');
        results.push({ name: f.name, text: text, note: r.note || '', error: '' });
      } catch (err) {
        results.push({ name: f.name, text: '', note: '', error: err.message || '解析失败' });
      }
      emit({ phase: 'done', index: i, total: files.length, name: f.name });
    }
    return results;
  }

  HR.browserParse = {
    parseFileList,
    setProgressHandler(fn) {
      progressCb = fn;
    }
  };
})();