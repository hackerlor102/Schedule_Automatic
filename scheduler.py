#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HỆ THỐNG SẮP XẾP CA LÀM VIỆC TỰ ĐỘNG (VERSION 2.0)
Nâng cấp thuật toán:
- Cho phép đăng ký 2 khung giờ rảnh trong cùng một ngày (vd: 12-15h / b+), tự động chọn khung giờ tối ưu nhất
- 2 Pha chế có thể đứng cùng nhau, nhưng Phục vụ KHÔNG BAO GIỜ đứng một mình hoặc 2 phục vụ không có pha chế
- Hạn chế một người đứng ca quá 7 giờ (ca A1, B2 được giới hạn về 7h tiêu chuẩn)
- Đảm bảo mỗi nhân viên có từ 2 đến 6 ca/tuần
- Cảnh báo chi tiết ca thiếu người, thiếu pha chế, thiếu khung giờ
"""

import sys
import re
import itertools
from typing import Dict, List, Tuple, Optional, Any

DAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"]

STANDARD_SHIFTS = {
    "A":  {"name": "Ca A",  "start": 8.0,  "end": 15.0, "hours": 7.0,  "desc": "8:00AM ~ 15:00PM"},
    "B":  {"name": "Ca B",  "start": 15.0, "end": 22.0, "hours": 7.0,  "desc": "15:00PM ~ 22:00PM"},
    "A+": {"name": "Ca A+", "start": 8.0,  "end": 12.0, "hours": 4.0,  "desc": "8:00AM ~ 12:00PM"},
    "B+": {"name": "Ca B+", "start": 18.0, "end": 22.0, "hours": 4.0,  "desc": "18:00PM ~ 22:00PM"},
    "B1": {"name": "Ca B1", "start": 12.0, "end": 18.0, "hours": 6.0,  "desc": "12:00PM ~ 18:00PM"},
    "A1": {"name": "Ca A1", "start": 8.0,  "end": 18.0, "hours": 10.0, "desc": "8:00AM ~ 18:00PM"},
    "B2": {"name": "Ca B2", "start": 12.0, "end": 22.0, "hours": 10.0, "desc": "12:00PM ~ 22:00PM"},
}

def parse_time_str(time_str: str) -> Optional[float]:
    s = time_str.strip().lower()
    m = re.match(r"^(\d{1,2})(?:[:h\.](\d{1,2})|h)?$", s)
    if not m:
        return None
    h = int(m.group(1))
    mins = int(m.group(2)) if m.group(2) else 0
    return h + mins / 60.0

def format_time_hours(val: float) -> str:
    h = int(val)
    m = int(round((val - h) * 60))
    return f"{h:02d}:{m:02d}"

def parse_single_slot(raw: str) -> Dict:
    raw = raw.strip()
    upper = raw.upper()
    if not raw or upper in ["O", "OFF", "NGHI", "NGHỈ", "X", "-", "NONE", "0"]:
        return {"type": "OFF", "code": "OFF", "hours": 0.0, "raw": raw}
    
    for code, info in STANDARD_SHIFTS.items():
        if upper == code.upper():
            return {
                "type": "STANDARD",
                "code": code,
                "start": info["start"],
                "end": info["end"],
                "hours": info["hours"],
                "desc": info["desc"],
                "raw": raw
            }
            
    m = re.search(r"(\d{1,2}(?:[:h\.]\d{1,2}|h)?)\s*(?:~|-|đến|to)\s*(\d{1,2}(?:[:h\.]\d{1,2}|h)?)", raw, re.IGNORECASE)
    if m:
        start_h = parse_time_str(m.group(1))
        end_h = parse_time_str(m.group(2))
        if start_h is not None and end_h is not None and end_h > start_h:
            hours = end_h - start_h
            return {
                "type": "CUSTOM",
                "code": f"{format_time_hours(start_h)}~{format_time_hours(end_h)}",
                "start": start_h,
                "end": end_h,
                "hours": hours,
                "desc": f"{format_time_hours(start_h)} ~ {format_time_hours(end_h)}",
                "raw": raw
            }
            
    return {"type": "UNKNOWN", "code": raw, "hours": 0.0, "raw": raw}

def parse_registration_with_options(raw_text: str) -> List[Dict]:
    """Hỗ trợ phân tích nhiều khung giờ rảnh trong 1 ngày cách nhau bởi / hoặc hoặc"""
    if not raw_text:
        return [{"type": "OFF", "code": "OFF", "hours": 0.0, "raw": ""}]
    parts = re.split(r"\s*(?:/|hoặc|or)\s*", raw_text.strip(), flags=re.IGNORECASE)
    slots = []
    for p in parts:
        p = p.strip()
        if p:
            slot = parse_single_slot(p)
            slots.append(slot)
    if not slots:
        return [{"type": "OFF", "code": "OFF", "hours": 0.0, "raw": raw_text}]
    return slots

class Employee:
    def __init__(self, name: str, role: str, raw_regs: List[str]):
        self.name = name.strip()
        self.role = role.strip()  # "Pha chế" hoặc "Phục vụ"
        self.raw_regs = [r.strip() if i < len(raw_regs) else "off" for i, r in enumerate(raw_regs + ["off"] * (7 - len(raw_regs)))]
        self.parsed_options = [parse_registration_with_options(r) for r in self.raw_regs[:7]]
        self.assigned = [None] * 7
        self.total_shifts = 0
        self.total_hours = 0.0

def can_cover_target(reg_info: Dict, target_shift: str) -> Tuple[bool, float, float, float, float, str]:
    """
    Kiểm tra khả năng đảm nhận ca và giới hạn tối đa 7 giờ/ca
    """
    if reg_info["type"] == "OFF" or reg_info["type"] == "UNKNOWN":
        return False, 0.0, 0.0, 0.0, 0.0, ""
        
    code = reg_info.get("code", "")
    target_start = 8.0 if target_shift == "A" else 15.0
    target_end = 15.0 if target_shift == "A" else 22.0
    
    if code.upper() == target_shift.upper():
        return True, 10.0, 7.0, target_start, target_end, target_shift
        
    if target_shift == "A":
        if code == "A+":
            return True, 8.0, 4.0, 8.0, 12.0, "A+"
        if code == "A1":
            # Giới hạn 7 giờ theo quy tắc (8:00 - 15:00)
            return True, 9.0, 7.0, 8.0, 15.0, "Ca A (7h)"
        if code == "B1":
            return True, 6.0, 3.0, 12.0, 15.0, "B1 (12h-15h)"
    elif target_shift == "B":
        if code == "B+":
            return True, 8.0, 4.0, 18.0, 22.0, "B+"
        if code == "B2":
            # Giới hạn 7 giờ theo quy tắc (15:00 - 22:00)
            return True, 9.0, 7.0, 15.0, 22.0, "Ca B (7h)"
        if code == "B1":
            return True, 6.0, 3.0, 15.0, 18.0, "B1 (15h-18h)"
            
    if reg_info["type"] == "CUSTOM":
        st = reg_info["start"]
        en = reg_info["end"]
        ov_st = max(st, target_start)
        ov_en = min(en, target_end)
        if ov_en > ov_st:
            ov_h = ov_en - ov_st
            asg_h = min(ov_h, 7.0)
            score = 5.0 + (ov_h / 7.0) * 4.0
            lbl = f"{format_time_hours(st)}~{format_time_hours(en)}"
            return True, score, asg_h, ov_st, ov_en, lbl
            
    return False, 0.0, 0.0, 0.0, 0.0, ""

def schedule_shifts(employees: List[Employee], daily_needs: List[Dict]) -> Tuple[List[str], List[Dict]]:
    """
    Thuật toán xếp ca thông minh đa luồng (Hourly-Aware Dual-Stream):
    - Đánh giá tất cả các tổ hợp 2 khung giờ rảnh để tìm phương án phủ ca tốt nhất
    - Phục vụ BẮT BUỘC phải đi kèm Pha chế ở mọi khung giờ làm việc
    - Cho phép 2 Pha chế cùng đứng ca nếu thiếu Phục vụ
    - Giới hạn ca làm <= 7 giờ
    - Cân bằng số ca trong tuần từ 2 đến 6 ca
    """
    warnings = []
    daily_details = []
    
    for emp in employees:
        emp.assigned = [None] * 7
        emp.total_shifts = 0
        emp.total_hours = 0.0

    for day_idx in range(7):
        day_name = DAYS[day_idx]
        need = daily_needs[day_idx]
        req_A = need.get("A", 2)
        req_B = need.get("B", 2)
        
        # 1. Tập hợp các lựa chọn khung giờ rảnh của nhân viên trong ngày
        emp_options = []
        for emp in employees:
            if emp.total_shifts >= 6:
                emp_options.append([{"type": "OFF", "code": "OFF"}])
            else:
                opts = [o for o in emp.parsed_options[day_idx] if o["type"] != "OFF"]
                emp_options.append(opts if opts else [{"type": "OFF", "code": "OFF"}])
                
        all_combos = list(itertools.product(*emp_options))
        
        best_day_score = -float('inf')
        best_day_asg = None
        
        # Đánh giá từng tổ hợp lựa chọn khung giờ
        for combo in all_combos:
            can_A = []
            can_B = []
            for i, reg in enumerate(combo):
                if reg["type"] == "OFF":
                    continue
                emp = employees[i]
                cov_a = can_cover_target(reg, "A")
                cov_b = can_cover_target(reg, "B")
                
                if cov_a[0]:
                    can_A.append({
                        "emp_idx": i,
                        "emp": emp,
                        "score": cov_a[1],
                        "hours": cov_a[2],
                        "st": cov_a[3],
                        "en": cov_a[4],
                        "label": cov_a[5],
                        "orig_reg": reg,
                        "has_dual": len(emp.parsed_options[day_idx]) > 1
                    })
                if cov_b[0]:
                    can_B.append({
                        "emp_idx": i,
                        "emp": emp,
                        "score": cov_b[1],
                        "hours": cov_b[2],
                        "st": cov_b[3],
                        "en": cov_b[4],
                        "label": cov_b[5],
                        "orig_reg": reg,
                        "has_dual": len(emp.parsed_options[day_idx]) > 1
                    })
                    
            def cand_sort_key(c):
                u = 0 if c["emp"].total_shifts < 2 else 1
                return (u, c["emp"].total_shifts, -c["score"])
                
            can_A.sort(key=cand_sort_key)
            can_B.sort(key=cand_sort_key)
            
            # Xếp ca theo cấu trúc 2 luồng:
            # Luồng 1: Pha chế bắt buộc (phủ quầy Bar)
            # Luồng 2: Ưu tiên Phục vụ (phải có Pha chế đi kèm)
            # Luồng 3: Pha chế thứ 2 (nếu thiếu người)
            def build_shift_assignment(candidates, shift_start, shift_end, req_max):
                assigned = []
                dur = shift_end - shift_start
                bar_hours = [0] * dur
                total_hours = [0] * dur
                
                # Stream 1: Pha chế
                bar_cands = [c for c in candidates if c["emp"].role == "Pha chế"]
                for c in bar_cands:
                    st_rel = max(0, int(c["st"] - shift_start))
                    en_rel = min(dur, int(c["en"] - shift_start))
                    needs_barista = any(bar_hours[h] == 0 for h in range(st_rel, en_rel))
                    if needs_barista:
                        assigned.append(c)
                        for h in range(st_rel, en_rel):
                            bar_hours[h] += 1
                            total_hours[h] += 1
                            
                # Stream 2: Phục vụ
                srv_cands = [c for c in candidates if c["emp"].role == "Phục vụ" and not any(x["emp_idx"] == c["emp_idx"] for x in assigned)]
                for c in srv_cands:
                    st_rel = max(0, int(c["st"] - shift_start))
                    en_rel = min(dur, int(c["en"] - shift_start))
                    can_add = True
                    for h in range(st_rel, en_rel):
                        # QUY TẮC BẮT BUỘC: Phục vụ chỉ được xếp khi có Pha chế và chưa quá số người
                        if bar_hours[h] == 0 or total_hours[h] >= req_max:
                            can_add = False
                            break
                    if can_add:
                        assigned.append(c)
                        for h in range(st_rel, en_rel):
                            total_hours[h] += 1
                            
                # Stream 3: Pha chế thứ 2 hỗ trợ nếu chưa đủ người
                if req_max > 1:
                    rem_bar = [c for c in bar_cands if not any(x["emp_idx"] == c["emp_idx"] for x in assigned)]
                    for c in rem_bar:
                        st_rel = max(0, int(c["st"] - shift_start))
                        en_rel = min(dur, int(c["en"] - shift_start))
                        can_add = any(total_hours[h] < req_max for h in range(st_rel, en_rel))
                        if can_add:
                            assigned.append(c)
                            for h in range(st_rel, en_rel):
                                if total_hours[h] < req_max:
                                    bar_hours[h] += 1
                                    total_hours[h] += 1
                                    
                return assigned, bar_hours, total_hours
                
            asg_A_curr, bar_h_A, tot_h_A = build_shift_assignment(can_A, 8, 15, req_A)
            used_emp_indices = {c["emp_idx"] for c in asg_A_curr}
            avail_for_B = [c for c in can_B if c["emp_idx"] not in used_emp_indices]
            asg_B_curr, bar_h_B, tot_h_B = build_shift_assignment(avail_for_B, 15, 22, req_B)
            
            score = sum(tot_h_A) * 15 + sum(tot_h_B) * 15
            score += sum(20 for b in bar_h_A if b > 0) + sum(20 for b in bar_h_B if b > 0)
            
            for c in asg_A_curr + asg_B_curr:
                if c["hours"] < 2.0:
                    score -= 80
                elif 2.0 <= c["hours"] <= 7.0:
                    score += 25
                if c["emp"].total_shifts < 2:
                    score += 250
                elif c["emp"].total_shifts >= 5:
                    score -= 100
                    
            if score > best_day_score:
                best_day_score = score
                best_day_asg = (asg_A_curr, asg_B_curr)
                
        # 2. Áp dụng kết quả tốt nhất cho ngày hôm nay
        day_detail = {"day": day_name, "shifts": {"A": [], "B": []}}
        if best_day_asg:
            asg_A_final, asg_B_final = best_day_asg
            
            # Ghi nhận Ca A
            for c in asg_A_final:
                emp = c["emp"]
                is_sub = (emp.role == "Pha chế" and len(asg_A_final) > 1 and len([x for x in asg_A_final if x["emp"].role == "Pha chế"]) > 1)
                emp.assigned[day_idx] = {
                    "shift": "A",
                    "label": c["label"],
                    "hours": c["hours"],
                    "acting_role": emp.role,
                    "has_dual": c["has_dual"],
                    "orig_raw": c["orig_reg"]["raw"],
                    "is_sub": is_sub
                }
                emp.total_shifts += 1
                emp.total_hours += c["hours"]
                day_detail["shifts"]["A"].append({
                    "name": emp.name, "role": emp.role, "label": c["label"], "hours": c["hours"], "is_sub": is_sub
                })
                
            # Ghi nhận Ca B
            for c in asg_B_final:
                emp = c["emp"]
                is_sub = (emp.role == "Pha chế" and len(asg_B_final) > 1 and len([x for x in asg_B_final if x["emp"].role == "Pha chế"]) > 1)
                emp.assigned[day_idx] = {
                    "shift": "B",
                    "label": c["label"],
                    "hours": c["hours"],
                    "acting_role": emp.role,
                    "has_dual": c["has_dual"],
                    "orig_raw": c["orig_reg"]["raw"],
                    "is_sub": is_sub
                }
                emp.total_shifts += 1
                emp.total_hours += c["hours"]
                day_detail["shifts"]["B"].append({
                    "name": emp.name, "role": emp.role, "label": c["label"], "hours": c["hours"], "is_sub": is_sub
                })
                
            # Tạo các thông báo cảnh báo ca còn thiếu
            for s_type, asg_list, req_c, st_h, en_h in [("A", asg_A_final, req_A, 8, 15), ("B", asg_B_final, req_B, 15, 22)]:
                s_name = f"Ca {s_type} ({st_h}:00~{en_h}:00)"
                bar_count = len([x for x in asg_list if x["emp"].role == "Pha chế"])
                if bar_count == 0:
                    warnings.append(f"⚠️ {day_name} - {s_name}: Thiếu Pha chế (Phục vụ không thể làm thay Pha chế)!")
                elif len(asg_list) < req_c:
                    warnings.append(f"⚠️ {day_name} - {s_name}: Thiếu {req_c - len(asg_list)} người (Yêu cầu {req_c}, hiện có {len(asg_list)})!")
                    
                # Báo từng khung giờ trống vị trí Pha chế
                for h in range(st_h, en_h):
                    b_at_h = sum(1 for c in asg_list if c["emp"].role == "Pha chế" and c["st"] <= h < c["en"])
                    if b_at_h == 0:
                        warnings.append(f"ℹ️ {day_name} - {s_name}: Khung giờ {h:02d}:00~{(h+1):02d}:00 thiếu vị trí Pha chế!")
                        
        daily_details.append(day_detail)

    # 3. Kiểm tra ràng buộc tuần (2 - 6 ca)
    for emp in employees:
        active_regs = sum(1 for o in emp.parsed_options if any(s["type"] != "OFF" for s in o))
        if emp.total_shifts < 2 and active_regs >= 2:
            warnings.append(f"⚠️ Nhân viên {emp.name} ({emp.role}): Chỉ được xếp {emp.total_shifts} ca (Quy định tối thiểu 2 ca/tuần)!")
        elif emp.total_shifts > 6:
            warnings.append(f"⚠️ Nhân viên {emp.name} ({emp.role}): Bị xếp {emp.total_shifts} ca (Vượt quá tối đa 6 ca/tuần)!")
            
    return warnings, daily_details

def print_result_table(employees: List[Employee]):
    name_w = max(16, max([len(e.name) for e in employees] + [10]))
    role_w = 10
    day_w = 14
    
    col_headers = [f"{d:^{day_w}}" for d in DAYS]
    header = f"{'Họ và Tên':<{name_w}} | {'Vai trò':<{role_w}} | " + " | ".join(col_headers) + f" | {'Tổng ca':^8} | {'Tổng giờ':^9}"
    line = "-" * len(header)
    
    print("\n" + "=" * len(header))
    print(f"{'BẢNG CHIA CA LÀM VIỆC TRONG TUẦN (THỨ 2 - CHỦ NHẬT)':^{len(header)}}")
    print("=" * len(header))
    print(header)
    print(line)
    
    baristas = [e for e in employees if e.role == "Pha chế"]
    servers = [e for e in employees if e.role == "Phục vụ"]
    
    if baristas:
        print(f"--- [NHÓM PHA CHẾ ({len(baristas)} người)] " + "-" * (len(header) - 25 - len(str(len(baristas)))))
        for emp in baristas:
            cells = []
            for day_idx in range(7):
                asg = emp.assigned[day_idx]
                if asg:
                    lbl = asg["label"]
                    if asg.get("is_sub"):
                        lbl += "*"
                    cells.append(f"{lbl:^{day_w}}")
                else:
                    cells.append(f"{'OFF':^{day_w}}")
            row = f"{emp.name:<{name_w}} | {emp.role:<{role_w}} | " + " | ".join(cells) + f" | {emp.total_shifts:^8} | {emp.total_hours:^8.1f}h"
            print(row)
            
    if servers:
        print(f"--- [NHÓM PHỤC VỤ ({len(servers)} người)] " + "-" * (len(header) - 25 - len(str(len(servers)))))
        for emp in servers:
            cells = []
            for day_idx in range(7):
                asg = emp.assigned[day_idx]
                if asg:
                    cells.append(f"{asg['label']:^{day_w}}")
                else:
                    cells.append(f"{'OFF':^{day_w}}")
            row = f"{emp.name:<{name_w}} | {emp.role:<{role_w}} | " + " | ".join(cells) + f" | {emp.total_shifts:^8} | {emp.total_hours:^8.1f}h"
            print(row)
            
    print(line)
    print("Ghi chú: (*) 2 Pha chế cùng đứng ca | 'OFF': Nghỉ ca")

def print_warnings(warnings: List[str]):
    print("\n" + "=" * 75)
    print("THÔNG BÁO CA CÒN THIẾU & CẢNH BÁO RÀNG BUỘC")
    print("=" * 75)
    if not warnings:
        print("✅ Tuyệt vời! Tất cả các ca đã được lấp đầy đủ người, không có ca nào bị thiếu.")
    else:
        for w in warnings:
            print(w)
    print("=" * 75)

def get_sample_employees() -> Tuple[List[Employee], List[Employee]]:
    baristas = [
        Employee("Vy",   "Pha chế", ["8-11h30", "b+", "8-9h", "15-18h", "16-22h", "off", "b+"]),
        Employee("Ánh",  "Pha chế", ["B", "off", "off", "12-15h / b+", "6-9h", "b+", "a+"]),
        Employee("Mai",  "Pha chế", ["b1", "b1", "b1", "9-12h", "off", "off", "off"]),
        Employee("Đạt",  "Pha chế", ["off", "off", "9-15h", "12-15h / b+", "off", "a+", "b2"]),
        Employee("Phú",  "Pha chế", ["off", "a1", "b", "a+", "a1", "b1", "b1"]),
    ]
    servers = [
        Employee("Hương",  "Phục vụ", ["o", "o", "o", "a", "a+", "b+", "off"]),
        Employee("Huy",    "Phục vụ", ["o", "b+", "b+", "o", "b1", "o", "a"]),
        Employee("Phương", "Phục vụ", ["b+", "8-11h30", "8-11h30", "o", "o", "o", "a+"]),
        Employee("Thư",    "Phục vụ", ["o", "o", "o", "o", "o", "o", "o"]),
        Employee("Mhuong", "Phục vụ", ["o", "o", "o", "B", "b+", "b1", "o"]),
        Employee("Hảo",    "Phục vụ", ["a", "b1", "o", "o", "o", "a+", "off"]),
    ]
    return baristas, servers

def interactive_cli():
    print("""
