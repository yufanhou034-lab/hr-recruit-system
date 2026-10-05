/* 2. 简历池 */
(function () {
  const HR = window.HR;
  const util = HR.util;
  const esc = util.esc;

  const filters = { keyword: '', source: '', tag: '', talent: '' };

  function matches(r) {
    const kw = filters.keyword.trim().toLowerCase();
    if (kw) {
      const hay = [r.name, r.school, r.phone, r.email, r.major].join(' ').toLowerCase();
      if (hay.indexOf(kw) < 0) return false;
    }
    if (filters.source && (r.source || '其他') !== filters.source) return false;
    if (filters.tag && !(r.tags || []).includes(filters.tag)) return false;
    if (filters.talent === 'in' && !r.inTalentPool) return false;
    if (filters.talent === 'out' && r.inTalentPool) return false;
    return true;
  }

  function filtered() {
    return HR.data.raw.candidates
      .filter(matches)
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  /* ---------------- 页面 ---------------- */
  function render(el) {
    const tags = HR.data.allTags();
    const rows = filtered();
    const unparsed = HR.data.raw.candidates.filter((r) => !r.aiProfile).length;

    el.innerHTML =
      '<div class="card">' +
      '<div class="toolbar">' +
      '<input class="input input-search grow" id="poolSearch" placeholder="搜索姓名 / 学校 / 电话 / 邮箱 / 专业" value="' + esc(filters.keyword) + '" />' +
      '<select class="select" id="poolSource" style="width:130px">' +
      '<option value="">全部来源</option>' +
      HR.SOURCES.map((s) => '<option value="' + esc(s) + '"' + (filters.source === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') +
      '</select>' +
      '<select class="select" id="poolTag" style="width:130px">' +
      '<option value="">全部标签</option>' +
      tags.map((t) => '<option value="' + esc(t) + '"' + (filters.tag === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') +
      '</select>' +
      '<select class="select" id="poolTalent" style="width:140px">' +
      '<option value="">全部简历</option>' +
      '<option value="in"' + (filters.talent === 'in' ? ' selected' : '') + '>仅在人才库</option>' +
      '<option value="out"' + (filters.talent === 'out' ? ' selected' : '') + '>不在人才库</option>' +
      '</select>' +
      '<span class="spacer"></span>' +
      (unparsed
        ? '<button class="btn ghost" id="poolAi">' + HR.ico('sparkles') + ' AI 批量解析（' + unparsed + '）</button>'
        : '') +
      '<button class="btn" id="poolImport">' + HR.ico('upload') + ' 导入文件</button>' +
      '<button class="btn ghost" id="poolPaste">' + HR.ico('clipboard-check') + ' 粘贴文本</button>' +
      '<button class="btn ghost" id="poolManual">' + HR.ico('pencil') + ' 手动录入</button>' +
      '</div>' +
      '<div class="muted small">共 ' + rows.length + ' 份（可把 .docx / .pdf / .txt / 图片直接拖进窗口自动入库）</div>' +
      '</div>' +
      '<div class="table-wrap' + (rows.length ? ' vt-wrap' : '') + '">' +
      (rows.length
        ? '<table><thead><tr>' +
          '<th>姓名 / 学校</th><th>电话</th><th>学历</th><th>专业</th><th>来源</th><th>标签</th><th>AI 画像</th><th>入库时间</th><th style="width:230px">操作</th>' +
          '</tr></thead><tbody id="poolBody"></tbody></table>'
        : HR.ui.empty(
            'inbox',
            '简历池还是空的',
            '把 .docx / .pdf / .txt / Excel / 图片拖进窗口即可自动解析入库，或点击下面的按钮选择文件',
            '<button class="btn" id="poolEmptyImport">' + HR.ico('upload') + ' 导入简历</button>'
          )) +
      '</div>';

    el.querySelector('#poolSearch').addEventListener(
      'input',
      util.debounce((e) => {
        filters.keyword = e.target.value;
        HR.refresh();
      }, 250)
    );
    el.querySelector('#poolSource').addEventListener('change', (e) => {
      filters.source = e.target.value;
      HR.refresh();
      const n = el.querySelector('#poolSearch');
      if (n) n.focus();
    });
    el.querySelector('#poolTag').addEventListener('change', (e) => {
      filters.tag = e.target.value;
      HR.refresh();
    });
    el.querySelector('#poolTalent').addEventListener('change', (e) => {
      filters.talent = e.target.value;
      HR.refresh();
    });
    el.querySelector('#poolImport').addEventListener('click', importFromDialog);
    el.querySelector('#poolPaste').addEventListener('click', openPaste);
    el.querySelector('#poolManual').addEventListener('click', () => openForm(null));
    const aiBtn = el.querySelector('#poolAi');
    if (aiBtn) aiBtn.addEventListener('click', runBatchAi);

    el.querySelector('tbody') &&
      el.querySelector('tbody').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        if (act === 'view') openDetail(id);
        else if (act === 'edit') openForm(HR.data.resume(id));
        else if (act === 'tag') openTag(id);
        else if (act === 'talent') toggleTalent(id);
        else if (act === 'del') removeResume(id);
        else if (act === 'copy') HR.ui.copy(btn.getAttribute('data-copy'));
      });

    /* 空状态里的「导入简历」按钮 */
    const emptyImp = el.querySelector('#poolEmptyImport');
    if (emptyImp) emptyImp.addEventListener('click', importFromDialog);

    /* 虚拟滚动：只渲染可视区内的行（上千份简历时避免一次性创建上千个 DOM 行） */
    if (rows.length) {
      HR.ui.virtualTable({
        scroller: el.querySelector('.vt-wrap'),
        tbody: el.querySelector('#poolBody'),
        total: rows.length,
        rowHtml: (i) => rowHtml(rows[i], i),
        colSpan: 9
      });
    }
  }

  function rowHtml(r, i) {
    const risk =
      r.aiProfile && (r.aiProfile.riskFlags || []).length
        ? ' <span class="risk-flag" title="风险信号：' + esc(r.aiProfile.riskFlags.join('；')) + '">' + HR.ico('alert-triangle', 13) + '</span>'
        : '';
    return (
      '<tr class="' + (i % 2 ? 'alt' : '') + '" data-id="' + esc(r.id) + '">' +
      '<td><div class="cell-name">' + esc(r.name) + risk + (r.inTalentPool ? ' <span class="tag purple">人才库</span>' : '') + '</div>' +
      '<div class="cell-sub">' + esc(r.school || '学校未识别') + '</div></td>' +
      '<td class="nowrap"><span class="phone-cell">' +
      '<span class="phone-mask mono">' + esc(util.maskPhone(r.phone)) + '</span>' +
      '<span class="phone-full mono">' + esc(r.phone || '—') + '</span>' +
      (r.phone
        ? '<button class="copy-mini" data-act="copy" data-copy="' + esc(r.phone) + '" title="复制手机号">' + HR.ico('copy', 13) + '</button>'
        : '') +
      '</span></td>' +
      '<td class="nowrap">' + esc(r.degree || '—') + '</td>' +
      '<td>' + esc(r.major || '—') + '</td>' +
      '<td class="nowrap">' + esc(r.source || '其他') + '</td>' +
      '<td>' + ((r.tags || []).length ? r.tags.map((t) => '<span class="tag blue">' + esc(t) + '</span>').join('') : '<span class="muted">—</span>') + '</td>' +
      '<td class="ai-cell">' + aiCellHtml(r) + '</td>' +
      '<td class="nowrap">' + util.fmtDate(r.createdAt) + '</td>' +
      '<td class="nowrap">' +
      '<button class="btn-link" data-act="view" data-id="' + r.id + '">查看</button>' +
      '<button class="btn-link" data-act="edit" data-id="' + r.id + '">编辑</button>' +
      '<button class="btn-link" data-act="tag" data-id="' + r.id + '">标签</button>' +
      '<button class="btn-link" data-act="talent" data-id="' + r.id + '">' + (r.inTalentPool ? '移出人才库' : '移入人才库') + '</button>' +
      '<button class="btn-link danger" data-act="del" data-id="' + r.id + '">删除</button>' +
      '</td></tr>'
    );
  }

  /* ---------------- 导入 ---------------- */
  async function importFromDialog() {
    const res = await window.api.pickResumeFiles();
    if (res.canceled) return;
    await ingestParsed(res.files);
  }

  /**
   * 把解析结果入库（文件对话框 / 拖拽 / 粘贴共用）
   * @param {Array<{name,text,note,error}>} files
   */
  async function ingestParsed(files) {
    if (!files || !files.length) return;
    let added = 0;
    let merged = 0;
    let failed = 0;
    HR.ui.setStatus('正在入库…');

    for (const f of files) {
      if (f.error || !f.text) {
        HR.ui.toast(f.name + '：' + (f.error || '未提取到文字'), 'error');
        failed++;
        continue;
      }
      const info = HR.extract.parse(f.text, f.name);
      const exist = HR.data.findByPhoneOrEmail(info.phone, info.email);
      if (exist) {
        const choice = await HR.ui.choose(
          '发现重复候选人',
          '「' + info.name + '」与已有候选人「' + exist.name + '」的手机号或邮箱相同（' +
          (info.phone || info.email) + '）。',
          [
            { label: '查看已有', value: 'view', kind: 'ghost' },
            { label: '合并到已有', value: 'merge', kind: 'danger' },
            { label: '跳过这条', value: 'skip', kind: 'ghost' }
          ]
        );
        if (choice === 'merge') {
          mergeInto(exist, info, f);
          merged++;
        } else if (choice === 'view') {
          openDetail(exist.id);
        }
        continue;
      }
      HR.data.addResume(
        Object.assign(info, {
          text: f.text,
          fileName: f.name || '',
          note: f.note || '',
          createdAt: util.now()
        })
      );
      added++;
    }

    await HR.data.persist();
    HR.ui.setStatus('就绪');
    HR.refresh();
    const parts = [];
    if (added) parts.push('新增 ' + added + ' 份');
    if (merged) parts.push('合并 ' + merged + ' 份');
    if (failed) parts.push('失败 ' + failed + ' 份');
    HR.ui.toast(parts.length ? '入库完成：' + parts.join('，') : '没有新的简历', failed ? 'error' : 'success');
  }

  function mergeInto(target, info, file) {
    ['phone', 'email', 'school', 'degree', 'major', 'gradYear'].forEach((k) => {
      if (!target[k] && info[k]) target[k] = info[k];
    });
    if (!target.text && file.text) target.text = file.text;
    if (file.text && target.text && target.text.indexOf(file.text) < 0) {
      target.text = target.text + '\n\n—— 追加导入（' + util.fmtDate(util.now()) + '）——\n' + file.text;
    }
    if (target.tags.indexOf('重复合并') < 0) target.tags.push('重复合并');
  }

  /* ---------------- 详情 ---------------- */
  function openDetail(id) {
    const r = HR.data.resume(id);
    if (!r) return;
    const apps = HR.data.appsOfResume(id);
    const appsHtml = apps.length
      ? '<div class="table-wrap"><table><thead><tr><th>岗位</th><th>状态</th><th>综合分</th><th>最后跟进</th></tr></thead><tbody>' +
        apps
          .map((a) => {
            const j = HR.data.job(a.jobId);
            return (
              '<tr><td>' + esc(j ? j.name : '已删除岗位') + '</td>' +
              '<td><span class="tag ' + (HR.STATUS[a.status] || {}).cls + '">' + esc(HR.data.statusLabel(a.status)) + '</span></td>' +
              '<td class="mono">' + (a.score ? a.score.composite : '—') + '</td>' +
              '<td class="nowrap">' + util.fmtDate(a.lastFollowUpAt) + '</td></tr>'
            );
          })
          .join('') +
        '</tbody></table></div>'
      : '<div class="muted small">暂无投递记录</div>';

    const body =
      '<div class="detail-2col">' +
      '<div><div class="muted small" style="margin-bottom:6px">简历原文' +
      (r.fileName ? ' · 来自 ' + esc(r.fileName) : '') +
      (r.note ? ' · ' + esc(r.note) : '') + '</div>' +
      '<div class="resume-text">' + esc(r.text || '（无原文）') + '</div></div>' +
      '<div><div class="muted small" style="margin-bottom:6px">提取字段</div>' +
      '<dl class="kv">' +
      '<dt>姓名</dt><dd>' + esc(r.name) + '</dd>' +
      '<dt>手机号</dt><dd class="mono">' + esc(r.phone || '—') + '</dd>' +
      '<dt>邮箱</dt><dd>' + esc(r.email || '—') + '</dd>' +
      '<dt>学校</dt><dd>' + esc(r.school || '—') + '</dd>' +
      '<dt>学历</dt><dd>' + esc(r.degree || '—') + '</dd>' +
      '<dt>专业</dt><dd>' + esc(r.major || '—') + '</dd>' +
      '<dt>毕业年份</dt><dd>' + esc(r.gradYear ? r.gradYear + ' 届' : '—') + '</dd>' +
      '<dt>来源</dt><dd>' + esc(r.source || '其他') + '</dd>' +
      '<dt>标签</dt><dd>' + ((r.tags || []).length ? r.tags.map((t) => '<span class="tag blue">' + esc(t) + '</span>').join('') : '—') + '</dd>' +
      '<dt>入库时间</dt><dd>' + util.fmtDateTime(r.createdAt) + '</dd>' +
      '</dl>' +
      aiCardHtml(r) +
      '<div class="muted small" style="margin:10px 0 6px">关联投递记录</div>' +
      appsHtml +
      '</div></div>';

    HR.ui.modal({
      title: '候选人详情 · ' + r.name,
      body: body,
      width: 980,
      onMount(h) {
        const aiOne = h.body.querySelector('#aiOne');
        if (aiOne) aiOne.addEventListener('click', () => parseOne(id, h));
      },
      actions: [
        { label: '编辑', kind: 'ghost', onClick: (h) => { h.close(); openForm(HR.data.resume(id)); } },
        { label: '关闭', kind: 'ghost', onClick: (h) => h.close() }
      ]
    });
  }

  /* ---------------- AI 画像（功能 1） ---------------- */
  function aiCellHtml(r) {
    const p = r.aiProfile;
    if (!p) return '<span class="muted small">未解析</span>';
    const s = p.summary || (p.expectation && p.expectation.salary) || '';
    return '<span class="ai-summary" title="' + esc(s || '已解析') + '">' + esc(util.truncate(s || '已解析', 18)) + '</span>';
  }

  /** 详情弹窗里的 AI 解析卡片 */
  function aiCardHtml(r) {
    const p = r.aiProfile;
    const configured = HR.ai.isConfigured();
    let inner;
    if (!p) {
      inner =
        '<div class="muted small" style="margin-bottom:8px">' +
        (configured
          ? '还没有解析过这份简历。点下方按钮，让大模型提取学历、工作年限、期望薪资、风险信号等结构化信息。'
          : '尚未配置 AI 接口，请先到「设置 → AI 配置」填写 Base URL 与 API Key。') +
        '</div>' +
        '<button class="btn small" id="aiOne"' + (configured ? '' : ' disabled') + '>' + HR.ico('sparkles') + ' AI 解析此简历</button>';
    } else {
      const edu = p.education || {};
      const work = p.work || {};
      const exp = p.expectation || {};
      const eduLine = [edu.highest, edu.school, edu.schoolTier].filter(Boolean).join(' · ') || '—';
      const workLine =
        [
          work.totalYears ? work.totalYears + ' 年经验' : '',
          work.latestCompany && work.latestTitle ? work.latestCompany + ' · ' + work.latestTitle : work.latestCompany || work.latestTitle,
          work.latestDurationMonths ? '最近一段 ' + work.latestDurationMonths + ' 个月' : ''
        ]
          .filter(Boolean)
          .join('；') || '—';
      const riskHtml = (p.riskFlags || []).length
        ? '<div class="ai-risk">' +
          p.riskFlags
            .map((f) => '<div>' + HR.ico('alert-triangle', 13) + ' ' + esc(f) + '</div>')
            .join('') +
          '</div>'
        : '';
      inner =
        (p.summary ? '<div class="ai-summary-big">' + HR.ico('sparkles', 14) + ' ' + esc(p.summary) + '</div>' : '') +
        '<dl class="kv">' +
        '<dt>学历</dt><dd>' + esc(eduLine) + '</dd>' +
        '<dt>专业 / 毕业</dt><dd>' + esc((edu.major || '—') + ' · ' + (edu.gradYear || '—')) + '</dd>' +
        '<dt>工作经历</dt><dd>' + esc(workLine) + '</dd>' +
        '<dt>跳槽风险分</dt><dd>' +
        '<span class="badge ' + (work.jobHoppingScore >= 60 ? 'rej' : work.jobHoppingScore >= 30 ? 'pend' : 'rec') + '">' +
        (work.jobHoppingScore || 0) + '</span>' +
        (work.gapMonths ? ' <span class="muted small">空窗期 ' + work.gapMonths + ' 个月</span>' : '') +
        '</dd>' +
        '<dt>期望薪资</dt><dd>' + esc(exp.salary || '—') + '</dd>' +
        '<dt>期望城市</dt><dd>' + esc(exp.location || '—') + '</dd>' +
        '<dt>可到岗</dt><dd>' + esc(exp.availableDate || '—') + '</dd>' +
        '<dt>核心技能</dt><dd>' +
        ((p.skills || []).length ? p.skills.map((s) => '<span class="tag blue">' + esc(s) + '</span>').join('') : '—') +
        '</dd>' +
        '<dt>解析时间</dt><dd>' + util.fmtDateTime(p.parsedAt) + '</dd>' +
        '</dl>' +
        riskHtml +
        '<button class="btn small ghost" id="aiOne">' + HR.ico('refresh-cw') + ' 重新解析</button>';
    }
    return (
      '<div class="ai-card"><div class="ai-card-head">' + HR.ico('sparkles') + ' AI 解析</div>' + inner + '</div>'
    );
  }

  /** 单份简历解析（详情弹窗内触发），完成后重新打开详情展示结果 */
  async function parseOne(id, h) {
    const r = HR.data.resume(id);
    if (!r) return;
    const btn = h.body.querySelector('#aiOne');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '解析中…';
    }
    const profile = await HR.ai.extractResume(r.text);
    if (profile) {
      // 姓名 / 电话 / 邮箱置信度低时，用原有正则结果兜底
      if (!profile.name && r.name) profile.name = r.name;
      if (!profile.phone && r.phone) profile.phone = r.phone;
      if (!profile.email && r.email) profile.email = r.email;
      r.aiProfile = profile;
      HR.data.persistNow();
      HR.ui.toast('AI 解析完成', 'success');
      h.close();
      HR.refresh();
      openDetail(id);
      return;
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = HR.ico('sparkles') + ' AI 解析此简历';
    }
  }

  /** 批量解析：逐条调用，间隔 1 秒限流，弹窗内可随时停止 */
  const aiBatch = { running: false, stop: false };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function runBatchAi() {
    const targets = HR.data.raw.candidates.filter((r) => !r.aiProfile && r.text);
    if (!targets.length) {
      HR.ui.toast('没有待解析的简历（都已解析，或没有正文）', 'error');
      return;
    }
    if (!HR.ai.isConfigured()) {
      HR.ui.toast('请先在「设置 → AI 配置」里填写接口信息', 'error');
      return;
    }
    if (aiBatch.running) {
      HR.ui.toast('批量解析正在进行中', 'error');
      return;
    }

    aiBatch.running = true;
    aiBatch.stop = false;
    const h = HR.ui.modal({
      title: 'AI 批量解析',
      width: 470,
      dismissible: false,
      body:
        '<p class="modal-text">共 <b>' + targets.length + '</b> 份简历待解析，每份间隔 1 秒避免触发限流。解析过程中数据会自动保存。</p>' +
        '<div class="ai-progress"><div class="ai-progress-txt" id="aipTxt">准备中…</div>' +
        '<div class="bar-track"><div class="bar-fill" id="aipFill"></div></div></div>',
      actions: [
        {
          label: '停止',
          kind: 'ghost',
          onClick() {
            aiBatch.stop = true;
          }
        }
      ]
    });

    const txt = h.body.querySelector('#aipTxt');
    const fill = h.body.querySelector('#aipFill');

    (async () => {
      let okN = 0;
      let failN = 0;
      for (let i = 0; i < targets.length; i++) {
        if (aiBatch.stop) break;
        const r = targets[i];
        txt.textContent = '正在解析第 ' + (i + 1) + '/' + targets.length + ' 份：' + (r.name || '未命名');
        fill.style.width = Math.round((i / targets.length) * 100) + '%';
        const profile = await HR.ai.extractResume(r.text, { silent: true });
        if (profile) {
          if (!profile.name && r.name) profile.name = r.name;
          if (!profile.phone && r.phone) profile.phone = r.phone;
          if (!profile.email && r.email) profile.email = r.email;
          r.aiProfile = profile;
          okN++;
        } else {
          failN++;
        }
        HR.data.persist();
        if (i < targets.length - 1 && !aiBatch.stop) await sleep(1000);
      }
      fill.style.width = '100%';
      aiBatch.running = false;
      HR.data.persistNow();
      h.close();
      HR.refresh();
      const stopped = aiBatch.stop ? '（已手动停止）' : '';
      HR.ui.toast(
        'AI 解析完成：成功 ' + okN + ' 份' + (failN ? '，失败 ' + failN + ' 份' : '') + stopped,
        okN ? 'success' : 'error'
      );
    })();
  }

  /* ---------------- 编辑 / 新增表单 ---------------- */
  function formHtml(r) {
    const v = r || {};
    return (
      '<div class="grid-2">' +
      '<div class="field"><label>姓名 *</label><input class="input" id="fName" value="' + esc(v.name || '') + '" /></div>' +
      '<div class="field"><label>手机号</label><input class="input" id="fPhone" value="' + esc(v.phone || '') + '" /></div>' +
      '<div class="field"><label>邮箱</label><input class="input" id="fEmail" value="' + esc(v.email || '') + '" /></div>' +
      '<div class="field"><label>学校</label><input class="input" id="fSchool" value="' + esc(v.school || '') + '" /></div>' +
      '<div class="field"><label>学历</label><select class="select" id="fDegree">' +
      ['', '大专', '本科', '硕士', '博士', '中专/高中'].map((d) => '<option value="' + d + '"' + (v.degree === d ? ' selected' : '') + '>' + (d || '未填写') + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label>专业</label><input class="input" id="fMajor" value="' + esc(v.major || '') + '" /></div>' +
      '<div class="field"><label>毕业年份</label><input class="input" id="fGradYear" placeholder="如 2026" value="' + esc(v.gradYear || '') + '" /></div>' +
      '<div class="field"><label>来源</label><select class="select" id="fSource">' +
      HR.SOURCES.map((s) => '<option value="' + esc(s) + '"' + ((v.source || '其他') === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') +
      '</select></div>' +
      '</div>' +
      '<div class="field"><label>标签（逗号分隔）</label><input class="input" id="fTags" value="' + esc((v.tags || []).join(',')) + '" /></div>' +
      '<div class="field"><label>简历原文</label><textarea class="textarea" id="fText" style="min-height:180px">' + esc(v.text || '') + '</textarea></div>'
    );
  }

  function openForm(resume) {
    const isNew = !resume;
    HR.ui.modal({
      title: isNew ? '手动录入候选人' : '编辑候选人',
      body: formHtml(resume),
      width: 720,
      actions: [
        { label: '取消', kind: 'ghost', onClick: (h) => h.close() },
        {
          label: '保存',
          onClick: async (h) => {
            const box = h.body;
            const payload = {
              name: box.querySelector('#fName').value.trim(),
              phone: box.querySelector('#fPhone').value.trim(),
              email: box.querySelector('#fEmail').value.trim(),
              school: box.querySelector('#fSchool').value.trim(),
              degree: box.querySelector('#fDegree').value,
              major: box.querySelector('#fMajor').value.trim(),
              gradYear: box.querySelector('#fGradYear').value.trim(),
              source: box.querySelector('#fSource').value,
              tags: box
                .querySelector('#fTags')
                .value.split(/[,，\s]+/)
                .map((s) => s.trim())
                .filter(Boolean),
              text: box.querySelector('#fText').value
            };
            if (!payload.name) {
              HR.ui.toast('请填写姓名', 'error');
              return;
            }
            if (isNew) {
              const exist = HR.data.findByPhoneOrEmail(payload.phone, payload.email);
              if (exist) {
                HR.ui.toast('手机号或邮箱与已有候选人「' + exist.name + '」重复', 'error');
                return;
              }
              HR.data.addResume(payload);
            } else {
              HR.data.updateResume(resume.id, payload);
            }
            await HR.data.persist();
            h.close();
            HR.refresh();
            HR.ui.toast(isNew ? '已录入候选人' : '已保存修改', 'success');
          }
        }
      ]
    });
  }

  /* ---------------- 粘贴文本 ---------------- */
  function openPaste() {
    HR.ui.modal({
      title: '粘贴简历文本',
      width: 700,
      body:
        '<div class="field"><label>把简历原文粘贴进来（多份之间用单独一行的 --- 分隔）</label>' +
        '<textarea class="textarea" id="pasteText" style="min-height:280px" placeholder="张三&#10;手机 13800000000&#10;……&#10;---&#10;李四&#10;……"></textarea></div>' +
        '<div class="hint">粘贴后会自动按手机号 / 邮箱去重，并提取姓名、学校、学历等字段。</div>',
      actions: [
        { label: '取消', kind: 'ghost', onClick: (h) => h.close() },
        {
          label: '解析并入库',
          onClick: async (h) => {
            const raw = h.body.querySelector('#pasteText').value || '';
            const parts = raw
              .split(/^\s*-{3,}\s*$/m)
              .map((s) => s.trim())
              .filter(Boolean);
            if (!parts.length) {
              HR.ui.toast('请先粘贴简历内容', 'error');
              return;
            }
            h.close();
            await ingestParsed(parts.map((text, i) => ({ name: '粘贴简历 ' + (i + 1), text: text, note: '粘贴文本', error: '' })));
          }
        }
      ]
    });
  }

  /* ---------------- 标签 ---------------- */
  function openTag(id) {
    const r = HR.data.resume(id);
    if (!r) return;
    const all = HR.data.allTags();
    const preset = ['重点跟进', '高潜', '可培养', '待定', '已沟通', '重复合并'];
    const list = [...new Set([...all, ...preset])];
    const body =
      '<div class="muted small" style="margin-bottom:8px">勾选要打的标签</div>' +
      '<div id="tagList">' +
      list
        .map(
          (t) =>
            '<label class="tag" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:3px 9px">' +
            '<input type="checkbox" value="' + esc(t) + '"' + ((r.tags || []).includes(t) ? ' checked' : '') + ' /> ' + esc(t) +
            '</label>'
        )
        .join('') +
      '</div>' +
      '<div class="field" style="margin-top:14px"><label>新增标签</label><input class="input" id="newTag" placeholder="输入后点「保存」即新增" /></div>';

    HR.ui.modal({
      title: '设置标签 · ' + r.name,
      body: body,
      width: 520,
      actions: [
        { label: '取消', kind: 'ghost', onClick: (h) => h.close() },
        {
          label: '保存',
          onClick: async (h) => {
            const tags = [...h.body.querySelectorAll('#tagList input:checked')].map((i) => i.value);
            const extra = h.body.querySelector('#newTag').value.trim();
            if (extra && tags.indexOf(extra) < 0) tags.push(extra);
            HR.data.updateResume(id, { tags: tags });
            await HR.data.persist();
            h.close();
            HR.refresh();
            HR.ui.toast('标签已更新', 'success');
          }
        }
      ]
    });
  }

  async function toggleTalent(id) {
    const r = HR.data.resume(id);
    if (!r) return;
    HR.data.updateResume(id, { inTalentPool: !r.inTalentPool });
    await HR.data.persist();
    HR.refresh();
    HR.ui.toast(r.inTalentPool ? '已移入人才库' : '已移出人才库', 'success');
  }

  async function removeResume(id) {
    const r = HR.data.resume(id);
    if (!r) return;
    const ok = await HR.ui.confirm(
      '删除候选人',
      '确定要永久删除「' + r.name + '」吗？其关联的 ' + HR.data.appsOfResume(id).length + ' 条投递记录也会一起删除，且不可恢复。',
      '删除'
    );
    if (!ok) return;
    HR.data.removeResume(id);
    await HR.data.persist();
    HR.refresh();
    HR.ui.toast('已删除', 'success');
  }

  HR.pool = { ingestParsed, openDetail, openForm, openTag, toggleTalent, removeResume, importFromDialog };
  HR.register({ key: 'pool', label: '简历池', render: render });
})();