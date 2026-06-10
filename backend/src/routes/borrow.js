const express = require('express');
const db = require('../database');
const { authMiddleware, roleMiddleware, ROLES, auditLog } = require('../auth');
const { createInventoryChange } = require('./equipment');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const { status, equipmentId, borrowerId } = req.query;
  let sql = `SELECT br.*, e.code as equipment_code, e.name as equipment_name, e.location as equipment_location, u.name as borrower_name FROM borrow_records br LEFT JOIN equipments e ON br.equipment_id = e.id LEFT JOIN users u ON br.borrower_id = u.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND br.status = ?'; params.push(status); }
  if (equipmentId) { sql += ' AND br.equipment_id = ?'; params.push(equipmentId); }
  if (borrowerId) { sql += ' AND br.borrower_id = ?'; params.push(borrowerId); }
  sql += ' ORDER BY br.id DESC';
  const list = db.prepare(sql).all(...params);
  res.json({ success: true, data: list });
});

router.post('/', roleMiddleware(ROLES.TEACHER, ROLES.ADMIN), (req, res) => {
  const { equipment_id, borrower_id, quantity, borrow_date, expected_return_date, purpose } = req.body;
  if (!equipment_id || !quantity) return res.status(400).json({ success: false, message: '必填字段缺失' });
  const eq = db.prepare('SELECT * FROM equipments WHERE id = ?').get(equipment_id);
  if (!eq) return res.status(404).json({ success: false, message: '器材不存在' });
  if (eq.status === 'SCRAPPED') return res.status(400).json({ success: false, message: '该器材已报废，不能借出' });
  if (eq.available_quantity < quantity) return res.status(400).json({ success: false, message: `可用库存不足，当前可用：${eq.available_quantity}` });
  const borrower = borrower_id || req.user.id;
  try {
    db.transaction(() => {
      const info = db.prepare(`INSERT INTO borrow_records (equipment_id, borrower_id, quantity, borrow_date, expected_return_date, purpose, status) VALUES (?, ?, ?, ?, ?, ?, 'BORROWED')`).run(equipment_id, borrower, quantity, borrow_date || new Date().toISOString().split('T')[0], expected_return_date || null, purpose || null);
      createInventoryChange(equipment_id, 'BORROW_OUT', -quantity, 'BORROW', info.lastInsertRowid, req.user.id, `借用-${purpose || '无'}`);
      const afterEq = db.prepare('SELECT available_quantity FROM equipments WHERE id = ?').get(equipment_id);
      if (afterEq.available_quantity === 0) {
        db.prepare(`UPDATE equipments SET status = 'BORROWED', updated_at = datetime('now','localtime') WHERE id = ? AND status = 'NORMAL'`).run(equipment_id);
      }
      auditLog(req, 'CREATE_BORROW', 'BORROW', info.lastInsertRowid, null, { equipment_id, quantity, borrower });
    });
    res.json({ success: true, message: '借用登记成功' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:id/return', roleMiddleware(ROLES.ADMIN), (req, res) => {
  const { remark, condition } = req.body;
  const br = db.prepare('SELECT * FROM borrow_records WHERE id = ?').get(req.params.id);
  if (!br) return res.status(404).json({ success: false, message: '借用记录不存在' });
  if (br.status === 'RETURNED') return res.status(400).json({ success: false, message: '该记录已归还' });
  try {
    db.transaction(() => {
      db.prepare(`UPDATE borrow_records SET status = 'RETURNED', actual_return_date = ? WHERE id = ?`).run(new Date().toISOString().split('T')[0], req.params.id);
      createInventoryChange(br.equipment_id, 'RETURN', br.quantity, 'BORROW', br.id, req.user.id, remark || '归还入库');
      const afterEq = db.prepare('SELECT available_quantity, total_quantity FROM equipments WHERE id = ?').get(br.equipment_id);
      if (afterEq.available_quantity > 0 && afterEq.available_quantity === afterEq.total_quantity) {
        db.prepare(`UPDATE equipments SET status = 'NORMAL', updated_at = datetime('now','localtime') WHERE id = ? AND status = 'BORROWED'`).run(br.equipment_id);
      }
      auditLog(req, 'RETURN_BORROW', 'BORROW', br.id, { status: br.status }, { status: 'RETURNED', condition: condition || '正常' });
    });
    res.json({ success: true, message: '归还确认成功' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
