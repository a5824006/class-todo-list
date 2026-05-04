const STORAGE_KEYS = ["classes", "todos", "events"];
const SETTINGS_KEY = "settings";
const SYNC_PREFIX = "MYSTUDY_SYNC:";
const BACKUP_PREFIX = "backup";
const MAX_SYNC_TEXT_LENGTH = 2_000_000;
const MAX_SYNC_ITEMS_PER_KIND = 5000;
const DEFAULT_PERIOD_TIMES = [
  { start: "09:00", end: "10:30" },
  { start: "11:00", end: "12:30" },
  { start: "13:20", end: "14:50" },
  { start: "15:05", end: "16:35" },
  { start: "16:50", end: "18:20" },
  { start: "18:30", end: "20:00" }
];
const DEFAULT_SETTINGS = {
  timezoneOffsetMinutes: 540,
  showPeriodTimes: false,
  periodTimes: DEFAULT_PERIOD_TIMES
};

const storageWarningKeys = new Set();
let pendingImportPlan = null;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getBackupTimestamp() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace("T", "-").slice(0, 18);
}

function getRawStorageSnapshot() {
  return [SETTINGS_KEY, ...STORAGE_KEYS].reduce((snapshot, key) => {
    snapshot[key] = localStorage.getItem(key);
    return snapshot;
  }, {});
}

function createBackup(reason) {
  const safeReason = String(reason || "manual").replace(/[^a-z0-9_-]/gi, "-").slice(0, 48);
  const key = `${BACKUP_PREFIX}-${safeReason}-${getBackupTimestamp()}`;
  const backup = {
    app: "MyStudy",
    version: 1,
    kind: "backup",
    reason: safeReason,
    createdAt: new Date().toISOString(),
    rawData: getRawStorageSnapshot()
  };
  localStorage.setItem(key, JSON.stringify(backup));
  return key;
}

function showStorageWarning(message, key = message) {
  console.warn(message);
  if (storageWarningKeys.has(key)) return;
  storageWarningKeys.add(key);
  if (typeof alert === "function") {
    alert(message);
  }
}

function readStoredListState(key) {
  const raw = localStorage.getItem(key);
  if (raw === null || raw === "") {
    return { ok: true, list: [], raw };
  }

  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) {
      return { ok: false, list: [], raw, error: `${key} は配列ではありません。` };
    }
    return { ok: true, list: value, raw };
  } catch (error) {
    return { ok: false, list: [], raw, error: `${key} の保存データが壊れています。` };
  }
}

function readStoredList(key) {
  const state = readStoredListState(key);
  if (!state.ok) {
    showStorageWarning(`${state.error}\nデータ保護のため、このキーは自動上書きしません。`, `read-${key}`);
  }
  return state.list;
}

function readStoredListStrict(key) {
  const state = readStoredListState(key);
  if (!state.ok) {
    throw new Error(`${state.error} 修復またはバックアップからの復元が必要です。`);
  }
  return state.list;
}

function writeStoredList(key, list, options = {}) {
  if (!Array.isArray(list)) {
    throw new Error(`${key} に保存するデータが配列ではありません。`);
  }

  const state = readStoredListState(key);
  if (!state.ok && !options.allowOverwriteCorrupt) {
    createBackup(`corrupt-${key}`);
    throw new Error(`${state.error} 破損データを backup-* に退避したため、上書きを中止しました。`);
  }

  localStorage.setItem(key, JSON.stringify(Array.isArray(list) ? list : []));
}

function readStoredObject(key, fallback = {}) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
  } catch (error) {
    return fallback;
  }
}

function getSettings() {
  const stored = readStoredObject(SETTINGS_KEY, {});
  return sanitizeSettings(stored);
}

function writeSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    ...getSettings(),
    ...settings
  }));
}

function sanitizeSettings(settings) {
  const offset = Number(settings?.timezoneOffsetMinutes);
  const sourceTimes = Array.isArray(settings?.periodTimes) ? settings.periodTimes : DEFAULT_PERIOD_TIMES;
  const periodTimes = DEFAULT_PERIOD_TIMES.map((defaultTime, index) => {
    const source = isPlainObject(sourceTimes[index]) ? sourceTimes[index] : {};
    const start = isTimeValue(source.start) && source.start ? String(source.start) : defaultTime.start;
    const end = isTimeValue(source.end) && source.end ? String(source.end) : defaultTime.end;
    return { start, end };
  });

  return {
    ...DEFAULT_SETTINGS,
    ...(isPlainObject(settings) ? settings : {}),
    timezoneOffsetMinutes: Number.isFinite(offset)
      ? Math.min(14 * 60, Math.max(-12 * 60, Math.round(offset)))
      : DEFAULT_SETTINGS.timezoneOffsetMinutes,
    showPeriodTimes: settings?.showPeriodTimes === true,
    periodTimes
  };
}

