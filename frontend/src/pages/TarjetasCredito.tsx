import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Concepto = {
  id: number;
  seccion: string;
  concepto: string;
  monto: number;
  orden: number;
};

type SeccionDef = {
  key: "amex_negocios" | "amex_reembolsos" | "banorte_padel" | "banorte_aceromax";
  titulo: string;
  subtitulo?: string;
  color: string;
};

const SECCIONES: SeccionDef[] = [
  { key: "amex_negocios",    titulo: "AMEX",      subtitulo: "Negocios",              color: "#0f172a" },
  { key: "amex_reembolsos",  titulo: "AMEX",      subtitulo: "Reembolsos personales", color: "#475569" },
  { key: "banorte_padel",    titulo: "Banorte",   subtitulo: "Gastos Padel",          color: "#b91c1c" },
  { key: "banorte_aceromax", titulo: "Banorte",   subtitulo: "Aceromax",              color: "#dc2626" },
];

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TarjetasCredito() {
  const [datos, setDatos] = useState<Concepto[]>([]);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    try {
      const r = await api.get("/api/tarjetas");
      setDatos(r.data || []);
    } catch (err: any) {
      if (err.response?.status === 403) {
        alert("Solo administradores.");
      }
      setDatos([]);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const totalAmex = datos
    .filter((d) => d.seccion === "amex_negocios" || d.seccion === "amex_reembolsos")
    .reduce((a, c) => a + c.monto, 0);
  const totalBanorte = datos
    .filter((d) => d.seccion === "banorte_padel" || d.seccion === "banorte_aceromax")
    .reduce((a, c) => a + c.monto, 0);
  const totalGlobal = totalAmex + totalBanorte;

  return (
    <Layout title="Tarjetas de crédito · Control de gastos">
      {/* Resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <ResumenChip label="TOTAL AMEX"    valor={totalAmex}    color="#0f172a" />
        <ResumenChip label="TOTAL BANORTE" valor={totalBanorte} color="#dc2626" />
        <ResumenChip label="TOTAL GENERAL" valor={totalGlobal}  color="#1e40af" />
      </div>

      {/* Layout: 3 columnas - AMEX (stack) | Banorte Padel | Banorte Aceromax */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SeccionPanel def={SECCIONES[0]} datos={datos.filter((d) => d.seccion === "amex_negocios")} onChange={cargar} />
          <SeccionPanel def={SECCIONES[1]} datos={datos.filter((d) => d.seccion === "amex_reembolsos")} onChange={cargar} />
        </div>
        <SeccionPanel def={SECCIONES[2]} datos={datos.filter((d) => d.seccion === "banorte_padel")} onChange={cargar} />
        <SeccionPanel def={SECCIONES[3]} datos={datos.filter((d) => d.seccion === "banorte_aceromax")} onChange={cargar} />
      </div>

      {cargando && (
        <p style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 8 }}>Cargando...</p>
      )}
    </Layout>
  );
}


function ResumenChip({ label, valor, color }: { label: string; valor: number; color: string }) {
  return (
    <div style={{
      background: color, color: "white", padding: "12px 16px", borderRadius: 8,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ fontSize: 11, opacity: 0.8, letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 700 }}>{fmt(valor)}</span>
    </div>
  );
}


