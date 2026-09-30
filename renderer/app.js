/* 应用引导：tab 路由、全局拖拽入库、自动保存、状态栏 */
(function () {
  const HR = window.HR;
  const util = HR.util;

  let currentKey = '';
  let currentParams = null;

  function buildTabs() {
    const nav = document.getElementById('tabs');
    nav.innerHTML = HR.moduleOrder
      .map((key) => {
        const mod = HR.modules[key];
        return (
          '<button class="tab-btn" data-tab="' + key + '">' +
          '<span class="tab-ico">' + (mod.icon || '') + '</span><span>' + util.esc(mod.label) + '</span>' +
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

  function switchTab(key, params) {
    if (!HR.modules[key]) return;
    // 切 tab 前先落盘
    if (currentKey) HR.data.persistNow();

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

    switchTab('dashboard');

    const right = document.getElementById('statusRight');
    if (right) {
      window.api.getAppInfo().then((info) => {
        right.textContent = 'v' + info.version + (isWeb ? ' · 数据保存在你的浏览器' : ' · 数据保存在本机');
      });
    }
  });
})();