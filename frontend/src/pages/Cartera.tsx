import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Cartera() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    api.get("/api/cxc/cartera").then((r) => setRows(r.data)).catch(() => {});
  }, []);

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
                <th>Antiguedad</th><th>WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cls = r.dias_antiguedad > 90 ? "badge-danger" : r.dias_antiguedad > 60 ? "badge-warning" : r.dias_antiguedad > 30 ? "badge-info" : "badge-success";
                return (
                  <tr key={r.cxc_id}>
                    <td>{r.cliente}</td>
                    <td><code>#{r.documento_id}</code></td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(r.saldo)}</td>
                    <td><span className={`badge ${cls}`}>{r.dias_antiguedad} dias</span></td>
                    <td>{r.whatsapp ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
