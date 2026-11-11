
const DATABASE_NAME = "WallMariaControlPanel";
const DATABASE_VERSION = 3;

const STORES = {
  MEMBERS: "members",
  RANKS: "ranks",
  TEXTS: "texts",
  METADATA: "metadata"
};

const SEED_MARKER = "initial-ranks-seeded";

const HIGHER_RANKS = [
  "Commander in Chief",
  "Supreme Commander",
  "Elder",
  "Commander",
  "Assistant of Chief",
  "Section Commander",
  "Division Leader",
  "Executive Officer",
  "High Officer",
  "Female Assistant",
  "Police",
  "Squad Leader in Chief",
  "Submitor"
];

const SOLDIER_RANKS = [
  "Squad Leader (Meme)",
  "Squad Leader (Art)",
  "Squad Leader (AMV)",
  "Squad Leader (Dub)",
  "Squad Leader (Game)",
  "Captain",
  "Vice Captain",
  "Super Top Cadet",
  "Top Cadet",
  "Cadet",
  "Squad Member",
  "Private Soldier",
  "Trainee"
];

let databasePromise;

/* -------------------------------------------------------
   GENERAL HELPERS
------------------------------------------------------- */

function createDatabaseError(code, message, details = {}) {
  const error = new Error(message);

  error.code = code;
  error.details = details;

  return error;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);

    request.onerror = () => reject(
      request.error ||
      new Error("IndexedDB request failed.")
    );
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();

    transaction.onerror = () => reject(
      transaction.error ||
      new Error("Database transaction failed.")
    );

    transaction.onabort = () => reject(
      transaction.error ||
      new Error("Database transaction was aborted.")
    );
  });
}

function normalizeSkills(value) {
  if (Array.isArray(value)) {
    return value
      .filter((skill) => typeof skill === "string")
      .map((skill) => skill.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
  }

  return [];
}

function migrateMemberRecord(record) {
  const migrated = {
    ...record,

    facebook_name: String(
      record.facebook_name ??
      record.name ??
      ""
    ),

    real_name: String(
      record.real_name ?? ""
    ),

    birth_date: String(
      record.birth_date ??
      record.birthDate ??
      ""
    ),

    facebook_link: String(
      record.facebook_link ??
      record.facebook ??
      ""
    ),

    skills: normalizeSkills(record.skills),

    other_anime_groups: String(
      record.other_anime_groups ??
      record.otherAnimeGroups ??
      ""
    ),

    other_wofbd_units: String(
      record.other_wofbd_units ??
      record.otherWofbdUnits ??
      ""
    ),

    rank: String(
      record.rank ?? "Trainee"
    ),

    squad: String(
      record.squad ?? ""
    ),

    join_date: String(
      record.join_date ??
      record.joinDate ??
      ""
    ),

    added_by: String(
      record.added_by ??
      record.addedBy ??
      ""
    ),

    notes: String(
      record.notes ?? ""
    ),

    higher_rank_id:
      record.higher_rank_id == null
        ? null
        : Number(record.higher_rank_id),

    previous_soldier_rank:
      record.previous_soldier_rank == null
        ? null
        : String(record.previous_soldier_rank)
  };

  delete migrated.name;
  delete migrated.facebook;
  delete migrated.joinDate;
  delete migrated.birthDate;
  delete migrated.otherAnimeGroups;
  delete migrated.otherWofbdUnits;
  delete migrated.addedBy;

  return migrated;
}

function migrateRankRecord(record) {
  return {
    ...record,

    name: String(record.name ?? ""),

    type: record.type === "soldier"
      ? "soldier"
      : "higher",

    position: Number.isFinite(Number(record.position))
      ? Number(record.position)
      : 1,

    holder_member_id:
      record.holder_member_id == null
        ? null
        : Number(record.holder_member_id)
  };
}

/* -------------------------------------------------------
   DATABASE UPGRADE — VERSION 3
------------------------------------------------------- */

function upgradeDatabase(event) {
  const db = event.target.result;
  const transaction = event.target.transaction;

  /* Members */

  if (!db.objectStoreNames.contains(STORES.MEMBERS)) {
    db.createObjectStore(STORES.MEMBERS, {
      keyPath: "id",
      autoIncrement: true
    });
  }

  const members = transaction.objectStore(STORES.MEMBERS);

  const memberIndexes = [
    "facebook_name",
    "real_name",
    "rank",
    "squad",
    "higher_rank_id"
  ];

  for (const indexName of memberIndexes) {
    if (!members.indexNames.contains(indexName)) {
      members.createIndex(indexName, indexName, {
        unique: false
      });
    }
  }

  const memberCursorRequest = members.openCursor();

  memberCursorRequest.onsuccess = () => {
    const cursor = memberCursorRequest.result;

    if (!cursor) return;

    cursor.update(
      migrateMemberRecord(cursor.value)
    );

    cursor.continue();
  };

  /* Ranks */

  if (!db.objectStoreNames.contains(STORES.RANKS)) {
    db.createObjectStore(STORES.RANKS, {
      keyPath: "id",
      autoIncrement: true
    });
  }

  const ranks = transaction.objectStore(STORES.RANKS);

  if (!ranks.indexNames.contains("type")) {
    ranks.createIndex("type", "type", {
      unique: false
    });
  }

  if (!ranks.indexNames.contains("position")) {
    ranks.createIndex("position", "position", {
      unique: false
    });
  }

  if (!ranks.indexNames.contains("holder_member_id")) {
    ranks.createIndex(
      "holder_member_id",
      "holder_member_id",
      { unique: false }
    );
  }

  const rankCursorRequest = ranks.openCursor();

  rankCursorRequest.onsuccess = () => {
    const cursor = rankCursorRequest.result;

    if (!cursor) return;

    cursor.update(
      migrateRankRecord(cursor.value)
    );

    cursor.continue();
  };

  /* Texts */

  if (!db.objectStoreNames.contains(STORES.TEXTS)) {
    db.createObjectStore(STORES.TEXTS, {
      keyPath: "id",
      autoIncrement: true
    });
  }

  /* Metadata */

  if (!db.objectStoreNames.contains(STORES.METADATA)) {
    db.createObjectStore(STORES.METADATA, {
      keyPath: "key"
    });
  }
}

export function initializeDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(
      DATABASE_NAME,
      DATABASE_VERSION
    );

    request.onupgradeneeded = upgradeDatabase;

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        db.close();
      };

      resolve(db);
    };

    request.onerror = () => {
      databasePromise = null;

      reject(
        request.error ||
        new Error("Could not open the local database.")
      );
    };

    request.onblocked = () => {
      console.warn(
        "Database upgrade is blocked. Close other tabs using this application."
      );
    };
  });

  return databasePromise;
}

