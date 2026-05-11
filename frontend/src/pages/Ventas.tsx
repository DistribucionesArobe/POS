import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type CfdiInfo = {
  cfdi_id: number; uuid: string; serie: string; folio: string;
  cancelado: boolean;
  correo_enviado_a?: string | null;
  correo_enviado_en?: string | null;
};
type VentaT = {
  id: number; folio: string; tipo: string; estatus: string;
  cliente_id: number; fecha: string; total: number;
  cfdi?: CfdiInfo | null;
  conceptos?: any[];
};

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MOTIVOS_CANCELACION = [
  { v: "01", t: "01 - Comprobante con errores con relacion (requiere UUID sustituto)" },
  { v: "02", t: "02 - Comprobante con errores sin relacion" },
  { v: "03", t: "03 - No se llevo a cabo la operacion" },
  { v: "04", t: "04 - Operacion nominativa relacionada en factura global" },
];

export default function Ventas() {
  const [ventas, setVentas] = useState<VentaT[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [busy, setBusy] = useState<number | null>(null);

  // Modal de cancelacion
  const [cancelandoCfdi, setCancelandoCfdi] = useState<CfdiInfo | null>(null);
  const [motivoCancel, setMotivoCancel] = useState("02");
  const [uuidSustituto, setUuidSustituto] = useState("");

  // Modal de devolucion
  const [devolviendoFactura, setDevolviendoFactura] = useState<VentaT | null>(null);
  const [devConceptos, setDevConceptos] = useState<{ variante_id: number; descripcion: string; max: number; cantidad: number; precio: number }[]>([]);
  const [devMotivo, setDevMotivo] = useState("");
  const [devTimbrar, setDevTimbrar] = useState(false);

  async function cargar() {
    const r = await api.get("/api/ventas", {
      params: { tipo: filtroTipo || undefined, limit: 100 },
    });
    const lista: VentaT[] = r.data;
    await Promise.all(
      lista
        .filter((v) => v.tipo === "FACTURA")
        .map(async (v) => {
          try {
            const cf = await api.get(`/api/cfdi/documento/${v.id}`);
            v.cfdi = cf.data;
          } catch {
            v.cfdi = null;
          }
        })
    );
    setVentas(lista);
  }

  useEffect(() => { cargar(); }, [filtroTipo]);

  async function timbrar(documento_id: number) {
    if (!confirm("Timbrar esta factura ahora? Se emitira un CFDI real.")) return;
    setBusy(documento_id);
    try {
      const r = await api.post(`/api/cfdi/timbrar/${documento_id}`);
      let msg = `Timbrado OK\nUUID: ${r.data.uuid}\nFolio fiscal: ${r.data.serie}-${r.data.folio}`;
      if (r.data.correo_enviado_a) {
        msg += `\n\nXML+PDF enviado a: ${r.data.correo_enviado_a}`;
      }
      alert(msg);
      cargar();
    } catch (err: any) {
      alert("Error al timbrar: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(null);
    }
  }

  async function enviarCorreo(cfdiId: number, sugerido: string | null | undefined) {
    const dest = prompt("Enviar XML+PDF al correo:", sugerido || "");
    if (!dest) return;
    setBusy(cfdiId);
    try {
      await api.post(`/api/cfdi/${cfdiId}/enviar-correo`, null, { params: { email: dest } });
      alert("Enviado a " + dest);
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(null);
    }
  }

  async function descargarBlob(url: string, filename?: string) {
    try {
      const r = await api.get(url, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.target = "_blank";
      if (filename) a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err: any) {
      alert("Error al descargar: " + (err.response?.data?.detail || err.message));
    }
  }

  function descargarPdfInterno(id: number, folio: string) {
    descargarBlob(`/api/ventas/${id}/pdf`, `${folio}.pdf`);
  }
  function descargarXml(cfdi_id: number, uuid: string) {
    descargarBlob(`/api/cfdi/${cfdi_id}/xml`, `${uuid}.xml`);
  }
  function descargarPdfSat(cfdi_id: number, uuid: string) {
    descargarBlob(`/api/cfdi/${cfdi_id}/pdf`, `${uuid}.pdf`);
  }

  function abrirCancelar(cfdi: CfdiInfo) {
    setCancelandoCfdi(cfdi);
    setMotivoCancel("02");
    setUuidSustituto("");
  }

  async function confirmarCancelar() {
    if (!cancelandoCfdi) return;
    if (motivoCancel === "01" && !uuidSustituto) {
      alert("Para motivo 01 debes ingresar el UUID que sustituye al cancelado");
      return;
    }
    if (!confirm(`Cancelar CFDI ${cancelandoCfdi.uuid} con motivo ${motivoCancel}?`)) return;
    setBusy(cancelandoCfdi.cfdi_id);
    try {
      const params: any = { motivo: motivoCancel };
      if (motivoCancel === "01" && uuidSustituto) params.uuid_sustituye = uuidSustituto;
      await api.post(`/api/cfdi/cancelar/${cancelandoCfdi.cfdi_id}`, null, { params });
      alert("Cancelacion solicitada al SAT.");
      setCancelandoCfdi(null);
      cargar();
    } catch (err: any) {
      alert("Error al cancelar: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(null);
    }
  }

  async function abrirDevolver(v: VentaT) {
    // Cargar la factura completa para obtener sus conceptos
    try {
      const r = await api.get("/api/ventas", { params: { limit: 1 } });  // dummy, mejor separar
      const fr = await fetch(`${api.defaults.baseURL}/api/ventas/${v.id}/pdf`, { method: "HEAD" }); // dummy
      // Mejor: traer el documento completo via endpoint dedicado o usar lo que ya hay
      // Por simplicidad: usar /api/ventas con filtro y obtener conceptos del response
      // Como no devuelve conceptos en list, hacemos un get directo
    } catch {}
    // Fallback: pedir cantidad de cada producto
    // Mejor: traer conceptos mediante un endpoint
    // Usaremos /api/ventas con filtro y limit 1 que SI trae conceptos
    const all = await api.get("/api/ventas", { params: { limit: 100 } });
    // Hmm el endpoint /api/ventas no devuelve conceptos. Necesitamos otro.
    // Usemos /api/ventas/{id}/pdf para verificar... no, mejor pedir al backend.
    // Por ahora, leer conceptos del body de la factura via PDF data... no.
    // Solucion temporal: pedir al usuario manual qty
    setDevolviendoFactura(v);
    // Hacer un fetch a un endpoint que tenga conceptos. Por ahora vamos a /api/ventas con filtro especial.
    // Pero el response de GET /api/ventas tiene { id, folio, tipo, estatus, cliente_id, fecha, total } sin conceptos
    // Necesito agregar GET /api/ventas/{id} en el backend, o usar el de PDF y parsear, o usar /api/ventas?id={id}
    // Solucion rapida: query la factura via endpoint que tenga conceptos o crear uno
    // Por ahora uso un workaround: pedir al backend que me de los conceptos de esta factura
    try {
      const conceptosRes = await api.get(`/api/ventas`, { params: { cliente_id: v.cliente_id, limit: 100 } });
      // Esto no funciona porque /api/ventas no devuelve conceptos
      // Usemos el endpoint /api/cfdi/documento/{id} que tampoco los tiene
      // OK, solucion: hacer que el usuario teclee cantidades manualmente
    } catch {}
    setDevConceptos([]);
    setDevMotivo("");
    setDevTimbrar(!!v.cfdi && !v.cfdi.cancelado);
  }

  // Mejor: cuando abrimos devolver, hacemos GET completo con un endpoint nuevo
  async function cargarConceptosFactura(facturaId: number) {
    // El endpoint /api/cxp/compras/{id} tiene conceptos. Para ventas similar.
    // Por ahora, hacemos POST a /api/ventas/devolucion con el formato esperado y validamos en backend.
    // Mejor: agregar GET /api/ventas/{id} en backend (futuro). Por ahora, pedir cantidades al usuario.
  }

  async function confirmarDevolucion() {
    if (!devolviendoFactura) return;
    const conceptosInput = devConceptos.filter((c) => c.cantidad > 0);
    if (conceptosInput.length === 0) {
      alert("Captura al menos un concepto a devolver");
      return;
    }
    try {
      const r = await api.post("/api/ventas/devolucion", {
        factura_id: devolviendoFactura.id,
        conceptos: conceptosInput.map((c) => ({
          variante_id: c.variante_id,
          cantidad: c.cantidad,
        })),
        motivo: devMotivo || null,
        timbrar_cfdi_egreso: devTimbrar,
      });
      let msg = `Nota de credito creada: ${r.data.folio}\nTotal devuelto: ${fmt(r.data.total)}`;
      if (r.data.cfdi) msg += `\n\nCFDI Egreso timbrado:\nUUID: ${r.data.cfdi.uuid}`;
      if (r.data.cfdi_error) msg += `\n\nNo se pudo timbrar CFDI Egreso:\n${r.data.cfdi_error}`;
      alert(msg);
      setDevolviendoFactura(null);
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  return (
    <Layout title="Mis ventas" subtitle={`${ventas.length} documentos`}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <select className="input" style={{ maxWidth: 240 }} value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            <option value="TICKET">Tickets</option>
            <option value="REMISION">Remisiones</option>
            <option value="FACTURA">Facturas</option>
            <option value="NOTA_CREDITO">Notas de credito</option>
          </select>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Folio</th><th>Tipo</th><th>Estatus</th>
              <th>Cliente</th><th>Fecha</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th>CFDI</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => {
              const tipoBadge = {
                TICKET: "badge-info",
                REMISION: "badge-warning",
                FACTURA: "badge-success",
                NOTA_CREDITO: "badge-danger",
              }[v.tipo] || "";
              const isFactura = v.tipo === "FACTURA";
              const timbrada = isFactura && v.cfdi && !v.cfdi.cancelado;
              return (
                <tr key={v.id}>
                  <td><code>{v.folio}</code></td>
                  <td><span className={`badge ${tipoBadge}`}>{v.tipo}</span></td>
                  <td>{v.estatus}</td>
                  <td>#{v.cliente_id}</td>
                  <td>{new Date(v.fecha).toLocaleDateString("es-MX")}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(v.total)}</td>
                  <td>
                    {!isFactura ? <span style={{ color: "var(--color-text-muted)" }}>—</span> :
                      timbrada ? (
                        <span className="badge badge-success" title={v.cfdi!.uuid}>
                          {v.cfdi!.uuid.slice(0, 8)}…
                        </span>
                      ) : v.cfdi?.cancelado ? (
                        <span className="badge badge-danger">cancelado</span>
                      ) : (
                        <span className="badge badge-warning">sin timbrar</span>
                      )
                    }
                  </td>
                  <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <button className="btn-icon" onClick={() => descargarPdfInterno(v.id, v.folio)}>
                      PDF
                    </button>
                    {isFactura && !timbrada && !v.cfdi?.cancelado && (
                      <button className="btn btn-sm" disabled={busy === v.id}
                        onClick={() => timbrar(v.id)}>
                        {busy === v.id ? "..." : "Timbrar"}
                      </button>
                    )}
                    {timbrada && v.cfdi && (
                      <>
                        <button className="btn-icon" onClick={() => descargarXml(v.cfdi!.cfdi_id, v.cfdi!.uuid)}>XML</button>
                        <button className="btn-icon" onClick={() => descargarPdfSat(v.cfdi!.cfdi_id, v.cfdi!.uuid)}>PDF SAT</button>
                        <button className="btn-icon"
                          title={v.cfdi!.correo_enviado_a ? `Ya enviado a ${v.cfdi!.correo_enviado_a}. Click para reenviar.` : "Enviar XML+PDF por correo"}
                          disabled={busy === v.cfdi!.cfdi_id}
                          onClick={() => enviarCorreo(v.cfdi!.cfdi_id, v.cfdi!.correo_enviado_a)}>
                          {v.cfdi!.correo_enviado_a ? "📧✓" : "📧"}
                        </button>
                        <button className="btn-icon" style={{ color: "var(--color-danger)" }}
                          onClick={() => abrirCancelar(v.cfdi!)}>Cancelar</button>
                      </>
                    )}
                    {isFactura && v.estatus !== "CANCELADO" && (
                      <button className="btn-icon" style={{ color: "var(--color-warning)" }}
                        onClick={() => abrirDevolver(v)}>Devolver</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal cancelacion */}
      {cancelandoCfdi && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setCancelandoCfdi(null)}>
          <div className="card" style={{ maxWidth: 500, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="card-header">Cancelar CFDI</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 16px" }}>
              UUID: <code>{cancelandoCfdi.uuid}</code><br/>
              Folio: {cancelandoCfdi.serie}-{cancelandoCfdi.folio}
            </p>
            <div style={{ marginBottom: 12 }}>
              <label>Motivo SAT</label>
              <select className="input" value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)}>
                {MOTIVOS_CANCELACION.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}
              </select>
            </div>
            {motivoCancel === "01" && (
              <div style={{ marginBottom: 12 }}>
                <label>UUID que sustituye *</label>
                <input className="input" value={uuidSustituto} onChange={(e) => setUuidSustituto(e.target.value)} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-danger" disabled={busy === cancelandoCfdi.cfdi_id} onClick={confirmarCancelar}>
                {busy === cancelandoCfdi.cfdi_id ? "Cancelando..." : "Confirmar"}
              </button>
              <button className="btn-icon" onClick={() => setCancelandoCfdi(null)}>Volver</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal devolucion */}
      {devolviendoFactura && (
        <DevolucionModal
          factura={devolviendoFactura}
          onClose={() => setDevolviendoFactura(null)}
          onSuccess={() => { setDevolviendoFactura(null); cargar(); }}
        />
      )}
    </Layout>
  );
}


function DevolucionModal({ factura, onClose, onSuccess }: { factura: VentaT; onClose: () => void; onSuccess: () => void }) {
  const [conceptos, setConceptos] = useState<{ variante_id: number; descripcion: string; max: number; cantidad: number; precio: number }[]>([]);
  const [motivo, setMotivo] = useState("");
  const [timbrar, setTimbrar] = useState(!!factura.cfdi && !factura.cfdi.cancelado);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Endpoint para obtener conceptos de un documento
        const r = await api.get(`/api/ventas/${factura.id}/conceptos`);
        setConceptos(r.data.map((c: any) => ({
          variante_id: c.variante_id,
          descripcion: c.descripcion,
          max: c.cantidad,
          cantidad: 0,
          precio: c.precio_unitario,
        })));
      } catch (err: any) {
        alert("Error cargando conceptos: " + (err.response?.data?.detail || err.message));
        onClose();
      } finally {
        setLoading(false);
      }
    })();
  }, [factura.id]);

  function setCant(idx: number, val: number) {
    const c = [...conceptos];
    c[idx].cantidad = Math.max(0, Math.min(val, c[idx].max));
    setConceptos(c);
  }

  function devolverTodo() {
    setConceptos(conceptos.map((c) => ({ ...c, cantidad: c.max })));
  }

  const subtotal = conceptos.reduce((a, c) => a + c.cantidad * c.precio, 0);
  const iva = subtotal * 0.16;
  const total = subtotal + iva;

  async function confirmar() {
    const items = conceptos.filter((c) => c.cantidad > 0);
    if (items.length === 0) return alert("Captura al menos una cantidad a devolver");
    if (!confirm(`Crear NOTA DE CREDITO por ${"$"+total.toLocaleString("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2})}?\n\n${timbrar ? "Se intentara timbrar CFDI Egreso." : "Solo registro interno (no se timbra)."}`)) return;
    setBusy(true);
    try {
      const r = await api.post("/api/ventas/devolucion", {
        factura_id: factura.id,
        conceptos: items.map((c) => ({ variante_id: c.variante_id, cantidad: c.cantidad })),
        motivo: motivo || null,
        timbrar_cfdi_egreso: timbrar,
      });
      let msg = `Nota de credito creada: ${r.data.folio}\nTotal devuelto: $${r.data.total.toLocaleString("es-MX",{minimumFractionDigits:2})}`;
      if (r.data.cfdi) msg += `\n\nCFDI Egreso timbrado: ${r.data.cfdi.uuid}`;
      if (r.data.cfdi_error) msg += `\n\nNo se pudo timbrar:\n${r.data.cfdi_error}`;
      alert(msg);
      onSuccess();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div className="card" style={{ maxWidth: 700, width: "92%", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="card-header">Devolución de factura {factura.folio}</h3>
        {loading ? <p>Cargando conceptos...</p> : (
          <>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 12px" }}>
              Total original: <strong>${factura.total.toLocaleString("es-MX",{minimumFractionDigits:2})}</strong> · Captura cuántas unidades de cada producto regresa el cliente.
            </p>
            <button className="btn-icon" onClick={devolverTodo} style={{ marginBottom: 12 }}>Devolver todo</button>
            <table>
              <thead>
                <tr><th>Producto</th><th style={{ textAlign: "center" }}>Vendido</th><th>Devolver</th><th style={{ textAlign: "right" }}>Importe</th></tr>
              </thead>
              <tbody>
                {conceptos.map((c, idx) => (
                  <tr key={idx}>
                    <td>{c.descripcion}</td>
                    <td style={{ textAlign: "center" }}>{c.max}</td>
                    <td>
                      <input className="input" type="number" min="0" max={c.max} step="0.01" value={c.cantidad}
                        style={{ width: 100 }}
                        onChange={(e) => setCant(idx, +e.target.value)} />
                    </td>
                    <td style={{ textAlign: "right" }}>{"$"+(c.cantidad * c.precio).toLocaleString("es-MX",{minimumFractionDigits:2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <div style={{ minWidth: 240 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>Subtotal<span>${subtotal.toFixed(2)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>IVA<span>${iva.toFixed(2)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, paddingTop: 8, borderTop: "1px solid var(--color-border)" }}>Total<span>${total.toFixed(2)}</span></div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <label>Motivo de devolución</label>
              <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Producto dañado, error en surtido, cliente cambió de opinión..." />
            </div>
            {factura.cfdi && !factura.cfdi.cancelado && (
              <div style={{ marginTop: 12, padding: 12, background: "var(--color-bg)", borderRadius: 6 }}>
                <label style={{ fontSize: 14 }}>
                  <input type="checkbox" checked={timbrar} onChange={(e) => setTimbrar(e.target.checked)} />
                  &nbsp;Emitir CFDI Egreso (nota de crédito fiscal)
                </label>
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
                  El CFDI Egreso se relaciona automáticamente al UUID original ({factura.cfdi.uuid.slice(0,8)}…) con TipoRelacion 01.
                </p>
              </div>
            )}
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button className="btn" disabled={busy} onClick={confirmar}>
                {busy ? "Procesando..." : "Confirmar devolución"}
              </button>
              <button className="btn-icon" onClick={onClose}>Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
