import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";

const Icon = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>,
  cart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  list: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  package: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.27 6.96 8.73 5.05 8.73-5.05"/><path d="M12 22.08V12"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  dollar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  building: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M5 21V5l7-2 7 2v16"/><path d="M9 9h.01M9 12h.01M9 15h.01M9 18h.01M13 9h.01M13 12h.01M13 15h.01M13 18h.01"/></svg>,
  logout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  chevron: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
};

const items = [
  { to: "/", label: "Dashboard", icon: Icon.dashboard },
  { to: "/venta", label: "Nueva venta", icon: Icon.cart },
  { to: "/ventas", label: "Mis ventas", icon: Icon.list },
  { to: "/productos", label: "Productos", icon: Icon.package },
  { to: "/clientes", label: "Clientes", icon: Icon.users },
  { to: "/cartera", label: "Cartera", icon: Icon.dollar },
];

interface Empresa { id: number; nombre: string; rfc: string; }

export default function Sidebar() {
  const loc = useLocation();
  const nav = useNavigate();
  const nombre = localStorage.getItem("nombre") || "Usuario";
  const rol = localStorage.getItem("rol") || "user";
  const superAdmin = localStorage.getItem("super_admin") === "true";

  let empresaActiva: Empresa | null = null;
  let empresas: Empresa[] = [];
  try {
    const ea = localStorage.getItem("empresa_activa");
    if (ea) empresaActiva = JSON.parse(ea);
    const es = localStorage.getItem("empresas");
    if (es) empresas = JSON.parse(es);
  } catch {}

  const [showEmpresaMenu, setShowEmpresaMenu] = useState(false);
  const puedeCambiar = empresas.length > 1;

  async function cambiarEmpresa(id: number) {
    try {
      const r = await api.post(`/api/auth/switch-empresa/${id}`);
      localStorage.setItem("token", r.data.access_token);
      localStorage.setItem("empresa_activa", JSON.stringify(r.data.empresa_activa));
      window.location.reload();
    } catch (err: any) {
      alert("Error al cambiar empresa: " + (err.response?.data?.detail || err.message));
    }
  }

  function logout() {
    localStorage.clear();
    nav("/login");
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-dot"></span>
        ACEROMAX
      </div>

      <div style={{ marginBottom: 24, position: "relative" }}>
        <button
          className="sidebar-link"
          style={{
            width: "100%", justifyContent: "space-between",
            background: "var(--color-sidebar-active)",
            cursor: puedeCambiar ? "pointer" : "default",
          }}
          onClick={() => puedeCambiar && setShowEmpresaMenu(!showEmpresaMenu)}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {Icon.building}
            <span style={{ fontSize: 13, fontWeight: 600, color: "white" }}>
              {empresaActiva?.nombre || "Sin empresa"}
            </span>
          </span>
          {puedeCambiar && (
            <span style={{ width: 14, height: 14 }}>{Icon.chevron}</span>
          )}
        </button>
        {showEmpresaMenu && puedeCambiar && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            background: "var(--color-sidebar-active)",
            borderRadius: 6, marginTop: 4, padding: 4, zIndex: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}>
            {empresas.map((e) => (
              <button
                key={e.id}
                className="sidebar-link"
                style={{
                  width: "100%", padding: "8px 12px",
                  background: e.id === empresaActiva?.id ? "var(--color-primary)" : "transparent",
                  color: "white",
                }}
                onClick={() => cambiarEmpresa(e.id)}
              >
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{e.nombre}</div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{e.rfc}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {items.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            className={`sidebar-link ${loc.pathname === it.to ? "active" : ""}`}
          >
            {it.icon}
            <span>{it.label}</span>
          </Link>
        ))}
        {superAdmin && (
          <Link
            to="/empresas"
            className={`sidebar-link ${loc.pathname === "/empresas" ? "active" : ""}`}
          >
            {Icon.building}
            <span>Empresas</span>
          </Link>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-name">{nombre}</div>
          <div className="sidebar-user-rol">{superAdmin ? "SUPER ADMIN" : rol.toUpperCase()}</div>
        </div>
        <button className="sidebar-link" onClick={logout}>
          {Icon.logout}
          <span>Cerrar sesion</span>
        </button>
      </div>
    </aside>
  );
}
