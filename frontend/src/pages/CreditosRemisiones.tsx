import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Modo = "CREDITOS" | "REMISIONES";
type OrdenCampo = "fecha" | "monto" | "cliente";

type DocRow = {
  id: number; folio: string; tipo: string; estatus: string;
  cliente_id: number; cliente_nombre: string; cliente_rfc: string | null;
  fecha: string;
  subtotal: number; iva: number; total: number;
  saldo: number; facturada: boolean;
  metodo_pago_sat: string;
  observaciones: string | null;
};

const fmt = (n: number) => "$" + (n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" }) : "-";

export default function CreditosRemisiones() {
  const nav = useNavigate();
  const [modo, setModo] = useState<Modo>("CREDITOS");
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [clienteSel, setClienteSel] = useState<string>("");
  const [orden, setOrden] = useState<OrdenCampo>("fecha");
  const [ordenDir, setOrdenDir] = useState<"asc" | "desc">("desc");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");
  // Remisiones: multi-seleccion para convertir
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());

  async function cargar() {
    setLoading(true);
    try {
      if (modo === "CREDITOS") {
        // Facturas a credito pendientes (metodo_pago_sat = PPD y saldo > 0)
        const r = await api.get("/api/ventas", {
          params: { tipo: "FACTURA", limit: 500 },
        });
        setRows((r.data || []).filter((d: DocRow) =>
          d.metodo_pago_sat === "PPD" && d.saldo > 0 && d.estatus !== "CANCELADO"
        ));
      } else {
        const r = await api.get("/api/ventas", {
          params: { tipo: "REMISION", solo_pendientes: true, limit: 500 },
        });
        setRows(r.data || []);
      }
    } catch { setRows([]); }
    finally { setLoading(false); }
    setSeleccion(new Set());
  }
  useEffect(() => { cargar(); }, [modo]);

  const clientesUnicos = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) map.set(r.cliente_id, r.cliente_nombre);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtradas = useMemo(() => {
    let lista = rows;
    if (clienteSel) lista = lista.filter(r => String(r.cliente_id) === clienteSel);
    if (q.trim()) {
      const query = q.trim().toLowerCase();
      const comoNum = parseFloat(query.replace(/[$,]/g, ""));
      const esNum = !isNaN(comoNum);
      lista = lista.filter(r =>
        r.cliente_nombre.toLowerCase().includes(query)
        || r.folio.toLowerCase().includes(query)
        || (r.cliente_rfc || "").toLowerCase().includes(query)
        || (esNum && (
          Math.abs(r.total - comoNum) < 0.01
          || Math.abs(r.saldo - comoNum) < 0.01
          || r.total.toFixed(2).includes(query)
          || r.saldo.toFixed(2).includes(query)
        ))
      );
    }
    if (desde) {
      const d0 = new Date(desde);
      lista = lista.filter(r => new Date(r.fecha) >= d0);
    }
    if (hasta) {
      const d1 = new Date(hasta + "T23:59:59");
      lista = lista.filter(r => new Date(r.fecha) <= d1);
    }
    const dir = ordenDir === "asc" ? 1 : -1;
    lista = [...lista].sort((a, b) => {
      if (orden === "fecha") return dir * (new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      if (orden === "monto") return dir * ((modo === "CREDITOS" ? a.saldo : a.total) - (modo === "CREDITOS" ? b.saldo : b.total));
      return dir * a.cliente_nombre.localeCompare(b.cliente_nombre);
    });
    return lista;
  }, [rows, q, clienteSel, desde, hasta, orden, ordenDir, modo]);

  const totalMostrado = filtradas.reduce((a, r) => a + (modo === "CREDITOS" ? r.saldo : r.total), 0);

  // ----- Acciones -----

  function toggleSel(id: number) {
    const s = new Set(seleccion);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSeleccion(s);
  }
  function selToggleTodos() {
    if (seleccion.size === filtradas.length) setSeleccion(new Set());
    else setSeleccion(new Set(filtradas.map(r => r.id)));
  }

  async function convertirRemisiones(tipoDest: "TICKET" | "FACTURA") {
    if (seleccion.size === 0) { alert("Marca al menos una remisión"); return; }
    // validar mismo cliente
    const cliIds = new Set(filtradas.filter(r => seleccion.has(r.id)).map(r => r.cliente_id));
    if (cliIds.size > 1) { alert("Las remisiones deben ser del MISMO cliente para convertir en 1 documento"); return; }
    const metodoPagoSat = tipoDest === "FACTURA"
      ? (confirm("¿Factura al CONTADO (PUE)?\n\nAceptar = PUE  ·  Cancelar = PPD (crédito)") ? "PUE" : "PPD")
      : "PUE";
    if (!confirm(`Convertir ${seleccion.size} remisión(es) en 1 ${tipoDest}?`)) return;
    try {
      const r = await api.post("/api/ventas/desde-remisiones", {
        remision_ids: Array.from(seleccion),
        tipo_destino: tipoDest,
        metodo_pago_sat: metodoPagoSat,
      });
      alert(`✅ ${tipoDest} creado: ${r.data.folio}\nTotal: ${fmt(r.data.total)}`);
      cargar();
    } catch (e: any) {
      alert("Error: " + (e.response?.data?.detail || e.message));
    }
  }

  function irACarteraParaCobrar(r: DocRow) {
    // La seccion Cartera ya tiene el flujo de abono + complemento PPD
    nav(`/cartera?folio=${encodeURIComponent(r.folio)}`);
  }

  function abrirPdf(r: DocRow) {
    const base = api.defaults.baseURL || "";
    window.open(`${base}/api/ventas/${r.id}/pdf`, "_blank");
  }

  // ----- UI -----

  return (
    <Layout title="Créditos y Remisiones"
      subtitle={modo === "CREDITOS"
        ? "Facturas a crédito (PPD) pendientes de cobro / complemento de pago"
        : "Remisiones no facturadas — convierte a Ticket o Factura"}>

      {/* SWITCH */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 10,
        background: "#f1f5f9", padding: 4, borderRadius: 8, width: "fit-content",
      }}>
        <button onClick={() => setModo("CREDITOS")}
          style={{
            padding: "10px 20px", border: 0, borderRadius: 6, cursor: "pointer",
            fontSize: 14, fontWeight: 800,
            background: modo === "CREDITOS" ? "#f59e0b" : "transparent",
            color: modo === "CREDITOS" ? "white" : "#64748b",
          }}>
          💳 CRÉDITOS
        </button>
        <button onClick={() => setModo("REMISIONES")}
          style={{
            padding: "10px 20px", border: 0, borderRadius: 6, cursor: "pointer",
            fontSize: 14, fontWeight: 800,
            background: modo === "REMISIONES" ? "#1e40af" : "transparent",
            color: modo === "REMISIONES" ? "white" : "#64748b",
          }}>
          📋 REMISIONES
        </button>
      </div>

      {/* FILTROS */}
      <div className="card" style={{ padding: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input className="input"
            placeholder="🔍 Buscar cliente, folio, RFC o importe..."
            value={q} onChange={(e) => setQ(e.target.value)}
            style={{ flex: "1 1 200px", minWidth: 200 }} />
          <select className="input" value={clienteSel}
            onChange={(e) => setClienteSel(e.target.value)}
            style={{ minWidth: 180 }}>
            <option value="">Todos los clientes</option>
            {clientesUnicos.map(([id, nombre]) => (
              <option key={id} value={id}>{nombre}</option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: "#475569" }}>
            Desde: <input type="date" className="input" value={desde}
              onChange={(e) => setDesde(e.target.value)}
              style={{ padding: "4px 8px", width: 130 }} />
          </label>
          <label style={{ fontSize: 12, color: "#475569" }}>
            Hasta: <input type="date" className="input" value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              style={{ padding: "4px 8px", width: 130 }} />
          </label>
          <select className="input" value={orden}
            onChange={(e) => setOrden(e.target.value as OrdenCampo)}
            style={{ padding: "4px 8px" }}>
            <option value="fecha">Ordenar por fecha</option>
            <option value="monto">Ordenar por monto</option>
            <option value="cliente">Ordenar por cliente</option>
          </select>
          <button onClick={() => setOrdenDir(d => d === "asc" ? "desc" : "asc")}
            style={{
              background: "#e2e8f0", border: 0, padding: "6px 12px",
              borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700,
            }}>
            {ordenDir === "asc" ? "↑ ASC" : "↓ DESC"}
          </button>
          <button onClick={() => { setQ(""); setClienteSel(""); setDesde(""); setHasta(""); }}
            style={{
              background: "transparent", border: "1px solid #cbd5e1",
              padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
            }}>
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* RESUMEN + ACCIONES REMISIONES */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 4px 10px",
      }}>
        <div style={{ fontSize: 13, color: "#475569" }}>
          <strong>{filtradas.length}</strong> {modo === "CREDITOS" ? "facturas" : "remisiones"} ·
          Total {modo === "CREDITOS" ? "saldo" : ""}: <strong style={{ color: "#0f172a" }}>{fmt(totalMostrado)}</strong>
        </div>
        {modo === "REMISIONES" && seleccion.size > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#475569", alignSelf: "center" }}>
              {seleccion.size} seleccionada(s)
            </span>
            <button onClick={() => convertirRemisiones("TICKET")}
              style={{
                background: "#059669", color: "white", border: 0,
                padding: "8px 14px", borderRadius: 6, cursor: "pointer",
                fontSize: 13, fontWeight: 700,
              }}>
              → Convertir a TICKET
            </button>
            <button onClick={() => convertirRemisiones("FACTURA")}
              style={{
                background: "#1e40af", color: "white", border: 0,
                padding: "8px 14px", borderRadius: 6, cursor: "pointer",
                fontSize: 13, fontWeight: 700,
              }}>
              → Convertir a FACTURA
            </button>
          </div>
        )}
      </div>

      {/* TABLA */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Cargando...</div>
        ) : filtradas.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
            Sin {modo === "CREDITOS" ? "créditos pendientes" : "remisiones por facturar"} con los filtros actuales.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                {modo === "REMISIONES" && (
                  <th style={{ width: 36, textAlign: "center" }}>
                    <input type="checkbox"
                      checked={seleccion.size === filtradas.length && filtradas.length > 0}
                      onChange={selToggleTodos} />
                  </th>
                )}
                <th>Fecha</th>
                <th>Folio</th>
                <th>Cliente</th>
                <th style={{ textAlign: "right" }}>Total</th>
                {modo === "CREDITOS" && <th style={{ textAlign: "right" }}>Saldo</th>}
                <th>Estatus</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((r) => (
                <tr key={r.id} style={seleccion.has(r.id) ? { background: "#eff6ff" } : undefined}>
                  {modo === "REMISIONES" && (
                    <td style={{ textAlign: "center" }}>
                      <input type="checkbox"
                        checked={seleccion.has(r.id)}
                        onChange={() => toggleSel(r.id)} />
                    </td>
                  )}
                  <td style={{ fontSize: 13 }}>{fmtDate(r.fecha)}</td>
                  <td><code>{r.folio}</code></td>
                  <td>
                    {r.cliente_nombre}
                    {r.cliente_rfc && (
                      <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>
                        {r.cliente_rfc}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(r.total)}</td>
                  {modo === "CREDITOS" && (
                    <td style={{ textAlign: "right", fontWeight: 700, color: "#dc2626" }}>
                      {fmt(r.saldo)}
                    </td>
                  )}
                  <td>
                    <span className={`badge ${r.estatus === "CANCELADO" ? "badge-danger"
                      : r.saldo === 0 ? "badge-success" : "badge-warning"}`}>
                      {r.estatus}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: 4 }}>
                    <button className="btn-icon" onClick={() => abrirPdf(r)} title="Ver PDF">
                      📄
                    </button>
                    {modo === "CREDITOS" ? (
                      <button className="btn btn-sm" onClick={() => irACarteraParaCobrar(r)}>
                        💵 Abonar / Complemento
                      </button>
                    ) : (
                      <>
                        <button className="btn btn-sm" onClick={() => {
                          setSeleccion(new Set([r.id]));
                          setTimeout(() => convertirRemisiones("TICKET"), 50);
                        }}>→ Ticket</button>
                        <button className="btn btn-sm" onClick={() => {
                          setSeleccion(new Set([r.id]));
                          setTimeout(() => convertirRemisiones("FACTURA"), 50);
                        }}>→ Factura</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
