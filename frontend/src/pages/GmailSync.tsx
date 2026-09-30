import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Status = {
  conectado: boolean;
  email?: string; activo?: boolean;
  modo?: string; ultima_sync_en?: string | null;
  frecuencia_min?: number; pendientes_aprobacion?: number;
};

type Pendiente = {
  id: number; estado: string;
  fecha_correo: string | null; remitente: string;
  asunto: string; proveedor_rfc: string;
  proveedor_nombre: string; folio: string;
  uuid: string; total: number; moneda: string;
  metodo_pago: string; forma_pago: string;
  fecha_emision: string | null; razon_descartado: string | null;
  cxp_id: number | null; proveedor_id: number | null;
};

const fmt = (n: number) => "$" + (n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "-";

export default function GmailSync() {
  const [status, setStatus] = useState<Status | null>(null);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [descartados, setDescartados] = useState<Pendiente[]>([]);
  const [tab, setTab] = useState<"pendientes" | "descartados" | "importados">("pendientes");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dias, setDias] = useState(1);
  const [diasCredito, setDiasCredito] = useState(30);

  // Sugerido = dias desde ultima sync + 1 de overlap. Sin sync previa = 1
  const diasSugeridos = (): number => {
    if (!status?.ultima_sync_en) return 1;
    const ms = Date.now() - new Date(status.ultima_sync_en).getTime();
    const dias = Math.ceil(ms / (1000 * 60 * 60 * 24));
    return Math.max(1, dias + 1);  // +1 dia overlap para no perder correos borderline
  };

  async function cargarStatus() {
    try {
      const r = await api.get("/api/gmail/status");
      setStatus(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    }
  }

  async function cargarLista() {
    try {
      const r = await api.get("/api/gmail/pendientes", { params: { estado: tab === "pendientes" ? "pendiente" : tab === "descartados" ? "descartado" : "importado" } });
      if (tab === "pendientes") setPendientes(r.data);
      else if (tab === "descartados") setDescartados(r.data);
      else setPendientes(r.data);  // reusar arreglo pero para importados
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await cargarStatus();
      await cargarLista();
      setLoading(false);
    })();
  }, [tab]);

  // Cuando cambia status, auto-set dias sugeridos si el user no cambio manualmente
  useEffect(() => {
    if (status?.conectado) setDias(diasSugeridos());
  }, [status?.ultima_sync_en]);

  // Detectar callback ?connected=email
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("connected")) {
      setMsg(`Conectado como ${params.get("connected")}`);
      window.history.replaceState({}, "", "/gmail-sync");
      cargarStatus();
    } else if (params.get("error")) {
      setError(`Error OAuth: ${params.get("error")}`);
      window.history.replaceState({}, "", "/gmail-sync");
    }
  }, []);

  async function conectar() {
    try {
      const r = await api.get("/api/gmail/oauth/start");
      window.location.href = r.data.auth_url;
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    }
  }

  async function desconectar() {
    if (!confirm("Desconectar Gmail? Se guarda el historial pero deja de sincronizar.")) return;
    try {
      await api.delete("/api/gmail/disconnect");
      setStatus({ conectado: false });
      setMsg("Desconectado");
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    }
  }

  async function sincronizar() {
    setBusy(true); setError(null); setMsg(null);
    try {
      const r = await api.post("/api/gmail/sync", null, { params: { dias_atras: dias } });
      const s = r.data.stats;
      setMsg(`Sync completa: ${s.buscados} correos, ${s.guardados_pendientes} pendientes, ${s.descartados} descartados, ${s.ya_procesados} ya procesados`);
      await cargarStatus();
      await cargarLista();
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function aprobar(id: number) {
    try {
      await api.post(`/api/gmail/pendientes/${id}/aprobar`, { dias_credito: diasCredito });
      setMsg("CxP creada");
      cargarLista();
      cargarStatus();
    } catch (e: any) {
      alert("Error: " + (e.response?.data?.detail || e.message));
    }
  }

  async function rechazar(id: number) {
    if (!confirm("Rechazar este correo? No se creara CxP.")) return;
    try {
      await api.post(`/api/gmail/pendientes/${id}/rechazar`);
      cargarLista();
      cargarStatus();
    } catch (e: any) {
      alert("Error: " + (e.response?.data?.detail || e.message));
    }
  }

  const listaMostrada = tab === "descartados" ? descartados : pendientes;

  return (
    <Layout title="Sincronizacion Gmail" subtitle="Importar CxP automaticas de facturas por correo">
      {msg && <div style={{ background: "#dcfce7", color: "#065f46", padding: 10, borderRadius: 6, marginBottom: 12 }}>{msg}</div>}
      {error && <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 6, marginBottom: 12 }}>{error}</div>}

      {loading ? <div style={{ padding: 20 }}>Cargando...</div> : (
        <>
          {/* Panel conexion */}
          <div className="card" style={{ padding: 18, marginBottom: 14 }}>
            {status?.conectado ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Cuenta conectada</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>📧 {status.email}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    Modo: {status.modo === "auto" ? "🤖 automatico" : "👁 requiere aprobacion"} ·
                    Pendientes: <strong>{status.pendientes_aprobacion || 0}</strong>
                  </div>

                  {/* Bloque de ultima sincronizacion, mas prominente */}
                  <div style={{
                    marginTop: 10, padding: "8px 12px", borderRadius: 6,
                    background: status.ultima_sync_en ? "#dcfce7" : "#fef3c7",
                    display: "inline-flex", flexDirection: "column", gap: 2,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      ⏱ Ultima sincronizacion
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                      {status.ultima_sync_en ? relativeTime(status.ultima_sync_en) : "Nunca (haz click en Sincronizar ahora)"}
                    </div>
                    {status.ultima_sync_en && (
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        {new Date(status.ultima_sync_en).toLocaleString("es-MX", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#059669", marginTop: 4 }}>
                      🤖 Sync automatico: cada 60 min (8am-8pm hora MX)
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "#64748b" }}>Dias atras:</span>
                    <input type="number" value={dias} onChange={e => setDias(+e.target.value)} min={1}
                      style={{ width: 60, padding: 6, border: "1px solid #cbd5e1", borderRadius: 4 }} />
                    {status.ultima_sync_en && dias !== diasSugeridos() && (
                      <button onClick={() => setDias(diasSugeridos())}
                        style={{ background: "#dbeafe", color: "#1e40af", border: 0,
                          padding: "6px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                        title={`Sugerido segun ultima sync`}>
                        📌 Sugerido: {diasSugeridos()}d
                      </button>
                    )}
                    <button onClick={sincronizar} disabled={busy}
                      style={{ background: busy ? "#94a3b8" : "#059669", color: "white", border: 0,
                        padding: "10px 18px", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                      {busy ? "Sincronizando..." : "🔄 Sincronizar ahora"}
                    </button>
                    <button onClick={desconectar}
                      style={{ background: "#fee2e2", color: "#991b1b", border: 0,
                        padding: "10px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
                      Desconectar
                    </button>
                  </div>
                  {status.ultima_sync_en && (
                    <div style={{ fontSize: 11, color: "#64748b", fontStyle: "italic" }}>
                      💡 Sugerido: {diasSugeridos()} dias (ultima sync + 1 dia overlap)
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 20 }}>
                <div style={{ fontSize: 48 }}>📧</div>
                <h3 style={{ margin: "8px 0" }}>Conecta tu Gmail</h3>
                <p style={{ color: "#64748b", marginTop: 0 }}>
                  El sistema leera los CFDI recibidos por correo y creara CxP automaticas
                  filtrando solo facturas de mercancia a credito (PPD).
                </p>
                <button onClick={conectar}
                  style={{ background: "#0f172a", color: "white", border: 0,
                    padding: "14px 24px", borderRadius: 8, fontSize: 15, fontWeight: 700,
                    cursor: "pointer", marginTop: 8 }}>
                  Conectar Gmail
                </button>
              </div>
            )}
          </div>

          {status?.conectado && (
            <>
              {/* Tabs */}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {(["pendientes", "descartados", "importados"] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    style={{
                      padding: "10px 18px", border: 0, borderRadius: 8, fontSize: 14, fontWeight: 700,
                      cursor: "pointer",
                      background: tab === t ? "#0f172a" : "#e2e8f0",
                      color: tab === t ? "white" : "#334155",
                    }}>
                    {t === "pendientes" ? "⏳ Pendientes" : t === "descartados" ? "❌ Descartados" : "✓ Importadas"}
                    {" "}({listaMostrada.length})
                  </button>
                ))}
              </div>

              {tab === "pendientes" && (
                <div style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>Dias credito default:</span>
                  <input type="number" value={diasCredito} onChange={e => setDiasCredito(+e.target.value)}
                    style={{ width: 60, padding: 6, border: "1px solid #cbd5e1", borderRadius: 4 }} />
                </div>
              )}

              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {listaMostrada.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
                    Sin resultados
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                        <th style={th}>Fecha</th>
                        <th style={th}>Proveedor</th>
                        <th style={th}>Folio</th>
                        <th style={th}>Método</th>
                        <th style={{ ...th, textAlign: "right" }}>Total</th>
                        {tab === "descartados" && <th style={th}>Razón</th>}
                        {tab === "pendientes" && <th style={{ ...th, width: 200, textAlign: "center" }}>Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {listaMostrada.map(p => (
                        <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={td}>{fmtDate(p.fecha_emision || p.fecha_correo)}</td>
                          <td style={td}>
                            <div style={{ fontWeight: 700 }}>{p.proveedor_nombre || <em>-</em>}</div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>{p.proveedor_rfc}</div>
                          </td>
                          <td style={td}>{p.folio || "-"}</td>
                          <td style={td}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                              background: p.metodo_pago === "PPD" ? "#dbeafe" : "#f1f5f9",
                              color: p.metodo_pago === "PPD" ? "#1e40af" : "#64748b",
                            }}>{p.metodo_pago}</span>
                          </td>
                          <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                            {fmt(p.total)}
                          </td>
                          {tab === "descartados" && (
                            <td style={{ ...td, fontSize: 11, color: "#94a3b8" }}>{p.razon_descartado}</td>
                          )}
                          {tab === "pendientes" && (
                            <td style={td}>
                              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                                <button onClick={() => aprobar(p.id)}
                                  style={{ background: "#059669", color: "white", border: 0,
                                    padding: "6px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                  ✓ Crear CxP
                                </button>
                                <button onClick={() => rechazar(p.id)}
                                  style={{ background: "transparent", color: "#dc2626", border: "1px solid #dc2626",
                                    padding: "6px 12px", borderRadius: 4, fontSize: 12, cursor: "pointer" }}>
                                  Rechazar
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Layout>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13 };

// "hace X min / hace Y horas / hace Z dias"
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "hace unos segundos";
  if (min < 60) return `hace ${min} minuto${min === 1 ? "" : "s"}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} hora${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} día${d === 1 ? "" : "s"}`;
  const meses = Math.floor(d / 30);
  return `hace ${meses} mes${meses === 1 ? "" : "es"}`;
}
