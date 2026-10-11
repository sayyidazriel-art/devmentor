import psycopg

from backend.config import DATABASE_URL

def test_connection():
    try:
        with psycopg.connect(
            DATABASE_URL,
            connect_timeout=10,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT version();")
                result = cursor.fetchone()
            print("Koneksi ke Neon berhasil!")
            print(f"Database: {result[0].split(',')[0]}")

    except Exception as error:
        print("Koneksi ke Neon gagal.")
        print(f"Jenis error: {type(error).__name__}")
        print("Periksa connection string dan pengaturan database.")

if __name__ == "__main__":
    test_connection()
