import os
import uuid

import httpx
from dotenv import load_dotenv

load_dotenv()

LANGFLOW_BASE_URL = os.getenv("LANGFLOW_BASE_URL")
LANGFLOW_QUEST_FLOW_ID = os.getenv("LANGFLOW_QUEST_FLOW_ID")
LANGFLOW_API_KEY = os.getenv("LANGFLOW_API_KEY")


async def generate_quest(
    programming_language: str,
    difficulty: str,
    topic: str = "",
) -> str:
    if not LANGFLOW_BASE_URL or not LANGFLOW_QUEST_FLOW_ID:
        raise RuntimeError(
            "Konfigurasi AI Quest Generator belum lengkap. "
            "Periksa LANGFLOW_BASE_URL dan LANGFLOW_QUEST_FLOW_ID."
        )

    endpoint = (
        f"{LANGFLOW_BASE_URL.rstrip('/')}"
        f"/api/v1/run/{LANGFLOW_QUEST_FLOW_ID}"
    )

    input_value = (
        "Buat satu quest pemrograman dengan ketentuan berikut.\n"
        f"BAHASA PEMROGRAMAN: {programming_language}\n"
        f"TINGKAT KESULITAN: {difficulty}\n"
        f"TOPIK: {topic if topic else 'Pilih topik yang sesuai'}\n\n"
        "Ikuti format output dan seluruh aturan pada prompt "
        "AI Quest Generator yang telah dikonfigurasi di Langflow."
    )

    payload = {
        "output_type": "chat",
        "input_type": "chat",
        "input_value": input_value,
        "session_id": str(uuid.uuid4()),
    }

    headers = {}

    if LANGFLOW_API_KEY:
        headers["x-api-key"] = LANGFLOW_API_KEY

    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            endpoint,
            json=payload,
            headers=headers,
        )
        response.raise_for_status()
        result = response.json()

    try:
        return (
            result["outputs"][0]["outputs"][0]
            ["results"]["message"]["data"]["text"]
        )
    except (KeyError, IndexError, TypeError):
        raise RuntimeError(
            "Respons Langflow diterima, tetapi format hasil "
            "AI Quest Generator tidak sesuai."
        )