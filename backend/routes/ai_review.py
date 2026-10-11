import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import get_connection
from backend.services.ai_review import review_code

router = APIRouter(
prefix="/api/v1/ai",
tags=["AI Code Review"],
)

class CodeReviewRequest(BaseModel):
    user_id: int = Field(gt=0)
    quest_id: int = Field(gt=0)
    user_code: str = Field(
        min_length=1,
        max_length=20000,
    )

@router.post("/review")
async def create_code_review(request: CodeReviewRequest):
    try:
        # Ambil quest dan periksa progres pengguna.
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        q.title,
                        q.description,
                        q.difficulty,
                        q.programming_language,
                        q.learning_objectives,
                        q.requirements,
                        q.constraints,
                        q.acceptance_criteria,
                        q.examples,
                        q.edge_cases,
                        q.hints,
                        uq.id,
                        uq.status
                    FROM quests AS q
                    LEFT JOIN user_quests AS uq
                        ON uq.quest_id = q.id
                        AND uq.user_id = %s
                    WHERE q.id = %s;
                    """,
                    (request.user_id, request.quest_id),
                )

                quest = cursor.fetchone()

                if quest is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Quest tidak ditemukan.",
                    )

                progress_id = quest[11]
                progress_status = quest[12]

                if progress_id is None:
                    raise HTTPException(
                        status_code=403,
                        detail="Mulai quest terlebih dahulu.",
                    )

                if progress_status == "Completed":
                    raise HTTPException(
                        status_code=409,
                        detail="Quest ini sudah diselesaikan.",
                    )

                quest_description = f"""
JUDUL QUEST:
{quest[0]}

DESKRIPSI MASALAH:
{quest[1]}

TINGKAT KESULITAN:
{quest[2]}

BAHASA PEMROGRAMAN:
{quest[3] or "Tidak ditentukan"}

TUJUAN PEMBELAJARAN:
{quest[4] or "Tidak tersedia"}

PERSYARATAN:
{quest[5] or "Tidak tersedia"}

BATASAN:
{quest[6] or "Tidak tersedia"}

KRITERIA PENYELESAIAN:
{quest[7] or "Tidak tersedia"}

CONTOH INPUT DAN OUTPUT:
{quest[8] or "Tidak tersedia"}

KASUS KHUSUS:
{quest[9] or "Tidak tersedia"}

PETUNJUK:
{quest[10] or "Tidak tersedia"}
"""

        # Minta AI memeriksa kode.
        result = await review_code(
            quest_description=quest_description,
            user_code=request.user_code,
        )

        # Tentukan status secara konservatif.
        # Hanya status eksplisit yang boleh dianggap lulus.
        match = re.search(
            r"(?im)^\s*STATUS\s*:?\s*"
            r"(MEMENUHI INSTRUKSI|TIDAK MEMENUHI INSTRUKSI|BELUM DAPAT DIPASTIKAN)\b",
            result,
        )

        if match:
            review_status = match.group(1).upper()
        else:
            review_status = "BELUM DAPAT DIPASTIKAN"

        # Simpan hasil review untuk progres pengguna.
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE user_quests
                    SET review_status = %s,
                        review_result = %s,
                        reviewed_at = NOW()
                    WHERE id = %s
                      AND user_id = %s
                      AND quest_id = %s
                      AND status = 'In Progress';
                    """,
                    (
                        review_status,
                        result,
                        progress_id,
                        request.user_id,
                        request.quest_id,
                    ),
                )

                if cursor.rowcount != 1:
                    raise HTTPException(
                        status_code=409,
                        detail="Progres quest berubah. Muat ulang quest dan coba lagi.",
                    )

        return {
            "success": True,
            "message": "AI Code Review berhasil.",
            "user_id": request.user_id,
            "quest_id": request.quest_id,
            "review_status": review_status,
            "review": result,
        }

    except HTTPException:
        raise

    except Exception as error:
        print(
            f"AI Code Review error: "
            f"{type(error).__name__}: {error}"
        )

        raise HTTPException(
            status_code=502,
            detail="Gagal mendapatkan atau menyimpan hasil AI Review.",
        )