/* -------------------------------------------------------
   BASIC DATABASE OPERATIONS
------------------------------------------------------- */

async function getStore(storeName, mode = "readonly") {
  const db = await initializeDatabase();

  const transaction = db.transaction(
    storeName,
    mode
  );

  return {
    transaction,
    store: transaction.objectStore(storeName)
  };
}

export async function getAll(storeName) {
  const { store } = await getStore(storeName);

  return requestResult(
    store.getAll()
  );
}

export async function getById(storeName, id) {
  const { store } = await getStore(storeName);

  return requestResult(
    store.get(Number(id))
  );
}

export async function addItem(storeName, item) {
  const { transaction, store } = await getStore(
    storeName,
    "readwrite"
  );

  const completed = transactionResult(transaction);

  const id = await requestResult(
    store.add(item)
  );

  await completed;

  return id;
}

export async function updateItem(storeName, item) {
  const { transaction, store } = await getStore(
    storeName,
    "readwrite"
  );

  const completed = transactionResult(transaction);

  await requestResult(
    store.put(item)
  );

  await completed;
}

export async function deleteItem(storeName, id) {
  const { transaction, store } = await getStore(
    storeName,
    "readwrite"
  );

  const completed = transactionResult(transaction);

  await requestResult(
    store.delete(Number(id))
  );

  await completed;
}

/* -------------------------------------------------------
   MEMBER / HIGHER RANK SYNCHRONIZATION
------------------------------------------------------- */

function markMemberAsHigher(member, rankId) {
  const updated = { ...member };

  if (
    updated.rank !== "Higher" &&
    !updated.previous_soldier_rank
  ) {
    updated.previous_soldier_rank =
      updated.rank || "Trainee";
  }

  if (
    updated.rank === "Higher" &&
    !updated.previous_soldier_rank
  ) {
    updated.previous_soldier_rank = "Trainee";
  }

  updated.rank = "Higher";
  updated.higher_rank_id = Number(rankId);

  return updated;
}

function restoreMemberSoldierRank(member, rankId = null) {
  const updated = { ...member };

  if (
    rankId != null &&
    Number(updated.higher_rank_id) !== Number(rankId)
  ) {
    return updated;
  }

  if (updated.rank === "Higher") {
    updated.rank =
      updated.previous_soldier_rank || "Trainee";
  }

  updated.higher_rank_id = null;
  updated.previous_soldier_rank = null;

  return updated;
}

/**
 * Reconciles member and rank records.
 *
 * Higher rank records are the source of truth for holder
 * assignments. A member can appear in only one Higher Rank.
 *
 * If old data contains duplicate holders, the first rank
 * by position is retained and later assignments are cleared.
 */