========================================================================
     CHƯƠNG TRÌNH SẮP XẾP CA LÀM VIỆC TỰ ĐỘNG (VERSION 2.0 - TỐI ƯU)
========================================================================
Quy định ca & nâng cấp:
  - Cho phép nhập 2 khung giờ rảnh trong ngày (vd: 12-15h / b+)
  - 2 Pha chế có thể đứng cùng nhau; Phục vụ BẮT BUỘC có Pha chế đi kèm
  - Giới hạn tối đa 7 giờ/ca (ca A1, B2 được gọt về 7h tiêu chuẩn)
  - Mỗi người tối thiểu 2 ca, tối đa 6 ca/tuần
========================================================================
""")
    print("Chọn phương thức nhập dữ liệu:")
    print("  [1] Nạp nhanh bộ dữ liệu mẫu (Khuyên dùng)")
    print("  [2] Tự nhập thông tin từ bàn phím")
    choice = input("Lựa chọn của bạn [1/2] (mặc định 1): ").strip()
    
    if choice == "2":
        baristas: List[Employee] = []
        servers: List[Employee] = []
        print("\n--- BƯỚC 1: NHẬP DANH SÁCH PHA CHẾ ---")
        num_bar = int(input("Nhập số lượng nhân viên Pha chế: ").strip() or "0")
        for i in range(num_bar):
            name = input(f"Tên Pha chế #{i+1}: ").strip() or f"Pha chế {i+1}"
            print("  Đăng ký ca từ T2 -> CN (cách nhau bởi dấu phẩy, vd: 8-11h30, b+, 12-15h / b+, off, ...):")
            line_reg = input("  > ").strip()
            regs = [r.strip() for r in line_reg.split(",")]
            baristas.append(Employee(name, "Pha chế", regs))
            
        print("\n--- BƯỚC 2: NHẬP DANH SÁCH PHỤC VỤ ---")
        num_srv = int(input("Nhập số lượng nhân viên Phục vụ: ").strip() or "0")
        for i in range(num_srv):
            name = input(f"Tên Phục vụ #{i+1}: ").strip() or f"Phục vụ {i+1}"
            print("  Đăng ký ca từ T2 -> CN (cách nhau bởi dấu phẩy):")
            line_reg = input("  > ").strip()
            regs = [r.strip() for r in line_reg.split(",")]
            servers.append(Employee(name, "Phục vụ", regs))
    else:
        print("\n=> Đã nạp thành công bộ dữ liệu nhân viên chuẩn!")
        baristas, servers = get_sample_employees()
        print(f"   + Pha chế: {len(baristas)} người ({', '.join([b.name for b in baristas])})")
        print(f"   + Phục vụ: {len(servers)} người ({', '.join([s.name for s in servers])})")

    print("\n--- BƯỚC 3: CẤU HÌNH SỐ NGƯỜI ĐỨNG TỪ THỨ 2 ĐẾN CHỦ NHẬT ---")
    use_default = input("Bạn có muốn dùng mặc định 2 người/ca cho tất cả các ngày? (C/k) [Mặc định C]: ").strip().lower()
    
    daily_needs = []
    if use_default in ["", "c", "co", "có", "y", "yes"]:
        daily_needs = [{"A": 2, "B": 2} for _ in DAYS]
        print("=> Đã đặt mặc định: Ca A = 2 người, Ca B = 2 người cho cả 7 ngày.")
    else:
        for d in DAYS:
            print(f"[{d}]")
            a_cnt = input("  Số người Ca A (8:00~15:00) [Mặc định 2]: ").strip()
            b_cnt = input("  Số người Ca B (15:00~22:00) [Mặc định 2]: ").strip()
            daily_needs.append({
                "A": int(a_cnt) if a_cnt.isdigit() else 2,
                "B": int(b_cnt) if b_cnt.isdigit() else 2
            })

    all_emp = baristas + servers
    print("\nĐang thực hiện thuật toán tối ưu xếp ca...")
    warns, details = schedule_shifts(all_emp, daily_needs)

    print_result_table(all_emp)
    print_warnings(warns)
    print("\n✅ Hoàn tất sắp xếp ca làm việc!")

if __name__ == "__main__":
    interactive_cli()
