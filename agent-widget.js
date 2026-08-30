/* BlackStone Agent Widget
   Reads config from window.BS_AGENT_CONFIG (set in index.html):
     - apiUrl: POST endpoint on the Render backend, e.g. https://blackstone-agent-backend.onrender.com/api/chat
     - bookingLink: real Google Calendar appointment-schedule link
*/

(function () {
  const CONFIG = window.BS_AGENT_CONFIG || {};
  const API_URL = CONFIG.apiUrl || "";
  const BOOKING_LINK = CONFIG.bookingLink || "#";

  const STYLE = `
    #bs-widget-root { font-family: 'Inter', sans-serif; }
    .bs-launcher-btn {
      width: 58px; height: 58px; border-radius: 50%;
      background: #f4f0e6; color: #0e0e0d;
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      transition: transform 0.2s;
    }
    .bs-launcher-btn:hover { transform: scale(1.06); }
    .bs-panel {
      position: fixed; bottom: 96px; right: 24px;
      width: 360px; max-width: calc(100vw - 32px);
      height: 500px; max-height: calc(100vh - 140px);
      background: #17160f; border: 1px solid #3a372f;
      border-radius: 12px; display: none;
      flex-direction: column; overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      z-index: 99;
    }
    .bs-panel.bs-open { display: flex; }
    .bs-panel-header {
      padding: 16px 18px; border-bottom: 1px solid #3a372f;
      display: flex; align-items: center; justify-content: space-between;
      color: #f4f0e6; font-weight: 600;
    }
    .bs-panel-header .bs-close { cursor: pointer; color: #9a9485; font-size: 18px; background:none; border:none; }
    .bs-messages {
      flex: 1; overflow-y: auto; padding: 16px 18px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .bs-msg { font-size: 14px; line-height: 1.5; max-width: 85%; padding: 10px 13px; border-radius: 10px; }
    .bs-msg.bs-agent { align-self: flex-start; background: #26241a; color: #f4f0e6; }
    .bs-msg.bs-user { align-self: flex-end; background: #f4f0e6; color: #0e0e0d; }
    .bs-msg.bs-typing { align-self: flex-start; color: #9a9485; font-style: italic; }
    .bs-input-row {
      border-top: 1px solid #3a372f; padding: 12px;
      display: flex; gap: 8px;
    }
    .bs-input-row input {
      flex: 1; background: #0e0e0d; border: 1px solid #3a372f;
      color: #f4f0e6; padding: 10px 12px; border-radius: 8px; font-size: 14px;
      outline: none;
    }
    .bs-input-row button {
      background: #f4f0e6; color: #0e0e0d; border: none;
      padding: 0 16px; border-radius: 8px; font-weight: 600; cursor: pointer;
      font-size: 13px;
    }
    .bs-book-btn {
      display: block; margin: 10px 18px 16px; text-align: center;
      background: #f4f0e6; color: #0e0e0d; padding: 11px; border-radius: 8px;
      font-weight: 600; font-size: 13px; text-decoration: none;
    }
  `;

  function injectStyles() {
    const tag = document.createElement("style");
    tag.textContent = STYLE;
    document.head.appendChild(tag);
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => node.appendChild(c));
    return node;
  }

  const state = {
    open: false,
    history: [],       // {role: 'user'|'assistant', content: string}
    lead: { name: null, email: null, need: null },
    leadCaptured: false,
    showBookingLink: false,
  };

  let messagesEl, panelEl, inputEl;

  function render() {
    panelEl.classList.toggle("bs-open", state.open);
  }

  function addMessage(role, text) {
    const bubble = el("div", { class: `bs-msg bs-${role === "user" ? "user" : "agent"}` });
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addTyping() {
    const bubble = el("div", { class: "bs-msg bs-typing", id: "bs-typing-indicator" });
    bubble.textContent = "Typing…";
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById("bs-typing-indicator");
    if (t) t.remove();
  }

  function maybeShowBookingLink() {
    if (state.showBookingLink) return;
    const { name, email, need } = state.lead;
    if (name && email && need) {
      state.showBookingLink = true;
      const link = el("a", { class: "bs-book-btn", href: BOOKING_LINK, target: "_blank", rel: "noopener" });
      link.textContent = "Book your call";
      panelEl.insertBefore(link, panelEl.querySelector(".bs-input-row"));
    }
  }

  async function sendToBackend(userText) {
    state.history.push({ role: "user", content: userText });
    addTyping();
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: state.history,
          leadInfo: state.lead,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Bad response from agent backend");
      }
      const data = await res.json();

      removeTyping();
      const replyText = data.reply || "Sorry, I didn't catch that — could you rephrase?";
      addMessage("assistant", replyText);
      state.history.push({ role: "assistant", content: replyText });

      if (data.bookingLink && !state.showBookingLink) {
        state.showBookingLink = true;
        const link = el("a", { class: "bs-book-btn", href: data.bookingLink, target: "_blank", rel: "noopener" });
        link.textContent = "Book your call";
        panelEl.insertBefore(link, panelEl.querySelector(".bs-input-row"));
      }
    } catch (err) {
      removeTyping();
      addMessage(
        "assistant",
        "Something went wrong reaching the agent — please try again in a moment, or email mccreary091@gmail.com directly."
      );
      console.error("BlackStone widget error:", err);
    }
  }

  function handleSend() {
    const text = inputEl.value.trim();
    if (!text) return;
    addMessage("user", text);
    inputEl.value = "";
    sendToBackend(text);
  }

  function buildWidget() {
    injectStyles();

    const root = el("div", { id: "bs-widget-root" });

    const launcherBtn = el(
      "button",
      { class: "bs-launcher-btn", "aria-label": "Open chat" },
      [
        el("span", {
          html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12C20 16.42 16.42 20 12 20C10.6 20 9.27 19.64 8.11 19L4 20L5.06 16.13C4.39 14.9 4 13.5 4 12Z" stroke="#0e0e0d" stroke-width="1.4"/>
          </svg>`,
        }),
      ]
    );

    panelEl = el("div", { class: "bs-panel" });
    const header = el("div", { class: "bs-panel-header" }, [
      document.createTextNode("BlackStone"),
    ]);
    const closeBtn = el("button", { class: "bs-close", "aria-label": "Close chat" });
    closeBtn.textContent = "✕";
    header.appendChild(closeBtn);

    messagesEl = el("div", { class: "bs-messages" });

    const inputRow = el("div", { class: "bs-input-row" });
    inputEl = el("input", { type: "text", placeholder: "Type a message…" });
    const sendBtn = el("button", {});
    sendBtn.textContent = "Send";
    inputRow.appendChild(inputEl);
    inputRow.appendChild(sendBtn);

    panelEl.appendChild(header);
    panelEl.appendChild(messagesEl);
    panelEl.appendChild(inputRow);

    root.appendChild(launcherBtn);
    root.appendChild(panelEl);

    document.getElementById("bs-chat-launcher").appendChild(root);

    launcherBtn.addEventListener("click", () => {
      state.open = !state.open;
      render();
      if (state.open && state.history.length === 0) {
        addMessage(
          "assistant",
          "Hey — I'm the BlackStone agent. Tell me a bit about your business and what you're looking for, and I'll point you in the right direction."
        );
      }
    });
    closeBtn.addEventListener("click", () => {
      state.open = false;
      render();
    });
    sendBtn.addEventListener("click", handleSend);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSend();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
