import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

// Optimizado para tablet: grid grande de productos, carrito lateral,
// COBRAR gigante. Ideal para grab & go (cafe, panaderia, dulceria).
// Usa la misma BD de productos: los que marques como Favorito ⭐ aparecen aqui.

type Variante = {
  id: number; sku: string;
  nombre: string; presentacion: string;
  precio: number; unidad: string;
  tasa_iva?: number;
  categoria?: string;
};

type Item = {
  variante_id: number; sku: string; nombre: string;
  precio: number; cantidad: number;
  tasa_iva?: number;
};

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Paleta rotativa de colores tipo POS moderno para los botones
const COLORES = [
  "#f97316", "#0ea5e9", "#10b981", "#8b5cf6", "#ec4899",
  "#eab308", "#14b8a6", "#f43f5e", "#3b82f6", "#a855f7",
];

export default function Mostrador() {
  const [productos, setProductos] = useState<Variante[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [cobrando, setCobrando] = useState(false);
  const [ultimaVenta, setUltimaVenta] = useState<any | null>(null);
  const [ultimoCambio, setUltimoCambio] = useState<number>(0);
  const [busqueda, setBusqueda] = useState("");
  const [clienteGenericoId, setClienteGenericoId] = useState<number | null>(null);
  // Modal de efectivo con calculo de cambio
  const [mostrarEfectivo, setMostrarEfectivo] = useState(false);
  // Modal de cerrar caja (corte del dia)
  const [mostrarCorte, setMostrarCorte] = useState(false);
  // Filtro por categoria (tab). "" = todas
  const [categoriaSel, setCategoriaSel] = useState<string>("");

  async function cargar() {
    try {
      const r = await api.get("/api/productos/favoritos-caja");
      // Si no hay favoritos, cargar todos activos como fallback
      let lista = r.data;
      if (!lista || lista.length === 0) {
        const r2 = await api.get("/api/productos/buscar-variante", { params: { q: "a" } });
        lista = r2.data;
      }
      setProductos(lista.map((p: any) => ({
        id: p.id, sku: p.sku, nombre: p.nombre,
        presentacion: p.presentacion || "",
        precio: p.precio, unidad: p.unidad || "Pieza",
        tasa_iva: p.tasa_iva,
        categoria: p.categoria || "Otros",
      })));
    } catch (err) {
      // silent
    }
  }
  async function cargarClienteGenerico() {
    try {
      const r = await api.get("/api/clientes/publico-general");
      setClienteGenericoId(r.data.id);
    } catch (err) {
      // silent
    }
  }
  useEffect(() => { cargar(); cargarClienteGenerico(); }, []);

  function agregar(p: Variante) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.variante_id === p.id);
      if (idx >= 0) {
        const c = [...prev];
        c[idx].cantidad += 1;
        return c;
      }
      return [...prev, {
        variante_id: p.id, sku: p.sku, nombre: p.nombre,
        precio: p.precio, cantidad: 1,
        tasa_iva: p.tasa_iva !== undefined ? p.tasa_iva : 0.16,
      }];
    });
  }

  function ajustarCantidad(idx: number, delta: number) {
    setItems(prev => {
      const c = [...prev];
      c[idx].cantidad = Math.max(0, c[idx].cantidad + delta);
      if (c[idx].cantidad === 0) return c.filter((_, i) => i !== idx);
      return c;
    });
  }

  function eliminar(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function limpiar() {
    setItems([]);
    setUltimaVenta(null);
    setUltimoCambio(0);
  }

  const subtotal = items.reduce((a, i) => a + i.cantidad * i.precio, 0);
  const iva = items.reduce((a, i) => {
    const t = i.tasa_iva !== undefined ? i.tasa_iva : 0.16;
    return a + i.cantidad * i.precio * t;
  }, 0);
  const total = subtotal + iva;

  async function cobrar(formaSat: string, recibido?: number) {
    if (items.length === 0) return;
    // Asegurar que tenemos cliente generico (lo cargamos on-demand si aun no esta)
    let clienteId = clienteGenericoId;
    if (!clienteId) {
      try {
        const r0 = await api.get("/api/clientes/publico-general");
        clienteId = r0.data.id;
        setClienteGenericoId(clienteId);
      } catch (err: any) {
        alert("No se pudo obtener el cliente generico: " + (err.response?.data?.detail || err.message));
        return;
      }
    }
    setCobrando(true);
    try {
      const r = await api.post("/api/ventas", {
        tipo: "TICKET",
        cliente_id: clienteId,
        forma_pago_sat: formaSat,
        metodo_pago_sat: "PUE",
        conceptos: items.map(i => ({
          variante_id: i.variante_id,
          cantidad: i.cantidad,
          precio_unitario: i.precio,
        })),
        pagos: [{ forma_pago_sat: formaSat, monto: total }],
      });
      setUltimaVenta(r.data);
      // Calcular cambio si es efectivo con recibido
      const cambio = (recibido !== undefined && recibido > total) ? (recibido - total) : 0;
      setUltimoCambio(cambio);
      setMostrarEfectivo(false);
    } catch (err: any) {
      alert("Error al cobrar: " + (err.response?.data?.detail || err.message));
    } finally {
      setCobrando(false);
    }
  }

  async function verTicket() {
    if (!ultimaVenta) return;
    try {
      const r = await api.get(`/api/ventas/${ultimaVenta.id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  // Categorias unicas presentes en los productos (para tabs)
  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const p of productos) set.add(p.categoria || "Otros");
    return Array.from(set).sort();
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    let lista = productos;
    if (categoriaSel) lista = lista.filter(p => (p.categoria || "Otros") === categoriaSel);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(p =>
        p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    }
    return lista;
  }, [productos, busqueda, categoriaSel]);

  // Emoji por categoria para hacer las tabs mas visuales
  const emojiCat = (c: string): string => {
    const k = c.toLowerCase();
    if (k.includes("bebid")) return "🥤";
    if (k.includes("cerveza")) return "🍺";
    if (k.includes("comid") || k.includes("aliment") || k.includes("snack")) return "🍔";
    if (k.includes("cancha")) return "🎾";
    if (k.includes("shop") || k.includes("pro")) return "🎽";
    if (k.includes("pala") || k.includes("raqueta")) return "🏓";
    if (k.includes("clase") || k.includes("academ")) return "📚";
    return "📦";
  };

  return (
    <Layout title="Mostrador" subtitle="Toca producto para agregarlo"
      actions={
        <button onClick={() => setMostrarCorte(true)}
          style={{
            background: "#dc2626", color: "white", border: 0,
            padding: "12px 22px", borderRadius: 8, fontSize: 16, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 2px 6px rgba(220,38,38,0.3)",
          }}>
          🔒 Cerrar caja
        </button>
      }>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 360px",
        gap: 12, height: "calc(100vh - 130px)",
      }}>
        {/* IZQUIERDA: grid de productos */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input placeholder="Buscar producto (opcional)..." value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{
              padding: "10px 14px", fontSize: 16, border: "1px solid #cbd5e1",
              borderRadius: 6, background: "white",
            }} />

          {/* Tabs de categoria */}
          {categorias.length > 1 && (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
              <button onClick={() => setCategoriaSel("")}
                style={{
                  padding: "10px 18px", border: 0, borderRadius: 8,
                  fontSize: 15, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                  background: categoriaSel === "" ? "#0f172a" : "#e2e8f0",
                  color: categoriaSel === "" ? "white" : "#334155",
                  minHeight: 44,
                }}>
                📋 Todo ({productos.length})
              </button>
              {categorias.map((c) => {
                const count = productos.filter(p => (p.categoria || "Otros") === c).length;
                const active = categoriaSel === c;
                return (
                  <button key={c} onClick={() => setCategoriaSel(c)}
                    style={{
                      padding: "10px 18px", border: 0, borderRadius: 8,
                      fontSize: 15, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                      background: active ? "#0f172a" : "#e2e8f0",
                      color: active ? "white" : "#334155",
                      minHeight: 44,
                    }}>
                    {emojiCat(c)} {c} ({count})
                  </button>
                );
              })}
            </div>
          )}
          <div style={{
            flex: 1, overflowY: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 8, padding: 4,
          }}>
            {productosFiltrados.length === 0 && (
              <div style={{
                gridColumn: "1 / -1", padding: 40, textAlign: "center",
                color: "#94a3b8", fontSize: 14, background: "white",
                borderRadius: 8,
              }}>
                No hay productos favoritos. Marca ⭐ en el catalogo o crea productos.
              </div>
            )}
            {productosFiltrados.map((p, i) => (
              <button key={p.id} onClick={() => agregar(p)}
                style={{
                  border: 0, borderRadius: 12, padding: "16px 12px",
                  background: COLORES[i % COLORES.length],
                  color: "white", cursor: "pointer",
                  minHeight: 120,
                  display: "flex", flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  transition: "transform 0.1s",
                }}
                onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.96)"}
                onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}>
                <div style={{ fontSize: 15, fontWeight: 700, textAlign: "left", lineHeight: 1.2 }}>
                  {p.nombre}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, textAlign: "right" }}>
                  {fmt(p.precio)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* DERECHA: carrito + cobrar */}
        <div style={{
          display: "flex", flexDirection: "column",
          background: "white", borderRadius: 12, padding: 12,
          border: "1px solid #cbd5e1",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #e2e8f0",
          }}>
            <strong style={{ fontSize: 16 }}>Orden ({items.length})</strong>
            {items.length > 0 && (
              <button onClick={limpiar} style={{
                background: "transparent", border: "1px solid #cbd5e1",
                borderRadius: 4, padding: "4px 10px", fontSize: 12,
                color: "#dc2626", cursor: "pointer",
              }}>Limpiar</button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {items.length === 0 && !ultimaVenta && (
              <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                Toca los productos de la izquierda
              </div>
            )}
            {items.map((it, i) => (
              <div key={i} style={{
                padding: 8, borderBottom: "1px solid #f1f5f9",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.nombre}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {fmt(it.precio)} c/u
                  </div>
                </div>
                <button onClick={() => ajustarCantidad(i, -1)}
                  style={{
                    width: 32, height: 32, borderRadius: 4,
                    background: "#f1f5f9", border: "1px solid #cbd5e1",
                    fontSize: 18, cursor: "pointer",
                  }}>−</button>
                <span style={{
                  minWidth: 28, textAlign: "center", fontSize: 16, fontWeight: 700,
                }}>{it.cantidad}</span>
                <button onClick={() => ajustarCantidad(i, +1)}
                  style={{
                    width: 32, height: 32, borderRadius: 4,
                    background: "#dbeafe", border: "1px solid #93c5fd",
                    fontSize: 18, cursor: "pointer", color: "#1e40af", fontWeight: 700,
                  }}>+</button>
                <div style={{ minWidth: 70, textAlign: "right", fontWeight: 700, fontSize: 13 }}>
                  {fmt(it.cantidad * it.precio)}
                </div>
                <button onClick={() => eliminar(i)}
                  style={{
                    width: 24, height: 24, borderRadius: 4,
                    background: "transparent", border: 0,
                    color: "#dc2626", fontSize: 16, cursor: "pointer",
                  }}>×</button>
              </div>
            ))}
          </div>

          {/* Totales + botones cobrar */}
          {items.length > 0 && !ultimaVenta && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "2px solid #0f172a" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b" }}>
                <span>IVA</span><span>{fmt(iva)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between",
                fontSize: 32, fontWeight: 800, marginTop: 4, paddingTop: 4,
                borderTop: "1px solid #e2e8f0" }}>
                <span>TOTAL</span><span>{fmt(total)}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
                <button onClick={() => setMostrarEfectivo(true)} disabled={cobrando}
                  style={{
                    padding: "16px 8px", background: cobrando ? "#94a3b8" : "#10b981",
                    color: "white", border: 0, borderRadius: 8,
                    fontSize: 15, fontWeight: 700, cursor: cobrando ? "wait" : "pointer",
                  }}>
                  💵<br/>Efectivo
                </button>
                <button onClick={() => cobrar("04")} disabled={cobrando}
                  style={{
                    padding: "16px 8px", background: cobrando ? "#94a3b8" : "#3b82f6",
                    color: "white", border: 0, borderRadius: 8,
                    fontSize: 15, fontWeight: 700, cursor: cobrando ? "wait" : "pointer",
                  }}>
                  💳<br/>Tarjeta
                </button>
                <button onClick={() => cobrar("03")} disabled={cobrando}
                  style={{
                    padding: "16px 8px", background: cobrando ? "#94a3b8" : "#8b5cf6",
                    color: "white", border: 0, borderRadius: 8,
                    fontSize: 15, fontWeight: 700, cursor: cobrando ? "wait" : "pointer",
                  }}>
                  📱<br/>Transfer
                </button>
              </div>
            </div>
          )}

          {ultimaVenta && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "2px solid #10b981" }}>
              <div style={{ padding: 12, background: "#dcfce7", borderRadius: 6,
                textAlign: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#166534" }}>
                  ✓ Cobrado {fmt(+ultimaVenta.total)}
                </div>
                <div style={{ fontSize: 11, color: "#166534" }}>
                  Folio {ultimaVenta.folio}
                </div>
              </div>
              {ultimoCambio > 0 && (
                <div style={{
                  padding: 16, background: "#fef3c7", border: "2px solid #f59e0b",
                  borderRadius: 8, textAlign: "center", marginBottom: 8,
                }}>
                  <div style={{ fontSize: 13, color: "#92400e", fontWeight: 700 }}>
                    CAMBIO A ENTREGAR
                  </div>
                  <div style={{ fontSize: 42, fontWeight: 900, color: "#92400e", lineHeight: 1 }}>
                    {fmt(ultimoCambio)}
                  </div>
                </div>
              )}
              <button onClick={verTicket} style={{
                width: "100%", padding: "12px", background: "#0ea5e9",
                color: "white", border: 0, borderRadius: 6, fontWeight: 700,
                fontSize: 14, marginBottom: 6, cursor: "pointer",
              }}>
                📄 Ver ticket PDF
              </button>
              <button onClick={limpiar} style={{
                width: "100%", padding: "14px", background: "#0f172a",
                color: "white", border: 0, borderRadius: 6, fontWeight: 700,
                fontSize: 16, cursor: "pointer",
              }}>
                Nueva orden →
              </button>
            </div>
          )}
        </div>
      </div>

      {mostrarEfectivo && (
        <EfectivoModal
          total={total}
          onCancelar={() => setMostrarEfectivo(false)}
          onConfirmar={(recibido) => cobrar("01", recibido)}
          cobrando={cobrando}
        />
      )}

      {mostrarCorte && (
        <CerrarCajaModal onClose={() => setMostrarCorte(false)} />
      )}
    </Layout>
  );
}


// ===== Modal de Cerrar Caja (corte del dia, super simple para tablet) =====

function imprimirRecibo() {
  // Imprime solo el contenido con id="recibo-corte-print"
  const el = document.getElementById("recibo-corte-print");
  if (!el) { window.print(); return; }
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) { window.print(); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>Corte de caja</title>
    <style>
      body { font-family: 'Courier New', monospace; font-size: 12px; padding: 12px; color: #000; }
      h1,h2,h3 { margin: 4px 0; }
      .row { display: flex; justify-content: space-between; margin: 2px 0; }
      .sep { border-top: 1px dashed #000; margin: 8px 0; }
      .total { font-weight: bold; font-size: 14px; }
      .center { text-align: center; }
      table { width: 100%; font-size: 11px; border-collapse: collapse; }
      td { padding: 2px 0; }
    </style>
  </head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 300);
}


function ReciboCorte({ cerrado, preview }: { cerrado: any; preview: any }) {
  const ahora = new Date();
  const horaCierre = ahora.toLocaleString("es-MX", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const cajero = localStorage.getItem("nombre") || "Cajero";
  const estacion = (() => {
    const uid = localStorage.getItem("usuario_id") || "";
    return uid.padStart(2, "0");
  })();
  const empresaNombre = (() => {
    try { return JSON.parse(localStorage.getItem("empresa_activa") || "{}").nombre || ""; }
    catch { return ""; }
  })();
  const row = (l: string, r: string, bold?: boolean) => (
    <div style={{ display: "flex", justifyContent: "space-between",
      fontWeight: bold ? 700 : 400 }}>
      <span>{l}</span><span>{r}</span>
    </div>
  );

  const vt = preview?.ventas_por_tasa || {};
  const docs = preview?.por_tipo_documento || {};
  const totalEgresos = 0; // futuro: retiros de caja
  const totalIngresos = cerrado.efectivo_real;
  const totalEnCaja = totalIngresos - totalEgresos;

  return (
    <div style={{ color: "#000", fontFamily: "'Courier New', monospace", fontSize: 12 }}>
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>*** CORTE Z EN MONEDA: MXN ***</div>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{empresaNombre.toUpperCase()}</div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ textAlign: "center", fontSize: 11 }}>
          *** Corte Z {cerrado.numero_z || cerrado.id} ***
        </div>
        <div style={{ fontSize: 11 }}>
          ESTACION{estacion} {horaCierre}
        </div>
      </div>

      {/* INGRESOS */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>** Ingresos **</div>
        {Object.entries(preview?.cobros_contado_por_forma || {}).map(([k, v]: [string, any]) => (
          <div key={"i"+k}>{row(`${v.label} Pago de clientes`, fmt(v.monto))}</div>
        ))}
        {Object.entries(preview?.cobros_credito_por_forma || {}).map(([k, v]: [string, any]) => (
          <div key={"c"+k}>{row(`${v.label} Cobranza credito`, fmt(v.monto))}</div>
        ))}
        <div style={{ marginTop: 4 }}>
          {row("Total de Ingresos:", fmt(preview?.total_entrada_dinero || cerrado.total_vendido), true)}
        </div>
      </div>

      {/* EGRESOS */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>** Egresos **</div>
        {row("Total de Egresos:", fmt(totalEgresos), true)}
      </div>

      <div style={{ borderTop: "1px dashed #000", padding: "4px 0", marginBottom: 6 }}>
        {row("Total en caja:", fmt(totalEnCaja), true)}
      </div>

      {/* VENTAS DEL CORTE */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ textAlign: "center", fontWeight: 700 }}>
          ********* VENTAS DEL CORTE *********
        </div>
        {row("Ventas 16%", fmt(vt["16"]?.subtotal || 0))}
        {row("Impuesto 16%", fmt(vt["16"]?.impuesto || 0))}
        {row("Ventas 10%", fmt(vt["10"]?.subtotal || 0))}
        {row("Impuesto 10%", fmt(vt["10"]?.impuesto || 0))}
        <div style={{ marginTop: 4 }}>
          {row("Ventas gravadas", fmt((vt["16"]?.subtotal || 0) + (vt["10"]?.subtotal || 0)))}
          {row("Impuesto", fmt((vt["16"]?.impuesto || 0) + (vt["10"]?.impuesto || 0)))}
          {row("Ventas no gravadas:", fmt(vt.exentas || 0))}
        </div>
        <div style={{ borderTop: "1px dashed #000", marginTop: 4, paddingTop: 4 }}>
          {row("Redondeos", fmt(0))}
          {row("Total de ventas:", fmt(cerrado.total_vendido), true)}
          {row("Ventas credito:", fmt(preview?.ventas_credito_total || 0))}
        </div>
      </div>

      {/* COBRANZA DEL DIA */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ textAlign: "center", fontWeight: 700 }}>
          ****** Cobranza del dia ******
        </div>
        {row("Ingresos por cobranza:", fmt(preview?.total_cobros_credito || 0))}
      </div>

      {/* VENTAS POR ARTICULO */}
      {preview?.top_productos && preview.top_productos.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 700 }}>** Ventas por articulo **</div>
          {preview.top_productos.slice(0, 15).map((p: any, i: number) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.nombre}
              </span>
              <span>{p.cantidad} — {fmt(p.importe)}</span>
            </div>
          ))}
          <div style={{ marginTop: 4 }}>
            {row("Total ventas del dia:", fmt(cerrado.total_vendido), true)}
            {row("Total venta en unidades:", (preview?.total_unidades || 0).toString())}
            {row("Clientes atendidos:", (preview?.clientes_atendidos || 0).toString())}
          </div>
        </div>
      )}

      <div style={{ borderTop: "1px dashed #000", paddingTop: 6, marginBottom: 6 }}>
        {row("Efectivo esperado:", fmt(cerrado.efectivo_esperado))}
        {row("Efectivo contado:", fmt(cerrado.efectivo_real))}
        <div style={{ borderTop: "1px solid #000", marginTop: 4, paddingTop: 4,
          fontSize: 13, fontWeight: 800 }}>
          {row("DIFERENCIA", (cerrado.diferencia >= 0 ? "+" : "") + fmt(cerrado.diferencia))}
        </div>
      </div>

      <div style={{ marginTop: 24, textAlign: "center", fontSize: 10 }}>
        <div style={{ borderTop: "1px solid #000", margin: "40px 20px 4px" }}></div>
        FIRMA DEL CAJERO
      </div>
    </div>
  );
}


function CerrarCajaModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<any>(null);
  const [efectivoReal, setEfectivoReal] = useState<string>("");
  const [notas, setNotas] = useState<string>("");
  const [cerrando, setCerrando] = useState(false);
  const [cerrado, setCerrado] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/api/reportes/corte/preview");
        setPreview(r.data);
      } catch (err: any) {
        setError("No se pudo cargar el corte: " + (err.response?.data?.detail || err.message));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function confirmar() {
    if (!preview) return;
    const real = parseFloat(efectivoReal) || 0;
    setCerrando(true); setError(null);
    try {
      const r = await api.post("/api/reportes/corte/cerrar", {
        efectivo_real: real,
        notas: notas.trim() || null,
      });
      setCerrado({ ...r.data, efectivo_real: real, efectivo_esperado: preview.efectivo_esperado });
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setCerrando(false);
    }
  }

  const efReal = parseFloat(efectivoReal) || 0;
  const efEsperado = preview?.efectivo_esperado || 0;
  const diferencia = efReal - efEsperado;
  const efectivoPuesto = efectivoReal.trim() !== "";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 12,
    }}>
      <div style={{
        background: "white", borderRadius: 14, padding: 24,
        width: "100%", maxWidth: 560, maxHeight: "94vh", overflow: "auto", color: "#0f172a",
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", fontSize: 18, color: "#64748b" }}>
            Cargando corte...
          </div>
        ) : cerrado ? (
          <>
            <div style={{ textAlign: "center", padding: "10px 0 20px" }}
              className="no-print">
              <div style={{ fontSize: 64, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#059669" }}>Caja cerrada</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                Corte #{cerrado.id} guardado
              </div>
            </div>

            {/* Area imprimible */}
            <div id="recibo-corte-print">
              <ReciboCorte cerrado={cerrado} preview={preview} />
            </div>

            {/* Aviso de tickets pendientes de factura global */}
            {cerrado.tickets_pendientes_fg > 0 && (
              <div style={{ background: "#fef3c7", border: "1px solid #f59e0b",
                padding: 12, borderRadius: 8, marginTop: 14, textAlign: "center",
                color: "#78350f" }} className="no-print">
                <strong>⚠️ Hay {cerrado.tickets_pendientes_fg} tickets sin facturar globalmente.</strong>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Puedes generar la Factura Global de hoy ahora o después desde el menú.
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }} className="no-print">
              <button onClick={() => imprimirRecibo()} style={{
                flex: 1, minWidth: 140, background: "#1e40af", color: "white",
                border: 0, padding: 14, borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}>🖨️ Imprimir Z</button>
              {cerrado.tickets_pendientes_fg > 0 && (
                <button onClick={() => { window.location.href = "/factura-global"; }} style={{
                  flex: 1, minWidth: 140, background: "#059669", color: "white",
                  border: 0, padding: 14, borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer",
                }}>📄 Factura Global ({cerrado.tickets_pendientes_fg})</button>
              )}
              <button onClick={onClose} style={{
                flex: 1, minWidth: 100, background: "#0f172a", color: "white",
                border: 0, padding: 14, borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}>Listo</button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>🔒 Cerrar caja</h2>
            <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 14 }}>
              Cuenta el efectivo de la caja y escribe cuánto tienes.
            </p>

            {/* Resumen por tipo de documento */}
            {preview.por_tipo_documento && (
              <div style={{ background: "#f8fafc", padding: 14, borderRadius: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  Documentos del día
                </div>
                {([
                  ["tickets",           "🎫 Tickets",            "#334155"],
                  ["facturas_contado",  "🧾 Facturas contado",   "#059669"],
                  ["facturas_credito",  "💳 Facturas crédito",   "#f59e0b"],
                  ["complementos_pago", "✅ Complementos pago",  "#1e40af"],
                ] as const).map(([k, label, color]) => {
                  const d = preview.por_tipo_documento[k];
                  if (!d || !d.n) return null;
                  return (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span style={{ color }}>{label}:</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        <strong>{d.n}</strong> · {fmt(d.total)}
                      </span>
                    </div>
                  );
                })}
                <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 8, paddingTop: 8,
                  display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <strong>Total venta del día:</strong>
                  <strong>{fmt(preview.total_vendido)}</strong>
                </div>
              </div>
            )}

            {/* Desglose cobros CONTADO por forma de pago */}
            {Object.keys(preview.cobros_contado_por_forma || preview.desglose_pagos || {}).length > 0 && (
              <div style={{ background: "#f0fdf4", padding: 14, borderRadius: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  💵 Cobros de contado (hoy)
                </div>
                {Object.entries(preview.cobros_contado_por_forma || preview.desglose_pagos || {}).map(([k, v]: [string, any]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                    <span style={{ color: "#065f46" }}>{v.label}:</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(v.monto)} ({v.n})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Desglose cobros CREDITO (complementos) por forma de pago */}
            {preview.cobros_credito_por_forma && Object.keys(preview.cobros_credito_por_forma).length > 0 && (
              <div style={{ background: "#dbeafe", padding: 14, borderRadius: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  ✅ Cobros de crédito (complementos de pago)
                </div>
                {Object.entries(preview.cobros_credito_por_forma).map(([k, v]: [string, any]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                    <span style={{ color: "#1e40af" }}>{v.label}:</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(v.monto)} ({v.n})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Total entrada de dinero */}
            {preview.total_entrada_dinero !== undefined && (
              <div style={{ background: "#fef3c7", padding: 12, borderRadius: 8, marginBottom: 12,
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 14, color: "#78350f" }}>💰 Total dinero entrado hoy:</strong>
                <strong style={{ fontSize: 18, color: "#78350f", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(preview.total_entrada_dinero)}
                </strong>
              </div>
            )}

            {/* Efectivo esperado */}
            <div style={{
              background: "#dbeafe", padding: 14, borderRadius: 8, marginBottom: 14,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Efectivo esperado en caja:</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: "#1e40af" }}>
                {fmt(preview.efectivo_esperado)}
              </span>
            </div>

            {/* Input efectivo real */}
            <label style={{ display: "block", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
              ¿Cuánto efectivo contaste?
            </label>
            <input
              type="number" inputMode="decimal" autoFocus
              value={efectivoReal}
              onChange={(e) => setEfectivoReal(e.target.value)}
              placeholder="0.00"
              style={{
                width: "100%", padding: "14px 16px", fontSize: 28, fontWeight: 700,
                border: "2px solid #cbd5e1", borderRadius: 8, textAlign: "right",
                marginBottom: 12,
              }}
            />

            {/* Diferencia */}
            {efectivoPuesto && (
              <div style={{
                padding: 14, borderRadius: 8, marginBottom: 14, textAlign: "center",
                background: Math.abs(diferencia) < 0.01 ? "#dcfce7"
                  : diferencia > 0 ? "#fef3c7" : "#fee2e2",
                border: `1px solid ${Math.abs(diferencia) < 0.01 ? "#86efac"
                  : diferencia > 0 ? "#fcd34d" : "#fca5a5"}`,
              }}>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>
                  {Math.abs(diferencia) < 0.01 ? "Cuadra exacto"
                    : diferencia > 0 ? "Sobra en caja"
                    : "Falta en caja"}
                </div>
                <div style={{ fontSize: 30, fontWeight: 800 }}>
                  {diferencia >= 0 ? "+" : ""}{fmt(diferencia)}
                </div>
              </div>
            )}

            {/* Notas */}
            <label style={{ display: "block", fontSize: 13, color: "#64748b", marginBottom: 6 }}>
              Notas (opcional)
            </label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)}
              placeholder="Propinas, retiros, etc."
              style={{ width: "100%", padding: "10px 12px", fontSize: 14,
                border: "1px solid #cbd5e1", borderRadius: 6, marginBottom: 16 }} />

            {error && (
              <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10,
                borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{error}</div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} disabled={cerrando}
                style={{
                  flex: 1, background: "#e2e8f0", color: "#0f172a", border: 0,
                  padding: 16, borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: "pointer",
                }}>Cancelar</button>
              <button onClick={confirmar}
                disabled={cerrando || !efectivoPuesto}
                style={{
                  flex: 2, background: cerrando || !efectivoPuesto ? "#94a3b8" : "#059669",
                  color: "white", border: 0, padding: 16, borderRadius: 8,
                  fontSize: 18, fontWeight: 700,
                  cursor: cerrando || !efectivoPuesto ? "not-allowed" : "pointer",
                }}>{cerrando ? "Cerrando..." : "🔒 Cerrar caja"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ===== Modal de efectivo con calculo de cambio =====

function EfectivoModal({ total, onCancelar, onConfirmar, cobrando }: {
  total: number;
  onCancelar: () => void;
  onConfirmar: (recibido: number) => void;
  cobrando: boolean;
}) {
  const [recibidoStr, setRecibidoStr] = useState<string>("");
  const recibido = parseFloat(recibidoStr) || 0;
  const cambio = recibido - total;
  const puedeCobrar = recibido >= total;

  const sugerencias = useMemo(() => {
    // Redondear hacia arriba a billetes comunes
    const opciones = new Set<number>();
    opciones.add(Math.ceil(total));  // exacto
    for (const b of [50, 100, 200, 500, 1000]) {
      if (b >= total) opciones.add(b);
    }
    // Tambien multiplos siguientes por si el total es alto
    const siguienteCien = Math.ceil(total / 100) * 100;
    if (siguienteCien > total) opciones.add(siguienteCien);
    const siguienteMil = Math.ceil(total / 1000) * 1000;
    if (siguienteMil > total) opciones.add(siguienteMil);
    return Array.from(opciones).sort((a, b) => a - b).slice(0, 5);
  }, [total]);

  function agregarDigito(d: string) {
    // Solo permite numeros y un punto
    if (d === "." && recibidoStr.includes(".")) return;
    setRecibidoStr(recibidoStr + d);
  }
  function borrar() {
    setRecibidoStr(recibidoStr.slice(0, -1));
  }
  function limpiarNumero() {
    setRecibidoStr("");
  }

  return (
    <div onClick={onCancelar} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 12, padding: 20,
        width: "94%", maxWidth: 480,
      }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 20, textAlign: "center" }}>
          💵 Pago en efectivo
        </h3>

        <div style={{ padding: 12, background: "#f1f5f9", borderRadius: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
            <span>Total a pagar</span>
            <strong style={{ fontSize: 22 }}>{fmt(total)}</strong>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
            RECIBÍ (cuánto entregó el cliente)
          </label>
          <div style={{
            fontSize: 40, fontWeight: 800, textAlign: "right",
            padding: "12px 16px", border: "2px solid #cbd5e1", borderRadius: 8,
            marginTop: 4, background: "white", minHeight: 60,
            color: recibido > 0 ? "#0f172a" : "#cbd5e1",
          }}>
            {recibidoStr ? "$" + recibidoStr : "$0"}
          </div>
        </div>

        {/* Sugerencias rapidas */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
          gap: 6, marginBottom: 12 }}>
          {sugerencias.map(s => (
            <button key={s} onClick={() => setRecibidoStr(String(s))}
              style={{
                padding: "10px 6px", background: recibido === s ? "#10b981" : "#e2e8f0",
                color: recibido === s ? "white" : "#0f172a",
                border: 0, borderRadius: 6, fontSize: 14, fontWeight: 700,
                cursor: "pointer",
              }}>
              {s === Math.ceil(total) ? "Exacto" : `$${s}`}
            </button>
          ))}
        </div>

        {/* Cambio */}
        {recibido > 0 && (
          <div style={{
            padding: 14, background: cambio < 0 ? "#fee2e2" : (cambio > 0 ? "#fef3c7" : "#dcfce7"),
            border: `2px solid ${cambio < 0 ? "#dc2626" : (cambio > 0 ? "#f59e0b" : "#10b981")}`,
            borderRadius: 8, marginBottom: 12, textAlign: "center",
          }}>
            {cambio < 0 && (
              <>
                <div style={{ fontSize: 12, color: "#991b1b", fontWeight: 700 }}>FALTA</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#991b1b" }}>
                  {fmt(-cambio)}
                </div>
              </>
            )}
            {cambio === 0 && (
              <div style={{ fontSize: 22, fontWeight: 800, color: "#166534" }}>
                ✓ Pago exacto
              </div>
            )}
            {cambio > 0 && (
              <>
                <div style={{ fontSize: 13, color: "#92400e", fontWeight: 700 }}>CAMBIO</div>
                <div style={{ fontSize: 42, fontWeight: 900, color: "#92400e", lineHeight: 1 }}>
                  {fmt(cambio)}
                </div>
              </>
            )}
          </div>
        )}

        {/* Teclado numerico grande para tablet */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
          {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map(k => (
            <button key={k} onClick={() => {
              if (k === "⌫") borrar();
              else agregarDigito(k);
            }}
              style={{
                padding: "18px 0", background: "white",
                border: "1px solid #cbd5e1", borderRadius: 6,
                fontSize: 22, fontWeight: 700, cursor: "pointer",
                color: k === "⌫" ? "#dc2626" : "#0f172a",
              }}>
              {k}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancelar} disabled={cobrando}
            style={{
              padding: "12px 16px", background: "transparent",
              border: "1px solid #cbd5e1", borderRadius: 6,
              color: "#475569", fontSize: 14, cursor: "pointer",
            }}>
            Cancelar
          </button>
          <button onClick={limpiarNumero} disabled={cobrando}
            style={{
              padding: "12px 16px", background: "#fef3c7",
              border: "1px solid #f59e0b", borderRadius: 6,
              color: "#92400e", fontSize: 14, cursor: "pointer",
            }}>
            Limpiar
          </button>
          <button onClick={() => onConfirmar(recibido)} disabled={!puedeCobrar || cobrando}
            style={{
              flex: 1, padding: "14px 16px",
              background: (!puedeCobrar || cobrando) ? "#94a3b8" : "#10b981",
              color: "white", border: 0, borderRadius: 6,
              fontSize: 16, fontWeight: 800,
              cursor: (!puedeCobrar || cobrando) ? "not-allowed" : "pointer",
            }}>
            {cobrando ? "Cobrando..." : "✓ Cobrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
