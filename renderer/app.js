/* 应用引导：tab 路由、全局拖拽入库、自动保存、状态栏 */
(function () {
  const HR = window.HR;
  const util = HR.util;

  let currentKey = '';
  let currentParams = null;

  /* 模块 key → 图标名（统一 lucide，不再用 emoji） */
  const NAV_ICON = {
    dashboard: 'layout-dashboard',
    pool: 'users',
    jobs: 'briefcase',
    screening: 'clipboard-check',
    kanban: 'columns',
    interview: 'message-square',
    talent: 'database',
    settings: 'settings'
  };

  function ico(name, size) {
    return HR.icons ? HR.icons.icon(name, size) : '';
  }

  /* ---------- 主题切换（localStorage 记忆） ---------- */
  const THEME_KEY = 'hr-theme';

  function applyTheme(t) {
    const dark = t === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const btn = document.getElementById('themeBtn');
    if (btn) {
      btn.innerHTML = ico(dark ? 'sun' : 'moon');
      btn.title = dark ? '切换到浅色模式' : '切换到深色模式';
    }
  }

  function initTheme() {
    let t = 'light';
    try {
      t = window.localStorage.getItem(THEME_KEY) || 'light';
    } catch (e) {
      /* 隐私模式下读不到，按浅色处理 */
    }
    applyTheme(t);
  }

  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      /* 忽略写入失败 */
    }
  }

  /* ---------- 侧边栏折叠 ---------- */
  const SB_KEY = 'hr-sidebar-collapsed';

  function applyCollapse(v) {
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    sb.classList.toggle('collapsed', !!v);
    const btn = document.getElementById('sbToggle');
    if (btn) {
      btn.innerHTML = ico(v ? 'chevrons-right' : 'chevrons-left');
      btn.title = v ? '展开侧边栏（Ctrl+B）' : '收起侧边栏（Ctrl+B）';
    }
  }

  function toggleCollapse() {
    const sb = document.getElementById('sidebar');
    const next = !(sb && sb.classList.contains('collapsed'));
    applyCollapse(next);
    try {
      window.localStorage.setItem(SB_KEY, next ? '1' : '0');
    } catch (e) {
      /* 忽略 */
    }
  }

  /* ---------- 外壳静态图标 + 按钮 ---------- */
  function buildShell() {
    const logo = document.getElementById('sbLogo');
    if (logo) logo.innerHTML = ico('briefcase', 20);
    const drop = document.getElementById('dropIcon');
    if (drop) drop.innerHTML = ico('upload', 30);

    const imp = document.getElementById('sbImport');
    if (imp) {
      imp.innerHTML = ico('upload') + '<span>导入简历</span>';
      imp.addEventListener('click', quickImport);
    }
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    const sbToggle = document.getElementById('sbToggle');
    if (sbToggle) sbToggle.addEventListener('click', toggleCollapse);

    const kh = document.getElementById('kbdHint');
    if (kh) {
      const btn = kh.querySelector('.kbd-hint-btn');
      if (btn) btn.innerHTML = ico('keyboard', 15);
      kh.addEventListener('click', () => HR.palette && HR.palette.open());
    }
  }

  /* ---------- 左侧导航 ---------- */
  function buildTabs() {
    const nav = document.getElementById('tabs');
    nav.innerHTML = HR.moduleOrder
      .map((key) => {
        const mod = HR.modules[key];
        return (
          '<button class="tab-btn" data-tab="' + key + '" title="' + util.esc(mod.label) + '">' +
          '<span class="tab-ico">' + ico(NAV_ICON[key] || 'layout-dashboard') + '</span>' +
          '<span class="tab-label">' + util.esc(mod.label) + '</span>' +
          '<span class="tab-badge" data-badge="' + key + '" style="display:none"></span>' +
          '</button>'
        );
      })
      .join('');
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      switchTab(btn.getAttribute('data-tab'));
    });
  }

  /* ---------- 侧边栏「导入简历」：直接开文件对话框，并跳回简历池 ---------- */
  async function quickImport() {
    switchTab('pool');
    if (HR.pool && HR.pool.importFromDialog) {
      await HR.pool.importFromDialog();
      HR.refresh();
    }
  }

  /* ---------- 滚动位置记忆（sessionStorage，按 pane 分开存） ---------- */
  const SCROLL_KEY = 'hr-scroll:';

  function saveScroll(key) {
    const pane = key && document.querySelector('.pane[data-pane="' + key + '"]');
    if (!pane) return;
    try {
      window.sessionStorage.setItem(SCROLL_KEY + key, String(pane.scrollTop || 0));
      // 简历池/初筛页的纵向滚动其实发生在表格容器 .vt-wrap 里，必须一并记住
      const inner = pane.querySelector('.vt-wrap');
      if (inner) window.sessionStorage.setItem(SCROLL_KEY + key + ':inner', String(inner.scrollTop || 0));
    } catch (e) {
      /* 忽略隐私模式下的失败 */
    }
  }

  function restoreScroll(key) {
    const pane = document.querySelector('.pane[data-pane="' + key + '"]');
    if (!pane) return;
    let v = 0;
    let iv = 0;
    try {
      v = Number(window.sessionStorage.getItem(SCROLL_KEY + key) || 0) || 0;
      iv = Number(window.sessionStorage.getItem(SCROLL_KEY + key + ':inner') || 0) || 0;
    } catch (e) {
      v = 0;
      iv = 0;
    }
    if (v > 0) pane.scrollTop = v;
    const inner = pane.querySelector('.vt-wrap');
    if (inner && iv > 0) inner.scrollTop = iv;
  }

  function switchTab(key, params) {
    if (!HR.modules[key]) return;
    // 切 tab 前先落盘，并记住当前滚动位置
    if (currentKey) {
      HR.data.persistNow();
      saveScroll(currentKey);
    }

    currentKey = key;
    currentParams = params || null;
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tab') === key);
    });
    document.querySelectorAll('.pane').forEach((p) => {
      p.classList.toggle('active', p.getAttribute('data-pane') === key);
    });
    const mod = HR.modules[key];
    if (mod.onShow) mod.onShow(currentParams);
    mod.render(document.querySelector('.pane[data-pane="' + key + '"]'));

    const title = document.getElementById('pageTitle');
    if (title) title.textContent = mod.label;

    if (HR.ctxmenu) HR.ctxmenu.close();
    if (HR.palette && HR.palette.isOpen()) HR.palette.close();
    restoreScroll(key);
    updateBadges();
  }

  /** 重新渲染当前 tab */
  HR.refresh = function () {
    if (!currentKey) return;
    HR.modules[currentKey].render(document.querySelector('.pane[data-pane="' + currentKey + '"]'));
    updateBadges();
  };

  HR.goTo = function (key, params) {
    switchTab(key, params);
  };

  function updateBadges() {
    const raw = HR.data.raw;
    const counts = {
      pool: raw.candidates.length,
      kanban: raw.applications.filter((a) => HR.ACTIVE_STATUS.indexOf(a.status) >= 0).length,
      talent: raw.candidates.filter((r) => r.inTalentPool).length
    };
    Object.keys(counts).forEach((k) => {
      const el = document.querySelector('[data-badge="' + k + '"]');
      if (!el) return;
      if (counts[k] > 0) {
        el.style.display = '';
        el.textContent = String(counts[k]);
      } else {
        el.style.display = 'none';
      }
    });
  }

  /* ---------------- 全局拖拽导入 ---------------- */
  function setupGlobalDrop() {
    const mask = document.getElementById('dropMask');
    let depth = 0;

    window.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.types || e.dataTransfer.types.indexOf('Files') < 0) return;
      depth++;
      mask.classList.add('show');
    });
    window.addEventListener('dragover', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.types || e.dataTransfer.types.indexOf('Files') < 0) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) mask.classList.remove('show');
    });
    window.addEventListener('drop', async (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      e.preventDefault();
      depth = 0;
      mask.classList.remove('show');
      const list = [...files];
      HR.ui.setStatus('正在解析 ' + list.length + ' 个文件…');
      try {
        const parsed = await window.api.parseFiles(list);
        await HR.pool.ingestParsed(parsed);
        if (currentKey !== 'pool') HR.ui.toast('文件已入库，可在「简历池」查看', 'success');
        else HR.refresh();
      } catch (err) {
        HR.ui.toast('解析失败：' + (err.message || err), 'error');
      } finally {
        HR.ui.setStatus('就绪');
      }
    });
  }

  /* ---------------- 解析进度 ---------------- */
  function setupProgress() {
    window.api.onParseProgress((p) => {
      if (!p) return;
      if (p.phase === 'start') HR.ui.setStatus('正在解析 ' + p.name + '（' + (p.index + 1) + '/' + p.total + '）…');
      else if (p.phase === 'progress' && p.message) HR.ui.setStatus(p.name + '：' + p.message);
      else if (p.phase === 'done') HR.ui.setStatus('已解析 ' + p.name);
    });
  }

  /* ---------------- 启动 ---------------- */
  document.addEventListener('DOMContentLoaded', async () => {
    const isWeb = window.api.__env === 'web';

    buildTabs();
    setupGlobalDrop();
    setupProgress();

    if (isWeb) {
      const sub = document.querySelector('.brand-sub');
      if (sub) sub.textContent = '在线演示 · 数据只存在你的浏览器';
    }

    try {
      await HR.data.load();
    } catch (err) {
      HR.ui.toast('数据加载失败：' + (err.message || err), 'error');
    }

    // 网页版首次访问灌入演示数据，公开链接一打开就是完整效果
    if (isWeb && HR.demoData) {
      let seeded = null;
      try {
        seeded = window.localStorage.getItem('hr-demo-seeded');
      } catch (err) {
        seeded = '1';
      }
      if (!seeded && !HR.data.raw.jobs.length && !HR.data.raw.candidates.length) {
        HR.data.raw = HR.demoData.build();
        HR.data.normalize();
        await HR.data.persist();
        try {
          window.localStorage.setItem('hr-demo-seeded', '1');
        } catch (err) {
          /* 忽略隐私模式下的写入失败 */
        }
      }
    }

    // 窗口失焦 / 关闭前自动保存
    window.addEventListener('blur', () => HR.data.persistNow());
    window.addEventListener('beforeunload', () => HR.data.persistNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') HR.data.persistNow();
    });

    /* ---------- 键盘交互 ---------- */
  let selectedRow = null;

  /* 点击表格行时记住它，供 Enter 打开详情 */
  document.addEventListener('click', (e) => {
    // 合成事件或点在 document 上时 e.target 可能不是元素，closest 会抛错
    const tr = e.target && e.target.closest ? e.target.closest('#views tbody tr') : null;
    if (!tr) return;
    document.querySelectorAll('#views tbody tr.selected').forEach((x) => x.classList.remove('selected'));
    tr.classList.add('selected');
    selectedRow = tr;
  });

  function openSelectedRow(tr) {
    const btn = tr.querySelector('button[data-act="view"], button[data-act="detail"]');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (HR.palette) HR.palette.open();
      return;
    }
    if (mod && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      toggleCollapse();
      return;
    }
    if (mod && /^[1-8]$/.test(e.key)) {
      const key = HR.moduleOrder[Number(e.key) - 1];
      if (key) {
        e.preventDefault();
        switchTab(key);
      }
      return;
    }
    if (e.key === 'Escape') {
      if (HR.palette && HR.palette.isOpen()) {
        HR.palette.close();
        return;
      }
      if (HR.ctxmenu && HR.ctxmenu.isOpen()) {
        HR.ctxmenu.close();
        return;
      }
      const x = document.querySelector('.modal-x');
      if (x) x.click();
      return;
    }
    if (e.key === 'Enter' && selectedRow && document.contains(selectedRow)) {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (openSelectedRow(selectedRow)) e.preventDefault();
    }
  });

  /* ---------- 启动：先把外壳（侧边栏图标、主题、折叠状态）准备好 ---------- */
    buildShell();
    initTheme();
    let collapsed = false;
    try {
      collapsed = window.localStorage.getItem(SB_KEY) === '1';
    } catch (e) {
      collapsed = false;
    }
    applyCollapse(collapsed);
    const navEl = document.getElementById('tabs');
    if (navEl && !navEl.children.length) buildTabs();

    switchTab('dashboard');

    const right = document.getElementById('statusRight');
    if (right) {
      window.api.getAppInfo().then((info) => {
        right.textContent = 'v' + info.version + (isWeb ? ' · 数据保存在你的浏览器' : ' · 数据保存在本机');
      });
    }
  });
})();