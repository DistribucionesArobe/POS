import { ReactNode } from "react";
import Sidebar from "./Sidebar";

interface Props {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function Layout({ children, title, subtitle, actions }: Props) {
  const today = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="app-layout">
      <Sidebar />
      <div>
        <header className="app-header">
          <div>
            <div className="app-header-title">{title}</div>
            {subtitle && <div className="page-subtitle" style={{ margin: 0 }}>{subtitle}</div>}
          </div>
          <div className="app-header-meta">
            {actions}
            <span style={{ textTransform: "capitalize" }}>{today}</span>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
