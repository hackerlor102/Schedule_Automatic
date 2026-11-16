/**
 * AutoShift Manager - Logic xếp ca tối ưu v2.0
 * Đáp ứng đầy đủ:
 * - Đăng ký 2 khung giờ rảnh trong cùng ngày (vd: 12-15h / b+), tự động chọn khung giờ tối ưu
 * - 2 Pha chế có thể đứng cùng nhau, nhưng Phục vụ KHÔNG BAO GIỜ đứng một mình hoặc 2 phục vụ không có pha chế
 * - Giới hạn tối đa 7 giờ/ca (ca A1, B2 được gọt về 7h tiêu chuẩn)
 * - Đảm bảo mỗi nhân viên từ 2 đến 6 ca/tuần
 * - Dữ liệu mẫu chuẩn xác theo yêu cầu
 */

const DAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"];

const STANDARD_SHIFTS = {
  "A":  { name: "Ca A",  start: 8.0,  end: 15.0, hours: 7.0, desc: "8:00AM ~ 15:00PM" },
  "B":  { name: "Ca B",  start: 15.0, end: 22.0, hours: 7.0, desc: "15:00PM ~ 22:00PM" },
  "A+": { name: "Ca A+", start: 8.0,  end: 12.0, hours: 4.0, desc: "8:00AM ~ 12:00PM" },
  "B+": { name: "Ca B+", start: 18.0, end: 22.0, hours: 4.0, desc: "18:00PM ~ 22:00PM" },
  "B1": { name: "Ca B1", start: 12.0, end: 18.0, hours: 6.0, desc: "12:00PM ~ 18:00PM" },
  "A1": { name: "Ca A1", start: 8.0,  end: 18.0, hours: 10.0, desc: "8:00AM ~ 18:00PM" },
  "B2": { name: "Ca B2", start: 12.0, end: 22.0, hours: 10.0, desc: "12:00PM ~ 22:00PM" },
};

// Dữ liệu mẫu chuẩn xác theo yêu cầu người dùng
const SAMPLE_BARISTAS = [
  { id: "b1", name: "Vy", role: "Pha chế", regs: ["8-11h30", "b+", "8-9h", "15-18h", "16-22h", "off", "b+"] },
  { id: "b2", name: "Ánh", role: "Pha chế", regs: ["B", "off", "off", "12-15h / b+", "6-9h", "b+", "a+"] },
  { id: "b3", name: "Mai", role: "Pha chế", regs: ["b1", "b1", "b1", "9-12h", "off", "off", "off"] },
  { id: "b4", name: "Đạt", role: "Pha chế", regs: ["off", "off", "9-15h", "12-15h / b+", "off", "a+", "b2"] },
  { id: "b5", name: "Phú", role: "Pha chế", regs: ["off", "a1", "b", "a+", "a1", "b1", "b1"] },
];

const SAMPLE_SERVERS = [
  { id: "s1", name: "Hương", role: "Phục vụ", regs: ["o", "o", "o", "a", "a+", "b+", "off"] },
  { id: "s2", name: "Huy", role: "Phục vụ", regs: ["o", "b+", "b+", "o", "b1", "o", "a"] },
  { id: "s3", name: "Phương", role: "Phục vụ", regs: ["b+", "8-11h30", "8-11h30", "o", "o", "o", "a+"] },
  { id: "s4", name: "Thư", role: "Phục vụ", regs: ["o", "o", "o", "o", "o", "o", "o"] },
  { id: "s5", name: "Mhuong", role: "Phục vụ", regs: ["o", "o", "o", "B", "b+", "b1", "o"] },
  { id: "s6", name: "Hảo", role: "Phục vụ", regs: ["a", "b1", "o", "o", "o", "a+", "off"] },
];

let baristas = JSON.parse(JSON.stringify(SAMPLE_BARISTAS));
let servers = JSON.parse(JSON.stringify(SAMPLE_SERVERS));

let dailyNeeds = DAYS.map(d => ({
  day: d,
  A: 2,
  B: 2,
  A_min_barista: 1,
  B_min_barista: 1
}));

let scheduleResults = null;

// ==========================================
// TIỆN ÍCH PHÂN TÍCH THỜI GIAN & CA LÀM
// ==========================================

function parseTimeStr(timeStr) {
  if (!timeStr) return null;
  const s = timeStr.trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?:[:h\.](\d{1,2})|h)?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mins = m[2] ? parseInt(m[2], 10) : 0;
  return h + mins / 60.0;
}

