import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../api/client";

const fmt = (n: number) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n: number) =>
  n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => n.toFixed(2) + "%";

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

type CxP = {
  cxp_id: number; proveedor_id: number; proveedor: string;
  compra_id: number | null; compra_folio: string | null;
  folio_factura: string | null; fecha_recepcion: string | null;
  fecha_vencimiento: string | null; observaciones: string | null;
  moneda?: string; tipo_cambio?: number | null;
  monto_moneda_original?: number | null;
  monto_original: number; saldo: number; saldado: number;
  pagado: boolean; manual: boolean;
  corto_plazo?: boolean;
};

type Tablero = {
  panel: {
    id?: number; anio: number; mes: number;
    venta_objetivo_mes: number; saldo_banco: number;
    ingreso_egreso_banco: number;
    usd_mxn: number; notas: string | null;
  };
  kpis: {
    dia_actual: number; dias_mes: number; dias_restantes: number;
    dias_habiles_semana: number;
    venta_mes: number; venta_promedio_dia: number; venta_estimada_mes: number;
    restante_meta: number; a_vender_por_dia: number;
    cxp_total: number; cxp_del_mes: number; cxp_corto_plazo: number; cxc_total: number;
    diferencia: number;
  };
};

type DeudaBancaria = {
  id: number; nombre: string; referencia: string | null;
  notas: string | null; total: number;
  conceptos: { id: number; concepto: string; monto: number; orden: number; pct: number }[];
};

type DeudaProv = { total: number; filas: { proveedor_id: number; proveedor: string; saldo: number; pct: number }[] };

