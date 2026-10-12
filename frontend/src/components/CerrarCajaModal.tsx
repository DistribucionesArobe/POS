import { useEffect, useState } from "react";
import { api } from "../api/client";

const fmt = (n: number) => "$" + (n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function imprimirRecibo() {
  const el = document.getElementById("recibo-corte-print");
  if (!el) { window.print(); return; }
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) { window.print(); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>Corte de caja</title>
    <style>
      body { font-family: 'Courier New', monospace; font-size: 12px; padding: 12px; color: #000; }
      h1,h2,h3 { margin: 4px 0; }
      .row { display: flex; justify-content: space-between; margin: 2px 0; }
      .sep { border-top: 1px dashed #000; margin: 8px 0; }
      .total { font-weight: bold; font-size: 14px; }
      .center { text-align: center; }
      table { width: 100%; font-size: 11px; border-collapse: collapse; }
      td { padding: 2px 0; }
    </style>
  </head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 300);
}

function ReciboCorte({ cerrado, preview }: { cerrado: any; preview: any }) {
  const ahora = new Date();
  const horaCierre = ahora.toLocaleString("es-MX", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const estacion = (() => {
    const uid = localStorage.getItem("usuario_id") || "";
    return uid.padStart(2, "0");
  })();
  const empresaNombre = (() => {
    try { return JSON.parse(localStorage.getItem("empresa_activa") || "{}").nombre || ""; }
    catch { return ""; }
  })();
  const row = (l: string, r: string, bold?: boolean) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? 700 : 400 }}>
      <span>{l}</span><span>{r}</span>
    </div>
  );
  const vt = preview?.ventas_por_tasa || {};
  const totalEgresos = 0;
  const totalIngresos = cerrado.efectivo_real;
  const totalEnCaja = totalIngresos - totalEgresos;

  return (
    <div style={{ color: "#000", fontFamily: "'Courier New', monospace", fontSize: 12 }}>
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>*** CORTE Z EN MONEDA: MXN ***</div>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{empresaNombre.toUpperCase()}</div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ textAlign: "center", fontSize: 11 }}>
          *** Corte Z {cerrado.numero_z || cerrado.id} ***
        </div>
        <div style={{ fontSize: 11 }}>ESTACION{estacion} {horaCierre}</div>
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>** Ingresos **</div>
        {Object.entries(preview?.cobros_contado_por_forma || {}).map(([k, v]: [string, any]) => (
          <div key={"i"+k}>{row(`${v.label} Pago de clientes`, fmt(v.monto))}</div>
        ))}
        {Object.entries(preview?.cobros_credito_por_forma || {}).map(([k, v]: [string, any]) => (
          <div key={"c"+k}>{row(`${v.label} Cobranza credito`, fmt(v.monto))}</div>
        ))}
        <div style={{ marginTop: 4 }}>
          {row("Total de Ingresos:", fmt(preview?.total_entrada_dinero || cerrado.total_vendido), true)}
        </div>
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>** Egresos **</div>
        {row("Total de Egresos:", fmt(totalEgresos), true)}
      </div>
      <div style={{ borderTop: "1px dashed #000", padding: "4px 0", marginBottom: 6 }}>
        {row("Total en caja:", fmt(totalEnCaja), true)}
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ textAlign: "center", fontWeight: 700 }}>********* VENTAS DEL CORTE *********</div>
        {row("Ventas 16%", fmt(vt["16"]?.subtotal || 0))}
        {row("Impuesto 16%", fmt(vt["16"]?.impuesto || 0))}
        {row("Ventas 10%", fmt(vt["10"]?.subtotal || 0))}
        {row("Impuesto 10%", fmt(vt["10"]?.impuesto || 0))}
        <div style={{ marginTop: 4 }}>
          {row("Ventas gravadas", fmt((vt["16"]?.subtotal || 0) + (vt["10"]?.subtotal || 0)))}
          {row("Impuesto", fmt((vt["16"]?.impuesto || 0) + (vt["10"]?.impuesto || 0)))}
          {row("Ventas no gravadas:", fmt(vt.exentas || 0))}
        </div>
        <div style={{ borderTop: "1px dashed #000", marginTop: 4, paddingTop: 4 }}>
          {row("Redondeos", fmt(0))}
          {row("Total de ventas:", fmt(cerrado.total_vendido), true)}
          {row("Ventas credito:", fmt(preview?.ventas_credito_total || 0))}
        </div>
      </div>
      <div style={{ borderTop: "1px dashed #000", paddingTop: 6, marginBottom: 6 }}>
        {row("Efectivo esperado:", fmt(cerrado.efectivo_esperado))}
        {row("Efectivo contado:", fmt(cerrado.efectivo_real))}
        <div style={{ borderTop: "1px solid #000", marginTop: 4, paddingTop: 4, fontSize: 13, fontWeight: 800 }}>
          {row("DIFERENCIA", (cerrado.diferencia >= 0 ? "+" : "") + fmt(cerrado.diferencia))}
        </div>
      </div>
      <div style={{ marginTop: 24, textAlign: "center", fontSize: 10 }}>
        <div style={{ borderTop: "1px solid #000", margin: "40px 20px 4px" }}></div>
        FIRMA DEL CAJERO
      </div>
    </div>
  );
}

