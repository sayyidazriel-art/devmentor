import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from psycopg.types.json import Jsonb

from backend.database import get_connection
from backend.services.progression import calculate_progression
from backend.services.ai_quest import generate_quest

router = APIRouter(
    prefix="/api/v1/quests",
    tags=["Quests"],
)


class QuestCreate(BaseModel):
    title: str = Field(min_length=3, max_length=150)
    description: str = Field(min_length=5)
    difficulty: str = "Easy"
    xp_reward: int = Field(default=10, ge=0)

class QuestGenerateRequest(BaseModel):
    programming_language: str = Field(
        default="Python",
        min_length=1,
        max_length=50,
    )
    difficulty: str = Field(default="Easy")
    topic: str = Field(
        default="",
        max_length=200,
    )

def parse_generated_quest(text: str) -> dict:
    headings = [
        "JUDUL QUEST",
        "TINGKAT KESULITAN",
        "REKOMENDASI XP",
        "BAHASA PEMROGRAMAN",
        "TUJUAN PEMBELAJARAN",
        "DESKRIPSI MASALAH",
        "PERSYARATAN",
        "BATASAN",
        "KRITERIA PENYELESAIAN",
        "CONTOH INPUT DAN OUTPUT",
        "KASUS KHUSUS",
        "PETUNJUK",
    ]

    pattern = (
        r"(?im)^("
        + "|".join(re.escape(h) for h in headings)
        + r")\s*:\s*$"
    )

    matches = list(re.finditer(pattern, text))
    sections = {}

    for i, match in enumerate(matches):
        start = match.end()
        end = (
            matches[i + 1].start()
            if i + 1 < len(matches)
            else len(text)
        )

        sections[match.group(1).upper()] = text[
            start:end
        ].strip()

    missing = [
        heading
        for heading in headings
        if not sections.get(heading)
    ]

    if missing:
        raise ValueError(
            "Bagian hasil AI tidak lengkap: "
            + ", ".join(missing)
        )

    xp_match = re.search(
        r"\d+",
        sections["REKOMENDASI XP"],
    )

    if not xp_match:
        raise ValueError("Rekomendasi XP tidak valid.")

    difficulty = sections["TINGKAT KESULITAN"].splitlines()[0].strip()

    if difficulty not in ["Easy", "Medium", "Hard"]:
        raise ValueError("Tingkat kesulitan tidak valid.")

    xp_reward = int(xp_match.group())

    if xp_reward < 0 or xp_reward > 1000:
        raise ValueError("Rekomendasi XP di luar batas.")

    return {
        "title": sections["JUDUL QUEST"].splitlines()[0].strip(),
        "description": sections["DESKRIPSI MASALAH"],
        "difficulty": difficulty,
        "xp_reward": xp_reward,
        "programming_language": sections["BAHASA PEMROGRAMAN"].splitlines()[0].strip(),
        "learning_objectives": sections["TUJUAN PEMBELAJARAN"],
        "requirements": sections["PERSYARATAN"],
        "constraints": sections["BATASAN"],
        "acceptance_criteria": sections["KRITERIA PENYELESAIAN"],
        "examples": sections["CONTOH INPUT DAN OUTPUT"],
        "edge_cases": sections["KASUS KHUSUS"],
        "hints": sections["PETUNJUK"],
    }

