'use strict';
/**
 * 主进程入口：窗口、托盘、窗口状态记忆、IPC 注册。
 */
const { app, BrowserWindow, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const store = require('./store');
const { registerIpc } = require('./ipc');
const { createTrayIconPng } = require('./icon');

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
  registerIpc({ getWindow: () => mainWindow });
  createWindow();
  createTray();
}

function defaultBounds() {
  return { width: 1280, height: 800 };
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

function loadBounds() {
  const s = store.loadWindowState() || {};
  const b = defaultBounds();
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
    title: 'HR 招聘管理系统',
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

  // 与网页版（GitHub Pages）共用同一份渲染层代码，位于 docs/
  mainWindow.loadFile(path.join(__dirname, '..', '..', 'docs', 'index.html'));

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
  tray.setToolTip('HR 招聘管理系统');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开主窗口', click: () => showMainWindow() },
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
      title: 'HR 招聘管理系统',
      content: '应用已最小化到系统托盘，双击托盘图标可重新打开。'
    });
  } catch (err) {
    /* 部分系统不支持气泡提示，忽略 */
  }
}