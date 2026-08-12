const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '../.env' });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const weekStart = '2026-07-27';
  const predictionsDir = path.join(__dirname, '../data/weekly', weekStart, 'predictions');

  try {
    // 1. Create a successful pipeline run
    console.log(`Creating pipeline run for week_start=${weekStart}...`);
    const runRes = await pool.query(
      `INSERT INTO pipeline_runs (week_start, status) VALUES ($1, 'succeeded') RETURNING id`,
      [weekStart]
    );
    const runId = runRes.rows[0].id;
    console.log(`Created pipeline run ID: ${runId}`);

    // 2. Read and insert predictions
    const files = fs.readdirSync(predictionsDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
      console.log('No JSON files found in:', predictionsDir);
      return;
    }

    for (const file of files) {
      const region = path.basename(file, '.json');
      const filePath = path.join(predictionsDir, file);
      console.log(`Reading ${file} for region ${region}...`);
      
      const payloadString = fs.readFileSync(filePath, 'utf8');
      const payload = JSON.parse(payloadString);

      console.log(`Inserting data for ${region}...`);
      await pool.query(
        `INSERT INTO weekly_region_predictions (pipeline_run_id, region, payload, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
        [runId, region, payload]
      );
      console.log(`Successfully inserted ${region}!`);
    }

    console.log('All predictions restored successfully!');
  } catch (err) {
    console.error('Error restoring predictions:', err);
  } finally {
    await pool.end();
  }
}

main();
