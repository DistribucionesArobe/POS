import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Nota = {
  id: number; folio: string; tipo: string; estatus: string;
  cliente_id: number; cliente_nombre: string; cliente_rfc: string | null;
  fecha: string;
  subtotal: number; iva: number; total: number;
  observaciones: string | null;
  cfdi?: { cfdi_id: number; uuid: string; cancelado: boolean; correo_enviado_a?: string | null };
};

type Factura = Nota;

const fmt = (n: number) => "$" + (n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" }) : "-";

export default function NotasCredito() {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [orden, setOrden] = useState<"fecha" | "monto" | "cliente">("fecha");
  const [ordenDir, setOrdenDir] = useState<"asc" | "desc">("desc");
  const [eligiendoFactura, setEligiendoFactura] = useState(false);
  const [facturaParaDevolver, setFacturaParaDevolver] = useState<Factura | null>(null);

  async function cargar() {
    setLoading(true);
    try {
      const r = await api.get("/api/ventas", { params: { tipo: "NOTA_CREDITO", limit: 500 } });
      setNotas(r.data || []);
    } catch { setNotas([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { cargar(); }, []);

  const filtradas = useMemo(() => {
    let lista = notas;
    const qq = q.trim().toLowerCase();
    if (qq) {
      const num = parseFloat(qq.replace(/[$,]/g, ""));
      const esN = !isNaN(num);
      lista = lista.filter(n =>
        n.cliente_nombre.toLowerCase().includes(qq)
        || n.folio.toLowerCase().includes(qq)
        || (n.cliente_rfc || "").toLowerCase().includes(qq)
        || (esN && (Math.abs(n.total - num) < 0.01 || n.total.toFixed(2).includes(qq)))
      );
    }
    if (desde) lista = lista.filter(n => new Date(n.fecha) >= new Date(desde));
    if (hasta) lista = lista.filter(n => new Date(n.fecha) <= new Date(hasta + "T23:59:59"));
    const dir = ordenDir === "asc" ? 1 : -1;
    lista = [...lista].sort((a, b) => {
      if (orden === "fecha") return dir * (new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      if (orden === "monto") return dir * (a.total - b.total);
      return dir * a.cliente_nombre.localeCompare(b.cliente_nombre);
    });
    return lista;
  }, [notas, q, desde, hasta, orden, ordenDir]);

  const totalMostrado = filtradas.reduce((a, n) => a + n.total, 0);

  function abrirPdf(id: number) {
    const base = api.defaults.baseURL || "";
    window.open(`${base}/api/ventas/${id}/pdf`, "_blank");
  }
  async function descargarXml(cfdi_id: number, uuid: string) {
    const r = await api.get(`/api/cfdi/${cfdi_id}/xml`, { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url; a.download = `${uuid}.xml`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return (
    <Layout title="Notas de crédito"
      subtitle="CFDI tipo Egreso - devoluciones, descuentos y bonificaciones"
      actions={
        <button onClick={() => setEligiendoFactura(true)}
          style={{
            background: "#059669", color: "white", border: 0,
            padding: "10px 16px", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>
          + Nueva nota de crédito
        </button>
      }>

      <div className="card" style={{ padding: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input className="input"
            placeholder="🔍 Buscar cliente, folio, RFC o importe..."
            value={q} onChange={(e) => setQ(e.target.value)}
            style={{ flex: "1 1 220px", minWidth: 220 }} />
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
          <select className="input" value={orden} onChange={(e) => setOrden(e.target.value as any)}
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
          <button onClick={() => { setQ(""); setDesde(""); setHasta(""); }}
            style={{
              background: "transparent", border: "1px solid #cbd5e1",
              padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
            }}>Limpiar</button>
        </div>
      </div>

      <div style={{ fontSize: 13, color: "#475569", padding: "0 4px 10px" }}>
        <strong>{filtradas.length}</strong> notas · Total devuelto: <strong style={{ color: "#dc2626" }}>-{fmt(totalMostrado)}</strong>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Cargando...</div>
        ) : filtradas.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
            Sin notas de crédito. Crea una desde el botón de arriba o desde una factura en "Mis Ventas".
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th>Folio NC</th><th>Cliente</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>Estatus</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((n) => (
                <tr key={n.id}>
                  <td style={{ fontSize: 13 }}>{fmtDate(n.fecha)}</td>
                  <td><code>{n.folio}</code></td>
                  <td>
                    {n.cliente_nombre}
                    {n.cliente_rfc && (
                      <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>
                        {n.cliente_rfc}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "#dc2626" }}>
                    -{fmt(n.total)}
                  </td>
                  <td>
                    {n.cfdi && !n.cfdi.cancelado ? (
                      <span className="badge badge-success" title={n.cfdi.uuid}>
                        ✓ CFDI {n.cfdi.uuid.slice(0, 8)}…
                      </span>
                    ) : n.cfdi?.cancelado ? (
                      <span className="badge badge-danger">cancelada</span>
                    ) : (
                      <span className="badge badge-warning">sin timbrar</span>
                    )}
                  </td>
                  <td style={{ display: "flex", gap: 4 }}>
                    <button className="btn-icon" onClick={() => abrirPdf(n.id)} title="Ver PDF">📄 PDF</button>
                    {n.cfdi && !n.cfdi.cancelado && (
                      <button className="btn-icon" onClick={() => descargarXml(n.cfdi!.cfdi_id, n.cfdi!.uuid)}>XML</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {eligiendoFactura && (
        <ElegirFacturaModal
          onClose={() => setEligiendoFactura(false)}
          onSeleccionar={(f) => { setEligiendoFactura(false); setFacturaParaDevolver(f); }}
        />
      )}

      {facturaParaDevolver && (
        <DevolucionNcModal
          factura={facturaParaDevolver}
          onClose={() => setFacturaParaDevolver(null)}
          onSuccess={() => { setFacturaParaDevolver(null); cargar(); }}
        />
      )}
    </Layout>
  );
}


// ---------- Modal: Elegir factura origen ----------

function ElegirFacturaModal({ onClose, onSeleccionar }: {
  onClose: () => void; onSeleccionar: (f: Factura) => void;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);

  async function buscar() {
    setLoading(true);
    try {
      const r = await api.get("/api/ventas", {
        params: { tipo: "FACTURA", q: q || undefined, limit: 50 },
      });
      setRows(r.data || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { buscar(); }, []);
  useEffect(() => { const t = setTimeout(buscar, 300); return () => clearTimeout(t); }, [q]);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 12,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 10, padding: 20,
        width: "100%", maxWidth: 760, maxHeight: "94vh", overflow: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Elige la factura a la que harás la nota de crédito</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <input className="input" autoFocus
          placeholder="Buscar factura por folio, cliente o RFC..."
          value={q} onChange={(e) => setQ(e.target.value)}
          style={{ width: "100%", marginBottom: 10 }} />
        {loading ? (
          <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Buscando...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Sin facturas con esos filtros.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Fecha</th><th>Folio</th><th>Cliente</th><th style={{ textAlign: "right" }}>Total</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12 }}>{fmtDate(r.fecha)}</td>
                  <td><code>{r.folio}</code></td>
                  <td>{r.cliente_nombre}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(r.total)}</td>
                  <td>
                    <button className="btn btn-sm" onClick={() => onSeleccionar(r)}>
                      → Elegir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


// ---------- Modal: Crear NC desde una factura ----------

function DevolucionNcModal({ factura, onClose, onSuccess }: {
  factura: Factura; onClose: () => void; onSuccess: () => void;
}) {
  const [conceptos, setConceptos] = useState<{ variante_id: number; descripcion: string; max: number; cantidad: number; precio: number }[]>([]);
  const [motivo, setMotivo] = useState("");
  const [timbrar, setTimbrar] = useState(!!factura.cfdi && !factura.cfdi.cancelado);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/api/ventas/${factura.id}/conceptos`);
        setConceptos((r.data || []).map((c: any) => ({
          variante_id: c.variante_id,
          descripcion: c.descripcion,
          max: c.cantidad,
          cantidad: 0,
          precio: c.precio_unitario,
        })));
      } catch (err: any) {
        alert("Error cargando conceptos: " + (err.response?.data?.detail || err.message));
        onClose();
      } finally { setLoading(false); }
    })();
  }, [factura.id]);

  function setCant(idx: number, val: number) {
    const c = [...conceptos];
    c[idx].cantidad = Math.max(0, Math.min(val, c[idx].max));
    setConceptos(c);
  }
  function devolverTodo() {
    setConceptos(conceptos.map(c => ({ ...c, cantidad: c.max })));
  }

  const subtotal = conceptos.reduce((a, c) => a + c.cantidad * c.precio, 0);
  const iva = subtotal * 0.16;
  const total = subtotal + iva;

  async function confirmar() {
    const items = conceptos.filter(c => c.cantidad > 0);
    if (items.length === 0) return alert("Captura al menos una cantidad a devolver");
    if (!confirm(
      `Crear NOTA DE CREDITO por ${fmt(total)}?\n\n` +
      (timbrar ? "Se intentara timbrar CFDI Egreso ante el SAT." : "Solo registro interno (sin timbrar).")
    )) return;
    setBusy(true);
    try {
      const r = await api.post("/api/ventas/devolucion", {
        factura_id: factura.id,
        conceptos: items.map(c => ({ variante_id: c.variante_id, cantidad: c.cantidad })),
        motivo: motivo || null,
        timbrar_cfdi_egreso: timbrar,
      });
      let msg = `✓ Nota de credito creada: ${r.data.folio}\nTotal devuelto: ${fmt(r.data.total)}`;
      if (r.data.cfdi) msg += `\nCFDI Egreso timbrado: ${r.data.cfdi.uuid}`;
      if (r.data.cfdi_error) msg += `\n\n⚠ No se pudo timbrar:\n${r.data.cfdi_error}`;
      alert(msg);
      onSuccess();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: 12,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 10, padding: 20,
        width: "100%", maxWidth: 760, maxHeight: "94vh", overflow: "auto",
      }}>
        <h3 style={{ margin: "0 0 4px" }}>Nota de crédito · Factura {factura.folio}</h3>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 12px" }}>
          Cliente: <strong>{factura.cliente_nombre}</strong> ·
          Total original: <strong>{fmt(factura.total)}</strong>
        </p>
        {loading ? <p>Cargando conceptos...</p> : (
          <>
            <button onClick={devolverTodo}
              style={{
                marginBottom: 10, background: "#f1f5f9", border: "1px solid #cbd5e1",
                padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
              }}>Devolver todo</button>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: "center" }}>Vendido</th>
                  <th>Devolver</th>
                  <th style={{ textAlign: "right" }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {conceptos.map((c, idx) => (
                  <tr key={idx}>
                    <td>{c.descripcion}</td>
                    <td style={{ textAlign: "center" }}>{c.max}</td>
                    <td>
                      <input className="input" type="number" min="0" max={c.max} step="0.01"
                        value={c.cantidad} style={{ width: 100 }}
                        onChange={(e) => setCant(idx, +e.target.value)} />
                    </td>
                    <td style={{ textAlign: "right" }}>{fmt(c.cantidad * c.precio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <div style={{ minWidth: 260, padding: 12, background: "#fef2f2", borderRadius: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>Subtotal<span>{fmt(subtotal)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>IVA<span>{fmt(iva)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700,
                  paddingTop: 6, borderTop: "1px solid #fecaca", color: "#dc2626" }}>
                  Devolver <span>-{fmt(total)}</span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, color: "#475569" }}>Motivo de devolución</label>
              <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Producto dañado, error en surtido, cliente cambió de opinión..." />
            </div>
            {factura.cfdi && !factura.cfdi.cancelado && (
              <div style={{ marginTop: 12, padding: 10, background: "#eff6ff", borderRadius: 6 }}>
                <label style={{ fontSize: 13, display: "flex", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={timbrar} onChange={(e) => setTimbrar(e.target.checked)} />
                  Timbrar CFDI Egreso al SAT (recomendado si la factura ya está timbrada)
                </label>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={onClose} disabled={busy}
                style={{
                  padding: "10px 16px", background: "transparent", border: "1px solid #cbd5e1",
                  borderRadius: 6, cursor: "pointer",
                }}>Cancelar</button>
              <button onClick={confirmar} disabled={busy}
                style={{
                  flex: 1, padding: "10px 16px",
                  background: busy ? "#94a3b8" : "#dc2626", color: "white", border: 0,
                  borderRadius: 6, fontWeight: 700, cursor: busy ? "wait" : "pointer",
                }}>
                {busy ? "Creando..." : `Crear nota de crédito (${fmt(total)})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
