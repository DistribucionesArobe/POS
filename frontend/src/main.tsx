import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Caja from "./pages/Caja";
import VentaNueva from "./pages/VentaNueva";
import Ventas from "./pages/Ventas";
import Cartera from "./pages/Cartera";
import Productos from "./pages/Productos";
import Clientes from "./pages/Clientes";
import Proveedores from "./pages/Proveedores";
import Compras from "./pages/Compras";
import Empresas from "./pages/Empresas";
import AutoFactura from "./pages/AutoFactura";
import Cotizaciones from "./pages/Cotizaciones";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/facturar" element={<AutoFactura />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="/caja" element={<Caja />} />
        <Route path="/venta" element={<VentaNueva />} />
        <Route path="/ventas" element={<Ventas />} />
        <Route path="/cotizaciones" element={<Cotizaciones />} />
        <Route path="/productos" element={<Productos />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/proveedores" element={<Proveedores />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/empresas" element={<Empresas />} />
        <Route path="/cartera" element={<Cartera />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
