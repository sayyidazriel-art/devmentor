/**
 * DevMentor — script.js
 * AI Compass and Personal Coach for Junior Programmers
 *
 * Architecture:
 *   - CONFIG          : Application-level constants
 *   - STATE           : Runtime state (no secrets stored)
 *   - API             : All backend communication
 *   - PROGRESSION     : XP / level / progress bar calculations
 *   - RENDER_PROFILE  : Profile card and header rendering
 *   - RENDER_STATS    : Statistics cards rendering
 *   - RENDER_QUESTS   : Quest board and recent-quests rendering
 *   - RENDER_SKILLS   : Skill development page rendering
 *   - TOAST           : User-facing notifications
 *   - NAV             : Sidebar navigation and page switching
 *   - EVENTS          : Event listener registration
 *   - INIT            : Application bootstrap
 */

"use strict";

/* ═══════════════════════════════════════════════════════
   CONFIG
   ─────────────────────────────────────────────────────
   DEV_USER_ID: Development-only placeholder.
   Replace with real authentication in a future release.
   Never store real credentials or secrets here.
═══════════════════════════════════════════════════════ */
const CONFIG = Object.freeze({
  API_BASE_URL: "http://127.0.0.1:8000",
  DEV_USER_ID:  1,   // ← Change to match your local dev user ID
});

// ==========================================
// LOCAL STORAGE: QUEST STATUS
// ==========================================

function loadQuestStatus() {
  const key = `devmentor_quest_status_${CONFIG.DEV_USER_ID}`;

  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    console.error("Gagal membaca status quest:", error);
    return {};
  }
}

function saveQuestStatus() {
  const key = `devmentor_quest_status_${CONFIG.DEV_USER_ID}`;

  try {
    localStorage.setItem(
      key,
      JSON.stringify(STATE.userQuestMap)
    );
  } catch (error) {
    console.error("Gagal menyimpan status quest:", error);
  }
}

/* ═══════════════════════════════════════════════════════
   STATE
   Runtime-only state. Nothing sensitive is persisted.
═══════════════════════════════════════════════════════ */
const STATE = {
  profile:       null,   // Last fetched profile object
  progression:   null,   // Last fetched progression object
  questStats:    null,   // Last fetched quest counts
  allQuests:     [],     // All quests from backend
  userQuestMap:  loadQuestStatus(),     // { quest_id: "In Progress" | "Completed" }
  activeFilter:  "all",  // Current filter pill selection
  searchQuery:   "",     // Current search text
  pendingAction: false,  // Debounce flag: true while a quest action is running
  currentQuest: null,              // Quest yang sedang dikerjakan di workspace
  currentQuestReviewPassed: false, // Status review terakhir untuk tampilan UI
};

/* ═══════════════════════════════════════════════════════
   API
   All backend communication lives here.
   Use apiFetch() for every request so error handling
   is consistent across the application.
═══════════════════════════════════════════════════════ */

/**
 * Core fetch wrapper. Throws a structured error on HTTP failures.
 * @param {string} path   - Path relative to API_BASE_URL
 * @param {RequestInit} [options] - Fetch options
 * @returns {Promise<any>} Parsed JSON body
 */
async function apiFetch(path, options = {}) {
  const url = `${CONFIG.API_BASE_URL}${path}`;
  const defaultHeaders = { "Content-Type": "application/json" };

  const res = await fetch(url, {
    ...options,
    headers: { ...defaultHeaders, ...(options.headers || {}) },
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body && body.detail) {
        detail = typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail);
      }
    } catch (_) { /* ignore parse errors on error body */ }

    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

/** GET /api/v1/profile/{user_id} */
async function apiGetProfile(userId) {
  return apiFetch(`/api/v1/profile/${userId}`);
}

/** GET /api/v1/profile/{user_id}/progress */
async function apiGetProgress(userId) {
  return apiFetch(`/api/v1/profile/${userId}/progress`);
}

/** GET /api/v1/quests/ */
async function apiGetQuests() {
  return apiFetch("/api/v1/quests/");
}

/** POST /api/v1/quests/{quest_id}/start/{user_id} */
async function apiStartQuest(questId, userId) {
  return apiFetch(`/api/v1/quests/${questId}/start/${userId}`, { method: "POST" });
}

/** POST /api/v1/quests/{quest_id}/complete/{user_id} */
async function apiCompleteQuest(questId, userId) {
  return apiFetch(`/api/v1/quests/${questId}/complete/${userId}`, { method: "POST" });
}
async function apiGenerateQuest(programmingLanguage, difficulty, topic) {
  return apiFetch("/api/v1/quests/generate", {
    method: "POST",
    body: JSON.stringify({
      programming_language: programmingLanguage,
      difficulty: difficulty,
      topic: topic,
    }),
  });
}

/**
 * POST /api/v1/ai/review
 * Sends quest instructions and user code to the AI review service.
 */

async function apiReviewCode(questId, userCode) {
  return apiFetch("/api/v1/ai/review", {
    method: "POST",
    body: JSON.stringify({
      user_id: CONFIG.DEV_USER_ID,
      quest_id: Number(questId),
      user_code: userCode,
    }),
  });
};


