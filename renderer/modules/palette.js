/* 全局命令面板（Ctrl+K）：实时搜候选人（姓名 / 电话 / 学校 / 邮箱 / 专业）+ 搜菜单项 */
(function () {
  const HR = window.HR;
  const util = HR.util;
  const esc = util.esc;

  let open = false;
  let items = [];
  let active = 0;

  function ico(name, size) {
    return HR.icons ? HR.icons.icon(name, size) : '';
  }

  function rootEl() {
    return document.getElementById('paletteRoot');
  }

  /* ---------- 结果构建 ---------- */
  function buildResults(kw) {
    const q = String(kw || '').trim().toLowerCase();
    const out = [];

    // 有关键词时候选人优先（这是主用途），菜单项排后面
    if (q) {
      HR.data.raw.candidates
        .filter((r) => {
          const hay = [r.name, r.phone, r.school, r.email, r.major, r.degree].filter(Boolean).join(' ').toLowerCase();
          return hay.indexOf(q) >= 0;
        })
        .slice(0, 20)
        .forEach((r) =>
          out.push({
            type: 'cand',
            id: r.id,
            name: r.name || '未命名',
            sub: [r.school, util.maskPhone(r.phone)].filter(Boolean).join(' · ')
          })
        );
    } else {
      // 空关键词时给出最近入库的几位，面板不要空着
      HR.data.raw.candidates
        .slice(-5)
        .reverse()
        .forEach((r) => out.push({ type: 'cand', id: r.id, name: r.name || '未命名', sub: '最近入库' }));
    }

    HR.moduleOrder.forEach((key) => {
      const mod = HR.modules[key];
      if (!q || mod.label.toLowerCase().indexOf(q) >= 0) {
        out.push({ type: 'menu', key: key, name: mod.label, sub: '跳转模块' });
      }
    });

    return out;
  }

  /* ---------- 只重画结果列表（保留输入框，避免中文输入法被打断） ---------- */
  function paintList() {
    const list = document.getElementById('paletteList');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div class="palette-empty">没有匹配结果</div>';
      return;
    }
    list.innerHTML = items
      .map(
        (it, i) =>
          '<div class="palette-item' + (i === active ? ' on' : '') + '" data-i="' + i + '">' +
          '<span class="pi-ico">' + ico(it.type === 'menu' ? 'layout-dashboard' : 'users', 15) + '</span>' +
          '<span class="pi-name">' + esc(it.name) + '</span>' +
          '<span class="pi-sub">' + esc(it.sub || '') + '</span>' +
          '</div>'
      )
      .join('');
    const on = list.querySelector('.palette-item.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  function run(it) {
    if (!it) return;
    close();
    if (it.type === 'menu') {
      HR.goTo(it.key);
      return;
    }
    if (it.type === 'cand' && HR.pool && HR.pool.openDetail) HR.pool.openDetail(it.id);
  }

  function move(delta) {
    if (!items.length) return;
    active = (active + delta + items.length) % items.length;
    paintList();
  }

  /* ---------- 打开 / 关闭 ---------- */
  function openPalette() {
    const root = rootEl();
    if (!root || open) return;
    open = true;
    active = 0;
    items = buildResults('');

    root.innerHTML =
      '<div class="palette-mask">' +
      '<div class="palette-box">' +
      '<div class="palette-head">' + ico('search', 17) +
      '<input class="palette-input" id="paletteInput" placeholder="输入搜索候选人或菜单" autocomplete="off" spellcheck="false" />' +
      '</div>' +
      '<div class="palette-list" id="paletteList"></div>' +
      '<div class="palette-foot"><span>↑↓ 选择</span><span>Enter 打开</span><span>Esc 关闭</span></div>' +
      '</div></div>';

    paintList();

    const mask = root.querySelector('.palette-mask');
    const input = root.querySelector('#paletteInput');

    // 点遮罩空白处关闭
    mask.addEventListener('mousedown', (e) => {
      if (e.target === mask) close();
    });

    // 点结果项直接打开
    root.querySelector('#paletteList').addEventListener('click', (e) => {
      const el = e.target.closest('.palette-item');
      if (el) run(items[Number(el.getAttribute('data-i'))]);
    });
    root.querySelector('#paletteList').addEventListener('mousemove', (e) => {
      const el = e.target.closest('.palette-item');
      if (!el) return;
      const i = Number(el.getAttribute('data-i'));
      if (i !== active) {
        active = i;
        paintList();
      }
    });

    input.addEventListener('input', () => {
      active = 0;
      items = buildResults(input.value);
      paintList();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        move(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        run(items[active]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
      e.stopPropagation();
    });

    input.focus();
  }

  function close() {
    if (!open) return;
    open = false;
    const root = rootEl();
    if (root) root.innerHTML = '';
  }

  HR.palette = { open: openPalette, close: close, isOpen: () => open };
})();