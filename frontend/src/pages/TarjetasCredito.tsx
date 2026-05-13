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

type Totales = { amex: number; banorte: number };

type SubSeccion = {
  key: "amex_padel" | "amex_aceromax" | "banorte_padel" | "banorte_aceromax";
  titulo: string;
  color: string;
};

const fmt = (n: number) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TarjetasCredito() {
  const [datos, setDatos] = useState<Concepto[]>([]);
  const [totales, setTotales] = useState<Totales>({ amex: 0, banorte: 0 });
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setErrorCarga(null);
    try {
      const [rConceptos, rTotales] = await Promise.all([
        api.get("/api/tarjetas"),
        api.get("/api/tarjetas/totales"),
      ]);
      setDatos(rConceptos.data || []);
      setTotales(rTotales.data || { amex: 0, banorte: 0 });
    } catch (err: any) {
      const code = err.response?.status;
      if (code === 403) setErrorCarga("Solo administradores pueden ver esta sección.");
      else if (code === 404) setErrorCarga("Endpoint /api/tarjetas no existe. Backend aún no se redespliega - espera ~2 min.");
      else if (!err.response) setErrorCarga("No se pudo contactar al backend. Probable: backend reiniciándose o falta correr migrate_tarjetas.sql.");
      else setErrorCarga(`Error ${code}: ${err.response?.data?.detail || err.message}`);
      setDatos([]);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const sumaSeccion = (seccion: string) =>
    datos.filter((d) => d.seccion === seccion).reduce((a, c) => a + c.monto, 0);

  const gastosAmex = sumaSeccion("amex_padel") + sumaSeccion("amex_aceromax");
  const gastosBanorte = sumaSeccion("banorte_padel") + sumaSeccion("banorte_aceromax");
  const saldoAmex = totales.amex - gastosAmex;
  const saldoBanorte = totales.banorte - gastosBanorte;

  return (
    <Layout title="Tarjetas de crédito · Control de gastos">
      {errorCarga && (
        <div style={{
          background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b",
          padding: "10px 14px", borderRadius: 6, marginBottom: 12, fontSize: 13,
        }}>
          <strong>No se pudieron cargar las tarjetas.</strong> {errorCarga}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <TarjetaCard
          tarjeta="amex"
          titulo="AMEX"
          colorHeader="#0f172a"
          total={totales.amex}
          gastos={gastosAmex}
          saldoPendiente={saldoAmex}
          subSecciones={[
            { key: "amex_padel",    titulo: "Padel",    color: "#0ea5e9" },
            { key: "amex_aceromax", titulo: "Aceromax", color: "#475569" },
          ]}
          datos={datos}
          onChange={cargar}
        />

        <TarjetaCard
          tarjeta="banorte"
          titulo="Banorte"
          colorHeader="#dc2626"
          total={totales.banorte}
          gastos={gastosBanorte}
          saldoPendiente={saldoBanorte}
          subSecciones={[
            { key: "banorte_padel",    titulo: "Padel",    color: "#0ea5e9" },
            { key: "banorte_aceromax", titulo: "Aceromax", color: "#b91c1c" },
          ]}
          datos={datos}
          onChange={cargar}
        />
      </div>

      {cargando && <p style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 8 }}>Cargando...</p>}
    </Layout>
  );
}


function TarjetaCard({
  tarjeta, titulo, colorHeader, total, gastos, saldoPendiente, subSecciones, datos, onChange,
}: {
  tarjeta: "amex" | "banorte";
  titulo: string;
  colorHeader: string;
  total: number;
  gastos: number;
  saldoPendiente: number;
  subSecciones: SubSeccion[];
  datos: Concepto[];
  onChange: () => void;
}) {
  const [editandoTotal, setEditandoTotal] = useState(false);
  const [draftTotal, setDraftTotal] = useState("");

  async function guardarTotal() {
    const n = +draftTotal;
    if (isNaN(n) || n < 0) { setEditandoTotal(false); return; }
    try {
      await api.put(`/api/tarjetas/totales/${tarjeta}`, { total: n });
      setEditandoTotal(false);
      onChange();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header con totales */}
      <div style={{
        background: colorHeader, color: "white", padding: "14px 18px",
        display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 24, alignItems: "center",
      }}>
        <strong style={{ fontSize: 18, letterSpacing: "0.04em" }}>{titulo}</strong>

        <DatoHeader
          label="TOTAL DEUDA"
          valor={total}
          editable
          editando={editandoTotal}
          onEditar={() => { setDraftTotal(String(total)); setEditandoTotal(true); }}
          draft={draftTotal}
          onChangeDraft={setDraftTotal}
          onGuardar={guardarTotal}
          onCancelar={() => setEditandoTotal(false)}
        />

        <DatoHeader label="GASTOS NEGOCIOS" valor={gastos} />

        <DatoHeader
          label="SALDO PENDIENTE"
          valor={saldoPendiente}
          color={saldoPendiente < 0 ? "#fecaca" : "white"}
        />
      </div>

      {/* Sub-secciones lado a lado */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        {subSecciones.map((s, i) => (
          <div key={s.key} style={{ borderLeft: i > 0 ? "1px solid #e5e7eb" : "none" }}>
            <SubPanel
              sub={s}
              datos={datos.filter((d) => d.seccion === s.key)}
              onChange={onChange}
            />
          </div>
        ))}
      </div>
    </div>
  );
}


function DatoHeader({
  label, valor, color, editable, editando, onEditar, draft, onChangeDraft, onGuardar, onCancelar,
}: {
  label: string;
  valor: number;
  color?: string;
  editable?: boolean;
  editando?: boolean;
  onEditar?: () => void;
  draft?: string;
  onChangeDraft?: (v: string) => void;
  onGuardar?: () => void;
  onCancelar?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 140 }}>
      <span style={{ fontSize: 10, opacity: 0.7, letterSpacing: "0.05em" }}>{label}</span>
      {editando ? (
        <input
          autoFocus
          type="number"
          step="0.01"
          value={draft}
          onChange={(e) => onChangeDraft?.(e.target.value)}
          onBlur={onGuardar}
          onKeyDown={(e) => { if (e.key === "Enter") onGuardar?.(); if (e.key === "Escape") onCancelar?.(); }}
          style={{
            background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.4)",
            padding: "4px 6px", fontSize: 16, fontWeight: 700, width: 140, textAlign: "right",
          }}
        />
      ) : (
        <span
          onDoubleClick={editable ? onEditar : undefined}
          title={editable ? "Doble click para editar" : undefined}
          style={{
            fontSize: 18, fontWeight: 700, color: color || "white",
            cursor: editable ? "pointer" : "default",
            textDecoration: editable ? "underline dotted rgba(255,255,255,0.4)" : "none",
          }}
        >
          {fmt(valor)}
        </span>
      )}
    </div>
  );
}


