const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const results = { passed: 0, failed: 0, cases: [] };
const log = (msg, type = 'INFO') => {
  const ts = new Date().toLocaleTimeString();
  const color = type === 'PASS' ? '\x1b[32m' : type === 'FAIL' ? '\x1b[31m' : type === 'SCENARIO' ? '\x1b[36m' : '\x1b[37m';
  console.log(`${color}[${ts}] [${type}] ${msg}\x1b[0m`);
};
const record = (name, passed, detail = '') => {
  if (passed) { results.passed++; log(`✓ ${name} ${detail}`, 'PASS'); }
  else { results.failed++; log(`✗ ${name} ${detail}`, 'FAIL'); }
  results.cases.push({ name, passed, detail });
};

const request = async (path, opts = {}) => {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(opts.token ? { 'Authorization': `Bearer ${opts.token}` } : {}) },
      method: opts.method || 'GET',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  } catch (e) {
    return { ok: false, status: 0, data: { message: e.message, error: 'NETWORK_ERROR' } };
  }
};

const login = async (username, password = '123456') => {
  const r = await request('/api/auth/login', { method: 'POST', body: { username, password } });
  if (!r.ok || !r.data.success) throw new Error(`登录失败 ${username}: ${r.data.message}`);
  return r.data.data.token;
};

