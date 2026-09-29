"""
AgriGuard AI — Auth & Security Utility Module
Handles password hashing, JWT token generation/validation, RBAC authentication,
farm ownership checks and a simple in-memory login rate limiter.
"""

import base64
import hashlib
import hmac
import logging
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Optional, List, Callable, Any, Deque, Dict, Tuple

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt

from backend.utils.config import settings

logger = logging.getLogger("cropshield.auth")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Values that must never be used as a signing secret (old hard-coded key, template placeholders).
_INSECURE_SECRETS = {
    "",
    "agriguard_ai_super_secret_production_key_2026",
    "dev-secret-key-change-in-prod",
    "change-me-in-production-use-strong-random-key",
    "change-me",
    "changeme",
    "secret",
}


def _resolve_secret_key() -> str:
    """
    Resolves the JWT signing secret from the environment / settings (SECRET_KEY).
    - production (APP_ENV=production): refuses to start if unset or a known default.
    - otherwise: generates a random per-process key and logs a loud warning
      (tokens will not survive a restart).
    """
    candidate = (os.environ.get("SECRET_KEY") or settings.SECRET_KEY or "").strip()
    if candidate and candidate not in _INSECURE_SECRETS and len(candidate) >= 16:
        return candidate
    if settings.is_production:
        raise RuntimeError(
            "SECRET_KEY is not set (or uses an insecure default/too short). "
            "Refusing to start with APP_ENV=production. Set a strong SECRET_KEY environment variable."
        )
    logger.warning(
        "\n" + "!" * 78 + "\n"
        "!! SECRET_KEY is not configured — using a RANDOM per-process JWT secret.\n"
        "!! All issued tokens become invalid when the server restarts.\n"
        "!! Set SECRET_KEY in the environment or config/.env (>= 16 chars).\n"
        + "!" * 78
    )
    return secrets.token_urlsafe(64)


SECRET_KEY = _resolve_secret_key()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


# ── Password hashing ──────────────────────────────────────────
# New hashes: bcrypt (if the `bcrypt` package is installed) else PBKDF2-SHA256 with a
# per-user random salt. Legacy hashes (SHA256 + static salt, 64 hex chars) are still
# verified so existing accounts keep working; callers should re-hash on successful login
# when `password_needs_rehash()` returns True.

try:  # pragma: no cover - depends on environment
    import bcrypt as _bcrypt  # type: ignore
except Exception:  # pragma: no cover
    _bcrypt = None

_LEGACY_SALT = "agriguard_salt_tn"
_PBKDF2_PREFIX = "pbkdf2_sha256"
_PBKDF2_ITERATIONS = 390_000
MIN_PASSWORD_LENGTH = 8


def _bcrypt_bytes(password: str) -> bytes:
    # bcrypt only uses the first 72 bytes; newer versions raise on longer input.
    return password.encode("utf-8")[:72]


def _legacy_hash(password: str) -> str:
    return hashlib.sha256((password + _LEGACY_SALT).encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    """Hashes a password with bcrypt (preferred) or PBKDF2-SHA256 + random per-user salt."""
    if _bcrypt is not None:
        return _bcrypt.hashpw(_bcrypt_bytes(password), _bcrypt.gensalt(rounds=12)).decode("utf-8")
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return "{}${}${}${}".format(
        _PBKDF2_PREFIX,
        _PBKDF2_ITERATIONS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(dk).decode("ascii"),
    )


def verify_password(plain_password: str, hashed_password: Optional[str]) -> bool:
    """Constant-time verification supporting bcrypt, PBKDF2 and legacy SHA256 hashes."""
    if not hashed_password or plain_password is None:
        return False
    try:
        if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
            if _bcrypt is None:
                logger.error("bcrypt hash found but the bcrypt package is not installed.")
                return False
            return bool(_bcrypt.checkpw(_bcrypt_bytes(plain_password), hashed_password.encode("utf-8")))
        if hashed_password.startswith(_PBKDF2_PREFIX + "$"):
            _, iters, salt_b64, dk_b64 = hashed_password.split("$", 3)
            dk = hashlib.pbkdf2_hmac(
                "sha256", plain_password.encode("utf-8"), base64.b64decode(salt_b64), int(iters)
            )
            return hmac.compare_digest(dk, base64.b64decode(dk_b64))
        # Legacy SHA256 + static salt (64 hex chars)
        return hmac.compare_digest(_legacy_hash(plain_password), hashed_password)
    except Exception as e:
        logger.warning("Password verification error: %s", e)
        return False


def password_needs_rehash(hashed_password: Optional[str]) -> bool:
    """True for legacy (SHA256 static-salt) hashes, or PBKDF2 when bcrypt is now available."""
    if not hashed_password:
        return True
    if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
        return False
    if hashed_password.startswith(_PBKDF2_PREFIX + "$"):
        return _bcrypt is not None
    return True


# ── Login rate limiting (in-memory, per process) ──────────────

class LoginRateLimiter:
    """Allows at most `max_attempts` failed logins per key within `window_seconds`."""

    def __init__(self, max_attempts: int = 10, window_seconds: int = 300,
                 message: str = "Too many failed login attempts. Please try again later."):
        self.max_attempts = max_attempts
        self.message = message
        self.window_seconds = window_seconds
        self._failures: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: Tuple[str, str], now: float) -> Deque[float]:
        q = self._failures[key]
        while q and now - q[0] > self.window_seconds:
            q.popleft()
        return q

    def check(self, email: str, ip: str) -> None:
        key = ((email or "").lower(), ip or "unknown")
        now = time.monotonic()
        with self._lock:
            q = self._prune(key, now)
            if len(q) >= self.max_attempts:
                retry_after = int(self.window_seconds - (now - q[0])) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=self.message,
                    headers={"Retry-After": str(max(retry_after, 1))},
                )

    def record_failure(self, email: str, ip: str) -> None:
        key = ((email or "").lower(), ip or "unknown")
        with self._lock:
            self._prune(key, time.monotonic()).append(time.monotonic())
            # opportunistic cleanup to bound memory
            if len(self._failures) > 10_000:
                now = time.monotonic()
                for k in list(self._failures.keys()):
                    if not self._prune(k, now):
                        del self._failures[k]

    def reset(self, email: str, ip: str) -> None:
        key = ((email or "").lower(), ip or "unknown")
        with self._lock:
            self._failures.pop(key, None)


