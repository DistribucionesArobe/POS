import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

const fmt = (n: number) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Factura = {
  fecha: string; serie: string; referencia: string; folio_interno: string;
  cliente: string; rfc: string; total: number; estado: string; metodo: string;
};

type Grupo = {
  forma_pago: string; label: string; n: number;
  subtotal: number; facturas: Factura[];
};

type ReporteData = {
  desde: string; hasta: string;
  grupos: Grupo[];
  n_total: number;
  total_general: number;
};

function fechaHoyISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function ReporteDiario() {
  const [desde, setDesde] = useState(fechaHoyISO());
  const [hasta, setHasta] = useState(fechaHoyISO());
  const [incluirTickets, setIncluirTickets] = useState(false);
  const [data, setData] = useState<ReporteData | null>(null);
  const [busy, setBusy] = useState(false);
  const [empresa, setEmpresa] = useState<string>("");

  useEffect(() => {
    try {
      const ea = localStorage.getItem("empresa_activa");
      if (ea) setEmpresa(JSON.parse(ea).nombre || "");
    } catch {}
    generar();
  }, []);

  async function generar() {
    setBusy(true);
    try {
      const r = await api.get("/api/reportes/diario", {
        params: { desde, hasta, incluir_tickets: incluirTickets },
      });
      setData(r.data);
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(false);
    }
  }

  async function descargarXlsx() {
    const r = await api.get("/api/reportes/diario-xlsx", {
      params: { desde, hasta, incluir_tickets: incluirTickets }, responseType: "blob",
    });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_facturas_${desde}_${hasta}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function imprimir() { window.print(); }

  return (
    <Layout title="Reporte diario de facturas"
      subtitle="Facturas agrupadas por forma de pago"
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-icon" onClick={imprimir}>🖨 Imprimir</button>
          <button className="btn" onClick={descargarXlsx}>⬇ XLSX</button>
        </div>
      }>
      {/* Controles - no se imprimen */}
      <div className="card no-print" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0, flexWrap: "wrap", gap: 8, alignItems: "end" }}>
          <div>
            <label style={lblStyle}>Desde</label>
            <input className="input" type="date" value={desde}
              onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label style={lblStyle}>Hasta</label>
            <input className="input" type="date" value={hasta}
              onChange={(e) => setHasta(e.target.value)} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={incluirTickets}
              onChange={(e) => setIncluirTickets(e.target.checked)} />
            Incluir tickets
          </label>
          <button className="btn" onClick={generar} disabled={busy}>
            {busy ? "Generando..." : "Generar"}
          </button>
        </div>
      </div>

      {/* Reporte */}
      {data && (
        <div className="card print-area" style={{ padding: 28 }}>
          {/* Header */}
          <div style={{ borderBottom: "2px solid #1f2937", paddingBottom: 8, marginBottom: 14 }}>
            <h1 style={{ margin: 0, fontSize: 22, letterSpacing: "0.05em" }}>
              {empresa.toUpperCase() || "ACEROMAX"}
            </h1>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Reporte de Facturas — Del día {data.desde.split("-").reverse().join("-")} al día {data.hasta.split("-").reverse().join("-")}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
              Generado: {new Date().toLocaleString("es-MX")}
            </div>
          </div>

          {data.grupos.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)", textAlign: "center", padding: 24 }}>
              Sin facturas en el rango seleccionado.
            </p>
          ) : (
            <>
              {/* Encabezado de columnas */}
              <table style={{ width: "100%", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#1f2937", color: "white" }}>
                    <th style={th}>Fecha</th>
                    <th style={th}>Serie</th>
                    <th style={th}>Referencia</th>
                    <th style={th}>Cliente</th>
                    <th style={{ ...th, textAlign: "right" }}>Total</th>
                    <th style={{ ...th, width: 60 }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.grupos.map((g) => (
                    <>
                      <tr key={`label-${g.forma_pago}`}>
                        <td colSpan={6} style={{ padding: "10px 8px", fontWeight: 700, fontStyle: "italic", background: "#f9fafb" }}>
                          Pago {g.forma_pago} — {g.label}
                        </td>
                      </tr>
                      {g.facturas.map((f, i) => (
                        <tr key={`${g.forma_pago}-${i}`} style={{ borderBottom: "1px solid #e5e7eb" }}>
                          <td style={td}>{f.fecha}</td>
                          <td style={td}>{f.serie}</td>
                          <td style={td}>{f.referencia}</td>
                          <td style={td}>{f.cliente}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fmt(f.total)}</td>
                          <td style={{ ...td, textAlign: "center" }}>
                            <span className={`badge ${f.estado === "CO" ? "badge-success" : f.estado === "PE" ? "badge-warning" : "badge-danger"}`}
                              style={{ fontSize: 10 }}>
                              {f.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr key={`subtotal-${g.forma_pago}`}>
                        <td style={{ ...td, fontWeight: 700 }}>{g.n}.00</td>
                        <td colSpan={3}></td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, background: "#f3f4f6" }}>
                          {fmt(g.subtotal)}
                        </td>
                        <td></td>
                      </tr>
                    </>
                  ))}
                  {/* Total general */}
                  <tr style={{ background: "#dbeafe" }}>
                    <td style={{ ...td, fontWeight: 800, fontSize: 14 }}>
                      {data.n_total}.00
                    </td>
                    <td colSpan={3}></td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800, fontSize: 14 }}>
                      {fmt(data.total_general)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>

              {/* Resumen al pie */}
              <div style={{ marginTop: 20, padding: 12, background: "var(--color-bg)", borderRadius: 8 }}>
                <strong style={{ fontSize: 13 }}>Resumen por forma de pago:</strong>
                <table style={{ width: "100%", marginTop: 6, fontSize: 12 }}>
                  <tbody>
                    {data.grupos.map((g) => (
                      <tr key={g.forma_pago}>
                        <td style={{ padding: "2px 0" }}>{g.label} ({g.forma_pago})</td>
                        <td style={{ textAlign: "right", padding: "2px 0" }}>{g.n} doc(s)</td>
                        <td style={{ textAlign: "right", padding: "2px 0", fontWeight: 600 }}>{fmt(g.subtotal)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "1px solid var(--color-border)", fontWeight: 700 }}>
                      <td style={{ padding: "4px 0" }}>TOTAL GENERAL</td>
                      <td style={{ textAlign: "right" }}>{data.n_total} doc(s)</td>
                      <td style={{ textAlign: "right" }}>{fmt(data.total_general)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @media print {
          .no-print, .sidebar, .layout-header { display: none !important; }
          .print-area { box-shadow: none !important; border: 0 !important; }
        }
      `}</style>
    </Layout>
  );
}

const lblStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: "var(--color-text-secondary)", marginBottom: 4, textTransform: "uppercase",
};
const th: React.CSSProperties = { padding: "8px 6px", textAlign: "left", fontSize: 11 };
const td: React.CSSProperties = { padding: "6px" };
