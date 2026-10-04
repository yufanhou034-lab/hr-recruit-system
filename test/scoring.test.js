/* ---------------------------------------------------------------------
   初筛打分引擎回归测试
   运行：npm test   （或 node test/scoring.test.js）

   scoring.js 是浏览器的 IIFE，只依赖 window.HR.util.now() 与
   window.HR.data.raw.candidates（算 IDF 用），所以这里用 vm 造一个最小沙箱把它跑起来，
   不需要改动任何产品代码。
   --------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const NOW = '2026-10-04T00:00:00.000Z';

function mkResume(id, text) {
  // 注意：候选人的简历正文字段名是 text（跟导入解析、打分调用、演示数据保持一致）
  return { id: id, name: id, phone: '', school: '', text: text, createdAt: NOW };
}

/* 语料：10 份简历，其中 9 份只含「负责 / 工作 / 要求」这类高频词，
   只有 1 份含 cet-6、新媒体 这类稀有词 —— 用来验证 IDF 是否真的在起作用。 */
const CORPUS = [];
for (let i = 1; i <= 9; i++) {
  CORPUS.push(mkResume('c' + i, '负责市场推广工作，要求有相关经验，负责日常事务，工作要求认真负责，能吃苦耐劳。'));
}
CORPUS.push(mkResume('c10', '负责新媒体运营，已通过 CET-6，熟练使用 Office 办公软件。'));

function loadScoring(candidates) {
  const sandbox = {
    window: {
      HR: {
        util: { now: () => NOW },
        data: { raw: { candidates: candidates || [] } }
      }
    }
  };
  vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'core', 'scoring.js'), 'utf8');
  vm.runInContext(code, sandbox);
  if (!sandbox.window.HR.scoring) throw new Error('scoring.js 没有导出 HR.scoring');
  return sandbox.window.HR.scoring;
}