/* ═══════════════════════════════════════════════════════
   PROGRESSION
   Mirror of backend calculate_progression() logic.
   Used locally only for the progress bar percentage;
   authoritative values always come from the backend.
═══════════════════════════════════════════════════════ */

/**
 * Calculates the XP progress percentage within the current level.
 * Level N spans from (N-1)*100 XP to N*100 XP.
 * @param {number} totalXp
 * @param {number} nextLevelXp  - From backend progression.next_level_xp
 * @returns {number} Clamped 0–100
 */
function calcProgressPercent(totalXp, nextLevelXp) {
  const currentLevelStart = nextLevelXp - 100;
  const xpIntoLevel = totalXp - currentLevelStart;
  const raw = (xpIntoLevel / 100) * 100;
  return Math.min(100, Math.max(0, raw));
}

/* ═══════════════════════════════════════════════════════
   RENDER — PROFILE
═══════════════════════════════════════════════════════ */

/**
 * Updates the header user display with safe textContent.
 * @param {object} user       - Profile user object
 * @param {object} progression - Progression object from /progress
 */
function renderHeaderProfile(user, progression) {
  const initial = user.username ? user.username.charAt(0).toUpperCase() : "?";
  setTextSafe("userAvatar",    initial);
  setTextSafe("headerUsername", user.username || "—");
  setTextSafe("headerRank",     user.rank || progression.rank || "—");
  setTextSafe("profileAvatarLarge", initial);

  // Dropdown detail
  setTextSafe("dropdownUsername", user.username || "—");
  setTextSafe("dropdownEmail",    user.email    || "—");
}

/**
 * Updates the full player profile card.
 * @param {object} user
 * @param {object} progression
 */
function renderProfileCard(user, progression) {
  setTextSafe("profileUsername", user.username || "—");
  setTextSafe("profileRank",     user.rank     || progression.rank || "—");
  setTextSafe("profileLevel",    `Level ${user.level || progression.level}`);

  // XP progress bar
  const totalXp    = user.xp ?? progression.total_xp ?? 0;
  const nextLevel  = progression.next_level_xp ?? 100;
  const remaining  = progression.xp_to_next_level ?? (nextLevel - totalXp);
  const pct        = calcProgressPercent(totalXp, nextLevel);
  const levelStart = nextLevel - 100;

  const fill = document.getElementById("xpProgressFill");
  const bar  = document.getElementById("xpProgressBar");
  if (fill) fill.style.width = `${pct.toFixed(1)}%`;
  if (bar) {
    bar.setAttribute("aria-valuenow", Math.round(pct));
    bar.setAttribute("aria-label",    `XP progress: ${Math.round(pct)}%`);
  }

  setTextSafe("xpLabelValue",    `${totalXp} XP`);
  setTextSafe("xpCurrentLevel",  `${levelStart} XP`);
  setTextSafe("xpNextLevel",     `${nextLevel} XP`);
  setTextSafe("xpRemaining",     `${remaining} XP until next level`);
}

/* ═══════════════════════════════════════════════════════
   RENDER — STATS
═══════════════════════════════════════════════════════ */

/**
 * Populates the four statistics cards.
 * @param {object} user
 * @param {object} progression
 * @param {object} questStats  - { completed, in_progress }
 */
function renderStats(user, progression, questStats) {
  setTextSafe("statXpValue",        String(user.xp ?? progression.total_xp ?? 0));
  setTextSafe("statLevelValue",     String(user.level ?? progression.level ?? "—"));
  setTextSafe("statCompletedValue", String(questStats.completed ?? 0));
  setTextSafe("statActiveValue",    String(questStats.in_progress ?? 0));
}

/* ═══════════════════════════════════════════════════════
   RENDER — QUESTS
═══════════════════════════════════════════════════════ */

/**
 * Returns a filtered subset of quests based on active filter and search query.
 * @param {object[]} quests
 * @returns {object[]}
 */
