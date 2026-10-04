'use strict';
/**
 * 数据持久化层
 * - 全部数据写入 app.getPath('userData')/data.json
 * - 每次写入都是「写临时文件 + 原子重命名」，避免中途崩溃把文件写坏
 * - 启动时确保文件存在，方便用户直接看到并复制备份
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_FILE = 'data.json';

let winStateStore = null;

function userDataDir() {
  return app.getPath('userData');
}

function dataFilePath() {
  return path.join(userDataDir(), DATA_FILE);
}

function emptyData() {
  return {
    candidates: [],
    jobs: [],
    applications: [],
    version: 1,
    updatedAt: new Date().toISOString()
  };
}

/** 缺字段/类型不对时补齐，保证渲染层拿到的结构一定可用 */
function normalize(input) {
  const out = emptyData();
  if (!input || typeof input !== 'object') return out;
  if (Array.isArray(input.candidates)) out.candidates = input.candidates;
  // 注意：这里是「白名单」——新增的数据字段必须在此登记，否则不会被写入 data.json
  if (Array.isArray(input.synonyms)) out.synonyms = input.synonyms;
  if (Array.isArray(input.jobs)) out.jobs = input.jobs;
  if (Array.isArray(input.applications)) out.applications = input.applications;
  if (typeof input.version === 'number') out.version = input.version;
  if (typeof input.updatedAt === 'string' && input.updatedAt) out.updatedAt = input.updatedAt;
  return out;
}

function writeFile(input) {
  const file = dataFilePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const payload = normalize(input);
  payload.version = 1;
  payload.updatedAt = new Date().toISOString();

  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return payload;
}

function readFile() {
  const file = dataFilePath();
  try {
    if (!fs.existsSync(file)) return emptyData();
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw || !raw.trim()) return emptyData();
    return normalize(JSON.parse(raw));
  } catch (err) {
    // 文件损坏时先备份，再重建空结构，避免静默丢数据
    try {
      fs.copyFileSync(file, file + '.broken-' + Date.now());
    } catch (e) {
      /* ignore */
    }
    return emptyData();
  }
}

/** 启动时调用：确保 data.json 一定存在 */
function ensureFile() {
  const file = dataFilePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) writeFile(emptyData());
  return file;
}

/* ---------- 滚动备份 ---------- */
const BACKUP_KEEP = 5;              // 最多保留最近 5 份
const BACKUP_MIN_GAP_MS = 3600000;  // 距上一份不足 1 小时则跳过，避免频繁重启刷屏

function backupDir() {
  return path.join(path.dirname(dataFilePath()), 'backups');
}

/**
 * 启动加载前先把现有 data.json 快照一份，最多保留最近 BACKUP_KEEP 份。
 * 目的是防止误删、写坏、断电导致的整库丢失（只有一个 data.json 时风险太高）。
 */
function rotateBackup() {
  const file = dataFilePath();
  try {
    if (!fs.existsSync(file)) return null;
    if (fs.statSync(file).size === 0) return null;

    const dir = backupDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const existing = fs.readdirSync(dir).filter((f) => /^data-\d{14}\.json$/.test(f)).sort();
    const newest = existing[existing.length - 1];
    if (newest) {
      const newestTime = fs.statSync(path.join(dir, newest)).mtimeMs;
      if (Date.now() - newestTime < BACKUP_MIN_GAP_MS) return null;
    }

    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const dest = path.join(dir, 'data-' + stamp + '.json');
    if (!fs.existsSync(dest)) fs.copyFileSync(file, dest);

    const files = fs.readdirSync(dir).filter((f) => /^data-\d{14}\.json$/.test(f)).sort();
    while (files.length > BACKUP_KEEP) {
      fs.unlinkSync(path.join(dir, files.shift()));
    }
    return dest;
  } catch (e) {
    return null;
  }
}

function load() {
  rotateBackup();
  return readFile();
}

function save(data) {
  const payload = writeFile(data);
  return { ok: true, path: dataFilePath(), updatedAt: payload.updatedAt };
}

/** 导出：把当前 data.json 内容写到用户选定的位置 */
function exportTo(destPath) {
  const data = readFile();
  const payload = Object.assign({}, data, { exportedAt: new Date().toISOString(), app: 'HR 招聘管理系统' });
  fs.writeFileSync(destPath, JSON.stringify(payload, null, 2), 'utf8');
  return { ok: true, path: destPath };
}

/** 导入：读取用户选择的 json 并覆盖 data.json */
function importFrom(srcPath) {
  const raw = fs.readFileSync(srcPath, 'utf8');
  const parsed = JSON.parse(raw);
  const payload = writeFile(parsed);
  return { ok: true, data: payload, path: dataFilePath() };
}

/** 窗口尺寸/位置用 electron-store 存（独立小文件，与业务数据分开） */
function winStore() {
  if (winStateStore) return winStateStore;
  const mod = require('electron-store');
  const Store = mod && mod.default ? mod.default : mod;
  winStateStore = new Store({ name: 'window-state', defaults: {} });
  return winStateStore;
}

function loadWindowState() {
  try {
    const s = winStore().store;
    return s && typeof s === 'object' ? s : {};
  } catch (err) {
    return {};
  }
}

function saveWindowState(state) {
  try {
    winStore().set(state || {});
  } catch (err) {
    /* 窗口状态保存失败不影响使用 */
  }
}

module.exports = {
  DATA_FILE,
  userDataDir,
  dataFilePath,
  emptyData,
  ensureFile,
  load,
  save,
  exportTo,
  importFrom,
  loadWindowState,
  saveWindowState
};