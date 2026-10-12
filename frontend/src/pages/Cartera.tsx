import { useEffect, useMemo, useState } from "react";
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
  monto_original?: number;
  abonado?: number;
  n_abonos?: number;
  en_parcialidades?: boolean;
};

type Vista = "TODAS" | "PARCIALIDADES";

export default function Cartera() {
  const [rows, setRows] = useState<CxCRow[]>([]);
  const [abonando, setAbonando] = useState<CxCRow | null>(null);
  const [verAbonos, setVerAbonos] = useState<CxCRow | null>(null);
  const [q, setQ] = useState("");
  const [vista, setVista] = useState<Vista>("TODAS");

  function cargar() {
    api.get("/api/cxc/cartera").then((r) => setRows(r.data)).catch(() => {});
  }
  useEffect(() => { cargar(); }, []);

  const filtradas = useMemo(() => {
    let lista = rows;
    if (vista === "PARCIALIDADES") lista = lista.filter(r => r.en_parcialidades);
    const query = q.trim().toLowerCase();
    if (query) {
      const comoNumero = parseFloat(query.replace(/[$,]/g, ""));
      const esNumero = !isNaN(comoNumero);
      lista = lista.filter(r => {
        const matchTexto = r.cliente.toLowerCase().includes(query)
          || r.documento_folio.toLowerCase().includes(query);
        const matchImporte = esNumero && (
          Math.abs(r.saldo - comoNumero) < 0.01
          || (r.monto_original !== undefined && Math.abs(r.monto_original - comoNumero) < 0.01)
          || r.saldo.toFixed(2).includes(query)
          || (r.monto_original || 0).toFixed(2).includes(query)
        );
        return matchTexto || matchImporte;
      });
    }
    return lista;
  }, [rows, q, vista]);

  const total = filtradas.reduce((a, r) => a + r.saldo, 0);
  const n_parciales = rows.filter(r => r.en_parcialidades).length;

  async function exportar() {
    const r = await api.get("/api/reportes/cartera-xlsx", { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url; a.download = "cartera.xlsx";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return (
    <Layout title="Cartera por cobrar" subtitle={`${filtradas.length} de ${rows.length} documentos — Saldo mostrado ${fmt(total)}`}
      actions={<button className="btn-icon" onClick={exportar}>Exportar XLSX</button>}>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input"
            placeholder="🔍 Buscar por cliente, folio o importe..."
            value={q} onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1, minWidth: 240, fontSize: 15 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setVista("TODAS")}
              style={{
                padding: "10px 16px", border: 0, borderRadius: 6,
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                background: vista === "TODAS" ? "#0f172a" : "#e2e8f0",
                color: vista === "TODAS" ? "white" : "#334155",
              }}>
              Todas ({rows.length})
            </button>
            <button
              onClick={() => setVista("PARCIALIDADES")}
              style={{
                padding: "10px 16px", border: 0, borderRadius: 6,
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                background: vista === "PARCIALIDADES" ? "#f59e0b" : "#e2e8f0",
                color: vista === "PARCIALIDADES" ? "white" : "#334155",
              }}>
              📊 En parcialidades ({n_parciales})
            </button>
          </div>
        </div>
        {q && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
            Filtrando por "{q}" — también busca por importe exacto (ej: 1500.00)
          </div>
        )}
      </div>

      <div className="card">
        {filtradas.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)", textAlign: "center", padding: 24, margin: 0 }}>
            {q || vista !== "TODAS" ? "Sin resultados con los filtros actuales." : "Sin cuentas por cobrar pendientes."}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Cliente</th><th>Documento</th>
                <th style={{ textAlign: "right" }}>Original</th>
                <th style={{ textAlign: "right" }}>Abonado</th>
                <th style={{ textAlign: "right" }}>Saldo</th>
                <th>Antigüedad</th><th>Tipo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((r) => {
                const cls = r.dias_antiguedad > 90 ? "badge-danger" :
                            r.dias_antiguedad > 60 ? "badge-warning" :
                            r.dias_antiguedad > 30 ? "badge-info" : "badge-success";
                const original = r.monto_original ?? r.saldo;
                const abonado = r.abonado ?? 0;
                const pctAbonado = original > 0 ? (abonado / original) * 100 : 0;
                return (
                  <tr key={r.cxc_id} style={r.en_parcialidades ? { background: "#fffbeb" } : undefined}>
                    <td>{r.cliente}</td>
                    <td>
                      <code>{r.documento_folio}</code>
                      {r.en_parcialidades && (
                        <div style={{ fontSize: 10, color: "#92400e", fontWeight: 700, marginTop: 2 }}>
                          📊 {r.n_abonos} abono(s) · {pctAbonado.toFixed(0)}% pagado
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "right", fontSize: 12, color: "#64748b" }}>{fmt(original)}</td>
                    <td style={{ textAlign: "right", fontSize: 12, color: "#059669" }}>
                      {abonado > 0 ? fmt(abonado) : "—"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{fmt(r.saldo)}</td>
                    <td><span className={`badge ${cls}`}>{r.dias_antiguedad} días</span></td>
                    <td>
                      <span className={`badge ${r.tipo === "FACTURA" ? "badge-success" : "badge-info"}`}>
                        {r.tipo}
                      </span>
                      {r.es_ppd && <span className="badge badge-warning" style={{ marginLeft: 4 }}>PPD</span>}
                    </td>
                    <td style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => setAbonando(r)}>
                        {r.en_parcialidades ? "Abonar/Liquidar" : "Abonar"}
                      </button>
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
