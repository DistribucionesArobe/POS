import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const fd = new FormData();
      fd.append("username", email);
      fd.append("password", password);
      const r = await api.post("/api/auth/login", fd);
      localStorage.setItem("token", r.data.access_token);
      localStorage.setItem("nombre", r.data.nombre);
      nav("/");
    } catch {
      setErr("Credenciales invalidas");
    }
  }

  return (
    <div className="container" style={{ maxWidth: 360, marginTop: 80 }}>
      <h1>Aceromax POS</h1>
      <form onSubmit={submit} className="card" style={{ display: "grid", gap: 12 }}>
        <input className="input" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" type="password" placeholder="Contrasena" value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <div style={{ color: "#dc2626" }}>{err}</div>}
        <button className="btn" type="submit">Entrar</button>
      </form>
    </div>
  );
}
