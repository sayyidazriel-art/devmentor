import os
import uuid
import requests
from dotenv import load_dotenv

load_dotenv()

base_url = os.getenv("LANGFLOW_BASE_URL")
flow_id = os.getenv("LANGFLOW_FLOW_ID")
api_key = os.getenv("LANGFLOW_API_KEY")

if not base_url or not flow_id:
    raise RuntimeError(
    "LANGFLOW_BASE_URL atau LANGFLOW_FLOW_ID belum diatur di .env"
)

url = f"{base_url.rstrip('/')}/api/v1/run/{flow_id}"

payload = {
"output_type": "chat",
"input_type": "chat",
"input_value": """
INSTRUKSI QUEST:
Buat program Python untuk mengurutkan angka tanpa menggunakan
sort() atau sorted().

KODE PENGGUNA:
angka = [5, 2, 8, 1]
angka.sort()
print(angka)

Periksa apakah kode memenuhi instruksi quest.
Jelaskan kesalahan dan berikan saran perbaikan.
""",
"session_id": str(uuid.uuid4()),
}

headers = {}

if api_key:
    headers["x-api-key"] = api_key

try:
    print("Menghubungi Langflow...")

    response = requests.post(
        url,
        json=payload,
        headers=headers,
        timeout=90,
    )

    print("HTTP Status:", response.status_code)
    response.raise_for_status()

    result = response.json()

    print("\n=== RESPONS LANGFLOW ===")
    print(response.text)

except requests.exceptions.RequestException as error:
    print("\nRequest gagal.")
    print("Jenis error:", type(error).__name__)
    print("Detail:", error)
