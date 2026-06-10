const express = require('express');
const db = require('../database');
const { authMiddleware, roleMiddleware, ROLES, ROLE_NAMES } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/logs', roleMiddleware(ROLES.ADMIN, ROLES.GENERAL_AFFAIRS), (req, res) => {
  const { action, userId, targetType, startDate, endDate, limit = 500, offset = 0 } = req.query;
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];
  if (action) { sql += ' AND action = ?'; params.push(action); }
  if (userId) { sql += ' AND user_id = ?'; params.push(userId); }
  if (targetType) { sql += ' AND target_type = ?'; params.push(targetType); }
  if (startDate) { sql += ' AND created_at >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND created_at <= ?'; params.push(endDate + ' 23:59:59'); }
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  const list = db.prepare(sql).all(...params);
  const total = db.prepare('SELECT COUNT(*) as cnt FROM audit_logs').get().cnt;
  res.json({ success: true, data: { list, total } });
});

router.get('/inventory-changes', (req, res) => {
  const { equipmentId, changeType, limit = 200, offset = 0 } = req.query;
  let sql = `SELECT ic.*, e.code as equipment_code, e.name as equipment_name, u.name as operator_name
    FROM inventory_changes ic LEFT JOIN equipments e ON ic.equipment_id = e.id
    LEFT JOIN users u ON ic.operator_id = u.id WHERE 1=1`;
  const params = [];
  if (equipmentId) { sql += ' AND ic.equipment_id = ?'; params.push(equipmentId); }
  if (changeType) { sql += ' AND ic.change_type = ?'; params.push(changeType); }
  sql += ' ORDER BY ic.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  const list = db.prepare(sql).all(...params);
  const typeText = { PURCHASE: '采购入库', BORROW_OUT: '借用出库', RETURN: '归还入库', DAMAGE: '报损', REPAIR_COMPLETE: '维修完成', SCRAP: '报废', ADJUST: '库存调整' };
  list.forEach(i => i.change_type_text = typeText[i.change_type] || i.change_type);
  res.json({ success: true, data: list });
});

router.get('/stats', (req, res) => {
  const totalEq = db.prepare('SELECT COUNT(*) as cnt, SUM(total_quantity) as qty FROM equipments').get();
  const borrowed = db.prepare(`SELECT COUNT(*) as cnt FROM borrow_records WHERE status = 'BORROWED'`).get().cnt;
  const pendingReports = db.prepare(`SELECT COUNT(*) as cnt FROM damage_reports WHERE status IN ('PENDING_QUOTE','PENDING_APPROVAL','REPAIRING')`).get().cnt;
  const scrapped = db.prepare(`SELECT COUNT(*) as cnt FROM equipments WHERE status = 'SCRAPPED'`).get().cnt;
  const byStatus = db.prepare('SELECT status, COUNT(*) as cnt FROM equipments GROUP BY status').all();
  const byCategory = db.prepare('SELECT category, COUNT(*) as cnt, SUM(total_quantity) as qty FROM equipments GROUP BY category').all();
  res.json({
    success: true,
    data: {
      totalEquipments: totalEq.cnt || 0,
      totalQuantity: totalEq.qty || 0,
      borrowing: borrowed,
      pendingReports,
      scrapped,
      byStatus,
      byCategory
    }
  });
});

router.get('/roles', (req, res) => {
  res.json({ success: true, data: Object.entries(ROLE_NAMES).map(([k, v]) => ({ code: k, name: v })) });
});

module.exports = router;
