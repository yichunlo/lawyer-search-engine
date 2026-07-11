const examples = [
  "我被解僱了，想告公司，我該找哪些律師",
  "我在網路上罵人白癡，有人說要告我",
  "車禍後對方告我過失傷害，也要損害賠償",
  "我家的貓不小心弄壞別人家的燈飾，對方說要提告",
];

const MAX_USER_INPUT_CHARS = 2000;

let conversation = [];
let isSending = false;

const app = document.querySelector("#app");

app.innerHTML = `
  <section class="shell">
    <header class="topbar">
      <div class="identity">
        <div class="mark" aria-hidden="true">判</div>
        <div>
          <h1>Lawyer Search Engine</h1>
          <p>判決書案由與律師經驗搜尋</p>
        </div>
      </div>
      <div class="source-pill">Frontend only</div>
    </header>

    <section class="chat-layout" aria-live="polite">
      <div class="chat-panel">
        <div class="result-header">
          <span>Conversation</span>
          <span id="matchState">Ready</span>
        </div>
        <div id="results" class="chat-thread"></div>
      </div>
      <div class="composer">
        <label for="caseText" class="sr-only">Message</label>
        <textarea id="caseText" rows="3" maxlength="${MAX_USER_INPUT_CHARS}" placeholder="Message Lawyer Search Engine"></textarea>
        <div class="composer-bottom">
          <div>
            <div class="examples" id="examples"></div>
            <div class="input-meta" id="inputLimit">0 / ${MAX_USER_INPUT_CHARS}</div>
          </div>
          <div class="actions">
            <button id="clearBtn" type="button" class="secondary">New chat</button>
            <button id="classifyBtn" type="button">Send</button>
          </div>
        </div>
      </div>
    </section>
  </section>
`;

const caseText = document.querySelector("#caseText");
const sendBtn = document.querySelector("#classifyBtn");
const clearBtn = document.querySelector("#clearBtn");
const chatThread = document.querySelector("#results");
const matchState = document.querySelector("#matchState");
const examplesEl = document.querySelector("#examples");
const inputLimit = document.querySelector("#inputLimit");

