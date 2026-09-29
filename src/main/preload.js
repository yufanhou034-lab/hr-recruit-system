'use strict';
/**
 * 预加载脚本：通过 contextBridge 暴露受控 API，渲染进程不开 nodeIntegration。
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const api = {
  __env: 'electron',

  // 数据
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  replaceData: (data) => ipcRenderer.invoke('data:replace', data),

  // 文件解析
  pickResumeFiles: () => ipcRenderer.invoke('resume:pick'),
  parsePaths: (paths) => ipcRenderer.invoke('resume:parsePaths', paths),

  // 拖拽进来的 File 对象 → 真实路径 → 主进程解析
  parseFiles: (files) => {
    const paths = [];
    const failed = [];
    for (const f of files || []) {
      const p = api.getPathForFile(f);
      if (p) paths.push(p);
      else failed.push({ name: (f && f.name) || '未知文件', text: '', note: '', error: '拿不到文件路径，请改用「导入文件」按钮' });
    }
    if (!paths.length) return Promise.resolve(failed);
    return ipcRenderer.invoke('resume:parsePaths', paths).then((list) => list.concat(failed));
  },

  // 系统对话框读写
  saveTextFile: (opts) => ipcRenderer.invoke('file:saveText', opts),
  openJsonFile: () => ipcRenderer.invoke('file:openJson'),

  // 系统集成
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  showItemInFolder: (p) => ipcRenderer.invoke('shell:showItem', p),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  getAppInfo: () => ipcRenderer.invoke('app:info'),

  // 拖拽文件取真实路径（Electron 32+ 移除了 File.path）
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file) || '';
      }
    } catch (err) {
      /* ignore */
    }
    return (file && file.path) || '';
  },

  // 解析进度
  onParseProgress: (cb) => {
    ipcRenderer.on('parse:progress', (e, payload) => {
      try {
        cb(payload);
      } catch (err) {
        /* ignore */
      }
    });
  },

  platform: process.platform
};

contextBridge.exposeInMainWorld('api', api);