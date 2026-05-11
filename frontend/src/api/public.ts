import axios from "axios";

// Cliente axios sin auth para endpoints publicos (portal de autofacturacion).
// No agrega token y NO redirige a /login en 401.
export const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});
