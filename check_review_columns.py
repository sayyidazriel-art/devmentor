from backend.database import get_connection


def main():
    sql = """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'user_quests'
          AND column_name IN (
              'review_status',
              'review_result',
              'reviewed_at'
          )
        ORDER BY column_name;
    """

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql)
                columns = cursor.fetchall()

        print("Kolom AI Review yang ditemukan:")
        for column in columns:
            print("-", column[0])

        if len(columns) == 3:
            print("BERHASIL: Semua kolom sudah tersedia.")
        else:
            print("BELUM LENGKAP: Periksa migrasi database.")

    except Exception as error:
        print(f"Gagal memeriksa database: {error}")


if __name__ == "__main__":
    main()