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

const runAll = async () => {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║       校园体育器材报损系统 - 端到端验证脚本                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  try {
    await waitServer();
    await scenario1_NotReturnedCannotScrap();
    await scenario2_ExceedQuoteNeedGeneralApproval();
    await scenario3_IdempotentAndNoDuplicate();
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