export async function reconcileHigherRankAssignments() {
  const db = await initializeDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.MEMBERS, STORES.RANKS],
      "readwrite"
    );

    const memberStore = transaction.objectStore(STORES.MEMBERS);
    const rankStore = transaction.objectStore(STORES.RANKS);

    let failure = null;
    let membersReady = false;
    let ranksReady = false;
    let processed = false;

    let members = [];
    let ranks = [];

    const abortWith = (error) => {
      failure = error;

      try {
        transaction.abort();
      } catch {
        // The transaction may already have completed or aborted.
      }
    };

    transaction.oncomplete = () => resolve();

    transaction.onerror = () => {
      failure ||= transaction.error;
    };

    transaction.onabort = () => {
      reject(
        failure ||
        transaction.error ||
        new Error("Could not reconcile Higher Rank assignments.")
      );
    };

    const processRecords = () => {
      if (!membersReady || !ranksReady || processed) return;

      processed = true;

      try {
        const memberMap = new Map(
          members.map((member) => [
            Number(member.id),
            member
          ])
        );

        const higherRanks = ranks
          .filter((rank) => rank.type === "higher")
          .sort((a, b) =>
            a.position - b.position || a.id - b.id
          );

        const assignedMembers = new Set();

        const acceptedAssignments = new Map();

        for (const rank of higherRanks) {
          const holderId = rank.holder_member_id == null
            ? null
            : Number(rank.holder_member_id);

          if (holderId == null) {
            rank.holder_member_id = null;
            continue;
          }

          const memberExists = memberMap.has(holderId);
          const alreadyAssigned = assignedMembers.has(holderId);

          if (!memberExists || alreadyAssigned) {
            rank.holder_member_id = null;
            rankStore.put(rank);
            continue;
          }

          assignedMembers.add(holderId);

          acceptedAssignments.set(holderId, rank);

          rank.holder_member_id = holderId;
          rankStore.put(rank);
        }

        for (const member of members) {
          const id = Number(member.id);
          const assignedRank = acceptedAssignments.get(id);

          let updated;

          if (assignedRank) {
            updated = markMemberAsHigher(
              member,
              assignedRank.id
            );
          } else if (
            member.rank === "Higher" ||
            member.higher_rank_id != null
          ) {
            updated = restoreMemberSoldierRank(member);
          } else {
            updated = {
              ...member,
              higher_rank_id: null,
              previous_soldier_rank: null
            };
          }

          memberStore.put(updated);
        }
      } catch (error) {
        abortWith(error);
      }
    };

    const memberRequest = memberStore.getAll();
    const rankRequest = rankStore.getAll();

    memberRequest.onsuccess = () => {
      members = memberRequest.result;
      membersReady = true;
      processRecords();
    };

    memberRequest.onerror = () => {
      abortWith(memberRequest.error);
    };

    rankRequest.onsuccess = () => {
      ranks = rankRequest.result;
      ranksReady = true;
      processRecords();
    };

    rankRequest.onerror = () => {
      abortWith(rankRequest.error);
    };
  });
}

/* -------------------------------------------------------
   MEMBER DELETION
------------------------------------------------------- */

/**
 * Deletes the member and clears all Higher Rank references
 * to that member in one transaction.
 */
export async function deleteMember(memberId) {
  const db = await initializeDatabase();

  const id = Number(memberId);

  const transaction = db.transaction(
    [STORES.MEMBERS, STORES.RANKS],
    "readwrite"
  );

  const completed = transactionResult(transaction);

  const members = transaction.objectStore(STORES.MEMBERS);
  const ranks = transaction.objectStore(STORES.RANKS);

  members.delete(id);

  const cursorRequest = ranks.openCursor();

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;

    if (!cursor) return;

    const rank = cursor.value;

    if (Number(rank.holder_member_id) === id) {
      rank.holder_member_id = null;
      cursor.update(rank);
    }

    cursor.continue();
  };

  await completed;
}

/* -------------------------------------------------------
   RANK ASSIGNMENT CONFLICT LOOKUP
------------------------------------------------------- */

/**
 * Returns information the UI needs before asking for
 * confirmation to transfer or replace an assignment.
 */
export async function getRankAssignmentConflicts(
  rankId,
  memberId = null
) {
  const [ranks, members] = await Promise.all([
    getAll(STORES.RANKS),
    getAll(STORES.MEMBERS)
  ]);

  const targetRank = rankId == null
    ? null
    : ranks.find(
        (rank) =>
          Number(rank.id) === Number(rankId) &&
          rank.type === "higher"
      );

  const selectedMemberId = memberId == null
    ? null
    : Number(memberId);

  const currentRank = selectedMemberId == null
    ? null
    : ranks
        .filter((rank) =>
          rank.type === "higher" &&
          Number(rank.holder_member_id) === selectedMemberId &&
          Number(rank.id) !== Number(rankId)
        )
        .sort((a, b) => a.position - b.position)[0] || null;

  const targetHolderId =
    targetRank?.holder_member_id == null
      ? null
      : Number(targetRank.holder_member_id);

  const targetHolder = targetHolderId == null ||
      targetHolderId === selectedMemberId
    ? null
    : members.find(
        (member) => Number(member.id) === targetHolderId
      ) || null;

  return {
    targetRank,
    currentRank,
    targetHolder
  };
}

