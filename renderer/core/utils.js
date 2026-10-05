/* 通用工具函数 + 全局命名空间 */
(function () {
  const HR = (window.HR = window.HR || {});

  HR.modules = {};
  /* 图标快捷方式：icons.js 在后加载，所以这里延迟到调用时取值 */
  HR.ico = function (name, size) {
    return HR.icons ? HR.icons.icon(name, size) : '';
  };

  HR.moduleOrder = [];
  HR.register = function (mod) {
    HR.modules[mod.key] = mod;
    HR.moduleOrder.push(mod.key);
  };

  HR.STATUS = {
    pending_screen: { key: 'pending_screen', label: '待初筛', cls: '' },
    pending_interview: { key: 'pending_interview', label: '待面试', cls: 'blue' },
    interviewing: { key: 'interviewing', label: '面试中', cls: 'yellow' },
    offered: { key: 'offered', label: '已发 offer', cls: 'purple' },
    hired: { key: 'hired', label: '已入职', cls: 'green' },
    rejected: { key: 'rejected', label: '已淘汰', cls: 'red' }
  };
  HR.STATUS_ORDER = ['pending_screen', 'pending_interview', 'interviewing', 'offered', 'hired', 'rejected'];
  HR.ACTIVE_STATUS = ['pending_screen', 'pending_interview', 'interviewing', 'offered'];

  HR.SOURCES = ['BOSS直聘', '猎聘', '内推', '校招', '其他'];

  function p2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  HR.util = {
    uid(prefix) {
      return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },
    now() {
      return new Date().toISOString();
    },
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    },
    fmtDate(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    },
    fmtDateTime(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return (
        d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
        ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes())
      );
    },
    fromNow(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      const diff = Date.now() - d.getTime();
      const min = Math.floor(diff / 60000);
      if (min < 1) return '刚刚';
      if (min < 60) return min + ' 分钟前';
      const hour = Math.floor(min / 60);
      if (hour < 24) return hour + ' 小时前';
      const day = Math.floor(hour / 24);
      if (day < 30) return day + ' 天前';
      return HR.util.fmtDate(iso);
    },
    daysSince(iso) {
      if (!iso) return 0;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return 0;
      return Math.floor((Date.now() - d.getTime()) / 86400000);
    },
    maskPhone(phone) {
      const p = String(phone || '');
      if (p.length < 7) return p || '—';
      return p.slice(0, 3) + '****' + p.slice(-4);
    },
    debounce(fn, ms) {
      let t = null;
      return function () {
        const args = arguments;
        const self = this;
        if (t) clearTimeout(t);
        t = setTimeout(() => fn.apply(self, args), ms || 200);
      };
    },
    csvCell(v) {
      const s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    },
    toCsv(rows) {
      return rows.map((r) => r.map(HR.util.csvCell).join(',')).join('\r\n');
    },
    truncate(s, n) {
      const t = String(s == null ? '' : s);
      return t.length > n ? t.slice(0, n) + '…' : t;
    },
    todayInput() {
      const d = new Date();
      return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    },
    dateInputShift(days) {
      const d = new Date(Date.now() + days * 86400000);
      return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    },
    groupCount(arr, keyFn) {
      const map = new Map();
      arr.forEach((item) => {
        const k = keyFn(item);
        map.set(k, (map.get(k) || 0) + 1);
      });
      return map;
    }
  };
})();