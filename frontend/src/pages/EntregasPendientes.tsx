import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type FacturaPendiente = {
  id: number; folio: string; fecha: string | null;
  cliente: string; cliente_rfc: string | null;
  total: number; valor_entregado: number; saldo_pendiente: number;
  pct_entregado: number; completa: boolean;
};

type ItemSalida = {
  id: number; variante_id: number;
  producto_nombre: string; descripcion: string | null;
  cantidad: number; precio_unitario: number; importe: number;
};
type Salida = {
  id: number; fecha: string;
  valor_total: number; notas: string | null;
  items: ItemSalida[];
};
type Detalle = {
  id: number; folio: string; fecha: string | null;
  cliente_id: number | null; cliente_nombre: string;
  total: number; valor_entregado: number; saldo_pendiente: number;
  salidas: Salida[]; tiene_entregas_pendientes: boolean;
};

const fmt = (n: number) => "$" + (n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" }) : "-";

export default function EntregasPendientes() {
  const [lista, setLista] = useState<FacturaPendiente[]>([]);
  const [incluirCompletas, setIncluirCompletas] = useState(false);
  const [loading, setLoading] = useState(true);
  const [abrir, setAbrir] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [nuevaSalida, setNuevaSalida] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");

  async function cargarLista() {
    setLoading(true); setError(null);
    try {
      const r = await api.get("/api/entregas-pendientes", { params: { incluir_completas: incluirCompletas } });
      setLista(r.data);
    } catch (e: any) { setError(e.response?.data?.detail || e.message); }
    finally { setLoading(false); }
  }

  async function cargarDetalle(id: number) {
    try {
      const r = await api.get(`/api/entregas-pendientes/${id}`);
      setDetalle(r.data);
    } catch (e: any) { alert("Error: " + (e.response?.data?.detail || e.message)); }
  }

  useEffect(() => { cargarLista(); }, [incluirCompletas]);
  useEffect(() => { if (abrir) cargarDetalle(abrir); else setDetalle(null); }, [abrir]);

  const filtradas = useMemo(() => {
    if (!filtro.trim()) return lista;
    const q = filtro.toLowerCase();
    return lista.filter(f =>
      f.folio.toLowerCase().includes(q) ||
      f.cliente.toLowerCase().includes(q) ||
      (f.cliente_rfc || "").toLowerCase().includes(q)
    );
  }, [lista, filtro]);

  async function cancelarSalida(salidaId: number) {
    if (!confirm("Revertir esta salida? Devuelve el inventario y resta del valor entregado.")) return;
    try {
      await api.delete(`/api/entregas-pendientes/salida/${salidaId}`);
      if (abrir) cargarDetalle(abrir);
      cargarLista();
      setMsg("Salida revertida");
    } catch (e: any) { alert("Error: " + (e.response?.data?.detail || e.message)); }
  }

  const totalSaldoPendiente = filtradas.reduce((s, f) => s + f.saldo_pendiente, 0);

  return (
    <Layout title="Entregas Pendientes" subtitle="Facturas con mercancía por entregar">
      {msg && <div style={{ background: "#dcfce7", color: "#065f46", padding: 10, borderRadius: 6, marginBottom: 12 }}>{msg}</div>}
      {error && <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 6, marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Buscar por folio, cliente, RFC..."
          value={filtro} onChange={(e) => setFiltro(e.target.value)}
          style={{ flex: 1, minWidth: 240, padding: "8px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 6 }} />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={incluirCompletas} onChange={(e) => setIncluirCompletas(e.target.checked)} />
          Incluir completas
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
        <MiniCard label="Facturas pendientes" valor={filtradas.length.toString()} />
        <MiniCard label="Saldo total por entregar" valor={fmt(totalSaldoPendiente)} color="#dc2626" />
        <MiniCard label="Ya entregado total" valor={fmt(filtradas.reduce((s, f) => s + f.valor_entregado, 0))} color="#059669" />
      </div>

      {loading ? (
        <div style={{ padding: 20 }}>Cargando...</div>
      ) : filtradas.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📦</div>
          <h3 style={{ margin: 0 }}>Sin facturas con entregas pendientes</h3>
          <p style={{ color: "#64748b" }}>
            Al crear o editar una factura marcala con "Entregas pendientes" para que aparezca aquí.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={th}>Folio</th>
                <th style={th}>Fecha</th>
                <th style={th}>Cliente</th>
                <th style={{ ...th, textAlign: "right" }}>Total</th>
                <th style={{ ...th, textAlign: "right" }}>Entregado</th>
                <th style={{ ...th, textAlign: "right" }}>Saldo</th>
                <th style={{ ...th, width: 120 }}>Progreso</th>
                <th style={{ ...th, width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(f => (
                <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9",
                  background: f.completa ? "#f0fdf4" : undefined }}>
                  <td style={{ ...td, fontWeight: 700 }}>{f.folio}</td>
                  <td style={td}>{fmtDate(f.fecha)}</td>
                  <td style={td}>
                    <div>{f.cliente}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{f.cliente_rfc || ""}</div>
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(f.total)}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#059669" }}>{fmt(f.valor_entregado)}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: f.completa ? "#059669" : "#dc2626", fontWeight: 700 }}>
                    {fmt(f.saldo_pendiente)}
                  </td>
                  <td style={td}>
                    <div style={{ background: "#e2e8f0", height: 10, borderRadius: 5, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${f.pct_entregado}%`,
                        background: f.completa ? "#059669" : "#3b82f6" }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", textAlign: "center", marginTop: 2 }}>
                      {f.pct_entregado}%
                    </div>
                  </td>
                  <td style={td}>
                    <button onClick={() => setAbrir(f.id)}
                      style={{ background: "#0f172a", color: "white", border: 0,
                        padding: "6px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Ver / Entregar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abrir && detalle && (
        <DetalleModal detalle={detalle} onClose={() => setAbrir(null)}
          onNuevaSalida={() => setNuevaSalida(true)}
          onCancelarSalida={cancelarSalida} />
      )}

      {nuevaSalida && detalle && (
        <NuevaSalidaModal detalle={detalle}
          onClose={() => setNuevaSalida(false)}
          onSaved={() => { setNuevaSalida(false); cargarDetalle(detalle.id); cargarLista(); setMsg("Salida registrada e inventario descontado"); }} />
      )}
    </Layout>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13 };

function MiniCard({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div style={{ background: "white", padding: 14, borderRadius: 8, border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: color || "#0f172a", fontVariantNumeric: "tabular-nums" }}>{valor}</div>
    </div>
  );
}


function DetalleModal({ detalle, onClose, onNuevaSalida, onCancelarSalida }: {
  detalle: Detalle; onClose: () => void;
  onNuevaSalida: () => void;
  onCancelarSalida: (id: number) => void;
}) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500, padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12,
        padding: 20, width: "100%", maxWidth: 760, maxHeight: "92vh", overflow: "auto", color: "#0f172a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0 }}>Factura {detalle.folio}</h2>
            <p style={{ margin: "4px 0", color: "#64748b" }}>{detalle.cliente_nombre}</p>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 24, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
          <div style={{ background: "#f8fafc", padding: 10, borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>Total factura</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{fmt(detalle.total)}</div>
          </div>
          <div style={{ background: "#dcfce7", padding: 10, borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: "#065f46" }}>Entregado</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#065f46" }}>{fmt(detalle.valor_entregado)}</div>
          </div>
          <div style={{ background: "#fee2e2", padding: 10, borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: "#991b1b" }}>Saldo pendiente</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#991b1b" }}>{fmt(detalle.saldo_pendiente)}</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Salidas registradas ({detalle.salidas.length})</h3>
          {detalle.saldo_pendiente > 0 && (
            <button onClick={onNuevaSalida}
              style={{ background: "#059669", color: "white", border: 0,
                padding: "10px 16px", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              + Nueva entrega
            </button>
          )}
        </div>

        {detalle.salidas.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: 6 }}>
            Sin salidas aún. Click en "+ Nueva entrega" para registrar la primera.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {detalle.salidas.map(s => (
              <div key={s.id} style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div>
                    <strong>Salida #{s.id}</strong>
                    <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>
                      {new Date(s.fecha).toLocaleString("es-MX")}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <strong style={{ fontSize: 15 }}>{fmt(s.valor_total)}</strong>
                    <button onClick={() => onCancelarSalida(s.id)}
                      style={{ background: "transparent", border: "1px solid #dc2626",
                        color: "#dc2626", padding: "4px 8px", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>
                      Revertir
                    </button>
                  </div>
                </div>
                {s.notas && <div style={{ fontSize: 12, color: "#64748b", fontStyle: "italic", marginBottom: 6 }}>{s.notas}</div>}
                <table style={{ width: "100%", fontSize: 12 }}>
                  <tbody>
                    {s.items.map(it => (
                      <tr key={it.id}>
                        <td>{it.producto_nombre}</td>
                        <td style={{ textAlign: "right" }}>{it.cantidad}</td>
                        <td style={{ textAlign: "right", color: "#64748b" }}>× {fmt(it.precio_unitario)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>{fmt(it.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function NuevaSalidaModal({ detalle, onClose, onSaved }: {
  detalle: Detalle; onClose: () => void; onSaved: () => void;
}) {
  const [items, setItems] = useState<{ variante_id: number; nombre: string; cantidad: number; precio: number }[]>([]);
  const [buscar, setBuscar] = useState("");
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [notas, setNotas] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function buscarProductos() {
    if (!buscar.trim()) return;
    try {
      const r = await api.get("/api/productos/buscar-variante", { params: { q: buscar } });
      setCandidatos(r.data);
    } catch (e: any) { setErr(e.response?.data?.detail || e.message); }
  }

  function agregar(c: any) {
    setItems([...items, { variante_id: c.id, nombre: c.nombre, cantidad: 1, precio: c.precio }]);
    setBuscar(""); setCandidatos([]);
  }
  function updateItem(i: number, patch: any) {
    const nuevos = [...items]; nuevos[i] = { ...nuevos[i], ...patch }; setItems(nuevos);
  }
  function removeItem(i: number) { setItems(items.filter((_, k) => k !== i)); }

  const valorSalida = items.reduce((s, it) => s + it.cantidad * it.precio, 0);
  const excede = valorSalida > detalle.saldo_pendiente + 0.01;

  async function guardar() {
    if (items.length === 0) { setErr("Agrega al menos 1 producto"); return; }
    if (excede) { setErr(`Valor ${fmt(valorSalida)} excede saldo pendiente ${fmt(detalle.saldo_pendiente)}`); return; }
    setBusy(true); setErr(null);
    try {
      await api.post("/api/entregas-pendientes/salida", {
        documento_venta_id: detalle.id,
        items: items.map(it => ({ variante_id: it.variante_id, cantidad: it.cantidad, precio_unitario: it.precio })),
        notas: notas || null,
      });
      onSaved();
    } catch (e: any) { setErr(e.response?.data?.detail || e.message); }
    finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1600, padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12,
        padding: 20, width: "100%", maxWidth: 700, maxHeight: "92vh", overflow: "auto", color: "#0f172a" }}>
        <h2 style={{ margin: "0 0 6px" }}>Nueva entrega — {detalle.folio}</h2>
        <div style={{ padding: 10, background: "#fef3c7", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          Saldo pendiente disponible: <strong>{fmt(detalle.saldo_pendiente)}</strong>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700 }}>Buscar producto a entregar</label>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscarProductos()}
              placeholder="Nombre o SKU..." autoFocus
              style={{ flex: 1, padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 4 }} />
            <button onClick={buscarProductos}
              style={{ background: "#1e40af", color: "white", border: 0, padding: "8px 16px", borderRadius: 4, cursor: "pointer" }}>
              Buscar
            </button>
          </div>
          {candidatos.length > 0 && (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, marginTop: 6, maxHeight: 180, overflow: "auto" }}>
              {candidatos.map((c: any) => (
                <div key={c.id} onClick={() => agregar(c)}
                  style={{ padding: 10, borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
                  <span>{c.nombre}</span>
                  <span style={{ fontWeight: 700 }}>{fmt(c.precio)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <table style={{ width: "100%", marginTop: 14, fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: 6 }}>Producto</th>
                <th style={{ padding: 6, textAlign: "right", width: 80 }}>Cant</th>
                <th style={{ padding: 6, textAlign: "right", width: 100 }}>Precio</th>
                <th style={{ padding: 6, textAlign: "right", width: 100 }}>Importe</th>
                <th style={{ padding: 6, width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 6 }}>{it.nombre}</td>
                  <td style={{ padding: 6 }}>
                    <input type="number" value={it.cantidad} step="0.01" min="0"
                      onChange={(e) => updateItem(i, { cantidad: +e.target.value })}
                      style={{ width: "100%", padding: 4, textAlign: "right", border: "1px solid #cbd5e1", borderRadius: 3 }} />
                  </td>
                  <td style={{ padding: 6 }}>
                    <input type="number" value={it.precio} step="0.01" min="0"
                      onChange={(e) => updateItem(i, { precio: +e.target.value })}
                      style={{ width: "100%", padding: 4, textAlign: "right", border: "1px solid #cbd5e1", borderRadius: 3 }} />
                  </td>
                  <td style={{ padding: 6, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(it.cantidad * it.precio)}
                  </td>
                  <td style={{ padding: 6 }}>
                    <button onClick={() => removeItem(i)} style={{ background: "transparent", border: 0, color: "#dc2626", fontSize: 16, cursor: "pointer" }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 14, padding: 10, borderRadius: 6,
          background: excede ? "#fee2e2" : "#dcfce7",
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Valor salida:</strong>
          <strong style={{ fontSize: 18, color: excede ? "#991b1b" : "#065f46" }}>{fmt(valorSalida)}</strong>
        </div>
        {excede && (
          <div style={{ color: "#991b1b", fontSize: 12, marginTop: 4 }}>
            ⚠️ Excede saldo pendiente ({fmt(detalle.saldo_pendiente)})
          </div>
        )}

        <label style={{ fontSize: 12, fontWeight: 700, marginTop: 14, display: "block" }}>Notas (opcional)</label>
        <input value={notas} onChange={(e) => setNotas(e.target.value)}
          placeholder="Ej: entregado a Juan en bodega"
          style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 4, marginTop: 4 }} />

        {err && <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 6, marginTop: 10 }}>{err}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} disabled={busy}
            style={{ flex: 1, background: "#e2e8f0", color: "#0f172a", border: 0,
              padding: 12, borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
          <button onClick={guardar} disabled={busy || items.length === 0 || excede}
            style={{ flex: 2, background: busy || excede ? "#94a3b8" : "#059669",
              color: "white", border: 0, padding: 12, borderRadius: 6, fontSize: 15, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Guardando..." : "✓ Registrar entrega y descontar inventario"}
          </button>
        </div>
      </div>
    </div>
  );
}