/* -------------------------------------------------------
   ATOMIC HIGHER RANK ASSIGNMENT
------------------------------------------------------- */

function updateHigherRankHolder(
  rankId,
  memberId,
  options = {}
) {
  const allowTransfer = options.allowTransfer === true;
  const allowReplace = options.allowReplace === true;

  return new Promise(async (resolve, reject) => {
    let db;

    try {
      db = await initializeDatabase();
    } catch (error) {
      reject(error);
      return;
    }

    const transaction = db.transaction(
      [STORES.RANKS, STORES.MEMBERS],
      "readwrite"
    );

    const ranksStore = transaction.objectStore(STORES.RANKS);
    const membersStore = transaction.objectStore(STORES.MEMBERS);

    let failure = null;
    let result = null;

    let ranksReady = false;
    let memberReady = false;
    let processed = false;

    let allRanks = [];
    let selectedMember = null;

    const abortWith = (error) => {
      failure = error;

      try {
        transaction.abort();
      } catch {
        // The transaction may already have ended.
      }
    };

    transaction.oncomplete = () => {
      resolve(result);
    };

    transaction.onerror = () => {
      failure ||= transaction.error;
    };

    transaction.onabort = () => {
      reject(
        failure ||
        transaction.error ||
        new Error("Could not update the Higher Rank assignment.")
      );
    };

    const process = () => {
      if (!ranksReady || !memberReady || processed) return;

      processed = true;

      const targetRank = allRanks.find(
        (rank) =>
          Number(rank.id) === Number(rankId) &&
          rank.type === "higher"
      );

      if (!targetRank) {
        abortWith(
          createDatabaseError(
            "RANK_NOT_FOUND",
            "The selected Higher Rank does not exist."
          )
        );

        return;
      }

      if (!selectedMember) {
        abortWith(
          createDatabaseError(
            "MEMBER_NOT_FOUND",
            "The selected member does not exist."
          )
        );

        return;
      }

      const selectedId = Number(selectedMember.id);

      const existingRank = allRanks
        .filter((rank) =>
          rank.type === "higher" &&
          Number(rank.holder_member_id) === selectedId &&
          Number(rank.id) !== Number(targetRank.id)
        )
        .sort((a, b) => a.position - b.position)[0] || null;

      const previousTargetHolderId =
        targetRank.holder_member_id == null
          ? null
          : Number(targetRank.holder_member_id);

      const replacingAnotherMember =
        previousTargetHolderId != null &&
        previousTargetHolderId !== selectedId;

      if (existingRank && !allowTransfer) {
        abortWith(
          createDatabaseError(
            "MEMBER_ALREADY_HAS_HIGHER_RANK",
            `This member already holds ${existingRank.name}. Transfer confirmation is required.`,
            { existingRank }
          )
        );

        return;
      }

      if (replacingAnotherMember && !allowReplace) {
        abortWith(
          createDatabaseError(
            "RANK_ALREADY_HAS_HOLDER",
            "This Higher Rank already has another holder. Replacement confirmation is required."
          )
        );

        return;
      }

      const commit = (previousHolder) => {
        try {
          // Remove any previous Higher Rank assignments
          // held by the selected member.
          for (const rank of allRanks) {
            if (
              rank.type === "higher" &&
              Number(rank.holder_member_id) === selectedId &&
              Number(rank.id) !== Number(targetRank.id)
            ) {
              rank.holder_member_id = null;
              ranksStore.put(rank);
            }
          }

          // Restore the previous target holder's Soldier Rank.
          if (
            previousHolder &&
            Number(previousHolder.id) !== selectedId
          ) {
            const restored = restoreMemberSoldierRank(
              previousHolder,
              targetRank.id
            );

            membersStore.put(restored);
          }

          // Assign the selected member.
          targetRank.holder_member_id = selectedId;

          ranksStore.put(targetRank);

          const updatedMember = markMemberAsHigher(
            selectedMember,
            targetRank.id
          );

          membersStore.put(updatedMember);

          result = {
            rankId: targetRank.id,
            memberId: selectedId
          };
        } catch (error) {
          abortWith(error);
        }
      };

      if (replacingAnotherMember) {
        const previousHolderRequest = membersStore.get(
          previousTargetHolderId
        );

        previousHolderRequest.onsuccess = () => {
          commit(previousHolderRequest.result || null);
        };

        previousHolderRequest.onerror = () => {
          abortWith(previousHolderRequest.error);
        };
      } else {
        commit(null);
      }
    };

    const ranksRequest = ranksStore.getAll();

    ranksRequest.onsuccess = () => {
      allRanks = ranksRequest.result;
      ranksReady = true;
      process();
    };

    ranksRequest.onerror = () => {
      abortWith(ranksRequest.error);
    };

    const memberRequest = membersStore.get(
      Number(memberId)
    );

    memberRequest.onsuccess = () => {
      selectedMember = memberRequest.result || null;
      memberReady = true;
      process();
    };

    memberRequest.onerror = () => {
      abortWith(memberRequest.error);
    };
  });
}

