const jwt = require('jsonwebtoken');
const db = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'sports-equipment-secret-key-2024';

const ROLES = {
  TEACHER: 'TEACHER',
  ADMIN: 'ADMIN',
  GENERAL_AFFAIRS: 'GENERAL_AFFAIRS',
  QUOTATION: 'QUOTATION'
};

const ROLE_NAMES = {
  TEACHER: '体育老师',
  ADMIN: '器材管理员',
  GENERAL_AFFAIRS: '总务审批人',
  QUOTATION: '维修报价录入人'
};

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未提供认证令牌' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, name, role FROM users WHERE id = ?').get(decoded.userId);
    if (!user) return res.status(401).json({ success: false, message: '用户不存在' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: '认证令牌无效' });
  }
};

const roleMiddleware = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: '未认证' });
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: `权限不足，需要角色：${allowedRoles.map(r => ROLE_NAMES[r]).join(' / ')}` });
  }
  next();
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

const auditLog = (req, action, targetType = null, targetId = null, oldValue = null, newValue = null) => {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (user_id, username, role, action, target_type, target_id, old_value, new_value, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    req.user?.id || null,
    req.user?.username || null,
    req.user?.role || null,
    action,
    targetType,
    targetId,
    oldValue ? JSON.stringify(oldValue) : null,
    newValue ? JSON.stringify(newValue) : null,
    req.ip || null,
    req.headers['user-agent'] || null
  );
};

const checkIdempotent = (key, resourceType) => {
  const record = db.prepare('SELECT * FROM idempotent_records WHERE idempotent_key = ?').get(key);
  if (record) return { exists: true, resourceId: record.resource_id, response: JSON.parse(record.response_json) };
  return { exists: false };
};

const saveIdempotent = (key, resourceType, resourceId, response) => {
  db.prepare(`
    INSERT INTO idempotent_records (idempotent_key, resource_type, resource_id, response_json)
    VALUES (?, ?, ?, ?)
  `).run(key, resourceType, resourceId, JSON.stringify(response));
};

module.exports = {
  JWT_SECRET,
  ROLES,
  ROLE_NAMES,
  authMiddleware,
  roleMiddleware,
  generateToken,
  auditLog,
  checkIdempotent,
  saveIdempotent
};
