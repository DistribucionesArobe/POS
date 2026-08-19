import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../api/client";
import ClientePicker from "../components/ClientePicker";

type CfdiInfo = {
  cfdi_id: number; uuid: string; serie: string; folio: string;
  cancelado: boolean;
  correo_enviado_a?: string | null;
  correo_enviado_en?: string | null;
};
type VentaT = {
  id: number; folio: string; tipo: string; estatus: string;
  cliente_id: number; cliente_nombre?: string; cliente_rfc?: string | null;
  fecha: string; total: number; saldo?: number; facturada?: boolean;
  metodo_pago_sat?: string;
  observaciones?: string | null;
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
  const nav = useNavigate();
  const [ventas, setVentas] = useState<VentaT[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [busquedaCliente, setBusquedaCliente] = useState<string>("");
  const [soloPendientes, setSoloPendientes] = useState<boolean>(false);
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);

  // Modal de cancelacion
  const [cancelandoCfdi, setCancelandoCfdi] = useState<CfdiInfo | null>(null);
  const [motivoCancel, setMotivoCancel] = useState("02");
  const [uuidSustituto, setUuidSustituto] = useState("");

  // Modal de cambiar cliente de una venta
  const [cambiandoClienteVenta, setCambiandoClienteVenta] = useState<VentaT | null>(null);

  // Modal de duplicar venta con overrides
  const [duplicandoVenta, setDuplicandoVenta] = useState<VentaT | null>(null);

  // Modal vista previa antes de timbrar
  const [previaTimbre, setPreviaTimbre] = useState<VentaT | null>(null);

  // Modal de devolucion
  const [devolviendoFactura, setDevolviendoFactura] = useState<VentaT | null>(null);
  const [devConceptos, setDevConceptos] = useState<{ variante_id: number; descripcion: string; max: number; cantidad: number; precio: number }[]>([]);
  const [devMotivo, setDevMotivo] = useState("");
  const [devTimbrar, setDevTimbrar] = useState(false);

  async function cargar() {
    const r = await api.get("/api/ventas", {
      params: {
        tipo: filtroTipo || undefined,
        q: busquedaCliente || undefined,
        solo_pendientes: soloPendientes || undefined,
        limit: 200,
      },
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
    setSeleccionadas(new Set());
  }

  useEffect(() => { cargar(); }, [filtroTipo, soloPendientes]);

  // Recargar cuando cambia búsqueda (debounce)
  useEffect(() => {
    const t = setTimeout(() => cargar(), 300);
    return () => clearTimeout(t);
  }, [busquedaCliente]);

  // Agrupado por cliente para el caso de Remisiones
  const ventasPorCliente = useMemo(() => {
    const map: Record<number, { cliente: string; rfc: string | null; total: number; saldo: number; n: number }> = {};
    for (const v of ventas) {
      if (!map[v.cliente_id]) {
        map[v.cliente_id] = {
          cliente: v.cliente_nombre || `#${v.cliente_id}`,
          rfc: v.cliente_rfc ?? null,
          total: 0, saldo: 0, n: 0,
        };
      }
      map[v.cliente_id].total += v.total;
      map[v.cliente_id].saldo += v.saldo || 0;
      map[v.cliente_id].n += 1;
    }
    return map;
  }, [ventas]);

  // Validacion: las seleccionadas deben ser todas del mismo cliente y todas REMISIONES sin facturar
  const seleccionadasArr = ventas.filter((v) => seleccionadas.has(v.id));
  const todasRemision = seleccionadasArr.length > 0 && seleccionadasArr.every((v) => v.tipo === "REMISION" && !v.facturada);
  const mismoCliente = new Set(seleccionadasArr.map((v) => v.cliente_id)).size === 1;
  const puedeConvertir = todasRemision && mismoCliente;

  function toggleSel(id: number) {
    const nuevo = new Set(seleccionadas);
    if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
    setSeleccionadas(nuevo);
  }
  function selAllVisibles() {
    const remisionesVisibles = ventas.filter((v) => v.tipo === "REMISION" && !v.facturada).map((v) => v.id);
    setSeleccionadas(new Set(remisionesVisibles));
  }
  function selNada() { setSeleccionadas(new Set()); }

  function convertirSeleccionadas() {
    if (!puedeConvertir) return;
    const ids = seleccionadasArr.map((v) => v.id).join(",");
    nav(`/convertir-remisiones?ids=${ids}`);
  }
  function convertirUna(v: VentaT) {
    nav(`/convertir-remisiones?ids=${v.id}`);
  }

  async function editarObservaciones(v: VentaT) {
    const nuevo = window.prompt(
      "Observaciones que aparecen en el PDF de la factura\n" +
      "(no afectan el XML fiscal ni el sello SAT)\n\n" +
      "Ejemplo: Contrato DG-ITACE/DA/RM/009/2026",
      v.observaciones || ""
    );
    if (nuevo === null) return;
    try {
      await api.patch(`/api/ventas/${v.id}/observaciones`, {
        observaciones: nuevo,
      });
      alert("Observaciones actualizadas. Vuelve a descargar el PDF para verlas.");
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function duplicarVenta(v: VentaT, overrides?: {
    metodo_pago_sat?: string;
    forma_pago_sat?: string;
    uso_cfdi?: string;
  }) {
    try {
      const r = await api.post(`/api/ventas/${v.id}/duplicar`, overrides || {});
      alert(`Duplicada: ${r.data.folio} (total ${fmt(r.data.total)})\nRefrescando lista...`);
      setDuplicandoVenta(null);
      cargar();
    } catch (err: any) {
      alert("Error al duplicar: " + (err.response?.data?.detail || err.message));
    }
  }

  async function cambiarClienteVenta(documento_id: number, nuevo_cliente_id: number) {
    try {
      const r = await api.patch(`/api/ventas/${documento_id}/cliente`, {
        cliente_id: nuevo_cliente_id,
      });
      alert(`Cliente actualizado a ${r.data.cliente_nombre} (RFC ${r.data.cliente_rfc}).\nAhora puedes timbrar la factura.`);
      setCambiandoClienteVenta(null);
      cargar();
    } catch (err: any) {
      alert("Error al cambiar cliente: " + (err.response?.data?.detail || err.message));
    }
  }

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

  async function exportarVentas() {
    const r = await api.get("/api/reportes/ventas-xlsx", { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url; a.download = "ventas.xlsx";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  const esRemisionFiltro = filtroTipo === "REMISION";

  return (
    <Layout title="Mis ventas" subtitle={`${ventas.length} documentos`}
      actions={<button className="btn-icon" onClick={exportarVentas}>Exportar XLSX</button>}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0, flexWrap: "wrap", gap: 8 }}>
          <select className="input" style={{ maxWidth: 220 }} value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            <option value="TICKET">Tickets</option>
            <option value="REMISION">Remisiones</option>
            <option value="FACTURA">Facturas</option>
            <option value="NOTA_CREDITO">Notas de crédito</option>
          </select>
          <input className="input" placeholder="Buscar por cliente, RFC o folio..."
            value={busquedaCliente} onChange={(e) => setBusquedaCliente(e.target.value)}
            style={{ flex: 1, minWidth: 240 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={soloPendientes}
              onChange={(e) => setSoloPendientes(e.target.checked)} />
            Solo pendientes de facturar
          </label>
        </div>
      </div>

      {/* Banner cuando filtro = REMISION: muestra agrupado por cliente */}
      {esRemisionFiltro && Object.keys(ventasPorCliente).length > 0 && (
        <div className="card" style={{ marginBottom: 16, background: "#fef3c7" }}>
          <h3 className="card-header">Resumen por cliente</h3>
          <table>
            <thead>
              <tr><th>Cliente</th><th>RFC</th><th>Docs</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Saldo</th></tr>
            </thead>
            <tbody>
              {Object.entries(ventasPorCliente).map(([cid, g]) => (
                <tr key={cid}>
                  <td><strong>{g.cliente}</strong></td>
                  <td><code>{g.rfc || "—"}</code></td>
                  <td>{g.n}</td>
                  <td style={{ textAlign: "right" }}>{fmt(g.total)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: g.saldo > 0 ? "var(--color-danger)" : "var(--color-success)" }}>
                    {fmt(g.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Barra de acciones cuando hay seleccionadas */}
      {esRemisionFiltro && seleccionadas.size > 0 && (
        <div style={{ position: "sticky", top: 0, background: "#1e293b", color: "white",
          padding: "10px 16px", borderRadius: 8, marginBottom: 12, zIndex: 10,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <strong>{seleccionadas.size} remisión(es) seleccionada(s)</strong>
          {puedeConvertir ? (
            <button className="btn" onClick={convertirSeleccionadas}>
              → Convertir a Ticket / Factura
            </button>
          ) : (
            <span style={{ fontSize: 12, color: "#fca5a5" }}>
              {!mismoCliente ? "⚠ Selecciona del mismo cliente" : "⚠ Solo remisiones no facturadas"}
            </span>
          )}
          <button onClick={selNada}
            style={{ marginLeft: "auto", background: "transparent", color: "white", border: "1px solid #475569", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
            Limpiar
          </button>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              {esRemisionFiltro && (
                <th style={{ width: 30 }}>
                  <input type="checkbox"
                    checked={seleccionadas.size > 0 && seleccionadas.size === ventas.filter((v) => v.tipo === "REMISION" && !v.facturada).length}
                    onChange={(e) => e.target.checked ? selAllVisibles() : selNada()} />
                </th>
              )}
              <th>Folio</th><th>Tipo</th><th>Estatus</th>
              <th>Cliente</th><th>Fecha</th>
              <th style={{ textAlign: "right" }}>Total</th>
              {esRemisionFiltro && <th style={{ textAlign: "right" }}>Saldo</th>}
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
              const isRemision = v.tipo === "REMISION";
              return (
                <tr key={v.id} style={{ background: v.facturada ? "#f3f4f6" : undefined }}>
                  {esRemisionFiltro && (
                    <td>
                      {isRemision && !v.facturada && (
                        <input type="checkbox" checked={seleccionadas.has(v.id)}
                          onChange={() => toggleSel(v.id)} />
                      )}
                    </td>
                  )}
                  <td><code>{v.folio}</code></td>
                  <td>
                    <span className={`badge ${tipoBadge}`}>{v.tipo}</span>
                    {isFactura && v.metodo_pago_sat === "PPD" && (
                      <span className="badge badge-warning" style={{ marginLeft: 4 }}>PPD</span>
                    )}
                    {v.facturada && <span className="badge" style={{ marginLeft: 4, fontSize: 10 }}>FACTURADA</span>}
                  </td>
                  <td>{v.estatus}</td>
                  <td>
                    <strong>{v.cliente_nombre || `#${v.cliente_id}`}</strong>
                    {v.cliente_rfc && <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{v.cliente_rfc}</div>}
                  </td>
                  <td>{new Date(v.fecha).toLocaleDateString("es-MX")}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(v.total)}</td>
                  {esRemisionFiltro && (
                    <td style={{ textAlign: "right", fontWeight: 600,
                      color: (v.saldo || 0) > 0 ? "var(--color-danger)" : "var(--color-text-muted)" }}>
                      {fmt(v.saldo || 0)}
                    </td>
                  )}
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
                    {isFactura && (
                      <button className="btn-icon"
                        title="Crear nueva factura con los mismos productos (puedes cambiar metodo de pago)"
                        onClick={() => setDuplicandoVenta(v)}>
                        🔄 Duplicar
                      </button>
                    )}
                    {isFactura && (
                      <button className="btn-icon"
                        title="Editar observaciones del PDF (funciona incluso timbrada; no cambia el XML/UUID)"
                        onClick={() => editarObservaciones(v)}
                        style={v.observaciones ? { background: "#fef3c7", color: "#92400e" } : undefined}>
                        📝 Obs
                      </button>
                    )}
                    {isRemision && !v.facturada && (
                      <button className="btn btn-sm" onClick={() => convertirUna(v)}
                        style={{ background: "var(--color-success)" }}>
                        → Facturar / Ticket
                      </button>
                    )}
                    {isFactura && !timbrada && !v.cfdi?.cancelado && (
                      <>
                        <button className="btn btn-sm" disabled={busy === v.id}
                          onClick={() => setPreviaTimbre(v)}
                          title="Ver vista previa editable antes de timbrar">
                          {busy === v.id ? "..." : "👁 Previa y timbrar"}
                        </button>
                        <button className="btn-icon"
                          title="Cambiar cliente receptor antes de timbrar"
                          onClick={() => setCambiandoClienteVenta(v)}>
                          ✎ Cliente
                        </button>
                      </>
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

      {cambiandoClienteVenta && (
        <ClientePicker
          requiereRfc={true}
          onClose={() => setCambiandoClienteVenta(null)}
          onSelect={(c) => cambiarClienteVenta(cambiandoClienteVenta.id, c.id)}
        />
      )}

      {duplicandoVenta && (
        <DuplicarVentaModal
          venta={duplicandoVenta}
          onClose={() => setDuplicandoVenta(null)}
          onDuplicar={(overrides) => duplicarVenta(duplicandoVenta, overrides)}
        />
      )}
      {previaTimbre && (
        <PreviaTimbreModal
          venta={previaTimbre}
          onClose={() => setPreviaTimbre(null)}
          onTimbrado={() => {
            setPreviaTimbre(null);
            cargar();
          }}
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


// ===== Modal para duplicar venta con overrides (metodo/forma pago, etc.) =====

function DuplicarVentaModal({ venta, onClose, onDuplicar }: {
  venta: VentaT;
  onClose: () => void;
  onDuplicar: (overrides: {
    metodo_pago_sat?: string;
    forma_pago_sat?: string;
    uso_cfdi?: string;
  }) => void;
}) {
  // Prellenamos con los valores originales
  const [metodo, setMetodo] = useState<string>(venta.metodo_pago_sat || "PUE");
  const [formaPago, setFormaPago] = useState<string>("01");
  const [usoCfdi, setUsoCfdi] = useState<string>("G03");
  const [busy, setBusy] = useState(false);

  // Al cambiar a PPD, la forma se fuerza a 99 (Por definir) segun SAT
  const formaEfectiva = metodo === "PPD" ? "99" : formaPago;

  async function ejecutar() {
    setBusy(true);
    await onDuplicar({
      metodo_pago_sat: metodo,
      forma_pago_sat: formaEfectiva,
      uso_cfdi: usoCfdi,
    });
    setBusy(false);
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 10, padding: 24,
        width: "94%", maxWidth: 480, color: "#0f172a",
      }}>
        <h3 style={{ margin: "0 0 4px" }}>🔄 Duplicar factura {venta.folio}</h3>
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 0 }}>
          Se crea una nueva factura con los mismos productos y cliente.
          Puedes cambiar el metodo de pago aqui.
        </p>

        <div style={{ marginBottom: 12, marginTop: 16 }}>
          <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Metodo de pago SAT</label>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <label style={{
              flex: 1, padding: "12px", border: "1px solid #cbd5e1", borderRadius: 6,
              textAlign: "center", cursor: "pointer", fontWeight: 600,
              background: metodo === "PUE" ? "#dcfce7" : "white",
              borderColor: metodo === "PUE" ? "#10b981" : "#cbd5e1",
            }}>
              <input type="radio" checked={metodo === "PUE"} onChange={() => setMetodo("PUE")}
                style={{ marginRight: 6 }} />
              PUE
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 400 }}>
                Pago en una sola exhibicion
              </div>
            </label>
            <label style={{
              flex: 1, padding: "12px", border: "1px solid #cbd5e1", borderRadius: 6,
              textAlign: "center", cursor: "pointer", fontWeight: 600,
              background: metodo === "PPD" ? "#dbeafe" : "white",
              borderColor: metodo === "PPD" ? "#1e40af" : "#cbd5e1",
            }}>
              <input type="radio" checked={metodo === "PPD"} onChange={() => setMetodo("PPD")}
                style={{ marginRight: 6 }} />
              PPD
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 400 }}>
                Pago en parcialidades / credito
              </div>
            </label>
          </div>
        </div>

        {metodo === "PUE" && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Forma de pago SAT</label>
            <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)}
              style={{
                width: "100%", padding: "8px 10px", fontSize: 14,
                border: "1px solid #cbd5e1", borderRadius: 4, marginTop: 4,
              }}>
              <option value="01">01 - Efectivo</option>
              <option value="03">03 - Transferencia electronica</option>
              <option value="04">04 - Tarjeta de credito</option>
              <option value="28">28 - Tarjeta de debito</option>
              <option value="02">02 - Cheque nominativo</option>
            </select>
          </div>
        )}

        {metodo === "PPD" && (
          <div style={{
            marginBottom: 12, padding: 10, background: "#dbeafe",
            border: "1px solid #93c5fd", borderRadius: 6, fontSize: 12, color: "#1e40af",
          }}>
            <strong>ℹ Modo credito (PPD):</strong> Forma de pago sera "99 - Por definir"
            (regla SAT). Cuando cobres, se emite Complemento de Pago (CFDI tipo P).
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Uso CFDI</label>
          <select value={usoCfdi} onChange={(e) => setUsoCfdi(e.target.value)}
            style={{
              width: "100%", padding: "8px 10px", fontSize: 14,
              border: "1px solid #cbd5e1", borderRadius: 4, marginTop: 4,
            }}>
            <optgroup label="Gastos">
              <option value="G01">G01 - Adquisicion de mercancias</option>
              <option value="G02">G02 - Devoluciones, descuentos o bonificaciones</option>
              <option value="G03">G03 - Gastos en general</option>
            </optgroup>
            <optgroup label="Inversiones / Activo fijo">
              <option value="I01">I01 - Construcciones</option>
              <option value="I02">I02 - Mobiliario y equipo de oficina</option>
              <option value="I03">I03 - Equipo de transporte</option>
              <option value="I04">I04 - Equipo de computo y accesorios</option>
              <option value="I05">I05 - Dados, troqueles, moldes, matrices y herramental</option>
              <option value="I06">I06 - Comunicaciones telefonicas</option>
              <option value="I07">I07 - Comunicaciones satelitales</option>
              <option value="I08">I08 - Otra maquinaria y equipo</option>
            </optgroup>
            <optgroup label="Deducciones personales">
              <option value="D01">D01 - Honorarios medicos, dentales, hospitalarios</option>
              <option value="D02">D02 - Gastos medicos por incapacidad</option>
              <option value="D03">D03 - Gastos funerales</option>
              <option value="D04">D04 - Donativos</option>
              <option value="D05">D05 - Intereses reales por creditos hipotecarios</option>
              <option value="D06">D06 - Aportaciones voluntarias al SAR</option>
              <option value="D07">D07 - Primas por seguros de gastos medicos</option>
              <option value="D08">D08 - Gastos de transportacion escolar obligatoria</option>
              <option value="D09">D09 - Depositos en cuentas para el ahorro</option>
              <option value="D10">D10 - Pagos por servicios educativos</option>
            </optgroup>
            <optgroup label="Otros">
              <option value="S01">S01 - Sin efectos fiscales</option>
              <option value="CP01">CP01 - Pagos</option>
              <option value="CN01">CN01 - Nomina</option>
            </optgroup>
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={ejecutar} disabled={busy}
            style={{
              flex: 1, padding: "12px 16px",
              background: busy ? "#94a3b8" : "#10b981",
              color: "white", border: 0, borderRadius: 6, fontSize: 14, fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
            }}>
            {busy ? "Duplicando..." : "🔄 Duplicar"}
          </button>
          <button onClick={onClose} disabled={busy}
            style={{
              padding: "12px 16px", background: "transparent",
              color: "#475569", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, cursor: "pointer",
            }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}


// ===== Modal Vista Previa antes de timbrar (edicion + timbre en un solo flujo) =====

type ConceptoPrevia = {
  id: number;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  clave_prod_serv_sat: string | null;
  clave_unidad_sat: string | null;
  tasa_iva: number;
};

type DetalleVenta = {
  id: number; folio: string; tipo: string; fecha: string;
  subtotal: number; iva: number; total: number;
  metodo_pago_sat: string | null;
  forma_pago_sat: string | null;
  uso_cfdi: string | null;
  observaciones: string | null;
  cliente: {
    id: number; nombre: string; razon_social: string | null;
    rfc: string | null; codigo_postal: string | null;
    regimen_fiscal: string | null; correo: string | null;
  } | null;
  empresa: { id: number; nombre: string } | null;
  conceptos: ConceptoPrevia[];
};

const USOS_CFDI_LIST: [string, string][] = [
  ["G01", "Adquisicion de mercancias"],
  ["G02", "Devoluciones, descuentos o bonificaciones"],
  ["G03", "Gastos en general"],
  ["I01", "Construcciones"],
  ["I02", "Mobiliario y equipo de oficina"],
  ["I03", "Equipo de transporte"],
  ["I04", "Equipo de computo"],
  ["I08", "Otra maquinaria"],
  ["S01", "Sin efectos fiscales"],
  ["CP01", "Pagos"],
];

function PreviaTimbreModal({ venta, onClose, onTimbrado }: {
  venta: VentaT;
  onClose: () => void;
  onTimbrado: () => void;
}) {
  const [detalle, setDetalle] = useState<DetalleVenta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [conceptos, setConceptos] = useState<ConceptoPrevia[]>([]);
  const [observaciones, setObservaciones] = useState<string>("");
  const [usoCfdi, setUsoCfdi] = useState<string>("G03");
  const [metodo, setMetodo] = useState<string>("PUE");
  const [formaPago, setFormaPago] = useState<string>("01");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setCargando(true);
      try {
        const r = await api.get(`/api/ventas/${venta.id}/detalle-completo`);
        setDetalle(r.data);
        setConceptos(r.data.conceptos || []);
        setObservaciones(r.data.observaciones || "");
        setUsoCfdi(r.data.uso_cfdi || "G03");
        setMetodo(r.data.metodo_pago_sat || "PUE");
        setFormaPago(r.data.forma_pago_sat || "01");
      } catch (err: any) {
        alert("Error cargando detalle: " + (err.response?.data?.detail || err.message));
        onClose();
      } finally {
        setCargando(false);
      }
    })();
  }, [venta.id]);

  function cambiarConcepto(idx: number, patch: Partial<ConceptoPrevia>) {
    setConceptos(prev => {
      const c = [...prev];
      c[idx] = { ...c[idx], ...patch };
      if (patch.cantidad !== undefined || patch.precio_unitario !== undefined) {
        c[idx].importe = +(c[idx].cantidad * c[idx].precio_unitario).toFixed(2);
      }
      return c;
    });
  }

  const subtotal = conceptos.reduce((a, c) => a + c.importe, 0);
  const iva = conceptos.reduce((a, c) => a + c.importe * (c.tasa_iva || 0), 0);
  const total = subtotal + iva;

  async function guardarYTimbrar() {
    if (!detalle) return;
    setBusy(true);
    try {
      // 1. Guardar cambios (preparar-timbre)
      await api.patch(`/api/ventas/${venta.id}/preparar-timbre`, {
        observaciones: observaciones,
        uso_cfdi: usoCfdi,
        metodo_pago_sat: metodo,
        forma_pago_sat: metodo === "PPD" ? "99" : formaPago,
        conceptos: conceptos.map(c => ({
          id: c.id,
          descripcion: c.descripcion,
          cantidad: c.cantidad,
          precio_unitario: c.precio_unitario,
          clave_prod_serv_sat: c.clave_prod_serv_sat || undefined,
          clave_unidad_sat: c.clave_unidad_sat || undefined,
          tasa_iva: c.tasa_iva,
        })),
      });
      // 2. Timbrar
      const r = await api.post(`/api/cfdi/timbrar/${venta.id}`);
      let msg = `Timbrado OK\nUUID: ${r.data.uuid}\nFolio: ${r.data.serie}-${r.data.folio}`;
      if (r.data.correo_enviado_a) msg += `\nEnviado a: ${r.data.correo_enviado_a}`;
      alert(msg);
      onTimbrado();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(false);
    }
  }

  const usoLabel = USOS_CFDI_LIST.find(([c]) => c === usoCfdi)?.[1] || "";

  function imprimirPrevia() {
    if (!detalle) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    const html = construirHtmlPrevia({
      folio: detalle.folio,
      empresa: detalle.empresa?.nombre || "-",
      cliente: detalle.cliente,
      conceptos, subtotal, iva, total,
      usoCfdi, usoLabel, metodo, formaPago,
      observaciones,
    });
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch {} }, 300);
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 10,
        width: "97%", maxWidth: 1100, maxHeight: "95vh", overflow: "auto",
      }}>
        <div style={{
          background: "#0f172a", color: "white", padding: "14px 20px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          borderRadius: "10px 10px 0 0",
        }}>
          <div>
            <strong style={{ fontSize: 16 }}>👁 Vista previa · Factura {venta.folio}</strong>
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              Edita lo que necesites y confirma para timbrar
            </div>
          </div>
          <button onClick={onClose} disabled={busy} style={{
            background: "transparent", border: 0, color: "white", fontSize: 22, cursor: "pointer",
          }}>×</button>
        </div>

        {cargando ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Cargando...</div>
        ) : !detalle ? (
          <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>Sin datos</div>
        ) : (
          <div style={{ padding: 16 }}>
            {/* Emisor + Receptor */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ padding: 10, background: "#f1f5f9", borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>EMISOR</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{detalle.empresa?.nombre || "-"}</div>
              </div>
              <div style={{ padding: 10, background: "#dbeafe", borderRadius: 6, border: "1px solid #93c5fd" }}>
                <div style={{ fontSize: 10, color: "#1e40af", fontWeight: 700 }}>RECEPTOR</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {detalle.cliente?.razon_social || detalle.cliente?.nombre}
                </div>
                <div style={{ fontSize: 11, color: "#475569" }}>
                  RFC: <b>{detalle.cliente?.rfc || "-"}</b> · CP: <b>{detalle.cliente?.codigo_postal || "-"}</b>
                </div>
                <div style={{ fontSize: 11, color: "#475569" }}>
                  Regimen: <b>{detalle.cliente?.regimen_fiscal || "-"}</b>
                </div>
              </div>
            </div>

            {/* Datos CFDI editables */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>Metodo de pago</label>
                <select value={metodo} onChange={(e) => setMetodo(e.target.value)}
                  style={{ width: "100%", padding: 6, marginTop: 3, border: "1px solid #cbd5e1", borderRadius: 4 }}>
                  <option value="PUE">PUE - Una sola exhibicion</option>
                  <option value="PPD">PPD - Parcialidades / credito</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>Forma de pago</label>
                {metodo === "PPD" ? (
                  <input value="99 - Por definir" disabled
                    style={{ width: "100%", padding: 6, marginTop: 3, background: "#f1f5f9",
                      border: "1px solid #cbd5e1", borderRadius: 4 }} />
                ) : (
                  <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)}
                    style={{ width: "100%", padding: 6, marginTop: 3, border: "1px solid #cbd5e1", borderRadius: 4 }}>
                    <option value="01">01 - Efectivo</option>
                    <option value="03">03 - Transferencia</option>
                    <option value="04">04 - Tarjeta credito</option>
                    <option value="28">28 - Tarjeta debito</option>
                  </select>
                )}
              </div>
              <div>
                <label style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>Uso CFDI</label>
                <select value={usoCfdi} onChange={(e) => setUsoCfdi(e.target.value)}
                  style={{ width: "100%", padding: 6, marginTop: 3, border: "1px solid #cbd5e1", borderRadius: 4 }}>
                  {USOS_CFDI_LIST.map(([c, l]) => (
                    <option key={c} value={c}>{c} - {l}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Conceptos editables */}
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>
              CONCEPTOS ({conceptos.length})
            </div>
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", marginBottom: 12 }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={{ padding: 4, textAlign: "left" }}>Descripcion</th>
                  <th style={{ padding: 4, textAlign: "left", width: 80 }}>Clave SAT</th>
                  <th style={{ padding: 4, textAlign: "right", width: 55 }}>Cant</th>
                  <th style={{ padding: 4, textAlign: "left", width: 55 }}>UnidSAT</th>
                  <th style={{ padding: 4, textAlign: "right", width: 90 }}>Precio</th>
                  <th style={{ padding: 4, textAlign: "right", width: 90 }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {conceptos.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 3 }}>
                      <input type="text" value={c.descripcion}
                        onChange={(e) => cambiarConcepto(i, { descripcion: e.target.value })}
                        style={{ width: "100%", padding: "3px 5px", fontSize: 11, border: "1px solid #cbd5e1", borderRadius: 3 }} />
                    </td>
                    <td style={{ padding: 3 }}>
                      <input type="text" value={c.clave_prod_serv_sat || ""} maxLength={8}
                        onChange={(e) => cambiarConcepto(i, { clave_prod_serv_sat: e.target.value })}
                        style={{ width: 75, padding: "3px 5px", fontSize: 11, fontFamily: "monospace",
                          border: "1px solid #cbd5e1", borderRadius: 3 }} />
                    </td>
                    <td style={{ padding: 3 }}>
                      <input type="number" min="0.01" step="0.01" value={c.cantidad}
                        onChange={(e) => cambiarConcepto(i, { cantidad: +e.target.value })}
                        style={{ width: 55, padding: "3px 5px", fontSize: 11, textAlign: "right",
                          border: "1px solid #cbd5e1", borderRadius: 3 }} />
                    </td>
                    <td style={{ padding: 3 }}>
                      <input type="text" value={c.clave_unidad_sat || ""} maxLength={3}
                        onChange={(e) => cambiarConcepto(i, { clave_unidad_sat: e.target.value })}
                        style={{ width: 50, padding: "3px 5px", fontSize: 11, fontFamily: "monospace",
                          border: "1px solid #cbd5e1", borderRadius: 3 }} />
                    </td>
                    <td style={{ padding: 3 }}>
                      <input type="number" min="0" step="0.01" value={c.precio_unitario}
                        onChange={(e) => cambiarConcepto(i, { precio_unitario: +e.target.value })}
                        style={{ width: 85, padding: "3px 5px", fontSize: 11, textAlign: "right",
                          border: "1px solid #cbd5e1", borderRadius: 3 }} />
                    </td>
                    <td style={{ padding: 3, textAlign: "right", fontWeight: 700 }}>
                      {fmt(c.importe)}
                      {c.tasa_iva === 0 && (
                        <div style={{ fontSize: 9, color: "#1e40af", fontWeight: 700 }}>0% IVA</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Observaciones */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
                OBSERVACIONES (aparece en PDF, no en XML fiscal)
              </label>
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                placeholder='Ej. Contrato DG-ITACE/DA/RM/009/2026'
                style={{ width: "100%", padding: 6, fontSize: 12, marginTop: 3, minHeight: 45,
                  border: "1px solid #cbd5e1", borderRadius: 4 }} />
            </div>

            {/* Totales */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <div style={{ minWidth: 260, padding: 12, background: "#0f172a", color: "white", borderRadius: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>Subtotal</span><span>{fmt(subtotal)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>IVA</span><span>{fmt(iva)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 800,
                  marginTop: 6, paddingTop: 6, borderTop: "1px dashed rgba(255,255,255,0.3)" }}>
                  <span>TOTAL</span><span>{fmt(total)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e7eb",
          display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <button onClick={onClose} disabled={busy}
            style={{ padding: "10px 18px", background: "transparent",
              border: "1px solid #cbd5e1", borderRadius: 6, cursor: "pointer" }}>
            ← Cancelar
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={imprimirPrevia} disabled={busy || cargando}
              style={{ padding: "10px 16px", background: "white",
                color: "#0ea5e9", border: "1px solid #0ea5e9",
                borderRadius: 6, fontWeight: 600, fontSize: 13,
                cursor: busy ? "wait" : "pointer" }}
              title="Abre ventana nueva con la previa: puedes imprimir o guardar como PDF sin timbrar">
              🖨 Imprimir/Guardar PDF
            </button>
            <button onClick={guardarYTimbrar} disabled={busy || cargando}
              style={{ padding: "10px 22px", background: busy ? "#94a3b8" : "#10b981",
                color: "white", border: 0, borderRadius: 6, fontWeight: 700, fontSize: 14,
                cursor: busy ? "wait" : "pointer" }}>
              {busy ? "Timbrando..." : "✓ Guardar y timbrar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ===== HTML imprimible de vista previa =====

function construirHtmlPrevia(d: {
  folio: string;
  empresa: string;
  cliente: DetalleVenta["cliente"];
  conceptos: ConceptoPrevia[];
  subtotal: number;
  iva: number;
  total: number;
  usoCfdi: string;
  usoLabel: string;
  metodo: string;
  formaPago: string;
  observaciones: string;
}): string {
  const fmtN = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s: any) => String(s || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
  const rows = d.conceptos.map((c, i) => `
    <tr>
      <td style="text-align:center;color:#94a3b8">${i + 1}</td>
      <td>${esc(c.descripcion)}<br/><span class="muted">Clave SAT ${esc(c.clave_prod_serv_sat || "-")} · Unidad ${esc(c.clave_unidad_sat || "-")}</span></td>
      <td class="r">${c.cantidad}</td>
      <td class="r">${fmtN(c.precio_unitario)}</td>
      <td class="r b">${fmtN(c.importe)}${c.tasa_iva === 0 ? '<br/><small style="color:#1e40af">IVA 0%</small>' : ""}</td>
    </tr>`).join("");
  const fecha = new Date();
  const fFecha = fecha.toLocaleString("es-MX", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const metodoTxt = d.metodo === "PPD"
    ? "PPD — Pago en parcialidades"
    : "PUE — Una sola exhibicion";
  const formaTxt = d.metodo === "PPD" ? "99 — Por definir" : d.formaPago;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Previa factura ${esc(d.folio)}</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; font-size: 12px; padding: 24px; color: #0f172a; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #0f172a; }
  h2 { font-size: 13px; margin: 0; color: #475569; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #94a3b8; font-size: 10px; }
  .aviso { background: #fef3c7; border: 1px solid #f59e0b; padding: 10px;
           border-radius: 4px; margin-bottom: 14px; font-size: 11px; color: #92400e; }
  .header { display: flex; justify-content: space-between; align-items: flex-start;
            margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #0f172a; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .box { padding: 10px; border: 1px solid #e5e7eb; border-radius: 4px; background: #fafafa; }
  .label { font-size: 9px; color: #64748b; letter-spacing: 0.04em; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #0f172a; color: white; padding: 6px 8px; text-align: left; font-size: 10px;
       text-transform: uppercase; }
  td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .r { text-align: right; }
  .b { font-weight: 700; }
  .total-final { background: #0f172a; color: white; padding: 10px 14px; border-radius: 4px;
                 display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; }
  .obs { background: #fef3c7; border: 1px solid #f59e0b; padding: 8px 12px;
         border-radius: 4px; margin-top: 8px; font-size: 12px; color: #92400e; }
  @media print { body { padding: 12px; } .no-print { display: none; } }
</style></head><body>
<div class="aviso">
  <strong>📄 VISTA PREVIA — NO ES UNA FACTURA TIMBRADA.</strong>
  Generado ${esc(fFecha)}. Al timbrar se emite el CFDI real con UUID del SAT.
</div>
<div class="header">
  <div>
    <h1>${esc(d.empresa)}</h1>
    <div class="muted">Emisor</div>
  </div>
  <div style="text-align:right">
    <h2>Factura preliminar</h2>
    <div style="font-size:18px;font-weight:800;color:#0ea5e9">${esc(d.folio)}</div>
  </div>
</div>

<div class="grid2">
  <div class="box">
    <div class="label">RECEPTOR</div>
    <div class="b" style="font-size:13px">${esc(d.cliente?.razon_social || d.cliente?.nombre || "-")}</div>
    <div class="muted"><b>RFC:</b> ${esc(d.cliente?.rfc || "-")} · <b>CP:</b> ${esc(d.cliente?.codigo_postal || "-")}</div>
    <div class="muted"><b>Regimen:</b> ${esc(d.cliente?.regimen_fiscal || "-")}</div>
  </div>
  <div class="box">
    <div class="label">DATOS CFDI</div>
    <div><b>Uso CFDI:</b> ${esc(d.usoCfdi)} — ${esc(d.usoLabel)}</div>
    <div><b>Metodo pago:</b> ${esc(metodoTxt)}</div>
    <div><b>Forma pago:</b> ${esc(formaTxt)}</div>
  </div>
</div>

<div class="label" style="margin-bottom:4px">CONCEPTOS (${d.conceptos.length})</div>
<table>
  <thead><tr>
    <th style="width:30px;text-align:center">#</th>
    <th>Descripcion</th>
    <th class="r" style="width:60px;color:white">Cant</th>
    <th class="r" style="width:90px;color:white">P. Unit.</th>
    <th class="r" style="width:100px;color:white">Importe</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>

<div style="display:flex;justify-content:flex-end">
  <div style="min-width:280px">
    <table style="width:100%">
      <tr><td>Subtotal</td><td class="r b">${fmtN(d.subtotal)}</td></tr>
      <tr><td>IVA trasladado</td><td class="r">${fmtN(d.iva)}</td></tr>
    </table>
    <div class="total-final"><span>TOTAL</span><span>${fmtN(d.total)}</span></div>
  </div>
</div>

${d.observaciones ? `<div class="obs"><b>OBSERVACIONES:</b> ${esc(d.observaciones)}</div>` : ""}

<div class="no-print" style="text-align:center;margin-top:20px">
  <button onclick="window.print()" style="padding:10px 20px;font-size:14px;background:#0ea5e9;color:white;border:0;border-radius:4px;cursor:pointer">
    🖨 Imprimir / Guardar como PDF
  </button>
  <button onclick="window.close()" style="padding:10px 20px;font-size:14px;background:transparent;border:1px solid #ccc;border-radius:4px;cursor:pointer;margin-left:8px">
    Cerrar
  </button>
</div>
</body></html>`;
}
