
import {
  initializeDatabase,
  seedInitialRanks,
  reconcileHigherRankAssignments,
  getAll,
  getById,
  addItem,
  updateItem,
  deleteItem,
  deleteMember,
  deleteRank,
  assignRankHolder,
  transferRankHolder,
  removeRankHolder,
  moveRank,
  saveMemberRecord,
  getRankAssignmentConflicts,
  exportDatabase,
  importDatabase,
  STORES
} from "./database.js";

/* -------------------------------------------------------
   DOM HELPERS
------------------------------------------------------- */

const $ = (selector) => document.querySelector(selector);

const pageTitles = {
  members: "Main GC Members",
  higher: "Higher Ranks",
  soldier: "Soldier Ranks",
  texts: "Copy-Paste Texts"
};

const PREDEFINED_SKILLS = [
  "Meme",
  "Art",
  "AMV",
  "Dub",
  "Game"
];

const state = {
  page: "members",
  members: [],
  ranks: [],
  texts: [],
  activeHolderRankId: null,
  currentProfileId: null,
  editorType: "",
  editingId: null,
  ready: false
};

const modal = $("#editor-modal");
const editorForm = $("#editor-form");
const modalFields = $("#modal-fields");

const holderModal = $("#holder-modal");
const detailsModal = $("#details-modal");
const confirmModal = $("#confirm-modal");

