import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export default function Dashboard() {
  const [corte, setCorte] = useState<any>(null);
  const [cartera, setCartera] = useState<any>(null);

  useEffect(() => {
    api.get("/api/reportes/corte-caja").then((r) => setCorte(r.data)).catch(() => {});
    api.get("/api/reportes/antiguedad-cartera").then((r) => setCartera(r.data)).catch(() => {});
  }, []);

  return (
    <div className="container">
      <nav>
        <Link to="/">Inicio</Link>
        <Link to="/venta">Nueva venta</Link>
        <Link to="/cartera">Cartera</Link>
      </nav>
      <h1>Dashboard</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Corte de caja - {corte?.fecha ?? "..."}</h3>
        <table>
          <thead><tr><th>Tipo</th><th>N</th><th>Total</th></tr></thead>
          <tbody>
            {corte?.por_tipo?.map((r: any) => (
              <tr key={r.tipo}><td>{r.tipo}</td><td>{r.n}</td><td>${r.total.toLocaleString()}</td></tr>
            )) ?? null}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Antiguedad de cartera</h3>
        {cartera && (
          <table>
            <thead><tr><th>Bucket</th><th>Saldo</th></tr></thead>
            <tbody>
              {Object.entries(cartera).map(([bucket, monto]) => (
                <tr key={bucket}><td>{bucket} dias</td><td>${(monto as number).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
