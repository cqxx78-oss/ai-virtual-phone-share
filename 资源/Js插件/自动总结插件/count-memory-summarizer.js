export default {
  manifest: {
    id: "count-memory-summarizer",
    name: "按条数记忆总结",
    apiVersion: 1,
    version: "1.0.7",
    author: "Cyrus",
    description: "只换触发：够条数就调用宿主原版长期记忆流水线（辅助API、时间线、embedding、核心记忆）。",
    permissions: ["chat.read", "storage"],
    settings: [
      {
        key: "interval",
        label: "每多少条总结一次",
        type: "number",
        default: 10,
        description: "只数已经落库的私聊 user/assistant 消息。够数后走原版总结流水线，不是插件自己压。",
      },
      {
        key: "includeGroup",
        label: "群聊也计数",
        type: "boolean",
        default: false,
      },
      {
        key: "toast",
        label: "总结成功时提示",
        type: "boolean",
        default: true,
      },
    ],
  },

  setup(ctx) {
    const STATE_KEY = "v1";
    const SKIP_MEDIA = {
      tool_notice: true,
      tool_result: true,
      music_notify: true,
      memory_write_request: true,
    };
    const busy = new Set();
    const queued = new Set();
    let webpackRequire = null;
    let pipelineFn = null;

    const loadState = () => {
      const raw = ctx.system.storage.get(STATE_KEY);
      if (raw && typeof raw === "object" && raw.characters && typeof raw.characters === "object") {
        return raw;
      }
      return { characters: {} };
    };

    const saveState = (state) => {
      ctx.system.storage.set(STATE_KEY, state);
      ctx.system.bus.emit("count-memory-summarizer:changed");
    };

    const charState = (state, characterId) => {
      if (!state.characters[characterId]) {
        state.characters[characterId] = { pending: [], lastError: "", lastSummaryAt: "" };
      }
      if (!Array.isArray(state.characters[characterId].pending)) {
        state.characters[characterId].pending = [];
      }
      return state.characters[characterId];
    };

    const intervalOf = () => {
      const n = Number(ctx.system.settings.get("interval"));
      if (!Number.isFinite(n)) return 10;
      return Math.max(2, Math.round(n));
    };

    const settingOn = (key, fallback) => {
      const v = ctx.system.settings.get(key);
      if (v === undefined || v === null) return fallback;
      return v !== false;
    };

    const countable = (msg) => {
      if (!msg || msg.isRetracted) return false;
      if (msg.role !== "user" && msg.role !== "assistant") return false;
      if (msg.mediaType && SKIP_MEDIA[msg.mediaType]) return false;
      if (String(msg.content || "").trim()) return true;
      return Boolean(msg.mediaType);
    };

    const resolveCharacterIds = (msg) => {
      const session = ctx.data.sessions.get(msg.sessionId);
      if (!session) return [];
      if (session.isGroup) {
        if (!settingOn("includeGroup", false)) return [];
        if (msg.role === "assistant" && msg.senderCharacterId) return [msg.senderCharacterId];
        if (msg.role === "user" && Array.isArray(session.participantIds)) {
          return session.participantIds.filter(Boolean);
        }
        return [];
      }
      return session.contactId ? [session.contactId] : [];
    };

    const getWebpackRequire = () => {
      if (webpackRequire) return webpackRequire;
      const g = typeof globalThis !== "undefined" ? globalThis : window;
      if (!g) return null;
      const name = Object.getOwnPropertyNames(g).find((k) => k.startsWith("webpackChunk"));
      if (!name || !Array.isArray(g[name])) return null;
      try {
        g[name].push([["cms-host-" + Date.now()], {}, (req) => {
          webpackRequire = req;
        }]);
      } catch { /* ignore */ }
      return webpackRequire;
    };

    const eachWebpackExport = (visit) => {
      const req = getWebpackRequire();
      const cache = req && req.c;
      if (!cache) return;
      for (const id of Object.keys(cache)) {
        const exp = cache[id] && cache[id].exports;
        if (!exp) continue;
        try { visit(exp); } catch { /* ignore */ }
      }
    };

    // 长期记忆流水线独有；核心记忆也会带「未配置记忆总结 API」，不能当指纹。
    const PIPE_YES = ["没有可总结的事件", "事件不足 4 条", "[MemorySummarizer]"];
    const PIPE_NO = [
      "没有新的长期记忆需要总结",
      "没有可用于总结核心记忆的长期记忆",
      "核心记忆总结结果疑似被截断",
    ];

    const scorePipeline = (fn) => {
      if (typeof fn !== "function") return -1;
      let src = "";
      try { src = Function.prototype.toString.call(fn); } catch { return -1; }
      if (PIPE_NO.some((s) => src.includes(s))) return -1;
      let score = 0;
      for (const s of PIPE_YES) if (src.includes(s)) score += 2;
      if (src.includes("记忆总结·")) score += 1;
      return score;
    };

    const considerPipeline = (fn, best) => {
      const score = scorePipeline(fn);
      if (score > best.score) {
        best.fn = fn;
        best.score = score;
      }
    };

    const pickFromExport = (exp, best) => {
      if (!exp) return;
      if (typeof exp === "function") {
        considerPipeline(exp, best);
        return;
      }
      if (typeof exp !== "object") return;
      if (typeof exp.runSummarizationPipeline === "function") {
        considerPipeline(exp.runSummarizationPipeline, best);
      }
      if (exp.default && typeof exp.default.runSummarizationPipeline === "function") {
        considerPipeline(exp.default.runSummarizationPipeline, best);
      }
      for (const key of Object.keys(exp)) considerPipeline(exp[key], best);
    };

    const factoryLooksLongTerm = (src) => PIPE_YES.some((s) => src.includes(s));

    const findHostPipeline = () => {
      if (typeof pipelineFn === "function" && scorePipeline(pipelineFn) > 0) return pipelineFn;
      pipelineFn = null;
      const best = { fn: null, score: 0 };
      eachWebpackExport((exp) => pickFromExport(exp, best));
      if (best.score <= 0) {
        const req = getWebpackRequire();
        const g = typeof globalThis !== "undefined" ? globalThis : window;
        const name = g && Object.getOwnPropertyNames(g).find((k) => k.startsWith("webpackChunk"));
        const chunks = name ? g[name] : null;
        if (req && Array.isArray(chunks)) {
          for (let i = 0; i < chunks.length; i++) {
            const modules = chunks[i] && chunks[i][1];
            if (!modules) continue;
            for (const id of Object.keys(modules)) {
              const factory = modules[id];
              if (typeof factory !== "function") continue;
              const src = Function.prototype.toString.call(factory);
              if (!factoryLooksLongTerm(src)) continue;
              try { pickFromExport(req(id), best); } catch { /* ignore */ }
            }
          }
        }
      }
      pipelineFn = best.score > 0 ? best.fn : null;
      return pipelineFn;
    };

    const flush = async (characterId, force) => {
      if (busy.has(characterId)) {
        queued.add(characterId);
        return;
      }
      busy.add(characterId);
      try {
        const limit = intervalOf();
        const state = loadState();
        const slot = charState(state, characterId);
        if (slot.pending.length === 0) return;
        if (!force && slot.pending.length < limit) return;
        if (!force && slot.lastError && slot.lastAttemptAt) {
          const ago = Date.now() - Date.parse(slot.lastAttemptAt);
          if (Number.isFinite(ago) && ago < 60000) return;
        }

        slot.lastAttemptAt = new Date().toISOString();
        saveState(state);

        const take = force ? slot.pending.length : limit;
        const batch = slot.pending.slice(0, take);
        const ch = ctx.data.characters.get(characterId);
        const charName = (ch && ch.name) || "角色";
        const run = findHostPipeline();
        if (typeof run !== "function") {
          throw new Error("找不到宿主原版总结流水线。先开一次该角色聊天或记忆库，再试。");
        }

        const oldestAt = batch.map((item) => item.at).filter(Boolean).sort()[0];
        let pipelineOpt = { force: true };
        if (oldestAt) {
          const t = Date.parse(oldestAt);
          pipelineOpt = {
            sinceTimestamp: Number.isFinite(t) ? new Date(t - 1).toISOString() : oldestAt,
          };
        }

        ctx.system.log("总结开始", charName, "触发" + batch.length + "条，交回原版流水线");
        const result = await run(characterId, charName, pipelineOpt);
        if (!result || result.success !== true) {
          throw new Error((result && result.error) || "原版流水线未成功");
        }

        const now = new Date().toISOString();
        const latestState = loadState();
        const latestSlot = charState(latestState, characterId);
        const remain = latestSlot.pending.filter((item) => !batch.some((b) => b.id === item.id));
        latestSlot.pending = remain;
        latestSlot.lastError = "";
        latestSlot.lastSummaryAt = now;
        saveState(latestState);

        ctx.system.log("总结完成", charName);
        if (settingOn("toast", true)) {
          ctx.ui.toast(charName + " · 已按 " + batch.length + " 条触发原版记忆总结");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const state = loadState();
        charState(state, characterId).lastError = message;
        saveState(state);
        ctx.system.log("总结失败", characterId, message);
        if (settingOn("toast", true)) {
          ctx.ui.toast("记忆总结失败：" + message);
        }
      } finally {
        busy.delete(characterId);
        if (queued.has(characterId)) {
          queued.delete(characterId);
          const state = loadState();
          const pending = charState(state, characterId).pending.length;
          if (pending >= intervalOf()) void flush(characterId, false);
        }
      }
    };

    const ingest = (msg) => {
      if (!countable(msg)) return;
      const ids = resolveCharacterIds(msg);
      if (ids.length === 0) return;
      const state = loadState();
      let changed = false;
      for (const characterId of ids) {
        const slot = charState(state, characterId);
        if (slot.pending.some((item) => item.id === msg.id)) continue;
        slot.pending.push({
          id: msg.id,
          at: msg.createdAt || new Date().toISOString(),
          sessionId: msg.sessionId,
        });
        changed = true;
      }
      if (!changed) return;
      saveState(state);
      const limit = intervalOf();
      for (const characterId of ids) {
        if (charState(state, characterId).pending.length >= limit) {
          void flush(characterId, false);
        }
      }
    };

    ctx.hooks.on("message.persisted", (payload) => {
      try {
        ingest(payload.message);
      } catch (err) {
        ctx.system.log("计数失败", err instanceof Error ? err.message : String(err));
      }
    });

    const renderBar = (el, sessionId) => {
      const session = sessionId ? ctx.data.sessions.get(sessionId) : null;
      const characterId = session && !session.isGroup ? session.contactId : "";
      el.innerHTML = "";
      if (!characterId) return;

      const state = loadState();
      const slot = charState(state, characterId);
      const limit = intervalOf();
      const wrap = document.createElement("div");
      wrap.className = "cms-bar";

      const label = document.createElement("span");
      label.textContent = "记忆 " + slot.pending.length + "/" + limit;
      wrap.appendChild(label);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = slot.pending.length ? "立即总结" : "暂无新消息";
      btn.disabled = slot.pending.length === 0 || busy.has(characterId);
      btn.addEventListener("click", () => {
        void flush(characterId, true);
      });
      wrap.appendChild(btn);

      if (slot.lastError) {
        const err = document.createElement("span");
        err.className = "cms-err";
        err.textContent = slot.lastError;
        wrap.appendChild(err);
      }
      el.appendChild(wrap);
    };

    ctx.ui.injectCSS(`
      .cms-bar{display:flex;align-items:center;gap:8px;padding:2px 12px 6px;font-size:11px;opacity:.8;flex-wrap:wrap}
      .cms-bar button{border:0;border-radius:999px;padding:2px 8px;font-size:11px;background:rgba(127,127,127,.18);color:inherit;cursor:pointer}
      .cms-bar button:disabled{opacity:.4;cursor:default}
      .cms-err{color:#c45;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cms-settings{padding:8px 4px 12px;font-size:13px;line-height:1.5}
      .cms-settings p{margin:0 0 8px;opacity:.75}
      .cms-settings button{margin-top:8px;border:0;border-radius:8px;padding:6px 10px;font-size:12px;background:rgba(127,127,127,.18);color:inherit}
      .cms-row{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid rgba(127,127,127,.12)}
    `);

    ctx.ui.slot("chat.header", (el, props) => {
      const redraw = () => renderBar(el, props.sessionId);
      redraw();
      const off = ctx.system.bus.on("count-memory-summarizer:changed", redraw);
      return () => off();
    });

    ctx.ui.slot("settings.section", (el) => {
      const redraw = () => {
        const state = loadState();
        const limit = intervalOf();
        const rows = Object.keys(state.characters).map((id) => {
          const ch = ctx.data.characters.get(id);
          const slot = state.characters[id];
          return {
            id,
            name: (ch && ch.name) || id,
            pending: (slot.pending || []).length,
            lastError: slot.lastError || "",
          };
        }).filter((row) => row.pending > 0 || row.lastError);

        el.innerHTML = "";
        const box = document.createElement("div");
        box.className = "cms-settings";
        const hint = document.createElement("p");
        hint.textContent = "只把落库消息当触发。够数后调用宿主原版流水线：辅助API、时间线、embedding、核心记忆、条数上限。建议关掉记忆库里的「长期记忆自动总结」，避免两套触发抢跑。当前阈值：" + limit + " 条。";
        box.appendChild(hint);

        if (rows.length === 0) {
          const empty = document.createElement("p");
          empty.textContent = "现在没有待总结的消息。";
          box.appendChild(empty);
        } else {
          rows.forEach((row) => {
            const line = document.createElement("div");
            line.className = "cms-row";
            line.textContent = row.name + "  " + row.pending + "/" + limit + (row.lastError ? "  · " + row.lastError : "");
            box.appendChild(line);
          });
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "把所有待处理角色立即总结";
        btn.addEventListener("click", () => {
          const snap = loadState();
          Object.keys(snap.characters).forEach((id) => {
            if ((snap.characters[id].pending || []).length > 0) void flush(id, true);
          });
        });
        box.appendChild(btn);
        el.appendChild(box);
      };
      redraw();
      const off = ctx.system.bus.on("count-memory-summarizer:changed", redraw);
      return () => off();
    });

    ctx.ui.messageAction({
      id: "count-memory-summarizer-now",
      label: "按条数总结（当前角色）",
      filter: (msg) => Boolean(msg && msg.sessionId),
      onSelect: (msg, helpers) => {
        const ids = resolveCharacterIds(msg);
        if (ids.length === 0) {
          helpers.toast("这条消息没有对应角色（群聊需在插件设置里打开）");
          return;
        }
        ids.forEach((id) => void flush(id, true));
      },
    });
  },
};
