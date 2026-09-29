'use strict';
/**
 * Node 端文件解析层：全部在本地完成，文件不上传。
 *  .docx  -> mammoth
 *  .pdf   -> pdf-parse
 *  .xlsx/.xls/.csv -> SheetJS(xlsx)
 *  .doc   -> textract（可选依赖，装不上时降级为二进制文本抢救 + 提示另存 docx）
 *  图片   -> tesseract.js（chi_sim+eng，中文语言包）
 *  文本类 -> 自动识别 UTF-8 / GBK / UTF-16
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const EXT_SHEET = ['xlsx', 'xlsm', 'xls', 'xlsb', 'ods'];
const EXT_TEXT = ['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'log', 'text', 'srt', 'vtt'];
const EXT_WEB = ['html', 'htm', 'xhtml', 'xml', 'mht', 'mhtml'];
const EXT_IMG = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'avif'];

function extOf(p) {
  const m = /\.([a-z0-9]+)$/i.exec(String(p || ''));
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

function badRatio(s) {
  if (!s) return 1;
  const bad = (String(s).match(/\uFFFD/g) || []).length;
  return bad / String(s).length;
}

/* ---------------- 文本编码识别 ---------------- */
function decodeBuffer(buf) {
  if (!buf || !buf.length) return '';
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString('utf8');
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString('utf16le');
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const copy = Buffer.from(buf.slice(2));
    copy.swap16();
    return copy.toString('utf16le');
  }
  const utf8 = buf.toString('utf8');
  const ratioUtf8 = badRatio(utf8);
  if (ratioUtf8 < 0.0005) return utf8;
  try {
    const iconv = require('iconv-lite');
    const gbk = iconv.decode(buf, 'gbk');
    if (badRatio(gbk) <= ratioUtf8) return gbk;
  } catch (err) {
    /* iconv-lite 不可用时退回 utf8 */
  }
  return utf8;
}

/* ---------------- Word / PDF / Excel ---------------- */
async function parseDocx(buffer) {
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function parsePdf(buffer) {
  // 直接引入 lib 内部实现，避免 pdf-parse 的调试入口在打包后读取测试文件
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const result = await pdfParse(buffer);
  const text = (result && result.text) || '';
  if (cjkCount(text) < 20 && latinCount(text) < 10) {
    throw new Error('未提取到文字层，可能是扫描件/图片版 PDF，请改用图片上传或直接粘贴文字');
  }
  return text;
}

function parseSheet(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const parts = [];
  (wb.SheetNames || []).forEach((name) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    if (csv && csv.trim()) parts.push('【工作表：' + name + '】\n' + csv.trim());
  });
  if (!parts.length) throw new Error('表格里没有可读内容');
  return parts.join('\n\n');
}