function SubPanel({ sub, datos, onChange }: {
  sub: SubSeccion;
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
      const code = err.response?.status;
      const body = err.response?.data?.detail || err.response?.data || err.message;
      alert(`Error${code ? " " + code : ""}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    }
  }

  async function crear() {
    if (!draft.concepto.trim()) return;
    try {
      await api.post("/api/tarjetas", { seccion: sub.key, concepto: draft.concepto, monto: draft.monto });
      setDraft({ concepto: "", monto: 0 });
      setAgregando(false);
      onChange();
    } catch (err: any) {
      const code = err.response?.status;
      const body = err.response?.data?.detail || err.response?.data || err.message;
      alert(`Error${code ? " " + code : ""}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
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
    <div style={{ padding: 12 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: sub.color, color: "white", padding: "6px 10px", borderRadius: 4, marginBottom: 6,
      }}>
        <strong style={{ fontSize: 12, letterSpacing: "0.04em" }}>{sub.titulo}</strong>
        <strong style={{ fontSize: 13 }}>{fmt(total)}</strong>
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
              <td colSpan={3} style={{ ...td, textAlign: "center", color: "var(--color-text-muted)", padding: 10 }}>
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
                  style={{ background: "transparent", border: "1px dashed #9ca3af", padding: "3px 12px",
                    borderRadius: 4, cursor: "pointer", fontSize: 11, color: "#6b7280" }}>
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
  padding: "5px 8px",
  textAlign: "left",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#1f2937",
  borderBottom: "1px solid #e5e7eb",
};

const td: React.CSSProperties = {
  padding: "5px 8px",
  borderBottom: "1px solid #f1f5f9",
};
