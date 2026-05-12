import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

const fmt = (n: number) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

type CxP = {
  cxp_id: number; proveedor_id: number; proveedor: string;
  compra_id: number | null; compra_folio: string | null;
  folio_factura: string | null; fecha_recepcion: string | null;
  fecha_vencimiento: string | null; observaciones: string | null;
  monto_original: number; saldo: number; saldado: number;
  pagado: boolean; manual: boolean;
};

type Tablero = {
  panel: {
    id?: number; anio: number; mes: number;
    venta_objetivo_mes: number; saldo_banco: number;
    usd_mxn: number; notas: string | null;
  };
  kpis: {
    dia_actual: number; dias_mes: number; dias_restantes: number;
    venta_mes: number; venta_promedio_dia: number; venta_estimada_mes: number;
    restante_meta: number; a_vender_por_dia: number;
    cxp_total: number; cxp_del_mes: number; cxc_total: number;
    diferencia: number;
  };
};

export default function TableroCxP() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [filtroMes, setFiltroMes] = useState(true); // true = solo del mes, false = todas
  const [incluirPagadas, setIncluirPagadas] = useState(false);
  const [arrastrarVencidas, setArrastrarVencidas] = useState(true);

  const [tablero, setTablero] = useState<Tablero | null>(null);
  const [cxps, setCxps] = useState<CxP[]>([]);
  const [showCaptura, setShowCaptura] = useState(false);
  const [editandoPanel, setEditandoPanel] = useState(false);
  const [panelDraft, setPanelDraft] = useState<any>(null);
  const [abonando, setAbonando] = useState<CxP | null>(null);

  async function cargar() {
    const [t, c] = await Promise.all([
      api.get("/api/cxp/tablero", { params: { anio, mes } }),
      api.get("/api/cxp/cartera", {
        params: {
          anio: filtroMes ? anio : undefined,
          mes: filtroMes ? mes : undefined,
          incluir_pagadas: incluirPagadas,
          arrastrar_vencidas: arrastrarVencidas,
        },
      }),
    ]);
    setTablero(t.data);
    setCxps(c.data);
  }

  useEffect(() => { cargar(); }, [anio, mes, filtroMes, incluirPagadas, arrastrarVencidas]);

  async function guardarPanel() {
    await api.post("/api/cxp/panel", panelDraft);
    setEditandoPanel(false);
    cargar();
  }

  async function exportar() {
    const r = await api.get("/api/cxp/cartera-xlsx", {
      params: { anio, mes, incluir_pagadas: incluirPagadas },
      responseType: "blob",
    });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url; a.download = `cxp_${anio}-${String(mes).padStart(2, "0")}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function imprimir() { window.print(); }

  const totalSaldo = useMemo(() => cxps.reduce((a, c) => a + c.saldo, 0), [cxps]);
  const totalMonto = useMemo(() => cxps.reduce((a, c) => a + c.monto_original, 0), [cxps]);
  const totalSaldado = useMemo(() => cxps.reduce((a, c) => a + c.saldado, 0), [cxps]);

  function esVencida(c: CxP): boolean {
    if (!c.fecha_vencimiento || c.pagado) return false;
    return new Date(c.fecha_vencimiento) < new Date();
  }

  return (
    <Layout title="Tablero de Cuentas por Pagar"
      subtitle={`A quién debemos y cuándo · ${MESES[mes]} ${anio}`}
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-icon no-print" onClick={imprimir}>🖨 Imprimir</button>
          <button className="btn-icon no-print" onClick={exportar}>⬇ XLSX</button>
          <button className="btn no-print" onClick={() => setShowCaptura(true)}>+ Captura rápida</button>
        </div>
      }>

      {/* Selector de mes */}
      <div className="card no-print" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0, flexWrap: "wrap", gap: 8 }}>
          <select className="input" value={mes} onChange={(e) => setMes(+e.target.value)}>
            {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <input className="input" type="number" value={anio}
            onChange={(e) => setAnio(+e.target.value)} style={{ maxWidth: 100 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", marginLeft: 12 }}
            title="Si lo destildas, ves TODAS las CxP sin importar el mes">
            <input type="checkbox" checked={filtroMes}
              onChange={(e) => setFiltroMes(e.target.checked)} />
            Solo CxP de este mes
          </label>
          {filtroMes && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
              title="Las CxP vencidas de meses anteriores que aún no se pagan se incluyen automáticamente">
              <input type="checkbox" checked={arrastrarVencidas}
                onChange={(e) => setArrastrarVencidas(e.target.checked)} />
              Arrastrar vencidas de meses anteriores
            </label>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={incluirPagadas}
              onChange={(e) => setIncluirPagadas(e.target.checked)} />
            Incluir ya pagadas
          </label>
        </div>
      </div>

      {/* Panel del mes - tipo Excel */}
      {tablero && (
        <div className="card" style={{ marginBottom: 16, background: "#fef3c7" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Panel del mes — {MESES[mes]} {anio}</h3>
            <button className="btn-icon no-print" onClick={() => {
              if (!editandoPanel) setPanelDraft({ ...tablero.panel, anio, mes });
              setEditandoPanel(!editandoPanel);
            }}>
              {editandoPanel ? "Cancelar" : "✎ Editar"}
            </button>
          </div>

          {editandoPanel ? (
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div>
                <label>Meta de venta del mes</label>
                <input className="input" type="number" step="0.01"
                  value={panelDraft.venta_objetivo_mes}
                  onChange={(e) => setPanelDraft({ ...panelDraft, venta_objetivo_mes: +e.target.value })} />
              </div>
              <div>
                <label>Saldo en banco hoy</label>
                <input className="input" type="number" step="0.01"
                  value={panelDraft.saldo_banco}
                  onChange={(e) => setPanelDraft({ ...panelDraft, saldo_banco: +e.target.value })} />
              </div>
              <div>
                <label>USD/MXN</label>
                <input className="input" type="number" step="0.0001"
                  value={panelDraft.usd_mxn}
                  onChange={(e) => setPanelDraft({ ...panelDraft, usd_mxn: +e.target.value })} />
              </div>
              <div className="form-grid-full">
                <label>Notas (visible para tu equipo / familia)</label>
                <textarea className="input" rows={2}
                  value={panelDraft.notas || ""}
                  onChange={(e) => setPanelDraft({ ...panelDraft, notas: e.target.value })} />
              </div>
              <div>
                <button className="btn" onClick={guardarPanel}>Guardar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <Card label="Meta de venta" value={fmt(tablero.panel.venta_objetivo_mes)} />
              <Card label="Saldo banco" value={fmt(tablero.panel.saldo_banco)} />
              <Card label="USD/MXN" value={tablero.panel.usd_mxn ? `$${tablero.panel.usd_mxn}` : "—"} />
              <Card label="Día del mes" value={`${tablero.kpis.dia_actual} / ${tablero.kpis.dias_mes}`} />

              <Card label="Vendido hasta hoy" value={fmt(tablero.kpis.venta_mes)} sub={`promedio ${fmt(tablero.kpis.venta_promedio_dia)}/día`} />
              <Card label="Falta para meta" value={fmt(tablero.kpis.restante_meta)} sub={`${fmt(tablero.kpis.a_vender_por_dia)}/día`} />
              <Card label="A pagar este mes" value={fmt(tablero.kpis.cxp_del_mes)} sub={`total CxP: ${fmt(tablero.kpis.cxp_total)}`} danger />
              <Card label="Por cobrar (CxC)" value={fmt(tablero.kpis.cxc_total)} success />

              <div style={{ gridColumn: "1 / span 4", display: "flex", justifyContent: "space-between",
                padding: "12px 16px", background: "white", borderRadius: 8, marginTop: 4,
                border: "2px solid " + (tablero.kpis.diferencia >= 0 ? "#16a34a" : "#dc2626") }}>
                <div>
                  <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>
                    Proyección: (CxC + Venta estimada) − CxP total
                  </div>
                  <div style={{ fontSize: 13, color: "#9ca3af" }}>
                    Venta estimada del mes: {fmt(tablero.kpis.venta_estimada_mes)}
                  </div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800,
                  color: tablero.kpis.diferencia >= 0 ? "#16a34a" : "#dc2626" }}>
                  {tablero.kpis.diferencia >= 0 ? "+" : ""}{fmt(tablero.kpis.diferencia)}
                </div>
              </div>

              {tablero.panel.notas && (
                <div style={{ gridColumn: "1 / span 4", background: "white", padding: 10, borderRadius: 6, fontSize: 13 }}>
                  <strong>Notas:</strong> {tablero.panel.notas}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabla CxP */}
      <div className="card print-area">
        <div style={{ padding: "8px 0 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>Cuentas por pagar</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
              Ordenadas por fecha de vencimiento · Las vencidas se marcan en rojo
              {filtroMes && arrastrarVencidas && (
                <span> · Las que vencieron antes y no se han pagado aparecen automáticamente cada mes</span>
              )}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>SALDO PENDIENTE</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "var(--color-danger)" }}>{fmt(totalSaldo)}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              de {fmt(totalMonto)} · pagado {fmt(totalSaldado)}
            </div>
          </div>
        </div>

        {cxps.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)", textAlign: "center", padding: 32 }}>
            Sin cuentas por pagar {filtroMes ? `en ${MESES[mes]} ${anio}` : ""}.
          </p>
        ) : (
          <table style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Folio factura</th>
                <th>Llegada</th>
                <th>Vence</th>
                <th>Proveedor</th>
                <th>Observaciones</th>
                <th style={{ textAlign: "right" }}>Monto</th>
                <th style={{ textAlign: "right" }}>Saldado</th>
                <th style={{ textAlign: "right" }}>Saldo</th>
                <th className="no-print"></th>
              </tr>
            </thead>
            <tbody>
              {cxps.map((c) => {
                const vencida = esVencida(c);
                return (
                  <tr key={c.cxp_id} style={{
                    background: vencida ? "#fee2e2" : (c.pagado ? "#f0fdf4" : undefined),
                  }}>
                    <td><code>{c.folio_factura || c.compra_folio || "—"}</code></td>
                    <td>{c.fecha_recepcion ? new Date(c.fecha_recepcion).toLocaleDateString("es-MX") : "—"}</td>
                    <td>
                      {c.fecha_vencimiento ? new Date(c.fecha_vencimiento).toLocaleDateString("es-MX") : "—"}
                      {vencida && <span className="badge badge-danger" style={{ marginLeft: 4 }}>VENCIDA</span>}
                    </td>
                    <td><strong>{c.proveedor}</strong></td>
                    <td style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{c.observaciones || ""}</td>
                    <td style={{ textAlign: "right" }}>{fmt(c.monto_original)}</td>
                    <td style={{ textAlign: "right", color: "var(--color-text-muted)" }}>{fmt(c.saldado)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700,
                      color: c.pagado ? "var(--color-success)" : "var(--color-danger)" }}>
                      {c.pagado ? "✓ pagado" : fmt(c.saldo)}
                    </td>
                    <td className="no-print" style={{ display: "flex", gap: 4 }}>
                      {!c.pagado && (
                        <button className="btn btn-sm" onClick={() => setAbonando(c)}>Abonar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: "#dbeafe", fontWeight: 700 }}>
                <td colSpan={5} style={{ textAlign: "right" }}>TOTAL</td>
                <td style={{ textAlign: "right" }}>{fmt(totalMonto)}</td>
                <td style={{ textAlign: "right" }}>{fmt(totalSaldado)}</td>
                <td style={{ textAlign: "right", fontSize: 15 }}>{fmt(totalSaldo)}</td>
                <td className="no-print"></td>
              </tr>
            </tbody>
          </table>
        )}

        <p style={{ marginTop: 12, fontSize: 11, color: "var(--color-text-muted)", fontStyle: "italic" }}>
          Generado: {new Date().toLocaleString("es-MX")}
        </p>
      </div>

      {showCaptura && (
        <CapturaCxPModal
          onClose={() => setShowCaptura(false)}
          onSaved={() => { setShowCaptura(false); cargar(); }}
        />
      )}

      {abonando && (
        <AbonoModal cxp={abonando}
          onClose={() => setAbonando(null)}
          onSaved={() => { setAbonando(null); cargar(); }}
        />
      )}

      <style>{`@media print { .no-print, .sidebar, .layout-header { display: none !important; } }`}</style>
    </Layout>
  );
}


function Card({ label, value, sub, danger, success }: {
  label: string; value: string; sub?: string; danger?: boolean; success?: boolean;
}) {
  const color = danger ? "#dc2626" : success ? "#16a34a" : "#1f2937";
  return (
    <div style={{ background: "white", padding: 12, borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}


function CapturaCxPModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [proveedorNombre, setProveedorNombre] = useState("");
  const [folio, setFolio] = useState("");
  const [fechaRecep, setFechaRecep] = useState<string>(new Date().toISOString().slice(0, 10));
  const [fechaVence, setFechaVence] = useState<string>("");
  const [monto, setMonto] = useState(0);
  const [saldado, setSaldado] = useState(0);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  async function guardar() {
    if (!proveedorNombre.trim()) return alert("Captura el proveedor");
    if (monto <= 0) return alert("El monto debe ser mayor a 0");
    setBusy(true);
    try {
      await api.post("/api/cxp/manual", {
        proveedor_nombre: proveedorNombre.trim(),
        folio_factura: folio || null,
        fecha_recepcion: fechaRecep || null,
        fecha_vencimiento: fechaVence || null,
        monto_original: monto,
        saldado: saldado || 0,
        observaciones: obs || null,
      });
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
        <h3 style={{ marginTop: 0 }}>Captura rápida de cuenta por pagar</h3>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 16px" }}>
          Para deudas que llegan por factura del proveedor sin registrar la compra completa con inventario.
        </p>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="form-grid-full">
            <label>Proveedor *</label>
            <input className="input" value={proveedorNombre}
              onChange={(e) => setProveedorNombre(e.target.value)}
              placeholder="USG, Truper, Deacero..." />
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              Si no existe, se crea automáticamente.
            </p>
          </div>
          <div>
            <label>Folio de factura</label>
            <input className="input" value={folio} onChange={(e) => setFolio(e.target.value)}
              placeholder="A89271" />
          </div>
          <div>
            <label>Fecha de llegada</label>
            <input className="input" type="date" value={fechaRecep}
              onChange={(e) => setFechaRecep(e.target.value)} />
          </div>
          <div>
            <label>Fecha de vencimiento</label>
            <input className="input" type="date" value={fechaVence}
              onChange={(e) => setFechaVence(e.target.value)} />
          </div>
          <div>
            <label>Monto total *</label>
            <input className="input" type="number" step="0.01" value={monto}
              onChange={(e) => setMonto(+e.target.value)} />
          </div>
          <div>
            <label>Ya saldado (si aplica)</label>
            <input className="input" type="number" step="0.01" value={saldado}
              onChange={(e) => setSaldado(+e.target.value)} />
          </div>
          <div className="form-grid-full">
            <label>Observaciones</label>
            <input className="input" value={obs} onChange={(e) => setObs(e.target.value)}
              placeholder="tablaroca, herramienta, pedido obra..." />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button className="btn" disabled={busy} onClick={guardar} style={{ flex: 1, justifyContent: "center" }}>
            {busy ? "Guardando..." : "Guardar"}
          </button>
          <button className="btn-icon" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}


function AbonoModal({ cxp, onClose, onSaved }: { cxp: CxP; onClose: () => void; onSaved: () => void }) {
  const [monto, setMonto] = useState(cxp.saldo);
  const [formaPago, setFormaPago] = useState("TRANSFERENCIA");
  const [referencia, setReferencia] = useState("");
  const [busy, setBusy] = useState(false);

  async function guardar() {
    if (monto <= 0 || monto > cxp.saldo + 0.01) return alert(`Monto fuera de rango (saldo ${fmt(cxp.saldo)})`);
    setBusy(true);
    try {
      // Si es CxP manual, usamos PATCH para sumar al saldado
      // Si es ligada a Compra, usamos el endpoint de abono CxP existente
      if (cxp.manual) {
        const nuevoSaldado = cxp.saldado + monto;
        await api.patch(`/api/cxp/manual/${cxp.cxp_id}`, { saldado: nuevoSaldado });
      } else {
        await api.post("/api/cxp/abono", {
          cxp_id: cxp.cxp_id, monto, forma_pago: formaPago,
          referencia: referencia || null,
        });
      }
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
        <h3 style={{ marginTop: 0 }}>Abonar a CxP</h3>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          <strong>{cxp.proveedor}</strong> · {cxp.folio_factura || cxp.compra_folio || ""}<br/>
          Saldo: {fmt(cxp.saldo)}
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
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="CHEQUE">Cheque</option>
              <option value="TARJETA_CREDITO">Tarjeta crédito</option>
            </select>
          </div>
          <div className="form-grid-full">
            <label>Referencia (opcional)</label>
            <input className="input" value={referencia} onChange={(e) => setReferencia(e.target.value)}
              placeholder="Folio de transferencia, cheque..." />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button className="btn" disabled={busy} onClick={guardar} style={{ flex: 1, justifyContent: "center" }}>
            {busy ? "Guardando..." : "Registrar abono"}
          </button>
          <button className="btn-icon" onClick={onClose}>Cancelar</button>
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
  background: "white", maxWidth: 620, width: "92%",
  padding: 24, borderRadius: 12, maxHeight: "90vh", overflow: "auto",
};
