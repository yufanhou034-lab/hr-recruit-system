'use strict';
/**
 * 数据存储层：全部数据以 JSON 文件形式写入 app.getPath('userData')。
 * 不使用 SQLite / 数据库，启动时整体加载，修改后整体落盘。
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_FILE = 'hr-data.json';
const WINDOW_FILE = 'window-state.json';

function userDataDir() {
  return app.getPath('userData');
}

function dataFilePath() {
  return path.join(userDataDir(), DATA_FILE);
}

function windowFilePath() {
  return path.join(userDataDir(), WINDOW_FILE);
}

function emptyData() {
  return {
    version: 1,
    jobs: [],
    resumes: [],
    applications: [],
    updatedAt: new Date().toISOString()
  };
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    // 数据文件损坏时不阻塞启动，返回兜底数据
    return fallback;
  }
}

function writeJsonAtomic(file, obj) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function loadData() {
  const data = readJson(dataFilePath(), null);
  if (!data || typeof data !== 'object') return emptyData();
  const base = emptyData();
  if (!Array.isArray(data.jobs)) data.jobs = base.jobs;
  if (!Array.isArray(data.resumes)) data.resumes = base.resumes;
  if (!Array.isArray(data.applications)) data.applications = base.applications;
  data.version = 1;
  return data;
}

function saveData(data) {
  const payload = Object.assign({}, data || {}, {
    version: 1,
    updatedAt: new Date().toISOString()
  });
  writeJsonAtomic(dataFilePath(), payload);
  return { ok: true, path: dataFilePath(), updatedAt: payload.updatedAt };
}

function replaceData(data) {
  return saveData(data || emptyData());
}

function loadWindowState() {
  const s = readJson(windowFilePath(), {});
  return s && typeof s === 'object' ? s : {};
}

function saveWindowState(state) {
  try {
    writeJsonAtomic(windowFilePath(), state || {});
  } catch (err) {
    /* 窗口状态保存失败不影响使用 */
  }
}

module.exports = {
  userDataDir,
  dataFilePath,
  windowFilePath,
  emptyData,
  loadData,
  saveData,
  replaceData,
  loadWindowState,
  saveWindowState
};