import fs from "fs";
import path from "path";

export function loadClinic(clinicId) {
  const file = path.join(process.cwd(), "src/god/data/clinics", clinicId, "clinic.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
