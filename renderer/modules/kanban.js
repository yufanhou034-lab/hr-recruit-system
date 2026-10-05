/* 5. 跟进看板（Kanban，HTML5 拖放换列） */
(function () {
  const HR = window.HR;
  const util = HR.util;
  const esc = util.esc;

  function render(el) {
    const cols = HR.STATUS_ORDER.map((key) => {
      const list = HR.data.raw.applications
        .filter((a) => a.status === key)
        .sort((a, b) => String(b.lastFollowUpAt).localeCompare(String(a.lastFollowUpAt)));
      return (
        '<div class="kcol" data-status="' + key + '">' +
        '<div class="kcol-head"><span>' + esc(HR.STATUS[key].label) + '</span>' +
        '<span class="kcol-count">' + list.length + '</span></div>' +
        (list.length ? list.map(cardHtml).join('') : '<div class="muted small" style="padding:6px 2px">拖拽卡片到这里</div>') +
        '</div>'
      );
    }).join('');
    const rem = HR.reminder ? HR.reminder.due() : [];

    el.innerHTML =
      '<div class="card" style="padding:12px 16px">' +
      '<div class="toolbar" style="margin:0">' +
      '<strong>跟进看板</strong>' +
      '<span class="muted small">拖动卡片即可更换阶段；右上角红点表示超过 3 天未跟进</span>' +
      '<span class="spacer"></span>' +
      '<span class="muted small">共 ' + HR.data.raw.applications.length + ' 条投递记录</span>' +
      '</div></div>' +
      reminderBannerHtml(rem) +
      '<div class="kanban">' + cols + '</div>';

    /* 卡片上的操作按钮：offer 详情 / 入职材料清单。
     监听挂在每次渲染新建的 .kanban 容器上，避免重复渲染时监听器叠加。 */
    const kanbanEl = el.querySelector('.kanban');
    kanbanEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      e.stopPropagation();
      const id = b.getAttribute('data-id');
      if (b.getAttribute('data-act') === 'offer') openOffer(id);
      else if (b.getAttribute('data-act') === 'checklist') openChecklist(id);
    });

    el.querySelectorAll('.kcard').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('click', (e) => {
        if (e.target.closest('button[data-act]')) return; // 按钮自己处理
        openDetail(card.getAttribute('data-id'));
      });
    });

    el.querySelectorAll('.kcol').forEach((col) => {
      col.addEventListener('dragover', (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('over');
      });
      col.addEventListener('dragleave', () => col.classList.remove('over'));
      col.addEventListener('drop', async (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length) return;
        e.preventDefault();
        col.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        const status = col.getAttribute('data-status');
        const app = HR.data.application(id);
        if (!app || app.status === status) return;
        HR.data.setStatus(id, status);
        await HR.data.persist();
        HR.refresh();
        HR.ui.toast('已移动到「' + HR.data.statusLabel(status) + '」', 'success');
      });
    });

    /* 提醒条：点「知道了」标记已读；点正文打开对应 Offer */
    el.querySelectorAll('[data-remack]').forEach((b) =>
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const r = rem[Number(b.getAttribute('data-remack'))];
        if (!r) return;
        await HR.reminder.ack(r.appId, r.key);
        HR.refresh();
      })
    );
    el.querySelectorAll('[data-remopen]').forEach((li) =>
      li.addEventListener('click', () => {
        const r = rem[Number(li.getAttribute('data-remopen'))];
        if (r) openOffer(r.appId);
      })
    );
  }

  /** 顶部黄色提醒条（offer 跟进节点） */
  function reminderBannerHtml(list) {
    if (!list.length) return '';
    return (
      '<div class="card rem-banner">' +
      '<div class="rem-head">' + HR.ico('alert-triangle', 16) + ' Offer 跟进提醒' +
      '<span class="badge pend">' + list.length + '</span>' +
      '<span class="muted small">点「知道了」后不再重复提醒</span></div>' +
      '<ul class="rem-list">' +
      list
        .map(
          (r, i) =>
            '<li data-remopen="' + i + '">' +
            '<span class="rem-text">' + esc(r.text) + '</span>' +
            '<button class="btn small ghost" data-remack="' + i + '">知道了</button>' +
            '</li>'
        )
        .join('') +
      '</ul></div>'
    );
  }

  function cardHtml(a) {
    const r = HR.data.resume(a.resumeId);
    const j = HR.data.job(a.jobId);
    const overdue = HR.data.isOverdue(a, 3);
    const name = r ? r.name : '（简历已删除）';
    const score = a.score ? a.score.composite : null;
    const scoreCls = score === null ? '' : score >= 60 ? 'rec' : score >= 30 ? 'pend' : 'rej';

    /* Offer 卡片：预计入职倒计时 / 逾期标红（功能 3） */
    let strip = '';
    if (a.status === 'offered') {
      const o = a.offer || {};
      const du = o.expectedOnboard ? util.daysUntil(o.expectedOnboard) : null;
      let txt;
      let cls = '';
      if (du === null) {
        txt = HR.ico('calendar', 13) + ' 未填预计入职';
      } else if (du > 0) {
        txt = HR.ico('calendar', 13) + ' 还有 ' + du + ' 天入职';
      } else if (du === 0) {
        txt = HR.ico('calendar', 13) + ' 今天入职';
      } else {
        txt = HR.ico('alert-triangle', 13) + ' 已逾期 ' + -du + ' 天';
        cls = ' overdue-strip';
      }
      strip = '<button type="button" class="kcard-strip' + cls + '" data-act="offer" data-id="' + a.id + '" title="打开 Offer 详情">' + txt + '</button>';
    } else if (a.status === 'hired' && Array.isArray(a.onboardChecklist) && a.onboardChecklist.length) {
      const done = a.onboardChecklist.filter((x) => x.done).length;
      strip =
        '<button type="button" class="kcard-strip" data-act="checklist" data-id="' + a.id + '" title="勾选入职材料">' +
        HR.ico('check-square', 13) + ' 材料 ' + done + '/' + a.onboardChecklist.length + '</button>';
    }

    return (
      '<div class="kcard' + (overdue ? ' overdue' : '') + '" draggable="true" data-id="' + a.id + '">' +
      '<div class="kcard-top">' +
      '<span class="kavatar">' + esc(name.slice(0, 1)) + '</span>' +
      '<span class="kcard-title">' + esc(name) +
      (overdue ? ' <span class="dot-overdue" title="超过 3 天未跟进"></span>' : '') + '</span>' +
      '</div>' +
      '<div class="kcard-sub">' + esc(j ? j.name : '未知岗位') + '</div>' +
      strip +
      '<div class="kcard-foot">' +
      (score === null
        ? '<span class="muted">未打分</span>'
        : '<span class="kcard-score badge ' + scoreCls + '">综合分 ' + score + '</span>') +
      '<span' + (overdue ? ' class="text-red"' : '') + '>' + util.fromNow(a.lastFollowUpAt) + '</span>' +
      '</div></div>'
    );
  }

  /* ---------------- 详情弹窗 ---------------- */
  function openDetail(appId) {
    const a = HR.data.application(appId);
    if (!a) return;
    const r = HR.data.resume(a.resumeId);
    const j = HR.data.job(a.jobId);
    const interviews = a.interviews || [];
    const templates = HR.data.raw.followUpTemplates || [];

    const body =
      '<div class="detail-2col">' +
      '<div>' +
      '<div class="muted small" style="margin-bottom:6px">候选人档案摘要</div>' +
      '<dl class="kv">' +
      '<dt>姓名</dt><dd><strong>' + esc(r ? r.name : '—') + '</strong></dd>' +
      '<dt>岗位</dt><dd>' + esc(j ? j.name : '—') + '</dd>' +
      '<dt>状态</dt><dd><span class="tag ' + (HR.STATUS[a.status] || {}).cls + '">' + esc(HR.data.statusLabel(a.status)) + '</span></dd>' +
      '<dt>手机号</dt><dd class="mono">' + esc(r ? util.maskPhone(r.phone) : '—') + '</dd>' +
      '<dt>邮箱</dt><dd>' + esc(r && r.email ? r.email : '—') + '</dd>' +
      '<dt>学校</dt><dd>' + esc(r ? r.school || '—' : '—') + '</dd>' +
      '<dt>学历/专业</dt><dd>' + esc(r ? (r.degree || '—') + ' · ' + (r.major || '—') : '—') + '</dd>' +
      '<dt>综合分</dt><dd class="mono">' + (a.score ? a.score.composite + '（' + a.score.verdict + '）' : '未打分') + '</dd>' +
      '<dt>最后跟进</dt><dd>' + util.fmtDateTime(a.lastFollowUpAt) + ' · ' + util.fromNow(a.lastFollowUpAt) + '</dd>' +
      '<dt>下次跟进</dt><dd>' + esc(a.nextFollowUpAt || '未设置') + '</dd>' +
      '</dl>' +
      (interviews.length
        ? '<div class="muted small" style="margin:10px 0 6px">面试记录（' + interviews.length + '）</div>' +
          interviews
            .map(
              (iv) =>
                '<div style="border:1px solid var(--line-2);border-radius:8px;padding:8px 10px;margin-bottom:6px">' +
                '<div class="small"><strong>' + esc(iv.round) + '</strong> · ' + esc(iv.interviewer || '未填面试官') + ' · ' + util.fmtDateTime(iv.time) + '</div>' +
                '<div class="small">结论：<span class="tag blue">' + esc(iv.conclusion) + '</span> 均分 ' + esc(iv.average) + '/5</div>' +
                '</div>'
            )
            .join('')
        : '<div class="muted small" style="margin-top:10px">暂无面试记录</div>') +
      '</div>' +
      '<div>' +
      '<div class="muted small" style="margin-bottom:6px">跟进记录</div>' +
      '<ul class="timeline" id="tlList">' +
      ((a.followUps || []).length
        ? a.followUps
            .slice()
            .reverse()
            .map((f) => {
              const ft = HR.FOLLOWUP_TYPES[f.type] || HR.FOLLOWUP_TYPES.wechat;
              return (
                '<li><div class="tl-time">' + util.fmtDateTime(f.time) +
                ' <span class="fu-type">' + HR.ico(ft.icon, 12) + ' ' + esc(ft.label) + '</span>' +
                (f.nextDate ? ' <span class="muted">· 下次 ' + esc(f.nextDate) + '</span>' : '') +
                '</div><div class="tl-text">' + esc(f.note) + '</div></li>'
              );
            })
            .join('')
        : '<li class="muted small">还没有跟进记录</li>') +
      '</ul>' +
      '<div class="field" style="margin-top:12px">' +
      '<label>新增备注</label>' +
      '<div class="toolbar" style="margin-bottom:6px">' +
      '<select class="select" id="fuType" style="width:96px" title="跟进方式">' +
      HR.FOLLOWUP_TYPE_ORDER.map((k) => '<option value="' + k + '">' + esc(HR.FOLLOWUP_TYPES[k].label) + '</option>').join('') +
      '</select>' +
      (templates.length
        ? '<select class="select" id="fuTpl" style="width:230px" title="插入话术模板"><option value="">插入话术模板…</option>' +
          templates.map((t, i) => '<option value="' + i + '">' + esc(util.truncate(t, 22)) + '</option>').join('') +
          '</select>'
        : '<span class="muted small">可在「设置 → 快捷话术模板」维护常用话术</span>') +
      '</div>' +
      '<textarea class="textarea" id="fuNote" style="min-height:72px" placeholder="如：电话沟通顺利，候选人期望薪资 12k，已安排 3 月 5 日面试"></textarea>' +
      '</div>' +
      '<div class="field"><label>下次跟进日期</label>' +
      '<input class="input" type="date" id="fuDate" value="' + esc(a.nextFollowUpAt || '') + '" /></div>' +
      '<div class="toolbar">' +
      '<button class="btn small" id="fuSave">保存跟进</button>' +
      '<button class="btn small ghost" id="mailInvite">生成约面邮件</button>' +
      '<button class="btn small ghost" id="mailReject">生成婉拒邮件</button>' +
      '</div>' +
      '<div class="field" id="mailBox" style="display:none;margin-top:10px">' +
      '<label>邮件内容（可编辑）</label>' +
      '<textarea class="textarea" id="mailText" style="min-height:180px"></textarea>' +
      '<button class="btn small" id="mailCopy" style="margin-top:6px">' + HR.ico('copy') + ' 复制到剪贴板</button>' +
      '</div>' +
      '</div></div>';

    HR.ui.modal({
      title: '跟进详情 · ' + (r ? r.name : '候选人'),
      body: body,
      width: 980,
      onMount(h) {
        const box = h.body;
        /* 插入话术模板 */
        const tplSel = box.querySelector('#fuTpl');
        if (tplSel) {
          tplSel.addEventListener('change', () => {
            if (tplSel.value === '') return;
            const t = templates[Number(tplSel.value)];
            const ta = box.querySelector('#fuNote');
            if (t) {
              ta.value = ta.value ? ta.value + '\n' + t : t;
              ta.focus();
            }
            tplSel.value = '';
          });
        }
        box.querySelector('#fuSave').addEventListener('click', async () => {
          const note = box.querySelector('#fuNote').value.trim();
          const date = box.querySelector('#fuDate').value;
          const type = box.querySelector('#fuType') ? box.querySelector('#fuType').value : 'wechat';
          if (!note && !date) {
            HR.ui.toast('请填写备注或选择下次跟进日期', 'error');
            return;
          }
          if (note) HR.data.addFollowUp(a.id, note, date, type);
          else {
            a.nextFollowUpAt = date;
            a.lastFollowUpAt = util.now();
          }
          await HR.data.persist();
          h.close();
          HR.refresh();
          HR.ui.toast('跟进记录已保存', 'success');
        });

        const mailBox = box.querySelector('#mailBox');
        const mailText = box.querySelector('#mailText');
        box.querySelector('#mailInvite').addEventListener('click', () => {
          mailText.value = inviteMail(r, j);
          mailBox.style.display = '';
        });
        box.querySelector('#mailReject').addEventListener('click', () => {
          mailText.value = rejectMail(r, j);
          mailBox.style.display = '';
        });
        box.querySelector('#mailCopy').addEventListener('click', async () => {
          await window.api.copyText(mailText.value);
          HR.ui.toast('邮件内容已复制到剪贴板', 'success');
        });
      },
      actions: [
        {
          label: '打开简历详情',
          kind: 'ghost',
          onClick: (h) => {
            h.close();
            if (r) HR.goTo('pool');
            if (r) HR.pool.openDetail(r.id);
          }
        },
        { label: '关闭', kind: 'ghost', onClick: (h) => h.close() }
      ]
    });
  }

  function inviteMail(r, j) {
    const name = r ? r.name : '候选人';
    const jobName = j ? j.name : '相关岗位';
    const dept = j && j.department ? j.department + '「' + jobName + '」' : '「' + jobName + '」';
    return (
      '主题：面试邀请 —— ' + jobName + '\n\n' +
      name + ' 您好：\n\n' +
      '感谢您投递' + dept + '岗位，您的简历已通过初步筛选，现邀请您参加面试。\n\n' +
      '面试岗位：' + jobName + '\n' +
      '面试时间：待与您确认（建议回复 2 个方便的时间段）\n' +
      '面试形式：线下 / 线上视频（可协商）\n' +
      '面试地点或链接：待确认\n\n' +
      '如时间不便，请直接回复本邮件告知您方便的时间，我们会尽快协调安排。\n\n' +
      '期待与您交流！\nHR 团队'
    );
  }

  function rejectMail(r, j) {
    const name = r ? r.name : '候选人';
    const jobName = j ? j.name : '相关岗位';
    return (
      '主题：关于「' + jobName + '」投递的回复\n\n' +
      name + ' 您好：\n\n' +
      '非常感谢您对「' + jobName + '」岗位的关注与投递，也感谢您抽出时间与我们沟通。\n\n' +
      '经过综合评估，本次我们暂时无法为您提供合适的岗位机会，对此深表歉意。' +
      '您的简历我们已收入公司人才库，后续如有更匹配的岗位，我们会第一时间与您联系。\n\n' +
      '祝您求职顺利，早日找到心仪的机会！\nHR 团队'
    );
  }

  /* ---------------- Offer 详情（功能 3） ---------------- */
  function openOffer(appId) {
    const a = HR.data.application(appId);
    if (!a) return;
    const r = HR.data.resume(a.resumeId);
    const j = HR.data.job(a.jobId);
    const o = HR.data.getOffer(appId) || {};
    if (!o.offerDate) o.offerDate = util.todayInput();
    if (!o.position && j) o.position = j.name;
    const notes = o.negotiationNotes || [];

    const body =
      '<div class="grid-2">' +
      '<div class="field"><label>发出去的薪资</label><input class="input" id="ofSalary" value="' + esc(o.salary) + '" placeholder="如 12k·13薪" /></div>' +
      '<div class="field"><label>拟定岗位</label><input class="input" id="ofPosition" value="' + esc(o.position) + '" /></div>' +
      '<div class="field"><label>发 offer 日期</label><input class="input" type="date" id="ofDate" value="' + esc(o.offerDate) + '" /></div>' +
      '<div class="field"><label>预计入职日期</label><input class="input" type="date" id="ofOnboard" value="' + esc(o.expectedOnboard) + '" /></div>' +
      '<div class="field"><label>候选人反馈</label><select class="select" id="ofFeedback">' +
      HR.OFFER_FEEDBACK.map((f) => '<option' + (o.candidateFeedback === f ? ' selected' : '') + '>' + esc(f) + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label>竞对 offer 情况</label><input class="input" id="ofCompetitor" value="' + esc(o.competitorOffer) + '" placeholder="如：某厂 15k" /></div>' +
      '</div>' +
      '<div class="field"><label>谈判记录</label>' +
      '<ul class="timeline" id="ofNotes">' +
      (notes.length
        ? notes
            .slice()
            .reverse()
            .map((n) => '<li><div class="tl-time">' + util.fmtDateTime(n.time) + '</div><div class="tl-text">' + esc(n.note) + '</div></li>')
            .join('')
        : '<li class="muted small">还没有谈判记录</li>') +
      '</ul>' +
      '<div class="toolbar" style="margin-top:8px">' +
      '<input class="input grow" id="ofNote" placeholder="记一条谈判进展，如：候选人要求加 1k" />' +
      '<button class="btn small" id="ofNoteAdd">添加记录</button>' +
      '</div></div>';

    const h = HR.ui.modal({
      title: 'Offer 详情 · ' + (r ? r.name : '候选人'),
      body: body,
      width: 760,
      onMount(handle) {
        const box = handle.body;
        box.querySelector('#ofNoteAdd').addEventListener('click', async () => {
          const v = box.querySelector('#ofNote').value.trim();
          if (!v) {
            HR.ui.toast('请先输入谈判记录', 'error');
            return;
          }
          HR.data.addNegotiation(appId, v);
          await HR.data.persistNow();
          handle.close();
          openOffer(appId);
        });
      },
      actions: [
        { label: '取消', kind: 'ghost', onClick: (h) => h.close() },
        {
          label: '保存',
          onClick: async (h) => {
            const box = h.body;
            HR.data.saveOffer(appId, {
              salary: box.querySelector('#ofSalary').value.trim(),
              position: box.querySelector('#ofPosition').value.trim(),
              offerDate: box.querySelector('#ofDate').value,
              expectedOnboard: box.querySelector('#ofOnboard').value,
              candidateFeedback: box.querySelector('#ofFeedback').value,
              competitorOffer: box.querySelector('#ofCompetitor').value.trim()
            });
            await HR.data.persistNow();
            h.close();
            HR.refresh();
            HR.ui.toast('Offer 信息已保存', 'success');
          }
        }
      ]
    });
    return h;
  }

  /* ---------------- 入职材料清单（功能 3） ---------------- */
  function openChecklist(appId) {
    const a = HR.data.application(appId);
    if (!a) return;
    const r = HR.data.resume(a.resumeId);
    if (!Array.isArray(a.onboardChecklist)) {
      HR.data.applyFlags(a);
      if (!Array.isArray(a.onboardChecklist)) a.onboardChecklist = [];
    }
    const cl = a.onboardChecklist;
    const body =
      '<div class="muted small" style="margin-bottom:8px">勾选已收齐的材料，进度会实时显示在看板卡片上。</div>' +
      '<div class="checklist" id="clList">' +
      cl
        .map(
          (it) =>
            '<label class="cl-item' + (it.done ? ' done' : '') + '" data-key="' + esc(it.key) + '">' +
            '<input type="checkbox"' + (it.done ? ' checked' : '') + ' /> <span>' + esc(it.label) + '</span></label>'
        )
        .join('') +
      '</div>';

    HR.ui.modal({
      title: '入职材料 · ' + (r ? r.name : '候选人'),
      body: body,
      width: 470,
      onMount(handle) {
        handle.body.addEventListener('change', async (e) => {
          const lbl = e.target.closest('.cl-item');
          if (!lbl) return;
          HR.data.toggleChecklistItem(appId, lbl.getAttribute('data-key'));
          lbl.classList.toggle('done', e.target.checked);
          await HR.data.persist();
          HR.refresh();
        });
      },
      actions: [{ label: '完成', onClick: (h) => h.close() }]
    });
  }

  HR.kanban = { openDetail, openOffer, openChecklist };
  HR.register({ key: 'kanban', label: '跟进看板', render: render });
})();