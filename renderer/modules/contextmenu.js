/* 自定义右键菜单（深色圆角），目前用于简历池表格行 */
(function () {
  const HR = window.HR;
  const esc = HR.util.esc;

  let open = false;

  function ico(name, size) {
    return HR.icons ? HR.icons.icon(name, size) : '';
  }

  function close() {
    if (!open) return;
    open = false;
    const r = document.getElementById('ctxRoot');
    if (r) r.innerHTML = '';
  }

  /** @param {Array<Object|string>} items 菜单项；字符串 '-' 表示分隔线 */
  function show(x, y, items) {
    const root = document.getElementById('ctxRoot');
    if (!root) return;
    root.innerHTML =
      '<div class="ctx-menu" style="left:' + x + 'px;top:' + y + 'px">' +
      items
        .map((it, i) =>
          it === '-'
            ? '<div class="ctx-sep"></div>'
            : '<div class="ctx-item' + (it.danger ? ' danger' : '') + '" data-i="' + i + '">' +
              ico(it.icon || 'file-text', 14) +
              '<span>' + esc(it.label) + '</span></div>'
        )
        .join('') +
      '</div>';
    open = true;

    const menu = root.querySelector('.ctx-menu');
    // 靠近窗口边缘时向内收，避免被裁掉
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    if (x + w > window.innerWidth - 8) menu.style.left = Math.max(8, window.innerWidth - w - 8) + 'px';
    if (y + h > window.innerHeight - 8) menu.style.top = Math.max(8, window.innerHeight - h - 8) + 'px';

    menu.addEventListener('click', (e) => {
      const el = e.target.closest('.ctx-item');
      if (!el) return;
      const it = items[Number(el.getAttribute('data-i'))];
      close();
      if (it && typeof it.run === 'function') it.run();
    });
  }

  /* 点别处 / 滚动 / 改窗口大小 自动关闭 */
  /* 注意：合成事件或点在 document 上时 e.target 可能不是元素，closest 会抛错，必须先判断 */
  function closestEl(target, sel) {
    return target && target.closest ? target.closest(sel) : null;
  }

  document.addEventListener('mousedown', (e) => {
    if (open && !closestEl(e.target, '.ctx-menu')) close();
  });
  document.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);

  /* 简历池行右键 */
  document.addEventListener('contextmenu', (e) => {
    const tr = closestEl(e.target, '.pane[data-pane="pool"] tbody tr[data-id]');
    if (!tr) return;
    const id = tr.getAttribute('data-id');
    const r = HR.data.resume(id);
    if (!r) return;
    e.preventDefault();

    const inPool = !!r.inTalentPool;
    show(e.clientX, e.clientY, [
      { label: '查看详情', icon: 'file-text', run: () => HR.pool.openDetail(id) },
      { label: '编辑', icon: 'pencil', run: () => HR.pool.openForm(r) },
      { label: '打标签', icon: 'tag', run: () => HR.pool.openTag && HR.pool.openTag(id) },
      {
        label: inPool ? '移出人才库' : '移到人才库',
        icon: 'database',
        run: () => HR.pool.toggleTalent && HR.pool.toggleTalent(id)
      },
      '-',
      { label: '删除', icon: 'trash-2', danger: true, run: () => HR.pool.removeResume && HR.pool.removeResume(id) }
    ]);
  });

  HR.ctxmenu = { show: show, close: close, isOpen: () => open };
})();