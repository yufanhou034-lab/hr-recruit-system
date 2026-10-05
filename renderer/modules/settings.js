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
      ? '<div class="card"><div class="card-head"><h3>' + HR.ico('folder') + ' 数据存储位置</h3></div>' +
        '<div class="muted small" id="stPath" style="word-break:break-all;margin-bottom:8px">加载中…</div>' +
        '<div class="muted small" style="margin-bottom:8px">网页版把数据保存在<b>你当前这台设备的浏览器</b>里（IndexedDB），不会上传服务器，清除浏览器数据会一并清空，建议定期「导出为 JSON」备份。</div>' +
        '<button class="btn ghost" id="stSeed">恢复演示数据</button>' +
        '</div>'
      : '<div class="card"><div class="card-head"><h3>' + HR.ico('folder') + ' 数据存储位置</h3></div>' +
        '<div class="muted small" id="stPath" style="word-break:break-all;margin-bottom:8px">加载中…</div>' +
        '<div class="muted small" style="margin-bottom:8px">所有岗位、候选人、投递记录都实时写在这个 <b>data.json</b> 文件里，关掉应用再打开也不会丢。直接复制这个文件就是一份完整备份。</div>' +
        '<button class="btn ghost" id="stOpenDir">打开数据文件夹</button>' +
        '<button class="btn ghost" id="stOpenFile" style="margin-left:8px">显示 data.json</button>' +
        '</div>';

    el.innerHTML =
      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h3>' + HR.ico('file-text') + ' 数据备份</h3></div>' +
      '<div class="field"><label>导出全部数据</label>' +
      '<div class="muted small" style="margin-bottom:6px">把当前 data.json 完整复制一份到你选择的位置' + (isWeb ? '（直接下载）。' : '（弹出系统保存对话框）。') + '换电脑时带过去即可。</div>' +
      '<button class="btn" id="stExport">' + HR.ico('download') + ' 导出数据</button></div>' +
      '<div class="field"><label>导入数据</label>' +
      '<div class="muted small" style="margin-bottom:6px">选择一个之前导出的 JSON 文件，<b>覆盖</b>当前全部数据。</div>' +
      '<button class="btn ghost" id="stImport">' + HR.ico('upload') + ' 导入数据</button></div>' +
      '</div>' +

      '<div class="card"><div class="card-head"><h3>' + HR.ico('database') + ' 当前数据量</h3></div>' +
      '<dl class="kv">' +
      '<dt>岗位</dt><dd>' + raw.jobs.length + ' 个（在招 ' + raw.jobs.filter((j) => !j.archived).length + ' 个）</dd>' +
      '<dt>简历</dt><dd>' + raw.candidates.length + ' 份（人才库 ' + raw.candidates.filter((r) => r.inTalentPool).length + ' 份）</dd>' +
      '<dt>投递记录</dt><dd>' + raw.applications.length + ' 条</dd>' +
      '<dt>面试记录</dt><dd>' + raw.applications.reduce((n, a) => n + (a.interviews || []).length, 0) + ' 条</dd>' +
      '<dt>最近保存</dt><dd id="stSaved">' + util.fmtDateTime(raw.updatedAt || util.now()) + '</dd>' +
      '</dl>' +
      '<div class="muted small">切换 tab 或窗口失焦时会自动保存。</div>' +
      '</div>' +

      storageCard +

      '<div class="card"><div class="card-head"><h3>' + HR.ico('tag') + ' 同义词词典</h3></div>' +
      '<div class="muted small" style="margin-bottom:6px">每行一组，用 <b>/</b> 或 <b>、</b> 分隔（至少两个词才算一组）。' +
      '初筛打分时，规则里出现某个词，整组等价说法都会纳入匹配 —— 于是 HR 写「英语六级」、简历里写「CET-6」也能命中。</div>' +
      '<div class="field"><textarea class="textarea" id="stSynonyms" style="min-height:120px" ' +
      'placeholder="每行一组，例如：&#10;注册会计师/CPA&#10;注册税务师/CTA">' +
      util.esc((raw.synonyms || []).join('\n')) + '</textarea></div>' +
      '<button class="btn" id="stSynSave">保存</button>' +
      '<button class="btn ghost" id="stSynReset" style="margin-left:8px">清空自定义</button>' +
      '<div class="muted small" style="margin-top:12px"><b>内置词典</b>（始终生效，下面这些无需重复填写）：' +
      HR.scoring.SYNONYM_GROUPS.map((g) => '<div style="margin-top:2px">· ' + util.esc(g.join(' / ')) + '</div>').join('') +
      '</div></div>' +

      '<div class="card"><div class="card-head"><h3>' + HR.ico('alert-triangle') + ' 危险操作</h3></div>' +
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

    el.querySelector('#stExport').addEventListener('click', exportDataFile);
    el.querySelector('#stImport').addEventListener('click', importDataFile);
    el.querySelector('#stClear').addEventListener('click', clearAll);

    /* 同义词词典：保存到 data.json，与内置词典叠加生效 */
    el.querySelector('#stSynSave').addEventListener('click', () => {
      const lines = el
        .querySelector('#stSynonyms')
        .value.split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const bad = lines.filter((l) => l.split(/[／/、]/).map((s) => s.trim()).filter(Boolean).length < 2);
      HR.data.raw.synonyms = lines;
      HR.data.normalize();
      HR.data.persistNow();
      HR.ui.toast(bad.length ? '已保存 ' + lines.length + ' 组，其中 ' + bad.length + ' 行不足两个词、不会生效' : '已保存同义词 ' + lines.length + ' 组');
      HR.refresh();
    });
    el.querySelector('#stSynReset').addEventListener('click', () => {
      HR.data.raw.synonyms = [];
      HR.data.normalize();
      HR.data.persistNow();
      HR.ui.toast('已清空自定义同义词，内置词典仍然生效');
      HR.refresh();
    });

    const openDirBtn = el.querySelector('#stOpenDir');
    if (openDirBtn) {
      openDirBtn.addEventListener('click', async () => {
        await window.api.openDataFolder();
      });
    }
    const openFileBtn = el.querySelector('#stOpenFile');
    if (openFileBtn) {
      openFileBtn.addEventListener('click', async () => {
        const res = await window.api.getDataPath();
        window.api.showItemInFolder(res.file);
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

  /** 导出：把 data.json 复制到用户选定的位置 */
  async function exportDataFile() {
    try {
      const res = await window.api.exportData();
      if (!res || res.canceled) return;
      HR.ui.toast('数据已导出到：' + res.path, 'success');
    } catch (err) {
      HR.ui.toast('导出失败：' + (err.message || err), 'error');
    }
  }

  /** 导入：选一个 json 覆盖当前数据 */
  async function importDataFile() {
    const ok = await HR.ui.confirm(
      '导入数据',
      '导入会用所选 JSON 文件的内容覆盖当前全部数据（岗位 / 候选人 / 投递记录）。建议先点「导出数据」留一份备份。',
      '选择文件并覆盖'
    );
    if (!ok) return;
    try {
      const res = await window.api.importData();
      if (!res || res.canceled) return;
      if (res.error || !res.data) {
        HR.ui.toast('导入失败：文件不是合法的数据文件', 'error');
        return;
      }
      HR.data.raw = Object.assign({ version: 1, jobs: [], candidates: [], applications: [] }, res.data);
      HR.data.normalize();
      HR.refresh();
      HR.ui.toast('已导入并覆盖：' + (res.from || res.path || ''), 'success');
    } catch (err) {
      HR.ui.toast('导入失败：文件不是合法的数据文件', 'error');
    }
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

  HR.register({ key: 'settings', label: '设置', render: render });
})();