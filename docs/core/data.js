/* 数据层：内存态 + userData 下的 JSON 落盘，含所有增删改查 */
(function () {
  const HR = window.HR;
  const util = HR.util;

  const data = {
    raw: { version: 1, jobs: [], resumes: [], applications: [] },

    /* ---------- 读写 ---------- */
    async load() {
      const d = await window.api.loadData();
      this.raw = Object.assign({ version: 1, jobs: [], resumes: [], applications: [] }, d || {});
      this.normalize();
      return this.raw;
    },

    normalize() {
      const raw = this.raw;
      ['jobs', 'resumes', 'applications'].forEach((k) => {
        if (!Array.isArray(raw[k])) raw[k] = [];
      });
      raw.jobs.forEach((j) => {
        j.rules = j.rules || {};
        ['must', 'plus', 'exclude'].forEach((k) => {
          if (!Array.isArray(j.rules[k])) j.rules[k] = [];
        });
        j.rules.must = j.rules.must.map((r) =>
          typeof r === 'string' ? { text: r, veto: false } : { text: (r && r.text) || '', veto: !!(r && r.veto) }
        );
        j.rules.plus = j.rules.plus.map((r) => (typeof r === 'string' ? { text: r } : { text: (r && r.text) || '' }));
        j.rules.exclude = j.rules.exclude.map((r) => (typeof r === 'string' ? { text: r } : { text: (r && r.text) || '' }));
        if (typeof j.archived !== 'boolean') j.archived = !!j.archived;
      });
      raw.resumes.forEach((r) => {
        if (!Array.isArray(r.tags)) r.tags = [];
        if (typeof r.inTalentPool !== 'boolean') r.inTalentPool = !!r.inTalentPool;
        if (!r.createdAt) r.createdAt = util.now();
      });
      raw.applications.forEach((a) => {
        if (!Array.isArray(a.followUps)) a.followUps = [];
        if (!Array.isArray(a.interviews)) a.interviews = [];
        if (!a.createdAt) a.createdAt = util.now();
        if (!a.lastFollowUpAt) a.lastFollowUpAt = a.createdAt;
        if (!a.status || !HR.STATUS[a.status]) a.status = 'pending_screen';
      });
    },

    persist() {
      return window.api.saveData(this.raw);
    },

    /** 失焦 / 切 tab 时调用，静默保存 */
    persistNow() {
      this.persist().catch(() => {
        HR.ui.toast('数据保存失败，请检查磁盘权限', 'error');
      });
    },

    /* ---------- 查询 ---------- */
    jobs(includeArchived) {
      return this.raw.jobs.filter((j) => includeArchived || !j.archived);
    },
    job(id) {
      return this.raw.jobs.find((j) => j.id === id) || null;
    },
    resume(id) {
      return this.raw.resumes.find((r) => r.id === id) || null;
    },
    application(id) {
      return this.raw.applications.find((a) => a.id === id) || null;
    },
    appsOfJob(jobId) {
      return this.raw.applications.filter((a) => a.jobId === jobId);
    },
    appsOfResume(resumeId) {
      return this.raw.applications.filter((a) => a.resumeId === resumeId);
    },
    appOf(resumeId, jobId) {
      return this.raw.applications.find((a) => a.resumeId === resumeId && a.jobId === jobId) || null;
    },
    findByPhoneOrEmail(phone, email) {
      const mail = String(email || '').toLowerCase();
      return (
        this.raw.resumes.find(
          (r) => (phone && r.phone && r.phone === phone) || (mail && r.email && String(r.email).toLowerCase() === mail)
        ) || null
      );
    },
    allTags() {
      const set = new Set();
      this.raw.resumes.forEach((r) => (r.tags || []).forEach((t) => set.add(t)));
      return [...set].sort();
    },

    /* ---------- 岗位 ---------- */
    addJob(job) {
      const j = Object.assign(
        {
          id: util.uid('job'),
          name: '',
          department: '',
          channel: HR.SOURCES[0],
          jd: '',
          archived: false,
          createdAt: util.now(),
          updatedAt: util.now()
        },
        job || {}
      );
      this.raw.jobs.push(j);
      return j;
    },
    updateJob(id, patch) {
      const j = this.job(id);
      if (!j) return null;
      Object.assign(j, patch, { updatedAt: util.now() });
      return j;
    },
    removeJob(id) {
      this.raw.jobs = this.raw.jobs.filter((j) => j.id !== id);
      this.raw.applications = this.raw.applications.filter((a) => a.jobId !== id);
    },

    /* ---------- 简历 ---------- */
    addResume(info) {
      const r = Object.assign(
        {
          id: util.uid('res'),
          name: '',
          phone: '',
          email: '',
          school: '',
          degree: '',
          major: '',
          gradYear: '',
          source: '其他',
          tags: [],
          inTalentPool: false,
          text: '',
          fileName: '',
          note: '',
          createdAt: util.now()
        },
        info || {}
      );
      this.raw.resumes.push(r);
      return r;
    },
    updateResume(id, patch) {
      const r = this.resume(id);
      if (!r) return null;
      Object.assign(r, patch);
      return r;
    },
    removeResume(id) {
      this.raw.resumes = this.raw.resumes.filter((r) => r.id !== id);
      this.raw.applications = this.raw.applications.filter((a) => a.resumeId !== id);
    },
    toggleTag(id, tag) {
      const r = this.resume(id);
      if (!r) return null;
      r.tags = r.tags || [];
      const i = r.tags.indexOf(tag);
      if (i >= 0) r.tags.splice(i, 1);
      else r.tags.push(tag);
      return r;
    },

    /* ---------- 投递记录 ---------- */
    addApplication(input) {
      const existing = this.appOf(input.resumeId, input.jobId);
      if (existing) return existing;
      const a = {
        id: util.uid('app'),
        resumeId: input.resumeId,
        jobId: input.jobId,
        status: input.status || 'pending_screen',
        score: null,
        passedScreen: false,
        scheduled: false,
        attended: false,
        offered: false,
        hired: false,
        createdAt: util.now(),
        lastFollowUpAt: util.now(),
        nextFollowUpAt: '',
        followUps: [],
        interviews: []
      };
      this.raw.applications.push(a);
      applyFlags(a);
      return a;
    },

    setStatus(appId, status) {
      const a = this.application(appId);
      if (!a) return null;
      a.status = status;
      a.statusChangedAt = util.now();
      a.lastFollowUpAt = util.now();
      applyFlags(a);
      return a;
    },

    addFollowUp(appId, note, nextDate) {
      const a = this.application(appId);
      if (!a) return null;
      a.followUps = a.followUps || [];
      a.followUps.push({ time: util.now(), note: String(note || '').trim() });
      a.lastFollowUpAt = util.now();
      if (nextDate !== undefined) a.nextFollowUpAt = nextDate || '';
      return a;
    },

    isOverdue(app, days) {
      if (!app) return false;
      if (HR.ACTIVE_STATUS.indexOf(app.status) < 0) return false;
      return util.daysSince(app.lastFollowUpAt) > (days == null ? 3 : days);
    }
  };

  function applyFlags(a) {
    const s = a.status;
    if (s === 'rejected') return; // 淘汰保留历史环节标记
    if (['pending_interview', 'interviewing', 'offered', 'hired'].indexOf(s) >= 0) {
      a.passedScreen = true;
      a.scheduled = true;
    }
    if (['interviewing', 'offered', 'hired'].indexOf(s) >= 0) a.attended = true;
    if (['offered', 'hired'].indexOf(s) >= 0) a.offered = true;
    if (s === 'hired') a.hired = true;
  }

  data.applyFlags = applyFlags;
  data.statusLabel = function (s) {
    return (HR.STATUS[s] || { label: s }).label;
  };

  /** 清空全部数据 */
  data.clearAll = function () {
    this.raw = { version: 1, jobs: [], resumes: [], applications: [], updatedAt: util.now() };
  };

  HR.data = data;
})();