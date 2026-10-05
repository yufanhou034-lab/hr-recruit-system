'use strict';
/**
 * 预加载脚本：通过 contextBridge 暴露受控 API，渲染进程不开 nodeIntegration。
 * 与网页版的 renderer/core/bridge-web.js 保持同一套接口，两个外壳共用同一份界面代码。
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const api = {
  __env: 'electron',

  /* ---------- 数据（userData/data.json） ---------- */
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  getDataPath: () => ipcRenderer.invoke('data:path'),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  openDataFolder: () => ipcRenderer.invoke('data:openFolder'),

  /* ---------- 简历文件解析 ---------- */
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

  /* ---------- 其它文件读写 ---------- */
  saveTextFile: (opts) => ipcRenderer.invoke('file:saveText', opts),

  /* ---------- 大模型调用（走主进程，避开 CSP / CORS） ---------- */
  aiChat: (opts) => ipcRenderer.invoke('ai:chat', opts),

  /* ---------- 系统集成 ---------- */
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