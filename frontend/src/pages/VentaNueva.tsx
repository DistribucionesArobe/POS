import { useState } from "react";
import { api } from "../api/client";

type Item = { variante_id: number; sku: string; nombre: string; cantidad: number; precio: number };

export default function VentaNueva() {
  const [tipo, setTipo] = useState<"TICKET" | "REMISION" | "FACTURA">("TICKET");
  const [clienteId, setClienteId] = useState<number>(1); // placeholder
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  async function buscar() {
    if (busqueda.length < 2) return;
    const r = await api.get("/api/productos/buscar-variante", { params: { q: busqueda } });
    setSugerencias(r.data);
  }

  function agregar(s: any) {
    setItems([...items, { variante_id: s.id, sku: s.sku, nombre: s.nombre, cantidad: 1, precio: s.precio }]);
    setSugerencias([]); setBusqueda("");
  }

  const subtotal = items.reduce((a, i) => a + i.cantidad * i.precio, 0);
  const iva = subtotal * 0.16;
  const total = subtotal + iva;

  async function guardar() {
    const payload = {
      tipo, cliente_id: clienteId,
      forma_pago_sat: tipo === "FACTURA" ? "03" : "01",
      metodo_pago_sat: tipo === "REMISION" ? "PPD" : "PUE",
      conceptos: items.map((i) => ({
        variante_id: i.variante_id, cantidad: i.cantidad, precio_unitario: i.precio,
      })),
    };
    const r = await api.post("/api/ventas", payload);
    alert(`Documento creado: ${r.data.folio}`);
    setItems([]);
  }

  return (
    <div className="container">
      <h1>Nueva venta</h1>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <label>Tipo:</label>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
            <option value="TICKET">Ticket</option>
            <option value="REMISION">Remision (a credito sin facturar)</option>
            <option value="FACTURA">Factura CFDI</option>
          </select>
          <label>Cliente ID:</label>
          <input className="input" type="number" value={clienteId} onChange={(e) => setClienteId(+e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <input className="input" placeholder="Buscar producto..." value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} />
          <button className="btn" onClick={buscar}>Buscar</button>
        </div>
        {sugerencias.length > 0 && (
          <ul style={{ marginTop: 8 }}>
            {sugerencias.map((s) => (
              <li key={s.id} onClick={() => agregar(s)} style={{ cursor: "pointer", padding: 4 }}>
                {s.sku} - {s.nombre} - ${s.precio} (stock {s.stock})
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <table>
          <thead><tr><th>SKU</th><th>Producto</th><th>Cant</th><th>Precio</th><th>Importe</th></tr></thead>
          <tbody>
            {items.map((i, idx) => (
              <tr key={idx}>
                <td>{i.sku}</td><td>{i.nombre}</td>
                <td>
                  <input className="input" type="number" min="0.01" step="0.01" value={i.cantidad}
                    style={{ width: 80 }}
                    onChange={(e) => {
                      const c = [...items]; c[idx].cantidad = +e.target.value; setItems(c);
                    }} />
                </td>
                <td>${i.precio.toFixed(2)}</td>
                <td>${(i.cantidad * i.precio).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <p>Subtotal: ${subtotal.toFixed(2)}</p>
          <p>IVA: ${iva.toFixed(2)}</p>
          <h3>Total: ${total.toFixed(2)}</h3>
          <button className="btn" onClick={guardar} disabled={items.length === 0}>
            Guardar {tipo}
          </button>
        </div>
      </div>
    </div>
  );
}
