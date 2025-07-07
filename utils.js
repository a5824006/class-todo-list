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
