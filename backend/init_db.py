from backend.database import get_connection


def create_tables():
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:

                # Tabel pengguna
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(50) UNIQUE NOT NULL,
                        email VARCHAR(255) UNIQUE,
                        level INTEGER NOT NULL DEFAULT 1,
                        rank VARCHAR(30) NOT NULL DEFAULT 'Novice',
                        xp INTEGER NOT NULL DEFAULT 0,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                """)

                # Tabel quest pemrograman
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS quests (
                        id SERIAL PRIMARY KEY,
                        title VARCHAR(150) NOT NULL,
                        description TEXT NOT NULL,
                        difficulty VARCHAR(20) NOT NULL DEFAULT 'Easy',
                        xp_reward INTEGER NOT NULL DEFAULT 10,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        CONSTRAINT valid_difficulty
                            CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
                        CONSTRAINT valid_xp
                            CHECK (xp_reward >= 0)
                    );
                """)

                # Tabel progres quest pengguna
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS user_quests (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL
                            REFERENCES users(id) ON DELETE CASCADE,
                        quest_id INTEGER NOT NULL
                            REFERENCES quests(id) ON DELETE CASCADE,
                        status VARCHAR(20) NOT NULL DEFAULT 'In Progress',
                        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        completed_at TIMESTAMPTZ,
                        UNIQUE (user_id, quest_id),
                        CHECK (status IN ('In Progress', 'Completed'))
                    );
                """)

        print("Tabel users berhasil dibuat atau sudah tersedia.")
        print("Tabel quests berhasil dibuat atau sudah tersedia.")
        print("Tabel user_quests berhasil dibuat atau sudah tersedia.")
    except Exception as error:
        print("Gagal membuat tabel database.")
        print(f"Jenis error: {type(error).__name__}")
        print("Periksa koneksi database dan konfigurasi .env.")


if __name__ == "__main__":
    create_tables()