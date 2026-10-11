import os
import uuid

import httpx
from dotenv import load_dotenv

load_dotenv()

LANGFLOW_BASE_URL = os.getenv("LANGFLOW_BASE_URL")
LANGFLOW_FLOW_ID = os.getenv("LANGFLOW_FLOW_ID")
LANGFLOW_API_KEY = os.getenv("LANGFLOW_API_KEY")

async def review_code(
    quest_description: str,
    user_code: str,
    ) -> str:
    if not LANGFLOW_BASE_URL or not LANGFLOW_FLOW_ID:
        raise RuntimeError(
        "Konfigurasi Langflow belum lengkap. "
        "Periksa LANGFLOW_BASE_URL dan LANGFLOW_FLOW_ID."
        )

    endpoint = (
        f"{LANGFLOW_BASE_URL.rstrip('/')}"
        f"/api/v1/run/{LANGFLOW_FLOW_ID}"
    )

    payload = {
        "output_type": "chat",
        "input_type": "chat",
        "input_value": (
            f"INSTRUKSI QUEST:\n{quest_description}\n\n"
            f"KODE PENGGUNA:\n{user_code}"
        ),
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

    # Struktur respons perlu disesuaikan dengan hasil aktual Langflow.

    try:
        return result["outputs"][0]["outputs"][0]["results"]["message"]["data"]["text"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError(
            "Respons Langflow diterima, tetapi format hasil AI "
            "tidak sesuai dengan struktur yang diharapkan."
    )