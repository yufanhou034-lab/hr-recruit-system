/* 初筛打分引擎（沿用原有框架的匹配算法，扩展为「必备/加分/排除 + 一票否决」） */
(function () {
  const HR = window.HR;

  /* 匹配算法版本号。
     口径一旦变化（例如本次把余弦相似度换成 IDF 加权的覆盖率），
     旧的打分结果就不再可比 —— 带上版本号后，初筛页会把旧版本的分数视为「待重算」，
     避免新算法上线了、老候选人却一直沿用旧分数的尴尬。 */
  const ALGO_VERSION = 2;

  // 字符 2-gram + 英文整词，用于覆盖率与 IDF
  function keywords(text) {
    const clean = String(text || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    const set = new Set();
    for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
    const en = String(text || '').match(/[a-zA-Z0-9]+/g) || [];
    en.forEach((w) => set.add(w.toLowerCase()));
    return [...set];
  }

  // 一条标准可用 / 或 、 分隔多个同义词，命中任一即算命中
  function synonyms(item) {
    return String(item || '')
      .split(/[／/、]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /* ---------- 内置同义词词典 ----------
     规则里本来就支持用 / 、 内联写同义词，这里补的是「跨岗位通用、且高置信度」的等价说法，
     解决「HR 写『英语六级』、简历写『CET-6』」这类对不上的问题。
     收录原则：只收真正等价的词。
     像 Excel 与 Word 虽然同属办公软件，但不等价 —— 故意不放进同一组，
     否则一条「必须会 Excel」的必备项会误判成命中，只会 Word 的人就被放过去了。 */
  const SYNONYM_GROUPS = [
    ['统招本科', '全日制本科', '本科', '学士'],
    ['硕士', '研究生', '硕研'],
    ['博士', 'phd'],
    ['大专', '专科', '高职'],
    ['英语六级', '六级', 'cet-6', 'cet6'],
    ['英语四级', '四级', 'cet-4', 'cet4'],
    ['办公软件', 'office', 'wps'],
    ['数据分析', '数据处理', '数据统计'],
    ['沟通表达', '沟通能力', '表达能力'],
    ['团队协作', '团队合作', '团队配合'],
    ['学生会', '学生组织'],
    ['实习', '实习经历', '实习生']
  ];

  /* ---------- 用户自定义同义词（设置页维护，存在 data.json 的 synonyms 数组） ----------
     每行一组，用 / 或 、 分隔，只有两个词以上才算一组（单个词谈不上同义）。
     与内置词典是叠加关系而非替换：内置的始终生效，自定义的在此基础上追加。
     解析结果按原始内容缓存，避免每条规则、每份简历都重新切分。 */
  let customCache = { key: null, groups: [] };
  function customGroups() {
    const lines = (HR.data && HR.data.raw && HR.data.raw.synonyms) || [];
    const key = lines.join('\n');
    if (customCache.key === key) return customCache.groups;
    const groups = [];
    lines.forEach((line) => {
      const terms = String(line || '')
        .split(/[／/、]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (terms.length >= 2) groups.push(terms);
    });
    customCache = { key: key, groups: groups };
    return groups;
  }

  function allGroups() {
    return SYNONYM_GROUPS.concat(customGroups());
  }

  /**
   * 把一条标准展开成待匹配的词表：内联同义词（原样）+ 内置词典 + 用户自定义词典。
   * 命中词典词时标注 via='同义词'，方便在界面上区分「字面命中」和「词典命中」。
   * @returns {Array<{t:string, via:string}>}
   */
  function expandTerms(item) {
    const base = synonyms(item);
    const out = [];
    const seen = new Set();
    function push(t, via) {
      const k = String(t || '').toLowerCase();
      if (!t || seen.has(k)) return;
      seen.add(k);
      out.push({ t: t, via: via || '' });
    }
    base.forEach((t) => push(t, ''));
    base.forEach((t) => {
      allGroups().forEach((group) => {
        // 只有「实质等价」才扩展：完全相等，或是包含关系且长度相近。
        // 长度比例门槛用来挡住「每周可实习4天以上」被「实习」这种短词蒙中的情况 ——
        // 那会把连续命中的严格要求彻底废掉。
        const related = group.some((g) => {
          if (t === g) return true;
          if (t.indexOf(g) >= 0) return g.length >= t.length * 0.5;
          if (g.indexOf(t) >= 0) return t.length >= g.length * 0.5;
          return false;
        });
        if (!related) return;
        group.forEach((g) => push(g, '同义词'));
      });
    });
    return out;
  }

  // 简历里的英文/数字整词（CET-6 记作 cet6），避免 "ce" 误命中 "Excel"
  function asciiRuns(s) {
    const m = String(s || '').toLowerCase().match(/[a-z0-9]+(?:[-_.\/][a-z0-9]+)*/g) || [];
    const set = new Set();
    m.forEach((r) => {
      const t = r.replace(/[^a-z0-9]/g, '');
      if (t) set.add(t);
    });
    return set;
  }

  // 中文标准需要「连续片段」才算命中：短词要求全中，长词要求连续命中 4 字以上。
  // 这样「实习」不会误命中「每周可实习4天以上」，「本科」也不会误命中「全日制本科」这类整句门槛。
  function cjkRunRequired(len) {
    if (len <= 2) return len;
    // 3 字以上一律至少要求连续命中 3 字。
    // 原来的下限是 2，导致「英语六级」这样的 4 字标准会被简历里的「英语」两字蒙中。
    return Math.min(4, Math.max(3, Math.ceil(len * 0.5)));
  }

  // 返回 a 与 b 的最长公共连续子串（a 为标准的中文部分，b 为简历压平后的中文串）
  function longestCjkRun(a, b) {
    for (let len = a.length; len >= 1; len--) {
      for (let i = 0; i + len <= a.length; i++) {
        const sub = a.slice(i, i + len);
        if (b.indexOf(sub) >= 0) return sub;
      }
    }
    return '';
  }

  // 近似匹配：在简历里找一个「窗口」（长度略大于标准），窗口内用最长公共子序列比对，
  // 从而同时容忍少量插入与删除 —— 标准「每周可到岗4天以上」能命中简历里的「每周到岗5天」，
  // 而窗口限制保证了匹配必须局部集中，不会把全文零散的字凑成命中。
  function lcsBacktrack(dp, needle, win) {
    const chars = [];
    let a = needle.length;
    let b = win.length;
    while (a > 0 && b > 0) {
      if (needle[a - 1] === win[b - 1] && dp[a][b] === dp[a - 1][b - 1] + 1) {
        chars.push(needle[a - 1]);
        a--;
        b--;
      } else if (dp[a - 1][b] >= dp[a][b - 1]) {
        a--;
      } else {
        b--;
      }
    }
    return chars.reverse().join('');
  }

  function fuzzyMatch(needle, hay, gapBudget) {
    const n = needle.length;
    if (!n || !hay || hay.length > 20000) return { count: 0, text: '' };
    const winLen = n + gapBudget;
    let best = 0;
    let bestText = '';
    let i = hay.indexOf(needle[0]);
    let tries = 0;
    while (i >= 0 && tries < 24) {
      const win = hay.slice(i, i + winLen);
      const m = win.length;
      const dp = [];
      for (let a = 0; a <= n; a++) dp.push(new Array(m + 1).fill(0));
      for (let a = 1; a <= n; a++) {
        for (let b = 1; b <= m; b++) {
          dp[a][b] =
            needle[a - 1] === win[b - 1] ? dp[a - 1][b - 1] + 1 : Math.max(dp[a - 1][b], dp[a][b - 1]);
        }
      }
      const score = dp[n][m];
      if (score > best) {
        best = score;
        bestText = lcsBacktrack(dp, needle, win);
      }
      if (best === n) break;
      i = hay.indexOf(needle[0], i + 1);
      tries++;
    }
    return { count: best, text: bestText };
  }

  /**
   * 判断一条标准是否命中
   * @returns {{hit:boolean, why:string, word:string}}
   */
  function matchItem(item, resume) {
    const low = String(resume || '').toLowerCase();
    const flat = low.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
    const runs = asciiRuns(low);
    for (const term of expandTerms(item)) {
      const syn = term.t;
      const s = String(syn || '').toLowerCase();
      const cjk = s.replace(/[^\u4e00-\u9fa5]/g, '');
      let whyC = null;
      let wordC = '';
      if (cjk.length) {
        const need = cjkRunRequired(cjk.length);
        const run = longestCjkRun(cjk, flat);
        if (run.length >= need) {
          whyC = run;
          wordC = run.length >= 2 ? run : '';
        } else if (cjk.length >= 4) {
          // 容错窗口随标准长度伸缩：标准「每周可实习4天以上」相对简历「每周可到岗4天」
          // 同时存在插入（到岗）与删除（4 的位置不同），固定 n+3 的窗口会把结尾字符挤掉，
          // 造成本该命中的同义改写漏判。按长度给 40% 的余量，下限仍是 3。
          const fuzzy = fuzzyMatch(cjk, flat, Math.max(3, Math.ceil(cjk.length * 0.4)));
          if (fuzzy.count >= need && fuzzy.count / cjk.length >= 0.55) {
            whyC = '≈' + fuzzy.text;
            wordC = run.length >= 2 ? run : '';
          }
        }
      }
      const eng = (s.match(/[a-z0-9]+(?:[-_.\/][a-z0-9]+)*/g) || [])
        .map((t) => t.replace(/[^a-z0-9]/g, ''))
        .filter((t) => t.length >= 2);
      let whyE = null;
      if (eng.length) whyE = eng.find((t) => runs.has(t)) || null;

      const hasC = cjk.length > 0;
      const hasE = eng.length > 0;
      if (!hasC && !hasE) continue;
      // 中英混写的标准（如 "Excel 熟练"）要求两边都命中
      const via = term.via;
      if (hasC && hasE) {
        if (whyC && whyE) return { hit: true, why: whyC + ' + ' + whyE, word: wordC || whyE, via: via };
      } else if (hasC) {
        if (whyC) return { hit: true, why: whyC, word: wordC, via: via };
      } else {
        if (whyE) return { hit: true, why: whyE, word: whyE, via: via };
      }
    }
    return { hit: false, why: '', word: '', via: '' };
  }

  function hitItem(item, resume) {
    return matchItem(item, resume).hit;
  }

  /* ---------- 字符片段缓存 ----------
     一份文本的 2-gram 集合会被反复用到（算 IDF、算覆盖率），按原文缓存避免重复构建。
     上限 400 条，正好覆盖 IDF 的采样量。 */
  const gramCache = new Map();
  function gramSet(text) {
    const key = String(text || '');
    let s = gramCache.get(key);
    if (!s) {
      s = new Set(keywords(key));
      if (gramCache.size >= 400) gramCache.delete(gramCache.keys().next().value);
      gramCache.set(key, s);
    }
    return s;
  }

  /* ---------- IDF：让稀有片段说话 ----------
     「的 / 学 / 工作」这类高频字组成的片段几乎每份简历都有，参与相似度计算等于加噪声；
     而「cet6」「新媒体」这类只在少数简历里出现的片段，才是真正的区分信号。
     做法：统计每个片段在简历池中的出现文档数，出现越少权重越高（标准 IDF 平滑）。
     简历太少时没有统计意义，自动退化为等权，等同于纯覆盖率。 */
  const IDF_SAMPLE = 300;   // 最多采样 300 份简历，统计量足够稳定又不拖慢打分
  const IDF_MIN_DOCS = 5;   // 少于 5 份简历就不启用 IDF
  let idfCache = null;

  function corpusIdf() {
    const cands = (HR.data.raw.candidates || []).slice(0, IDF_SAMPLE);
    const n = cands.length;
    const key = n + ':' + (n ? cands[0].id : '') + ':' + (n ? cands[n - 1].id : '');
    if (idfCache && idfCache.key === key) return idfCache;
    const df = new Map();
    for (let i = 0; i < n; i++) {
      gramSet(cands[i].text).forEach((g) => df.set(g, (df.get(g) || 0) + 1));
    }
    idfCache = { key: key, n: n, df: df };
    return idfCache;
  }

  function gramWeight(g, stats) {
    if (!stats || stats.n < IDF_MIN_DOCS) return 1;
    return Math.log(1 + stats.n / (1 + (stats.df.get(g) || 0)));
  }

  /* ---------- JD 匹配度：IDF 加权的 JD 覆盖率 ----------
     原来是「JD 与简历的整篇 2-gram 余弦相似度」，有两个硬伤：
       1. 短 JD 对长简历做余弦时，分母被简历里大量无关内容撑大，得分天生偏低；
       2. 高频字片段没有区分度，人人都像、也人人都不像。
     现在改成覆盖率口径：以 JD 为分母，衡量「JD 的要点有多少被这份简历覆盖」，
     并给稀有片段更高权重。天然完成长度归一化，不再受简历长短摆布。
     返回 0~1，乘以 100 即界面上显示的 JD 匹配度。 */
  function jdStats(jd, resume) {
    const want = gramSet(jd);
    const have = gramSet(resume);
    const stats = corpusIdf();
    let total = 0;
    let hit = 0;
    let nTotal = 0;
    let nHit = 0;
    want.forEach((g) => {
      const w = gramWeight(g, stats);
      total += w;
      nTotal++;
      if (have.has(g)) {
        hit += w;
        nHit++;
      }
    });
    return { sim: total > 0 ? hit / total : 0, covered: nHit, total: nTotal };
  }

  function jdSimilarity(jd, resume) {
    return jdStats(jd, resume).sim;
  }

  function toItems(list) {
    return (list || [])
      .map((r) => (typeof r === 'string' ? { text: r } : { text: (r && r.text) || '', veto: !!(r && r.veto) }))
      .filter((r) => r.text && r.text.trim());
  }

  /**
   * 对一份简历按岗位规则打分
   * @returns 打分结果对象
   */
  function screenResume(resumeText, rules, jdText) {
    const must = toItems(rules && rules.must);
    const plus = toItems(rules && rules.plus);
    const exclude = toItems(rules && rules.exclude);

    let ruleScore = 0;
    const hitMust = [];
    const missMust = [];
    const hitPlus = [];
    const excludeHits = [];
    const matchedWords = [];
    let vetoed = false;

    must.forEach((m) => {
      const r = matchItem(m.text, resumeText);
      if (r.hit) {
        ruleScore += 20;
        hitMust.push({ text: m.text, why: r.why, via: r.via, points: 20 });
        if (r.word) matchedWords.push(r.word);
      } else {
        ruleScore -= 15;
        missMust.push({ text: m.text, veto: !!m.veto, points: -15 });
        if (m.veto) vetoed = true;
      }
    });

    plus.forEach((p) => {
      const r = matchItem(p.text, resumeText);
      if (r.hit) {
        ruleScore += 10;
        hitPlus.push({ text: p.text, why: r.why, via: r.via, points: 10 });
        if (r.word) matchedWords.push(r.word);
      }
    });

    exclude.forEach((x) => {
      const r = matchItem(x.text, resumeText);
      if (r.hit) {
        excludeHits.push({ text: x.text, why: r.why, via: r.via });
        if (r.word) matchedWords.push(r.word);
      }
    });

    const jd = jdStats(jdText, resumeText);
    const jdSim = Math.round(jd.sim * 100);
    const jdScore = Math.round(jdSim * 0.3 * 100) / 100;
    const composite = Math.round((ruleScore + jdSim * 0.3) * 100) / 100;
    const eliminated = vetoed || excludeHits.length > 0;
    let verdict = '不推荐';
    if (!eliminated) {
      if (composite >= 60) verdict = '推荐';
      else if (composite >= 30) verdict = '待定';
    }

    return {
      ruleScore,
      jdSim,
      jdScore,
      // JD 覆盖明细：界面用它解释「匹配度为什么是这个数」
      jdCovered: jd.covered,
      jdTotal: jd.total,
      composite,
      verdict,
      eliminated,
      vetoed,
      hitMust,
      missMust,
      hitPlus,
      excludeHits,
      matchedWords: [...new Set(matchedWords.filter(Boolean))],
      algo: ALGO_VERSION,
      scoredAt: HR.util.now()
    };
  }

  function verdictClass(verdict) {
    if (verdict === '推荐') return 'rec';
    if (verdict === '待定') return 'pend';
    return 'rej';
  }

  // 把命中词在原文里高亮（先转义再替换，避免 XSS）
  function highlight(text, words) {
    let html = HR.util.esc(text);
    const list = (words || []).filter((w) => w && w.length >= 1);
    if (!list.length) return html;
    const sorted = [...new Set(list)].sort((a, b) => b.length - a.length);
    const pattern = sorted
      .map((w) => HR.util.esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    if (!pattern) return html;
    try {
      const re = new RegExp('(' + pattern + ')', 'gi');
      html = html.replace(re, '<mark>$1</mark>');
    } catch (err) {
      /* 正则异常时不高亮 */
    }
    return html;
  }

  HR.scoring = {
    ALGO_VERSION,
    SYNONYM_GROUPS,
    keywords,
    synonyms,
    expandTerms,
    matchItem,
    hitItem,
    jdSimilarity,
    jdStats,
    screenResume,
    verdictClass,
    highlight
  };
})();