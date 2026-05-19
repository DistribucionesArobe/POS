import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type ClienteSaldo = {
  cliente_id: number;
  nombre: string;
  rfc: string | null;
  whatsapp: string | null;
  saldo: number;
};

type Movimiento = {
  id: number;
  tipo: string;
  puntos: number;
  documento_venta_id: number | null;
  notas: string | null;
  fecha: string;
  vence_en: string | null;
};

const fmt = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
const fmtMon = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Monedero() {
  const [clientes, setClientes] = useState<ClienteSaldo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [solSel, setSelClient] = useState<ClienteSaldo | null>(null);
  const [historial, setHistorial] = useState<Movimiento[]>([]);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [draftAjuste, setDraftAjuste] = useState({ puntos: 0, notas: "" });

  async function cargar() {
    setCargando(true);
    try {
      const r = await api.get("/api/monedero/clientes", { params: { solo_con_saldo: false } });
      setClientes(r.data || []);
    } finally {
      setCargando(false);
    }
  }

  async function abrirHistorial(c: ClienteSaldo) {
    setSelClient(c);
    try {
      const r = await api.get(`/api/monedero/historial/${c.cliente_id}`);
      setHistorial(r.data || []);
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function aplicarAjuste() {
    if (!solSel) return;
    if (!draftAjuste.puntos) return alert("Captura un valor de puntos (positivo o negativo)");
    try {
      await api.post("/api/monedero/ajuste", {
        cliente_id: solSel.cliente_id,
        puntos: draftAjuste.puntos,
        notas: draftAjuste.notas,
      });
      setAjusteOpen(false);
      setDraftAjuste({ puntos: 0, notas: "" });
      cargar();
      abrirHistorial(solSel);
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  useEffect(() => { cargar(); }, []);

  const totalAcumulado = clientes.reduce((a, c) => a + c.saldo, 0);
  const clientesConSaldo = clientes.filter((c) => c.saldo > 0).length;
  const filtrados = clientes.filter((c) => {
    if (!filtro) return true;
    const f = filtro.toLowerCase();
    return c.nombre.toLowerCase().includes(f)
      || (c.rfc || "").toLowerCase().includes(f)
      || (c.whatsapp || "").includes(f);
  });

  return (
    <Layout title="Monedero · Programa de lealtad">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <Chip label="CLIENTES CON SALDO" valor={String(clientesConSaldo)} color="#0f172a" />
        <Chip label="PUNTOS EN CIRCULACIÓN" valor={fmt(totalAcumulado)} color="#1e40af" />
        <Chip label="VALOR EQUIVALENTE" valor={fmtMon(totalAcumulado)} color="#065f46" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Lista de clientes */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 className="card-header" style={{ margin: 0 }}>Clientes</h3>
            <input className="input" placeholder="Buscar nombre / RFC / WhatsApp..."
              value={filtro} onChange={(e) => setFiltro(e.target.value)}
              style={{ width: 240, fontSize: 12 }} />
          </div>
          <div style={{ maxHeight: "60vh", overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
            {cargando ? (
              <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontSize: 13 }}>Cargando...</div>
            ) : filtrados.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontSize: 13 }}>
                Sin clientes con movimientos de puntos
              </div>
            ) : (
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f3f4f6" }}>
                    <th style={th}>Cliente</th>
                    <th style={{ ...th, textAlign: "right", width: 110 }}>Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c) => (
                    <tr key={c.cliente_id}
                      onClick={() => abrirHistorial(c)}
                      style={{
                        cursor: "pointer",
                        background: solSel?.cliente_id === c.cliente_id ? "#dbeafe" : "white",
                      }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>
                          {[c.rfc, c.whatsapp].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <strong style={{ color: c.saldo > 0 ? "#065f46" : "#94a3b8" }}>
                          {fmt(c.saldo)}
                        </strong>
                        <div style={{ fontSize: 10, color: "#6b7280" }}>{fmtMon(c.saldo)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Detalle del cliente */}
        <div className="card">
          {!solSel ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              Selecciona un cliente para ver su historial
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <h3 className="card-header" style={{ margin: 0 }}>{solSel.nombre}</h3>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Saldo: <strong style={{ color: "#065f46" }}>{fmt(solSel.saldo)} pts</strong>
                    <span style={{ marginLeft: 8 }}>({fmtMon(solSel.saldo)})</span>
                  </div>
                </div>
                <button className="btn-icon" onClick={() => setAjusteOpen(true)}>
                  + Ajuste manual
                </button>
              </div>

              {ajusteOpen && (
                <div style={{ background: "#fef3c7", padding: 10, borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Ajuste manual</strong> · positivo regala puntos, negativo los resta
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "100px 1fr auto", gap: 6, alignItems: "center" }}>
                    <input type="number" placeholder="100"
                      value={draftAjuste.puntos}
                      onChange={(e) => setDraftAjuste({ ...draftAjuste, puntos: +e.target.value })}
                      style={{ padding: 4, fontSize: 12, textAlign: "right" }} />
                    <input placeholder="Notas (ej. cumpleaños, cortesía)"
                      value={draftAjuste.notas}
                      onChange={(e) => setDraftAjuste({ ...draftAjuste, notas: e.target.value })}
                      style={{ padding: 4, fontSize: 12 }} />
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm" onClick={aplicarAjuste}>Guardar</button>
                      <button className="btn-icon" onClick={() => setAjusteOpen(false)}>×</button>
                    </div>
                  </div>
                </div>
              )}

              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f3f4f6" }}>
                    <th style={th}>Fecha</th>
                    <th style={th}>Tipo</th>
                    <th style={{ ...th, textAlign: "right" }}>Puntos</th>
                    <th style={th}>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.length === 0 && (
                    <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#94a3b8", padding: 12 }}>
                      Sin movimientos
                    </td></tr>
                  )}
                  {historial.map((m) => {
                    const sumar = m.puntos > 0;
                    return (
                      <tr key={m.id}>
                        <td style={td}>{new Date(m.fecha).toLocaleDateString("es-MX")}</td>
                        <td style={td}>
                          <span style={{
                            fontSize: 10, padding: "2px 6px", borderRadius: 3,
                            background: m.tipo === "GANANCIA" ? "#dcfce7" : m.tipo === "CANJE" ? "#fee2e2" : "#fef3c7",
                            color: m.tipo === "GANANCIA" ? "#065f46" : m.tipo === "CANJE" ? "#991b1b" : "#92400e",
                            fontWeight: 600,
                          }}>
                            {m.tipo}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, color: sumar ? "#065f46" : "#991b1b" }}>
                          {sumar ? "+" : ""}{fmt(m.puntos)}
                        </td>
                        <td style={{ ...td, fontSize: 11, color: "#6b7280" }}>
                          {m.notas || (m.documento_venta_id ? `Venta #${m.documento_venta_id}` : "—")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}


function Chip({ label, valor, color }: { label: string; valor: string; color: string }) {
  return (
    <div style={{
      background: color, color: "white", padding: "12px 16px", borderRadius: 8,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ fontSize: 11, opacity: 0.8, letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 700 }}>{valor}</span>
    </div>
  );
}


const th: React.CSSProperties = {
  padding: "6px 8px", textAlign: "left", fontSize: 11,
  textTransform: "uppercase", color: "#475569",
  borderBottom: "1px solid #e5e7eb",
};

const td: React.CSSProperties = {
  padding: "6px 8px", borderBottom: "1px solid #f1f5f9",
};
