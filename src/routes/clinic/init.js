import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo non consentito" });
  }

  try {
    const data = req.body;

    if (!data.id) {
      return res.status(400).json({ error: "Manca clinic_id" });
    }

    const folder = path.join(process.cwd(), "src/god/data/clinics", data.id);

    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }

    const filePath = path.join(folder, "clinic.json");
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    console.log("🏥 Clinica salvata:", data.name);
    return res.status(200).json({ ok: true, saved: filePath });

  } catch (err) {
    console.error("❌ Errore init:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