function formatTimeHours(val) {
  const h = Math.floor(val);
  const m = Math.round((val - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function parseSingleSlot(raw) {
  const clean = (raw || "").trim();
  const upper = clean.toUpperCase();
  if (!clean || ["O", "OFF", "NGHI", "NGHỈ", "X", "-", "NONE", "0"].includes(upper)) {
    return { type: "OFF", code: "OFF", hours: 0.0, raw: clean };
  }

  for (const [code, info] of Object.entries(STANDARD_SHIFTS)) {
    if (upper === code.toUpperCase()) {
      return {
        type: "STANDARD",
        code,
        start: info.start,
        end: info.end,
        hours: info.hours,
        desc: info.desc,
        raw: clean
      };
    }
  }

  const m = clean.match(/(\d{1,2}(?:[:h\.]\d{1,2}|h)?)\s*(?:~|-|đến|to)\s*(\d{1,2}(?:[:h\.]\d{1,2}|h)?)/i);
  if (m) {
    const st = parseTimeStr(m[1]);
    const en = parseTimeStr(m[2]);
    if (st !== null && en !== null && en > st) {
      const hours = en - st;
      return {
        type: "CUSTOM",
        code: `${formatTimeHours(st)}~${formatTimeHours(en)}`,
        start: st,
        end: en,
        hours,
        desc: `${formatTimeHours(st)} ~ ${formatTimeHours(en)}`,
        raw: clean
      };
    }
  }

  return { type: "UNKNOWN", code: clean, hours: 0.0, raw: clean };
}

// Phân tích chuỗi ca có thể chứa 2 khung giờ rảnh (cách nhau bởi / hoặc hoặc)
function parseRegistrationWithOptions(rawText) {
  if (!rawText) return [{ type: "OFF", code: "OFF", hours: 0.0, raw: "" }];
  const parts = rawText.split(/\s*(?:\/|hoặc|or)\s*/i).map(p => p.trim()).filter(Boolean);
  const slots = parts.map(p => parseSingleSlot(p));
  return slots.length > 0 ? slots : [{ type: "OFF", code: "OFF", hours: 0.0, raw: rawText }];
}

function canCoverTarget(regInfo, targetShift) {
  if (!regInfo || regInfo.type === "OFF" || regInfo.type === "UNKNOWN") {
    return { canCover: false, score: 0.0, hours: 0.0, st: 0.0, en: 0.0, label: "" };
  }

  const code = (regInfo.code || "").toUpperCase();
  const targetStart = targetShift === "A" ? 8.0 : 15.0;
  const targetEnd = targetShift === "A" ? 15.0 : 22.0;

  // Khớp ca chuẩn A hoặc B
  if (code === targetShift.toUpperCase()) {
    return { canCover: true, score: 10.0, hours: 7.0, st: targetStart, en: targetEnd, label: targetShift };
  }

  // Ca phụ tương thích
  if (targetShift === "A") {
    if (code === "A+") return { canCover: true, score: 8.0, hours: 4.0, st: 8.0, en: 12.0, label: "A+" };
    if (code === "A1") {
      // Giới hạn 7 tiếng theo quy tắc
      return { canCover: true, score: 9.0, hours: 7.0, st: 8.0, en: 15.0, label: "Ca A (7h)" };
    }
    if (code === "B1") {
      return { canCover: true, score: 6.0, hours: 3.0, st: 12.0, en: 15.0, label: "B1 (12h-15h)" };
    }
  } else if (targetShift === "B") {
    if (code === "B+") return { canCover: true, score: 8.0, hours: 4.0, st: 18.0, en: 22.0, label: "B+" };
    if (code === "B2") {
      // Giới hạn 7 tiếng theo quy tắc
      return { canCover: true, score: 9.0, hours: 7.0, st: 15.0, en: 22.0, label: "Ca B (7h)" };
    }
    if (code === "B1") {
      return { canCover: true, score: 6.0, hours: 3.0, st: 15.0, en: 18.0, label: "B1 (15h-18h)" };
    }
  }

  // Khung giờ tự do
  if (regInfo.type === "CUSTOM") {
    const st = regInfo.start;
    const en = regInfo.end;
    const ovSt = Math.max(st, targetStart);
    const ovEn = Math.min(en, targetEnd);
    if (ovEn > ovSt) {
      const ovH = ovEn - ovSt;
      const asgH = Math.min(ovH, 7.0);
      const score = 5.0 + (ovH / 7.0) * 4.0;
      const lbl = `${formatTimeHours(st)}~${formatTimeHours(en)}`;
      return { canCover: true, score, hours: asgH, st: ovSt, en: ovEn, label: lbl };
    }
  }

  return { canCover: false, score: 0.0, hours: 0.0, st: 0.0, en: 0.0, label: "" };
}

// ==========================================
// THUẬT TOÁN TỐI ƯU HÓA XẾP CA (2 STREAMS)
// ==========================================

function executeSchedule(baristaList, serverList, needs) {
  const employees = [
    ...baristaList.map(e => ({
      ...e,
      role: "Pha chế",
      parsedOptions: e.regs.map(r => parseRegistrationWithOptions(r))
    })),
    ...serverList.map(e => ({
      ...e,
      role: "Phục vụ",
      parsedOptions: e.regs.map(r => parseRegistrationWithOptions(r))
    }))
  ];

  employees.forEach(emp => {
    emp.assigned = Array(7).fill(null);
    emp.totalShifts = 0;
    emp.totalHours = 0;
  });

  const warnings = [];
  const dailyDetails = [];

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayName = DAYS[dayIdx];
    const need = needs[dayIdx] || { A: 2, B: 2 };
    const reqA = need.A !== undefined ? need.A : 2;
    const reqB = need.B !== undefined ? need.B : 2;

    // 1. Thu thập tất cả các lựa chọn ca cho từng nhân viên hôm nay
    const empOptions = [];
    employees.forEach(emp => {
      if (emp.totalShifts >= 6) {
        empOptions.push([{ type: "OFF", code: "OFF" }]);
      } else {
        const opts = (emp.parsedOptions[dayIdx] || []).filter(o => o.type !== "OFF");
        empOptions.push(opts.length > 0 ? opts : [{ type: "OFF", code: "OFF" }]);
      }
    });

    // Tạo tổ hợp các lựa chọn (Cartesian product)
    function getCombinations(arr) {
      if (arr.length === 0) return [[]];
      const head = arr[0];
      const tail = getCombinations(arr.slice(1));
      const res = [];
      for (const h of head) {
        for (const t of tail) {
          res.push([h, ...t]);
        }
      }
      return res;
    }

    const allCombos = getCombinations(empOptions);

    let bestDayScore = -Infinity;
    let bestDayAsg = null;

    // Đánh giá từng tổ hợp lựa chọn khung giờ rảnh
    for (const combo of allCombos) {
      const canA = [];
      const canB = [];

      combo.forEach((reg, i) => {
        if (reg.type === "OFF") return;
        const emp = employees[i];
        const covA = canCoverTarget(reg, "A");
        const covB = canCoverTarget(reg, "B");

        if (covA.canCover) {
          canA.push({
            empIdx: i,
            emp,
            score: covA.score,
            hours: covA.hours,
            st: covA.st,
            en: covA.en,
            label: covA.label,
            origReg: reg,
            hasDual: (emp.parsedOptions[dayIdx] || []).length > 1
          });
        }
        if (covB.canCover) {
          canB.push({
            empIdx: i,
            emp,
            score: covB.score,
            hours: covB.hours,
            st: covB.st,
            en: covB.en,
            label: covB.label,
            origReg: reg,
            hasDual: (emp.parsedOptions[dayIdx] || []).length > 1
          });
        }
      });

      // Sắp xếp ưu tiên: ai chưa đủ 2 ca ưu tiên trước, người ít ca hơn ưu tiên trước
      function candSortKey(a, b) {
        const aUnder = a.emp.totalShifts < 2 ? 0 : 1;
        const bUnder = b.emp.totalShifts < 2 ? 0 : 1;
        if (aUnder !== bUnder) return aUnder - bUnder;
        if (a.emp.totalShifts !== b.emp.totalShifts) return a.emp.totalShifts - b.emp.totalShifts;
        return b.score - a.score;
      }

      canA.sort(candSortKey);
      canB.sort(candSortKey);

      // Phân chia theo 2 luồng (Stream 1: Barista bắt buộc, Stream 2: Phục vụ ưu tiên hoặc Barista dự phòng)
      function buildShiftAssignment(candidates, shiftStart, shiftEnd, reqMax) {
        const assigned = [];
        const dur = shiftEnd - shiftStart;
        const barHours = Array(dur).fill(0);
        const totalHours = Array(dur).fill(0);

        // Luồng 1: Xếp Pha chế lấp đầy giờ làm của quầy Bar
        const barCands = candidates.filter(c => c.emp.role === "Pha chế");
        for (const c of barCands) {
          const stRel = Math.max(0, Math.floor(c.st - shiftStart));
          const enRel = Math.min(dur, Math.ceil(c.en - shiftStart));
          let needsBarista = false;
          for (let h = stRel; h < enRel; h++) {
            if (barHours[h] === 0) { needsBarista = true; break; }
          }
          if (needsBarista) {
            assigned.push(c);
            for (let h = stRel; h < enRel; h++) {
              barHours[h]++;
              totalHours[h]++;
            }
          }
        }

        // Luồng 2: Ưu tiên xếp Phục vụ đi cùng với Pha chế (TUYỆT ĐỐI không đi một mình)
        const srvCands = candidates.filter(c => c.emp.role === "Phục vụ" && !assigned.some(x => x.empIdx === c.empIdx));
        for (const c of srvCands) {
          const stRel = Math.max(0, Math.floor(c.st - shiftStart));
          const enRel = Math.min(dur, Math.ceil(c.en - shiftStart));
          let canAdd = true;
          for (let h = stRel; h < enRel; h++) {
            // RÀNG BUỘC SỐNG CÒN: Phục vụ chỉ được đứng khi có Pha chế và chưa quá số người yêu cầu
            if (barHours[h] === 0 || totalHours[h] >= reqMax) {
              canAdd = false;
              break;
            }
          }
          if (canAdd) {
            assigned.push(c);
            for (let h = stRel; h < enRel; h++) {
              totalHours[h]++;
            }
          }
        }

        // Luồng 3: Nếu vẫn còn vị trí trống và không có Phục vụ, cho phép 2 Pha chế đứng cùng nhau
        if (reqMax > 1) {
          const remBar = barCands.filter(c => !assigned.some(x => x.empIdx === c.empIdx));
          for (const c of remBar) {
            const stRel = Math.max(0, Math.floor(c.st - shiftStart));
            const enRel = Math.min(dur, Math.ceil(c.en - shiftStart));
            let canAdd = false;
            for (let h = stRel; h < enRel; h++) {
              if (totalHours[h] < reqMax) { canAdd = true; break; }
            }
            if (canAdd) {
              assigned.push(c);
              for (let h = stRel; h < enRel; h++) {
                if (totalHours[h] < reqMax) {
                  barHours[h]++;
                  totalHours[h]++;
                }
              }
            }
          }
        }

        return { assigned, barHours, totalHours };
      }

      // Xếp Ca A và Ca B cho tổ hợp hiện tại
      const resA = buildShiftAssignment(canA, 8, 15, reqA);
      const usedEmpIndices = new Set(resA.assigned.map(c => c.empIdx));
      const availForB = canB.filter(c => !usedEmpIndices.has(c.empIdx));
      const resB = buildShiftAssignment(availForB, 15, 22, reqB);

      // Tính điểm chất lượng tổ hợp
      let score = 0;
      score += resA.totalHours.reduce((a, b) => a + b, 0) * 15;
      score += resB.totalHours.reduce((a, b) => a + b, 0) * 15;
      score += resA.barHours.filter(h => h > 0).length * 20;
      score += resB.barHours.filter(h => h > 0).length * 20;

      for (const c of [...resA.assigned, ...resB.assigned]) {
        if (c.hours < 2.0) score -= 80;
        else if (c.hours <= 7.0) score += 25;
        if (c.emp.totalShifts < 2) score += 250;
        else if (c.emp.totalShifts >= 5) score -= 100;
      }

      if (score > bestDayScore) {
        bestDayScore = score;
        bestDayAsg = { asgA: resA.assigned, asgB: resB.assigned };
      }
    }

    // 2. Lưu kết quả ngày tốt nhất
    const dayDetail = { day: dayName, shifts: { A: [], B: [] } };
    if (bestDayAsg) {
      const { asgA, asgB } = bestDayAsg;

      // Áp dụng Ca A
      for (const c of asgA) {
        const emp = c.emp;
        const isSub = (emp.role === "Pha chế" && asgA.length > 1 && asgA.filter(x => x.emp.role === "Pha chế").length > 1);
        emp.assigned[dayIdx] = {
          shift: "A",
          label: c.label,
          hours: c.hours,
          actingRole: emp.role,
          hasDual: c.hasDual,
          origRaw: c.origReg.raw,
          isSub
        };
        emp.totalShifts += 1;
        emp.totalHours += c.hours;
        dayDetail.shifts.A.push({
          name: emp.name,
          role: emp.role,
          label: c.label,
          hours: c.hours,
          isSub
        });
      }

      // Áp dụng Ca B
      for (const c of asgB) {
        const emp = c.emp;
        const isSub = (emp.role === "Pha chế" && asgB.length > 1 && asgB.filter(x => x.emp.role === "Pha chế").length > 1);
        emp.assigned[dayIdx] = {
          shift: "B",
          label: c.label,
          hours: c.hours,
          actingRole: emp.role,
          hasDual: c.hasDual,
          origRaw: c.origReg.raw,
          isSub
        };
        emp.totalShifts += 1;
        emp.totalHours += c.hours;
        dayDetail.shifts.B.push({
          name: emp.name,
          role: emp.role,
          label: c.label,
          hours: c.hours,
          isSub
        });
      }

      // Cảnh báo thiếu ca/thiếu người trong ngày
      [
        { type: "A", list: asgA, req: reqA, st: 8, en: 15, name: "Ca A (08:00~15:00)" },
        { type: "B", list: asgB, req: reqB, st: 15, en: 22, name: "Ca B (15:00~22:00)" }
      ].forEach(sh => {
        const barCount = sh.list.filter(x => x.emp.role === "Pha chế").length;
        if (barCount === 0) {
          warnings.push({
            level: "danger",
            icon: "fa-triangle-exclamation",
            message: `${dayName} - ${sh.name}: Thiếu Pha chế (Phục vụ không thể làm thay Pha chế)!`
          });
        } else if (sh.list.length < sh.req) {
          warnings.push({
            level: "warning",
            icon: "fa-circle-xmark",
            message: `${dayName} - ${sh.name}: Thiếu ${sh.req - sh.list.length} người (Yêu cầu ${sh.req}, hiện có ${sh.list.length})!`
          });
        }

        // Cảnh báo từng khung giờ khuyết vị trí Pha chế
        for (let h = sh.st; h < sh.en; h++) {
          const bAtH = sh.list.filter(x => x.emp.role === "Pha chế" && x.st <= h && h < x.en).length;
          if (bAtH === 0) {
            warnings.push({
              level: "info",
              icon: "fa-clock",
              message: `${dayName} - ${sh.name}: Khung giờ ${formatTimeHours(h)}~${formatTimeHours(h+1)} thiếu vị trí Pha chế!`
            });
          }
        }
      });
    }

    dailyDetails.push(dayDetail);
  }

  // 3. Kiểm tra giới hạn số ca tuần (2 - 6 ca)
  employees.forEach(emp => {
    const activeDays = emp.parsedOptions.filter(o => o.some(s => s.type !== "OFF")).length;
    if (emp.totalShifts < 2 && activeDays >= 2) {
      warnings.push({
        level: "warning",
        icon: "fa-triangle-exclamation",
        message: `Nhân viên ${emp.name} (${emp.role}): Chỉ được xếp ${emp.totalShifts} ca (Quy định tối thiểu 2 ca/tuần)!`
      });
    } else if (emp.totalShifts < 2 && activeDays < 2) {
      warnings.push({
        level: "info",
        icon: "fa-circle-info",
        message: `Nhân viên ${emp.name} (${emp.role}): Chỉ đăng ký ${activeDays} ngày rảnh nên không đủ tối thiểu 2 ca/tuần.`
      });
    } else if (emp.totalShifts > 6) {
      warnings.push({
        level: "danger",
        icon: "fa-ban",
        message: `Nhân viên ${emp.name} (${emp.role}): Bị xếp ${emp.totalShifts} ca (Vượt quá tối đa 6 ca/tuần)!`
      });
    }
  });

  return { employees, warnings, dailyDetails };
}

// ==========================================
// RENDER GIAO DIỆN
// ==========================================

function getBadgeHtml(asg) {
  if (!asg || !asg.label || asg.label.toUpperCase() === "OFF") {
    return `<span class="badge-shift badge-off">OFF</span>`;
  }
  const lbl = asg.label.trim();
  const upper = lbl.toUpperCase();
  let cls = "badge-custom";
  if (upper === "A" || upper.startsWith("CA A")) cls = "badge-a";
  else if (upper === "B" || upper.startsWith("CA B")) cls = "badge-b";
  else if (upper.includes("A+")) cls = "badge-aplus";
  else if (upper.includes("B+")) cls = "badge-bplus";
  else if (upper.includes("B1")) cls = "badge-b1";
  else if (upper.includes("A1")) cls = "badge-a1";
  else if (upper.includes("B2")) cls = "badge-b2";

  const subMark = asg.isSub ? `<span class="text-amber-600 font-black ml-0.5" title="2 Pha chế cùng đứng ca">*</span>` : "";
  const dualIndicator = asg.hasDual ? `<span class="text-indigo-600 font-bold ml-1 text-[10px]" title="Được chọn tối ưu từ 2 khung giờ rảnh: ${asg.origRaw}">✓</span>` : "";

  return `<span class="badge-shift ${cls}" title="${asg.hasDual ? 'Chọn tối ưu từ: ' + asg.origRaw : lbl}">${lbl}${subMark}${dualIndicator}</span>`;
}

function renderDailyNeeds() {
  const container = document.getElementById("dailyNeedsContainer");
  if (!container) return;

  container.innerHTML = dailyNeeds.map((d, idx) => `
    <div class="day-need-card bg-slate-50/80 rounded-xl p-3 border border-slate-200 text-xs">
      <div class="font-bold text-slate-800 text-sm mb-2 flex items-center justify-between pb-1.5 border-b border-slate-200">
        <span>${d.day}</span>
        <span class="text-[11px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">
          Tổng: ${(d.A || 2) + (d.B || 2)} người
        </span>
      </div>
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-slate-600 font-medium">Ca A (8h-15h):</label>
          <input type="number" min="0" max="10" value="${d.A || 2}"
            class="w-14 px-2 py-1 text-center font-bold bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500"
            onchange="updateDailyNeed(${idx}, 'A', this.value)">
        </div>
        <div class="flex items-center justify-between">
          <label class="text-slate-600 font-medium">Ca B (15h-22h):</label>
          <input type="number" min="0" max="10" value="${d.B || 2}"
            class="w-14 px-2 py-1 text-center font-bold bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500"
            onchange="updateDailyNeed(${idx}, 'B', this.value)">
        </div>
      </div>
    </div>
  `).join("");
}

function updateDailyNeed(idx, shift, value) {
  const val = parseInt(value, 10);
  dailyNeeds[idx][shift] = isNaN(val) || val < 0 ? 0 : val;
  renderDailyNeeds();
}

function renderInputTables() {
  document.getElementById("countBarista").textContent = `${baristas.length} người`;
  document.getElementById("countServer").textContent = `${servers.length} người`;

  // Render Baristas
  const tbodyB = document.getElementById("tbodyBarista");
  if (tbodyB) {
    if (baristas.length === 0) {
      tbodyB.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-slate-400 italic">Chưa có nhân viên pha chế nào. Nhấn "+ Thêm Pha chế" để bắt đầu.</td></tr>`;
    } else {
      tbodyB.innerHTML = baristas.map((emp, empIdx) => `
        <tr class="hover:bg-amber-50/40 transition">
          <td class="p-2 text-left font-medium">
            <input type="text" value="${emp.name}" 
              class="w-full px-2 py-1 font-semibold text-slate-800 bg-transparent border border-transparent hover:border-slate-300 focus:border-amber-500 focus:bg-white rounded transition"
              onchange="updateEmployeeName('barista', ${empIdx}, this.value)">
          </td>
          ${DAYS.map((_, dayIdx) => `
            <td class="p-1.5 text-center">
              <input type="text" value="${emp.regs[dayIdx] || 'off'}" 
                class="w-20 sm:w-24 px-1 py-1 text-center font-bold text-slate-700 bg-slate-50 border border-slate-200 hover:border-amber-400 focus:border-amber-500 focus:bg-white rounded text-xs transition"
                placeholder="off"
                title="Có thể nhập 2 khung giờ rảnh, vd: 12-15h / b+"
                onchange="updateEmployeeReg('barista', ${empIdx}, ${dayIdx}, this.value)">
            </td>
          `).join("")}
          <td class="p-2 text-center">
            <button class="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded transition" 
              onclick="removeEmployee('barista', ${empIdx})" title="Xóa nhân viên">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `).join("");
    }
  }

  // Render Servers
  const tbodyS = document.getElementById("tbodyServer");
  if (tbodyS) {
    if (servers.length === 0) {
      tbodyS.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-slate-400 italic">Chưa có nhân viên phục vụ nào. Nhấn "+ Thêm Phục vụ" để bắt đầu.</td></tr>`;
    } else {
      tbodyS.innerHTML = servers.map((emp, empIdx) => `
        <tr class="hover:bg-sky-50/40 transition">
          <td class="p-2 text-left font-medium">
            <input type="text" value="${emp.name}" 
              class="w-full px-2 py-1 font-semibold text-slate-800 bg-transparent border border-transparent hover:border-slate-300 focus:border-sky-500 focus:bg-white rounded transition"
              onchange="updateEmployeeName('server', ${empIdx}, this.value)">
          </td>
          ${DAYS.map((_, dayIdx) => `
            <td class="p-1.5 text-center">
              <input type="text" value="${emp.regs[dayIdx] || 'off'}" 
                class="w-20 sm:w-24 px-1 py-1 text-center font-bold text-slate-700 bg-slate-50 border border-slate-200 hover:border-sky-400 focus:border-sky-500 focus:bg-white rounded text-xs transition"
                placeholder="off"
                title="Có thể nhập 2 khung giờ rảnh, vd: a / b"
                onchange="updateEmployeeReg('server', ${empIdx}, ${dayIdx}, this.value)">
            </td>
          `).join("")}
          <td class="p-2 text-center">
            <button class="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded transition" 
              onclick="removeEmployee('server', ${empIdx})" title="Xóa nhân viên">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `).join("");
    }
  }
}

function updateEmployeeName(type, empIdx, newName) {
  const list = type === 'barista' ? baristas : servers;
  if (list[empIdx]) {
    list[empIdx].name = newName.trim() || `${type === 'barista' ? 'Pha chế' : 'Phục vụ'} ${empIdx + 1}`;
  }
}

function updateEmployeeReg(type, empIdx, dayIdx, newVal) {
  const list = type === 'barista' ? baristas : servers;
  if (list[empIdx]) {
    list[empIdx].regs[dayIdx] = newVal.trim() || 'off';
  }
}

function removeEmployee(type, empIdx) {
  if (confirm("Bạn có chắc muốn xóa nhân viên này?")) {
    if (type === 'barista') baristas.splice(empIdx, 1);
    else servers.splice(empIdx, 1);
    renderInputTables();
  }
}

function addEmployee(type) {
  const isB = type === 'barista';
  const newEmp = {
    id: `${isB ? 'b' : 's'}_${Date.now()}`,
    name: `${isB ? 'Pha chế' : 'Phục vụ'} ${(isB ? baristas.length : servers.length) + 1}`,
    role: isB ? "Pha chế" : "Phục vụ",
    regs: ["A", "B", "A", "B", "A", "off", "off"]
  };
  if (isB) baristas.push(newEmp);
  else servers.push(newEmp);
  renderInputTables();
}

// ==========================================
// RENDER KẾT QUẢ XẾP CA (OUTPUT)
// ==========================================

function renderResults(results) {
  scheduleResults = results;
  const tbodyResult = document.getElementById("tbodyResult");
  const warningsList = document.getElementById("warningsList");
  const warningBadgeCount = document.getElementById("warningBadgeCount");
  const dailyContainer = document.getElementById("dailyBreakdownContainer");

  // 1. Render Warnings List
  const warns = results.warnings;
  warningBadgeCount.textContent = `${warns.length} thông báo`;
  if (warns.length === 0) {
    warningsList.innerHTML = `
      <div class="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-3">
        <i class="fa-solid fa-circle-check text-emerald-600 text-lg"></i>
        <div>
          <span class="font-bold block">Xếp ca hoàn hảo!</span>
          <span class="text-xs text-emerald-700">Tất cả các ca đều đủ người, quầy pha chế luôn có người phụ trách, phục vụ luôn được ghép cặp với pha chế.</span>
        </div>
      </div>
    `;
    warningBadgeCount.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800";
  } else {
    warningBadgeCount.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800";
    warningsList.innerHTML = warns.map(w => {
      let bgCls = "bg-amber-50 border-amber-200 text-amber-900";
      let iconColor = "text-amber-600";
      if (w.level === "danger") {
        bgCls = "bg-rose-50 border-rose-200 text-rose-900";
        iconColor = "text-rose-600";
      } else if (w.level === "info") {
        bgCls = "bg-sky-50 border-sky-200 text-sky-900";
        iconColor = "text-sky-600";
      }
      return `
        <div class="p-2.5 rounded-xl border ${bgCls} flex items-start gap-2.5 transition">
          <i class="fa-solid ${w.icon || 'fa-triangle-exclamation'} ${iconColor} mt-0.5 text-sm"></i>
          <span class="font-medium">${w.message}</span>
        </div>
      `;
    }).join("");
  }

  // 2. Render Main Timetable
  const emps = results.employees;
  const baristasRes = emps.filter(e => e.role === "Pha chế");
  const serversRes = emps.filter(e => e.role === "Phục vụ");

  let htmlRows = "";

  // Nhóm Pha Chế
  if (baristasRes.length > 0) {
    htmlRows += `
      <tr class="bg-amber-50/80 font-bold text-amber-900 text-xs text-left">
        <td colspan="11" class="p-2.5 pl-4 border-y border-amber-200">
          <i class="fa-solid fa-mug-hot mr-1.5 text-amber-700"></i> NHÓM PHA CHẾ (${baristasRes.length} người)
        </td>
      </tr>
    `;
    baristasRes.forEach(emp => {
      htmlRows += renderResultRow(emp);
    });
  }

  // Nhóm Phục Vụ
  if (serversRes.length > 0) {
    htmlRows += `
      <tr class="bg-sky-50/80 font-bold text-sky-900 text-xs text-left">
        <td colspan="11" class="p-2.5 pl-4 border-y border-sky-200">
          <i class="fa-solid fa-bell-concierge mr-1.5 text-sky-700"></i> NHÓM PHỤC VỤ (${serversRes.length} người)
        </td>
      </tr>
    `;
    serversRes.forEach(emp => {
      htmlRows += renderResultRow(emp);
    });
  }

  tbodyResult.innerHTML = htmlRows;

  // 3. Render Daily Breakdown
  if (dailyContainer) {
    dailyContainer.innerHTML = results.dailyDetails.map(d => {
      const aStaff = d.shifts.A || [];
      const bStaff = d.shifts.B || [];
      return `
        <div class="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200 text-xs space-y-3">
          <div class="font-bold text-slate-800 text-sm flex items-center justify-between pb-1.5 border-b border-slate-200">
            <span>${d.day}</span>
            <span class="text-xs bg-slate-200 px-2 py-0.5 rounded-full text-slate-700">${aStaff.length + bStaff.length} người</span>
          </div>

          <!-- Ca A -->
          <div>
            <div class="font-semibold text-amber-800 mb-1 flex items-center justify-between">
              <span><i class="fa-solid fa-sun mr-1"></i> Ca A (08:00 - 15:00)</span>
              <span class="text-[11px] font-bold">${aStaff.length} người</span>
            </div>
            <div class="space-y-1">
              ${aStaff.length === 0 ? '<div class="text-rose-500 italic">Không có người</div>' : aStaff.map(s => `
                <div class="bg-white p-1.5 rounded-lg border border-slate-200 flex items-center justify-between">
                  <span class="font-medium text-slate-800">${s.name} (${s.role})</span>
                  <span class="text-[11px] text-slate-500 font-semibold">${s.label}${s.isSub ? ' *' : ''}</span>
                </div>
              `).join("")}
            </div>
          </div>

          <!-- Ca B -->
          <div>
            <div class="font-semibold text-purple-800 mb-1 flex items-center justify-between">
              <span><i class="fa-solid fa-moon mr-1"></i> Ca B (15:00 - 22:00)</span>
              <span class="text-[11px] font-bold">${bStaff.length} người</span>
            </div>
            <div class="space-y-1">
              ${bStaff.length === 0 ? '<div class="text-rose-500 italic">Không có người</div>' : bStaff.map(s => `
                <div class="bg-white p-1.5 rounded-lg border border-slate-200 flex items-center justify-between">
                  <span class="font-medium text-slate-800">${s.name} (${s.role})</span>
                  <span class="text-[11px] text-slate-500 font-semibold">${s.label}${s.isSub ? ' *' : ''}</span>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      `;
    }).join("");
  }
}

function renderResultRow(emp) {
  let shiftCountBadge = `<span class="px-2 py-0.5 rounded-md font-bold text-xs bg-emerald-100 text-emerald-800">${emp.totalShifts} ca</span>`;
  if (emp.totalShifts < 2) {
    shiftCountBadge = `<span class="px-2 py-0.5 rounded-md font-bold text-xs bg-rose-100 text-rose-800" title="Chưa đủ 2 ca/tuần">${emp.totalShifts} ca ⚠️</span>`;
  } else if (emp.totalShifts > 6) {
    shiftCountBadge = `<span class="px-2 py-0.5 rounded-md font-bold text-xs bg-rose-100 text-rose-800" title="Vượt quá 6 ca/tuần">${emp.totalShifts} ca ⚠️</span>`;
  }

  return `
    <tr class="hover:bg-slate-50 transition border-b border-slate-100">
      <td class="p-3 text-left font-bold text-slate-800 sticky left-0 bg-white z-10 shadow-xs">${emp.name}</td>
      <td class="p-3 text-slate-500 font-medium text-xs">
        <span class="px-2 py-0.5 rounded ${emp.role === 'Pha chế' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'} font-semibold">
          ${emp.role}
        </span>
      </td>
      ${DAYS.map((_, dayIdx) => {
        const asg = emp.assigned[dayIdx];
        return `<td class="p-2">${getBadgeHtml(asg)}</td>`;
      }).join("")}
      <td class="p-3 font-semibold">${shiftCountBadge}</td>
      <td class="p-3 text-slate-700 font-bold text-xs">${emp.totalHours.toFixed(1)}h</td>
    </tr>
  `;
}

// ==========================================
// XỬ LÝ NHẬP VĂN BẢN HÀNG LOẠT (BATCH IMPORT)
// ==========================================

function parseBatchText(text) {
  const lines = text.split("\n");
  let currentGroup = "barista";
  const newBaristas = [];
  const newServers = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const lower = line.toLowerCase();
    if (lower.includes("[pha chế]") || lower.includes("[barista]") || lower.includes("pha chế:")) {
      currentGroup = "barista";
      continue;
    }
    if (lower.includes("[phục vụ]") || lower.includes("[server]") || lower.includes("phục vụ:")) {
      currentGroup = "server";
      continue;
    }

    let name = "";
    let regPart = "";
    if (line.includes(":") || line.includes("-")) {
      const parts = line.split(/[:\-]/);
      name = parts[0].trim();
      regPart = parts.slice(1).join("-").trim();
    } else {
      const parts = line.split(/\s+/);
      name = parts[0].trim();
      regPart = parts.slice(1).join(" ").trim();
    }

    // Tách 7 ca bằng dấu phẩy
    const regs = regPart.split(/,/).map(r => r.trim()).filter(Boolean);
    const finalRegs = Array(7).fill("off");
    regs.forEach((r, idx) => {
      if (idx < 7) finalRegs[idx] = r.trim();
    });

    const empObj = {
      id: `${currentGroup}_${Date.now()}_${Math.random()}`,
      name: name || `Nhân viên ${currentGroup === 'barista' ? newBaristas.length + 1 : newServers.length + 1}`,
      role: currentGroup === "barista" ? "Pha chế" : "Phục vụ",
      regs: finalRegs
    };

    if (currentGroup === "barista") {
      newBaristas.push(empObj);
    } else {
      newServers.push(empObj);
    }
  }

  return { newBaristas, newServers };
}

// ==========================================
// XUẤT FILE EXCEL (.XLSX)
// ==========================================

function exportToExcel() {
  if (!scheduleResults) {
    alert("Vui lòng nhấn 'SẮP XẾP CA TỰ ĐỘNG' trước khi xuất Excel.");
    return;
  }

  const wb = XLSX.utils.book_new();

  const mainData = [
    ["HỆ THỐNG PHÂN CHIA CA LÀM VIỆC TRONG TUẦN"],
    ["Quy định: Ca A (8:00~15:00), Ca B (15:00~22:00) | Tối thiểu 2 ca, tối đa 6 ca/tuần | Giới hạn 7h/ca"],
    [],
    ["Họ và Tên", "Vai trò", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật", "Tổng ca", "Tổng giờ làm"]
  ];

  scheduleResults.employees.forEach(emp => {
    const row = [
      emp.name,
      emp.role,
      ...DAYS.map((_, i) => {
        const asg = emp.assigned[i];
        if (!asg) return "OFF";
        return asg.label + (asg.isSub ? " (*)" : "") + (asg.hasDual ? " [tối ưu]" : "");
      }),
      emp.totalShifts,
      `${emp.totalHours.toFixed(1)}h`
    ];
    mainData.push(row);
  });

  mainData.push([]);
  mainData.push(["Ghi chú: (*) 2 Pha chế cùng đứng ca | [tối ưu] Được tự động chọn từ 2 khung giờ rảnh."]);

  if (scheduleResults.warnings && scheduleResults.warnings.length > 0) {
    mainData.push([]);
    mainData.push(["DANH SÁCH CA CÒN THIẾU & CẢNH BÁO:"]);
    scheduleResults.warnings.forEach(w => {
      mainData.push([w.message]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(mainData);
  XLSX.utils.book_append_sheet(wb, ws, "Lịch Làm Việc");
  XLSX.writeFile(wb, "Bang_Phan_Ca_Tuan.xlsx");
}

// ==========================================
// KHỞI TẠO SỰ KIỆN GIAO DIỆN
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  renderDailyNeeds();
  renderInputTables();

  const initialRes = executeSchedule(baristas, servers, dailyNeeds);
  renderResults(initialRes);

  document.getElementById("btnRunSchedule").addEventListener("click", () => {
    const res = executeSchedule(baristas, servers, dailyNeeds);
    renderResults(res);
    document.getElementById("resultsSection").scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("btnAddBarista").addEventListener("click", () => addEmployee('barista'));
  document.getElementById("btnAddServer").addEventListener("click", () => addEmployee('server'));

  document.getElementById("btnLoadSample").addEventListener("click", () => {
    baristas = JSON.parse(JSON.stringify(SAMPLE_BARISTAS));
    servers = JSON.parse(JSON.stringify(SAMPLE_SERVERS));
    dailyNeeds = DAYS.map(d => ({ day: d, A: 2, B: 2, A_min_barista: 1, B_min_barista: 1 }));
    renderDailyNeeds();
    renderInputTables();
    const res = executeSchedule(baristas, servers, dailyNeeds);
    renderResults(res);
  });

  document.getElementById("btnClearAll").addEventListener("click", () => {
    if (confirm("Bạn có chắc muốn xóa sạch toàn bộ nhân viên và dữ liệu ca?")) {
      baristas = [];
      servers = [];
      renderInputTables();
      const res = executeSchedule(baristas, servers, dailyNeeds);
      renderResults(res);
    }
  });

  document.getElementById("btnQuick2People").addEventListener("click", () => {
    dailyNeeds = DAYS.map(d => ({ day: d, A: 2, B: 2, A_min_barista: 1, B_min_barista: 1 }));
    renderDailyNeeds();
  });

  const tabTable = document.getElementById("tabTableMode");
  const tabBatch = document.getElementById("tabBatchMode");
  const viewTable = document.getElementById("viewTableInput");
  const viewBatch = document.getElementById("viewBatchInput");

  tabTable.addEventListener("click", () => {
    tabTable.className = "px-3 py-1.5 rounded-lg bg-white text-indigo-700 shadow-sm transition";
    tabBatch.className = "px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition";
    viewTable.classList.remove("hidden");
    viewBatch.classList.add("hidden");
  });

  tabBatch.addEventListener("click", () => {
    tabBatch.className = "px-3 py-1.5 rounded-lg bg-white text-indigo-700 shadow-sm transition";
    tabTable.className = "px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition";
    viewBatch.classList.remove("hidden");
    viewTable.classList.add("hidden");

    const batchText = [
      "[Pha chế]",
      ...baristas.map(b => `${b.name}: ${b.regs.join(", ")}`),
      "",
      "[Phục vụ]",
      ...servers.map(s => `${s.name}: ${s.regs.join(", ")}`)
    ].join("\n");
    document.getElementById("batchTextarea").value = batchText;
  });

  document.getElementById("btnApplyBatch").addEventListener("click", () => {
    const text = document.getElementById("batchTextarea").value;
    const { newBaristas, newServers } = parseBatchText(text);
    if (newBaristas.length === 0 && newServers.length === 0) {
      alert("Không tìm thấy dữ liệu nhân viên hợp lệ trong văn bản.");
      return;
    }
    baristas = newBaristas;
    servers = newServers;
    renderInputTables();
    tabTable.click();
    const res = executeSchedule(baristas, servers, dailyNeeds);
    renderResults(res);
  });

  document.getElementById("btnExportExcel").addEventListener("click", exportToExcel);
  document.getElementById("btnPrint").addEventListener("click", () => window.print());

  const legendToggle = document.getElementById("legendToggle");
  const legendContent = document.getElementById("legendContent");
  const legendChevron = document.getElementById("legendChevron");
  const legendToggleText = document.getElementById("legendToggleText");

  legendToggle.addEventListener("click", () => {
    const isHidden = legendContent.classList.contains("hidden");
    if (isHidden) {
      legendContent.classList.remove("hidden");
      legendChevron.style.transform = "rotate(0deg)";
      legendToggleText.textContent = "Thu gọn";
    } else {
      legendContent.classList.add("hidden");
      legendChevron.style.transform = "rotate(180deg)";
      legendToggleText.textContent = "Xem chi tiết";
    }
  });
});
