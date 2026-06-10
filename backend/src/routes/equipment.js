const express = require('express');
const db = require('../database');
const { authMiddleware, roleMiddleware, ROLES, auditLog } = require('../auth');

const router = express.Router();

router.use(authMiddleware);

const createInventoryChange = (equipmentId, changeType, qtyChange, relatedType, relatedId, operatorId, remark = '') => {
  const eq = db.prepare('SELECT * FROM equipments WHERE id = ?').get(equipmentId);
  const before = eq.available_quantity;
  const after = before + qtyChange;
  if (after < 0) throw new Error('可用库存不足');
  db.prepare('UPDATE equipments SET available_quantity = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(after, equipmentId);
  db.prepare(`INSERT INTO inventory_changes (equipment_id, change_type, quantity_change, available_before, available_after, related_type, related_id, operator_id, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(equipmentId, changeType, qtyChange, before, after, relatedType, relatedId, operatorId, remark);
  return { before, after };
};

router.get('/', (req, res) => {
  const { keyword, category, status } = req.query;
  let sql = 'SELECT * FROM equipments WHERE 1=1';
  const params = [];
  if (keyword) { sql += ' AND (name LIKE ? OR code LIKE ? OR brand LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY id DESC';
  const list = db.prepare(sql).all(...params);
  res.json({ success: true, data: list });
});

router.get('/categories', (req, res) => {
  const list = db.prepare('SELECT DISTINCT category FROM equipments WHERE category IS NOT NULL').all().map(r => r.category).filter(Boolean);
  res.json({ success: true, data: list });
});

router.get('/:id', (req, res) => {
  const eq = db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id);
  if (!eq) return res.status(404).json({ success: false, message: '器材不存在' });
  res.json({ success: true, data: eq });
});

router.get('/:id/timeline', (req, res) => {
  const equipmentId = req.params.id;
  const events = [];
  const eq = db.prepare('SELECT * FROM equipments WHERE id = ?').get(equipmentId);
  if (!eq) return res.status(404).json({ success: false, message: '器材不存在' });
  events.push({ time: eq.created_at, type: 'CREATE', title: '器材入库', content: `${eq.name} (${eq.code}) 登记入库，数量 ${eq.total_quantity}` });
  const changes = db.prepare('SELECT * FROM inventory_changes WHERE equipment_id = ? ORDER BY created_at').all(equipmentId);
  const typeText = { PURCHASE: '采购入库', BORROW_OUT: '借用出库', RETURN: '归还入库', DAMAGE: '报损', REPAIR_COMPLETE: '维修完成', SCRAP: '报废', ADJUST: '库存调整' };
  changes.forEach(c => events.push({ time: c.created_at, type: c.change_type, title: typeText[c.change_type], content: `数量变化: ${c.quantity_change > 0 ? '+' : ''}${c.quantity_change}, 可用: ${c.available_before} → ${c.available_after}${c.remark ? ' (' + c.remark + ')' : ''}` }));
  const borrows = db.prepare('SELECT br.*, u.name as borrower_name FROM borrow_records br LEFT JOIN users u ON br.borrower_id = u.id WHERE br.equipment_id = ? ORDER BY br.created_at').all(equipmentId);
  borrows.forEach(b => {
    events.push({ time: b.created_at, type: 'BORROW', title: '借用登记', content: `${b.borrower_name} 借用 ${b.quantity} 件，用途：${b.purpose || '无'}，状态：${b.status === 'BORROWED' ? '借用中' : b.status === 'RETURNED' ? '已归还' : '已逾期'}` });
    if (b.actual_return_date) events.push({ time: b.actual_return_date, type: 'RETURN', title: '归还确认', content: `${b.borrower_name} 归还 ${b.quantity} 件` });
  });
  const reports = db.prepare('SELECT dr.*, u.name as reporter_name FROM damage_reports dr LEFT JOIN users u ON dr.reporter_id = u.id WHERE dr.equipment_id = ? ORDER BY dr.created_at').all(equipmentId);
  reports.forEach(r => {
    events.push({ time: r.created_at, type: 'DAMAGE', title: `报损单 ${r.code}`, content: `${r.reporter_name} 报损 ${r.quantity} 件，等级：${r.damage_level}，状态：${r.status}` });
  });
  events.sort((a, b) => new Date(a.time) - new Date(b.time));
  res.json({ success: true, data: events });
});

router.post('/', roleMiddleware(ROLES.ADMIN), (req, res) => {
  const { code, name, category, brand, model, purchase_date, original_price, location, total_quantity, description } = req.body;
  if (!code || !name || !category || !location) return res.status(400).json({ success: false, message: '必填字段缺失' });
  const exists = db.prepare('SELECT id FROM equipments WHERE code = ?').get(code);
  if (exists) return res.status(400).json({ success: false, message: '器材编号已存在' });
  const qty = total_quantity || 1;
  const info = db.prepare(`INSERT INTO equipments (code, name, category, brand, model, purchase_date, original_price, location, total_quantity, available_quantity, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(code, name, category, brand || null, model || null, purchase_date || null, original_price || 0, location, qty, qty, description || null);
  auditLog(req, 'CREATE_EQUIPMENT', 'EQUIPMENT', info.lastInsertRowid, null, { code, name, category });
  res.json({ success: true, data: { id: info.lastInsertRowid, message: '器材创建成功' } });
});

router.put('/:id', roleMiddleware(ROLES.ADMIN), (req, res) => {
  const old = db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ success: false, message: '器材不存在' });
  const { name, category, brand, model, purchase_date, original_price, location, description, status } = req.body;
  db.prepare(`UPDATE equipments SET name=?, category=?, brand=?, model=?, purchase_date=?, original_price=?, location=?, description=?, updated_at=datetime('now','localtime') WHERE id=?`).run(name || old.name, category || old.category, brand ?? old.brand, model ?? old.model, purchase_date ?? old.purchase_date, original_price ?? old.original_price, location || old.location, description ?? old.description, req.params.id);
  if (status && status !== old.status) db.prepare(`UPDATE equipments SET status=?, updated_at=datetime('now','localtime') WHERE id=?`).run(status, req.params.id);
  auditLog(req, 'UPDATE_EQUIPMENT', 'EQUIPMENT', old.id, old, req.body);
  res.json({ success: true, message: '更新成功' });
});

