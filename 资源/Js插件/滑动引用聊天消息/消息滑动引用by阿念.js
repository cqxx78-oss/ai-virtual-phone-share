export default {
  manifest: {
    id: "swipe-to-quote",
    name: "左滑引用消息",
    apiVersion: 1,
    version: "3.0.0",
    author: "工坊",
    description: "QQ 同款交互：向左滑动消息气泡直接引用回复。智能感知主题美化（有引用美化100%跟随，无美化自动启用专属双行彩色卡片）！",
    permissions: ["chat.read"],
    settings: [
      {
        key: "barStyleMode",
        label: "引用框样式模式",
        type: "select",
        default: "auto",
        options: [
          { value: "auto", label: "🌟 智能自适应 (有引用美化跟美化，无美化用双行卡片)" },
          { value: "customCard", label: "🎨 固定使用专属双行彩色卡片" },
          { value: "nativeFollow", label: "🫧 固定跟随原生/美化 (与长按引用一致)" },
        ],
      },
      {
        key: "botSwipeDir",
        label: "引用对方消息滑动方向",
        type: "select",
        default: "left",
        options: [
          { value: "left", label: "⬅️ 向左滑 (默认)" },
          { value: "right", label: "➡️ 向右滑" },
        ],
      },
      {
        key: "userSwipeDir",
        label: "引用自己消息滑动方向",
        type: "select",
        default: "left",
        options: [
          { value: "left", label: "⬅️ 向左滑 (默认)" },
          { value: "right", label: "➡️ 向右滑" },
        ],
      },
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
    let activeQuote = null;

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
      return (typeof c === "string" && c.trim()) ? c.trim() : "#3b82f6";
    }

    function syncThemeCssVar() {
      document.documentElement.style.setProperty("--stq-color", getThemeColor());
    }
    syncThemeCssVar();

    if (ctx.system.settings.onChange) {
      ctx.system.settings.onChange(() => {
        syncThemeCssVar();
        renderQuoteBar();
      });
    }

    // ── 1. 注入轻量核心样式 ─────────────────────────────────────────
    ctx.ui.injectCSS([
      ":root { --stq-color: #3b82f6; }",
      ".stq-force-visible { overflow: visible !important; }",
      ".stq-swiping { touch-action: pan-y !important; will-change: transform; transition: none !important; }",
      ".stq-animating { transition: transform 0.24s cubic-bezier(0.18, 0.9, 0.3, 1.15) !important; }",
      ".chat-input-bar .chat-input-textarea { min-height: 36px !important; flex-shrink: 0 !important; }",
      ".stq-indicator { position: absolute !important; top: 50% !important; transform: translateY(-50%) scale(0.6) !important; width: 32px !important; height: 32px !important; border-radius: 50% !important; background: rgba(0, 0, 0, 0.16) !important; display: flex !important; align-items: center !important; justify-content: center !important; opacity: 0 !important; pointer-events: none !important; transition: opacity 0.12s ease, transform 0.12s ease, background-color 0.12s ease !important; z-index: 99 !important; color: #ffffff !important; }",
      ".stq-indicator-right { right: -38px !important; left: auto !important; }",
      ".stq-indicator-left { left: -38px !important; right: auto !important; }",
      ".stq-indicator.stq-active { background-color: var(--stq-color, #3b82f6) !important; transform: translateY(-50%) scale(1.06) !important; opacity: 1 !important; box-shadow: 0 3px 10px rgba(0, 0, 0, 0.28) !important; }",
      ".stq-indicator svg { width: 17px !important; height: 17px !important; fill: currentColor !important; transition: transform 0.16s ease !important; }",
      ".stq-indicator.stq-active svg { transform: rotate(-15deg); }",
      ".chat-input-bar .chat-quote-bar.stq-standalone-card { display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 8px !important; margin: 4px 10px 4px 10px !important; padding: 5px 10px 5px 8px !important; background: var(--c-sub-bg, rgba(127, 127, 127, 0.08)) !important; background: color-mix(in srgb, var(--c-icon, #888) 12%, transparent) !important; border-left: 3.5px solid var(--stq-color, #3b82f6) !important; border-radius: 0 6px 6px 0 !important; box-sizing: border-box !important; min-height: 38px !important; max-height: 48px !important; overflow: hidden !important; flex-shrink: 0 !important; animation: stqFadeIn 0.18s ease; }",
      "@keyframes stqFadeIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }",
      ".chat-quote-bar.stq-standalone-card .stq-quote-col { flex: 1 !important; min-width: 0 !important; display: flex !important; flex-direction: column !important; justify-content: center !important; gap: 2px !important; overflow: hidden !important; }",
      ".chat-quote-bar.stq-standalone-card .stq-quote-sender-line { font-size: 11.5px !important; font-weight: 600 !important; color: var(--c-text, #333) !important; line-height: 1.25 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }",
      ".chat-quote-bar.stq-standalone-card .stq-quote-body-line { font-size: 11.5px !important; color: var(--c-icon, #666) !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; line-height: 1.25 !important; opacity: 0.85 !important; }",
      ".chat-quote-bar.stq-standalone-card .stq-quote-close-btn { flex-shrink: 0 !important; width: 22px !important; height: 22px !important; border: none !important; background: transparent !important; cursor: pointer !important; color: var(--c-icon, #888) !important; display: flex !important; align-items: center !important; justify-content: center !important; border-radius: 50% !important; padding: 0 !important; }",
      ".stq-fold-card { border-radius: 12px; background: var(--c-sub-bg, rgba(0, 0, 0, 0.03)); margin-top: 10px; overflow: hidden; border: 1px solid rgba(0, 0, 0, 0.06); }",
      ".stq-fold-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; cursor: pointer; user-select: none; background: transparent; }",
      ".stq-fold-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--c-text, #333); }",
      ".stq-current-dot-preview { width: 14px; height: 14px; border-radius: 50%; background: var(--stq-color, #3b82f6); box-shadow: 0 1px 3px rgba(0,0,0,0.2); display: inline-block; }",
      ".stq-fold-arrow { width: 18px; height: 18px; color: var(--c-icon, #888); transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1); }",
      ".stq-fold-arrow.stq-open { transform: rotate(90deg); }",
      ".stq-fold-body { display: none; flex-direction: column; gap: 12px; padding: 4px 14px 14px 14px; border-top: 1px solid rgba(0, 0, 0, 0.04); }",
      ".stq-fold-body.stq-open { display: flex; }",
      ".stq-palette-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }",
      ".stq-color-dot { width: 26px; height: 26px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; transition: transform 0.15s ease; }",
      ".stq-color-dot.stq-dot-selected { border-color: #ffffff; box-shadow: 0 0 0 2px var(--stq-color, #3b82f6); transform: scale(1.1); }",
      ".stq-picker-wrap { display: flex; align-items: center; gap: 6px; margin-left: 4px; font-size: 12px; }",
      ".stq-color-input { width: 32px; height: 30px; border: 1px solid rgba(0, 0, 0, 0.15); border-radius: 6px; cursor: pointer; padding: 0; background: transparent; }"
    ].join("\n"));

    // ── 2. 设置区折叠调色盘 ────────────────────────────────────────
    ctx.ui.slot("settings.section", (el) => {
      let isFolded = true;

      function renderFoldedPalette() {
        const currentColor = getThemeColor();
        const dotsHtml = PRESET_LIST.map((item) => {
          const isSel = currentColor.toLowerCase() === item.val.toLowerCase();
          return '<button type="button" class="stq-color-dot ' + (isSel ? 'stq-dot-selected' : '') + '" data-val="' + item.val + '" style="background:' + item.val + ';" title="' + item.name + '"></button>';
        }).join("");

        el.innerHTML =
          '<div class="stq-fold-card">' +
            '<div class="stq-fold-header" id="stq-toggle-header">' +
              '<div class="stq-fold-title">' +
                '<span class="stq-current-dot-preview" style="background:' + currentColor + '"></span>' +
                '<span>🎨 自定义调色盘与色卡</span>' +
              '</div>' +
              '<svg class="stq-fold-arrow ' + (isFolded ? '' : 'stq-open') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
                '<polyline points="9 18 15 12 9 6"></polyline>' +
              '</svg>' +
            '</div>' +
            '<div class="stq-fold-body ' + (isFolded ? '' : 'stq-open') + '">' +
              '<div class="stq-palette-row">' +
                dotsHtml +
                '<div class="stq-picker-wrap">' +
                  '<input type="color" class="stq-color-input" id="stq-native-picker" value="' + (currentColor.startsWith('#') ? currentColor : '#3b82f6') + '">' +
                  '<span>滑动选色</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>';

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
            ctx.system.settings.set("themeColor", e.target.value);
            syncThemeCssVar();
            renderFoldedPalette();
            renderQuoteBar();
          });
        }
      }

      renderFoldedPalette();
    });

    // ── 3. 智能检测是否开启了专属引用栏美化 ────────────────────────
    function hasThemeQuoteBarCustomization(wrap) {
      if (typeof document === "undefined") return false;
      const session = getSessionByElement(wrap);
      if (session && session.customCSS && typeof session.customCSS === "string") {
        if (/chat-quote-bar|quote-bar/i.test(session.customCSS)) return true;
      }
      const room = wrap?.closest(".chat-room-wrapper, .page-shell") || document.querySelector(".chat-room-wrapper");
      if (room) {
        const customStyles = room.querySelectorAll("style");
        for (let i = 0; i < customStyles.length; i++) {
          const styleEl = customStyles[i];
          if (styleEl.dataset && styleEl.dataset.chatPlugin) continue;
          if (/chat-quote-bar|quote-bar/i.test(styleEl.textContent || "")) return true;
        }
      }
      return false;
    }

    // ── 4. 底层称呼与会话提取 ──────────────────────────────────────
    function getSessionByElement(wrap) {
      if (!wrap) return null;
      const room = wrap.closest(".chat-room-wrapper, .page-shell");
      if (room && room.className) {
        const m = room.className.match(/session-([a-zA-Z0-9_-]+)/);
        if (m && m[1]) return ctx.data.sessions.get(m[1]);
      }
      return null;
    }

    function findCharacterAlias(charId) {
      if (!charId) return "";
      const sessions = ctx.data.sessions.list();
      const directSession = sessions.find((s) => !s.isGroup && s.contactId === charId);
      if (directSession && directSession.alias && directSession.alias.trim()) {
        return directSession.alias.trim();
      }
      const contacts = ctx.data.contacts.list();
      const directContact = contacts.find((c) => c.characterId === charId);
      if (directContact && directContact.nickname && directContact.nickname.trim()) {
        return directContact.nickname.trim();
      }
      return "";
    }

    function resolveSenderDisplayName(targetMsg, wrap) {
      if (!targetMsg) return "对方";
      if (targetMsg.role === "user") return "你";

      const mode = ctx.system.settings.get("nameDisplayMode") || "alias";
      if (mode === "generic") return "对方";

      const currentSession = getSessionByElement(wrap);
      const targetCharId = targetMsg.senderCharacterId || (currentSession && !currentSession.isGroup ? currentSession.contactId : "");

      let charOriginalName = "";
      if (targetCharId) {
        const c = ctx.data.characters.get(targetCharId);
        if (c && c.name) charOriginalName = c.name;
      }
      if (!charOriginalName && targetMsg.senderName) {
        charOriginalName = targetMsg.senderName;
      }

      if (mode === "charName") return charOriginalName || targetMsg.senderName || "对方";

      if (currentSession && !currentSession.isGroup && currentSession.alias && currentSession.alias.trim()) {
        return currentSession.alias.trim();
      }

      if (targetCharId) {
        const customAlias = findCharacterAlias(targetCharId);
        if (customAlias) return customAlias;
      }

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
      if (msg.mediaType === "sticker") return "[表情: " + (msg.mediaData?.name || "表情包") + "]";
      return (msg.content || "").replace(/\s+/g, " ").trim().slice(0, 48) || "消息";
    }

    // ── 5. 挂载引用卡片 ────────────────────────────────────────────
    function renderQuoteBar(anchorEl) {
      syncThemeCssVar();
      const inputBar = getActiveInputBar(anchorEl);
      if (!inputBar) return;

      let bar = inputBar.querySelector(".chat-quote-bar");

      if (!activeQuote) {
        if (bar) bar.remove();
        return;
      }

      if (!bar) {
        bar = document.createElement("div");
        bar.className = "chat-quote-bar";
        const textarea = inputBar.querySelector(".chat-input-textarea");
        if (textarea) {
          inputBar.insertBefore(bar, textarea);
        } else {
          inputBar.prepend(bar);
        }
      }

      const styleMode = ctx.system.settings.get("barStyleMode") || "auto";
      const hasCustomization = hasThemeQuoteBarCustomization(anchorEl);
      const shouldUseNativeFollow = styleMode === "nativeFollow" || (styleMode === "auto" && hasCustomization);

      if (shouldUseNativeFollow) {
        bar.classList.remove("stq-standalone-card");
        bar.innerHTML =
          '<div class="flex-1 ts-12 text-[var(--c-icon)] overflow-hidden text-ellipsis whitespace-nowrap">' +
            '引用 ' + escapeHtml(activeQuote.senderName) + ': ' + escapeHtml(activeQuote.preview) +
          '</div>' +
          '<button type="button" class="ui-bare-btn text-[var(--c-icon)] ts-16 leading-none p-[2px]" title="取消引用" aria-label="取消引用">✕</button>';
      } else {
        bar.classList.add("stq-standalone-card");
        bar.innerHTML =
          '<div class="stq-quote-col">' +
            '<div class="stq-quote-sender-line">引用 ' + escapeHtml(activeQuote.senderName) + '</div>' +
            '<div class="stq-quote-body-line">' + escapeHtml(activeQuote.preview) + '</div>' +
          '</div>' +
          '<button type="button" class="stq-quote-close-btn" title="取消引用" aria-label="取消引用">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
              '<line x1="18" y1="6" x2="6" y2="18"></line>' +
              '<line x1="6" y1="6" x2="18" y2="18"></line>' +
            '</svg>' +
          '</button>';
      }

      const closeBtn = bar.querySelector("button");
      if (closeBtn) {
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          clearQuote();
        };
      }
    }

    function setQuote(msg, anchorEl) {
      if (!msg) return;
      activeQuote = {
        id: msg.id,
        role: msg.role || "assistant",
        senderName: msg.senderName || "对方",
        preview: getMessagePreview(msg),
      };

      renderQuoteBar(anchorEl);

      if (ctx.system.settings.get("autoFocus") !== false) {
        const inputBar = getActiveInputBar(anchorEl);
        const textarea = inputBar?.querySelector(".chat-input-textarea");
        if (textarea) textarea.focus();
      }
    }

    function clearQuote() {
      activeQuote = null;
      document.querySelectorAll(".chat-quote-bar").forEach((b) => b.remove());
    }

    // ── 6. 拦截消息与注入 AI 感知 ──────────────────────────────────
    ctx.hooks.transform("message.beforePersist", (payload) => {
      if (!payload || !payload.message) return payload;
      const msg = payload.message;

      if (msg.role === "user" && activeQuote && !msg.mediaType) {
        msg.mediaType = "quote";
        msg.mediaData = {
          quoteMessageId: activeQuote.id,
          quotePreview: activeQuote.senderName + ": " + activeQuote.preview,
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

    // ── 7. 双向手势滑动引擎 ────────────────────────────────────────
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let deltaY = 0;
    let isTracking = false;
    let isHorizontalGesture = null;
    let currentTargetWrap = null;
    let currentIndicator = null;
    let currentMsgId = null;
    let currentRequiredDirection = "left";
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

      return { el: wrap, id: id };
    }

    function createIndicator(parent, direction) {
      const ind = document.createElement("div");
      ind.className = "stq-indicator " + (direction === "right" ? "stq-indicator-left" : "stq-indicator-right");
      const arrowSvg = direction === "right"
        ? '<svg viewBox="0 0 24 24"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>';
      ind.innerHTML = arrowSvg;
      parent.style.position = "relative";
      parent.classList.add("stq-force-visible");
      parent.appendChild(ind);
      return ind;
    }

    function handleStart(clientX, clientY, target) {
      cleanupIndicators();

      const match = findMessageTarget(target);
      if (!match) return;

      const isUserMsg = Boolean(match.el.closest('[data-role="user"]'));
      currentRequiredDirection = isUserMsg
        ? (ctx.system.settings.get("userSwipeDir") || "left")
        : (ctx.system.settings.get("botSwipeDir") || "left");

      startX = clientX;
      startY = clientY;
      deltaX = 0;
      deltaY = 0;
      isTracking = true;
      isHorizontalGesture = null;
      currentTargetWrap = match.el;
      currentMsgId = match.id;
      hasVibrated = false;

      currentIndicator = createIndicator(currentTargetWrap, currentRequiredDirection);
    }

    function handleMove(clientX, clientY, cancelEvent) {
      if (!isTracking || !currentTargetWrap) return;

      deltaX = clientX - startX;
      deltaY = clientY - startY;

      if (isHorizontalGesture === null) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        if (absX > 5 || absY > 5) {
          const isCorrectDir = currentRequiredDirection === "right" ? deltaX > 0 : deltaX < 0;
          if (absX > absY && isCorrectDir) {
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
      let moveX = 0;

      if (currentRequiredDirection === "right") {
        moveX = Math.max(0, deltaX);
        if (moveX > 65) moveX = 65 + (moveX - 65) * 0.22;
      } else {
        moveX = Math.min(0, deltaX);
        if (moveX < -65) moveX = -65 + (moveX + 65) * 0.22;
      }

      currentTargetWrap.style.transform = "translateX(" + moveX + "px)";

      if (currentIndicator) {
        const progress = Math.min(1, Math.abs(moveX) / threshold);
        currentIndicator.style.opacity = (progress * 0.96).toString();
        currentIndicator.style.transform = "translateY(-50%) scale(" + (0.6 + progress * 0.46) + ")";

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
      const isCorrectDir = currentRequiredDirection === "right" ? deltaX > 0 : deltaX < 0;
      const triggered = isHorizontalGesture && isCorrectDir && Math.abs(deltaX) >= threshold;

      const wrap = currentTargetWrap;
      const ind = currentIndicator;
      const msgId = currentMsgId;

      wrap.classList.remove("stq-swiping");
      wrap.classList.add("stq-animating");
      wrap.style.transform = "translateX(0px)";

      if (triggered && wrap) {
        const isUser = Boolean(wrap.closest('[data-role="user"]'));
        const bubble = wrap.querySelector(".chat-markdown-paragraph, .ts-14, p, [data-chat-plugin-kind]") || wrap;

        const session = getSessionByElement(wrap);
        const messages = session ? ctx.data.messages.list(session.id) : [];
        const realMsg = msgId ? messages.find((m) => m.id === msgId) : null;

        const targetMsg = {
          id: msgId || (realMsg ? realMsg.id : "dom_" + Date.now()),
          role: realMsg ? realMsg.role : (isUser ? "user" : "assistant"),
          senderName: realMsg ? realMsg.senderName : undefined,
          senderCharacterId: realMsg ? realMsg.senderCharacterId : (session && !session.isGroup ? session.contactId : undefined),
          content: bubble.textContent ? bubble.textContent.trim() : (realMsg ? realMsg.content : "消息"),
          mediaType: realMsg ? realMsg.mediaType : undefined,
          mediaData: realMsg ? realMsg.mediaData : undefined,
        };

        targetMsg.senderName = resolveSenderDisplayName(targetMsg, wrap);
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

    // ── 8. 全局事件绑定 ────────────────────────────────────────────
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

    // ── 9. 清理 ────────────────────────────────────────────────────
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
