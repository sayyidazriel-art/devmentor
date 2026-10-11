from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, EmailStr

from backend.database import get_connection
from backend.services.progression import calculate_progression

router = APIRouter(
    prefix="/api/v1/profile",
    tags=["Profile"],
)


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr


class UserUpdate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr


@router.post("/")
def create_profile(user_data: UserCreate):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO users (username, email)
                    VALUES (%s, %s)
                    RETURNING id, username, email, level, rank, xp, created_at;
                    """,
                    (user_data.username, str(user_data.email)),
                )

                user = cursor.fetchone()

        return {
            "message": "Profil pengguna berhasil dibuat.",
            "user": {
                "id": user[0],
                "username": user[1],
                "email": user[2],
                "level": user[3],
                "rank": user[4],
                "xp": user[5],
                "created_at": user[6],
            },
        }

    except Exception as error:
        if getattr(error, "sqlstate", None) == "23505":
            raise HTTPException(
                status_code=409,
                detail="Username atau email sudah digunakan.",
            )

        raise HTTPException(
            status_code=500,
            detail="Gagal membuat profil pengguna.",
        )


@router.get("/{user_id}")
def get_profile(user_id: int):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, username, email, level, rank, xp, created_at
                    FROM users
                    WHERE id = %s;
                    """,
                    (user_id,),
                )

                user = cursor.fetchone()

        if user is None:
            raise HTTPException(
                status_code=404,
                detail="User tidak ditemukan.",
            )

        return {
            "id": user[0],
            "username": user[1],
            "email": user[2],
            "level": user[3],
            "rank": user[4],
            "xp": user[5],
            "created_at": user[6],
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Terjadi kesalahan saat mengambil profil pengguna.",
        )


@router.put("/{user_id}")
def update_profile(user_id: int, user_data: UserUpdate):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE users
                    SET username = %s,
                        email = %s
                    WHERE id = %s
                    RETURNING id, username, email, level, rank, xp, created_at;
                    """,
                    (
                        user_data.username,
                        str(user_data.email),
                        user_id,
                    ),
                )

                user = cursor.fetchone()

        if user is None:
            raise HTTPException(
                status_code=404,
                detail="User tidak ditemukan.",
            )

        return {
            "message": "Profil berhasil diperbarui.",
            "user": {
                "id": user[0],
                "username": user[1],
                "email": user[2],
                "level": user[3],
                "rank": user[4],
                "xp": user[5],
                "created_at": user[6],
            },
        }

    except HTTPException:
        raise

    except Exception as error:
        if getattr(error, "sqlstate", None) == "23505":
            raise HTTPException(
                status_code=409,
                detail="Username atau email sudah digunakan pengguna lain.",
            )

        raise HTTPException(
            status_code=500,
            detail="Gagal memperbarui profil pengguna.",
        )


@router.get("/{user_id}/progress")
def get_user_progress(user_id: int):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, username, level, rank, xp
                    FROM users
                    WHERE id = %s;
                    """,
                    (user_id,),
                )

                user = cursor.fetchone()

                if user is None:
                    raise HTTPException(
                        status_code=404,
                        detail="User tidak ditemukan.",
                    )

                cursor.execute(
                    """
                    SELECT
                        COUNT(*) FILTER (
                            WHERE status = 'Completed'
                        ),
                        COUNT(*) FILTER (
                            WHERE status = 'In Progress'
                        )
                    FROM user_quests
                    WHERE user_id = %s;
                    """,
                    (user_id,),
                )

                quest_stats = cursor.fetchone()

        progression = calculate_progression(user[4])

        return {
            "user": {
                "id": user[0],
                "username": user[1],
                "level": user[2],
                "rank": user[3],
                "xp": user[4],
            },
            "progression": progression,
            "quests": {
                "completed": quest_stats[0],
                "in_progress": quest_stats[1],
            },
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Gagal mengambil progres pengguna.",
        )