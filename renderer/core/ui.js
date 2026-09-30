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

  function confirm(title, message, okLabel, kind) {
    return new Promise((resolve) => {
      const h = modal({
        title: title,
        body: '<p class="modal-text">' + esc(message) + '</p>',
        width: 430,
        actions: [
          { label: '取消', kind: 'ghost', onClick() { h.close(); resolve(false); } },
          { label: okLabel || '确定', kind: kind || 'danger', onClick() { h.close(); resolve(true); } }
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

  function empty(icon, text) {
    return '<div class="empty"><span class="empty-ico">' + (icon || '📭') + '</span>' + esc(text || '暂无数据') + '</div>';
  }

  function setStatus(text) {
    const el = document.getElementById('statusText');
    if (el) el.textContent = text;
  }

  HR.ui = { toast, modal, confirm, choose, empty, setStatus };
})();