import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Activo = {
  id: number;
  categoria: string;
  col1: string | null;
  col2: string | null;
  col3: string | null;
  orden: number;
};

type Cat = {
  key: "vehiculo" | "gasolina" | "comapa";
  titulo: string;
  cols: { campo: "col1" | "col2" | "col3"; label: string; placeholder: string; ancho?: string }[];
};

const CATEGORIAS: Cat[] = [
  {
    key: "vehiculo",
    titulo: "Vehículos",
    cols: [
      { campo: "col1", label: "Vehículo", placeholder: "ej. Tacoma" },
      { campo: "col2", label: "Placa",   placeholder: "ej. WG6291C" },
      { campo: "col3", label: "Serie",   placeholder: "ej. 36398" },
    ],
  },
  {
    key: "gasolina",
    titulo: "Gasolina",
    cols: [
      { campo: "col1", label: "Nombre",  placeholder: "ej. JORGE" },
      { campo: "col2", label: "Tarjeta", placeholder: "ej. 2618" },
    ],
  },
  {
    key: "comapa",
    titulo: "Comapa",
    cols: [
      { campo: "col1", label: "Concepto", placeholder: "ej. agua casa" },
      { campo: "col2", label: "Número",   placeholder: "ej. 688167" },
    ],
  },
];

export default function Activos() {
  const [datos, setDatos] = useState<Activo[]>([]);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    try {
      const r = await api.get("/api/activos");
      setDatos(r.data || []);
    } catch (err: any) {
      if (err.response?.status === 403) {
        alert("Solo administradores pueden ver Activos.");
      }
      setDatos([]);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <Layout title="Activos · Datos internos del negocio">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <SeccionActivos cat={CATEGORIAS[0]} datos={datos.filter((d) => d.categoria === "vehiculo")} onChange={cargar} />
        <SeccionActivos cat={CATEGORIAS[1]} datos={datos.filter((d) => d.categoria === "gasolina")} onChange={cargar} />
        <div style={{ gridColumn: "1 / span 2" }}>
          <SeccionActivos cat={CATEGORIAS[2]} datos={datos.filter((d) => d.categoria === "comapa")} onChange={cargar} />
        </div>
      </div>

      {cargando && (
        <p style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 8 }}>Cargando...</p>
      )}
    </Layout>
  );
}


function SeccionActivos({ cat, datos, onChange }: { cat: Cat; datos: Activo[]; onChange: () => void }) {
  const [editing, setEditing] = useState<{ id: number; campo: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [agregando, setAgregando] = useState(false);

  async function guardar(a: Activo) {
    if (!editing) return;
    try {
      await api.patch(`/api/activos/${a.id}`, { [editing.campo]: editValue });
      setEditing(null);
      onChange();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function crear() {
    const algunoLleno = cat.cols.some((c) => (draft[c.campo] || "").trim());
    if (!algunoLleno) return;
    try {
      await api.post("/api/activos", { categoria: cat.key, ...draft });
      setDraft({});
      setAgregando(false);
      onChange();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function borrar(id: number) {
    if (!confirm("Borrar este registro?")) return;
    try {
      await api.delete(`/api/activos/${id}`);
      onChange();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 className="card-header" style={{ margin: 0 }}>{cat.titulo}</h3>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          {datos.length} registro(s) · doble click para editar
        </span>
      </div>

      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f3f4f6" }}>
            {cat.cols.map((c) => (
              <th key={c.campo} style={th}>{c.label}</th>
            ))}
            <th style={{ ...th, width: 32 }}></th>
          </tr>
        </thead>
        <tbody>
          {datos.length === 0 && !agregando && (
            <tr>
              <td colSpan={cat.cols.length + 1} style={{ ...td, textAlign: "center", color: "var(--color-text-muted)", padding: 12 }}>
                Sin registros. Click "+ Agregar".
              </td>
            </tr>
          )}
          {datos.map((a) => (
            <tr key={a.id}>
              {cat.cols.map((c) => {
                const val = (a as any)[c.campo] || "";
                const enEdicion = editing?.id === a.id && editing.campo === c.campo;
                return (
                  <td
                    key={c.campo}
                    style={{ ...td, cursor: "pointer" }}
                    onDoubleClick={() => { setEditing({ id: a.id, campo: c.campo }); setEditValue(val); }}
                  >
                    {enEdicion ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => guardar(a)}
                        onKeyDown={(e) => { if (e.key === "Enter") guardar(a); if (e.key === "Escape") setEditing(null); }}
                        style={{ width: "100%", padding: 4, fontSize: 13 }}
                      />
                    ) : (val || <span style={{ color: "#9ca3af" }}>—</span>)}
                  </td>
                );
              })}
              <td style={td}>
                <button onClick={() => borrar(a.id)}
                  style={{ background: "transparent", border: 0, color: "#dc2626", cursor: "pointer", fontSize: 16 }}>×</button>
              </td>
            </tr>
          ))}
          {agregando && (
            <tr style={{ background: "#fef9c3" }}>
              {cat.cols.map((c) => (
                <td key={c.campo} style={td}>
                  <input
                    autoFocus={c.campo === "col1"}
                    value={draft[c.campo] || ""}
                    placeholder={c.placeholder}
                    onChange={(e) => setDraft({ ...draft, [c.campo]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") crear(); if (e.key === "Escape") { setAgregando(false); setDraft({}); } }}
                    style={{ width: "100%", padding: 4, fontSize: 13 }}
                  />
                </td>
              ))}
              <td style={td}>
                <button onClick={crear}
                  style={{ background: "var(--color-primary)", color: "white", border: 0, padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>✓</button>
              </td>
            </tr>
          )}
          <tr>
            <td colSpan={cat.cols.length + 1} style={{ padding: 6, textAlign: "center", borderTop: "1px solid #e5e7eb" }}>
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

const th: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "left",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#475569",
  borderBottom: "1px solid #e5e7eb",
};

const td: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #f1f5f9",
};
