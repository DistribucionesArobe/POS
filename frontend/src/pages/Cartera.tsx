import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function Cartera() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api.get("/api/cxc/cartera").then((r) => setRows(r.data)).catch(() => {});
  }, []);

  return (
    <div className="container">
      <h1>Cartera por cobrar</h1>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Cliente</th><th>Documento</th><th>Saldo</th>
              <th>Antiguedad</th><th>WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cxc_id}>
                <td>{r.cliente}</td><td>#{r.documento_id}</td>
                <td>${r.saldo.toFixed(2)}</td>
                <td>{r.dias_antiguedad} dias</td>
                <td>{r.whatsapp ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