/**
 * Normal assignment.
 *
 * Fails when the member already holds another Higher Rank
 * or when the target rank already has another holder.
 */
export async function assignRankHolder(rankId, memberId) {
  return updateHigherRankHolder(
    rankId,
    memberId,
    {
      allowTransfer: false,
      allowReplace: false
    }
  );
}

/**
 * Explicitly confirmed transfer/replacement.
 *
 * This operation clears the selected member's previous
 * assignment, releases another target holder when required,
 * and updates both member and rank records atomically.
 *
 * The caller must obtain user confirmation before calling it.
 */
export async function transferRankHolder(rankId, memberId) {
  return updateHigherRankHolder(
    rankId,
    memberId,
    {
      allowTransfer: true,
      allowReplace: true
    }
  );
}

/* -------------------------------------------------------
   MEMBER SAVE WITH HIGHER RANK ASSIGNMENT
------------------------------------------------------- */

/**
 * Saves a member and synchronizes their Higher Rank assignment
 * in the same IndexedDB transaction.
 *
 * options:
 * - allowTransfer: member may move from another Higher Rank.
 * - allowReplace: another member may be removed from target rank.
 * - allowUnassign: member may move from Higher back to Soldier.
 */
export async function saveMemberRecord(
  memberData,
  memberId = null,
  options = {}
) {
  const allowTransfer = options.allowTransfer === true;
  const allowReplace = options.allowReplace === true;
  const allowUnassign = options.allowUnassign === true;

  const desiredHigher = memberData.rank === "Higher";

  const desiredRankId = desiredHigher
    ? Number(memberData.higher_rank_id)
    : null;

  if (
    desiredHigher &&
    (!Number.isSafeInteger(desiredRankId) || desiredRankId < 1)
  ) {
    throw createDatabaseError(
      "HIGHER_RANK_REQUIRED",
      "Select a valid Higher Rank for this member."
    );
  }

  const db = await initializeDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.MEMBERS, STORES.RANKS],
      "readwrite"
    );

    const membersStore = transaction.objectStore(STORES.MEMBERS);
    const ranksStore = transaction.objectStore(STORES.RANKS);

    let failure = null;
    let savedMemberId = null;

    let ranksReady = false;
    let memberReady = memberId == null;
    let processed = false;

    let allRanks = [];
    let existingMember = null;

    const abortWith = (error) => {
      failure = error;

      try {
        transaction.abort();
      } catch {
        // The transaction may already have ended.
      }
    };

    transaction.oncomplete = () => {
      resolve(savedMemberId);
    };

    transaction.onerror = () => {
      failure ||= transaction.error;
    };

    transaction.onabort = () => {
      reject(
        failure ||
        transaction.error ||
        new Error("Could not save member information.")
      );
    };

    const process = () => {
      if (!ranksReady || !memberReady || processed) return;

      processed = true;

      if (memberId != null && !existingMember) {
        abortWith(
          createDatabaseError(
            "MEMBER_NOT_FOUND",
            "The member being edited no longer exists."
          )
        );

        return;
      }

      const effectiveMemberId = existingMember
        ? Number(existingMember.id)
        : null;

      const currentHigherRank = effectiveMemberId == null
        ? null
        : allRanks
            .filter((rank) =>
              rank.type === "higher" &&
              Number(rank.holder_member_id) === effectiveMemberId
            )
            .sort((a, b) => a.position - b.position)[0] || null;

      const targetRank = desiredHigher
        ? allRanks.find(
            (rank) =>
              Number(rank.id) === desiredRankId &&
              rank.type === "higher"
          )
        : null;

      if (desiredHigher && !targetRank) {
        abortWith(
          createDatabaseError(
            "RANK_NOT_FOUND",
            "The selected Higher Rank no longer exists."
          )
        );

        return;
      }

      const movingFromAnotherRank =
        Boolean(
          desiredHigher &&
          currentHigherRank &&
          Number(currentHigherRank.id) !== desiredRankId
        );

      const removingExistingRank =
        Boolean(
          !desiredHigher &&
          currentHigherRank
        );

      if (movingFromAnotherRank && !allowTransfer) {
        abortWith(
          createDatabaseError(
            "MEMBER_ALREADY_HAS_HIGHER_RANK",
            `This member already holds ${currentHigherRank.name}. Transfer confirmation is required.`,
            { existingRank: currentHigherRank }
          )
        );

        return;
      }

      if (removingExistingRank && !allowUnassign) {
        abortWith(
          createDatabaseError(
            "HIGHER_RANK_REMOVAL_CONFIRMATION_REQUIRED",
            `This member currently holds ${currentHigherRank.name}. Confirmation is required before changing to a Soldier Rank.`,
            { existingRank: currentHigherRank }
          )
        );

        return;
      }

      const targetHolderId =
        targetRank?.holder_member_id == null
          ? null
          : Number(targetRank.holder_member_id);

      const replacingAnotherMember =
        Boolean(
          desiredHigher &&
          targetHolderId != null &&
          targetHolderId !== effectiveMemberId
        );

      if (replacingAnotherMember && !allowReplace) {
        abortWith(
          createDatabaseError(
            "RANK_ALREADY_HAS_HOLDER",
            "This Higher Rank is already assigned to another member. Replacement confirmation is required."
          )
        );

        return;
      }

      const commit = (previousHolder) => {
        try {
          const savedMember = {
            ...(existingMember || {}),
            ...memberData
          };

          if (desiredHigher) {
            const previousSoldierRank =
              existingMember?.previous_soldier_rank ||
              (
                existingMember?.rank &&
                existingMember.rank !== "Higher"
                  ? existingMember.rank
                  : "Trainee"
              );

            savedMember.rank = "Higher";
            savedMember.higher_rank_id = desiredRankId;
            savedMember.previous_soldier_rank =
              previousSoldierRank;

            // Clear any other Higher Rank held by this member.
            if (effectiveMemberId != null) {
              for (const rank of allRanks) {
                if (
                  rank.type === "higher" &&
                  Number(rank.holder_member_id) === effectiveMemberId &&
                  Number(rank.id) !== desiredRankId
                ) {
                  rank.holder_member_id = null;
                  ranksStore.put(rank);
                }
              }
            }
          } else {
            savedMember.rank = String(
              memberData.rank || "Trainee"
            );

            savedMember.higher_rank_id = null;
            savedMember.previous_soldier_rank = null;

            // A Soldier Rank selection releases the old
            // Higher Rank assignment after confirmation.
            if (effectiveMemberId != null) {
              for (const rank of allRanks) {
                if (
                  rank.type === "higher" &&
                  Number(rank.holder_member_id) === effectiveMemberId
                ) {
                  rank.holder_member_id = null;
                  ranksStore.put(rank);
                }
              }
            }
          }

          // Restore the member previously holding the target rank.
          if (
            previousHolder &&
            Number(previousHolder.id) !== effectiveMemberId
          ) {
            const restored = restoreMemberSoldierRank(
              previousHolder,
              targetRank.id
            );

            membersStore.put(restored);
          }

          const saveRelationship = (id) => {
            savedMember.id = Number(id);

            if (desiredHigher) {
              targetRank.holder_member_id = Number(id);
              ranksStore.put(targetRank);
            }

            if (existingMember) {
              membersStore.put(savedMember);
            }

            savedMemberId = Number(id);
          };

          if (effectiveMemberId == null) {
            delete savedMember.id;

            const addRequest = membersStore.add(savedMember);

            addRequest.onsuccess = () => {
              saveRelationship(addRequest.result);
            };

            addRequest.onerror = () => {
              abortWith(addRequest.error);
            };
          } else {
            saveRelationship(effectiveMemberId);
          }
        } catch (error) {
          abortWith(error);
        }
      };

      if (replacingAnotherMember) {
        const previousHolderRequest = membersStore.get(
          targetHolderId
        );

        previousHolderRequest.onsuccess = () => {
          commit(previousHolderRequest.result || null);
        };

        previousHolderRequest.onerror = () => {
          abortWith(previousHolderRequest.error);
        };
      } else {
        commit(null);
      }
    };

    const ranksRequest = ranksStore.getAll();

    ranksRequest.onsuccess = () => {
      allRanks = ranksRequest.result;
      ranksReady = true;
      process();
    };

    ranksRequest.onerror = () => {
      abortWith(ranksRequest.error);
    };

    if (memberId != null) {
      const memberRequest = membersStore.get(Number(memberId));

      memberRequest.onsuccess = () => {
        existingMember = memberRequest.result || null;
        memberReady = true;
        process();
      };

      memberRequest.onerror = () => {
        abortWith(memberRequest.error);
      };
    }
  });
}