function getFilteredQuests(quests) {
  const filter = STATE.activeFilter;
  const query  = STATE.searchQuery.toLowerCase();

  return quests.filter((q) => {
    // Resolve quest status relative to this user
    const userStatus = STATE.userQuestMap[q.id] || "Available";

    // Difficulty / status filter
    if (filter === "easy"        && q.difficulty.toLowerCase()   !== "easy")        return false;
    if (filter === "medium"      && q.difficulty.toLowerCase()   !== "medium")      return false;
    if (filter === "hard"        && q.difficulty.toLowerCase()   !== "hard")        return false;
    if (filter === "in-progress" && userStatus !== "In Progress") return false;
    if (filter === "completed"   && userStatus !== "Completed")   return false;

    // Text search
    if (query) {
      const haystack = `${q.title} ${q.description}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

/**
 * Renders the quest board grid. Each card is built with safe DOM methods.
 * @param {object[]} quests
 */
function renderQuestBoard(quests) {
  const board = document.getElementById("questBoard");
  if (!board) return;

  const filtered = getFilteredQuests(quests);

  if (filtered.length === 0) {
    board.innerHTML = "";
    board.appendChild(buildEmptyState("No quests match your current filters."));
    return;
  }

  // Rebuild cards without innerHTML to avoid XSS from server data
  board.innerHTML = "";
  filtered.forEach((quest) => {
    board.appendChild(buildQuestCard(quest));
  });
}

/**
 * Builds a single quest card DOM element.
 * Uses textContent for all user-derived strings.
 * @param {object} quest
 * @returns {HTMLElement}
 */
function buildQuestCard(quest) {
  const userStatus = STATE.userQuestMap[quest.id] || "Available";
  const diff       = (quest.difficulty || "Easy").toLowerCase();

  const card = document.createElement("article");
  card.className = "quest-card";
  card.setAttribute("data-quest-id", quest.id);

  // Header row
  const headerRow = document.createElement("div");
  headerRow.className = "quest-card-header";

  const title = document.createElement("h3");
  title.className = "quest-title";
  title.textContent = quest.title;

  const diffBadge = document.createElement("span");
  diffBadge.className = `difficulty-badge difficulty-${diff}`;
  diffBadge.textContent = quest.difficulty;

  headerRow.appendChild(title);
  headerRow.appendChild(diffBadge);

  // Description
  const desc = document.createElement("p");
  desc.className = "quest-desc";
  desc.textContent = quest.description;

  // Meta row
  const meta = document.createElement("div");
  meta.className = "quest-meta";

  const xpSpan = document.createElement("span");
  xpSpan.className = "quest-xp";
  xpSpan.textContent = `${quest.xp_reward} XP`;

  const statusBadge = document.createElement("span");
  statusBadge.className = `quest-status-badge ${statusClass(userStatus)}`;
  statusBadge.textContent = userStatus;

  meta.appendChild(xpSpan);
  meta.appendChild(statusBadge);

  // Action buttons
  const actions = document.createElement("div");
  actions.className = "quest-actions";

  if (userStatus === "Available") {
    const startBtn = document.createElement("button");
    startBtn.className = "btn btn-primary btn-sm";
    startBtn.textContent = "Start Quest";
    startBtn.setAttribute("aria-label", `Start quest: ${quest.title}`);
    startBtn.addEventListener("click", () => handleStartQuest(quest.id, startBtn));
    actions.appendChild(startBtn);
  } else if (userStatus === "In Progress") {
    const continueBtn = document.createElement("button");
    continueBtn.className = "btn btn-primary btn-sm";
    continueBtn.textContent = "Continue Quest";
    continueBtn.setAttribute(
      "aria-label",
      `Continue quest: ${quest.title}`
    ); continueBtn.addEventListener("click", () => {
      openQuestWorkspace(quest.id);
    });
    actions.appendChild(continueBtn);
  } else {
    const doneSpan = document.createElement("span");
    doneSpan.className = "btn btn-ghost btn-sm btn-disabled";
    doneSpan.setAttribute("aria-label", "Quest completed");
    doneSpan.textContent = "Completed";
    actions.appendChild(doneSpan);
  }

  card.appendChild(headerRow);
  card.appendChild(desc);
  card.appendChild(meta);
  card.appendChild(actions);

  return card;
}

/**
 * Renders the 3 most recently-started or available quests on the dashboard.
 * @param {object[]} quests
 */
function renderRecentQuests(quests) {
  const list = document.getElementById("recentQuestsList");
  if (!list) return;

  // Prefer in-progress quests; fall back to available
  const inProgress = quests.filter(
    (q) => STATE.userQuestMap[q.id] === "In Progress"
  );

  const available = quests.filter(
    (q) => STATE.userQuestMap[q.id] === "Available"
  );
  const combined    = [...inProgress, ...available].slice(0, 5);

  list.innerHTML = "";

  if (combined.length === 0) {
    const msg = document.createElement("p");
    msg.className = "card-empty";
    msg.textContent = "No active or available quests.";
    list.appendChild(msg);
    return;
  }

  combined.forEach((quest) => {
    const diff = (quest.difficulty || "Easy").toLowerCase();
    const item = document.createElement("div");
    item.className = "recent-quest-item";

    const dot = document.createElement("span");
    dot.className = "rqi-diff";
    dot.style.background = diffColor(diff);
    dot.setAttribute("aria-hidden", "true");

    const titleSpan = document.createElement("span");
    titleSpan.className = "rqi-title";
    titleSpan.textContent = quest.title;

    const xpSpan = document.createElement("span");
    xpSpan.className = "rqi-xp";
    xpSpan.textContent = `+${quest.xp_reward} XP`;

    item.appendChild(dot);
    item.appendChild(titleSpan);
    item.appendChild(xpSpan);
    list.appendChild(item);
  });
}

/** Maps difficulty string to CSS color variable value */
function diffColor(diff) {
  if (diff === "easy")   return "var(--diff-easy)";
  if (diff === "medium") return "var(--diff-medium)";
  if (diff === "hard")   return "var(--diff-hard)";
  return "var(--text-muted)";
}

/** Maps status string to CSS class suffix */
function statusClass(status) {
  if (status === "In Progress") return "status-inprogress";
  if (status === "Completed")   return "status-completed";
  return "status-available";
}

/* ═══════════════════════════════════════════════════════
   RENDER — SKILLS
═══════════════════════════════════════════════════════ */
const SKILL_CATEGORIES = [
  { name: "Python",         icon: "🐍", color: "var(--accent-blue)" },
  { name: "Java",           icon: "☕", color: "var(--accent-amber)" },
  { name: "Web Development",icon: "🌐", color: "var(--accent-cyan)" },
  { name: "DS & Algorithms",icon: "⚡", color: "var(--accent-violet)" },
  { name: "Database",       icon: "🗄️", color: "var(--accent-green)" },
];

function renderSkills() {
  const grid = document.getElementById("skillsGrid");
  if (!grid) return;

  grid.innerHTML = "";
  SKILL_CATEGORIES.forEach((skill) => {
    const card = document.createElement("div");
    card.className = "skill-card";

    const icon = document.createElement("div");
    icon.className = "skill-icon";
    icon.style.background = `${skill.color}22`; // low-opacity tint
    icon.setAttribute("aria-hidden", "true");
    // Use textContent; no HTML injection
    icon.textContent = skill.icon;

    const name = document.createElement("div");
    name.className = "skill-name";
    name.textContent = skill.name;

    const status = document.createElement("span");
    status.className = "skill-status";
    status.textContent = "Not assessed yet";

    card.appendChild(icon);
    card.appendChild(name);
    card.appendChild(status);
    grid.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════
   RENDER — HELPERS
═══════════════════════════════════════════════════════ */

/**
 * Safely sets textContent on an element by ID.
 * @param {string} id
 * @param {string} text
 */
function setTextSafe(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Builds a standardized empty-state element.
 * @param {string} message
 * @returns {HTMLElement}
 */
function buildEmptyState(message) {
  const div = document.createElement("div");
  div.className = "empty-state";

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 40 40");
  icon.setAttribute("fill", "none");
  icon.setAttribute("class", "empty-state-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = `<circle cx="20" cy="20" r="16" stroke="currentColor" stroke-width="1.5"/>
    <path d="M14 20h12M20 14v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>`;

  const p = document.createElement("p");
  p.textContent = message;

  div.appendChild(icon);
  div.appendChild(p);
  return div;
}

/** Shows a generic loading message inside an element. */
function showLoading(id, message = "Loading…") {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = "";
  const p = document.createElement("p");
  p.className = "card-loading";
  p.textContent = message;
  el.appendChild(p);
}

/** Shows an error message with an optional retry button inside an element. */
function showInlineError(id, message, retryFn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "card-error";

  const p = document.createElement("p");
  p.textContent = message;
  wrapper.appendChild(p);

  if (retryFn) {
    const btn = document.createElement("button");
    btn.className = "btn btn-ghost btn-sm";
    btn.style.marginTop = "var(--sp-3)";
    btn.textContent = "Retry";
    btn.addEventListener("click", retryFn);
    wrapper.appendChild(btn);
  }

  el.appendChild(wrapper);
}

/* ═══════════════════════════════════════════════════════
   TOAST
   User-facing status notifications.
═══════════════════════════════════════════════════════ */

/**
 * Displays a dismissible toast notification.
 * @param {string} message
 * @param {"success"|"error"|"info"} type
 * @param {number} [duration=5000] - Auto-dismiss delay in ms (0 = no auto-dismiss)
 */
function showToast(message, type = "info", duration = 5000) {
  const region = document.getElementById("toastRegion");
  if (!region) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "alert");

  const text = document.createElement("span");
  text.textContent = message;

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.setAttribute("aria-label", "Dismiss notification");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => toast.remove());

  toast.appendChild(text);
  toast.appendChild(closeBtn);
  region.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => toast.remove(), duration);
  }
}

