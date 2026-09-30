/* 7. 人才库 */
(function () {
  const HR = window.HR;
  const util = HR.util;
  const esc = util.esc;

  const state = { tag: '', matchJobId: '', matches: null };

  function talentList() {
    return HR.data.raw.candidates
      .filter((r) => r.inTalentPool)
      .filter((r) => !state.tag || (r.tags || []).includes(state.tag))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function render(el) {
    const all = HR.data.raw.candidates.filter((r) => r.inTalentPool);
    const rows = talentList();
    const tags = HR.data.allTags();
    const jobs = HR.data.jobs(false);

    el.innerHTML =
      '<div class="card">' +
      '<div class="toolbar">' +
      '<strong>人才库</strong>' +
      '<span class="muted small">共 ' + all.length + ' 人</span>' +
      '<select class="select" id="tpTag" style="width:150px">' +
      '<option value="">全部标签</option>' +
      tags.map((t) => '<option value="' + esc(t) + '"' + (state.tag === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') +
      '</select>' +
      '<span class="spacer"></span>' +
      '<select class="select" id="tpJob" style="width:200px">' +
      (jobs.length
        ? jobs.map((j) => '<option value="' + j.id + '"' + (state.matchJobId === j.id ? ' selected' : '') + '>' + esc(j.name) + '</option>').join('')
        : '<option value="">（没有在招岗位）</option>') +
      '</select>' +
      '<button class="btn" id="tpMatch"' + (jobs.length ? '' : ' disabled') + '>🔍 新岗位匹配</button>' +
      '</div>' +
      '<div class="muted small">「新岗位匹配」会按关键词相似度（字符 2-gram 余弦）从人才库里挑出与该岗位 JD 最匹配的 5 个人。</div>' +
      '</div>' +
      (state.matches ? matchPanelHtml() : '') +
      '<div class="table-wrap">' +
      (rows.length
        ? '<table><thead><tr>' +
          '<th>姓名</th><th>电话</th><th>学校</th><th>学历 / 专业</th><th>来源</th><th>标签</th><th>入库时间</th><th style="width:180px">操作</th>' +
          '</tr></thead><tbody>' +
          rows
            .map(
              (r) =>
                '<tr>' +
                '<td class="nowrap"><strong>' + esc(r.name) + '</strong></td>' +
                '<td class="nowrap mono">' + esc(util.maskPhone(r.phone)) + '</td>' +
                '<td>' + esc(r.school || '—') + '</td>' +
                '<td>' + esc((r.degree || '—') + ' · ' + (r.major || '—')) + '</td>' +
                '<td class="nowrap">' + esc(r.source || '其他') + '</td>' +
                '<td>' + ((r.tags || []).length ? r.tags.map((t) => '<span class="tag blue">' + esc(t) + '</span>').join('') : '<span class="muted">—</span>') + '</td>' +
                '<td class="nowrap">' + util.fmtDate(r.createdAt) + '</td>' +
                '<td class="nowrap">' +
                '<button class="btn-link" data-act="pick" data-id="' + r.id + '">捞回简历池</button>' +
                '<button class="btn-link" data-act="view" data-id="' + r.id + '">查看</button>' +
                '<button class="btn-link danger" data-act="del" data-id="' + r.id + '">永久删除</button>' +
                '</td></tr>'
            )
            .join('') +
          '</tbody></table>'
        : HR.ui.empty('⭐', '人才库里还没有候选人，可在简历池把候选人「移入人才库」')) +
      '</div>';

    el.querySelector('#tpTag').addEventListener('change', (e) => {
      state.tag = e.target.value;
      HR.refresh();
    });
    const jobSelect = el.querySelector('#tpJob');
    jobSelect.addEventListener('change', (e) => {
      state.matchJobId = e.target.value;
      state.matches = null;
    });
    el.querySelector('#tpMatch').addEventListener('click', () => runMatch(jobSelect.value));

    el.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const act = btn.getAttribute('data-act');
      if (act === 'pick') {
        HR.data.updateResume(id, { inTalentPool: false });
        await HR.data.persist();
        HR.refresh();
        HR.ui.toast('已捞回简历池', 'success');
      } else if (act === 'view') {
        HR.pool.openDetail(id);
      } else if (act === 'del') {
        const r = HR.data.resume(id);
        const ok = await HR.ui.confirm('永久删除', '确定永久删除「' + r.name + '」吗？该操作不可恢复，关联投递记录会一起删除。', '永久删除');
        if (!ok) return;
        HR.data.removeResume(id);
        await HR.data.persist();
        HR.refresh();
        HR.ui.toast('已删除', 'success');
      }
    });
  }

  function matchPanelHtml() {
    const job = HR.data.job(state.matchJobId);
    if (!state.matches.length) {
      return '<div class="card"><div class="card-head"><h3>🔍 匹配结果 · ' + esc(job ? job.name : '') + '</h3></div>' +
        HR.ui.empty('🙈', '人才库里暂时没有与该岗位 JD 匹配的候选人') + '</div>';
    }
    return (
      '<div class="card"><div class="card-head"><h3>🔍 匹配结果 · ' + esc(job ? job.name : '') + '</h3>' +
      '<span class="muted small">按 JD 相似度排序，取前 5 名</span></div>' +
      state.matches
        .map((m, i) => {
          const r = HR.data.resume(m.resumeId);
          if (!r) return '';
          return (
            '<div style="display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid var(--line-2)">' +
            '<span class="tag blue">TOP ' + (i + 1) + '</span>' +
            '<strong style="width:86px">' + esc(r.name) + '</strong>' +
            '<span class="muted small" style="width:150px">' + esc(r.school || '—') + ' · ' + esc(r.degree || '—') + '</span>' +
            '<span class="bar-track" style="flex:1;height:12px;background:var(--line-2);border-radius:6px;overflow:hidden">' +
            '<span class="bar-fill" style="display:block;height:100%;width:' + Math.min(100, m.score) + '%;background:var(--blue)"></span></span>' +
            '<span class="mono" style="width:64px;text-align:right">' + m.score.toFixed(1) + '%</span>' +
            '<button class="btn small" data-act="pick" data-id="' + r.id + '">捞回简历池</button>' +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function runMatch(jobId) {
    const job = HR.data.job(jobId);
    if (!job) {
      HR.ui.toast('请先选择一个岗位', 'error');
      return;
    }
    if (!job.jd || !job.jd.trim()) {
      HR.ui.toast('该岗位还没有填写 JD 正文，无法计算匹配度', 'error');
      return;
    }
    const scored = HR.data.raw.candidates
      .filter((r) => r.inTalentPool && r.text)
      .map((r) => ({ resumeId: r.id, score: HR.scoring.jdSimilarity(job.jd, r.text) * 100 }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    state.matchJobId = jobId;
    state.matches = scored;
    HR.refresh();
  }

  HR.register({ key: 'talent', label: '人才库', icon: '⭐', render: render });
})();