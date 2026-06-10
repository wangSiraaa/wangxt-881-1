const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authMiddleware, roleMiddleware, ROLES, auditLog, checkIdempotent, saveIdempotent } = require('../auth');
const { createInventoryChange } = require('./equipment');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authMiddleware);

const QUOTE_THRESHOLD = parseFloat(process.env.QUOTE_THRESHOLD || '1000');

const generateReportCode = () => {
  const d = new Date();
  const prefix = `BS${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const last = db.prepare(`SELECT code FROM damage_reports WHERE code LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}%`);
  let seq = 1;
  if (last) seq = parseInt(last.code.slice(prefix.length)) + 1;
  return `${prefix}${String(seq).padStart(4,'0')}`;
};

const validateBusinessRules = (equipmentId, decision, quoteAmount, userRole) => {
  const eq = db.prepare('SELECT * FROM equipments WHERE id = ?').get(equipmentId);
  if (!eq) return { valid: false, message: '器材不存在' };
  if (decision === 'SCRAP') {
    const borrowing = db.prepare(`SELECT COUNT(*) as cnt FROM borrow_records WHERE equipment_id = ? AND status = 'BORROWED'`).get(equipmentId).cnt;
    if (borrowing > 0) return { valid: false, message: '该器材存在未归还的借用记录，不能直接报废' };
  }
  if (quoteAmount && quoteAmount > QUOTE_THRESHOLD && userRole !== ROLES.GENERAL_AFFAIRS) {
    return { valid: false, message: `维修报价超过阈值(${QUOTE_THRESHOLD}元)，需总务审批人审批`, needApproval: true };
  }
  return { valid: true };
};

router.get('/', (req, res) => {
  const { status, equipmentId, reporterId, decision } = req.query;
  let sql = `SELECT dr.*, e.code as equipment_code, e.name as equipment_name, e.original_price as equipment_price,
    u1.name as reporter_name, u2.name as approver_name
    FROM damage_reports dr LEFT JOIN equipments e ON dr.equipment_id = e.id
    LEFT JOIN users u1 ON dr.reporter_id = u1.id LEFT JOIN users u2 ON dr.approver_id = u2.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND dr.status = ?'; params.push(status); }
  if (equipmentId) { sql += ' AND dr.equipment_id = ?'; params.push(equipmentId); }
  if (reporterId) { sql += ' AND dr.reporter_id = ?'; params.push(reporterId); }
  if (decision) { sql += ' AND dr.decision = ?'; params.push(decision); }
  sql += ' ORDER BY dr.id DESC';
  const list = db.prepare(sql).all(...params);
  res.json({ success: true, data: list });
});

