function normalizeWeekday(input) {
  const map = {
    "月": 1, "月曜": 1, "月曜日": 1,
    "火": 2, "火曜": 2, "火曜日": 2,
    "水": 3, "水曜": 3, "水曜日": 3,
    "木": 4, "木曜": 4, "木曜日": 4,
    "金": 5, "金曜": 5, "金曜日": 5
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
  const subject = prompt("教科名を入力してください：");
  if (!subject) return;

  const weekdayInput = prompt("曜日を入力してください（例: 月, 火曜, 水曜日）:");
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

  const roomInput = prompt("教室を入力してください（任意）：");
  if (roomInput === null) return;
  const room = roomInput.trim();

  const classId = `${subject.trim()}_${weekday}_${period}_${room || "none"}`;
  const classes = JSON.parse(localStorage.getItem("classes") || "[]");
  const exists = classes.some(c => c.id === classId);
  if (exists) {
    alert("同じ教科はすでに登録されています。");
    return;
  }

  classes.push({
    type: "class",
    subject,
    weekday,
    period,
    duration,
    room,
    id: classId
  });
  localStorage.setItem("classes", JSON.stringify(classes));
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
        <input type="number" id="classDuration" placeholder="連続数（通常1, 2なら2限連続）" min="1" max="2">
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
  document.getElementById("classWeekday").value = ['月','火','水','木','金'][classObj.weekday - 1] || "";
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
  const classes = JSON.parse(localStorage.getItem("classes") || "[]");

  // 重複チェック（別の教科で同じIDがある場合）
  if (newId !== currentClassIdForEdit && classes.some(c => c.id === newId)) {
    alert("同じ教科がすでに存在します。");
    closeClassEditModal();
    return;
  }

  // classIdを更新（ToDo・イベントも紐づけ直す）
  const updatedClass = { id: newId, subject, weekday, period, duration, room, type: "class" };
  const newClasses = classes.map(c => c.id === currentClassIdForEdit ? updatedClass : c);
  localStorage.setItem("classes", JSON.stringify(newClasses));

  // ToDo・イベントのclassIdを更新
  const updateRelated = (key) => {
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    const updated = list.map(e => e.classId === currentClassIdForEdit ? { ...e, classId: newId } : e);
    localStorage.setItem(key, JSON.stringify(updated));
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

function toggleMenu() {
  const menu = document.getElementById("dropdown-menu");
  menu.style.display = (menu.style.display === "flex") ? "none" : "flex";
}

// ToDo・イベントの登録（classId は null または指定ID）
function addEntry(classId = null) {
  const type = document.getElementById("entryType").value;
  const title = document.getElementById("entryTitle").value;
  const date = document.getElementById("entryDate").value;
  const time = document.getElementById("entryTime").value;
  const memo = document.getElementById("entryMemo").value;

  if (!title || !date) {
    alert("タイトルと日付は必須です。");
    return;
  }
  
  const id = Date.now();
  const newItem = type === "todo"
    ? { id, type: "todo", classId, content: title, due: date, time, memo, done: false }
    : { id, type: "event", classId, title, date, time, memo };

  const key = type === "todo" ? "todos" : "events";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  list.push(newItem);
  localStorage.setItem(key, JSON.stringify(list));
  location.reload();
}

// ToDo・イベントの削除（確認付き）
function deleteEntry(type, id) {
  if (!confirm("本当に削除しますか？")) return;
  const key = type === "todo" ? "todos" : "events";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  const filtered = list.filter(e => e.id !== id);
  localStorage.setItem(key, JSON.stringify(filtered));
  location.reload();
}

// ISO文字列 → 表示形式 (yyyy/mm/dd hh:mm)
function formatDateTime(iso) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}${iso.length > 10 ? ` ${hh}:${mi}` : ''}`;
}

function formatDate(isoString) {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return isoString.length > 10 ? `${y}/${m}/${day} ${hh}:${mm}` : `${y}/${m}/${day}`;
}

function addEntryFromForm({ classId = null }) {
  const type = document.getElementById("entryType").value;
  const title = document.getElementById("entryTitle").value;
  const date = document.getElementById("entryDate").value;
  const time = document.getElementById("entryTime").value;
  const memo = document.getElementById("entryMemo").value;

  const id = Date.now();
  const newItem = type === "todo"
    ? { id, type: "todo", classId, content: title, due: date, time, memo, done: false }
    : { id, type: "event", classId, title, date, time, memo };

  const key = type === "todo" ? "todos" : "events";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  list.push(newItem);
  localStorage.setItem(key, JSON.stringify(list));
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
  const list = JSON.parse(localStorage.getItem(key) || "[]");
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
  const title = document.getElementById("editTitle").value;
  const date = document.getElementById("editDate").value;
  const time = document.getElementById("editTime").value;
  const memo = document.getElementById("editMemo").value;

  if (!title || !date) {
    alert("タイトルと日付は必須です。");
    return;
  }

  // 今のページが subject.html かどうかを判定
  const isSubjectPage = window.location.pathname.includes("subject.html");

  // classId を取得（subject.html のみURLから取得）
  const urlParams = new URLSearchParams(window.location.search);
  const classId = isSubjectPage ? urlParams.get("classId") : null;

  // 元のデータ削除
  const oldKey = currentEditType === "todo" ? "todos" : "events";
  let oldList = JSON.parse(localStorage.getItem(oldKey) || "[]");
  oldList = oldList.filter(e => e.id !== currentEditId);
  localStorage.setItem(oldKey, JSON.stringify(oldList));

  // 新しい型で追加（同じIDで）
  const newKey = newType === "todo" ? "todos" : "events";
  let newList = JSON.parse(localStorage.getItem(newKey) || "[]");

  const updatedItem = (newType === "todo")
  ? { id: currentEditId, type: "todo", classId: currentEditClassId, content: title, due: date, time, memo, done: false }
  : { id: currentEditId, type: "event", classId: currentEditClassId, title, date, time, memo };

  newList.push(updatedItem);
  localStorage.setItem(newKey, JSON.stringify(newList));

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
  const time = timeStr && timeStr.trim() !== "" ? timeStr : "24:00";
  return new Date(`${dateStr}T${time}`);
}

function removeExpiredEntries(todos, events) {
  const now = new Date().getTime();
  const filteredTodos = todos.filter(t => getDateTime(t.due, t.time).getTime() >= now);
  const filteredEvents = events.filter(e => getDateTime(e.date, e.time).getTime() >= now);
  return { todos: filteredTodos, events: filteredEvents };
}

