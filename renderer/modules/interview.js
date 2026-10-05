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
  /* 结论 → 单选按钮组的配色后缀（对应 .radio-chip.on-*） */
  const RADIO_KIND = { 强烈推荐: 'strong', 推荐: 'rec', 待定: 'pend', 不推荐: 'rej' };

  const state = { appId: '' };

  function candidates() {
    return HR.data.raw.applications.filter((a) => a.status === 'pending_interview' || a.status === 'interviewing');
  }

  function render(el) {
    const list = candidates();
    if (!list.length) {
      el.innerHTML =
        '<div class="card">' +
        HR.ui.empty(
          'message-square',
          '暂无待面试候选人',
          '当前没有「待面试 / 面试中」的候选人，先在初筛或看板里把候选人推进到待面试',
          '<button class="btn" id="ivGoScreen">' + HR.ico('clipboard-check') + ' 去初筛打分</button>'
        ) +
        '</div>';
      el.querySelector('#ivGoScreen').addEventListener('click', () => HR.goTo('screening'));
      return;
    }
    if (!state.appId || !HR.data.application(state.appId)) {
      state.appId = list[0].id;
    }
    const app = HR.data.application(state.appId);
    const r = HR.data.resume(app.resumeId);
    const j = HR.data.job(app.jobId);
    const qBank = (j && j.interviewQuestions) || [];
    const qMap = {};
    qBank.forEach((q) => (qMap[q.id] = q));
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
      '<div class="card"><div class="card-head"><h3>' + HR.ico('clipboard-check') + ' 结构化评分</h3></div>' +
      '<div class="field"><label>面试轮次</label><select class="select" id="ivRound">' +
      ROUNDS.map((x) => '<option value="' + x + '">' + x + '</option>').join('') +
      '</select></div>' +
      CRITERIA.map(
        (c) =>
          '<div class="rating-row"><span class="rating-label">' + esc(c.label) + '</span>' +
          '<span class="stars" data-crit="' + c.key + '">' +
          [1, 2, 3, 4, 5]
            .map((n) => '<button type="button" class="star' + (n <= 3 ? ' on' : '') + '" data-n="' + n + '" title="' + n + ' 分">★</button>')
            .join('') +
          '</span>' +
          '<span class="rating-val" data-val="' + c.key + '">3</span></div>'
      ).join('') +
      '<div class="toolbar" style="margin-top:6px"><span class="muted small">平均分</span><strong id="ivAvg">3.0</strong><span class="muted small">/ 5</span></div>' +
      '<div class="field" style="margin-top:10px"><label>结构化题库 <span class="muted small">（按所选轮次，来自岗位题库）</span></label>' +
      '<div id="ivQbox"></div></div>' +
      '<div class="field" style="margin-top:10px"><label>综合结论</label><div class="radio-group">' +
      CONCLUSIONS.map(
        (c, i) =>
          '<label class="radio-chip" data-kind="' + RADIO_KIND[c] + '"><input type="radio" name="ivConclusion" value="' + esc(c) + '"' + (i === 1 ? ' checked' : '') + ' /> ' + esc(c) + '</label>'
      ).join('') +
      '</div></div>' +
      '<div class="field"><label>优点</label><textarea class="textarea" id="ivPros" style="min-height:80px" placeholder="如：沟通条理清晰，实习经历与岗位高度相关"></textarea></div>' +
      '<div class="field"><label>不足 / 风险点</label><textarea class="textarea" id="ivCons" style="min-height:80px" placeholder="如：对加班接受度待确认"></textarea></div>' +
      '<div class="field"><label>面试官姓名</label><input class="input" id="ivName" placeholder="如：王敏" /></div>' +
      '<div class="toolbar"><button class="btn" id="ivSave">保存面试记录</button>' +
      '<button class="btn ghost" id="ivProfile">查看候选人档案</button></div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h3>' + HR.ico('file-text') + ' 历史面试记录</h3></div>' +
      (history.length
        ? history
            .map(
              (iv) =>
                '<div style="border:1px solid var(--line-2);border-radius:8px;padding:10px 12px;margin-bottom:10px">' +
                '<div style="display:flex;justify-content:space-between;gap:8px"><strong>' + esc(iv.round) + '</strong>' +
                '<span class="muted small">' + util.fmtDateTime(iv.time) + '</span></div>' +
                '<div class="small" style="margin:4px 0">面试官：' + esc(iv.interviewer || '—') + ' · 平均分 <strong>' + esc(iv.average) + '</strong>/5 · 结论 <span class="tag blue">' + esc(iv.conclusion) + '</span></div>' +
                CRITERIA.map((c) => '<span class="tag">' + esc(c.label) + ' ' + esc((iv.scores || {})[c.key] || '-') + '</span>').join('') +
                (iv.questionScores && iv.questionScores.length
                  ? '<div class="small" style="margin-top:6px"><strong>题库均分 ' + esc(iv.questionAvg || '—') + '/5</strong></div>' +
                    iv.questionScores
                      .map((q) => {
                        const qq = qMap[q.qid];
                        return '<div class="small" style="margin-left:4px">· ' +
                          (qq ? esc(util.truncate(qq.question, 26)) : '（题目已删除）') +
                          ' <span class="tag blue">' + esc(q.score) + ' 分</span>' +
                          (q.note ? ' <span class="muted">' + esc(q.note) + '</span>' : '') +
                          '</div>';
                      })
                      .join('')
                  : '') +
                (iv.pros ? '<div class="small" style="margin-top:6px"><strong>优点：</strong>' + esc(iv.pros) + '</div>' : '') +
                (iv.cons ? '<div class="small"><strong>不足：</strong>' + esc(iv.cons) + '</div>' : '') +
                '</div>'
            )
            .join('')
        : HR.ui.empty('file-text', '暂无面试记录', '在左侧完成结构化评分并保存后会展示在这里')) +
      '</div>' +
      '</div>';

    el.querySelector('#ivPerson').addEventListener('change', (e) => {
      state.appId = e.target.value;
      HR.refresh();
    });

    const form = el.querySelector('.grid-2 > .card');
    const starGroups = [...form.querySelectorAll('.stars')];
    const avgEl = form.querySelector('#ivAvg');

    /* 星级评分：默认 3 分，点击第 N 颗星即 N 分 */
    const scoreState = {};
    CRITERIA.forEach((c) => (scoreState[c.key] = 3));

    function paintStars() {
      starGroups.forEach((g) => {
        const key = g.getAttribute('data-crit');
        const v = scoreState[key];
        [...g.querySelectorAll('.star')].forEach((st) => {
          st.classList.toggle('on', Number(st.getAttribute('data-n')) <= v);
        });
        form.querySelector('[data-val="' + key + '"]').textContent = String(v);
      });
      avgEl.textContent = (CRITERIA.reduce((n, c) => n + scoreState[c.key], 0) / CRITERIA.length).toFixed(1);
    }
    starGroups.forEach((g) => {
      g.addEventListener('click', (e) => {
        const st = e.target.closest('.star');
        if (!st) return;
        scoreState[g.getAttribute('data-crit')] = Number(st.getAttribute('data-n'));
        paintStars();
      });
    });
    paintStars();

    /* ---------- 结构化题库（功能 5）----------
       按所选轮次展示岗位题库，面试官逐题打 1-5 分，自动算平均分。 */
    const qScoreState = {};
    function renderQbox() {
      const round = form.querySelector('#ivRound').value;
      const list = qBank.filter((q) => q.round === round);
      const box = form.querySelector('#ivQbox');
      Object.keys(qScoreState).forEach((k) => delete qScoreState[k]);
      if (!list.length) {
        box.innerHTML = '<div class="muted small">该轮次还没有配置题目，可在「岗位管理 → 编辑岗位 → 面试题库」里添加</div>';
        return;
      }
      box.innerHTML = list
        .map((q) => {
          qScoreState[q.id] = 3;
          return (
            '<div class="q-score">' +
            '<div class="q-title">' + esc(q.question) + '</div>' +
            '<div class="q-anchors">' +
            (q.anchor5 ? '<span class="tag green">5 分：' + esc(q.anchor5) + '</span>' : '') +
            (q.anchor3 ? '<span class="tag yellow">3 分：' + esc(q.anchor3) + '</span>' : '') +
            (q.anchor1 ? '<span class="tag red">1 分：' + esc(q.anchor1) + '</span>' : '') +
            '</div>' +
            '<div class="rating-row"><span class="rating-label">本题评分</span>' +
            '<span class="stars" data-q="' + esc(q.id) + '">' +
            [1, 2, 3, 4, 5].map((n) => '<button type="button" class="star on" data-n="' + n + '">★</button>').join('') +
            '</span><span class="rating-val" data-qval="' + esc(q.id) + '">3</span></div>' +
            '<input class="input q-note" data-qnote="' + esc(q.id) + '" placeholder="评语 / 追问记录（可选）" />' +
            '</div>'
          );
        })
        .join('');
      box.querySelectorAll('.stars').forEach((g) =>
        g.addEventListener('click', (e) => {
          const st = e.target.closest('.star');
          if (!st) return;
          qScoreState[g.getAttribute('data-q')] = Number(st.getAttribute('data-n'));
          paintQ();
        })
      );
      paintQ();
    }
    function paintQ() {
      const box = form.querySelector('#ivQbox');
      box.querySelectorAll('.stars').forEach((g) => {
        const qid = g.getAttribute('data-q');
        [...g.querySelectorAll('.star')].forEach((st) =>
          st.classList.toggle('on', Number(st.getAttribute('data-n')) <= qScoreState[qid])
        );
        const val = box.querySelector('[data-qval="' + qid + '"]');
        if (val) val.textContent = String(qScoreState[qid]);
      });
    }
    renderQbox();
    form.querySelector('#ivRound').addEventListener('change', renderQbox);

    /* 综合结论：彩色单选按钮组 */
    const chips = [...form.querySelectorAll('.radio-chip')];
    function paintChips() {
      chips.forEach((ch) => {
        ch.className = 'radio-chip';
        if (ch.querySelector('input').checked) ch.classList.add('on-' + ch.getAttribute('data-kind'));
      });
    }
    chips.forEach((ch) => ch.querySelector('input').addEventListener('change', paintChips));
    paintChips();

    form.querySelector('#ivSave').addEventListener('click', async () => {
      const scores = Object.assign({}, scoreState);
      const interviewer = form.querySelector('#ivName').value.trim();
      const conclusionEl = form.querySelector('input[name="ivConclusion"]:checked');
      /* 题库逐题得分（只取当前轮次的题目） */
      const questionScores = Object.keys(qScoreState).map((qid) => {
        const noteEl = form.querySelector('[data-qnote="' + qid + '"]');
        return { qid: qid, score: qScoreState[qid], note: noteEl ? noteEl.value.trim() : '' };
      });
      const qAvg = questionScores.length
        ? (questionScores.reduce((n, q) => n + q.score, 0) / questionScores.length).toFixed(1)
        : '';
      const record = {
        id: util.uid('iv'),
        round: form.querySelector('#ivRound').value,
        interviewer: interviewer,
        scores: scores,
        average: (Object.values(scores).reduce((a, b) => a + b, 0) / CRITERIA.length).toFixed(1),
        conclusion: conclusionEl ? conclusionEl.value : '待定',
        pros: form.querySelector('#ivPros').value.trim(),
        cons: form.querySelector('#ivCons').value.trim(),
        questionScores: questionScores,
        questionAvg: qAvg,
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
    render: render,
    onShow(params) {
      if (params && params.appId) state.appId = params.appId;
    }
  });
})();