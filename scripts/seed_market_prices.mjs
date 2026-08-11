import pg from 'pg';
const { Client } = pg;

const DB_URL =
  'postgresql://neondb_owner:npg_PZ0QmSKqA7IW@ep-spring-leaf-azfclw2c-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// ── Fake market price rows ────────────────────────────────
// Table: crop_market_prices
// Required: commodity_name_raw, currency, quantity, unit, source_name, source_date, source_url, fetched_at, raw_payload
// At least one of price_min / price_max must be non-null
const TODAY = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

const rows = [
  // Rice varieties (monsoon_rice / dry_season_rice)
  { crop_key: 'monsoon_rice',     name: 'Rice (Pyapon Paw San) (New)',           region: 'Yangon', marketplace: 'War Tan', min: 155000, max: 165000, qty: 1.5, unit: 'basket' },
  { crop_key: 'monsoon_rice',     name: 'Rice (MyaungMya Pathein Paw San) (New)', region: 'Yangon', marketplace: 'War Tan', min: 153000, max: 163000, qty: 1.5, unit: 'basket' },
  { crop_key: 'monsoon_rice',     name: 'Rice (Paw San Nae Sone) (New)',          region: 'Yangon', marketplace: 'War Tan', min: 142000, max: 150000, qty: 1.5, unit: 'basket' },
  { crop_key: 'monsoon_rice',     name: 'Rice (Nga Sein) (New)',                  region: 'Yangon', marketplace: 'War Tan', min:  65000, max:  69000, qty: 1.5, unit: 'basket' },
  { crop_key: 'monsoon_rice',     name: 'Rice (Shwebo Paw San) (New)',            region: 'Yangon', marketplace: 'War Tan', min: 210000, max: 225000, qty: 1.5, unit: 'basket' },
  { crop_key: 'monsoon_rice',     name: 'Rice (Manaw Thukha) (New)',              region: 'Yangon', marketplace: 'War Tan', min: 195000, max: 205000, qty: 1.5, unit: 'basket' },
  { crop_key: 'monsoon_rice',     name: 'Rice (Hsi Thwe) (New)',                  region: 'Yangon', marketplace: 'War Tan', min: 180000, max: 190000, qty: 1.5, unit: 'basket' },
  { crop_key: 'monsoon_rice',     name: 'Rice (Basamati) (New)',                  region: 'Yangon', marketplace: 'War Tan', min: 500000, max: 530000, qty: 1.5, unit: 'basket' },
  { crop_key: 'monsoon_rice',     name: 'Rice (Kyar Sein) (New)',                 region: 'Yangon', marketplace: 'War Tan', min:  60000, max:  64000, qty: 1.5, unit: 'basket' },
  { crop_key: 'monsoon_rice',     name: 'Rice (Kha Hlan) (New)',                  region: 'Yangon', marketplace: 'War Tan', min:  58000, max:  62000, qty: 1.5, unit: 'basket' },
  { crop_key: 'monsoon_rice',     name: 'Rice (Pae Kyar) (New)',                  region: 'Yangon', marketplace: 'War Tan', min:  56000, max:  60000, qty: 1.5, unit: 'basket' },
  { crop_key: 'dry_season_rice',  name: 'Rice (Yezin Shwe Thwe) (New)',           region: 'Yangon', marketplace: 'War Tan', min: 120000, max: 130000, qty: 1.5, unit: 'basket' },
  { crop_key: 'dry_season_rice',  name: 'Rice (Ayeyar Man) (New)',                region: 'Yangon', marketplace: 'War Tan', min: 110000, max: 120000, qty: 1.5, unit: 'basket' },
  { crop_key: 'dry_season_rice',  name: 'Rice (Hsin Thwe) (New)',                 region: 'Yangon', marketplace: 'War Tan', min:  95000, max: 105000, qty: 1.5, unit: 'basket' },
  { crop_key: 'dry_season_rice',  name: 'Rice (Thwe Yin Aye) (New)',              region: 'Yangon', marketplace: 'War Tan', min: 140000, max: 150000, qty: 1.5, unit: 'basket' },
  { crop_key: 'dry_season_rice',  name: 'Rice (Sin Thwe) (New)',                  region: 'Yangon', marketplace: 'War Tan', min: 160000, max: 170000, qty: 1.5, unit: 'basket' },
  { crop_key: 'dry_season_rice',  name: 'Rice (Thu Kha) (New)',                   region: 'Yangon', marketplace: 'War Tan', min:  70000, max:  75000, qty: 1.5, unit: 'basket' },
  // Pulses
  { crop_key: 'black_gram',       name: 'Black Gram (Grade A)',                   region: 'Mandalay', marketplace: 'Ywama', min:  82000, max:  88000, qty: 1.0, unit: 'viss' },
  { crop_key: 'green_gram',       name: 'Green Gram (Local)',                     region: 'Mandalay', marketplace: 'Ywama', min:  74000, max:  79000, qty: 1.0, unit: 'viss' },
  { crop_key: 'pigeon_pea',       name: 'Pigeon Pea (Whole)',                     region: 'Sagaing',  marketplace: 'Monywa', min: 55000, max: 60000, qty: 1.0, unit: 'viss' },
  // Oilseeds
  { crop_key: 'groundnut',        name: 'Groundnut (Shelled)',                    region: 'Magway',   marketplace: 'Pakokku', min: 66000, max: 72000, qty: 1.0, unit: 'viss' },
  { crop_key: 'sesame',           name: 'Sesame (White)',                         region: 'Magway',   marketplace: 'Pakokku', min: 130000, max: 140000, qty: 1.0, unit: 'viss' },
  // Vegetables / others
  { crop_key: 'chili',            name: 'Chili (Dried, Local)',                   region: 'Bago',     marketplace: 'Shwebo', min: 95000, max: 105000, qty: 1.0, unit: 'viss' },
  { crop_key: 'maize',            name: 'Maize (Yellow)',                         region: 'Shan',     marketplace: 'Taunggyi', min: 28000, max: 32000, qty: 1.0, unit: 'viss' },
  { crop_key: 'tomato',           name: 'Tomato (Round, Fresh)',                  region: 'Yangon',   marketplace: 'Thiri Mingalar', min: 800, max: 1200, qty: 1.0, unit: 'viss' },
  // Fruits
  { crop_key: 'mango',            name: 'Mango (Sein Ta Lone)',                   region: 'Mandalay', marketplace: 'Pyigyidagun', min: 3500, max: 5000, qty: 1.0, unit: 'viss' },
  { crop_key: 'mango',            name: 'Mango (Shwe Hin Tha)',                   region: 'Mandalay', marketplace: 'Pyigyidagun', min: 2000, max: 3000, qty: 1.0, unit: 'viss' },
  { crop_key: 'rubber',           name: 'Rubber (RSS3)',                          region: 'Mon',      marketplace: 'Mawlamyine', min: 4800, max: 5200, qty: 1.0, unit: 'kg' },
  { crop_key: 'sugarcane',        name: 'Sugarcane (Fresh)',                      region: 'Bago',     marketplace: 'Toungoo', min: 45000, max: 52000, qty: 1.0, unit: 'ton' },
];

