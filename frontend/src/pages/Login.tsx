import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("username", email);
      fd.append("password", password);
      const r = await api.post("/api/auth/login", fd);
      localStorage.setItem("token", r.data.access_token);
      localStorage.setItem("nombre", r.data.nombre);
      localStorage.setItem("rol", r.data.rol);
      localStorage.setItem("super_admin", String(!!r.data.super_admin));
      localStorage.setItem("empresa_activa", JSON.stringify(r.data.empresa_activa));
      localStorage.setItem("empresas", JSON.stringify(r.data.empresas));
      nav("/");
    } catch {
      setErr("Credenciales invalidas");
      setLoading(false);
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <h1 className="login-title">ACEROMAX POS</h1>
        <p className="login-subtitle">Multi-empresa · CFDI 4.0</p>
        <form onSubmit={submit} className="login-form">
          <div>
            <label>Correo</label>
            <input className="input" type="email" autoFocus value={email}
              onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label>Contrasena</label>
            <input className="input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {err && <div className="error-msg">{err}</div>}
          <button className="btn" type="submit" disabled={loading} style={{ justifyContent: "center" }}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
