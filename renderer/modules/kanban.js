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

    el.innerHTML =
      '<div class="card" style="padding:12px 16px">' +
      '<div class="toolbar" style="margin:0">' +
      '<strong>跟进看板</strong>' +
      '<span class="muted small">拖动卡片即可更换阶段；右上角红点表示超过 3 天未跟进</span>' +
      '<span class="spacer"></span>' +
      '<span class="muted small">共 ' + HR.data.raw.applications.length + ' 条投递记录</span>' +
      '</div></div>' +
      '<div class="kanban">' + cols + '</div>';

    el.querySelectorAll('.kcard').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('click', () => openDetail(card.getAttribute('data-id')));
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
  }

  function cardHtml(a) {
    const r = HR.data.resume(a.resumeId);
    const j = HR.data.job(a.jobId);
    const overdue = HR.data.isOverdue(a, 3);
    return (
      '<div class="kcard" draggable="true" data-id="' + a.id + '">' +
      '<div class="kcard-title">' +
      (overdue ? '<span class="dot-overdue" title="超过 3 天未跟进"></span>' : '') +
      '<span>' + esc(r ? r.name : '（简历已删除）') + '</span>' +
      '</div>' +
      '<div class="kcard-sub">' + esc(j ? j.name : '未知岗位') + ' · ' + esc(r ? r.school || '—' : '—') + '</div>' +
      '<div class="kcard-foot">' +
      '<span class="kcard-score">' + (a.score ? '综合分 ' + a.score.composite : '未打分') + '</span>' +
      '<span' + (overdue ? ' class="text-red"' : '') + '>跟进 ' + util.fromNow(a.lastFollowUpAt) + '</span>' +
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
            .map((f) => '<li><div class="tl-time">' + util.fmtDateTime(f.time) + '</div><div class="tl-text">' + esc(f.note) + '</div></li>')
            .join('')
        : '<li class="muted small">还没有跟进记录</li>') +
      '</ul>' +
      '<div class="field" style="margin-top:12px">' +
      '<label>新增备注</label>' +
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
      '<button class="btn small" id="mailCopy" style="margin-top:6px">📋 复制到剪贴板</button>' +
      '</div>' +
      '</div></div>';

    HR.ui.modal({
      title: '跟进详情 · ' + (r ? r.name : '候选人'),
      body: body,
      width: 980,
      onMount(h) {
        const box = h.body;
        box.querySelector('#fuSave').addEventListener('click', async () => {
          const note = box.querySelector('#fuNote').value.trim();
          const date = box.querySelector('#fuDate').value;
          if (!note && !date) {
            HR.ui.toast('请填写备注或选择下次跟进日期', 'error');
            return;
          }
          if (note) HR.data.addFollowUp(a.id, note, date);
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

  HR.kanban = { openDetail };
  HR.register({ key: 'kanban', label: '跟进看板', icon: '🗂️', render: render });
})();