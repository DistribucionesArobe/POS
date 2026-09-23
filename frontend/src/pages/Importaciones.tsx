import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../api/client";

type ImportacionRow = {
  id: number;
  folio: string;
  proveedor: string | null;
  contenedor: string | null;
  estatus: string;
  fecha: string | null;
  moneda_mercancia: string;
  tipo_cambio: number;
  n_renglones: number;
  total_mercancia_mxn: number;
  inversion_total_mxn: number;
  utilidad_sugerida_mxn: number;
};

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("es-MX") : "-";

const ESTATUS_COLOR: Record<string, string> = {
  borrador: "#94a3b8",
  en_transito: "#f59e0b",
  recibida: "#10b981",
  cerrada: "#1e40af",
  cancelada: "#dc2626",
};

export default function Importaciones() {
  const nav = useNavigate();
  const [rows, setRows] = useState<ImportacionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setLoading(true); setError(null);
    try {
      const r = await api.get("/api/importaciones");
      setRows(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function crearNueva() {
    try {
      const r = await api.post("/api/importaciones", {
        folio: "", proveedor: "", agente_aduanal: "",
        contenedor: "1x40 HC", moneda_mercancia: "USD", tipo_cambio: 18,
        estatus: "borrador", renglones: [], gastos: [],
      });
      nav(`/importaciones/${r.data.id}`);
    } catch (e: any) {
      alert("Error: " + (e.response?.data?.detail || e.message));
    }
  }

  return (
    <Layout title="Importaciones" subtitle="Costeo de contenedores y prorrateo aduanal"
      actions={
        <button onClick={crearNueva}
          style={{ background: "#059669", color: "white", border: 0,
            padding: "10px 18px", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          + Nueva importacion
        </button>
      }>
      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 6, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Cargando...</div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <h3 style={{ margin: "0 0 8px" }}>Sin importaciones todavia</h3>
          <p style={{ color: "#64748b", marginTop: 0 }}>
            Registra tu primer contenedor para calcular costos reales de tu mercancia
            (flete, impuestos, agente aduanal prorrateados por pieza).
          </p>
          <button onClick={crearNueva}
            style={{ background: "#059669", color: "white", border: 0,
              padding: "12px 24px", borderRadius: 6, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 12 }}>
            + Crear primera importacion
          </button>
        </div>
      ) : (
        <div className="card">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: 10 }}>Folio</th>
                <th style={{ padding: 10 }}>Fecha</th>
                <th style={{ padding: 10 }}>Proveedor</th>
                <th style={{ padding: 10 }}>Contenedor</th>
                <th style={{ padding: 10 }}>Estatus</th>
                <th style={{ padding: 10, textAlign: "right" }}>Piezas</th>
                <th style={{ padding: 10, textAlign: "right" }}>Mercancia MXN</th>
                <th style={{ padding: 10, textAlign: "right" }}>Inversion</th>
                <th style={{ padding: 10, textAlign: "right" }}>Utilidad estimada</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                  onClick={() => nav(`/importaciones/${r.id}`)}>
                  <td style={{ padding: 10, fontWeight: 700 }}>
                    <Link to={`/importaciones/${r.id}`} style={{ color: "#1e40af", textDecoration: "none" }}>
                      {r.folio}
                    </Link>
                  </td>
                  <td style={{ padding: 10, fontSize: 13, color: "#64748b" }}>{fmtDate(r.fecha)}</td>
                  <td style={{ padding: 10 }}>{r.proveedor || <em style={{ color: "#94a3b8" }}>Sin proveedor</em>}</td>
                  <td style={{ padding: 10, fontSize: 13 }}>{r.contenedor || "-"}</td>
                  <td style={{ padding: 10 }}>
                    <span style={{
                      display: "inline-block", padding: "2px 10px",
                      background: ESTATUS_COLOR[r.estatus] || "#94a3b8",
                      color: "white", borderRadius: 12, fontSize: 11, fontWeight: 700,
                    }}>{r.estatus.toUpperCase()}</span>
                  </td>
                  <td style={{ padding: 10, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {r.n_renglones}
                  </td>
                  <td style={{ padding: 10, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(r.total_mercancia_mxn)}
                  </td>
                  <td style={{ padding: 10, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    <strong>{fmt(r.inversion_total_mxn)}</strong>
                  </td>
                  <td style={{ padding: 10, textAlign: "right", fontVariantNumeric: "tabular-nums",
                    color: r.utilidad_sugerida_mxn > 0 ? "#059669" : "#dc2626", fontWeight: 700 }}>
                    {fmt(r.utilidad_sugerida_mxn)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
