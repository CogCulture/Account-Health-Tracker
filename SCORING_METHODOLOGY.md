# Account Health Tracker - Scoring Methodology & Logic

This document details the exact mathematical formulas, parameter weightings, scoring thresholds, and deduction rules used to calculate every client's **Account Health Score (0–100%)**.

---

## 📊 Overall Health Score Formula

Each parameter is individually scored on a **0 to 10 scale**, and then weighted to compute the overall **Health Score Percentage**:

$$\text{Final Health Score (\%)} = \max\left(0, \text{Math.round}\left((\text{P1} \times 2.5) + (\text{P2} \times 4.0) + (\text{P3} \times 2.5) + (\text{P4} \times 1.0) - \text{Escalation Deduction}\right)\right)$$

### Parameter Weighting Breakdown

| Parameter | Metric Name | Scale | Weight | Max Contribution to Overall Score |
| :--- | :--- | :---: | :---: | :---: |
| **P1** | **Client Calls & Meeting Attendance** | 0 – 10 | 2.5x | **25%** |
| **P2** | **Delivery Date & On-Time Ratio** | 0 – 10 | 4.0x | **40%** |
| **P3** | **Cross-Functional Team Attendance** | 0 – 10 | 2.5x | **25%** |
| **P4** | **Proactiveness & Initiatives** | 0 – 10 | 1.0x | **10%** |
| **Total** | | | | **100%** |

---

## 🟢 1. Parameter 1: Client Calls & Daily Meeting Attendance (25% Weight | Max 10 Pts)

Evaluates daily JSR calls logged in the **Daily Tracker** tab for the selected month (evaluating weekdays Mon–Fri up to today).

### 1.1 In-Person Meetings (Max 5 Points)
* **Team Lead Attendance** (*Deepakshi / Geetika / Khushi*):
  * $\ge 2$ in-person meetings logged = **2 Points**
  * $1$ in-person meeting logged = **1 Point**
  * $0$ in-person meetings logged = **0 Points**
* **Other Member Attendance**:
  * $\ge 3$ in-person meetings logged = **3 Points**
  * $2$ in-person meetings logged = **2 Points**
  * $1$ in-person meeting logged = **1 Point**
  * $0$ in-person meetings logged = **0 Points**
* **Exempted Brands** (*Digital Connexion*, *BPL*, *Kelvinator*): Automatically awarded **0 Points** for in-person requirements without penalty.

### 1.2 On-Call Attendance Rate (Max 5 Points)
Evaluates total verified attended calls (including rows marked **`Client Unavailable`**, which count towards attendance without penalty):

$$\text{Attendance Rate} = \frac{\text{Attended Days (including Client Unavailable)}}{\text{Total Elapsed Weekdays in Month}} \times 100$$

* $\ge 90\%$ attendance = **5 Points**
* $75\% - 89\%$ attendance = **4 Points**
* $60\% - 74\%$ attendance = **3 Points**
* $50\% - 59\%$ attendance = **2 Points**
* $< 50\%$ attendance = **0 Points**

---

## 📅 2. Parameter 2: Delivery Date & On-Time Ratio (40% Weight | Max 10 Pts)

Evaluates deliverables closed in the selected period in the **Job Tracker** tab.

### 2.1 On-Time Classification
* A job is **On-Time** if:
  $$\text{Job Closing Date (or Delivery Date)} \le \text{Client Timeline}$$
* Otherwise, it is classified as **Delayed**.

### 2.2 Priority Weightings
Each job is weighted according to its priority tier:
* **XXL**: Weight **5**
* **XL**: Weight **4**
* **L**: Weight **3**
* **M**: Weight **2**
* **S**: Weight **1**

### 2.3 P2 Score Calculation
$$\text{Weighted On-Time Ratio} = \frac{\sum (\text{On-Time Closed Jobs of Priority } P \times \text{Weight of } P)}{\sum (\text{Total Closed Jobs of Priority } P \times \text{Weight of } P)}$$

$$\text{P2 Score} = \text{Weighted On-Time Ratio} \times 10$$

*(If 0 deliverables were closed in the month, P2 Score defaults to 0/10 with a summary notification: "No closed deliverables this month").*

---

## 👥 3. Parameter 3: Cross-Functional Team Attendance (25% Weight | Max 10 Pts)

Evaluates attendance of Creative/Design and Management team members in daily JSR calls.

### 3.1 Creative / Design Team Attendance (Max 5 Points)
Counts elapsed weekday JSR calls where Creative/Design team members attended (*Design*, *Art*, *Copy*, *Creative*, *Video*):
* $\ge 3$ attended days = **5 Points**
* $2$ attended days = **4 Points**
* $1$ attended day = **3 Points**
* $0$ attended days = **0 Points**

### 3.2 Management Team Attendance (Max 5 Points)
Evaluates attendance of management team members (*Anoop Dixit*, *Vaibhav Mehrotra*, *Pallave Dixit*):
* **If ANY management member joins at least ONCE in the month** = **5 Points**
* If 0 management joins = **0 Points**

---

## 💡 4. Parameter 4: Proactiveness & Initiatives (10% Weight | Max 10 Pts)

Evaluates unbriefed proactive concepts, pitches, strategy decks, and initiative jobs logged in the Job Tracker.

### 4.1 Initiative Unapproved Ratio (Max 5 Raw Pts)
$$\text{Ratio} = \frac{\text{Initiative Unapproved Jobs}}{\text{Total Jobs in Month}} \times 100$$
* $> 20\%$ = **5 Points**
* $> 15\%$ = **4 Points**
* $> 10\%$ = **3 Points**
* $> 5\%$ = **2 Points**
* $> 0\%$ = **1 Point**

### 4.2 Initiative Approved Ratio (Max 10 Raw Pts)
$$\text{Ratio} = \frac{\text{Initiative Approved Jobs}}{\text{Total Jobs in Month}} \times 100$$
* $> 20\%$ = **10 Points**
* $> 15\%$ = **8 Points**
* $> 10\%$ = **6 Points**
* $> 5\%$ = **4 Points**
* $> 0\%$ = **2 Points**

### 4.3 P4 Score Calculation
$$\text{Raw Score} = \text{Unapproved Points} + \text{Approved Points} \quad (\text{out of 15})$$

$$\text{P4 Score} = \frac{\text{Raw Score}}{15} \times 10$$

---

## ⚠️ 5. Escalation Deductions & Rating Bands

### 5.1 Escalation Deductions
Any job flagged with an escalation deducts points from the overall health score percentage:
* $\le 40\%$ escalation rate: Deducts **$2.5\%$ for every $5\%$ escalation tier**.
* $> 40\%$ escalation rate: Flat **$-30\%$ deduction**.

---

## 🎨 Rating Bands

* 🟢 **Excellent (Green)**: **$\ge 70\%$** (Earned $\ge 28 / 40$ base points)
* 🟡 **Needs Attention (Yellow)**: **$40\% \text{ to } 69\%$** (Earned $16 \text{ to } 27 / 40$ base points)
* 🔴 **Critical (Red)**: **$< 40\%$** (Earned $< 16 / 40$ base points)
