import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

type Variante = {
  id: number; sku: string; presentacion: string; unidad: string;
  precio_publico: number; precio_mayoreo: number | null;
  costo_promedio: number; stock_actual: number; stock_minimo: number;
  activo: boolean;
};
type ProductoT = {
  id: number; nombre: string; categoria: string | null; marca: string | null;
  clave_prod_serv_sat: string | null;
  variantes: Variante[];
};

export default function Productos() {
  const [productos, setProductos] = useState<ProductoT[]>([]);
  const [busqueda, setBusqueda] = useState("");

  // Form nuevo producto
  const [nuevoProd, setNuevoProd] = useState({ nombre: "", categoria: "", marca: "", clave_prod_serv_sat: "" });

  // Form nueva variante
  const [varProductoId, setVarProductoId] = useState<number | null>(null);
  const [nuevaVar, setNuevaVar] = useState({
    sku: "", presentacion: "", unidad: "PZA", clave_unidad_sat: "H87",
    precio_publico: 0, costo_promedio: 0,
  });

  async function cargar() {
    const r = await api.get("/api/productos", { params: { q: busqueda || undefined } });
    setProductos(r.data);
  }

  useEffect(() => { cargar(); }, []);

  async function crearProducto() {
    if (!nuevoProd.nombre) return alert("Falta nombre");
    await api.post("/api/productos", nuevoProd);
    setNuevoProd({ nombre: "", categoria: "", marca: "", clave_prod_serv_sat: "" });
    cargar();
  }

  async function crearVariante() {
    if (!varProductoId || !nuevaVar.sku || !nuevaVar.presentacion) return alert("Falta SKU o presentacion");
    try {
      await api.post("/api/productos/variantes", { ...nuevaVar, producto_id: varProductoId });
      setNuevaVar({ sku: "", presentacion: "", unidad: "PZA", clave_unidad_sat: "H87", precio_publico: 0, costo_promedio: 0 });
      setVarProductoId(null);
      cargar();
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message);
    }
  }

  async function cambiarPrecio(varianteId: number, actual: number) {
    const nuevo = prompt("Nuevo precio publico:", String(actual));
    if (!nuevo) return;
    await api.patch(`/api/productos/variantes/${varianteId}/precio`, {
      precio_publico: parseFloat(nuevo),
    });
    cargar();
  }

  async function desactivar(varianteId: number) {
    if (!confirm("Desactivar esta variante?")) return;
    await api.delete(`/api/productos/variantes/${varianteId}`);
    cargar();
  }

  return (
    <div className="container">
      <nav>
        <Link to="/">Inicio</Link>
        <Link to="/venta">Nueva venta</Link>
        <Link to="/productos">Productos</Link>
        <Link to="/cartera">Cartera</Link>
      </nav>
      <h1>Productos</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <input className="input" placeholder="Buscar..." value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()} />
          <button className="btn" onClick={cargar}>Filtrar</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3>Nuevo producto (familia)</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <input className="input" placeholder="Nombre *" value={nuevoProd.nombre}
            onChange={(e) => setNuevoProd({ ...nuevoProd, nombre: e.target.value })} />
          <input className="input" placeholder="Categoria" value={nuevoProd.categoria}
            onChange={(e) => setNuevoProd({ ...nuevoProd, categoria: e.target.value })} />
          <input className="input" placeholder="Marca" value={nuevoProd.marca}
            onChange={(e) => setNuevoProd({ ...nuevoProd, marca: e.target.value })} />
          <input className="input" placeholder="Clave SAT (8 digitos)" value={nuevoProd.clave_prod_serv_sat}
            onChange={(e) => setNuevoProd({ ...nuevoProd, clave_prod_serv_sat: e.target.value })} />
        </div>
        <button className="btn" style={{ marginTop: 8 }} onClick={crearProducto}>Crear producto</button>
      </div>

      {productos.map((p) => (
        <div key={p.id} className="card" style={{ marginBottom: 12 }}>
          <h3>{p.nombre} <small style={{ color: "#6b7280", fontWeight: "normal" }}>
            #{p.id} {p.categoria && `· ${p.categoria}`} {p.marca && `· ${p.marca}`}
          </small></h3>

          <table>
            <thead>
              <tr><th>SKU</th><th>Presentacion</th><th>Unidad</th>
                  <th>Precio</th><th>Costo</th><th>Stock</th><th>Min</th><th></th></tr>
            </thead>
            <tbody>
              {p.variantes.map((v) => (
                <tr key={v.id} style={{ opacity: v.activo ? 1 : 0.4 }}>
                  <td>{v.sku}</td>
                  <td>{v.presentacion}</td>
                  <td>{v.unidad}</td>
                  <td>${v.precio_publico.toFixed(2)}</td>
                  <td>${v.costo_promedio.toFixed(2)}</td>
                  <td>{v.stock_actual}</td>
                  <td>{v.stock_minimo}</td>
                  <td>
                    <button onClick={() => cambiarPrecio(v.id, v.precio_publico)} style={{ marginRight: 4 }}>Precio</button>
                    {v.activo && <button onClick={() => desactivar(v.id)}>Desactivar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 8 }}>
            {varProductoId === p.id ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, alignItems: "end" }}>
                <input className="input" placeholder="SKU *" value={nuevaVar.sku}
                  onChange={(e) => setNuevaVar({ ...nuevaVar, sku: e.target.value })} />
                <input className="input" placeholder="Presentacion *" value={nuevaVar.presentacion}
                  onChange={(e) => setNuevaVar({ ...nuevaVar, presentacion: e.target.value })} />
                <input className="input" placeholder="Unidad" value={nuevaVar.unidad}
                  onChange={(e) => setNuevaVar({ ...nuevaVar, unidad: e.target.value })} />
                <input className="input" placeholder="Clave SAT" value={nuevaVar.clave_unidad_sat}
                  onChange={(e) => setNuevaVar({ ...nuevaVar, clave_unidad_sat: e.target.value })} />
                <input className="input" type="number" placeholder="Precio publico" value={nuevaVar.precio_publico}
                  onChange={(e) => setNuevaVar({ ...nuevaVar, precio_publico: +e.target.value })} />
                <input className="input" type="number" placeholder="Costo" value={nuevaVar.costo_promedio}
                  onChange={(e) => setNuevaVar({ ...nuevaVar, costo_promedio: +e.target.value })} />
                <button className="btn" onClick={crearVariante}>Guardar variante</button>
                <button onClick={() => setVarProductoId(null)}>Cancelar</button>
              </div>
            ) : (
              <button onClick={() => setVarProductoId(p.id)}>+ Agregar variante</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
