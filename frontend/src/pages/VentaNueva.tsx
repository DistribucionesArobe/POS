import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";
import CerrarCajaModal from "../components/CerrarCajaModal";
import ClientePicker from "../components/ClientePicker";

type Item = {
  variante_id: number; sku: string; nombre: string;
  cantidad: number; precio: number;  // SIN IVA siempre (base)
  tasa_iva: number;
  // Descripcion custom para CFDI (compras de gobierno con texto exacto).
  // Si viene set, override al descripcion default del producto al timbrar.
  descripcion_cfdi?: string;
};
type PagoRow = { forma_pago_sat: string; monto: number };

const fmt = (n: number) => n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoney = (n: number) => "$" + fmt(n);

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
  const [clienteNombre, setClienteNombre] = useState<string>("PUBLICO EN GENERAL");
  const [clienteRfc, setClienteRfc] = useState<string>("");
  const [vendedor] = useState<string>(() => (localStorage.getItem("nombre") || "SYS").toUpperCase().slice(0, 6));

  // ===== Buscador de cliente =====
  const [clienteBusq, setClienteBusq] = useState("");
  const [clienteSug, setClienteSug] = useState<any[]>([]);
  const [mostrarClienteSug, setMostrarClienteSug] = useState(false);
  const [idxCliSug, setIdxCliSug] = useState(0);
  const [cambiandoCliente, setCambiandoCliente] = useState(false);
  const clienteDebounceRef = useRef<number | null>(null);
  const clienteInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (clienteDebounceRef.current) window.clearTimeout(clienteDebounceRef.current);
    const q = clienteBusq.trim();
    if (q.length < 2) { setClienteSug([]); return; }
    clienteDebounceRef.current = window.setTimeout(async () => {
      try {
        const r = await api.get("/api/clientes", { params: { q, activo: true } });
        setClienteSug((r.data || []).slice(0, 10));
        setMostrarClienteSug(true);
        setIdxCliSug(0);
      } catch { /* silent */ }
    }, 220);
  }, [clienteBusq]);

  function elegirCliente(c: any) {
    setClienteId(c.id);
    setClienteNombre((c.nombre || "").toUpperCase());
    setClienteRfc(c.rfc || "");
    setClienteBusq("");
    setClienteSug([]);
    setMostrarClienteSug(false);
    setCambiandoCliente(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function usarPublicoGeneral() {
    try {
      const r = await api.get("/api/clientes/publico-general");
      elegirCliente(r.data);
    } catch { /* silent */ }
  }

  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<any[]>([]);
  const [mostrarSug, setMostrarSug] = useState(false);
  const [idxSug, setIdxSug] = useState(0);
  const [buscando, setBuscando] = useState(false);

  const [items, setItems] = useState<Item[]>([]);
  const [pagos, setPagos] = useState<PagoRow[]>([{ forma_pago_sat: "01", monto: 0 }]);
  const [mostrarPago, setMostrarPago] = useState(false);
  const [mostrarCorteZ, setMostrarCorteZ] = useState(false);
  const [mostrarPickerCliente, setMostrarPickerCliente] = useState(false);
  const [mostrarImport, setMostrarImport] = useState(false);
  const [retenerIva, setRetenerIva] = useState(false);
  // "Modo Alejandro" — solo super_admin lo ve. Venta descuenta inventario pero
  // NO entra en el corte Z ni Mis Ventas. Para efectivo que se queda el dueño.
  const esSuperAdmin = localStorage.getItem("super_admin") === "true";
  const [modoAlejandro, setModoAlejandro] = useState(false);
  // MODO: venta normal vs cotizacion (igual look&feel, destino distinto)
  const [modo, setModo] = useState<"VENTA" | "COTIZACION">("VENTA");
  const [vigenciaDias, setVigenciaDias] = useState<number>(15);
  const [guardandoCot, setGuardandoCot] = useState(false);

  // Default: precios YA incluyen IVA (NETO). Es como estan subidos en la BD.
  const [preciosConIva, setPreciosConIva] = useState<boolean>(() => {
    const v = localStorage.getItem("venta_precios_con_iva");
    return v === null ? true : v === "1";
  });
  useEffect(() => {
    localStorage.setItem("venta_precios_con_iva", preciosConIva ? "1" : "0");
  }, [preciosConIva]);

  const inputRef = useRef<HTMLInputElement>(null);
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
    }, 250);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [busqueda]);

  // Al montar: cargar publico general si clienteId es 1 por default
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/api/clientes/publico-general");
        if (r.data) {
          setClienteId(r.data.id);
          setClienteNombre((r.data.nombre || "PUBLICO EN GENERAL").toUpperCase());
          setClienteRfc(r.data.rfc || "");
        }
      } catch { /* silent */ }
    })();
  }, []);

  function agregar(s: any) {
    const tasa = s.tasa_iva !== undefined ? +s.tasa_iva : 0.16;
    // Si el toggle esta en NETO, el precio del catalogo YA incluye IVA,
    // asi que lo convertimos a base para el storage interno.
    const precioBase = preciosConIva ? +(+s.precio / (1 + tasa)).toFixed(6) : +s.precio;
    const existente = items.findIndex(i => i.variante_id === s.id);
    if (existente >= 0) {
      const c = [...items];
      c[existente].cantidad += 1;
      setItems(c);
    } else {
      setItems([{
        variante_id: s.id, sku: s.sku, nombre: s.nombre,
        cantidad: 1, precio: precioBase, tasa_iva: tasa,
      }, ...items]);
    }
    setSugerencias([]); setBusqueda(""); setMostrarSug(false);
    setTimeout(() => inputRef.current?.focus(), 50);
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
  function precioMostrado(it: Item): number {
    return preciosConIva ? it.precio * (1 + it.tasa_iva) : it.precio;
  }
  function actualizarPrecio(idx: number, valorInputado: number) {
    const c = [...items];
    const tasa = c[idx].tasa_iva;
    c[idx].precio = preciosConIva ? +(valorInputado / (1 + tasa)).toFixed(6) : +valorInputado.toFixed(6);
    setItems(c);
  }

  const subtotal = items.reduce((a, i) => a + i.cantidad * i.precio, 0);
  const iva = items.reduce((a, i) => a + i.cantidad * i.precio * i.tasa_iva, 0);
  // Retencion IVA (16%) solo aplica cuando es FACTURA + cliente con RFC real
  const esFactura = tipoSel === "FACTURA_PUE" || tipoSel === "FACTURA_PPD";
  const puedeRetener = esFactura && !!clienteRfc && clienteRfc !== "XAXX010101000";
  const retencionAplica = retenerIva && puedeRetener;
  const ivaRetenido = retencionAplica ? +(subtotal * 0.16).toFixed(2) : 0;
  const total = +(subtotal + iva - ivaRetenido).toFixed(2);
  const sumaPagos = +pagos.reduce((a, p) => a + (p.monto || 0), 0).toFixed(2);
  const usaSplit = pagos.length > 1;
  const n_piezas = useMemo(() => items.reduce((a, i) => a + i.cantidad, 0), [items]);

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

  async function guardarComoCotizacion() {
    if (items.length === 0) { alert("Agrega productos primero"); return; }
    setGuardandoCot(true);
    try {
      const r = await api.post("/api/cotizaciones", {
        cliente_id: clienteId,
        vigencia_dias: vigenciaDias,
        conceptos: items.map((i) => ({
          variante_id: i.variante_id,
          cantidad: i.cantidad,
          precio_unitario: i.precio,
        })),
      });
      const base = api.defaults.baseURL || "";
      const pdfUrl = `${base}/api/cotizaciones/${r.data.id}/pdf`;
      if (confirm(`📄 Cotización ${r.data.folio} guardada\n\nTotal: ${fmtMoney(r.data.total)}\n\n¿Abrir PDF para enviar al cliente?`)) {
        window.open(pdfUrl, "_blank");
      }
      setItems([]);
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setGuardandoCot(false);
    }
  }

  async function guardar() {
    if (!esCredito) {
      if (sumaPagos < total - 0.01) {
        alert(`Faltan ${fmtMoney(total - sumaPagos)} por cubrir`);
        return;
      }
    }
    const payload: any = {
      tipo, cliente_id: clienteId,
      forma_pago_sat: esCredito ? "99" : (pagos[0]?.forma_pago_sat || "01"),
      metodo_pago_sat: metodoPagoSat,
      iva_retenido_pct: retencionAplica ? 0.16 : 0,
      oculto_del_corte: esSuperAdmin && modoAlejandro,
      conceptos: items.map((i) => ({
        variante_id: i.variante_id, cantidad: i.cantidad, precio_unitario: i.precio,
        descripcion: i.descripcion_cfdi || undefined,
      })),
    };
    if (!esCredito) {
      payload.pagos = pagos.map((p) => ({ forma_pago_sat: p.forma_pago_sat, monto: +p.monto }));
    }
    try {
      const r = await api.post("/api/ventas", payload);
      const base = api.defaults.baseURL || "";
      const pdfUrl = `${base}/api/ventas/${r.data.id}/pdf`;
      if (confirm(`Documento creado: ${r.data.folio}\n\nTotal: ${fmtMoney(r.data.total)}\n\n¿Abrir PDF?`)) {
        window.open(pdfUrl, "_blank");
      }
      setItems([]);
      setPagos([{ forma_pago_sat: "01", monto: 0 }]);
      setMostrarPago(false);
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  // Hora en el footer tipo "SUP ESTACION01 Hora: 08-11-2018 12:04:27"
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const horaStr = (() => {
    const dd = String(ahora.getDate()).padStart(2, "0");
    const mm = String(ahora.getMonth() + 1).padStart(2, "0");
    const yy = ahora.getFullYear();
    const hh = String(ahora.getHours()).padStart(2, "0");
    const mi = String(ahora.getMinutes()).padStart(2, "0");
    const ss = String(ahora.getSeconds()).padStart(2, "0");
    return `${dd}-${mm}-${yy}  ${hh}:${mi}:${ss}`;
  })();
  const estacion = (localStorage.getItem("usuario_id") || "01").padStart(2, "0");

  // ====== ESTILOS ======
  const headerCellLabel: React.CSSProperties = {
    background: "#1e3a8a", color: "white", fontWeight: 800,
    padding: "6px 10px", fontSize: 13, border: "1px solid #1e3a8a",
  };
  const headerCellValue: React.CSSProperties = {
    background: "white", padding: "6px 10px", border: "1px solid #cbd5e1",
    fontWeight: 700, color: "#000", fontSize: 14,
  };
  const colHeader: React.CSSProperties = {
    background: "#1e3a8a", color: "white", padding: "8px 10px",
    fontWeight: 800, fontSize: 13, textAlign: "left",
    border: "1px solid #1e3a8a", textTransform: "none",
  };

  return (
    <Layout
      title={modo === "COTIZACION" ? "Cotización" : "Caja rápida"}
      subtitle={modo === "COTIZACION"
        ? "Arma la cotización igual que una venta — se guarda y se puede convertir despues"
        : "Punto de venta — teclea SKU o nombre y Enter"}
      actions={
        <button onClick={() => {
          if (items.length > 0) {
            if (!confirm("Hay productos en el carrito. ¿Cerrar caja de todos modos?")) return;
          }
          setMostrarCorteZ(true);
        }}
          style={{
            background: "#dc2626", color: "white", border: 0,
            padding: "12px 22px", borderRadius: 8, fontSize: 15, fontWeight: 800,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 2px 6px rgba(220,38,38,0.3)",
          }}>
          🔒 Cerrar Corte Z
        </button>
      }>
      {/* ============ Switch de modo: Venta vs Cotizacion ============ */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 8,
        background: "#f1f5f9", padding: 4, borderRadius: 8, width: "fit-content",
      }}>
        <button onClick={() => setModo("VENTA")}
          style={{
            padding: "10px 20px", border: 0, borderRadius: 6, cursor: "pointer",
            fontSize: 14, fontWeight: 800, letterSpacing: 0.3,
            background: modo === "VENTA" ? "#059669" : "transparent",
            color: modo === "VENTA" ? "white" : "#64748b",
          }}>
          💰 VENTA
        </button>
        <button onClick={() => setModo("COTIZACION")}
          style={{
            padding: "10px 20px", border: 0, borderRadius: 6, cursor: "pointer",
            fontSize: 14, fontWeight: 800, letterSpacing: 0.3,
            background: modo === "COTIZACION" ? "#1e40af" : "transparent",
            color: modo === "COTIZACION" ? "white" : "#64748b",
          }}>
          📄 COTIZACION
        </button>
        {modo === "COTIZACION" && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 10, fontSize: 12, color: "#475569" }}>
            Vigencia:
            <input type="number" min={1} max={90} value={vigenciaDias}
              onChange={(e) => setVigenciaDias(+e.target.value || 15)}
              style={{ width: 50, padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 13 }} />
            dias
          </label>
        )}
        {esSuperAdmin && modo === "VENTA" && (
          <label style={{
            display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            marginLeft: 10, padding: "6px 12px",
            background: modoAlejandro ? "#7c3aed" : "#ede9fe",
            color: modoAlejandro ? "white" : "#5b21b6",
            border: `2px solid ${modoAlejandro ? "#7c3aed" : "#c4b5fd"}`,
            borderRadius: 6, fontSize: 12, fontWeight: 800, userSelect: "none",
          }}
            title="Super admin: la venta descuenta inventario pero NO entra al corte Z ni Mis Ventas default. Para efectivo que te quedas tu.">
            <input type="checkbox" checked={modoAlejandro}
              onChange={(e) => setModoAlejandro(e.target.checked)}
              style={{ width: 16, height: 16 }} />
            {modoAlejandro ? "🔒 MODO ALEJANDRO ACTIVO" : "👑 Modo Alejandro"}
          </label>
        )}
      </div>

      {esSuperAdmin && modoAlejandro && modo === "VENTA" && (
        <div style={{
          background: "#faf5ff", border: "2px dashed #a855f7",
          padding: "8px 14px", marginBottom: 8, borderRadius: 6,
          color: "#6b21a8", fontSize: 12, fontWeight: 600,
        }}>
          🔒 <strong>Modo Alejandro activo:</strong> esta venta descontara inventario como cualquier otra,
          pero NO aparecera en el Corte Z ni en el listado Mis Ventas default.
          El dinero no entra a caja. Usala para efectivo que te quedas personalmente.
        </div>
      )}

      {/* ============ HEADER: Cliente / Vendedor / Tipo ============ */}
      <div style={{
        display: "grid", gridTemplateColumns: "260px 260px 1fr auto",
        gap: 8, alignItems: "stretch", marginBottom: 8,
      }}>
        {/* Columna Cliente/Vendedor */}
        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", border: "1px solid #cbd5e1" }}>
          <div style={headerCellLabel}>Cliente</div>
          <div style={{ ...headerCellValue, padding: "6px 10px", fontSize: 13 }}>
            #{clienteId}
          </div>
          <div style={headerCellLabel}>Vendedor</div>
          <div style={{ ...headerCellValue, padding: "6px 10px" }}>{vendedor}</div>
        </div>

        {/* Panel del cliente — click para cambiar */}
        <div style={{
          background: "white", border: "1px solid #cbd5e1",
          padding: "8px 14px", display: "flex", flexDirection: "column", justifyContent: "center",
          position: "relative", cursor: cambiandoCliente ? "default" : "pointer",
        }}
          onClick={() => {
            if (!cambiandoCliente) {
              setCambiandoCliente(true);
              setTimeout(() => clienteInputRef.current?.focus(), 50);
            }
          }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>CLIENTE</div>
            {!cambiandoCliente ? (
              <span style={{ fontSize: 11, color: "#1e3a8a", fontWeight: 700 }}>
                ✎ click para cambiar
              </span>
            ) : (
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={(e) => { e.stopPropagation(); setMostrarPickerCliente(true); }}
                  style={{
                    background: "#1e40af", color: "white", border: 0,
                    padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer",
                  }}>
                  ➕ Nuevo
                </button>
                <button onClick={(e) => { e.stopPropagation(); usarPublicoGeneral(); }}
                  style={{
                    background: "#059669", color: "white", border: 0,
                    padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer",
                  }}>
                  🏷 Publico
                </button>
                <button onClick={(e) => { e.stopPropagation(); setCambiandoCliente(false); setClienteBusq(""); }}
                  style={{
                    background: "#e2e8f0", border: 0, padding: "3px 8px",
                    fontSize: 10, cursor: "pointer",
                  }}>×</button>
              </div>
            )}
          </div>
          {!cambiandoCliente ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {clienteNombre}
              </div>
              {clienteRfc && (
                <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>
                  RFC: {clienteRfc}
                </div>
              )}
            </>
          ) : (
            <input ref={clienteInputRef} autoFocus
              placeholder="🔍 Nombre o RFC del cliente..."
              value={clienteBusq}
              onChange={(e) => setClienteBusq(e.target.value)}
              onKeyDown={(e) => {
                if (!clienteSug.length) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setIdxCliSug(i => Math.min(clienteSug.length - 1, i + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setIdxCliSug(i => Math.max(0, i - 1)); }
                else if (e.key === "Enter") { e.preventDefault(); elegirCliente(clienteSug[idxCliSug]); }
                else if (e.key === "Escape") { setCambiandoCliente(false); setClienteBusq(""); }
              }}
              onBlur={() => setTimeout(() => setMostrarClienteSug(false), 180)}
              style={{
                width: "100%", padding: "6px 8px", fontSize: 14, fontWeight: 700,
                border: "2px solid #1e3a8a", color: "#0f172a",
              }} />
          )}

          {cambiandoCliente && mostrarClienteSug && clienteSug.length > 0 && (
            <div style={{
              position: "absolute", left: 8, right: 8, top: 72, zIndex: 30,
              background: "white", border: "2px solid #1e3a8a",
              maxHeight: 260, overflowY: "auto",
              boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
            }}>
              {clienteSug.map((c, i) => (
                <div key={c.id}
                  onMouseDown={(e) => { e.preventDefault(); elegirCliente(c); }}
                  onMouseEnter={() => setIdxCliSug(i)}
                  style={{
                    padding: "8px 10px", cursor: "pointer",
                    borderBottom: "1px solid #e2e8f0",
                    background: i === idxCliSug ? "#dbeafe" : "white",
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                    {(c.nombre || "").toUpperCase()}
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>
                    #{c.id} {c.rfc && `· RFC ${c.rfc}`} {c.whatsapp && `· 📱 ${c.whatsapp}`}
                  </div>
                </div>
              ))}
            </div>
          )}
          {cambiandoCliente && clienteBusq.length >= 2 && clienteSug.length === 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>
              Sin resultados. Crea el cliente en el módulo de Clientes primero.
            </div>
          )}
        </div>

        {/* Tipo de documento */}
        <div style={{
          background: "white", border: "1px solid #cbd5e1",
          padding: 6, display: "flex", flexDirection: "column", gap: 4, minWidth: 220,
        }}>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>TIPO DE DOCUMENTO</div>
          <select value={tipoSel} onChange={(e) => setTipoSel(e.target.value as any)}
            style={{ padding: "6px 8px", fontSize: 13, border: "1px solid #cbd5e1", fontWeight: 700 }}>
            <option value="TICKET">🎫 Ticket contado</option>
            <option value="FACTURA_PUE">🧾 Factura PUE contado</option>
            <option value="FACTURA_PPD">💳 Factura PPD crédito</option>
            <option value="REMISION">📋 Remisión crédito (sin CFDI)</option>
          </select>
        </div>

        {/* Botón salir rojo (decorativo) */}
        <button onClick={() => { if (confirm("¿Descartar venta?")) { setItems([]); setBusqueda(""); } }}
          style={{
            background: "#dc2626", color: "white", border: 0, padding: "0 16px",
            fontSize: 24, fontWeight: 900, cursor: "pointer",
          }}>×</button>
      </div>

      {/* ============ BARRA DE BÚSQUEDA + Toggle IVA ============ */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, position: "relative" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input ref={inputRef} autoFocus
            placeholder="🔍 Escribe SKU o nombre del producto... (↑↓ navegar, Enter agregar)"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={onKeyBusqueda}
            onFocus={() => sugerencias.length > 0 && setMostrarSug(true)}
            onBlur={() => setTimeout(() => setMostrarSug(false), 180)}
            style={{
              width: "100%", padding: "12px 16px", fontSize: 16,
              border: "2px solid #1e3a8a", borderRadius: 0, fontWeight: 600,
            }} />
          {buscando && (
            <div style={{ position: "absolute", right: 12, top: 14, fontSize: 11, color: "#64748b" }}>
              buscando...
            </div>
          )}
          {mostrarSug && sugerencias.length > 0 && (
            <div style={{
              position: "absolute", left: 0, right: 0, top: 48, zIndex: 20,
              background: "white", border: "2px solid #1e3a8a",
              maxHeight: 320, overflowY: "auto",
              boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
            }}>
              {sugerencias.map((s, i) => (
                <div key={s.id}
                  onMouseDown={(e) => { e.preventDefault(); agregar(s); }}
                  onMouseEnter={() => setIdxSug(i)}
                  style={{
                    padding: "8px 12px", cursor: "pointer",
                    borderBottom: "1px solid #e2e8f0",
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", gap: 10,
                    background: i === idxSug ? "#dbeafe" : "white",
                  }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                      <code style={{ background: "#1e3a8a", color: "white", padding: "1px 6px", marginRight: 6, fontSize: 11 }}>
                        {s.sku}
                      </code>
                      {s.nombre}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <span style={{ background: "#059669", color: "white", padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>
                      {/* El precio del catalogo YA es NETO (c/IVA).
                          En modo NETO se muestra tal cual; en modo SIN IVA se baja /(1+tasa). */}
                      {fmtMoney(preciosConIva ? +s.precio : +s.precio / (1 + (s.tasa_iva ?? 0.16)))}
                    </span>
                    <span style={{ background: "#e2e8f0", padding: "3px 8px", fontSize: 11, color: "#334155" }}>
                      stock {s.stock}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setMostrarImport(true)}
          style={{
            padding: "0 16px", background: "#7c3aed", color: "white",
            border: 0, fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
          }}
          title="Sube foto o PDF de una cotización, o pega un listado de Excel">
          📥 Importar cotizacion
        </button>
        <label style={{
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          padding: "0 14px", background: preciosConIva ? "#059669" : "#f59e0b",
          color: "white",
          border: 0, fontWeight: 700, fontSize: 12, userSelect: "none", whiteSpace: "nowrap",
        }} title="Marca si tus precios YA incluyen IVA (NETO). Desmarca si son precios base s/IVA que debe sumarse al cobrar.">
          <input type="checkbox" checked={preciosConIva}
            onChange={(e) => setPreciosConIva(e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }} />
          {preciosConIva ? "✓ PRECIOS NETO (c/IVA incluido)" : "⚠ PRECIOS SIN IVA (se suma al cobrar)"}
        </label>
      </div>

      {/* ============ TABLA DE ITEMS tipo MyBusiness ============ */}
      <div style={{
        border: "1px solid #1e3a8a",
        maxHeight: "calc(100vh - 420px)", overflowY: "auto",
        background: "white", marginBottom: 8,
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 70 }} />
            <col />
            <col style={{ width: 70 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...colHeader, textAlign: "center" }}>QTY</th>
              <th style={colHeader}>Descripción</th>
              <th style={{ ...colHeader, textAlign: "center" }}>Lista</th>
              <th style={{ ...colHeader, textAlign: "right" }}>Precio</th>
              <th style={{ ...colHeader, textAlign: "right" }}>Importe</th>
              <th style={colHeader}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{
                  padding: 60, textAlign: "center", color: "#94a3b8",
                  fontSize: 15, background: "#f8fafc",
                }}>
                  Captura un producto arriba para iniciar la venta
                </td>
              </tr>
            ) : (
              items.map((i, idx) => {
                const bg = idx % 2 === 0 ? "#e8eef9" : "white";
                return (
                  <tr key={idx} style={{ background: bg }}>
                    <td style={{ padding: "8px 6px", textAlign: "center",
                      fontWeight: 800, fontSize: 15, color: "#0f172a",
                      border: "1px solid #cbd5e1" }}>
                      <input type="number" min="0.01" step="0.01" value={i.cantidad}
                        onChange={(e) => actualizarCantidad(idx, +e.target.value)}
                        style={{
                          width: "100%", border: 0, background: "transparent",
                          textAlign: "center", fontSize: 15, fontWeight: 800, color: "#0f172a",
                          padding: 0,
                        }} />
                    </td>
                    <td style={{
                      padding: "8px 10px", fontWeight: 700, fontSize: 14, color: "#0f172a",
                      border: "1px solid #cbd5e1",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {i.nombre.toUpperCase()}
                      <span style={{ marginLeft: 8, fontSize: 10, color: "#64748b", fontWeight: 600 }}>
                        [{i.sku}]
                      </span>
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "center",
                      fontSize: 13, color: "#334155", border: "1px solid #cbd5e1" }}>
                      1
                    </td>
                    <td style={{ padding: 0, border: "1px solid #cbd5e1" }}>
                      <input type="number" min="0" step="0.01"
                        value={+precioMostrado(i).toFixed(2)}
                        onChange={(e) => actualizarPrecio(idx, +e.target.value)}
                        style={{
                          width: "100%", border: 0, background: "white",
                          textAlign: "right", fontSize: 14, fontWeight: 700,
                          padding: "8px 10px", color: "#0f172a",
                        }} />
                    </td>
                    <td style={{
                      padding: "8px 10px", textAlign: "right", fontWeight: 800,
                      fontSize: 14, color: "#0f172a", border: "1px solid #cbd5e1",
                    }}>
                      {fmt(i.cantidad * precioMostrado(i))}
                    </td>
                    <td style={{ padding: 0, border: "1px solid #cbd5e1", textAlign: "center" }}>
                      <button onClick={() => quitar(idx)}
                        style={{
                          background: "transparent", border: 0, color: "#dc2626",
                          fontSize: 18, fontWeight: 900, cursor: "pointer",
                          padding: "8px 6px", width: "100%",
                        }}>×</button>
                    </td>
                  </tr>
                );
              })
            )}
            {/* Filas vacias para rellenar visualmente (como MyBusiness) */}
            {items.length > 0 && items.length < 8 && Array.from({ length: 8 - items.length }).map((_, i) => (
              <tr key={"empty-" + i} style={{ background: (items.length + i) % 2 === 0 ? "#e8eef9" : "white" }}>
                <td style={{ padding: "8px 6px", border: "1px solid #e2e8f0", height: 36 }}></td>
                <td style={{ padding: "8px 10px", border: "1px solid #e2e8f0" }}></td>
                <td style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}></td>
                <td style={{ padding: "8px 10px", border: "1px solid #e2e8f0" }}></td>
                <td style={{ padding: "8px 10px", border: "1px solid #e2e8f0" }}></td>
                <td style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ============ PIE: Info izquierda + Total MXN gigante ============ */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 480px",
        gap: 8, alignItems: "stretch",
      }}>
        <div style={{
          background: "white", border: "1px solid #cbd5e1",
          padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6,
          fontSize: 12, color: "#334155",
        }}>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            SUP ESTACION{estacion} Hora: {horaStr}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>Piezas: <strong style={{ color: "#0f172a" }}>{n_piezas}</strong></span>
            <span>Items: <strong style={{ color: "#0f172a" }}>{items.length}</strong></span>
            <span>Subtotal s/IVA: <strong style={{ color: "#0f172a" }}>{fmtMoney(subtotal)}</strong></span>
            <span>IVA: <strong style={{ color: "#0f172a" }}>{fmtMoney(iva)}</strong></span>
            {retencionAplica && (
              <span style={{ color: "#dc2626" }}>
                IVA retenido: <strong>-{fmtMoney(ivaRetenido)}</strong>
              </span>
            )}
          </div>
          {puedeRetener && (
            <label style={{
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              padding: "6px 10px", background: retenerIva ? "#eff6ff" : "#f8fafc",
              border: `1px solid ${retenerIva ? "#60a5fa" : "#cbd5e1"}`, borderRadius: 6,
              fontSize: 12, color: retenerIva ? "#1e40af" : "#475569", fontWeight: 600,
              width: "fit-content",
            }}>
              <input type="checkbox" checked={retenerIva}
                onChange={(e) => setRetenerIva(e.target.checked)} />
              Retener IVA 16% (caso CFE / gobierno retiene a PF)
            </label>
          )}
          {items.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {modo === "VENTA" ? (
                <button onClick={() => setMostrarPago(true)}
                  style={{
                    flex: 1, background: "#059669", color: "white", border: 0,
                    padding: "12px 16px", fontSize: 15, fontWeight: 800, cursor: "pointer",
                  }}>
                  💵 COBRAR (F12)
                </button>
              ) : (
                <button onClick={guardarComoCotizacion} disabled={guardandoCot}
                  style={{
                    flex: 1, background: guardandoCot ? "#94a3b8" : "#1e40af", color: "white", border: 0,
                    padding: "12px 16px", fontSize: 15, fontWeight: 800, cursor: guardandoCot ? "wait" : "pointer",
                  }}>
                  {guardandoCot ? "Guardando..." : "📄 GUARDAR COTIZACION"}
                </button>
              )}
              <button onClick={() => { if (confirm(modo === "VENTA" ? "¿Limpiar venta?" : "¿Limpiar cotizacion?")) setItems([]); }}
                style={{
                  background: "#dc2626", color: "white", border: 0,
                  padding: "12px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>
                🗑 Limpiar
              </button>
            </div>
          )}
        </div>

        {/* TOTAL MXN gigante */}
        <div style={{
          background: "white", border: "1px solid #cbd5e1",
          display: "grid", gridTemplateColumns: "1fr 2fr", alignItems: "stretch",
        }}>
          <div style={{
            background: "white", color: "#0f172a",
            padding: "20px 14px", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 32, fontWeight: 900,
            letterSpacing: 0.5,
          }}>
            Total MXN
          </div>
          <div style={{
            background: "#000", color: "#22ff5a",
            padding: "20px 24px", display: "flex", alignItems: "center",
            justifyContent: "flex-end", fontSize: 54, fontWeight: 900,
            fontVariantNumeric: "tabular-nums", letterSpacing: 1,
            fontFamily: "'Courier New', monospace",
          }}>
            {fmt(total)}
          </div>
        </div>
      </div>

      {/* ============ MODAL DE COBRO ============ */}
      {mostrarPago && (
        <div onClick={() => setMostrarPago(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "white", padding: 24, borderRadius: 8, minWidth: 480, maxWidth: 560,
          }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 800 }}>
              Cobrar {fmtMoney(total)}
            </h2>

            {esCredito ? (
              <div style={{ padding: 16, background: "#fef3c7", borderRadius: 6, marginBottom: 16 }}>
                <strong>Venta a crédito</strong> — no se registra pago ahora.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <button onClick={autoPago}
                    style={{ padding: "6px 12px", border: "1px solid #cbd5e1", background: "white", cursor: "pointer", fontSize: 12 }}>
                    Auto 1 pago
                  </button>
                  {pagos.length < 2 && (
                    <button onClick={agregarPago}
                      style={{ padding: "6px 12px", border: "1px dashed #cbd5e1", background: "white", cursor: "pointer", fontSize: 12 }}>
                      + 2do método
                    </button>
                  )}
                </div>
                {pagos.map((p, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 140px auto", gap: 6, marginBottom: 6 }}>
                    <select value={p.forma_pago_sat}
                      onChange={(e) => setPago(idx, { forma_pago_sat: e.target.value })}
                      style={{ padding: 8, border: "1px solid #cbd5e1" }}>
                      {FORMAS_PAGO_SAT.map((f) => <option key={f.v} value={f.v}>{f.t}</option>)}
                    </select>
                    <input type="number" step="0.01" value={p.monto}
                      onChange={(e) => setPago(idx, { monto: +e.target.value })}
                      style={{ padding: 8, textAlign: "right", border: "1px solid #cbd5e1", fontSize: 15, fontWeight: 700 }} />
                    {pagos.length > 1 && (
                      <button onClick={() => quitarPago(idx)}
                        style={{ background: "transparent", border: "1px solid #cbd5e1", cursor: "pointer", padding: "0 10px" }}>×</button>
                    )}
                  </div>
                ))}
                <div style={{ marginTop: 8, padding: 10, background: "#f1f5f9", display: "flex", justifyContent: "space-between" }}>
                  <span>Suma pagos:</span>
                  <strong style={{ color: sumaPagos < total - 0.01 ? "#dc2626" : "#059669" }}>
                    {fmtMoney(sumaPagos)}
                    {sumaPagos < total - 0.01 && ` (faltan ${fmtMoney(total - sumaPagos)})`}
                    {sumaPagos > total + 0.01 && ` (cambio ${fmtMoney(sumaPagos - total)})`}
                  </strong>
                </div>
                {usaSplit && (
                  <p style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                    Pago combinado → CFDI usará forma "99 — Por definir"
                  </p>
                )}
              </>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setMostrarPago(false)}
                style={{ padding: "12px 20px", background: "#e2e8f0", border: 0, cursor: "pointer", fontWeight: 700 }}>
                Cancelar
              </button>
              <button onClick={guardar}
                style={{
                  flex: 1, padding: "12px 20px", background: "#059669", color: "white",
                  border: 0, cursor: "pointer", fontWeight: 800, fontSize: 16,
                }}>
                ✓ Confirmar y guardar {tipo}
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarCorteZ && (
        <CerrarCajaModal onClose={() => setMostrarCorteZ(false)} />
      )}

      {mostrarImport && (
        <ImportarCotModal
          onClose={() => setMostrarImport(false)}
          onAgregar={(nuevos) => {
            // nuevos ya vienen con precio BASE y tasa_iva
            setItems([...nuevos, ...items]);
            setMostrarImport(false);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          preciosEntradaConIva={preciosConIva}
        />
      )}

      {mostrarPickerCliente && (
        <ClientePicker
          onClose={() => setMostrarPickerCliente(false)}
          onSelect={(c) => {
            setClienteId(c.id);
            setClienteNombre((c.nombre || "").toUpperCase());
            setClienteRfc(c.rfc || "");
            setMostrarPickerCliente(false);
            setCambiandoCliente(false);
            setClienteBusq("");
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
        />
      )}
    </Layout>
  );
}


// =================== MODAL IMPORTAR COTIZACION ===================

type LineaImportada = {
  descripcion: string;
  cantidad: number;
  precio: number;      // tal como viene del archivo/texto
  monto: number;
  match_variante_id?: number | null;
  sku?: string;
  nombre?: string;
  tasa_iva?: number;
  // Descripcion exacta para el CFDI (compras de gobierno)
  descripcion_cfdi?: string;
};

function ImportarCotModal({ onClose, onAgregar, preciosEntradaConIva }: {
  onClose: () => void;
  onAgregar: (items: Item[]) => void;
  preciosEntradaConIva: boolean;
}) {
  const [tab, setTab] = useState<"archivo" | "pegar">("archivo");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [textoPegado, setTextoPegado] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [lineas, setLineas] = useState<LineaImportada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [omitidos, setOmitidos] = useState<Set<number>>(new Set());
  const [entradaConIva, setEntradaConIva] = useState(preciosEntradaConIva);

  async function procesarArchivo() {
    if (!archivo) return;
    setProcesando(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", archivo);
      const r = await api.post("/api/productos/parsear-cotizacion", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      setLineas(r.data.lineas || []);
      setOmitidos(new Set());
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setProcesando(false);
    }
  }

  async function procesarTexto() {
    const texto = textoPegado.trim();
    if (!texto) return;
    setProcesando(true); setError(null);
    try {
      const limpiar = (s: string) => {
        const n = parseFloat((s || "").replace(/[$,\s]/g, ""));
        return isNaN(n) ? 0 : n;
      };
      const parsed: LineaImportada[] = [];
      for (const linea of texto.split(/\r?\n/)) {
        if (!linea.trim()) continue;
        // Separador PREFERIDO: tab (Excel pega siempre con tabs).
        // Si no hay tabs, fallback a 2+ espacios. NUNCA comas porque muchas
        // descripciones las tienen (ej. "Agua purificada, 500 ml, paquete...").
        const sep = linea.includes("\t") ? "\t" : null;
        const cols = sep ? linea.split(sep) : linea.split(/ {2,}/);
        if (cols.length < 2) continue;
        const desc = (cols[0] || "").trim();
        if (!desc) continue;
        const cantidad = limpiar(cols[1] || "");
        if (cantidad <= 0) continue;
        let precio = 0, monto = 0;
        if (cols.length >= 4) { precio = limpiar(cols[2]); monto = limpiar(cols[3]); }
        else if (cols.length === 3) { precio = limpiar(cols[2]); monto = cantidad * precio; }
        else { precio = 0; monto = 0; }
        parsed.push({ descripcion: desc, cantidad, precio, monto });
      }
      // Para cada linea buscar en catalogo
      const enriquecidas: LineaImportada[] = [];
      for (const l of parsed) {
        try {
          const r = await api.get("/api/productos/buscar-variante", { params: { q: l.descripcion } });
          const match = (r.data || [])[0];
          if (match) {
            enriquecidas.push({
              ...l,
              match_variante_id: match.id,
              sku: match.sku,
              nombre: match.nombre,
              tasa_iva: match.tasa_iva,
              precio: l.precio || match.precio,
            });
          } else {
            enriquecidas.push({ ...l, match_variante_id: null });
          }
        } catch {
          enriquecidas.push({ ...l, match_variante_id: null });
        }
      }
      setLineas(enriquecidas);
      setOmitidos(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProcesando(false);
    }
  }

  function toggleOmitido(i: number) {
    const s = new Set(omitidos);
    if (s.has(i)) s.delete(i); else s.add(i);
    setOmitidos(s);
  }

  function agregarAlCarrito() {
    if (!lineas) return;
    const paraAgregar: Item[] = [];
    for (let i = 0; i < lineas.length; i++) {
      if (omitidos.has(i)) continue;
      const l = lineas[i];
      if (!l.match_variante_id) continue;
      const tasa = l.tasa_iva ?? 0.16;
      // Si el usuario marco "entrada CON IVA", convertir precio a base
      const precioBase = entradaConIva ? +(l.precio / (1 + tasa)).toFixed(6) : l.precio;
      paraAgregar.push({
        variante_id: l.match_variante_id,
        sku: l.sku || "",
        nombre: l.nombre || l.descripcion,
        cantidad: l.cantidad,
        precio: precioBase,
        tasa_iva: tasa,
        // Prioridad: descripcion_cfdi (si user la editó manual) > descripcion
        // (si vino del archivo y es distinta del nombre catalogo) > nada.
        descripcion_cfdi: l.descripcion_cfdi
          || (l.descripcion && l.descripcion !== l.nombre ? l.descripcion : undefined),
      });
    }
    if (paraAgregar.length === 0) {
      alert("No hay lineas matcheadas al catalogo para agregar");
      return;
    }
    onAgregar(paraAgregar);
  }

  const matchedCount = (lineas || []).filter(l => l.match_variante_id).length;

  async function crearFaltantes(tasaIva: number | "ia") {
    if (!lineas) return;
    const faltantes = lineas.filter(l => !l.match_variante_id);
    if (faltantes.length === 0) return;
    const usaIa = tasaIva === "ia";
    const label = usaIa
      ? `con 🤖 CLASIFICACIÓN IA (detecta IVA 0/16 y IEPS por nombre)`
      : `con IVA ${((tasaIva as number) * 100).toFixed(0)}%`;
    if (!confirm(`Crear ${faltantes.length} productos nuevos en el catálogo ${label}?\n\nSKUs automáticos y clave SAT ${usaIa ? "sugerida por IA" : "comodín"}. Puedes editarlos después.`)) return;
    try {
      const tasaDefault = usaIa ? 0.16 : (tasaIva as number);
      const payload = {
        items: faltantes.map(l => ({
          nombre: l.descripcion.slice(0, 200),
          precio: entradaConIva ? +(l.precio / (1 + tasaDefault)).toFixed(2) : l.precio,
          cantidad: l.cantidad,
          tasa_iva: usaIa ? null : tasaDefault,
          unidad: "PZA",
        })),
        tasa_iva_default: tasaDefault,
        auto_clasificar: usaIa,
      };
      const r = await api.post("/api/productos/bulk-crear", payload, {
        timeout: 90000,
      });
      // Actualizar las lineas con los nuevos match_variante_id
      const creadosByNombre: Record<string, any> = {};
      for (const c of r.data.creados) creadosByNombre[c.nombre.toLowerCase()] = c;
      const nuevasLineas = lineas.map(l => {
        if (l.match_variante_id) return l;
        const c = creadosByNombre[l.descripcion.toLowerCase().slice(0, 200).toLowerCase()];
        if (c) {
          return {
            ...l,
            match_variante_id: c.variante_id,
            sku: c.sku,
            nombre: c.nombre,
            tasa_iva: c.tasa_iva,
          };
        }
        return l;
      });
      setLineas(nuevasLineas);
      let msg = `✅ Creados: ${r.data.n_creados}\n⚠ Omitidos: ${r.data.n_omitidos}${r.data.n_omitidos > 0 ? " (ya existían o error)" : ""}`;
      if (usaIa && r.data.creados?.length) {
        msg += "\n\n🤖 Clasificación IA:\n" + r.data.creados.slice(0, 10).map((c: any) =>
          `· ${c.nombre.slice(0, 40)} → IVA ${((c.tasa_iva || 0) * 100).toFixed(0)}%${c.tasa_ieps > 0 ? ` + IEPS ${((c.tasa_ieps) * 100).toFixed(1)}%` : ""}`
        ).join("\n");
        if (r.data.creados.length > 10) msg += `\n...y ${r.data.creados.length - 10} más`;
      }
      msg += "\n\nAhora puedes agregar al carrito.";
      alert(msg);
    } catch (e: any) {
      alert("Error: " + (e.response?.data?.detail || e.message));
    }
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 12,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 10, padding: 20,
        width: "100%", maxWidth: 820, maxHeight: "94vh", overflow: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>📥 Importar cotización</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button onClick={() => setTab("archivo")}
            style={{
              padding: "8px 14px", border: 0, borderRadius: 6, cursor: "pointer",
              background: tab === "archivo" ? "#7c3aed" : "#e2e8f0",
              color: tab === "archivo" ? "white" : "#334155",
              fontSize: 13, fontWeight: 700,
            }}>
            📎 Foto / PDF / Excel
          </button>
          <button onClick={() => setTab("pegar")}
            style={{
              padding: "8px 14px", border: 0, borderRadius: 6, cursor: "pointer",
              background: tab === "pegar" ? "#7c3aed" : "#e2e8f0",
              color: tab === "pegar" ? "white" : "#334155",
              fontSize: 13, fontWeight: 700,
            }}>
            📋 Pegar de Excel
          </button>
        </div>

        {!lineas ? (
          <>
            {tab === "archivo" ? (
              <div>
                <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 8px" }}>
                  Sube una <strong>foto / screenshot / PDF</strong> de la cotización, o un archivo <strong>.xlsx</strong>.
                  La IA extrae descripción, cantidad y precio, y matchea contra tu catálogo.
                </p>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xlsm,image/*,application/pdf"
                  onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                  style={{ marginBottom: 10, display: "block" }} />
                {archivo && (
                  <div style={{ fontSize: 12, color: "#475569" }}>
                    Seleccionado: <strong>{archivo.name}</strong> ({Math.round(archivo.size / 1024)} KB)
                  </div>
                )}
                <button onClick={procesarArchivo} disabled={!archivo || procesando}
                  style={{
                    marginTop: 12, background: procesando ? "#94a3b8" : "#7c3aed",
                    color: "white", border: 0, padding: "10px 20px", borderRadius: 6,
                    fontSize: 14, fontWeight: 700, cursor: procesando ? "wait" : "pointer",
                  }}>
                  {procesando ? "Procesando con IA (10-40s)..." : "🚀 Procesar"}
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 8px" }}>
                  Pega las filas de Excel (columnas: <code>descripción | cantidad | precio | monto</code>). <br />
                  Separador: <strong>TAB</strong> (Excel lo pone automático al copiar). Las comas en la descripción están permitidas.
                </p>
                <textarea value={textoPegado} onChange={(e) => setTextoPegado(e.target.value)}
                  placeholder={"Varilla 3/8\t10\t95.00\t950.00\nCemento 50kg\t5\t280.00\t1400.00"}
                  rows={10}
                  style={{
                    width: "100%", padding: 10, fontFamily: "monospace", fontSize: 13,
                    border: "1px solid #cbd5e1", borderRadius: 6,
                  }} />
                <button onClick={procesarTexto} disabled={!textoPegado.trim() || procesando}
                  style={{
                    marginTop: 12, background: procesando ? "#94a3b8" : "#7c3aed",
                    color: "white", border: 0, padding: "10px 20px", borderRadius: 6,
                    fontSize: 14, fontWeight: 700, cursor: procesando ? "wait" : "pointer",
                  }}>
                  {procesando ? "Buscando en catálogo..." : "🚀 Procesar"}
                </button>
              </div>
            )}
            {error && (
              <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10,
                borderRadius: 6, fontSize: 13, marginTop: 12 }}>{error}</div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, fontSize: 13 }}>
              <strong style={{ color: "#059669" }}>{matchedCount}</strong> matcheadas de <strong>{lineas.length}</strong> lineas.
              <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={entradaConIva}
                  onChange={(e) => setEntradaConIva(e.target.checked)} />
                Los precios del archivo YA incluyen IVA
              </label>
            </div>
            <div style={{ marginBottom: 8 }}>
              <button type="button"
                onClick={() => {
                  if (!lineas) return;
                  if (!confirm("Formatear descripciones estilo gobierno?\n\nFormato: 'NOMBRE CORTO\\n<detalle>'  (todo MAYUSCULAS)\n\nAplicara a TODAS las lineas usando su descripcion actual como base.")) return;
                  const nuevas = lineas.map(l => {
                    const texto = (l.descripcion || "").trim();
                    let corto = texto, detalle = "";
                    if (texto.includes(",")) {
                      const idx = texto.indexOf(",");
                      corto = texto.slice(0, idx).trim();
                      detalle = texto.slice(idx + 1).trim();
                    } else {
                      corto = texto;
                      detalle = "";
                    }
                    const descCfdi = detalle
                      ? `${corto.toUpperCase()}\n${detalle.toUpperCase()}`
                      : corto.toUpperCase();
                    return { ...l, descripcion_cfdi: descCfdi };
                  });
                  setLineas(nuevas);
                }}
                style={{
                  padding: "6px 12px", background: "#fbbf24", border: 0, borderRadius: 6,
                  cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#78350f",
                }}>
                🏛 Formato gobierno (NOMBRE / detalle MAYÚSCULAS) a todas
              </button>
            </div>
            <table style={{ width: "100%", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  <th style={{ padding: 6, textAlign: "left" }}>✓</th>
                  <th style={{ padding: 6, textAlign: "left" }}>Descripción</th>
                  <th style={{ padding: 6, textAlign: "left" }}>Match</th>
                  <th style={{ padding: 6, textAlign: "right" }}>Cant.</th>
                  <th style={{ padding: 6, textAlign: "right" }}>Precio</th>
                  <th style={{ padding: 6, textAlign: "center" }}>CFDI</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => {
                  const match = !!l.match_variante_id;
                  const omit = omitidos.has(i);
                  return (
                    <tr key={i} style={{
                      background: !match ? "#fef3c7" : omit ? "#f1f5f9" : "white",
                      borderBottom: "1px solid #e2e8f0", opacity: omit ? 0.5 : 1,
                    }}>
                      <td style={{ padding: 6 }}>
                        <input type="checkbox" disabled={!match}
                          checked={match && !omit}
                          onChange={() => toggleOmitido(i)} />
                      </td>
                      <td style={{ padding: 6 }}>{l.descripcion}</td>
                      <td style={{ padding: 6, fontSize: 11 }}>
                        {match ? (
                          <span style={{ color: "#059669", fontWeight: 700 }}>
                            ✓ {l.sku} · {l.nombre?.slice(0, 40)}
                          </span>
                        ) : (
                          <span style={{ color: "#b45309" }}>⚠ Sin match (se omite)</span>
                        )}
                      </td>
                      <td style={{ padding: 6, textAlign: "right" }}>{l.cantidad}</td>
                      <td style={{ padding: 6, textAlign: "right" }}>${l.precio.toFixed(2)}</td>
                      <td style={{ padding: 6, textAlign: "center" }}>
                        <button type="button"
                          title={l.descripcion_cfdi
                            ? "Descripcion CFDI custom:\n\n" + l.descripcion_cfdi
                            : "Click para editar descripcion exacta del CFDI"}
                          onClick={() => {
                            const actual = l.descripcion_cfdi || l.descripcion;
                            const nuevo = window.prompt(
                              "Descripcion exacta para el CFDI (puedes usar varias lineas):\n\n" +
                              "Ejemplo gobierno:\nPAQ DE AGUA\nPURIFICADA ENVASE 355 ML C/40 PZ",
                              actual
                            );
                            if (nuevo === null) return;
                            const nuevas = lineas!.map((lin, k) =>
                              k === i ? { ...lin, descripcion_cfdi: nuevo || undefined } : lin
                            );
                            setLineas(nuevas);
                          }}
                          style={{
                            background: l.descripcion_cfdi ? "#059669" : "transparent",
                            color: l.descripcion_cfdi ? "white" : "#64748b",
                            border: "1px solid " + (l.descripcion_cfdi ? "#059669" : "#cbd5e1"),
                            padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                            fontSize: 10, fontWeight: 700,
                          }}>
                          {l.descripcion_cfdi ? "✎ custom" : "✎ edit"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Boton para crear automatico los que no matchearon */}
            {lineas.some(l => !l.match_variante_id) && (
              <div style={{
                background: "#fff7ed", border: "1px solid #fdba74",
                padding: 10, borderRadius: 6, marginTop: 10, fontSize: 12, color: "#9a3412",
              }}>
                <div style={{ marginBottom: 6 }}>
                  <strong>{lineas.filter(l => !l.match_variante_id).length} productos</strong> no están en tu catálogo.
                  Elige cómo crearlos:
                </div>
                <button onClick={() => crearFaltantes("ia")}
                  style={{
                    width: "100%", marginBottom: 6,
                    background: "#7c3aed", color: "white", border: 0,
                    padding: "10px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 800,
                  }}>
                  🤖 Crear con CLASIFICACIÓN IA (detecta IVA 0/16 y IEPS por nombre) ← recomendado
                </button>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => crearFaltantes(0)}
                    style={{
                      flex: 1, background: "#059669", color: "white", border: 0,
                      padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700,
                    }}>
                    IVA 0% (alimentos básicos)
                  </button>
                  <button onClick={() => crearFaltantes(0.16)}
                    style={{
                      flex: 1, background: "#1e40af", color: "white", border: 0,
                      padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700,
                    }}>
                    IVA 16% (todos)
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => { setLineas(null); setArchivo(null); setTextoPegado(""); }}
                style={{
                  background: "transparent", border: "1px solid #cbd5e1",
                  padding: "10px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13,
                }}>← Volver</button>
              <button onClick={agregarAlCarrito}
                style={{
                  flex: 1, background: "#059669", color: "white", border: 0,
                  padding: "10px 16px", borderRadius: 6, fontSize: 14, fontWeight: 800, cursor: "pointer",
                }}>
                ✓ Agregar al carrito ({matchedCount - omitidos.size})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
