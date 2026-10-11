from fastapi import APIRouter, HTTPException

from backend.database import get_connection


router = APIRouter(
    prefix="/api/v1/skills",
    tags=["Skills"],
)


@router.get("/{user_id}")
def get_user_skills(user_id: int):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:

                # Pastikan pengguna tersedia.
                cursor.execute(
                    "SELECT id FROM users WHERE id = %s;",
                    (user_id,),
                )

                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="User tidak ditemukan.",
                    )

                # Hitung progres setiap bahasa pemrograman.
                cursor.execute(
                    """
                    SELECT
                        q.programming_language,
                        COUNT(DISTINCT q.id) AS total_quests,
                        COUNT(
                            DISTINCT q.id
                        ) FILTER (
                            WHERE uq.status = 'Completed'
                        ) AS completed_quests
                    FROM quests AS q
                    LEFT JOIN user_quests AS uq
                        ON uq.quest_id = q.id
                        AND uq.user_id = %s
                    WHERE q.programming_language IS NOT NULL
                      AND TRIM(q.programming_language) <> ''
                    GROUP BY q.programming_language
                    ORDER BY q.programming_language;
                    """,
                    (user_id,),
                )

                rows = cursor.fetchall()

        skills = []

        for row in rows:
            language = row[0]
            total = row[1]
            completed = row[2]

            percentage = (
                round((completed / total) * 100)
                if total > 0
                else 0
            )

            skills.append({
                "name": language,
                "total_quests": total,
                "completed_quests": completed,
                "progress": percentage,
            })

        return {
            "user_id": user_id,
            "total_skills": len(skills),
            "skills": skills,
        }

    except HTTPException:
        raise

    except Exception as error:
        print(
            f"Get user skills error: "
            f"{type(error).__name__}: {error}"
        )

        raise HTTPException(
            status_code=500,
            detail="Gagal mengambil progres Skills.",
        )