/* ═══════════════════════════════════════════════════════
   QUEST ACTIONS
   Prevents duplicate submissions with STATE.pendingAction.
═══════════════════════════════════════════════════════ */

/**
 * Starts a quest for the current dev user.
 * @param {number} questId
 * @param {HTMLButtonElement} btn - Triggering button (for loading state)
 */
function saveWorkspaceCode(questId, code) {
  const key = `devmentor_code_${CONFIG.DEV_USER_ID}_${questId}`;

  try {
    localStorage.setItem(key, code);
    return true;
  } catch (error) {
    console.error("Gagal menyimpan draft kode:", error);
    return false;
  }
}

function loadWorkspaceCode(questId) {
  const key = `devmentor_code_${CONFIG.DEV_USER_ID}_${questId}`;

  try {
    return localStorage.getItem(key) || "";
  } catch (error) {
    console.error("Gagal memuat draft kode:", error);
    return "";
  }
}

function openQuestWorkspace(questId) {
  const quest = STATE.allQuests.find(
    (item) => Number(item.id) === Number(questId)
  );

  if (!quest) {
    showToast("Quest tidak ditemukan.", "error");
    return;
  }

  // Simpan quest yang sedang dikerjakan
  STATE.currentQuest = quest;

  // Reset status review untuk quest yang sedang dibuka
  STATE.currentQuestReviewPassed = false;

  // Tampilkan informasi quest
  setTextSafe("workHeading", quest.title || "Quest Workspace");
  setTextSafe("workQuestDifficulty", quest.difficulty || "Easy");
  setTextSafe("workQuestDescription", quest.description || "No description available.");
  setTextSafe("workQuestLanguage", quest.programming_language || "Not specified");
  setTextSafe("workQuestXP", `${quest.xp_reward ?? 0} XP`);

  // Tampilkan requirements
  const requirements = quest.requirements;
  setTextSafe(
    "workQuestRequirements",
    Array.isArray(requirements)
      ? requirements.join("\n")
      : typeof requirements === "object" && requirements !== null
        ? JSON.stringify(requirements, null, 2)
        : requirements || "No requirements specified."
  );

  // Tampilkan acceptance criteria
  const criteria = quest.acceptance_criteria;
  setTextSafe(
    "workQuestCriteria",
    Array.isArray(criteria)
      ? criteria.join("\n")
      : typeof criteria === "object" && criteria !== null
        ? JSON.stringify(criteria, null, 2)
        : criteria || "No acceptance criteria specified."
  );

  // Pulihkan kode yang sebelumnya ditulis untuk quest ini
  const codeEditor = document.getElementById("workCodeEditor");

  if (codeEditor) {
    codeEditor.value = loadWorkspaceCode(quest.id);
  }

  // Reset hasil review saat workspace dibuka
  setTextSafe(
    "workReviewResult",
    "Your review feedback will appear here."
  );

  setTextSafe(
    "workStatus",
    "Write your solution before submitting it for AI review."
  );

  // Tampilkan halaman Coding Workspace setelah data disiapkan.
  navigateTo("work");
}