function getSubjectUrl(classId) {
  return `subject.html?classId=${encodeURIComponent(classId)}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatTimezoneOffset(minutes = getSettings().timezoneOffsetMinutes) {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

function getTimezoneOffsetString() {
  return formatTimezoneOffset().replace("UTC", "");
}

function getDatePartsInAppTimezone(timestamp = Date.now()) {
  const offset = getSettings().timezoneOffsetMinutes;
  const d = new Date(timestamp + offset * 60 * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes()
  };
}

function getTodayString() {
  const now = getDatePartsInAppTimezone();
  return `${now.year}-${pad2(now.month)}-${pad2(now.day)}`;
}

function getCurrentWeekday() {
  return getDatePartsInAppTimezone().weekday;
}

function getCurrentMinutesOfDay() {
  const now = getDatePartsInAppTimezone();
  return now.hour * 60 + now.minute;
}

function timeToMinutes(time) {
  if (!isTimeValue(time) || !time) return null;
  const [hour, minute] = String(time).split(":").map(Number);
  return hour * 60 + minute;
}

function getPeriodSchedules() {
  return getSettings().periodTimes.map(time => {
    const start = timeToMinutes(time.start);
    const end = timeToMinutes(time.end);
    return {
      ...time,
      startMin: start,
      endMin: end
    };
  });
}

function getPeriodLabel(period) {
  const settings = getSettings();
  const time = settings.periodTimes[period - 1];
  if (!settings.showPeriodTimes || !time) {
    return `${period}限`;
  }
  return `${period}限 ${time.start}-${time.end}`;
}

function normalizeSyncPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("同期データを読み取れません。");
  }

  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  return {
    version: Number(payload.version || 1),
    exportedAt: payload.exportedAt || null,
    settings: data.settings && typeof data.settings === "object" ? data.settings : DEFAULT_SETTINGS,
    classes: Array.isArray(data.classes) ? data.classes : [],
    todos: Array.isArray(data.todos) ? data.todos : [],
    events: Array.isArray(data.events) ? data.events : []
  };
}

function limitText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeImportId(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const id = limitText(value, 160);
  return id || null;
}

function normalizeTimestamp(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function isDateValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isTimeValue(value) {
  return value === "" || value === null || value === undefined || /^\d{2}:\d{2}$/.test(String(value));
}

function sanitizeImportedClass(item) {
  if (!isPlainObject(item)) return null;

  const id = normalizeImportId(item.id);
  const subject = limitText(item.subject, 120);
  const weekday = Number(item.weekday);
  const period = Number(item.period);
  const duration = Number(item.duration) === 2 ? 2 : 1;
  const now = Date.now();

  if (!id || !subject || !Number.isInteger(weekday) || weekday < 1 || weekday > 6) return null;
  if (!Number.isInteger(period) || period < 1 || period > 6) return null;
  if (duration === 2 && period >= 6) return null;

  return {
    type: "class",
    id,
    subject,
    weekday,
    period,
    duration,
    room: limitText(item.room, 120),
    createdAt: normalizeTimestamp(item.createdAt, now),
    updatedAt: normalizeTimestamp(item.updatedAt, normalizeTimestamp(item.createdAt, now))
  };
}

function sanitizeImportedTodo(item) {
  if (!isPlainObject(item)) return null;

  const id = normalizeImportId(item.id);
  const content = limitText(item.content ?? item.title, 240);
  const due = String(item.due || "");
  const time = String(item.time || "");
  const now = Date.now();

  if (!id || !content || !isDateValue(due) || !isTimeValue(time)) return null;

  return {
    id,
    type: "todo",
    classId: item.classId === null || item.classId === undefined ? null : limitText(item.classId, 160),
    content,
    due,
    time,
    memo: limitText(item.memo, 1000),
    done: item.done === true,
    createdAt: normalizeTimestamp(item.createdAt, now),
    updatedAt: normalizeTimestamp(item.updatedAt, normalizeTimestamp(item.createdAt, now))
  };
}

function sanitizeImportedEvent(item) {
  if (!isPlainObject(item)) return null;

  const id = normalizeImportId(item.id);
  const title = limitText(item.title ?? item.content, 240);
  const date = String(item.date || "");
  const time = String(item.time || "");
  const now = Date.now();

  if (!id || !title || !isDateValue(date) || !isTimeValue(time)) return null;

  return {
    id,
    type: "event",
    classId: item.classId === null || item.classId === undefined ? null : limitText(item.classId, 160),
    title,
    date,
    time,
    memo: limitText(item.memo, 1000),
    createdAt: normalizeTimestamp(item.createdAt, now),
    updatedAt: normalizeTimestamp(item.updatedAt, normalizeTimestamp(item.createdAt, now))
  };
}

function dedupeById(list) {
  const map = new Map();
  list.forEach(item => {
    const key = String(item.id);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      return;
    }

    const existingUpdated = Number(existing.updatedAt || existing.createdAt || 0);
    const incomingUpdated = Number(item.updatedAt || item.createdAt || 0);
    map.set(key, incomingUpdated >= existingUpdated ? item : existing);
  });
  return Array.from(map.values());
}

function sanitizeImportedList(key, list) {
  if (list.length > MAX_SYNC_ITEMS_PER_KIND) {
    throw new Error(`${key} が多すぎます。${MAX_SYNC_ITEMS_PER_KIND}件以下にしてください。`);
  }

  const sanitizer = {
    classes: sanitizeImportedClass,
    todos: sanitizeImportedTodo,
    events: sanitizeImportedEvent
  }[key];
  const sanitized = list.map(sanitizer).filter(Boolean);
  const deduped = dedupeById(sanitized);

  return {
    list: deduped,
    skipped: list.length - deduped.length
  };
}

function sanitizeImportPayload(payload) {
  const normalized = normalizeSyncPayload(payload);
  const result = {
    settings: sanitizeSettings(normalized.settings),
    classes: [],
    todos: [],
    events: [],
    skipped: { classes: 0, todos: 0, events: 0 }
  };

  STORAGE_KEYS.forEach(key => {
    const sanitized = sanitizeImportedList(key, normalized[key]);
    result[key] = sanitized.list;
    result.skipped[key] = sanitized.skipped;
  });

  return result;
}

function getCurrentImportState() {
  const warnings = [];
  const state = { settings: getSettings() };

  STORAGE_KEYS.forEach(key => {
    const stored = readStoredListState(key);
    if (!stored.ok) {
      warnings.push(stored.error);
      state[key] = [];
    } else {
      state[key] = stored.list;
    }
  });

  return { state, warnings };
}

function getSyncPayload() {
  return {
    app: "MyStudy",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings: getSettings(),
      classes: readStoredListStrict("classes"),
      todos: readStoredListStrict("todos"),
      events: readStoredListStrict("events")
    }
  };
}

function encodeSyncPayload(payload = getSyncPayload()) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return `${SYNC_PREFIX}${btoa(binary)}`;
}

function decodeSyncText(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("同期データが空です。");
  }

  if (trimmed.startsWith(SYNC_PREFIX)) {
    const binary = atob(trimmed.slice(SYNC_PREFIX.length));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  return JSON.parse(trimmed);
}

function mergeById(current, incoming) {
  const merged = new Map();
  current.forEach(item => {
    if (item && item.id !== undefined && item.id !== null) {
      merged.set(String(item.id), item);
    }
  });
  incoming.forEach(item => {
    if (item && item.id !== undefined && item.id !== null) {
      const existing = merged.get(String(item.id));
      const existingUpdated = Number(existing?.updatedAt || existing?.createdAt || 0);
      const incomingUpdated = Number(item.updatedAt || item.createdAt || 0);
      merged.set(String(item.id), incomingUpdated >= existingUpdated ? item : existing);
    }
  });
  return Array.from(merged.values());
}

function hasSameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildMergeResult(current, incoming, skipped = 0) {
  const merged = new Map();
  const stats = { added: 0, updated: 0, unchanged: 0, removed: 0, overwritten: 0, skipped };

  current.forEach(item => {
    if (item && item.id !== undefined && item.id !== null) {
      merged.set(String(item.id), item);
    }
  });

  incoming.forEach(item => {
    const key = String(item.id);
    const existing = merged.get(key);
    if (!existing) {
      stats.added += 1;
      merged.set(key, item);
      return;
    }

    if (hasSameJson(existing, item)) {
      stats.unchanged += 1;
      return;
    }

    stats.updated += 1;
    const existingUpdated = Number(existing.updatedAt || existing.createdAt || 0);
    const incomingUpdated = Number(item.updatedAt || item.createdAt || 0);
    merged.set(key, incomingUpdated >= existingUpdated ? item : existing);
  });

  return {
    list: Array.from(merged.values()),
    stats: {
      ...stats,
      totalAfter: merged.size
    }
  };
}

function buildReplaceResult(current, incoming, skipped = 0) {
  const currentMap = new Map(current.map(item => [String(item.id), item]));
  const incomingMap = new Map(incoming.map(item => [String(item.id), item]));
  const stats = { added: 0, updated: 0, unchanged: 0, removed: 0, overwritten: current.length, skipped };

  incomingMap.forEach((item, key) => {
    const existing = currentMap.get(key);
    if (!existing) {
      stats.added += 1;
    } else if (hasSameJson(existing, item)) {
      stats.unchanged += 1;
    } else {
      stats.updated += 1;
    }
  });

  currentMap.forEach((item, key) => {
    if (!incomingMap.has(key)) {
      stats.removed += 1;
    }
  });

  return {
    list: incoming,
    stats: {
      ...stats,
      totalAfter: incoming.length
    }
  };
}

function buildImportPlan(text, mode = "merge") {
  if (text.length > MAX_SYNC_TEXT_LENGTH) {
    throw new Error("同期データが大きすぎます。JSONファイルで分割してください。");
  }

  const incoming = sanitizeImportPayload(decodeSyncText(text));
  const current = getCurrentImportState();
  const normalizedMode = mode === "replace" ? "replace" : "merge";
  const plan = {
    mode: normalizedMode,
    warnings: current.warnings,
    next: {
      settings: incoming.settings,
      classes: [],
      todos: [],
      events: []
    },
    stats: {}
  };

  STORAGE_KEYS.forEach(key => {
    const result = normalizedMode === "replace"
      ? buildReplaceResult(current.state[key], incoming[key], incoming.skipped[key])
      : buildMergeResult(current.state[key], incoming[key], incoming.skipped[key]);
    plan.next[key] = result.list;
    plan.stats[key] = result.stats;
  });

  return plan;
}

function commitStorageState(nextState, reason) {
  const previous = getRawStorageSnapshot();
  const writes = [
    [SETTINGS_KEY, JSON.stringify(sanitizeSettings(nextState.settings))],
    ["classes", JSON.stringify(nextState.classes)],
    ["todos", JSON.stringify(nextState.todos)],
    ["events", JSON.stringify(nextState.events)]
  ];

  createBackup(reason);

  try {
    writes.forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
  } catch (error) {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    });
    throw new Error(`保存に失敗したため、変更を元に戻しました。${error.message || ""}`);
  }
}

function importSyncData(text, mode = "merge") {
  const plan = buildImportPlan(text, mode);
  commitStorageState(plan.next, `import-${plan.mode}`);

  return {
    classes: plan.next.classes.length,
    todos: plan.next.todos.length,
    events: plan.next.events.length,
    stats: plan.stats,
    warnings: plan.warnings
  };
}

function appendEntrySummary(container, entry, { showSubject = true } = {}) {
  const time = document.createElement("time");
  time.textContent = entry.dateStr;
  container.appendChild(time);

  const body = document.createElement("div");
  const typeLabel = entry.type === "todo" ? "ToDo" : "イベント";
  body.textContent =
    `[${typeLabel}] ` +
    `${showSubject && entry.subject ? `${entry.subject}：` : ""}` +
    `${entry.label || ""}` +
    `${entry.memo ? `（${entry.memo}）` : ""}`;
  container.appendChild(body);
}

function normalizeWeekday(input) {
  const map = {
    "月": 1, "月曜": 1, "月曜日": 1,
    "火": 2, "火曜": 2, "火曜日": 2,
    "水": 3, "水曜": 3, "水曜日": 3,
    "木": 4, "木曜": 4, "木曜日": 4,
    "金": 5, "金曜": 5, "金曜日": 5,
    "土": 6, "土曜": 6, "土曜日": 6
  };
  return map[input.trim()];
}

function normalizePeriod(input) {
  const num = parseInt(input);
  if (!isNaN(num) && num >= 1 && num <= 6) {
    return num;
  }
  return null;
}

function addClass() {
  const subjectInput = prompt("教科名を入力してください：");
  if (!subjectInput) return;
  const subject = subjectInput.trim();
  if (!subject) return;

  const weekdayInput = prompt("曜日を入力してください（形式の例: 月, 水曜, 土曜日）:");
  if (!weekdayInput) return;
  const weekday = normalizeWeekday(weekdayInput);
  if (!weekday) {
    alert("正しい曜日を入力してください");
    return;
  }

  const periodInput = prompt("開始する時限を入力してください（1〜6）:");
  if (!periodInput) return;
  const period = normalizePeriod(periodInput);
  if (!period) {
    alert("正しい時限を1〜6の数字で入力してください。");
    return;
  }

  const durationInput = prompt("2限連続の場合は2を入力してください（それ以外は空欄でOKを押してください）：");
  if (durationInput === null) return;
  const duration = durationInput.trim() === "2" ? 2 : 1;
  if (duration === 2 && period >= 6) {
    alert("2限連続を指定する場合、開始時限は1〜5限のいずれかにしてください。");
    return;
  }

  const roomInput = prompt("教室を入力してください（任意）：");
  if (roomInput === null) return;
  const room = roomInput.trim();

  const classId = `${subject.trim()}_${weekday}_${period}_${room || "none"}`;
  const classes = readStoredList("classes");
  const exists = classes.some(c => c.id === classId);
  if (exists) {
    alert("同じ教科はすでに登録されています。");
    return;
  }

  const timestamp = Date.now();
  classes.push({
    type: "class",
    subject,
    weekday,
    period,
    duration,
    room,
    id: classId,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  writeStoredList("classes", classes);
  location.reload();
}

function injectClassEditModal() {
  const modalHtml = `
    <div id="class-edit-modal" class="modal">
      <div class="modal-content">
        <h3>教科を編集</h3>
        <input type="text" id="classSubject" placeholder="教科名">
        <input type="text" id="classWeekday" placeholder="曜日（例：月, 火曜）">
        <input type="number" id="classPeriod" placeholder="開始時限（1〜6）" min="1" max="6">
        <input type="number" id="classDuration" placeholder="授業のコマ数（2なら2限連続）" min="1" max="2">
        <input type="text" id="classRoom" placeholder="教室（任意）">
        <div class="modal-buttons">
          <button onclick="saveEditedClass()">OK</button>
          <button onclick="closeClassEditModal()">キャンセル</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

let currentClassIdForEdit = null;

function openClassEditModal(classObj) {
  currentClassIdForEdit = classObj.id;
  document.getElementById("classSubject").value = classObj.subject || "";
  document.getElementById("classWeekday").value = ['月','火','水','木','金','土'][classObj.weekday - 1] || "";
  document.getElementById("classPeriod").value = classObj.period || "";
  document.getElementById("classDuration").value = classObj.duration || 1;
  document.getElementById("classRoom").value = classObj.room || "";
  document.getElementById("class-edit-modal").style.display = "flex";
}

function saveEditedClass() {
  if (!confirm("この内容で変更しますか？")) return;

  const subject = document.getElementById("classSubject").value.trim();
  const weekdayInput = document.getElementById("classWeekday").value.trim();
  const period = parseInt(document.getElementById("classPeriod").value);
  const duration = parseInt(document.getElementById("classDuration").value) || 1;
  const room = document.getElementById("classRoom").value.trim();

  const weekday = normalizeWeekday(weekdayInput);
  if (!subject || !weekday || isNaN(period) || period < 1 || period > 6) {
    alert("入力内容に誤りがあります。");
    return;
  }

  const newId = `${subject}_${weekday}_${period}_${room || "none"}`;
  const classes = readStoredList("classes");

  // 重複チェック（別の教科で同じIDがある場合）
  if (newId !== currentClassIdForEdit && classes.some(c => c.id === newId)) {
    alert("同じ教科がすでに存在します。");
    closeClassEditModal();
    return;
  }

  // classIdを更新（ToDo・イベントも紐づけ直す）
  const existingClass = classes.find(c => c.id === currentClassIdForEdit) || {};
  const updatedClass = {
    ...existingClass,
    id: newId,
    subject,
    weekday,
    period,
    duration,
    room,
    type: "class",
    updatedAt: Date.now()
  };
  const newClasses = classes.map(c => c.id === currentClassIdForEdit ? updatedClass : c);
  writeStoredList("classes", newClasses);

  // ToDo・イベントのclassIdを更新
  const updateRelated = (key) => {
    const list = readStoredList(key);
    const updated = list.map(e => e.classId === currentClassIdForEdit ? { ...e, classId: newId, updatedAt: Date.now() } : e);
    writeStoredList(key, updated);
  };
  updateRelated("todos");
  updateRelated("events");

  closeClassEditModal();
  location.reload();
}

function closeClassEditModal() {
  document.getElementById("class-edit-modal").style.display = "none";
  currentClassIdForEdit = null;
}

function getMenuBackdrop() {
  let backdrop = document.getElementById("menu-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "menu-backdrop";
    backdrop.className = "menu-backdrop";
    backdrop.addEventListener("click", closeMenu);
    document.body.appendChild(backdrop);
  }
  return backdrop;
}

function closeMenu() {
  const menu = document.getElementById("dropdown-menu");
  const backdrop = document.getElementById("menu-backdrop");
  menu?.classList.remove("is-open");
  backdrop?.classList.remove("is-open");
  document.body.classList.remove("menu-open");
}

function toggleMenu() {
  const classes = readStoredList("classes");
  if (classes.length === 0) {
    addClass();
    return;
  }
  const menu = document.getElementById("dropdown-menu");

  // 開閉トグル
  if (menu.classList.contains("is-open")) {
    closeMenu();
    return;
  }

  // メニューをクリア
  menu.replaceChildren();

  // ソート
  classes.sort((a, b) =>
    a.weekday - b.weekday || a.period - b.period
  );

  // 科目名のみでリンクを生成
  classes.forEach(c => {
    const a = document.createElement("a");
    a.textContent = c.subject;  // ← 科目名だけ
    a.href = getSubjectUrl(c.id);
    menu.appendChild(a);
  });

  // メニュー表示
  getMenuBackdrop().classList.add("is-open");
  document.body.classList.add("menu-open");
  menu.classList.add("is-open");
}


// ToDo・イベントの登録（classId は null または指定ID）
function addEntry(classId = null) {
  const type = document.getElementById("entryType").value;
  const title = document.getElementById("entryTitle").value.trim();
  const date = document.getElementById("entryDate").value;
  const time = document.getElementById("entryTime").value;
  const memo = document.getElementById("entryMemo").value.trim();

  if (!title || !date) {
    alert("タイトルと日付は必須です。");
    return;
  }
  
  const id = Date.now();
  const timestamp = Date.now();
  const newItem = type === "todo"
    ? { id, type: "todo", classId, content: title, due: date, time, memo, done: false, createdAt: timestamp, updatedAt: timestamp }
    : { id, type: "event", classId, title, date, time, memo, createdAt: timestamp, updatedAt: timestamp };

  const key = type === "todo" ? "todos" : "events";
  const list = readStoredList(key);
  list.push(newItem);
  writeStoredList(key, list);
  location.reload();
}

// ToDo・イベントの削除（確認付き）
function deleteEntry(type, id) {
  if (!confirm("本当に削除しますか？")) return;
  const key = type === "todo" ? "todos" : "events";
  try {
    const list = readStoredListStrict(key);
    const filtered = list.filter(e => e.id !== id);
    createBackup(`delete-${type}`);
    writeStoredList(key, filtered);
    location.reload();
  } catch (error) {
    alert(error.message || "削除に失敗しました。");
  }
}

function toggleTodoDone(id) {
  const todos = readStoredList("todos");
  const updated = todos.map(todo =>
    todo.id === id ? { ...todo, done: !todo.done, updatedAt: Date.now() } : todo
  );
  writeStoredList("todos", updated);
  location.reload();
}

// ISO文字列 → 表示形式 (yyyy/mm/dd hh:mm)
function formatDateTime(iso) {
  const d = new Date(iso);
  const parts = getDatePartsInAppTimezone(d.getTime());
  const yyyy = parts.year;
  const mm = pad2(parts.month);
  const dd = pad2(parts.day);
  const hh = pad2(parts.hour);
  const mi = pad2(parts.minute);
  return `${yyyy}/${mm}/${dd}${iso.length > 10 ? ` ${hh}:${mi}` : ''}`;
}

function formatDate(isoString) {
  const d = new Date(isoString);
  const parts = getDatePartsInAppTimezone(d.getTime());
  const y = parts.year;
  const m = pad2(parts.month);
  const day = pad2(parts.day);
  const hh = pad2(parts.hour);
  const mm = pad2(parts.minute);
  return isoString.length > 10 ? `${y}/${m}/${day} ${hh}:${mm}` : `${y}/${m}/${day}`;
}

function addEntryFromForm({ classId = null }) {
  const type = document.getElementById("entryType").value;
  const title = document.getElementById("entryTitle").value.trim();
  const date = document.getElementById("entryDate").value;
  const time = document.getElementById("entryTime").value;
  const memo = document.getElementById("entryMemo").value.trim();

  if (!title || !date) {
    alert("タイトルと日付は必須です。");
    return;
  }

  const id = Date.now();
  const timestamp = Date.now();
  const newItem = type === "todo"
    ? { id, type: "todo", classId, content: title, due: date, time, memo, done: false, createdAt: timestamp, updatedAt: timestamp }
    : { id, type: "event", classId, title, date, time, memo, createdAt: timestamp, updatedAt: timestamp };

  const key = type === "todo" ? "todos" : "events";
  const list = readStoredList(key);
  list.push(newItem);
  writeStoredList(key, list);
  location.reload();
}

// 編集モーダルのHTMLを共通で注入
function injectEditModal() {
  const modalHtml = `
    <div id="edit-modal" class="modal">
      <div class="modal-content">
        <h3>予定を編集</h3>
        <select id="editType">
          <option value="todo">ToDo</option>
          <option value="event">イベント</option>
        </select>
        <input type="text" id="editTitle" placeholder="タイトル">
        <input type="date" id="editDate">
        <input type="time" id="editTime">
        <textarea id="editMemo" placeholder="メモ（任意）"></textarea>
        <div class="modal-buttons">
          <button onclick="saveEditedEntry()">保存</button>
          <button onclick="closeEditModal()">キャンセル</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

let currentEditId = null;
let currentEditType = null;
let currentEditClassId = null;

function openEditModal(type, id) {
  const key = type === "todo" ? "todos" : "events";
  const list = readStoredList(key);
  const item = list.find(e => e.id === id);
  if (!item) return;

  document.getElementById("editType").value = type;
  document.getElementById("editTitle").value = type === "todo" ? item.content : item.title;
  document.getElementById("editDate").value = type === "todo" ? item.due : item.date;
  document.getElementById("editTime").value = item.time || "";
  document.getElementById("editMemo").value = item.memo || "";

  currentEditId = id;
  currentEditType = type;
  currentEditClassId = item.classId || null;

  document.getElementById("edit-modal").style.display = "flex";
}

function saveEditedEntry() {
  if (!confirm("この内容で保存しますか？")) return;
  const newType = document.getElementById("editType").value;
  const title = document.getElementById("editTitle").value.trim();
  const date = document.getElementById("editDate").value;
  const time = document.getElementById("editTime").value;
  const memo = document.getElementById("editMemo").value.trim();

  if (!title || !date) {
    alert("タイトルと日付は必須です。");
    return;
  }

  // 元のデータ削除
  const oldKey = currentEditType === "todo" ? "todos" : "events";
  let oldList = readStoredList(oldKey);
  const oldItem = oldList.find(e => e.id === currentEditId) || {};
  oldList = oldList.filter(e => e.id !== currentEditId);
  writeStoredList(oldKey, oldList);

  // 新しい型で追加（同じIDで）
  const newKey = newType === "todo" ? "todos" : "events";
  let newList = readStoredList(newKey);

  const updatedItem = (newType === "todo")
  ? {
      id: currentEditId,
      type: "todo",
      classId: currentEditClassId,
      content: title,
      due: date,
      time,
      memo,
      done: oldItem.done || false,
      createdAt: oldItem.createdAt || currentEditId,
      updatedAt: Date.now()
    }
  : {
      id: currentEditId,
      type: "event",
      classId: currentEditClassId,
      title,
      date,
      time,
      memo,
      createdAt: oldItem.createdAt || currentEditId,
      updatedAt: Date.now()
    };

  newList.push(updatedItem);
  writeStoredList(newKey, newList);

  closeEditModal();
  location.reload();
}

function closeEditModal() {
  document.getElementById("edit-modal").style.display = "none";
  currentEditId = null;
  currentEditType = null;
}

document.addEventListener("keydown", function(e) {
  const modal = document.getElementById("edit-modal");
  const active = document.activeElement;

  if (e.key === "Escape") {
    closeMenu();
  }

  if (
    modal?.style.display === "flex" &&
    active?.id === "editMemo" &&
    e.key === "Enter"
  ) {
    e.preventDefault();       // 改行を防ぐ
    active.blur();            // 入力終了（フォーカス解除）
  }
});

function getDateTime(dateStr, timeStr) {
  if (timeStr && timeStr.trim() !== "") {
    return new Date(`${dateStr}T${timeStr}${getTimezoneOffsetString()}`);
  } else {
    return new Date(`${dateStr}T23:59:59.999${getTimezoneOffsetString()}`);
  }
}

function removeExpiredEntries(todos, events) {
  const now = Date.now();

  const filteredTodos = todos.filter(t => {
    const dueTime = getDateTime(t.due, t.time).getTime();
    return dueTime >= now;
  });

  const filteredEvents = events.filter(e => {
    const evtTime = getDateTime(e.date, e.time).getTime();
    return evtTime >= now;
  });

  return { todos: filteredTodos, events: filteredEvents };
}

function cleanExpiredEntries() {
  const todoState = readStoredListState("todos");
  const eventState = readStoredListState("events");

  if (!todoState.ok || !eventState.ok) {
    const errors = [todoState, eventState].filter(state => !state.ok).map(state => state.error).join("\n");
    showStorageWarning(`${errors}\n期限切れ削除は実行せず、既存データを保護しました。`, "cleanup-corrupt");
    return {
      todos: todoState.ok ? todoState.list : [],
      events: eventState.ok ? eventState.list : []
    };
  }

  const cleaned = removeExpiredEntries(todoState.list, eventState.list);
  const removedCount =
    (todoState.list.length - cleaned.todos.length) +
    (eventState.list.length - cleaned.events.length);

  if (removedCount > 0) {
    try {
      createBackup("cleanup-expired");
      writeStoredList("todos", cleaned.todos);
      writeStoredList("events", cleaned.events);
    } catch (error) {
      console.warn(error);
      return {
        todos: todoState.list,
        events: eventState.list
      };
    }
  }

  return cleaned;
}

function formatEntryDate(dateStr, timeStr) {
  const d = getDateTime(dateStr, timeStr);
  const parts = getDatePartsInAppTimezone(d.getTime());
  const yyyy = parts.year;
  const mm = pad2(parts.month);
  const dd = pad2(parts.day);
  const hh = pad2(parts.hour);
  const mi = pad2(parts.minute);

  return (timeStr && timeStr.trim() !== "")
    ? `${yyyy}/${mm}/${dd} ${hh}:${mi}`
    : `${yyyy}/${mm}/${dd}`;
}

function initializeSettingsPanel() {
  const input = document.getElementById("timezoneOffset");
  const label = document.getElementById("timezoneCurrent");
  initializePeriodTimeSettings();
  renderBackupList();
  if (!input || !label) return;

  const offset = getSettings().timezoneOffsetMinutes;
  input.value = String(offset / 60);
  label.textContent = `現在: ${formatTimezoneOffset(offset)}`;
}

function initializePeriodTimeSettings() {
  const container = document.getElementById("periodTimeRows");
  const checkbox = document.getElementById("showPeriodTimes");
  if (!container || !checkbox) return;

  const settings = getSettings();
  checkbox.checked = settings.showPeriodTimes;
  container.replaceChildren();

  settings.periodTimes.forEach((time, index) => {
    const period = index + 1;
    const row = document.createElement("div");
    row.className = "period-time-row";

    const label = document.createElement("label");
    label.textContent = `${period}限`;
    label.setAttribute("for", `period${period}Start`);

    const start = document.createElement("input");
    start.type = "time";
    start.id = `period${period}Start`;
    start.value = time.start;

    const end = document.createElement("input");
    end.type = "time";
    end.id = `period${period}End`;
    end.value = time.end;

    row.appendChild(label);
    row.appendChild(start);
    row.appendChild(end);
    container.appendChild(row);
  });
}

function savePeriodTimeSettings() {
  const showPeriodTimes = document.getElementById("showPeriodTimes")?.checked === true;
  const periodTimes = [];

  for (let period = 1; period <= 6; period++) {
    const start = document.getElementById(`period${period}Start`)?.value || "";
    const end = document.getElementById(`period${period}End`)?.value || "";
    if (!isTimeValue(start) || !isTimeValue(end)) {
      alert("時刻の形式に誤りがあります。");
      return;
    }
    periodTimes.push({
      start: start || DEFAULT_PERIOD_TIMES[period - 1].start,
      end: end || DEFAULT_PERIOD_TIMES[period - 1].end
    });
  }

  writeSettings({
    showPeriodTimes,
    periodTimes
  });
  location.reload();
}

function saveTimezoneSetting() {
  const input = document.getElementById("timezoneOffset");
  if (!input) return;

  const hours = Number(input.value);
  if (!Number.isFinite(hours) || hours < -12 || hours > 14) {
    alert("UTCオフセットは -12 〜 +14 の範囲で入力してください。");
    return;
  }

  writeSettings({
    timezoneOffsetMinutes: Math.round(hours * 60)
  });
  location.reload();
}

function setSyncStatus(message) {
  const status = document.getElementById("syncStatus");
  if (status) {
    status.textContent = message;
  }
}

function setImportApplyEnabled(enabled) {
  const button = document.getElementById("syncApplyButton");
  if (!button) return;
  button.disabled = !enabled;
  button.hidden = !enabled;
}

function clearImportPreview() {
  pendingImportPlan = null;
  const preview = document.getElementById("syncPreview");
  if (preview) {
    preview.replaceChildren();
    preview.hidden = true;
  }
  setImportApplyEnabled(false);
}

function getStorageLabel(key) {
  return {
    classes: "教科",
    todos: "ToDo",
    events: "イベント"
  }[key] || key;
}

function renderStatLine(container, label, stats) {
  const row = document.createElement("p");
  row.className = "preview-line";
  const parts = [
    `${label}:`,
    `追加 ${stats.added}`,
    `更新 ${stats.updated}`,
    `変更なし ${stats.unchanged}`,
    `削除予定 ${stats.removed}`,
    `上書き対象 ${stats.overwritten}`,
    `スキップ ${stats.skipped}`,
    `適用後 ${stats.totalAfter}`
  ];
  row.textContent = parts.join(" / ");
  container.appendChild(row);
}

function renderImportPreview(plan) {
  const preview = document.getElementById("syncPreview");
  if (!preview) return;

  preview.replaceChildren();
  preview.hidden = false;

  const heading = document.createElement("strong");
  heading.textContent = plan.mode === "replace" ? "上書きプレビュー" : "統合プレビュー";
  preview.appendChild(heading);

  if (plan.warnings.length > 0) {
    const warning = document.createElement("p");
    warning.className = "preview-warning";
    warning.textContent = `注意: ${plan.warnings.join(" / ")} 取り込み時に現在データをバックアップしてから上書きします。`;
    preview.appendChild(warning);
  }

  STORAGE_KEYS.forEach(key => {
    renderStatLine(preview, getStorageLabel(key), plan.stats[key]);
  });
}

function previewSyncImport() {
  const input = document.getElementById("syncInput");
  const mode = document.getElementById("syncImportMode")?.value || "merge";
  if (!input?.value.trim()) {
    alert("同期コードまたはJSONを入力してください。");
    return;
  }

  try {
    pendingImportPlan = buildImportPlan(input.value, mode);
    renderImportPreview(pendingImportPlan);
    setImportApplyEnabled(true);
    setSyncStatus("プレビューを確認してから取り込みを実行してください。");
  } catch (error) {
    pendingImportPlan = null;
    setImportApplyEnabled(false);
    alert(error.message || "プレビュー作成に失敗しました。");
  }
}

function copySyncCode() {
  const output = document.getElementById("syncOutput");
  let code = "";
  try {
    code = encodeSyncPayload();
  } catch (error) {
    alert(error.message || "同期コードの作成に失敗しました。");
    return;
  }
  if (output) {
    output.value = code;
    output.focus();
    output.select();
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code)
      .then(() => setSyncStatus("同期コードをコピーしました。"))
      .catch(() => setSyncStatus("同期コードを作成しました。"));
  } else {
    setSyncStatus("同期コードを作成しました。");
  }
}

function exportSyncFile() {
  let payload;
  try {
    payload = getSyncPayload();
  } catch (error) {
    alert(error.message || "JSONの書き出しに失敗しました。");
    return;
  }
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = payload.exportedAt.replace(/[-:]/g, "").slice(0, 13);
  a.href = url;
  a.download = `mystudy-sync-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setSyncStatus("JSONを書き出しました。");
}

function importSyncText() {
  previewSyncImport();
}

function applySyncImport() {
  if (!pendingImportPlan) {
    alert("先にプレビューを作成してください。");
    return;
  }

  const modeText = pendingImportPlan.mode === "replace" ? "上書き" : "統合";
  if (!confirm(`${modeText}で取り込みますか？\n実行前に backup-* を作成します。`)) {
    return;
  }

  try {
    commitStorageState(pendingImportPlan.next, `import-${pendingImportPlan.mode}`);
    const result = {
      classes: pendingImportPlan.next.classes.length,
      todos: pendingImportPlan.next.todos.length,
      events: pendingImportPlan.next.events.length
    };
    setSyncStatus(`取り込みました: 教科${result.classes}件 / ToDo${result.todos}件 / イベント${result.events}件`);
    location.reload();
  } catch (error) {
    alert(error.message || "取り込みに失敗しました。");
  }
}

function importSyncFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const input = document.getElementById("syncInput");
    if (input) {
      input.value = String(reader.result || "");
    }
    previewSyncImport();
  };
  reader.readAsText(file);
  event.target.value = "";
}

