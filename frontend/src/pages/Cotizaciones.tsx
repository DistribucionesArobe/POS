import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

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

  function mandarWhatsApp(c: Cot) {
    const tel = prompt("Número de WhatsApp del cliente (10 dígitos, sin lada):", c.whatsapp_origen || "");
    if (!tel) return;
    const e164 = tel.replace(/\D/g, "");
    const numero = e164.length === 10 ? "52" + e164 : e164;
    const msg = encodeURIComponent(
      `Hola ${c.cliente_nombre}, te comparto tu cotización ${c.folio}:\n\n` +
      `Total: ${fmt(c.total)}\n` +
      `Vigencia: ${c.vigencia_hasta ? new Date(c.vigencia_hasta).toLocaleDateString("es-MX") : "—"}\n\n` +
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
                  <button className="btn-icon" onClick={() => descargarPdf(c)}>PDF</button>
                  <button className="btn-icon" title="Enviar por WhatsApp"
                    onClick={() => mandarWhatsApp(c)}>📱 WhatsApp</button>
                  {c.estatus === "ENVIADA" && (
                    <>
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
    </Layout>
  );
}


function CotizacionForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [clienteId, setClienteId] = useState<number | null>(null);
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
    setBusy(true);
    try {
      const payload: any = {
        cliente_id: clienteId,
        nombre_libre: nombreLibre || undefined,
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
        <div>
          <label>Cliente ID (opcional, si está registrado)</label>
          <input className="input" type="number" value={clienteId ?? ""}
            onChange={(e) => setClienteId(e.target.value ? +e.target.value : null)} />
        </div>
        <div>
          <label>Nombre libre (si NO está registrado)</label>
          <input className="input" value={nombreLibre} onChange={(e) => setNombreLibre(e.target.value)}
            placeholder="Ej. Sr. Juan Pérez" />
        </div>
        <div>
          <label>WhatsApp (sin lada)</label>
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