async function handleStartQuest(questId, btn) {
  if (STATE.pendingAction) return;
  STATE.pendingAction = true;

  const originalText = btn.textContent;
  btn.textContent = "Starting…";
  btn.classList.add("btn-loading");
  btn.disabled = true;

  try {
    await apiStartQuest(questId, CONFIG.DEV_USER_ID);

    STATE.userQuestMap[questId] = "In Progress";
    saveQuestStatus();

    showToast("Quest started! Welcome to your Coding Workspace.", "success");

    // Perbarui daftar quest dan statistik
    renderQuestBoard(STATE.allQuests);
    renderRecentQuests(STATE.allQuests);
    await refreshProgress();

    // Buka workspace untuk quest yang dipilih
    openQuestWorkspace(questId);

  } catch (err) {
    if (err.status === 409) {
      STATE.userQuestMap[questId] = "In Progress";
      saveQuestStatus();
      renderQuestBoard(STATE.allQuests);
      renderRecentQuests(STATE.allQuests);
      showToast("Quest already started. Opening workspace.", "info");
      openQuestWorkspace(questId);
    } else {
      showToast(`Could not start quest: ${err.message}`, "error", 0);
      btn.textContent = originalText;
      btn.classList.remove("btn-loading");
      btn.disabled = false;
    }
  } finally {
    STATE.pendingAction = false;
  }
}

/**
 * Completes a quest for the current dev user.
 * @param {number} questId
 * @param {HTMLButtonElement} btn
 */

async function handleCompleteQuest(questId, btn) {
  if (STATE.pendingAction) return;
  STATE.pendingAction = true;

  const originalText = btn.textContent;
  btn.textContent = "Completing…";
  btn.classList.add("btn-loading");
  btn.disabled = true;

  try {
    // Backend akan memeriksa review_status dari database.
    const res = await apiCompleteQuest(
      questId,
      CONFIG.DEV_USER_ID
    );

    STATE.userQuestMap[questId] = "Completed";
    saveQuestStatus();

    // Update profil berdasarkan respons backend.
    if (res.user && res.progression) {
      STATE.profile = {
        ...STATE.profile,
        ...res.user,
      };

      STATE.progression = res.progression;

      if (STATE.questStats) {
        STATE.questStats.completed =
          (STATE.questStats.completed || 0) + 1;

        STATE.questStats.in_progress = Math.max(
          0,
          (STATE.questStats.in_progress || 0) - 1
        );
      }

      renderProfileCard(
        STATE.profile,
        STATE.progression
      );

      renderHeaderProfile(
        STATE.profile,
        STATE.progression
      );

      renderStats(
        STATE.profile,
        STATE.progression,
        STATE.questStats
      );
    }

    const xpEarned = res.xp_earned ?? 0;
    const newLevel = res.progression?.level ?? "";

    showToast(
      `Quest complete! +${xpEarned} XP earned. You are now Level ${newLevel}.`,
      "success"
    );

    // Ambil ulang status quest dari backend.
    await refreshQuests();

    renderQuestBoard(STATE.allQuests);
    renderRecentQuests(STATE.allQuests);

    // Ambil ulang status quest dari backend.
    navigateTo("quests");

  } catch (err) {
    if (err.status === 403) {
      showToast(
        "Quest belum bisa diselesaikan. Pastikan AI Review sudah berstatus MEMENUHI INSTRUKSI.",
        "error",
        0
      );
    } else if (err.status === 409) {
      showToast(
        "Quest ini sudah diselesaikan sebelumnya.",
        "info"
      );

      await refreshQuests();

      renderQuestBoard(STATE.allQuests);
      renderRecentQuests(STATE.allQuests);

    } else if (err.status === 404) {
      showToast(
        "Quest tidak ditemukan atau belum dimulai. Mulai quest terlebih dahulu.",
        "error",
        0
      );
    } else {
      showToast(
        `Could not complete quest: ${err.message}`,
        "error",
        0
      );
    }

  } finally {
    STATE.pendingAction = false;

    // Pulihkan tombol, kecuali jika tombol sudah tidak ada di DOM.
    if (btn.isConnected) {
      btn.textContent = originalText;
      btn.classList.remove("btn-loading");
      btn.disabled = false;
    }
  }
}

