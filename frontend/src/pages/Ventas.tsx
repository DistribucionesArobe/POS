import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type CfdiInfo = {
  cfdi_id: number; uuid: string; serie: string; folio: string;
  cancelado: boolean;
};
type VentaT = {
  id: number; folio: string; tipo: string; estatus: string;
  cliente_id: number; fecha: string; total: number;
  cfdi?: CfdiInfo | null;
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
      alert(`Timbrado OK\nUUID: ${r.data.uuid}\nFolio fiscal: ${r.data.serie}-${r.data.folio}`);
      cargar();
    } catch (err: any) {
      alert("Error al timbrar: " + (err.response?.data?.detail || err.message));
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
    if (!confirm(`Cancelar CFDI ${cancelandoCfdi.uuid} con motivo ${motivoCancel}?\n\nLa cancelacion puede requerir aprobacion del receptor en el portal SAT.`)) return;
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
                        <button className="btn-icon" onClick={() => descargarXml(v.cfdi!.cfdi_id, v.cfdi!.uuid)}>
                          XML
                        </button>
                        <button className="btn-icon" onClick={() => descargarPdfSat(v.cfdi!.cfdi_id, v.cfdi!.uuid)}>
                          PDF SAT
                        </button>
                        <button className="btn-icon" style={{ color: "var(--color-danger)" }}
                          onClick={() => abrirCancelar(v.cfdi!)}>
                          Cancelar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal de cancelacion */}
      {cancelandoCfdi && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100,
        }} onClick={() => setCancelandoCfdi(null)}>
          <div className="card" style={{ maxWidth: 500, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="card-header">Cancelar CFDI</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 16px" }}>
              UUID: <code>{cancelandoCfdi.uuid}</code><br/>
              Folio: {cancelandoCfdi.serie}-{cancelandoCfdi.folio}
            </p>
            <div style={{ marginBottom: 12 }}>
              <label>Motivo SAT</label>
              <select className="input" value={motivoCancel}
                onChange={(e) => setMotivoCancel(e.target.value)}>
                {MOTIVOS_CANCELACION.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}
              </select>
            </div>
            {motivoCancel === "01" && (
              <div style={{ marginBottom: 12 }}>
                <label>UUID que sustituye al cancelado *</label>
                <input className="input" value={uuidSustituto}
                  placeholder="ABC12345-..."
                  onChange={(e) => setUuidSustituto(e.target.value)} />
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
                  Para motivo 01 debes ya haber emitido el CFDI correcto antes; pega su UUID aqui.
                </p>
              </div>
            )}
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16 }}>
              Nota: si el monto es alto o paso mas de 24h, el receptor debe aprobar la cancelacion en su portal SAT.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-danger" disabled={busy === cancelandoCfdi.cfdi_id}
                onClick={confirmarCancelar}>
                {busy === cancelandoCfdi.cfdi_id ? "Cancelando..." : "Confirmar cancelacion"}
              </button>
              <button className="btn-icon" onClick={() => setCancelandoCfdi(null)}>Volver</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
