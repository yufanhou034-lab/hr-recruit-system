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
      '<button class="btn" id="tpMatch"' + (jobs.length ? '' : ' disabled') + '>' + HR.ico('search') + ' 新岗位匹配</button>' +
      '</div>' +
      '<div class="muted small">「新岗位匹配」会按关键词相似度（字符 2-gram 余弦）从人才库里挑出与该岗位 JD 最匹配的 5 个人。</div>' +
      '</div>' +
      (state.matches ? matchPanelHtml() : '') +
      (rows.length
        ? '<div class="job-grid">' + rows.map(talentCardHtml).join('') + '</div>'
        : '<div class="card">' +
          HR.ui.empty(
            'database',
            '人才库还是空的',
            '可在简历池把候选人「移入人才库」',
            '<button class="btn" id="tpGoPool">' + HR.ico('users') + ' 去简历池</button>'
          ) +
          '</div>');

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
    const goPoolBtn = el.querySelector('#tpGoPool');
    if (goPoolBtn) goPoolBtn.addEventListener('click', () => HR.goTo('pool'));

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
      return '<div class="card"><div class="card-head"><h3>' + HR.ico('search') + ' 匹配结果 · ' + esc(job ? job.name : '') + '</h3></div>' +
        HR.ui.empty('search', '暂无匹配候选人', '人才库里暂时没有与该岗位 JD 匹配的候选人') + '</div>';
    }
    return (
      '<div class="card"><div class="card-head"><h3>' + HR.ico('search') + ' 匹配结果 · ' + esc(job ? job.name : '') + '</h3>' +
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

  /* 人才库候选人卡片（含标签云） */
  function talentCardHtml(r) {
    const tags = (r.tags || []).length
      ? r.tags.map((t) => '<span class="tag blue">' + esc(t) + '</span>').join('')
      : '<span class="tag gray">暂无标签</span>';
    return (
      '<div class="job-card">' +
      '<div class="kcard-top">' +
      '<span class="kavatar">' + esc(String(r.name || '?').slice(0, 1)) + '</span>' +
      '<div><div class="cell-name">' + esc(r.name) + '</div>' +
      '<div class="cell-sub">' + esc(r.school || '学校未识别') + ' · ' + esc(r.degree || '—') + ' · ' + esc(r.major || '—') + '</div></div>' +
      '</div>' +
      '<div class="job-meta">' +
      '<span class="mono">' + HR.ico('message-square') + ' ' + esc(util.maskPhone(r.phone)) + '</span>' +
      '<span>' + HR.ico('database') + ' ' + esc(r.source || '其他') + '</span>' +
      '<span>' + HR.ico('file-text') + ' ' + util.fmtDate(r.createdAt) + '</span>' +
      '</div>' +
      '<div>' + tags + '</div>' +
      '<div class="job-actions">' +
      '<button class="btn small" data-act="pick" data-id="' + r.id + '">捞回简历池</button>' +
      '<button class="btn small ghost" data-act="view" data-id="' + r.id + '">查看</button>' +
      '<button class="btn small ghost" data-act="del" data-id="' + r.id + '">永久删除</button>' +
      '</div></div>'
    );
  }

  HR.register({ key: 'talent', label: '人才库', render: render });
})();