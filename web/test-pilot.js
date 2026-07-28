import { loadPilotBundle } from "./app/lib/pilot-data.js";
try {
  const data = loadPilotBundle("ayeyawaddy");
  console.log("Success:", data.meta.region);
} catch (e) {
  console.error("Error:", e);
}
