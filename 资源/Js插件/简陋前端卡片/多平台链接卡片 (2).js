export default {
  manifest: {
    id: "multi-platform-card-fixed-image",
    name: "多平台卡片‑固定配图｜抖音/B站/知乎/微信读书",
    apiVersion: 1,
    version: "1.2.0",
    author: "You",
    description: "识别抖音、B站、知乎、微信读书链接，渲染固定配图卡片，完全覆盖原始标题+链接文本，支持跳转，各平台可独立开关",
    permissions: ["chat.read"],
    settings: [
      {
        key: "enableDouyin",
        label: "启用 抖音卡片",
        type: "boolean",
        default: true
      },
      {
        key: "enableBilibili",
        label: "启用 B站卡片",
        type: "boolean",
        default: true
      },
      {
        key: "enableZhihu",
        label: "启用 知乎卡片",
        type: "boolean",
        default: true
      },
      {
        key: "enableWeRead",
        label: "启用 微信读书卡片",
        type: "boolean",
        default: true
      }
    ]
  },
  setup(ctx) {
    // ========== 四平台配置 ==========
    var PLATFORMS = [
      {
        key: "douyin",
        settingKey: "enableDouyin",
        name: "抖音",
        title: "抖音视频",
        desc: "点击卡片跳转查看内容",
        regex: /https?:\/\/v\.douyin\.com\/[^\s<]+/g,
        cover: "https://bee-reg-ab.imagency.cn/mr/5691/26/1130e290ced679326b9c904cd7728d7e.png",
        favicon: "https://www.douyin.com/favicon.ico",
        linkKeywords: ["v.douyin.com", "douyin.com", "抖音"]
      },
      {
        key: "bilibili",
        settingKey: "enableBilibili",
        name: "哔哩哔哩",
        title: "哔哩哔哩视频",
        desc: "点击卡片跳转查看内容",
        regex: /https?:\/\/(?:www\.)?bilibili\.com\/[^\s<]+|https?:\/\/b23\.tv\/[^\s<]+/g,
        cover: "https://bee-reg-ab.imagency.cn/mr/5691/26/6e66a8fb67b53076e3d522971a136377.png",
        favicon: "https://www.bilibili.com/favicon.ico",
        linkKeywords: ["bilibili.com", "b23.tv", "bilibili", "哔哩哔哩", "b站", "B站"]
      },
      {
        key: "zhihu",
        settingKey: "enableZhihu",
        name: "知乎",
        title: "知乎内容",
        desc: "点击卡片跳转查看内容",
        regex: /https?:\/\/(?:www\.)?zhihu\.com\/[^\s<]+/g,
        cover: "https://bee-reg-ab.imagency.cn/mr/5691/26/2583d248b0ad44ce86e50d3100b3ccd6.png",
        favicon: "https://static.zhihu.com/heifetz/favicon.ico",
        linkKeywords: ["zhihu.com", "zhihu", "知乎"]
      },
      {
        key: "weread",
        settingKey: "enableWeRead",
        name: "微信读书",
        title: "微信读书",
        desc: "点击卡片跳转查看内容",
        regex: /https?:\/\/weread\.qq\.com\/[^\s<]+/g,
        cover: "https://bee-reg-ab.imagency.cn/mr/5691/26/ef41021b744cc50f565e3d9bf2db70a6.png",
        favicon: "https://weread.qq.com/favicon.ico",
        linkKeywords: ["weread.qq.com", "weread", "qq.com/web/reader", "微信读书"]
      }
    ];

    // 收集所有平台的链接关键词（扁平化），用于检测文本节点
    var ALL_KEYWORDS = [];
    PLATFORMS.forEach(function (p) {
      p.linkKeywords.forEach(function (kw) {
        if (ALL_KEYWORDS.indexOf(kw) === -1) ALL_KEYWORDS.push(kw);
      });
    });

    // ========== 工具函数 ==========
    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    // 检查平台是否启用（按文档示例：=== false 才视为关闭）
    function isPlatformEnabled(platform) {
      var val = ctx.system.settings.get(platform.settingKey);
      return val !== false;
    }

    // 检测文本是否包含任一平台链接关键词（快速检测）
    function containsLinkKeyword(text) {
      if (!text) return false;
      for (var i = 0; i < ALL_KEYWORDS.length; i++) {
        if (text.indexOf(ALL_KEYWORDS[i]) !== -1) return true;
      }
      return false;
    }

    // 用正则检测文本是否包含任一平台链接（慢速但精准，兜底用）
    function textContainsPlatformLink(text) {
      if (!text) return false;
      for (var i = 0; i < PLATFORMS.length; i++) {
        PLATFORMS[i].regex.lastIndex = 0;
        if (PLATFORMS[i].regex.test(text)) return true;
      }
      return false;
    }

    // 合并检测：关键词 + 正则双保险
    function containsLink(text) {
      return containsLinkKeyword(text) || textContainsPlatformLink(text);
    }

    // ========== 隐藏原始消息文本（延迟执行+逐层隐藏，确保el已插入DOM） ==========
    function hideOriginalMessage(el, messageContent) {
      try {
        // 判断元素是否在卡片内部
        function isInCard(node) {
          if (!node) return false;
          return node === el || el.contains(node) || (node.contains && node.contains(el));
        }

        function doHide() {
          try {
            // el 还没插入 DOM，跳过
            if (!el || !el.isConnected || !el.parentElement) return;

            // 从 el 向上找 3 层，每一层都隐藏不包含卡片的直接子元素
            // 这样不管消息文本在哪一层（消息文本div/消息气泡/消息组），都能被隐藏
            var node = el;
            for (var i = 0; i < 3; i++) {
              if (!node || !node.parentElement) break;
              node = node.parentElement;
              var tag = node.tagName;
              if (tag === "BODY" || tag === "HTML" || tag === "HEAD") break;

              // 隐藏这一层中不包含卡片的直接子元素（只隐藏文本长度 < 500 的，避免隐藏大容器）
              var children = node.children;
              for (var c = 0; c < children.length; c++) {
                var child = children[c];
                if (isInCard(child)) continue; // 卡片及内部绝对不碰
                var childLen = (child.textContent || "").length;
                if (childLen > 0 && childLen < 500) {
                  child.style.setProperty("display", "none", "important");
                }
              }

              // 隐藏这一层的直接文本节点
              var childNodes = node.childNodes;
              for (var n = 0; n < childNodes.length; n++) {
                var cn = childNodes[n];
                if (cn.nodeType === Node.TEXT_NODE && cn.textContent.trim()) {
                  if (cn.textContent.length < 500) {
                    var span = document.createElement("span");
                    span.style.setProperty("display", "none", "important");
                    span.textContent = cn.textContent;
                    node.replaceChild(span, cn);
                  }
                }
              }
            }
          } catch (e) { /* 隐藏失败不影响卡片 */ }
        }

        // 延迟执行，确保 el 已经被插入到 DOM 中
        // 执行3次：50ms（刚插入）、150ms（渲染完成）、400ms（异步内容加载完成）
        setTimeout(doHide, 50);
        setTimeout(doHide, 150);
        setTimeout(doHide, 400);
      } catch (e) {
        // 隐藏逻辑任何报错都不影响卡片渲染
      }
    }

    // ========== 渲染卡片（和抖音插件完全一致的样式） ==========
    function renderCard(platform, link) {
      return (
        '<a href="' + escapeHtml(link) + '" target="_blank" style="text-decoration:none; display:block; cursor:pointer; margin-top:4px;">' +
        '<div style="border-radius:12px;overflow:hidden;background:#ffffff;padding:14px;max-width:340px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); border: 1px solid #eee;">' +
        '<div style="display:flex;gap:8px;">' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:17px;font-weight:bold;color:#000;line-height:1.3;">' + platform.title + '</div>' +
        '<div style="font-size:13px;color:#999;margin-top:4px;">' + platform.desc + '</div>' +
        '</div>' +
        '<img src="' + escapeHtml(platform.cover) + '" style="width:72px;height:82px;object-fit:cover;border-radius:4px;flex-shrink:0;">' +
        '</div>' +
        '<div style="display:flex;align-items:center;margin-top:12px;padding-top:8px;">' +
        '<img src="' + escapeHtml(platform.favicon) + '" style="width:22px;height:22px;border-radius:4px;margin-right:6px;">' +
        '<span style="font-size:14px;color:#888;">' + platform.name + '</span>' +
        '</div>' +
        '</div>' +
        '</a>'
      );
    }

    // ========== 消息底部插槽 ==========
    ctx.ui.slot("message.footer", function (el, props) {
      // props: { sessionId, message }
      if (!props || !props.message || typeof props.message.content !== "string") return;

      var content = props.message.content;

      // 依次匹配四个平台，命中第一个即渲染
      var matchedPlatform = null;
      var matchedLink = null;

      for (var i = 0; i < PLATFORMS.length; i++) {
        var platform = PLATFORMS[i];
        if (!isPlatformEnabled(platform)) continue;
        var match = content.match(platform.regex);
        if (match && match.length > 0) {
          matchedPlatform = platform;
          matchedLink = match[0];
          break;
        }
      }

      if (!matchedPlatform || !matchedLink) return;

      // 完全隐藏原始消息文本（标题+链接全部覆盖，传入消息内容做定位锚点）
      hideOriginalMessage(el, content);

      // 渲染卡片
      el.innerHTML = renderCard(matchedPlatform, matchedLink);
    });
  }
};
