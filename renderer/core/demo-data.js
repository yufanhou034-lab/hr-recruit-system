/* 网页版首次访问时灌入的演示数据，让公开链接一打开就是可用的完整效果。
   用真实打分引擎计算分数，保证仪表盘/看板/初筛页数据自洽。 */
(function () {
  const HR = window.HR;
  const util = HR.util;

  function daysAgo(n, hour) {
    const d = new Date(Date.now() - n * 86400000);
    d.setHours(hour == null ? 10 : hour, 20, 0, 0);
    return d.toISOString();
  }

  function resumeText(name, school, degree, major, phone, email, year, extra) {
    return [
      '姓名：' + name,
      '手机：' + phone,
      '邮箱：' + email,
      '教育背景：' + school + ' · ' + major + ' · ' + degree + ' · ' + year + '届',
      extra,
      '求职意向：人力资源 / 招聘方向'
    ].join('\n');
  }

  function build() {
    const jobs = [
      {
        id: 'job_demo_1',
        name: '招聘实习生',
        department: '人力资源部',
        channel: 'BOSS直聘',
        archived: false,
        createdAt: daysAgo(9),
        updatedAt: daysAgo(9),
        jd:
          '【实习岗位职责】\n1. 协助招聘流程推进，负责简历初筛、面试安排与候选人跟进；\n2. 维护招聘渠道，整理候选人信息与数据报表；\n3. 协助组织校园宣讲、内推活动。\n\n【任职要求】\n1. 全日制在校生，每周可到岗 4 天以上，实习期 3 个月起；\n2. 熟练使用 Excel 等办公软件，沟通表达清晰；\n3. 有招聘或人力相关实习经验者优先。',
        rules: {
          must: [
            { text: '全日制在校生 / 每周可到岗4天以上', veto: true },
            { text: 'Excel 熟练 / 办公软件', veto: false },
            { text: '沟通表达 / 沟通能力', veto: false }
          ],
          plus: [{ text: '招聘实习经历 / 人力资源实习' }, { text: '简历筛选 / 面试安排' }, { text: '互联网 / 科技公司' }],
          exclude: [{ text: '不接受实习 / 仅接受远程' }]
        }
      },
      {
        id: 'job_demo_2',
        name: '校园招聘-市场营销岗',
        department: '市场部',
        channel: '校招',
        archived: false,
        createdAt: daysAgo(6),
        updatedAt: daysAgo(6),
        jd:
          '【岗位职责】\n1. 参与市场活动策划与执行，跟进投放效果；\n2. 负责内容运营与新媒体账号维护；\n3. 协助完成市场调研与竞品分析。\n\n【任职要求】\n1. 本科及以上学历，2026 届应届毕业生；\n2. 文字表达能力强，有活动策划经验；\n3. 熟悉主流新媒体平台者优先。',
        rules: {
          must: [
            { text: '本科及以上 / 统招本科', veto: true },
            { text: '应届毕业生 / 2026届', veto: false },
            { text: '文字表达 / 文案' },
            { text: '活动策划' }
          ],
          plus: [{ text: '新媒体运营 / 公众号' }, { text: '市场调研 / 竞品分析' }, { text: '学生干部' }],
          exclude: [{ text: '非应届' }]
        }
      }
    ];

    const rawResumes = [
      {
        name: '林晓月',
        phone: '13871234501',
        email: 'linxiaoyue@example.com',
        school: '武汉理工大学',
        degree: '本科',
        major: '人力资源管理',
        gradYear: '2026',
        source: 'BOSS直聘',
        tags: ['重点跟进'],
        createdAt: daysAgo(6, 9),
        text: resumeText(
          '林晓月', '武汉理工大学', '本科', '人力资源管理', '13871234501', 'linxiaoyue@example.com', '2026',
          '实习经历：在某互联网公司担任招聘实习生 4 个月，独立负责简历筛选与面试安排，熟练使用 Excel 制作招聘周报，每周到岗 5 天。\n技能：Excel 精通、沟通表达能力强、抗压能力好。'
        )
      },
      {
        name: '陈子豪',
        phone: '13907123402',
        email: 'chenzihao@example.com',
        school: '华中科技大学',
        degree: '硕士',
        major: '工商管理',
        gradYear: '2026',
        source: '校招',
        tags: ['高潜'],
        createdAt: daysAgo(7, 11),
        text: resumeText(
          '陈子豪', '华中科技大学', '硕士', '工商管理', '13907123402', 'chenzihao@example.com', '2026',
          '实习经历：在某科技公司人力资源部实习 6 个月，负责校园招聘项目执行、简历筛选与面试安排，组织过 3 场校园宣讲会，每周到岗 5 天。\n技能：熟练使用 Excel 与办公软件，沟通表达能力突出，担任过学生干部。'
        )
      },
      {
        name: '王雨桐',
        phone: '13755234503',
        email: 'wangyutong@example.com',
        school: '中南财经政法大学',
        degree: '本科',
        major: '市场营销',
        gradYear: '2026',
        source: '内推',
        tags: ['可培养'],
        createdAt: daysAgo(5, 14),
        text: resumeText(
          '王雨桐', '中南财经政法大学', '本科', '市场营销', '13755234503', 'wangyutong@example.com', '2026',
          '实习经历：在某互联网公司市场部实习，负责新媒体运营与活动策划，独立运营公众号，累计撰稿 20 余篇；参与校园招聘宣讲执行，每周到岗 4 天。\n技能：文字表达与活动策划能力强，熟练使用 Excel。'
        )
      },
      {
        name: '李昊然',
        phone: '13512345604',
        email: 'lihaoran@example.com',
        school: '湖北大学',
        degree: '本科',
        major: '汉语言文学',
        gradYear: '2026',
        source: 'BOSS直聘',
        tags: [],
        createdAt: daysAgo(5, 16),
        text: resumeText(
          '李昊然', '湖北大学', '本科', '汉语言文学', '13512345604', 'lihaoran@example.com', '2026',
          '实习经历：在出版社做过文字编辑实习，文字表达能力强；\n技能：Office 办公软件、活动策划。\n备注：一周只能到岗 2 天，需要兼顾课程。'
        )
      },
      {
        name: '张诗涵',
        phone: '13678901234',
        email: 'zhangshihan@example.com',
        school: '武汉职业技术学院',
        degree: '大专',
        major: '文秘',
        gradYear: '2025',
        source: '其他',
        tags: [],
        createdAt: daysAgo(4, 10),
        text: resumeText(
          '张诗涵', '武汉职业技术学院', '大专', '文秘', '13678901234', 'zhangshihan@example.com', '2025',
          '已在职，无法接受实习岗位，仅接受远程兼职。\n技能：基础办公软件操作。'
        )
      },
      {
        name: '刘泽宇',
        phone: '13323456706',
        email: 'liuzeyu@example.com',
        school: '华中师范大学',
        degree: '本科',
        major: '心理学',
        gradYear: '2026',
        source: '猎聘',
        tags: ['已沟通'],
        createdAt: daysAgo(3, 15),
        text: resumeText(
          '刘泽宇', '华中师范大学', '本科', '心理学', '13323456706', 'liuzeyu@example.com', '2026',
          '实习经历：在某科技公司人力资源部实习 3 个月，负责简历筛选、面试安排与候选人沟通，每周到岗 4 天；熟练使用 Excel 进行数据统计。\n技能：沟通表达能力强，抗压能力好，有校园活动策划经验。'
        )
      },
      {
        name: '周雅琴',
        phone: '15098765407',
        email: 'zhouyaqin@example.com',
        school: '三峡大学',
        degree: '本科',
        major: '行政管理',
        gradYear: '2026',
        source: '校招',
        tags: [],
        createdAt: daysAgo(2, 11),
        text: resumeText(
          '周雅琴', '三峡大学', '本科', '行政管理', '15098765407', 'zhouyaqin@example.com', '2026',
          '实习经历：在本地企业市场部实习，负责活动策划与执行，参与过 2 场大型展会布展；运营过校园公众号，撰写推文 30 余篇。\n技能：文字表达、活动策划、市场调研、Office 办公软件。'
        )
      },
      {
        name: '吴一凡',
        phone: '15866778808',
        email: 'wuyifan@example.com',
        school: '郑州大学',
        degree: '本科',
        major: '计算机科学与技术',
        gradYear: '2026',
        source: '校招',
        tags: [],
        createdAt: daysAgo(1, 17),
        text: resumeText(
          '吴一凡', '郑州大学', '本科', '计算机科学与技术', '15866778808', 'wuyifan@example.com', '2026',
          '实习经历：在某互联网公司做数据运营实习，负责数据整理与可视化报表；参与校园新媒体运营，独立完成推文排版 40 余篇；担任班级学习委员。\n技能：Excel、数据分析、文字表达、活动策划。'
        )
      }
    ];

    const resumes = rawResumes.map((r, i) => Object.assign({ id: 'res_demo_' + (i + 1), inTalentPool: false, fileName: r.name + '简历.docx', note: '' }, r));

    const byName = {};
    resumes.forEach((r) => (byName[r.name] = r));

    function app(name, jobId, status, extra) {
      const r = byName[name];
      const job = jobs.filter((j) => j.id === jobId)[0];
      const a = Object.assign(
        {
          id: 'app_demo_' + name + '_' + jobId.slice(-1),
          resumeId: r.id,
          jobId: jobId,
          status: status,
          score: null,
          passedScreen: false,
          scheduled: false,
          attended: false,
          offered: false,
          hired: false,
          createdAt: r.createdAt,
          lastFollowUpAt: r.createdAt,
          nextFollowUpAt: '',
          followUps: [],
          interviews: []
        },
        extra || {}
      );
      // 用真实打分引擎算分，保证初筛页与看板数据自洽
      a.score = HR.scoring.screenResume(r.text, job.rules, job.jd);
      HR.data.applyFlags(a);
      return a;
    }

    const applications = [
      app('林晓月', 'job_demo_1', 'interviewing', {
        lastFollowUpAt: daysAgo(1, 16),
        nextFollowUpAt: util.dateInputShift(2),
        followUps: [
          { time: daysAgo(4, 15), note: '电话初筛通过，期望实习期 3 个月，每周可到岗 5 天。' },
          { time: daysAgo(1, 16), note: 'HR 面已完成，沟通条理清晰，安排在业务面。' }
        ],
        interviews: [
          {
            id: 'iv_demo_1',
            round: 'HR 面',
            interviewer: '王敏',
            scores: { comm: 5, pro: 4, stable: 4, culture: 5, onboard: 5 },
            average: '4.6',
            conclusion: '推荐',
            pros: '沟通条理清晰，招聘实习经历与岗位高度相关，Excel 熟练。',
            cons: '对加班接受度还需在业务面确认。',
            time: daysAgo(1, 16)
          }
        ]
      }),
      app('陈子豪', 'job_demo_1', 'offered', {
        lastFollowUpAt: daysAgo(2, 11),
        nextFollowUpAt: util.dateInputShift(1),
        followUps: [
          { time: daysAgo(5, 14), note: '简历筛选通过，硕士学历且有大厂 HR 实习经历。' },
          { time: daysAgo(2, 11), note: '两轮面试均通过，已发送实习 offer，等待回复。' }
        ],
        interviews: [
          {
            id: 'iv_demo_2',
            round: '业务面',
            interviewer: '李强',
            scores: { comm: 5, pro: 5, stable: 5, culture: 5, onboard: 4 },
            average: '4.8',
            conclusion: '强烈推荐',
            pros: '组织过校园宣讲，项目执行力强，表达与逻辑俱佳。',
            cons: '同时在看其他机会，需尽快推进。',
            time: daysAgo(2, 11)
          }
        ]
      }),
      app('王雨桐', 'job_demo_1', 'pending_interview', {
        lastFollowUpAt: daysAgo(2, 15),
        nextFollowUpAt: util.dateInputShift(3),
        followUps: [{ time: daysAgo(2, 15), note: '初筛通过，已约 3 天后视频面试。' }]
      }),
      app('刘泽宇', 'job_demo_1', 'interviewing', {
        lastFollowUpAt: daysAgo(1, 10),
        nextFollowUpAt: util.dateInputShift(2),
        followUps: [{ time: daysAgo(1, 10), note: 'HR 面通过，等待业务面排期。' }],
        interviews: [
          {
            id: 'iv_demo_3',
            round: 'HR 面',
            interviewer: '王敏',
            scores: { comm: 4, pro: 4, stable: 4, culture: 4, onboard: 5 },
            average: '4.2',
            conclusion: '推荐',
            pros: '心理学背景，候选人沟通与共情能力强。',
            cons: '实习时长偏短，需观察上手速度。',
            time: daysAgo(1, 10)
          }
        ]
      }),
      app('李昊然', 'job_demo_1', 'pending_screen', {
        lastFollowUpAt: daysAgo(6, 16),
        followUps: [{ time: daysAgo(6, 16), note: '已入库，待初筛（到岗时间可能不满足要求）。' }]
      }),
      app('张诗涵', 'job_demo_1', 'rejected', {
        lastFollowUpAt: daysAgo(3, 10),
        followUps: [{ time: daysAgo(3, 10), note: '命中了排除项「仅接受远程」，已淘汰并转入人才库。' }]
      }),
      app('周雅琴', 'job_demo_2', 'pending_screen', {
        lastFollowUpAt: daysAgo(2, 11),
        followUps: [{ time: daysAgo(2, 11), note: '校招渠道投递，待初筛。' }]
      }),
      app('吴一凡', 'job_demo_2', 'pending_interview', {
        lastFollowUpAt: daysAgo(1, 18),
        nextFollowUpAt: util.dateInputShift(4),
        followUps: [{ time: daysAgo(1, 18), note: '初筛通过，已约定周四下午面试。' }]
      })
    ];

    // 已淘汰的那位放入人才库
    byName['张诗涵'].inTalentPool = true;
    byName['张诗涵'].tags = ['待定'];

    return { version: 1, jobs: jobs, candidates: resumes, applications: applications, updatedAt: util.now() };
  }

  HR.demoData = { build: build };
})();