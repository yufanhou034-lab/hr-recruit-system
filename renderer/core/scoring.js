/* 初筛打分引擎（沿用原有框架的匹配算法，扩展为「必备/加分/排除 + 一票否决」） */
(function () {
  const HR = window.HR;

  // 字符 2-gram + 英文整词，用于余弦相似度
  function keywords(text) {
    const clean = String(text || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    const set = new Set();
    for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
    const en = String(text || '').match(/[a-zA-Z0-9]+/g) || [];
    en.forEach((w) => set.add(w.toLowerCase()));
    return [...set];
  }

  function freq(text) {
    const m = new Map();
    keywords(text).forEach((k) => m.set(k, (m.get(k) || 0) + 1));
    return m;
  }

  // 一条标准可用 / 或 、 分隔多个同义词，命中任一即算命中
  function synonyms(item) {
    return String(item || '')
      .split(/[／/、]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
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
    return Math.min(4, Math.max(2, Math.ceil(len * 0.5)));
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
    for (const syn of synonyms(item)) {
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
          const fuzzy = fuzzyMatch(cjk, flat, 3);
          if (fuzzy.count >= need && fuzzy.count / cjk.length >= 0.6) {
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
      if (hasC && hasE) {
        if (whyC && whyE) return { hit: true, why: whyC + ' + ' + whyE, word: wordC || whyE };
      } else if (hasC) {
        if (whyC) return { hit: true, why: whyC, word: wordC };
      } else {
        if (whyE) return { hit: true, why: whyE, word: whyE };
      }
    }
    return { hit: false, why: '', word: '' };
  }

  function hitItem(item, resume) {
    return matchItem(item, resume).hit;
  }

  // 简历与 JD 的字符 2-gram 余弦相似度，0~1
  function jdSimilarity(jd, resume) {
    const a = freq(jd);
    const b = freq(resume);
    let dot = 0;
    let na = 0;
    let nb = 0;
    a.forEach((v, k) => {
      na += v * v;
      if (b.has(k)) dot += v * b.get(k);
    });
    b.forEach((v) => {
      nb += v * v;
    });
    if (na === 0 || nb === 0) return 0;
    return dot / Math.sqrt(na * nb);
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
        hitMust.push({ text: m.text, why: r.why });
        if (r.word) matchedWords.push(r.word);
      } else {
        ruleScore -= 15;
        missMust.push({ text: m.text, veto: !!m.veto });
        if (m.veto) vetoed = true;
      }
    });

    plus.forEach((p) => {
      const r = matchItem(p.text, resumeText);
      if (r.hit) {
        ruleScore += 10;
        hitPlus.push({ text: p.text, why: r.why });
        if (r.word) matchedWords.push(r.word);
      }
    });

    exclude.forEach((x) => {
      const r = matchItem(x.text, resumeText);
      if (r.hit) {
        excludeHits.push({ text: x.text, why: r.why });
        if (r.word) matchedWords.push(r.word);
      }
    });

    const jdSim = Math.round(jdSimilarity(jdText, resumeText) * 100);
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
      composite,
      verdict,
      eliminated,
      vetoed,
      hitMust,
      missMust,
      hitPlus,
      excludeHits,
      matchedWords: [...new Set(matchedWords.filter(Boolean))],
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
    keywords,
    freq,
    synonyms,
    matchItem,
    hitItem,
    jdSimilarity,
    screenResume,
    verdictClass,
    highlight
  };
})();