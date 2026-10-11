from backend.database import get_connection


def main():
    sql = """
    ALTER TABLE user_quests
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(50);

    ALTER TABLE user_quests
    ADD COLUMN IF NOT EXISTS review_result TEXT;

    ALTER TABLE user_quests
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
    """

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql)

        print("Berhasil menambahkan kolom AI Review.")

    except Exception as error:
        print(f"Gagal mengubah database: {error}")


if __name__ == "__main__":
    main()
