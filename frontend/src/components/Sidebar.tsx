import { Link, useLocation, useNavigate } from "react-router-dom";

const Icon = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>,
  cart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  package: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.27 6.96 8.73 5.05 8.73-5.05"/><path d="M12 22.08V12"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  dollar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  logout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

const items = [
  { to: "/", label: "Dashboard", icon: Icon.dashboard },
  { to: "/venta", label: "Nueva venta", icon: Icon.cart },
  { to: "/productos", label: "Productos", icon: Icon.package },
  { to: "/clientes", label: "Clientes", icon: Icon.users },
  { to: "/cartera", label: "Cartera", icon: Icon.dollar },
];

export default function Sidebar() {
  const loc = useLocation();
  const nav = useNavigate();
  const nombre = localStorage.getItem("nombre") || "Usuario";
  const rol = "Admin";

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("nombre");
    nav("/login");
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-dot"></span>
        ACEROMAX
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
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-name">{nombre}</div>
          <div className="sidebar-user-rol">{rol}</div>
        </div>
        <button className="sidebar-link" onClick={logout}>
          {Icon.logout}
          <span>Cerrar sesion</span>
        </button>
      </div>
    </aside>
  );
}
