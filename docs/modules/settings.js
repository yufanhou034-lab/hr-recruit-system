/* 8. 设置 */
(function () {
  const HR = window.HR;
  const util = HR.util;
  const esc = util.esc;

  let info = null;

  function render(el) {
    const raw = HR.data.raw;
    const isWeb = window.api.__env === 'web';
    const storageCard = isWeb
      ? '<div class="card"><div class="card-head"><h3>📁 数据存储位置</h3></div>' +
        '<div class="muted small" id="stPath" style="word-break:break-all;margin-bottom:8px">加载中…</div>' +
        '<div class="muted small" style="margin-bottom:8px">网页版把数据保存在<b>你当前这台设备的浏览器</b>里（IndexedDB），不会上传服务器，清除浏览器数据会一并清空，建议定期「导出为 JSON」备份。</div>' +
        '<button class="btn ghost" id="stSeed">恢复演示数据</button>' +
        '</div>'
      : '<div class="card"><div class="card-head"><h3>📁 数据存储位置</h3></div>' +
        '<div class="muted small" id="stPath" style="word-break:break-all;margin-bottom:8px">加载中…</div>' +
        '<button class="btn ghost" id="stOpenDir">打开数据文件夹</button>' +
        '<button class="btn ghost" id="stOpenFile" style="margin-left:8px">显示数据文件</button>' +
        '</div>';

    el.innerHTML =
      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h3>💾 数据备份</h3></div>' +
      '<div class="field"><label>导出全部数据</label>' +
      '<div class="muted small" style="margin-bottom:6px">把岗位、简历池、投递记录全部导出为一个 JSON 文件' + (isWeb ? '（直接下载）。' : '（走系统保存对话框）。') + '</div>' +
      '<button class="btn" id="stExport">导出为 JSON</button></div>' +
      '<div class="field"><label>导入数据</label>' +
      '<div class="muted small" style="margin-bottom:6px">选择之前导出的 JSON 文件，可选「合并」或「覆盖」。</div>' +
      '<button class="btn ghost" id="stImport">导入 JSON 文件</button></div>' +
      '</div>' +

      '<div class="card"><div class="card-head"><h3>📊 当前数据量</h3></div>' +
      '<dl class="kv">' +
      '<dt>岗位</dt><dd>' + raw.jobs.length + ' 个（在招 ' + raw.jobs.filter((j) => !j.archived).length + ' 个）</dd>' +
      '<dt>简历</dt><dd>' + raw.resumes.length + ' 份（人才库 ' + raw.resumes.filter((r) => r.inTalentPool).length + ' 份）</dd>' +
      '<dt>投递记录</dt><dd>' + raw.applications.length + ' 条</dd>' +
      '<dt>面试记录</dt><dd>' + raw.applications.reduce((n, a) => n + (a.interviews || []).length, 0) + ' 条</dd>' +
      '<dt>最近保存</dt><dd id="stSaved">' + util.fmtDateTime(raw.updatedAt || util.now()) + '</dd>' +
      '</dl>' +
      '<div class="muted small">切换 tab 或窗口失焦时会自动保存。</div>' +
      '</div>' +

      storageCard +

      '<div class="card"><div class="card-head"><h3>⚠️ 危险操作</h3></div>' +
      '<div class="muted small" style="margin-bottom:8px">清空后所有岗位、简历、投递与面试记录都会被删除，且无法恢复。建议先导出备份。</div>' +
      '<button class="btn danger" id="stClear">清空全部数据</button>' +
      '</div>' +
      '</div>' +

      '<div class="card"><div class="card-head"><h3>ℹ️ 关于本应用</h3></div>' +
      '<dl class="kv">' +
      '<dt>名称</dt><dd>HR 招聘管理系统</dd>' +
      '<dt>版本</dt><dd id="stVersion">—</dd>' +
      '<dt>作者</dt><dd>HR Tools</dd>' +
      '<dt>运行环境</dt><dd id="stEnv">—</dd>' +
      '<dt>说明</dt><dd>' + (isWeb
        ? '网页版在线演示，数据保存在访问者自己的浏览器里，不上传任何服务器。'
        : 'Electron 桌面应用，数据全部保存在本机，不上传任何服务器。') + '</dd>' +
      '</dl></div>';

    el.querySelector('#stExport').addEventListener('click', exportJson);
    el.querySelector('#stImport').addEventListener('click', importJson);
    el.querySelector('#stClear').addEventListener('click', clearAll);

    const openDirBtn = el.querySelector('#stOpenDir');
    if (openDirBtn) {
      openDirBtn.addEventListener('click', async () => {
        if (!info) return;
        await window.api.openPath(info.userDataPath);
      });
    }
    const openFileBtn = el.querySelector('#stOpenFile');
    if (openFileBtn) {
      openFileBtn.addEventListener('click', async () => {
        if (!info) return;
        await window.api.showItemInFolder(info.dataFilePath);
      });
    }
    const seedBtn = el.querySelector('#stSeed');
    if (seedBtn) {
      seedBtn.addEventListener('click', async () => {
        const ok = await HR.ui.confirm(
          '恢复演示数据',
          '会用演示数据替换当前全部内容（现有岗位、简历、投递记录都会被覆盖）。建议先导出一份备份。',
          '恢复演示数据'
        );
        if (!ok) return;
        HR.data.raw = HR.demoData.build();
        HR.data.normalize();
        await HR.data.persist();
        HR.refresh();
        HR.ui.toast('演示数据已恢复', 'success');
      });
    }

    if (!info) {
      window.api.getAppInfo().then((res) => {
        info = res;
        fillInfo(el);
      });
    } else {
      fillInfo(el);
    }
  }

  function fillInfo(el) {
    const pathEl = el.querySelector('#stPath');
    const verEl = el.querySelector('#stVersion');
    const envEl = el.querySelector('#stEnv');
    if (pathEl) pathEl.textContent = info.dataFilePath;
    if (verEl) verEl.textContent = 'v' + info.version;
    if (envEl) envEl.textContent = info.platform === 'web'
      ? '网页版 · ' + info.chrome
      : 'Electron ' + info.electron + ' · Node ' + info.node + ' · Chromium ' + info.chrome;
  }

  async function exportJson() {
    const content = JSON.stringify(
      Object.assign({}, HR.data.raw, { exportedAt: util.now(), app: 'HR 招聘管理系统' }),
      null,
      2
    );
    const res = await window.api.saveTextFile({
      title: '导出全部数据',
      defaultPath: 'HR招聘数据_' + util.fmtDate(util.now()) + '.json',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
      content: content
    });
    if (res.canceled) return;
    HR.ui.toast('已导出：' + res.path, 'success');
  }

  async function importJson() {
    const res = await window.api.openJsonFile();
    if (res.canceled) return;
    let incoming;
    try {
      incoming = JSON.parse(res.content);
    } catch (err) {
      HR.ui.toast('文件不是合法的 JSON', 'error');
      return;
    }
    if (!incoming || typeof incoming !== 'object') {
      HR.ui.toast('文件内容格式不正确', 'error');
      return;
    }
    const counts =
      (incoming.jobs || []).length + ' 个岗位 / ' + (incoming.resumes || []).length + ' 份简历 / ' +
      (incoming.applications || []).length + ' 条投递记录';
    const choice = await HR.ui.choose('导入数据', '文件中共有 ' + counts + '。请选择导入方式：', [
      { label: '合并（保留现有数据）', value: 'merge' },
      { label: '覆盖（清空后导入）', value: 'replace', kind: 'danger' },
      { label: '取消', value: 'cancel', kind: 'ghost' }
    ]);
    if (!choice || choice === 'cancel') return;

    if (choice === 'replace') {
      HR.data.raw = Object.assign(
        { version: 1, jobs: [], resumes: [], applications: [] },
        {
          jobs: incoming.jobs || [],
          resumes: incoming.resumes || [],
          applications: incoming.applications || []
        }
      );
    } else {
      const mergeById = (target, source, prefix) => {
        const seen = new Set(target.map((x) => x.id));
        (source || []).forEach((item) => {
          if (!item || !item.id) item = Object.assign({}, item, { id: util.uid(prefix) });
          if (seen.has(item.id)) item = Object.assign({}, item, { id: util.uid(prefix) });
          seen.add(item.id);
          target.push(item);
        });
      };
      mergeById(HR.data.raw.jobs, incoming.jobs, 'job');
      mergeById(HR.data.raw.resumes, incoming.resumes, 'res');
      mergeById(HR.data.raw.applications, incoming.applications, 'app');
    }
    HR.data.normalize();
    await HR.data.persist();
    HR.refresh();
    HR.ui.toast(choice === 'replace' ? '已覆盖导入' : '已合并导入', 'success');
  }

  function clearAll() {
    HR.ui.modal({
      title: '清空全部数据',
      width: 460,
      body:
        '<p class="modal-text text-red">该操作不可恢复。请输入「确认清空」以继续。</p>' +
        '<div class="field" style="margin-top:12px"><input class="input" id="clearInput" placeholder="确认清空" /></div>',
      actions: [
        { label: '取消', kind: 'ghost', onClick: (h) => h.close() },
        {
          label: '确认清空',
          kind: 'danger',
          onClick: async (h) => {
            const v = h.body.querySelector('#clearInput').value.trim();
            if (v !== '确认清空') {
              HR.ui.toast('输入不匹配，未执行清空', 'error');
              return;
            }
            HR.data.clearAll();
            await HR.data.persist();
            h.close();
            HR.refresh();
            HR.ui.toast('全部数据已清空', 'success');
          }
        }
      ]
    });
  }

  HR.register({ key: 'settings', label: '设置', icon: '⚙️', render: render });
})();