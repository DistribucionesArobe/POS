import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type CompraT = {
  id: number; folio: string; proveedor_id: number;
  uuid_cfdi: string | null; folio_factura_proveedor: string | null;
  subtotal: number; iva: number; total: number;
  estatus: string; fecha_recepcion: string;
};
type CxPT = {
  cxp_id: number; proveedor_id: number; proveedor: string;
  compra_id: number; compra_folio: string;
  monto_original: number; saldo: number;
  fecha_vencimiento: string | null;
};
type Concepto = {
  variante_id: number; sku: string; nombre: string;
  cantidad: number; costo_unitario: number;
};

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Compras() {
  const [tab, setTab] = useState<"compras" | "cxp">("compras");
  const [compras, setCompras] = useState<CompraT[]>([]);
  const [cxp, setCxp] = useState<CxPT[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);

  // Form de nueva compra
  const [proveedorId, setProveedorId] = useState<number>(0);
  const [uuid, setUuid] = useState("");
  const [folioProveedor, setFolioProveedor] = useState("");
  const [conIva, setConIva] = useState(true);
  const [notas, setNotas] = useState("");
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [busquedaProd, setBusquedaProd] = useState("");
  const [sugerencias, setSugerencias] = useState<any[]>([]);

  // Modal de abono
  const [pagandoCxp, setPagandoCxp] = useState<CxPT | null>(null);
  const [montoAbono, setMontoAbono] = useState(0);
  const [formaPago, setFormaPago] = useState("TRANSFERENCIA");

  async function cargar() {
    const [c, cp, pr] = await Promise.all([
      api.get("/api/cxp/compras"),
      api.get("/api/cxp/cartera"),
      api.get("/api/proveedores"),
    ]);
    setCompras(c.data);
    setCxp(cp.data);
    setProveedores(pr.data);
  }

  useEffect(() => { cargar(); }, []);

  function abrirNueva() {
    setMostrarForm(true);
    setProveedorId(proveedores[0]?.id || 0);
    setUuid(""); setFolioProveedor(""); setConIva(true); setNotas("");
    setConceptos([]);
  }

  async function buscarProd() {
    if (busquedaProd.length < 2) return;
    try {
      const r = await api.get(`/api/productos/sku/${encodeURIComponent(busquedaProd)}`);
      agregarConcepto(r.data);
    } catch {
      const r = await api.get("/api/productos/buscar-variante", { params: { q: busquedaProd } });
      if (r.data.length === 1) agregarConcepto(r.data[0]);
      else setSugerencias(r.data);
    }
  }

  function agregarConcepto(s: any) {
    setConceptos([...conceptos, {
      variante_id: s.id, sku: s.sku, nombre: s.nombre,
      cantidad: 1, costo_unitario: s.precio * 0.7,  // sugerencia: 70% del precio venta
    }]);
    setBusquedaProd(""); setSugerencias([]);
  }

  function actualizarConcepto(idx: number, key: "cantidad" | "costo_unitario", val: number) {
    const c = [...conceptos];
    c[idx][key] = val;
    setConceptos(c);
  }
  function quitarConcepto(idx: number) {
    setConceptos(conceptos.filter((_, i) => i !== idx));
  }

  const subtotal = conceptos.reduce((a, c) => a + c.cantidad * c.costo_unitario, 0);
  const ivaCalc = conIva ? subtotal * 0.16 : 0;
  const totalCalc = subtotal + ivaCalc;

  async function guardarCompra() {
    if (!proveedorId) return alert("Selecciona proveedor");
    if (conceptos.length === 0) return alert("Agrega al menos un concepto");
    try {
      const r = await api.post("/api/cxp/compras", {
        proveedor_id: proveedorId,
        conceptos: conceptos.map((c) => ({
          variante_id: c.variante_id,
          cantidad: c.cantidad,
          costo_unitario: c.costo_unitario,
        })),
        uuid_cfdi: uuid || null,
        folio_factura_proveedor: folioProveedor || null,
        con_iva: conIva,
        notas: notas || null,
      });
      alert(`Compra registrada: ${r.data.folio}\nTotal: ${fmt(r.data.total)}\nInventario y CxP actualizados.`);
      setMostrarForm(false);
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  function abrirAbono(c: CxPT) {
    setPagandoCxp(c);
    setMontoAbono(c.saldo);
  }

  async function confirmarAbono() {
    if (!pagandoCxp) return;
    try {
      await api.post("/api/cxp/abono", {
        cxp_id: pagandoCxp.cxp_id,
        monto: montoAbono,
        forma_pago: formaPago,
      });
      setPagandoCxp(null);
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  return (
    <Layout
      title="Compras"
      subtitle="Recepción de mercancía (afecta inventario)"
      actions={<button className="btn" onClick={abrirNueva}>+ Nueva compra</button>}
    >
      <div className="card" style={{ marginBottom: 12, background: "#dbeafe", border: "1px solid #3b82f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>¿Buscas Cuentas por Pagar?</strong>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#1e40af" }}>
            La gestión de CxP (a quién debes, cuánto, vencimientos) ahora vive en <strong>Tablero CxP</strong>.
          </p>
        </div>
        <a href="/cxp-tablero" className="btn">Ir al Tablero CxP →</a>
      </div>

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="card-header">Nueva compra (recepción de mercancía)</h3>
          <div className="form-grid">
            <div>
              <label>Proveedor *</label>
              <select className="input" value={proveedorId}
                onChange={(e) => setProveedorId(+e.target.value)}>
                <option value={0}>-- Selecciona --</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label>UUID CFDI proveedor (opcional)</label>
              <input className="input" value={uuid} onChange={(e) => setUuid(e.target.value)} placeholder="ABC12345-..." />
            </div>
            <div>
              <label>Folio factura proveedor</label>
              <input className="input" value={folioProveedor} onChange={(e) => setFolioProveedor(e.target.value)} />
            </div>
            <div>
              <label style={{ display: "block" }}>Con IVA 16%?</label>
              <label style={{ fontSize: 14 }}>
                <input type="checkbox" checked={conIva} onChange={(e) => setConIva(e.target.checked)} /> Sí
              </label>
            </div>
            <div className="form-grid-full">
              <label>Notas</label>
              <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </div>

          <h4 style={{ margin: "20px 0 8px" }}>Productos recibidos</h4>
          <div className="toolbar">
            <input className="input" placeholder="SKU exacto o nombre del producto..."
              value={busquedaProd} onChange={(e) => setBusquedaProd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), buscarProd())} />
            <button className="btn" onClick={buscarProd}>Buscar/Agregar</button>
          </div>
          {sugerencias.length > 0 && (
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 8 }}>
              {sugerencias.map((s) => (
                <div key={s.id} onClick={() => agregarConcepto(s)}
                  style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid var(--color-border)" }}>
                  <code>{s.sku}</code> · {s.nombre} · costo sugerido {fmt(s.precio * 0.7)}
                </div>
              ))}
            </div>
          )}

          {conceptos.length > 0 && (
            <table style={{ marginTop: 12 }}>
              <thead>
                <tr><th>SKU</th><th>Producto</th><th>Cant</th><th>Costo unit</th><th style={{ textAlign: "right" }}>Importe</th><th></th></tr>
              </thead>
              <tbody>
                {conceptos.map((c, idx) => (
                  <tr key={idx}>
                    <td><code>{c.sku}</code></td>
                    <td>{c.nombre}</td>
                    <td>
                      <input className="input" type="number" min="0.01" step="0.01" value={c.cantidad}
                        style={{ width: 80 }}
                        onChange={(e) => actualizarConcepto(idx, "cantidad", +e.target.value)} />
                    </td>
                    <td>
                      <input className="input" type="number" min="0" step="0.01" value={c.costo_unitario}
                        style={{ width: 100 }}
                        onChange={(e) => actualizarConcepto(idx, "costo_unitario", +e.target.value)} />
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(c.cantidad * c.costo_unitario)}</td>
                    <td><button className="btn-icon" onClick={() => quitarConcepto(idx)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {conceptos.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <div style={{ minWidth: 240 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>Subtotal</span><span>{fmt(subtotal)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-text-muted)" }}>
                  <span>IVA</span><span>{fmt(ivaCalc)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, paddingTop: 8, borderTop: "1px solid var(--color-border)", marginTop: 4 }}>
                  <span>Total</span><span>{fmt(totalCalc)}</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button className="btn" onClick={guardarCompra} disabled={conceptos.length === 0}>Registrar compra</button>
            <button className="btn-icon" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="card-header">Compras registradas con inventario ({compras.length})</h3>
        <table>
          <thead>
            <tr>
              <th>Folio</th><th>Proveedor</th><th>Factura prov.</th>
              <th>Fecha</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th>Estatus</th>
            </tr>
          </thead>
          <tbody>
            {compras.map((c) => (
              <tr key={c.id}>
                <td><code>{c.folio}</code></td>
                <td>#{c.proveedor_id}</td>
                <td>{c.folio_factura_proveedor || "-"}</td>
                <td>{new Date(c.fecha_recepcion).toLocaleDateString("es-MX")}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(c.total)}</td>
                <td><span className={`badge ${c.estatus === "PAGADA" ? "badge-success" : "badge-warning"}`}>{c.estatus}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {false && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Proveedor</th><th>Compra</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Saldo</th>
                <th>Vence</th><th></th>
              </tr>
            </thead>
            <tbody>
              {cxp.map((c) => (
                <tr key={c.cxp_id}>
                  <td>{c.proveedor}</td>
                  <td><code>{c.compra_folio}</code></td>
                  <td style={{ textAlign: "right" }}>{fmt(c.monto_original)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600, color: "var(--color-danger)" }}>{fmt(c.saldo)}</td>
                  <td>{c.fecha_vencimiento ? new Date(c.fecha_vencimiento).toLocaleDateString("es-MX") : "-"}</td>
                  <td>
                    <button className="btn btn-sm" onClick={() => abrirAbono(c)}>Pagar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagandoCxp && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }} onClick={() => setPagandoCxp(null)}>
          <div className="card" style={{ maxWidth: 500, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="card-header">Pago a proveedor</h3>
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 16px" }}>
              {pagandoCxp.proveedor} — Compra <code>{pagandoCxp.compra_folio}</code><br/>
              Saldo actual: <strong>{fmt(pagandoCxp.saldo)}</strong>
            </p>
            <div className="form-grid">
              <div>
                <label>Monto</label>
                <input className="input" type="number" step="0.01" value={montoAbono}
                  onChange={(e) => setMontoAbono(+e.target.value)} style={{ fontSize: 18 }} />
              </div>
              <div>
                <label>Forma de pago</label>
                <select className="input" value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="TARJETA">Tarjeta</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button className="btn" onClick={confirmarAbono}>Registrar pago</button>
              <button className="btn-icon" onClick={() => setPagandoCxp(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