login_rate_limiter = LoginRateLimiter()
# Generic per-user request limiter for expensive endpoints (e.g. /predict-today): 30 calls / 5 min.
predict_rate_limiter = LoginRateLimiter(
    max_attempts=30, window_seconds=300,
    message="Too many prediction requests. Please wait a few minutes and try again.",
)


# ── JWT ───────────────────────────────────────────────────────

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
        user = await MongoUser.find_one({"email": str(email).lower()})
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
    """
    Optional authenticated user dependency. Returns the active MongoUser for a valid token,
    else None. Only use on read-only routes that also make sense anonymously.
    """
    from backend.models.user import User as MongoUser
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        email = payload.get("sub")
        if not email:
            return None
        user = await MongoUser.find_one({"email": str(email).lower()})
        if not user or not user.is_active:
            return None
        return user
    except Exception:
        return None


# ── Object id + farm ownership helpers ────────────────────────

def parse_object_id(value: Any, not_found_detail: str = "Resource not found.", status_code: int = 404):
    """Parses a string into a PydanticObjectId or raises HTTPException (404 by default)."""
    from beanie import PydanticObjectId
    try:
        if value is not None and PydanticObjectId.is_valid(str(value)):
            return PydanticObjectId(str(value))
    except Exception:
        pass
    raise HTTPException(status_code=status_code, detail=not_found_detail)


def is_farm_owner(farm: Any, user: Any) -> bool:
    if farm is None or user is None:
        return False
    owner_id = getattr(farm, "owner_id", None)
    if owner_id is not None and str(owner_id) == str(user.id):
        return True
    # User record explicitly linked to an ownerless farm (seeded demo data)
    user_farm_id = getattr(user, "farm_id", None)
    return owner_id is None and user_farm_id is not None and str(user_farm_id) == str(farm.id)


async def get_owned_farm(farm_id: Any, user: Any, allow_staff_read: bool = False):
    """
    Loads a Farm by id and checks access:
      - admin: always allowed
      - agronomist: allowed only when `allow_staff_read` is True (read-only views)
      - otherwise the caller must own the farm.
    Raises 404 for unknown/invalid ids and 403 when the caller may not access it.
    """
    from backend.models.farm import Farm as MongoFarm
    oid = parse_object_id(farm_id, "Farm not found.")
    farm = await MongoFarm.get(oid)
    if not farm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found.")
    role = getattr(user, "role", None)
    if role == "admin" or (allow_staff_read and role == "agronomist"):
        return farm
    if is_farm_owner(farm, user):
        return farm
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this farm.")


async def get_user_primary_farm(user: Any):
    """Returns the caller's own primary farm, or None. Never falls back to another user's farm."""
    from backend.models.farm import Farm as MongoFarm
    if user is None:
        return None
    farm = None
    if getattr(user, "farm_id", None):
        try:
            farm = await MongoFarm.get(user.farm_id)
        except Exception:
            farm = None
        if farm and not is_farm_owner(farm, user):
            farm = None
    if not farm:
        farm = await MongoFarm.find_one(MongoFarm.owner_id == user.id)
    return farm


async def resolve_user_farm(farm_id: Optional[str], user: Any, allow_staff_read: bool = False):
    """If farm_id is given it must be accessible (else 403/404); otherwise the caller's own farm (or None)."""
    if farm_id:
        return await get_owned_farm(farm_id, user, allow_staff_read=allow_staff_read)
    return await get_user_primary_farm(user)
