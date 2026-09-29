'use strict';
/**
 * IPC 注册：渲染进程所有文件读写、系统对话框、剪贴板能力都从这里走。
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

function registerIpc() {
  ipcMain.handle('data:load', () => store.loadData());

  ipcMain.handle('data:save', (e, data) => store.saveData(data));

  ipcMain.handle('data:replace', (e, data) => store.replaceData(data));

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

  ipcMain.handle('file:openJson', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win, {
      title: '选择要导入的 JSON 数据文件',
      properties: ['openFile'],
      filters: [
        { name: 'JSON 数据文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (r.canceled || !r.filePaths.length) return { canceled: true };
    const p = r.filePaths[0];
    return { canceled: false, path: p, content: fs.readFileSync(p, 'utf8') };
  });

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
    userDataPath: app.getPath('userData'),
    dataFilePath: store.dataFilePath(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: process.platform
  }));
}

module.exports = { registerIpc };