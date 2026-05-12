import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Area = {
  titulo: string;
  color: string;
  icono: string;
  reportes: Reporte[];
};

type Reporte = {
  id: string;
  nombre: string;
  descripcion: string;
  // Si tiene ruta, abre una pantalla dedicada. Si tiene url, baja XLSX directo.
  ruta?: string;
  urlXlsx?: string;
};

const AREAS: Area[] = [
  {
    titulo: "Ventas",
    color: "#2563eb",
    icono: "💰",
    reportes: [
      {
        id: "diario",
        nombre: "Reporte diario de facturas",
        descripcion: "Facturas del día agrupadas por forma de pago. Total general al final.",
        ruta: "/reportes/diario",
      },
      {
        id: "ventas-xlsx",
        nombre: "Ventas (mes actual)",
        descripcion: "Lista completa de ventas del mes con cliente, RFC, totales.",
        urlXlsx: "/api/reportes/ventas-xlsx",
      },
      {
        id: "top-productos",
        nombre: "Top productos del mes",
        descripcion: "Productos más vendidos por cantidad y monto.",
        ruta: "/dashboard",
      },
    ],
  },
  {
    titulo: "Cobranza / Cartera",
    color: "#dc2626",
    icono: "📋",
    reportes: [
      {
        id: "cartera-abierta",
        nombre: "Cartera abierta",
        descripcion: "Cuentas por cobrar pendientes con cliente, saldo, antigüedad.",
        urlXlsx: "/api/reportes/cartera-xlsx",
      },
      {
        id: "cartera-pantalla",
        nombre: "Cartera (ver en pantalla)",
        descripcion: "Vista interactiva con botón de Abonar y emitir complemento.",
        ruta: "/cartera",
      },
    ],
  },
  {
    titulo: "Caja",
    color: "#16a34a",
    icono: "🧾",
    reportes: [
      {
        id: "corte-hoy",
        nombre: "Corte de caja del día",
        descripcion: "Desglose por forma de pago, efectivo esperado vs real, diferencia.",
        ruta: "/corte",
      },
      {
        id: "cortes-xlsx",
        nombre: "Historial de cortes (XLSX)",
        descripcion: "Histórico mensual de cierres con diferencias por cajero.",
        urlXlsx: "/api/reportes/cortes-xlsx",
      },
    ],
  },
  {
    titulo: "Inventario",
    color: "#7c3aed",
    icono: "📦",
    reportes: [
      {
        id: "productos",
        nombre: "Catálogo de productos",
        descripcion: "Ver y editar productos, stock, precios, claves SAT.",
        ruta: "/productos",
      },
    ],
  },
  {
    titulo: "Compras y CxP",
    color: "#ea580c",
    icono: "📥",
    reportes: [
      {
        id: "compras",
        nombre: "Compras y CxP",
        descripcion: "Compras del mes, proveedores, cuentas por pagar pendientes.",
        ruta: "/compras",
      },
    ],
  },
  {
    titulo: "Clientes",
    color: "#0891b2",
    icono: "👥",
    reportes: [
      {
        id: "clientes",
        nombre: "Catálogo de clientes",
        descripcion: "Lista de clientes, RFC, saldo, contactos.",
        ruta: "/clientes",
      },
    ],
  },
  {
    titulo: "Fiscal / CFDI",
    color: "#9333ea",
    icono: "🧾",
    reportes: [
      {
        id: "facturas-emitidas",
        nombre: "Facturas timbradas",
        descripcion: "Lista de facturas con UUID, serie-folio y estado SAT.",
        ruta: "/ventas?tipo=FACTURA",
      },
      {
        id: "complementos",
        nombre: "Complementos de pago (CFDI tipo P)",
        descripcion: "Pagos parciales reportados al SAT por facturas PPD.",
        ruta: "/cartera",
      },
    ],
  },
];

async function descargarXlsx(url: string) {
  const r = await api.get(url, { responseType: "blob" });
  const blobUrl = URL.createObjectURL(r.data);
  const a = document.createElement("a");
  const filename = url.split("/").pop()?.replace("-xlsx", "") + ".xlsx";
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

export default function Reportes() {
  const nav = useNavigate();

  function abrir(r: Reporte) {
    if (r.urlXlsx) descargarXlsx(r.urlXlsx);
    else if (r.ruta) nav(r.ruta);
  }

  return (
    <Layout title="Reportes" subtitle="Reportes operativos y fiscales por área del POS">
      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
        {AREAS.map((a) => (
          <div key={a.titulo} className="card" style={{ borderLeft: `4px solid ${a.color}`, padding: 0 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--color-border)",
              display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>{a.icono}</span>
              <h3 style={{ margin: 0, color: a.color }}>{a.titulo}</h3>
            </div>
            <div style={{ padding: 0 }}>
              {a.reportes.map((r) => (
                <button key={r.id} onClick={() => abrir(r)}
                  style={{
                    display: "block", width: "100%", padding: "14px 18px",
                    background: "transparent", border: 0, borderBottom: "1px solid var(--color-border)",
                    textAlign: "left", cursor: "pointer", transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: 14 }}>{r.nombre}</strong>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                      {r.urlXlsx ? "⬇ XLSX" : "→"}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {r.descripcion}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
