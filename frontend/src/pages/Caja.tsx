import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

type Item = {
  variante_id: number;
  sku: string;
  nombre: string;
  precio: number;
  cantidad: number;
  stock: number;
};

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FORMAS_PAGO_SAT = [
  { v: "01", t: "Efectivo" },
  { v: "03", t: "Transferencia" },
  { v: "04", t: "Tarjeta crédito" },
  { v: "28", t: "Tarjeta débito" },
];

type PagoRow = { forma_pago_sat: string; monto: number };
type ClienteSel = {
  id: number; nombre: string; rfc?: string | null;
  razon_social?: string | null; regimen_fiscal?: string | null;
  codigo_postal?: string | null; correo?: string | null;
};

export default function Caja() {
  const nav = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<any[]>([]);
  const [showCobrar, setShowCobrar] = useState(false);
  const [tipo, setTipo] = useState<"TICKET" | "REMISION" | "FACTURA">("TICKET");
  const [cliente, setCliente] = useState<ClienteSel>({ id: 1, nombre: "Publico en General" });
  const [showClientePicker, setShowClientePicker] = useState(false);
  const [pagos, setPagos] = useState<PagoRow[]>([{ forma_pago_sat: "01", monto: 0 }]);
  const [procesando, setProcesando] = useState(false);
  const [empresaActiva, setEmpresaActiva] = useState<{ id: number; nombre: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recibidoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const ea = localStorage.getItem("empresa_activa");
      if (ea) setEmpresaActiva(JSON.parse(ea));
    } catch {}
    focus();
  }, []);

  function focus() {
    setTimeout(() => inputRef.current?.focus(), 80);
  }

  const subtotal = items.reduce((a, i) => a + i.cantidad * i.precio, 0);
  const iva = subtotal * 0.16;
  const total = +(subtotal + iva).toFixed(2);

  async function buscarOAgregar() {
    const q = busqueda.trim();
    if (!q) return;
    try {
      // Match exacto por SKU (lo mas comun con barcode scanner)
      const r = await api.get(`/api/productos/sku/${encodeURIComponent(q)}`);
      agregar(r.data);
    } catch {
      // Fallback: busqueda por texto
      try {
        const r = await api.get("/api/productos/buscar-variante", { params: { q } });
        if (r.data.length === 1) {
          agregar(r.data[0]);
        } else if (r.data.length === 0) {
          alert(`No se encontro "${q}"`);
          setBusqueda(""); focus();
        } else {
          setSugerencias(r.data);
        }
      } catch (err: any) {
        alert("Error: " + (err.response?.data?.detail || err.message));
      }
    }
  }

  function agregar(s: any) {
    const idx = items.findIndex((i) => i.variante_id === s.id);
    if (idx >= 0) {
      const c = [...items];
      c[idx].cantidad += 1;
      setItems(c);
    } else {
      setItems([...items, {
        variante_id: s.id, sku: s.sku, nombre: s.nombre,
        precio: s.precio, cantidad: 1, stock: s.stock,
      }]);
    }
    setBusqueda("");
    setSugerencias([]);
    focus();
  }

  function eliminar(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
    focus();
  }

  function cambiarCantidad(idx: number, nueva: number) {
    if (nueva <= 0) return eliminar(idx);
    const c = [...items];
    c[idx].cantidad = nueva;
    setItems(c);
  }

  function abrirCobrar() {
    if (items.length === 0) return;
    setPagos([{ forma_pago_sat: tipo === "FACTURA" ? "03" : "01", monto: total }]);
    setShowCobrar(true);
    setTimeout(() => recibidoRef.current?.select(), 100);
  }

  const sumaPagos = +pagos.reduce((a, p) => a + (p.monto || 0), 0).toFixed(2);
  const faltante = +(total - sumaPagos).toFixed(2);
  const usaSplit = pagos.length > 1;

  function setPago(idx: number, patch: Partial<PagoRow>) {
    setPagos(pagos.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function agregarPago() {
    if (pagos.length >= 2) return;
    setPagos([...pagos, { forma_pago_sat: "03", monto: Math.max(0, faltante) }]);
  }
  function quitarPago(idx: number) {
    const nuevos = pagos.filter((_, i) => i !== idx);
    if (nuevos.length === 1) nuevos[0].monto = total;
    setPagos(nuevos.length ? nuevos : [{ forma_pago_sat: "01", monto: total }]);
  }

  async function cobrar() {
    if (procesando) return;
    // Validar pagos para TICKET y FACTURA PUE; REMISION es a credito (sin pagos)
    if (tipo !== "REMISION") {
      // Se permite pagar MAS del total (la diferencia es cambio); solo falla si paga menos.
      if (sumaPagos < total - 0.01) {
        alert(`Faltan ${fmt(total - sumaPagos)} por cubrir`);
        return;
      }
      if (pagos.some((p) => p.monto <= 0)) {
        alert("Cada método de pago debe ser mayor a $0");
        return;
      }
    }
    if (tipo === "FACTURA" && !cliente.rfc) {
      alert("Para facturar el cliente necesita RFC. Click 'cambiar' en el campo Cliente.");
      return;
    }
    setProcesando(true);
    const payload: any = {
      tipo, cliente_id: cliente.id,
      forma_pago_sat: tipo === "FACTURA" ? (pagos[0]?.forma_pago_sat || "03") : "01",
      metodo_pago_sat: tipo === "REMISION" ? "PPD" : "PUE",
      conceptos: items.map((i) => ({
        variante_id: i.variante_id, cantidad: i.cantidad, precio_unitario: i.precio,
      })),
    };
    if (tipo !== "REMISION") {
      payload.pagos = pagos.map((p) => ({
        forma_pago_sat: p.forma_pago_sat, monto: +p.monto,
      }));
    }
    try {
      const r = await api.post("/api/ventas", payload);
      const ventaId = r.data.id;

      // Si es FACTURA, timbrar al toque
      let cfdiOk: any = null;
      let cfdiErr: string | null = null;
      if (tipo === "FACTURA") {
        try {
          const t = await api.post(`/api/cfdi/timbrar/${ventaId}`);
          cfdiOk = t.data;
        } catch (err: any) {
          cfdiErr = err.response?.data?.detail || err.message;
        }
      }

      // Imprimir PDF: descarga blob con auth y abre/imprime
      try {
        const pdfRes = await api.get(`/api/ventas/${ventaId}/pdf`, { responseType: "blob" });
        const pdfUrl = URL.createObjectURL(pdfRes.data);
        const w = window.open(pdfUrl, "_blank");
        if (w) {
          w.onload = () => {
            try { w.print(); } catch {}
          };
        }
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
      } catch {}

      if (cfdiOk) {
        const corr = cfdiOk.correo_enviado_a ? `\nEnviada a ${cfdiOk.correo_enviado_a}` : "";
        alert(`Factura ${r.data.folio} timbrada.\nUUID: ${cfdiOk.uuid}${corr}`);
      } else if (cfdiErr) {
        alert(`Venta ${r.data.folio} creada pero NO se timbró:\n${cfdiErr}\n\nReintenta desde Mis ventas.`);
      }

      // Reset
      setItems([]);
      setShowCobrar(false);
      setBusqueda("");
      setSugerencias([]);
      setPagos([{ forma_pago_sat: "01", monto: 0 }]);
      setTipo("TICKET");
      focus();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setProcesando(false);
    }
  }

  // Atajos teclado globales
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showCobrar) {
        if (e.key === "Escape") { e.preventDefault(); setShowCobrar(false); focus(); }
        return;
      }
      if (e.key === "F5") { e.preventDefault(); abrirCobrar(); }
      if (e.key === "F4") {
        e.preventDefault();
        if (items.length > 0 && confirm("Limpiar venta actual?")) {
          setItems([]); focus();
        }
      }
      if (e.key === "F2") {
        e.preventDefault();
        setShowClientePicker(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, showCobrar, cliente.id]);

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100vh", background: "var(--color-bg)" }}>
      {/* Header */}
      <div style={{
        background: "var(--color-sidebar-bg)", color: "white",
        padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-primary)" }}></span>
          <strong style={{ letterSpacing: "0.05em" }}>ACEROMAX · CAJA</strong>
          {empresaActiva && (
            <span style={{ fontSize: 12, color: "#94a3b8", paddingLeft: 12, borderLeft: "1px solid #334155" }}>
              Operando como: <strong style={{ color: "white" }}>{empresaActiva.nombre}</strong>
            </span>
          )}
          <span style={{ fontSize: 12, color: "#94a3b8", paddingLeft: 12, borderLeft: "1px solid #334155" }}>
            Cliente: <button type="button" onClick={() => setShowClientePicker(true)}
              style={{ background: "transparent", border: "1px solid #334155", color: "white",
                padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
              {cliente.nombre}{cliente.rfc ? ` · ${cliente.rfc}` : ""} ✎
            </button> <span style={{ opacity: 0.6 }}>(F2)</span>
          </span>
        </div>
        <button onClick={() => nav("/")}
          style={{
            background: "transparent", color: "white", border: "1px solid #334155",
            padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13,
          }}>
          Salir de caja
        </button>
      </div>

      {/* Main: scanner | cart */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", overflow: "hidden" }}>
        {/* Izquierda */}
        <div style={{ padding: 24, background: "white", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <input
            ref={inputRef}
            value={busqueda}
            placeholder="Escanea código o teclea SKU/nombre y Enter..."
            style={{
              width: "100%", padding: "20px 24px", fontSize: 22, fontWeight: 500,
              border: "3px solid var(--color-primary)", borderRadius: 12,
              outline: "none",
            }}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); buscarOAgregar(); }
            }}
          />

          {sugerencias.length > 0 && (
            <div style={{ marginTop: 16, border: "1px solid var(--color-border)", borderRadius: 8, overflow: "auto", maxHeight: 400 }}>
              {sugerencias.map((s) => (
                <div key={s.id}
                  onClick={() => agregar(s)}
                  style={{
                    padding: 16, cursor: "pointer",
                    borderBottom: "1px solid var(--color-border)",
                    fontSize: 16,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "white")}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <strong style={{ fontFamily: "monospace" }}>{s.sku}</strong>
                      <span style={{ marginLeft: 12 }}>{s.nombre}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--color-primary)", fontWeight: 700, fontSize: 18 }}>{fmt(s.precio)}</span>
                      <span style={{ marginLeft: 8, fontSize: 12, color: "var(--color-text-muted)" }}>stock {s.stock}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ padding: 8, textAlign: "center", fontSize: 12, color: "var(--color-text-muted)" }}>
                Click para agregar
              </div>
            </div>
          )}

          {/* Atajos */}
          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--color-border)", display: "flex", gap: 16, color: "var(--color-text-secondary)", fontSize: 12, flexWrap: "wrap" }}>
            <span><kbd style={kbdStyle}>Enter</kbd> agregar/buscar</span>
            <span><kbd style={kbdStyle}>F2</kbd> cambiar cliente</span>
            <span><kbd style={kbdStyle}>F4</kbd> limpiar venta</span>
            <span><kbd style={kbdStyle}>F5</kbd> cobrar</span>
            <span><kbd style={kbdStyle}>Esc</kbd> cerrar dialog</span>
          </div>
        </div>

        {/* Derecha: cart */}
        <div style={{ background: "var(--color-sidebar-bg)", padding: 16, display: "flex", flexDirection: "column", color: "white" }}>
          <div style={{ flex: 1, overflow: "auto", marginBottom: 12 }}>
            {items.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
                Sin productos.<br/>
                Escanea o busca arriba.
              </div>
            ) : (
              items.map((i, idx) => (
                <div key={idx} style={{
                  background: "var(--color-sidebar-active)", padding: 12, marginBottom: 8, borderRadius: 8,
                  display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center",
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.nombre}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                      {i.sku} · {fmt(i.precio)}
                    </div>
                  </div>
                  <input type="number" min="0.01" step="0.01" value={i.cantidad}
                    style={{
                      width: 64, padding: 6, textAlign: "right", fontSize: 14,
                      border: "1px solid #334155", background: "#0f172a", color: "white", borderRadius: 4,
                    }}
                    onChange={(e) => cambiarCantidad(idx, +e.target.value)} />
                  <button onClick={() => eliminar(idx)}
                    style={{
                      background: "transparent", color: "#ef4444", border: "1px solid #334155",
                      padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12,
                    }}>×</button>
                </div>
              ))
            )}
          </div>

          {/* Total */}
          <div style={{ background: "white", color: "var(--color-text-primary)", padding: 16, borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-text-muted)" }}>
              <span>IVA 16%</span><span>{fmt(iva)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 32, fontWeight: 800, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-border)" }}>
              <span>TOTAL</span><span>{fmt(total)}</span>
            </div>
            <button
              onClick={abrirCobrar}
              disabled={items.length === 0}
              style={{
                width: "100%", marginTop: 12, padding: "16px",
                fontSize: 18, fontWeight: 700, color: "white",
                background: items.length === 0 ? "#94a3b8" : "var(--color-primary)",
                border: 0, borderRadius: 8,
                cursor: items.length === 0 ? "not-allowed" : "pointer",
              }}>
              COBRAR (F5)
            </button>
          </div>
        </div>
      </div>

      {/* Modal cobrar */}
      {showCobrar && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }} onClick={() => !procesando && setShowCobrar(false)}>
          <div style={{ background: "white", maxWidth: 560, width: "92%", padding: 28, borderRadius: 14 }}
            onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, color: "var(--color-text-secondary)" }}>Cobrar — Total</h2>
            <h1 style={{ margin: "0 0 20px", fontSize: 40, fontWeight: 800 }}>{fmt(total)}</h1>
            <div className="form-grid">
              <div>
                <label>Tipo de documento</label>
                <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as any)} style={{ fontSize: 16, padding: 10 }}>
                  <option value="TICKET">Ticket</option>
                  <option value="REMISION">Remisión (a crédito)</option>
                  <option value="FACTURA">Factura CFDI</option>
                </select>
              </div>
              <div>
                <label>Cliente</label>
                <button type="button" onClick={() => setShowClientePicker(true)}
                  style={{ width: "100%", padding: 10, fontSize: 14, textAlign: "left",
                    border: "1px solid var(--color-border)", borderRadius: 6, background: "white", cursor: "pointer" }}>
                  {cliente.nombre}{cliente.rfc ? ` · ${cliente.rfc}` : ""}
                  <span style={{ float: "right", color: "var(--color-text-muted)" }}>cambiar ✎</span>
                </button>
                {tipo === "FACTURA" && !cliente.rfc && (
                  <p style={{ color: "var(--color-danger)", fontSize: 12, margin: "4px 0 0" }}>
                    Para facturar, el cliente debe tener RFC. Click "cambiar" para seleccionar o crear.
                  </p>
                )}
              </div>
            </div>
            {tipo !== "REMISION" && (
              <div style={{ marginTop: 16, padding: 12, background: "var(--color-bg)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ fontSize: 14 }}>Forma(s) de pago</strong>
                  {pagos.length < 2 && (
                    <button onClick={agregarPago}
                      style={{ fontSize: 12, padding: "4px 10px", border: "1px dashed var(--color-border)",
                        background: "white", borderRadius: 4, cursor: "pointer" }}>
                      + 2do método
                    </button>
                  )}
                </div>
                {pagos.map((p, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 140px auto", gap: 8, marginBottom: 6 }}>
                    <select className="input" value={p.forma_pago_sat}
                      onChange={(e) => setPago(idx, { forma_pago_sat: e.target.value })}>
                      {FORMAS_PAGO_SAT.map((f) => <option key={f.v} value={f.v}>{f.t}</option>)}
                    </select>
                    <input ref={idx === 0 ? recibidoRef : undefined} className="input" type="number" step="0.01"
                      value={p.monto}
                      onChange={(e) => setPago(idx, { monto: +e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && sumaPagos >= total - 0.01 && cobrar()}
                      style={{ fontSize: 16, padding: 10, textAlign: "right", fontWeight: 600 }} />
                    {pagos.length > 1 && (
                      <button onClick={() => quitarPago(idx)}
                        style={{ background: "transparent", border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer", padding: "0 10px" }}>×</button>
                    )}
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    {usaSplit ? "Suma pagos" : (tipo === "TICKET" ? "Recibido" : "Pago")}
                  </span>
                  <span>{fmt(sumaPagos)}</span>
                </div>
                {!usaSplit && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 800,
                    color: faltante > 0.01 ? "var(--color-danger)" : "var(--color-success)" }}>
                    <span>{faltante > 0.01 ? "Falta" : "Cambio"}</span>
                    <span>{fmt(Math.abs(faltante))}</span>
                  </div>
                )}
                {usaSplit && faltante > 0.01 && (
                  <div style={{ fontSize: 13, color: "var(--color-danger)", marginTop: 4 }}>
                    Falta: {fmt(faltante)} — ajusta los montos
                  </div>
                )}
                {usaSplit && faltante < -0.01 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700,
                    color: "var(--color-success)", marginTop: 4 }}>
                    <span>Cambio</span>
                    <span>{fmt(-faltante)}</span>
                  </div>
                )}
                {usaSplit && (
                  <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "8px 0 0" }}>
                    Pago combinado: el CFDI usará Forma de pago "99 — Por definir" según SAT 4.0
                  </p>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={cobrar}
                disabled={procesando || (tipo !== "REMISION" && sumaPagos < total - 0.01)}
                style={{
                  flex: 1, padding: 18, fontSize: 18, fontWeight: 700, color: "white",
                  background: procesando ? "#94a3b8" : "var(--color-primary)",
                  border: 0, borderRadius: 8, cursor: procesando ? "wait" : "pointer",
                }}>
                {procesando ? "Procesando..." : "CONFIRMAR (Enter)"}
              </button>
              <button onClick={() => setShowCobrar(false)} disabled={procesando}
                style={{
                  padding: "16px 24px", fontSize: 14,
                  background: "white", border: "1px solid var(--color-border)", borderRadius: 8, cursor: "pointer",
                }}>
                Cancelar (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal selector de cliente */}
      {showClientePicker && (
        <ClientePicker
          requiereRfc={tipo === "FACTURA"}
          onClose={() => { setShowClientePicker(false); focus(); }}
          onSelect={(c) => { setCliente(c); setShowClientePicker(false); focus(); }}
        />
      )}
    </div>
  );
}


function ClientePicker({ onClose, onSelect, requiereRfc }: {
  onClose: () => void;
  onSelect: (c: ClienteSel) => void;
  requiereRfc: boolean;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [nuevo, setNuevo] = useState({
    nombre: "", rfc: "", razon_social: "",
    regimen_fiscal: "612", codigo_postal: "", correo: "",
    uso_cfdi_default: "G03",
  });
  const [creando, setCreando] = useState(false);
  const inputBuscarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputBuscarRef.current?.focus(), 80);
    buscar("");
  }, []);

  async function buscar(query: string) {
    setLoading(true);
    try {
      const r = await api.get("/api/clientes", { params: { q: query || undefined } });
      setResultados(r.data);
    } finally {
      setLoading(false);
    }
  }

  async function crear() {
    if (!nuevo.nombre && !nuevo.razon_social) return alert("Captura nombre o razón social");
    if (requiereRfc && (!nuevo.rfc || nuevo.rfc.length < 12)) return alert("RFC requerido (12-13 chars)");
    setCreando(true);
    try {
      const payload: any = { ...nuevo };
      payload.rfc = nuevo.rfc ? nuevo.rfc.toUpperCase().trim() : null;
      payload.nombre = nuevo.nombre || nuevo.razon_social;
      const r = await api.post("/api/clientes", payload);
      const det = await api.get(`/api/clientes/${r.data.id}`);
      onSelect(det.data);
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setCreando(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "white", maxWidth: 640, width: "92%", maxHeight: "90vh",
          overflow: "auto", padding: 20, borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Seleccionar cliente</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {!mostrarCrear ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input ref={inputBuscarRef} className="input"
                placeholder="Buscar por nombre, RFC, WhatsApp..."
                value={q} onChange={(e) => { setQ(e.target.value); buscar(e.target.value); }}
                style={{ flex: 1, fontSize: 14 }} />
              <button className="btn" onClick={() => setMostrarCrear(true)}>+ Nuevo</button>
            </div>
            <div style={{ maxHeight: 400, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 6 }}>
              {loading && <div style={{ padding: 12, textAlign: "center", color: "var(--color-text-muted)" }}>Buscando...</div>}
              {!loading && resultados.length === 0 && (
                <div style={{ padding: 16, textAlign: "center", color: "var(--color-text-muted)" }}>
                  Sin resultados. <button onClick={() => setMostrarCrear(true)}
                    style={{ background: "transparent", border: 0, color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline" }}>
                    Crear nuevo cliente
                  </button>
                </div>
              )}
              {resultados.map((c) => {
                const apto = !requiereRfc || !!c.rfc;
                return (
                  <div key={c.id} onClick={() => apto && onSelect(c)}
                    style={{ padding: "10px 14px", cursor: apto ? "pointer" : "not-allowed",
                      borderBottom: "1px solid var(--color-border)",
                      opacity: apto ? 1 : 0.45, fontSize: 14 }}
                    onMouseEnter={(e) => apto && (e.currentTarget.style.background = "var(--color-bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "white")}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong>{c.nombre}</strong>
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                        {c.rfc || (requiereRfc ? "⚠ sin RFC" : "—")}
                      </span>
                    </div>
                    {(c.razon_social || c.correo || c.whatsapp) && (
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                        {[c.razon_social, c.correo, c.whatsapp].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
              {requiereRfc ? "Captura datos fiscales completos para CFDI." : "Datos mínimos: nombre."}
            </p>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label>Nombre / Razón social *</label>
                <input className="input" value={nuevo.nombre}
                  onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value, razon_social: e.target.value })} />
              </div>
              <div>
                <label>RFC {requiereRfc && "*"}</label>
                <input className="input" maxLength={13} value={nuevo.rfc}
                  onChange={(e) => setNuevo({ ...nuevo, rfc: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label>CP {requiereRfc && "*"}</label>
                <input className="input" maxLength={5} value={nuevo.codigo_postal}
                  onChange={(e) => setNuevo({ ...nuevo, codigo_postal: e.target.value.replace(/\D/g, "") })} />
              </div>
              <div>
                <label>Régimen fiscal</label>
                <select className="input" value={nuevo.regimen_fiscal}
                  onChange={(e) => setNuevo({ ...nuevo, regimen_fiscal: e.target.value })}>
                  <option value="601">601 - General PM</option>
                  <option value="603">603 - PM sin fines de lucro</option>
                  <option value="605">605 - Sueldos y salarios</option>
                  <option value="606">606 - Arrendamiento</option>
                  <option value="612">612 - PF Act. empresarial</option>
                  <option value="616">616 - Sin obligaciones</option>
                  <option value="621">621 - RIF</option>
                  <option value="626">626 - RESICO</option>
                </select>
              </div>
              <div>
                <label>Uso CFDI default</label>
                <select className="input" value={nuevo.uso_cfdi_default}
                  onChange={(e) => setNuevo({ ...nuevo, uso_cfdi_default: e.target.value })}>
                  <option value="G01">G01 - Adquisición</option>
                  <option value="G03">G03 - Gastos en general</option>
                  <option value="P01">P01 - Por definir</option>
                  <option value="S01">S01 - Sin efectos fiscales</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label>Correo electrónico</label>
                <input className="input" type="email" value={nuevo.correo}
                  onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn" disabled={creando} onClick={crear}>
                {creando ? "Creando..." : "Guardar y usar"}
              </button>
              <button className="btn-icon" onClick={() => setMostrarCrear(false)}>← Volver a buscar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  padding: "2px 6px",
  fontSize: 11,
  fontFamily: "monospace",
};
