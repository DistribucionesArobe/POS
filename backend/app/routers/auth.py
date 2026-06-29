"""Auth: login y emision de JWT con empresa activa."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Usuario, Empresa
from app.services.security import get_current_user, empresas_accesibles

router = APIRouter()
settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def create_access_token(sub: str, rol: str, empresa_id: int, super_admin: bool) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": sub, "rol": rol, "empresa_id": empresa_id,
        "super_admin": super_admin, "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(Usuario.email == form.username).first()
    if not user or not user.activo or not verify_password(form.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciales invalidas")

    empresas = empresas_accesibles(db, user)
    if not empresas:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Usuario sin empresa asignada")

    # Empresa activa por default: la del usuario, o la primera si super_admin
    empresa_activa = next((e for e in empresas if e.id == user.empresa_id), empresas[0])

    token = create_access_token(
        sub=user.email, rol=user.rol,
        empresa_id=empresa_activa.id, super_admin=user.super_admin,
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "rol": user.rol,
        "nombre": user.nombre,
        "super_admin": user.super_admin,
        "empresa_activa": {"id": empresa_activa.id, "nombre": empresa_activa.nombre},
        "empresas": [{"id": e.id, "nombre": e.nombre, "rfc": e.rfc} for e in empresas],
    }


@router.post("/switch-empresa/{empresa_id}")
def switch_empresa(
    empresa_id: int,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Genera nuevo JWT con otra empresa activa. Solo si tiene acceso."""
    empresa = db.get(Empresa, empresa_id)
    if not empresa or not empresa.activa:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Empresa no existe")

    if not user.super_admin and user.empresa_id != empresa_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sin acceso a esa empresa")

    token = create_access_token(
        sub=user.email, rol=user.rol,
        empresa_id=empresa.id, super_admin=user.super_admin,
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "empresa_activa": {"id": empresa.id, "nombre": empresa.nombre},
    }


@router.get("/me")
def me(user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    empresas = empresas_accesibles(db, user)
    return {
        "id": user.id, "email": user.email, "nombre": user.nombre, "rol": user.rol,
        "super_admin": user.super_admin,
        "empresa_id": user.empresa_id,
        "empresas": [{"id": e.id, "nombre": e.nombre, "rfc": e.rfc} for e in empresas],
    }


class CambiarPasswordIn(BaseModel):
    password_actual: str
    password_nuevo: str


@router.post("/cambiar-password")
def cambiar_password(
    payload: CambiarPasswordIn,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permite al usuario logueado cambiar su propia contrasena."""
    # Validar password actual
    if not verify_password(payload.password_actual, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contrasena actual es incorrecta")
    # Validar minimo de longitud del nuevo password
    nuevo = (payload.password_nuevo or "").strip()
    if len(nuevo) < 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La nueva contrasena debe tener al menos 6 caracteres")
    if nuevo == payload.password_actual:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La nueva contrasena debe ser distinta a la actual")
    user.password_hash = hash_password(nuevo)
    db.commit()
    return {"ok": True, "mensaje": "Contrasena actualizada"}


@router.post("/admin/resetear-password/{usuario_id}")
def admin_resetear_password(
    usuario_id: int,
    payload: dict,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Solo super_admin: resetea la contrasena de cualquier usuario."""
    if not user.super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo super admin")
    nuevo = (payload.get("password_nuevo") or "").strip()
    if len(nuevo) < 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Minimo 6 caracteres")
    target = db.get(Usuario, usuario_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no existe")
    target.password_hash = hash_password(nuevo)
    db.commit()
    return {"ok": True, "email": target.email}
