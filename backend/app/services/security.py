"""Auth y contexto de empresa activa por request."""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Usuario, Empresa

settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _decode(token: str | None) -> dict:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token faltante")
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token invalido")


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Usuario:
    payload = _decode(token)
    email = payload.get("sub")
    user = db.query(Usuario).filter(Usuario.email == email, Usuario.activo == True).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no encontrado")
    return user


def get_active_empresa_id(
    token: str | None = Depends(oauth2_scheme),
) -> int:
    """Empresa activa segun el JWT. Todos los routers la usan para filtrar."""
    payload = _decode(token)
    empresa_id = payload.get("empresa_id")
    if not empresa_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token sin empresa activa")
    return int(empresa_id)


def get_active_empresa(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
) -> Empresa:
    e = db.get(Empresa, empresa_id)
    if not e or not e.activa:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Empresa inactiva o no existe")
    return e


def require_admin(user: Usuario = Depends(get_current_user)) -> Usuario:
    if user.rol != "admin" and not user.super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo administradores")
    return user


def empresas_accesibles(db: Session, user: Usuario) -> list[Empresa]:
    """Lista de empresas que el usuario puede operar."""
    if user.super_admin:
        return db.query(Empresa).filter(Empresa.activa == True).order_by(Empresa.nombre).all()
    if user.empresa_id:
        e = db.get(Empresa, user.empresa_id)
        return [e] if e and e.activa else []
    return []
