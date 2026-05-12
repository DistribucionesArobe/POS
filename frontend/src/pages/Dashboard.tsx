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
const fmtNum = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 1 });

type PeriodoData = {
  total: number; n: number; ticket_promedio: number;
  vs_anterior: { total: number; n: number };
  cambio_pct: number | null;
};

export default function Dashboard() {
  const [dash, setDash] = useState<{
    periodos: { hoy: PeriodoData; semana: PeriodoData; mes: PeriodoData };
    top_productos: { descripcion: string; cantidad: number; monto: number }[];
    clientes_nuevos_mes: number;
    cartera_total: number;
  } | null>(null);
  const [cartera, setCartera] = useState<any>(null);
  const [kpis, setKpis] = useState<any>(null);

  useEffect(() => {
    api.get("/api/reportes/dashboard").then((r) => setDash(r.data)).catch(() => {});
    api.get("/api/reportes/kpis").then((r) => setKpis(r.data)).catch(() => {});
    api.get("/api/reportes/antiguedad-cartera").then((r) => setCartera(r.data)).catch(() => {});
  }, []);

  const periodos = dash?.periodos;

  return (
    <Layout title="Dashboard" subtitle="Resumen de ventas, cartera y top productos">
      <div className="stat-grid">
        <StatCard
          label="Ventas hoy"
          value={periodos ? fmtMoney(periodos.hoy.total) : "..."}
          meta={periodos ? `${periodos.hoy.n} ventas · ticket prom ${fmtMoney(periodos.hoy.ticket_promedio)}` : ""}
          icon={I.trending}
        />
        <StatCard
          label="Ventas esta semana"
          value={periodos ? fmtMoney(periodos.semana.total) : "..."}
          meta={periodos ? cambioLabel(periodos.semana.cambio_pct, "vs semana anterior") : ""}
          icon={I.trending}
        />
        <StatCard
          label="Ventas este mes"
          value={periodos ? fmtMoney(periodos.mes.total) : "..."}
          meta={periodos ? cambioLabel(periodos.mes.cambio_pct, "vs mes anterior") : ""}
          icon={I.trending}
        />
        <StatCard
          label="Cartera por cobrar"
          value={dash ? fmtMoney(dash.cartera_total) : "..."}
          meta={kpis ? `${kpis.documentos_pendientes} documentos pendientes` : ""}
          icon={I.dollar}
        />
        <StatCard
          label="Productos en stock"
          value={kpis?.productos_stock ?? "..."}
          meta="Variantes con existencia"
          icon={I.package}
        />
        <StatCard
          label="Clientes nuevos este mes"
          value={dash?.clientes_nuevos_mes ?? "..."}
          meta={kpis ? `${kpis.clientes_activos} clientes activos total` : ""}
          icon={I.users}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginTop: 16 }}>
        <div className="card">
          <h3 className="card-header">Top 10 productos del mes</h3>
          {dash?.top_productos?.length ? (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Producto</th>
                  <th style={{ textAlign: "right" }}>Cantidad</th>
                  <th style={{ textAlign: "right" }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {dash.top_productos.map((p, i) => (
                  <tr key={i}>
                    <td><span style={{ fontWeight: 600, color: "var(--color-text-muted)" }}>{i + 1}</span></td>
                    <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descripcion}</td>
                    <td style={{ textAlign: "right" }}>{fmtNum(p.cantidad)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Sin ventas este mes todavía.</p>
          )}
        </div>

        <div className="card">
          <h3 className="card-header">Antigüedad de cartera</h3>
          {cartera ? (
            <table>
              <thead><tr><th>Bucket</th><th style={{ textAlign: "right" }}>Saldo</th></tr></thead>
              <tbody>
                {Object.entries(cartera).map(([bucket, monto]) => {
                  const m = monto as number;
                  const cls = m === 0 ? "" : bucket === "91+" ? "badge-danger" : bucket.startsWith("61") ? "badge-warning" : "badge-success";
                  return (
                    <tr key={bucket}>
                      <td>{bucket} días {cls && <span className={`badge ${cls}`} style={{ marginLeft: 6 }}>&nbsp;</span>}</td>
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


function cambioLabel(pct: number | null, sufijo: string): string {
  if (pct === null) return `Sin datos ${sufijo}`;
  const flecha = pct >= 0 ? "▲" : "▼";
  return `${flecha} ${Math.abs(pct).toFixed(1)}% ${sufijo}`;
}
