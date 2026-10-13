import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      // Evitar bucle en /login y mensaje claro al usuario
      localStorage.removeItem("token");
      if (!window.location.pathname.startsWith("/login")) {
        alert("Tu sesion caduco. Vuelve a iniciar sesion para continuar.");
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);
