process.on('uncaughtException', e => { console.log('[Uncaught]', e.message, e.stack); process.exit(1); });
process.on('unhandledRejection', e => { console.log('[UnhandledRej]', e.message || e); process.exit(1); });

const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, 'debug.log');
const LOG = (m) => { console.log(m); fs.appendFileSync(logFile, m + '\n'); };

LOG('Step 1: require db...');
const db = require('./src/database');
LOG('Step 2: wait db.ready...');

db.ready.then(() => {
  LOG('Step 3: db ready, loading routes...');
  try {
    require('./src/routes/health'); LOG(' - health OK');
    require('./src/routes/auth'); LOG(' - auth OK');
    require('./src/routes/equipment'); LOG(' - equipment OK');
    require('./src/routes/borrow'); LOG(' - borrow OK');
    require('./src/routes/damage'); LOG(' - damage OK');
    require('./src/routes/audit'); LOG(' - audit OK');
    require('./src/seed'); LOG(' - seed module OK');
    LOG('\n✅ All modules loaded');

    LOG('Step 4: Starting express app...');
    const app = require('./src/server');
    LOG(' - Express app loaded OK');

    LOG('Step 5: Test login API...');
    const http = require('http');
    const body = JSON.stringify({ username: 'admin1', password: '123456' });
    const req = http.request({
      hostname: '127.0.0.1', port: 3000,
      path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        LOG('  Login status=' + res.statusCode + ' body=' + d.slice(0, 300));
        LOG('\n✅ All tests passed! Closing server...');
        setTimeout(() => { LOG('Done'); process.exit(0); }, 1000);
      });
    });
    req.on('error', e => LOG('  Login request error: ' + e.message));
    req.write(body);
    req.end();
  } catch (e) {
    LOG('❌ Load error: ' + e.message + '\n' + e.stack);
    process.exit(1);
  }
}).catch(e => { LOG('db.ready ERROR: ' + e.message + '\n' + e.stack); process.exit(1); });
