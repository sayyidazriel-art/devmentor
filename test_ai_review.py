import asyncio

from backend.services.ai_review import review_code

async def main():
    print("Menguji AI Code Review DevMentor...")


    try:
        result = await review_code(
            quest_description=(
                "Urutkan angka dari kecil ke besar tanpa "
                "menggunakan sort() atau sorted()."
            ),
            user_code="""
    ```

    angka = [5, 2, 8, 1]
    angka.sort()
    print(angka)
    """,
    )

        print("\n=== HASIL AI CODE REVIEW ===")
        print(result)
        print("\nPengujian berhasil!")

    except Exception as error:
        print("\nPengujian gagal.")
        print("Jenis error:", type(error).__name__)
        print("Detail:", error)
 
if __name__ == "__main__":
    asyncio.run(main())
