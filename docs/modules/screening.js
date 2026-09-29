/* 4. 初筛打分 */
(function () {
  const HR = window.HR;
  const util = HR.util;
  const esc = util.esc;

  const state = { jobId: '', expanded: '' };

  function render(el) {
    const jobs = HR.data.jobs(false);
    if (!jobs.length) {
      el.innerHTML = '<div class="card">' + HR.ui.empty('🏢', '请先在「岗位管理」里创建至少一个在招岗位') + '</div>';
      return;
    }
    if (!state.jobId || !HR.data.job(state.jobId)) state.jobId = jobs[0].id;
    const job = HR.data.job(state.jobId);
    const apps = HR.data.appsOfJob(job.id);
    const poolResumes = HR.data.raw.resumes.filter((r) => !r.inTalentPool);
    const pendingAdd = poolResumes.filter((r) => !HR.data.appOf(r.id, job.id)).length;
    const scored = apps.filter((a) => a.score);
    const unscored = apps.filter((a) => !a.score);

    const sorted = apps.slice().sort((a, b) => {
      const sa = a.score ? a.score.composite : -Infinity;
      const sb = b.score ? b.score.composite : -Infinity;
      return sb - sa;
    });

    el.innerHTML =
      '<div class="card">' +
      '<div class="toolbar">' +
      '<label class="muted small">岗位</label>' +
      '<select class="select" id="scJob" style="width:220px">' +
      jobs.map((j) => '<option value="' + j.id + '"' + (j.id === state.jobId ? ' selected' : '') + '>' + esc(j.name) + '</option>').join('') +
      '</select>' +
      '<span class="tag ' + (job.archived ? '' : 'green') + '">' + (job.archived ? '已归档' : '在招') + '</span>' +
      '<span class="muted small">候选人 ' + apps.length + ' 人 · 已打分 ' + scored.length + ' 人 · 待打分 ' + unscored.length + ' 人</span>' +
      '<span class="spacer"></span>' +
      (pendingAdd ? '<button class="btn ghost" id="scAdd">＋ 从简历池加入待初筛（' + pendingAdd + '）</button>' : '') +
      '<button class="btn" id="scRun"' + (unscored.length ? '' : ' disabled') + '>🎯 开始初筛打分</button>' +
      '</div>' +
      '<div class="toolbar">' +
      '<button class="btn ghost" id="scPass">推荐项一键转「待面试」</button>' +
      '<button class="btn ghost" id="scReject">淘汰项一键转人才库</button>' +
      '<button class="btn ghost" id="scExport">📤 导出 CSV</button>' +
      '<span class="muted small">规则分：必备 +20/−15、加分 +10、排除直接淘汰；综合分 = 规则分 + JD 匹配度 × 0.3；≥60 推荐 / ≥30 待定</span>' +
      '</div>' +
      '<div class="toolbar"><span class="muted small">JD 正文：' + (job.jd ? esc(util.truncate(job.jd.replace(/\s+/g, ' '), 70)) : '<span class="text-red">未填写，匹配度将按 0 计算</span>') + '</span></div>' +
      '</div>' +
      (sorted.length
        ? '<div class="table-wrap"><table><thead><tr>' +
          '<th style="width:52px">排名</th><th>姓名</th><th>学校</th><th class="mono">规则分</th>' +
          '<th class="mono">JD 匹配度</th><th class="mono">综合分</th><th>判定</th><th>命中项</th><th>缺失项</th><th style="width:80px">操作</th>' +
          '</tr></thead><tbody>' +
          sorted.map((a, i) => rowHtml(a, a.score ? i + 1 : '—')).join('') +
          '</tbody></table></div>'
        : HR.ui.empty('🎯', '该岗位还没有候选人，点「从简历池加入待初筛」把简历池的人加进来'));

    el.querySelector('#scJob').addEventListener('change', (e) => {
      state.jobId = e.target.value;
      state.expanded = '';
      HR.refresh();
    });
    const addBtn = el.querySelector('#scAdd');
    if (addBtn) addBtn.addEventListener('click', () => addFromPool(job.id));
    el.querySelector('#scRun').addEventListener('click', () => runScoring(job));
    el.querySelector('#scPass').addEventListener('click', () => batchToInterview(job.id));
    el.querySelector('#scReject').addEventListener('click', () => batchToTalent(job.id));
    el.querySelector('#scExport').addEventListener('click', () => exportCsv(job));

    el.querySelector('tbody').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      const tr = e.target.closest('tr[data-app]');
      if (btn) {
        const id = btn.getAttribute('data-id');
        if (btn.getAttribute('data-act') === 'detail') {
          const a = HR.data.application(id);
          const r = a && HR.data.resume(a.resumeId);
          if (r) HR.pool.openDetail(r.id);
        }
        e.stopPropagation();
        return;
      }
      if (tr) {
        const id = tr.getAttribute('data-app');
        state.expanded = state.expanded === id ? '' : id;
        HR.refresh();
      }
    });
  }

  function rowHtml(a, rank) {
    const r = HR.data.resume(a.resumeId);
    const s = a.score;
    const hitTitle = s ? s.hitMust.concat(s.hitPlus).map((h) => h.text + ' ← 命中「' + h.why + '」').join('\n') : '';
    const missTitle = s ? s.missMust.map((m) => m.text + (m.veto ? '（一票否决）' : '')).concat(s.excludeHits.map((x) => '排除项：' + x.text)).join('\n') : '';
    const hitText = s
      ? (s.hitMust.length || s.hitPlus.length ? s.hitMust.concat(s.hitPlus).map((h) => h.text).join('；') : '—')
      : '未打分';
    const missText = s
      ? (s.missMust.length || s.excludeHits.length
          ? s.missMust.map((m) => m.text + (m.veto ? '⛔' : '')).concat(s.excludeHits.map((x) => '排除：' + x.text)).join('；')
          : '—')
      : '未打分';
    const expanded = state.expanded === a.id;
    let html =
      '<tr data-app="' + a.id + '" style="cursor:pointer">' +
      '<td class="mono">' + rank + '</td>' +
      '<td class="nowrap"><strong>' + esc(r ? r.name : '（简历已删除）') + '</strong>' +
      (s && s.eliminated ? ' <span class="tag red">淘汰</span>' : '') + '</td>' +
      '<td>' + esc(r ? r.school || '—' : '—') + '</td>' +
      '<td class="mono">' + (s ? s.ruleScore : '—') + '</td>' +
      '<td class="mono">' + (s ? s.jdSim + '%' : '—') + '</td>' +
      '<td class="mono"><strong>' + (s ? s.composite : '—') + '</strong></td>' +
      '<td>' + (s ? '<span class="badge ' + HR.scoring.verdictClass(s.verdict) + '">' + esc(s.verdict) + '</span>' : '<span class="muted">—</span>') + '</td>' +
      '<td title="' + esc(hitTitle) + '">' + esc(util.truncate(hitText, 26)) + '</td>' +
      '<td title="' + esc(missTitle) + '">' + esc(util.truncate(missText, 26)) + '</td>' +
      '<td class="nowrap"><button class="btn-link" data-act="detail" data-id="' + a.id + '">详情</button>' +
      '<button class="btn-link">' + (expanded ? '收起' : '展开') + '</button></td>' +
      '</tr>';

    if (expanded) {
      const text = r ? r.text || '（无原文）' : '（简历已删除）';
      const words = s ? s.matchedWords : [];
      html +=
        '<tr><td colspan="10" style="background:#fbfcfe">' +
        '<div class="detail-2col">' +
        '<div><div class="muted small" style="margin-bottom:6px">简历原文（命中词已高亮）</div>' +
        '<div class="resume-text">' + (words.length ? HR.scoring.highlight(text, words) : esc(text)) + '</div></div>' +
        '<div><div class="muted small" style="margin-bottom:6px">打分明细</div>' +
        (s ? detailHtml(s) : '<div class="muted small">尚未打分</div>') +
        '<div class="toolbar" style="margin-top:10px">' +
        '<button class="btn small" data-act="detail" data-id="' + a.id + '">看候选人档案</button>' +
        '</div></div></div></td></tr>';
    }
    return html;
  }

  function detailHtml(s) {
    const line = (label, arr, render) =>
      '<div style="margin-bottom:8px"><div class="muted small">' + label + '（' + arr.length + '）</div>' +
      (arr.length ? arr.map(render).join('') : '<span class="muted small">无</span>') + '</div>';
    return (
      '<div class="kv" style="margin-bottom:10px">' +
      '<dt>规则分</dt><dd class="mono">' + s.ruleScore + '</dd>' +
      '<dt>JD 匹配度</dt><dd class="mono">' + s.jdSim + '% → ×0.3 = ' + s.jdScore + '</dd>' +
      '<dt>综合分</dt><dd class="mono"><strong>' + s.composite + '</strong></dd>' +
      '<dt>判定</dt><dd><span class="badge ' + HR.scoring.verdictClass(s.verdict) + '">' + esc(s.verdict) + '</span>' +
      (s.eliminated ? ' <span class="tag red">' + (s.excludeHits.length ? '命中排除项' : '一票否决未命中') + '</span>' : '') + '</dd>' +
      '</div>' +
      line('命中必备项', s.hitMust, (h) => '<div><span class="tag green">' + esc(h.text) + '</span> <span class="muted small">命中「' + esc(h.why) + '」</span></div>') +
      line('缺失必备项', s.missMust, (m) => '<div><span class="tag ' + (m.veto ? 'red' : 'yellow') + '">' + esc(m.text) + (m.veto ? '（一票否决）' : '') + '</span></div>') +
      line('命中加分项', s.hitPlus, (p) => '<div><span class="tag blue">' + esc(p.text) + '</span> <span class="muted small">命中「' + esc(p.why) + '」</span></div>') +
      line('命中排除项', s.excludeHits, (x) => '<div><span class="tag red">' + esc(x.text) + '</span> <span class="muted small">命中「' + esc(x.why) + '」</span></div>')
    );
  }

  async function addFromPool(jobId) {
    let n = 0;
    HR.data.raw.resumes.forEach((r) => {
      if (r.inTalentPool) return;
      if (HR.data.appOf(r.id, jobId)) return;
      HR.data.addApplication({ resumeId: r.id, jobId: jobId, status: 'pending_screen' });
      n++;
    });
    await HR.data.persist();
    HR.refresh();
    HR.ui.toast('已加入 ' + n + ' 位候选人到待初筛', 'success');
  }

  async function runScoring(job) {
    const targets = HR.data.appsOfJob(job.id).filter((a) => !a.score);
    if (!targets.length) {
      HR.ui.toast('没有待打分的候选人', 'error');
      return;
    }
    HR.ui.setStatus('正在初筛打分…');
    targets.forEach((a) => {
      const r = HR.data.resume(a.resumeId);
      if (!r) return;
      a.score = HR.scoring.screenResume(r.text || '', job.rules, job.jd || '');
      if (!a.score.eliminated && a.score.verdict !== '不推荐') a.passedScreen = true;
    });
    await HR.data.persist();
    HR.ui.setStatus('就绪');
    HR.refresh();
    HR.ui.toast('已完成 ' + targets.length + ' 位候选人的初筛打分', 'success');
  }

  async function batchToInterview(jobId) {
    const targets = HR.data.appsOfJob(jobId).filter((a) => a.score && a.score.verdict === '推荐' && a.status === 'pending_screen');
    if (!targets.length) {
      HR.ui.toast('没有处于「待初筛」且判定为推荐的候选人', 'error');
      return;
    }
    const ok = await HR.ui.confirm('批量转待面试', '将 ' + targets.length + ' 位「推荐」候选人状态改为「待面试」？', '确认', '');
    if (!ok) return;
    targets.forEach((a) => HR.data.setStatus(a.id, 'pending_interview'));
    await HR.data.persist();
    HR.refresh();
    HR.ui.toast('已转「待面试」' + targets.length + ' 人', 'success');
  }

  async function batchToTalent(jobId) {
    const targets = HR.data.appsOfJob(jobId).filter((a) => a.score && a.score.verdict === '不推荐');
    if (!targets.length) {
      HR.ui.toast('没有判定为「不推荐」的候选人', 'error');
      return;
    }
    const ok = await HR.ui.confirm('批量淘汰入人才库', '将 ' + targets.length + ' 位「不推荐」候选人标记为已淘汰并移入人才库？', '确认转入', '');
    if (!ok) return;
    targets.forEach((a) => {
      HR.data.setStatus(a.id, 'rejected');
      const r = HR.data.resume(a.resumeId);
      if (r) r.inTalentPool = true;
    });
    await HR.data.persist();
    HR.refresh();
    HR.ui.toast('已淘汰 ' + targets.length + ' 人并移入人才库', 'success');
  }

  async function exportCsv(job) {
    const apps = HR.data
      .appsOfJob(job.id)
      .slice()
      .sort((a, b) => ((b.score ? b.score.composite : -Infinity) - (a.score ? a.score.composite : -Infinity)));
    if (!apps.length) {
      HR.ui.toast('没有可导出的数据', 'error');
      return;
    }
    const rows = [
      ['排名', '姓名', '手机号', '学校', '学历', '专业', '规则分', 'JD匹配度', '综合分', '判定', '命中必备项', '缺失必备项', '命中加分项', '排除项命中']
    ];
    apps.forEach((a, i) => {
      const r = HR.data.resume(a.resumeId) || {};
      const s = a.score;
      rows.push([
        i + 1,
        r.name || '',
        r.phone || '',
        r.school || '',
        r.degree || '',
        r.major || '',
        s ? s.ruleScore : '',
        s ? s.jdSim + '%' : '',
        s ? s.composite : '',
        s ? s.verdict : '未打分',
        s ? s.hitMust.map((h) => h.text).join('；') : '',
        s ? s.missMust.map((m) => m.text).join('；') : '',
        s ? s.hitPlus.map((h) => h.text).join('；') : '',
        s ? s.excludeHits.map((x) => x.text).join('；') : ''
      ]);
    });
    const csv = util.toCsv(rows);
    const res = await window.api.saveTextFile({
      title: '导出初筛结果',
      defaultPath: '初筛结果_' + job.name + '_' + util.fmtDate(util.now()) + '.csv',
      filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
      content: csv,
      bom: true
    });
    if (res.canceled) return;
    HR.ui.toast('已导出：' + res.path, 'success');
  }

  HR.register({
    key: 'screening',
    label: '初筛打分',
    icon: '🎯',
    render: render,
    onShow(params) {
      if (params && params.jobId) {
        state.jobId = params.jobId;
        state.expanded = '';
      }
    }
  });
})();