/* ═══════════════════════════════════════════════════════
   DATA LOADING
═══════════════════════════════════════════════════════ */

/**
 * Fetches profile + progression and re-renders relevant components.
 * Called on initial load and after quest completion.
 */
async function refreshProgress() {
  try {
    const data = await apiGetProgress(CONFIG.DEV_USER_ID);
    STATE.profile    = data.user;
    STATE.progression = data.progression;
    STATE.questStats  = data.quests;

    renderHeaderProfile(STATE.profile, STATE.progression);
    renderProfileCard(STATE.profile, STATE.progression);
    renderStats(STATE.profile, STATE.progression, STATE.questStats);
  } catch (err) {
    if (err.status === 404) {
      showToast(
        `User ID ${CONFIG.DEV_USER_ID} not found. Check CONFIG.DEV_USER_ID in script.js.`,
        "error",
        0
      );
    } else {
      showToast(`Failed to load profile: ${err.message}`, "error", 0);
    }
    // Render fallback skeletons as dashes
    renderStatsError();
  }
}

/** Replaces skeleton loaders with dashes on profile load error. */
function renderStatsError() {
  ["statXpValue", "statLevelValue", "statCompletedValue", "statActiveValue"].forEach((id) => {
    setTextSafe(id, "—");
  });
  setTextSafe("headerUsername",  "—");
  setTextSafe("headerRank",      "—");
  setTextSafe("profileUsername", "—");
  setTextSafe("profileRank",     "—");
  setTextSafe("profileLevel",    "—");
  setTextSafe("xpLabelValue",    "—");
  setTextSafe("xpRemaining",     "Profile unavailable");
}

/**
 * Fetches all quests, reconstructs userQuestMap from progress data,
 * then renders the quest board and recent quests panel.
 */
async function refreshQuests() {
  showLoading("questBoard",       "Loading quests…");
  showLoading("recentQuestsList", "Loading quests…");

  try {
    // Fetch quests and the user's current quest activity in parallel
    const [questsData, progressData] = await Promise.all([
      apiGetQuests(),
      apiGetProgress(CONFIG.DEV_USER_ID).catch(() => null), // don't fail if already loaded
    ]);

    STATE.allQuests = questsData.quests || [];
    // Sinkronkan status quest dengan database
    STATE.userQuestMap = {};

    STATE.allQuests.forEach((quest) => {
      STATE.userQuestMap[quest.id] = quest.user_status || "Available";
    });

    // Simpan salinan status untuk pemulihan sementara di browser
    saveQuestStatus();

    // Rebuild userQuestMap from progress response if we have one
    if (progressData) {
      STATE.profile    = progressData.user;
      STATE.progression = progressData.progression;
      STATE.questStats  = progressData.quests;
    }
    
    // Render quest board menggunakan status yang tersimpan
    renderQuestBoard(STATE.allQuests);
    renderRecentQuests(STATE.allQuests);

  } catch (err) {
    showInlineError(
      "questBoard",
      `Could not load quests: ${err.message}`,
      refreshQuests
    );
    showInlineError(
      "recentQuestsList",
      "Could not load quests.",
      refreshQuests
    );
  }
}

/**
 * Loads all dashboard data on initial page load.
 * Runs progress and quests fetches in parallel for speed.
 */
async function loadDashboard() {
  await Promise.all([
    refreshProgress(),
    refreshQuests(),
  ]);
}

async function handleGenerateQuest() {
  const languageInput = document.getElementById("generatorLanguage");
  const difficultyInput = document.getElementById("generatorDifficulty");
  const topicInput = document.getElementById("generatorTopic");
  const generateBtn = document.getElementById("generateQuestBtn");
  const status = document.getElementById("generatorStatus");
  const resultText = document.getElementById("generatedQuestText");

  if (
    !languageInput ||
    !difficultyInput ||
    !topicInput ||
    !generateBtn ||
    !status ||
    !resultText
  ) {
    console.error("AI Quest Generator elements were not found.");
    return;
  }

  const programmingLanguage = languageInput.value;
  const difficulty = difficultyInput.value;
  const topic = topicInput.value.trim();

  if (!topic) {
    status.textContent = "Please enter a quest topic.";
    topicInput.focus();
    return;
  }

  const originalText = generateBtn.textContent;

  generateBtn.disabled = true;
  generateBtn.textContent = "Generating...";
  status.textContent = "AI is generating your quest. Please wait...";
  resultText.textContent = "Creating your coding challenge...";

  try {
    const response = await apiGenerateQuest(
      programmingLanguage,
      difficulty,
      topic
    );

    const quest = response.quest || response;

    const details = [
      ["JUDUL QUEST", quest.title],
      ["TINGKAT KESULITAN", quest.difficulty],
      ["REKOMENDASI XP", quest.xp_reward],
      ["BAHASA PEMROGRAMAN", quest.programming_language],
      ["TUJUAN PEMBELAJARAN", quest.learning_objectives],
      ["DESKRIPSI MASALAH", quest.description],
      ["PERSYARATAN", quest.requirements],
      ["BATASAN", quest.constraints],
      ["KRITERIA PENYELESAIAN", quest.acceptance_criteria],
      ["CONTOH INPUT DAN OUTPUT", quest.examples],
      ["KASUS KHUSUS", quest.edge_cases],
      ["PETUNJUK", quest.hints],
    ];

    resultText.textContent = details
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([label, value]) => {
        const formattedValue =
          typeof value === "object"
            ? JSON.stringify(value, null, 2)
            : String(value);

        return `${label}\n${formattedValue}`;
      })
      .join("\n\n");

    status.textContent = "Quest generated and saved successfully.";

    showToast("AI quest generated successfully.", "success");

    await refreshQuests();

  } catch (error) {
    console.error("AI Quest Generator error:", error);

    resultText.textContent = "Unable to generate the quest. Please try again.";
    status.textContent = `Generation failed: ${error.message}`;

    showToast(`Quest generation failed: ${error.message}`, "error", 0);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = originalText || "Generate Quest";
  }
}

