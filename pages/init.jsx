import { useState } from "react";

export default function InitClinic() {
  const [form, setForm] = useState({
    id: "",
    name: "",
    address: "",
    phone: "",
    email: "",
    director: "",
    owner: "",
    rooms: "",
    treatments: "",
    hours: "",
    logo: ""
  });

  const update = (k, v) => setForm({ ...form, [k]: v });

  const submit = async () => {
    const res = await fetch("/api/clinic/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        treatments: form.treatments.split(",").map(t => t.trim())
      })
    });

    const out = await res.json();
    alert("Clinica configurata: " + JSON.stringify(out));
  };

  return (
    <div style={{ padding: 40, maxWidth: 600, margin: "0 auto" }}>
      <h1>Configura la tua Clinica</h1>

      {[
        ["id", "ID Clinica (es: agora)"],
        ["name", "Nome Clinica"],
        ["address", "Indirizzo"],
        ["phone", "Telefono"],
        ["email", "Email"],
        ["director", "Direttore Sanitario"],
        ["owner", "Titolare / CEO"],
        ["rooms", "Numero Stanze"],
        ["treatments", "Trattamenti (separati da virgola)"],
        ["hours", "Orari di apertura"]
      ].map(([k, label]) => (
        <div key={k} style={{ marginBottom: 15 }}>
          <label>{label}</label>
          <input
            style={{ width: "100%", padding: 8 }}
            value={form[k]}
            onChange={e => update(k, e.target.value)}
          />
        </div>
      ))}

      <div style={{ marginBottom: 15 }}>
        <label>Logo (base64)</label>
        <input
          style={{ width: "100%", padding: 8 }}
          value={form.logo}
          onChange={e => update("logo", e.target.value)}
        />
      </div>

      <button onClick={submit} style={{ padding: 12, width: "100%" }}>
        Salva e Avvia Operantis
      </button>
    </div>
  );
}
