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
  function statCard(kind, iconName, num, label) {
    return (
      '<div class="stat-card k-' + kind + '">' +
      '<div class="stat-ico">' + HR.ico(iconName, 20) + '</div>' +
      '<div><div class="stat-num" data-count="' + num + '">0</div>' +
      '<div class="stat-label">' + esc(label) + '</div></div>' +
      '</div>'
    );
  }

  /* 数字滚动：0 → 目标值，0.4s；用户开了「减少动态效果」时直接显示终值 */
  function countUp(el, to) {
    const target = Number(to) || 0;
    if (!el) return;
    const reduce =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !target) {
      el.textContent = String(target);
      return;
    }
    const start = performance.now();
    const dur = 400;
    function step(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = String(target);
    }
    requestAnimationFrame(step);
  }

  /* 图表的入场动画靠 CSS transition 实现：挂载后下一帧加 .in 类触发 */
  function animateIn(scope) {
    if (!scope) return;
    const run = () => {
      scope.querySelectorAll('.funnel-svg, .donut-svg, .bars-svg').forEach((s) => s.classList.add('in'));
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else run();
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

  /* ================= 功能 2：整体漏斗 / 招聘周期 / 渠道 ROI ================= */
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0);

  /* 整体漏斗 5 层：简历总数 → 初筛通过 → 面试到场 → 发 offer → 入职 */
  function overallStages() {
    const apps = HR.data.raw.applications;
    return [
      { name: '简历总数', count: apps.length },
      { name: '初筛通过', count: apps.filter((a) => a.passedScreen).length },
      { name: '面试到场', count: apps.filter((a) => a.attended).length },
      { name: '发 offer', count: apps.filter((a) => a.offered).length },
      { name: '入职', count: apps.filter((a) => a.hired).length }
    ];
  }

  function overallFunnelHtml(stages) {
    const total = stages[0].count;
    if (!total) {
      return HR.ui.empty(
        'clipboard-check',
        '还没有投递数据',
        '导入简历、创建岗位，并把候选人加入「待初筛」后，这里会显示整体招聘漏斗'
      );
    }
    // 找出相对上一层转化率最低的一环（跳过第一层），用于提示优化方向
    let worst = null;
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1].count;
      if (!prev) continue;
      const rate = Math.round((stages[i].count / prev) * 1000) / 10;
      if (!worst || rate < worst.rate) {
        worst = { i: i, rate: rate, name: stages[i].name, prevName: stages[i - 1].name };
      }
    }
    const rows = stages
      .map((s, i) => {
        const vsTotal = Math.round((s.count / total) * 1000) / 10;
        const vsPrev = i === 0 ? null : stages[i - 1].count ? Math.round((s.count / stages[i - 1].count) * 1000) / 10 : 0;
        const w = Math.max(7, Math.round((s.count / total) * 100));
        const low = worst && worst.i === i && worst.rate < 100;
        return (
          '<div class="tf-row' + (low ? ' low' : '') + '">' +
          '<div class="tf-label">' + esc(s.name) + '</div>' +
          '<div class="tf-bar-wrap"><div class="tf-bar tf-' + (i + 1) + '" style="width:' + w + '%">' + s.count + ' 人</div></div>' +
          '<div class="tf-meta">' + (vsPrev === null ? '基数' : '环比 ' + vsPrev + '%') +
          '<span class="muted"> · 占总 ' + vsTotal + '%</span></div>' +
          '</div>'
        );
      })
      .join('');
    const tip =
      worst && worst.rate < 100
        ? '<div class="tf-tip">' + HR.ico('alert-triangle') + ' 「' + esc(worst.prevName) + ' → ' + esc(worst.name) +
          '」转化率仅 <b>' + worst.rate + '%</b>，是全流程最低的一环，建议优化渠道或 JD</div>'
        : '';
    return '<div class="tfunnel">' + rows + '</div>' + tip;
  }

  /* 岗位招聘周期表 */
  function cycleTableHtml() {
    const jobs = HR.data.raw.jobs.filter((j) => !j.archived);
    if (!jobs.length) {
      return HR.ui.empty('briefcase', '还没有在招岗位', '创建岗位后，这里会统计每个岗位的招聘进度与平均耗时');
    }
    const rows = jobs.map((j) => {
      const apps = HR.data.appsOfJob(j.id);
      const screened = apps.filter((a) => a.screenedAt && a.createdAt);
      const offered = apps.filter((a) => a.offeredAt && a.attendedAt);
      const hired = apps.filter((a) => a.hired).length;
      const hc = j.headcount || 1;
      return {
        j: j,
        count: apps.length,
        avgScreen: screened.length ? avg(screened.map((a) => util.diffDays(a.createdAt, a.screenedAt))) : null,
        avgOffer: offered.length ? avg(offered.map((a) => util.diffDays(a.attendedAt, a.offeredAt))) : null,
        hired: hired,
        hc: hc,
        rate: Math.min(100, Math.round((hired / hc) * 100))
      };
    });
    return (
      '<div class="table-wrap"><table><thead><tr>' +
      '<th>岗位</th><th class="mono">招聘人数</th><th class="mono">简历数</th>' +
      '<th class="mono">平均初筛耗时</th><th class="mono">面试→offer</th><th>当前状态</th><th>完成率</th>' +
      '</tr></thead><tbody>' +
      rows
        .map((r, i) => {
          const done = r.hired >= r.hc;
          return (
            '<tr class="' + (i % 2 ? 'alt' : '') + '">' +
            '<td><strong>' + esc(r.j.name) + '</strong></td>' +
            '<td class="mono">' + r.hc + '</td>' +
            '<td class="mono">' + r.count + '</td>' +
            '<td class="mono">' + (r.avgScreen === null ? '—' : r.avgScreen + ' 天') + '</td>' +
            '<td class="mono">' + (r.avgOffer === null ? '—' : r.avgOffer + ' 天') + '</td>' +
            '<td>' + (done ? '<span class="tag green">已完成</span>' : '<span class="tag blue">在招</span>') + '</td>' +
            '<td><span class="bar-track" style="display:inline-block;width:76px;height:8px;vertical-align:middle">' +
            '<span class="bar-fill" style="display:block;height:100%;width:' + r.rate + '%' + (done ? ';background:var(--success)' : '') + '"></span></span> ' +
            '<span class="mono small">' + r.hired + '/' + r.hc + '（' + r.rate + '%）</span></td>' +
            '</tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    );
  }

  /* 渠道 ROI：按候选人来源聚合投递与成本 */
  function channelRoiRows() {
    const raw = HR.data.raw;
    return HR.SOURCES.map((ch) => {
      const resumes = raw.candidates.filter((c) => (c.source || '其他') === ch).length;
      const apps = raw.applications.filter((a) => {
        const r = HR.data.resume(a.resumeId);
        return r && (r.source || '其他') === ch;
      });
      const cost = raw.jobs
        .filter((j) => !j.archived && (j.channel || HR.SOURCES[0]) === ch)
        .reduce((n, j) => n + (Number(j.channelCost) || 0), 0);
      const hires = apps.filter((a) => a.hired).length;
      return {
        ch: ch,
        resumes: resumes,
        interviews: apps.filter((a) => a.attended).length,
        offers: apps.filter((a) => a.offered).length,
        hires: hires,
        cost: cost,
        perHire: hires > 0 && cost > 0 ? Math.round(cost / hires) : null
      };
    }).filter((x) => x.resumes || x.interviews || x.cost);
  }

  function roiHtml() {
    const rows = channelRoiRows();
    if (!rows.length) {
      return HR.ui.empty('database', '暂无渠道数据', '导入简历后，这里会按来源渠道统计转化与成本');
    }
    return (
      '<div class="table-wrap"><table><thead><tr>' +
      '<th>渠道</th><th class="mono">简历数</th><th class="mono">面试数</th>' +
      '<th class="mono">offer 数</th><th class="mono">入职数</th><th class="mono">单个入职成本</th>' +
      '</tr></thead><tbody>' +
      rows
        .map(
          (r, i) =>
            '<tr class="' + (i % 2 ? 'alt' : '') + '">' +
            '<td>' + esc(r.ch) + '</td>' +
            '<td class="mono">' + r.resumes + '</td>' +
            '<td class="mono">' + r.interviews + '</td>' +
            '<td class="mono">' + r.offers + '</td>' +
            '<td class="mono">' + r.hires + '</td>' +
            '<td class="mono">' + (r.perHire === null ? '—' : '¥' + r.perHire.toLocaleString('zh-CN')) + '</td>' +
            '</tr>'
        )
        .join('') +
      '</tbody></table></div>' +
      '<div class="muted small" style="margin-top:6px">成本取自岗位编辑里的「渠道投入费用」，按主招渠道汇总；单个入职成本 = 该渠道总投入 ÷ 该渠道入职人数。</div>'
    );
  }

  function bannerHtml(list) {
    if (!list.length) return '';
    const worst = util.daysSince(list[0].lastFollowUpAt);
    return (
      '<div class="alert-banner clickable" id="abBanner">' +
      '<span class="ab-ico">' + HR.ico('alert-triangle', 18) + '</span>' +
      '<span class="ab-text">有 <b>' + list.length + '</b> 位候选人超过 <b>3</b> 天未跟进，最久的已 <b>' + worst + '</b> 天</span>' +
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
        statCard('jobs', 'briefcase', jobs.length, '在招岗位') +
        statCard('resume', 'file-text', raw.candidates.length, '简历总数') +
        statCard('screen', 'clipboard-check', pendingScreen, '待初筛') +
        statCard('interview', 'message-square', pendingInterview, '待面试') +
        // 待跟进警示横幅：通栏显示在统计卡片下方（有数据时才渲染）
        bannerHtml(overdue) +

        '<div class="card tfunnel-card"><div class="card-head">' +
        '<h3>' + HR.ico('clipboard-check') + ' 整体招聘漏斗</h3>' +
        '<span class="muted small">全部岗位汇总</span></div>' +
        '<div id="tfBody"></div></div>' +

        '<div class="card cycle-card"><div class="card-head"><h3>' + HR.ico('clock') + ' 岗位招聘周期</h3></div>' +
        '<div id="cycleBody"></div></div>' +

        '<div class="card roi-card"><div class="card-head"><h3>' + HR.ico('dollar-sign') + ' 渠道 ROI</h3></div>' +
        '<div id="roiBody"></div></div>' +

        '<div class="card funnel-card"><div class="card-head">' +
        '<h3>' + HR.ico('clipboard-check') + ' 招聘漏斗</h3>' +
        '<select class="select" id="funnelJob" style="width:200px"></select></div>' +
        '<div id="funnelBody"></div></div>' +

        '<div class="card channel-card"><div class="card-head"><h3>' + HR.ico('database') + ' 渠道来源分布</h3></div>' +
        '<div id="channelBody"></div></div>' +

        '<div class="card recent-card"><div class="card-head"><h3>' + HR.ico('columns') + ' 近 7 天入库简历</h3></div>' +
        '<div id="recentBody"></div></div>' +

        '<div class="card overdue-card"><div class="card-head"><h3>' + HR.ico('alert-triangle') + ' 待跟进超 3 天</h3>' +
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
          const body = el.querySelector('#funnelBody');
          body.innerHTML = funnelSvg(funnelStages(select.value));
          animateIn(body);
        });
      }
      const funnelBody = el.querySelector('#funnelBody');
      funnelBody.innerHTML = jobs.length
        ? funnelSvg(funnelStages(jobs[0].id))
        : HR.ui.empty(
            'briefcase',
            '还没有在招岗位',
            '先到「岗位管理」创建一个岗位，漏斗才会有数据',
            '<button class="btn" id="dashGoJobs">' + HR.ico('arrow-right') + ' 去创建岗位</button>'
          );

      const dashGoJobs = el.querySelector('#dashGoJobs');
      if (dashGoJobs) dashGoJobs.addEventListener('click', () => HR.goTo('jobs'));

      const channelBody = el.querySelector('#channelBody');
      channelBody.innerHTML = donutHtml(channelData());
      bindDonut(channelBody);

      el.querySelector('#recentBody').innerHTML = barsSvg(recentDays());

      /* 功能 2：整体漏斗 / 岗位周期表 / 渠道 ROI */
      el.querySelector('#tfBody').innerHTML = overallFunnelHtml(overallStages());
      el.querySelector('#cycleBody').innerHTML = cycleTableHtml();
      el.querySelector('#roiBody').innerHTML = roiHtml();

      /* 统计卡数字滚动 + 图表入场动画 */
      el.querySelectorAll('.stat-num').forEach((n) => countUp(n, n.getAttribute('data-count')));
      animateIn(el);

      const overdueBody = el.querySelector('#overdueBody');
      if (!overdue.length) {
        overdueBody.innerHTML = HR.ui.empty('check', '没有超期未跟进的候选人', '超过 3 天未跟进的候选人会在这里提醒');
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

      /* 横幅点击 → 跟进看板 */
      const goBtn = el.querySelector('#abGo');
      if (goBtn) goBtn.addEventListener('click', () => HR.goTo('kanban'));
      const banner = el.querySelector('#abBanner');
      if (banner) banner.addEventListener('click', () => HR.goTo('kanban'));
    }
  });
})();