async function handleWorkspaceReview() {
  const codeInput = document.getElementById("workCodeEditor");
  const reviewBtn = document.getElementById("workReviewBtn");
  const status = document.getElementById("workStatus");
  const result = document.getElementById("workReviewResult");

  const quest = STATE.currentQuest;
  const userCode = codeInput.value.trim();

  if (!quest) {
    status.textContent = "No active quest selected.";
    return;
  }

  if (!userCode) {
    status.textContent = "Write your code before requesting a review.";
    codeInput.focus();
    return;
  }

  const originalText = reviewBtn.textContent;

  reviewBtn.disabled = true;
  reviewBtn.textContent = "Reviewing...";
  status.textContent = "AI is reviewing your solution...";
  result.textContent = "Analyzing your code. Please wait.";

  try {
    const response = await apiReviewCode(quest.id, userCode);

    if (!response || typeof response.review !== "string") {
      throw new Error("The AI service returned an invalid response.");
    }

    // Tampilkan hasil AI Review.
    result.textContent = response.review;

    // Tampilkan status berdasarkan hasil yang disimpan backend.
    if (response.review_status === "MEMENUHI INSTRUKSI") {
      status.textContent =
        "Review passed! Your code meets the quest requirements.";

      // Tandai bahwa kode sudah lolos review.
      STATE.currentQuestReviewPassed = true;
    } else {
      status.textContent =
        "Review not passed. Read the feedback and revise your code.";

      STATE.currentQuestReviewPassed = false;
    }

  } catch (error) {
    result.textContent = "Unable to retrieve the AI review.";
    status.textContent = `Review failed: ${error.message}`;

    STATE.currentQuestReviewPassed = false;
  } finally {
    reviewBtn.disabled = false;
    reviewBtn.textContent = originalText || "Review Code";
  }
}

/* ═══════════════════════════════════════════════════════
   NAV — Page switching and sidebar
═══════════════════════════════════════════════════════ */
const PAGE_META = {
  dashboard: { title: "Dashboard",          subtitle: "Your programming progression overview" },
  quests:    { title: "Coding Quests",      subtitle: "Browse, start, and complete coding challenges" },
  work:      { title: "Coding Workspace",   subtitle: "Complete your quest and submit your code for AI review" },
  generator: { title: "AI Quest Generator", subtitle: "Generate personalized programming challenges" },
  progress:  { title: "My Progress",        subtitle: "Track your XP history and milestones" },
  skills:    { title: "Skill Development",  subtitle: "Programming categories and skill levels" },
  settings:  { title: "Settings",           subtitle: "Preferences and account management" },
};

/**
 * Navigates to a named page section.
 * @param {string} pageId - Matches data-page attribute and page-{id} element ID
 */
function navigateTo(pageId) {
  // Hide all pages
  document.querySelectorAll(".page").forEach((p) => {
    p.classList.remove("active");
    p.hidden = true;
  });

  // Show target page
  const target = document.getElementById(`page-${pageId}`);
  if (target) {
    target.hidden = false;
    target.classList.add("active");
  }

  // Update nav active state
  document.querySelectorAll(".nav-item").forEach((item) => {
    const isActive = item.getAttribute("data-page") === pageId;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-current", isActive ? "page" : "false");
  });

  // Update header title and subtitle
  const meta = PAGE_META[pageId] || { title: pageId, subtitle: "" };
  setTextSafe("pageTitle",    meta.title);
  setTextSafe("pageSubtitle", meta.subtitle);

  // Lazy-render skills only when first visiting the page
  if (pageId === "skills") {
    const grid = document.getElementById("skillsGrid");
    if (grid && grid.children.length === 0) renderSkills();
  }

  // Close mobile sidebar
  closeSidebar();
}

function openSidebar() {
  const sidebar   = document.getElementById("sidebar");
  const overlay   = document.getElementById("navOverlay");
  const menuBtn   = document.getElementById("mobileMenuBtn");
  if (sidebar)  sidebar.classList.add("open");
  if (overlay)  overlay.classList.add("active");
  if (menuBtn)  menuBtn.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  const sidebar   = document.getElementById("sidebar");
  const overlay   = document.getElementById("navOverlay");
  const menuBtn   = document.getElementById("mobileMenuBtn");
  if (sidebar)  sidebar.classList.remove("open");
  if (overlay)  overlay.classList.remove("active");
  if (menuBtn)  menuBtn.setAttribute("aria-expanded", "false");
}

