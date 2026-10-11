import psycopg

from backend.config import DATABASE_URL


def get_connection():
    return psycopg.connect(
        DATABASE_URL,
        connect_timeout=10,
    )