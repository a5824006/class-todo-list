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

// ToDo・イベントの削除
function deleteEntry(type, id) {
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
