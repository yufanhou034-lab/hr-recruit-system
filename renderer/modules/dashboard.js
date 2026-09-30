/* 1. 仪表盘
   全部图表用纯 SVG 手绘，不依赖任何图表库。 */
(function () {
  const HR = window.HR;
  const util = HR.util;
  const esc = util.esc;

  /* 渠道名 → 环形图颜色类 */
  const CH_CLASS = {
    BOSS直聘: 'ch-boss',
    猎聘: 'ch-liepin',
    内推: 'ch-neitui',
    校招: 'ch-xiaozhao',
    其他: 'ch-other'
  };

  /* ---------- 漏斗几何参数 ---------- */
  const FN = {
    width: 760,          // viewBox 宽
    cx: 240,             // 漏斗中轴
    layerH: 44,          // 每层高度
    gap: 4,              // 层间距
    labelX: 480,         // 右侧标注起始 x
    // 各层宽度比例（占第一层的百分比）：100 → 85 → 72 → 60 → 50 → 40 → 32
    ratio: [1, 0.85, 0.72, 0.6, 0.5, 0.4, 0.32]
  };
  const FN_MAX_HALF = 220;

  /* ---------- 顶部统计卡 ---------- */
  function statCard(kind, icon, num, label) {
    return (
      '<div class="stat-card k-' + kind + '">' +
      '<div class="stat-ico">' + icon + '</div>' +
      '<div><div class="stat-num">' + num + '</div>' +
      '<div class="stat-label">' + esc(label) + '</div></div>' +
      '</div>'
    );
  }

  /* 漏斗 6 个阶段的数据 */
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

  /* ---------- 2.2 梯形漏斗 ---------- */
  function funnelSvg(stages) {
    const empty = !stages[0].count;
    const total = stages[0].count;
    const layerTotal = FN.layerH + FN.gap;
    const H = FN.layerH * 6 + FN.gap * 5;
    const W = FN.ratio.map((r) => FN_MAX_HALF * r);

    let body = '';
    stages.forEach((s, i) => {
      const y1 = i * layerTotal;
      const y2 = y1 + FN.layerH;
      const top = W[i];
      const bottom = W[i + 1];
      const cls = empty ? 'fn-e' : 'fn-' + (i + 1);

      // 梯形（居中）
      body +=
        '<polygon class="fn-shape ' + cls + '" points="' +
        (FN.cx - top).toFixed(1) + ',' + y1 + ' ' +
        (FN.cx + top).toFixed(1) + ',' + y1 + ' ' +
        (FN.cx + bottom).toFixed(1) + ',' + y2 + ' ' +
        (FN.cx - bottom).toFixed(1) + ',' + y2 + '"/>';

      if (!empty) {
        // 梯形内白色文字：阶段名 + 人数
        body +=
          '<text class="fn-txt" x="' + FN.cx + '" y="' + (y1 + 27) + '" text-anchor="middle">' +
          esc(s.name) + ' ' + s.count + '人</text>';

        // 右侧标注：占总投递百分比 + 环节转化率
        const pct = total ? Math.round((s.count / total) * 1000) / 10 : 0;
        body +=
          '<text class="fn-meta" x="' + FN.labelX + '" y="' + (y1 + 18) + '">占总投递 ' + pct + '%</text>';
        if (i > 0) {
          const prev = stages[i - 1].count;
          const step = prev ? Math.round((s.count / prev) * 1000) / 10 : 0;
          body +=
            '<text class="fn-meta-2" x="' + FN.labelX + '" y="' + (y1 + 33) + '">' +
            esc(s.name) + '率 ' + step + '%</text>';
        }
      }
    });

    if (empty) {
      body += '<text class="fn-empty-txt" x="' + FN.cx + '" y="' + (H / 2 + 5) + '" text-anchor="middle">暂无数据</text>';
    }

    return '<svg class="funnel-svg' + (empty ? ' empty' : '') + '" viewBox="0 0 ' + FN.width + ' ' + H +
      '" width="100%" role="img">' + body + '</svg>';
  }

  /* ---------- 2.3 渠道环形图 ---------- */
  function channelData() {
    const raw = HR.data.raw;
    const counts = {};
    HR.SOURCES.forEach((s) => (counts[s] = 0));
    raw.candidates.forEach((c) => {
      const s = c.source || '其他';
      counts[s] = (counts[s] || 0) + 1;
    });
    const list = Object.keys(counts)
      .filter((k) => counts[k] > 0)
      .map((k) => ({ name: k, count: counts[k], cls: CH_CLASS[k] || 'ch-other' }));
    list.sort((a, b) => b.count - a.count);
    return list;
  }

  function donutHtml(list) {
    const SIZE = 176;
    const R = 59;                       // 圆环中线半径（外 70 / 内 48）
    const C = 2 * Math.PI * R;          // 周长
    const cx = SIZE / 2;
    const total = list.reduce((n, x) => n + x.count, 0);

    if (!total) {
      return '<div class="donut-wrap">' +
        '<div class="donut-box"><svg class="donut-svg" viewBox="0 0 ' + SIZE + ' ' + SIZE + '">' +
        '<circle cx="' + cx + '" cy="' + cx + '" r="' + R + '" fill="none" stroke="var(--line-2)" stroke-width="22"/>' +
        '</svg><div class="donut-center"><div class="donut-total">0</div><div class="donut-cap">总简历</div></div></div>' +
        '<div class="donut-legend"><div class="muted small">还没有简历入库，导入一份简历后这里会显示渠道占比</div></div></div>';
    }

    let offset = 0;
    let segs = '';
    list.forEach((x, i) => {
      // 只有一个渠道时画整圆，避免出现 0 度角
      const len = list.length === 1 ? C : (x.count / total) * C;
      segs +=
        '<circle class="donut-seg ' + x.cls + '" data-idx="' + i + '" cx="' + cx + '" cy="' + cx + '" r="' + R +
        '" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) +
        '" stroke-dashoffset="' + (-offset).toFixed(2) +
        '" transform="rotate(-90 ' + cx + ' ' + cx + ')"><title>' +
        esc(x.name) + '：' + x.count + ' 人（' + Math.round((x.count / total) * 100) + '%）</title></circle>';
      offset += len;
    });

    const legend = list
      .map(
        (x, i) =>
          '<div class="legend-item" data-idx="' + i + '">' +
          '<span class="legend-dot ' + x.cls.replace('ch-', 'dot-') + '" style="background:var(--' + x.cls + ')"></span>' +
          '<span class="legend-name">' + esc(x.name) + '</span>' +
          '<span class="legend-val">' + x.count + ' 人 · ' + Math.round((x.count / total) * 100) + '%</span></div>'
      )
      .join('');

    return (
      '<div class="donut-wrap">' +
      '<div class="donut-box"><svg class="donut-svg" viewBox="0 0 ' + SIZE + ' ' + SIZE + '">' + segs + '</svg>' +
      '<div class="donut-center"><div class="donut-total">' + total + '</div><div class="donut-cap">总简历</div></div></div>' +
      '<div class="donut-legend">' + legend + '</div></div>'
    );
  }

  /* 环形图悬停联动图例 */
  function bindDonut(box) {
    if (!box) return;
    const segs = box.querySelectorAll('.donut-seg');
    const items = box.querySelectorAll('.legend-item');
    if (!segs.length || !items.length) return;
    const setActive = (idx) => {
      segs.forEach((s) => s.classList.toggle('dim', idx !== null && s.getAttribute('data-idx') !== String(idx)));
      items.forEach((it) => it.classList.toggle('on', idx !== null && it.getAttribute('data-idx') === String(idx)));
    };
    segs.forEach((s) => {
      s.addEventListener('mouseenter', () => setActive(s.getAttribute('data-idx')));
      s.addEventListener('mouseleave', () => setActive(null));
    });
    items.forEach((it) => {
      it.addEventListener('mouseenter', () => setActive(it.getAttribute('data-idx')));
      it.addEventListener('mouseleave', () => setActive(null));
    });
  }

  /* ---------- 2.4 近 7 天柱状图 ---------- */
  function recentDays() {
    const raw = HR.data.raw;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      days.push({ key: key, label: d.getMonth() + 1 + '/' + d.getDate(), count: 0, today: i === 0 });
    }
    const index = new Map(days.map((d, i) => [d.key, i]));
    raw.candidates.forEach((c) => {
      const key = util.fmtDate(c.createdAt);
      if (index.has(key)) days[index.get(key)].count++;
    });
    return days;
  }

  function barsSvg(days) {
    const W = 720;
    const BASELINE = 170;      // X 轴基线
    const MAX_H = 120;         // 柱子最大高度
    const H = 210;
    const BAR_W = 28;
    const PAD = 24;
    const step = (W - PAD * 2) / days.length;
    const sum = days.reduce((n, d) => n + d.count, 0);
    const avg = Math.round((sum / days.length) * 10) / 10;
    const maxVal = Math.max(1, ...days.map((d) => d.count), avg);

    let body = '';
    days.forEach((d, i) => {
      const h = Math.max(2, Math.round((d.count / maxVal) * MAX_H));
      const x = PAD + i * step + (step - BAR_W) / 2;
      const y = BASELINE - h;
      const cls = d.today ? 'bar-today' : 'bar-other';
      // 圆角顶部 4px（用 path 手绘，避免 rx 影响底部）
      const r = Math.min(4, h / 2);
      body +=
        '<path class="bar-rect ' + cls + '" d="M' + x + ' ' + (y + r) +
        ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
        ' H' + (x + BAR_W - r) + ' Q' + (x + BAR_W) + ' ' + y + ' ' + (x + BAR_W) + ' ' + (y + r) +
        ' V' + BASELINE + ' H' + x + ' Z"><title>' + d.label + '：' + d.count + ' 份</title></path>';
      body +=
        '<text class="bar-val-txt" x="' + (x + BAR_W / 2) + '" y="' + (y - 7) + '" text-anchor="middle">' + d.count + '</text>';
      body +=
        '<text class="bar-day-txt' + (d.today ? ' today' : '') + '" x="' + (x + BAR_W / 2) + '" y="' + (BASELINE + 18) +
        '" text-anchor="middle">' + d.label + '</text>';
    });

    // 平均值虚线
    const avgY = BASELINE - Math.round((avg / maxVal) * MAX_H);
    body +=
      '<line class="bar-avg-line" x1="' + PAD + '" y1="' + avgY + '" x2="' + (W - PAD) + '" y2="' + avgY + '"/>' +
      '<text class="bar-avg-txt" x="' + (W - PAD) + '" y="' + (avgY - 6) + '" text-anchor="end">平均 ' + avg + '</text>';

    return '<svg class="bars-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img">' + body + '</svg>' +
      '<div class="muted small" style="margin-top:6px">近 7 天共入库 ' + sum + ' 份简历</div>';
  }

  /* ---------- 待跟进 ---------- */
  function overdueList() {
    return HR.data.raw.applications
      .filter((a) => HR.data.isOverdue(a, 3))
      .sort((a, b) => util.daysSince(b.lastFollowUpAt) - util.daysSince(a.lastFollowUpAt));
  }

  function bannerHtml(list) {
    if (!list.length) return '';
    const worst = util.daysSince(list[0].lastFollowUpAt);
    return (
      '<div class="alert-banner">' +
      '<span class="ab-ico">⚠️</span>' +
      '<span class="ab-text">你有 <b>' + list.length + '</b> 位候选人超 3 天未跟进，最久的已 <b>' + worst + '</b> 天</span>' +
      '<button class="btn outline-danger ab-btn" id="abGo">立即处理</button>' +
      '</div>'
    );
  }

  /* ---------- 渲染入口 ---------- */
  HR.register({
    key: 'dashboard',
    label: '仪表盘',
    icon: '📊',
    render(el) {
      const raw = HR.data.raw;
      const jobs = raw.jobs.filter((j) => !j.archived);
      const pendingScreen = raw.applications.filter((a) => a.status === 'pending_screen').length;
      const pendingInterview = raw.applications.filter((a) => a.status === 'pending_interview').length;
      const overdue = overdueList();

      el.innerHTML =
        '<div class="dashboard-grid">' +
        statCard('jobs', '🏢', jobs.length, '在招岗位') +
        statCard('resume', '📄', raw.candidates.length, '简历总数') +
        statCard('screen', '🔍', pendingScreen, '待初筛') +
        statCard('interview', '🗣️', pendingInterview, '待面试') +
        // 待跟进警示横幅：通栏显示在统计卡片下方（有数据时才渲染）
        bannerHtml(overdue) +

        '<div class="card funnel-card"><div class="card-head">' +
        '<h3>🔻 招聘漏斗</h3>' +
        '<select class="select" id="funnelJob" style="width:200px"></select></div>' +
        '<div id="funnelBody"></div></div>' +

        '<div class="card channel-card"><div class="card-head"><h3>📡 渠道来源分布</h3></div>' +
        '<div id="channelBody"></div></div>' +

        '<div class="card recent-card"><div class="card-head"><h3>📅 近 7 天入库简历</h3></div>' +
        '<div id="recentBody"></div></div>' +

        '<div class="card overdue-card"><div class="card-head"><h3>⏰ 待跟进超 3 天</h3>' +
        '<span class="badge ' + (overdue.length ? 'rej' : 'rec') + '" id="overdueCount">' + overdue.length + '</span></div>' +
        '<div id="overdueBody"></div></div>' +
        '</div>';

      /* 漏斗岗位下拉 */
      const select = el.querySelector('#funnelJob');
      if (!jobs.length) {
        select.style.display = 'none';
      } else {
        select.innerHTML = jobs.map((j) => '<option value="' + j.id + '">' + esc(j.name) + '</option>').join('');
        select.addEventListener('change', () => {
          el.querySelector('#funnelBody').innerHTML = funnelSvg(funnelStages(select.value));
        });
      }
      el.querySelector('#funnelBody').innerHTML = jobs.length
        ? funnelSvg(funnelStages(jobs[0].id))
        : '<div class="empty"><span class="empty-ico">🏢</span>还没有在招岗位，请先到「岗位管理」创建一个</div>';

      const channelBody = el.querySelector('#channelBody');
      channelBody.innerHTML = donutHtml(channelData());
      bindDonut(channelBody);

      el.querySelector('#recentBody').innerHTML = barsSvg(recentDays());

      const overdueBody = el.querySelector('#overdueBody');
      if (!overdue.length) {
        overdueBody.innerHTML = HR.ui.empty('✅', '没有超期未跟进的候选人');
      } else {
        overdueBody.innerHTML =
          '<ul class="alert-list">' +
          overdue
            .slice(0, 8)
            .map((a) => {
              const c = HR.data.resume(a.resumeId);
              const j = HR.data.job(a.jobId);
              return (
                '<li><span class="who">' + esc(c ? c.name : '已删除简历') + '</span>' +
                '<span class="muted">' + esc(j ? j.name : '未知岗位') + '</span>' +
                '<span class="when">' + util.daysSince(a.lastFollowUpAt) + ' 天未跟进</span></li>'
              );
            })
            .join('') +
          '</ul>' +
          (overdue.length > 8 ? '<div class="muted small" style="margin-top:6px">还有 ' + (overdue.length - 8) + ' 人…</div>' : '');
      }

      /* 横幅「立即处理」→ 跟进看板 */
      const goBtn = el.querySelector('#abGo');
      if (goBtn) goBtn.addEventListener('click', () => HR.goTo('kanban'));
    }
  });
})();