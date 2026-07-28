import fs from "fs";
import path from "path";

// Mock parse function just to see if file loads
function loadPilotBundle(region = "ayeyawaddy") {
  const normalizedRegion = region.toLowerCase();
  const baseDir = "/Users/phyomyatmin/Desktop/myanmar-agri-geo-csv-pipeline";
  let filePath = path.join(baseDir, "data", "output", `pilot_${normalizedRegion}_2018_01.json`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Data for region ${region} not found. Path checked: ${filePath}`);
  }
  
  const rawBundle = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  console.log(`Loaded ${region} successfully. Cells: ${rawBundle.cells.length}`);
}

loadPilotBundle("ayeyawaddy");
loadPilotBundle("magway");
loadPilotBundle("sagaing");
loadPilotBundle("mandalay");
