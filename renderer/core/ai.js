/* 大模型封装（功能 1）
   只做两件事：把配置读出来发一次对话请求；把简历正文丢给模型并要求返回严格 JSON。
   请求由 window.api.aiChat 发出：Electron 下走主进程（避开 CSP / CORS），网页版直连。 */
(function () {
  const HR = window.HR;
  const util = HR.util;

  const DEFAULT_CONFIG = { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' };

  function config() {
    const raw = (HR.data && HR.data.raw && HR.data.raw.aiConfig) || {};
    return Object.assign({}, DEFAULT_CONFIG, raw);
  }

  function isConfigured() {
    const c = config();
    return !!(c.baseUrl && c.apiKey && c.model);
  }

  /**
   * 发一次对话请求
   * @returns {Promise<string|null>} 纯文本；失败返回 null 并 toast
   */
  async function chat(systemPrompt, userText, opts) {
    const o = opts || {};
    const c = config();
    if (!c.baseUrl || !c.apiKey) {
      if (!o.silent) HR.ui.toast('请先在「设置 → AI 配置」里填写 API Base URL 与 API Key', 'error');
      return null;
    }
    let res;
    try {
      res = await window.api.aiChat({
        baseUrl: c.baseUrl,
        apiKey: c.apiKey,
        model: c.model,
        system: systemPrompt,
        user: userText,
        jsonMode: !!o.jsonMode,
        temperature: o.temperature
      });
    } catch (err) {
      res = { ok: false, error: (err && err.message) || String(err) };
    }
    if (!res || !res.ok) {
      if (!o.silent) HR.ui.toast('AI 请求失败：' + ((res && res.error) || '未知错误'), 'error');
      return null;
    }
    return res.text;
  }

  /** 测试连接：发一个极短的 ping，返回 { ok, message } */
  async function testConnection() {
    const c = config();
    if (!c.baseUrl || !c.apiKey) return { ok: false, message: '请先填写 API Base URL 与 API Key' };
    let res;
    try {
      res = await window.api.aiChat({
        baseUrl: c.baseUrl,
        apiKey: c.apiKey,
        model: c.model,
        system: '你是连通性测试助手，只回复两个字：正常',
        user: 'ping',
        temperature: 0
      });
    } catch (err) {
      res = { ok: false, error: (err && err.message) || String(err) };
    }
    if (res && res.ok) return { ok: true, message: '连接成功，模型回复：' + util.truncate(res.text, 30) };
    return { ok: false, message: (res && res.error) || '连接失败' };
  }

  const EXTRACT_SYSTEM =
    '你是资深 HR 简历解析助手。请从候选人简历正文中抽取结构化信息，' +
    '只输出一个 JSON 对象，不要输出任何解释文字、不要用 markdown 代码块包裹。\n' +
    'JSON 字段固定如下（缺失的字符串留空、数字填 0、数组填空数组）：\n' +
    '{\n' +
    '  "name": "姓名",\n' +
    '  "phone": "手机号",\n' +
    '  "email": "邮箱",\n' +
    '  "education": { "highest": "最高学历(大专/本科/硕士/博士)", "school": "毕业院校", ' +
    '"schoolTier": "院校层次(985/211/双一流/海外QS100/普通本科/大专/其他)", "major": "专业", "gradYear": "毕业年份" },\n' +
    '  "work": { "totalYears": 总工作年限数字, "latestCompany": "最近公司", "latestTitle": "最近职位", ' +
    '"latestDurationMonths": 最近一段工作时长月数, "jobHoppingScore": 跳槽风险分0到100, "gapMonths": 空窗期累计月数 },\n' +
    '  "expectation": { "salary": "期望薪资原文", "location": "期望城市", "availableDate": "可到岗时间" },\n' +
    '  "skills": ["核心技能标签"],\n' +
    '  "riskFlags": ["风险信号，如 近3年换了4份工作 / 空窗期18个月 / 学历时间线存疑"],\n' +
    '  "summary": "一句话画像，40字以内"\n' +
    '}\n' +
    '跳槽风险分：近 5 年每多换一份工作加分，0 次约 0-10，1 次约 20，2 次约 40，3 次约 65，4 次及以上 85-100。\n' +
    '请基于简历原文客观判断，不要编造简历中不存在的信息。';

  /** 把模型返回的 JSON 兜底成完整结构 */
  function normalizeProfile(obj) {
    const o = obj && typeof obj === 'object' ? obj : {};
    const edu = o.education && typeof o.education === 'object' ? o.education : {};
    const work = o.work && typeof o.work === 'object' ? o.work : {};
    const exp = o.expectation && typeof o.expectation === 'object' ? o.expectation : {};
    const num = (v) => {
      const n = Number(v);
      return isNaN(n) ? 0 : n;
    };
    const str = (v) => (v == null ? '' : String(v));
    const arr = (v) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : []);
    return {
      name: str(o.name),
      phone: str(o.phone),
      email: str(o.email),
      education: {
        highest: str(edu.highest),
        school: str(edu.school),
        schoolTier: str(edu.schoolTier),
        major: str(edu.major),
        gradYear: str(edu.gradYear)
      },
      work: {
        totalYears: num(work.totalYears),
        latestCompany: str(work.latestCompany),
        latestTitle: str(work.latestTitle),
        latestDurationMonths: num(work.latestDurationMonths),
        jobHoppingScore: Math.max(0, Math.min(100, num(work.jobHoppingScore))),
        gapMonths: num(work.gapMonths)
      },
      expectation: {
        salary: str(exp.salary),
        location: str(exp.location),
        availableDate: str(exp.availableDate)
      },
      skills: arr(o.skills),
      riskFlags: arr(o.riskFlags),
      summary: str(o.summary),
      parsedAt: util.now()
    };
  }

  /** 从可能带代码块的文本里抠出 JSON 并解析 */
  function parseJsonLoose(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    const candidates = [];
    candidates.push(t);
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) candidates.push(fence[1].trim());
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first >= 0 && last > first) candidates.push(t.slice(first, last + 1));
    for (const c of candidates) {
      try {
        const v = JSON.parse(c);
        if (v && typeof v === 'object') return v;
      } catch (err) {
        /* 试下一个 */
      }
    }
    return null;
  }

  /**
   * 解析一份简历正文，返回结构化画像
   * @returns {Promise<object|null>}
   */
  async function extractResume(resumeText, opts) {
    const text = String(resumeText || '').trim();
    if (!text) {
      HR.ui.toast('该候选人没有简历正文，无法解析', 'error');
      return null;
    }
    const out = await chat(EXTRACT_SYSTEM, '简历正文如下：\n' + util.truncate(text, 6000), {
      jsonMode: true,
      silent: opts && opts.silent
    });
    if (!out) return null;
    const parsed = parseJsonLoose(out);
    if (!parsed) {
      if (!(opts && opts.silent)) HR.ui.toast('模型返回的不是合法 JSON，已跳过', 'error');
      return null;
    }
    return normalizeProfile(parsed);
  }

  HR.ai = {
    DEFAULT_CONFIG,
    config,
    isConfigured,
    chat,
    testConnection,
    extractResume,
    normalizeProfile,
    parseJsonLoose
  };
})();