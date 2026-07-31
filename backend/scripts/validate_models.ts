import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ManifestFileSchema } from '../src/schemas/manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function validate() {
  const manifestPath = path.resolve(__dirname, '../../backend/models/manifest.json');
  console.log(`Validating manifest at: ${manifestPath}`);
  
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest file not found at ${manifestPath}`);
    process.exit(1);
  }

  try {
    const rawData = fs.readFileSync(manifestPath, 'utf8');
    const jsonData = JSON.parse(rawData);
    
    ManifestFileSchema.parse(jsonData);
    
    console.log(`✅ Success: Manifest is valid. Found ${jsonData.models.length} models.`);
  } catch (error) {
    console.error("❌ Validation Failed:");
    console.error(error);
    process.exit(1);
  }
}

validate();
