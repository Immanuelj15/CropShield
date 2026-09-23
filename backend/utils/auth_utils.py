"""
AgriGuard AI — Auth & Security Utility Module
Handles password hashing, JWT token generation/validation, and RBAC authentication.
"""

import hashlib
from datetime import datetime, timedelta
from typing import Optional, List, Callable, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt

SECRET_KEY = "agriguard_ai_super_secret_production_key_2026"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

def hash_password(password: str) -> str:
    """Hashes password using SHA256 with salt."""
    salt = "agriguard_salt_tn"
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token or token expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )

def require_roles(allowed_roles: Optional[List[str]] = None) -> Callable:
    """FastAPI dependency factory to enforce role-based access control (RBAC)."""
    async def role_checker(token: Optional[str] = Depends(oauth2_scheme)):
        from backend.models.user import User as MongoUser
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token required.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        payload = decode_access_token(token)
        email = payload.get("sub")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token payload missing subject.",
            )
        user = await MongoUser.find_one({"email": email.lower()})
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account inactive or not found.",
            )
        if allowed_roles and user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of {allowed_roles}, your role is '{user.role}'.",
            )
        return user
    return role_checker

async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)):
    """General authenticated user dependency."""
    checker = require_roles(None)
    return await checker(token)


async def get_optional_current_user(token: Optional[str] = Depends(oauth2_scheme)):
    """Optional authenticated user dependency. Returns MongoUser if valid token, else None."""
    from backend.models.user import User as MongoUser
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        email = payload.get("sub")
        if not email:
            return None
        return await MongoUser.find_one({"email": email.lower()})
    except Exception:
        return None

