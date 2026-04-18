# Emergency Standup: "Who Broke Main on Skeld?"

**Sprint Goal:** Ship calculator expression mode + API guardrails  
**Duration:** 12 minutes  
**Location:** Cafeteria (definitely not a war room)

---

## 09:30 - Riley Kim (Scrum Master)

"Emergency Meeting. Nobody panic, nobody eject anybody yet. Standard flow: yesterday, today, blockers. Keep it crisp so we can get back to not being suspicious in electrical."

"Also reminder: this is standup, not an architecture trial."

---

## 09:31 - Maya Chen (Frontend)

**Yesterday:**  
"Finished expression-input UI states and keyboard shortcuts. Added focus-ring fixes and screen-reader labels. Also patched the tiny bug where minus looked like underscore on mobile."

**Today:**  
"Wiring parser errors from API into inline field messages. Then visual polish on history chips."

**Blockers:**  
"Need stable error codes from backend for invalid parentheses and complexity limits. Right now all 'bad expression' paths look the same."

**Tone ping:**  
"Whoever made the placeholder text 8px... that's kind of sus."

---

## 09:33 - Elliott Vance (Backend)

**Yesterday:**  
"Parser now handles nested parentheses and operator precedence. Added complexity guard to reject pathological payloads."

**Today:**  
"Splitting error responses into explicit codes: `ERR_PARSE`, `ERR_COMPLEXITY`, `ERR_DIV_ZERO`. Then adding integration tests for malformed expressions."

**Blockers:**  
"Need final UI constraints on max expression length so limits align and we stop arguing in comments."

**Tone ping:**  
"If we skip these error codes, the incident write-up writes itself."

---

## 09:35 - Alex Hsu (Tech Lead)

**Yesterday:**  
"Cut scope: no scientific constants panel this sprint. Protected main from two speculative branches."

**Today:**  
"Unblock FE/BE contract merge and enforce one response schema. Then verify sprint burndown still lands Friday."

**Blockers:**  
"We have drift between FE assumptions and BE limits. That is today's priority, everything else is side quest."

**Decision:**  
"No new features until parser contract is stable. Non-negotiable."

---

## 09:37 - Dr. Nova Patel (Solutions Architect)

**Yesterday:**  
"Reviewed expression endpoint against platform guidelines. Identified one coupling risk: UI assumptions tied too tightly to parser internals."

**Today:**  
"Publish a short decision note: error taxonomy + versioning path for future scientific mode."

**Blockers:**  
"Need agreement on whether complexity limit is static or configurable per environment."

**Tone ping:**  
"The architecture is not the impostor. Unbounded input is."

---

## 09:39 - Riley Kim (Scrum Master) - Blocker consolidation

"Great. No ejections today. Here's the action board:"

1. **Error code contract lock**  
   - **Owner:** Elliott + Maya  
   - **Next step (today):** finalize code list and FE mapping in shared doc, then implement before noon.

2. **Max expression length alignment**  
   - **Owner:** Alex  
   - **Next step (today):** set single source of truth and post in standup thread.

3. **Complexity limit policy (static vs configurable)**  
   - **Owner:** Nova  
   - **Next step (today):** propose recommendation + tradeoff note by EOD.

"If you are done with your task, do not wander into vents (aka unrelated refactors)."

---

## 09:41 - Closing

**Riley:** "Standup adjourned. Team is clear, sprint goal still green, nobody was ejected."

**Alex:** "Back to work."

**Maya:** "Copy. Shipping, not venting."

**Elliott:** "Merging tests first."

**Nova:** "Decision note incoming."
