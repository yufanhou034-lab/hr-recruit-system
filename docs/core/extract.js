/* 简历字段自动提取：手机号 / 邮箱 / 学校 / 学历 / 毕业年份 / 姓名 / 专业 */
(function () {
  const HR = window.HR;

  // 常见高校词表（优先命中，命中不到的走「xx大学 / xx学院」正则兜底）
  const UNIVERSITIES = [
    '清华大学', '北京大学', '复旦大学', '上海交通大学', '浙江大学', '南京大学',
    '中国科学技术大学', '武汉大学', '华中科技大学', '中山大学', '四川大学',
    '西安交通大学', '哈尔滨工业大学', '同济大学', '北京航空航天大学', '南开大学',
    '天津大学', '东南大学', '北京师范大学', '厦门大学', '山东大学', '吉林大学',
    '中国人民大学', '中南大学', '湖南大学', '大连理工大学', '华东师范大学',
    '华南理工大学', '重庆大学', '电子科技大学', '西北工业大学', '兰州大学',
    '东北大学', '中国农业大学', '北京理工大学', '北京邮电大学', '中央财经大学',
    '上海财经大学', '对外经济贸易大学', '武汉理工大学', '华中师范大学',
    '南京航空航天大学', '南京理工大学', '西安电子科技大学', '苏州大学', '暨南大学',
    '郑州大学', '上海大学', '深圳大学', '南方科技大学', '首都经济贸易大学',
    '北京交通大学', '北京科技大学', '华东理工大学', '东华大学', '江南大学',
    '合肥工业大学', '西南交通大学', '河海大学', '南京师范大学', '华南师范大学',
    '广东工业大学', '福州大学', '南昌大学', '云南大学', '广西大学', '贵州大学',
    '海南大学', '扬州大学', '江苏大学', '浙江工业大学', '浙江理工大学',
    '杭州电子科技大学', '宁波大学', '中国矿业大学', '中国石油大学', '中国地质大学',
    '华北电力大学', '燕山大学', '河北工业大学', '太原理工大学', '内蒙古大学',
    '辽宁大学', '东北财经大学', '哈尔滨工程大学', '东北林业大学', '东北师范大学',
    '延边大学', '安徽大学', '安徽师范大学', '华侨大学', '福建师范大学',
    '江西财经大学', '山东师范大学', '青岛大学', '济南大学', '河南大学',
    '武汉科技大学', '湖北大学', '中南财经政法大学', '湖南师范大学', '长沙理工大学',
    '汕头大学', '广西师范大学', '桂林电子科技大学', '重庆邮电大学', '西南大学',
    '西南财经大学', '四川师范大学', '昆明理工大学', '西北大学', '陕西师范大学',
    '西安理工大学', '长安大学', '兰州理工大学', '新疆大学', '石河子大学',
    '北京工业大学', '北京化工大学', '北京林业大学', '首都师范大学', '天津工业大学',
    '天津财经大学', '上海理工大学', '上海海事大学', '上海师范大学', '上海外国语大学',
    '华东政法大学', '南京邮电大学', '南京信息工程大学', '南京农业大学', '南京林业大学',
    '中国药科大学', '浙江师范大学', '浙江工商大学', '中国计量大学', '集美大学',
    '南昌航空大学', '山东科技大学', '青岛科技大学', '河南理工大学', '湘潭大学',
    '南华大学', '广东财经大学', '广州大学', '东莞理工学院', '五邑大学',
    '香港中文大学', '香港大学', '香港科技大学', '澳门大学', '香港理工大学',
    '北京外国语大学', '中国传媒大学', '中央民族大学', '北京语言大学', '国际关系学院',
    '上海科技大学', '西湖大学', '宁波诺丁汉大学', '西交利物浦大学', '温州大学',
    '江苏科技大学', '南京工程学院', '常州大学', '南通大学', '徐州工程学院',
    '山东工商学院', '鲁东大学', '临沂大学', '聊城大学', '潍坊学院',
    '洛阳理工学院', '南阳理工学院', '安阳师范学院', '信阳师范学院', '湖北工业大学',
    '三峡大学', '长江大学', '湖南科技大学', '吉首大学', '广东金融学院',
    '广东技术师范大学', '仲恺农业工程学院', '佛山大学', '韶关学院', '肇庆学院',
    '成都理工大学', '西南石油大学', '成都信息工程大学', '西华大学', '四川轻化工大学',
    '重庆理工大学', '重庆工商大学', '西安科技大学', '西安邮电大学', '西安工业大学',
    '陕西科技大学', '西安财经大学', '河北科技大学', '河北经贸大学', '石家庄铁道大学',
    '山西大学', '山西财经大学', '内蒙古工业大学', '沈阳工业大学', '沈阳航空航天大学',
    '大连海事大学', '大连大学', '辽宁工程技术大学', '长春理工大学', '东北电力大学',
    '哈尔滨商业大学', '黑龙江大学', '哈尔滨理工大学', '安徽工业大学', '安徽理工大学',
    '安徽财经大学', '合肥学院', '江西师范大学', '江西理工大学', '南昌工程学院',
    '福州理工学院', '厦门理工学院', '闽江学院', '泉州师范学院', '齐鲁工业大学'
  ];

  const UNI_SET = new Set(UNIVERSITIES);

  function findPhone(text) {
    const re = /(?:^|[^\d])(1[3-9]\d{9})(?!\d)/g;
    const m = re.exec(text);
    return m ? m[1] : '';
  }

  function findEmails(text) {
    return String(text || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  }

  function findEmail(text) {
    const all = findEmails(text);
    return all.length ? all[0] : '';
  }

  function findSchool(text) {
    const t = String(text || '');
    // 1) 先扫词表（避免「某某学院」误伤）
    let best = '';
    let bestIdx = Infinity;
    UNI_SET.forEach((u) => {
      const idx = t.indexOf(u);
      if (idx >= 0 && idx < bestIdx) {
        bestIdx = idx;
        best = u;
      }
    });
    if (best) return best;
    // 2) 正则兜底
    const re = /([\u4e00-\u9fa5]{2,12}(?:大学|学院|学校|职业技术学院|职业学院|高等专科学校))/g;
    let m;
    while ((m = re.exec(t)) !== null) {
      const cand = m[1];
      if (/^\s*(?:就读|毕业|就读于|毕业于)$/.test(cand)) continue;
      return cand;
    }
    return '';
  }

  function findDegree(text) {
    const t = String(text || '');
    if (/博士|Ph\.?\s?D|Doctor/i.test(t)) return '博士';
    if (/硕士|研究生|MBA|MSc|Master|专硕|学硕/i.test(t)) return '硕士';
    if (/本科|学士|Bachelor|统招本科|全日制本科/i.test(t)) return '本科';
    if (/大专|专科|高职|专升本/i.test(t)) return '大专';
    if (/中专|技校|职高|高中/i.test(t)) return '中专/高中';
    return '';
  }

  function findGradYear(text) {
    const t = String(text || '');
    let m = /(20\d{2})\s*年?\s*届/.exec(t);
    if (m) return m[1];
    m = /(?:毕业(?:时间|年份|日期)?|graduation)\s*[:：]?\s*(20\d{2})/i.exec(t);
    if (m) return m[1];
    m = /(20\d{2})\s*[.\-/年]\s*\d{0,2}\s*(?:毕业|至今|-)/.exec(t);
    if (m) return m[1];
    return '';
  }

  function findMajor(text) {
    const t = String(text || '');
    let m = /(?:专\s*业|所学专业|major)\s*[:：]\s*([^\s，,；;、|\n]{2,20})/i.exec(t);
    if (m) return m[1].trim();
    m = /([\u4e00-\u9fa5]{2,10}(?:专业|系))\s*(?:本科|硕士|学士|毕业)/.exec(t);
    if (m) return m[1].replace(/(专业|系)$/, '');
    return '';
  }

  function findName(text, fileName) {
    const t = String(text || '');
    let m = /(?:姓\s*名|名字|Name)\s*[:：]\s*([\u4e00-\u9fa5]{2,4}|[A-Za-z][A-Za-z ]{1,20})/i.exec(t);
    if (m) return m[1].trim();
    const firstLine = t.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0) || '';
    const stripped = firstLine.replace(/[【】\[\]（）()\s·]/g, '').replace(/个人简历|简历|Resume|CV/gi, '');
    if (/^[\u4e00-\u9fa5]{2,4}$/.test(stripped)) return stripped;
    const fromFile = String(fileName || '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/个人简历|简历|resume|cv|应聘|求职|附件|新|最终/g, '')
      .replace(/[_\-\d（）()【】\[\]\s]/g, '')
      .trim();
    if (/^[\u4e00-\u9fa5]{2,4}$/.test(fromFile)) return fromFile;
    return stripped.slice(0, 12) || '未命名候选人';
  }

  function guessSource(fileName) {
    const n = String(fileName || '');
    if (/内推|referral/i.test(n)) return '内推';
    if (/校招|校园|秋招|春招|campus/i.test(n)) return '校招';
    if (/boss/i.test(n)) return 'BOSS直聘';
    if (/猎聘|liepin/i.test(n)) return '猎聘';
    return '其他';
  }

  /** 汇总提取一份简历的全部字段 */
  function parse(text, fileName) {
    const t = String(text || '');
    const emails = findEmails(t);
    return {
      name: findName(t, fileName),
      phone: findPhone(t),
      email: emails.length ? emails[0] : '',
      school: findSchool(t),
      degree: findDegree(t),
      major: findMajor(t),
      gradYear: findGradYear(t),
      source: guessSource(fileName)
    };
  }

  HR.extract = {
    UNIVERSITIES,
    findPhone,
    findEmail,
    findEmails,
    findSchool,
    findDegree,
    findGradYear,
    findMajor,
    findName,
    guessSource,
    parse
  };
})();