function SeccionPanel({ def, datos, onChange }: {
  def: SeccionDef;
  datos: Concepto[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<{ id: number; campo: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [draft, setDraft] = useState({ concepto: "", monto: 0 });
  const [agregando, setAgregando] = useState(false);

  const total = datos.reduce((a, c) => a + c.monto, 0);

  async function guardar(c: Concepto) {
    if (!editing) return;
    const payload: any = {};
    if (editing.campo === "concepto") payload.concepto = editValue;
    if (editing.campo === "monto") {
      const n = +editValue;
      if (isNaN(n) || n < 0) return alert("Monto inválido");
      payload.monto = n;
    }
    try {
      await api.patch(`/api/tarjetas/${c.id}`, payload);
      setEditing(null);
      onChange();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function crear() {
    if (!draft.concepto.trim()) return;
    try {
      await api.post("/api/tarjetas", {
        seccion: def.key,
        concepto: draft.concepto,
        monto: draft.monto,
      });
      setDraft({ concepto: "", monto: 0 });
      setAgregando(false);
      onChange();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function borrar(id: number) {
    if (!confirm("Borrar este concepto?")) return;
    try {
      await api.delete(`/api/tarjetas/${id}`);
      onChange();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{
        background: def.color, color: "white", padding: "10px 14px", borderRadius: 6,
        display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8,
      }}>
        <div>
          <strong style={{ fontSize: 14 }}>{def.titulo}</strong>
          {def.subtitulo && (
            <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }}>{def.subtitulo}</span>
          )}
        </div>
        <strong style={{ fontSize: 14 }}>{fmt(total)}</strong>
      </div>

      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#fef9c3" }}>
            <th style={{ ...thBlack, textAlign: "right", width: "40%" }}>Monto</th>
            <th style={thBlack}>Concepto</th>
            <th style={{ ...thBlack, width: 28 }}></th>
          </tr>
        </thead>
        <tbody>
          {datos.length === 0 && !agregando && (
            <tr>
              <td colSpan={3} style={{ ...td, textAlign: "center", color: "var(--color-text-muted)", padding: 12 }}>
                Sin movimientos
              </td>
            </tr>
          )}
          {datos.map((c) => (
            <tr key={c.id}>
              <td style={{ ...td, textAlign: "right", fontWeight: 600, cursor: "pointer" }}
                onDoubleClick={() => { setEditing({ id: c.id, campo: "monto" }); setEditValue(String(c.monto)); }}
                title="Doble click para editar">
                {editing?.id === c.id && editing.campo === "monto" ? (
                  <input autoFocus type="number" step="0.01" value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => guardar(c)}
                    onKeyDown={(e) => { if (e.key === "Enter") guardar(c); if (e.key === "Escape") setEditing(null); }}
                    style={{ width: "100%", padding: 4, fontSize: 12, textAlign: "right" }} />
                ) : fmt(c.monto)}
              </td>
              <td style={{ ...td, cursor: "pointer" }}
                onDoubleClick={() => { setEditing({ id: c.id, campo: "concepto" }); setEditValue(c.concepto); }}
                title="Doble click para editar">
                {editing?.id === c.id && editing.campo === "concepto" ? (
                  <input autoFocus value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => guardar(c)}
                    onKeyDown={(e) => { if (e.key === "Enter") guardar(c); if (e.key === "Escape") setEditing(null); }}
                    style={{ width: "100%", padding: 4, fontSize: 12 }} />
                ) : c.concepto}
              </td>
              <td style={td}>
                <button onClick={() => borrar(c.id)}
                  style={{ background: "transparent", border: 0, color: "#dc2626", cursor: "pointer", fontSize: 14 }}>×</button>
              </td>
            </tr>
          ))}
          {agregando && (
            <tr style={{ background: "#fef9c3" }}>
              <td style={td}>
                <input type="number" step="0.01" value={draft.monto}
                  onChange={(e) => setDraft({ ...draft, monto: +e.target.value })}
                  placeholder="0.00" style={{ width: "100%", padding: 4, fontSize: 12, textAlign: "right" }} />
              </td>
              <td style={td}>
                <input value={draft.concepto} autoFocus
                  onChange={(e) => setDraft({ ...draft, concepto: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") crear(); if (e.key === "Escape") { setAgregando(false); setDraft({ concepto: "", monto: 0 }); } }}
                  placeholder="ej. walmart" style={{ width: "100%", padding: 4, fontSize: 12 }} />
              </td>
              <td style={td}>
                <button onClick={crear}
                  style={{ background: "var(--color-primary)", color: "white", border: 0, padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>✓</button>
              </td>
            </tr>
          )}
          <tr>
            <td colSpan={3} style={{ padding: 6, textAlign: "center", borderTop: "1px solid #e5e7eb" }}>
              {!agregando && (
                <button onClick={() => setAgregando(true)}
                  style={{ background: "transparent", border: "1px dashed #9ca3af", padding: "4px 14px",
                    borderRadius: 4, cursor: "pointer", fontSize: 12, color: "#6b7280" }}>
                  + Agregar
                </button>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}


const thBlack: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "left",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#1f2937",
  borderBottom: "1px solid #e5e7eb",
};

const td: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #f1f5f9",
};