/* ---------------- RTF / HTML ---------------- */
function unescapeRtfBytes(run) {
  try {
    const iconv = require('iconv-lite');
    return iconv.decode(Buffer.from([...run].map((c) => c.charCodeAt(0))), 'gbk');
  } catch (err) {
    return run;
  }
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
  t = t.replace(/[\u0080-\u00ff]{2,}/g, unescapeRtfBytes);
  return t;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripHtml(source) {
  return decodeEntities(
    String(source || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  );
}

/* ---------------- 旧版 .doc / 未知二进制：文本抢救 ---------------- */
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

function salvageBinary(buffer) {
  const candidates = [];
  const utf16 = (() => {
    try {
      return buffer.toString('utf16le');
    } catch (err) {
      return '';
    }
  })();
  candidates.push(utf16);
  try {
    candidates.push(require('iconv-lite').decode(buffer, 'gbk'));
  } catch (err) {
    /* ignore */
  }
  candidates.push(buffer.toString('utf8'));
  let best = '';
  let bestScore = -Infinity;
  candidates.forEach((t) => {
    if (!t) return;
    const bad = (t.match(/\uFFFD/g) || []).length;
    const score = cjkCount(t) * 2 + latinCount(t) * 3 - bad * 4;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  });
  return tidyBinary(best);
}

async function parseLegacyDoc(filePath, buffer) {
  try {
    const textract = require('textract');
    const text = await new Promise((resolve, reject) => {
      textract.fromFileWithPath(filePath, (err, t) => (err ? reject(err) : resolve(t)));
    });
    if (text && text.trim()) return { text, note: 'textract 解析' };
  } catch (err) {
    /* textract/antiword 不可用，走降级方案 */
  }
  const salvaged = salvageBinary(buffer);
  if (salvaged && salvaged.trim().length > 20) {
    return { text: salvaged, note: '旧格式 .doc，已尽力提取，建议核对' };
  }
  throw new Error('旧版 .doc 无法解析（未安装 antiword/textract），请在 Word 中另存为 .docx 后重试');
}

/* ---------------- 图片 OCR ---------------- */
let ocrWorker = null;
let ocrWorkerPromise = null;

function ocrCachePath() {
  let base = '';
  try {
    base = require('electron').app.getPath('userData');
  } catch (err) {
    base = os.tmpdir();
  }
  const dir = path.join(base, 'tessdata-cache');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    /* ignore */
  }
  return dir;
}

async function getOcrWorker(onStatus) {
  if (ocrWorker) return ocrWorker;
  if (ocrWorkerPromise) return ocrWorkerPromise;
  ocrWorkerPromise = (async () => {
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('chi_sim+eng', 1, {
      cachePath: ocrCachePath(),
      logger: (m) => {
        if (onStatus && m && m.status) {
          const pct = m.progress ? ' ' + Math.round(m.progress * 100) + '%' : '';
          onStatus('图片识别中（' + m.status + pct + '）');
        }
      }
    });
    ocrWorker = worker;
    return worker;
  })().catch((err) => {
    ocrWorkerPromise = null;
    throw err;
  });
  return ocrWorkerPromise;
}

async function parseImage(filePath, onStatus) {
  if (onStatus) onStatus('正在准备中文 OCR 模型（首次需联网下载约 15–20MB）');
  let worker;
  try {
    worker = await getOcrWorker(onStatus);
  } catch (err) {
    throw new Error('OCR 组件初始化失败（首次使用需联网下载中文语言包）：' + (err.message || err));
  }
  const { data } = await worker.recognize(filePath);
  const text = (data && data.text) || '';
  if (cjkCount(text) < 10 && latinCount(text) < 5) {
    throw new Error('图片里没有识别到足够文字，建议换清晰截图或直接粘贴文字');
  }
  return text;
}

/* ---------------- 统一入口 ---------------- */
async function parseFile(filePath, onStatus) {
  const ext = extOf(filePath);
  const buffer = fs.readFileSync(filePath);
  const headHex = buffer.slice(0, 8).toString('hex');
  const isZip = /^504b(0304|0506|0708)/.test(headHex);
  const isOle = headHex === 'd0cf11e0a1b11ae1';

  if (EXT_IMG.indexOf(ext) >= 0) return { text: await parseImage(filePath, onStatus), note: 'OCR 识别' };
  if (ext === 'pdf' || headHex.indexOf('25504446') === 0) return { text: await parsePdf(buffer), note: '' };
  if (EXT_SHEET.indexOf(ext) >= 0) return { text: parseSheet(buffer), note: '' };
  if (isOle && (ext === 'xls' || ext === 'wps')) {
    try {
      return { text: parseSheet(buffer), note: '' };
    } catch (err) {
      /* 落到 .doc 抢救分支 */
    }
  }
  if (ext === 'docx' || (ext === 'wps' && isZip)) return { text: await parseDocx(buffer), note: '' };
  if (ext === 'rtf' || buffer.slice(0, 5).toString('latin1') === '{\\rtf') {
    return { text: stripRtf(buffer.toString('latin1')), note: '' };
  }
  if (EXT_WEB.indexOf(ext) >= 0) return { text: stripHtml(decodeBuffer(buffer)), note: '' };
  if (EXT_TEXT.indexOf(ext) >= 0) {
    return { text: decodeBuffer(buffer), note: '' };
  }
  if (ext === 'doc' || isOle) return await parseLegacyDoc(filePath, buffer);

  if (ext === 'odt' || ext === 'odp' || ext === 'pptx') {
    throw new Error('暂不支持 ' + ext + ' 格式，请在 Office/WPS 中另存为 .docx 或 .pdf 后重试');
  }

  const asText = decodeBuffer(buffer);
  if (cjkCount(asText) + latinCount(asText) > 10) return { text: asText, note: '' };
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

/**
 * 批量解析，逐个回报进度
 * @returns {Array<{path,name,text,note,error}>}
 */
async function parseMany(filePaths, onProgress) {
  const list = (filePaths || []).filter(Boolean);
  const results = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const name = path.basename(p);
    if (onProgress) onProgress({ phase: 'start', index: i, total: list.length, name });
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) throw new Error('暂不支持文件夹');
      const r = await parseFile(p, (msg) => {
        if (onProgress) onProgress({ phase: 'progress', name, message: msg });
      });
      const text = cleanText(r.text);
      if (!text) throw new Error('未提取到文字内容');
      results.push({ path: p, name, text, note: r.note || '', error: '' });
    } catch (err) {
      results.push({ path: p, name, text: '', note: '', error: err.message || '解析失败' });
    }
    if (onProgress) onProgress({ phase: 'done', index: i, total: list.length, name });
  }
  return results;
}

module.exports = {
  parseFile,
  parseMany,
  decodeBuffer,
  stripRtf,
  stripHtml,
  salvageBinary
};