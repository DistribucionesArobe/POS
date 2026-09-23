import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Renglon = {
  id?: number; orden: number; descripcion: string;
  piezas: number; precio_unit_mercancia: number; kg_pieza: number;
  variante_id: number | null; margen_sugerido_pct: number;
};
type Gasto = {
  id?: number; orden: number; concepto: string; categoria: string | null;
  monto: number; moneda: string; causa_iva: boolean; tasa_iva: number;
  reembolsable: boolean; notas: string | null;
};
type Imp = {
  id: number; folio: string; proveedor: string | null;
  agente_aduanal: string | null; referencia_pedimento: string | null;
  contenedor: string | null; puerto_llegada: string | null;
  fecha: string | null; fecha_arribo: string | null;
  moneda_mercancia: string; tipo_cambio: number;
  estatus: string; notas: string | null;
  renglones_raw: Renglon[]; gastos_raw: Gasto[];
  calculo: any;
};

const fmt = (n: number) => "$" + (n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

const CATEGORIAS = ["flete", "seguro", "impuesto", "agente", "maniobra", "otro"];
const ESTATUS = ["borrador", "en_transito", "recibida", "cerrada", "cancelada"];

export default function ImportacionEditar() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [imp, setImp] = useState<Imp | null>(null);
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aplicandoCatalogo, setAplicandoCatalogo] = useState(false);
  const [renglonesSel, setRenglonesSel] = useState<Set<number>>(new Set());
  const [sumarStock, setSumarStock] = useState(true);

  async function cargar() {
    setError(null);
    try {
      const r = await api.get(`/api/importaciones/${id}`);
      setImp(r.data);
      setRenglones(r.data.renglones_raw || []);
      setGastos(r.data.gastos_raw || []);
      // Si es primera vez y no hay gastos, sembrar los default
      if ((r.data.gastos_raw || []).length === 0) {
        const g = await api.get("/api/importaciones/gastos-default");
        setGastos(g.data.map((d: any, i: number) => ({
          orden: (i + 1) * 10, concepto: d.concepto, categoria: d.categoria,
          monto: d.monto_referencia, moneda: d.moneda,
          causa_iva: d.causa_iva, tasa_iva: 0.16, reembolsable: d.reembolsable,
          notas: null,
        })));
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    }
  }

  useEffect(() => { cargar(); }, [id]);

  // Calculo local en vivo (misma logica del backend, para preview inmediato)
  const calc = useMemo(() => {
    const tc = num(imp?.tipo_cambio);
    let totalMercanciaMxn = 0;
    const rc = renglones.map((r) => {
      const monto_moneda = num(r.piezas) * num(r.precio_unit_mercancia);
      const monto_mxn = monto_moneda * tc;
      totalMercanciaMxn += monto_mxn;
      return { ...r, monto_moneda, monto_mxn };
    });
    let totalGastosProrr = 0;
    let totalReembolsables = 0;
    for (const g of gastos) {
      const iva = g.causa_iva ? num(g.monto) * num(g.tasa_iva) : 0;
      const subtotal = num(g.monto) + iva;
      if (g.reembolsable) totalReembolsables += subtotal;
      else totalGastosProrr += subtotal;
    }
    const rcFull = rc.map((r) => {
      const pct = totalMercanciaMxn > 0 ? r.monto_mxn / totalMercanciaMxn : 0;
      const gastos_prorr = pct * totalGastosProrr;
      const costo_total = r.monto_mxn + gastos_prorr;
      const costo_unit = num(r.piezas) > 0 ? costo_total / num(r.piezas) : 0;
      const pv = costo_unit * num(r.margen_sugerido_pct);
      const ingreso = pv * num(r.piezas);
      return { ...r, pct_mercancia: pct * 100, gastos_prorrateados: gastos_prorr,
        costo_total_mxn: costo_total, costo_unit_final_mxn: costo_unit,
        precio_venta_sugerido_mxn: pv, ingreso_sugerido_mxn: ingreso };
    });
    const inversion = totalMercanciaMxn + totalGastosProrr + totalReembolsables;
    const ingresos = rcFull.reduce((s, r) => s + r.ingreso_sugerido_mxn, 0);
    const utilidad = ingresos - (totalMercanciaMxn + totalGastosProrr);
    return {
      total_mercancia_mxn: totalMercanciaMxn,
      total_gastos_prorrateables: totalGastosProrr,
      total_gastos_reembolsables: totalReembolsables,
      inversion_total_mxn: inversion,
      ingresos_sugeridos_mxn: ingresos,
      utilidad_sugerida_mxn: utilidad,
      margen_utilidad_pct: ingresos > 0 ? (utilidad / ingresos * 100) : 0,
      pct_gastos_sobre_mercancia: totalMercanciaMxn > 0 ? (totalGastosProrr / totalMercanciaMxn * 100) : 0,
      renglones: rcFull,
    };
  }, [renglones, gastos, imp?.tipo_cambio]);

  function updateImp(patch: Partial<Imp>) {
    if (!imp) return;
    setImp({ ...imp, ...patch });
  }

  function addRenglon() {
    setRenglones([...renglones, {
      orden: renglones.length * 10, descripcion: "", piezas: 1,
      precio_unit_mercancia: 0, kg_pieza: 0, variante_id: null, margen_sugerido_pct: 2.5,
    }]);
  }
  function updateRenglon(i: number, patch: Partial<Renglon>) {
    const r = [...renglones]; r[i] = { ...r[i], ...patch }; setRenglones(r);
  }
  function delRenglon(i: number) {
    if (!confirm("Eliminar este renglon?")) return;
    setRenglones(renglones.filter((_, k) => k !== i));
  }

  function addGasto() {
    setGastos([...gastos, {
      orden: gastos.length * 10, concepto: "", categoria: "otro",
      monto: 0, moneda: "MXN", causa_iva: false, tasa_iva: 0.16,
      reembolsable: false, notas: null,
    }]);
  }
  function updateGasto(i: number, patch: Partial<Gasto>) {
    const g = [...gastos]; g[i] = { ...g[i], ...patch }; setGastos(g);
  }
  function delGasto(i: number) {
    setGastos(gastos.filter((_, k) => k !== i));
  }

  async function guardar() {
    if (!imp) return;
    setBusy(true); setError(null); setMsg(null);
    try {
      await api.put(`/api/importaciones/${id}`, {
        folio: imp.folio, proveedor: imp.proveedor, agente_aduanal: imp.agente_aduanal,
        referencia_pedimento: imp.referencia_pedimento, contenedor: imp.contenedor,
        puerto_llegada: imp.puerto_llegada, fecha: imp.fecha, fecha_arribo: imp.fecha_arribo,
        moneda_mercancia: imp.moneda_mercancia, tipo_cambio: imp.tipo_cambio,
        estatus: imp.estatus, notas: imp.notas,
        renglones, gastos,
      });
      setMsg("Guardado");
      setTimeout(() => setMsg(null), 2000);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function eliminar() {
    if (!confirm("Eliminar esta importacion completa? Se borran todos los renglones y gastos.")) return;
    try {
      await api.delete(`/api/importaciones/${id}`);
      nav("/importaciones");
    } catch (e: any) {
      alert("Error: " + (e.response?.data?.detail || e.message));
    }
  }

  async function aplicarAlCatalogo() {
    const ids = Array.from(renglonesSel);
    if (ids.length === 0) return alert("Selecciona al menos un renglon");
    if (!confirm(`Aplicar costo unitario a ${ids.length} variante(s) del catalogo?${sumarStock ? " Se sumaran las piezas al stock." : ""}`)) return;
    setAplicandoCatalogo(true);
    try {
      const r = await api.post(`/api/importaciones/${id}/aplicar-al-catalogo`,
        { renglon_ids: ids, sumar_stock: sumarStock });
      alert(`Aplicados: ${r.data.aplicados.length}\nSaltados: ${r.data.saltados.length}\n${
        r.data.saltados.map((s: any) => `- ${s.razon}`).join("\n")}`);
      setRenglonesSel(new Set());
      cargar();
    } catch (e: any) {
      alert("Error: " + (e.response?.data?.detail || e.message));
    } finally {
      setAplicandoCatalogo(false);
    }
  }

  if (!imp) return <Layout title="Cargando..."><div style={{ padding: 40 }}>{error || "Cargando..."}</div></Layout>;

  return (
    <Layout title={`Importacion ${imp.folio}`}
      subtitle={imp.proveedor || "Sin proveedor"}
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={eliminar} className="btn-icon"
            style={{ background: "#fee2e2", color: "#991b1b", border: 0 }}>
            Eliminar
          </button>
          <button onClick={guardar} disabled={busy}
            style={{ background: busy ? "#94a3b8" : "#059669", color: "white",
              border: 0, padding: "10px 20px", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {busy ? "Guardando..." : msg ? "✓ " + msg : "💾 Guardar"}
          </button>
        </div>
      }>
      {error && <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 6, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14, alignItems: "start" }}>
        {/* IZQUIERDA - Datos + Mercancia + Gastos */}
        <div>
          {/* Encabezado */}
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Datos del pedido</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: "#64748b" }}>Folio</label>
                <input className="input" value={imp.folio} onChange={(e) => updateImp({ folio: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b" }}>Estatus</label>
                <select className="input" value={imp.estatus} onChange={(e) => updateImp({ estatus: e.target.value })}>
                  {ESTATUS.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b" }}>Moneda mercancia</label>
                <select className="input" value={imp.moneda_mercancia}
                  onChange={(e) => updateImp({ moneda_mercancia: e.target.value })}>
                  <option value="USD">USD</option><option value="EUR">EUR</option>
                  <option value="CNY">CNY</option><option value="MXN">MXN</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b" }}>Tipo de cambio a MXN</label>
                <input className="input" type="number" step="0.01" value={imp.tipo_cambio}
                  onChange={(e) => updateImp({ tipo_cambio: +e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b" }}>Proveedor</label>
                <input className="input" value={imp.proveedor || ""}
                  onChange={(e) => updateImp({ proveedor: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b" }}>Agente aduanal</label>
                <input className="input" value={imp.agente_aduanal || ""}
                  onChange={(e) => updateImp({ agente_aduanal: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b" }}>Contenedor</label>
                <input className="input" value={imp.contenedor || ""}
                  onChange={(e) => updateImp({ contenedor: e.target.value })}
                  placeholder="1x40 HC" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b" }}>Puerto llegada</label>
                <input className="input" value={imp.puerto_llegada || ""}
                  onChange={(e) => updateImp({ puerto_llegada: e.target.value })}
                  placeholder="Manzanillo" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b" }}>Referencia pedimento</label>
                <input className="input" value={imp.referencia_pedimento || ""}
                  onChange={(e) => updateImp({ referencia_pedimento: e.target.value })} />
              </div>
              <div style={{ gridColumn: "span 3" }}>
                <label style={{ fontSize: 12, color: "#64748b" }}>Notas</label>
                <input className="input" value={imp.notas || ""}
                  onChange={(e) => updateImp({ notas: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Mercancia */}
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Mercancia ({renglones.length})</h3>
              <button onClick={addRenglon} className="btn-icon">+ Agregar renglon</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                    <th style={{ padding: 4, width: 28 }}></th>
                    <th style={{ padding: 4 }}>Descripcion</th>
                    <th style={{ padding: 4, textAlign: "right", width: 70 }}>Piezas</th>
                    <th style={{ padding: 4, textAlign: "right", width: 90 }}>P.Unit {imp.moneda_mercancia}</th>
                    <th style={{ padding: 4, textAlign: "right", width: 70 }}>Kg/pza</th>
                    <th style={{ padding: 4, textAlign: "right", width: 100 }}>Monto MXN</th>
                    <th style={{ padding: 4, textAlign: "right", width: 100 }}>Costo unit</th>
                    <th style={{ padding: 4, textAlign: "right", width: 70 }}>Markup</th>
                    <th style={{ padding: 4, textAlign: "right", width: 100 }}>P.Venta</th>
                    <th style={{ padding: 4, width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {renglones.map((r, i) => {
                    const c = calc.renglones[i];
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: 2 }}>
                          {r.id && (
                            <input type="checkbox" checked={renglonesSel.has(r.id)}
                              onChange={(e) => {
                                const s = new Set(renglonesSel);
                                if (e.target.checked) s.add(r.id!); else s.delete(r.id!);
                                setRenglonesSel(s);
                              }} />
                          )}
                        </td>
                        <td style={{ padding: 2 }}>
                          <input value={r.descripcion} placeholder="Nombre"
                            onChange={(e) => updateRenglon(i, { descripcion: e.target.value })}
                            style={cellInput} />
                        </td>
                        <td style={{ padding: 2 }}>
                          <input type="number" value={r.piezas} step="1"
                            onChange={(e) => updateRenglon(i, { piezas: +e.target.value })}
                            style={cellInputNum} />
                        </td>
                        <td style={{ padding: 2 }}>
                          <input type="number" value={r.precio_unit_mercancia} step="0.01"
                            onChange={(e) => updateRenglon(i, { precio_unit_mercancia: +e.target.value })}
                            style={cellInputNum} />
                        </td>
                        <td style={{ padding: 2 }}>
                          <input type="number" value={r.kg_pieza} step="0.01"
                            onChange={(e) => updateRenglon(i, { kg_pieza: +e.target.value })}
                            style={cellInputNum} />
                        </td>
                        <td style={{ padding: 4, textAlign: "right", fontVariantNumeric: "tabular-nums", background: "#f8fafc" }}>
                          {fmt(c?.monto_mxn || 0)}
                        </td>
                        <td style={{ padding: 4, textAlign: "right", fontVariantNumeric: "tabular-nums", background: "#dbeafe", fontWeight: 700 }}>
                          {fmt(c?.costo_unit_final_mxn || 0)}
                        </td>
                        <td style={{ padding: 2 }}>
                          <input type="number" value={r.margen_sugerido_pct} step="0.1"
                            onChange={(e) => updateRenglon(i, { margen_sugerido_pct: +e.target.value })}
                            style={cellInputNum} />
                        </td>
                        <td style={{ padding: 4, textAlign: "right", fontVariantNumeric: "tabular-nums", background: "#dcfce7", fontWeight: 700, color: "#065f46" }}>
                          {fmt(c?.precio_venta_sugerido_mxn || 0)}
                        </td>
                        <td style={{ padding: 2 }}>
                          <button onClick={() => delRenglon(i)}
                            style={{ background: "transparent", border: 0, color: "#dc2626", cursor: "pointer", fontSize: 16 }}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {renglones.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                Sin renglones. Toca "+ Agregar renglon" para empezar.
              </div>
            )}
            {renglonesSel.size > 0 && (
              <div style={{ marginTop: 10, padding: 10, background: "#fef3c7", borderRadius: 6, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{renglonesSel.size} renglon(es) seleccionado(s)</strong>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                  <input type="checkbox" checked={sumarStock} onChange={(e) => setSumarStock(e.target.checked)} />
                  Sumar piezas al stock actual
                </label>
                <button onClick={aplicarAlCatalogo} disabled={aplicandoCatalogo}
                  style={{ background: "#059669", color: "white", border: 0, padding: "6px 14px", borderRadius: 4, fontWeight: 700, cursor: "pointer" }}>
                  {aplicandoCatalogo ? "Aplicando..." : "→ Aplicar al catalogo"}
                </button>
              </div>
            )}
          </div>

          {/* Gastos */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Gastos ({gastos.length})</h3>
              <button onClick={addGasto} className="btn-icon">+ Agregar gasto</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                    <th style={{ padding: 4 }}>Concepto</th>
                    <th style={{ padding: 4, width: 90 }}>Categoria</th>
                    <th style={{ padding: 4, textAlign: "right", width: 110 }}>Monto</th>
                    <th style={{ padding: 4, textAlign: "center", width: 60 }}>IVA?</th>
                    <th style={{ padding: 4, textAlign: "center", width: 90 }}>Reembolsable</th>
                    <th style={{ padding: 4, textAlign: "right", width: 100 }}>Total con IVA</th>
                    <th style={{ padding: 4, width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {gastos.map((g, i) => {
                    const iva = g.causa_iva ? num(g.monto) * num(g.tasa_iva) : 0;
                    const total = num(g.monto) + iva;
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9",
                        background: g.reembolsable ? "#fef3c7" : undefined }}>
                        <td style={{ padding: 2 }}>
                          <input value={g.concepto}
                            onChange={(e) => updateGasto(i, { concepto: e.target.value })}
                            style={cellInput} />
                        </td>
                        <td style={{ padding: 2 }}>
                          <select value={g.categoria || "otro"}
                            onChange={(e) => updateGasto(i, { categoria: e.target.value })}
                            style={cellInput}>
                            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: 2 }}>
                          <input type="number" value={g.monto} step="0.01"
                            onChange={(e) => updateGasto(i, { monto: +e.target.value })}
                            style={cellInputNum} />
                        </td>
                        <td style={{ padding: 2, textAlign: "center" }}>
                          <input type="checkbox" checked={g.causa_iva}
                            onChange={(e) => updateGasto(i, { causa_iva: e.target.checked })} />
                        </td>
                        <td style={{ padding: 2, textAlign: "center" }}>
                          <input type="checkbox" checked={g.reembolsable}
                            onChange={(e) => updateGasto(i, { reembolsable: e.target.checked })} />
                        </td>
                        <td style={{ padding: 4, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {fmt(total)}
                        </td>
                        <td style={{ padding: 2 }}>
                          <button onClick={() => delGasto(i)}
                            style={{ background: "transparent", border: 0, color: "#dc2626", cursor: "pointer", fontSize: 16 }}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* DERECHA - Panel de calculos */}
        <div style={{ position: "sticky", top: 12 }}>
          <div className="card" style={{ padding: 16, background: "#0f172a", color: "white" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>
              Resumen del contenedor
            </h3>
            <ResumenLinea label="Mercancia MXN" valor={fmt(calc.total_mercancia_mxn)} />
            <ResumenLinea label="Gastos prorrateables" valor={fmt(calc.total_gastos_prorrateables)} />
            <ResumenLinea label="Gastos reembolsables" valor={fmt(calc.total_gastos_reembolsables)} small />
            <div style={{ borderTop: "1px solid #334155", margin: "10px 0" }} />
            <ResumenLinea label="Inversion total" valor={fmt(calc.inversion_total_mxn)} big />
            <ResumenLinea label="% gastos vs mercancia" valor={calc.pct_gastos_sobre_mercancia.toFixed(1) + "%"} small />
            <div style={{ borderTop: "1px solid #334155", margin: "10px 0" }} />
            <ResumenLinea label="Ingresos sugeridos" valor={fmt(calc.ingresos_sugeridos_mxn)} />
            <ResumenLinea label="Utilidad estimada" valor={fmt(calc.utilidad_sugerida_mxn)}
              color={calc.utilidad_sugerida_mxn > 0 ? "#4ade80" : "#f87171"} big />
            <ResumenLinea label="Margen %" valor={calc.margen_utilidad_pct.toFixed(1) + "%"}
              color={calc.margen_utilidad_pct > 20 ? "#4ade80" : "#f87171"} />
          </div>

          <div style={{ marginTop: 10, padding: 12, background: "#dbeafe", borderRadius: 6, fontSize: 12, color: "#1e40af" }}>
            <strong>Tip:</strong> Marca ✓ los renglones con variante ligada y toca "Aplicar al catalogo"
            para actualizar el costo real de tus productos en el POS. Puedes sumar el stock nuevo al inventario.
          </div>
        </div>
      </div>
    </Layout>
  );
}

function ResumenLinea({ label, valor, big, small, color }: {
  label: string; valor: string; big?: boolean; small?: boolean; color?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
      marginBottom: small ? 4 : 8, fontSize: small ? 11 : 13 }}>
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <strong style={{ fontSize: big ? 20 : (small ? 11 : 14), color: color || "white",
        fontVariantNumeric: "tabular-nums" }}>{valor}</strong>
    </div>
  );
}

const cellInput = {
  width: "100%", padding: "4px 6px", fontSize: 12,
  border: "1px solid transparent", borderRadius: 3, background: "transparent",
} as const;
const cellInputNum = {
  ...cellInput, textAlign: "right", fontVariantNumeric: "tabular-nums",
} as const;
