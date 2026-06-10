const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { generateToken, authMiddleware, ROLE_NAMES, auditLog } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ success: false, message: '用户名或密码错误' });
  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ success: false, message: '用户名或密码错误' });
  const token = generateToken(user.id);
  auditLog({ user, ip: req.ip, headers: req.headers }, 'LOGIN', 'USER', user.id);
  res.json({
    success: true,
    data: {
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role, roleName: ROLE_NAMES[user.role] }
    }
  });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, data: { ...req.user, roleName: ROLE_NAMES[req.user.role] } });
});

router.get('/users', authMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, name, role, created_at FROM users').all();
  res.json({ success: true, data: users.map(u => ({ ...u, roleName: ROLE_NAMES[u.role] })) });
});

module.exports = router;