export default function CerrarCajaModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<any>(null);
  const [efectivoReal, setEfectivoReal] = useState<string>("");
  const [notas, setNotas] = useState<string>("");
  const [cerrando, setCerrando] = useState(false);
  const [cerrado, setCerrado] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/api/reportes/corte/preview");
        setPreview(r.data);
      } catch (err: any) {
        setError("No se pudo cargar el corte: " + (err.response?.data?.detail || err.message));
      } finally { setLoading(false); }
    })();
  }, []);

  async function confirmar() {
    if (!preview) return;
    const real = parseFloat(efectivoReal) || 0;
    setCerrando(true); setError(null);
    try {
      const r = await api.post("/api/reportes/corte/cerrar", {
        efectivo_real: real,
        notas: notas.trim() || null,
      });
      setCerrado({ ...r.data, efectivo_real: real, efectivo_esperado: preview.efectivo_esperado });
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally { setCerrando(false); }
  }

  const efReal = parseFloat(efectivoReal) || 0;
  const efEsperado = preview?.efectivo_esperado || 0;
  const diferencia = efReal - efEsperado;
  const efectivoPuesto = efectivoReal.trim() !== "";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 12,
    }}>
      <div style={{
        background: "white", borderRadius: 14, padding: 24,
        width: "100%", maxWidth: 560, maxHeight: "94vh", overflow: "auto", color: "#0f172a",
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", fontSize: 18, color: "#64748b" }}>
            Cargando corte...
          </div>
        ) : cerrado ? (
          <>
            <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
              <div style={{ fontSize: 64, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#059669" }}>Caja cerrada</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                Corte Z #{cerrado.numero_z || cerrado.id} guardado
              </div>
            </div>
            <div id="recibo-corte-print">
              <ReciboCorte cerrado={cerrado} preview={preview} />
            </div>
            {cerrado.tickets_pendientes_fg > 0 && (
              <div style={{ background: "#fef3c7", border: "1px solid #f59e0b",
                padding: 12, borderRadius: 8, marginTop: 14, textAlign: "center",
                color: "#78350f" }}>
                <strong>⚠ Hay {cerrado.tickets_pendientes_fg} tickets sin factura global.</strong>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Puedes emitirla ahora o despues desde el menu Factura Global.
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={() => imprimirRecibo()} style={{
                flex: 1, minWidth: 140, background: "#1e40af", color: "white",
                border: 0, padding: 14, borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}>🖨 Imprimir Z</button>
              {cerrado.tickets_pendientes_fg > 0 && (
                <button onClick={() => { window.location.href = "/factura-global"; }} style={{
                  flex: 1, minWidth: 140, background: "#059669", color: "white",
                  border: 0, padding: 14, borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer",
                }}>📄 Factura Global ({cerrado.tickets_pendientes_fg})</button>
              )}
              <button onClick={onClose} style={{
                flex: 1, minWidth: 100, background: "#0f172a", color: "white",
                border: 0, padding: 14, borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}>Listo</button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>🔒 Cerrar caja (Corte Z)</h2>
            <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 14 }}>
              Cuenta el efectivo de la caja y escribe cuánto tienes.
            </p>
            {preview.por_tipo_documento && (
              <div style={{ background: "#f8fafc", padding: 14, borderRadius: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>
                  Documentos del día
                </div>
                {([
                  ["tickets", "🎫 Tickets", "#334155"],
                  ["facturas_contado", "🧾 Facturas contado", "#059669"],
                  ["facturas_credito", "💳 Facturas crédito", "#f59e0b"],
                  ["complementos_pago", "✅ Complementos pago", "#1e40af"],
                ] as const).map(([k, label, color]) => {
                  const d = preview.por_tipo_documento[k];
                  if (!d || !d.n) return null;
                  return (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span style={{ color }}>{label}:</span>
                      <span><strong>{d.n}</strong> · {fmt(d.total)}</span>
                    </div>
                  );
                })}
                <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 8, paddingTop: 8,
                  display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <strong>Total venta del día:</strong>
                  <strong>{fmt(preview.total_vendido)}</strong>
                </div>
              </div>
            )}
            <div style={{
              background: "#dbeafe", padding: 14, borderRadius: 8, marginBottom: 14,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Efectivo esperado:</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: "#1e40af" }}>
                {fmt(preview.efectivo_esperado)}
              </span>
            </div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
              ¿Cuánto efectivo contaste?
            </label>
            <input type="number" inputMode="decimal" autoFocus
              value={efectivoReal}
              onChange={(e) => setEfectivoReal(e.target.value)}
              placeholder="0.00"
              style={{
                width: "100%", padding: "14px 16px", fontSize: 28, fontWeight: 700,
                border: "2px solid #cbd5e1", borderRadius: 8, textAlign: "right",
                marginBottom: 12,
              }} />
            {efectivoPuesto && (
              <div style={{
                padding: 14, borderRadius: 8, marginBottom: 14, textAlign: "center",
                background: Math.abs(diferencia) < 0.01 ? "#dcfce7"
                  : diferencia > 0 ? "#fef3c7" : "#fee2e2",
                border: `1px solid ${Math.abs(diferencia) < 0.01 ? "#86efac"
                  : diferencia > 0 ? "#fcd34d" : "#fca5a5"}`,
              }}>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>
                  {Math.abs(diferencia) < 0.01 ? "Cuadra exacto"
                    : diferencia > 0 ? "Sobra en caja" : "Falta en caja"}
                </div>
                <div style={{ fontSize: 30, fontWeight: 800 }}>
                  {diferencia >= 0 ? "+" : ""}{fmt(diferencia)}
                </div>
              </div>
            )}
            <label style={{ display: "block", fontSize: 13, color: "#64748b", marginBottom: 6 }}>
              Notas (opcional)
            </label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)}
              placeholder="Propinas, retiros, etc."
              style={{ width: "100%", padding: "10px 12px", fontSize: 14,
                border: "1px solid #cbd5e1", borderRadius: 6, marginBottom: 16 }} />
            {error && (
              <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10,
                borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{error}</div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} disabled={cerrando}
                style={{
                  flex: 1, background: "#e2e8f0", color: "#0f172a", border: 0,
                  padding: 16, borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: "pointer",
                }}>Cancelar</button>
              <button onClick={confirmar} disabled={cerrando || !efectivoPuesto}
                style={{
                  flex: 2, background: cerrando || !efectivoPuesto ? "#94a3b8" : "#059669",
                  color: "white", border: 0, padding: 16, borderRadius: 8,
                  fontSize: 18, fontWeight: 700,
                  cursor: cerrando || !efectivoPuesto ? "not-allowed" : "pointer",
                }}>{cerrando ? "Cerrando..." : "🔒 Cerrar Corte Z"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