async function seed() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('✅ Connected to Neon PostgreSQL');

  // First ensure migrations have run (tables exist)
  await client.query(`
    CREATE TABLE IF NOT EXISTS crop_market_prices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      crop_key TEXT,
      commodity_name_raw TEXT NOT NULL,
      variety TEXT,
      region TEXT,
      marketplace TEXT,
      price_min NUMERIC(20, 6),
      price_max NUMERIC(20, 6),
      currency VARCHAR(8) NOT NULL,
      quantity NUMERIC(20, 6) NOT NULL CHECK (quantity > 0),
      unit TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_date DATE NOT NULL,
      source_url TEXT NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL,
      raw_payload JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (price_min IS NOT NULL OR price_max IS NOT NULL)
    )
  `);
  console.log('✅ Table crop_market_prices ready');

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      await client.query(
        `INSERT INTO crop_market_prices
           (crop_key, commodity_name_raw, region, marketplace,
            price_min, price_max, currency, quantity, unit,
            source_name, source_date, source_url, fetched_at, raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT DO NOTHING`,
        [
          row.crop_key,
          row.name,
          row.region,
          row.marketplace,
          row.min,
          row.max,
          'MMK',
          row.qty,
          row.unit,
          'Wisarra',
          TODAY,
          'https://www.wisarra.com/en/price',
          new Date().toISOString(),
          JSON.stringify({ seed: true }),
        ],
      );
      inserted++;
      console.log(`  ✓ ${row.name}`);
    } catch (err) {
      skipped++;
      console.log(`  ⚠ skipped (conflict): ${row.name} — ${err.message}`);
    }
  }

  console.log(`\n🌾 Done — ${inserted} inserted, ${skipped} skipped.`);
  await client.end();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
