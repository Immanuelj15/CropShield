"""
AgriGuard AI — Auth Router
Endpoints for user registration, authentication (JWT), and profile retrieval.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.db.database import get_db
from backend.models.db_models import User, UserRole
from backend.models.schemas import UserRegister, UserLogin, TokenResponse, UserProfile
from backend.utils.auth_utils import hash_password, verify_password, create_access_token

router = APIRouter()

@router.post("/auth/register", response_model=TokenResponse)
def register_user(user_in: UserRegister, db: Session = Depends(get_db)):
    db_user = db.query(User).filter((User.username == user_in.username) | (User.email == user_in.email)).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username or Email already registered.")
        
    role_enum = UserRole.FARMER
    if user_in.role == "expert":
        role_enum = UserRole.EXPERT
    elif user_in.role == "admin":
        role_enum = UserRole.ADMIN
        
    new_user = User(
        username=user_in.username,
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
        role=role_enum,
        full_name=user_in.full_name or user_in.username,
        district=user_in.district or "Coimbatore",
        state="Tamil Nadu"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    token = create_access_token({"sub": new_user.username, "role": new_user.role.value})
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": new_user.username,
        "role": new_user.role.value
    }

@router.post("/auth/login", response_model=TokenResponse)
def login_user(user_in: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == user_in.username).first()
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
        
    token = create_access_token({"sub": user.username, "role": user.role.value})
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user.username,
        "role": user.role.value
    }

@router.get("/auth/me", response_model=UserProfile)
def get_me(username: str = "demo_farmer", db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return {
            "id": 1,
            "username": "demo_farmer",
            "email": "farmer@agriguard.ai",
            "role": "farmer",
            "full_name": "Tamil Nadu Farmer",
            "district": "Coimbatore"
        }
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role.value,
        "full_name": user.full_name,
        "district": user.district
    }
