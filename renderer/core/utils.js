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

  /* 跟进方式：类型 → 文案 + 图标名（图标见 core/icons.js） */
  HR.FOLLOWUP_TYPES = {
    phone: { label: '电话', icon: 'phone' },
    wechat: { label: '微信', icon: 'message-circle' },
    email: { label: '邮件', icon: 'mail' },
    onsite: { label: '面谈', icon: 'users' }
  };
  HR.FOLLOWUP_TYPE_ORDER = ['phone', 'wechat', 'email', 'onsite'];

  /* 入职材料 checklist 模板：状态切到「已入职」时自动生成到 application.onboardChecklist */
  HR.ONBOARD_CHECKLIST = [
    { key: 'idCard', label: '身份证复印件' },
    { key: 'eduCert', label: '学历证明' },
    { key: 'resume', label: '离职证明' },
    { key: 'medical', label: '体检报告' },
    { key: 'equipment', label: '办公设备准备' },
    { key: 'firstDay', label: '首日安排通知' }
  ];

  /* 候选人反馈下拉选项（Offer 详情用） */
  HR.OFFER_FEEDBACK = ['待反馈', '已接受', '薪资不满意', '在等别家', '已拒绝', '已入职'];

  /* 面试轮次（结构化题库与面试评估共用） */
  HR.INTERVIEW_ROUNDS = ['HR 面', '业务面', '技术面', '终面'];

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
    /* 把 'YYYY-MM-DD' 或 ISO 解析成「当天 0 点」的本地日期对象（避免 UTC 解析导致差半天） */
    ymd(iso) {
      const m = String(iso == null ? '' : iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    },
    /** a → b 相差几天（b 晚于 a 为正），忽略时分秒 */
    diffDays(aIso, bIso) {
      const a = HR.util.ymd(aIso);
      const b = HR.util.ymd(bIso);
      if (!a || !b) return 0;
      return Math.round((b - a) / 86400000);
    },
    /** 距今天还有几天：未来为正、已过为负、无日期为 null */
    daysUntil(iso) {
      const b = HR.util.ymd(iso);
      if (!b) return null;
      const t = new Date();
      const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
      return Math.round((b - today) / 86400000);
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