router.post('/:id/adjust', roleMiddleware(ROLES.ADMIN), (req, res) => {
  const { quantity, remark } = req.body;
  const eq = db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id);
  if (!eq) return res.status(404).json({ success: false, message: '器材不存在' });
  const diff = (quantity || 0) - eq.total_quantity;
  try {
    db.transaction(() => {
      db.prepare('UPDATE equipments SET total_quantity = ?, available_quantity = available_quantity + ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(quantity, diff, req.params.id);
      db.prepare(`INSERT INTO inventory_changes (equipment_id, change_type, quantity_change, available_before, available_after, related_type, related_id, operator_id, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(req.params.id, 'ADJUST', diff, eq.available_quantity, eq.available_quantity + diff, 'MANUAL', null, req.user.id, remark || '手动调整');
    });
    auditLog(req, 'ADJUST_INVENTORY', 'EQUIPMENT', eq.id, { total: eq.total_quantity, available: eq.available_quantity }, { total: quantity, available: eq.available_quantity + diff });
    res.json({ success: true, message: '库存调整成功' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:id', roleMiddleware(ROLES.ADMIN), (req, res) => {
  const old = db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ success: false, message: '器材不存在' });
  const borrowing = db.prepare('SELECT COUNT(*) as cnt FROM borrow_records WHERE equipment_id = ? AND status = ?').get(req.params.id, 'BORROWED').cnt;
  if (borrowing > 0) return res.status(400).json({ success: false, message: '该器材存在未归还的借用记录，不能删除' });
  const pending = db.prepare('SELECT COUNT(*) as cnt FROM damage_reports WHERE equipment_id = ? AND status NOT IN (\'REPAIRED\',\'SCRAPPED\',\'REJECTED\')').get(req.params.id).cnt;
  if (pending > 0) return res.status(400).json({ success: false, message: '该器材存在未完成的报损单，不能删除' });
  db.prepare('DELETE FROM equipments WHERE id = ?').run(req.params.id);
  auditLog(req, 'DELETE_EQUIPMENT', 'EQUIPMENT', old.id, old);
  res.json({ success: true, message: '删除成功' });
});

module.exports = { router, createInventoryChange };