export default function TableroCxP() {
  const nav = useNavigate();
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  // Por default: ver TODAS las CxP pendientes (replica el Excel del usuario)
  // Si activa "Solo del mes", filtra por el selector arriba.
  const [soloDelMes, setSoloDelMes] = useState(false);
  const [arrastrarVencidas, setArrastrarVencidas] = useState(true);
  const [incluirPagadas, setIncluirPagadas] = useState(false);

  const [tablero, setTablero] = useState<Tablero | null>(null);
  const [cxps, setCxps] = useState<CxP[]>([]);
  const [deudaProv, setDeudaProv] = useState<DeudaProv | null>(null);
  const [deudasBanc, setDeudasBanc] = useState<DeudaBancaria[]>([]);
  const [otrosPagos, setOtrosPagos] = useState<{ id: number; concepto: string; monto: number }[]>([]);
  const [showCaptura, setShowCaptura] = useState(false);
  const [editandoPanel, setEditandoPanel] = useState(false);
  const [panelDraft, setPanelDraft] = useState<any>(null);
  const [abonando, setAbonando] = useState<CxP | null>(null);
  // Edicion doble click: {cxp_id, campo}
  const [editing, setEditing] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  async function guardarEdit(cxp: CxP) {
    if (!editing) return;
    const field = editing.field;
    let payload: any = {};

    if (field === "folio_factura") {
      payload.folio_factura = editValue.trim() || null;
    } else if (field === "observaciones") {
      payload.observaciones = editValue.trim() || null;
    } else if (field === "fecha_recepcion" || field === "fecha_vencimiento") {
      if (!editValue) {
        payload[field] = null;
      } else {
        // editValue es "YYYY-MM-DD", lo convertimos a ISO datetime
        payload[field] = new Date(editValue + "T00:00:00").toISOString();
      }
    } else if (field === "saldado") {
      const n = +editValue;
      if (isNaN(n) || n < 0) return alert("Saldado inválido");
      if (n > cxp.monto_original) return alert("Saldado no puede ser mayor al monto");
      payload.saldado = n;
    } else if (field === "monto") {
      const n = +editValue;
      if (isNaN(n) || n <= 0) return alert("Monto inválido");
      // Para cambiar monto, recalculamos saldo = monto - saldado actual
      // Pero el endpoint solo acepta saldado, así que necesitamos otra ruta
      // Por simplicidad: solo permitir cambiar monto si no hay abonos
      if (cxp.saldado > 0 && !cxp.manual) {
        return alert("No se puede cambiar monto si ya tiene abonos");
      }
      // Recalcular saldado y enviar
      payload.saldado = cxp.saldado;
      payload.monto_original = n; // backend no lo acepta hoy, pero lo agregamos abajo
      return alert("Para cambiar monto, usa Captura rápida con un nuevo registro");
    }
    try {
      await api.patch(`/api/cxp/manual/${cxp.cxp_id}`, payload);
      setEditing(null);
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  function iniciarEdit(c: CxP, field: string, current: string) {
    setEditing({ id: c.cxp_id, field });
    setEditValue(current);
  }

  function celdaEdit(c: CxP, field: string, valorVisible: string, valorEdit?: string) {
    const isEditing = editing?.id === c.cxp_id && editing.field === field;
    if (!isEditing) {
      const esMonetario = field === "saldado" || field === "monto";
      return (
        <span onDoubleClick={() => iniciarEdit(c, field, valorEdit ?? valorVisible)}
          style={{
            cursor: "pointer",
            textDecoration: esMonetario && valorVisible ? "underline dotted #94a3b8" : "none",
            textUnderlineOffset: 3,
          }}
          title="Doble click para editar">
          {valorVisible || <span style={{ color: "#cbd5e1" }}>—</span>}
        </span>
      );
    }
    const inputType = field === "fecha_recepcion" || field === "fecha_vencimiento" ? "date" :
                      field === "saldado" || field === "monto" ? "number" : "text";
    return (
      <input autoFocus type={inputType} step="0.01"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={() => guardarEdit(c)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); guardarEdit(c); }
          if (e.key === "Escape") setEditing(null);
        }}
        style={{ width: "100%", padding: 4, fontSize: 12, border: "2px solid var(--color-primary)" }} />
    );
  }

  async function cargar() {
    const [t, c, d, db, op] = await Promise.all([
      api.get("/api/cxp/tablero", { params: { anio, mes } }),
      api.get("/api/cxp/cartera", {
        params: {
          anio: soloDelMes ? anio : undefined,
          mes: soloDelMes ? mes : undefined,
          incluir_pagadas: incluirPagadas,
          arrastrar_vencidas: arrastrarVencidas,
        },
      }),
      api.get("/api/cxp/deuda-por-proveedor"),
      api.get("/api/cxp/deuda-bancaria"),
      api.get("/api/cxp/otros-pagos"),
    ]);
    setTablero(t.data);
    setCxps(c.data);
    setDeudaProv(d.data);
    setDeudasBanc(db.data);
    setOtrosPagos(op.data || []);
  }

  useEffect(() => { cargar(); }, [anio, mes, soloDelMes, incluirPagadas, arrastrarVencidas]);

  async function guardarPanel() {
    await api.post("/api/cxp/panel", panelDraft);
    setEditandoPanel(false);
    cargar();
  }

  async function traerBanxico() {
    try {
      const r = await api.get("/api/cxp/tipo-cambio");
      setPanelDraft({ ...panelDraft, usd_mxn: r.data.valor });
      alert(`Tipo de cambio actualizado: ${r.data.valor}\nFuente: ${r.data.fuente}\nFecha: ${r.data.fecha}`);
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function toggleCortoPlazo(c: CxP) {
    try {
      await api.patch(`/api/cxp/manual/${c.cxp_id}`, { corto_plazo: !c.corto_plazo });
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
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

  // === Fórmulas estilo Excel del usuario ===
  const k = tablero?.kpis;
  const p = tablero?.panel;

  // "Venta del mes" = lo vendido hasta hoy. Auto del POS, pero si el usuario
  // capturó un valor manual en el panel, ese gana (override).
  const ventaActualMes = (p?.venta_objetivo_mes && p.venta_objetivo_mes > 0)
    ? p.venta_objetivo_mes
    : (k?.venta_mes || 0);

  const diaActual = k?.dia_actual || 1;
  const diasMes = k?.dias_mes || 30;
  const diasRestantes = Math.max(1, diasMes - diaActual + 1);

  // Venta promedio día = lo vendido / día actual (real, no meta)
  const ventaPromDia = ventaActualMes / diaActual;
  // Venta mensual estimada = proyección al ritmo actual
  const ventaMensualEst = ventaPromDia * diasMes;
  // Restante a venta estimada (lo que falta vender este mes según proyección)
  const restanteVentaEstimada = Math.max(0, ventaMensualEst - ventaActualMes);

  // "Facturas por pagar" = CxP marcadas como corto plazo + Otros pagos del tablero
  // (renta, sueldos, servicios). Total general queda como referencia.
  const totalOtrosPagos = otrosPagos.reduce((a, o) => a + (o.monto || 0), 0);
  const facturasPorPagar = (k?.cxp_corto_plazo || 0) + totalOtrosPagos;
  const totalProveedores = k?.cxp_total || 0; // todas las CxP abiertas
  const saldo = p?.saldo_banco || 0;
  const ingresoEgresoBanco = p?.ingreso_egreso_banco || 0;

  // Restante facturas por pagar = lo que falta cubrir
  const restanteFacturasPagar = Math.max(0, facturasPorPagar - saldo);
  // A vender por día = restante facturas / días hábiles restantes esta semana
  const diasHabilesSemana = k?.dias_habiles_semana || 5;
  const aVenderPorDia = restanteFacturasPagar / diasHabilesSemana;

  const pctNecesario = facturasPorPagar > 0 ? saldo / facturasPorPagar : 0;

  const usdMxn = p?.usd_mxn || 0;
  const deudasXCobrar = k?.cxc_total || 0;
  const pctVentaDeuda = facturasPorPagar > 0 ? ventaMensualEst / facturasPorPagar : 0;

  return (
    <Layout title="Tablero de Cuentas por Pagar"
      subtitle={`${MESES[mes]} ${anio} · Plan de continuidad`}
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-icon no-print" onClick={imprimir}>🖨 Imprimir</button>
          <button className="btn-icon no-print" onClick={exportar}>⬇ XLSX</button>
          <button className="btn no-print" onClick={() => setShowCaptura(true)}>+ Captura rápida</button>
        </div>
      }>

      {/* Selector de mes */}
      <div className="card no-print" style={{ marginBottom: 12 }}>
        <div className="toolbar" style={{ marginBottom: 0, flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <select className="input" value={mes} onChange={(e) => setMes(+e.target.value)}>
            {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <input className="input" type="number" value={anio}
            onChange={(e) => setAnio(+e.target.value)} style={{ maxWidth: 100 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", marginLeft: 12, fontWeight: 600 }}
            title="Off (default): muestra TODAS las CxP pendientes. On: filtra solo las del mes seleccionado.">
            <input type="checkbox" checked={soloDelMes}
              onChange={(e) => setSoloDelMes(e.target.checked)} />
            Solo del mes seleccionado
          </label>
          {soloDelMes && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={arrastrarVencidas}
                onChange={(e) => setArrastrarVencidas(e.target.checked)} />
              Arrastrar vencidas anteriores
            </label>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={incluirPagadas}
              onChange={(e) => setIncluirPagadas(e.target.checked)} />
            Incluir ya pagadas
          </label>
          <button className="btn-icon" onClick={() => {
            if (!editandoPanel && p) setPanelDraft({ ...p, anio, mes });
            setEditandoPanel(!editandoPanel);
          }} style={{ marginLeft: "auto" }}>
            {editandoPanel ? "Cancelar edición" : "✎ Editar panel"}
          </button>
        </div>
      </div>

      {/* PANEL DEL MES - replica exacta del Excel */}
      {tablero && (
        <div className="card" style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
          <table style={panelTableStyle}>
            <tbody>
              <tr>
                <td style={lblGreen}>Venta del mes</td>
                <td style={valRed}>
                  {editandoPanel ? (
                    <input className="input" type="number" step="0.01" value={panelDraft.venta_objetivo_mes}
                      onChange={(e) => setPanelDraft({ ...panelDraft, venta_objetivo_mes: +e.target.value })}
                      style={inpStyle} />
                  ) : fmt(ventaActualMes)}
                </td>
                <td style={lblYellow}>Saldo</td>
                <td style={valBlack}>
                  {editandoPanel ? (
                    <input className="input" type="number" step="0.01" value={panelDraft.saldo_banco}
                      onChange={(e) => setPanelDraft({ ...panelDraft, saldo_banco: +e.target.value })}
                      style={inpStyle} />
                  ) : fmt(saldo)}
                </td>
                <td style={lblGreen}></td>
                <td style={lblGreen}>DIA DEL MES</td>
                <td style={valBlack}>{k?.dia_actual}</td>
                <td style={lblYellow}>Quedarían</td>
              </tr>
              <tr>
                <td style={lblGreen}>Venta promedio día</td>
                <td style={valBlack}>{fmt(ventaPromDia)}</td>
                <td style={lblBlue}>Venta mensual estimada</td>
                <td style={valBlack}>{fmt(ventaMensualEst)}</td>
                <td style={lblYellow}>Facturas por pagar</td>
                <td style={valBlack}>{fmt(facturasPorPagar)}</td>
                <td style={lblYellow}>A vender por día</td>
                <td style={valRed}>{fmt(aVenderPorDia)}</td>
              </tr>
              <tr>
                <td style={lblGreen}>$ ingreso - egreso - banco</td>
                <td style={valBlack}>
                  {editandoPanel ? (
                    <input className="input" type="number" step="0.01"
                      value={panelDraft.ingreso_egreso_banco}
                      onChange={(e) => setPanelDraft({ ...panelDraft, ingreso_egreso_banco: +e.target.value })}
                      style={inpStyle} />
                  ) : fmt(ingresoEgresoBanco)}
                </td>
                <td style={lblBlue}>Restante a venta estimada</td>
                <td style={valBlack}>{fmt(restanteVentaEstimada)}</td>
                <td style={lblBlue}>Restante facturas por pagar</td>
                <td colSpan={3} style={valBlack}>{fmt(restanteFacturasPagar)}</td>
              </tr>
              <tr>
                <td style={lblGreen}>% $ necesario</td>
                <td style={valBlack}>{fmtPct(pctNecesario * 100)}</td>
                <td style={lblYellow}>USD/MXN</td>
                <td style={valRed}>
                  {editandoPanel ? (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input className="input" type="number" step="0.0001" value={panelDraft.usd_mxn}
                        onChange={(e) => setPanelDraft({ ...panelDraft, usd_mxn: +e.target.value })}
                        style={inpStyle} />
                      <button type="button" onClick={traerBanxico}
                        title="Obtener tipo de cambio desde Banxico (o fallback)"
                        style={{ background: "#1f2937", color: "white", border: 0,
                          padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>
                        🔄 Banxico
                      </button>
                    </div>
                  ) : fmtNum(usdMxn)}
                </td>
                <td style={lblRed} onClick={() => nav("/cartera")}
                  title="Click para ver el detalle en Cartera"
                  >Deudas x cobrar 🔗</td>
                <td colSpan={3} style={{ ...valBlack, cursor: "pointer" }}
                  onClick={() => nav("/cartera")}
                  title="Suma de saldos pendientes en Cartera">
                  {fmt(deudasXCobrar)}
                </td>
              </tr>
              <tr>
                <td></td>
                <td></td>
                <td style={lblBlue}>% venta estimada /deuda</td>
                <td style={valRed}>{fmtPct(pctVentaDeuda * 100)}</td>
                <td colSpan={4}></td>
              </tr>
              <tr>
                <td colSpan={4} style={{ ...lblGreen, textAlign: "center" }}>TOTAL DE PROVEEDORES</td>
                <td colSpan={2} style={valBlack}>{fmt(totalProveedores)}</td>
                <td colSpan={2} style={valBlack}>{fmt(totalSaldado)}</td>
              </tr>
            </tbody>
          </table>
          {editandoPanel && (
            <div style={{ padding: 12, background: "#fef3c7", display: "flex", gap: 8, alignItems: "center" }}>
              <input className="input" placeholder="Notas para el equipo / familia..."
                value={panelDraft.notas || ""}
                onChange={(e) => setPanelDraft({ ...panelDraft, notas: e.target.value })}
                style={{ flex: 1 }} />
              <button className="btn" onClick={guardarPanel}>Guardar panel</button>
            </div>
          )}
          {!editandoPanel && p?.notas && (
            <div style={{ padding: 10, background: "#fef3c7", fontSize: 13 }}>
              <strong>Notas:</strong> {p.notas}
            </div>
          )}
        </div>
      )}

      {/* TABLA DE CUENTAS POR PAGAR - orden exacto del Excel */}
      <div className="card print-area" style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thOrange}>Folio</th>
              <th style={thOrange}>Fecha llegada</th>
              <th style={thOrange}>Fecha vence</th>
              <th style={thOrange}>Empresa</th>
              <th style={thOrange}>Obs</th>
              <th style={{ ...thOrange, textAlign: "right" }}>Monto</th>
              <th style={{ ...thOrange, textAlign: "right" }}>Saldado</th>
              <th style={{ ...thOrange, textAlign: "right" }}>Saldo</th>
              <th style={{ ...thOrange, textAlign: "center", width: 70 }}
                title="Marca las facturas que vas a pagar en el corto plazo. El panel suma SOLO estas en 'Facturas por pagar'.">
                Corto plazo
              </th>
              <th className="no-print" style={thOrange}></th>
            </tr>
          </thead>
          <tbody>
            {cxps.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>
                Sin cuentas por pagar en este filtro.
              </td></tr>
            ) : cxps.map((c) => {
              const vencida = esVencida(c);
              const fLleg = c.fecha_recepcion ? new Date(c.fecha_recepcion).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "";
              const fVenc = c.fecha_vencimiento ? new Date(c.fecha_vencimiento).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "";
              const fLlegEdit = c.fecha_recepcion ? c.fecha_recepcion.slice(0, 10) : "";
              const fVencEdit = c.fecha_vencimiento ? c.fecha_vencimiento.slice(0, 10) : "";
              return (
                <tr key={c.cxp_id} style={{
                  background: c.pagado ? "#f0fdf4" : (vencida ? "#fee2e2" : "white"),
                }}>
                  <td style={td}>
                    {editing?.id === c.cxp_id && editing.field === "folio_factura"
                      ? celdaEdit(c, "folio_factura", c.folio_factura || "")
                      : <code style={{ fontSize: 12, cursor: "pointer" }}
                          onDoubleClick={() => iniciarEdit(c, "folio_factura", c.folio_factura || "")}>
                          {c.folio_factura || c.compra_folio || <span style={{ color: "#cbd5e1" }}>—</span>}
                        </code>
                    }
                  </td>
                  <td style={td}>{celdaEdit(c, "fecha_recepcion", fLleg, fLlegEdit)}</td>
                  <td style={td}>
                    {celdaEdit(c, "fecha_vencimiento", fVenc, fVencEdit)}
                    {vencida && <span className="badge badge-danger" style={{ marginLeft: 4, fontSize: 10 }}>VENCIDA</span>}
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>{c.proveedor}</td>
                  <td style={{ ...td, fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {celdaEdit(c, "observaciones", c.observaciones || "")}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {fmt(c.monto_original)}
                    {c.moneda === "USD" && c.monto_moneda_original && (
                      <div style={{ fontSize: 10, color: "#6b7280" }}>
                        ≈ USD ${c.monto_moneda_original.toFixed(2)} @ {c.tipo_cambio}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right", color: "var(--color-text-muted)" }}>
                    {celdaEdit(c, "saldado", c.saldado > 0 ? fmt(c.saldado) : "", String(c.saldado))}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700,
                    color: c.pagado ? "var(--color-success)" : "var(--color-danger)" }}>
                    {c.pagado ? (
                      <span onDoubleClick={() => iniciarEdit(c, "saldado", String(c.saldado))}
                        style={{ cursor: "pointer", textDecoration: "underline dotted" }}
                        title="Doble click para corregir el saldado">✓ pagado</span>
                    ) : fmt(c.saldo)}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}
                    title={c.corto_plazo ? "Marcada como corto plazo (suma al panel)" : "Click para marcar como corto plazo"}>
                    <input type="checkbox" checked={!!c.corto_plazo}
                      disabled={c.pagado}
                      onChange={() => toggleCortoPlazo(c)}
                      style={{ cursor: c.pagado ? "not-allowed" : "pointer", transform: "scale(1.3)" }} />
                  </td>
                  <td className="no-print" style={td}>
                    {c.pagado ? (
                      <button className="btn btn-sm"
                        style={{ background: "#f1f5f9", color: "#0f172a", border: "1px solid #cbd5e1" }}
                        onClick={() => iniciarEdit(c, "saldado", String(c.saldado))}
                        title="Corregir el monto saldado">
                        Editar pago
                      </button>
                    ) : (
                      <button className="btn btn-sm" onClick={() => setAbonando(c)}>Abonar</button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: "#dbeafe", fontWeight: 700 }}>
              <td colSpan={5} style={{ ...td, textAlign: "right" }}>TOTAL ({cxps.length} doc{cxps.length !== 1 ? "s" : ""})</td>
              <td style={{ ...td, textAlign: "right" }}>{fmt(totalMonto)}</td>
              <td style={{ ...td, textAlign: "right" }}>{fmt(totalSaldado)}</td>
              <td style={{ ...td, textAlign: "right", fontSize: 14 }}>{fmt(totalSaldo)}</td>
              <td style={{ ...td, textAlign: "center", fontSize: 11, fontWeight: 600 }}>
                {cxps.filter((c) => c.corto_plazo && !c.pagado).length}
              </td>
              <td className="no-print"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* SECCIÓN OTROS PAGOS - se suma a Facturas por pagar */}
      <OtrosPagosPanel otros={otrosPagos} onChange={cargar} />

      {/* SECCIÓN DEUDA POR PROVEEDOR + DEUDA BANCARIA - grid 2 columnas */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        {deudaProv && (
          <div className="card print-area">
            <h3 className="card-header">Deuda por proveedor</h3>
            <table style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#1f2937", color: "white" }}>
                  <th style={{ ...thBlack, textAlign: "right", width: "30%" }}>DEUDA</th>
                  <th style={{ ...thBlack, textAlign: "right", width: "15%" }}>%</th>
                  <th style={thBlack}>Proveedor</th>
                </tr>
              </thead>
              <tbody>
                {deudaProv.filas.map((f) => (
                  <tr key={f.proveedor_id} style={{
                    background: f.saldo > 0 ? "white" : "#f9fafb",
                    color: f.saldo > 0 ? undefined : "#9ca3af",
                  }}>
                    <td style={{ ...td, textAlign: "right", fontWeight: f.saldo > 0 ? 700 : 400 }}>
                      {f.saldo > 0 ? fmt(f.saldo) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {f.saldo > 0 ? fmtPct(f.pct) : "0.00%"}
                    </td>
                    <td style={td}>{f.proveedor}</td>
                  </tr>
                ))}
                <tr style={{ background: "#dbeafe", fontWeight: 800 }}>
                  <td style={{ ...td, textAlign: "right", fontSize: 14 }}>{fmt(deudaProv.total)}</td>
                  <td style={{ ...td, textAlign: "right" }}>100.00%</td>
                  <td style={td}>TOTAL</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <DeudaBancariaPanel deudas={deudasBanc} onChange={cargar} />
      </div>

      {showCaptura && (
        <CapturaCxPModal
          tipoCambioDefault={usdMxn}
          onClose={() => setShowCaptura(false)}
          onSaved={() => { setShowCaptura(false); cargar(); }} />
      )}
      {abonando && (
        <AbonoModal cxp={abonando} onClose={() => setAbonando(null)}
          onSaved={() => { setAbonando(null); cargar(); }} />
      )}

      <style>{`@media print { .no-print, .sidebar, .layout-header { display: none !important; } body { font-size: 11px; } }`}</style>
    </Layout>
  );
}

// === Estilos para replicar las celdas del Excel ===
const panelTableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: 12,
};
const cellBase: React.CSSProperties = {
  padding: "8px 10px", border: "1px solid #d1d5db",
  fontWeight: 700, textAlign: "left", whiteSpace: "nowrap",
};
const lblGreen: React.CSSProperties = { ...cellBase, background: "#86efac", color: "#14532d" };
const lblYellow: React.CSSProperties = { ...cellBase, background: "#fde047", color: "#713f12" };
const lblBlue: React.CSSProperties = { ...cellBase, background: "#bfdbfe", color: "#1e40af" };
const lblRed: React.CSSProperties = { ...cellBase, background: "#fca5a5", color: "#7f1d1d" };
const valBlack: React.CSSProperties = { ...cellBase, fontWeight: 600, textAlign: "right", background: "white", color: "#1f2937" };
const valRed: React.CSSProperties = { ...valBlack, color: "#dc2626", fontWeight: 700 };
const thOrange: React.CSSProperties = {
  padding: "10px 12px", background: "#ea580c", color: "white",
  fontWeight: 700, textAlign: "left", borderBottom: "1px solid #c2410c",
};
const thBlack: React.CSSProperties = {
  padding: "8px 10px", textAlign: "left", fontWeight: 600,
};
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e5e7eb" };
const inpStyle: React.CSSProperties = { width: 110, padding: 4, fontSize: 12, textAlign: "right" };


function CapturaCxPModal({ onClose, onSaved, tipoCambioDefault }: {
  onClose: () => void; onSaved: () => void; tipoCambioDefault?: number;
}) {
  const [proveedorNombre, setProveedorNombre] = useState("");
  const [folio, setFolio] = useState("");
  const [fechaRecep, setFechaRecep] = useState<string>(new Date().toISOString().slice(0, 10));
  const [fechaVence, setFechaVence] = useState<string>("");
  const [monto, setMonto] = useState(0);
  const [saldado, setSaldado] = useState(0);
  const [obs, setObs] = useState("");
  const [moneda, setMoneda] = useState<"MXN" | "USD">("MXN");
  const [tipoCambio, setTipoCambio] = useState(tipoCambioDefault || 0);
  const [busy, setBusy] = useState(false);

  const equivalenteMxn = moneda === "USD" && tipoCambio > 0 ? monto * tipoCambio : 0;

  async function traerBanxico() {
    try {
      const r = await api.get("/api/cxp/tipo-cambio");
      setTipoCambio(r.data.valor);
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function guardar() {
    if (!proveedorNombre.trim()) return alert("Captura el proveedor");
    if (monto <= 0) return alert("El monto debe ser mayor a 0");
    if (moneda === "USD" && tipoCambio <= 0) return alert("Captura el tipo de cambio para USD");
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
        moneda,
        tipo_cambio: moneda === "USD" ? tipoCambio : null,
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
        <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label>Folio de factura</label>
            <input className="input" value={folio} onChange={(e) => setFolio(e.target.value)}
              placeholder="A89271" autoFocus />
          </div>
          <div>
            <label>Fecha llegada</label>
            <input className="input" type="date" value={fechaRecep}
              onChange={(e) => setFechaRecep(e.target.value)} />
          </div>
          <div>
            <label>Fecha vence</label>
            <input className="input" type="date" value={fechaVence}
              onChange={(e) => setFechaVence(e.target.value)} />
          </div>
          <div>
            <label>Empresa (proveedor) *</label>
            <input className="input" value={proveedorNombre}
              onChange={(e) => setProveedorNombre(e.target.value)}
              placeholder="USG, Truper, Deacero..." />
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              Si no existe, se crea automáticamente.
            </p>
          </div>
          <div className="form-grid-full">
            <label>Observaciones (Obs)</label>
            <input className="input" value={obs} onChange={(e) => setObs(e.target.value)}
              placeholder="tablaroca, herramienta, pedido obra..." />
          </div>
          <div>
            <label>Moneda</label>
            <select className="input" value={moneda} onChange={(e) => setMoneda(e.target.value as any)}>
              <option value="MXN">MXN (Pesos)</option>
              <option value="USD">USD (Dólares)</option>
            </select>
          </div>
          {moneda === "USD" && (
            <div>
              <label>Tipo de cambio</label>
              <div style={{ display: "flex", gap: 4 }}>
                <input className="input" type="number" step="0.0001" value={tipoCambio}
                  onChange={(e) => setTipoCambio(+e.target.value)}
                  placeholder="17.6922" style={{ flex: 1 }} />
                <button type="button" onClick={traerBanxico}
                  style={{ background: "#1f2937", color: "white", border: 0,
                    padding: "0 10px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
                  🔄 Banxico
                </button>
              </div>
            </div>
          )}
          {moneda === "MXN" && <div></div>}
          <div>
            <label>Monto * {moneda === "USD" && <span style={{ color: "#9ca3af", fontWeight: 400 }}>(USD)</span>}</label>
            <input className="input" type="number" step="0.01" value={monto}
              onChange={(e) => setMonto(+e.target.value)} />
            {moneda === "USD" && equivalenteMxn > 0 && (
              <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                ≈ MXN ${equivalenteMxn.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <div>
            <label>Saldado (ya pagado) {moneda === "USD" && <span style={{ color: "#9ca3af", fontWeight: 400 }}>(USD)</span>}</label>
            <input className="input" type="number" step="0.01" value={saldado}
              onChange={(e) => setSaldado(+e.target.value)} />
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


// === Panel Otros Pagos - tipo Excel, se suma a Facturas por pagar ===
function OtrosPagosPanel({ otros, onChange }: {
  otros: { id: number; concepto: string; monto: number }[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<{ id: number; campo: "concepto" | "monto" } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [draft, setDraft] = useState({ concepto: "", monto: 0 });
  const [agregando, setAgregando] = useState(false);

  const total = otros.reduce((a, o) => a + (o.monto || 0), 0);

  async function guardar(o: { id: number; concepto: string; monto: number }) {
    if (!editing) return;
    const payload: any = {};
    if (editing.campo === "monto") {
      const n = +editValue;
      if (isNaN(n) || n < 0) return alert("Monto inválido");
      payload.monto = n;
    } else {
      payload.concepto = editValue;
    }
    try {
      await api.patch(`/api/cxp/otros-pagos/${o.id}`, payload);
      setEditing(null);
      onChange();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function crear() {
    if (!draft.concepto.trim()) return;
    try {
      await api.post("/api/cxp/otros-pagos", draft);
      setDraft({ concepto: "", monto: 0 });
      setAgregando(false);
      onChange();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function borrar(id: number) {
    if (!confirm("Borrar este otro pago?")) return;
    try {
      await api.delete(`/api/cxp/otros-pagos/${id}`);
      onChange();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  return (
    <div className="card print-area" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <h3 className="card-header" style={{ margin: 0 }}>Otros pagos</h3>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            Renta, sueldos, servicios, etc. Se suma a "Facturas por pagar"
          </span>
        </div>
        <div style={{
          background: "#1f2937", color: "white", padding: "6px 14px", borderRadius: 6,
          fontSize: 14, fontWeight: 700,
        }}>
          TOTAL: ${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
        </div>
      </div>

      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#fef9c3" }}>
            <th style={{ ...thBlack, textAlign: "right", width: "30%" }}>Monto</th>
            <th style={thBlack}>Concepto</th>
            <th className="no-print" style={{ ...thBlack, width: 30 }}></th>
          </tr>
        </thead>
        <tbody>
          {otros.length === 0 && !agregando && (
            <tr>
              <td colSpan={3} style={{ ...td, textAlign: "center", color: "var(--color-text-muted)", padding: 12 }}>
                Sin otros pagos. Click "+ Agregar" para registrar (ej. renta, sueldos, servicios).
              </td>
            </tr>
          )}
          {otros.map((o) => (
            <tr key={o.id}>
              <td style={{ ...td, textAlign: "right", fontWeight: 600, cursor: "pointer" }}
                onDoubleClick={() => { setEditing({ id: o.id, campo: "monto" }); setEditValue(String(o.monto)); }}
                title="Doble click para editar">
                {editing?.id === o.id && editing.campo === "monto" ? (
                  <input autoFocus type="number" step="0.01" value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => guardar(o)}
                    onKeyDown={(e) => { if (e.key === "Enter") guardar(o); if (e.key === "Escape") setEditing(null); }}
                    style={{ width: "100%", padding: 4, fontSize: 12, textAlign: "right" }} />
                ) : `$${o.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
              </td>
              <td style={{ ...td, cursor: "pointer" }}
                onDoubleClick={() => { setEditing({ id: o.id, campo: "concepto" }); setEditValue(o.concepto); }}
                title="Doble click para editar">
                {editing?.id === o.id && editing.campo === "concepto" ? (
                  <input autoFocus value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => guardar(o)}
                    onKeyDown={(e) => { if (e.key === "Enter") guardar(o); if (e.key === "Escape") setEditing(null); }}
                    style={{ width: "100%", padding: 4, fontSize: 12 }} />
                ) : o.concepto}
              </td>
              <td className="no-print" style={td}>
                <button onClick={() => borrar(o.id)}
                  style={{ background: "transparent", border: 0, color: "#dc2626", cursor: "pointer" }}>×</button>
              </td>
            </tr>
          ))}
          {agregando && (
            <tr style={{ background: "#fef9c3" }}>
              <td style={td}>
                <input className="input" type="number" step="0.01" value={draft.monto}
                  onChange={(e) => setDraft({ ...draft, monto: +e.target.value })}
                  placeholder="0.00" style={{ width: "100%", padding: 4, fontSize: 12, textAlign: "right" }} />
              </td>
              <td style={td}>
                <input className="input" value={draft.concepto} autoFocus
                  onChange={(e) => setDraft({ ...draft, concepto: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") crear(); if (e.key === "Escape") { setAgregando(false); setDraft({ concepto: "", monto: 0 }); } }}
                  placeholder="ej. RENTA LOCAL" style={{ width: "100%", padding: 4, fontSize: 12 }} />
              </td>
              <td className="no-print" style={td}>
                <button onClick={crear}
                  style={{ background: "var(--color-primary)", color: "white", border: 0, padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>✓</button>
              </td>
            </tr>
          )}
          <tr className="no-print">
            <td colSpan={3} style={{ padding: 6, textAlign: "center", borderTop: "1px solid #e5e7eb" }}>
              {!agregando && (
                <button onClick={() => setAgregando(true)}
                  style={{ background: "transparent", border: "1px dashed #9ca3af", padding: "4px 14px",
                    borderRadius: 4, cursor: "pointer", fontSize: 12, color: "#6b7280" }}>
                  + Agregar
                </button>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}


// === Panel Deuda Bancaria - lista plana tipo Excel ===
// Aplana todos los conceptos de todas las deudas en una sola tabla.
// Monto editable doble click para registrar abonos parciales.
function DeudaBancariaPanel({ deudas, onChange }: {
  deudas: DeudaBancaria[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [draft, setDraft] = useState({ concepto: "", monto: 0 });
  const [agregando, setAgregando] = useState(false);

  // Aplana todos los conceptos
  const filas = deudas.flatMap((d) =>
    d.conceptos.map((c) => ({ ...c, deuda_id: d.id, deuda_nombre: d.nombre }))
  );
  const totalGlobal = filas.reduce((a, f) => a + (f.monto || 0), 0);

  async function ensureDeudaId(): Promise<number> {
    // Si ya existe alguna deuda, usa la primera como contenedor.
    if (deudas.length > 0) return deudas[0].id;
    const r = await api.post("/api/cxp/deuda-bancaria", {
      nombre: "Deuda bancaria",
      referencia: "",
    });
    return r.data.id;
  }

  async function guardarEdit(c: { id: number; concepto: string; monto: number }) {
    if (!editing) return;
    const payload: any = {};
    if (editing.field === "concepto") payload.concepto = editValue;
    if (editing.field === "monto") {
      const n = +editValue;
      if (isNaN(n) || n < 0) return alert("Monto inválido");
      payload.monto = n;
    }
    try {
      await api.patch(`/api/cxp/deuda-bancaria/conceptos/${c.id}`, payload);
      setEditing(null);
      onChange();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function crearConcepto() {
    if (!draft.concepto.trim()) return;
    try {
      const deudaId = await ensureDeudaId();
      await api.post(`/api/cxp/deuda-bancaria/${deudaId}/conceptos`, draft);
      setDraft({ concepto: "", monto: 0 });
      setAgregando(false);
      onChange();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function borrarConcepto(id: number) {
    if (!confirm("Borrar este concepto?")) return;
    await api.delete(`/api/cxp/deuda-bancaria/conceptos/${id}`);
    onChange();
  }

  return (
    <div className="card print-area">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 className="card-header" style={{ margin: 0 }}>Deuda bancaria</h3>
        <div style={{
          background: "#1f2937", color: "white", padding: "6px 14px", borderRadius: 6,
          fontSize: 14, fontWeight: 700,
        }}>
          TOTAL: ${totalGlobal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
        </div>
      </div>

      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#fef9c3" }}>
            <th style={{ ...thBlack, textAlign: "right", width: "30%" }}>Monto</th>
            <th style={thBlack}>Concepto</th>
            <th className="no-print" style={{ ...thBlack, width: 30 }}></th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && !agregando && (
            <tr>
              <td colSpan={3} style={{ ...td, textAlign: "center", color: "var(--color-text-muted)", padding: 12 }}>
                Sin deuda bancaria. Click "+ Agregar" para registrar (ej. PAGO 5 CHINA, FLETE, BANORTE).
              </td>
            </tr>
          )}
          {filas.map((c) => (
            <tr key={c.id}>
              <td style={{ ...td, textAlign: "right", fontWeight: 600, cursor: "pointer" }}
                onDoubleClick={() => { setEditing({ id: c.id, field: "monto" }); setEditValue(String(c.monto)); }}
                title="Doble click para editar (registrar abono)">
                {editing?.id === c.id && editing.field === "monto" ? (
                  <input autoFocus type="number" step="0.01" value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => guardarEdit(c)}
                    onKeyDown={(e) => { if (e.key === "Enter") guardarEdit(c); if (e.key === "Escape") setEditing(null); }}
                    style={{ width: "100%", padding: 4, fontSize: 12, textAlign: "right" }} />
                ) : `$${c.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
              </td>
              <td style={{ ...td, cursor: "pointer" }}
                onDoubleClick={() => { setEditing({ id: c.id, field: "concepto" }); setEditValue(c.concepto); }}
                title="Doble click para editar">
                {editing?.id === c.id && editing.field === "concepto" ? (
                  <input autoFocus value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => guardarEdit(c)}
                    onKeyDown={(e) => { if (e.key === "Enter") guardarEdit(c); if (e.key === "Escape") setEditing(null); }}
                    style={{ width: "100%", padding: 4, fontSize: 12 }} />
                ) : c.concepto}
              </td>
              <td className="no-print" style={td}>
                <button onClick={() => borrarConcepto(c.id)}
                  style={{ background: "transparent", border: 0, color: "#dc2626", cursor: "pointer" }}>×</button>
              </td>
            </tr>
          ))}
          {agregando && (
            <tr style={{ background: "#fef9c3" }}>
              <td style={td}>
                <input className="input" type="number" step="0.01" value={draft.monto}
                  onChange={(e) => setDraft({ ...draft, monto: +e.target.value })}
                  placeholder="0.00" style={{ width: "100%", padding: 4, fontSize: 12, textAlign: "right" }} />
              </td>
              <td style={td}>
                <input className="input" value={draft.concepto} autoFocus
                  onChange={(e) => setDraft({ ...draft, concepto: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") crearConcepto(); if (e.key === "Escape") { setAgregando(false); setDraft({ concepto: "", monto: 0 }); } }}
                  placeholder="ej. PAGO 5 CHINA tabla" style={{ width: "100%", padding: 4, fontSize: 12 }} />
              </td>
              <td className="no-print" style={td}>
                <button onClick={crearConcepto}
                  style={{ background: "var(--color-primary)", color: "white", border: 0, padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>✓</button>
              </td>
            </tr>
          )}
          <tr className="no-print">
            <td colSpan={3} style={{ padding: 6, textAlign: "center", borderTop: "1px solid #e5e7eb" }}>
              {!agregando && (
                <button onClick={() => setAgregando(true)}
                  style={{ background: "transparent", border: "1px dashed #9ca3af", padding: "4px 14px",
                    borderRadius: 4, cursor: "pointer", fontSize: 12, color: "#6b7280" }}>
                  + Agregar
                </button>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
