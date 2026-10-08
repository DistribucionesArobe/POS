import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Pendientes = {
  n_tickets: number;
  total_subtotal: number; total_iva: number; total: number;
  tickets: { id: number; folio: string; fecha: string | null;
             subtotal: number; iva: number; total: number }[];
};
type Historial = {
  id: number; folio: string; fecha: string;
  total: number; n_tickets: number;
  periodo: string | null; notas: string | null; uuid: string | null;
};

const fmt = (n: number) => "$" + (n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("es-MX") : "-";
const hoyISO = () => new Date().toISOString().slice(0, 10);

const PERIODICIDAD = [
  { v: "01", label: "Diario" },
  { v: "02", label: "Semanal" },
  { v: "03", label: "Quincenal" },
  { v: "04", label: "Mensual" },
  { v: "05", label: "Bimestral" },
];

export default function FacturaGlobal() {
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [periodicidad, setPeriodicidad] = useState("01");  // diario
  const [pendientes, setPendientes] = useState<Pendientes | null>(null);
  const [historial, setHistorial] = useState<Historial[]>([]);
  const [loading, setLoading] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargarPendientes() {
    setLoading(true); setError(null);
    try {
      const r = await api.get("/api/factura-global/pendientes", {
        params: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
      });
      setPendientes(r.data);
    } catch (e: any) { setError(e.response?.data?.detail || e.message); }
    finally { setLoading(false); }
  }
  async function cargarHistorial() {
    try {
      const r = await api.get("/api/factura-global/historial");
      setHistorial(r.data);
    } catch { /* silent */ }
  }
  useEffect(() => { cargarPendientes(); cargarHistorial(); }, [fechaInicio, fechaFin]);

  async function generar() {
    if (!pendientes || pendientes.n_tickets === 0) {
      alert("No hay tickets pendientes en el rango");
      return;
    }
    const d = new Date(fechaFin + "T12:00:00");
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const anio = d.getFullYear();

    if (!confirm(
      `Vas a generar FACTURA GLOBAL que ampara ${pendientes.n_tickets} tickets:\n\n` +
      `Rango: ${fechaInicio} al ${fechaFin}\n` +
      `Periodicidad: ${PERIODICIDAD.find(p => p.v === periodicidad)?.label}\n` +
      `Total: ${fmt(pendientes.total)}\n\n` +
      `Se emitira un CFDI a PUBLICO EN GENERAL.\n` +
      `Los tickets quedaran marcados como facturados (no se podran incluir en otra FG).\n\n` +
      `¿Confirmas?`
    )) return;

    setGenerando(true); setError(null); setMsg(null);
    try {
      const r = await api.post("/api/factura-global/generar", {
        fecha_inicio: fechaInicio, fecha_fin: fechaFin,
        periodicidad, mes, anio,
      });
      setMsg(`✅ Factura global ${r.data.folio} generada. UUID: ${r.data.uuid}`);
      cargarPendientes(); cargarHistorial();
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally { setGenerando(false); }
  }

  function setRangoRapido(tipo: "hoy" | "ayer" | "semana" | "mes_actual" | "mes_pasado") {
    const h = new Date(); let i: Date, f: Date;
    switch (tipo) {
      case "hoy": i = f = h; break;
      case "ayer":
        i = new Date(h); i.setDate(h.getDate() - 1); f = i; break;
      case "semana":
        f = h; i = new Date(h); i.setDate(h.getDate() - 7); break;
      case "mes_actual":
        i = new Date(h.getFullYear(), h.getMonth(), 1);
        f = h; break;
      case "mes_pasado":
        i = new Date(h.getFullYear(), h.getMonth() - 1, 1);
        f = new Date(h.getFullYear(), h.getMonth(), 0); break;
    }
    setFechaInicio(i.toISOString().slice(0, 10));
    setFechaFin(f.toISOString().slice(0, 10));
    // Sugerir periodicidad
    if (tipo === "hoy" || tipo === "ayer") setPeriodicidad("01");
    else if (tipo === "semana") setPeriodicidad("02");
    else if (tipo === "mes_actual" || tipo === "mes_pasado") setPeriodicidad("04");
  }

  return (
    <Layout title="Factura Global" subtitle="Agrupa tickets de mostrador en 1 CFDI al público en general">
      {msg && <div style={{ background: "#dcfce7", color: "#065f46", padding: 12, borderRadius: 6, marginBottom: 12 }}>{msg}</div>}
      {error && <div style={{ background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 6, marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <strong style={{ fontSize: 13, color: "#64748b", alignSelf: "center" }}>Rango rápido:</strong>
          {([["hoy","Hoy"],["ayer","Ayer"],["semana","Últimos 7 días"],["mes_actual","Mes actual"],["mes_pasado","Mes pasado"]] as const).map(([k,label]) => (
            <button key={k} onClick={() => setRangoRapido(k)}
              style={{ background: "#e2e8f0", color: "#0f172a", border: 0,
                padding: "6px 12px", borderRadius: 4, fontSize: 12, cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Desde</label>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
              style={{ display: "block", padding: 8, border: "1px solid #cbd5e1", borderRadius: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Hasta</label>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)}
              style={{ display: "block", padding: 8, border: "1px solid #cbd5e1", borderRadius: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Periodicidad SAT</label>
            <select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)}
              style={{ display: "block", padding: 8, border: "1px solid #cbd5e1", borderRadius: 4 }}>
              {PERIODICIDAD.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}
            </select>
          </div>
          <button onClick={generar} disabled={generando || !pendientes || pendientes.n_tickets === 0}
            style={{ background: generando || !pendientes?.n_tickets ? "#94a3b8" : "#059669",
              color: "white", border: 0, padding: "10px 20px", borderRadius: 6, fontSize: 14, fontWeight: 700,
              cursor: generando || !pendientes?.n_tickets ? "not-allowed" : "pointer", marginLeft: "auto" }}>
            {generando ? "Generando..." : "📄 Generar Factura Global"}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 20 }}>Cargando tickets...</div>
      ) : pendientes && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
            <MiniCard label="Tickets a facturar" valor={pendientes.n_tickets.toString()} />
            <MiniCard label="Subtotal" valor={fmt(pendientes.total_subtotal)} />
            <MiniCard label="IVA" valor={fmt(pendientes.total_iva)} />
            <MiniCard label="Total a facturar" valor={fmt(pendientes.total)} color="#059669" />
          </div>

          {pendientes.n_tickets > 0 ? (
            <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ padding: "10px 14px", background: "#f8fafc", fontWeight: 700, borderBottom: "1px solid #e2e8f0" }}>
                Tickets incluidos ({pendientes.n_tickets})
              </div>
              <div style={{ maxHeight: 300, overflow: "auto" }}>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                      <th style={th}>Folio</th>
                      <th style={th}>Fecha</th>
                      <th style={{ ...th, textAlign: "right" }}>Subtotal</th>
                      <th style={{ ...th, textAlign: "right" }}>IVA</th>
                      <th style={{ ...th, textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendientes.tickets.map(t => (
                      <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={td}>{t.folio}</td>
                        <td style={td}>{t.fecha ? new Date(t.fecha).toLocaleString("es-MX") : "-"}</td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(t.subtotal)}</td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#64748b" }}>{fmt(t.iva)}</td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmt(t.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "#64748b", marginBottom: 20 }}>
              Sin tickets pendientes en el rango seleccionado
            </div>
          )}
        </>
      )}

      {/* Historial */}
      <h3 style={{ marginTop: 20, marginBottom: 10 }}>Facturas globales generadas</h3>
      {historial.length === 0 ? (
        <div className="card" style={{ padding: 20, textAlign: "center", color: "#64748b" }}>
          Sin facturas globales todavía
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={th}>Folio</th>
                <th style={th}>Fecha</th>
                <th style={{ ...th, textAlign: "right" }}>Tickets</th>
                <th style={{ ...th, textAlign: "right" }}>Total</th>
                <th style={th}>Periodo</th>
                <th style={th}>UUID</th>
              </tr>
            </thead>
            <tbody>
              {historial.map(h => (
                <tr key={h.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ ...td, fontWeight: 700 }}>{h.folio}</td>
                  <td style={td}>{fmtDate(h.fecha)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{h.n_tickets}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmt(h.total)}</td>
                  <td style={{ ...td, fontSize: 11 }}>{h.periodo || "-"}</td>
                  <td style={{ ...td, fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>{h.uuid?.slice(0, 18)}...</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13 };

function MiniCard({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div style={{ background: "white", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: color || "#0f172a", fontVariantNumeric: "tabular-nums" }}>{valor}</div>
    </div>
  );
}