/* ═══════════════════════════════════════════════════════
   EVENTS
═══════════════════════════════════════════════════════ */

function registerEvents() {
  const backToQuestsBtn = document.getElementById("backToQuestsBtn");
  if (backToQuestsBtn) {
    backToQuestsBtn.addEventListener("click", async () => {
      navigateTo("quests");
      await refreshQuests();
    });
  }

  // ── Coding Workspace autosave ──
  const workCodeEditor = document.getElementById("workCodeEditor");

  if (workCodeEditor) {
    workCodeEditor.addEventListener("input", () => {
      const quest = STATE.currentQuest;

      if (!quest) return;

      try {
        saveWorkspaceCode(quest.id, workCodeEditor.value);
        setTextSafe("workStatus", "Draft saved automatically.");
      } catch (error) {
        setTextSafe("workStatus", "Unable to save your draft in this browser session.");
      }
    });
  }

  // ── Sidebar nav items ──
  document.querySelectorAll(".nav-item[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.getAttribute("data-page")));
  });

  // ── Card "View all" links ──
  document.querySelectorAll(".card-link-btn[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.getAttribute("data-page")));
  });

  // ── Mobile menu ──
  const menuBtn = document.getElementById("mobileMenuBtn");
  if (menuBtn) menuBtn.addEventListener("click", openSidebar);

  const overlay = document.getElementById("navOverlay");
  if (overlay) overlay.addEventListener("click", closeSidebar);

  // ── Profile dropdown ──
  const profileBtn = document.getElementById("userProfileBtn");
  const dropdown   = document.getElementById("profileDropdown");
  if (profileBtn && dropdown) {
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = !dropdown.hidden;
      dropdown.hidden = isOpen;
      profileBtn.setAttribute("aria-expanded", String(!isOpen));
    });

    document.addEventListener("click", () => {
      if (!dropdown.hidden) {
        dropdown.hidden = true;
        profileBtn.setAttribute("aria-expanded", "false");
      }
    });

    dropdown.addEventListener("click", (e) => e.stopPropagation());
  }

  // ── Refresh button in dropdown ──
  const refreshBtn = document.getElementById("refreshDataBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      if (dropdown) dropdown.hidden = true;
      showToast("Refreshing data…", "info", 2000);
      await loadDashboard();
      showToast("Dashboard refreshed.", "success");
    });
  }

  // ── Quest board search ──
  const questSearch = document.getElementById("questSearch");
  if (questSearch) {
    questSearch.addEventListener("input", () => {
      STATE.searchQuery = questSearch.value.trim();
      renderQuestBoard(STATE.allQuests);
    });
  }

  // ── Header search (syncs to quest board) ──
  const headerSearch = document.getElementById("headerSearch");
  if (headerSearch) {
    headerSearch.addEventListener("input", () => {
      STATE.searchQuery = headerSearch.value.trim();
      const questSearchEl = document.getElementById("questSearch");
      if (questSearchEl) questSearchEl.value = headerSearch.value;
      // Navigate to quests page if typing in header search
      if (STATE.searchQuery) navigateTo("quests");
      renderQuestBoard(STATE.allQuests);
    });
  }

  // ── Filter pills ──
  const filterPills = document.querySelectorAll(".filter-pill");
  filterPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      filterPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      STATE.activeFilter = pill.getAttribute("data-filter");
      renderQuestBoard(STATE.allQuests);
    });
  });

  // ── Keyboard support: close sidebar with Escape ──
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSidebar();
      const dropdown = document.getElementById("profileDropdown");
      const profileBtn = document.getElementById("userProfileBtn");
      if (dropdown && !dropdown.hidden) {
        dropdown.hidden = true;
        if (profileBtn) profileBtn.setAttribute("aria-expanded", "false");
      }
    }
  });

  // ── Coding Workspace Review ──
  const workReviewBtn = document.getElementById("workReviewBtn");

  if (workReviewBtn) {
    workReviewBtn.addEventListener("click", handleWorkspaceReview);
  }

 const workCompleteBtn = document.getElementById("workCompleteBtn");

if (workCompleteBtn) {
  workCompleteBtn.addEventListener("click", () => {
    const quest = STATE.currentQuest;

    if (!quest) {
      showToast("No active quest selected.", "error");
      return;
    }

    handleCompleteQuest(quest.id, workCompleteBtn);
  });
}

  // ── AI Quest Generator ──
  const generateQuestBtn = document.getElementById("generateQuestBtn");
  const generatorTopic = document.getElementById("generatorTopic");

  if (generateQuestBtn) {
    generateQuestBtn.addEventListener("click", handleGenerateQuest);
  }

  if (generatorTopic) {
    generatorTopic.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleGenerateQuest();
      }
    });
  }
}

/* ═══════════════════════════════════════════════════════
   INIT
   Application bootstrap — runs once on DOMContentLoaded.
═══════════════════════════════════════════════════════ */

async function init() {
  // Register all event listeners first so the UI is interactive immediately
  registerEvents();

  // Set initial page state (dashboard is default)
  navigateTo("dashboard");

  // Load all data
  await loadDashboard();
}

document.addEventListener("DOMContentLoaded", init);