/* -------------------------------------------------------
   HOLDER REMOVAL / RANK DELETION
------------------------------------------------------- */

function clearHigherRankAssignment(rankId, deleteRankRecord = false) {
  return new Promise(async (resolve, reject) => {
    let db;

    try {
      db = await initializeDatabase();
    } catch (error) {
      reject(error);
      return;
    }

    const transaction = db.transaction(
      [STORES.RANKS, STORES.MEMBERS],
      "readwrite"
    );

    const ranks = transaction.objectStore(STORES.RANKS);
    const members = transaction.objectStore(STORES.MEMBERS);

    let failure = null;
    let completedAction = false;

    const abortWith = (error) => {
      failure = error;

      try {
        transaction.abort();
      } catch {
        // The transaction may already have ended.
      }
    };

    transaction.oncomplete = () => resolve();

    transaction.onerror = () => {
      failure ||= transaction.error;
    };

    transaction.onabort = () => {
      reject(
        failure ||
        transaction.error ||
        new Error("Could not update the rank.")
      );
    };

    const rankRequest = ranks.get(Number(rankId));

    rankRequest.onsuccess = () => {
      const rank = rankRequest.result;

      if (!rank || rank.type !== "higher") {
        abortWith(
          createDatabaseError(
            "RANK_NOT_FOUND",
            "The Higher Rank could not be found."
          )
        );

        return;
      }

      const holderId = rank.holder_member_id == null
        ? null
        : Number(rank.holder_member_id);

      const finish = (holder) => {
        try {
          if (
            holder &&
            Number(holder.higher_rank_id) === Number(rank.id)
          ) {
            members.put(
              restoreMemberSoldierRank(holder, rank.id)
            );
          }

          if (deleteRankRecord) {
            ranks.delete(Number(rank.id));
          } else {
            rank.holder_member_id = null;
            ranks.put(rank);
          }

          completedAction = true;
        } catch (error) {
          abortWith(error);
        }
      };

      if (holderId == null) {
        finish(null);
        return;
      }

      const memberRequest = members.get(holderId);

      memberRequest.onsuccess = () => {
        finish(memberRequest.result || null);
      };

      memberRequest.onerror = () => {
        abortWith(memberRequest.error);
      };
    };

    rankRequest.onerror = () => {
      abortWith(rankRequest.error);
    };
  });
}

