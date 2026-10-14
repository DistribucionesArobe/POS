import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Fiesta = {
  id: number;
  fecha: string;
  dia_semana: string;
  nombre: string;
  telefono: string | null;
  incluye_padel: boolean;
  incluye_futbol: boolean;
  incluye_comida: boolean;
  n_platillos: number;
  costo_platillo: number;
  costo_comida_total: number;
  monto: number;
  anticipo: number;
  saldo: number;
  estatus: "PENDIENTE" | "CONFIRMADA" | "REALIZADA" | "CANCELADA";
  notas: string | null;
};

const fmtMoney = (n: number) => "$" + (n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" }) : "-";

const ESTATUS_COLOR: Record<string, string> = {
  PENDIENTE: "#f59e0b",
  CONFIRMADA: "#059669",
  REALIZADA: "#1e40af",
  CANCELADA: "#dc2626",
};

type OrdenCol = "fecha" | "nombre" | "monto" | "saldo" | "estatus";

export default function Fiestas() {
  const [fiestas, setFiestas] = useState<Fiesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstatus, setFiltroEstatus] = useState<string>("");
  const [filtroDeporte, setFiltroDeporte] = useState<string>("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Fiesta | null>(null);
  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [ordenCol, setOrdenCol] = useState<OrdenCol>("fecha");
  const [ordenDir, setOrdenDir] = useState<"asc" | "desc">("asc");

  async function cargar() {
    setLoading(true);
    try {
      const params: any = {};
      if (filtroEstatus) params.estatus = filtroEstatus;
      if (filtroDeporte) params.deporte = filtroDeporte;
      if (desde) params.desde = desde;
      if (hasta) params.hasta = hasta;
      const r = await api.get("/api/fiestas", { params });
      setFiestas(r.data || []);
    } catch { setFiestas([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { cargar(); }, [filtroEstatus, filtroDeporte, desde, hasta]);

  const filtradas = useMemo(() => {
    let lista = fiestas;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(f =>
        f.nombre.toLowerCase().includes(q) ||
        (f.telefono || "").includes(q) ||
        (f.notas || "").toLowerCase().includes(q)
      );
    }
    const dir = ordenDir === "asc" ? 1 : -1;
    lista = [...lista].sort((a, b) => {
      switch (ordenCol) {
        case "nombre": return dir * a.nombre.localeCompare(b.nombre);
        case "monto": return dir * (a.monto - b.monto);
        case "saldo": return dir * (a.saldo - b.saldo);
        case "estatus": return dir * a.estatus.localeCompare(b.estatus);
        case "fecha":
        default: return dir * (new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      }
    });
    return lista;
  }, [fiestas, busqueda, ordenCol, ordenDir]);

  function toggleOrden(col: OrdenCol) {
    if (ordenCol === col) setOrdenDir(d => d === "asc" ? "desc" : "asc");
    else { setOrdenCol(col); setOrdenDir("asc"); }
  }
  const flecha = (col: OrdenCol) =>
    ordenCol === col ? (ordenDir === "asc" ? " ↑" : " ↓") : "";

  async function borrar(f: Fiesta) {
    if (!confirm(`Eliminar la fiesta de "${f.nombre}" (${fmtDate(f.fecha)})?`)) return;
    await api.delete(`/api/fiestas/${f.id}`);
    cargar();
  }

  const totales = useMemo(() => {
    const total = filtradas.reduce((s, f) => s + f.monto, 0);
    const anticipos = filtradas.reduce((s, f) => s + f.anticipo, 0);
    const saldos = filtradas.reduce((s, f) => s + f.saldo, 0);
    const platillos = filtradas.reduce((s, f) =>
      s + (f.incluye_comida ? (f.n_platillos || 0) : 0), 0);
    const cafeteria = filtradas.reduce((s, f) =>
      s + (f.incluye_comida ? (f.costo_comida_total || 0) : 0), 0);
    return { total, anticipos, saldos, platillos, cafeteria };
  }, [filtradas]);

  return (
    <Layout title="Fiestas" subtitle="Cumpleaños y eventos del club"
      actions={
        <button onClick={() => setMostrarNueva(true)}
          style={{ background: "#059669", color: "white", border: 0,
            padding: "10px 18px", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          🎉 Nueva fiesta
        </button>
      }>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input placeholder="Buscar nombre, teléfono o notas..."
          value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          style={{ flex: 1, minWidth: 240, padding: "8px 12px", fontSize: 14,
            border: "1px solid #cbd5e1", borderRadius: 6 }} />
        <select value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value)}
          style={{ padding: "8px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 6 }}>
          <option value="">Todos los estatus</option>
          <option value="PENDIENTE">Pendientes</option>
          <option value="CONFIRMADA">Confirmadas</option>
          <option value="REALIZADA">Realizadas</option>
          <option value="CANCELADA">Canceladas</option>
        </select>
        <select value={filtroDeporte} onChange={(e) => setFiltroDeporte(e.target.value)}
          style={{ padding: "8px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 6 }}>
          <option value="">Padel y futbol</option>
          <option value="padel">Solo padel</option>
          <option value="futbol">Solo futbol</option>
        </select>
        <label style={{ fontSize: 12, color: "#475569" }}>
          Desde: <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            style={{ padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 4 }} />
        </label>
        <label style={{ fontSize: 12, color: "#475569" }}>
          Hasta: <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            style={{ padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 4 }} />
        </label>
        {(desde || hasta || filtroEstatus || filtroDeporte || busqueda) && (
          <button onClick={() => { setDesde(""); setHasta(""); setFiltroEstatus(""); setFiltroDeporte(""); setBusqueda(""); }}
            style={{ background: "transparent", border: "1px solid #cbd5e1",
              padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 14 }}>
        <MiniCard label="Fiestas" valor={filtradas.length.toString()} />
        <MiniCard label="Monto total" valor={fmtMoney(totales.total)} color="#0f172a" />
        <MiniCard label="Anticipos" valor={fmtMoney(totales.anticipos)} color="#059669" />
        <MiniCard label="Saldo x cobrar" valor={fmtMoney(totales.saldos)} color={totales.saldos > 0 ? "#dc2626" : "#059669"} />
        <MiniCard
          label={`🍔 Debes cafetería (${totales.platillos})`}
          valor={fmtMoney(totales.cafeteria)}
          color={totales.cafeteria > 0 ? "#b45309" : "#64748b"}
        />
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>Cargando...</div>
      ) : filtradas.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
          <h3 style={{ margin: 0 }}>Sin fiestas registradas</h3>
          <p style={{ color: "#64748b" }}>Toca "🎉 Nueva fiesta" para agregar.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleOrden("fecha")}>Fecha{flecha("fecha")}</th>
                <th style={th}>Día</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleOrden("nombre")}>Nombre{flecha("nombre")}</th>
                <th style={th}>Deportes</th>
                <th style={th}>Comida</th>
                <th style={{ ...th, textAlign: "right", cursor: "pointer" }} onClick={() => toggleOrden("monto")}>Monto{flecha("monto")}</th>
                <th style={{ ...th, textAlign: "right" }}>Anticipo</th>
                <th style={{ ...th, textAlign: "right", cursor: "pointer" }} onClick={() => toggleOrden("saldo")}>Saldo{flecha("saldo")}</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleOrden("estatus")}>Estatus{flecha("estatus")}</th>
                <th style={{ ...th, width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((f) => {
                return (
                  <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                    onClick={() => setEditando(f)}>
                    <td style={td}><strong>{fmtDate(f.fecha)}</strong></td>
                    <td style={{ ...td, fontSize: 12, color: "#64748b" }}>{f.dia_semana}</td>
                    <td style={td}>{f.nombre}</td>
                    <td style={td}>
                      {f.incluye_padel && (
                        <span style={{ background: "#dbeafe", color: "#1e40af",
                          padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, marginRight: 4 }}>
                          🎾 PADEL
                        </span>
                      )}
                      {f.incluye_futbol && (
                        <span style={{ background: "#dcfce7", color: "#065f46",
                          padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                          ⚽ FUTBOL
                        </span>
                      )}
                    </td>
                    <td style={td}>
                      {f.incluye_comida ? (
                        <span title={`${f.n_platillos} platillos × ${fmtMoney(f.costo_platillo)}`}>
                          🍔 {f.n_platillos || 0}
                          <div style={{ fontSize: 10, color: "#b45309" }}>
                            {fmtMoney(f.costo_comida_total)}
                          </div>
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtMoney(f.monto)}</td>
                    <td style={{ ...td, textAlign: "right", color: "#059669" }}>{f.anticipo > 0 ? fmtMoney(f.anticipo) : "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700,
                      color: f.saldo > 0 ? "#dc2626" : "#059669" }}>
                      {fmtMoney(f.saldo)}
                    </td>
                    <td style={td}>
                      <span style={{
                        background: ESTATUS_COLOR[f.estatus] + "22",
                        color: ESTATUS_COLOR[f.estatus],
                        padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 800,
                      }}>
                        {f.estatus}
                      </span>
                    </td>
                    <td style={td} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => borrar(f)}
                        style={{ background: "transparent", border: 0, color: "#dc2626",
                          fontSize: 18, cursor: "pointer" }}
                        title="Eliminar">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mostrarNueva && <FiestaModal onClose={() => setMostrarNueva(false)} onSaved={() => { setMostrarNueva(false); cargar(); }} />}
      {editando && <FiestaModal fiesta={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); cargar(); }} />}
    </Layout>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };

function MiniCard({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div style={{ background: "white", padding: 14, borderRadius: 8, border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: color || "#0f172a" }}>{valor}</div>
    </div>
  );
}


function FiestaModal({ fiesta, onClose, onSaved }: {
  fiesta?: Fiesta; onClose: () => void; onSaved: () => void;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(fiesta?.fecha || hoy);
  const [nombre, setNombre] = useState(fiesta?.nombre || "");
  const [telefono, setTelefono] = useState(fiesta?.telefono || "");
  const [incluyePadel, setIncluyePadel] = useState(fiesta?.incluye_padel ?? true);
  const [incluyeFutbol, setIncluyeFutbol] = useState(fiesta?.incluye_futbol ?? true);
  const [incluyeComida, setIncluyeComida] = useState(fiesta?.incluye_comida ?? false);
  const [nPlatillos, setNPlatillos] = useState<number>(fiesta?.n_platillos || 0);
  const [costoPlatillo, setCostoPlatillo] = useState<number>(fiesta?.costo_platillo || 80);
  const [monto, setMonto] = useState<number>(fiesta?.monto || 0);
  const [anticipo, setAnticipo] = useState<number>(fiesta?.anticipo || 0);
  const [estatus, setEstatus] = useState(fiesta?.estatus || "PENDIENTE");
  const [notas, setNotas] = useState(fiesta?.notas || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!nombre.trim()) { setError("Nombre es obligatorio"); return; }
    if (!incluyePadel && !incluyeFutbol) { setError("Debe incluir al menos un deporte"); return; }
    setBusy(true); setError(null);
    try {
      const body = {
        fecha, nombre: nombre.trim(),
        telefono: telefono || null,
        incluye_padel: incluyePadel,
        incluye_futbol: incluyeFutbol,
        incluye_comida: incluyeComida,
        n_platillos: incluyeComida ? Math.max(0, +nPlatillos || 0) : 0,
        costo_platillo: +costoPlatillo || 80,
        monto: +monto || 0,
        anticipo: +anticipo || 0,
        estatus,
        notas: notas || null,
      };
      if (fiesta) await api.patch(`/api/fiestas/${fiesta.id}`, body);
      else await api.post("/api/fiestas", body);
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12,
        padding: 22, width: "100%", maxWidth: 560, color: "#0f172a", maxHeight: "94vh", overflow: "auto" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 18 }}>
          {fiesta ? "Editar fiesta" : "🎉 Nueva fiesta"}
        </h3>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label style={lbl}>Fecha *</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Estatus</label>
            <select value={estatus} onChange={(e) => setEstatus(e.target.value as any)} style={inp}>
              <option value="PENDIENTE">Pendiente</option>
              <option value="CONFIRMADA">Confirmada ✅</option>
              <option value="REALIZADA">Realizada</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Nombre del cumpleañero *</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Quintero" style={inp} autoFocus />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Teléfono / WhatsApp</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} style={inp} inputMode="tel" />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Deportes incluidos *</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setIncluyePadel(!incluyePadel)}
                style={{
                  flex: 1, padding: "12px", border: 0, borderRadius: 6, cursor: "pointer",
                  fontSize: 14, fontWeight: 700,
                  background: incluyePadel ? "#1e40af" : "#e2e8f0",
                  color: incluyePadel ? "white" : "#64748b",
                }}>
                🎾 Padel {incluyePadel && "✓"}
              </button>
              <button type="button" onClick={() => setIncluyeFutbol(!incluyeFutbol)}
                style={{
                  flex: 1, padding: "12px", border: 0, borderRadius: 6, cursor: "pointer",
                  fontSize: 14, fontWeight: 700,
                  background: incluyeFutbol ? "#059669" : "#e2e8f0",
                  color: incluyeFutbol ? "white" : "#64748b",
                }}>
                ⚽ Futbol {incluyeFutbol && "✓"}
              </button>
            </div>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={incluyeComida} onChange={(e) => setIncluyeComida(e.target.checked)}
                style={{ width: 18, height: 18 }} />
              🍔 Incluye comida
            </label>
          </div>
          {incluyeComida && (
            <>
              <div>
                <label style={lbl}># platillos</label>
                <input type="number" min="0" value={nPlatillos}
                  onChange={(e) => setNPlatillos(+e.target.value)}
                  style={inp} />
              </div>
              <div>
                <label style={lbl}>Costo por platillo</label>
                <input type="number" step="0.01" min="0" value={costoPlatillo}
                  onChange={(e) => setCostoPlatillo(+e.target.value)}
                  style={inp} />
              </div>
              <div style={{ gridColumn: "span 2", background: "#fff7ed", padding: 10, borderRadius: 6,
                border: "1px solid #fdba74", display: "flex", justifyContent: "space-between",
                fontSize: 13, color: "#9a3412" }}>
                <strong>🍔 Debe a cafetería:</strong>
                <strong>{fmtMoney(nPlatillos * costoPlatillo)}</strong>
              </div>
            </>
          )}
          <div>
            <label style={lbl}>Monto total</label>
            <input type="number" step="0.01" value={monto}
              onChange={(e) => setMonto(+e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Anticipo cobrado</label>
            <input type="number" step="0.01" value={anticipo}
              onChange={(e) => setAnticipo(+e.target.value)} style={inp} />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Notas</label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)}
              placeholder="Hora, # invitados, decoración, etc." style={inp} />
          </div>
        </div>

        {+anticipo > 0 && +monto > 0 && (
          <div style={{ marginTop: 10, padding: 10, background: "#f1f5f9", borderRadius: 6,
            display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span>Saldo pendiente:</span>
            <strong style={{ color: (+monto - +anticipo) > 0 ? "#dc2626" : "#059669" }}>
              {fmtMoney(+monto - +anticipo)}
            </strong>
          </div>
        )}

        {error && <div style={{ background: "#fee2e2", color: "#991b1b", padding: 8,
          borderRadius: 6, fontSize: 13, marginTop: 10 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} disabled={busy}
            style={{ padding: "10px 16px", background: "transparent",
              border: "1px solid #cbd5e1", borderRadius: 6, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={busy}
            style={{ flex: 1, padding: "10px 16px",
              background: busy ? "#94a3b8" : "#059669", color: "white", border: 0,
              borderRadius: 6, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Guardando..." : (fiesta ? "Actualizar" : "Guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", fontSize: 14,
  border: "1px solid #cbd5e1", borderRadius: 6, boxSizing: "border-box" };
