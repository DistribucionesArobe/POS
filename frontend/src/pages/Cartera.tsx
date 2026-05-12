import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type CxCRow = {
  cxc_id: number; cliente_id: number; cliente: string;
  whatsapp: string | null; documento_id: number; documento_folio: string;
  tipo: string; metodo_pago_sat: string;
  es_ppd: boolean;
  saldo: number; dias_antiguedad: number;
  fecha_emision: string;
};

export default function Cartera() {
  const [rows, setRows] = useState<CxCRow[]>([]);
  const [abonando, setAbonando] = useState<CxCRow | null>(null);
  const [verAbonos, setVerAbonos] = useState<CxCRow | null>(null);

  function cargar() {
    api.get("/api/cxc/cartera").then((r) => setRows(r.data)).catch(() => {});
  }
  useEffect(() => { cargar(); }, []);

  const total = rows.reduce((a, r) => a + r.saldo, 0);

  async function exportar() {
    const r = await api.get("/api/reportes/cartera-xlsx", { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url; a.download = "cartera.xlsx";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return (
    <Layout title="Cartera por cobrar" subtitle={`${rows.length} documentos pendientes - Total ${fmt(total)}`}
      actions={<button className="btn-icon" onClick={exportar}>Exportar XLSX</button>}>
      <div className="card">
        {rows.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)", textAlign: "center", padding: 24, margin: 0 }}>
            Sin cuentas por cobrar pendientes.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Cliente</th><th>Documento</th>
                <th style={{ textAlign: "right" }}>Saldo</th>
                <th>Antigüedad</th><th>Tipo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cls = r.dias_antiguedad > 90 ? "badge-danger" :
                            r.dias_antiguedad > 60 ? "badge-warning" :
                            r.dias_antiguedad > 30 ? "badge-info" : "badge-success";
                return (
                  <tr key={r.cxc_id}>
                    <td>{r.cliente}</td>
                    <td><code>{r.documento_folio}</code></td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(r.saldo)}</td>
                    <td><span className={`badge ${cls}`}>{r.dias_antiguedad} días</span></td>
                    <td>
                      <span className={`badge ${r.tipo === "FACTURA" ? "badge-success" : "badge-info"}`}>
                        {r.tipo}
                      </span>
                      {r.es_ppd && <span className="badge badge-warning" style={{ marginLeft: 4 }}>PPD</span>}
                    </td>
                    <td style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => setAbonando(r)}>Abonar</button>
                      <button className="btn-icon" onClick={() => setVerAbonos(r)}>Historial</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {abonando && (
        <AbonoModal
          row={abonando}
          onClose={() => setAbonando(null)}
          onSaved={() => { setAbonando(null); cargar(); }}
        />
      )}
      {verAbonos && (
        <HistorialModal row={verAbonos} onClose={() => setVerAbonos(null)} />
      )}
    </Layout>
  );
}


function AbonoModal({ row, onClose, onSaved }: {
  row: CxCRow; onClose: () => void; onSaved: () => void;
}) {
  const [monto, setMonto] = useState(row.saldo);
  const [formaPago, setFormaPago] = useState("EFECTIVO");
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [emitirComplemento, setEmitirComplemento] = useState(row.es_ppd);
  const [busy, setBusy] = useState(false);

  async function guardar() {
    if (monto <= 0) return alert("Monto debe ser mayor a 0");
    if (monto > row.saldo + 0.01) return alert(`Monto excede saldo (${fmt(row.saldo)})`);
    setBusy(true);
    try {
      const r = await api.post("/api/cxc/abono", {
        cxc_id: row.cxc_id, monto, forma_pago: formaPago,
        referencia: referencia || null, notas: notas || null,
        emitir_complemento_pago: emitirComplemento && row.es_ppd,
      });
      let msg = `Abono de ${fmt(monto)} registrado.`;
      if (r.data.complemento) {
        msg += `\n\nComplemento de Pago timbrado:\nUUID: ${r.data.complemento.uuid}\nParcialidad #${r.data.complemento.parcialidad}\nSaldo insoluto: ${fmt(r.data.complemento.saldo_insoluto)}`;
      }
      if (r.data.complemento_error) {
        msg += `\n\n⚠ NO se pudo timbrar complemento:\n${r.data.complemento_error}\n\nEl abono quedó guardado; puedes reintentar el complemento desde Historial.`;
      }
      alert(msg);
      onSaved();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={modalBg} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={modalCard}>
        <h3 style={{ margin: "0 0 4px" }}>Registrar abono</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--color-text-secondary)" }}>
          <strong>{row.cliente}</strong> · {row.documento_folio} · Saldo {fmt(row.saldo)}
        </p>

        <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label>Monto</label>
            <input className="input" type="number" step="0.01" value={monto}
              style={{ fontSize: 18, padding: 10, fontWeight: 600 }}
              onChange={(e) => setMonto(+e.target.value)} />
          </div>
          <div>
            <label>Forma de pago</label>
            <select className="input" value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
              <option value="EFECTIVO">Efectivo (01)</option>
              <option value="TRANSFERENCIA">Transferencia (03)</option>
              <option value="TARJETA_CREDITO">Tarjeta crédito (04)</option>
              <option value="TARJETA_DEBITO">Tarjeta débito (28)</option>
              <option value="CHEQUE">Cheque (02)</option>
            </select>
          </div>
          <div className="form-grid-full">
            <label>Referencia (opcional)</label>
            <input className="input" value={referencia} onChange={(e) => setReferencia(e.target.value)}
              placeholder="Folio de transferencia, últimos 4 de tarjeta, etc." />
          </div>
          <div className="form-grid-full">
            <label>Notas</label>
            <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        {row.es_ppd ? (
          <div style={{ marginTop: 16, padding: 12, background: "#dcfce7", borderRadius: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
              <input type="checkbox" checked={emitirComplemento}
                onChange={(e) => setEmitirComplemento(e.target.checked)} />
              <strong>Emitir CFDI Complemento de Pago (recomendado)</strong>
            </label>
            <p style={{ margin: "4px 0 0 24px", fontSize: 12, color: "var(--color-text-muted)" }}>
              El SAT exige complemento por cada cobro a una factura PPD.
              Se envía automáticamente por correo al cliente.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 16, padding: 12, background: "var(--color-bg)", borderRadius: 6, fontSize: 12, color: "var(--color-text-muted)" }}>
            {row.tipo === "REMISION"
              ? "Este documento es REMISIÓN, no requiere complemento de pago fiscal."
              : "Esta factura no es PPD; no requiere complemento de pago."}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button className="btn" disabled={busy} onClick={guardar} style={{ flex: 1, justifyContent: "center" }}>
            {busy ? "Procesando..." : "Registrar abono"}
          </button>
          <button className="btn-icon" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}


function HistorialModal({ row, onClose }: { row: CxCRow; onClose: () => void }) {
  const [abonos, setAbonos] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  function cargar() {
    api.get(`/api/cxc/abonos/${row.cxc_id}`).then((r) => setAbonos(r.data));
  }
  useEffect(() => { cargar(); }, []);

  async function emitirCompPara(abonoId: number) {
    setBusy(abonoId);
    try {
      const r = await api.post(`/api/cxc/complemento/${abonoId}`);
      alert(`Complemento timbrado:\nUUID: ${r.data.uuid}\nParcialidad #${r.data.parcialidad}\nSaldo insoluto: ${fmt(r.data.saldo_insoluto)}`);
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={modalBg} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalCard, maxWidth: 700 }}>
        <h3 style={{ margin: "0 0 4px" }}>Historial de abonos</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--color-text-secondary)" }}>
          {row.documento_folio} · {row.cliente}
        </p>
        {!abonos ? <p>Cargando...</p> : abonos.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>Sin abonos todavía.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th>Forma</th><th>Referencia</th>
                <th style={{ textAlign: "right" }}>Monto</th>
                <th>Complemento</th>
              </tr>
            </thead>
            <tbody>
              {abonos.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.fecha).toLocaleDateString("es-MX")}</td>
                  <td>{a.forma_pago}</td>
                  <td style={{ fontSize: 12 }}>{a.referencia || "—"}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(a.monto)}</td>
                  <td>
                    {a.complemento_uuid ? (
                      <span className="badge badge-success" title={a.complemento_uuid}>
                        ✓ {a.complemento_uuid.slice(0, 8)}…
                      </span>
                    ) : row.es_ppd ? (
                      <button className="btn-icon" disabled={busy === a.id}
                        onClick={() => emitirCompPara(a.id)} title="Emitir CFDI Complemento de Pago">
                        {busy === a.id ? "..." : "Emitir CFDI"}
                      </button>
                    ) : (
                      <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>n/a</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button className="btn-icon" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

const modalBg: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
};
const modalCard: React.CSSProperties = {
  background: "white", maxWidth: 560, width: "92%",
  padding: 24, borderRadius: 12, maxHeight: "90vh", overflow: "auto",
};