export async function removeRankHolder(rankId) {
  await clearHigherRankAssignment(rankId, false);
}

export async function deleteRank(rankId) {
  await clearHigherRankAssignment(rankId, true);
}

/* -------------------------------------------------------
   RANK REORDERING
------------------------------------------------------- */

export async function moveRank(rankId, direction) {
  const movement = Number(direction);

  if (movement !== -1 && movement !== 1) {
    throw new Error("Invalid rank movement.");
  }

  const db = await initializeDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORES.RANKS,
      "readwrite"
    );

    const store = transaction.objectStore(STORES.RANKS);

    let failure = null;

    transaction.oncomplete = () => resolve();

    transaction.onerror = () => {
      failure ||= transaction.error;
    };

    transaction.onabort = () => {
      reject(
        failure ||
        transaction.error ||
        new Error("Could not reorder ranks.")
      );
    };

    const request = store.getAll();

    request.onsuccess = () => {
      const allRanks = request.result;

      const selected = allRanks.find(
        (rank) => Number(rank.id) === Number(rankId)
      );

      if (!selected) return;

      const group = allRanks
        .filter((rank) => rank.type === selected.type)
        .sort((a, b) => a.position - b.position);

      const index = group.findIndex(
        (rank) => Number(rank.id) === Number(rankId)
      );

      const target = group[index + movement];

      if (!target) return;

      const oldPosition = selected.position;

      selected.position = target.position;
      target.position = oldPosition;

      store.put(selected);
      store.put(target);
    };

    request.onerror = () => {
      failure = request.error;

      try {
        transaction.abort();
      } catch {
        // Already ended.
      }
    };
  });
}

/* -------------------------------------------------------
   INITIAL RANK SEEDING
------------------------------------------------------- */

export async function seedInitialRanks() {
  const db = await initializeDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.RANKS, STORES.METADATA],
      "readwrite"
    );

    const ranks = transaction.objectStore(STORES.RANKS);
    const metadata = transaction.objectStore(STORES.METADATA);

    let failure = null;

    transaction.oncomplete = () => resolve();

    transaction.onerror = () => {
      failure ||= transaction.error;
    };

    transaction.onabort = () => {
      reject(
        failure ||
        transaction.error ||
        new Error("Could not initialize ranks.")
      );
    };

    const markerRequest = metadata.get(SEED_MARKER);

    markerRequest.onsuccess = () => {
      if (markerRequest.result?.value === true) return;

      const ranksRequest = ranks.getAll();

      ranksRequest.onsuccess = () => {
        if (ranksRequest.result.length === 0) {
          HIGHER_RANKS.forEach((name, index) => {
            ranks.add({
              name,
              type: "higher",
              position: index + 1,
              holder_member_id: null
            });
          });

          SOLDIER_RANKS.forEach((name, index) => {
            ranks.add({
              name,
              type: "soldier",
              position: index + 1,
              holder_member_id: null
            });
          });
        }

        metadata.put({
          key: SEED_MARKER,
          value: true
        });
      };

      ranksRequest.onerror = () => {
        failure = ranksRequest.error;

        try {
          transaction.abort();
        } catch {
          // Already ended.
        }
      };
    };

    markerRequest.onerror = () => {
      failure = markerRequest.error;

      try {
        transaction.abort();
      } catch {
        // Already ended.
      }
    };
  });
}

/* -------------------------------------------------------
   JSON EXPORT
------------------------------------------------------- */

