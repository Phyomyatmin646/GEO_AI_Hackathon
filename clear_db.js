const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('DELETE FROM pipeline_runs;');
  console.log('Cleared pipeline_runs');
  await client.end();
}

main().catch(console.error);
