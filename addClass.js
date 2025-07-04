// addClass.js

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
  const weekday = normalizeWeekday(weekdayInput);
  if (!weekday) {
    alert("正しい曜日を入力してください");
    return;
  }

  const periodInput = prompt("開始する時限を入力してください（1〜6）:");
  const period = normalizePeriod(periodInput);
  if (!period) {
    alert("正しい時限を1〜6の数字で入力してください。");
    return;
  }

  const durationInput = prompt("2限連続の場合は2を入力してください（それ以外は空欄でOKを押してください）：") || "1";
  const duration = (durationInput.trim() === "2") ? 2 : 1;

  const room = prompt("教室を入力してください（任意）：") || "";

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
