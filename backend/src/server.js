const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

app.use((req, res, next) => {
  if (!db.ready || !db.ready.isFulfilled) {
    db.ready.then(() => next()).catch(next);
  } else {
    next();
  }
});

const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const { router: equipmentRouter } = require('./routes/equipment');
const borrowRouter = require('./routes/borrow');
const { router: damageRouter } = require('./routes/damage');
const auditRouter = require('./routes/audit');

app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/equipments', equipmentRouter);
app.use('/api/borrows', borrowRouter);
app.use('/api/damage-reports', damageRouter);
app.use('/api/audit', auditRouter);

app.get('/api', (req, res) => {
  res.json({
    success: true,
    name: '校园体育器材报损系统 API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/login',
      equipments: '/api/equipments',
      borrows: '/api/borrows',
      damage_reports: '/api/damage-reports',
      audit: '/api/audit/stats'
    }
  });
});

if (fs.existsSync(frontendDist)) {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/uploads/')) {
      res.sendFile(path.join(frontendDist, 'index.html'));
    }
  });
}

app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ success: false, message: err.message || '服务器内部错误' });
});

const seedIfNeeded = async () => {
  await db.ready;
  const stmt = db.prepare('SELECT COUNT(*) as cnt FROM users');
  const result = stmt.get();
  const userCount = result ? (result.cnt || 0) : 0;
  if (userCount === 0) {
    console.log('[系统] 数据库为空，正在执行种子数据初始化...');
    require('./seed')();
    setTimeout(() => { if (db.saveNow) db.saveNow(); }, 500);
    console.log('[系统] 种子数据初始化完成');
  }
};

if (require.main === module) {
  (async () => {
    await db.ready;
    await seedIfNeeded();
    app.listen(PORT, () => {
      console.log(`==========================================`);
      console.log(`  校园体育器材报损系统 已启动`);
      console.log(`  后端地址: http://localhost:${PORT}`);
      console.log(`  健康检查: http://localhost:${PORT}/api/health`);
      console.log(`  API文档:  http://localhost:${PORT}/api`);
      console.log(`==========================================`);
    });
  })();
}

module.exports = app;
