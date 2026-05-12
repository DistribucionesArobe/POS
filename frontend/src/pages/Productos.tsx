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
  const [ocultarInactivos, setOcultarInactivos] = useState(true);
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // IA - sugerencias de clave SAT
  const [sugiriendoSat, setSugiriendoSat] = useState(false);
  const [propuestasSat, setPropuestasSat] = useState<any[] | null>(null);
  const [aprobadas, setAprobadas] = useState<Record<number, boolean>>({});
  const [aplicandoSat, setAplicandoSat] = useState(false);

  const [varProductoId, setVarProductoId] = useState<number | null>(null);
  const [nuevaVar, setNuevaVar] = useState({
    sku: "", presentacion: "", unidad: "PZA", clave_unidad_sat: "H87",
    precio_publico: 0, costo_promedio: 0,
  });

  // Modal de edicion full
  const [editandoVar, setEditandoVar] = useState<{ producto: ProductoT; variante: Variante } | null>(null);

  async function cargar() {
    const r = await api.get("/api/productos", { params: { q: busqueda || undefined } });
    setProductos(r.data);
  }

  useEffect(() => { cargar(); }, []);

  // Conteo total de variantes inactivas (antes de filtrar) para mostrarlo en el toggle
  const inactivasCount = useMemo(
    () => productos.reduce((acc, p) => acc + p.variantes.filter((v) => !v.activo).length, 0),
    [productos],
  );

  // Agrupar por familia (aplicando filtro de inactivos si aplica)
  const familias = useMemo(() => {
    const grupos: Record<string, ProductoT[]> = {};
    for (const p of productos) {
      const variantesVisibles = ocultarInactivos
        ? p.variantes.filter((v) => v.activo)
        : p.variantes;
      if (variantesVisibles.length === 0) continue;
      const prodFiltrado: ProductoT = { ...p, variantes: variantesVisibles };
      const key = p.categoria || "Sin familia";
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(prodFiltrado);
    }
    return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b));
  }, [productos, ocultarInactivos]);

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

  async function borrarPermanente(varianteId: number, sku: string) {
    const ok = confirm(
      `BORRAR PERMANENTEMENTE la variante "${sku}"?\n\n` +
      `Esto elimina el registro del DB de forma DEFINITIVA.\n` +
      `Solo funciona si NUNCA se ha usado en ventas, compras ni kardex.\n` +
      `Si tiene historial, usa "Desactivar" (×) en su lugar.\n\n` +
      `Continuar?`
    );
    if (!ok) return;
    try {
      const r = await api.delete(`/api/productos/variantes/${varianteId}/permanente`);
      if (r.data?.producto_borrado_tambien) {
        alert("Variante y producto borrados (era la unica variante).");
      } else {
        alert("Variante borrada permanentemente.");
      }
      cargar();
    } catch (err: any) {
      alert("No se pudo borrar: " + (err.response?.data?.detail || err.message));
    }
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

  async function sugerirClaveSatIndividual() {
    if (!form.nombre) return alert("Captura el nombre primero");
    setSugiriendoSat(true);
    try {
      const r = await api.post("/api/productos/sugerir-clave-sat", {
        nombre: form.nombre,
        categoria: form.categoria,
        marca: form.marca,
      });
      const ok = confirm(
        `Sugerencia (confianza ${r.data.confianza}):\n\n${r.data.clave} — ${r.data.descripcion}\n\nUsar esta clave?`
      );
      if (ok) setForm({ ...form, clave_prod_serv_sat: r.data.clave });
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setSugiriendoSat(false);
    }
  }

  async function abrirSugerenciasBulk() {
    setSugiriendoSat(true);
    setPropuestasSat(null);
    try {
      const r = await api.post("/api/productos/asignar-claves-sat-bulk?aplicar=false");
      const props = r.data.propuestas;
      if (!props || props.length === 0) {
        alert(r.data.mensaje || "Todos los productos ya tienen clave SAT");
        return;
      }
      setPropuestasSat(props);
      // Por default aprobamos las de confianza alta
      const aprob: Record<number, boolean> = {};
      props.forEach((p: any) => { aprob[p.producto_id] = p.confianza === "alta"; });
      setAprobadas(aprob);
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setSugiriendoSat(false);
    }
  }

  async function aplicarPropuestasSeleccionadas() {
    if (!propuestasSat) return;
    const seleccionadas = propuestasSat.filter((p) => aprobadas[p.producto_id]);
    if (seleccionadas.length === 0) return alert("Selecciona al menos una propuesta");
    setAplicandoSat(true);
    try {
      // Aplicar producto por producto via PATCH (no tenemos endpoint masivo, lo agregamos via crear con clave)
      // Mejor: llamar al bulk con aplicar=true y dejar que el backend lo haga
      // Pero el bulk re-genera todo, mas costo. Hacemos PATCH individual:
      for (const p of seleccionadas) {
        // No tenemos PATCH de producto, usamos un endpoint generico - por ahora hacemos via SQL del backend
        // Solucion mas rapida: el backend ya tiene asignar-claves-sat-bulk con aplicar=true
        // que aplica TODAS las propuestas, no solo las seleccionadas. Workaround:
        await api.patch(`/api/productos/${p.producto_id}/clave-sat`, { clave: p.clave_sugerida });
      }
      alert(`${seleccionadas.length} clave(s) aplicadas`);
      setPropuestasSat(null);
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setAplicandoSat(false);
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
          <button className="btn-icon" onClick={abrirSugerenciasBulk} disabled={sugiriendoSat}
            title="Sugiere claves SAT con IA para todos los productos sin clave">
            {sugiriendoSat ? "..." : "🪄 Asignar SAT con IA"}
          </button>
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
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginLeft: 8, cursor: "pointer", whiteSpace: "nowrap" }}
            title="Oculta variantes desactivadas (siguen en DB para trazabilidad fiscal)">
            <input type="checkbox" checked={ocultarInactivos}
              onChange={(e) => setOcultarInactivos(e.target.checked)} />
            Ocultar inactivos
            {inactivasCount > 0 && (
              <span className="badge" style={{ fontSize: 11 }}>{inactivasCount}</span>
            )}
          </label>
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
              <div style={{ display: "flex", gap: 4 }}>
                <input className="input" value={form.clave_prod_serv_sat}
                  onChange={(e) => setForm({ ...form, clave_prod_serv_sat: e.target.value })} />
                <button type="button" className="btn-icon" onClick={sugerirClaveSatIndividual}
                  disabled={sugiriendoSat || !form.nombre} title="Sugerir con IA"
                  style={{ whiteSpace: "nowrap" }}>
                  {sugiriendoSat ? "..." : "🪄 IA"}
                </button>
              </div>
            </div>
          </div>
          <button className="btn" style={{ marginTop: 12 }} onClick={crearProducto}>Guardar</button>
        </div>
      )}

      {/* Modal de propuestas SAT bulk */}
      {propuestasSat && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setPropuestasSat(null)}>
          <div className="card" style={{ maxWidth: 900, width: "94%", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="card-header">🪄 Propuestas de claves SAT</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              {propuestasSat.length} producto(s) sin clave. Las de confianza <strong>alta</strong> ya están seleccionadas; revisa las demás.
            </p>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Producto</th>
                  <th>Familia</th>
                  <th>Clave sugerida</th>
                  <th>Descripción SAT</th>
                  <th>Confianza</th>
                </tr>
              </thead>
              <tbody>
                {propuestasSat.map((p) => (
                  <tr key={p.producto_id}>
                    <td>
                      <input type="checkbox" checked={!!aprobadas[p.producto_id]}
                        onChange={(e) => setAprobadas({ ...aprobadas, [p.producto_id]: e.target.checked })} />
                    </td>
                    <td>{p.nombre}</td>
                    <td>{p.categoria || "-"}</td>
                    <td><code>{p.clave_sugerida}</code></td>
                    <td style={{ fontSize: 12 }}>{p.descripcion_sat}</td>
                    <td>
                      <span className={`badge ${
                        p.confianza === "alta" ? "badge-success" :
                        p.confianza === "media" ? "badge-warning" : "badge-danger"
                      }`}>{p.confianza}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="btn" disabled={aplicandoSat} onClick={aplicarPropuestasSeleccionadas}>
                {aplicandoSat ? "Aplicando..." : `Aplicar ${Object.values(aprobadas).filter(Boolean).length} seleccionada(s)`}
              </button>
              <button className="btn-icon" onClick={() => setPropuestasSat(null)}>Cancelar</button>
            </div>
          </div>
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
                                <button className="btn-icon" onClick={() => setEditandoVar({ producto: p, variante: v })}
                                  title="Editar producto y variante" style={{ marginRight: 2 }}>✎ Editar</button>
                                <button className="btn-icon" onClick={() => cambiarPrecio(v.id, v.precio_publico)}
                                  title="Cambiar precio rápido" style={{ marginRight: 2 }}>$</button>
                                {v.activo && <button className="btn-icon" onClick={() => desactivar(v.id)} title="Desactivar (mantiene historial)" style={{ marginRight: 2 }}>×</button>}
                                <button className="btn-icon" onClick={() => borrarPermanente(v.id, v.sku)} title="Borrar permanente (solo sin historial)" style={{ color: "var(--color-danger)" }}>🗑</button>
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

      {editandoVar && (
        <EditarVarianteModal
          producto={editandoVar.producto}
          variante={editandoVar.variante}
          onClose={() => setEditandoVar(null)}
          onSaved={() => { setEditandoVar(null); cargar(); }}
        />
      )}
    </Layout>
  );
}


function EditarVarianteModal({ producto, variante, onClose, onSaved }: {
  producto: ProductoT; variante: Variante;
  onClose: () => void; onSaved: () => void;
}) {
  // Producto fields
  const [nombre, setNombre] = useState(producto.nombre);
  const [categoria, setCategoria] = useState(producto.categoria || "");
  const [marca, setMarca] = useState(producto.marca || "");
  const [claveSat, setClaveSat] = useState(producto.clave_prod_serv_sat || "");

  // Variante fields
  const [sku, setSku] = useState(variante.sku);
  const [presentacion, setPresentacion] = useState(variante.presentacion);
  const [unidad, setUnidad] = useState(variante.unidad);
  const [precioPublico, setPrecioPublico] = useState(variante.precio_publico);
  const [precioMayoreo, setPrecioMayoreo] = useState(variante.precio_mayoreo ?? 0);
  const [costoPromedio, setCostoPromedio] = useState(variante.costo_promedio);
  const [stockMinimo, setStockMinimo] = useState(variante.stock_minimo);
  const [activo, setActivo] = useState(variante.activo);
  const [busy, setBusy] = useState(false);

  async function guardar() {
    if (!nombre.trim()) return alert("El nombre del producto es obligatorio");
    if (!sku.trim()) return alert("El SKU es obligatorio");
    setBusy(true);
    try {
      await api.patch(`/api/productos/${producto.id}`, {
        nombre: nombre.trim(),
        categoria: categoria.trim() || null,
        marca: marca.trim() || null,
        clave_prod_serv_sat: claveSat.trim() || null,
      });
      await api.patch(`/api/productos/variantes/${variante.id}`, {
        sku: sku.trim(),
        presentacion: presentacion.trim(),
        unidad: unidad.trim(),
        precio_publico: +precioPublico,
        precio_mayoreo: +precioMayoreo || null,
        costo_promedio: +costoPromedio,
        stock_minimo: +stockMinimo,
        activo,
      });
      onSaved();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "white", maxWidth: 720, width: "94%", maxHeight: "90vh",
          overflow: "auto", padding: 24, borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Editar producto y variante</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
              <strong>{producto.nombre}</strong> · {variante.sku}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <h4 style={{ margin: "12px 0 8px", fontSize: 14, color: "var(--color-text-secondary)" }}>Producto</h4>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="form-grid-full">
            <label>Nombre *</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <label>Familia / Categoría</label>
            <input className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
          </div>
          <div>
            <label>Marca</label>
            <input className="input" value={marca} onChange={(e) => setMarca(e.target.value)} />
          </div>
          <div className="form-grid-full">
            <label>Clave SAT (8 dígitos)</label>
            <input className="input" maxLength={8} value={claveSat}
              onChange={(e) => setClaveSat(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>

        <h4 style={{ margin: "16px 0 8px", fontSize: 14, color: "var(--color-text-secondary)" }}>Variante</h4>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>
            <label>SKU *</label>
            <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div>
            <label>Presentación</label>
            <input className="input" value={presentacion} onChange={(e) => setPresentacion(e.target.value)} />
          </div>
          <div>
            <label>Unidad</label>
            <input className="input" value={unidad} onChange={(e) => setUnidad(e.target.value)} />
          </div>
          <div>
            <label>Precio público</label>
            <input className="input" type="number" step="0.01" value={precioPublico}
              onChange={(e) => setPrecioPublico(+e.target.value)} />
          </div>
          <div>
            <label>Precio mayoreo</label>
            <input className="input" type="number" step="0.01" value={precioMayoreo}
              onChange={(e) => setPrecioMayoreo(+e.target.value)} />
          </div>
          <div>
            <label>Costo promedio</label>
            <input className="input" type="number" step="0.01" value={costoPromedio}
              onChange={(e) => setCostoPromedio(+e.target.value)} />
          </div>
          <div>
            <label>Stock mínimo</label>
            <input className="input" type="number" step="1" value={stockMinimo}
              onChange={(e) => setStockMinimo(+e.target.value)} />
          </div>
          <div style={{ display: "flex", alignItems: "end" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              Activo
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button className="btn" disabled={busy} onClick={guardar} style={{ flex: 1, justifyContent: "center" }}>
            {busy ? "Guardando..." : "Guardar cambios"}
          </button>
          <button className="btn-icon" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
