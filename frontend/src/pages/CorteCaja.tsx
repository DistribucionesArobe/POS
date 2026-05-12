import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Preview = {
  fecha: string;
  n_ventas: number;
  total_vendido: number;
  efectivo_esperado: number;
  desglose_pagos: Record<string, { label: string; monto: number; n: number }>;
};

type Historial = {
  id: number; fecha: string; fecha_corte: string;
  usuario: string; n_ventas: number;
  total_vendido: number; efectivo_esperado: number;
  efectivo_real: number; diferencia: number;
  desglose_pagos: Record<string, { label: string; monto: number; n: number }>;
  notas: string | null;
};

export default function CorteCaja() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [hist, setHist] = useState<Historial[]>([]);
  const [efectivoReal, setEfectivoReal] = useState<number>(0);
  const [notas, setNotas] = useState("");
  const [cerrando, setCerrando] = useState(false);

  async function cargar() {
    const [p, h] = await Promise.all([
      api.get("/api/reportes/corte/preview"),
      api.get("/api/reportes/corte/historial"),
    ]);
    setPreview(p.data);
    setHist(h.data);
    setEfectivoReal(p.data.efectivo_esperado);
  }
  useEffect(() => { cargar(); }, []);

  async function cerrar() {
    if (!preview) return;
    if (!confirm(`Cerrar corte del ${preview.fecha}?\nEfectivo real: ${fmt(efectivoReal)}\nDiferencia: ${fmt(efectivoReal - preview.efectivo_esperado)}`)) return;
    setCerrando(true);
    try {
      await api.post("/api/reportes/corte/cerrar", { efectivo_real: efectivoReal, notas: notas || null });
      alert("Corte cerrado");
      setNotas("");
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setCerrando(false);
    }
  }

  async function exportarCortes() {
    const r = await api.get("/api/reportes/cortes-xlsx", { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url; a.download = "cortes.xlsx";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  const diferencia = preview ? +(efectivoReal - preview.efectivo_esperado).toFixed(2) : 0;

  return (
    <Layout title="Corte de caja" subtitle="Cierre del día y desglose por forma de pago"
      actions={<button className="btn-icon" onClick={exportarCortes}>Exportar XLSX</button>}>
      {!preview ? <p>Cargando...</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Preview del día */}
          <div className="card">
            <h3 className="card-header">Ventas de hoy ({preview.fecha})</h3>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
              <span>Documentos</span>
              <strong>{preview.n_ventas}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
              <span>Total vendido</span>
              <strong style={{ fontSize: 18 }}>{fmt(preview.total_vendido)}</strong>
            </div>
            <h4 style={{ marginTop: 16 }}>Desglose por forma de pago</h4>
            {Object.entries(preview.desglose_pagos).length === 0 ? (
              <p style={{ color: "var(--color-text-muted)" }}>Sin pagos registrados.</p>
            ) : (
              <table>
                <thead><tr><th>Forma</th><th style={{ textAlign: "right" }}># pagos</th><th style={{ textAlign: "right" }}>Monto</th></tr></thead>
                <tbody>
                  {Object.entries(preview.desglose_pagos).map(([k, v]) => (
                    <tr key={k}>
                      <td>{v.label}</td>
                      <td style={{ textAlign: "right" }}>{v.n}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(v.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Cerrar caja */}
          <div className="card">
            <h3 className="card-header">Cerrar caja</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Cuenta el efectivo físico en caja y captura el monto real. El sistema calcula la diferencia.
            </p>
            <div style={{ background: "var(--color-bg)", padding: 12, borderRadius: 8, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Efectivo esperado</span>
                <strong>{fmt(preview.efectivo_esperado)}</strong>
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                Calculado de los pagos en efectivo del día.
              </div>
            </div>
            <label>Efectivo contado en caja</label>
            <input className="input" type="number" step="0.01" value={efectivoReal}
              style={{ fontSize: 22, padding: 12, fontWeight: 600 }}
              onChange={(e) => setEfectivoReal(+e.target.value)} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 18, fontWeight: 800,
              color: Math.abs(diferencia) < 0.01 ? "var(--color-success)" :
                     diferencia > 0 ? "#f59e0b" : "var(--color-danger)" }}>
              <span>Diferencia</span>
              <span>{diferencia >= 0 ? "+" : ""}{fmt(diferencia)}</span>
            </div>
            {Math.abs(diferencia) > 0.01 && (
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
                {diferencia > 0 ? "Sobra dinero en caja" : "Falta dinero en caja"}
              </p>
            )}
            <label style={{ marginTop: 12 }}>Notas (opcional)</label>
            <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)}
              placeholder="Cualquier observación del día..." />
            <button className="btn" style={{ width: "100%", marginTop: 16, padding: 12 }}
              disabled={cerrando} onClick={cerrar}>
              {cerrando ? "Cerrando..." : "Cerrar caja"}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="card-header">Historial de cortes</h3>
        {hist.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>Sin cortes aún.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th>Cajero</th><th style={{ textAlign: "right" }}># Ventas</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Efectivo esp.</th>
                <th style={{ textAlign: "right" }}>Real</th>
                <th style={{ textAlign: "right" }}>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((c) => (
                <tr key={c.id}>
                  <td>{c.fecha}</td>
                  <td>{c.usuario}</td>
                  <td style={{ textAlign: "right" }}>{c.n_ventas}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(c.total_vendido)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(c.efectivo_esperado)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(c.efectivo_real)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600,
                    color: Math.abs(c.diferencia) < 0.01 ? "var(--color-success)" :
                           c.diferencia > 0 ? "#f59e0b" : "var(--color-danger)" }}>
                    {c.diferencia >= 0 ? "+" : ""}{fmt(c.diferencia)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