@router.get("/")
def get_quests(user_id: int = 1):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        q.id,
                        q.title,
                        q.description,
                        q.difficulty,
                        q.xp_reward,
                        q.created_at,
                        q.programming_language,
                        q.learning_objectives,
                        q.requirements,
                        q.constraints,
                        q.acceptance_criteria,
                        q.examples,
                        q.edge_cases,
                        q.hints,
                        uq.status AS user_status
                    FROM quests AS q
                    LEFT JOIN user_quests AS uq
                        ON uq.quest_id = q.id
                        AND uq.user_id = %s
                    ORDER BY q.id;
                    """,
                    (user_id,),
                )

                quests = cursor.fetchall()

        return {
            "total": len(quests),
            "quests": [
                {
                    "id": quest[0],
                    "title": quest[1],
                    "description": quest[2],
                    "difficulty": quest[3],
                    "xp_reward": quest[4],
                    "created_at": quest[5],
                    "programming_language": quest[6],
                    "learning_objectives": quest[7],
                    "requirements": quest[8],
                    "constraints": quest[9],
                    "acceptance_criteria": quest[10],
                    "examples": quest[11],
                    "edge_cases": quest[12],
                    "hints": quest[13],
                    "user_status": quest[14] or "Available",
                }
                for quest in quests
            ],
        }

    except Exception as error:
        print(
            f"Get quests error: {type(error).__name__}: {error}"
        )
        raise HTTPException(
            status_code=500,
            detail="Gagal mengambil daftar quest.",
        )

@router.post("/")
def create_quest(quest_data: QuestCreate):
    if quest_data.difficulty not in ["Easy", "Medium", "Hard"]:
        raise HTTPException(
            status_code=422,
            detail="Difficulty harus Easy, Medium, atau Hard.",
        )

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO quests (
                        title,
                        description,
                        difficulty,
                        xp_reward
                    )
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, title, description,
                              difficulty, xp_reward, created_at;
                    """,
                    (
                        quest_data.title,
                        quest_data.description,
                        quest_data.difficulty,
                        quest_data.xp_reward,
                    ),
                )

                quest = cursor.fetchone()

        return {
            "message": "Quest berhasil dibuat.",
            "quest": {
                "id": quest[0],
                "title": quest[1],
                "description": quest[2],
                "difficulty": quest[3],
                "xp_reward": quest[4],
                "created_at": quest[5],
            },
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Gagal membuat quest.",
        )

@router.post("/{quest_id}/start/{user_id}")
def start_quest(quest_id: int, user_id: int):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:

                # Periksa apakah pengguna tersedia
                cursor.execute(
                    "SELECT id FROM users WHERE id = %s;",
                    (user_id,),
                )

                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="User tidak ditemukan.",
                    )

                # Periksa apakah quest tersedia
                cursor.execute(
                    "SELECT id FROM quests WHERE id = %s;",
                    (quest_id,),
                )

                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Quest tidak ditemukan.",
                    )

                # Simpan quest yang dimulai pengguna
                cursor.execute(
                    """
                    INSERT INTO user_quests (user_id, quest_id)
                    VALUES (%s, %s)
                    ON CONFLICT (user_id, quest_id) DO NOTHING
                    RETURNING id;
                    """,
                    (user_id, quest_id),
                )

                result = cursor.fetchone()

                if result is None:
                    raise HTTPException(
                        status_code=409,
                        detail="Quest ini sudah pernah dimulai.",
                    )

        return {
            "message": "Quest berhasil dimulai.",
            "user_id": user_id,
            "quest_id": quest_id,
            "status": "In Progress",
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Gagal memulai quest.",
        )

