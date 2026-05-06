import { ReactNode } from "react";

interface Props {
  label: string;
  value: string | number;
  meta?: string;
  icon: ReactNode;
}

export default function StatCard({ label, value, meta, icon }: Props) {
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <div className="stat-label">{label}</div>
        <div className="stat-icon">{icon}</div>
      </div>
      <div className="stat-value">{value}</div>
      {meta && <div className="stat-meta">{meta}</div>}
    </div>
  );
}
