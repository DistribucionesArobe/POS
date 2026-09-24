import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Pago = {
  id: number;
  fecha_pago: string;
  alumno_nombre: string;
  padres_nombre: string | null;
  telefono: string | null;
  monto_pagado: number;
  fecha_proximo_pago: string | null;
  deporte: string;
  notas: string | null;
};

const fmtMoney = (n: number) => "$" + (n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" }) : "-";

function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const f = new Date(fecha + "T00:00:00");
  return Math.floor((f.getTime() - hoy.getTime()) / (86400_000));
}

export default function Academia() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroDeporte, setFiltroDeporte] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Pago | null>(null);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);

  async function cargar() {
    setLoading(true); setError(null);
    try {
      const r = await api.get("/api/academia", { params: filtroDeporte ? { deporte: filtroDeporte } : {} });
      setPagos(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally { setLoading(false); }
  }

  useEffect(() => { cargar(); }, [filtroDeporte]);

  const filtrados = useMemo(() => {
    if (!busqueda.trim()) return pagos;
    const q = busqueda.toLowerCase();
    return pagos.filter(p =>
      p.alumno_nombre.toLowerCase().includes(q) ||
      (p.padres_nombre || "").toLowerCase().includes(q) ||
      (p.telefono || "").includes(q)
    );
  }, [pagos, busqueda]);

  async function borrar(id: number, alumno: string) {
    if (!confirm(`Eliminar el pago de "${alumno}"?`)) return;
    try {
      await api.delete(`/api/academia/${id}`);
      cargar();
    } catch (e: any) {
      alert("Error: " + (e.response?.data?.detail || e.message));
    }
  }

  const totalCobrado = filtrados.reduce((s, p) => s + (p.monto_pagado || 0), 0);
  const sinPago = filtrados.filter(p => (p.monto_pagado || 0) === 0).length;

  return (
    <Layout title="Academia" subtitle="Registro de pagos de alumnos"
      actions={
        <button onClick={() => setMostrarNuevo(true)}
          style={{ background: "#059669", color: "white", border: 0,
            padding: "10px 18px", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          + Nuevo pago
        </button>
      }>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 6, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input placeholder="Buscar por alumno, padre/madre, telefono..."
          value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          style={{ flex: 1, minWidth: 240, padding: "8px 12px", fontSize: 14,
            border: "1px solid #cbd5e1", borderRadius: 6 }} />
        <select value={filtroDeporte} onChange={(e) => setFiltroDeporte(e.target.value)}
          style={{ padding: "8px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 6 }}>
          <option value="">Todos los deportes</option>
          <option value="futbol">Solo futbol</option>
          <option value="padel">Solo padel</option>
        </select>
      </div>

      {/* Resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
        <MiniCard label="Alumnos en lista" valor={filtrados.length.toString()} />
        <MiniCard label="Total cobrado" valor={fmtMoney(totalCobrado)} color="#059669" />
        <MiniCard label="Sin pago registrado" valor={sinPago.toString()} color={sinPago > 0 ? "#dc2626" : undefined} />
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📚</div>
          <h3 style={{ margin: 0 }}>Sin pagos registrados</h3>
          <p style={{ color: "#64748b" }}>Toca "+ Nuevo pago" para agregar el primer alumno.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={th}>Fecha pago</th>
                <th style={th}>Alumno</th>
                <th style={th}>Padre / Madre</th>
                <th style={th}>Teléfono</th>
                <th style={{ ...th, textAlign: "right" }}>Monto</th>
                <th style={th}>Próximo pago</th>
                <th style={th}>Deporte</th>
                <th style={{ ...th, width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => {
                const dias = diasHasta(p.fecha_proximo_pago);
                let colorProx = "#64748b";
                let etiquetaProx = "";
                if (dias !== null) {
                  if (dias < 0) { colorProx = "#dc2626"; etiquetaProx = ` (venció hace ${-dias}d)`; }
                  else if (dias <= 5) { colorProx = "#f59e0b"; etiquetaProx = ` (en ${dias}d)`; }
                  else colorProx = "#059669";
                }
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9",
                    background: p.monto_pagado === 0 ? "#fef9c3" : undefined }}
                    onClick={() => setEditando(p)}>
                    <td style={td}>{fmtDate(p.fecha_pago)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{p.alumno_nombre}</td>
                    <td style={td}>{p.padres_nombre || <em style={{ color: "#94a3b8" }}>-</em>}</td>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
                      {p.telefono || <em style={{ color: "#94a3b8" }}>-</em>}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums",
                      fontWeight: 700, color: p.monto_pagado > 0 ? "#059669" : "#dc2626" }}>
                      {p.monto_pagado > 0 ? fmtMoney(p.monto_pagado) : "SIN PAGO"}
                    </td>
                    <td style={{ ...td, color: colorProx, fontSize: 13, fontWeight: 600 }}>
                      {fmtDate(p.fecha_proximo_pago)}{etiquetaProx}
                    </td>
                    <td style={td}>
                      <span style={{
                        padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                        background: p.deporte === "padel" ? "#dbeafe" : "#dcfce7",
                        color: p.deporte === "padel" ? "#1e40af" : "#065f46",
                      }}>{p.deporte.toUpperCase()}</span>
                    </td>
                    <td style={td}>
                      <button onClick={(e) => { e.stopPropagation(); borrar(p.id, p.alumno_nombre); }}
                        style={{ background: "transparent", border: 0, color: "#dc2626",
                          cursor: "pointer", fontSize: 18 }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mostrarNuevo && <PagoModal onClose={() => setMostrarNuevo(false)} onSaved={() => { setMostrarNuevo(false); cargar(); }} />}
      {editando && <PagoModal pago={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); cargar(); }} />}
    </Layout>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14, cursor: "pointer" };


function MiniCard({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div style={{ background: "white", padding: 14, borderRadius: 8, border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: color || "#0f172a" }}>{valor}</div>
    </div>
  );
}


function PagoModal({ pago, onClose, onSaved }: { pago?: Pago; onClose: () => void; onSaved: () => void }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaPago, setFechaPago] = useState(pago?.fecha_pago || hoy);
  const [alumno, setAlumno] = useState(pago?.alumno_nombre || "");
  const [padres, setPadres] = useState(pago?.padres_nombre || "");
  const [telefono, setTelefono] = useState(pago?.telefono || "");
  const [monto, setMonto] = useState<number>(pago?.monto_pagado || 0);
  const [proxPago, setProxPago] = useState(pago?.fecha_proximo_pago || "");
  const [deporte, setDeporte] = useState(pago?.deporte || "futbol");
  const [notas, setNotas] = useState(pago?.notas || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto: proxPago = fechaPago + 1 mes cuando cambia fechaPago
  useEffect(() => {
    if (!fechaPago) return;
    const d = new Date(fechaPago + "T00:00:00");
    d.setMonth(d.getMonth() + 1);
    const iso = d.toISOString().slice(0, 10);
    // Solo autofill si el user no lo cambio explicito
    if (!pago || proxPago === "") setProxPago(iso);
  }, [fechaPago]);

  async function guardar() {
    if (!alumno.trim()) { setError("Nombre del alumno es obligatorio"); return; }
    setBusy(true); setError(null);
    try {
      const body = {
        fecha_pago: fechaPago, alumno_nombre: alumno,
        padres_nombre: padres || null, telefono: telefono || null,
        monto_pagado: +monto || 0, fecha_proximo_pago: proxPago || null,
        deporte, notas: notas || null,
      };
      if (pago) await api.patch(`/api/academia/${pago.id}`, body);
      else await api.post("/api/academia", body);
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12,
        padding: 20, width: "100%", maxWidth: 520, color: "#0f172a", maxHeight: "94vh", overflow: "auto" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 18 }}>
          {pago ? "Editar pago" : "Nuevo pago de alumno"}
        </h3>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label style={lbl}>Fecha de pago *</label>
            <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Próximo pago (auto)</label>
            <input type="date" value={proxPago} onChange={(e) => setProxPago(e.target.value)} style={inp} />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Alumno *</label>
            <input value={alumno} onChange={(e) => setAlumno(e.target.value)}
              placeholder="Nombre completo" style={inp} autoFocus />
          </div>
          <div>
            <label style={lbl}>Padre / Madre</label>
            <input value={padres} onChange={(e) => setPadres(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Teléfono</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} style={inp} inputMode="tel" />
          </div>
          <div>
            <label style={lbl}>Monto pagado</label>
            <input type="number" step="0.01" value={monto}
              onChange={(e) => setMonto(+e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Deporte</label>
            <select value={deporte} onChange={(e) => setDeporte(e.target.value)} style={inp}>
              <option value="futbol">Futbol</option>
              <option value="padel">Padel</option>
              <option value="tenis">Tenis</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Notas</label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)}
              placeholder="Opcional" style={inp} />
          </div>
        </div>

        {error && <div style={{ background: "#fee2e2", color: "#991b1b", padding: 8,
          borderRadius: 6, fontSize: 13, marginTop: 10 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} disabled={busy}
            style={{ flex: 1, background: "#e2e8f0", color: "#0f172a", border: 0,
              padding: 12, borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={busy}
            style={{ flex: 2, background: busy ? "#94a3b8" : "#059669", color: "white",
              border: 0, padding: 12, borderRadius: 6, fontSize: 15, fontWeight: 700,
              cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Guardando..." : pago ? "Guardar cambios" : "Guardar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 4 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 4 };