router.post('/supplement', roleMiddleware(ROLES.TEACHER, ROLES.ADMIN), (req, res) => {
  const { keyword, category, status: eqStatus, damage_level, description, discovery_date, location, quantity } = req.body;
  if (!damage_level || !description) return res.status(400).json({ success: false, message: '必填字段缺失(损坏等级/说明)' });

  let sql = 'SELECT * FROM equipments WHERE 1=1';
  const params = [];
  if (keyword) { sql += ' AND (name LIKE ? OR code LIKE ? OR brand LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (eqStatus) { sql += ' AND status = ?'; params.push(eqStatus); }
  sql += ' ORDER BY id DESC';
  const equipments = db.prepare(sql).all(...params);

  if (equipments.length === 0) return res.json({ success: true, data: { total: 0, succeeded: 0, failed: 0, results: [] } });

  const results = [];
  db.transaction(() => {
    for (const eq of equipments) {
      if (eq.status === 'SCRAPPED') { results.push({ equipment_id: eq.id, code: eq.code, name: eq.name, success: false, message: '该器材已报废，不能报损' }); continue; }
      const pending = db.prepare(`SELECT COUNT(*) as cnt FROM damage_reports WHERE equipment_id = ? AND status NOT IN ('REPAIRED','SCRAPPED','REJECTED')`).get(eq.id).cnt;
      if (pending > 0) { results.push({ equipment_id: eq.id, code: eq.code, name: eq.name, success: false, message: '该器材存在未结的报损单，不能重复报损' }); continue; }
      const borrowing = db.prepare(`SELECT COUNT(*) as cnt FROM borrow_records WHERE equipment_id = ? AND status = 'BORROWED'`).get(eq.id).cnt;
      if (borrowing > 0) { results.push({ equipment_id: eq.id, code: eq.code, name: eq.name, success: false, message: '借出未归还器材不能报废', borrowed: true }); continue; }
      const code = generateReportCode();
      const idemKey = `supplement-${req.user.id}-${eq.id}-${Date.now()}`;
      try {
        const info = db.prepare(`INSERT INTO damage_reports (idempotent_key, code, equipment_id, reporter_id, quantity, damage_level, description, discovery_date, location, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_QUOTE')`).run(idemKey, code, eq.id, req.user.id, quantity || 1, damage_level, description, discovery_date || new Date().toISOString().split('T')[0], location || eq.location);
        db.prepare(`UPDATE equipments SET status = 'DAMAGED', updated_at = datetime('now','localtime') WHERE id = ? AND status = 'NORMAL'`).run(eq.id);
        auditLog(req, 'SUPPLEMENT_DAMAGE_REPORT', 'DAMAGE_REPORT', info.lastInsertRowid, null, { code, equipment_id: eq.id, damage_level, supplement: true });
        results.push({ equipment_id: eq.id, code: eq.code, name: eq.name, success: true, report_id: info.lastInsertRowid, report_code: code, message: '报损申请创建成功' });
      } catch (err) {
        results.push({ equipment_id: eq.id, code: eq.code, name: eq.name, success: false, message: err.message });
      }
    }
  });

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  res.json({ success: true, data: { total: equipments.length, succeeded, failed, results } });
});

router.get('/threshold', (req, res) => {
  res.json({ success: true, data: { threshold: QUOTE_THRESHOLD } });
});

router.get('/:id', (req, res) => {
  const r = db.prepare(`SELECT dr.*, e.code as equipment_code, e.name as equipment_name, e.original_price as equipment_price,
    e.location as equipment_location, u1.name as reporter_name, u2.name as approver_name
    FROM damage_reports dr LEFT JOIN equipments e ON dr.equipment_id = e.id
    LEFT JOIN users u1 ON dr.reporter_id = u1.id LEFT JOIN users u2 ON dr.approver_id = u2.id WHERE dr.id = ?`).get(req.params.id);
  if (!r) return res.status(404).json({ success: false, message: '报损单不存在' });
  const quotes = db.prepare(`SELECT q.*, u.name as quoter_name FROM repair_quotes q LEFT JOIN users u ON q.quoter_id = u.id WHERE q.report_id = ? ORDER BY q.id`).all(req.params.id);
  const attachments = db.prepare(`SELECT * FROM attachments WHERE report_id = ?`).all(req.params.id);
  r.quotes = quotes;
  r.attachments = attachments;
  res.json({ success: true, data: r });
});

router.post('/', roleMiddleware(ROLES.TEACHER, ROLES.ADMIN), (req, res) => {
  const { idempotent_key, equipment_id, quantity, damage_level, description, discovery_date, location } = req.body;
  if (!equipment_id || !damage_level || !description) return res.status(400).json({ success: false, message: '必填字段缺失' });
  const key = idempotent_key || `report-${req.user.id}-${equipment_id}-${Date.now()}`;
  const check = checkIdempotent(key, 'DAMAGE_REPORT');
  if (check.exists) {
    auditLog(req, 'DAMAGE_REPORT_IDEMPOTENT_HIT', 'DAMAGE_REPORT', check.resourceId);
    return res.json({ ...check.response, idempotent: true });
  }
  const eq = db.prepare('SELECT * FROM equipments WHERE id = ?').get(equipment_id);
  if (!eq) return res.status(404).json({ success: false, message: '器材不存在' });
  if (eq.status === 'SCRAPPED') return res.status(400).json({ success: false, message: '该器材已报废，不能报损' });
  const pending = db.prepare(`SELECT COUNT(*) as cnt FROM damage_reports WHERE equipment_id = ? AND status NOT IN ('REPAIRED','SCRAPPED','REJECTED')`).get(equipment_id).cnt;
  if (pending > 0) return res.status(400).json({ success: false, message: '该器材存在未结的报损单，不能重复报损' });
  const code = generateReportCode();
  try {
    let reportId;
    db.transaction(() => {
      const info = db.prepare(`INSERT INTO damage_reports (idempotent_key, code, equipment_id, reporter_id, quantity, damage_level, description, discovery_date, location, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_QUOTE')`).run(key, code, equipment_id, req.user.id, quantity || 1, damage_level, description, discovery_date || new Date().toISOString().split('T')[0], location || eq.location);
      reportId = info.lastInsertRowid;
      db.prepare(`UPDATE equipments SET status = 'DAMAGED', updated_at = datetime('now','localtime') WHERE id = ? AND status = 'NORMAL'`).run(equipment_id);
      auditLog(req, 'CREATE_DAMAGE_REPORT', 'DAMAGE_REPORT', reportId, null, { code, equipment_id, damage_level });
    });
    const response = { success: true, data: { id: reportId, code, message: '报损申请创建成功' } };
    saveIdempotent(key, 'DAMAGE_REPORT', reportId, response);
    res.json(response);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:id/upload', upload.array('files', 10), (req, res) => {
  const r = db.prepare('SELECT * FROM damage_reports WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ success: false, message: '报损单不存在' });
  const files = req.files || [];
  const saved = [];
  files.forEach(f => {
    const info = db.prepare(`INSERT INTO attachments (report_id, filename, original_name, filepath, mimetype, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(req.params.id, f.filename, f.originalname, f.path, f.mimetype, f.size, req.user.id);
    saved.push({ id: info.lastInsertRowid, original_name: f.originalname });
  });
  auditLog(req, 'UPLOAD_ATTACHMENT', 'DAMAGE_REPORT', r.id, null, { files: saved.map(s => s.original_name) });
  res.json({ success: true, data: saved });
});

router.post('/:id/quote', roleMiddleware(ROLES.QUOTATION, ROLES.ADMIN), (req, res) => {
  const { amount, vendor, quote_detail, estimate_days, remark } = req.body;
  const r = db.prepare('SELECT * FROM damage_reports WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ success: false, message: '报损单不存在' });
  if (r.status !== 'PENDING_QUOTE') return res.status(400).json({ success: false, message: '当前状态不需要报价' });
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: '报价金额无效' });
  const isExceed = amount > QUOTE_THRESHOLD;
  try {
    db.transaction(() => {
      db.prepare(`INSERT INTO repair_quotes (report_id, quoter_id, amount, vendor, quote_detail, estimate_days, remark, is_exceed_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(req.params.id, req.user.id, amount, vendor || null, quote_detail || null, estimate_days || null, remark || null, isExceed ? 1 : 0);
      if (isExceed) {
        db.prepare(`UPDATE damage_reports SET status = 'PENDING_APPROVAL', needs_general_approval = 1, quote_amount = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(amount, req.params.id);
        auditLog(req, 'CREATE_QUOTE_EXCEED', 'DAMAGE_REPORT', r.id, null, { amount, threshold: QUOTE_THRESHOLD });
      } else {
        db.prepare(`UPDATE damage_reports SET status = 'PENDING_APPROVAL', quote_amount = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(amount, req.params.id);
        auditLog(req, 'CREATE_QUOTE', 'DAMAGE_REPORT', r.id, null, { amount });
      }
    });
    res.json({ success: true, data: { isExceed, message: isExceed ? '报价录入成功，已提交总务审批' : '报价录入成功，待审批' } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:id/approve', roleMiddleware(ROLES.GENERAL_AFFAIRS, ROLES.ADMIN), (req, res) => {
  const { approved, decision, remark } = req.body;
  const r = db.prepare('SELECT * FROM damage_reports WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ success: false, message: '报损单不存在' });
  if (r.status !== 'PENDING_APPROVAL') return res.status(400).json({ success: false, message: '当前状态不可审批' });
  if (r.quote_amount > QUOTE_THRESHOLD && req.user.role !== ROLES.GENERAL_AFFAIRS && req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ success: false, message: `报价(${r.quote_amount}元)超过阈值(${QUOTE_THRESHOLD}元)，仅总务审批人可审批` });
  }
  try {
    db.transaction(() => {
      if (approved) {
        const finalDecision = decision || (r.quote_amount > (r.equipment_price || 0) * 0.5 ? 'SCRAP' : 'REPAIR');
        const check = validateBusinessRules(r.equipment_id, finalDecision, r.quote_amount, req.user.role);
        if (!check.valid) throw new Error(check.message);
        const nextStatus = finalDecision === 'REPAIR' ? 'REPAIRING' : 'SCRAPPED';
        db.prepare(`UPDATE damage_reports SET status = ?, decision = ?, approver_id = ?, approval_time = datetime('now','localtime'), approval_remark = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(nextStatus, finalDecision, req.user.id, remark || null, req.params.id);
        if (finalDecision === 'SCRAP') {
          const eq = db.prepare('SELECT * FROM equipments WHERE id = ?').get(r.equipment_id);
          const availableQty = Math.min(eq.available_quantity, r.quantity);
          if (availableQty > 0) {
            createInventoryChange(r.equipment_id, 'SCRAP', -availableQty, 'DAMAGE_REPORT', r.id, req.user.id, '报损报废');
          }
          const newTotal = eq.total_quantity - r.quantity;
          if (newTotal <= 0) {
            db.prepare(`UPDATE equipments SET status = 'SCRAPPED', total_quantity = 0, available_quantity = 0, updated_at = datetime('now','localtime') WHERE id = ?`).run(r.equipment_id);
          } else {
            db.prepare(`UPDATE equipments SET total_quantity = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(newTotal, r.equipment_id);
          }
          db.prepare(`UPDATE damage_reports SET status = 'SCRAPPED', completed_time = datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE id = ?`).run(req.params.id);
        } else {
          db.prepare(`UPDATE equipments SET status = 'REPAIRING', updated_at = datetime('now','localtime') WHERE id = ?`).run(r.equipment_id);
        }
        auditLog(req, 'APPROVE_REPORT', 'DAMAGE_REPORT', r.id, { status: r.status }, { status: nextStatus, decision: finalDecision });
      } else {
        db.prepare(`UPDATE damage_reports SET status = 'REJECTED', approver_id = ?, approval_time = datetime('now','localtime'), approval_remark = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(req.user.id, remark || '审批驳回', req.params.id);
        const pendingOther = db.prepare(`SELECT COUNT(*) as cnt FROM damage_reports WHERE equipment_id = ? AND id != ? AND status NOT IN ('REPAIRED','SCRAPPED','REJECTED')`).get(r.equipment_id, r.id).cnt;
        if (pendingOther === 0) {
          db.prepare(`UPDATE equipments SET status = CASE WHEN available_quantity > 0 THEN 'NORMAL' ELSE status END, updated_at = datetime('now','localtime') WHERE id = ?`).run(r.equipment_id);
        }
        auditLog(req, 'REJECT_REPORT', 'DAMAGE_REPORT', r.id, { status: r.status }, { status: 'REJECTED', remark });
      }
    });
    res.json({ success: true, message: approved ? '审批通过' : '审批驳回' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:id/complete-repair', roleMiddleware(ROLES.ADMIN, ROLES.QUOTATION), (req, res) => {
  const { repair_note, actual_cost } = req.body;
  const r = db.prepare('SELECT * FROM damage_reports WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ success: false, message: '报损单不存在' });
  if (r.status !== 'REPAIRING') return res.status(400).json({ success: false, message: '当前状态不可标记维修完成' });
  try {
    db.transaction(() => {
      db.prepare(`UPDATE damage_reports SET status = 'REPAIRED', completed_time = datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE id = ?`).run(req.params.id);
      const eq = db.prepare('SELECT * FROM equipments WHERE id = ?').get(r.equipment_id);
      if (eq.total_quantity > 0) {
        db.prepare(`UPDATE equipments SET status = CASE WHEN available_quantity > 0 THEN 'NORMAL' ELSE 'BORROWED' END, updated_at = datetime('now','localtime') WHERE id = ?`).run(r.equipment_id);
      }
      if (actual_cost) db.prepare(`UPDATE repair_quotes SET remark = COALESCE(remark,'') || ' [实际费用:' || ? || ']' WHERE report_id = ?`).run(actual_cost, req.params.id);
      auditLog(req, 'COMPLETE_REPAIR', 'DAMAGE_REPORT', r.id, { status: r.status }, { status: 'REPAIRED', actual_cost, note: repair_note });
    });
    res.json({ success: true, message: '维修完成，库存已恢复' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/:id/timeline', (req, res) => {
  const r = db.prepare('SELECT * FROM damage_reports WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ success: false, message: '报损单不存在' });
  const events = [];
  events.push({ time: r.created_at, type: 'CREATE', title: '创建报损单', content: `单号 ${r.code}，损坏等级 ${r.damage_level}，数量 ${r.quantity}` });
  if (r.approval_time) events.push({ time: r.approval_time, type: r.status === 'REJECTED' ? 'REJECT' : 'APPROVE', title: r.status === 'REJECTED' ? '审批驳回' : '审批通过', content: r.decision ? `决策：${r.decision === 'REPAIR' ? '维修' : '报废'}${r.approval_remark ? '，备注：' + r.approval_remark : ''}` : (r.approval_remark || '无备注') });
  if (r.completed_time) events.push({ time: r.completed_time, type: 'COMPLETE', title: r.status === 'SCRAPPED' ? '已报废' : '维修完成', content: r.status === 'SCRAPPED' ? '器材已报废，库存扣减' : '维修完成，库存恢复' });
  const quotes = db.prepare(`SELECT q.*, u.name as quoter_name FROM repair_quotes q LEFT JOIN users u ON q.quoter_id = u.id WHERE q.report_id = ? ORDER BY q.id`).all(req.params.id);
  quotes.forEach(q => events.push({ time: q.created_at, type: 'QUOTE', title: '维修报价', content: `${q.quoter_name} 报价 ¥${q.amount}${q.is_exceed_threshold ? '（超限）' : ''}${q.vendor ? '，供应商：' + q.vendor : ''}` }));
  events.sort((a, b) => new Date(a.time) - new Date(b.time));
  res.json({ success: true, data: events });
});

module.exports = { router, validateBusinessRules, QUOTE_THRESHOLD };
