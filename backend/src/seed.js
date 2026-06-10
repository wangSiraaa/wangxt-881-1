const bcrypt = require('bcryptjs');
const db = require('./database');

const { v4: uuidv4 } = require('uuid');

const runSeed = () => {
  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const insertUser = db.prepare(`INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)`);
  const users = [
    ['teacher1', hash('123456'), '张老师', 'TEACHER'],
    ['teacher2', hash('123456'), '李老师', 'TEACHER'],
    ['admin1', hash('123456'), '王管理员', 'ADMIN'],
    ['admin2', hash('123456'), '赵管理员', 'ADMIN'],
    ['general1', hash('123456'), '孙总务', 'GENERAL_AFFAIRS'],
    ['quotation1', hash('123456'), '周报价员', 'QUOTATION']
  ];
  users.forEach(u => insertUser.run(...u));
  console.log('[种子] 已创建 6 个用户账号');

  const insertEq = db.prepare(`INSERT INTO equipments (code, name, category, brand, model, purchase_date, original_price, status, location, total_quantity, available_quantity, description) VALUES (?, ?, ?, ?, ?, ?, ?, 'NORMAL', ?, ?, ?, ?)`);
  const equipments = [
    ['EQ-BASK-001', '专业比赛篮球', '球类', '斯伯丁', 'TF-1000', '2024-03-15', 499, '体育馆A区-篮球架1', 20, 20, '室内专业比赛用球，PU材质'],
    ['EQ-BASK-002', '训练篮球', '球类', '李宁', 'LBQK281', '2024-03-15', 199, '体育馆A区-篮球架2', 30, 30, '日常训练用球'],
    ['EQ-FOOT-001', '11人制足球', '球类', '阿迪达斯', 'Conext 21', '2024-02-20', 399, '足球场器材室', 15, 15, 'FIFA认证比赛用球'],
    ['EQ-BADM-001', '羽毛球拍套装', '球类', '尤尼克斯', 'Nanoflare 800', '2024-01-10', 1280, '羽毛球馆器材柜', 10, 10, '含拍包与手胶'],
    ['EQ-BADM-002', '羽毛球(筒)', '球类', '尤尼克斯', 'AS-05', '2024-04-01', 85, '羽毛球馆器材柜', 50, 50, '12只装，耐打训练用'],
    ['EQ-TTAB-001', '乒乓球台', '场地器材', '红双喜', 'T2024', '2023-09-01', 4800, '乒乓球室1', 4, 4, '室内标准比赛球台，带轮可移动'],
    ['EQ-TTAB-002', '乒乓球拍', '球类', '蝴蝶', 'Viscaria', '2024-01-05', 1080, '乒乓球室2', 20, 20, '专业级底板，双面反胶'],
    ['EQ-TRAC-001', '跨栏架', '田径器材', '金陵体育', 'TF-01', '2023-08-15', 280, '田径场器材房', 40, 40, '高度可调节106-76cm'],
    ['EQ-TRAC-002', '起跑器', '田径器材', '金陵体育', 'Q-03', '2023-08-15', 450, '田径场器材房', 12, 12, '铝合金，带角度调节'],
    ['EQ-FITN-001', '跑步机', '健身器材', '舒华', 'SH-5170', '2023-11-20', 12800, '健身房A区', 6, 6, '商用级，心率监测'],
    ['EQ-FITN-002', '哑铃套装', '健身器材', 'Keep', '11342', '2024-02-01', 899, '健身房B区', 15, 15, '2.5kg-25kg共10对'],
    ['EQ-SWIM-001', '救生圈', '水上器材', '李宁', 'LXXS-001', '2023-07-01', 95, '游泳馆救生台', 20, 20, '专业成人救生圈，带反光条'],
    ['EQ-VOLY-001', '气排球', '球类', '宇生富', '6001', '2024-03-01', 158, '体育馆B区', 25, 25, '中老年人健身专用'],
    ['EQ-MART-001', '太极剑', '武术器材', '沈广隆', 'TJ-002', '2023-10-15', 320, '武术室A柜', 12, 12, '不锈钢，未开刃表演用'],
    ['EQ-CAMP-001', '帐篷(4人)', '户外器材', '牧高笛', '冷山4', '2023-05-20', 899, '户外器材室1号', 8, 8, '双层防雨，含地布']
  ];
  equipments.forEach(e => insertEq.run(...e));
  console.log(`[种子] 已创建 ${equipments.length} 条器材台账`);

  const usersInDb = db.prepare('SELECT id, username FROM users').all();
  const eqsInDb = db.prepare('SELECT id, code, available_quantity FROM equipments').all();
  const teacherIds = usersInDb.filter(u => ['teacher1','teacher2'].includes(u.username)).map(u => u.id);
  const adminIds = usersInDb.filter(u => ['admin1','admin2'].includes(u.username)).map(u => u.id);

  const insertBorrow = db.prepare(`INSERT INTO borrow_records (equipment_id, borrower_id, quantity, borrow_date, expected_return_date, purpose, status) VALUES (?, ?, ?, ?, ?, ?, 'BORROWED')`);
  const borrowSamples = [
    [eqsInDb[0].id, teacherIds[0], 3, '2025-06-05', '2025-06-12', '高一篮球联赛训练'],
    [eqsInDb[3].id, teacherIds[1], 2, '2025-06-08', '2025-06-15', '羽毛球选修课'],
    [eqsInDb[13].id, teacherIds[0], 4, '2025-06-09', '2025-06-16', '太极表演彩排']
  ];
  borrowSamples.forEach(b => {
    insertBorrow.run(...b);
    db.prepare('UPDATE equipments SET available_quantity = available_quantity - ? WHERE id = ?').run(b[2], b[0]);
    const after = db.prepare('SELECT available_quantity, total_quantity FROM equipments WHERE id = ?').get(b[0]);
    if (after.available_quantity === 0) db.prepare("UPDATE equipments SET status = 'BORROWED' WHERE id = ?").run(b[0]);
  });
  console.log(`[种子] 已创建 ${borrowSamples.length} 条借用记录`);

  const genReportCode = () => {
    const d = new Date();
    const prefix = `BS${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    let seq = 1;
    return `${prefix}${String(seq).padStart(4,'0')}`;
  };
  const insertReport = db.prepare(`INSERT INTO damage_reports (idempotent_key, code, equipment_id, reporter_id, quantity, damage_level, description, discovery_date, location, status, needs_general_approval, quote_amount, decision, approver_id, completed_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const eq2 = eqsInDb[1];
  const pendingKey = `seed-report-pending-${eq2.id}`;
  db.prepare('UPDATE equipments SET available_quantity = available_quantity - 1, status = ? WHERE id = ? AND available_quantity > 0').run('DAMAGED', eq2.id);
  insertReport.run(pendingKey, genReportCode(), eq2.id, teacherIds[0], 1, 'MODERATE', '球面表皮磨损，有漏气迹象', '2025-06-08', '体育馆A区-篮球架2', 'PENDING_QUOTE', 0, null, null, null, null);
  console.log('[种子] 已创建 1 条待报价报损单');

  console.log('\n==========================================');
  console.log('  默认登录账号 (密码均为: 123456):');
  console.log('  ┌───────────────┬───────────────┬──────────────┐');
  console.log('  │  角色         │  账号         │  姓名        │');
  console.log('  ├───────────────┼───────────────┼──────────────┤');
  console.log('  │  体育老师     │  teacher1     │  张老师      │');
  console.log('  │  体育老师     │  teacher2     │  李老师      │');
  console.log('  │  器材管理员   │  admin1       │  王管理员    │');
  console.log('  │  器材管理员   │  admin2       │  赵管理员    │');
  console.log('  │  总务审批人   │  general1     │  孙总务      │');
  console.log('  │  报价录入人   │  quotation1   │  周报价员    │');
  console.log('  └───────────────┴───────────────┴──────────────┘');
  console.log('==========================================\n');
};

if (require.main === module) {
  console.log('[种子] 开始初始化种子数据...');
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  if (userCount > 0) {
    console.log('[种子] 检测到已有数据，跳过初始化。如需重新初始化请删除 backend/data/equipment.db');
  } else {
    runSeed();
    console.log('[种子] 初始化完成!');
  }
}

module.exports = runSeed;
