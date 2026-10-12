import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Item = {
  variante_id: number; sku: string; nombre: string;
  cantidad: number; precio: number;  // SIN IVA siempre (base)
  tasa_iva: number;
};
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
  const [mostrarSug, setMostrarSug] = useState(false);
  const [idxSug, setIdxSug] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [pagos, setPagos] = useState<PagoRow[]>([{ forma_pago_sat: "01", monto: 0 }]);
  // Toggle: cuando esta ON, el precio desplegado y editable YA INCLUYE IVA.
  const [preciosConIva, setPreciosConIva] = useState<boolean>(() => {
    return localStorage.getItem("venta_precios_con_iva") === "1";
  });
  useEffect(() => {
    localStorage.setItem("venta_precios_con_iva", preciosConIva ? "1" : "0");
  }, [preciosConIva]);

  // ===== AUTOCOMPLETE DEBOUNCED =====
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = busqueda.trim();
    if (q.length < 2) {
      setSugerencias([]);
      setMostrarSug(false);
      return;
    }
    setBuscando(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const r = await api.get("/api/productos/buscar-variante", { params: { q } });
        setSugerencias(r.data || []);
        setMostrarSug(true);
        setIdxSug(0);
      } catch { /* silent */ }
      finally { setBuscando(false); }
    }, 280);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [busqueda]);

  function agregar(s: any) {
    const tasa = s.tasa_iva !== undefined ? +s.tasa_iva : 0.16;
    setItems([...items, {
      variante_id: s.id, sku: s.sku, nombre: s.nombre,
      cantidad: 1, precio: +s.precio, tasa_iva: tasa,
    }]);
    setSugerencias([]); setBusqueda(""); setMostrarSug(false);
  }

  function onKeyBusqueda(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!mostrarSug || sugerencias.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setIdxSug(i => Math.min(sugerencias.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdxSug(i => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); agregar(sugerencias[idxSug]); }
    else if (e.key === "Escape") { setMostrarSug(false); }
  }

  function quitar(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  function actualizarCantidad(idx: number, cantidad: number) {
    const c = [...items];
    c[idx].cantidad = cantidad;
    setItems(c);
  }

  // Precio mostrado: si el toggle esta ON, muestra precio * (1 + tasa). Siempre guardamos base.
  function precioMostrado(it: Item): number {
    return preciosConIva ? it.precio * (1 + it.tasa_iva) : it.precio;
  }

  function actualizarPrecio(idx: number, valorInputado: number) {
    const c = [...items];
    const tasa = c[idx].tasa_iva;
    // Si el toggle esta ON, el usuario capturo precio-con-IVA; convertirlo a base.
    c[idx].precio = preciosConIva ? +(valorInputado / (1 + tasa)).toFixed(6) : +valorInputado.toFixed(6);
    setItems(c);
  }

  // Totales: siempre calculados desde precio BASE con tasa de cada item
  const subtotal = items.reduce((a, i) => a + i.cantidad * i.precio, 0);
  const iva = items.reduce((a, i) => a + i.cantidad * i.precio * i.tasa_iva, 0);
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
          <div style={{ gridColumn: "span 2", display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              padding: "10px 14px", background: preciosConIva ? "#dcfce7" : "#f1f5f9",
              border: `2px solid ${preciosConIva ? "#10b981" : "#cbd5e1"}`, borderRadius: 8,
              fontWeight: 700, fontSize: 13, userSelect: "none",
            }}>
              <input type="checkbox" checked={preciosConIva}
                onChange={(e) => setPreciosConIva(e.target.checked)}
                style={{ width: 18, height: 18, cursor: "pointer" }} />
              {preciosConIva ? "✓ Precios YA incluyen IVA" : "Precios SIN IVA (se suma al total)"}
            </label>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, position: "relative" }}>
        <div style={{ marginBottom: 4, fontSize: 12, color: "var(--color-text-secondary)" }}>
          Escribe para buscar — autocompleta por SKU o nombre. ↑↓ para elegir, Enter para agregar.
        </div>
        <input className="input" autoFocus
          placeholder="Buscar producto por SKU o nombre..." value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={onKeyBusqueda}
          onFocus={() => sugerencias.length > 0 && setMostrarSug(true)}
          onBlur={() => setTimeout(() => setMostrarSug(false), 180)}
          style={{ width: "100%" }} />
        {buscando && (
          <div style={{ position: "absolute", right: 24, top: 42, fontSize: 11, color: "#64748b" }}>
            buscando...
          </div>
        )}
        {mostrarSug && sugerencias.length > 0 && (
          <div style={{
            position: "absolute", left: 16, right: 16, top: 72, zIndex: 20,
            background: "white", border: "1px solid var(--color-border)",
            borderRadius: 6, overflow: "hidden", maxHeight: 320, overflowY: "auto",
            boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
          }}>
            {sugerencias.map((s, i) => (
              <div key={s.id}
                onMouseDown={(e) => { e.preventDefault(); agregar(s); }}
                onMouseEnter={() => setIdxSug(i)}
                style={{
                  padding: "10px 12px", cursor: "pointer",
                  borderBottom: "1px solid #f1f5f9",
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", gap: 10,
                  background: i === idxSug ? "#eff6ff" : "white",
                }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13 }}>
                    <strong>{s.sku}</strong> · {s.nombre}
                  </div>
                  {s.presentacion && (
                    <div style={{ fontSize: 11, color: "#64748b" }}>{s.presentacion}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <span className="badge badge-info">
                    {fmt(preciosConIva ? s.precio * (1 + (s.tasa_iva ?? 0.16)) : s.precio)}
                    {preciosConIva && <span style={{ fontSize: 9, marginLeft: 2 }}>c/IVA</span>}
                  </span>
                  <span className="badge">stock {s.stock}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {busqueda.length >= 2 && !buscando && sugerencias.length === 0 && (
          <div style={{ marginTop: 8, padding: 10, fontSize: 13, color: "#94a3b8" }}>
            Sin resultados para "{busqueda}"
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
              <tr>
                <th>SKU</th><th>Producto</th><th>Cantidad</th>
                <th style={{ textAlign: "right" }}>
                  Precio {preciosConIva ? "(c/IVA)" : "(s/IVA)"}
                </th>
                <th style={{ textAlign: "right" }}>Importe</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i, idx) => (
                <tr key={idx}>
                  <td><code>{i.sku}</code></td>
                  <td>{i.nombre}</td>
                  <td>
                    <input className="input" type="number" min="0.01" step="0.01" value={i.cantidad}
                      style={{ width: 90 }}
                      onChange={(e) => actualizarCantidad(idx, +e.target.value)} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input className="input" type="number" min="0" step="0.01"
                      value={+precioMostrado(i).toFixed(2)}
                      onChange={(e) => actualizarPrecio(idx, +e.target.value)}
                      style={{ width: 110, textAlign: "right" }} />
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    {fmt(i.cantidad * precioMostrado(i))}
                  </td>
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
                <span style={{ color: "var(--color-text-secondary)" }}>Subtotal (s/IVA)</span>
                <span>{fmt(subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-secondary)" }}>IVA</span>
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