function apiBaseUrl() {
  const configured = String(window.LAWYER_SEARCH_API_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (["127.0.0.1", "localhost"].includes(window.location.hostname)) return window.location.origin;
  return "";
}

function apiUrl() {
  const base = apiBaseUrl();
  if (!base) return "";
  return `${base}/api/classify`;
}

function userFactsText() {
  return conversation
    .filter((message) => message.role === "user")
    .map((message, index) => `${index === 0 ? "使用者原始描述" : "使用者補充回答"}：${message.content}`)
    .join("\n");
}

function countChars(value) {
  return Array.from(String(value || "")).length;
}

function userInputChars(extra = "") {
  const existing = conversation
    .filter((message) => message.role === "user")
    .reduce((sum, message) => sum + countChars(message.content), 0);
  return existing + countChars(extra);
}

function inputTooLongPayload() {
  return {
    warning: `請把這次對話的案件描述控制在 ${MAX_USER_INPUT_CHARS} 字以內。`,
    answer_zh: "為了避免濫用與保護後端資源，這個測試版限制單次對話的使用者輸入總長度。",
    suggestions: [],
  };
}

function updateInputLimit() {
  const used = userInputChars(caseText?.value || "");
  inputLimit.textContent = `${Math.min(used, MAX_USER_INPUT_CHARS)} / ${MAX_USER_INPUT_CHARS}`;
  inputLimit.classList.toggle("over-limit", used > MAX_USER_INPUT_CHARS);
  sendBtn.disabled = isSending || used > MAX_USER_INPUT_CHARS;
}

function requestConversationSnapshot() {
  return conversation
    .filter((message) => message.role === "user" || (message.role === "assistant" && message.payload))
    .map((message) => {
      if (message.role === "user") {
        return { role: "user", content: message.content };
      }
      return {
        role: "assistant",
        payload: {
          answer_zh: message.payload.answer_zh || "",
          routing_confidence: message.payload.routing_confidence || "",
          missing_info_impact: message.payload.missing_info_impact || "",
          follow_up_question_zh: message.payload.follow_up_question_zh || "",
          suggestions: (message.payload.suggestions || []).slice(0, 2).map((suggestion) => ({
            jtitle_category: suggestion.jtitle_category || "",
            category_id: suggestion.category_id || "",
            category: suggestion.category || "",
          })),
        },
      };
    });
}

function renderConversation() {
  if (!conversation.length) {
    const setupMessage = apiBaseUrl()
      ? "請先描述你的案件。我會把內容送到後端，由後端使用判決書資料庫與 LLM 回覆。"
      : "後端 API 尚未設定。此頁只包含前端，不含判決書資料庫或 API key。";
    chatThread.innerHTML = `
      <div class="chat-message assistant">
        <div class="bubble">
          <p>${escapeHtml(setupMessage)}</p>
        </div>
      </div>
    `;
    return;
  }

  chatThread.innerHTML = conversation
    .map((message) =>
      message.role === "user"
        ? `
          <div class="chat-message user">
            <div class="bubble">${escapeHtml(message.content)}</div>
          </div>
        `
        : `
          <div class="chat-message assistant">
            <div class="bubble">${renderAssistantPayload(message.payload)}</div>
          </div>
        `,
    )
    .join("");
  chatThread.scrollTop = chatThread.scrollHeight;
}

function renderAssistantPayload(payload) {
  if (!payload) return `<p>正在整理判決書索引...</p>`;
  const suggestions = payload.suggestions || [];
  const note = payload.answer_zh ? `<div class="answer-note">${escapeHtml(payload.answer_zh)}</div>` : "";
  const warning = payload.warning ? `<div class="warning-note">${escapeHtml(payload.warning)}</div>` : "";
  const recommendationNotice = payload.lawyer_recommendation_notice_zh
    ? `<div class="reference-note">${escapeHtml(payload.lawyer_recommendation_notice_zh)}</div>`
    : "";
  const clarify = !suggestions.length && (payload.clarify_question_zh || "")
    ? `<div class="follow-up-card"><strong>需要補充</strong><p>${escapeHtml(payload.clarify_question_zh)}</p></div>`
    : "";
  const followUp = payload.follow_up_question_zh
    ? `<div class="follow-up-card"><strong>追問</strong><p>${escapeHtml(payload.follow_up_question_zh)}</p></div>`
    : "";
  const cards = suggestions.map(renderSuggestionCard).join("");
  return note + warning + recommendationNotice + cards + clarify + followUp;
}

function renderSuggestionCard(item, index) {
  return `
    <article class="result">
      <div class="rank">${index + 1}</div>
      <div class="result-body">
        ${
          item.jtitle_category
            ? `<div class="jtitle">JTITLE / 案由：${escapeHtml(item.jtitle_category)}</div>`
            : ""
        }
        <h2>${escapeHtml(item.category)}</h2>
        <p class="lawyer">${escapeHtml(item.lawyer || item.consult_lawyer || "")}</p>
        <p class="why">${escapeHtml(item.reason_zh || item.why || "")}</p>
        ${renderRecommendedLawyers(item.recommended_lawyers || [])}
        <div class="tags">
          ${(item.reference_basis || item.hits || item.matched_keywords || [])
            .map((hit) => `<span>${escapeHtml(hit)}</span>`)
            .join("")}
        </div>
      </div>
    </article>
  `;
}

function renderRecommendedLawyers(lawyers) {
  if (!lawyers.length) return "";
  const firmGroups = groupLawyersByFirm(lawyers);
  return `
    <div class="lawyer-recs">
      <h3>Recommended firms and lawyers</h3>
      ${firmGroups.map(renderRecommendedFirm).join("")}
    </div>
  `;
}

function groupLawyersByFirm(lawyers) {
  const groups = new Map();
  for (const lawyer of lawyers) {
    const firms = lawyer.firm_matches?.length
      ? lawyer.firm_matches
      : [{ firm_id: "unmapped", firm_name: "未對應事務所", rank: null, lawyer_count: null, unmapped: true }];
    for (const firm of firms) {
      const key = firm.firm_id || firm.firm_name || "unmapped";
      if (!groups.has(key)) {
        groups.set(key, { firm, lawyers: [] });
      }
      groups.get(key).lawyers.push(lawyer);
    }
  }
  return [...groups.values()];
}

function renderRecommendedFirm(group) {
  return `
    <div class="firm-rec">
      <div class="firm-rec-top">
        <span class="firm-rec-name">${escapeHtml(formatFirmMatch(group.firm))}</span>
        <span>${escapeHtml(group.lawyers.length)} lawyer${group.lawyers.length === 1 ? "" : "s"}</span>
      </div>
      <div class="firm-lawyers">
        ${group.lawyers.map(renderFirmLawyer).join("")}
      </div>
    </div>
  `;
}

function renderFirmLawyer(lawyer) {
  return `
    <div class="firm-lawyer">
      <div class="firm-lawyer-top">
        <span class="lawyer-rec-name">${escapeHtml(lawyer.name || "")}</span>
        <span>${escapeHtml(lawyer.source_name || "")}</span>
      </div>
      ${lawyer.firm_mapping_ambiguous ? `<div class="firm-tags"><span>同名需確認</span></div>` : ""}
      <p>${escapeHtml(lawyer.reason_zh || "")}</p>
      <p class="case-count">
        同類案件 ${escapeHtml(lawyer.observed_case_count ?? 0)} 件；可解析結果 ${escapeHtml(lawyer.known_outcome_count ?? 0)} 件
      </p>
      <div class="mini-tags">
        ${(lawyer.matched_jtitles || [])
          .slice(0, 4)
          .map((item) => `<span>${escapeHtml(formatJtitleStat(item))}</span>`)
          .join("")}
      </div>
    </div>
  `;
}

function formatFirmMatch(firm) {
  if (firm.unmapped) return firm.firm_name || "未對應事務所";
  const rank = firm.rank ? ` #${firm.rank}` : "";
  return `${firm.firm_name || ""}${rank}`;
}

function formatJtitleStat(item) {
  const rate =
    typeof item.estimated_win_rate === "number" ? ` / ${Math.round(item.estimated_win_rate * 100)}%` : "";
  return `${item.jtitle || ""} (${item.count || 0}${rate})`;
}

function modeLabel(payload) {
  if (!payload) return "Thinking";
  if (payload.mode === "llm") return "LLM";
  if (payload.mode === "local_fallback_no_api_key") return "Backend fallback";
  if (payload.mode === "fallback_after_llm_error") return "Backend fallback";
  return "Ready";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendMessage(rawText = caseText.value) {
  const content = String(rawText || "").trim();
  if (!content || isSending) return;
  if (userInputChars(content) > MAX_USER_INPUT_CHARS) {
    conversation.push({ role: "assistant", payload: inputTooLongPayload() });
    matchState.textContent = "Input too long";
    renderConversation();
    updateInputLimit();
    return;
  }

  conversation.push({ role: "user", content });
  caseText.value = "";
  updateInputLimit();
  renderConversation();
  await classifyConversation();
}

async function classifyConversation() {
  const endpoint = apiUrl();
  if (!endpoint) {
    conversation.push({
      role: "assistant",
      payload: {
        warning: "Backend API is not configured for this frontend deployment.",
        answer_zh: "目前只有前端頁面，沒有連到後端；判決書資料庫與 API key 沒有放在 GitHub。",
        suggestions: [],
      },
    });
    matchState.textContent = "Backend unavailable";
    renderConversation();
    return;
  }

  const caseFacts = userFactsText();
  if (!caseFacts.trim()) return;
  const requestConversation = requestConversationSnapshot();

  isSending = true;
  sendBtn.disabled = true;
  matchState.textContent = "Thinking";
  conversation.push({ role: "assistant", payload: null });
  renderConversation();

  try {
    const payload = await classifyWithApi(endpoint, caseFacts, requestConversation);
    conversation[conversation.length - 1] = { role: "assistant", payload };
    matchState.textContent = modeLabel(payload);
  } catch (error) {
    conversation[conversation.length - 1] = {
      role: "assistant",
      payload: {
        warning: error.message,
        answer_zh: "後端 API 暫時無法連線。判決書資料庫與 API key 沒有放在 GitHub Pages。",
        suggestions: [],
      },
    };
    matchState.textContent = "Backend unavailable";
  } finally {
    isSending = false;
    updateInputLimit();
    renderConversation();
    caseText.focus();
  }
}

async function classifyWithApi(endpoint, caseFacts, requestConversation) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseText: caseFacts,
      conversation: requestConversation,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

function renderExamples() {
  examplesEl.innerHTML = examples
    .map((example) => `<button type="button" class="example">${escapeHtml(example)}</button>`)
    .join("");

  for (const button of examplesEl.querySelectorAll("button")) {
    button.addEventListener("click", () => sendMessage(button.textContent));
  }
}

function clearConversation() {
  conversation = [];
  matchState.textContent = "Ready";
  caseText.value = "";
  updateInputLimit();
  renderConversation();
  caseText.focus();
}

renderExamples();
renderConversation();
updateInputLimit();
sendBtn.addEventListener("click", () => sendMessage());
caseText.addEventListener("input", updateInputLimit);
caseText.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    sendMessage();
  }
});
clearBtn.addEventListener("click", clearConversation);
