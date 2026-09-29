"""
AgriGuard AI — Auth Router
Endpoints for user registration, authentication (JWT), and profile retrieval.

MongoDB is the single source of truth for accounts. Legacy SQLite-only users are
migrated into MongoDB on their first successful login so their tokens work with
`require_roles` like every other account.
"""

import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from backend.db.database import get_db
from backend.models.db_models import User as SqlUser
from backend.models.user import User as MongoUser
from backend.models.schemas import UserRegister, UserLogin, TokenResponse, UserProfile, UserLanguageUpdate
from backend.utils.auth_utils import (
    hash_password,
    verify_password,
    password_needs_rehash,
    create_access_token,
    get_current_user,
    get_optional_current_user,
    login_rate_limiter,
)

logger = logging.getLogger("cropshield.auth_api")

router = APIRouter()


def _token_response(user: MongoUser) -> dict:
    token = create_access_token({
        "sub": user.email,
        "role": user.role,
        "user_id": str(user.id),
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user.email,
        "role": user.role,
        "user_id": str(user.id),
        "name": user.name,
        "region_assigned": getattr(user, "region_assigned", None),
        "farm_id": str(user.farm_id) if getattr(user, "farm_id", None) else None,
        "preferred_language": getattr(user, "preferred_language", "en") or "en",
    }


@router.post("/auth/register", response_model=TokenResponse)
async def register_user(user_in: UserRegister):
    email = user_in.email.lower()
    existing_mongo = await MongoUser.find_one({"email": email})
    if existing_mongo:
        raise HTTPException(status_code=400, detail="Email already registered in system.")

    password_hash = await asyncio.to_thread(hash_password, user_in.password)

    # Client-supplied role is ignored: self-registration always creates a farmer.
    # Only admins can assign other roles (see /admin/users).
    new_mongo_user = MongoUser(
        name=user_in.full_name or user_in.username,
        email=email,
        password_hash=password_hash,
        role="farmer",
        district=user_in.district or "Coimbatore",
        is_active=True,
    )
    await new_mongo_user.insert()
    return _token_response(new_mongo_user)


@router.post("/auth/login", response_model=TokenResponse)
async def login_user(user_in: UserLogin, request: Request, db: Session = Depends(get_db)):
    # Login is by email only (display names are not unique).
    email = (user_in.email or user_in.username or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")

    client_ip = request.client.host if request.client else "unknown"
    login_rate_limiter.check(email, client_ip)

    # 1. MongoDB (source of truth)
    mongo_user = await MongoUser.find_one({"email": email})
    if mongo_user:
        ok = await asyncio.to_thread(verify_password, user_in.password, mongo_user.password_hash)
        if not ok:
            login_rate_limiter.record_failure(email, client_ip)
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        if not mongo_user.is_active:
            raise HTTPException(status_code=403, detail="Account is deactivated. Contact an administrator.")
        if password_needs_rehash(mongo_user.password_hash):
            try:
                mongo_user.password_hash = await asyncio.to_thread(hash_password, user_in.password)
                await mongo_user.save()
            except Exception:
                logger.exception("Failed to upgrade password hash for %s", email)
        login_rate_limiter.reset(email, client_ip)
        return _token_response(mongo_user)

    # 2. Legacy SQLite account: verify, then migrate into MongoDB so RBAC works.
    def _lookup_sql_user():
        return db.query(SqlUser).filter(SqlUser.email == email).first()

    sql_user = await asyncio.to_thread(_lookup_sql_user)
    if sql_user and await asyncio.to_thread(verify_password, user_in.password, sql_user.hashed_password):
        role = getattr(sql_user.role, "value", None) or "farmer"
        if role not in ("farmer", "agronomist", "admin"):
            role = "farmer"
        migrated = MongoUser(
            name=sql_user.full_name or sql_user.username or email.split("@")[0],
            email=email,
            password_hash=await asyncio.to_thread(hash_password, user_in.password),
            role=role,
            phone=getattr(sql_user, "phone", None),
            district=getattr(sql_user, "district", None),
            is_active=True,
        )
        try:
            await migrated.insert()
        except Exception:
            logger.exception("Failed to migrate legacy SQLite user %s to MongoDB", email)
            raise HTTPException(status_code=503, detail="Account migration failed. Please try again later.")
        logger.info("Migrated legacy SQLite user %s into MongoDB", email)
        login_rate_limiter.reset(email, client_ip)
        return _token_response(migrated)

    login_rate_limiter.record_failure(email, client_ip)
    raise HTTPException(status_code=401, detail="Invalid email or password.")


@router.get("/auth/me", response_model=UserProfile)
async def get_me(current_user: MongoUser = Depends(get_current_user)):
    """Returns the authenticated user's profile (taken from the bearer token)."""
    return {
        "id": str(current_user.id),
        "user_id": str(current_user.id),
        "username": current_user.email,
        "email": current_user.email,
        "role": current_user.role,
        "full_name": current_user.name,
        "district": current_user.district,
        "region_assigned": getattr(current_user, "region_assigned", None),
        "farm_id": str(current_user.farm_id) if getattr(current_user, "farm_id", None) else None,
        "preferred_language": getattr(current_user, "preferred_language", "en") or "en",
    }


@router.put("/users/me/language")
async def update_my_language(
    payload: UserLanguageUpdate,
    current_user: Optional[MongoUser] = Depends(get_optional_current_user),
):
    """
    Updates the user's preferred language (en, ta, hi, te, ml) across sessions.
    Anonymous callers (e.g. the language picker on the login page) get the resolved
    language echoed back and nothing is persisted.
    """
    from backend.utils.localized_errors import resolve_lang, localized_error
    lang = resolve_lang(payload.language)

    if current_user is not None:
        try:
            current_user.preferred_language = lang
            await current_user.save()
        except Exception:
            logger.exception("Error saving preferred language for %s", current_user.email)
            raise HTTPException(status_code=500, detail="Could not save language preference.")

    return {
        "status": "success",
        "preferred_language": lang,
        "message": localized_error("language_updated", lang)
    }
