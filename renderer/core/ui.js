/* 交互层：toast 通知、模态框、确认框、多选弹窗 */
(function () {
  const HR = window.HR;
  const esc = (s) => HR.util.esc(s);

  function toast(message, type) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    const kind = type || 'info';
    el.className = 'toast ' + kind;
    el.innerHTML =
      '<span class="toast-ico">' +
      (kind === 'error' ? '⚠️' : kind === 'success' ? '✅' : 'ℹ️') +
      '</span><span>' + esc(message) + '</span>';
    box.appendChild(el);
    const life = String(message || '').length > 60 ? 6000 : 3000;
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, life);
  }

  /**
   * 通用模态框
   * @param {{title:string, body:string|HTMLElement, actions:Array, width:number, onMount:Function, dismissible:boolean}} opts
   */
  function modal(opts) {
    const o = opts || {};
    const root = document.getElementById('modalRoot');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.width = (o.width || 560) + 'px';
    box.innerHTML =
      '<div class="modal-hd"><h3>' + esc(o.title || '') + '</h3>' +
      '<button class="modal-x" type="button" data-close>&times;</button></div>' +
      '<div class="modal-bd"></div>' +
      '<div class="modal-ft"></div>';

    const bodyEl = box.querySelector('.modal-bd');
    if (typeof o.body === 'string') bodyEl.innerHTML = o.body;
    else if (o.body instanceof HTMLElement) bodyEl.appendChild(o.body);

    const footerEl = box.querySelector('.modal-ft');
    const handle = {
      el: box,
      body: bodyEl,
      footer: footerEl,
      close() {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
      }
    };

    const actions = o.actions || [];
    if (!actions.length) footerEl.style.display = 'none';
    actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (a.kind === 'ghost' ? 'ghost' : a.kind === 'danger' ? 'danger' : '');
      btn.textContent = a.label;
      btn.disabled = !!a.disabled;
      btn.addEventListener('click', () => {
        if (a.onClick) a.onClick(handle);
        else handle.close();
      });
      footerEl.appendChild(btn);
    });

    overlay.appendChild(box);
    root.appendChild(overlay);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay && o.dismissible !== false) handle.close();
    });
    box.querySelector('[data-close]').addEventListener('click', () => handle.close());

    function onKey(e) {
      if (e.key === 'Escape' && o.dismissible !== false) handle.close();
    }
    document.addEventListener('keydown', onKey);

    if (o.onMount) o.onMount(handle);
    return handle;
  }

  /**
   * 危险操作确认弹窗
   * @param {string} [requireText] 非空时要求用户原样输入这段文字才能确认（清空 / 永久删除用）
   */
  function confirm(title, message, okLabel, kind, requireText) {
    return new Promise((resolve) => {
      const need = String(requireText || '');
      const body =
        '<p class="modal-text">' + esc(message) + '</p>' +
        (need
          ? '<div class="field" style="margin-top:14px"><label>请输入「' + esc(need) + '」以确认</label>' +
            '<input class="input" id="cfmText" autocomplete="off" spellcheck="false" placeholder="' + esc(need) + '" /></div>'
          : '');
      const h = modal({
        title: title,
        body: body,
        width: 430,
        actions: [
          { label: '取消', kind: 'ghost', onClick() { h.close(); resolve(false); } },
          {
            label: okLabel || '确定',
            kind: kind || 'danger',
            onClick() {
              if (need) {
                const el = document.getElementById('cfmText');
                const v = ((el && el.value) || '').trim();
                if (v !== need) {
                  toast('请先输入「' + need + '」再确认', 'error');
                  return;
                }
              }
              h.close();
              resolve(true);
            }
          }
        ]
      });
    });
  }

  /**
   * 多选一弹窗，resolve 选中的 value（关闭返回 null）
   */
  function choose(title, message, options) {
    return new Promise((resolve) => {
      const h = modal({
        title: title,
        body: '<p class="modal-text">' + esc(message) + '</p>',
        width: 470,
        actions: (options || []).map((opt) => ({
          label: opt.label,
          kind: opt.kind,
          onClick() {
            h.close();
            resolve(opt.value);
          }
        }))
      });
      const originalClose = h.close;
      h.close = function () {
        originalClose.call(h);
        resolve(null);
      };
    });
  }

  /**
   * 空状态：插画（SVG）+ 标题 + 说明 + 可选主按钮
   * @param {string} iconName 图标名（见 core/icons.js）；不在图标表里时按 emoji 处理
   * @param {string} title    标题
   * @param {string} [desc]   一行说明
   * @param {string} [actionHtml] 操作区 HTML，例如 '<button class="btn" id="xxx">导入简历</button>'
   */
  function empty(iconName, title, desc, actionHtml) {
    const art =
      HR.icons && HR.icons.has(iconName)
        ? HR.icons.illustration(iconName, 64)
        : '<span class="empty-art-emoji">' + esc(iconName || '') + '</span>';
    return (
      '<div class="empty">' + art +
      '<div class="empty-title">' + esc(title || '暂无数据') + '</div>' +
      (desc ? '<div class="empty-desc">' + esc(desc) + '</div>' : '') +
      (actionHtml ? '<div class="empty-actions">' + actionHtml + '</div>' : '') +
      '</div>'
    );
  }

  /** 复制到剪贴板并给出 toast 提示 */
  async function copy(text) {
    const t = String(text == null ? '' : text);
    if (!t) return;
    try {
      await window.api.copyText(t);
      toast('已复制');
    } catch (e) {
      toast('复制失败，请手动选择复制', 'error');
    }
  }

  function setStatus(text) {
    const el = document.getElementById('statusText');
    if (el) el.textContent = text;
  }

  /**
   * 表格虚拟滚动：只渲染可视区内的行，用上下两个占位行撑出总高度。
   * 上千份简历时把 DOM 行数从上千降到几十行，是简历池 / 初筛页最主要的性能手段。
   * 行高优先实测（避免与 CSS 不一致导致滚动跳动）。
   *
   * @param {Object} opt
   *   scroller  纵向滚动容器（CSS 需给固定高度 + overflow:auto）
   *   tbody     表格的 tbody
   *   total     总行数
   *   rowHtml   (index) => '<tr>...</tr>'
   *   colSpan   占位行跨越的列数
   *   headH     表头高度（sticky 表头占位，默认 38）
   *   overscan  上下各多渲染几行，避免快速滚动露白（默认 6）
   * @returns {Function} update 重新计算并渲染（筛选条件变化后调用）
   */
  function virtualTable(opt) {
    const scroller = opt.scroller;
    const tbody = opt.tbody;
    const total = opt.total || 0;
    const rowHtml = opt.rowHtml;
    const colSpan = opt.colSpan || 20;
    const headH = opt.headH == null ? 38 : opt.headH;
    const overscan = opt.overscan == null ? 6 : opt.overscan;
    const PAD = 'padding:0;border:none';

    let rowH = opt.rowHeight || 40;
    let measured = false;
    let lastStart = -1;
    let lastEnd = -1;
    let raf = 0;

    function paint(force) {
      if (!tbody.isConnected || !scroller.isConnected) return;
      const viewH = scroller.clientHeight || 600;
      const bodyTop = Math.max(0, (scroller.scrollTop || 0) - headH);

      let start = Math.floor(bodyTop / rowH) - overscan;
      if (start < 0) start = 0;
      let end = Math.ceil((bodyTop + viewH) / rowH) + overscan;
      if (end > total) end = total;
      if (end <= start) end = Math.min(total, start + 1);

      if (!force && start === lastStart && end === lastEnd) return;
      lastStart = start;
      lastEnd = end;

      const padTop = start * rowH;
      const padBottom = Math.max(0, (total - end) * rowH);
      let html = '';
      if (padTop > 0) {
        html += '<tr class="vt-pad" style="height:' + padTop + 'px"><td colspan="' + colSpan + '" style="' + PAD + '"></td></tr>';
      }
      for (let i = start; i < end; i++) html += rowHtml(i);
      if (padBottom > 0) {
        html += '<tr class="vt-pad" style="height:' + padBottom + 'px"><td colspan="' + colSpan + '" style="' + PAD + '"></td></tr>';
      }
      tbody.innerHTML = html;

      if (!measured) {
        const row = tbody.querySelector('tr:not(.vt-pad)');
        const h = row && row.offsetHeight;
        if (h) {
          measured = true;
          if (Math.abs(h - rowH) > 0.5) {
            rowH = h;
            paint(true);
          }
        }
      }
    }

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        paint(false);
      });
    }

    scroller.addEventListener('scroll', onScroll, { passive: true });
    paint(true);

    return function update() {
      lastStart = -1;
      lastEnd = -1;
      paint(true);
    };
  }

  HR.ui = { toast, modal, confirm, choose, empty, setStatus, virtualTable, copy };
})();