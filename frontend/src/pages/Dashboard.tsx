import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import StatCard from "../components/StatCard";
import { api } from "../api/client";

const I = {
  package: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  trending: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  dollar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
};

const fmtMoney = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Dashboard() {
  const [kpis, setKpis] = useState<any>(null);
  const [corte, setCorte] = useState<any>(null);
  const [cartera, setCartera] = useState<any>(null);

  useEffect(() => {
    api.get("/api/reportes/kpis").then((r) => setKpis(r.data)).catch(() => {});
    api.get("/api/reportes/corte-caja").then((r) => setCorte(r.data)).catch(() => {});
    api.get("/api/reportes/antiguedad-cartera").then((r) => setCartera(r.data)).catch(() => {});
  }, []);

  return (
    <Layout title="Dashboard" subtitle="Resumen del dia y cartera">
      <div className="stat-grid">
        <StatCard
          label="Productos en stock"
          value={kpis?.productos_stock ?? "..."}
          meta="Variantes con existencia"
          icon={I.package}
        />
        <StatCard
          label="Ventas hoy"
          value={kpis ? fmtMoney(kpis.ventas_hoy) : "..."}
          meta={kpis ? `${kpis.documentos_hoy} documentos` : ""}
          icon={I.trending}
        />
        <StatCard
          label="Cartera por cobrar"
          value={kpis ? fmtMoney(kpis.cartera_total) : "..."}
          meta={kpis ? `${kpis.documentos_pendientes} pendientes` : ""}
          icon={I.dollar}
        />
        <StatCard
          label="Clientes activos"
          value={kpis?.clientes_activos ?? "..."}
          meta="Total registrados"
          icon={I.users}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h3 className="card-header">Corte de caja - hoy</h3>
          {corte?.por_tipo?.length ? (
            <table>
              <thead><tr><th>Tipo</th><th>Documentos</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {corte.por_tipo.map((r: any) => (
                  <tr key={r.tipo}>
                    <td><span className="badge badge-info">{r.tipo}</span></td>
                    <td>{r.n}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Sin ventas todavia hoy.</p>
          )}
        </div>

        <div className="card">
          <h3 className="card-header">Antiguedad de cartera</h3>
          {cartera ? (
            <table>
              <thead><tr><th>Bucket</th><th style={{ textAlign: "right" }}>Saldo</th></tr></thead>
              <tbody>
                {Object.entries(cartera).map(([bucket, monto]) => {
                  const m = monto as number;
                  const cls = m === 0 ? "" : bucket === "91+" ? "badge-danger" : bucket.startsWith("61") ? "badge-warning" : "badge-success";
                  return (
                    <tr key={bucket}>
                      <td>{bucket} dias {cls && <span className={`badge ${cls}`} style={{ marginLeft: 6 }}>&nbsp;</span>}</td>
                      <td style={{ textAlign: "right", fontWeight: m > 0 ? 600 : 400, color: m > 0 ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                        {fmtMoney(m)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
