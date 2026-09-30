'use strict';
/**
 * 主进程入口
 *  - 1280×800 主窗口，最小 1024×640，记住上次窗口大小和位置
 *  - 关闭按钮 → 最小化到系统托盘（右键托盘：打开主窗口 / 退出）
 *  - 数据持久化交给 lib/store.js（userData/data.json）
 */
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, dialog } = require('electron');
const path = require('path');
const store = require('./lib/store');
const { registerIpc } = require('./lib/ipc');
const { createTrayIconPng } = require('./lib/icon');

const APP_NAME = 'HR招聘管理系统';

// 固定应用名与数据目录：保证「开发模式」和「打包后」写到同一个 userData，
// 否则两者可能解析出不同的默认目录，看起来就像"数据没保存"。
app.setName(APP_NAME);
app.setPath('userData', path.join(app.getPath('appData'), APP_NAME));

let mainWindow = null;
let tray = null;
let isQuitting = false;
let trayTipShown = false;
let boundsTimer = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
  app.whenReady().then(onReady);
}

app.on('window-all-closed', () => {
  // 关闭窗口时缩到托盘，不退出应用
});

app.on('before-quit', () => {
  isQuitting = true;
  saveWindowState();
});

app.on('activate', () => showMainWindow());

function onReady() {
  app.setAppUserModelId('com.hrtools.recruit');

  // 启动即确保 data.json 存在，并打印路径，方便排查数据位置
  try {
    const file = store.ensureFile();
    console.log('[data] ' + file);
  } catch (err) {
    dialog.showErrorBox('数据目录不可用', '无法创建数据文件：\n' + (err.message || err));
  }

  registerIpc();
  createWindow();
  createTray();
}

function loadBounds() {
  const s = store.loadWindowState() || {};
  const b = { width: 1280, height: 800 };
  if (Number.isFinite(s.width) && s.width >= 1024) b.width = s.width;
  if (Number.isFinite(s.height) && s.height >= 640) b.height = s.height;
  if (Number.isFinite(s.x) && Number.isFinite(s.y)) {
    const cand = { x: s.x, y: s.y, width: b.width, height: b.height };
    if (isOnScreen(cand)) {
      b.x = s.x;
      b.y = s.y;
    }
  }
  return b;
}

function isOnScreen(bounds) {
  try {
    return screen.getAllDisplays().some((d) => {
      const wa = d.workArea;
      return (
        bounds.x < wa.x + wa.width &&
        bounds.x + bounds.width > wa.x &&
        bounds.y < wa.y + wa.height &&
        bounds.y + bounds.height > wa.y
      );
    });
  } catch (err) {
    return true;
  }
}

function createWindow() {
  const bounds = loadBounds();
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#f4f6fa',
    title: APP_NAME,
    autoHideMenuBar: true,
    icon: nativeImage.createFromBuffer(createTrayIconPng(256)),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      showTrayTipOnce();
    } else {
      saveWindowState();
    }
  });

  mainWindow.on('resize', scheduleSaveBounds);
  mainWindow.on('move', scheduleSaveBounds);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function scheduleSaveBounds() {
  if (boundsTimer) clearTimeout(boundsTimer);
  boundsTimer = setTimeout(saveWindowState, 400);
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized() || mainWindow.isMaximized() || mainWindow.isFullScreen()) return;
  const b = mainWindow.getBounds();
  store.saveWindowState({ x: b.x, y: b.y, width: b.width, height: b.height });
}

function createTray() {
  const image = nativeImage.createFromBuffer(createTrayIconPng(32));
  tray = new Tray(image);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开主窗口', click: () => showMainWindow() },
      { label: '打开数据文件夹', click: () => require('electron').shell.openPath(store.userDataDir()) },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true;
          saveWindowState();
          app.quit();
        }
      }
    ])
  );
  tray.on('click', () => showMainWindow());
  tray.on('double-click', () => showMainWindow());
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function showTrayTipOnce() {
  if (trayTipShown) return;
  trayTipShown = true;
  if (!tray) return;
  try {
    tray.displayBalloon({
      title: APP_NAME,
      content: '应用已最小化到系统托盘（数据已保存），双击托盘图标可重新打开。'
    });
  } catch (err) {
    /* 部分系统不支持气泡提示，忽略 */
  }
}