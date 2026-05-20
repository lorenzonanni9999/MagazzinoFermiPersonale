import os
import bcrypt
import aiomysql
from .db_interface import DatabaseInterface

# Railway MySQL plugin usa MYSQL_URL oppure le variabili MYSQLHOST, MYSQLPORT, ecc.
# Supportiamo entrambi i formati per compatibilità locale e Railway

def _get_db_config():
    # Railway MySQL plugin espone queste variabili
    mysql_host = (
        os.environ.get("MYSQLHOST") or
        os.environ.get("DB_HOST") or
        "localhost"
    )
    mysql_port = int(
        os.environ.get("MYSQLPORT") or
        os.environ.get("DB_PORT") or
        3306
    )
    mysql_user = (
        os.environ.get("MYSQLUSER") or
        os.environ.get("DB_USER") or
        "root"
    )
    mysql_password = (
        os.environ.get("MYSQLPASSWORD") or
        os.environ.get("DB_PASSWORD") or
        "root123"
    )
    mysql_db = (
        os.environ.get("MYSQLDATABASE") or
        os.environ.get("DB_NAME") or
        "magazzino_scolastico"
    )
    return {
        "host":       mysql_host,
        "port":       mysql_port,
        "user":       mysql_user,
        "password":   mysql_password,
        "db":         mysql_db,
        "charset":    "utf8mb4",
        "autocommit": True,
    }

DB_CONFIG = _get_db_config()

SMTP_CONFIG = {
    "host":     os.environ.get("SMTP_HOST", "smtp.gmail.com"),
    "port":     int(os.environ.get("SMTP_PORT", 587)),
    "user":     os.environ.get("SMTP_USER", ""),
    "password": os.environ.get("SMTP_PASSWORD", ""),
    "from":     os.environ.get("SMTP_FROM", ""),
}

COOKIE_SECRET = os.environ.get("COOKIE_SECRET", "super_secret_key_change_me")
PORT = int(os.environ.get("PORT", 8888))

db_interface = DatabaseInterface()

async def init_db():
    pool = await aiomysql.create_pool(**DB_CONFIG)
    db_interface.set_pool(pool)
    await db_interface.create_tables()
    await _crea_admin_se_mancante(pool)

async def _crea_admin_se_mancante(pool):
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT COUNT(*) FROM users WHERE ruolo = 'ADMIN'")
            (count,) = await cur.fetchone()
            if count == 0:
                hashed = bcrypt.hashpw(b"root", bcrypt.gensalt())
                await cur.execute(
                    "INSERT INTO users (email, password, ruolo, approvato) VALUES (%s, %s, %s, %s)",
                    ("root@root.root", hashed, "ADMIN", True)
                )
                print("Utente admin creato automaticamente.")
