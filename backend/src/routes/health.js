const express = require('express');
const db = require('../database');
const { authMiddleware, auditLog } = require('../auth');

const router = express.Router();

router.get('/health', (req, res) => {
  try {
    const tableCount = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length;
    const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
    const eqCount = db.prepare('SELECT COUNT(*) as cnt FROM equipments').get().cnt;
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      data: { tables: tableCount, users: userCount, equipments: eqCount }
    });
  } catch (err) {
    res.status(500).json({ success: false, status: 'unhealthy', error: err.message });
  }
});

module.exports = router;
