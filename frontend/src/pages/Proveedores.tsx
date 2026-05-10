import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type ProveedorT = {
  id: number; nombre: string; rfc: string | null; razon_social: string | null;
  correo: string | null; telefono: string | null; dias_credito: number; activo: boolean;
};

const FORM_VACIO = {
  nombre: "", rfc: "", razon_social: "", correo: "", telefono: "",
  direccion: "", dias_credito: 30,
};

export default function Proveedores() {
  const [proveedores, setProveedores] = useState<ProveedorT[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState(FORM_VACIO);
  const [editId, setEditId] = useState<number | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  async function cargar() {
    const r = await api.get("/api/proveedores", { params: { q: busqueda || undefined } });
    setProveedores(r.data);
  }

  useEffect(() => { cargar(); }, []);

  function abrirNuevo() {
    setForm(FORM_VACIO);
    setEditId(null);
    setMostrarForm(true);
  }

  async function abrirEditar(id: number) {
    const r = await api.get(`/api/proveedores/${id}`);
    setForm({ ...FORM_VACIO, ...r.data });
    setEditId(id);
    setMostrarForm(true);
  }

  async function guardar() {
    if (!form.nombre) return alert("Nombre es obligatorio");
    try {
      if (editId) {
        await api.patch(`/api/proveedores/${editId}`, form);
      } else {
        await api.post("/api/proveedores", form);
      }
      setMostrarForm(false);
      cargar();
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message);
    }
  }

  async function desactivar(id: number) {
    if (!confirm("Desactivar este proveedor?")) return;
    await api.delete(`/api/proveedores/${id}`);
    cargar();
  }

  return (
    <Layout
      title="Proveedores"
      subtitle={`${proveedores.length} proveedor(es)`}
      actions={<button className="btn" onClick={abrirNuevo}>+ Nuevo proveedor</button>}
    >
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <input className="input" placeholder="Buscar por nombre o RFC..." value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()} />
          <button className="btn-icon" onClick={cargar}>Filtrar</button>
        </div>
      </div>

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="card-header">{editId ? `Editar #${editId}` : "Nuevo proveedor"}</h3>
          <div className="form-grid">
            <div className="form-grid-full" style={{ gridColumn: "span 2" }}>
              <label>Nombre / Razón social *</label>
              <input className="input" value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <label>RFC</label>
              <input className="input" value={form.rfc}
                onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label>Razón social fiscal</label>
              <input className="input" placeholder="Si difiere del nombre comercial"
                value={form.razon_social}
                onChange={(e) => setForm({ ...form, razon_social: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label>Correo</label>
              <input className="input" value={form.correo}
                onChange={(e) => setForm({ ...form, correo: e.target.value })} />
            </div>
            <div>
              <label>Teléfono</label>
              <input className="input" value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </div>
            <div>
              <label>Días crédito</label>
              <input className="input" type="number" value={form.dias_credito}
                onChange={(e) => setForm({ ...form, dias_credito: +e.target.value })} />
            </div>
            <div className="form-grid-full">
              <label>Dirección</label>
              <input className="input" value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button className="btn" onClick={guardar}>Guardar</button>
            <button className="btn-icon" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Nombre</th><th>RFC</th><th>Correo</th>
              <th>Teléfono</th><th>Días cred.</th><th></th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => (
              <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.4 }}>
                <td><code>#{p.id}</code></td>
                <td>{p.nombre}</td>
                <td>{p.rfc || "-"}</td>
                <td>{p.correo || "-"}</td>
                <td>{p.telefono || "-"}</td>
                <td>{p.dias_credito}</td>
                <td>
                  <button className="btn-icon" onClick={() => abrirEditar(p.id)} style={{ marginRight: 4 }}>Editar</button>
                  {p.activo && <button className="btn-icon" onClick={() => desactivar(p.id)}>Desactivar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
