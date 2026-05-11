import { useEffect, useMemo, useRef, useState } from "react";
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
  const [familiasAbiertas, setFamiliasAbiertas] = useState<Record<string, boolean>>({});
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  // Agrupar por familia
  const familias = useMemo(() => {
    const grupos: Record<string, ProductoT[]> = {};
    for (const p of productos) {
      const key = p.categoria || "Sin familia";
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(p);
    }
    return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b));
  }, [productos]);

  function toggleFamilia(nombre: string) {
    setFamiliasAbiertas({ ...familiasAbiertas, [nombre]: !familiasAbiertas[nombre] });
  }

  function expandirTodas() {
    const todas: Record<string, boolean> = {};
    familias.forEach(([n]) => { todas[n] = true; });
    setFamiliasAbiertas(todas);
  }
  function colapsarTodas() {
    setFamiliasAbiertas({});
  }

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

  async function descargarPlantilla() {
    try {
      const r = await api.get("/api/productos/import/plantilla", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = "plantilla_productos.xlsx";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  async function importarExcel(file: File) {
    setImportando(true);
    setResultadoImport(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/api/productos/import", fd);
      setResultadoImport(r.data);
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Layout
      title="Productos"
      subtitle={`${productos.length} producto(s) en ${familias.length} familia(s)`}
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-icon" onClick={descargarPlantilla} title="Descarga XLSX vacia para llenar y subir">
            Plantilla XLSX
          </button>
          <button className="btn-icon" onClick={() => fileRef.current?.click()} disabled={importando}>
            {importando ? "Importando..." : "Importar Excel"}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm" style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && importarExcel(e.target.files[0])} />
          <button className="btn" onClick={() => setMostrarForm(!mostrarForm)}>
            {mostrarForm ? "Cancelar" : "+ Nuevo producto"}
          </button>
        </div>
      }
    >
      {resultadoImport && (
        <div className="card" style={{ marginBottom: 12, background: "#dcfce7", border: "1px solid #16a34a" }}>
          <strong>Importacion completada:</strong> {resultadoImport.creados} creados, {resultadoImport.actualizados} actualizados.
          {resultadoImport.errores?.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", color: "var(--color-danger)" }}>
                {resultadoImport.errores.length} errores (click para ver)
              </summary>
              <ul style={{ marginTop: 8, fontSize: 13 }}>
                {resultadoImport.errores.map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
          <button onClick={() => setResultadoImport(null)} style={{ marginTop: 8, background: "transparent", border: 0, cursor: "pointer", fontSize: 12, color: "var(--color-text-secondary)" }}>Cerrar</button>
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <input className="input" placeholder="Buscar por nombre o categoria..." value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()} />
          <button className="btn-icon" onClick={cargar}>Filtrar</button>
          <button className="btn-icon" onClick={expandirTodas}>Expandir todas</button>
          <button className="btn-icon" onClick={colapsarTodas}>Colapsar todas</button>
        </div>
      </div>

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 className="card-header">Nuevo producto</h3>
          <div className="form-grid">
            <div>
              <label>Nombre *</label>
              <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <label>SKU *</label>
              <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <label>Presentacion</label>
              <input className="input" value={form.presentacion} onChange={(e) => setForm({ ...form, presentacion: e.target.value })} />
            </div>
            <div>
              <label>Precio publico</label>
              <input className="input" type="number" value={form.precio_publico} onChange={(e) => setForm({ ...form, precio_publico: +e.target.value })} />
            </div>
            <div>
              <label>Costo</label>
              <input className="input" type="number" value={form.costo_promedio} onChange={(e) => setForm({ ...form, costo_promedio: +e.target.value })} />
            </div>
            <div>
              <label>Unidad</label>
              <input className="input" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} />
            </div>
            <div>
              <label>Familia (opcional)</label>
              <input className="input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
            </div>
            <div>
              <label>Marca (opcional)</label>
              <input className="input" value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
            </div>
            <div>
              <label>Clave SAT (opcional)</label>
              <input className="input" value={form.clave_prod_serv_sat} onChange={(e) => setForm({ ...form, clave_prod_serv_sat: e.target.value })} />
            </div>
          </div>
          <button className="btn" style={{ marginTop: 12 }} onClick={crearProducto}>Guardar</button>
        </div>
      )}

      {/* Familias colapsables */}
      <div className="card" style={{ padding: 0 }}>
        {familias.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}>
            Sin productos. Importa un Excel o crea uno manual.
          </div>
        ) : (
          familias.map(([nombreFamilia, prods]) => {
            const abierta = !!familiasAbiertas[nombreFamilia];
            const totalVars = prods.reduce((a, p) => a + p.variantes.length, 0);
            const totalStock = prods.reduce((a, p) => a + p.variantes.reduce((b, v) => b + v.stock_actual, 0), 0);
            return (
              <div key={nombreFamilia} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <div onClick={() => toggleFamilia(nombreFamilia)}
                  style={{
                    padding: "12px 20px", cursor: "pointer", display: "flex",
                    justifyContent: "space-between", alignItems: "center",
                    background: abierta ? "var(--color-bg)" : "white",
                    transition: "background 0.15s",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      display: "inline-block", width: 16, transform: abierta ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.15s",
                    }}>▶</span>
                    <strong style={{ fontSize: 15 }}>{nombreFamilia}</strong>
                    <span className="badge badge-info">{prods.length} producto(s)</span>
                    <span className="badge">{totalVars} variante(s)</span>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    Stock total: {totalStock.toLocaleString()}
                  </span>
                </div>
                {abierta && (
                  <div style={{ background: "white" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Producto</th><th>SKU</th><th>Presentacion</th>
                          <th>Unidad</th>
                          <th style={{ textAlign: "right" }}>Precio</th>
                          <th style={{ textAlign: "right" }}>Costo</th>
                          <th style={{ textAlign: "right" }}>Stock</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {prods.flatMap((p) => [
                          ...p.variantes.map((v) => (
                            <tr key={v.id} style={{ opacity: v.activo ? 1 : 0.4 }}>
                              <td>{p.nombre}</td>
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
                                <button className="btn-icon" onClick={() => cambiarPrecio(v.id, v.precio_publico)} style={{ marginRight: 2 }}>$</button>
                                {v.activo && <button className="btn-icon" onClick={() => desactivar(v.id)}>×</button>}
                              </td>
                            </tr>
                          )),
                          <tr key={`add-${p.id}`} style={{ background: "#fafbfc" }}>
                            <td colSpan={8}>
                              {varProductoId === p.id ? (
                                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 4 }}>
                                  <input className="input" placeholder="SKU" value={nuevaVar.sku} style={{ width: 160 }} onChange={(e) => setNuevaVar({ ...nuevaVar, sku: e.target.value })} />
                                  <input className="input" placeholder="Presentacion" value={nuevaVar.presentacion} style={{ width: 180 }} onChange={(e) => setNuevaVar({ ...nuevaVar, presentacion: e.target.value })} />
                                  <input className="input" type="number" placeholder="Precio" value={nuevaVar.precio_publico} style={{ width: 90 }} onChange={(e) => setNuevaVar({ ...nuevaVar, precio_publico: +e.target.value })} />
                                  <input className="input" type="number" placeholder="Costo" value={nuevaVar.costo_promedio} style={{ width: 90 }} onChange={(e) => setNuevaVar({ ...nuevaVar, costo_promedio: +e.target.value })} />
                                  <button className="btn btn-sm" onClick={crearVariante}>Guardar</button>
                                  <button className="btn-icon" onClick={() => setVarProductoId(null)}>Cancelar</button>
                                </div>
                              ) : (
                                <button className="btn-icon" style={{ fontSize: 12 }}
                                  onClick={() => setVarProductoId(p.id)}>
                                  + Variante a {p.nombre}
                                </button>
                              )}
                            </td>
                          </tr>
                        ])}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Layout>
  );
}