@router.post("/{quest_id}/complete/{user_id}")
def complete_quest(quest_id: int, user_id: int):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:

                # 1. Ambil progres quest dan kunci barisnya.
                cursor.execute(
                    """
                    SELECT
                        uq.id,
                        uq.status,
                        q.xp_reward,
                        uq.review_status
                    FROM user_quests AS uq
                    JOIN quests AS q
                        ON q.id = uq.quest_id
                    WHERE uq.user_id = %s
                      AND uq.quest_id = %s
                    FOR UPDATE OF uq;
                    """,
                    (user_id, quest_id),
                )

                progress = cursor.fetchone()

                if progress is None:
                    raise HTTPException(
                        status_code=404,
                        detail=(
                            "Progres quest tidak ditemukan. "
                            "Mulai quest terlebih dahulu."
                        ),
                    )

                progress_id, status, xp_reward, review_status = progress

                # 2. Pastikan quest belum pernah diselesaikan.
                if status == "Completed":
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Quest ini sudah diselesaikan. "
                            "XP tidak diberikan lagi."
                        ),
                    )

                # 3. Wajib lolos AI Review sebelum mendapatkan XP.
                if review_status != "MEMENUHI INSTRUKSI":
                    raise HTTPException(
                        status_code=403,
                        detail=(
                            "Quest belum bisa diselesaikan. "
                            "Kode harus lolos AI Review terlebih dahulu."
                        ),
                    )

                # 4. Ambil XP pengguna saat ini.
                cursor.execute(
                    "SELECT xp FROM users WHERE id = %s;",
                    (user_id,),
                )

                user_xp = cursor.fetchone()

                if user_xp is None:
                    raise HTTPException(
                        status_code=404,
                        detail="User tidak ditemukan.",
                    )

                # 5. Hitung XP, level, dan rank terbaru.
                new_total_xp = user_xp[0] + xp_reward
                progression = calculate_progression(new_total_xp)

                # 6. Tandai quest sebagai selesai.
                cursor.execute(
                    """
                    UPDATE user_quests
                    SET status = 'Completed',
                        completed_at = NOW()
                    WHERE id = %s;
                    """,
                    (progress_id,),
                )

                # 7. Simpan XP, level, dan rank terbaru.
                cursor.execute(
                    """
                    UPDATE users
                    SET xp = %s,
                        level = %s,
                        rank = %s
                    WHERE id = %s
                    RETURNING id, username, level, rank, xp;
                    """,
                    (
                        new_total_xp,
                        progression["level"],
                        progression["rank"],
                        user_id,
                    ),
                )

                user = cursor.fetchone()

        return {
            "message": "Quest berhasil diselesaikan!",
            "xp_earned": xp_reward,
            "progression": progression,
            "user": {
                "id": user[0],
                "username": user[1],
                "level": user[2],
                "rank": user[3],
                "xp": user[4],
            },
        }

    except HTTPException:
        raise

    except Exception as error:
        print(
            f"Complete quest error: "
            f"{type(error).__name__}: {error}"
        )

        raise HTTPException(
            status_code=500,
            detail="Gagal menyelesaikan quest.",
        )
        
@router.post("/generate")
async def generate_new_quest(request: QuestGenerateRequest):
    if request.difficulty not in ["Easy", "Medium", "Hard"]:
        raise HTTPException(
            status_code=422,
            detail="Difficulty harus Easy, Medium, atau Hard.",
        )

    try:
        generated_text = await generate_quest(
            programming_language=request.programming_language,
            difficulty=request.difficulty,
            topic=request.topic,
        )

        quest = parse_generated_quest(generated_text)

        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO quests (
                        title,
                        description,
                        difficulty,
                        xp_reward,
                        programming_language,
                        learning_objectives,
                        requirements,
                        constraints,
                        acceptance_criteria,
                        examples,
                        edge_cases,
                        hints
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s
                    )
                    RETURNING id, title, description,
                              difficulty, xp_reward, created_at;
                    """,
                    (
                        quest["title"],
                        quest["description"],
                        quest["difficulty"],
                        quest["xp_reward"],
                        quest["programming_language"],
                        Jsonb(quest["learning_objectives"]),
                        Jsonb(quest["requirements"]),
                        Jsonb(quest["constraints"]),
                        Jsonb(quest["acceptance_criteria"]),
                        Jsonb(quest["examples"]),
                        Jsonb(quest["edge_cases"]),
                        Jsonb(quest["hints"]),
                    ),
                )

                saved = cursor.fetchone()

        return {
            "success": True,
            "message": "Quest berhasil dibuat oleh AI.",
            "quest": {
                "id": saved[0],
                "title": saved[1],
                "description": saved[2],
                "difficulty": saved[3],
                "xp_reward": saved[4],
                "created_at": saved[5],
                "programming_language": quest["programming_language"],
                "learning_objectives": quest["learning_objectives"],
                "requirements": quest["requirements"],
                "constraints": quest["constraints"],
                "acceptance_criteria": quest["acceptance_criteria"],
                "examples": quest["examples"],
                "edge_cases": quest["edge_cases"],
                "hints": quest["hints"],
            },
        }

    except HTTPException:
        raise

    except Exception as error:
        print(
            f"AI Quest Generator error: "
            f"{type(error).__name__}: {error}"
        )

        raise HTTPException(
            status_code=502,
            detail="Gagal membuat atau menyimpan quest dari AI.",
        )