import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";
import CerrarCajaModal from "../components/CerrarCajaModal";
import ClientePicker from "../components/ClientePicker";

type Item = {
  variante_id: number; sku: string; nombre: string;
  cantidad: number; precio: number;  // SIN IVA siempre (base)
  tasa_iva: number;
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
  const total = +(subtotal + iva).toFixed(2);
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
      </div>

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
          <div style={{ display: "flex", gap: 14 }}>
            <span>Piezas: <strong style={{ color: "#0f172a" }}>{n_piezas}</strong></span>
            <span>Items: <strong style={{ color: "#0f172a" }}>{items.length}</strong></span>
            <span>Subtotal s/IVA: <strong style={{ color: "#0f172a" }}>{fmtMoney(subtotal)}</strong></span>
            <span>IVA: <strong style={{ color: "#0f172a" }}>{fmtMoney(iva)}</strong></span>
          </div>
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
