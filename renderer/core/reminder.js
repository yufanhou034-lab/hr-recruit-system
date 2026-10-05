/* 跟进 / offer 提醒（功能 3）
   每次渲染看板时调用 due() 计算「该提醒但还没提醒过」的条目：
     · offer 发出后第 2 天、第 7 天
     · 预计入职日前 3 天
   提醒标记写在 application.offer.remindersDone 里，点「知道了」后不再重复出现。 */
(function () {
  const HR = window.HR;
  const util = HR.util;

  function due() {
    const out = [];
    (HR.data.raw.applications || []).forEach((a) => {
      if (a.status !== 'offered') return; // 只看「已发 offer」且尚未入职的候选人
      const o = a.offer || {};
      const done = o.remindersDone || [];
      const r = HR.data.resume(a.resumeId);
      const name = r ? r.name : '候选人';
      const add = (key, text, cond) => {
        if (cond && done.indexOf(key) < 0) out.push({ appId: a.id, key: key, name: name, text: text });
      };

      if (o.offerDate) {
        const d = util.diffDays(o.offerDate, util.todayInput());
        add('offer2', '候选人「' + name + '」的 offer 已发 ' + d + ' 天，建议跟进确认意向', d >= 2);
        add('offer7', '候选人「' + name + '」的 offer 已发 ' + d + ' 天仍未入职，建议尽快联系确认', d >= 7);
      }
      if (o.expectedOnboard) {
        const du = util.daysUntil(o.expectedOnboard);
        if (du !== null) {
          add(
            'before3',
            du >= 0
              ? '距离候选人「' + name + '」预计入职还有 ' + du + ' 天，建议确认入职准备'
              : '候选人「' + name + '」已超过预计入职日 ' + -du + ' 天仍未入职，请尽快确认',
            du <= 3
          );
        }
      }
    });
    return out;
  }

  /** 标记某条提醒已读 */
  function ack(appId, key) {
    HR.data.markReminderDone(appId, key);
    return HR.data.persist();
  }

  HR.reminder = { due, ack };
})();