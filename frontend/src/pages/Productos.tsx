import { useEffect, useState } from "react";
import Layout from "../components/Layout";
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

const FORM_VACIO = {
  nombre: "", categoria: "", marca: "", clave_prod_serv_sat: "",
  sku: "", presentacion: "Default", unidad: "PZA", clave_unidad_sat: "H87",
  precio_publico: 0, costo_promedio: 0, stock_minimo: 0,
};

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Productos() {
  const [productos, setProductos] = useState<ProductoT[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState(FORM_VACIO);
  const [mostrarForm, setMostrarForm] = useState(false);

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
    if (!form.nombre || !form.sku) return alert("Nombre y SKU son obligatorios");
    try {
      await api.post("/api/productos/simple", form);
      setForm(FORM_VACIO);
      setMostrarForm(false);
      cargar();
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message);
    }
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
    <Layout
      title="Productos"
      subtitle={`${productos.length} productos registrados`}
      actions={
        <button className="btn" onClick={() => setMostrarForm(!mostrarForm)}>
          {mostrarForm ? "Cancelar" : "+ Nuevo producto"}
        </button>
      }
    >
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <input className="input" placeholder="Buscar por nombre o categoria..." value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()} />
          <button className="btn-icon" onClick={cargar}>Filtrar</button>
        </div>
      </div>

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="card-header">Nuevo producto</h3>
          <p style={{ color: "var(--color-text-muted)", margin: "-12px 0 16px", fontSize: 13 }}>
            Lo basico: nombre + SKU + precio. La familia y datos SAT son opcionales.
          </p>
          <div className="form-grid">
            <div>
              <label>Nombre *</label>
              <input className="input" placeholder="Ej. Tablaroca 1/2" value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <label>SKU *</label>
              <input className="input" placeholder="Ej. TBL-12-244" value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <label>Presentacion</label>
              <input className="input" placeholder="Ej. Hoja 1.22x2.44m" value={form.presentacion}
                onChange={(e) => setForm({ ...form, presentacion: e.target.value })} />
            </div>
            <div>
              <label>Precio publico</label>
              <input className="input" type="number" value={form.precio_publico}
                onChange={(e) => setForm({ ...form, precio_publico: +e.target.value })} />
            </div>
            <div>
              <label>Costo</label>
              <input className="input" type="number" value={form.costo_promedio}
                onChange={(e) => setForm({ ...form, costo_promedio: +e.target.value })} />
            </div>
            <div>
              <label>Unidad</label>
              <input className="input" value={form.unidad}
                onChange={(e) => setForm({ ...form, unidad: e.target.value })} />
            </div>
            <div>
              <label>Familia (opcional)</label>
              <input className="input" placeholder="Ej. Tablarocas" value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
            </div>
            <div>
              <label>Marca (opcional)</label>
              <input className="input" placeholder="Ej. USG" value={form.marca}
                onChange={(e) => setForm({ ...form, marca: e.target.value })} />
            </div>
            <div>
              <label>Clave SAT (opcional)</label>
              <input className="input" placeholder="8 digitos" value={form.clave_prod_serv_sat}
                onChange={(e) => setForm({ ...form, clave_prod_serv_sat: e.target.value })} />
            </div>
          </div>
          <button className="btn" style={{ marginTop: 16 }} onClick={crearProducto}>Guardar producto</button>
        </div>
      )}

      {productos.map((p) => (
        <div key={p.id} className="card" style={{ marginBottom: 12 }}>
          <h3 className="card-header">
            <div>
              {p.nombre}{" "}
              <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 400 }}>
                #{p.id}{p.categoria && ` · ${p.categoria}`}{p.marca && ` · ${p.marca}`}
              </span>
            </div>
          </h3>

          <table>
            <thead>
              <tr><th>SKU</th><th>Presentacion</th><th>Unidad</th>
                <th style={{ textAlign: "right" }}>Precio</th>
                <th style={{ textAlign: "right" }}>Costo</th>
                <th style={{ textAlign: "right" }}>Stock</th>
                <th></th></tr>
            </thead>
            <tbody>
              {p.variantes.map((v) => (
                <tr key={v.id} style={{ opacity: v.activo ? 1 : 0.4 }}>
                  <td><code>{v.sku}</code></td>
                  <td>{v.presentacion}</td>
                  <td>{v.unidad}</td>
                  <td style={{ textAlign: "right" }}>{fmt(v.precio_publico)}</td>
                  <td style={{ textAlign: "right", color: "var(--color-text-muted)" }}>{fmt(v.costo_promedio)}</td>
                  <td style={{ textAlign: "right" }}>
                    <span className={`badge ${v.stock_actual <= v.stock_minimo ? "badge-warning" : "badge-success"}`}>
                      {v.stock_actual}
                    </span>
                  </td>
                  <td>
                    <button className="btn-icon" onClick={() => cambiarPrecio(v.id, v.precio_publico)} style={{ marginRight: 4 }}>Precio</button>
                    {v.activo && <button className="btn-icon" onClick={() => desactivar(v.id)}>Desactivar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 12 }}>
            {varProductoId === p.id ? (
              <div className="form-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", alignItems: "end" }}>
                <input className="input" placeholder="SKU *" value={nuevaVar.sku}
                  onChange={(e) => setNuevaVar({ ...nuevaVar, sku: e.target.value })} />
                <input className="input" placeholder="Presentacion *" value={nuevaVar.presentacion}
                  onChange={(e) => setNuevaVar({ ...nuevaVar, presentacion: e.target.value })} />
                <input className="input" type="number" placeholder="Precio" value={nuevaVar.precio_publico}
                  onChange={(e) => setNuevaVar({ ...nuevaVar, precio_publico: +e.target.value })} />
                <input className="input" type="number" placeholder="Costo" value={nuevaVar.costo_promedio}
                  onChange={(e) => setNuevaVar({ ...nuevaVar, costo_promedio: +e.target.value })} />
                <button className="btn btn-sm" onClick={crearVariante}>Guardar variante</button>
                <button className="btn-icon" onClick={() => setVarProductoId(null)}>Cancelar</button>
              </div>
            ) : (
              <button className="btn-icon" onClick={() => setVarProductoId(p.id)}>
                + Agregar otra variante
              </button>
            )}
          </div>
        </div>
      ))}
    </Layout>
  );
}
