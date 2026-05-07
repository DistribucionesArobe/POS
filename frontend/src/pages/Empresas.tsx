import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type EmpresaT = {
  id: number; nombre: string; rfc: string; razon_social: string;
  regimen_fiscal: string; codigo_postal: string;
  facturama_user: string | null; facturama_api_url: string;
  activa: boolean;
};

const FORM_VACIO = {
  nombre: "", rfc: "", razon_social: "", regimen_fiscal: "626",
  codigo_postal: "", facturama_user: "", facturama_password: "",
  facturama_api_url: "https://apisandbox.facturama.com.mx",
};

const REGIMENES = [
  { v: "601", t: "601 - General de Ley Personas Morales" },
  { v: "603", t: "603 - PM con Fines no Lucrativos" },
  { v: "612", t: "612 - PF con Actividades Empresariales" },
  { v: "626", t: "626 - RESICO" },
];

export default function Empresas() {
  const [empresas, setEmpresas] = useState<EmpresaT[]>([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [editId, setEditId] = useState<number | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  async function cargar() {
    const r = await api.get("/api/empresas");
    setEmpresas(r.data);
  }

  useEffect(() => { cargar(); }, []);

  function abrirNueva() {
    setForm(FORM_VACIO);
    setEditId(null);
    setMostrarForm(true);
  }

  function abrirEditar(e: EmpresaT) {
    setForm({
      nombre: e.nombre, rfc: e.rfc, razon_social: e.razon_social,
      regimen_fiscal: e.regimen_fiscal, codigo_postal: e.codigo_postal,
      facturama_user: e.facturama_user || "",
      facturama_password: "",  // nunca se devuelve, dejar vacio = no cambiar
      facturama_api_url: e.facturama_api_url,
    });
    setEditId(e.id);
    setMostrarForm(true);
  }

  async function guardar() {
    if (!form.nombre || !form.rfc) return alert("Nombre y RFC son obligatorios");
    try {
      if (editId) {
        const payload: any = { ...form };
        if (!payload.facturama_password) delete payload.facturama_password;
        await api.patch(`/api/empresas/${editId}`, payload);
      } else {
        await api.post("/api/empresas", form);
      }
      setMostrarForm(false);
      cargar();
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message);
    }
  }

  return (
    <Layout
      title="Empresas"
      subtitle={`${empresas.length} empresa(s) registrada(s)`}
      actions={<button className="btn" onClick={abrirNueva}>+ Nueva empresa</button>}
    >
      {mostrarForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="card-header">{editId ? `Editar empresa #${editId}` : "Nueva empresa"}</h3>
          <div className="form-grid">
            <div>
              <label>Nombre *</label>
              <input className="input" placeholder="Ej. Aceromax" value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <label>RFC *</label>
              <input className="input" placeholder="13 caracteres" value={form.rfc}
                onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label>CP fiscal</label>
              <input className="input" placeholder="5 digitos" value={form.codigo_postal}
                onChange={(e) => setForm({ ...form, codigo_postal: e.target.value })} />
            </div>
            <div className="form-grid-full" style={{ gridColumn: "span 2" }}>
              <label>Razon social</label>
              <input className="input" placeholder="MAYUSCULAS, como en Constancia SF"
                value={form.razon_social}
                onChange={(e) => setForm({ ...form, razon_social: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label>Regimen fiscal</label>
              <select className="input" value={form.regimen_fiscal}
                onChange={(e) => setForm({ ...form, regimen_fiscal: e.target.value })}>
                {REGIMENES.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
              </select>
            </div>
            <div className="form-grid-full">
              <h4 style={{ margin: "12px 0 4px", fontSize: 14 }}>Credenciales Facturama</h4>
            </div>
            <div className="form-grid-full" style={{ gridColumn: "span 2" }}>
              <label>API URL</label>
              <input className="input" value={form.facturama_api_url}
                onChange={(e) => setForm({ ...form, facturama_api_url: e.target.value })} />
            </div>
            <div>
              <label>Usuario API</label>
              <input className="input" value={form.facturama_user}
                onChange={(e) => setForm({ ...form, facturama_user: e.target.value })} />
            </div>
            <div className="form-grid-full" style={{ gridColumn: "span 2" }}>
              <label>Password API {editId && "(deja vacio para no cambiar)"}</label>
              <input className="input" type="password"
                value={form.facturama_password}
                onChange={(e) => setForm({ ...form, facturama_password: e.target.value })} />
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
              <th>ID</th><th>Nombre</th><th>RFC</th><th>Regimen</th>
              <th>CP</th><th>Facturama</th><th>Activa</th><th></th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => (
              <tr key={e.id} style={{ opacity: e.activa ? 1 : 0.4 }}>
                <td><code>#{e.id}</code></td>
                <td>{e.nombre}</td>
                <td><code>{e.rfc}</code></td>
                <td><span className="badge badge-info">{e.regimen_fiscal}</span></td>
                <td>{e.codigo_postal}</td>
                <td>{e.facturama_user ? <span className="badge badge-success">conectada</span> : <span className="badge badge-warning">sin credenciales</span>}</td>
                <td>{e.activa ? "Si" : "No"}</td>
                <td>
                  <button className="btn-icon" onClick={() => abrirEditar(e)}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
