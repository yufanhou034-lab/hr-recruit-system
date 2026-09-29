/* 6. 面试评估 */
(function () {
  const HR = window.HR;
  const util = HR.util;
  const esc = util.esc;

  const CRITERIA = [
    { key: 'comm', label: '沟通表达' },
    { key: 'pro', label: '专业能力' },
    { key: 'stable', label: '稳定性' },
    { key: 'culture', label: '文化匹配' },
    { key: 'onboard', label: '到岗匹配' }
  ];
  const ROUNDS = ['HR 面', '业务面', '技术面', '终面'];
  const CONCLUSIONS = ['强烈推荐', '推荐', '待定', '不推荐'];

  const state = { appId: '' };

  function candidates() {
    return HR.data.raw.applications.filter((a) => a.status === 'pending_interview' || a.status === 'interviewing');
  }

  function render(el) {
    const list = candidates();
    if (!list.length) {
      el.innerHTML = '<div class="card">' + HR.ui.empty('📝', '当前没有「待面试 / 面试中」的候选人，先在初筛或看板里把候选人推进到待面试') + '</div>';
      return;
    }
    if (!state.appId || !HR.data.application(state.appId)) {
      state.appId = list[0].id;
    }
    const app = HR.data.application(state.appId);
    const r = HR.data.resume(app.resumeId);
    const j = HR.data.job(app.jobId);
    const history = (app.interviews || []).slice().reverse();

    el.innerHTML =
      '<div class="card">' +
      '<div class="toolbar">' +
      '<label class="muted small">选择候选人</label>' +
      '<select class="select" id="ivPerson" style="width:360px">' +
      list
        .map((a) => {
          const rr = HR.data.resume(a.resumeId);
          const jj = HR.data.job(a.jobId);
          return (
            '<option value="' + a.id + '"' + (a.id === state.appId ? ' selected' : '') + '>' +
            esc((rr ? rr.name : '已删除') + ' · ' + (jj ? jj.name : '未知岗位') + ' · ' + HR.data.statusLabel(a.status)) +
            '</option>'
          );
        })
        .join('') +
      '</select>' +
      '<span class="tag ' + (HR.STATUS[app.status] || {}).cls + '">' + esc(HR.data.statusLabel(app.status)) + '</span>' +
      '<span class="muted small">已有面试记录 ' + history.length + ' 轮</span>' +
      '</div></div>' +
      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h3>📝 结构化评分</h3></div>' +
      '<div class="field"><label>面试轮次</label><select class="select" id="ivRound">' +
      ROUNDS.map((x) => '<option value="' + x + '">' + x + '</option>').join('') +
      '</select></div>' +
      CRITERIA.map(
        (c) =>
          '<div class="rating-row"><span class="rating-label">' + esc(c.label) + '</span>' +
          '<input type="range" min="1" max="5" step="1" value="3" data-crit="' + c.key + '" />' +
          '<span class="rating-val" data-val="' + c.key + '">3</span></div>'
      ).join('') +
      '<div class="toolbar" style="margin-top:6px"><span class="muted small">平均分</span><strong id="ivAvg">3.0</strong><span class="muted small">/ 5</span></div>' +
      '<div class="field" style="margin-top:10px"><label>综合结论</label>' +
      CONCLUSIONS.map(
        (c, i) =>
          '<label class="tag" style="cursor:pointer;margin-right:6px"><input type="radio" name="ivConclusion" value="' + esc(c) + '"' + (i === 1 ? ' checked' : '') + ' /> ' + esc(c) + '</label>'
      ).join('') +
      '</div>' +
      '<div class="field"><label>优点</label><textarea class="textarea" id="ivPros" style="min-height:80px" placeholder="如：沟通条理清晰，实习经历与岗位高度相关"></textarea></div>' +
      '<div class="field"><label>不足 / 风险点</label><textarea class="textarea" id="ivCons" style="min-height:80px" placeholder="如：对加班接受度待确认"></textarea></div>' +
      '<div class="field"><label>面试官姓名</label><input class="input" id="ivName" placeholder="如：王敏" /></div>' +
      '<div class="toolbar"><button class="btn" id="ivSave">保存面试记录</button>' +
      '<button class="btn ghost" id="ivProfile">查看候选人档案</button></div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h3>📚 历史面试记录</h3></div>' +
      (history.length
        ? history
            .map(
              (iv) =>
                '<div style="border:1px solid var(--line-2);border-radius:8px;padding:10px 12px;margin-bottom:10px">' +
                '<div style="display:flex;justify-content:space-between;gap:8px"><strong>' + esc(iv.round) + '</strong>' +
                '<span class="muted small">' + util.fmtDateTime(iv.time) + '</span></div>' +
                '<div class="small" style="margin:4px 0">面试官：' + esc(iv.interviewer || '—') + ' · 平均分 <strong>' + esc(iv.average) + '</strong>/5 · 结论 <span class="tag blue">' + esc(iv.conclusion) + '</span></div>' +
                CRITERIA.map((c) => '<span class="tag">' + esc(c.label) + ' ' + esc((iv.scores || {})[c.key] || '-') + '</span>').join('') +
                (iv.pros ? '<div class="small" style="margin-top:6px"><strong>优点：</strong>' + esc(iv.pros) + '</div>' : '') +
                (iv.cons ? '<div class="small"><strong>不足：</strong>' + esc(iv.cons) + '</div>' : '') +
                '</div>'
            )
            .join('')
        : HR.ui.empty('📚', '还没有面试记录')) +
      '</div>' +
      '</div>';

    el.querySelector('#ivPerson').addEventListener('change', (e) => {
      state.appId = e.target.value;
      HR.refresh();
    });

    const form = el.querySelector('.grid-2 > .card');
    const sliders = [...form.querySelectorAll('input[type="range"]')];
    const avgEl = form.querySelector('#ivAvg');
    function updateAvg() {
      const vals = sliders.map((s) => Number(s.value));
      sliders.forEach((s) => {
        form.querySelector('[data-val="' + s.getAttribute('data-crit') + '"]').textContent = s.value;
      });
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      avgEl.textContent = avg.toFixed(1);
      return avg;
    }
    sliders.forEach((s) => s.addEventListener('input', updateAvg));

    form.querySelector('#ivSave').addEventListener('click', async () => {
      const scores = {};
      sliders.forEach((s) => (scores[s.getAttribute('data-crit')] = Number(s.value)));
      const interviewer = form.querySelector('#ivName').value.trim();
      const conclusionEl = form.querySelector('input[name="ivConclusion"]:checked');
      const record = {
        id: util.uid('iv'),
        round: form.querySelector('#ivRound').value,
        interviewer: interviewer,
        scores: scores,
        average: (Object.values(scores).reduce((a, b) => a + b, 0) / CRITERIA.length).toFixed(1),
        conclusion: conclusionEl ? conclusionEl.value : '待定',
        pros: form.querySelector('#ivPros').value.trim(),
        cons: form.querySelector('#ivCons').value.trim(),
        time: util.now()
      };
      if (!interviewer) {
        HR.ui.toast('请填写面试官姓名', 'error');
        return;
      }
      app.interviews = app.interviews || [];
      app.interviews.push(record);
      app.attended = true;
      if (app.status === 'pending_interview') app.status = 'interviewing';
      app.lastFollowUpAt = util.now();
      HR.data.addFollowUp(app.id, '【' + record.round + '】' + interviewer + ' 完成评估，平均分 ' + record.average + '/5，结论：' + record.conclusion);
      HR.data.applyFlags(app);
      await HR.data.persist();
      HR.refresh();
      HR.ui.toast('面试记录已保存，候选人状态已更新为「' + HR.data.statusLabel(app.status) + '」', 'success');
    });

    form.querySelector('#ivProfile').addEventListener('click', () => {
      if (r) HR.pool.openDetail(r.id);
    });
    void j;
  }

  HR.register({
    key: 'interview',
    label: '面试评估',
    icon: '📋',
    render: render,
    onShow(params) {
      if (params && params.appId) state.appId = params.appId;
    }
  });
})();