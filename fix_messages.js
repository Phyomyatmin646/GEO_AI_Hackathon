const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("UPDATE outbound_messages SET status = 'queued' WHERE status = 'sending'")
  .then(() => { console.log('Fixed'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