export async function exportDatabase() {
  const [members, ranks, texts] = await Promise.all([
    getAll(STORES.MEMBERS),
    getAll(STORES.RANKS),
    getAll(STORES.TEXTS)
  ]);

  return {
    application: "WallMariaControlPanel",
    version: 3,
    exportedAt: new Date().toISOString(),

    data: {
      members,
      ranks,
      texts
    }
  };
}

/* -------------------------------------------------------
   JSON IMPORT HELPERS
------------------------------------------------------- */

function normalizeImportedMember(record) {
  if (!record || typeof record !== "object") {
    throw new Error("A backup contains an invalid member.");
  }

  const migrated = migrateMemberRecord(record);

  if (record.id != null) {
    const id = Number(record.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      throw new Error("A backup contains an invalid member ID.");
    }

    migrated.id = id;
  } else {
    delete migrated.id;
  }

  return migrated;
}

function normalizeImportedRank(record, validMemberIds) {
  if (!record || typeof record !== "object") {
    throw new Error("A backup contains an invalid rank.");
  }

  const type = record.type;

  if (type !== "higher" && type !== "soldier") {
    throw new Error("A backup contains an invalid rank type.");
  }

  const id = record.id == null
    ? undefined
    : Number(record.id);

  if (
    id !== undefined &&
    (!Number.isSafeInteger(id) || id < 1)
  ) {
    throw new Error("A backup contains an invalid rank ID.");
  }

  const holderId = record.holder_member_id == null
    ? null
    : Number(record.holder_member_id);

  return {
    ...record,

    ...(id === undefined ? {} : { id }),

    name: String(record.name ?? "").trim(),

    type,

    position: Number.isFinite(Number(record.position))
      ? Number(record.position)
      : 1,

    holder_member_id:
      type === "higher" && validMemberIds.has(holderId)
        ? holderId
        : null
  };
}

function normalizeImportedText(record) {
  if (!record || typeof record !== "object") {
    throw new Error("A backup contains an invalid text entry.");
  }

  const id = record.id == null
    ? undefined
    : Number(record.id);

  if (
    id !== undefined &&
    (!Number.isSafeInteger(id) || id < 1)
  ) {
    throw new Error("A backup contains an invalid text ID.");
  }

  return {
    ...record,

    ...(id === undefined ? {} : { id }),

    title: String(record.title ?? ""),
    category: String(record.category ?? "General"),
    content: String(record.content ?? "")
  };
}

function ensureUniqueIds(items, label) {
  const ids = new Set();

  for (const item of items) {
    if (item.id == null) continue;

    if (ids.has(item.id)) {
      throw new Error(`Duplicate ${label} ID in backup.`);
    }

    ids.add(item.id);
  }
}

/* -------------------------------------------------------
   JSON IMPORT
------------------------------------------------------- */

export async function importDatabase(backup) {
  if (
    !backup ||
    backup.application !== "WallMariaControlPanel" ||
    ![1, 2, 3].includes(Number(backup.version)) ||
    !backup.data
  ) {
    throw new Error("Invalid or unsupported backup file.");
  }

  const { members, ranks, texts } = backup.data;

  if (
    !Array.isArray(members) ||
    !Array.isArray(ranks) ||
    !Array.isArray(texts)
  ) {
    throw new Error("Backup data is incomplete.");
  }

  const normalizedMembers = members.map(
    normalizeImportedMember
  );

  ensureUniqueIds(normalizedMembers, "member");

  const validMemberIds = new Set(
    normalizedMembers
      .filter((member) => member.id != null)
      .map((member) => member.id)
  );

  const normalizedRanks = ranks.map((rank) =>
    normalizeImportedRank(rank, validMemberIds)
  );

  const normalizedTexts = texts.map(
    normalizeImportedText
  );

  ensureUniqueIds(normalizedRanks, "rank");
  ensureUniqueIds(normalizedTexts, "text");

  const db = await initializeDatabase();

  const transaction = db.transaction(
    [STORES.MEMBERS, STORES.RANKS, STORES.TEXTS],
    "readwrite"
  );

  const completed = transactionResult(transaction);

  const memberStore = transaction.objectStore(STORES.MEMBERS);
  const rankStore = transaction.objectStore(STORES.RANKS);
  const textStore = transaction.objectStore(STORES.TEXTS);

  memberStore.clear();
  rankStore.clear();
  textStore.clear();

  normalizedMembers.forEach((item) => {
    memberStore.put(item);
  });

  normalizedRanks.forEach((item) => {
    rankStore.put(item);
  });

  normalizedTexts.forEach((item) => {
    textStore.put(item);
  });

  await completed;

  // Make holder references and member rank fields consistent
  // after importing a legacy or current backup.
  await reconcileHigherRankAssignments();
}

/* -------------------------------------------------------
   EXPORTS
------------------------------------------------------- */

export { STORES };