/* -------------------------------------------------------
   GENERAL HELPERS
------------------------------------------------------- */

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function safeExternalURL(value) {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return "—";

  const parts = String(value).split("-");

  if (
    parts.length !== 3 ||
    parts.some((part) => !/^\d+$/.test(part))
  ) {
    return "—";
  }

  const [year, month, day] = parts.map(Number);

  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function setStatus(message, status = "ready") {
  const statusElement = $("#app-status");

  const dot = statusElement.querySelector(".status-dot");

  statusElement.dataset.state = status;
  statusElement.textContent = "";

  if (dot) {
    statusElement.append(dot);
  }

  statusElement.append(
    document.createTextNode(message)
  );
}

function showAppError(error) {
  const message =
    error?.message || "Unknown initialization error.";

  $("#app-error").hidden = false;

  $("#app-error-message").textContent = message;

  setStatus("Database unavailable", "error");
}

function toast(message, type = "success") {
  const element = document.createElement("div");

  element.className = `toast toast-${type}`;
  element.textContent = message;

  $("#toast-container").append(element);

  setTimeout(() => {
    element.classList.add("toast-out");

    setTimeout(() => element.remove(), 200);
  }, 2800);
}

function field(label, name, value = "", type = "text", options = {}) {
  const required = options.required ? "required" : "";
  const placeholder = options.placeholder || "";
  const help = options.help || "";
  const rows = options.rows || 4;

  const maxlength = options.maxlength
    ? `maxlength="${Number(options.maxlength)}"`
    : "";

  if (type === "textarea") {
    return `
      <label class="form-field">
        <span>${escapeHTML(label)}</span>

        <textarea
          name="${escapeHTML(name)}"
          placeholder="${escapeHTML(placeholder)}"
          ${required}
          ${maxlength}
          rows="${rows}"
        >${escapeHTML(value)}</textarea>

        ${help
          ? `<small class="field-help">${escapeHTML(help)}</small>`
          : ""
        }
      </label>
    `;
  }

  return `
    <label class="form-field">
      <span>${escapeHTML(label)}</span>

      <input
        type="${escapeHTML(type)}"
        name="${escapeHTML(name)}"
        value="${escapeHTML(value)}"
        placeholder="${escapeHTML(placeholder)}"
        ${required}
        ${maxlength}
      />

      ${help
        ? `<small class="field-help">${escapeHTML(help)}</small>`
        : ""
        }
    </label>
  `;
}

function getMemberById(id) {
  return state.members.find(
    (member) => Number(member.id) === Number(id)
  );
}

function getRankById(id) {
  return state.ranks.find(
    (rank) => Number(rank.id) === Number(id)
  );
}

function getHigherRankName(member) {
  if (
    !member ||
    member.rank !== "Higher" ||
    member.higher_rank_id == null
  ) {
    return "";
  }

  return getRankById(member.higher_rank_id)?.name || "";
}

function memberRankHTML(member) {
  if (member.rank === "Higher") {
    const higherRankName = getHigherRankName(member);

    return `
      <div class="member-rank-cell">
        <span class="rank-badge">Higher</span>

        <small class="rank-detail">
          ${escapeHTML(higherRankName || "Rank unavailable")}
        </small>
      </div>
    `;
  }

  return `
    <span class="rank-badge">
      ${escapeHTML(member.rank || "Trainee")}
    </span>
  `;
}

/* -------------------------------------------------------
   CONFIRMATION DIALOG
------------------------------------------------------- */

function askConfirmation({
  title = "Confirm Action",
  message = "Are you sure you want to continue?",
  confirmLabel = "Confirm",
  danger = true
} = {}) {
  return new Promise((resolve) => {
    $("#confirm-title").textContent = title;
    $("#confirm-message").textContent = message;
    $("#confirm-submit").textContent = confirmLabel;

    $("#confirm-submit").classList.toggle(
      "danger-button",
      danger
    );

    confirmModal.returnValue = "cancel";

    const handleClose = () => {
      resolve(confirmModal.returnValue === "confirm");
    };

    confirmModal.addEventListener("close", handleClose, {
      once: true
    });

    confirmModal.showModal();
  });
}

/* -------------------------------------------------------
   NAVIGATION
------------------------------------------------------- */

function setPage(page) {
  if (!pageTitles[page]) return;

  state.page = page;

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  document.querySelectorAll(".page-section").forEach((section) => {
    section.classList.toggle(
      "active",
      section.id === `page-${page}`
    );
  });

  $("#page-title").textContent = pageTitles[page];

  renderCurrentPage();
}

function renderCurrentPage() {
  if (!state.ready) return;

  if (state.page === "members") renderMembers();
  if (state.page === "higher") renderRanks("higher");
  if (state.page === "soldier") renderRanks("soldier");
  if (state.page === "texts") renderTexts();
}

/* -------------------------------------------------------
   DATABASE REFRESH
------------------------------------------------------- */

async function refreshData() {
  const [members, ranks, texts] = await Promise.all([
    getAll(STORES.MEMBERS),
    getAll(STORES.RANKS),
    getAll(STORES.TEXTS)
  ]);

  state.members = members;
  state.ranks = ranks;
  state.texts = texts;

  populateMemberFilters();
  populateTextCategories();

  renderCurrentPage();
}

/* -------------------------------------------------------
   MEMBER FILTERS
------------------------------------------------------- */

function populateMemberFilters() {
  const squadFilter = $("#squad-filter");
  const rankFilter = $("#rank-filter");

  const selectedSquad = squadFilter.value;
  const selectedRank = rankFilter.value;

  const squads = [...new Set(
    state.members
      .map((member) => member.squad.trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  const ranks = [...new Set(
    state.members
      .map((member) => member.rank.trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  squadFilter.innerHTML = `
    <option value="">All Squads</option>

    ${squads.map((squad) => `
      <option value="${escapeHTML(squad)}">
        ${escapeHTML(squad)}
      </option>
    `).join("")}
  `;

  rankFilter.innerHTML = `
    <option value="">All Ranks</option>

    ${ranks.map((rank) => `
      <option value="${escapeHTML(rank)}">
        ${escapeHTML(rank)}
      </option>
    `).join("")}
  `;

  squadFilter.value = squads.includes(selectedSquad)
    ? selectedSquad
    : "";

  rankFilter.value = ranks.includes(selectedRank)
    ? selectedRank
    : "";
}

/* -------------------------------------------------------
   MEMBER TABLE
------------------------------------------------------- */

function renderMembers() {
  const search = $("#member-search").value
    .trim()
    .toLowerCase();

  const selectedSquad = $("#squad-filter").value;
  const selectedRank = $("#rank-filter").value;

  const members = state.members.filter((member) => {
    const higherRankName = getHigherRankName(member);

    const searchable = [
      member.facebook_name,
      member.real_name,
      member.rank,
      higherRankName,
      member.squad,
      member.facebook_link,
      member.added_by,
      member.other_anime_groups,
      member.other_wofbd_units,
      ...(member.skills || [])
    ].join(" ").toLowerCase();

    return (
      searchable.includes(search) &&
      (!selectedSquad || member.squad === selectedSquad) &&
      (!selectedRank || member.rank === selectedRank)
    );
  });

  $("#member-count").textContent =
    `${members.length} of ${state.members.length} members`;

  $("#members-empty").hidden = members.length > 0;

  if (members.length === 0) {
    $("#members-empty").querySelector("h4").textContent =
      state.members.length === 0
        ? "No members yet"
        : "No matching members";

    return;
  }

  $("#members-table").innerHTML = members
    .sort((a, b) =>
      a.facebook_name.localeCompare(b.facebook_name)
    )
    .map((member) => {
      const facebookURL = safeExternalURL(
        member.facebook_link
      );

      const skillTags = (member.skills || [])
        .map((skill) => `
          <span class="skill-tag">
            ${escapeHTML(skill)}
          </span>
        `)
        .join("");

      return `
        <tr>
          <td>
            <button
              class="member-primary-link"
              type="button"
              data-view-member="${member.id}"
            >
              ${escapeHTML(
                member.facebook_name || "Unnamed Member"
              )}
            </button>
          </td>

          <td class="secondary-cell">
            ${escapeHTML(member.real_name || "—")}
          </td>

          <td>
            ${memberRankHTML(member)}
          </td>

          <td>
            ${escapeHTML(member.squad || "—")}
          </td>

          <td>
            <div class="skill-tags">
              ${skillTags || '<span class="muted-text">—</span>'}
            </div>
          </td>

          <td class="date-cell">
            ${escapeHTML(formatDate(member.join_date))}
          </td>

          <td>
            ${facebookURL
              ? `
                <a
                  href="${escapeHTML(facebookURL)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="link"
                >
                  Open ↗
                </a>
              `
              : '<span class="muted-text">—</span>'
            }
          </td>

          <td>
            <div class="table-actions">
              <button
                class="icon-button"
                type="button"
                data-view-member="${member.id}"
                title="View profile"
                aria-label="View profile"
              >◉</button>

              <button
                class="icon-button"
                type="button"
                data-edit-member="${member.id}"
                title="Edit member"
                aria-label="Edit member"
              >✎</button>

              <button
                class="icon-button danger"
                type="button"
                data-delete-member="${member.id}"
                title="Delete member"
                aria-label="Delete member"
              >×</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

/* -------------------------------------------------------
   MEMBER RANK DROPDOWN
------------------------------------------------------- */

function buildRankOptions(currentRank = "Trainee") {
  const soldierRanks = state.ranks
    .filter((rank) => rank.type === "soldier")
    .sort((a, b) => a.position - b.position);

  const names = soldierRanks.map((rank) => rank.name);

  if (
    currentRank &&
    currentRank !== "Higher" &&
    !names.includes(currentRank)
  ) {
    names.push(currentRank);
  }

  if (!names.includes("Trainee")) {
    names.push("Trainee");
  }

  return `
    <option
      value="Higher"
      ${currentRank === "Higher" ? "selected" : ""}
    >
      Higher
    </option>

    ${names.map((rank) => `
      <option
        value="${escapeHTML(rank)}"
        ${rank === currentRank ? "selected" : ""}
      >
        ${escapeHTML(rank)}
      </option>
    `).join("")}
  `;
}

/**
 * This dropdown is populated from the actual Higher Rank
 * IndexedDB records. No duplicate list is maintained here.
 */
function buildHigherRankField(selectedRankId = null) {
  const higherRanks = state.ranks
    .filter((rank) => rank.type === "higher")
    .sort((a, b) => a.position - b.position);

  const options = higherRanks.map((rank) => `
    <option
      value="${rank.id}"
      ${Number(rank.id) === Number(selectedRankId) ? "selected" : ""}
    >
      ${escapeHTML(rank.name)}
    </option>
  `).join("");

  return `
    <div
      class="form-field higher-rank-field"
      id="higher-rank-field"
      hidden
    >
      <span>Specific Higher Rank</span>

      <select
        name="higher_rank_id"
        id="member-higher-rank-select"
      >
        <option value="">Select a Higher Rank</option>
        ${options}
      </select>

      <small class="field-help" id="higher-rank-help">
        ${higherRanks.length > 0
          ? "Select the exact Higher Rank this member will hold."
          : "No Higher Ranks are available. Add one in the Higher Ranks section."
        }
      </small>
    </div>
  `;
}

function syncHigherRankField() {
  const rankSelect = $("#member-rank-select");
  const wrapper = $("#higher-rank-field");
  const higherRankSelect = $("#member-higher-rank-select");

  if (
    !rankSelect ||
    !wrapper ||
    !higherRankSelect
  ) {
    return;
  }

  const isHigher = rankSelect.value === "Higher";

  wrapper.hidden = !isHigher;

  const hasRanks = [...higherRankSelect.options].some(
    (option) => option.value !== ""
  );

  higherRankSelect.disabled = !isHigher || !hasRanks;
  higherRankSelect.required = isHigher && hasRanks;

  if (!isHigher) {
    higherRankSelect.value = "";
  }
}

/* -------------------------------------------------------
   MEMBER SKILLS
------------------------------------------------------- */

function buildSkillFields(existingSkills = []) {
  const selectedSkills = new Set(existingSkills);

  const customSkills = existingSkills.filter(
    (skill) => !PREDEFINED_SKILLS.includes(skill)
  );

  const checkboxes = PREDEFINED_SKILLS.map((skill) => `
    <label class="skill-option">
      <input
        type="checkbox"
        name="skills"
        value="${escapeHTML(skill)}"
        ${selectedSkills.has(skill) ? "checked" : ""}
      />

      <span>${escapeHTML(skill)}</span>
    </label>
  `).join("");

  const customSelected = customSkills.length > 0;

  return `
    <fieldset class="skill-fieldset">
      <legend>
        Skill <span class="required-mark">*</span>
      </legend>

      <p class="field-help">
        Select one or more skills.
      </p>

      <div class="skill-options">
        ${checkboxes}

        <label class="skill-option custom-skill-option">
          <input
            type="checkbox"
            name="skills"
            value="__custom__"
            id="custom-skill-checkbox"
            ${customSelected ? "checked" : ""}
          />

          <span>Other / Custom</span>
        </label>
      </div>

      <label
        class="custom-skill-input"
        id="custom-skill-wrapper"
        ${customSelected ? "" : "hidden"}
      >
        <span>Custom Skill</span>

        <input
          type="text"
          name="custom_skills"
          id="custom-skills"
          value="${escapeHTML(customSkills.join(", "))}"
          placeholder="Example: Graphics Design, Writing"
        />

        <small class="field-help">
          Separate multiple custom skills with commas.
        </small>
      </label>
    </fieldset>
  `;
}

/* -------------------------------------------------------
   MEMBER EDITOR
------------------------------------------------------- */

function openMemberEditor(member = null) {
  state.editorType = "member";
  state.editingId = member?.id ?? null;

  $("#modal-title").textContent = member
    ? "Edit Member"
    : "Register Main GC Member";

  const skills = Array.isArray(member?.skills)
    ? member.skills
    : [];

  modalFields.innerHTML = `
    <div class="form-section-heading">
      <span>RECRUITMENT INFORMATION</span>
      <p>
        Information collected through the WOFBD recruitment form.
      </p>
    </div>

    ${field(
      "Facebook Name",
      "facebook_name",
      member?.facebook_name || "",
      "text",
      {
        required: true,
        placeholder: "Member's Facebook display name"
      }
    )}

    ${field(
      "Real Name",
      "real_name",
      member?.real_name || "",
      "text",
      {
        required: true,
        placeholder: "Member's actual name"
      }
    )}

    ${field(
      "Date of Birth",
      "birth_date",
      member?.birth_date || "",
      "date"
    )}

    ${field(
      "Facebook Profile Link",
      "facebook_link",
      member?.facebook_link || "",
      "url",
      {
        placeholder: "https://www.facebook.com/username"
      }
    )}

    ${buildSkillFields(skills)}

    ${field(
      "Other Anime Groups",
      "other_anime_groups",
      member?.other_anime_groups || "",
      "textarea",
      {
        placeholder: "Mention other anime groups...",
        rows: 3
      }
    )}

    ${field(
      "Other WOFBD Unit Messenger GCs",
      "other_wofbd_units",
      member?.other_wofbd_units || "",
      "textarea",
      {
        placeholder: "Mention other WOFBD unit Messenger GCs...",
        rows: 3
      }
    )}

    <div class="form-section-heading">
      <span>MEMBER MANAGEMENT INFORMATION</span>
      <p>
        Internal information maintained by Wall Maria.
      </p>
    </div>

    <label class="form-field">
      <span>Rank</span>

      <select
        name="rank"
        id="member-rank-select"
        required
      >
        ${buildRankOptions(member?.rank || "Trainee")}
      </select>
    </label>

    ${buildHigherRankField(member?.higher_rank_id ?? null)}

    ${field(
      "Squad",
      "squad",
      member?.squad || "",
      "text",
      {
        placeholder: "Meme / Art / AMV / Dub / Game"
      }
    )}

    ${field(
      "Join Date",
      "join_date",
      member?.join_date || "",
      "date"
    )}

    ${field(
      "Added By",
      "added_by",
      member?.added_by || "",
      "text",
      {
        placeholder: "Name of the person who added this member"
      }
    )}

    ${field(
      "Notes",
      "notes",
      member?.notes || "",
      "textarea",
      {
        placeholder: "Additional internal notes...",
        rows: 4
      }
    )}
  `;

  const customCheckbox = $("#custom-skill-checkbox");
  const customWrapper = $("#custom-skill-wrapper");

  customCheckbox.addEventListener("change", () => {
    customWrapper.hidden = !customCheckbox.checked;
  });

  $("#member-rank-select").addEventListener(
    "change",
    syncHigherRankField
  );

  syncHigherRankField();

  modal.showModal();
}

function closeEditor() {
  if (modal.open) {
    modal.close();
  }

  editorForm.reset();
  modalFields.innerHTML = "";

  state.editorType = "";
  state.editingId = null;
}

/* -------------------------------------------------------
   MEMBER PROFILE
------------------------------------------------------- */

function profileRow(label, value) {
  return `
    <div class="profile-row">
      <span class="profile-label">
        ${escapeHTML(label)}
      </span>

      <div class="profile-value">
        ${escapeHTML(value || "—")}
      </div>
    </div>
  `;
}

function openMemberProfile(member) {
  if (!member) return;

  state.currentProfileId = member.id;

  $("#details-title").textContent =
    member.facebook_name || "Member Details";

  const skills = (member.skills || []).map((skill) => `
    <span class="skill-tag">
      ${escapeHTML(skill)}
    </span>
  `).join("");

  const facebookURL = safeExternalURL(
    member.facebook_link
  );

  const higherRankName = getHigherRankName(member);

  $("#member-profile-content").innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">
        ${escapeHTML(
          (member.facebook_name || "?")
            .trim()
            .charAt(0)
            .toUpperCase()
        )}
      </div>

      <div>
        <h4>
          ${escapeHTML(member.facebook_name || "Unnamed Member")}
        </h4>

        <p>
          ${escapeHTML(member.real_name || "Real name not provided")}
        </p>

        <span class="rank-badge">
          ${escapeHTML(member.rank || "Trainee")}
        </span>

        ${higherRankName
          ? `
            <small class="profile-rank-detail">
              ${escapeHTML(higherRankName)}
            </small>
          `
          : ""
        }
      </div>
    </div>

    <div class="profile-section">
      <h4>Recruitment Information</h4>

      ${profileRow("Facebook Name", member.facebook_name)}
      ${profileRow("Real Name", member.real_name)}
      ${profileRow("Date of Birth", formatDate(member.birth_date))}

      <div class="profile-row">
        <span class="profile-label">Facebook Profile</span>

        <div class="profile-value">
          ${facebookURL
            ? `
              <a
                href="${escapeHTML(facebookURL)}"
                target="_blank"
                rel="noopener noreferrer"
                class="link"
              >
                Open Facebook Profile ↗
              </a>
            `
            : "—"
          }
        </div>
      </div>

      <div class="profile-row">
        <span class="profile-label">Skills</span>

        <div class="profile-value skill-tags">
          ${skills || '<span class="muted-text">—</span>'}
        </div>
      </div>

      ${profileRow(
        "Other Anime Groups",
        member.other_anime_groups
      )}

      ${profileRow(
        "Other WOFBD Units",
        member.other_wofbd_units
      )}
    </div>

    <div class="profile-section">
      <h4>Member Management</h4>

      ${profileRow("Rank", member.rank)}

      ${profileRow(
        "Higher Rank",
        higherRankName
      )}

      ${profileRow("Squad", member.squad)}
      ${profileRow("Join Date", formatDate(member.join_date))}
      ${profileRow("Added By", member.added_by)}
      ${profileRow("Notes", member.notes)}
    </div>
  `;

  detailsModal.showModal();
}

function closeProfile() {
  if (detailsModal.open) {
    detailsModal.close();
  }

  state.currentProfileId = null;
}

/* -------------------------------------------------------
   RANK LIST
------------------------------------------------------- */

function getSortedRanks(type) {
  return state.ranks
    .filter((rank) => rank.type === type)
    .sort((a, b) => a.position - b.position);
}

function renderRanks(type) {
  const container = $(`#${type}-list`);

  const search = $(`#${type}-search`).value
    .trim()
    .toLowerCase();

  const sortedRanks = getSortedRanks(type);

  const filteredRanks = sortedRanks.filter((rank) => {
    const holder = getMemberById(rank.holder_member_id);

    const searchable = [
      rank.name,
      holder?.facebook_name,
      holder?.real_name
    ].join(" ").toLowerCase();

    return searchable.includes(search);
  });

  $(`#${type}-count`).textContent =
    `${filteredRanks.length} of ${sortedRanks.length} ranks`;

  if (filteredRanks.length === 0) {
    container.innerHTML = `
      <div class="empty-state rank-empty">
        <div class="empty-icon">♜</div>

        <h4>
          ${sortedRanks.length === 0
            ? "No ranks added"
            : "No matching ranks"
          }
        </h4>

        <p>
          ${sortedRanks.length === 0
            ? "Add your first rank to start building the hierarchy."
            : "Try another rank or holder name."
          }
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = filteredRanks.map((rank) => {
    const actualIndex = sortedRanks.findIndex(
      (item) => item.id === rank.id
    );

    const holder = getMemberById(
      rank.holder_member_id
    );

    const assigned = Boolean(holder);

    const holderHTML = assigned
      ? `
        <div class="holder-info">
          <span class="holder-facebook-name">
            ${escapeHTML(
              holder.facebook_name || "Unnamed Member"
            )}
          </span>

          <span class="holder-real-name">
            ${escapeHTML(
              holder.real_name || "Real name not provided"
            )}
          </span>
        </div>
      `
      : `
        <div class="holder-info">
          <span class="unassigned-label">Unassigned</span>

          <span class="holder-real-name">
            No member assigned to this rank.
          </span>
        </div>
      `;

    return `
      <article class="rank-item">

        <div class="rank-position">
          ${String(actualIndex + 1).padStart(2, "0")}
        </div>

        <div class="rank-main">
          <div class="rank-title-row">
            <h4 class="rank-name">
              ${escapeHTML(rank.name)}
            </h4>

            <span class="assignment-status ${
              assigned ? "assigned" : "unassigned"
            }">
              ${assigned ? "Assigned" : "Unassigned"}
            </span>
          </div>

          ${holderHTML}
        </div>

        <div class="rank-actions">

          <div class="rank-order-actions">
            <button
              class="icon-button"
              type="button"
              data-move-rank="${rank.id}"
              data-direction="-1"
              ${actualIndex === 0 ? "disabled" : ""}
              title="Move up"
              aria-label="Move rank up"
            >↑</button>

            <button
              class="icon-button"
              type="button"
              data-move-rank="${rank.id}"
              data-direction="1"
              ${actualIndex === sortedRanks.length - 1 ? "disabled" : ""}
              title="Move down"
              aria-label="Move rank down"
            >↓</button>
          </div>

          <button
            class="button secondary small-button"
            type="button"
            data-assign-holder="${rank.id}"
          >
            ${assigned ? "Change Holder" : "Assign Holder"}
          </button>

          ${assigned
            ? `
              <button
                class="icon-button danger"
                type="button"
                data-remove-holder="${rank.id}"
                title="Remove holder"
                aria-label="Remove holder"
              >↶</button>
            `
            : ""
          }

          <button
            class="icon-button"
            type="button"
            data-edit-rank="${rank.id}"
            title="Edit rank"
            aria-label="Edit rank"
          >✎</button>

          <button
            class="icon-button danger"
            type="button"
            data-delete-rank="${rank.id}"
            title="Delete rank"
            aria-label="Delete rank"
          >×</button>

        </div>
      </article>
    `;
  }).join("");
}

/* -------------------------------------------------------
   RANK EDITOR
------------------------------------------------------- */

function openRankEditor(type, rank = null) {
  state.editorType = type;
  state.editingId = rank?.id ?? null;

  const isHigher = type === "higher";

  $("#modal-title").textContent = rank
    ? "Edit Rank"
    : "Add Rank";

  modalFields.innerHTML = `
    <div class="form-section-heading">
      <span>${isHigher ? "HIGHER RANK" : "SOLDIER RANK"}</span>

      <p>
        ${isHigher
          ? "Manage a position in the Wall Maria leadership hierarchy."
          : "Manage a position in the soldier rank hierarchy."
        }
      </p>
    </div>

    ${field(
      "Rank Name",
      "name",
      rank?.name || "",
      "text",
      {
        required: true,
        placeholder: "Enter rank name"
      }
    )}
  `;

  modal.showModal();
}

/* -------------------------------------------------------
   HOLDER SELECTION
------------------------------------------------------- */

function openHolderPicker(rankId) {
  const rank = getRankById(rankId);

  if (!rank || rank.type !== "higher") {
    toast("Higher Rank not found.", "error");
    return;
  }

  state.activeHolderRankId = rank.id;

  $("#holder-rank-name").textContent =
    `Select a Main GC member for ${rank.name}.`;

  $("#holder-search").value = "";

  renderHolderCandidates();

  holderModal.showModal();
}

function renderHolderCandidates() {
  const search = $("#holder-search").value
    .trim()
    .toLowerCase();

  const candidates = state.members
    .filter((member) => {
      const searchable = [
        member.facebook_name,
        member.real_name,
        member.rank,
        member.squad,
        ...(member.skills || [])
      ].join(" ").toLowerCase();

      return searchable.includes(search);
    })
    .sort((a, b) =>
      a.facebook_name.localeCompare(b.facebook_name)
    );

  const container = $("#holder-candidates");

  if (candidates.length === 0) {
    container.innerHTML = `
      <div class="empty-state compact-empty">
        <div class="empty-icon">♙</div>

        <h4>
          ${state.members.length === 0
            ? "No members available"
            : "No matching members"
          }
        </h4>

        <p>
          ${state.members.length === 0
            ? "Add a Main GC member before assigning a holder."
            : "Try searching with another name."
          }
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = candidates.map((member) => `
    <button
      type="button"
      class="holder-candidate"
      data-assign-member="${member.id}"
    >
      <span class="candidate-avatar">
        ${escapeHTML(
          (member.facebook_name || "?")
            .trim()
            .charAt(0)
            .toUpperCase()
        )}
      </span>

      <span class="candidate-details">
        <strong>
          ${escapeHTML(
            member.facebook_name || "Unnamed Member"
          )}
        </strong>

        <small>
          ${escapeHTML(
            member.real_name || "Real name not provided"
          )}
        </small>

        <small class="candidate-meta">
          ${escapeHTML(member.rank || "Trainee")}
          ${member.squad
            ? ` · ${escapeHTML(member.squad)}`
            : ""
          }
        </small>
      </span>

      <span class="candidate-arrow">→</span>
    </button>
  `).join("");
}

function closeHolderPicker() {
  if (holderModal.open) {
    holderModal.close();
  }

  state.activeHolderRankId = null;
}

/**
 * Assignment from the Higher Ranks screen.
 *
 * Normal assignment proceeds directly.
 * Moving an existing holder or replacing another holder
 * requires explicit confirmation before the transfer call.
 */
async function assignSelectedMember(memberId) {
  const rankId = state.activeHolderRankId;

  if (!rankId) return;

  const member = getMemberById(memberId);
  const targetRank = getRankById(rankId);

  if (!member || !targetRank) {
    toast("Selected member or rank no longer exists.", "error");
    return;
  }

  try {
    const conflicts = await getRankAssignmentConflicts(
      rankId,
      memberId
    );

    const warnings = [];

    if (conflicts.currentRank) {
      warnings.push(
        `${member.facebook_name} currently holds ${conflicts.currentRank.name}. Their assignment will be transferred to ${targetRank.name}.`
      );
    }

    if (conflicts.targetHolder) {
      warnings.push(
        `${conflicts.targetHolder.facebook_name} currently holds ${targetRank.name}. Their assignment will be removed and they will return to their previous Soldier Rank.`
      );
    }

    if (warnings.length > 0) {
      const confirmed = await askConfirmation({
        title: "Confirm Higher Rank Transfer",
        message: warnings.join(" "),
        confirmLabel: "Transfer Assignment",
        danger: true
      });

      if (!confirmed) return;

      await transferRankHolder(rankId, memberId);
    } else {
      await assignRankHolder(rankId, memberId);
    }

    closeHolderPicker();

    await refreshData();

    toast(
      `${member.facebook_name} assigned to ${targetRank.name}.`
    );
  } catch (error) {
    console.error(error);

    toast(
      error.message || "Could not assign rank holder.",
      "error"
    );
  }
}

async function removeHolder(rankId) {
  const rank = getRankById(rankId);

  if (!rank || rank.holder_member_id == null) return;

  const holder = getMemberById(rank.holder_member_id);

  const confirmed = await askConfirmation({
    title: "Remove Rank Holder",

    message: holder
      ? `Remove ${holder.facebook_name} as the holder of ${rank.name}? Their previous Soldier Rank will be restored.`
      : `Remove the holder assignment from ${rank.name}?`,

    confirmLabel: "Remove Holder",
    danger: true
  });

  if (!confirmed) return;

  try {
    await removeRankHolder(rankId);

    await refreshData();

    toast("Rank holder removed.");
  } catch (error) {
    console.error(error);

    toast(
      error.message || "Could not remove rank holder.",
      "error"
    );
  }
}

/* -------------------------------------------------------
   RANK DUPLICATE CHECKING
------------------------------------------------------- */

function isDuplicateRank(type, name, exceptId = null) {
  const normalizedName = name.trim().toLowerCase();

  return state.ranks.some((rank) =>
    rank.type === type &&
    rank.name.trim().toLowerCase() === normalizedName &&
    Number(rank.id) !== Number(exceptId)
  );
}

/* -------------------------------------------------------
   TEXT CATEGORIES
------------------------------------------------------- */

function populateTextCategories() {
  const select = $("#text-category-filter");
  const selected = select.value;

  const categories = [...new Set(
    state.texts
      .map((item) => item.category.trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  select.innerHTML = `
    <option value="">All Categories</option>

    ${categories.map((category) => `
      <option value="${escapeHTML(category)}">
        ${escapeHTML(category)}
      </option>
    `).join("")}
  `;

  select.value = categories.includes(selected)
    ? selected
    : "";
}

/* -------------------------------------------------------
   TEXT LIST
------------------------------------------------------- */

function renderTexts() {
  const search = $("#text-search").value
    .trim()
    .toLowerCase();

  const category = $("#text-category-filter").value;

  const texts = state.texts.filter((item) => {
    const searchable = [
      item.title,
      item.category,
      item.content
    ].join(" ").toLowerCase();

    return (
      searchable.includes(search) &&
      (!category || item.category === category)
    );
  });

  $("#text-count").textContent =
    `${texts.length} of ${state.texts.length} texts`;

  if (texts.length === 0) {
    $("#texts-list").innerHTML = `
      <div class="empty-state text-empty">
        <div class="empty-icon">▤</div>

        <h4>
          ${state.texts.length === 0
            ? "No saved texts"
            : "No matching texts"
          }
        </h4>

        <p>
          ${state.texts.length === 0
            ? "Add your first reusable message or announcement."
            : "Try another search or category."
          }
        </p>
      </div>
    `;

    return;
  }

  $("#texts-list").innerHTML = texts
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((item) => `
      <article class="text-card">

        <div class="text-card-header">
          <div class="text-card-heading">
            <span class="category-badge">
              ${escapeHTML(item.category || "General")}
            </span>

            <h4>${escapeHTML(item.title)}</h4>
          </div>

          <div class="text-card-actions">
            <button
              class="icon-button"
              type="button"
              data-edit-text="${item.id}"
              title="Edit text"
            >✎</button>

            <button
              class="icon-button danger"
              type="button"
              data-delete-text="${item.id}"
              title="Delete text"
            >×</button>
          </div>
        </div>

        <pre class="text-content">${escapeHTML(item.content)}</pre>

        <button
          class="button secondary copy-button"
          type="button"
          data-copy-text="${item.id}"
        >
          <span>▢</span>
          Copy to Clipboard
        </button>

      </article>
    `)
    .join("");
}

/* -------------------------------------------------------
   TEXT EDITOR
------------------------------------------------------- */

function openTextEditor(item = null) {
  state.editorType = "text";
  state.editingId = item?.id ?? null;

  $("#modal-title").textContent = item
    ? "Edit Text"
    : "Add Copy-Paste Text";

  modalFields.innerHTML = `
    <div class="form-section-heading">
      <span>MESSAGE LIBRARY</span>
      <p>Save reusable announcements and messages.</p>
    </div>

    ${field(
      "Title",
      "title",
      item?.title || "",
      "text",
      {
        required: true,
        placeholder: "Example: Promotion Announcement"
      }
    )}

    ${field(
      "Category",
      "category",
      item?.category || "General",
      "text",
      {
        placeholder: "General / Announcement / Recruitment"
      }
    )}

    ${field(
      "Content",
      "content",
      item?.content || "",
      "textarea",
      {
        required: true,
        placeholder: "Write your reusable message...",
        rows: 9
      }
    )}
  `;

  modal.showModal();
}

/* -------------------------------------------------------
   MEMBER ASSIGNMENT CONFIRMATION
------------------------------------------------------- */

async function getMemberSaveOptions(
  memberData,
  memberId
) {
  const options = {
    allowTransfer: false,
    allowReplace: false,
    allowUnassign: false
  };

  if (memberData.rank === "Higher") {
    const conflicts = await getRankAssignmentConflicts(
      memberData.higher_rank_id,
      memberId
    );

    const targetRank = conflicts.targetRank;

    if (!targetRank) {
      throw new Error("The selected Higher Rank no longer exists.");
    }

    const warnings = [];

    if (conflicts.currentRank) {
      options.allowTransfer = true;

      warnings.push(
        `This member currently holds ${conflicts.currentRank.name}. Their assignment will move to ${targetRank.name}.`
      );
    }

    if (conflicts.targetHolder) {
      options.allowReplace = true;

      warnings.push(
        `${conflicts.targetHolder.facebook_name} currently holds ${targetRank.name}. Their assignment will be removed and their previous Soldier Rank will be restored.`
      );
    }

    if (warnings.length > 0) {
      const confirmed = await askConfirmation({
        title: "Confirm Higher Rank Transfer",
        message: warnings.join(" "),
        confirmLabel: "Transfer Assignment",
        danger: true
      });

      if (!confirmed) return null;
    }

    return options;
  }

  if (memberId != null) {
    const conflicts = await getRankAssignmentConflicts(
      null,
      memberId
    );

    if (conflicts.currentRank) {
      options.allowUnassign = true;

      const confirmed = await askConfirmation({
        title: "Remove Higher Rank Assignment",

        message:
          `This member currently holds ${conflicts.currentRank.name}. ` +
          `Changing their rank to ${memberData.rank} will remove that Higher Rank assignment. ` +
          `Their member record will be updated together with the rank record.`,

        confirmLabel: "Change Member Rank",
        danger: true
      });

      if (!confirmed) return null;
    }
  }

  return options;
}

/* -------------------------------------------------------
   EDITOR SAVE
------------------------------------------------------- */

async function saveEditor(event) {
  event.preventDefault();

  if (!editorForm.reportValidity()) return;

  const formData = new FormData(editorForm);
  const values = Object.fromEntries(formData.entries());

  try {
    /* MEMBER */

    if (state.editorType === "member") {
      const selectedSkills = formData.getAll("skills");

      const normalSkills = selectedSkills.filter(
        (skill) => skill !== "__custom__"
      );

      const customEnabled = selectedSkills.includes(
        "__custom__"
      );

      const customSkills = customEnabled
        ? String(values.custom_skills || "")
            .split(",")
            .map((skill) => skill.trim())
            .filter(Boolean)
        : [];

      if (
        customEnabled &&
        customSkills.length === 0
      ) {
        toast("Enter at least one custom skill.", "error");
        return;
      }

      const skills = [...new Set([
        ...normalSkills,
        ...customSkills
      ])];

      const selectedRank = String(
        values.rank || "Trainee"
      ).trim();

      const selectedHigherRankId =
        selectedRank === "Higher" &&
        values.higher_rank_id
          ? Number(values.higher_rank_id)
          : null;

      if (
        selectedRank === "Higher" &&
        !selectedHigherRankId
      ) {
        toast("Select the specific Higher Rank.", "error");
        return;
      }

      const member = {
        facebook_name: String(
          values.facebook_name || ""
        ).trim(),

        real_name: String(
          values.real_name || ""
        ).trim(),

        birth_date: values.birth_date || "",

        facebook_link: String(
          values.facebook_link || ""
        ).trim(),

        skills,

        other_anime_groups: String(
          values.other_anime_groups || ""
        ).trim(),

        other_wofbd_units: String(
          values.other_wofbd_units || ""
        ).trim(),

        rank: selectedRank,

        higher_rank_id: selectedHigherRankId,

        squad: String(
          values.squad || ""
        ).trim(),

        join_date: values.join_date || "",

        added_by: String(
          values.added_by || ""
        ).trim(),

        notes: String(
          values.notes || ""
        ).trim()
      };

      if (!member.facebook_name || !member.real_name) {
        toast(
          "Facebook Name and Real Name are required.",
          "error"
        );

        return;
      }

      if (member.facebook_link) {
        const validURL = safeExternalURL(
          member.facebook_link
        );

        if (!validURL) {
          toast(
            "Enter a valid HTTP or HTTPS Facebook URL.",
            "error"
          );

          return;
        }
      }

      const options = await getMemberSaveOptions(
        member,
        state.editingId
      );

      if (!options) return;

      await saveMemberRecord(
        member,
        state.editingId,
        options
      );
    }

    /* HIGHER / SOLDIER RANK */

    if (
      state.editorType === "higher" ||
      state.editorType === "soldier"
    ) {
      const type = state.editorType;
      const name = String(values.name || "").trim();

      if (!name) {
        toast("Rank name is required.", "error");
        return;
      }

      if (isDuplicateRank(type, name, state.editingId)) {
        toast("A rank with this name already exists.", "error");
        return;
      }

      if (state.editingId !== null) {
        const existing = await getById(
          STORES.RANKS,
          state.editingId
        );

        if (!existing || existing.type !== type) {
          throw new Error(
            "The selected rank could not be found."
          );
        }

        await updateItem(STORES.RANKS, {
          ...existing,
          name
        });
      } else {
        const currentRanks = getSortedRanks(type);

        const nextPosition = currentRanks.length > 0
          ? Math.max(
              ...currentRanks.map((rank) => rank.position)
            ) + 1
          : 1;

        await addItem(STORES.RANKS, {
          name,
          type,
          position: nextPosition,
          holder_member_id: null
        });
      }
    }

    /* TEXT */

    if (state.editorType === "text") {
      const text = {
        title: String(values.title || "").trim(),

        category:
          String(values.category || "General").trim() ||
          "General",

        content: String(values.content || "")
      };

      if (!text.title || !text.content.trim()) {
        toast("Title and content are required.", "error");
        return;
      }

      if (state.editingId !== null) {
        await updateItem(STORES.TEXTS, {
          id: state.editingId,
          ...text
        });
      } else {
        await addItem(STORES.TEXTS, text);
      }
    }

    const savedType = state.editorType;

    closeEditor();

    await refreshData();

    toast(
      savedType === "member"
        ? "Member information saved."
        : savedType === "text"
          ? "Text saved successfully."
          : "Rank saved successfully."
    );
  } catch (error) {
    console.error("Save failed:", error);

    toast(
      error.message || "Could not save the item.",
      "error"
    );
  }
}

/* -------------------------------------------------------
   DELETION
------------------------------------------------------- */

async function removeMember(memberId) {
  const member = getMemberById(memberId);

  if (!member) return;

  const assignedRanks = state.ranks.filter(
    (rank) =>
      Number(rank.holder_member_id) === Number(memberId)
  );

  const rankNames = assignedRanks
    .map((rank) => rank.name)
    .join(", ");

  const confirmed = await askConfirmation({
    title: "Delete Main GC Member",

    message: assignedRanks.length > 0
      ? `Delete ${member.facebook_name}? Their assignment to ${rankNames} will also be removed. The ranks themselves will remain.`
      : `Permanently delete ${member.facebook_name} from the Main GC member list?`,

    confirmLabel: "Delete Member",
    danger: true
  });

  if (!confirmed) return;

  try {
    await deleteMember(memberId);

    if (
      Number(state.currentProfileId) ===
      Number(memberId)
    ) {
      closeProfile();
    }

    await refreshData();

    toast(
      assignedRanks.length > 0
        ? "Member deleted and rank assignments cleared."
        : "Member deleted successfully."
    );
  } catch (error) {
    console.error(error);

    toast("Could not delete the member.", "error");
  }
}

async function removeRank(rankId) {
  const rank = getRankById(rankId);

  if (!rank) return;

  const holder = getMemberById(
    rank.holder_member_id
  );

  const confirmed = await askConfirmation({
    title: "Delete Rank",

    message: holder
      ? `Delete ${rank.name}? Its assignment to ${holder.facebook_name} will be removed and their previous Soldier Rank restored.`
      : `Permanently delete ${rank.name}?`,

    confirmLabel: "Delete Rank",
    danger: true
  });

  if (!confirmed) return;

  try {
    if (rank.type === "higher") {
      await deleteRank(rankId);
    } else {
      await deleteItem(STORES.RANKS, rankId);
    }

    await refreshData();

    toast("Rank deleted successfully.");
  } catch (error) {
    console.error(error);

    toast(
      error.message || "Could not delete the rank.",
      "error"
    );
  }
}

async function removeText(textId) {
  const text = await getById(
    STORES.TEXTS,
    textId
  );

  if (!text) return;

  const confirmed = await askConfirmation({
    title: "Delete Saved Text",
    message: `Delete "${text.title}" from the copy-paste library?`,
    confirmLabel: "Delete Text",
    danger: true
  });

  if (!confirmed) return;

  try {
    await deleteItem(STORES.TEXTS, textId);

    await refreshData();

    toast("Text deleted successfully.");
  } catch (error) {
    console.error(error);

    toast("Could not delete the text.", "error");
  }
}

/* -------------------------------------------------------
   REORDERING
------------------------------------------------------- */

async function reorderRank(rankId, direction) {
  try {
    await moveRank(rankId, direction);

    await refreshData();
  } catch (error) {
    console.error(error);

    toast("Could not reorder the rank.", "error");
  }
}

/* -------------------------------------------------------
   CLIPBOARD
------------------------------------------------------- */

async function copyText(textId) {
  const item = await getById(
    STORES.TEXTS,
    textId
  );

  if (!item) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(
        item.content
      );
    } else {
      const temporary = document.createElement("textarea");

      temporary.value = item.content;
      temporary.style.position = "fixed";
      temporary.style.opacity = "0";

      document.body.append(temporary);

      temporary.select();

      const copied = document.execCommand("copy");

      temporary.remove();

      if (!copied) {
        throw new Error(
          "Clipboard copy was not successful."
        );
      }
    }

    toast("Copied to clipboard.");
  } catch (error) {
    console.error(error);

    toast(
      "Clipboard permission was denied.",
      "error"
    );
  }
}

/* -------------------------------------------------------
   JSON BACKUP
------------------------------------------------------- */

async function exportBackup() {
  try {
    const backup = await exportDatabase();

    const blob = new Blob(
      [JSON.stringify(backup, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download =
      `wall-maria-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;

    document.body.append(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    toast("JSON backup exported.");
  } catch (error) {
    console.error(error);

    toast("Could not export the backup.", "error");
  }
}

async function importBackup(file) {
  if (!file) return;

  const confirmed = await askConfirmation({
    title: "Import JSON Backup",

    message:
      "Importing this backup will replace all existing members, ranks, and saved texts in this browser. Export a backup first if you need the current data.",

    confirmLabel: "Import Backup",
    danger: true
  });

  if (!confirmed) return;

  try {
    const backup = JSON.parse(
      await file.text()
    );

    await importDatabase(backup);

    await refreshData();

    toast("Backup imported successfully.");
  } catch (error) {
    console.error(error);

    toast(
      error.message || "Could not import the backup.",
      "error"
    );
  }
}

/* -------------------------------------------------------
   THEME
------------------------------------------------------- */

function initializeTheme() {
  const savedTheme =
    localStorage.getItem("wm-theme") || "dark";

  document.documentElement.dataset.theme =
    savedTheme === "light" ? "light" : "dark";

  $("#theme-toggle").addEventListener("click", () => {
    const nextTheme =
      document.documentElement.dataset.theme === "dark"
        ? "light"
        : "dark";

    document.documentElement.dataset.theme = nextTheme;

    localStorage.setItem("wm-theme", nextTheme);
  });
}

/* -------------------------------------------------------
   EVENTS
------------------------------------------------------- */

function initializeEvents() {
  /* Navigation */

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      setPage(button.dataset.page);
    });
  });

  /* Add buttons */

  $("#add-member").addEventListener("click", () => {
    openMemberEditor();
  });

  $("#add-higher").addEventListener("click", () => {
    openRankEditor("higher");
  });

  $("#add-soldier").addEventListener("click", () => {
    openRankEditor("soldier");
  });

  $("#add-text").addEventListener("click", () => {
    openTextEditor();
  });

  /* Member filters */

  $("#member-search").addEventListener("input", renderMembers);

  $("#squad-filter").addEventListener(
    "change",
    renderMembers
  );

  $("#rank-filter").addEventListener(
    "change",
    renderMembers
  );

  /* Rank searches */

  $("#higher-search").addEventListener("input", () => {
    renderRanks("higher");
  });

  $("#soldier-search").addEventListener("input", () => {
    renderRanks("soldier");
  });

  /* Text filters */

  $("#text-search").addEventListener("input", renderTexts);

  $("#text-category-filter").addEventListener(
    "change",
    renderTexts
  );

  /* Editor modal */

  editorForm.addEventListener("submit", saveEditor);

  $("#modal-close").addEventListener(
    "click",
    closeEditor
  );

  $("#modal-cancel").addEventListener(
    "click",
    closeEditor
  );

  /* Holder selector */

  $("#holder-search").addEventListener(
    "input",
    renderHolderCandidates
  );

  $("#holder-close").addEventListener(
    "click",
    closeHolderPicker
  );

  $("#holder-cancel").addEventListener(
    "click",
    closeHolderPicker
  );

  /* Member profile */

  $("#details-close").addEventListener(
    "click",
    closeProfile
  );

  $("#details-done").addEventListener(
    "click",
    closeProfile
  );

  $("#details-edit").addEventListener("click", () => {
    const member = getMemberById(
      state.currentProfileId
    );

    if (!member) {
      closeProfile();
      return;
    }

    closeProfile();
    openMemberEditor(member);
  });

  /* JSON backup */

  $("#export-button").addEventListener(
    "click",
    exportBackup
  );

  $("#import-button").addEventListener("click", () => {
    $("#import-file").click();
  });

  $("#import-file").addEventListener(
    "change",
    async (event) => {
      const file = event.target.files?.[0];

      await importBackup(file);

      event.target.value = "";
    }
  );

  /* Delegated management actions */

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button");

    if (!button) return;

    try {
      /* Member profile */

      if (button.dataset.viewMember) {
        openMemberProfile(
          getMemberById(button.dataset.viewMember)
        );

        return;
      }

      /* Edit member */

      if (button.dataset.editMember) {
        const member = getMemberById(
          button.dataset.editMember
        );

        if (member) {
          openMemberEditor(member);
        }

        return;
      }

      /* Delete member */

      if (button.dataset.deleteMember) {
        await removeMember(
          Number(button.dataset.deleteMember)
        );

        return;
      }

      /* Edit rank */

      if (button.dataset.editRank) {
        const rank = getRankById(
          button.dataset.editRank
        );

        if (rank) {
          openRankEditor(rank.type, rank);
        }

        return;
      }

      /* Delete rank */

      if (button.dataset.deleteRank) {
        await removeRank(
          Number(button.dataset.deleteRank)
        );

        return;
      }

      /* Reorder rank */

      if (button.dataset.moveRank) {
        await reorderRank(
          Number(button.dataset.moveRank),
          Number(button.dataset.direction)
        );

        return;
      }

      /* Assign holder */

      if (button.dataset.assignHolder) {
        openHolderPicker(
          Number(button.dataset.assignHolder)
        );

        return;
      }

      /* Select member as holder */

      if (button.dataset.assignMember) {
        await assignSelectedMember(
          Number(button.dataset.assignMember)
        );

        return;
      }

      /* Remove holder */

      if (button.dataset.removeHolder) {
        await removeHolder(
          Number(button.dataset.removeHolder)
        );

        return;
      }

      /* Edit text */

      if (button.dataset.editText) {
        const item = await getById(
          STORES.TEXTS,
          button.dataset.editText
        );

        if (item) {
          openTextEditor(item);
        }

        return;
      }

      /* Delete text */

      if (button.dataset.deleteText) {
        await removeText(
          Number(button.dataset.deleteText)
        );

        return;
      }

      /* Copy text */

      if (button.dataset.copyText) {
        await copyText(
          Number(button.dataset.copyText)
        );
      }
    } catch (error) {
      console.error("Action failed:", error);

      toast(
        error.message || "The requested action failed.",
        "error"
      );
    }
  });
}

/* -------------------------------------------------------
   APPLICATION INITIALIZATION
------------------------------------------------------- */

async function initializeApp() {
  try {
    if (!("indexedDB" in window)) {
      throw new Error(
        "This browser does not support IndexedDB."
      );
    }

    setStatus(
      "Initializing local database...",
      "loading"
    );

    await initializeDatabase();

    await seedInitialRanks();

    // Normalize existing assignments before the UI uses them.
    await reconcileHigherRankAssignments();

    initializeTheme();
    initializeEvents();

    state.ready = true;

    await refreshData();

    setPage("members");

    setStatus(
      "Local database connected",
      "ready"
    );

    console.log(
      "Wall Maria Control Panel initialized successfully."
    );
  } catch (error) {
    console.error(
      "Wall Maria Control Panel initialization failed:",
      error
    );

    showAppError(error);
  }
}

initializeApp();