const waitServer = async (maxWait = 60000) => {
  const start = Date.now();
  log(`等待服务启动 (${BASE_URL})...`);
  while (Date.now() - start < maxWait) {
    try {
      const r = await request('/api/health');
      if (r.ok && r.data.status === 'healthy') { log('服务已就绪'); return true; }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`服务在 ${maxWait}ms 内未就绪`);
};

const scenario1_NotReturnedCannotScrap = async () => {
  log('场景1: 借出未归还器材不能直接报废', 'SCENARIO');
  const teacherToken = await login('teacher1');
  const adminToken = await login('admin1');
  const genToken = await login('general1');
  const quoterToken = await login('quotation1');

  log('步骤1: 创建新器材便于测试');
  const uniqueCode = `EQ-TEST-S1-${Date.now()}`;
  const cr = await request('/api/equipments', { method: 'POST', token: adminToken, body: { code: uniqueCode, name: '场景1-测试篮球', category: '球类', location: '体育馆测试区', total_quantity: 5 } });
  record('创建测试器材', cr.ok && cr.data.success, cr.data.message || '');
  if (!cr.data?.data?.id) throw new Error('测试器材创建失败');
  const eqId = cr.data.data.id;

  log('步骤2: 借用该器材，使其处于未归还状态');
  const br = await request('/api/borrows', { method: 'POST', token: teacherToken, body: { equipment_id: eqId, quantity: 2, purpose: '场景1-借用不归还' } });
  record('借用器材(不归还)', br.ok && br.data.success, br.data.message || '');

  log('步骤3: 先创建报损单(器材已归还的状态不存在，但我们借了2个，库存还剩3个)');
  const idemKey = `s1-${Date.now()}`;
  const dr = await request('/api/damage-reports', { method: 'POST', token: teacherToken, body: { idempotent_key: idemKey, equipment_id: eqId, quantity: 1, damage_level: 'SEVERE', description: '场景1:重度损坏', discovery_date: '2025-06-10' } });
  record('创建报损单', dr.ok && dr.data.success, dr.data.message || '');
  const reportId = dr.data?.data?.id;
  if (!reportId) throw new Error('报损单创建失败');

  log('步骤4: 录入超限维修报价');
  const qr = await request(`/api/damage-reports/${reportId}/quote`, { method: 'POST', token: quoterToken, body: { amount: 1500, vendor: '测试维修商' } });
  record('录入超限报价(¥1500)', qr.ok && qr.data.success, qr.data?.data?.message || qr.data.message || '');

  log('步骤5: 总务审批时尝试报废，应失败(因为有未归还借用记录)');
  const ar = await request(`/api/damage-reports/${reportId}/approve`, { method: 'POST', token: genToken, body: { approved: true, decision: 'SCRAP', remark: '场景1:尝试报废有未借用的' } });
  const shouldFail = !!(ar.data?.success === false || (ar.data?.message && ar.data.message.includes('未归还')));
  record('【核心验证】报废审批失败-存在未归还', shouldFail, `HTTP${ar.status}: ${ar.data?.message || '无错误信息'}`);

  log('步骤6: 改为维修决策，应通过');
  const ar2 = await request(`/api/damage-reports/${reportId}/approve`, { method: 'POST', token: genToken, body: { approved: true, decision: 'REPAIR', remark: '改为维修' } });
  record('改为维修决策-审批通过', ar2.ok && ar2.data.success, ar2.data.message || '');
  log('场景1 结束\n');
};

const scenario2_ExceedQuoteNeedGeneralApproval = async () => {
  log('场景2: 维修报价超限需总务审批', 'SCENARIO');
  const adminToken = await login('admin1');
  const teacherToken = await login('teacher1');
  const quoterToken = await login('quotation1');
  const genToken = await login('general1');

  log('步骤1: 创建新测试器材');
  const uniqueCode = `EQ-TEST-S2-${Date.now()}`;
  const cr = await request('/api/equipments', { method: 'POST', token: adminToken, body: { code: uniqueCode, name: '场景2-跨栏架', category: '田径器材', location: '田径场', total_quantity: 2 } });
  record('创建测试器材', cr.ok && cr.data.success, '');
  const eqId = cr.data.data.id;

  log('步骤2: 获取阈值');
  const th = await request('/api/damage-reports/threshold', { token: quoterToken });
  record('获取报价阈值', th.ok && th.data.success, `阈值=${th.data?.data?.threshold || '未知'}`);
  const threshold = th.data?.data?.threshold || 1000;

  log('步骤3: 创建报损单');
  const idemKey = `s2-${Date.now()}`;
  const dr = await request('/api/damage-reports', { method: 'POST', token: teacherToken, body: { idempotent_key: idemKey, equipment_id: eqId, quantity: 1, damage_level: 'MODERATE', description: '场景2:支架变形', discovery_date: '2025-06-10' } });
  record('创建报损单', dr.ok && dr.data.success, '');
  const reportId = dr.data.data.id;

  log(`步骤4: 录入超过阈值(¥${threshold})的报价 ¥${threshold + 500}`);
  const exceedAmount = threshold + 500;
  const qr = await request(`/api/damage-reports/${reportId}/quote`, { method: 'POST', token: quoterToken, body: { amount: exceedAmount, vendor: '场景2维修商A', quote_detail: '需要更换支架与喷漆' } });
  record('录入超限报价', qr.ok && qr.data.success, qr.data?.data?.message || qr.data.message || '');

  log('步骤5: 验证状态变为PENDING_APPROVAL且标记了需要总务审批');
  const gr = await request(`/api/damage-reports/${reportId}`, { token: genToken });
  const statusOk = gr.data?.data?.status === 'PENDING_APPROVAL';
  const flagOk = gr.data?.data?.needs_general_approval === 1;
  record('【核心验证】状态转为待审批+超限标记', statusOk && flagOk, `status=${gr.data?.data?.status}, needs_general_approval=${gr.data?.data?.needs_general_approval}`);

  log('步骤6: 报价录入人(非总务)尝试直接通过应失败');
  const ar = await request(`/api/damage-reports/${reportId}/approve`, { method: 'POST', token: quoterToken, body: { approved: true, decision: 'REPAIR' } });
  record('【核心验证】非审批人尝试审批超限报价被拒', ar.status === 403 || ar.data?.success === false, `HTTP${ar.status}: ${ar.data?.message || ''}`);

  log('步骤7: 总务审批人审批通过');
  const ar2 = await request(`/api/damage-reports/${reportId}/approve`, { method: 'POST', token: genToken, body: { approved: true, decision: 'REPAIR', remark: '总务审批通过' } });
  record('总务审批通过超限报价', ar2.ok && ar2.data.success, ar2.data.message || '');

  log('步骤8: 标记维修完成，验证库存回写');
  const eqBefore = (await request(`/api/equipments/${eqId}`, { token: adminToken })).data?.data || {};
  const crr = await request(`/api/damage-reports/${reportId}/complete-repair`, { method: 'POST', token: adminToken, body: { actual_cost: exceedAmount, repair_note: '已完成更换支架' } });
  record('标记维修完成', crr.ok && crr.data.success, crr.data.message || '');
  const eqAfter = (await request(`/api/equipments/${eqId}`, { token: adminToken })).data?.data || {};
  record('库存状态恢复为NORMAL', eqAfter.status === 'NORMAL', `status=${eqAfter.status}`);
  log('场景2 结束\n');
};

const scenario3_IdempotentAndNoDuplicate = async () => {
  log('场景3: 重复提交同一报损单不会生成两条待办', 'SCENARIO');
  const adminToken = await login('admin1');
  const teacherToken = await login('teacher1');

  log('步骤1: 创建新测试器材');
  const uniqueCode = `EQ-TEST-S3-${Date.now()}`;
  const cr = await request('/api/equipments', { method: 'POST', token: adminToken, body: { code: uniqueCode, name: '场景3-哑铃', category: '健身器材', location: '健身房', total_quantity: 10 } });
  record('创建测试器材', cr.ok && cr.data.success, '');
  const eqId = cr.data.data.id;

  const idemKey = `idem-s3-${Date.now()}-${eqId}`;
  const payload = { idempotent_key: idemKey, equipment_id: eqId, quantity: 1, damage_level: 'MINOR', description: '场景3:轻微损坏-重复提交测试', discovery_date: '2025-06-10' };

  log('步骤2: 第1次提交报损单');
  const r1 = await request('/api/damage-reports', { method: 'POST', token: teacherToken, body: payload });
  record('第1次提交成功', r1.ok && r1.data.success, r1.data?.data?.code || r1.data.message || '');
  const firstId = r1.data?.data?.id;
  if (!firstId) throw new Error('首次提交失败');

  log('步骤3: 第2次提交(同一幂等键)');
  const r2 = await request('/api/damage-reports', { method: 'POST', token: teacherToken, body: payload });
  const hitIdem = r2.data?.idempotent === true;
  record('【核心验证】第2次命中幂等返回', hitIdem, `idempotent=${r2.data?.idempotent}, id=${r2.data?.data?.id}`);

  log('步骤4: 第3、4、5次并发提交(模拟重复点击)');
  const concurrent = await Promise.all([2, 3, 4].map(i =>
    request('/api/damage-reports', { method: 'POST', token: teacherToken, body: { ...payload, idempotent_key: idemKey } })
  ));
  const allHit = concurrent.every(x => x.data?.idempotent === true || (x.data?.success && x.data?.data?.id === firstId));
  record('【核心验证】3次并发提交全部命中幂等或返回同一ID', allHit, concurrent.map(x => `idem=${x.data?.idempotent},id=${x.data?.data?.id}`).join(' | '));

  log('步骤5: 验证数据库中该器材未结报损单数量=1');
  const listR = await request(`/api/damage-reports?equipmentId=${eqId}`, { token: adminToken });
  const list = listR.data?.data || [];
  const pendingList = list.filter(x => !['REPAIRED','SCRAPPED','REJECTED'].includes(x.status));
  const lenOk = pendingList.length === 1 && pendingList[0].id === firstId;
  record('【核心验证】未结报损单数量=1且ID正确', lenOk, `pending=${pendingList.length}, ids=${pendingList.map(x=>x.id).join(',')}`);

  log('步骤6: 验证器材存在未结报损单时再次报损(不同幂等键)应失败');
  const payload2 = { idempotent_key: `s3-diff-${Date.now()}`, equipment_id: eqId, quantity: 1, damage_level: 'MINOR', description: '尝试在未结时再报损', discovery_date: '2025-06-10' };
  const dr = await request('/api/damage-reports', { method: 'POST', token: teacherToken, body: payload2 });
  record('【核心验证】存在未结时重复报损被业务规则拦截', dr.data?.success === false && /未结|重复报损/.test(dr.data?.message || ''), `HTTP${dr.status}: ${dr.data?.message || ''}`);

  log('步骤7: 验证审批通过前库存数量未减少');
  const eqInfo = (await request(`/api/equipments/${eqId}`, { token: adminToken })).data?.data || {};
  record('审批前可用库存保持=10', eqInfo.available_quantity === 10, `available=${eqInfo.available_quantity}`);
  log('场景3 结束\n');
};

const scenario4_HistoryTabsRegression = async () => {
  log('场景4: 历史查询页签回归验证', 'SCENARIO');
  const adminToken = await login('admin1');
  const teacherToken = await login('teacher1');
  const unwrap = (r) => r?.data?.data ?? r?.data ?? r;

  log('步骤1: 库存变更记录接口');
  const inv = await request('/api/audit/inventory-changes?limit=1000', { token: adminToken });
  const invList = unwrap(inv);
  record('库存变更接口返回成功+有数据', inv.ok && Array.isArray(invList) && invList.length > 0, `count=${Array.isArray(invList) ? invList.length : 0}`);

  log('步骤2: 借用历史接口');
  const br = await request('/api/borrows', { token: teacherToken });
  const brList = unwrap(br);
  record('借用历史接口返回成功+有数据', br.ok && Array.isArray(brList) && brList.length > 0, `count=${Array.isArray(brList) ? brList.length : 0}`);

  log('步骤3: 报损历史接口');
  const dr = await request('/api/damage-reports', { token: teacherToken });
  const drList = unwrap(dr);
  record('报损历史接口返回成功+有数据', dr.ok && Array.isArray(drList) && drList.length > 0, `count=${Array.isArray(drList) ? drList.length : 0}`);

  log('步骤4: 审计日志接口(仅管理员可见)');
  const al = await request('/api/audit/logs', { token: adminToken });
  const alData = unwrap(al);
  const alList = alData?.list || alData;
  record('审计日志接口返回成功+有数据', al.ok && Array.isArray(alList) && alList.length > 0, `count=${Array.isArray(alList) ? alList.length : 0}`);

  log('步骤5: 非管理员访问审计日志应被拒绝或返回空');
  const alNoPerm = await request('/api/audit/logs', { token: teacherToken });
  const noPermData = unwrap(alNoPerm);
  const noPermList = noPermData?.list || noPermData;
  record('非管理员审计日志返回空(权限限制)', alNoPerm.ok ? (!Array.isArray(noPermList) || noPermList.length === 0) : true, `status=${alNoPerm.status}, len=${Array.isArray(noPermList) ? noPermList.length : 'N/A'}`);

  log('场景4 结束\n');
};

const scenario5_SupplementApply = async () => {
  log('场景5: 补录申请 - 成功路径 + 借出未归还拒绝路径', 'SCENARIO');
  const adminToken = await login('admin1');
  const teacherToken = await login('teacher1');

  log('步骤1: 创建两件器材 - 一件将借出不归还，一件保持正常');
  const eq1Code = `EQ-SUPP-NORM-${Date.now()}`;
  const eq2Code = `EQ-SUPP-BORR-${Date.now()}`;
  const cr1 = await request('/api/equipments', { method: 'POST', token: adminToken, body: { code: eq1Code, name: '补录测试-正常器材', category: '球类', location: '测试区A', total_quantity: 5 } });
  record('创建正常器材', cr1.ok && cr1.data.success, cr1.data.message || '');
  const eq1Id = cr1.data?.data?.id;

  const cr2 = await request('/api/equipments', { method: 'POST', token: adminToken, body: { code: eq2Code, name: '补录测试-借出器材', category: '球类', location: '测试区B', total_quantity: 3 } });
  record('创建借出器材', cr2.ok && cr2.data.success, cr2.data.message || '');
  const eq2Id = cr2.data?.data?.id;

  log('步骤2: 对第二件器材执行借用(不归还)');
  const br = await request('/api/borrows', { method: 'POST', token: teacherToken, body: { equipment_id: eq2Id, quantity: 1, purpose: '补录场景-借出不归还' } });
  record('借用器材(不归还)', br.ok && br.data.success, br.data.message || '');

  log('步骤3: 补录申请 - 按分类"球类"筛选，同时覆盖正常和借出器材');
  const sr = await request('/api/damage-reports/supplement', { method: 'POST', token: teacherToken, body: { category: '球类', damage_level: 'MODERATE', description: '补录场景5:批量报损测试', discovery_date: '2025-06-10', quantity: 1 } });
  record('补录申请接口返回成功', sr.ok && sr.data.success, `total=${sr.data?.data?.total}, succeeded=${sr.data?.data?.succeeded}, failed=${sr.data?.data?.failed}`);

  const suppResults = sr.data?.data?.results || [];

  log('步骤4: 验证借出未归还器材被拒绝');
  const borrowedItem = suppResults.find(r => r.equipment_id === eq2Id);
  const borrowedRejected = borrowedItem && !borrowedItem.success && borrowedItem.borrowed === true && borrowedItem.message.includes('借出未归还');
  record('【核心验证】借出未归还器材补录被拒绝', borrowedRejected, borrowedItem ? `message=${borrowedItem.message}, borrowed=${borrowedItem.borrowed}` : '未找到对应结果');

  log('步骤5: 验证正常器材补录成功');
  const normalItem = suppResults.find(r => r.equipment_id === eq1Id && r.success === true);
  record('【核心验证】正常器材补录成功', !!normalItem, normalItem ? `report_code=${normalItem.report_code}` : '未找到成功结果');

  log('步骤6: 验证补录成功的报损单确实存在');
  if (normalItem) {
    const dr = await request(`/api/damage-reports/${normalItem.report_id}`, { token: adminToken });
    const reportOk = dr.ok && dr.data?.data?.status === 'PENDING_QUOTE' && dr.data?.data?.equipment_id === eq1Id;
    record('补录报损单存在于数据库且状态正确', reportOk, `status=${dr.data?.data?.status}`);
  }

  log('步骤7: 补录申请 - 仅筛选借出状态的器材，应全部被拒绝');
  const eq3Code = `EQ-SUPP-BOR2-${Date.now()}`;
  const cr3 = await request('/api/equipments', { method: 'POST', token: adminToken, body: { code: eq3Code, name: '补录测试-纯借出器材', category: '田径器材', location: '测试区C', total_quantity: 2 } });
  const eq3Id = cr3.data?.data?.id;
  if (eq3Id) {
    await request('/api/borrows', { method: 'POST', token: teacherToken, body: { equipment_id: eq3Id, quantity: 2, purpose: '补录场景-全部借出' } });
    const sr3 = await request('/api/damage-reports/supplement', { method: 'POST', token: teacherToken, body: { status: 'BORROWED', keyword: '补录测试-纯借出', damage_level: 'SEVERE', description: '补录场景5:纯借出器材', discovery_date: '2025-06-10', quantity: 1 } });
    const sr3Results = sr3.data?.data?.results || [];
    const allBorrowedRejected = sr3Results.length > 0 && sr3Results.every(r => !r.success && r.borrowed === true);
    record('【核心验证】纯借出器材补录全部被拒绝', allBorrowedRejected, `total=${sr3.data?.data?.total}, succeeded=${sr3.data?.data?.succeeded}, results=${JSON.stringify(sr3Results.map(r => ({name:r.name,success:r.success,borrowed:r.borrowed,message:r.message})))}`);
  } else {
    record('【核心验证】纯借出器材补录全部被拒绝', false, '未能创建测试器材');
  }

  log('场景5 结束\n');
};

const runAll = async () => {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║       校园体育器材报损系统 - 端到端验证脚本                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  try {
    await waitServer();
    await scenario1_NotReturnedCannotScrap();
    await scenario2_ExceedQuoteNeedGeneralApproval();
    await scenario3_IdempotentAndNoDuplicate();
    await scenario4_HistoryTabsRegression();
    await scenario5_SupplementApply();
  } catch (e) {
    log(`脚本异常终止: ${e.message}`, 'FAIL');
    console.error(e);
  }
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║                  测试结果汇总                      ║');
  console.log(`║  通过: \x1b[32m${results.passed}\x1b[0m  |  失败: \x1b[31m${results.failed}\x1b[0m  |  总计: ${results.passed + results.failed}  ║`);
  console.log(`║  通过率: ${results.passed + results.failed === 0 ? 'N/A' : ((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%` + ' '.repeat(30) + '║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  process.exit(results.failed === 0 ? 0 : 1);
};

runAll();
