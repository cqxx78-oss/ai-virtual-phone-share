/**
 * 全屏边缘滑动返回插件 (apiVersion 1) - v1.6.1
 * 深度适配 Float 手机全应用，优化单次清脆物理震动触感，保留 3 款精简视觉风格。
 */

export default {
  manifest: {
    id: "edge-swipe-back",
    name: "边缘滑动返回",
    apiVersion: 1,
    version: "1.6.1",
    author: "小坊",
    description: "贴着手机左右边缘滑动即可返回上一步。深度覆盖全应用与弹窗，单次清脆物理震动触感。",
    permissions: ["chat.read"],
    settings: [
      { key: "enabled", label: "启用边缘滑动返回", type: "boolean", default: true },
      { key: "leftEdge", label: "开启左侧滑返回", type: "boolean", default: true },
      { key: "rightEdge", label: "开启右侧滑返回 (推荐)", type: "boolean", default: true },
      {
        key: "edgeWidth",
        label: "边缘感应宽度",
        type: "select",
        default: "36",
        options: [
          { value: "25", label: "25px · 紧凑边缘" },
          { value: "36", label: "36px · 标准手感 (推荐)" },
          { value: "48", label: "48px · 宽松易触" },
          { value: "65", label: "65px · 超宽边缘" },
        ],
      },
      {
        key: "threshold",
        label: "触发返回滑动距离",
        type: "select",
        default: "48",
        options: [
          { value: "36", label: "36px · 灵敏轻划" },
          { value: "48", label: "48px · 标准距离 (推荐)" },
          { value: "65", label: "65px · 防误滑长拉" },
        ],
      },
      { key: "haptic", label: "震动触感反馈", type: "boolean", default: true },
      {
        key: "style",
        label: "动效风格",
        type: "select",
        default: "bubble",
        options: [
          { value: "bubble", label: "原生磨砂水滴 (推荐)" },
          { value: "pill", label: "微拟态胶囊" },
          { value: "hidden", label: "无视觉 (纯手势+震动)" },
        ],
      },
    ],
  },

  setup(ctx) {
    // 1. 全局样式注入
    const customCss = `
      html, body, #__next, .phone-shell {
        overscroll-behavior-x: none !important;
        -webkit-overscroll-behavior-x: none !important;
      }

      /* 动效指示器（完全穿透，不阻挡点击） */
      .edge-swipe-indicator {
        position: fixed;
        top: 50%;
        z-index: 2147483647;
        pointer-events: none !important;
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transform: translate3d(0, -50%, 0) scale(0.65);
        transition: opacity 0.16s ease, transform 0.16s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        will-change: transform, opacity, left, right;
      }

      .edge-swipe-indicator.active {
        opacity: 1;
        transition: none;
      }

      .edge-swipe-indicator.reached {
        transform: translate3d(0, -50%, 0) scale(1.15);
      }

      /* 水滴气泡风格 */
      .edge-swipe-indicator[data-style="bubble"] .indicator-inner {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: rgba(26, 26, 32, 0.86);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.18) inset;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
      }

      .edge-swipe-indicator.reached[data-style="bubble"] .indicator-inner {
        background: rgba(255, 255, 255, 0.96);
        color: #111111;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.9) inset;
      }

      /* 胶囊风格 */
      .edge-swipe-indicator[data-style="pill"] .indicator-inner {
        padding: 8px 14px;
        border-radius: 20px;
        background: rgba(20, 20, 24, 0.88);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.15) inset;
        color: #ffffff;
        font-size: 13px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .edge-swipe-indicator.reached[data-style="pill"] .indicator-inner {
        background: #007aff;
        color: #ffffff;
      }

      /* 无视觉风格 */
      .edge-swipe-indicator[data-style="hidden"] {
        display: none !important;
      }
    `;

    ctx.ui.injectCSS(customCss);

    // 2. 创建视觉指示器
    const indicator = document.createElement("div");
    indicator.className = "edge-swipe-indicator";
    indicator.innerHTML = `
      <div class="indicator-inner">
        <svg class="indicator-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </div>
    `;
    document.body.appendChild(indicator);

    const updateIndicatorStyle = () => {
      const style = ctx.system.settings.get("style") || "bubble";
      indicator.setAttribute("data-style", style);
    };
    updateIndicatorStyle();

    // 3. 震动反馈（单次触发）
    const triggerHaptic = (duration = 15) => {
      if (ctx.system.settings.get("haptic") === false) return;
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(duration);
        }
      } catch (e) {}
    };

    // 4. 辅助函数：判断元素是否在屏幕上真实可见
    const isVisible = (el) => {
      if (!el || !(el instanceof HTMLElement)) return false;
      if (el.offsetParent === null && window.getComputedStyle(el).position !== "fixed") return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    };

    // 5. 模拟深度真实点击
    const triggerClick = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const eventOpts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };

      el.dispatchEvent(new PointerEvent("pointerdown", eventOpts));
      el.dispatchEvent(new MouseEvent("mousedown", eventOpts));
      el.dispatchEvent(new PointerEvent("pointerup", eventOpts));
      el.dispatchEvent(new MouseEvent("mouseup", eventOpts));
      el.click();
      return true;
    };

    // 6. 全生态智能返回调度引擎
    const executeSmartBack = () => {
      // (1) 关闭下拉菜单
      const dropdowns = Array.from(document.querySelectorAll(".g-dropdown, .dropdown-menu, .chat-plus-menu"));
      for (const dd of dropdowns) {
        if (isVisible(dd)) {
          document.body.click();
          return true;
        }
      }

      // (2) 关闭顶层模态框 / 抽屉 / 评论区 / 图片预览
      const modals = Array.from(document.querySelectorAll(`
        .modal-dialog, .modal-overlay, .modal-backdrop, .xhs-modal-backdrop,
        .cp-xhs-video-comments-backdrop, .media-detail-modal, .preview-overlay, 
        .mix-sheet, .rich-modal, .user-profile-panel, .confirm-dialog, 
        .chat-settings-overlay, .xhs-profile-edit-sheet, .xhs-settings-edit-sheet,
        .music-settings, .dw-confirm-overlay, .app-market-sheet, .story-drawer-overlay,
        [role="dialog"]
      `));

      for (let i = modals.length - 1; i >= 0; i--) {
        const modal = modals[i];
        if (isVisible(modal)) {
          const closeBtn = modal.querySelector(`
            button.xhs-sheet-close-btn, button.music-settings-close, button.modal-close-btn,
            button.page-back-btn, button.mix-icon-btn, .mix-sheet-close, button.dw-confirm-btn,
            button[aria-label*="关"], button[aria-label*="Close"], button[aria-label*="返"],
            button[aria-label*="Back"], button svg.lucide-x, header button:last-child
          `);
          if (closeBtn && isVisible(closeBtn)) {
            const btn = closeBtn.closest("button") || closeBtn;
            if (triggerClick(btn)) return true;
          }
          if (modal.classList.contains("modal-overlay") || modal.classList.contains("xhs-modal-backdrop") || modal.classList.contains("cp-xhs-video-comments-backdrop") || modal.classList.contains("dw-confirm-overlay") || modal.classList.contains("story-drawer-overlay")) {
            triggerClick(modal);
            return true;
          }
        }
      }

      // (3) 剧情模式（StoryApp）返回
      const storyBack = document.querySelector(".story-header .story-header-left button.story-top-btn, button.story-top-btn, button.story-empty-action");
      if (storyBack && isVisible(storyBack)) {
        if (triggerClick(storyBack)) return true;
      }

      // (4) 筑境（WorldBuilder）返回
      const wbBack = document.querySelector(".wb-topbar button.wb-topbar-btn, button.wb-initial-back");
      if (wbBack && isVisible(wbBack)) {
        if (triggerClick(wbBack)) return true;
      }
      if (window.location.pathname.includes("world-builder")) {
        if (window.opener && !window.opener.closed) {
          window.opener.focus();
          window.close();
          return true;
        }
        window.history.back();
        return true;
      }

      // (5) 小红书笔记详情与私信详情返回
      const xhsDetailBack = document.querySelector(".cp-xhs-note-detail-header button.cp-xhs-detail-back");
      if (xhsDetailBack && isVisible(xhsDetailBack)) {
        if (triggerClick(xhsDetailBack)) return true;
      }
      const xhsThreadBack = document.querySelector(".cp-xhs-thread-appbar button.cp-xhs-thread-nav-button");
      if (xhsThreadBack && isVisible(xhsThreadBack)) {
        if (triggerClick(xhsThreadBack)) return true;
      }

      // (6) 资源集市工具栏返回（← 返回）
      const rhBackBtn = Array.from(document.querySelectorAll(".rh-toolbar .rh-btn")).find(b => isVisible(b) && (b.textContent || "").includes("返回"));
      if (rhBackBtn) {
        if (triggerClick(rhBackBtn)) return true;
      }

      // (7) 筑境 / 市场自定义 APP 悬浮胶囊关闭
      const customAppClose = document.querySelector(".custom-app-runner-capsule button:last-child, .custom-app-runner-capsule button[aria-label*='关闭']");
      if (customAppClose && isVisible(customAppClose)) {
        if (triggerClick(customAppClose)) return true;
      }

      // (8) 全应用扫描屏幕左上角的所有前台返回按钮（小红书、音乐、漫卷、冒险、栖所、独家特调、聊天、设置等）
      const selectors = [
        "button.cp-float-back",
        "button.cp-xhs-detail-back",
        "button.cp-xhs-thread-nav-button",
        ".cp-xhs-profile-topbar button",
        ".music-header button.music-header-action",
        ".vns-topbar button.vns-back",
        "button.vn-chapter-back",
        "button.vn-player-back",
        ".dwelling-header button.dw-back",
        ".mix-header button.mix-icon-btn",
        ".mix-header button",
        ".rh-titlebar-controls button:last-child",
        "header.page-header button.page-back-btn",
        "header.page-header button:first-child",
        "header button.page-back-btn",
        "button.page-back-btn",
        "button.wb-topbar-btn",
        "button[aria-label*='返回' i]",
        "button[aria-label*='Back' i]",
        "button[title*='返回' i]",
        "button[title*='Back' i]",
      ];

      const candidates = Array.from(document.querySelectorAll(selectors.join(",")));

      // 补充扫描：包含 ArrowLeft / ChevronLeft / polyline 的顶部左侧按钮
      const allTopButtons = Array.from(document.querySelectorAll("header button, div[class*='header'] button, div[class*='topbar'] button, div[style*='header'] button"));
      for (const btn of allTopButtons) {
        if (!candidates.includes(btn)) {
          const svg = btn.querySelector("svg");
          if (svg) {
            const svgHtml = svg.innerHTML || "";
            if (svgHtml.includes("points=\"15 18 9 12 15 6\"") || svg.classList.contains("lucide-arrow-left") || svg.classList.contains("lucide-chevron-left")) {
              candidates.push(btn);
            }
          }
        }
      }

      const validButtons = [];
      for (const btn of candidates) {
        if (!isVisible(btn)) continue;
        const rect = btn.getBoundingClientRect();

        // 位于屏幕顶部 (Y < 140px) 且位于屏幕左半部分 (X < 45% 屏幕宽)
        if (rect.top >= 0 && rect.top <= 140 && rect.left >= 0 && rect.left <= window.innerWidth * 0.45) {
          const svg = btn.querySelector("svg");
          if (svg) {
            const svgHtml = svg.innerHTML || "";
            // 排除右侧加号/刷新/搜索
            if (svgHtml.includes("8v8") || svgHtml.includes("12h8") || svgHtml.includes("M12 5v14")) {
              const label = (btn.getAttribute("aria-label") || "") + (btn.getAttribute("title") || "");
              if (!/返回|Back|关|Close/i.test(label)) {
                continue;
              }
            }
          }
          validButtons.push(btn);
        }
      }

      if (validButtons.length > 0) {
        const target = validButtons[validButtons.length - 1];
        if (triggerClick(target)) return true;
      }

      // (9) 桌面文件夹关闭
      const openFolder = document.querySelector(".folder-overlay, .folder-window");
      if (openFolder && isVisible(openFolder)) {
        triggerClick(openFolder);
        return true;
      }

      // (10) 兜底调用浏览器历史返回
      if (typeof window !== "undefined" && window.history && window.history.length > 1) {
        window.history.back();
        return true;
      }

      return false;
    };

    // 7. 纯手势事件流跟踪
    let touchState = {
      tracking: false,
      isEdgeGesture: false,
      side: "left",
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      hasVibrated: false,
    };

    const onTouchStart = (e) => {
      if (ctx.system.settings.get("enabled") === false) return;
      if (!e.touches || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;
      const screenWidth = window.innerWidth;
      const edgeW = parseInt(ctx.system.settings.get("edgeWidth") || "36", 10);

      const isLeft = startX <= edgeW && ctx.system.settings.get("leftEdge") !== false;
      const isRight = startX >= screenWidth - edgeW && ctx.system.settings.get("rightEdge") !== false;

      if (!isLeft && !isRight) return;

      touchState = {
        tracking: true,
        isEdgeGesture: false,
        side: isLeft ? "left" : "right",
        startX,
        startY,
        currentX: startX,
        currentY: startY,
        hasVibrated: false,
      };

      updateIndicatorStyle();
      indicator.classList.remove("reached", "active");

      const safeY = Math.max(80, Math.min(window.innerHeight - 80, startY));
      indicator.style.top = safeY + "px";

      if (isLeft) {
        indicator.style.left = "0px";
        indicator.style.right = "auto";
        indicator.querySelector(".indicator-arrow").style.transform = "rotate(0deg)";
      } else {
        indicator.style.left = "auto";
        indicator.style.right = "0px";
        indicator.querySelector(".indicator-arrow").style.transform = "rotate(180deg)";
      }
    };

    const onTouchMove = (e) => {
      if (!touchState.tracking || !e.touches || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const curX = touch.clientX;
      const curY = touch.clientY;
      touchState.currentX = curX;
      touchState.currentY = curY;

      const dx = curX - touchState.startX;
      const dy = curY - touchState.startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (!touchState.isEdgeGesture) {
        const isPullingInward = (touchState.side === "left" && dx > 5) || (touchState.side === "right" && dx < -5);
        if (isPullingInward && absDx > absDy * 1.05) {
          touchState.isEdgeGesture = true;
          indicator.classList.add("active");
        } else if (absDy > 16) {
          touchState.tracking = false;
          indicator.classList.remove("active", "reached");
          return;
        }
      }

      if (touchState.isEdgeGesture) {
        if (e.cancelable) {
          e.preventDefault();
        }

        const pullDist = touchState.side === "left" ? Math.max(0, dx) : Math.max(0, -dx);
        const threshold = parseInt(ctx.system.settings.get("threshold") || "48", 10);

        const visualOffset = Math.min(85, Math.pow(pullDist, 0.82) * 2.2);

        if (touchState.side === "left") {
          indicator.style.transform = `translate3d(${visualOffset}px, -50%, 0) scale(${Math.min(1.15, 0.65 + pullDist / threshold * 0.48)})`;
        } else {
          indicator.style.transform = `translate3d(-${visualOffset}px, -50%, 0) scale(${Math.min(1.15, 0.65 + pullDist / threshold * 0.48)})`;
        }

        const isReached = pullDist >= threshold;
        if (isReached) {
          // 仅在首次拉过临界值瞬间震动 1 次
          if (!touchState.hasVibrated) {
            triggerHaptic(18);
            touchState.hasVibrated = true;
          }
          indicator.classList.add("reached");
        } else {
          touchState.hasVibrated = false;
          indicator.classList.remove("reached");
        }
      }
    };

    const onTouchEnd = (e) => {
      if (!touchState.tracking) return;

      if (touchState.isEdgeGesture) {
        const pullDist = touchState.side === "left"
          ? Math.max(0, touchState.currentX - touchState.startX)
          : Math.max(0, touchState.startX - touchState.currentX);
        const threshold = parseInt(ctx.system.settings.get("threshold") || "48", 10);

        if (indicator.classList.contains("reached") || pullDist >= threshold) {
          // 松手直接执行返回，不再重复震动
          executeSmartBack();
        }
      }

      touchState.tracking = false;
      touchState.isEdgeGesture = false;
      indicator.classList.remove("reached", "active");
      indicator.style.transform = "translate3d(0, -50%, 0) scale(0.65)";
    };

    // 8. 捕获阶段注册事件
    const captureOpts = { passive: false, capture: true };
    window.addEventListener("touchstart", onTouchStart, captureOpts);
    window.addEventListener("touchmove", onTouchMove, captureOpts);
    window.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });

    const unwatchSettings = ctx.system.settings.onChange(() => {
      updateIndicatorStyle();
    });

    return () => {
      unwatchSettings();
      window.removeEventListener("touchstart", onTouchStart, captureOpts);
      window.removeEventListener("touchmove", onTouchMove, captureOpts);
      window.removeEventListener("touchend", onTouchEnd, { passive: true, capture: true });
      window.removeEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });

      if (indicator && indicator.parentNode) indicator.parentNode.removeChild(indicator);
    };
  },
};
