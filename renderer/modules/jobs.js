/* 3. 岗位管理 */
(function () {
  const HR = window.HR;
  const util = HR.util;
  const esc = util.esc;

  const TEMPLATES = {
    intern: {
      name: '实习生招聘',
      department: '',
      rules: {
        must: [
          { text: '全日制在校生/可实习', veto: true },
          { text: '每周到岗≥4天 / 每周可实习4天以上', veto: true },
          { text: 'Excel 熟练 / 办公软件', veto: false },
          { text: '沟通表达', veto: false }
        ],
        plus: [
          { text: '互联网/科技公司实习经历' },
          { text: '社团 / 活动策划经历' },
          { text: '文字表达 / 文案能力' }
        ],
        exclude: [{ text: '不接受实习 / 仅接受远程' }]
      },
      jd:
        '【实习岗位职责】\n1. 协助招聘流程推进，简历初筛、面试安排与候选人跟进；\n2. 维护招聘渠道，整理候选人信息与数据报表；\n3. 协助组织校园宣讲、内推活动。\n\n【任职要求】\n1. 全日制在校生，每周可到岗 4 天以上，实习期 3 个月起；\n2. 熟练使用 Excel 等办公软件，沟通表达清晰；\n3. 有招聘或人力相关实习经验者优先。'
    },
    campus: {
      name: '校园招聘',
      department: '',
      rules: {
        must: [
          { text: '本科及以上 / 统招本科', veto: true },
          { text: '应届毕业生 / 20xx届', veto: true },
          { text: 'CET-4 / 大学英语四级', veto: false },
          { text: '专业相关', veto: false }
        ],
        plus: [
          { text: '985 / 211 / 双一流' },
          { text: '校级奖学金' },
          { text: '学生干部 / 社团负责人' },
          { text: '相关实习经历' }
        ],
        exclude: [{ text: '非应届 / 已毕业2年以上' }]
      },
      jd:
        '【校园招聘岗位职责】\n1. 参与部门核心业务，完成导师安排的岗位任务；\n2. 参与公司级培训与轮岗，快速成长为业务骨干。\n\n【任职要求】\n1. 本科及以上学历，2026 届应届毕业生；\n2. 专业不限，具备良好的沟通能力与学习能力；\n3. 在校期间有学生工作、竞赛获奖或实习经历者优先。'
    }
  };

  function ruleCount(job) {
    const r = job.rules || {};
    return (r.must || []).length + (r.plus || []).length + (r.exclude || []).length;
  }

  function render(el) {
    const jobs = HR.data.raw.jobs
      .slice()
      .sort((a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0) || String(b.updatedAt).localeCompare(String(a.updatedAt)));

    el.innerHTML =
      '<div class="card"><div class="toolbar">' +
      '<strong>岗位列表</strong><span class="muted small">共 ' + jobs.length + ' 个（在招 ' + jobs.filter((j) => !j.archived).length + ' 个）</span>' +
      '<span class="spacer"></span>' +
      '<button class="btn" id="jobNew">' + HR.ico('plus') + ' 新增岗位</button>' +
      '<button class="btn ghost" id="jobTplIntern">套用实习生模板</button>' +
      '<button class="btn ghost" id="jobTplCampus">套用校招模板</button>' +
      '</div>' +
      '<div class="muted small">规则命中逻辑：必备项命中 +20 / 未命中 −15，勾选「一票否决」的必备项未命中直接淘汰；加分项命中 +10；排除项命中直接淘汰。</div>' +
      '<div class="muted small">中文标准需在简历里连续命中（短词需整词出现，长句需连续命中 4 字以上），因此「实习」不会误命中「每周可实习 4 天以上」；英文按整词比对，「CET-6」不会误命中「Excel」。</div>' +
      '</div>' +
      (jobs.length
        ? '<div class="job-grid">' + jobs.map(cardHtml).join('') + '</div>'
        : HR.ui.empty('briefcase', '还没有任何岗位', '点「新增岗位」或直接套用模板即可创建'));

    el.querySelector('#jobNew').addEventListener('click', () => openEditor(null));
    el.querySelector('#jobTplIntern').addEventListener('click', () => openEditor(null, 'intern'));
    el.querySelector('#jobTplCampus').addEventListener('click', () => openEditor(null, 'campus'));

    el.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const act = btn.getAttribute('data-act');
      if (act === 'edit') openEditor(HR.data.job(id));
      else if (act === 'archive') toggleArchive(id);
      else if (act === 'del') removeJob(id);
      else if (act === 'screen') HR.goTo('screening', { jobId: id });
    });

    el.addEventListener('change', async (e) => {
      const sw = e.target.closest('input[data-act="toggle"]');
      if (!sw) return;
      const id = sw.getAttribute('data-id');
      HR.data.updateJob(id, { archived: !sw.checked });
      await HR.data.persist();
      HR.ui.toast(sw.checked ? '已开启在招' : '已暂停在招', 'success');
      HR.refresh();
    });
  }

  function cardHtml(job) {
    const apps = HR.data.appsOfJob(job.id);
    return (
      '<div class="job-card' + (job.archived ? ' archived' : ' active') + '">' +
      '<h4>' + esc(job.name) + (job.archived ? ' <span class="tag gray">已归档</span>' : ' <span class="tag green">在招</span>') + '</h4>' +
      '<div class="job-meta">' +
      '<span>' + HR.ico('tag') + ' ' + esc(job.department || '未填部门') + '</span>' +
      '<span>' + HR.ico('database') + ' ' + esc(job.channel || '—') + '</span>' +
      '<span>' + HR.ico('clipboard-check') + ' 规则 ' + ruleCount(job) + ' 条</span>' +
      '<span>' + HR.ico('users') + ' 候选人 ' + apps.length + '</span>' +
      '<span>' + HR.ico('file-text') + ' ' + util.fmtDate(job.createdAt) + '</span>' +
      '</div>' +
      '<div class="job-meta"><span title="JD 正文">' + esc(util.truncate((job.jd || '').replace(/\s+/g, ' '), 60) || '（未填写 JD）') + '</span></div>' +
      '<div class="job-actions">' +
      '<button class="btn small" data-act="edit" data-id="' + job.id + '">编辑 / 规则</button>' +
      '<button class="btn small ghost" data-act="screen" data-id="' + job.id + '">去初筛</button>' +
      '<label class="switch"><input type="checkbox" data-act="toggle" data-id="' + job.id + '"' + (job.archived ? '' : ' checked') + ' /><span class="track"></span>在招</label>' +
      '<button class="btn small ghost" data-act="archive" data-id="' + job.id + '">' + (job.archived ? '恢复' : '归档') + '</button>' +
      '<button class="btn small danger" data-act="del" data-id="' + job.id + '">删除</button>' +
      '</div></div>'
    );
  }

  async function toggleArchive(id) {
    const j = HR.data.job(id);
    if (!j) return;
    HR.data.updateJob(id, { archived: !j.archived });
    await HR.data.persist();
    HR.refresh();
    HR.ui.toast(j.archived ? '岗位已恢复' : '岗位已归档（历史数据保留）', 'success');
  }

  async function removeJob(id) {
    const j = HR.data.job(id);
    if (!j) return;
    const n = HR.data.appsOfJob(id).length;
    const ok = await HR.ui.confirm('删除岗位', '确定删除岗位「' + j.name + '」吗？关联的 ' + n + ' 条投递记录会一并删除。如只是暂不招人，建议用「归档」。', '删除');
    if (!ok) return;
    HR.data.removeJob(id);
    await HR.data.persist();
    HR.refresh();
    HR.ui.toast('岗位已删除', 'success');
  }

  /* ---------------- 编辑器 ---------------- */
  function openEditor(job, templateKey) {
    const tpl = templateKey ? TEMPLATES[templateKey] : null;
    const model = {
      name: job ? job.name : tpl ? tpl.name : '',
      department: job ? job.department || '' : tpl ? tpl.department : '',
      channel: job ? job.channel || HR.SOURCES[0] : HR.SOURCES[0],
      jd: job ? job.jd || '' : tpl ? tpl.jd : '',
      rules: {
        must: job ? (job.rules.must || []).map((r) => ({ text: r.text, veto: !!r.veto })) : tpl ? tpl.rules.must.map((r) => ({ text: r.text, veto: !!r.veto })) : [],
        plus: job ? (job.rules.plus || []).map((r) => ({ text: r.text })) : tpl ? tpl.rules.plus.map((r) => ({ text: r.text })) : [],
        exclude: job ? (job.rules.exclude || []).map((r) => ({ text: r.text })) : tpl ? tpl.rules.exclude.map((r) => ({ text: r.text })) : []
      }
    };

    const body =
      '<div class="grid-3">' +
      '<div class="field"><label>岗位名称 *</label><input class="input" id="jName" value="' + esc(model.name) + '" /></div>' +
      '<div class="field"><label>部门</label><input class="input" id="jDept" value="' + esc(model.department) + '" /></div>' +
      '<div class="field"><label>主招渠道</label><select class="select" id="jChannel">' +
      HR.SOURCES.map((s) => '<option value="' + esc(s) + '"' + (model.channel === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') +
      '</select></div>' +
      '</div>' +
      '<div class="field"><label>JD 正文（用于计算简历匹配度）</label>' +
      '<div class="toolbar" style="margin-bottom:6px">' +
      '<button class="btn ghost small" id="jdUpload" type="button">' + HR.ico('upload') + ' 上传 JD 文件解析</button>' +
      '<button class="btn ghost small" id="jdClear" type="button">清空</button>' +
      (templateKey ? '<span class="tag green">已套用模板：' + esc(TEMPLATES[templateKey].name) + '</span>' : '') +
      '</div>' +
      '<textarea class="textarea" id="jJd" style="min-height:150px">' + esc(model.jd) + '</textarea></div>' +
      '<div class="grid-3">' +
      ruleBlock('must', '必备项', '命中 +20，未命中 −15；勾选「一票否决」的未命中直接淘汰', true) +
      ruleBlock('plus', '加分项', '命中 +10', false) +
      ruleBlock('exclude', '排除项', '命中直接淘汰', false) +
      '</div>';

    function ruleBlock(key, title, hint, hasVeto) {
      return (
        '<div class="card" style="margin:0"><div class="field" style="margin-bottom:6px">' +
        '<label>' + esc(title) + ' <span class="muted small">' + esc(hint) + '</span></label>' +
        '<div id="rows_' + key + '"></div>' +
        '<button class="btn ghost small" type="button" data-add="' + key + '">' + HR.ico('plus') + ' 添加一条</button>' +
        '<div class="hint">一条里可用 / 或 、 分隔同义词，例如：Excel 熟练 / 表格处理</div>' +
        '</div></div>'
      );
    }

    function addRow(key, item) {
      const wrap = box.querySelector('#rows_' + key);
      const row = document.createElement('div');
      row.className = 'rule-row';
      row.innerHTML =
        '<input class="input" placeholder="' + (key === 'must' ? '如：全日制本科及以上' : key === 'plus' ? '如：大厂实习经历' : '如：非应届') + '" />' +
        (key === 'must' ? '<label class="veto-wrap"><input type="checkbox" class="veto" />一票否决</label>' : '') +
        '<button class="btn ghost small" type="button" data-del>删除</button>';
      row.querySelector('input.input').value = (item && item.text) || '';
      const veto = row.querySelector('.veto');
      if (veto) veto.checked = !!(item && item.veto);
      row.querySelector('[data-del]').addEventListener('click', () => row.remove());
      wrap.appendChild(row);
    }

    function collect(key) {
      return [...box.querySelectorAll('#rows_' + key + ' .rule-row')]
        .map((row) => {
          const text = row.querySelector('input.input').value.trim();
          const veto = row.querySelector('.veto');
          if (!text) return null;
          return key === 'must' ? { text: text, veto: veto ? veto.checked : false } : { text: text };
        })
        .filter(Boolean);
    }

    let box = null;
    HR.ui.modal({
      title: job ? '编辑岗位 · ' + job.name : '新增岗位',
      body: body,
      width: 940,
      onMount(h) {
        box = h.body;
        ['must', 'plus', 'exclude'].forEach((key) => {
          model.rules[key].forEach((item) => addRow(key, item));
          if (!model.rules[key].length && key !== 'exclude') addRow(key, null);
        });
        box.addEventListener('click', (e) => {
          const add = e.target.closest('[data-add]');
          if (add) addRow(add.getAttribute('data-add'), null);
        });
        box.querySelector('#jdClear').addEventListener('click', () => {
          box.querySelector('#jJd').value = '';
        });
        box.querySelector('#jdUpload').addEventListener('click', async () => {
          const res = await window.api.pickResumeFiles();
          if (res.canceled) return;
          const okFile = (res.files || []).find((f) => f.text && !f.error);
          if (!okFile) {
            HR.ui.toast('没有解析出文字，请换个文件试试', 'error');
            return;
          }
          const ta = box.querySelector('#jJd');
          ta.value = (ta.value ? ta.value + '\n\n' : '') + okFile.text;
          HR.ui.toast('已解析：' + okFile.name, 'success');
        });
      },
      actions: [
        { label: '取消', kind: 'ghost', onClick: (h) => h.close() },
        {
          label: '保存岗位',
          onClick: async (h) => {
            const name = box.querySelector('#jName').value.trim();
            if (!name) {
              HR.ui.toast('请填写岗位名称', 'error');
              return;
            }
            const payload = {
              name: name,
              department: box.querySelector('#jDept').value.trim(),
              channel: box.querySelector('#jChannel').value,
              jd: box.querySelector('#jJd').value,
              rules: { must: collect('must'), plus: collect('plus'), exclude: collect('exclude') }
            };
            if (job) HR.data.updateJob(job.id, payload);
            else HR.data.addJob(payload);
            await HR.data.persist();
            h.close();
            HR.refresh();
            HR.ui.toast(job ? '岗位已保存' : '岗位已创建', 'success');
          }
        }
      ]
    });
  }

  HR.jobs = { openEditor, TEMPLATES };
  HR.register({ key: 'jobs', label: '岗位管理', render: render });
})();