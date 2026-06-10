import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";
import ClientePicker, { ClienteSel } from "../components/ClientePicker";

type Item = {
  variante_id: number; sku: string; nombre: string;
  cantidad: number; precio: number;
};
type Cot = {
  id: number; folio: string; fecha: string;
  vigencia_hasta: string | null;
  cliente_id: number | null; cliente_nombre: string;
  whatsapp_origen: string | null;
  total: number; estatus: string;
  documento_venta_id: number | null;
  n_conceptos: number;
};

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BADGE: Record<string, string> = {
  ENVIADA: "badge-info",
  CONVERTIDA: "badge-success",
  CANCELADA: "badge-danger",
};

export default function Cotizaciones() {
  const [cots, setCots] = useState<Cot[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);

  async function cargar() {
    const r = await api.get("/api/cotizaciones");
    setCots(r.data);
  }
  useEffect(() => { cargar(); }, []);

  async function descargarPdf(c: Cot) {
    const r = await api.get(`/api/cotizaciones/${c.id}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function imprimirBonita(c: Cot) {
    try {
      const r = await api.get(`/api/cotizaciones/${c.id}`);
      const d = r.data;
      const ventana = window.open("", "_blank");
      if (!ventana) return;
      const html = construirHtmlCotizacion({
        emisor: {
          nombre: d.empresa_nombre || "Mi empresa",
          razon_social: d.empresa_razon_social || "",
          rfc: d.empresa_rfc || "",
          regimen: d.empresa_regimen || "",
          cp: d.empresa_cp || "",
        },
        folio: d.folio,
        fechaEmision: d.fecha,
        vigenciaHasta: d.vigencia_hasta,
        cliente: {
          nombre: d.cliente_razon_social || d.cliente_nombre,
          rfc: d.cliente_rfc,
          cp: d.cliente_cp,
          regimen: d.cliente_regimen,
        },
        conceptos: (d.conceptos || []).map((it: any) => ({
          descripcion: it.descripcion || it.nombre || "",
          sku: it.sku || "",
          unidad: it.unidad || "",
          cantidad: it.cantidad,
          precio: it.precio_unitario,
          importe: it.importe,
        })),
        subtotal: d.subtotal,
        iva: d.iva,
        total: d.total,
        notas: d.notas,
      });
      ventana.document.write(html);
      ventana.document.close();
    } catch (err: any) {
      alert("Error al cargar cotización: " + (err.response?.data?.detail || err.message));
    }
  }

  function mandarWhatsApp(c: Cot) {
    const tel = prompt("Número de WhatsApp del cliente (10 dígitos, sin lada):", c.whatsapp_origen || "");
    if (!tel) return;
    const e164 = tel.replace(/\D/g, "");
    const numero = e164.length === 10 ? "52" + e164 : e164;
    // URL publica de la cotizacion (preferimos facturacion.aceromax.mx si esta configurada,
    // si no usamos el dominio actual donde corre el POS).
    const portal = "https://facturacion.aceromax.mx";
    const linkCot = `${portal}/cot/${c.folio}`;
    const msg = encodeURIComponent(
      `Hola ${c.cliente_nombre}, te comparto tu cotización ${c.folio}:\n\n` +
      `Total: ${fmt(c.total)}\n` +
      `Vigencia: ${c.vigencia_hasta ? new Date(c.vigencia_hasta).toLocaleDateString("es-MX") : "—"}\n\n` +
      `Velo aquí (con opción de descargar PDF):\n${linkCot}\n\n` +
      `Cualquier duda, respondemos por aquí.\nAceroMAX`
    );
    window.open(`https://wa.me/${numero}?text=${msg}`, "_blank");
  }

  async function convertir(c: Cot, tipo: "TICKET" | "REMISION" | "FACTURA") {
    if (!confirm(`Convertir cotización ${c.folio} en ${tipo}?`)) return;
    try {
      const r = await api.post(`/api/cotizaciones/${c.id}/convertir`, { tipo });
      alert(`Venta creada: ${r.data.folio} · ${fmt(r.data.total)}`);
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function cancelar(c: Cot) {
    if (!confirm(`Cancelar cotización ${c.folio}?`)) return;
    try {
      await api.delete(`/api/cotizaciones/${c.id}`);
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  return (
    <Layout
      title="Cotizaciones"
      subtitle={`${cots.length} cotizaciones`}
      actions={
        <button className="btn" onClick={() => setMostrarForm(!mostrarForm)}>
          {mostrarForm ? "Cancelar" : "+ Nueva cotización"}
        </button>
      }
    >
      {mostrarForm && (
        <CotizacionForm onClose={() => setMostrarForm(false)} onSaved={() => { setMostrarForm(false); cargar(); }} />
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Folio</th><th>Cliente</th><th>Fecha</th><th>Vigencia</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th>Estatus</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cots.map((c) => (
              <tr key={c.id}>
                <td><code>{c.folio}</code></td>
                <td>{c.cliente_nombre}</td>
                <td>{new Date(c.fecha).toLocaleDateString("es-MX")}</td>
                <td>{c.vigencia_hasta ? new Date(c.vigencia_hasta).toLocaleDateString("es-MX") : "—"}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(c.total)}</td>
                <td><span className={`badge ${BADGE[c.estatus] || ""}`}>{c.estatus}</span></td>
                <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button className="btn-icon" onClick={() => imprimirBonita(c)}
                    title="Imprimir/guardar PDF con formato">🖨 Imprimir</button>
                  <button className="btn-icon" onClick={() => descargarPdf(c)}
                    title="PDF backend (versión vieja)">PDF</button>
                  <button className="btn-icon" title="Enviar por WhatsApp"
                    onClick={() => mandarWhatsApp(c)}>📱 WhatsApp</button>
                  {c.estatus === "ENVIADA" && (
                    <>
                      <button className="btn-icon" onClick={() => setEditando(c.id)}
                        title="Editar conceptos">✎ Editar</button>
                      <button className="btn btn-sm" onClick={() => convertir(c, "TICKET")}>→ Ticket</button>
                      <button className="btn btn-sm" onClick={() => convertir(c, "FACTURA")}>→ Factura</button>
                      <button className="btn-icon" style={{ color: "var(--color-danger)" }}
                        onClick={() => cancelar(c)}>Cancelar</button>
                    </>
                  )}
                  {c.documento_venta_id && (
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)", alignSelf: "center" }}>
                      Venta #{c.documento_venta_id}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {cots.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}>
                Sin cotizaciones todavía.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editando !== null && (
        <EditarCotizacionModal
          cotId={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); cargar(); }}
        />
      )}
    </Layout>
  );
}


function CotizacionForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [cliente, setCliente] = useState<ClienteSel | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [nombreLibre, setNombreLibre] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [vigenciaDias, setVigenciaDias] = useState(15);
  const [notas, setNotas] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  async function buscarProd() {
    if (busqueda.length < 2) return;
    const r = await api.get("/api/productos/buscar-variante", { params: { q: busqueda } });
    setSugerencias(r.data);
  }

  function agregar(s: any) {
    const idx = items.findIndex((i) => i.variante_id === s.id);
    if (idx >= 0) {
      const c = [...items]; c[idx].cantidad += 1; setItems(c);
    } else {
      setItems([...items, { variante_id: s.id, sku: s.sku, nombre: s.nombre, cantidad: 1, precio: s.precio }]);
    }
    setSugerencias([]); setBusqueda("");
  }

  const subtotal = items.reduce((a, i) => a + i.cantidad * i.precio, 0);
  const iva = subtotal * 0.16;
  const total = subtotal + iva;

  async function guardar() {
    if (items.length === 0) return alert("Agrega al menos un producto");
    if (!cliente && !nombreLibre.trim()) {
      return alert("Selecciona un cliente o captura un nombre libre");
    }
    setBusy(true);
    try {
      const payload: any = {
        cliente_id: cliente?.id ?? null,
        nombre_libre: !cliente ? (nombreLibre || undefined) : undefined,
        whatsapp_origen: whatsapp || undefined,
        vigencia_dias: vigenciaDias,
        notas: notas || undefined,
        conceptos: items.map((i) => ({
          variante_id: i.variante_id, cantidad: i.cantidad,
          precio_unitario: i.precio, descripcion: i.nombre,
        })),
      };
      const r = await api.post("/api/cotizaciones", payload);
      alert(`Cotización ${r.data.folio} creada por ${fmt(r.data.total)}`);
      onSaved();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 className="card-header">Nueva cotización</h3>
      <div className="form-grid">
        <div className="form-grid-full">
          <label>Cliente</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={() => setShowPicker(true)}
              style={{ flex: 1, padding: 10, fontSize: 14, textAlign: "left",
                border: "1px solid var(--color-border)", borderRadius: 6, background: "white", cursor: "pointer" }}>
              {cliente ? `${cliente.nombre}${cliente.rfc ? ` · ${cliente.rfc}` : ""}` : "Click para buscar o crear cliente"}
              <span style={{ float: "right", color: "var(--color-text-muted)" }}>{cliente ? "cambiar ✎" : "seleccionar →"}</span>
            </button>
            {cliente && (
              <button type="button" onClick={() => setCliente(null)}
                className="btn-icon" title="Quitar cliente (usar nombre libre)">×</button>
            )}
          </div>
        </div>
        {!cliente && (
          <div className="form-grid-full">
            <label>Nombre libre (si el cliente no está registrado)</label>
            <input className="input" value={nombreLibre} onChange={(e) => setNombreLibre(e.target.value)}
              placeholder="Ej. Sr. Juan Pérez" />
          </div>
        )}
        <div>
          <label>WhatsApp (opcional, para enviar la cotización)</label>
          <input className="input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="8341234567" />
        </div>
        <div>
          <label>Vigencia (días)</label>
          <input className="input" type="number" value={vigenciaDias}
            onChange={(e) => setVigenciaDias(+e.target.value)} />
        </div>
        <div className="form-grid-full">
          <label>Notas (opcional)</label>
          <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>

      {showPicker && (
        <ClientePicker
          onClose={() => setShowPicker(false)}
          onSelect={(c) => {
            setCliente(c);
            if (c.whatsapp && !whatsapp) setWhatsapp(c.whatsapp);
            setShowPicker(false);
          }}
        />
      )}

      <div style={{ marginTop: 16 }}>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <input className="input" placeholder="Buscar producto..." value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscarProd()} />
          <button className="btn-icon" onClick={buscarProd}>Buscar</button>
        </div>
        {sugerencias.length > 0 && (
          <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 8 }}>
            {sugerencias.map((s) => (
              <div key={s.id} onClick={() => agregar(s)}
                style={{ padding: 8, cursor: "pointer", borderBottom: "1px solid var(--color-border)" }}>
                <strong>{s.sku}</strong> · {s.nombre} <span style={{ float: "right" }}>{fmt(s.precio)}</span>
              </div>
            ))}
          </div>
        )}
        {items.length > 0 && (
          <table>
            <thead><tr><th>SKU</th><th>Producto</th><th>Cant.</th><th>Precio</th><th style={{ textAlign: "right" }}>Importe</th><th></th></tr></thead>
            <tbody>
              {items.map((i, idx) => (
                <tr key={idx}>
                  <td><code>{i.sku}</code></td>
                  <td>{i.nombre}</td>
                  <td>
                    <input className="input" type="number" min="0.01" step="0.01" value={i.cantidad}
                      style={{ width: 80 }}
                      onChange={(e) => { const c = [...items]; c[idx].cantidad = +e.target.value; setItems(c); }} />
                  </td>
                  <td>
                    <input className="input" type="number" step="0.01" value={i.precio}
                      style={{ width: 100 }}
                      onChange={(e) => { const c = [...items]; c[idx].precio = +e.target.value; setItems(c); }} />
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(i.cantidad * i.precio)}</td>
                  <td><button className="btn-icon" onClick={() => setItems(items.filter((_, j) => j !== idx))}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {items.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <div style={{ minWidth: 260 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>Subtotal<span>{fmt(subtotal)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>IVA 16%<span>{fmt(iva)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700,
                borderTop: "1px solid var(--color-border)", paddingTop: 6, marginTop: 4 }}>
                <strong>Total</strong><strong>{fmt(total)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn" disabled={busy} onClick={guardar}>{busy ? "Guardando..." : "Guardar cotización"}</button>
        <button className="btn-icon" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}


// ===== Modal de edición de cotización ya guardada =====

type ConceptoEdit = {
  variante_id: number;
  sku: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
};

function EditarCotizacionModal({ cotId, onClose, onSaved }: {
  cotId: number; onClose: () => void; onSaved: () => void;
}) {
  const [items, setItems] = useState<ConceptoEdit[]>([]);
  const [notas, setNotas] = useState<string>("");
  const [folio, setFolio] = useState<string>("");
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/api/cotizaciones/${cotId}`);
        setItems((r.data.conceptos || []).map((c: any) => ({
          variante_id: c.variante_id,
          sku: c.sku || "",
          descripcion: c.descripcion || "",
          unidad: c.unidad || "",
          cantidad: c.cantidad,
          precio_unitario: c.precio_unitario,
        })));
        setNotas(r.data.notas || "");
        setFolio(r.data.folio || "");
      } catch (err: any) {
        alert("Error al cargar: " + (err.response?.data?.detail || err.message));
        onClose();
      } finally {
        setCargando(false);
      }
    })();
  }, [cotId]);

  function cambiarItem(idx: number, patch: Partial<ConceptoEdit>) {
    const copy = [...items];
    copy[idx] = { ...copy[idx], ...patch };
    setItems(copy);
  }

  function eliminarItem(idx: number) {
    if (!confirm("¿Quitar este concepto de la cotización?")) return;
    setItems(items.filter((_, i) => i !== idx));
  }

  const subtotal = items.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0);
  const iva = subtotal * 0.16;
  const total = subtotal + iva;

  async function guardar() {
    if (items.length === 0) return alert("La cotización necesita al menos un concepto");
    setBusy(true);
    try {
      await api.patch(`/api/cotizaciones/${cotId}`, {
        conceptos: items.map((i) => ({
          variante_id: i.variante_id,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          unidad: i.unidad || undefined,
          descripcion: i.descripcion || undefined,
          sku: i.sku || undefined,
        })),
        notas: notas || null,
      });
      onSaved();
    } catch (err: any) {
      alert("Error al guardar: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 10, width: "95%", maxWidth: 1000,
        maxHeight: "95vh", overflow: "auto",
      }}>
        <div style={{
          background: "#0f172a", color: "white", padding: "14px 20px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <strong style={{ fontSize: 16 }}>✎ Editar cotización</strong>
            <div style={{ fontSize: 11, opacity: 0.8 }}>{folio}</div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: 0, color: "white", fontSize: 22, cursor: "pointer",
          }}>×</button>
        </div>

        <div style={{ padding: 20 }}>
          {cargando ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Cargando...</div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, fontWeight: 700, letterSpacing: "0.05em" }}>
                CONCEPTOS ({items.length})
              </div>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f3f4f6" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Descripción</th>
                    <th style={{ padding: "6px 8px", textAlign: "right", width: 70 }}>Cant</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", width: 100 }}>Unidad</th>
                    <th style={{ padding: "6px 8px", textAlign: "right", width: 110 }}>Precio</th>
                    <th style={{ padding: "6px 8px", textAlign: "right", width: 110 }}>Importe</th>
                    <th style={{ width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px 8px" }}>
                        <input type="text" value={it.descripcion}
                          onChange={(e) => cambiarItem(i, { descripcion: e.target.value })}
                          style={{
                            width: "100%", padding: "4px 6px", fontSize: 12,
                            border: "1px solid #cbd5e1", borderRadius: 4,
                          }} />
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>SKU {it.sku}</div>
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>
                        <input type="number" min="0.01" step="0.01" value={it.cantidad}
                          onChange={(e) => cambiarItem(i, { cantidad: +e.target.value })}
                          style={{
                            width: 60, padding: "4px 6px", fontSize: 12, fontWeight: 600,
                            textAlign: "right", border: "1px solid #cbd5e1", borderRadius: 4,
                          }} />
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input type="text" value={it.unidad} list={`unid-edit-${i}`}
                          placeholder="Pieza"
                          onChange={(e) => cambiarItem(i, { unidad: e.target.value })}
                          style={{
                            width: 85, padding: "4px 6px", fontSize: 12,
                            border: "1px solid #cbd5e1", borderRadius: 4,
                          }} />
                        <datalist id={`unid-edit-${i}`}>
                          <option value="Pieza" />
                          <option value="Kg" />
                          <option value="Kit" />
                          <option value="Paquete" />
                          <option value="Caja" />
                          <option value="Litro" />
                          <option value="Metro" />
                          <option value="m2" />
                          <option value="m3" />
                          <option value="Servicio" />
                          <option value="Hora" />
                          <option value="Galón" />
                          <option value="Tonelada" />
                        </datalist>
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>
                        <input type="number" min="0" step="0.01" value={it.precio_unitario}
                          onChange={(e) => cambiarItem(i, { precio_unitario: +e.target.value })}
                          style={{
                            width: 90, padding: "4px 6px", fontSize: 12,
                            textAlign: "right", border: "1px solid #cbd5e1", borderRadius: 4,
                          }} />
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>
                        {fmt(it.cantidad * it.precio_unitario)}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <button className="btn-icon" onClick={() => eliminarItem(i)}
                          title="Quitar este renglón"
                          style={{ color: "var(--color-danger)" }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Notas</label>
                <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)}
                  placeholder="Notas internas de la cotización" />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <div style={{ minWidth: 280, padding: 12, background: "#0f172a", color: "white", borderRadius: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ opacity: 0.8 }}>Subtotal</span><span>{fmt(subtotal)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ opacity: 0.8 }}>IVA 16%</span><span>{fmt(iva)}</span>
                  </div>
                  <div style={{
                    display: "flex", justifyContent: "space-between", fontSize: 22, fontWeight: 800,
                    marginTop: 6, paddingTop: 6, borderTop: "1px dashed rgba(255,255,255,0.3)",
                  }}>
                    <span>TOTAL</span><span>{fmt(total)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{
          padding: "14px 20px", borderTop: "1px solid #e5e7eb",
          display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center",
        }}>
          <button onClick={onClose} disabled={busy}
            style={{
              background: "transparent", border: "1px solid #cbd5e1",
              padding: "10px 18px", borderRadius: 6, fontSize: 14, cursor: "pointer", color: "#475569",
            }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={busy || cargando}
            style={{
              background: busy ? "#94a3b8" : "#10b981", color: "white",
              border: 0, padding: "10px 22px", borderRadius: 6, fontSize: 15, fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
            }}>
            {busy ? "Guardando..." : "✓ Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ===== HTML imprimible de cotización =====

function construirHtmlCotizacion(d: {
  emisor: {
    nombre: string;
    razon_social: string;
    rfc: string;
    regimen: string;
    cp: string;
  };
  folio: string;
  fechaEmision: string;
  vigenciaHasta: string | null;
  cliente: {
    nombre: string;
    rfc: string | null;
    cp: string | null;
    regimen: string | null;
  };
  conceptos: Array<{
    descripcion: string;
    sku: string;
    unidad: string;
    cantidad: number;
    precio: number;
    importe: number;
  }>;
  subtotal: number;
  iva: number;
  total: number;
  notas: string | null;
}): string {
  const fmtN = (n: number) => "$" + (n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const escapar = (s: string) => String(s || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
  const itemsRows = d.conceptos.map((it, i) => `
    <tr>
      <td style="text-align:center;color:#94a3b8">${i + 1}</td>
      <td>${escapar(it.descripcion)}${it.sku ? `<br/><span class="muted">SKU ${escapar(it.sku)}</span>` : ""}</td>
      <td class="r">${it.cantidad}</td>
      <td>${escapar(it.unidad || "—")}</td>
      <td class="r">${fmtN(it.precio)}</td>
      <td class="r b">${fmtN(it.importe)}</td>
    </tr>`).join("");
  const fEmis = new Date(d.fechaEmision);
  const fVig = d.vigenciaHasta ? new Date(d.vigenciaHasta) : null;
  const fmtFecha = (f: Date) => f.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
  // Nombre principal del emisor: razon social si existe, si no nombre comercial
  const emisorTitulo = d.emisor.razon_social || d.emisor.nombre;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Cotización ${escapar(d.folio)} — ${escapar(d.cliente.nombre)}</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; font-size: 12px; padding: 30px; color: #0f172a; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #0f172a; }
  h2 { font-size: 14px; margin: 0; color: #475569; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #94a3b8; font-size: 10px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px;
            padding-bottom: 14px; border-bottom: 2px solid #0f172a; }
  .header .right { text-align: right; }
  .folio { font-size: 20px; font-weight: 800; color: #0ea5e9; letter-spacing: 0.04em; }
  .emisor-datos { font-size: 11px; color: #475569; margin-top: 6px; line-height: 1.5; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .box { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 4px; background: #fafafa; }
  .label { font-size: 9px; color: #64748b; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th { background: #0f172a; padding: 8px 8px; text-align: left; font-size: 10px;
       text-transform: uppercase; color: white; letter-spacing: 0.04em; }
  td { padding: 7px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .r { text-align: right; }
  .b { font-weight: 700; }
  .totales { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .totales table { width: 100%; }
  .totales td { padding: 5px 8px; border: 0; }
  .total-final { background: #0f172a; color: white; padding: 12px 16px; border-radius: 4px;
                 display: flex; justify-content: space-between; font-size: 20px; margin-top: 8px; font-weight: 800; }
  .notas { margin-top: 16px; padding: 10px; background: #f8fafc; border-left: 3px solid #cbd5e1;
           font-size: 11px; color: #475569; }
  .firma { margin-top: 40px; padding-top: 8px; border-top: 1px solid #cbd5e1;
           width: 60%; text-align: center; font-size: 10px; color: #64748b; }
  @media print { body { padding: 14px; } .no-print { display: none; } }
</style></head><body>
<div class="header">
  <div style="flex:1">
    <h1>${escapar(emisorTitulo)}</h1>
    <div class="muted">Emisor de la cotización</div>
    <div class="emisor-datos">
      ${d.emisor.rfc ? `<strong>RFC:</strong> ${escapar(d.emisor.rfc)}` : ""}
      ${d.emisor.regimen ? ` &nbsp;·&nbsp; <strong>Régimen:</strong> ${escapar(d.emisor.regimen)}` : ""}
      ${d.emisor.cp ? ` &nbsp;·&nbsp; <strong>CP:</strong> ${escapar(d.emisor.cp)}` : ""}
    </div>
  </div>
  <div class="right">
    <h2>Cotización</h2>
    <div class="folio">${escapar(d.folio)}</div>
    <div class="muted">Emitida: ${escapar(fmtFecha(fEmis))}</div>
    ${fVig ? `<div class="muted">Válida hasta: ${escapar(fmtFecha(fVig))}</div>` : ""}
  </div>
</div>

<div class="grid2">
  <div class="box">
    <div class="label">EMISOR (DATOS FISCALES)</div>
    <div class="b" style="font-size:13px">${escapar(d.emisor.razon_social || d.emisor.nombre)}</div>
    ${d.emisor.rfc ? `<div class="muted" style="margin-top:4px"><strong>RFC:</strong> ${escapar(d.emisor.rfc)}</div>` : ""}
    ${d.emisor.cp ? `<div class="muted"><strong>CP:</strong> ${escapar(d.emisor.cp)}</div>` : ""}
    ${d.emisor.regimen ? `<div class="muted"><strong>Régimen fiscal:</strong> ${escapar(d.emisor.regimen)}</div>` : ""}
  </div>
  <div class="box">
    <div class="label">CLIENTE (DATOS FISCALES)</div>
    <div class="b" style="font-size:13px">${escapar(d.cliente.nombre)}</div>
    ${d.cliente.rfc ? `<div class="muted" style="margin-top:4px"><strong>RFC:</strong> ${escapar(d.cliente.rfc)}</div>` : ""}
    ${d.cliente.cp ? `<div class="muted"><strong>CP:</strong> ${escapar(d.cliente.cp)}</div>` : ""}
    ${d.cliente.regimen ? `<div class="muted"><strong>Régimen fiscal:</strong> ${escapar(d.cliente.regimen)}</div>` : ""}
  </div>
</div>

<div class="label" style="margin-bottom:4px">CONCEPTOS (${d.conceptos.length})</div>
<table>
  <thead><tr>
    <th style="width:30px;text-align:center">#</th>
    <th>Descripción</th>
    <th class="r" style="width:50px;color:white">Cant</th>
    <th style="width:60px;color:white">Unidad</th>
    <th class="r" style="width:90px;color:white">P. Unit.</th>
    <th class="r" style="width:100px;color:white">Importe</th>
  </tr></thead>
  <tbody>${itemsRows}</tbody>
</table>

<div class="totales">
  <div>
    <div class="notas">
      <strong>NOTAS:</strong><br/>
      ${d.notas ? `${escapar(d.notas)}<br/><br/>` : ""}
      • Esta cotización NO es un comprobante fiscal.<br/>
      • Precios sujetos a cambio sin previo aviso.<br/>
      • Disponibilidad sujeta a existencias al momento de la confirmación.
    </div>
  </div>
  <div>
    <table>
      <tr><td>Subtotal</td><td class="r b">${fmtN(d.subtotal)}</td></tr>
      <tr><td>IVA 16%</td><td class="r">${fmtN(d.iva)}</td></tr>
    </table>
    <div class="total-final">
      <span>TOTAL</span><span>${fmtN(d.total)}</span>
    </div>
  </div>
</div>

<div class="firma">
  Atención y servicio<br/>
  ${escapar(emisorTitulo)}
</div>

<div class="no-print" style="text-align:center; margin-top:20px">
  <button onclick="window.print()" style="padding:10px 20px;font-size:14px;background:#0ea5e9;color:white;border:0;border-radius:4px;cursor:pointer">
    Imprimir / Guardar como PDF
  </button>
  <button onclick="window.close()" style="padding:10px 20px;font-size:14px;background:transparent;border:1px solid #ccc;border-radius:4px;cursor:pointer;margin-left:8px">
    Cerrar
  </button>
</div>
</body></html>`;
}
