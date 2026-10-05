'use strict';
/**
 * IPC 注册：渲染进程所有数据读写、文件对话框、剪贴板都从这里走。
 */
const { ipcMain, dialog, shell, clipboard, app, BrowserWindow } = require('electron');
const fs = require('fs');
const store = require('./store');
const parsers = require('./parsers');

const RESUME_FILTERS = [
  {
    name: '简历 / JD 文件',
    extensions: [
      'docx', 'doc', 'pdf', 'xlsx', 'xls', 'xlsm', 'csv', 'txt', 'md',
      'rtf', 'html', 'htm', 'xml', 'json', 'jpg', 'jpeg', 'png', 'webp', 'bmp'
    ]
  },
  { name: '所有文件', extensions: ['*'] }
];

function send(sender, channel, payload) {
  try {
    if (sender && !sender.isDestroyed()) sender.send(channel, payload);
  } catch (err) {
    /* ignore */
  }
}

function today() {
  const d = new Date();
  const p2 = (n) => (n < 10 ? '0' + n : String(n));
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}

function registerIpc() {
  /* ---------- 数据 ---------- */
  ipcMain.handle('data:load', () => store.load());

  ipcMain.handle('data:save', (e, data) => store.save(data));

  ipcMain.handle('data:path', () => ({
    dir: store.userDataDir(),
    file: store.dataFilePath()
  }));

  ipcMain.handle('data:export', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showSaveDialog(win, {
      title: '导出数据（另存一份 data.json）',
      buttonLabel: '导出',
      defaultPath: 'HR招聘数据_' + today() + '.json',
      filters: [
        { name: 'JSON 数据文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    return store.exportTo(r.filePath);
  });

  ipcMain.handle('data:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win, {
      title: '导入数据（会覆盖当前 data.json）',
      buttonLabel: '导入并覆盖',
      properties: ['openFile'],
      filters: [
        { name: 'JSON 数据文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (r.canceled || !r.filePaths.length) return { canceled: true };
    const res = store.importFrom(r.filePaths[0]);
    return Object.assign({ canceled: false, from: r.filePaths[0] }, res);
  });

  ipcMain.handle('data:openFolder', async () => {
    await shell.openPath(store.userDataDir());
    return true;
  });

  /* ---------- 简历文件解析 ---------- */
  ipcMain.handle('resume:pick', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win, {
      title: '选择简历文件（可多选）',
      buttonLabel: '导入',
      properties: ['openFile', 'multiSelections'],
      filters: RESUME_FILTERS
    });
    if (r.canceled || !r.filePaths.length) return { canceled: true, files: [] };
    const files = await parsers.parseMany(r.filePaths, (p) => send(e.sender, 'parse:progress', p));
    return { canceled: false, files };
  });

  ipcMain.handle('resume:parsePaths', async (e, paths) => {
    const list = (paths || []).filter(Boolean);
    if (!list.length) return [];
    return parsers.parseMany(list, (p) => send(e.sender, 'parse:progress', p));
  });

  /* ---------- 其它文件读写 ---------- */
  ipcMain.handle('file:saveText', async (e, opts) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const o = opts || {};
    const r = await dialog.showSaveDialog(win, {
      title: o.title || '保存文件',
      defaultPath: o.defaultPath || undefined,
      filters: o.filters || [{ name: '所有文件', extensions: ['*'] }]
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    const content = o.content == null ? '' : String(o.content);
    const data = o.bom
      ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(content, 'utf8')])
      : Buffer.from(content, 'utf8');
    fs.writeFileSync(r.filePath, data);
    return { canceled: false, path: r.filePath };
  });

  /* ---------- 大模型调用 ----------
     放到主进程里发请求，而不是渲染进程 fetch：
     渲染页面有 CSP（connect-src 白名单），且浏览器直连第三方接口会撞 CORS；
     走主进程后就只是一次普通的 Node 网络请求，不受这些限制。
     超时 30 秒；失败一律返回 { ok:false, error }，由界面层 toast 提示。 */
  ipcMain.handle('ai:chat', async (e, opts) => {
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
          : (err && err.message) || String(err);
      return { ok: false, error: msg };
    } finally {
      clearTimeout(timer);
    }
  });

  /* ---------- 系统集成 ---------- */
  ipcMain.handle('shell:openPath', async (e, p) => {
    if (!p) return false;
    await shell.openPath(p);
    return true;
  });

  ipcMain.handle('shell:showItem', (e, p) => {
    if (!p) return false;
    shell.showItemInFolder(p);
    return true;
  });

  ipcMain.handle('clipboard:write', (e, text) => {
    clipboard.writeText(String(text == null ? '' : text));
    return true;
  });

  ipcMain.handle('window:minimize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) win.minimize();
    return true;
  });

  ipcMain.handle('app:info', () => ({
    name: 'HR 招聘管理系统',
    version: app.getVersion(),
    userDataPath: store.userDataDir(),
    dataFilePath: store.dataFilePath(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: process.platform
  }));
}

module.exports = { registerIpc };