/* 旧口径的参照实现（整篇 2-gram 对称余弦），只用于对照，产品里已不再使用 */
function oldCosine(jd, resume) {
  const grams = (t) => {
    const clean = String(t || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    const m = new Map();
    for (let i = 0; i < clean.length - 1; i++) {
      const g = clean.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const a = grams(jd);
  const b = grams(resume);
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
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

/* ---------------- 断言 ---------------- */
let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  \u2713 ' + name);
  } else {
    failures.push(name);
    console.log('  \u2717 ' + name + (detail ? '   \u2192 ' + detail : ''));
  }
}
function section(title) {
  console.log('\n' + title);
}

const S = loadScoring(CORPUS);

/* =============== 1. 规则匹配 =============== */
section('1. 规则匹配（必备 / 加分 / 排除）');

function screen(resumeText, rules, jd) {
  return S.screenResume(resumeText, rules, jd || '');
}

// 一票否决：必备项未命中
// 注意简历不能出现任何「本科/学士」线索 —— 词典会把「统招本科」等价到「本科」，
// 写「本科在读」是应该算命中的，所以这里用高中学历来测真正的未命中
{
  const r = screen('本人高中学历，性格开朗，有一年销售经验。', { must: [{ text: '统招本科', veto: true }], plus: [], exclude: [] });
  ok('必备项未命中 → 一票否决淘汰', r.eliminated === true && r.vetoed === true && r.verdict === '不推荐');
  ok('必备项未命中扣 15 分', r.ruleScore === -15, '实际 ' + r.ruleScore);
}

// 排除项命中
{
  const r = screen('本人不接受远程办公。', { must: [], plus: [], exclude: [{ text: '不接受远程' }] });
  ok('排除项命中 → 直接淘汰', r.eliminated === true && r.excludeHits.length === 1);
}

// 长标准的连续命中要求：「每周可实习4天以上」不应被「实习」二字蒙中
{
  const r = screen('曾在某公司实习三个月。', { must: [], plus: [{ text: '每周可实习4天以上' }], exclude: [] });
  ok('加分项「每周可实习4天以上」不被简历里的「实习」二字误命中', r.hitPlus.length === 0, '实际命中 ' + JSON.stringify(r.hitPlus));
}

// 长标准容忍少量增删：「每周可实习4天以上」应命中「每周可到岗4天」
{
  const r = screen('本人每周可到岗4天，能长期实习。', { must: [], plus: [{ text: '每周可实习4天以上' }], exclude: [] });
  ok('加分项容忍少量增删（每周可实习4天以上 ≈ 每周可到岗4天）', r.hitPlus.length === 1, '实际命中 ' + JSON.stringify(r.hitPlus));
}

// 英文整词：CET-6 不应被 Excel 命中
{
  const r = screen('熟练使用 Excel 与 Word。', { must: [{ text: 'CET-6', veto: true }], plus: [], exclude: [] });
  ok('必备项 CET-6 不被简历里的 Excel 误命中（不出现 ce 前缀误判）', r.hitMust.length === 0 && r.eliminated === true);
}

// 中英混写标准要求两边都命中
{
  const onlyEn = screen('使用 Excel 处理数据。', { must: [], plus: [{ text: 'Excel 熟练' }], exclude: [] });
  const both = screen('熟练使用 Excel 处理数据。', { must: [], plus: [{ text: 'Excel 熟练' }], exclude: [] });
  ok('中英混写标准「Excel 熟练」：缺中文部分不算命中', onlyEn.hitPlus.length === 0);
  ok('中英混写标准「Excel 熟练」：中英都命中才算命中', both.hitPlus.length === 1);
}

// 内联同义词
{
  const r = screen('本人获得学士学位。', { must: [], plus: [{ text: '本科/学士' }], exclude: [] });
  ok('内联同义词「本科/学士」命中简历里的「学士」', r.hitPlus.length === 1);
}

/* =============== 2. 内置同义词词典 =============== */
section('2. 内置同义词词典（新增能力）');

{
  const r = screen('英语水平：CET-6（580 分）。', { must: [{ text: '英语六级', veto: true }], plus: [], exclude: [] });
  ok('规则写「英语六级」命中简历里的「CET-6」', r.hitMust.length === 1, '实际 ' + JSON.stringify(r.hitMust));
  ok('词典命中会标注来源 via=同义词', r.hitMust[0] && r.hitMust[0].via === '同义词');
}
{
  const r = screen('本人研究生学历。', { must: [], plus: [{ text: '硕士' }], exclude: [] });
  ok('规则写「硕士」命中简历里的「研究生」', r.hitPlus.length === 1);
}
{
  const r = screen('熟练使用 WPS。', { must: [], plus: [{ text: '办公软件' }], exclude: [] });
  ok('规则写「办公软件」命中简历里的「WPS」', r.hitPlus.length === 1);
}
// 关键的反向用例：词典不能把不等价的词凑在一起
{
  const r = screen('熟练使用 Word 排版。', { must: [], exclude: [{ text: 'Excel' }], plus: [] });
  ok('词典不误伤：只写 Word 的简历不会被「Excel」排除项淘汰', r.eliminated === false && r.excludeHits.length === 0);
}
{
  const r = screen('本人本科学历。', { must: [], plus: [{ text: '博士' }], exclude: [] });
  ok('词典不误伤：「博士」不被「本科」命中', r.hitPlus.length === 0);
}

/* =============== 3. JD 匹配度 =============== */
section('3. JD 匹配度（覆盖率口径）');

const JD = '负责品牌营销推广与新媒体运营，要求统招本科，具备良好的沟通表达能力，英语CET-6优先，熟练使用办公软件。';
const RESUME_MATCH = '统招本科毕业，具备良好的沟通表达能力，负责新媒体运营，已通过CET-6，熟练使用办公软件，参与品牌营销推广。';
const RESUME_IRRELEVANT = '本人性格开朗，喜欢打篮球，担任过宿舍长，负责打扫卫生，爱好摄影与旅行。';

{
  const hi = S.jdSimilarity(JD, RESUME_MATCH);
  const lo = S.jdSimilarity(JD, RESUME_IRRELEVANT);
  ok('匹配的简历 JD 匹配度高（>0.6）', hi > 0.6, '实际 ' + hi.toFixed(3));
  ok('无关的简历 JD 匹配度低（<0.35）', lo < 0.35, '实际 ' + lo.toFixed(3));
  ok('匹配简历明显高于无关简历', hi - lo > 0.3, '差值 ' + (hi - lo).toFixed(3));
}

// 长度归一化：给简历追加大量无关内容，匹配度不应被拉低（旧口径会明显下降）
{
  const filler = '本人性格开朗，乐于助人，喜欢运动和阅读，参加过许多社团活动，做事认真负责。'.repeat(60);
  const shortSim = S.jdSimilarity(JD, RESUME_MATCH);
  const longSim = S.jdSimilarity(JD, RESUME_MATCH + filler);
  const oldShort = oldCosine(JD, RESUME_MATCH);
  const oldLong = oldCosine(JD, RESUME_MATCH + filler);

  ok('覆盖率口径：追加无关内容后匹配度基本不变（长度归一化）', Math.abs(longSim - shortSim) < 0.01,
    '短 ' + shortSim.toFixed(3) + ' → 长 ' + longSim.toFixed(3));
  ok('对照：旧余弦口径会被长度拉低（说明这次改的是真问题）', oldShort - oldLong > 0.05,
    '旧口径 短 ' + oldShort.toFixed(3) + ' → 长 ' + oldLong.toFixed(3));
}

// IDF：只覆盖高频噪声词的简历，得分应低于覆盖关键词的简历
{
  const noiseOnly = '负责工作要求认真负责，负责各项事务，负责日常工作的开展。';
  const keyTerms = '负责新媒体运营，已通过CET-6，熟练使用办公软件。';
  const sNoise = S.jdSimilarity(JD, noiseOnly);
  const sKey = S.jdSimilarity(JD, keyTerms);
  ok('IDF 生效：覆盖关键词的简历高于只覆盖高频词的简历', sKey > sNoise,
    '关键词 ' + sKey.toFixed(3) + ' vs 高频词 ' + sNoise.toFixed(3));
}

// 综合分与判定：公式保持不变
{
  const rules = {
    must: [
      { text: '统招本科', veto: true },
      { text: '沟通表达' },
      { text: '新媒体' },
      { text: '英语六级' },
      { text: '办公软件' }
    ],
    plus: [{ text: '品牌营销' }, { text: '数据分析' }, { text: '学生会' }],
    exclude: [{ text: '不接受远程' }]
  };
  const r = screen(RESUME_MATCH, rules, JD);
  ok('5 个必备项全中（+100）', r.missMust.length === 0 && r.hitMust.length === 5, '命中 ' + r.hitMust.length);
  ok('规则分 = 100 + 加分命中数×10', r.ruleScore === 100 + r.hitPlus.length * 10, '实际 ' + r.ruleScore);
  ok('综合分 = 规则分 + JD 匹配度 × 0.3', Math.abs(r.composite - (r.ruleScore + r.jdSim * 0.3)) < 0.011,
    '规则 ' + r.ruleScore + ' + ' + r.jdSim + '×0.3 = ' + r.composite);
  ok('JD 覆盖明细可用于向用户解释（covered/total）', r.jdTotal > 0 && r.jdCovered > 0 && r.jdCovered <= r.jdTotal,
    r.jdCovered + '/' + r.jdTotal);
  ok('达到阈值判为推荐', r.composite >= 60 ? r.verdict === '推荐' : true, r.composite + ' → ' + r.verdict);
}

/* =============== 4. 边界情况 =============== */
section('4. 边界情况');

{
  const empty = loadScoring([]);
  const r = empty.screenResume(JD, { must: [{ text: '统招本科' }], plus: [], exclude: [] }, JD);
  ok('简历池为空时 IDF 退化为等权且不报错', typeof r.composite === 'number' && !isNaN(r.composite), JSON.stringify(r.composite));
}
// 回归：IDF 语料必须真的读到简历正文。字段名写错（例如读 resumeText 而数据里是 text）
// 会让 df 统计恒为空、所有片段权重相等，IDF 静默失效 —— 这类问题只能靠对比测出来。
{
  const emptyS = loadScoring([]);
  const probe = '负责工作要求认真负责。';
  const withCorpus = S.jdStats(JD, probe);
  const noCorpus = emptyS.jdStats(JD, probe);
  ok('IDF 语料能读到正文（有语料与无语料的得分应当不同）',
    Math.abs(withCorpus.sim - noCorpus.sim) > 1e-6,
    '有语料 ' + withCorpus.sim.toFixed(4) + ' vs 无语料 ' + noCorpus.sim.toFixed(4));
  ok('有语料时，覆盖高频噪声词的得分更低（IDF 起到降权作用）',
    withCorpus.sim < noCorpus.sim,
    withCorpus.sim.toFixed(4) + ' < ' + noCorpus.sim.toFixed(4));
}
{
  const r = screen('', { must: [{ text: '统招本科', veto: true }], plus: [], exclude: [] }, '');
  ok('简历正文为空时不抛异常并判为淘汰', r.eliminated === true && r.jdSim === 0);
}
{
  const r = screen(RESUME_MATCH, { must: [], plus: [], exclude: [] }, '');
  ok('JD 为空时匹配度为 0 且规则分为 0', r.jdSim === 0 && r.ruleScore === 0);
}

/* ---------------- 汇总 ---------------- */
console.log('\n' + '─'.repeat(56));
if (failures.length) {
  console.log('结果：' + pass + ' 项通过，' + failures.length + ' 项失败');
  failures.forEach((f) => console.log('   失败：' + f));
  process.exit(1);
} else {
  console.log('结果：全部 ' + pass + ' 项通过');
  process.exit(0);
}