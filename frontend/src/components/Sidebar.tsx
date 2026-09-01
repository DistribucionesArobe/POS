import React, { useState } from "react";
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
  key: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
};

// Items del sidebar. Cada uno tiene 'roles' (que roles lo ven) o si es undefined lo ven todos.
// Roles: 'cajero' | 'admin' | 'super_admin'. super_admin ve TODO siempre.
const items = [
  { to: "/", label: "Dashboard", icon: Icon.dashboard, roles: ["admin"] },
  { to: "/inbox", label: "Mensajes Ventas", icon: Icon.chat, showBadge: true, roles: ["cajero", "admin"] },
  { to: "/mostrador", label: "Mostrador (tablet)", icon: Icon.cart, roles: ["cajero", "admin"] },
  { to: "/caja", label: "Caja rapida", icon: Icon.cart, roles: ["cajero", "admin"] },
  { to: "/venta", label: "Nueva venta", icon: Icon.cart, roles: ["admin"] },
  { to: "/cotizaciones", label: "Cotizaciones", icon: Icon.list, roles: ["admin"] },
  { to: "/ventas", label: "Mis ventas", icon: Icon.list, roles: ["cajero", "admin"] },
  { to: "/productos", label: "Productos", icon: Icon.package, roles: ["admin"] },
  { to: "/clientes", label: "Clientes", icon: Icon.users, roles: ["admin"] },
  { to: "/proveedores", label: "Proveedores", icon: Icon.users, roles: ["admin"] },
  { to: "/compras", label: "Compras y CxP", icon: Icon.package, roles: ["admin"] },
  { to: "/cxp-tablero", label: "Tablero CxP", icon: Icon.dollar, roles: ["admin"] },
  { to: "/cartera", label: "Cartera", icon: Icon.dollar, roles: ["admin"] },
  { to: "/monedero", label: "Monedero", icon: Icon.dollar, roles: ["admin"] },
  { to: "/corte", label: "Corte de caja", icon: Icon.dollar, roles: ["cajero", "admin"] },
  { to: "/reportes", label: "Reportes", icon: Icon.list, roles: ["admin"] },
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
  const [mostrarCambioPwd, setMostrarCambioPwd] = useState(false);
  const [noLeidos, setNoLeidos] = useState<number>(0);
  const puedeCambiar = empresas.length > 1;

  // Poll cada 30s para actualizar el badge de Mensajes Ventas
  React.useEffect(() => {
    let alive = true;
    async function fetch() {
      try {
        const r = await api.get("/api/inbox/contador-no-leidos");
        if (alive) setNoLeidos(r.data?.total || 0);
      } catch {
        if (alive) setNoLeidos(0);
      }
    }
    fetch();
    const iv = setInterval(fetch, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

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
        {items.filter((it) => {
          // Super admin ve todo
          if (superAdmin) return true;
          // Si el item no tiene 'roles', lo ven todos
          if (!(it as any).roles) return true;
          // Si el rol del usuario esta en la lista, lo ve
          return (it as any).roles.includes(rol);
        }).map((it) => (
          <Link
            key={it.to}
            to={it.to}
            className={`sidebar-link ${loc.pathname === it.to ? "active" : ""}`}
          >
            {it.icon}
            <span style={{ flex: 1 }}>{it.label}</span>
            {(it as any).showBadge && noLeidos > 0 && (
              <span style={{
                background: "#dc2626", color: "white",
                fontSize: 10, fontWeight: 700,
                padding: "1px 7px", borderRadius: 10,
                minWidth: 16, textAlign: "center",
              }}>{noLeidos > 99 ? "99+" : noLeidos}</span>
            )}
          </Link>
        ))}
        {(rol === "admin" || superAdmin) && (
          <Link
            to="/activos"
            className={`sidebar-link ${loc.pathname === "/activos" ? "active" : ""}`}
          >
            {Icon.package}
            <span>Activos</span>
          </Link>
        )}
        {(rol === "admin" || superAdmin) && (
          <Link
            to="/tarjetas"
            className={`sidebar-link ${loc.pathname === "/tarjetas" ? "active" : ""}`}
          >
            {Icon.dollar}
            <span>Tarjetas crédito</span>
          </Link>
        )}
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
        <button className="sidebar-link" onClick={() => setMostrarCambioPwd(true)}>
          {Icon.key}
          <span>Cambiar contrasena</span>
        </button>
        <button className="sidebar-link" onClick={logout}>
          {Icon.logout}
          <span>Cerrar sesion</span>
        </button>
      </div>
      {mostrarCambioPwd && (
        <CambiarPasswordModal onClose={() => setMostrarCambioPwd(false)} />
      )}
    </aside>
  );
}


function CambiarPasswordModal({ onClose }: { onClose: () => void }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function guardar() {
    setError(null);
    if (!actual) return setError("Captura tu contrasena actual");
    if (nueva.length < 6) return setError("La nueva contrasena debe tener al menos 6 caracteres");
    if (nueva !== confirmar) return setError("Las contrasenas nuevas no coinciden");
    if (nueva === actual) return setError("La nueva contrasena debe ser distinta a la actual");
    setBusy(true);
    try {
      await api.post("/api/auth/cambiar-password", {
        password_actual: actual,
        password_nuevo: nueva,
      });
      setOk(true);
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 10, padding: 24,
        width: "90%", maxWidth: 420, color: "#0f172a",
      }}>
        <h3 style={{ margin: "0 0 4px" }}>Cambiar contrasena</h3>
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 0 }}>
          Minimo 6 caracteres. Te recomendamos mezclar letras, numeros y un simbolo.
        </p>
        {ok ? (
          <div style={{ padding: 16, background: "#d1fae5", color: "#065f46", borderRadius: 6, textAlign: "center", fontWeight: 600 }}>
            Contrasena actualizada
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Contrasena actual</label>
              <input type="password" autoFocus value={actual} onChange={(e) => setActual(e.target.value)}
                style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Nueva contrasena</label>
              <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)}
                style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Confirma la nueva contrasena</label>
              <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && guardar()}
                style={inputStyle} />
            </div>
            {error && (
              <div style={{ padding: 8, background: "#fee2e2", color: "#991b1b", borderRadius: 4, fontSize: 13, marginBottom: 10 }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={guardar} disabled={busy}
                style={{
                  flex: 1, padding: "10px 16px", background: busy ? "#94a3b8" : "#10b981",
                  color: "white", border: 0, borderRadius: 6, fontSize: 14, fontWeight: 600,
                  cursor: busy ? "wait" : "pointer",
                }}>
                {busy ? "Guardando..." : "Cambiar contrasena"}
              </button>
              <button onClick={onClose} disabled={busy}
                style={{
                  padding: "10px 16px", background: "transparent",
                  color: "#475569", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, cursor: "pointer",
                }}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 14,
  border: "1px solid #cbd5e1", borderRadius: 4, marginTop: 4,
};
