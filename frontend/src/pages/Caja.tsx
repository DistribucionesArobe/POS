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

export default function Caja() {
  const nav = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<any[]>([]);
  const [showCobrar, setShowCobrar] = useState(false);
  const [tipo, setTipo] = useState<"TICKET" | "REMISION" | "FACTURA">("TICKET");
  const [clienteId, setClienteId] = useState<number>(1);
  const [recibido, setRecibido] = useState<number>(0);
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
  const cambio = +(recibido - total).toFixed(2);

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
    setRecibido(total);
    setShowCobrar(true);
    setTimeout(() => recibidoRef.current?.select(), 100);
  }

  async function cobrar() {
    if (procesando) return;
    setProcesando(true);
    const payload = {
      tipo, cliente_id: clienteId,
      forma_pago_sat: tipo === "FACTURA" ? "03" : "01",
      metodo_pago_sat: tipo === "REMISION" ? "PPD" : "PUE",
      conceptos: items.map((i) => ({
        variante_id: i.variante_id, cantidad: i.cantidad, precio_unitario: i.precio,
      })),
    };
    try {
      const r = await api.post("/api/ventas", payload);
      // Imprimir PDF: descarga blob con auth y abre/imprime
      try {
        const pdfRes = await api.get(`/api/ventas/${r.data.id}/pdf`, { responseType: "blob" });
        const pdfUrl = URL.createObjectURL(pdfRes.data);
        const w = window.open(pdfUrl, "_blank");
        if (w) {
          w.onload = () => {
            try { w.print(); } catch {}
          };
        }
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
      } catch {}
      // Reset
      setItems([]);
      setShowCobrar(false);
      setBusqueda("");
      setSugerencias([]);
      setRecibido(0);
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
        const id = prompt("ID del cliente:", String(clienteId));
        if (id) setClienteId(+id);
        focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, showCobrar, clienteId]);

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
            Cliente: <strong style={{ color: "white" }}>#{clienteId}</strong> (F2 cambiar)
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
                <label>Cliente ID</label>
                <input className="input" type="number" value={clienteId}
                  onChange={(e) => setClienteId(+e.target.value)} style={{ fontSize: 16, padding: 10 }} />
              </div>
              {tipo === "TICKET" && (
                <>
                  <div>
                    <label>Recibido</label>
                    <input ref={recibidoRef} className="input" type="number" step="0.01" value={recibido}
                      onChange={(e) => setRecibido(+e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && cambio >= 0 && cobrar()}
                      style={{ fontSize: 22, padding: 12, fontWeight: 600 }} />
                  </div>
                  <div>
                    <label>Cambio</label>
                    <div style={{
                      padding: 12, fontSize: 28, fontWeight: 800,
                      color: cambio < 0 ? "var(--color-danger)" : "var(--color-success)",
                    }}>
                      {fmt(cambio)}
                    </div>
                  </div>
                </>
              )}
              {tipo === "FACTURA" && (
                <div className="form-grid-full" style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: 12, background: "var(--color-bg)", borderRadius: 6 }}>
                  El CFDI se generará al guardar. Después podrás timbrarlo desde "Mis ventas".
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={cobrar}
                disabled={procesando || (tipo === "TICKET" && cambio < 0)}
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
