export default {
  manifest: {
    id: "swipe-to-quote",
    name: "左滑引用消息",
    apiVersion: 1,
    version: "2.1.0",
    author: "工坊",
    description: "QQ 同款交互：向左滑动消息气泡直接引用回复。单聊绝不串台，群聊自动识别成员好友备注，AI 深度感知！",
    permissions: ["chat.read"],
    settings: [
      {
        key: "nameDisplayMode",
        label: "引用称呼显示方式",
        type: "select",
        default: "alias",
        options: [
          { value: "alias", label: "🏷️ 优先备注名 (如「引用 笨蛋」)" },
          { value: "charName", label: "👤 角色原名 (卡片本名)" },
          { value: "generic", label: "💬 固定显示 (「引用 对方」)" },
        ],
      },
      {
        key: "threshold",
        label: "触发滑动距离 (像素)",
        type: "number",
        default: 44,
      },
      {
        key: "vibrate",
        label: "震动反馈",
        type: "boolean",
        default: true,
      },
      {
        key: "autoFocus",
        label: "引用后自动聚焦输入框",
        type: "boolean",
        default: true,
      },
    ],
  },

  setup(ctx) {
    let activeQuote = null; // { id, role, senderName, preview }

    const PRESET_LIST = [
      { name: "科技蓝", val: "#3b82f6" },
      { name: "樱花粉", val: "#ec4899" },
      { name: "薄荷绿", val: "#10b981" },
      { name: "梦幻紫", val: "#8b5cf6" },
      { name: "暖阳橙", val: "#f97316" },
      { name: "珊瑚红", val: "#ef4444" },
      { name: "曜石黑", val: "#374151" },
    ];

    function getThemeColor() {
      const c = ctx.system.settings.get("themeColor");
      if (typeof c === "string" && c.trim()) {
        return c.trim();
      }
      return "#3b82f6";
    }

    function syncThemeCssVar() {
      const color = getThemeColor();
      document.documentElement.style.setProperty("--stq-color", color);
    }
    syncThemeCssVar();

    if (ctx.system.settings.onChange) {
      ctx.system.settings.onChange(() => {
        syncThemeCssVar();
        renderQuoteBar();
      });
    }

    // ── 1. 注入样式 ───────────────────────────────────────────────
    ctx.ui.injectCSS(`
      :root {
        --stq-color: #3b82f6;
      }

      .stq-force-visible {
        overflow: visible !important;
      }
      .stq-swiping {
        touch-action: pan-y !important;
        will-change: transform;
        transition: none !important;
      }
      .stq-animating {
        transition: transform 0.24s cubic-bezier(0.18, 0.9, 0.3, 1.15) !important;
      }

      /* 气泡右侧指示器 */
      .stq-indicator {
        position: absolute !important;
        right: -38px !important;
        top: 50% !important;
        transform: translateY(-50%) scale(0.6) !important;
        width: 32px !important;
        height: 32px !important;
        border-radius: 50% !important;
        background: rgba(0, 0, 0, 0.16) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity 0.12s ease, transform 0.12s ease, background-color 0.12s ease !important;
        z-index: 99 !important;
        color: #ffffff !important;
      }
      .stq-indicator.stq-active {
        background-color: var(--stq-color, #3b82f6) !important;
        transform: translateY(-50%) scale(1.06) !important;
        opacity: 1 !important;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.28) !important;
      }
      .stq-indicator svg {
        width: 17px !important;
        height: 17px !important;
        fill: currentColor !important;
        transition: transform 0.16s ease !important;
      }
      .stq-indicator.stq-active svg {
        transform: rotate(-15deg) !important;
      }

      /* 抗美化穿透的精致引用卡片 */
      .stq-quote-bar {
        display: flex !important;
        align-items: flex-start !important;
        justify-content: space-between !important;
        width: calc(100% - 16px) !important;
        box-sizing: border-box !important;
        margin: 4px 8px 6px 8px !important;
        padding: 5px 10px 5px 8px !important;
        background: rgba(127, 127, 127, 0.08) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
        border-left: 3.5px solid var(--stq-color, #3b82f6) !important;
        border-radius: 0 8px 8px 0 !important;
        flex-shrink: 0 !important;
        position: relative !important;
        z-index: 20 !important;
        visibility: visible !important;
        opacity: 1 !important;
        max-height: 48px !important;
        overflow: hidden !important;
      }
      .stq-quote-content {
        flex: 1 !important;
        min-width: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 1px !important;
        overflow: hidden !important;
      }
      .stq-quote-sender {
        font-size: 11.5px !important;
        font-weight: 600 !important;
        color: var(--stq-color, #3b82f6) !important;
        line-height: 1.25 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      .stq-quote-text {
        font-size: 12px !important;
        color: var(--c-icon, #666) !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        line-height: 1.3 !important;
        opacity: 0.88 !important;
      }
      .stq-quote-close {
        flex-shrink: 0 !important;
        width: 22px !important;
        height: 22px !important;
        border: none !important;
        background: transparent !important;
        cursor: pointer !important;
        color: var(--c-icon, #888) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 50% !important;
        padding: 0 !important;
        margin-top: -1px !important;
      }
      .stq-quote-close:active {
        background: rgba(0, 0, 0, 0.12) !important;
      }

      /* 折叠调色盘面板 */
      .stq-fold-card {
        border-radius: 12px;
        background: var(--c-sub-bg, rgba(0, 0, 0, 0.03));
        margin-top: 10px;
        overflow: hidden;
        border: 1px solid rgba(0, 0, 0, 0.06);
      }
      .stq-fold-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        cursor: pointer;
        user-select: none;
        background: transparent;
      }
      .stq-fold-header:active {
        background: rgba(0, 0, 0, 0.03);
      }
      .stq-fold-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
        color: var(--c-text, #333);
      }
      .stq-current-dot-preview {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--stq-color, #3b82f6);
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        display: inline-block;
      }
      .stq-fold-arrow {
        width: 18px;
        height: 18px;
        color: var(--c-icon, #888);
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .stq-fold-arrow.stq-open {
        transform: rotate(90deg);
      }
      .stq-fold-body {
        display: none;
        flex-direction: column;
        gap: 12px;
        padding: 4px 14px 14px 14px;
        border-top: 1px solid rgba(0, 0, 0, 0.04);
      }
      .stq-fold-body.stq-open {
        display: flex;
      }
      .stq-palette-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .stq-color-dot {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        padding: 0;
        transition: transform 0.15s ease, border-color 0.15s ease;
      }
      .stq-color-dot:active {
        transform: scale(0.9);
      }
      .stq-color-dot.stq-dot-selected {
        border-color: #ffffff;
        box-shadow: 0 0 0 2px var(--stq-color, #3b82f6);
        transform: scale(1.1);
      }
      .stq-picker-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: 4px;
        font-size: 12px;
      }
      .stq-color-input {
        width: 32px;
        height: 30px;
        border: 1px solid rgba(0, 0, 0, 0.15);
        border-radius: 6px;
        cursor: pointer;
        padding: 0;
        background: transparent;
      }
    `);

    // ── 2. 设置区折叠调色盘 ────────────────────────────────────────
    ctx.ui.slot("settings.section", (el) => {
      let isFolded = true;

      function renderFoldedPalette() {
        const currentColor = getThemeColor();
        el.innerHTML = `
          <div class="stq-fold-card">
            <div class="stq-fold-header" id="stq-toggle-header">
              <div class="stq-fold-title">
                <span class="stq-current-dot-preview" style="background:${currentColor}"></span>
                <span>🎨 自定义调色盘与色卡</span>
              </div>
              <svg class="stq-fold-arrow ${isFolded ? '' : 'stq-open'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
            <div class="stq-fold-body ${isFolded ? '' : 'stq-open'}">
              <div class="stq-palette-row">
                ${PRESET_LIST.map((item) => `
                  <button type="button" class="stq-color-dot ${currentColor.toLowerCase() === item.val.toLowerCase() ? 'stq-dot-selected' : ''}"
                    data-val="${item.val}" style="background: ${item.val};" title="${item.name}"></button>
                `).join('')}
                <div class="stq-picker-wrap">
                  <input type="color" class="stq-color-input" id="stq-native-picker" value="${currentColor.startsWith('#') ? currentColor : '#3b82f6'}">
                  <span>滑动色盘</span>
                </div>
              </div>
            </div>
          </div>
        `;

        const header = el.querySelector("#stq-toggle-header");
        if (header) {
          header.onclick = () => {
            isFolded = !isFolded;
            renderFoldedPalette();
          };
        }

        el.querySelectorAll(".stq-color-dot").forEach((btn) => {
          btn.addEventListener("click", () => {
            const val = btn.getAttribute("data-val");
            ctx.system.settings.set("themeColor", val);
            syncThemeCssVar();
            renderFoldedPalette();
            renderQuoteBar();
          });
        });

        const picker = el.querySelector("#stq-native-picker");
        if (picker) {
          picker.addEventListener("input", (e) => {
            const chosen = e.target.value;
            ctx.system.settings.set("themeColor", chosen);
            syncThemeCssVar();
            renderFoldedPalette();
            renderQuoteBar();
          });
        }
      }

      renderFoldedPalette();
    });

    // ── 3. 严格按 DOM 层级与底层数据库精准解析名字 ──────────────────
    function getSessionByElement(wrap) {
      if (!wrap) return null;
      const room = wrap.closest(".chat-room-wrapper, .page-shell");
      if (room && room.className) {
        const m = room.className.match(/session-([a-zA-Z0-9_-]+)/);
        if (m && m[1]) {
          const found = ctx.data.sessions.get(m[1]);
          if (found) return found;
        }
      }
      return null;
    }

    // 给定 characterId，查找你在私聊或通讯录里给 TA 设的备注名
    function findCharacterAlias(charId) {
      if (!charId) return "";
      const sessions = ctx.data.sessions.list();
      const directSession = sessions.find(s => !s.isGroup && s.contactId === charId);
      if (directSession && directSession.alias && directSession.alias.trim()) {
        return directSession.alias.trim();
      }
      const contacts = ctx.data.contacts.list();
      const directContact = contacts.find(c => c.characterId === charId);
      if (directContact && directContact.nickname && directContact.nickname.trim()) {
        return directContact.nickname.trim();
      }
      return "";
    }

    function resolveSenderDisplayName(targetMsg, wrap) {
      if (!targetMsg) return "对方";
      if (targetMsg.role === "user") return "你";

      const mode = ctx.system.settings.get("nameDisplayMode") || "alias";

      // 模式 1：固定显示「对方」
      if (mode === "generic") {
        return "对方";
      }

      const currentSession = getSessionByElement(wrap);
      const targetCharId = targetMsg.senderCharacterId || (currentSession && !currentSession.isGroup ? currentSession.contactId : "");

      // 提取原卡片名
      let charOriginalName = "";
      if (targetCharId) {
        const c = ctx.data.characters.get(targetCharId);
        if (c && c.name) charOriginalName = c.name;
      }
      if (!charOriginalName && targetMsg.senderName) {
        charOriginalName = targetMsg.senderName;
      }

      // 模式 2：角色原名
      if (mode === "charName") {
        return charOriginalName || targetMsg.senderName || "对方";
      }

      // 模式 3：优先备注名（单聊 + 群聊双向支持）
      // A. 单聊：当前会话自己的备注
      if (currentSession && !currentSession.isGroup && currentSession.alias && currentSession.alias.trim()) {
        return currentSession.alias.trim();
      }

      // B. 群聊或有对应 characterId：去好友通讯录/单聊检索该成员的专属备注
      if (targetCharId) {
        const customAlias = findCharacterAlias(targetCharId);
        if (customAlias) return customAlias;
      }

      // C. 兜底显示原名或群名片
      return charOriginalName || targetMsg.senderName || "对方";
    }

    function getActiveInputBar(anchorEl) {
      if (anchorEl) {
        const room = anchorEl.closest(".chat-room-wrapper, .page-shell");
        if (room) {
          const bar = room.querySelector(".chat-input-bar");
          if (bar) return bar;
        }
      }
      const allBars = Array.from(document.querySelectorAll(".chat-input-bar"));
      for (let i = allBars.length - 1; i >= 0; i--) {
        const b = allBars[i];
        if (b.offsetParent !== null || window.getComputedStyle(b).display !== "none") {
          return b;
        }
      }
      return allBars[allBars.length - 1] || null;
    }

    function escapeHtml(str) {
      return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function getMessagePreview(msg) {
      if (!msg) return "消息";
      if (msg.mediaType === "audio") return "[语音条] " + (msg.mediaData?.label || "");
      if (msg.mediaType === "image") return "[图片] " + (msg.mediaData?.label || "");
      if (msg.mediaType === "red_packet") return "[红包]";
      if (msg.mediaType === "transfer") return "[转账]";
      if (msg.mediaType === "gift") return "[礼物]";
      if (msg.mediaType === "sticker") return `[表情: ${msg.mediaData?.name || "表情包"}]`;
      return (msg.content || "").replace(/\s+/g, " ").trim().slice(0, 48) || "消息";
    }

    // ── 4. 挂载引用卡片 ────────────────────────────────────────────
    function renderQuoteBar(anchorEl) {
      syncThemeCssVar();
      const inputBar = getActiveInputBar(anchorEl);
      if (!inputBar) return;

      let bar = inputBar.querySelector(".stq-quote-bar");

      if (!activeQuote) {
        if (bar) bar.remove();
        return;
      }

      if (!bar) {
        bar = document.createElement("div");
        bar.className = "stq-quote-bar";
        const textarea = inputBar.querySelector(".chat-input-textarea");
        if (textarea) {
          inputBar.insertBefore(bar, textarea);
        } else {
          inputBar.prepend(bar);
        }
      }

      bar.innerHTML = `
        <div class="stq-quote-content">
          <div class="stq-quote-sender">引用 ${escapeHtml(activeQuote.senderName)}</div>
          <div class="stq-quote-text">${escapeHtml(activeQuote.preview)}</div>
        </div>
        <button type="button" class="stq-quote-close" title="取消引用" aria-label="取消引用">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      const closeBtn = bar.querySelector(".stq-quote-close");
      if (closeBtn) {
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          clearQuote();
        };
      }
    }

    function setQuote(msg, anchorEl) {
      if (!msg) return;
      const previewText = getMessagePreview(msg);

      activeQuote = {
        id: msg.id,
        role: msg.role || "assistant",
        senderName: msg.senderName || "对方",
        preview: previewText,
      };

      renderQuoteBar(anchorEl);

      if (ctx.system.settings.get("autoFocus") !== false) {
        const inputBar = getActiveInputBar(anchorEl);
        const textarea = inputBar?.querySelector(".chat-input-textarea");
        if (textarea) {
          textarea.focus();
        }
      }
    }

    function clearQuote() {
      activeQuote = null;
      document.querySelectorAll(".stq-quote-bar").forEach((b) => b.remove());
    }

    // ── 5. 拦截消息并向 AI 注入引用感知 ────────────────────────────
    ctx.hooks.transform("message.beforePersist", (payload) => {
      if (!payload || !payload.message) return payload;
      const msg = payload.message;

      if (msg.role === "user" && activeQuote && !msg.mediaType) {
        msg.mediaType = "quote";
        msg.mediaData = {
          quoteMessageId: activeQuote.id,
          quotePreview: `${activeQuote.senderName}: ${activeQuote.preview}`,
          quoteRole: activeQuote.role,
        };
        clearQuote();
      }

      return payload;
    });

    ctx.hooks.transform("prompt.system", (payload) => {
      if (payload && typeof payload.hint === "string") {
        payload.hint += "\n[系统规则: 若用户的消息带有 [引用:某某: 内容] 前缀，表明用户正在专门针对该条具体历史内容进行定向回复，请结合引用的内容自然作答。]";
      }
      return payload;
    });

    ctx.hooks.on("session.opened", () => {
      clearQuote();
      syncThemeCssVar();
    });

    // ── 6. 手势滑动引擎 ────────────────────────────────────────────
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let deltaY = 0;
    let isTracking = false;
    let isHorizontalGesture = null;
    let currentTargetWrap = null;
    let currentIndicator = null;
    let currentMsgId = null;
    let hasVibrated = false;

    function cleanupIndicators() {
      document.querySelectorAll(".stq-indicator").forEach((el) => el.remove());
      currentIndicator = null;
    }

    function findMessageTarget(target) {
      if (!target || typeof target.closest !== "function") return null;

      if (target.closest(".ctx-menu, .chat-input-bar, .page-header, .chat-theater-mode-strip, .stq-fold-card")) {
        return null;
      }

      const wrap = target.closest(
        ".chat-msg-content-wrap, .chat-bubble-role-user, .chat-bubble-role-assistant, .chat-offline-text, .chat-offline-entry"
      );
      if (!wrap) return null;

      const msgWrapper = target.closest('[id^="message-"]') || wrap.closest('[id^="message-"]');
      let id = "";
      if (msgWrapper && msgWrapper.id) {
        id = msgWrapper.id.replace(/^message-/, "");
      } else {
        id = wrap.getAttribute("data-msg-id") || "";
      }

      return { el: wrap, id, rowEl: msgWrapper || wrap.parentElement };
    }

    function createIndicator(parent) {
      const ind = document.createElement("div");
      ind.className = "stq-indicator";
      ind.innerHTML = `
        <svg viewBox="0 0 24 24">
          <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
        </svg>
      `;
      parent.style.position = "relative";
      parent.classList.add("stq-force-visible");
      parent.appendChild(ind);
      return ind;
    }

    function handleStart(clientX, clientY, target) {
      cleanupIndicators();

      const match = findMessageTarget(target);
      if (!match) return;

      startX = clientX;
      startY = clientY;
      deltaX = 0;
      deltaY = 0;
      isTracking = true;
      isHorizontalGesture = null;
      currentTargetWrap = match.el;
      currentMsgId = match.id;
      hasVibrated = false;

      currentIndicator = createIndicator(currentTargetWrap);
    }

    function handleMove(clientX, clientY, cancelEvent) {
      if (!isTracking || !currentTargetWrap) return;

      deltaX = clientX - startX;
      deltaY = clientY - startY;

      if (isHorizontalGesture === null) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        if (absX > 5 || absY > 5) {
          if (absX > absY && deltaX < 0) {
            isHorizontalGesture = true;
            currentTargetWrap.classList.add("stq-swiping");
          } else {
            isHorizontalGesture = false;
          }
        }
      }

      if (!isHorizontalGesture) return;

      if (cancelEvent && cancelEvent.cancelable) {
        cancelEvent.preventDefault();
      }

      const threshold = Number(ctx.system.settings.get("threshold")) || 44;
      let moveX = Math.min(0, deltaX);
      if (moveX < -65) {
        moveX = -65 + (moveX + 65) * 0.22;
      }

      currentTargetWrap.style.transform = `translateX(${moveX}px)`;

      if (currentIndicator) {
        const progress = Math.min(1, Math.abs(moveX) / threshold);
        currentIndicator.style.opacity = (progress * 0.96).toString();
        currentIndicator.style.transform = `translateY(-50%) scale(${0.6 + progress * 0.46})`;

        const reached = Math.abs(moveX) >= threshold;

        if (reached) {
          if (!currentIndicator.classList.contains("stq-active")) {
            currentIndicator.classList.add("stq-active");
            if (!hasVibrated && ctx.system.settings.get("vibrate") !== false) {
              if (typeof navigator !== "undefined" && navigator.vibrate) {
                navigator.vibrate(18);
              }
              hasVibrated = true;
            }
          }
        } else {
          currentIndicator.classList.remove("stq-active");
          hasVibrated = false;
        }
      }
    }

    function handleEnd() {
      if (!isTracking || !currentTargetWrap) {
        resetGesture();
        return;
      }

      const threshold = Number(ctx.system.settings.get("threshold")) || 44;
      const triggered = isHorizontalGesture && Math.abs(deltaX) >= threshold;

      const wrap = currentTargetWrap;
      const ind = currentIndicator;
      const msgId = currentMsgId;

      wrap.classList.remove("stq-swiping");
      wrap.classList.add("stq-animating");
      wrap.style.transform = "translateX(0px)";

      if (triggered && wrap) {
        const isUser = Boolean(wrap.closest('[data-role="user"]'));
        const bubble = wrap.querySelector(".chat-markdown-paragraph, .ts-14, p, [data-chat-plugin-kind]") || wrap;

        // 100% 依据该气泡所属的真实房间提取消息
        const session = getSessionByElement(wrap);
        const messages = session ? ctx.data.messages.list(session.id) : [];
        const realMsg = msgId ? messages.find(m => m.id === msgId) : null;

        const targetMsg = {
          id: msgId || (realMsg ? realMsg.id : `dom_${Date.now()}`),
          role: realMsg ? realMsg.role : (isUser ? "user" : "assistant"),
          senderName: realMsg ? realMsg.senderName : undefined,
          senderCharacterId: realMsg ? realMsg.senderCharacterId : (session && !session.isGroup ? session.contactId : undefined),
          content: bubble.textContent ? bubble.textContent.trim() : (realMsg ? realMsg.content : "消息"),
          mediaType: realMsg ? realMsg.mediaType : undefined,
          mediaData: realMsg ? realMsg.mediaData : undefined,
        };

        const displayName = resolveSenderDisplayName(targetMsg, wrap);
        targetMsg.senderName = displayName;

        setQuote(targetMsg, wrap);
      }

      setTimeout(() => {
        if (wrap) {
          wrap.classList.remove("stq-animating");
          wrap.classList.remove("stq-force-visible");
          wrap.style.transform = "";
        }
        if (ind) ind.remove();
      }, 260);

      resetGesture();
    }

    function resetGesture() {
      isTracking = false;
      isHorizontalGesture = null;
      currentTargetWrap = null;
      currentIndicator = null;
      currentMsgId = null;
      deltaX = 0;
      deltaY = 0;
    }

    // ── 7. 全局事件绑定 ────────────────────────────────────────────
    const onTouchStart = (e) => {
      if (e.touches && e.touches.length === 1) {
        handleStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
      }
    };
    const onTouchMove = (e) => {
      if (e.touches && e.touches.length === 1) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY, e);
      }
    };
    const onTouchEnd = () => handleEnd();
    const onTouchCancel = () => handleEnd();

    const onMouseDown = (e) => {
      if (e.button === 0) handleStart(e.clientX, e.clientY, e.target);
    };
    const onMouseMove = (e) => handleMove(e.clientX, e.clientY, e);
    const onMouseUp = () => handleEnd();

    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true, capture: true });

    document.addEventListener("mousedown", onMouseDown, { passive: true, capture: true });
    document.addEventListener("mousemove", onMouseMove, { passive: false, capture: true });
    document.addEventListener("mouseup", onMouseUp, { passive: true, capture: true });

    // ── 8. 清理 ────────────────────────────────────────────────────
    return () => {
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchmove", onTouchMove, { capture: true });
      document.removeEventListener("touchend", onTouchEnd, { capture: true });
      document.removeEventListener("touchcancel", onTouchCancel, { capture: true });

      document.removeEventListener("mousedown", onMouseDown, { capture: true });
      document.removeEventListener("mousemove", onMouseMove, { capture: true });
      document.removeEventListener("mouseup", onMouseUp, { capture: true });

      cleanupIndicators();
      clearQuote();
    };
  },
};
