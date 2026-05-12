import { useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Item = { variante_id: number; sku: string; nombre: string; cantidad: number; precio: number };
type PagoRow = { forma_pago_sat: string; monto: number };

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FORMAS_PAGO_SAT = [
  { v: "01", t: "Efectivo" },
  { v: "03", t: "Transferencia" },
  { v: "04", t: "Tarjeta crédito" },
  { v: "28", t: "Tarjeta débito" },
];

export default function VentaNueva() {
  const [tipoSel, setTipoSel] = useState<"TICKET" | "REMISION" | "FACTURA_PUE" | "FACTURA_PPD">("TICKET");
  const tipo: "TICKET" | "REMISION" | "FACTURA" =
    tipoSel === "TICKET" ? "TICKET" :
    tipoSel === "REMISION" ? "REMISION" : "FACTURA";
  const esCredito = tipoSel === "REMISION" || tipoSel === "FACTURA_PPD";
  const metodoPagoSat = esCredito ? "PPD" : "PUE";
  const [clienteId, setClienteId] = useState<number>(1);
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [pagos, setPagos] = useState<PagoRow[]>([{ forma_pago_sat: "01", monto: 0 }]);

  async function buscar() {
    if (busqueda.length < 2) return;
    const r = await api.get("/api/productos/buscar-variante", { params: { q: busqueda } });
    setSugerencias(r.data);
  }

  function agregar(s: any) {
    setItems([...items, { variante_id: s.id, sku: s.sku, nombre: s.nombre, cantidad: 1, precio: s.precio }]);
    setSugerencias([]); setBusqueda("");
  }

  function quitar(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  const subtotal = items.reduce((a, i) => a + i.cantidad * i.precio, 0);
  const iva = subtotal * 0.16;
  const total = +(subtotal + iva).toFixed(2);
  const sumaPagos = +pagos.reduce((a, p) => a + (p.monto || 0), 0).toFixed(2);
  const usaSplit = pagos.length > 1;

  function setPago(idx: number, patch: Partial<PagoRow>) {
    setPagos(pagos.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function agregarPago() {
    if (pagos.length >= 2) return;
    setPagos([...pagos, { forma_pago_sat: "03", monto: Math.max(0, total - sumaPagos) }]);
  }
  function quitarPago(idx: number) {
    const nuevos = pagos.filter((_, i) => i !== idx);
    if (nuevos.length === 1) nuevos[0].monto = total;
    setPagos(nuevos.length ? nuevos : [{ forma_pago_sat: "01", monto: total }]);
  }
  function autoPago() {
    setPagos([{ forma_pago_sat: tipoSel === "FACTURA_PUE" ? "03" : "01", monto: total }]);
  }

  async function guardar() {
    if (!esCredito) {
      if (sumaPagos < total - 0.01) {
        alert(`Faltan ${fmt(total - sumaPagos)} por cubrir`);
        return;
      }
    }
    const payload: any = {
      tipo, cliente_id: clienteId,
      forma_pago_sat: esCredito ? "99" : (pagos[0]?.forma_pago_sat || "01"),
      metodo_pago_sat: metodoPagoSat,
      conceptos: items.map((i) => ({
        variante_id: i.variante_id, cantidad: i.cantidad, precio_unitario: i.precio,
      })),
    };
    if (!esCredito) {
      payload.pagos = pagos.map((p) => ({ forma_pago_sat: p.forma_pago_sat, monto: +p.monto }));
    }
    try {
      const r = await api.post("/api/ventas", payload);
      const base = api.defaults.baseURL || "";
      const pdfUrl = `${base}/api/ventas/${r.data.id}/pdf`;
      if (confirm(`Documento creado: ${r.data.folio}\n\nTotal: ${fmt(r.data.total)}\n\n¿Abrir PDF?`)) {
        window.open(pdfUrl, "_blank");
      }
      setItems([]);
      setPagos([{ forma_pago_sat: "01", monto: 0 }]);
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  return (
    <Layout title="Nueva venta" subtitle="Captura ticket, remision o factura">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <div>
            <label>Tipo de documento</label>
            <select className="input" value={tipoSel} onChange={(e) => setTipoSel(e.target.value as any)}>
              <option value="TICKET">Ticket (al contado)</option>
              <option value="REMISION">Remisión (a crédito, sin CFDI)</option>
              <option value="FACTURA_PUE">Factura CFDI - PUE (al contado)</option>
              <option value="FACTURA_PPD">Factura CFDI - PPD (a crédito)</option>
            </select>
          </div>
          <div>
            <label>Cliente ID</label>
            <input className="input" type="number" value={clienteId} onChange={(e) => setClienteId(+e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <input className="input" placeholder="Buscar producto por SKU o nombre..." value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} />
          <button className="btn" onClick={buscar}>Buscar</button>
        </div>
        {sugerencias.length > 0 && (
          <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, overflow: "hidden" }}>
            {sugerencias.map((s) => (
              <div key={s.id} onClick={() => agregar(s)}
                style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "white")}>
                <div>
                  <strong>{s.sku}</strong> · {s.nombre}
                </div>
                <div>
                  <span className="badge badge-info">{fmt(s.precio)}</span>
                  <span className="badge" style={{ marginLeft: 4 }}>stock {s.stock}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-header">Items</h3>
        {items.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)", textAlign: "center", padding: 24, margin: 0 }}>
            Sin productos. Busca arriba y haz click para agregar.
          </p>
        ) : (
          <table>
            <thead>
              <tr><th>SKU</th><th>Producto</th><th>Cantidad</th><th>Precio</th><th style={{ textAlign: "right" }}>Importe</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((i, idx) => (
                <tr key={idx}>
                  <td><code>{i.sku}</code></td>
                  <td>{i.nombre}</td>
                  <td>
                    <input className="input" type="number" min="0.01" step="0.01" value={i.cantidad}
                      style={{ width: 80 }}
                      onChange={(e) => {
                        const c = [...items]; c[idx].cantidad = +e.target.value; setItems(c);
                      }} />
                  </td>
                  <td>{fmt(i.precio)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(i.cantidad * i.precio)}</td>
                  <td><button className="btn-icon" onClick={() => quitar(idx)}>X</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {items.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <div style={{ minWidth: 360, display: "grid", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-secondary)" }}>Subtotal</span>
                <span>{fmt(subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-secondary)" }}>IVA 16%</span>
                <span>{fmt(iva)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-border)", paddingTop: 8, marginTop: 4 }}>
                <strong>Total</strong>
                <strong style={{ fontSize: 18 }}>{fmt(total)}</strong>
              </div>

              {!esCredito && (
                <div style={{ marginTop: 12, padding: 12, background: "var(--color-bg)", borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong style={{ fontSize: 13 }}>Forma(s) de pago</strong>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={autoPago} type="button"
                        style={{ fontSize: 11, padding: "3px 8px", border: "1px solid var(--color-border)",
                          background: "white", borderRadius: 4, cursor: "pointer" }}>
                        Auto
                      </button>
                      {pagos.length < 2 && (
                        <button onClick={agregarPago} type="button"
                          style={{ fontSize: 11, padding: "3px 8px", border: "1px dashed var(--color-border)",
                            background: "white", borderRadius: 4, cursor: "pointer" }}>
                          + 2do método
                        </button>
                      )}
                    </div>
                  </div>
                  {pagos.map((p, idx) => (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 110px auto", gap: 6, marginBottom: 4 }}>
                      <select className="input" value={p.forma_pago_sat}
                        onChange={(e) => setPago(idx, { forma_pago_sat: e.target.value })}
                        style={{ fontSize: 13 }}>
                        {FORMAS_PAGO_SAT.map((f) => <option key={f.v} value={f.v}>{f.t}</option>)}
                      </select>
                      <input className="input" type="number" step="0.01" value={p.monto}
                        onChange={(e) => setPago(idx, { monto: +e.target.value })}
                        style={{ fontSize: 13, textAlign: "right" }} />
                      {pagos.length > 1 && (
                        <button onClick={() => quitarPago(idx)} type="button"
                          style={{ background: "transparent", border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer", padding: "0 8px" }}>×</button>
                      )}
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6 }}>
                    <span style={{ color: "var(--color-text-secondary)" }}>Suma pagos</span>
                    <span style={{ color: sumaPagos < total - 0.01 ? "var(--color-danger)" : "var(--color-success)", fontWeight: 600 }}>
                      {fmt(sumaPagos)}
                      {sumaPagos < total - 0.01 && ` (falta ${fmt(total - sumaPagos)})`}
                      {sumaPagos > total + 0.01 && ` (cambio ${fmt(sumaPagos - total)})`}
                    </span>
                  </div>
                  {usaSplit && (
                    <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "6px 0 0" }}>
                      Pago combinado: CFDI usará Forma "99 — Por definir"
                    </p>
                  )}
                </div>
              )}

              <button className="btn" onClick={guardar} style={{ marginTop: 12, justifyContent: "center" }}>
                Guardar {tipo}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