function getBackupEntries() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) keys.push(key);
  }

  return keys
    .filter(key => key.startsWith(`${BACKUP_PREFIX}-`))
    .map(key => {
      try {
        const backup = JSON.parse(localStorage.getItem(key) || "{}");
        return { key, backup };
      } catch (error) {
        return null;
      }
    })
    .filter(entry => entry?.backup?.rawData && isPlainObject(entry.backup.rawData))
    .sort((a, b) => String(b.backup.createdAt || b.key).localeCompare(String(a.backup.createdAt || a.key)));
}

function renderBackupList() {
  const list = document.getElementById("backupList");
  if (!list) return;

  list.replaceChildren();
  const backups = getBackupEntries();
  if (backups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "バックアップはまだありません。";
    list.appendChild(empty);
    return;
  }

  backups.slice(0, 12).forEach(({ key, backup }) => {
    const item = document.createElement("div");
    item.className = "backup-item";

    const text = document.createElement("span");
    text.textContent = `${backup.createdAt || key} / ${backup.reason || "backup"}`;

    const button = document.createElement("button");
    button.textContent = "復元";
    button.onclick = () => restoreBackup(key);

    item.appendChild(text);
    item.appendChild(button);
    list.appendChild(item);
  });
}

function restoreBackup(key) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    alert("バックアップが見つかりません。");
    return;
  }

  let backup;
  try {
    backup = JSON.parse(raw);
  } catch (error) {
    alert("バックアップを読み取れません。");
    return;
  }

  if (!isPlainObject(backup.rawData)) {
    alert("復元できるバックアップではありません。");
    return;
  }

  if (!confirm("このバックアップを復元しますか？\n現在のデータも backup-before-restore-* として保存します。")) {
    return;
  }

  try {
    createBackup("before-restore");
    [SETTINGS_KEY, ...STORAGE_KEYS].forEach(storageKey => {
      const value = backup.rawData[storageKey];
      if (value === null || value === undefined) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, value);
      }
    });
    location.reload();
  } catch (error) {
    alert(error.message || "復元に失敗しました。");
  }
}
