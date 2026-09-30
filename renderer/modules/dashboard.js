/* 1. 仪表盘 */
(function () {
  const HR = window.HR;
  const util = HR.util;
  const esc = util.esc;

  function statCard(icon, kind, num, label) {
    return (
      '<div class="stat-card"><div class="stat-ico ' + kind + '">' + icon + '</div>' +
      '<div><div class="stat-num">' + num + '</div><div class="stat-label">' + esc(label) + '</div></div></div>'
    );
  }

  function funnelStages(jobId) {
    const apps = HR.data.appsOfJob(jobId);
    return [
      { name: '投递', count: apps.length },
      { name: '初筛通过', count: apps.filter((a) => a.passedScreen).length },
      { name: '约面', count: apps.filter((a) => a.scheduled).length },
      { name: '到面', count: apps.filter((a) => a.attended).length },
      { name: 'offer', count: apps.filter((a) => a.offered || a.status === 'offered' || a.status === 'hired').length },
      { name: '入职', count: apps.filter((a) => a.hired || a.status === 'hired').length }
    ];
  }

  HR.register({
    key: 'dashboard',
    label: '仪表盘',
    icon: '📊',
    render(el) {
      const raw = HR.data.raw;
      const jobs = raw.jobs.filter((j) => !j.archived);
      const pendingScreen = raw.applications.filter((a) => a.status === 'pending_screen').length;
      const pendingInterview = raw.applications.filter((a) => a.status === 'pending_interview').length;

      el.innerHTML =
        '<div class="stat-row">' +
        statCard('🏢', '', jobs.length, '在招岗位') +
        statCard('📄', 'green', raw.candidates.length, '简历总数') +
        statCard('🔍', 'yellow', pendingScreen, '待初筛') +
        statCard('🗣️', 'red', pendingInterview, '待面试') +
        '</div>' +
        '<div class="grid-2">' +
        '<div class="card"><div class="card-head"><h3>🔻 招聘漏斗</h3>' +
        '<select class="select" id="funnelJob" style="width:200px"></select></div>' +
        '<div id="funnelBody"></div></div>' +
        '<div class="card"><div class="card-head"><h3>📡 渠道来源分布</h3></div>' +
        '<div id="channelBody"></div></div>' +
        '</div>' +
        '<div class="grid-2">' +
        '<div class="card"><div class="card-head"><h3>📅 近 7 天入库简历</h3></div>' +
        '<div id="recentBody"></div></div>' +
        '<div class="card"><div class="card-head"><h3>⏰ 待跟进超 3 天</h3>' +
        '<span class="badge rej" id="overdueCount">0</span></div>' +
        '<div id="overdueBody"></div></div>' +
        '</div>';

      // 漏斗：岗位下拉
      const select = el.querySelector('#funnelJob');
      if (!jobs.length) {
        select.style.display = 'none';
      } else {
        select.innerHTML = jobs.map((j) => '<option value="' + j.id + '">' + esc(j.name) + '</option>').join('');
        select.addEventListener('change', () => renderFunnel(el.querySelector('#funnelBody'), select.value));
      }

      renderFunnel(el.querySelector('#funnelBody'), jobs.length ? jobs[0].id : '');
      renderChannels(el.querySelector('#channelBody'));
      renderRecent(el.querySelector('#recentBody'));
      renderOverdue(el.querySelector('#overdueBody'), el.querySelector('#overdueCount'));
    }
  });

  function renderFunnel(box, jobId) {
    if (!box) return;
    if (!jobId) {
      box.innerHTML = HR.ui.empty('🏢', '还没有在招岗位，请先到「岗位管理」创建一个');
      return;
    }
    const stages = funnelStages(jobId);
    const total = stages[0].count;
    if (!total) {
      box.innerHTML = HR.ui.empty('🔻', '该岗位还没有候选人投递记录');
      return;
    }
    box.innerHTML = stages
      .map((s, i) => {
        const width = Math.max(1.5, Math.round((s.count / total) * 100));
        const rate = Math.round((s.count / total) * 1000) / 10;
        const prev = i === 0 ? null : stages[i - 1];
        const stepRate = prev && prev.count ? Math.round((s.count / prev.count) * 1000) / 10 : null;
        return (
          '<div class="funnel-row">' +
          '<span class="funnel-name">' + esc(s.name) + '</span>' +
          '<span class="funnel-track"><span class="funnel-fill" style="width:' + width + '%"></span></span>' +
          '<span class="funnel-val">' + s.count + ' 人 · ' + rate + '%' +
          (stepRate === null ? '' : ' <span class="muted small">(环节 ' + stepRate + '%)</span>') +
          '</span></div>'
        );
      })
      .join('');
  }

  function renderChannels(box) {
    if (!box) return;
    const raw = HR.data.raw;
    const counts = {};
    HR.SOURCES.forEach((s) => (counts[s] = 0));
    raw.candidates.forEach((r) => {
      const s = r.source || '其他';
      counts[s] = (counts[s] || 0) + 1;
    });
    const keys = Object.keys(counts).filter((k) => counts[k] > 0 || HR.SOURCES.indexOf(k) >= 0);
    const max = Math.max(1, ...keys.map((k) => counts[k]));
    const total = raw.candidates.length || 1;
    box.innerHTML = keys
      .map((k) => {
        const c = counts[k];
        return (
          '<div class="bar-row"><span class="bar-name">' + esc(k) + '</span>' +
          '<span class="bar-track"><span class="bar-fill" style="width:' + Math.round((c / max) * 100) + '%"></span></span>' +
          '<span class="bar-val">' + c + ' 人 · ' + Math.round((c / total) * 100) + '%</span></div>'
        );
      })
      .join('');
  }

  function renderRecent(box) {
    if (!box) return;
    const raw = HR.data.raw;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      days.push({
        key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
        label: d.getMonth() + 1 + '/' + d.getDate(),
        count: 0
      });
    }
    const index = new Map(days.map((d, i) => [d.key, i]));
    raw.candidates.forEach((r) => {
      const key = util.fmtDate(r.createdAt);
      if (index.has(key)) days[index.get(key)].count++;
    });
    const max = Math.max(1, ...days.map((d) => d.count));
    const sum = days.reduce((n, d) => n + d.count, 0);
    box.innerHTML =
      days
        .map(
          (d) =>
            '<div class="day-row"><span class="day-date">' + d.label + '</span>' +
            '<span class="day-track"><span class="day-fill" style="width:' + Math.round((d.count / max) * 100) + '%"></span></span>' +
            '<span class="day-val">' + d.count + '</span></div>'
        )
        .join('') +
      '<div class="muted small" style="margin-top:8px">近 7 天共入库 ' + sum + ' 份简历</div>';
  }

  function renderOverdue(box, countEl) {
    if (!box) return;
    const raw = HR.data.raw;
    const list = raw.applications.filter((a) => HR.data.isOverdue(a, 3));
    if (countEl) countEl.textContent = String(list.length);
    if (!list.length) {
      box.innerHTML = HR.ui.empty('✅', '没有超期未跟进的候选人');
      return;
    }
    list.sort((a, b) => util.daysSince(b.lastFollowUpAt) - util.daysSince(a.lastFollowUpAt));
    box.innerHTML =
      '<ul class="alert-list">' +
      list
        .slice(0, 12)
        .map((a) => {
          const r = HR.data.resume(a.resumeId);
          const j = HR.data.job(a.jobId);
          return (
            '<li><span class="who">' + esc(r ? r.name : '已删除简历') + '</span>' +
            '<span class="muted">' + esc(j ? j.name : '未知岗位') + '</span>' +
            '<span class="when">' + util.daysSince(a.lastFollowUpAt) + ' 天未跟进</span></li>'
          );
        })
        .join('') +
      '</ul>' +
      (list.length > 12 ? '<div class="muted small">还有 ' + (list.length - 12) + ' 人…</div>' : '');
  }
})();