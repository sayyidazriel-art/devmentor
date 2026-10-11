def calculate_progression(total_xp: int) -> dict:
    """Menghitung level dan rank berdasarkan total XP."""

    if total_xp < 0:
        raise ValueError("Total XP tidak boleh negatif.")

    # Setiap 100 XP menaikkan level satu tingkat.
    level = (total_xp // 100) + 1

    # Menentukan rank berdasarkan total XP.
    if total_xp < 100:
        rank = "Novice"
    elif total_xp < 300:
        rank = "Apprentice"
    elif total_xp < 600:
        rank = "Intermediate"
    elif total_xp < 1000:
        rank = "Advanced"
    else:
        rank = "Expert"

    # XP yang dibutuhkan untuk level berikutnya.
    next_level_xp = level * 100
    xp_to_next_level = next_level_xp - total_xp

    return {
        "level": level,
        "rank": rank,
        "total_xp": total_xp,
        "xp_to_next_level": xp_to_next_level,
        "next_level_xp": next_level_xp,
    }