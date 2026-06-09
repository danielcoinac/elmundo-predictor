import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import jsQR from "jsqr";
import { supabase } from "./lib/supabase";
import { TRANSLATIONS, LangContext, useLang } from "./lib/i18n";
import { sget, sset, DEFAULT_MATCHES, DEFAULT_RULES, DEFAULT_SPONSORS, MONTHS, matchDate, sortMatches, calcPts, FLAGS, flag, MENU_SECTIONS, ALL_MENU_CATS, FOOD_CATS, catMeta } from "./lib/utils";
import { Logo, HeaderLogo } from "./components/Logo";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FloorPlan, OrderFeed } from "./components/StaffViews";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import "./styles.css";

/** Read event branding from localStorage — works in any context (outside React components) */
function getEventLabel() {
  try { const s = JSON.parse(localStorage.getItem("em_app_settings")||"{}"); return `${s.eventName||"WORLD CUP"} ${s.eventYear||2026}`; } catch { return "WORLD CUP 2026"; }
}

// Module-level constant — stable reference, never recreated on render
const APP_SETTINGS_DEF = { showMatches:true, showLeaderboard:true, showMundogram:true, showMenu:true, noEventMode:false, eventYear:2026, eventName:"WORLD CUP", eventClosed:false };
// Global context so deeply nested components (TV slides etc.) get event name/year without prop drilling
const AppSettingsContext = React.createContext(APP_SETTINGS_DEF);
const useEvt = () => {
  const s = React.useContext(AppSettingsContext);
  const evName = s.eventName || "WORLD CUP";
  const evYear = s.eventYear || 2026;
  return { evName, evYear, evLabel: `${evName} ${evYear}` };
};

// Shared AudioContext — reuse across all sound calls; browsers limit to ~6 concurrent
let _sharedAudioCtx = null;

/* ── Print helpers (module-level so any component can call them) ── */
const CUT_DELAY = 1500;
const sendCut = () => { new Image().src = "http://localhost:9200/cut?" + Date.now(); };
const silentPrint = (html, afterPrint) => {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;border:none;left:-9999px;top:-9999px;";
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  setTimeout(() => {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) {}
    setTimeout(() => { afterPrint?.(); try { document.body.removeChild(iframe); } catch (e) {} }, CUT_DELAY);
  }, 400);
};
const getAudioCtx = () => {
  try {
    if (!_sharedAudioCtx || _sharedAudioCtx.state === "closed") {
      _sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return _sharedAudioCtx;
  } catch { return null; }
};

/* ═══════════════════════════════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const [page,     setPage]     = useState("loading");
  const [authTab,  setAuthTab]  = useState("login");
  const tableFromQR = new URLSearchParams(window.location.search).get("table") || "";
  const [appTab,   setAppTab]   = useState(tableFromQR ? "menu" : "matches");
  const [qrTable,  setQrTable]  = useState(tableFromQR);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [newOrderAlert, setNewOrderAlert] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [user,     setUser]     = useState(null);
  const [users,    setUsers]    = useState({});
  const [preds,    setPreds]    = useState({});
  const [matches,  setMatches]  = useState(DEFAULT_MATCHES);
  const [rules,    setRules]    = useState(DEFAULT_RULES);
  const [sponsors, setSponsors] = useState(DEFAULT_SPONSORS);
  const [toasts,   setToasts]   = useState([]); // stack of {id, msg, ok, kind}
  const toastTimerRef = useRef(null);
  const globalChannelRef = useRef(null);
  const [lang,     setLang]     = useState(() => localStorage.getItem("lang") || "en");
  const t = k => TRANSLATIONS[lang]?.[k] ?? TRANSLATIONS.en[k] ?? k;
  const toggleLang = () => { const nl = lang === "en" ? "nl" : "en"; setLang(nl); localStorage.setItem("lang", nl); };
  const [form,     setForm]     = useState({ name:"", email:"", phone:"", password:"" });
  const [formErr,  setFormErr]  = useState("");
  const [publicBoard, setPublicBoard] = useState([]);
  // Server-side leaderboard scores — avoids the 1000-row PostgREST cap.
  // Populated from get_leaderboard_scores() RPC; used for board computation
  // so other users' pts don't depend on the current-user-only preds state.
  const [leaderScores, setLeaderScores] = useState({});
  // Community pulse counts per match — populated from get_match_pulse() RPC
  // so the distribution bar works correctly even with > 1000 total predictions.
  const [pulseCounts, setPulseCounts] = useState({});
  const [menuItems,   setMenuItems]   = useState([]);
  const [myCredits,   setMyCredits]   = useState(0);
  const [myOrders,    setMyOrders]    = useState([]);
  const [allOrders,   setAllOrders]   = useState([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [sponsorGifts, setSponsorGifts] = useState([]);
  const [showWinner,   setShowWinner]   = useState(false);
  const [winnerData,   setWinnerData]   = useState(null);
  const [gifts,          setGifts]          = useState([]);
  const [showGifts,      setShowGifts]      = useState(false);
  const [pendingGiftItems, setPendingGiftItems] = useState([]); // gift(s) queued to add to menu cart
  const [appSettings, setAppSettings] = useState(APP_SETTINGS_DEF);
  // Online/offline detection
  useEffect(() => {
    const goOnline  = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  // Offline prediction retry queue — flush when back online
  useEffect(() => {
    const flush = async () => {
      const OFFLINE_QUEUE_KEY = "em-pred-queue";
      const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
      if (!queue.length || !navigator.onLine) return;
      const failed = [];
      for (const item of queue) {
        const { error } = await supabase.from("predictions").upsert(
          { user_id: item.userId, match_id: item.matchId, home_pred: item.h, away_pred: item.a },
          { onConflict: "user_id,match_id" }
        );
        if (error) failed.push(item);
      }
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failed));
      if (failed.length < queue.length) toast$(`✅ ${queue.length - failed.length} prediction(s) synced`);
    };
    window.addEventListener("online", flush);
    flush(); // also try on mount
    return () => window.removeEventListener("online", flush);
  }, []);

  // Load global app settings from Supabase (shared for ALL users/devices)
  useEffect(() => {
    (async () => {
      // Try Supabase first (source of truth), fall back to localStorage cache
      const { data } = await supabase.from("app_settings").select("value").eq("key", "global").maybeSingle();
      if (data?.value) {
        setAppSettings(prev => ({ ...APP_SETTINGS_DEF, ...data.value }));
        try { localStorage.setItem("em_app_settings", JSON.stringify(data.value)); } catch {}
      } else {
        const saved = await sget("em_app_settings");
        if (saved) setAppSettings(prev => ({ ...APP_SETTINGS_DEF, ...saved }));
      }
    })();
    // Listen for realtime changes so all devices sync instantly
    const ch = supabase.channel("rt-app-settings")
      .on("postgres_changes", { event:"*", schema:"public", table:"app_settings", filter:"key=eq.global" }, payload => {
        const v = payload.new?.value;
        if (v) {
          setAppSettings(prev => ({ ...APP_SETTINGS_DEF, ...v }));
          try { localStorage.setItem("em_app_settings", JSON.stringify(v)); } catch {}
        }
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);
  const saveAppSettings = async (updates) => {
    const n = { ...appSettings, ...updates };
    setAppSettings(n);
    try { localStorage.setItem("em_app_settings", JSON.stringify(n)); } catch {}
    const { error } = await supabase.from("app_settings")
      .upsert({ key: "global", value: n, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) {
      console.error("saveAppSettings failed:", error);
      toast$("Couldn't sync settings: " + (error.message || "check RLS"), false);
    } else {
      toast$("Settings updated for all players", true);
    }
  };

  useEffect(() => {
    (async () => {
      const rl = await sget("em_rules");
      const sp = await sget("em_sponsors");
      if (rl) setRules(rl);
      if (sp) setSponsors(sp);

      const { data: mRows } = await supabase.from("matches").select("*");
      if (mRows) {
        setMatches(mRows.map(r => ({
          id: r.id, home: r.home, away: r.away,
          group: r.match_group, date: r.match_date,
          time: r.match_time, status: r.status,
          hs: r.home_score, as: r.away_score
        })));
      }
      setMatchesLoaded(true);

      // Load public leaderboard (available before login, for TV screen).
      // Scores are computed server-side via get_leaderboard_scores() to avoid
      // the PostgREST 1000-row cap that would silently truncate predictions.
      const { data: pubProfiles } = await supabase.from("profiles").select("*");
      if (pubProfiles) {
        const { data: scores } = await supabase.rpc("get_leaderboard_scores");
        const scoreMap = {};
        (scores || []).forEach(s => { scoreMap[s.user_id] = s.pts; });
        setLeaderScores(scoreMap);
        const noAdmins = pubProfiles.filter(u => !u.is_admin);
        const pubBoard = noAdmins
          .map(u => ({ ...u, pts: scoreMap[u.id] || 0 }))
          .sort((a, b) => b.pts - a.pts)
          .slice(0, 10);
        setPublicBoard(pubBoard);
      }

      // Community pulse — aggregate prediction distribution per match
      const { data: pulseRows } = await supabase.rpc("get_match_pulse");
      if (pulseRows) {
        const pm = {};
        pulseRows.forEach(r => {
          pm[r.match_id] = { homeWins: r.home_wins, draws: r.draws, awayWins: r.away_wins,
            total: r.total, topHome: r.top_home, topAway: r.top_away, topCount: r.top_count };
        });
        setPulseCounts(pm);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
        if (profile) {
          setUser({ ...session.user, ...profile });
          // Filter to current user only — avoids PostgREST's 1000-row cap
          // which would silently drop predictions for later-registered users.
          const { data: predRows } = await supabase.from("predictions").select("*").eq("user_id", session.user.id);
          if (predRows) {
            const predMap = {};
            predRows.forEach(p => { predMap[`${p.user_id}__${p.match_id}`] = { h: p.home_pred, a: p.away_pred }; });
            // Merge: keep any optimistic saves already in state (race-condition guard)
            setPreds(prev => ({ ...predMap, ...prev }));
          }
          const { data: allProfiles } = await supabase.from("profiles").select("*");
          if (allProfiles) {
            const usersMap = {};
            allProfiles.filter(p => p.is_admin !== true && p.is_admin !== 1 && p.is_admin !== "true").forEach(p => { usersMap[p.id] = p; });
            setUsers(usersMap);
          }
          // load menu & orders
          const { data: menuRows } = await supabase.from("menu_items").select("*").order("sort_order");
          if (menuRows) setMenuItems(menuRows);
          const { data: credRow } = await supabase.from("user_credits").select("balance").eq("user_id", session.user.id).maybeSingle();
          if (credRow) setMyCredits(+(credRow.balance) || 0);
          const { data: sgRows } = await supabase.from("sponsor_gifts").select("*").order("tier");
          if (sgRows) setSponsorGifts(sgRows);
          const { data: orderRows } = await supabase.from("orders").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
          if (orderRows) setMyOrders(orderRows);
          // Load gifts
          const { data: giftRows } = await supabase.from("gifts").select("*").eq("recipient_id", session.user.id).order("created_at", { ascending: false });
          if (giftRows) setGifts(giftRows);


          setPage("app");

          // ── Handle Stripe return URL ──────────────────────────────────────
          const sp = new URLSearchParams(window.location.search);
          const stripeResult = sp.get("stripe");
          if (stripeResult === "topup_success") {
            // Webhook already added credits — reload balance and show toast
            window.history.replaceState({}, "", window.location.pathname);
            const { data: cr } = await supabase.from("user_credits").select("balance").eq("user_id", session.user.id).maybeSingle();
            if (cr) setMyCredits(cr.balance);
            setTimeout(() => toast$("Payment successful! Credits added to your account ✓"), 600);
          } else if (stripeResult === "order_success") {
            window.history.replaceState({}, "", window.location.pathname);
            setTimeout(() => toast$("Payment confirmed! Your order is being prepared 🍺"), 600);
          } else if (stripeResult === "cancelled") {
            window.history.replaceState({}, "", window.location.pathname);
            // Delete any ghost card_pending orders left by the cancelled Stripe session
            await supabase.from("orders")
              .delete()
              .eq("user_id", session.user.id)
              .eq("payment_method", "card_pending");
            setTimeout(() => toast$("Payment cancelled — your order was not placed", false), 600);
          }

          return;
        }
      }
      setPage("auth");
    })();
  }, []);


  // ─── REALTIME SUBSCRIPTIONS (replaces most polling) ────────────────────────
  // Strategy:
  //   • matches, rooms, menu_items, profiles → Realtime (push, zero extra queries)
  //   • predictions, credits, orders → user-scoped, lightweight poll every 30s
  //   • room auto-join check → only when rooms change, not on a timer
  useEffect(() => {
    if (page !== "app") return;

    const uid = user?.id;
    if (!uid) return;

    // ── 1. MATCHES — Realtime ────────────────────────────────────────────────
    const matchSub = supabase.channel("rt-matches")
      .on("postgres_changes", { event:"*", schema:"public", table:"matches" }, payload => {
        const r = payload.new || payload.old;
        if (payload.eventType === "DELETE") {
          setMatches(m => m.filter(x => x.id !== r.id));
        } else {
          const mapped = { id:r.id, home:r.home, away:r.away, group:r.match_group,
            date:r.match_date, time:r.match_time, status:r.status,
            hs:r.home_score, as:r.away_score };
          setMatches(m => {
            const idx = m.findIndex(x => x.id === r.id);
            return idx >= 0 ? m.map((x,i) => i===idx ? mapped : x) : [...m, mapped];
          });
          // Notify players when a result is entered
          if (payload.eventType === "UPDATE" && payload.new?.status === "finished" && payload.old?.status !== "finished") {
            playMatchAlert();
            toast$(`⚽ ${r.home} ${r.home_score} – ${r.away_score} ${r.away} · Result is in!`);
            sendNotif("🚨 Match Result are here!", `${r.home} ${r.home_score} – ${r.away_score} ${r.away}`, `result-${r.id}`);
            // Push to ALL users (even those with app closed)
            if (isAdminRef.current) sendPush({ title: "Match Result", body: `${r.home} ${r.home_score} – ${r.away_score} ${r.away}`, tag: `result-${r.id}` });
            try { navigator.vibrate?.([100, 50, 100]); } catch {}
            // Refresh server-side leaderboard scores so the board updates instantly
            supabase.rpc("get_leaderboard_scores").then(({ data: lbData }) => {
              if (lbData) {
                const lm = {}; lbData.forEach(s => { lm[s.user_id] = s.pts; });
                setLeaderScores(lm);
                setPublicBoard(prev => {
                  const updated = prev.map(u => ({ ...u, pts: lm[u.id] ?? u.pts }));
                  return updated.sort((a, b) => b.pts - a.pts);
                });
              }
            });
          }
        }
      }).subscribe();

    // ── 3. MENU ITEMS — Realtime ─────────────────────────────────────────────
    const menuSub = supabase.channel("rt-menu")
      .on("postgres_changes", { event:"*", schema:"public", table:"menu_items" }, payload => {
        const r = payload.new || payload.old;
        if (payload.eventType === "DELETE") {
          setMenuItems(m => m.filter(x => x.id !== r.id));
        } else {
          setMenuItems(m => {
            const idx = m.findIndex(x => x.id === r.id);
            return idx >= 0 ? m.map((x,i) => i===idx ? r : x) : [...m, r].sort((a,b)=>a.sort_order-b.sort_order);
          });
        }
      }).subscribe();

    // ── 4. PROFILES — Realtime (for leaderboard + own sponsor_tier updates) ──
    const profileSub = supabase.channel("rt-profiles")
      .on("postgres_changes", { event:"*", schema:"public", table:"profiles" }, payload => {
        const r = payload.new;
        if (!r || r.is_admin) return;
        setUsers(u => ({ ...u, [r.id]: r }));
        // If this is the current user's profile, update user state too (e.g. sponsor_tier assigned by admin)
        if (r.id === uid) setUser(prev => ({ ...prev, ...r }));
      }).subscribe();

    // ── 5. MY PREDICTIONS — Realtime (only this user's rows) ─────────────────
    const predSub = supabase.channel("rt-preds")
      .on("postgres_changes", {
        event:"*", schema:"public", table:"predictions",
        filter:`user_id=eq.${uid}`
      }, payload => {
        const r = payload.new;
        if (!r) return;
        setPreds(p => ({ ...p, [`${r.user_id}__${r.match_id}`]: { h: r.home_pred, a: r.away_pred } }));
      }).subscribe();

    // ── 6. MY CREDITS — Realtime (single channel handles balance + notification) ─
    const creditNotifSub = supabase.channel("rt-credits-user")
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"user_credits", filter:`user_id=eq.${uid}` }, payload => {
        const newBal = payload.new?.balance;
        const oldBal = payload.old?.balance;
        if (newBal != null) setMyCredits(newBal);
        if (newBal != null && oldBal != null && newBal > oldBal) {
          toast$(`💰 +$${(newBal - oldBal).toFixed(2)} credits added to your account!`);
          sendNotif("🏛️ WALLET", `+$${(newBal - oldBal).toFixed(2)} credits added to your account`, "credits-topup");
          try { navigator.vibrate?.([100, 50, 100]); } catch {}
        }
      }).subscribe();

    // ── 7. MY ORDERS — Realtime ──────────────────────────────────────────────
    const orderSub = supabase.channel("rt-orders")
      .on("postgres_changes", {
        event:"*", schema:"public", table:"orders",
        filter:`user_id=eq.${uid}`
      }, payload => {
        if (payload.eventType === "INSERT") {
          setMyOrders(o => o.find(x => x.id === payload.new.id) ? o : [payload.new, ...o]);
        } else if (payload.eventType === "UPDATE") {
          setMyOrders(o => o.map(x => x.id === payload.new.id ? payload.new : x));
        } else if (payload.eventType === "DELETE") {
          setMyOrders(o => o.filter(x => x.id !== payload.old.id));
        }
      }).subscribe();

    // ── 8. ADMIN ORDER ALERTS (all new orders, admins only) ──────────────────
    let adminOrderSub = null;
    if (isAdmin) {
      adminOrderSub = supabase.channel("rt-admin-orders")
        .on("postgres_changes", { event:"INSERT", schema:"public", table:"orders" }, payload => {
          if (payload.new && payload.new.payment_method !== "card_pending") {
            // Ignore ghost orders from Stripe sessions not yet completed
            playOrderAlert();
            try { navigator.vibrate?.([200, 100, 200]); } catch(e) {}
            setNewOrderAlert(true);
            toast$(`🔔 New order — Table ${payload.new.table_number}`, true);
            setAllOrders(o => o.find(x => x.id === payload.new.id) ? o : [payload.new, ...o]);
          }
        })
        .on("postgres_changes", { event:"UPDATE", schema:"public", table:"orders" }, payload => {
          if (payload.new) {
            setAllOrders(o => o.map(x => x.id === payload.new.id ? payload.new : x));
          }
        })
        .on("postgres_changes", { event:"DELETE", schema:"public", table:"orders" }, payload => {
          if (payload.old) {
            setAllOrders(o => o.filter(x => x.id !== payload.old.id));
          }
        })
        .subscribe();
    }

    // ── 8b. FLOOR PLAN ORDER SYNC (non-admin staff with floor plan access) ─────
    // Admins already receive all order events above. Floor plan staff also need
    // real-time allOrders updates so they see orders from ANY customer, not just
    // their own, and the FloorPlan component can route them to the right printer.
    let floorplanOrderSub = null;
    if (!isAdmin && user?.floorplan_access) {
      floorplanOrderSub = supabase.channel("rt-floorplan-orders")
        .on("postgres_changes", { event:"INSERT", schema:"public", table:"orders" }, payload => {
          if (payload.new && payload.new.payment_method !== "card_pending") {
            setAllOrders(o => o.find(x => x.id === payload.new.id) ? o : [payload.new, ...o]);
          }
        })
        .on("postgres_changes", { event:"UPDATE", schema:"public", table:"orders" }, payload => {
          if (payload.new) {
            setAllOrders(o => o.map(x => x.id === payload.new.id ? payload.new : x));
          }
        })
        .on("postgres_changes", { event:"DELETE", schema:"public", table:"orders" }, payload => {
          if (payload.old) {
            setAllOrders(o => o.filter(x => x.id !== payload.old.id));
          }
        })
        .subscribe();
    }

    // ── 9. GLOBAL EVENTS (winner announcement broadcast to all clients) ──────
    const globalSub = supabase.channel("rt-global-events")
      .on("broadcast", { event: "winner_announced" }, ({ payload }) => {
        setWinnerData(payload.winner || null);
        setShowWinner(true);
      })
      .subscribe();
    globalChannelRef.current = globalSub;

    // ── 9b. MY GIFTS — Realtime ──────────────────────────────────────────────
    const giftSub = supabase.channel("rt-gifts-me")
      .on("postgres_changes", {
        event:"*", schema:"public", table:"gifts",
        filter:`recipient_id=eq.${uid}`
      }, payload => {
        if (payload.eventType === "INSERT" && payload.new) {
          setGifts(g => g.find(x => x.id === payload.new.id) ? g : [payload.new, ...g]);
          // Alert: new gift received — keep it a surprise, no details revealed
          toast$(`🎁 You received a gift! — check in account profile > Gifts`);
          sendNotif("🎁 You received a gift! — check in account profile > Gifts", `gift-${payload.new.id}`);
          try { navigator.vibrate?.([60, 40, 60, 40, 120]); } catch {}
        } else if (payload.eventType === "UPDATE" && payload.new) {
          setGifts(g => g.map(x => x.id === payload.new.id ? payload.new : x));
        } else if (payload.eventType === "DELETE" && payload.old) {
          setGifts(g => g.filter(x => x.id !== payload.old.id));
        }
      }).subscribe();


    // ── 10. LIGHTWEIGHT FALLBACK POLL every 60s ───────────────────────────────
    // Only fetches the user's own lightweight data — failsafe if Realtime misses anything
    // 500 users × 1 query / 60s = ~8 queries/sec total. Very manageable.
    const fallback = setInterval(async () => {
      const { data: cred } = await supabase.from("user_credits")
        .select("balance").eq("user_id", uid).maybeSingle();
      // Only update if the polled value actually differs — prevents the
      // fallback from clobbering a fresher realtime value with a stale read,
      // and keeps the +/-credits animation from firing on equal-value writes.
      if (cred) {
        const next = cred.balance || 0;
        setMyCredits(prev => (Math.abs(prev - next) > 0.0001 ? next : prev));
      }

      const { data: ords } = await supabase.from("orders")
        .select("*").eq("user_id", uid).order("created_at", { ascending:false });
      if (ords) {
        // Only replace the array if it actually changed (length or any id/status differs)
        setMyOrders(prev => {
          if (prev.length !== ords.length) return ords;
          for (let i = 0; i < ords.length; i++) {
            if (prev[i]?.id !== ords[i].id || prev[i]?.status !== ords[i].status) return ords;
          }
          return prev;
        });
      }
    }, 60000);

    return () => {
      supabase.removeChannel(matchSub);
      supabase.removeChannel(menuSub);
      supabase.removeChannel(profileSub);
      supabase.removeChannel(predSub);
      supabase.removeChannel(orderSub);
      supabase.removeChannel(creditNotifSub);
      if (adminOrderSub) supabase.removeChannel(adminOrderSub);
      if (floorplanOrderSub) supabase.removeChannel(floorplanOrderSub);
      supabase.removeChannel(globalSub);
      supabase.removeChannel(giftSub);
      clearInterval(fallback);
    };
  }, [page, user?.id]);

  const playOrderAlert = () => {
    try {
      const ctx = getAudioCtx(); if (!ctx) return;
      [[880, 0], [1100, 0.18], [1320, 0.34]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = "sine";
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + delay + 0.06);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.28);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.32);
      });
    } catch(e) {}
  };

  const playMatchAlert = () => {
    try {
      const ctx = getAudioCtx(); if (!ctx) return;
      [[523, 0], [659, 0.2]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = "sine";
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + delay + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.35);
        osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.38);
      });
    } catch(e) {}
  };

  const toast$ = (msg, ok = true) => {
    const id = Date.now() + Math.random();
    // Auto-classify for icon + accent: errors → red; messages with check/✓ → green; else neutral
    const kind = ok === false ? "err" : (typeof msg === "string" && /warn|caution|⚠/i.test(msg)) ? "warn" : "ok";
    setToasts(prev => [...prev.slice(-3), { id, msg, ok, kind }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3600);
  };

  // ── Push Notifications ──────────────────────────────────────────────────
  const notifTimersRef = useRef([]);
  const pushSubRef = useRef(false); // prevent double-subscribe
  const isAdminRef = useRef(false); // for use in closures (realtime callbacks)

  // Helper: convert VAPID base64url key to Uint8Array
  const urlBase64ToUint8Array = useCallback((base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }, []);

  // Subscribe to Web Push and save subscription to Supabase
  const subscribeToPush = useCallback(async (uid) => {
    if (pushSubRef.current) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;
    try {
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        if (result !== 'granted') return;
      } else if (Notification.permission !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }
      pushSubRef.current = true;
      const subJSON = sub.toJSON();
      await supabase.from('push_subscriptions').delete().eq('user_id', uid).eq('endpoint', subJSON.endpoint);
      await supabase.from('push_subscriptions').insert({
        user_id: uid,
        endpoint: subJSON.endpoint,
        keys_p256dh: subJSON.keys.p256dh,
        keys_auth: subJSON.keys.auth,
      });
    } catch (err) {
      console.warn('Push subscription failed:', err);
    }
  }, [urlBase64ToUint8Array]);

  // Send notification via service worker (works on mobile + desktop)
  const sendNotif = useCallback(async (title, body, tag) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      // Use service worker registration to show notification (required for mobile)
      const reg = await navigator.serviceWorker?.ready;
      if (reg) {
        reg.showNotification(title, {
          body, icon: "/elmundo-logo.png", badge: "/icons/icon-192.png",
          tag: tag || undefined, vibrate: [100, 50, 100], renotify: !!tag,
          data: { url: "/" },
        });
      } else {
        // Fallback for desktop without SW
        new Notification(title, { body, icon: "/elmundo-logo.png", tag: tag || undefined });
      }
    } catch {
      try { new Notification(title, { body, icon: "/elmundo-logo.png" }); } catch {}
    }
  }, []);

  // Subscribe to push notifications when user logs in
  useEffect(() => {
    if (page === "app" && user?.id) subscribeToPush(user.id);
  }, [page, user?.id, subscribeToPush]);

  // Schedule match notifications: 1 hour before + at kickoff
  useEffect(() => {
    if (page !== "app" || !matches.length) return;
    notifTimersRef.current.forEach(clearTimeout);
    notifTimersRef.current = [];
    const now = Date.now();
    matches.forEach(m => {
      if (m.status === "finished") return;
      const ko = matchKickoff(m);
      if (!ko) return;
      const koMs = ko.getTime();
      // 1 hour before
      const reminderDelay = koMs - 60 * 60 * 1000 - now;
      if (reminderDelay > 0 && reminderDelay < 24 * 60 * 60 * 1000) {
        notifTimersRef.current.push(setTimeout(() => {
          sendNotif("📢 Match starting soon!", `${m.home} vs ${m.away} kicks off in 1 hour — place your prediction! Community stats are live in the Matches tab.`, `match-reminder-${m.id}`);
          toast$(`⚽ ${m.home} vs ${m.away} starts in 1 hour!`);
          if (isAdminRef.current) sendPush({ title: "⚠️ Match in 1 hour", body: `${m.home} vs ${m.away} — time to predict! Community stats are live in the Matches tab.`, tag: `reminder-${m.id}` });
        }, reminderDelay));
      }
      // At kickoff
      const kickoffDelay = koMs - now;
      if (kickoffDelay > 0 && kickoffDelay < 24 * 60 * 60 * 1000) {
        notifTimersRef.current.push(setTimeout(() => {
          sendNotif("⚽ Match started!", `${m.home} vs ${m.away} is LIVE now!`, `match-start-${m.id}`);
          toast$(`🔴 ${m.home} vs ${m.away} has kicked off!`);
          if (isAdminRef.current) sendPush({ title: "⚽ KICK OFF!", body: `${m.home} vs ${m.away} is live!`, tag: `kickoff-${m.id}` });
        }, kickoffDelay));
      }
    });
    return () => notifTimersRef.current.forEach(clearTimeout);
  }, [page, matches, sendNotif]);

  // Send push notification to specific user(s) via Edge Function
  // Uses text/plain to avoid CORS preflight (Supabase gateway blocks OPTIONS)
  const sendPush = useCallback(async ({ title, body, tag, url, userIds }) => {
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      await fetch(`${SUPA_URL}/functions/v1/send-push`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ title, body, tag, url, user_ids: userIds }),
      });
    } catch {}
  }, []);

  const doRegister = async () => {
    setFormErr("");
    if (!form.firstName?.trim())           return setFormErr("First name is required.");
    if (!form.lastName?.trim())            return setFormErr("Last name is required.");
    if (!/\S+@\S+\.\S+/.test(form.email)) return setFormErr("Enter a valid email address.");
    if (!form.phone.trim())                return setFormErr("Phone number is required.");
    if (!form.phone.trim().startsWith("+")) return setFormErr("Phone must include country code (e.g. +599, +31, +1).");
    if (form.password.length < 6)          return setFormErr("Password must be at least 6 characters.");
    const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
    const { data, error } = await supabase.auth.signUp({ email: form.email, password: form.password });
    if (error) return setFormErr(error.message);
    // When email confirmation is required, data.user is null — prompt the user
    if (!data?.user) return setFormErr("Check your email to confirm your account, then log in.");
    // Auto-assign next player number atomically via DB sequence (no race condition)
    const { data: seqNum } = await supabase.rpc("next_player_number");
    const playerNumber = seqNum || 1;
    await supabase.from("profiles").upsert({ id: data.user.id, name: fullName, phone: form.phone, player_number: playerNumber });
    setUser({ ...data.user, name: fullName, phone: form.phone, is_admin: false, player_number: playerNumber });
    setPage("app");
    setShowOnboarding(true);
    toast$(`Welcome, ${fullName}! ⚽`);
  };

  const doLogin = async () => {
    setFormErr("");
    if (!form.email || !form.password) return setFormErr("Please fill in all fields.");
    const { data, error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
    if (error) return setFormErr("Incorrect email or password.");
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
    if (!profile) return setFormErr("Account not found. Please register.");
    setUser({ ...data.user, ...profile });
    // Load all user data in parallel
    const [predRows, allProfiles, menuRows, credRow, orderRows] = await Promise.all([
      supabase.from("predictions").select("*").eq("user_id", data.user.id).then(r => r.data || []).catch(() => []),
      supabase.from("profiles").select("*").then(r => r.data || []).catch(() => []),
      supabase.from("menu_items").select("*").order("sort_order").then(r => r.data || []).catch(() => []),
      supabase.from("user_credits").select("balance").eq("user_id", data.user.id).maybeSingle().then(r => r.data).catch(() => null),
      supabase.from("orders").select("*").eq("user_id", data.user.id).order("created_at", { ascending: false }).limit(20).then(r => r.data || []).catch(() => []),
    ]);
    if (predRows) {
      const predMap = {};
      predRows.forEach(p => { predMap[`${p.user_id}__${p.match_id}`] = { h: p.home_pred, a: p.away_pred }; });
      setPreds(predMap);
    }
    if (allProfiles) {
      const usersMap = {};
      allProfiles.filter(p => p.is_admin !== true && p.is_admin !== 1 && p.is_admin !== "true").forEach(p => { usersMap[p.id] = p; });
      setUsers(usersMap);
    }
    if (menuRows) setMenuItems(menuRows);
    if (credRow) setMyCredits(+credRow.balance);
    if (orderRows) setMyOrders(orderRows);
    // Fetch server-side leaderboard scores (avoids the 1000-row cap)
    supabase.rpc("get_leaderboard_scores").then(({ data: lbData }) => {
      if (lbData) {
        const lm = {}; lbData.forEach(s => { lm[s.user_id] = s.pts; });
        setLeaderScores(lm);
      }
    });
    // Fetch community pulse aggregates (non-blocking)
    supabase.rpc("get_match_pulse").then(({ data: pd }) => {
      if (pd) {
        const pm = {};
        pd.forEach(r => {
          pm[r.match_id] = { homeWins: r.home_wins, draws: r.draws, awayWins: r.away_wins,
            total: r.total, topHome: r.top_home, topAway: r.top_away, topCount: r.top_count };
        });
        setPulseCounts(pm);
      }
    });
    setPage("app");
    toast$(`Welcome back, ${profile.name}! ⚽`);
  };

  const doLogout = async () => {
    await supabase.auth.signOut();
    // Clear device-scoped staff state so the next person who signs in starts clean
    try {
      localStorage.removeItem("em-printer-zone");
      localStorage.removeItem("em-printer-seen");
    } catch {}
    setUser(null); setPage("auth");
    setForm({ name:"", email:"", phone:"", password:"" });
    setPreds({}); setUsers({});
  };

  const getPred = id => preds[`${user?.id}__${id}`] || null;
  const predSavingRef = useRef(new Set());
  const savePred = async (id, h, a) => {
    if (predSavingRef.current.has(id)) return;
    // Prediction-banned users cannot submit
    if (user?.is_banned) { toast$("⛔ Cheating detected — you are banned from predictions", false); return; }
    // Round guard: matches outside the active prediction round can't be saved
    const targetMatch = matches.find(m => m.id === id);
    const activeRound = getActivePredictionRound(matches);
    if (!targetMatch || !activeRound || !matchInPredictionRound(targetMatch, activeRound)) {
      toast$("⛔ This match isn't open for predictions yet", false); return;
    }
    predSavingRef.current.add(id);
    try {
      // ── Server-side time check (defeats device clock manipulation) ──────
      // Fetch real server time from Supabase — device clock changes are irrelevant
      const { data: tsData, error: tsErr } = await supabase.rpc("get_server_time");
      if (tsErr || !tsData) { toast$("Cannot verify server time — please try again", false); return; }
      const serverNow = new Date(tsData).getTime();
      const lockMs = getGlobalLockMs(matches);
      if (lockMs && serverNow >= lockMs) {
        toast$("⛔ Prediction window is closed — the tournament has started", false);
        return;
      }
      // ────────────────────────────────────────────────────────────────────
      const { error } = await supabase.from("predictions").upsert(
        { user_id: user.id, match_id: id, home_pred: +h, away_pred: +a },
        { onConflict: "user_id,match_id" }
      );
      if (error) {
        // Server-side lock error
        if (/window|closed|lock/i.test(error.message)) {
          toast$("⛔ Prediction window is closed", false); return;
        }
        // Offline / network error — queue for retry
        if (!navigator.onLine || /fetch/i.test(error.message)) {
          const OFFLINE_QUEUE_KEY = "em-pred-queue";
          const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
          queue.push({ userId: user.id, matchId: id, h: +h, a: +a, savedAt: Date.now() });
          localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
          const k = `${user.id}__${id}`;
          setPreds(p => ({ ...p, [k]: { h:+h, a:+a } }));
          toast$("💾 Saved offline — will sync when back online");
          return;
        }
        toast$("Error saving prediction", false); return;
      }
      const k = `${user.id}__${id}`;
      setPreds(p => ({ ...p, [k]: { h:+h, a:+a } }));
      toast$("Prediction saved ⚽");
      try { navigator.vibrate?.([60, 30, 60]); } catch {}
      // Refresh community pulse counts so the broadcast card reflects the new pick
      supabase.rpc("get_match_pulse").then(({ data: pd }) => {
        if (pd) {
          const pm = {};
          pd.forEach(r => {
            pm[r.match_id] = { homeWins: r.home_wins, draws: r.draws, awayWins: r.away_wins,
              total: r.total, topHome: r.top_home, topAway: r.top_away, topCount: r.top_count };
          });
          setPulseCounts(pm);
        }
      });
    } finally {
      predSavingRef.current.delete(id);
    }
  };

  const adminUpdateMatch = async (updated) => {
    // Validate scores when marking finished
    if (updated.status === "finished") {
      const h = Number(updated.hs), a = Number(updated.as);
      if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h > 99 || a > 99) {
        toast$("Invalid scores — must be whole numbers 0–99", false); return;
      }
    }
    const { error } = await supabase.from("matches").upsert({
      id: updated.id, home: updated.home, away: updated.away,
      match_group: updated.group, match_date: updated.date,
      match_time: updated.time, status: updated.status,
      home_score: updated.hs, away_score: updated.as
    });
    if (error) { toast$("Error saving match: " + error.message, false); return; }
    setMatches(m => m.map(x => x.id === updated.id ? updated : x));
    // Audit log — records who changed what and when
    try { await supabase.from("match_audit_log").insert({
      admin_id: user.id, match_id: updated.id, action: "update", new_data: updated
    }); } catch {}
    toast$("Match updated ✓");
  };
  const adminAddMatch = async (newMatch) => {
    const id = `m${Date.now()}`;
    const { error } = await supabase.from("matches").insert({
      id, home: newMatch.home, away: newMatch.away,
      match_group: newMatch.group, match_date: newMatch.date,
      match_time: newMatch.time, status: newMatch.status,
      home_score: newMatch.hs, away_score: newMatch.as
    });
    if (error) { toast$("Error adding match: " + error.message, false); return; }
    setMatches(m => [...m, { ...newMatch, id }]);
    try { await supabase.from("match_audit_log").insert({
      admin_id: user.id, match_id: id, action: "insert", new_data: { ...newMatch, id }
    }); } catch {}
    toast$("Match added ✓");
  };
  const adminDeleteMatch = async (id) => {
    const deleted = matches.find(m => m.id === id);
    const { error } = await supabase.from("matches").delete().eq("id", id);
    if (error) { toast$("Error removing match: " + error.message, false); return; }
    setMatches(m => m.filter(x => x.id !== id));
    try { await supabase.from("match_audit_log").insert({
      admin_id: user.id, match_id: id, action: "delete", new_data: deleted ?? null
    }); } catch {}
    toast$("Match removed ✓");
  };

  const adminSaveRules = async (newRules) => {
    setRules(newRules); await sset("em_rules", newRules); toast$("Rules saved ✓");
  };
  const adminSaveSponsors = async (newSponsors) => {
    setSponsors(newSponsors); await sset("em_sponsors", newSponsors); toast$("Sponsors saved ✓");
  };

  /* ── Rooms ── */

  // pts() is kept for the current user only (myPts) — real-time because preds
  // is updated optimistically on every save.  For the leaderboard board we use
  // leaderScores (server-side aggregate) so other users' scores aren't limited
  // to the 1000-row PostgREST cap that would silently drop late-registered users.
  const pts = useCallback((uid) =>
    matches.filter(m => m.status === "finished").reduce((acc, m) => {
      const p = preds[`${uid}__${m.id}`];
      return acc + calcPts(p, m.hs, m.as);
    }, 0), [matches, preds]);

  // Full board includes ALL users (admins too) so the rank anchor can always
  // locate the current user regardless of their admin status.
  // LeaderView filters admins out of the visible podium/table itself.
  const board = useMemo(() =>
    Object.values(users)
      .map(u => ({ ...u, pts: leaderScores[u.id] ?? 0 }))
      .sort((a, b) => b.pts - a.pts),
  [users, leaderScores]);

  const isAdmin = user?.is_admin === true || user?.is_admin === 1 || user?.is_admin === "true"
    || user?.badge === "developer" || user?.badge === "owner";
  isAdminRef.current = isAdmin; // keep ref in sync for realtime closures

  // ── MENU HANDLERS ──────────────────────────────────────────────────────────
  const saveMenuItem = async (item) => {
    if (item.id) {
      const { error } = await supabase.from("menu_items").update(item).eq("id", item.id);
      if (error) { toast$("Error saving item", false); return; }
      // optimistic update for edits (realtime also fires but upserts safely)
      setMenuItems(m => m.map(x => x.id === item.id ? { ...x, ...item } : x));
    } else {
      // For new items: do NOT manually add to state — realtime INSERT event will add it
      // This prevents the race condition where both manual add + realtime fire together
      const { error } = await supabase.from("menu_items").insert(item);
      if (error) { toast$("Error adding item", false); return; }
    }
    toast$("Menu item saved ✓");
  };

  const deleteMenuItem = async (id) => {
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) { toast$("Error removing item: " + error.message, false); return; }
    setMenuItems(m => m.filter(x => x.id !== id));
    toast$("Item removed ✓");
  };

  const toggleMenuItemAvail = async (id, available) => {
    await supabase.from("menu_items").update({ available }).eq("id", id);
    setMenuItems(m => m.map(x => x.id === id ? { ...x, available } : x));
  };

  const toggleMenuItemSoldOut = async (item) => {
    const newVal = !item.sold_out;
    await supabase.from("menu_items").update({ sold_out: newVal }).eq("id", item.id);
    setMenuItems(m => m.map(x => x.id === item.id ? { ...x, sold_out: newVal } : x));
  };

  // ─── STRIPE CHECKOUT ────────────────────────────────────────────────────────
  const stripeCheckout = async (payload) => {
    const origin = window.location.origin;
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { ...payload, successUrl: origin, cancelUrl: origin },
      });
      if (error || !data?.url) throw new Error(error?.message || "No checkout URL");
      window.location.href = data.url;
    } catch (e) {
      toast$("Payment error: " + (e?.message || "Please try again"), false);
    }
  };

  // ── PICKUP NUMBER GENERATION ──────────────────────────────────────────────
  // Returns the lowest available number 1-99 not currently used by a pending order.
  const getPickupNumber = async () => {
    try {
      const { data } = await supabase.from("orders")
        .select("order_number")
        .eq("status", "pending")
        .not("order_number", "is", null);
      const used = new Set((data || []).map(o => +o.order_number).filter(n => n >= 1 && n <= 99));
      for (let n = 1; n <= 99; n++) { if (!used.has(n)) return n; }
      return Math.floor(Math.random() * 900) + 100; // fallback if all 99 taken
    } catch {
      return Math.floor(Math.random() * 89) + 1;
    }
  };

  const VALID_PAYMENT_METHODS = ["credits", "cash", "card_pending", "sponsor_gift", "gift"];
  const placeOrder = async ({ tableNumber, items, total, paymentMethod }) => {
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      toast$("Invalid payment method", false); return false;
    }
    const pickupNum = await getPickupNumber();
    // Atomically deduct credits FIRST — uses DB-level lock, defeats race conditions
    if (paymentMethod === "credits") {
      const { data: newBal, error: deductErr } = await supabase.rpc("deduct_credits", {
        p_user_id: user.id, p_amount: total
      });
      if (deductErr) {
        if (deductErr.message?.includes("insufficient_balance")) toast$("Not enough credits", false);
        else toast$("Payment error — please try again", false);
        return false;
      }
      setMyCredits(newBal);
      // Insert order after successful deduction
      const { error } = await supabase.from("orders").insert({
        user_id: user.id, user_name: user.name, table_number: tableNumber,
        items, total, payment_method: paymentMethod, status: "pending",
        order_number: pickupNum,
      }).select().single();
      if (error) {
        // Order failed after credits deducted — refund automatically
        const { data: refundBal } = await supabase.rpc("add_credits", { p_user_id: user.id, p_amount: total });
        if (refundBal != null) setMyCredits(refundBal);
        toast$("Error placing order — credits refunded", false); return false;
      }
    } else {
      const { error } = await supabase.from("orders").insert({
        user_id: user.id, user_name: user.name, table_number: tableNumber,
        items, total, payment_method: paymentMethod, status: "pending",
        order_number: pickupNum,
      }).select().single();
      if (error) { toast$("Error placing order", false); return false; }
    }
    toast$(`🔔 Order placed! Go to the bar, wait in line, then say number ${pickupNum}`);
    try { navigator.vibrate?.([80, 40, 80, 40, 120]); } catch {}
    return pickupNum;
  };

  const adminBanUsers = async (ids, unban = false) => {
    const { error } = await supabase.from("profiles").update({ is_banned: !unban }).in("id", ids);
    if (error) { toast$("Error updating ban status: " + error.message, false); return; }
    setUsers(u => {
      const next = { ...u };
      ids.forEach(id => { if (next[id]) next[id] = { ...next[id], is_banned: !unban }; });
      return next;
    });
    toast$(unban ? `${ids.length} account(s) unbanned ✓` : `⛔ ${ids.length} account(s) banned`);
  };

  const adminSetSponsorTier = async (userId, tier) => {
    const tierVal = tier || null;
    const { error } = await supabase.from("profiles").update({ sponsor_tier: tierVal }).eq("id", userId);
    if (error) {
      toast$("DB error: run the SQL migration in Supabase first — see docs", false);
      console.error("sponsor_tier update error:", error);
      return;
    }
    setUsers(u => ({ ...u, [userId]: { ...u[userId], sponsor_tier: tierVal } }));
    if (user?.id === userId) setUser(u => ({ ...u, sponsor_tier: tierVal }));
    toast$(tier ? `VIP access granted ✓ — sponsor will see the PERKS tab instantly` : "VIP access removed ✓");
  };


  const adminSetFloorplanAccess = async (userId, grant) => {
    const { error } = await supabase.from("profiles").update({ floorplan_access: grant }).eq("id", userId);
    if (error) { toast$("DB error — run: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS floorplan_access BOOLEAN DEFAULT FALSE", false); return; }
    setUsers(u => ({ ...u, [userId]: { ...u[userId], floorplan_access: grant } }));
    toast$(grant ? "Floor plan access granted ✓" : "Floor plan access removed ✓");
  };

  const adminSetKeepupsAccess = async (userId, grant) => {
    const { error } = await supabase.from("profiles").update({ keepups_access: grant }).eq("id", userId);
    if (error) { toast$("DB error — run: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS keepups_access BOOLEAN DEFAULT FALSE", false); return; }
    setUsers(u => ({ ...u, [userId]: { ...u[userId], keepups_access: grant } }));
    if (user?.id === userId) setUser(u => ({ ...u, keepups_access: grant }));
    toast$(grant ? "Keep-Ups access granted ✓" : "Keep-Ups access removed ✓");
  };

  const adminSaveSponsorGifts = async (gifts) => {
    const { data: existing } = await supabase.from("sponsor_gifts").select("id");
    if (existing?.length) {
      await supabase.from("sponsor_gifts").delete().in("id", existing.map(r => r.id));
    }
    if (gifts.length > 0) {
      await supabase.from("sponsor_gifts").insert(gifts.map(g => ({
        tier: g.tier,
        menu_item_id: g.menu_item_id || null,
        item_name: g.item_name,
        item_category: g.item_category || null,
        item_price: +(g.item_price || 0),
        quantity: +(g.quantity || 1),
      })));
    }
    const { data } = await supabase.from("sponsor_gifts").select("*").order("tier");
    if (data) setSponsorGifts(data);
    toast$("Sponsor gifts saved ✓");
  };

  const adminAddCredits = async (userId, amount, userName) => {
    if (!amount || +amount <= 0) { toast$("Enter a valid amount", false); return; }
    // Use atomic RPC to avoid read-modify-write race with concurrent admin sessions
    const { data: newBal, error: upsertErr } = await supabase.rpc("add_credits", { p_user_id: userId, p_amount: +amount });
    if (upsertErr) { toast$("Error adding credits: " + upsertErr.message, false); return; }
    await supabase.from("credit_topups").insert({ user_id: userId, amount, method: "cash", added_by: user.id });
    // Audit log for accountability
    try { await supabase.from("credit_transactions").insert({ admin_id: user.id, target_user_id: userId, amount, new_balance: newBal }); } catch {}
    // Update users state so Credits tab reflects new balance immediately
    setUsers(u => u[userId] ? { ...u, [userId]: { ...u[userId], credits: newBal } } : u);
    toast$(`$${amount} credits added to ${userName} ✓`);
    // Push notification to the player
    sendPush({ title: "🏛️ WALLET", body: `$${amount.toFixed(2)} has been added in your account`, tag: `topup-${userId}`, userIds: [userId] });
    // Print top-up receipt
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    const dateStr = now.toLocaleDateString([], { month:"short", day:"numeric", year:"numeric" });
    silentPrint(`<!DOCTYPE html><html><head><title>Top-Up Receipt</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body { width: 80mm; }
        body { font-family: 'Courier New', monospace; font-size: 15px; font-weight: 700; color: #000; background: #fff; }
        .wrap { width: 72mm; margin: 0 auto; padding: 4mm 0; }
        .center { text-align: center; }
        .logo { font-size: 28px; font-weight: 900; letter-spacing: 3px; margin-bottom: 2px; }
        .sub { font-size: 13px; font-weight: 800; color: #000; margin-bottom: 8px; letter-spacing: 2px; }
        .divider { border-top: 2px dashed #000; margin: 10px 0; }
        .divider-solid { border-top: 3px solid #000; margin: 10px 0; }
        .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; font-weight: 700; }
        .label { font-size: 12px; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px; }
        .big { font-size: 22px; font-weight: 900; letter-spacing: 1px; }
        .amount { font-size: 32px; font-weight: 900; }
        .footer { font-size: 13px; font-weight: 700; color: #000; margin-top: 12px; text-align:center; }
        .type { display:inline-block; border:2px solid #000; padding: 3px 10px; font-size:12px; letter-spacing:2px; font-weight:900; margin-top:5px; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body><div class="wrap">
      <div class="center">
        <div class="logo">EL MUNDO</div>
        <div class="sub">${appSettings.eventName||"WORLD CUP"} ${appSettings.eventYear||2026} · BONAIRE</div>
        <div class="type">TOP-UP RECEIPT</div>
      </div>
      <div class="divider"></div>
      <div class="label">Customer</div>
      <div style="font-size:18px;font-weight:900;margin-bottom:12px">${userName}</div>
      <div class="label">Credits Added</div>
      <div class="amount">$${(+amount).toFixed(2)}</div>
      <div class="divider-solid"></div>
      <div class="row"><span>New Balance</span><span style="font-weight:900">$${newBal.toFixed(2)}</span></div>
      <div class="row"><span>Payment</span><span>Cash / Card</span></div>
      <div class="row"><span>Date &amp; Time</span><span>${dateStr} · ${timeStr}</span></div>
      <div class="divider"></div>
      <div class="center footer">Enjoy the match! ⚽<br>Use credits to order food &amp; drinks.</div>
      <div style="height:20mm"></div>
      </div></body></html>`, sendCut);
  };

  const updateOrderStatus = async (orderId, status) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) { toast$("Error updating order status", false); return; }
    setAllOrders(o => o.map(x => x.id === orderId ? { ...x, status } : x));
  };

  const deleteOrder = async (orderId) => {
    // Mark as "completed" — stays in history but off the floor plan
    const { error } = await supabase.from("orders").update({ status: "completed" }).eq("id", orderId);
    if (error) { toast$("Error completing order", false); return; }
    setAllOrders(o => o.map(x => x.id === orderId ? { ...x, status: "completed" } : x));
  };

  const cancelOrder = async (orderId) => {
    const ord = myOrders.find(o => o.id === orderId) || allOrders.find(o => o.id === orderId);
    if (!ord || ord.status !== "pending") { toast$("Only pending orders can be cancelled", false); return; }
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    if (error) { toast$("Error cancelling order", false); return; }
    // Refund credits atomically if paid with credits
    if (ord.payment_method === "credits" && ord.total > 0) {
      const { data: newBal } = await supabase.rpc("add_credits", { p_user_id: user.id, p_amount: +ord.total });
      if (newBal != null) setMyCredits(newBal);
    }
    setMyOrders(o => o.map(x => x.id === orderId ? { ...x, status: "cancelled" } : x));
    setAllOrders(o => o.map(x => x.id === orderId ? { ...x, status: "cancelled" } : x));
    toast$("Order cancelled ✓");
  };

  const loadAllOrders = async () => {
    const { data } = await supabase.from("orders").select("*")
      .neq("payment_method", "card_pending") // exclude ghost orders from cancelled Stripe sessions
      .order("created_at", { ascending: false });
    if (data) setAllOrders(data);
  };

  // ── Print helpers are defined at module scope (see top of file) ──

  // ── Order receipt printer ─────────────────────────────────────────────────
  const printOrderReceipt = (ord, customerName) => {
    const now = new Date(ord.created_at);
    const timeStr = now.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    const dateStr = now.toLocaleDateString("en-US",{weekday:"short",month:"long",day:"numeric",year:"numeric"});
    const itemRows = (ord.items || []).map(it =>
      `<div class="row"><span>${it.qty}x ${it.name.toUpperCase()}</span><span>$${(it.price*it.qty).toFixed(2)}</span></div>`
    ).join("");
    const payLabel = ord.payment_method === "credits" ? "CREDITS" : ord.payment_method === "card" ? "CARD" : ord.payment_method === "sponsor_gift" ? "COMPLIMENTARY" : "CASH";
    silentPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt</title>
    <style>
      @page{size:80mm auto;margin:0}*{margin:0;padding:0;box-sizing:border-box;page-break-inside:avoid;break-inside:avoid}html,body{width:80mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:'Arial Black','Arial',sans-serif;font-size:14px;font-weight:700;color:#000;background:#fff}
      .wrap{width:74mm;margin:0 auto;padding:3mm 0 6mm}
      .center{text-align:center}
      .brand{font-size:30px;font-weight:900;letter-spacing:5px;line-height:1}
      .bar-rest{font-size:13px;font-weight:900;letter-spacing:4px;margin-top:3px}
      .event{font-size:11px;font-weight:900;letter-spacing:3px;border:2px solid #000;display:inline-block;padding:3px 10px;margin-top:6px}
      .loc{font-size:10px;font-weight:700;letter-spacing:2px;margin-top:5px}
      .sep{border:none;border-top:3px solid #000;margin:10px 0}
      .sep-dash{border:none;border-top:2px dashed #000;margin:7px 0}
      .meta-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:2px dashed #000}
      .meta-lbl{font-size:13px;font-weight:900;letter-spacing:1px;color:#000;text-transform:uppercase}
      .meta-val{font-size:14px;font-weight:900}
      .section-hdr{font-size:12px;font-weight:900;letter-spacing:3px;padding:8px 0 4px;border-bottom:2px solid #000;margin-bottom:2px}
      .row{display:flex;justify-content:space-between;padding:6px 0;font-size:15px;font-weight:800}
      .total-row{display:flex;justify-content:space-between;padding:10px 0 6px;border-top:3px solid #000;font-size:22px;font-weight:900}
      .pay-row{display:flex;justify-content:space-between;font-size:14px;font-weight:900;margin-top:4px}
      .footer{text-align:center;margin-top:14px;padding-top:10px;border-top:3px double #000}
      .thanks{font-size:18px;font-weight:900;letter-spacing:3px;margin-bottom:5px}
      .wc{font-size:13px;font-weight:900;letter-spacing:3px;margin-top:6px}
      .url{font-size:12px;font-weight:900;margin-top:4px}
      @media print{html,body{width:80mm}}
    </style></head><body><div class="wrap">
    <div class="center">
      <div class="brand">EL MUNDO</div>
      <div class="bar-rest">BAR &amp; RESTAURANT</div>
      <div class="event">${appSettings.eventName||"WORLD CUP"} EVENT ${appSettings.eventYear||2026}</div>
      <div class="loc">KRALENDIJK · BONAIRE · EST. 2009</div>
    </div>
    <hr class="sep"/>
    <div class="meta-row"><span class="meta-lbl">Customer</span><span class="meta-val">${customerName||"Guest"}</span></div>
    <div class="meta-row"><span class="meta-lbl">Table</span><span class="meta-val">${ord.table_number}${ord.order_number?` &nbsp;·&nbsp; #${ord.order_number}`:""}</span></div>
    <div class="meta-row"><span class="meta-lbl">Date</span><span class="meta-val">${dateStr}</span></div>
    <div class="meta-row"><span class="meta-lbl">Time</span><span class="meta-val">${timeStr}</span></div>
    <hr class="sep"/>
    <div class="section-hdr">ORDER ITEMS</div>
    ${itemRows}
    <div class="total-row"><span>TOTAL</span><span>$${(+ord.total).toFixed(2)}</span></div>
    <div class="pay-row"><span>PAYMENT</span><span>${payLabel}</span></div>
    <div class="footer">
      <div class="thanks">THANK YOU!</div>
      <div class="wc">⚽ ${appSettings.eventName||"WORLD CUP"} ${appSettings.eventYear||2026} ⚽</div>
      <div class="url">www.elmundobonaire.com</div>
    </div>
    <div style="height:20mm"></div>
    </div></body></html>`, sendCut);
  };

  // Keep document.title in sync with event name/year
  useEffect(() => {
    const n = appSettings.eventName || "WORLD CUP";
    const y = appSettings.eventYear || 2026;
    document.title = `El Mundo — ${n} ${y}`;
  }, [appSettings.eventName, appSettings.eventYear]);

  return (
    <LangContext.Provider value={{ lang, t, toggleLang }}>
    <AppSettingsContext.Provider value={appSettings}>
    <div style={{ fontFamily:"'Outfit',sans-serif", background:"#000", minHeight:"100vh", color:"#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Anton&family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      {/* styles loaded via import "./styles.css" */}
      {showOnboarding && <OnboardingTutorial onDone={() => { localStorage.setItem(ONBOARDING_KEY, "1"); setShowOnboarding(false); }} />}
      {isOffline && (
        <div className="offline-bar">OFFLINE — SOME FEATURES MAY NOT WORK</div>
      )}
      {needRefresh && (
        <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:"#111",border:"1px solid rgba(74,222,128,.5)",borderRadius:12,padding:"12px 20px",display:"flex",alignItems:"center",gap:14,boxShadow:"0 4px 24px rgba(0,0,0,.7)",whiteSpace:"nowrap"}}>
          <span style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.8)"}}>🔄 New version available</span>
          <button onClick={() => updateServiceWorker(true)} style={{fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:1.5,padding:"7px 16px",background:"rgba(74,222,128,.15)",border:"1px solid rgba(74,222,128,.6)",color:"#4ade80",borderRadius:8,cursor:"pointer"}}>UPDATE NOW</button>
        </div>
      )}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.kind}`}>
              <span className="toast-stripe" />
              <span className="toast-icon">
                {t.kind === "err" ? "⚠" : t.kind === "warn" ? "!" : "✓"}
              </span>
              <span className="toast-msg">{t.msg}</span>
              <span className="toast-progress" />
            </div>
          ))}
        </div>
      )}
      {page === "loading" && <div style={{position:"fixed",inset:0,background:"#000",zIndex:999}} />}
      {page === "auth"   && (
        <Auth tab={authTab} setTab={setAuthTab} form={form} setForm={setForm}
              err={formErr} setErr={setFormErr} onLogin={doLogin} onRegister={doRegister}
              publicBoard={publicBoard} appSettings={appSettings} />
      )}
      {page === "app" && appSettings.eventClosed && !user?.is_admin && (
        <EventClosedSplash
          eventName={appSettings.eventName || "WORLD CUP"}
          eventYear={appSettings.eventYear || 2026}
          user={user}
          preds={preds}
          matches={matches}
          board={board}
          onLogout={doLogout}
        />
      )}
      {page === "app" && (!appSettings.eventClosed || user?.is_admin) && (
        <Main
          appTab={appTab} setAppTab={setAppTab} qrTable={qrTable}
          user={user} isAdmin={isAdmin}
          board={board} preds={preds} matches={matches}
          rules={rules} sponsors={sponsors}
          getPred={getPred} savePred={savePred} pts={pts}
          onLogout={doLogout}
          users={users}
          adminUpdateMatch={adminUpdateMatch}
          adminAddMatch={adminAddMatch}
          adminDeleteMatch={adminDeleteMatch}
          adminSaveRules={adminSaveRules}
          adminSaveSponsors={adminSaveSponsors}
          menuItems={menuItems} myCredits={myCredits} setMyCredits={setMyCredits} myOrders={myOrders}
          placeOrder={placeOrder}
          saveMenuItem={saveMenuItem} deleteMenuItem={deleteMenuItem}
          toggleMenuItemAvail={toggleMenuItemAvail}
          toggleMenuItemSoldOut={toggleMenuItemSoldOut}
          adminAddCredits={adminAddCredits}
          updateOrderStatus={updateOrderStatus}
          deleteOrder={deleteOrder}
          cancelOrder={cancelOrder}
          loadAllOrders={loadAllOrders}
          allOrders={allOrders}
          matchesLoaded={matchesLoaded}
          printOrderReceipt={printOrderReceipt}
          stripeCheckout={stripeCheckout}
          onToast={toast$}
          sponsorGifts={sponsorGifts}
          adminSetSponsorTier={adminSetSponsorTier}
          adminSaveSponsorGifts={adminSaveSponsorGifts}
          adminBanUsers={adminBanUsers}
          adminSetFloorplanAccess={adminSetFloorplanAccess}
          adminSetKeepupsAccess={adminSetKeepupsAccess}
          appSettings={appSettings}
          onSaveAppSettings={saveAppSettings}
          newOrderAlert={newOrderAlert} setNewOrderAlert={setNewOrderAlert}
          showWinner={showWinner} setShowWinner={setShowWinner}
          winnerData={winnerData} setWinnerData={setWinnerData}
          gifts={gifts}
          showGifts={showGifts} setShowGifts={setShowGifts}
          pendingGiftItems={pendingGiftItems} setPendingGiftItems={setPendingGiftItems}
          sendNotif={sendNotif}
          sendPush={sendPush}
          pulseCounts={pulseCounts}
        />
      )}
    </div>
    <Analytics />
    <SpeedInsights />
    </AppSettingsContext.Provider>
    </LangContext.Provider>
  );
}

/* ═══ SPLASH ════════════════════════════════════════════════════════════════ */
function Splash({ onSkip }) {
  const mainRef    = useRef(null);
  const goldRef    = useRef(null);
  const sub2Ref    = useRef(null);
  const divRef     = useRef(null);
  const sepRef     = useRef(null);
  const tagRef     = useRef(null);
  const signRef    = useRef(null);
  const ballRef    = useRef(null);
  const glowRef    = useRef(null);

  const [showBall,    setShowBall]    = useState(true);
  const [ballHit,     setBallHit]     = useState(false);
  const [showSign,    setShowSign]    = useState(false);
  const [shake,       setShake]       = useState(false);
  const [flash,       setFlash]       = useState(false);
  const [cracks,      setCracks]      = useState(false);
  const [sparks,      setSparks]      = useState(false);
  const [falling,     setFalling]     = useState(false);
  const [tapHint,     setTapHint]     = useState(false);
  const [progress,    setProgress]    = useState(0);

  useEffect(() => {
    const T = [];
    const at = (ms, fn) => T.push(setTimeout(fn, ms));

    // Progress bar ticks: 0→100 over ~6.5s to match auto-transition
    let prog = 0;
    const progInt = setInterval(() => {
      prog = Math.min(100, prog + 1.7);
      setProgress(prog);
    }, 110);
    T.push(progInt); // store interval handle (clearTimeout works for intervals too — using explicit var)

    at(400, () => setTapHint(true));

    at(3000, () => {
      setBallHit(true);
      setShake(true); setFlash(true); setCracks(true); setSparks(true);
      setTimeout(() => setShake(false), 850);
      setTimeout(() => setFlash(false), 500);
      setTimeout(() => setCracks(false), 1200);
      setTimeout(() => setSparks(false), 1400);
      if (glowRef.current) glowRef.current.style.animation = 'glowBurst 1.8s ease forwards';
    });
    at(3700, () => { setShowBall(false); setShowSign(true); });
    at(5200, () => {
      if (mainRef.current) mainRef.current.style.animation = 'neonWhiteOn 3s ease forwards';
      if (sub2Ref.current) sub2Ref.current.style.animation = 'subWhiteOn 1s ease 1.8s forwards';
      if (divRef.current)  divRef.current.style.animation  = 'dividerOn 0.5s ease 2s forwards';
    });
    at(8500, () => {
      if (goldRef.current) goldRef.current.style.animation = 'neonGoldOn 3s ease forwards';
      if (sepRef.current)  sepRef.current.style.animation  = 'dividerOn 0.5s ease 0.3s forwards';
      if (tagRef.current)  tagRef.current.style.animation  = 'subWhiteOn 1s ease 0.8s forwards';
    });
    at(11800, () => {
      if (mainRef.current) {
        mainRef.current.style.color = '#fff';
        mainRef.current.style.textShadow = '0 0 5px #fff,0 0 12px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9),0 0 85px rgba(180,200,255,.5)';
        mainRef.current.style.animation = 'neonWhiteBreathe 3.5s ease-in-out infinite';
      }
      if (goldRef.current) {
        goldRef.current.style.color = 'rgba(255,200,50,1)';
        goldRef.current.style.textShadow = '0 0 5px rgba(255,200,50,1),0 0 12px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9),0 0 45px rgba(255,160,20,.7),0 0 85px rgba(255,140,10,.4)';
        goldRef.current.style.animation = 'neonGoldBreathe 3s ease-in-out infinite';
      }
    });
    at(16000, () => setFalling(true));
    return () => { T.forEach(id => { clearTimeout(id); clearInterval(id); }); };
  }, []);

  const sparkAngles = [0,25,50,75,100,130,155,180,205,230,260,285,310,335];

  return (
    <div className={`splash${shake ? ' splash-shake' : ''}`} onClick={onSkip}>
      <div className="sp-vignette" />
      {/* Ambient background glow */}
      <div ref={glowRef} className="sp-glow-bg" />
      {flash  && <div className="sp-flash" />}
      {tapHint && <div className="sp-tap-hint">TAP TO SKIP</div>}
      {/* Progress bar */}
      <div className="sp-progress-track">
        <div className="sp-progress-fill" style={{width:`${progress}%`}} />
      </div>
      {cracks && (
        <div className="sp-cracks">
          {[0,30,60,90,120,150,180,210,240,270,300,330].map(deg => (
            <div key={deg} className="sp-crack" style={{transform:`rotate(${deg}deg)`}} />
          ))}
        </div>
      )}
      {sparks && (
        <div className="sp-sparks">
          {sparkAngles.map((deg,i) => (
            <div key={i} className="sp-spark" style={{
              transform:`rotate(${deg}deg)`,
              animationDelay:`${i*0.04}s`,
              height:0,
              position:"absolute",top:0,left:0,
              width:`${1+Math.random()}px`,
              background:`linear-gradient(to bottom,rgba(255,${180+Math.floor(Math.random()*60)},30,1),rgba(255,100,20,.5),transparent)`,
              transformOrigin:"top center",
              animation:`sparkShoot ${0.7+Math.random()*0.4}s cubic-bezier(.2,0,.8,1) ${i*0.04}s forwards`
            }}/>
          ))}
        </div>
      )}
      {showBall && (
        <div ref={ballRef} className={ballHit ? 'sp-ball-smash' : 'sp-ball-fly'}>
          <div className={`sp-ball${ballHit ? ' sp-ball-nospin' : ''}`}>⚽</div>
        </div>
      )}
      {showSign && (
        <div ref={signRef} className={falling ? 'sp-sign-wrap sp-sign-falling' : 'sp-sign-wrap sp-sign-drop'}>
          <div className="sp-ropes">
            <div className="sp-rope" /><div className="sp-rope" />
          </div>
          <div className="sp-sign-board">
            <div ref={mainRef} className="sp-neon-main">EL MUNDO</div>
            <div ref={divRef}  className="sp-sign-divider" style={{opacity:0}} />
            <div ref={sub2Ref} className="sp-neon-sub2">BAR · REST · BONAIRE</div>
            <div ref={sepRef}  className="sp-sign-sep"  style={{opacity:0}} />
            <div ref={goldRef} className="sp-neon-gold">{getEventLabel()}</div>
            <div ref={tagRef}  className="sp-neon-tag" style={{opacity:0}}>⚽ PREDICTION GAME ⚽</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ STADIUM SKY ════════════════════════════════════════════════════════════ */
function StadiumSky() {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    // Rain streaks
    const RAIN_COUNT = 160;
    const rain = Array.from({ length: RAIN_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      len: 0.012 + Math.random() * 0.022,
      speed: 0.0018 + Math.random() * 0.0024,
      alpha: 0.06 + Math.random() * 0.18,
    }));

    // Confetti / ticker — World Cup flag colours bursting from top
    const CONF_COUNT = 55;
    const conf = Array.from({ length: CONF_COUNT }, () => ({
      x: Math.random(),
      y: -Math.random() * 0.3,
      vy: 0.0004 + Math.random() * 0.0007,
      vx: (Math.random() - 0.5) * 0.0006,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.04,
      w: 0.008 + Math.random() * 0.012,
      h: 0.004 + Math.random() * 0.005,
      col: [
        [255,210,0],   // gold
        [220,30,30],   // red
        [255,255,255], // white
        [0,148,68],    // green
        [0,82,180],    // blue
      ][Math.floor(Math.random() * 5)],
      alpha: 0.55 + Math.random() * 0.45,
    }));

    let t = 0;

    // Draw a glowing pitch line
    const pitchLine = (fn, glow = true) => {
      if (glow) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = "rgba(80,255,130,0.07)";
        ctx.lineWidth = 7;
        fn();
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = "rgba(220,255,230,0.55)";
      ctx.lineWidth = 1.4;
      fn();
      ctx.stroke();
      ctx.restore();
    };

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      t += 0.0018;

      // ── BASE: dark green pitch ──────────────────────────────
      ctx.fillStyle = "#0a1f0b"; ctx.fillRect(0, 0, W, H);

      // Alternating grass stripes — horizontal bands
      const stripes = 10;
      for (let i = 0; i < stripes; i++) {
        const y0 = (i / stripes) * H;
        const y1 = ((i + 1) / stripes) * H;
        ctx.fillStyle = i % 2 === 0 ? "rgba(20,55,22,0.6)" : "rgba(12,38,14,0.6)";
        ctx.fillRect(0, y0, W, y1 - y0);
      }

      // ── STADIUM FLOODLIGHTS — four corners, warm wash ────────────
      [
        { cx: 0.0, cy: 0.0 }, { cx: 1.0, cy: 0.0 },
        { cx: 0.0, cy: 1.0 }, { cx: 1.0, cy: 1.0 },
      ].forEach(({ cx, cy }) => {
        const lx = cx * W, ly = cy * H;
        const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, W * 0.72);
        lg.addColorStop(0,   "rgba(255,245,195,0.28)");
        lg.addColorStop(0.25,"rgba(255,240,175,0.12)");
        lg.addColorStop(0.6, "rgba(200,240,160,0.05)");
        lg.addColorStop(1,   "transparent");
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H); ctx.restore();
      });

      // Soft green glow at center of pitch
      const cg = ctx.createRadialGradient(W*0.5, H*0.5, 0, W*0.5, H*0.5, W * 0.45);
      cg.addColorStop(0,   "rgba(30,110,40,0.35)");
      cg.addColorStop(0.5, "rgba(15,60,20,0.15)");
      cg.addColorStop(1,   "transparent");
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H); ctx.restore();

      // ── PITCH MARKINGS ───────────────────────────────────────────
      // Pitch border (inset slightly)
      const px = W * 0.06, py = H * 0.08, pw = W * 0.88, ph2 = H * 0.84;
      pitchLine(() => ctx.strokeRect(px, py, pw, ph2));

      // Center line (vertical)
      pitchLine(() => { ctx.beginPath(); ctx.moveTo(W*0.5, py); ctx.lineTo(W*0.5, py + ph2); });

      // Center circle
      const cr = Math.min(W, H) * 0.14;
      pitchLine(() => { ctx.beginPath(); ctx.arc(W*0.5, H*0.5, cr, 0, Math.PI*2); });

      // Center spot
      ctx.save(); ctx.fillStyle = "rgba(220,255,230,0.7)";
      ctx.beginPath(); ctx.arc(W*0.5, H*0.5, 3, 0, Math.PI*2); ctx.fill(); ctx.restore();

      // Left penalty box
      const pbW = W * 0.18, pbH = H * 0.44;
      const pbLx = px, pbLy = H*0.5 - pbH*0.5;
      pitchLine(() => ctx.strokeRect(pbLx, pbLy, pbW, pbH));

      // Left goal box
      const gbW = W * 0.07, gbH = H * 0.22;
      pitchLine(() => ctx.strokeRect(px, H*0.5 - gbH*0.5, gbW, gbH));

      // Left penalty spot
      ctx.save(); ctx.fillStyle = "rgba(220,255,230,0.7)";
      ctx.beginPath(); ctx.arc(px + W*0.13, H*0.5, 3, 0, Math.PI*2); ctx.fill(); ctx.restore();

      // Left penalty arc (outside penalty box)
      pitchLine(() => {
        ctx.beginPath();
        ctx.arc(px + W*0.13, H*0.5, cr * 0.68, -Math.PI*0.36, Math.PI*0.36);
      }, false);

      // Right penalty box
      pitchLine(() => ctx.strokeRect(px + pw - pbW, pbLy, pbW, pbH));

      // Right goal box
      pitchLine(() => ctx.strokeRect(px + pw - gbW, H*0.5 - gbH*0.5, gbW, gbH));

      // Right penalty spot
      ctx.save(); ctx.fillStyle = "rgba(220,255,230,0.7)";
      ctx.beginPath(); ctx.arc(px + pw - W*0.13, H*0.5, 3, 0, Math.PI*2); ctx.fill(); ctx.restore();

      // Right penalty arc
      pitchLine(() => {
        ctx.beginPath();
        ctx.arc(px + pw - W*0.13, H*0.5, cr * 0.68, Math.PI - Math.PI*0.36, Math.PI + Math.PI*0.36);
      }, false);

      // Corner arcs
      const cAr = W * 0.022;
      [[px, py, 0, Math.PI*0.5], [px+pw, py, Math.PI*0.5, Math.PI],
       [px, py+ph2, -Math.PI*0.5, 0], [px+pw, py+ph2, Math.PI, Math.PI*1.5]
      ].forEach(([cx, cy, a0, a1]) => {
        pitchLine(() => { ctx.beginPath(); ctx.arc(cx, cy, cAr, a0, a1); }, false);
      });

      // ── CONFETTI ─────────────────────────────────────────────────
      conf.forEach(c => {
        c.y += c.vy;
        c.x += c.vx;
        c.rot += c.rotV;
        if (c.y > 1.1) { c.y = -0.05; c.x = Math.random(); }
        const cx2 = c.x * W, cy2 = c.y * H;
        const cw2 = c.w * W, ch2 = c.h * H;
        const [r, g, b] = c.col;
        ctx.save();
        ctx.translate(cx2, cy2);
        ctx.rotate(c.rot);
        ctx.globalAlpha = c.alpha * (0.5 + 0.5 * Math.sin(t * 1.5 + c.x * 10));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(-cw2/2, -ch2/2, cw2, ch2);
        ctx.restore();
      });

      // ── RAIN ─────────────────────────────────────────────────────
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      rain.forEach(r2 => {
        r2.y += r2.speed;
        r2.x += r2.speed * 0.22; // slight diagonal
        if (r2.y > 1.05) { r2.y = -0.02; r2.x = Math.random(); }
        if (r2.x > 1.05) r2.x -= 1;
        const rx = r2.x * W, ry = r2.y * H;
        const rdx = r2.len * W * 0.22, rdy = r2.len * H;
        const rg2 = ctx.createLinearGradient(rx, ry, rx + rdx, ry + rdy);
        rg2.addColorStop(0, "transparent");
        rg2.addColorStop(1, `rgba(180,220,255,${r2.alpha})`);
        ctx.strokeStyle = rg2; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + rdx, ry + rdy); ctx.stroke();
      });
      ctx.restore();

      // ── VIGNETTE — deep around all edges ─────────────────────────
      const vig = ctx.createRadialGradient(W*0.5, H*0.5, H*0.18, W*0.5, H*0.5, H*0.85);
      vig.addColorStop(0, "transparent"); vig.addColorStop(1, "rgba(0,0,0,0.82)");
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

      // Extra dark top bar — so logo/text sits on black
      const topFade = ctx.createLinearGradient(0, 0, 0, H * 0.38);
      topFade.addColorStop(0, "rgba(0,0,0,0.88)");
      topFade.addColorStop(1, "transparent");
      ctx.fillStyle = topFade; ctx.fillRect(0, 0, W, H * 0.38);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <canvas ref={canvasRef} style={{ position:"fixed", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:0 }} />
  );
}


/* ═══ AUTH ══════════════════════════════════════════════════════════════════ */
function Auth({ tab, setTab, form, setForm, err, setErr, onLogin, onRegister, publicBoard, appSettings = {} }) {
  const { t } = useLang();
  const evLabel = `${appSettings.eventName||"WORLD CUP"} ${appSettings.eventYear||2026}`;
  const [showTV,    setShowTV   ] = useState(false);
  const [showTVAds, setShowTVAds] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [phase,   setPhase]   = useState(0); // 0=hidden 1=logo-in 2=text-neon 3=settle 4=done
  const timersRef = useRef([]);

  const skipIntro = () => {
    timersRef.current.forEach(clearTimeout);
    setPhase(4);
  };

  useEffect(() => {
    const at = (ms, fn) => { const id = setTimeout(fn, ms); timersRef.current.push(id); return id; };
    at(200,  () => setPhase(1));   // logo scales in
    at(1100, () => setPhase(2));   // neon text flickers on
    at(4200, () => setPhase(3));   // overlay dissolves, form rises
    at(5800, () => setPhase(4));   // intro fully done
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  const set = k => e => { setForm(f=>({...f,[k]:e.target.value})); setErr(""); };
  const isLogin = tab === "login";
  const introActive = phase < 3;

  if (showTV)    return <TVLeaderboard board={publicBoard} onBack={() => setShowTV(false)} />;
  if (showTVAds) return <TVAdView onBack={() => setShowTVAds(false)} matches={[]} board={publicBoard} />;

  return (
    <div className="auth-root">
      <StadiumSky />
      <div className="auth-grid-bg" style={{opacity: phase >= 3 ? 1 : 0, transition:"opacity 2s ease 0.4s"}} />

      {/* ── CINEMATIC INTRO OVERLAY ── */}
      {phase < 4 && (
        <div
          onClick={introActive ? skipIntro : undefined}
          style={{
            position:"fixed", inset:0, zIndex:80,
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
            background:"#000",
            opacity: phase >= 3 ? 0 : 1,
            transition: phase >= 3 ? "opacity 1.6s ease" : "none",
            pointerEvents: phase >= 3 ? "none" : "auto",
          }}
        >
          {/* Logo */}
          <div style={{
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? "scale(1) translateY(0)" : "scale(0.88) translateY(24px)",
            transition: "opacity 1s cubic-bezier(.16,1,.3,1), transform 1s cubic-bezier(.16,1,.3,1)",
            filter: "none",
          }}>
            <Logo w={240} />
          </div>

          {/* Neon text */}
          <div style={{
            marginTop: 32,
            display:"flex", alignItems:"center", gap:18,
            opacity: phase >= 2 ? 1 : 0,
            transition:"opacity 0.4s ease",
          }}>
            <span style={{height:1,width:44,background:"rgba(255,200,50,.35)",display:"block"}} />
            <span style={{
              fontFamily:"'Anton',sans-serif", fontSize:14, letterSpacing:7,
              color:"rgba(255,200,50,.18)", textTransform:"uppercase", whiteSpace:"nowrap",
              animation: phase >= 2 ? "neonGoldOn 3.2s ease forwards" : "none",
            }}>
              {evLabel} EVENT
            </span>
            <span style={{height:1,width:44,background:"rgba(255,200,50,.35)",display:"block"}} />
          </div>

          {/* TAP TO SKIP */}
          <div style={{
            position:"absolute", bottom:44,
            fontFamily:"'Anton',sans-serif", fontSize:10, letterSpacing:5,
            color:"rgba(255,255,255,.28)", border:"1px solid rgba(255,255,255,.1)",
            padding:"7px 18px", whiteSpace:"nowrap",
            opacity: phase >= 1 ? 1 : 0,
            transition:"opacity 0.6s ease 0.6s",
            animation:"tapHintPulse 1.8s ease-in-out infinite",
          }}>TAP TO SKIP</div>
        </div>
      )}

      {/* ── AUTH CONTENT ── */}
      <div className="auth-wrap" style={{
        opacity: phase >= 3 ? 1 : 0,
        transform: phase >= 3 ? "scale(1) translateY(0)" : "scale(0.97) translateY(28px)",
        transition: phase >= 3 ? "opacity 1.4s cubic-bezier(.16,1,.3,1) .5s, transform 1.4s cubic-bezier(.16,1,.3,1) .5s" : "none",
        pointerEvents: phase >= 3 ? "auto" : "none",
      }}>
        <div className="auth-hero">
          <Logo w={220} />
          <div className="auth-event">
            <span className="auth-event-rule" />
            <span className="auth-event-text">{evLabel} EVENT</span>
            <span className="auth-event-rule" />
          </div>
        </div>
        <div className="auth-panel" style={{animation: phase >= 3 ? "fadeUp .7s cubic-bezier(.16,1,.3,1) .25s both" : "none"}}>
          <div className="auth-tabs">
            <button className={`auth-tab ${isLogin?"atab-on":""}`} onClick={()=>{setTab("login");setErr("");}}>{t('signIn')}</button>
            <button className={`auth-tab ${!isLogin?"atab-on":""}`} onClick={()=>{setTab("register");setErr("");}}>{t('register')}</button>
          </div>
          <div className="auth-form">
            {!isLogin && <>
              <div style={{display:"flex",gap:10}}>
                <FField label="FIRST NAME"  val={form.firstName||""} on={set("firstName")} ph="John" />
                <FField label="LAST NAME"   val={form.lastName||""}  on={set("lastName")}  ph="Doe"  />
              </div>
              <FField label={t('phone')} val={form.phone} on={set("phone")} ph="+599 700 0000" />
              <div style={{fontSize:10,color:"rgba(255,255,255,.3)",letterSpacing:1,marginTop:-6,paddingLeft:2}}>Country code required · e.g. +599, +31, +1, +34</div>
            </>}
            <FField label={t('email')}     val={form.email}    on={set("email")}    ph="your@email.com"     type="email"    />
            <FField label={t('password')}  val={form.password} on={set("password")} ph="Min. 8 characters" type="password" />
            {err && <div className="auth-err"><span className="auth-err-dot">!</span>{err}</div>}
            <button className="auth-cta" disabled={authLoading} onClick={async () => {
              setAuthLoading(true);
              try { await (isLogin ? onLogin : onRegister)(); } finally { setAuthLoading(false); }
            }}>
              {authLoading ? <span className="auth-spinner" /> : (isLogin ? t('signInBtn') : t('registerBtn'))}
            </button>
            <p className="auth-footer-text">
              {isLogin ? t('dontHaveAccount') + " " : t('alreadyHaveAccount') + " "}
              <span className="auth-footer-link" onClick={()=>{setTab(isLogin?"register":"login");setErr("");}}>
                {isLogin ? t('registerHere') : t('signInHere')}
              </span>
            </p>
          </div>
        </div>
        <button className="tv-lb-btn" style={{animation: phase >= 3 ? "fadeUp .7s cubic-bezier(.16,1,.3,1) .4s both" : "none"}} onClick={() => setShowTV(true)}>
          <span className="tv-lb-btn-ico">📺</span>
          <div className="tv-lb-btn-inner">
            <span className="tv-lb-btn-text">VIEW LEADERBOARD</span>
            <span className="tv-lb-btn-sub">TV / Big screen display</span>
          </div>
        </button>
        <button className="tv-lb-btn" style={{animation: phase >= 3 ? "fadeUp .7s cubic-bezier(.16,1,.3,1) .6s both" : "none"}} onClick={() => setShowTVAds(true)}>
          <span className="tv-lb-btn-ico">🎬</span>
          <div className="tv-lb-btn-inner">
            <span className="tv-lb-btn-text">TV ADVERTISEMENTS</span>
            <span className="tv-lb-btn-sub">Run on big screens</span>
          </div>
        </button>
      </div>
    </div>
  );
}
function FField({ label, val, on, ph, type="text" }) {
  return (
    <div className="ffield">
      <label className="ffield-lbl">{label}</label>
      <input className="ffield-inp" type={type} value={val} onChange={on} placeholder={ph} autoComplete="off" />
    </div>
  );
}

/* ═══ TV LEADERBOARD ════════════════════════════════════════════════════════ */
function useBalls() {
  const [balls, setBalls] = useState(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      vx: (Math.random() - 0.5) * 0.55,
      vy: (Math.random() - 0.5) * 0.55,
      size: 28 + Math.random() * 44,
      rot: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 4.5,
      opacity: 0.06 + Math.random() * 0.13,
      blur: Math.random() > 0.5 ? 1 : 0,
    }))
  );

  useEffect(() => {
    let raf;
    const tick = () => {
      setBalls(prev => prev.map(b => {
        let { x, y, vx, vy, rot, rotSpeed } = b;
        x += vx; y += vy; rot += rotSpeed;
        // bounce off walls
        if (x < -5)  { x = -5;  vx = Math.abs(vx) + Math.random() * 0.1; }
        if (x > 105) { x = 105; vx = -(Math.abs(vx) + Math.random() * 0.1); }
        if (y < -5)  { y = -5;  vy = Math.abs(vy) + Math.random() * 0.1; }
        if (y > 105) { y = 105; vy = -(Math.abs(vy) + Math.random() * 0.1); }
        // cap speed
        const spd = Math.sqrt(vx*vx + vy*vy);
        if (spd > 0.7) { vx *= 0.97; vy *= 0.97; }
        if (spd < 0.1) { vx += (Math.random()-0.5)*0.15; vy += (Math.random()-0.5)*0.15; }
        return { ...b, x, y, vx, vy, rot, rotSpeed };
      }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return balls;
}

const TV_PARTICLES = [
  {l:5,d:0,h:7,s:2},{l:10,d:2.1,h:9,s:3},{l:18,d:.5,h:6,s:2},{l:25,d:3.2,h:10,s:3},
  {l:33,d:1.4,h:8,s:2},{l:40,d:4.0,h:6,s:3},{l:48,d:.8,h:11,s:2},{l:55,d:2.7,h:7,s:4},
  {l:62,d:1.1,h:9,s:2},{l:70,d:3.5,h:8,s:3},{l:77,d:.3,h:6,s:2},{l:84,d:2.3,h:10,s:3},
  {l:91,d:4.5,h:7,s:2},{l:8,d:5.2,h:8,s:4},{l:22,d:1.8,h:9,s:2},{l:44,d:3.8,h:6,s:3},
  {l:66,d:4.8,h:11,s:2},{l:88,d:.6,h:7,s:3},{l:35,d:2.9,h:8,s:2},{l:60,d:5.5,h:9,s:3},
];
function TVParticles() {
  return (
    <div className="tv-particles">
      {TV_PARTICLES.map((p, i) => (
        <div key={i} className="tv-particle" style={{
          left:`${p.l}%`,
          animationDuration:`${p.h}s`,
          animationDelay:`-${p.d}s`,
          width:`${p.s}px`,
          height:`${p.s}px`,
        }} />
      ))}
    </div>
  );
}

function TVLeaderboard({ board, onBack, inAd = false }) {
  const { evLabel } = useEvt();
  const [mode,   setMode]   = useState("scroll");
  const [visIdx, setVisIdx] = useState(0);

  // Auto-cycle scroll ↔ podium every 12s with smooth fade
  useEffect(() => {
    const id = setInterval(() => {
      setMode(m => m === "scroll" ? "podium" : "scroll");
    }, 12000);
    return () => clearInterval(id);
  }, []);

  // Row highlight sweep
  useEffect(() => {
    if (mode !== "scroll") return;
    setVisIdx(0);
    const id = setInterval(() => setVisIdx(i => (i + 1) % Math.max(board.length, 1)), 1800);
    return () => clearInterval(id);
  }, [mode, board.length]);

  const top3 = board.slice(0, 3);

  const MEDAL_GLOW = ["gold","silver","bronze"];

  const inner = (
    <div className={inAd ? "tvad-lb-inner" : "tv-root"}>
      <TVParticles />
      <div className="tv-vignette" />
      {!inAd && <button className="tv-back-btn" onClick={onBack}>← BACK TO LOGIN</button>}

      <div className="tv-header">
        <Logo w={72} />
        <div className="tv-header-text">
          <div className="tv-title">{evLabel}</div>
          <div className="tv-subtitle">EL MUNDO BAR · BONAIRE</div>
        </div>
      </div>

      <div className="tv-header-divider" />

      <div className="tv-mode-dots">
        <span className={`tv-dot ${mode==="scroll"?"tv-dot-on":""}`} />
        <span className={`tv-dot ${mode==="podium"?"tv-dot-on":""}`} />
      </div>

      {mode === "scroll" && (
        <div key="scroll" className="tv-scroll-wrap tv-mode-fade">
          <div className="tv-section-label">LEADERBOARD — TOP 10</div>
          {board.length === 0 && <div className="tv-empty">No players yet — be the first to register!</div>}
          {board.map((u, i) => (
            <div key={u.id} className={`tv-row tv-row-rank-${Math.min(i,3)} ${visIdx===i?"tv-row-lit":""}`}>
              <div className="tv-rank">
                {i < 3
                  ? <span className={`tv-medal tv-medal-${MEDAL_GLOW[i]}`}>{["🥇","🥈","🥉"][i]}</span>
                  : <span className="tv-rank-n">#{i+1}</span>
                }
              </div>
              <div className={`tv-name${i<3?" tv-"+["gold","silver","bronze"][i]:""}`}>{u.name}</div>
              <div className="tv-pts-wrap">
                <span className={`tv-pts${i<3?" tv-"+["gold","silver","bronze"][i]:""}`}>{u.pts}</span>
                <span className="tv-pts-u">PTS</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === "podium" && (
        <div key="podium" className="tv-podium-wrap tv-mode-fade">
          <div className="tv-section-label">TOP 3 PODIUM</div>
          <div className="tv-podium">
            {top3[1] && (
              <div className="tv-pod">
                <div className="tv-pod-medal tv-pod-medal-silver">🥈</div>
                <div className="tv-pod-name tv-silver">{top3[1].name}</div>
                <div className="tv-pod-pts tv-silver">{top3[1].pts}<span className="tv-pod-pts-u">pts</span></div>
                <div className="tv-pod-block tv-pod-block-2" />
              </div>
            )}
            {top3[0] && (
              <div className="tv-pod">
                <div className="tv-pod-crown">👑</div>
                <div className="tv-pod-medal tv-pod-medal-gold">🥇</div>
                <div className="tv-pod-name tv-pod-name-1 tv-gold">{top3[0].name}</div>
                <div className="tv-pod-pts tv-pod-pts-1 tv-gold">{top3[0].pts}<span className="tv-pod-pts-u">pts</span></div>
                <div className="tv-pod-block tv-pod-block-1" />
              </div>
            )}
            {top3[2] && (
              <div className="tv-pod">
                <div className="tv-pod-medal tv-pod-medal-bronze">🥉</div>
                <div className="tv-pod-name tv-bronze">{top3[2].name}</div>
                <div className="tv-pod-pts tv-bronze">{top3[2].pts}<span className="tv-pod-pts-u">pts</span></div>
                <div className="tv-pod-block tv-pod-block-3" />
              </div>
            )}
          </div>
          {board.length === 0 && <div className="tv-empty">No players yet!</div>}
        </div>
      )}

      <div className="tv-footer">Exact score = 5 pts · Correct winner = 1 pt · Most points wins</div>
    </div>
  );
  return inner;
}

/* ── Animated number hook — smooth easeOutExpo counter ─────────────────── */
// Pull-to-refresh wrapper. Touch only. Wire `onRefresh` to whatever should run
// when the user pulls past ~60px and releases (realtime already streams data,
// so a small delay is fine — the spinner is the value here).
function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const ref = useRef(null);
  const scrollerRef = useRef(null);

  useEffect(() => {
    let el = ref.current;
    while (el) {
      const oy = window.getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") { scrollerRef.current = el; break; }
      el = el.parentElement;
    }
  }, []);

  const onTouchStart = e => {
    const sc = scrollerRef.current || document.scrollingElement;
    if (!sc || sc.scrollTop > 1 || refreshing) { startY.current = null; return; }
    startY.current = e.touches[0].clientY;
  };
  const onTouchMove = e => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setPull(Math.min(dy * 0.45, 90));
    else setPull(0);
  };
  const onTouchEnd = async () => {
    if (startY.current === null) return;
    const wasReady = pull > 60;
    startY.current = null;
    if (wasReady) {
      setRefreshing(true);
      try {
        await Promise.resolve(onRefresh?.());
      } finally {
        // Brief minimum spin so the gesture feels intentional even on fast networks
        setTimeout(() => { setRefreshing(false); setPull(0); }, 600);
      }
    } else setPull(0);
  };

  return (
    <div ref={ref} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} style={{position:"relative"}}>
      <div className={`ptr-indicator ${refreshing ? "ptr-refreshing" : ""}`} style={{
        marginLeft:-18,
        top:0,
        transform:`translateY(${refreshing ? 24 : Math.max(pull - 38, -38)}px) ${refreshing ? "rotate(0deg)" : ""}`,
        opacity: refreshing ? 1 : Math.min(pull/55, 1),
        transition: refreshing ? "transform .35s ease" : (pull === 0 ? "transform .25s ease,opacity .25s ease" : "none"),
        zIndex:5
      }}>
        <Logo w={20} />
      </div>
      <div style={{
        transform:`translateY(${pull}px)`,
        transition: refreshing ? "transform .35s ease" : (pull === 0 ? "transform .25s ease" : "none")
      }}>
        {children}
      </div>
    </div>
  );
}

function useAnimatedNumber(target, duration = 700) {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const rafRef  = useRef(null);

  useEffect(() => {
    // Always tween from the CURRENT visible value, not the previous "from".
    // This prevents snapping when target changes back-to-back: if a tween
    // was in flight at value X heading to Y, a new target Z restarts from X.
    const from = displayRef.current;
    if (from === target) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const startTs = performance.now();
    const animate = (now) => {
      const t = Math.min((now - startTs) / duration, 1);
      const ease = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const v = from + (target - from) * ease;
      displayRef.current = v;
      setDisplay(v);
      if (t < 1) { rafRef.current = requestAnimationFrame(animate); }
      else { displayRef.current = target; setDisplay(target); rafRef.current = null; }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return display;
}

/* ═══ MAIN SHELL ════════════════════════════════════════════════════════════ */
function Main({ appTab, setAppTab, user, isAdmin, board, preds, matches, rules, sponsors,
                getPred, savePred, pts, onLogout,
                users,
                adminUpdateMatch, adminAddMatch, adminDeleteMatch,
                adminSaveRules, adminSaveSponsors,
                menuItems, myCredits, setMyCredits, myOrders, placeOrder,
                saveMenuItem, deleteMenuItem, toggleMenuItemAvail, toggleMenuItemSoldOut,
                adminAddCredits, updateOrderStatus, deleteOrder, cancelOrder, loadAllOrders, allOrders, matchesLoaded,
                printOrderReceipt, stripeCheckout, onToast,
                sponsorGifts, adminSetSponsorTier, adminSaveSponsorGifts, adminBanUsers = () => {}, adminSetFloorplanAccess = () => {}, adminSetKeepupsAccess = () => {},
                appSettings = { showMatches:true, showLeaderboard:true, showMundogram:true, showMenu:true, noEventMode:false }, onSaveAppSettings = () => {},
                newOrderAlert = false, setNewOrderAlert,
                showWinner = false, setShowWinner, winnerData, setWinnerData,
                gifts = [], showGifts = false, setShowGifts = () => {},
                pendingGiftItems = [], setPendingGiftItems = () => {},
                qrTable = "", sendNotif = () => {}, sendPush = () => {},
                pulseCounts = {} }) {
  const { t, lang, toggleLang } = useLang();
  const myPts  = pts(user.id);
  const myRank = board.findIndex(u => u.id === user.id) + 1;

  // ── Post-match card + points animation ──────────────────────────────────
  const [postMatchCard, setPostMatchCard] = useState(null);
  const [ptsAnim, setPtsAnim]             = useState(null); // { delta, key }
  // Initialised lazily so first-load finished matches are ignored
  const seenFinishedRef = useRef(null);
  const prevPtsRef      = useRef(null); // null = not yet initialised
  const prevRankRef     = useRef(myRank);

  // Reset all delta-tracking refs when a different user signs in on this device.
  // Otherwise +PTS / credit deltas fire against the previous user's baseline.
  const userIdRef = useRef(user?.id);
  useEffect(() => {
    if (userIdRef.current !== user?.id) {
      userIdRef.current      = user?.id;
      seenFinishedRef.current = null;
      prevPtsRef.current      = null;
      prevRankRef.current     = myRank;
      // prevCreditsRef declared below — reset via the closure pattern in its own effect
    }
  }, [user?.id]); // eslint-disable-line

  // Detect newly-finished matches (realtime push from admin) — order matters:
  // this effect runs BEFORE the myPts effect so prevRankRef still holds old rank
  useEffect(() => {
    if (!seenFinishedRef.current) {
      // First run: seed with already-finished matches so we don't spam on load
      seenFinishedRef.current = new Set(matches.filter(m => m.status === "finished").map(m => m.id));
      return;
    }
    const newlyFinished = matches.filter(m =>
      m.status === "finished" && !seenFinishedRef.current.has(m.id)
    );
    if (!newlyFinished.length) return;
    for (const m of newlyFinished) {
      seenFinishedRef.current.add(m.id);
      const p = preds[`${user.id}__${m.id}`] ?? null;
      setPostMatchCard({
        match: m,
        pred: p,
        earned: calcPts(p, m.hs, m.as),
        prevRank: prevRankRef.current,
        newRank: myRank,
      });
      break; // show one card at a time
    }
  }, [matches]); // eslint-disable-line

  // Track pts for floating animation (runs after the matches effect)
  useEffect(() => {
    if (prevPtsRef.current === null) { prevPtsRef.current = myPts; prevRankRef.current = myRank; return; }
    const delta = myPts - prevPtsRef.current;
    // Always update refs before early return so they stay fresh
    prevPtsRef.current  = myPts;
    prevRankRef.current = myRank;
    if (delta > 0) {
      setPtsAnim({ delta, key: Date.now() });
      const t = setTimeout(() => setPtsAnim(null), 3600);
      return () => clearTimeout(t);
    }
  }, [myPts]); // eslint-disable-line

  // ── Credits change tracking ──────────────────────────────────────────────
  const [creditsAnim, setCreditsAnim] = useState(null); // {delta, key, positive}
  const prevCreditsRef = useRef(null);

  // Reset on user switch so we don't animate a delta against the previous user
  useEffect(() => { prevCreditsRef.current = null; }, [user?.id]);

  useEffect(() => {
    if (prevCreditsRef.current === null) { prevCreditsRef.current = myCredits; return; }
    const delta = myCredits - prevCreditsRef.current;
    prevCreditsRef.current = myCredits;
    if (Math.abs(delta) > 0.001) {
      setCreditsAnim({ delta, key: Date.now(), positive: delta > 0 });
      const t = setTimeout(() => setCreditsAnim(null), 3600);
      return () => clearTimeout(t);
    }
  }, [myCredits]); // eslint-disable-line

  // Animated display value for the credits badge
  const animatedCredits = useAnimatedNumber(myCredits, 900);

  // Initial sub-tab to open inside MenuView (e.g. "wallet" when credit badge tapped)
  const [menuInitTab, setMenuInitTab] = useState(null);

  // Header glassmorphism kicks in once the page is scrolled
  const [hdrScrolled, setHdrScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const sc = document.querySelector(".body")?.scrollTop || window.scrollY || 0;
      setHdrScrolled(sc > 8);
    };
    const body = document.querySelector(".body");
    body?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      body?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, [appTab]);

  const [animKey, setAnimKey] = useState(appTab);
  const [showTVAd, setShowTVAd] = useState(false);

  // "Add to Home Screen" prompt
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const deferredPromptRef = useRef(null);
  useEffect(() => {
    // Already installed as PWA or dismissed before
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const dismissed = localStorage.getItem("em_install_dismissed");
    if (isStandalone || dismissed) return;
    // Android: listen for beforeinstallprompt
    const handler = (e) => { e.preventDefault(); deferredPromptRef.current = e; setShowInstallBanner(true); };
    window.addEventListener("beforeinstallprompt", handler);
    // iOS: show manual instructions after 3 seconds
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    let timer;
    if (isIOS) timer = setTimeout(() => setShowInstallBanner(true), 3000);
    return () => { window.removeEventListener("beforeinstallprompt", handler); clearTimeout(timer); };
  }, []);
  const handleInstall = async () => {
    if (deferredPromptRef.current) {
      deferredPromptRef.current.prompt();
      await deferredPromptRef.current.userChoice;
      deferredPromptRef.current = null;
    }
    setShowInstallBanner(false);
    localStorage.setItem("em_install_dismissed", "1");
  };
  const dismissInstall = () => {
    setShowInstallBanner(false);
    localStorage.setItem("em_install_dismissed", "1");
  };
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  const switchTab = (id) => {
    setAnimKey(id); setAppTab(id);
    if (id === "floorplan" && setNewOrderAlert) setNewOrderAlert(false);
  };

  const tabs = [
    ...(!appSettings.noEventMode && appSettings.showMatches  !== false ? [{ id:"matches",     label:t('matches'),     ico:<SoccerIco /> }] : []),
    ...(!appSettings.noEventMode && appSettings.showLeaderboard !== false ? [{ id:"leaderboard", label:t('leaderboard'), ico:<TrophyIco /> }] : []),
    ...(appSettings.showMundogram !== false ? [{ id:"moments", label:"MUNDOGRAM", ico:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg> }] : []),
    ...(appSettings.showMenu !== false ? [{ id:"menu", label:t('menu'), ico:<MenuIco /> }] : []),
    { id:"profile", label:t('profile'), ico:<PersonIco /> },
    ...(user?.sponsor_tier ? [{ id:"vip", label:"PERKS", ico:<span style={{fontSize:16}}>⭐</span> }] : []),
    ...(user?.floorplan_access ? [{ id:"floorplan", label:"FLOOR", ico:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> }] : []),
    ...(user?.keepups_access ? [{ id:"keepups", label:"KEEP-UPS", ico:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2c0 0-4 4-4 10s4 10 4 10"/><path d="M12 2c0 0 4 4 4 10s-4 10-4 10"/><path d="M2 12h20"/><path d="M4.93 7h14.14M4.93 17h14.14"/></svg> }] : []),
    ...(isAdmin ? [{ id:"admin", label:t('admin'), ico:<AdminIco /> }] : []),
  ];

  // When settings change (e.g. event turned off), redirect to first available tab
  useEffect(() => {
    if (!tabs.find(t => t.id === appTab)) {
      const first = tabs[0];
      if (first) switchTab(first.id);
    }
  }, [appTab, appSettings.noEventMode, appSettings.showMatches, appSettings.showLeaderboard, appSettings.showMundogram, appSettings.showMenu]);

  if (showTVAd) return <TVAdView onBack={() => setShowTVAd(false)} matches={matches} />;

  return (
    <div className="shell">
      {/* Post-match result card */}
      {postMatchCard && <PostMatchCard data={postMatchCard} onClose={() => setPostMatchCard(null)} />}
      {/* Majestic PTS award animation — full-screen ceremony */}
      {ptsAnim && createPortal(
        <div key={ptsAnim.key} className="award-overlay award-pts">
          <div className="award-vignette" />
          <div className="award-rays award-rays-gold" />
          <div className="award-rings">
            <div className="award-ring award-ring-1" />
            <div className="award-ring award-ring-2" />
            <div className="award-ring award-ring-3" />
          </div>
          <div className="award-particles">
            {Array.from({length:14}).map((_,i)=>(
              <span key={i} className={`award-particle ap-${i}`} />
            ))}
          </div>
          <div className="award-stage">
            <div className="award-emblem award-emblem-gold">
              <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
                <defs>
                  <linearGradient id="ptsG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFE08A"/>
                    <stop offset="50%" stopColor="#F0C040"/>
                    <stop offset="100%" stopColor="#A8770F"/>
                  </linearGradient>
                </defs>
                <path d="M32 6l7.6 15.4 17 2.5-12.3 12 2.9 16.9L32 44.8 16.8 52.8l2.9-16.9L7.4 23.9l17-2.5z" fill="url(#ptsG)" stroke="#fff5d1" strokeWidth="0.6"/>
              </svg>
            </div>
            <div className="award-eyebrow">YOU EARNED</div>
            <div className="award-amount award-amount-gold">
              <span className="award-shine">+{ptsAnim.delta}</span>
            </div>
            <div className="award-label">{ptsAnim.delta === 1 ? "POINT" : "POINTS"}</div>
            <div className="award-stars">{"★".repeat(Math.min(ptsAnim.delta, 5))}</div>
          </div>
        </div>,
        document.body
      )}
      <header className={`hdr ${hdrScrolled ? "hdr-scrolled" : ""}`} style={appTab === "moments" ? {display:"none"} : undefined}>
        <div className="hdr-inner">
          <div className="hdr-l">
            <button className="hdr-logo-btn" onClick={() => switchTab("matches")} title="Go to Matches">
              <Logo w={72} />
            </button>
          </div>
          <div className="hdr-r">
            {!isAdmin && myRank > 0 && (
              <div className="hdr-badge" style={{position:"relative"}}>
                <span className="hdr-badge-pts">{myPts}</span>
                <div className="hdr-badge-meta">
                  <span className="hdr-badge-label">PTS</span>
                  <span className="hdr-badge-rank">#{myRank}</span>
                </div>
                {ptsAnim && (
                  <span key={ptsAnim.key} style={{
                    position:"absolute",top:-4,right:-4,
                    fontFamily:"'Anton',sans-serif",fontSize:15,color:"#F0C040",
                    pointerEvents:"none",whiteSpace:"nowrap",
                    filter:"drop-shadow(0 0 6px rgba(240,192,64,.7))",
                    animation:"ptsBubble 2.4s ease forwards",zIndex:100,
                  }}>+{ptsAnim.delta}</span>
                )}
              </div>
            )}
            {!isAdmin && myRank === 0 && (
              <div className="hdr-badge">
                <span className="hdr-badge-pts">0</span>
                <span className="hdr-badge-label">PTS</span>
              </div>
            )}
            {/* ── Credits badge — shown for ALL users. Tap → wallet ── */}
            <div className="hdr-credits-wrap">
              <div
                className="hdr-credits-badge"
                onClick={() => { setMenuInitTab("wallet"); switchTab("menu"); }}
                title="Open your wallet"
              >
                <div className="hdr-credits-icon">💳</div>
                <div className="hdr-credits-info">
                  <span className="hdr-credits-value">
                    ${animatedCredits.toFixed(2)}
                  </span>
                  <span className="hdr-credits-label">CREDITS</span>
                </div>
              </div>
              {/* Delta floats up to the right of the badge */}
              {creditsAnim && (
                <span
                  key={creditsAnim.key}
                  className={`hdr-credits-delta ${creditsAnim.positive ? "hdr-credits-delta-up" : "hdr-credits-delta-down"}`}
                >
                  {creditsAnim.positive ? "+" : "−"}${Math.abs(creditsAnim.delta).toFixed(2)}
                </span>
              )}
            </div>
            {isAdmin && <span className="admin-badge">ADMIN</span>}
            <button className="lang-toggle" onClick={toggleLang} title="Switch language">
              {lang === "en" ? "🇳🇱 NL" : "🇬🇧 EN"}
            </button>
            <button className="hdr-out" onClick={onLogout} title="Log out"><LogoutIco /></button>
          </div>
        </div>
      </header>
      <main className="body">
        <div className="body-inner page-anim" key={animKey}>
          {appTab === "matches" && <ErrorBoundary name="matches"><PullToRefresh onRefresh={() => new Promise(r => setTimeout(r, 700))}><MatchesView matches={matches} getPred={getPred} savePred={savePred} loaded={matchesLoaded} isBanned={!!user?.is_banned} allPreds={preds} user={user} pulseCounts={pulseCounts} /></PullToRefresh></ErrorBoundary>}
          {appTab === "moments" && <ErrorBoundary name="moments"><MomentsView user={user} isAdmin={isAdmin} users={users} preds={preds} matches={matches} pts={pts} appSettings={appSettings} sendNotif={sendNotif} sendPush={sendPush} /></ErrorBoundary>}
          {appTab === "leaderboard" && <ErrorBoundary name="leaderboard"><PullToRefresh onRefresh={() => new Promise(r => setTimeout(r, 700))}><LeaderView board={board} user={user} allUsers={Object.values(users)} matches={matches} preds={preds} /></PullToRefresh></ErrorBoundary>}
          {appTab === "menu" && <ErrorBoundary name="menu"><MenuView user={user} menuItems={menuItems} myCredits={myCredits} myOrders={myOrders} onPlaceOrder={placeOrder}
            onCancelOrder={cancelOrder}
            printOrderReceipt={printOrderReceipt}
            stripeCheckout={stripeCheckout}
            onToast={onToast}
            qrTable={qrTable}
            gifts={gifts.filter(g => (g.type === "drink_food" || g.type === "item") && !g.redeemed)}
            pendingGiftItems={pendingGiftItems}
            onClearPendingGifts={() => setPendingGiftItems([])}
            setMyCredits={setMyCredits}
            initialTab={menuInitTab}
            onInitialTabConsumed={() => setMenuInitTab(null)}
          /></ErrorBoundary>}
          {appTab === "rules" && <ErrorBoundary name="rules"><RulesView rules={rules} /></ErrorBoundary>}
          {appTab === "profile" && <ErrorBoundary name="profile"><ProfileView user={user} myPts={myPts} myRank={myRank} myCredits={myCredits} preds={preds} matches={matches} sponsors={sponsors} onAvatarUpdate={(url) => setUser(u => ({...u, avatar_url: url}))} gifts={gifts} onOpenGifts={() => setShowGifts(true)} appSettings={appSettings} board={board} onToast={onToast} /></ErrorBoundary>}
          {appTab === "vip" && user?.sponsor_tier && (
            <ErrorBoundary name="vip"><SponsorView user={user} sponsorGifts={sponsorGifts} placeOrder={placeOrder} onToast={onToast} /></ErrorBoundary>
          )}
          {appTab === "floorplan" && user?.floorplan_access && (
            <ErrorBoundary name="floorplan"><FloorPlan allOrders={allOrders} onLoad={loadAllOrders} onUpdateStatus={updateOrderStatus} onDeleteOrder={deleteOrder} onToast={onToast} userId={user?.id} menuItems={menuItems} /></ErrorBoundary>
          )}
          {appTab === "keepups" && user?.keepups_access && (
            <ErrorBoundary name="keepups"><KeepupsView user={user} users={users} /></ErrorBoundary>
          )}
          {appTab === "admin" && isAdmin && (
            <ErrorBoundary name="admin"><AdminView
              matches={matches} rules={rules} sponsors={sponsors}
              onUpdate={adminUpdateMatch} onAdd={adminAddMatch} onDelete={adminDeleteMatch}
              onSaveRules={adminSaveRules} onSaveSponsors={adminSaveSponsors}
              menuItems={menuItems} users={users}
              onSaveMenuItem={saveMenuItem} onDeleteMenuItem={deleteMenuItem}
              onToggleAvail={toggleMenuItemAvail} onToggleSoldOut={toggleMenuItemSoldOut}
              onAddCredits={adminAddCredits}
              onUpdateOrderStatus={updateOrderStatus} onDeleteOrder={deleteOrder} onLoadAllOrders={loadAllOrders}
              allOrders={allOrders}
              sponsorGifts={sponsorGifts}
              onSetSponsorTier={adminSetSponsorTier}
              onSaveSponsorGifts={adminSaveSponsorGifts}
              onBanUsers={adminBanUsers}
              onSetFloorplanAccess={adminSetFloorplanAccess}
              onSetKeepupsAccess={adminSetKeepupsAccess}
              appSettings={appSettings}
              onSaveAppSettings={onSaveAppSettings}
              sendPush={sendPush}
              onLaunchTVAd={() => setShowTVAd(true)}
              onAnnounceWinner={async () => {
                const winner = board[0] || null;
                setWinnerData(winner);
                setShowWinner(true);
                if (globalChannelRef.current) {
                  await globalChannelRef.current.send({ type:"broadcast", event:"winner_announced", payload:{ winner } });
                }
              }}
              board={board}
            /></ErrorBoundary>
          )}
          {showWinner && (
            <TournamentWinnerScreen
              board={board}
              isAdmin={isAdmin}
              appSettings={appSettings}
              onClose={() => setShowWinner(false)}
            />
          )}
          {showGifts && (
            <MyGiftsView
              user={user}
              gifts={gifts}
              onClose={() => setShowGifts(false)}
              onToast={onToast}
              onAddGiftToOrder={(gift) => {
                setPendingGiftItems(prev =>
                  prev.find(p => p.giftId === gift.id) ? prev : [...prev, { giftId: gift.id, name: gift.item_name || gift.title }]
                );
                setShowGifts(false);
                setAppTab("menu");
              }}
            />
          )}
        </div>
      </main>
      {/* Add to Home Screen banner */}
      {showInstallBanner && (
        <div className="install-banner">
          <div className="install-banner-inner">
            <img src="/elmundo-logo.png" alt="" className="install-banner-icon" />
            <div className="install-banner-text">
              <div className="install-banner-title">Add El Mundo to your home screen</div>
              <div className="install-banner-desc">{isIOS ? "Tap the share button, then \"Add to Home Screen\"" : "Get the full app experience with quick access"}</div>
            </div>
            <div className="install-banner-actions">
              {!isIOS && <button className="install-banner-btn" onClick={handleInstall}>Install</button>}
              <button className="install-banner-close" onClick={dismissInstall}>✕</button>
            </div>
          </div>
        </div>
      )}

      <nav className="bot-nav">
        <div className="bot-nav-inner" style={{"--tabs":tabs.length, "--idx": Math.max(0, tabs.findIndex(t => t.id === appTab))}}>
          <span className="bnav-pill" />
          {tabs.map(({ id, label, ico }) => (
            <button key={id} className={`bnav-btn ${appTab===id?"bnav-on":""}`} onClick={()=>switchTab(id)}>
              <span className="bnav-ico" style={{position:"relative"}}>
                {ico}
                {id==="floorplan" && newOrderAlert && (
                  <span style={{position:"absolute",top:-2,right:-4,width:8,height:8,background:"#ef4444",borderRadius:"50%",display:"block",boxShadow:"0 0 6px #ef4444"}}/>
                )}
              </span>
              <span className="bnav-lbl">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/* ═══ MATCHES ═══════════════════════════════════════════════════════════════ */
function PredictionCountdown({ lockMs, firstMatch }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const locked = now >= lockMs;
  const ms     = Math.max(0, lockMs - now);
  const days   = Math.floor(ms / 86400000);
  const hours  = Math.floor((ms % 86400000) / 3600000);
  const mins   = Math.floor((ms % 3600000) / 60000);
  const secs   = Math.floor((ms % 60000) / 1000);
  const pad    = n => String(n).padStart(2, "0");

  // Three-tier color system
  const phase = days >= 15 ? "green" : days >= 5 ? "yellow" : "red";
  const accent  = phase === "green" ? "#4ade80" : phase === "yellow" ? "#facc15" : "#f87171";
  const bg      = phase === "green" ? "rgba(74,222,128,.06)"  : phase === "yellow" ? "rgba(250,204,21,.06)"  : "rgba(248,113,113,.08)";
  const border  = phase === "green" ? "rgba(74,222,128,.18)"  : phase === "yellow" ? "rgba(250,204,21,.18)"  : "rgba(248,113,113,.22)";
  const digitCl = phase === "red" ? "cd-urgent" : "";

  if (locked) return (
    <div style={{margin:"10px 16px 4px",padding:"12px 16px",borderRadius:12,
      background:"rgba(239,68,68,.07)",border:"1px solid rgba(239,68,68,.2)",
      display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
      <span style={{fontSize:16}}>🔒</span>
      <div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:2,color:"#f87171"}}>PREDICTIONS CLOSED</div>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.35)",marginTop:1}}>The tournament has started · no more entries</div>
      </div>
    </div>
  );

  const units = [
    { val: pad(days),  label: "DAYS"  },
    { val: pad(hours), label: "HRS"   },
    { val: pad(mins),  label: "MIN"   },
    { val: pad(secs),  label: "SEC"   },
  ];

  return (
    <div style={{margin:"10px 16px 4px",borderRadius:12,overflow:"hidden",
      background:"#111",border:`1px solid ${border}`,transition:"border-color 1s"}}>

      {/* Top label row */}
      <div style={{padding:"8px 14px 7px",display:"flex",alignItems:"center",
        justifyContent:"space-between",borderBottom:`1px solid ${border}`,background:bg,
        transition:"background .8s,border-color .8s"}}>
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:3,
          color:accent,transition:"color 1s"}}>
          {phase === "red" ? "⚠ CLOSING SOON" : "PREDICTIONS CLOSE IN"}
        </span>
        {firstMatch && (
          <span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,
            color:"rgba(255,255,255,.35)"}}>
            Deadline · {firstMatch.date} {firstMatch.time}
          </span>
        )}
      </div>

      {/* Digit row */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",
        padding:"12px 14px 10px",gap:6}}>
        {units.map(({ val, label }, i) => (
          <React.Fragment key={label}>
            <div style={{textAlign:"center"}}>
              <div className={digitCl} style={{
                background:"#1a1a1a",border:`1px solid rgba(255,255,255,.09)`,
                borderRadius:8,padding:"7px 0",width:52,
                fontFamily:"'Anton',sans-serif",fontSize:26,lineHeight:1,
                color:accent,letterSpacing:1,
                transition:"color 1s"}}>
                {val}
              </div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:9,
                letterSpacing:2,color:"rgba(255,255,255,.3)",marginTop:5}}>{label}</div>
            </div>
            {i < units.length - 1 && (
              <div style={{display:"flex",flexDirection:"column",gap:5,
                marginBottom:18,flexShrink:0}}>
                <div style={{width:4,height:4,borderRadius:"50%",background:accent,opacity:.6,transition:"background 1s"}} />
                <div style={{width:4,height:4,borderRadius:"50%",background:accent,opacity:.6,transition:"background 1s"}} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

    </div>
  );
}

/* ═══ MATCH PULSE — Broadcast-style live atmosphere ══════════════════════ */
function MatchPulse({ matches, pulseCounts = {}, user, getPred }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const liveMatches = matches.filter(m => {
    const ko = matchKickoff(m);
    if (!ko) return false;
    const koMs = ko.getTime();
    return now >= koMs - 60 * 60 * 1000 && now <= koMs + 90 * 60 * 1000 && m.status === "upcoming";
  });

  if (liveMatches.length === 0) return null;

  return (
    <div className="broadcast-wrap">
      {liveMatches.map(m => (
        <BroadcastCard key={m.id} m={m} now={now} pulseData={pulseCounts[m.id] || null} user={user} myPred={getPred ? getPred(m.id) : null} />
      ))}
    </div>
  );
}

function BroadcastCard({ m, now, pulseData, user, myPred }) {
  const ko = matchKickoff(m);
  const koMs = ko ? ko.getTime() : 0;
  const isPreKickoff = now < koMs;
  const secsUntil = isPreKickoff ? Math.max(0, Math.floor((koMs - now) / 1000)) : 0;
  const minsUntil = Math.floor(secsUntil / 60);
  const secsPart = secsUntil % 60;
  const elapsed = !isPreKickoff && ko ? Math.floor((now - koMs) / 60000) : 0;
  const minute = elapsed <= 45 ? elapsed : Math.max(elapsed - 15, 45);

  // Use server-side aggregate from get_match_pulse() — avoids the 1000-row cap
  const total  = pulseData?.total    ?? 0;
  const homeW  = pulseData?.homeWins ?? 0;
  const draw   = pulseData?.draws    ?? 0;
  const awayW  = pulseData?.awayWins ?? 0;
  const homePct = total > 0 ? Math.round(homeW / total * 100) : 33;
  const drawPct = total > 0 ? Math.round(draw  / total * 100) : 34;
  const awayPct = total > 0 ? 100 - homePct - drawPct         : 33;
  // Top predicted score: ["H-A", count] format to match the JSX below
  const topScore = pulseData?.topHome != null && pulseData?.topCount != null
    ? [`${pulseData.topHome}-${pulseData.topAway}`, pulseData.topCount]
    : null;

  return (
    <div className="broadcast-card">
      {/* Animated glow background */}
      <div className={`broadcast-glow ${isPreKickoff ? "broadcast-glow-soon" : "broadcast-glow-live"}`} />

      {/* ── Top bar ── */}
      <div className="broadcast-topbar">
        <div className={`broadcast-badge ${isPreKickoff ? "broadcast-badge-soon" : "broadcast-badge-live"}`}>
          <span className="broadcast-badge-dot" />
          {isPreKickoff ? "SOON" : "LIVE"}
        </div>
        <div className="broadcast-timer">
          {isPreKickoff
            ? <span>KO in <strong>{minsUntil}:{String(secsPart).padStart(2,"0")}</strong></span>
            : <span>{minute > 0 ? `${minute}'` : "KO"}</span>
          }
        </div>
        {m.stage && <div className="broadcast-stage">{m.stage}</div>}
      </div>

      {/* ── Teams ── */}
      <div className="broadcast-teams">
        <div className="broadcast-team">
          <div className="broadcast-flag-big">{flag(m.home)}</div>
          <div className="broadcast-team-name">{m.home}</div>
        </div>
        <div className="broadcast-vs-col">
          <div className="broadcast-vs-text">VS</div>
          {m.date && <div className="broadcast-match-date">{m.date}{m.time ? ` · ${m.time}` : ""}</div>}
        </div>
        <div className="broadcast-team">
          <div className="broadcast-flag-big">{flag(m.away)}</div>
          <div className="broadcast-team-name">{m.away}</div>
        </div>
      </div>

      {/* ── Community Pulse ── */}
      <div className="broadcast-pulse-section">
        <div className="broadcast-pulse-header">
          <span className="broadcast-pulse-label">📡 COMMUNITY PULSE</span>
          {total > 0 && <span className="broadcast-pulse-count">{total} prediction{total !== 1 ? "s" : ""}</span>}
        </div>

        {total > 0 ? (
          <>
            <div className="broadcast-bar-outer">
              <div className="broadcast-bar-seg broadcast-bar-home" style={{width:`${Math.max(homePct,8)}%`}}>
                {homePct > 14 && <span>{homePct}%</span>}
              </div>
              <div className="broadcast-bar-seg broadcast-bar-draw" style={{width:`${Math.max(drawPct,8)}%`}}>
                {drawPct > 14 && <span>{drawPct}%</span>}
              </div>
              <div className="broadcast-bar-seg broadcast-bar-away" style={{width:`${Math.max(awayPct,8)}%`}}>
                {awayPct > 14 && <span>{awayPct}%</span>}
              </div>
            </div>
            <div className="broadcast-legend">
              <span><span className="bleg-dot" style={{background:"#4ade80"}}/>{m.home} {homePct}%</span>
              <span><span className="bleg-dot" style={{background:"#94a3b8"}}/>Draw {drawPct}%</span>
              <span><span className="bleg-dot" style={{background:"#f87171"}}/>{m.away} {awayPct}%</span>
            </div>
            {topScore && (
              <div className="broadcast-top-score">
                <span className="broadcast-top-icon">🎯</span>
                <span>Most predicted: <strong>{topScore[0]}</strong></span>
                <span className="broadcast-top-count"> · {topScore[1]} player{topScore[1]!==1?"s":""}</span>
              </div>
            )}
          </>
        ) : (
          <div className="broadcast-no-preds">Be the first to predict this match!</div>
        )}
      </div>

      {/* ── Your prediction ── */}
      {myPred && (
        <div className="broadcast-mypred">
          <span className="broadcast-mypred-label">YOUR PICK</span>
          <span className="broadcast-mypred-score">{myPred.h} – {myPred.a}</span>
          <span className="broadcast-mypred-hint">{myPred.h > myPred.a ? m.home : myPred.h < myPred.a ? m.away : "DRAW"} wins</span>
        </div>
      )}
    </div>
  );
}

/* ── Zeli sponsor banner — premium animated ad, 12s loop ── */
function ZeliBanner() {
  // SVG animateMotion is the only way to guarantee the car/courier follow
  // the EXACT route path at any screen size (CSS offset-path uses absolute
  // px, not viewBox units, so it breaks on responsive scaling).
  return (
    <a className="zeli-banner" href="https://zeli-bonaire.com" target="_blank" rel="noopener noreferrer"
       aria-label="Zeli — Rides and Delivery in Bonaire. Tap. Track. Ride.">
      <div className="zb-banner">

        {/* Single SVG stage holds routes + pins + car + courier together
            so all geometry scales as one. */}
        <svg className="zb-stage" viewBox="0 0 1200 260" preserveAspectRatio="xMidYMid slice"
             xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="zb-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#0c1530"/>
              <stop offset="55%" stopColor="#060A1C"/>
              <stop offset="100%" stopColor="#02040D"/>
            </linearGradient>
            <radialGradient id="zb-glowTeal" cx="50%" cy="50%" r="50%">
              <stop offset="0%"  stopColor="rgba(45,212,191,0.18)"/>
              <stop offset="100%" stopColor="rgba(45,212,191,0)"/>
            </radialGradient>
            <radialGradient id="zb-glowPink" cx="50%" cy="50%" r="50%">
              <stop offset="0%"  stopColor="rgba(244,114,182,0.14)"/>
              <stop offset="100%" stopColor="rgba(244,114,182,0)"/>
            </radialGradient>
            <linearGradient id="zbCarBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#1a2540"/>
              <stop offset="50%" stopColor="#0d1428"/>
              <stop offset="100%" stopColor="#06091a"/>
            </linearGradient>
            <linearGradient id="zbCarWin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#2DD4BF"/>
              <stop offset="100%" stopColor="#0a8174"/>
            </linearGradient>
            {/* The exact paths the car + courier follow */}
            <path id="zb-teal-path" d="M 380 145 C 520 100, 660 180, 820 130 S 1000 110, 1110 145" />
            <path id="zb-pink-path" d="M 380 195 C 540 215, 680 155, 830 185 S 1010 210, 1110 195" />
          </defs>

          {/* Background */}
          <rect width="1200" height="260" fill="url(#zb-bg)"/>

          {/* Bonaire-style ambient elements */}
          <g opacity="0.15">
            {/* Coastline contours */}
            <path d="M -50 230 C 200 220, 380 235, 600 220 S 900 200, 1280 215"
                  fill="none" stroke="#7BC9D2" strokeWidth="1"/>
            <path d="M -50 248 C 200 240, 380 250, 600 238 S 900 222, 1280 235"
                  fill="none" stroke="#7BC9D2" strokeWidth="1"/>
            {/* Small island near top-right */}
            <path d="M 1040 50 C 1080 42, 1130 44, 1160 54 C 1158 70, 1130 76, 1090 74 C 1060 72, 1042 64, 1040 50 Z"
                  fill="none" stroke="#7BC9D2" strokeWidth="1"/>
            {/* Grid lines */}
            <line x1="0" y1="80"  x2="1200" y2="80"  stroke="#5fb8c4" strokeWidth=".8" strokeDasharray="2 22"/>
            <line x1="0" y1="180" x2="1200" y2="180" stroke="#5fb8c4" strokeWidth=".8" strokeDasharray="2 22"/>
          </g>

          {/* Brand-color vignettes */}
          <ellipse cx="100"  cy="130" rx="280" ry="200" fill="url(#zb-glowTeal)"/>
          <ellipse cx="1100" cy="130" rx="280" ry="200" fill="url(#zb-glowPink)"/>

          {/* Faint route bases — always visible so the path is suggested */}
          <use href="#zb-teal-path" className="zb-base-line"/>
          <use href="#zb-pink-path" className="zb-base-line"/>

          {/* Animated teal route (rides) */}
          <use href="#zb-teal-path" className="zb-route-teal"/>
          {/* Animated pink route (delivery) */}
          <use href="#zb-pink-path" className="zb-route-pink"/>

          {/* PINS — no text labels (cleaner). Pin shape conveys meaning. */}
          {/* Pickup pin (teal start) */}
          <g className="zb-pin zb-pin-teal-start">
            <circle cx="380" cy="145" r="11" fill="rgba(45,212,191,0.16)"/>
            <circle cx="380" cy="145" r="6" fill="#2DD4BF"/>
            <circle cx="380" cy="145" r="2.4" fill="#fff"/>
          </g>
          {/* Drop-off pin (teal end teardrop) */}
          <g className="zb-pin zb-pin-teal-end">
            <path d="M 1110 145 C 1110 132, 1126 132, 1126 145 C 1126 158, 1110 174, 1110 174 C 1110 174, 1094 158, 1094 145 C 1094 132, 1110 132, 1110 145 Z"
                  fill="#BFFCF4" stroke="#2DD4BF" strokeWidth="2"/>
            <circle cx="1110" cy="145" r="3" fill="#060A1C"/>
          </g>
          {/* Restaurant pin (pink start) */}
          <g className="zb-pin zb-pin-pink-start">
            <rect x="370" y="186" width="20" height="18" rx="3" fill="rgba(244,114,182,0.18)"/>
            <rect x="373" y="189" width="14" height="3" fill="#F472B6"/>
            <rect x="373" y="195" width="14" height="2" fill="rgba(244,114,182,0.55)"/>
            <rect x="373" y="199" width="14" height="2" fill="rgba(244,114,182,0.35)"/>
          </g>
          {/* Customer pin (pink end house) */}
          <g className="zb-pin zb-pin-pink-end">
            <path d="M 1100 200 L 1110 188 L 1120 200 L 1118 200 L 1118 208 L 1102 208 L 1102 200 Z"
                  fill="#FFE3F0" stroke="#F472B6" strokeWidth="1.8"/>
            <rect x="1107" y="202" width="6" height="6" fill="#060A1C"/>
          </g>

          {/* Premium sedan — follows teal path exactly via animateMotion */}
          <g className="zb-car-grp">
            {/* Car icon centered around (0,0); animateMotion moves it along the path */}
            <g transform="translate(-30,-15)">
              <ellipse cx="30" cy="27" rx="22" ry="2" fill="rgba(0,0,0,.45)"/>
              <path d="M5 22 L9 14 Q14 11 19 11 L41 11 Q46 11 51 14 L55 22 L5 22 Z"
                    fill="url(#zbCarBody)" stroke="rgba(255,255,255,.18)" strokeWidth=".5"/>
              <path d="M14 14 L19 12 L41 12 L46 14 L42 17 L18 17 Z"
                    fill="url(#zbCarWin)" opacity=".9"/>
              <path d="M9 16 Q20 14 51 16" stroke="rgba(255,255,255,.12)" strokeWidth=".5" fill="none"/>
              <circle cx="14" cy="22" r="3.6" fill="#0a0c14" stroke="rgba(255,255,255,.2)" strokeWidth=".6"/>
              <circle cx="46" cy="22" r="3.6" fill="#0a0c14" stroke="rgba(255,255,255,.2)" strokeWidth=".6"/>
              <circle cx="14" cy="22" r="1.5" fill="#3a4467"/>
              <circle cx="46" cy="22" r="1.5" fill="#3a4467"/>
              <circle cx="52" cy="17" r="1.6" fill="#fff8d0" opacity=".95"/>
              <circle cx="52" cy="17" r="3.5" fill="#fff8d0" opacity=".25"/>
            </g>
            <animateMotion dur="12s" repeatCount="indefinite" rotate="auto"
                           keyTimes="0;0.18;0.42;1" keyPoints="0;0;1;1">
              <mpath xlinkHref="#zb-teal-path" href="#zb-teal-path"/>
            </animateMotion>
          </g>

          {/* Courier — pink delivery dot follows pink path */}
          <g className="zb-courier-grp">
            <g>
              <circle r="9" fill="#F472B6"/>
              <circle r="13" fill="none" stroke="#C9A84C" strokeWidth="1.2" opacity=".65"/>
              <circle r="6" fill="#fff" opacity=".4"/>
            </g>
            <animateMotion dur="12s" repeatCount="indefinite" rotate="auto"
                           keyTimes="0;0.50;0.72;1" keyPoints="0;0;1;1">
              <mpath xlinkHref="#zb-pink-path" href="#zb-pink-path"/>
            </animateMotion>
          </g>

        </svg>

        {/* Top status pill — always visible top-right */}
        <div className="zb-status">
          <span className="zb-pulse"></span>LIVE 24/7
        </div>
        {/* Brand tag — sits at bottom-left, never collides with scene title */}
        <div className="zb-brand-mark">ZELI <span>BONAIRE</span></div>

        {/* Scene titles — own the TOP-LEFT, animation lives in the BOTTOM half.
            Eyebrows kept short so they never wrap. */}
        <div className="zb-scene zb-scene-1">
          <div className="zb-eyebrow zb-eyebrow-teal">BONAIRE RIDESHARE</div>
          <div className="zb-head">Tap. Track. <b>Ride.</b></div>
        </div>
        <div className="zb-scene zb-scene-2">
          <div className="zb-eyebrow zb-eyebrow-teal">PREMIUM DRIVERS</div>
          <div className="zb-head">From <b>$8.50</b></div>
          <div className="zb-thin">5 min away</div>
        </div>
        <div className="zb-scene zb-scene-3">
          <div className="zb-eyebrow zb-eyebrow-pink">FOOD DELIVERY</div>
          <div className="zb-head">Cravings, <b>delivered.</b></div>
          <div className="zb-thin">~25 min</div>
        </div>

        {/* Final lockup + CTA */}
        <div className="zb-lockup">
          <div className="zb-lockup-z">ZELI</div>
          <div className="zb-lockup-services">
            <span className="zb-serv-rides">RIDES</span>
            <span className="zb-serv-sep"></span>
            <span className="zb-serv-deliv">DELIVERY</span>
          </div>
          <div className="zb-cta">Open the app →</div>
        </div>

        {/* Sparkles around the lockup */}
        <div className="zb-sparkles">
          <span></span><span></span><span></span><span></span><span></span><span></span>
        </div>

        {/* Loop fade-to-black seam */}
        <div className="zb-loop-fade"></div>
      </div>
    </a>
  );
}

/* Compact rides-focused variant — for profile / smaller spots */
function ZeliRideCard() {
  return (
    <a className="zeli-banner zeli-banner-mini" href="https://zeli-bonaire.com" target="_blank" rel="noopener noreferrer"
       aria-label="Zeli rides — Tap. Track. Ride.">
      <div className="zb-mini">
        <div className="zb-mini-bg">
          <svg viewBox="0 0 600 140" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="zbMiniBg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0c1530"/>
                <stop offset="100%" stopColor="#02040D"/>
              </linearGradient>
              <path id="zbMiniRoute" d="M 280 75 C 360 50, 440 100, 540 65"/>
            </defs>
            <rect width="600" height="140" fill="url(#zbMiniBg)"/>
            <ellipse cx="500" cy="70" rx="160" ry="100" fill="rgba(45,212,191,0.16)"/>
            <use href="#zbMiniRoute" fill="none" stroke="rgba(255,255,255,.08)" strokeDasharray="3 5" strokeWidth="1.2"/>
            <use href="#zbMiniRoute" className="zb-mini-route" fill="none" stroke="#2DD4BF" strokeWidth="2.2"
                 strokeLinecap="round" filter="drop-shadow(0 0 6px #2DD4BF)"/>
            <circle cx="280" cy="75" r="5" fill="#2DD4BF"/>
            <circle cx="280" cy="75" r="2" fill="#fff"/>
            <path d="M 540 65 C 540 55, 552 55, 552 65 C 552 76, 540 90, 540 90 C 540 90, 528 76, 528 65 C 528 55, 540 55, 540 65 Z"
                  fill="#BFFCF4" stroke="#2DD4BF" strokeWidth="1.5"/>
            <g className="zb-mini-car">
              <g transform="translate(-22,-11)">
                <ellipse cx="22" cy="20" rx="16" ry="1.5" fill="rgba(0,0,0,.45)"/>
                <path d="M3 16 L6 10 L16 8 L28 8 L38 10 L41 16 Z" fill="#1a2540" stroke="rgba(255,255,255,.2)" strokeWidth=".4"/>
                <path d="M9 10 L15 8.5 L29 8.5 L35 10 L31 12.5 L13 12.5 Z" fill="#2DD4BF" opacity=".85"/>
                <circle cx="10" cy="16" r="2.5" fill="#0a0c14" stroke="rgba(255,255,255,.2)" strokeWidth=".4"/>
                <circle cx="34" cy="16" r="2.5" fill="#0a0c14" stroke="rgba(255,255,255,.2)" strokeWidth=".4"/>
              </g>
              <animateMotion dur="6s" repeatCount="indefinite" rotate="auto"
                             keyTimes="0;0.05;0.85;1" keyPoints="0;0;1;1">
                <mpath xlinkHref="#zbMiniRoute" href="#zbMiniRoute"/>
              </animateMotion>
            </g>
          </svg>
        </div>
        <div className="zb-mini-text">
          <div className="zb-mini-brand">ZELI <span>· RIDES</span></div>
          <div className="zb-mini-head">Tap. Track. <b>Ride.</b></div>
          <div className="zb-mini-sub">Premium local drivers · from $8.50</div>
          <div className="zb-mini-cta">Open Zeli →</div>
        </div>
      </div>
    </a>
  );
}

/* Compact food-delivery-focused variant — for menu / wallet */
function ZeliFoodCard() {
  return (
    <a className="zeli-banner zeli-banner-mini zeli-banner-mini-food" href="https://zeli-bonaire.com" target="_blank" rel="noopener noreferrer"
       aria-label="Zeli food delivery — Cravings, delivered island-side.">
      <div className="zb-mini">
        <div className="zb-mini-bg">
          <svg viewBox="0 0 600 140" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="zbMiniBgF" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a0c1f"/>
                <stop offset="100%" stopColor="#02040D"/>
              </linearGradient>
              <path id="zbMiniRouteF" d="M 280 75 C 360 100, 440 50, 540 90"/>
            </defs>
            <rect width="600" height="140" fill="url(#zbMiniBgF)"/>
            <ellipse cx="500" cy="80" rx="160" ry="100" fill="rgba(244,114,182,0.18)"/>
            <use href="#zbMiniRouteF" fill="none" stroke="rgba(255,255,255,.08)" strokeDasharray="3 5" strokeWidth="1.2"/>
            <use href="#zbMiniRouteF" className="zb-mini-route-pink" fill="none" stroke="#F472B6" strokeWidth="2.2"
                 strokeLinecap="round" filter="drop-shadow(0 0 6px #F472B6)"/>
            {/* Restaurant icon */}
            <rect x="272" y="68" width="18" height="16" rx="2" fill="rgba(244,114,182,0.2)"/>
            <rect x="275" y="71" width="12" height="3" fill="#F472B6"/>
            <rect x="275" y="76" width="12" height="2" fill="rgba(244,114,182,0.6)"/>
            {/* House icon */}
            <path d="M 528 95 L 540 82 L 552 95 L 549 95 L 549 105 L 531 105 L 531 95 Z"
                  fill="#FFE3F0" stroke="#F472B6" strokeWidth="1.5"/>
            <rect x="536" y="97" width="8" height="8" fill="#1a0c1f"/>
            {/* Courier dot */}
            <g className="zb-mini-courier">
              <circle r="7" fill="#F472B6"/>
              <circle r="10" fill="none" stroke="#C9A84C" strokeWidth="1" opacity=".6"/>
              <text textAnchor="middle" y="3" fontSize="9">🛍️</text>
              <animateMotion dur="6s" repeatCount="indefinite" rotate="0"
                             keyTimes="0;0.10;0.85;1" keyPoints="0;0;1;1">
                <mpath xlinkHref="#zbMiniRouteF" href="#zbMiniRouteF"/>
              </animateMotion>
            </g>
          </svg>
        </div>
        <div className="zb-mini-text">
          <div className="zb-mini-brand zb-mini-brand-pink">ZELI <span>· DELIVERY</span></div>
          <div className="zb-mini-head">Cravings, <b>delivered.</b></div>
          <div className="zb-mini-sub">Local kitchens · ~25 min</div>
          <div className="zb-mini-cta zb-mini-cta-pink">Order now →</div>
        </div>
      </div>
    </a>
  );
}

function MatchesView({ matches, getPred, savePred, loaded, isBanned, allPreds, user, pulseCounts = {} }) {
  // Active prediction round: only matches in this round are predictable right now.
  const activeRound = getActivePredictionRound(matches);
  const upcomingRound = sortMatches(matches.filter(m =>
    m.status === "upcoming" && activeRound && matchInPredictionRound(m, activeRound)
  ));
  const finished = sortMatches(matches.filter(m => m.status === "finished"));

  const [matchTab, setMatchTab] = useState("upcoming");

  // Date filter
  const allDates = [...new Set(sortMatches(upcomingRound).map(m => m.date).filter(Boolean))];
  const [selDate, setSelDate] = useState("all");
  const [nowTs,   setNowTs]   = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  const filterMatches = arr => selDate === "all" ? arr : arr.filter(m => m.date === selDate);
  const visUpcoming = filterMatches(upcomingRound);
  const visFinished = filterMatches(finished);

  // Single global lock = 1h before first match of the whole tournament
  const globalLockMs   = getGlobalLockMs(matches);
  const isGlobalLocked = globalLockMs ? nowTs >= globalLockMs : false;
  // First match info for the banner
  const firstMatch = sortMatches(matches)[0];
  const firstKo    = firstMatch ? matchKickoff(firstMatch) : null;
  const lockDate   = globalLockMs ? new Date(globalLockMs) : null;
  const lockTimeStr = lockDate ? lockDate.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",timeZone:"America/Kralendijk"}) : "";

  if (!loaded) return (
    <div>
      <div className="section-banner">
        <span className="section-banner-title">UPCOMING</span>
      </div>
      <div className="card-stack">
        {[1,2,3].map(i => <div key={i} className="mcard-skeleton" />)}
      </div>
    </div>
  );

  return (
    <div>
      {/* ── Premium global countdown ── */}
      {globalLockMs && <PredictionCountdown lockMs={globalLockMs} firstMatch={firstMatch} />}

      {/* ── Match Pulse — broadcast-style live atmosphere ── */}
      <MatchPulse matches={matches} pulseCounts={pulseCounts} user={user} getPred={getPred} />

      {/* ── Zeli sponsor banner — premium animated ad above match list ── */}
      <ZeliBanner />

      {/* ── Upcoming / Pathways / Results tabs ── */}
      <div className="match-tab-bar">
        <button
          className={`match-tab-btn ${matchTab === "upcoming" ? "match-tab-btn-on" : ""}`}
          onClick={() => setMatchTab("upcoming")}>
          <span className="match-tab-icon">⏱</span>
          <span>UPCOMING</span>
          {upcomingRound.length > 0 && <span className="match-tab-count">{upcomingRound.length}</span>}
        </button>
        <button
          className={`match-tab-btn ${matchTab === "pathways" ? "match-tab-btn-on" : ""}`}
          onClick={() => setMatchTab("pathways")}>
          <span className="match-tab-icon">🏆</span>
          <span>PATHWAYS</span>
        </button>
        <button
          className={`match-tab-btn ${matchTab === "results" ? "match-tab-btn-on" : ""}`}
          onClick={() => setMatchTab("results")}>
          <span className="match-tab-icon">🏁</span>
          <span>RESULTS</span>
          {finished.length > 0 && <span className="match-tab-count">{finished.length}</span>}
        </button>
      </div>

      {/* Date filter — hidden on Pathways tab */}
      {allDates.length > 1 && matchTab !== "pathways" && (
        <div className="date-filter-bar">
          <button className={`date-chip ${selDate==="all"?"date-chip-on":""}`} onClick={()=>setSelDate("all")}>ALL DATES</button>
          {allDates.map(d => (
            <button key={d} className={`date-chip ${selDate===d?"date-chip-on":""}`} onClick={()=>setSelDate(d)}>{d}</button>
          ))}
        </div>
      )}

      {/* Prediction ban notice */}
      {isBanned && matchTab === "upcoming" && (
        <div style={{margin:"8px 16px",padding:"14px 16px",borderRadius:10,
          background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.35)",
          display:"flex",gap:12,alignItems:"flex-start"}}>
          <span style={{fontSize:22,flexShrink:0}}>🚫</span>
          <div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,letterSpacing:1.5,color:"rgba(239,68,68,.95)",marginBottom:4}}>
              PREDICTION ACCESS REVOKED
            </div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.55)",lineHeight:1.5}}>
              Suspicious activity was detected on your account. You have been permanently banned from submitting or changing predictions. You can still use the app and follow the tournament.
            </div>
          </div>
        </div>
      )}

      {matchTab === "upcoming" && (
        <>
          {/* Active round banner */}
          {activeRound && (
            <div className="round-banner">
              <div className="round-banner-l">
                <div className="round-banner-lbl">NOW PREDICTING</div>
                <div className="round-banner-name">{activeRound.toUpperCase()}</div>
              </div>
              <div className="round-banner-r">
                <span className="round-banner-step">
                  STAGE {PREDICTION_ROUNDS.indexOf(activeRound) + 1}/{PREDICTION_ROUNDS.length}
                </span>
              </div>
            </div>
          )}
          {!activeRound && (
            <div className="round-banner round-banner-done">
              <div className="round-banner-l">
                <div className="round-banner-lbl">🏆 TOURNAMENT COMPLETE</div>
                <div className="round-banner-name" style={{color:"#facc15"}}>ALL ROUNDS PLAYED</div>
              </div>
            </div>
          )}

          <div className="card-stack">
            {visUpcoming.length === 0 && (
              <div className="empty" style={{padding:"40px 16px",lineHeight:1.55}}>
                {activeRound
                  ? <>All matches in this round have already started or finished.<br/><span style={{fontSize:12,color:"rgba(255,255,255,.35)"}}>The next round will unlock as soon as this one ends.</span></>
                  : "No upcoming matches"}
                {selDate !== "all" ? <div style={{marginTop:8,fontSize:12,color:"rgba(255,255,255,.4)"}}>(filtered: {selDate})</div> : null}
              </div>
            )}
            {visUpcoming.map(m => <MatchCard key={m.id} m={m} pred={getPred(m.id)} onSave={savePred} globalLockTime={globalLockMs} isBanned={isBanned} allPreds={allPreds} user={user} />)}
          </div>
        </>
      )}

      {matchTab === "results" && (
        <div className="card-stack">
          {visFinished.length === 0 && <div className="empty">No results yet{selDate!=="all"?` on ${selDate}`:""}</div>}
          {visFinished.map(m => <MatchCard key={m.id} m={m} pred={getPred(m.id)} onSave={savePred} globalLockTime={globalLockMs} allPreds={allPreds} user={user} />)}
        </div>
      )}

      {matchTab === "pathways" && (
        <PathwaysView matches={matches} />
      )}
    </div>
  );
}

// ── Pathways (knockout bracket) ──────────────────────────────────────────────

const ROUND_ORDER = ['Round of 32','Round of 16','Quarter-Finals','Semi-Finals','3rd Place','Final'];
const ROUND_SHORT  = {'Round of 32':'R32','Round of 16':'R16','Quarter-Finals':'QF','Semi-Finals':'SF','3rd Place':'3RD','Final':'FNL'};
const ROUND_ICON   = {'Round of 32':'⚽','Round of 16':'🔥','Quarter-Finals':'⚡','Semi-Finals':'🌟','3rd Place':'🥉','Final':'🏆'};

function normalizeRound(group) {
  if (!group) return null;
  const g = group.toLowerCase().trim().replace(/\s+/g,' ');
  if (g.includes('32'))                              return 'Round of 32';
  if (g.includes('16'))                              return 'Round of 16';
  if (g.includes('quarter') || g.includes('quater')) return 'Quarter-Finals';
  if (g.includes('semi'))                            return 'Semi-Finals';
  if (g.includes('third') || g.includes('play off')) return '3rd Place';
  if (g === 'final')                                 return 'Final';
  return null;
}

// Prediction "rounds" — players predict one round at a time.
// Group stage is round 1; Final Stage groups the 3rd-place + Final into one window.
const PREDICTION_ROUNDS = ['Group Stage','Round of 32','Round of 16','Quarter-Finals','Semi-Finals','Final Stage'];

function matchInPredictionRound(m, roundName) {
  const r = normalizeRound(m.group);
  if (roundName === 'Group Stage')   return r === null;
  if (roundName === 'Final Stage')   return r === '3rd Place' || r === 'Final';
  return r === roundName;
}

// Active prediction round = the first round (in order) that has at least one
// non-finished match. Returns null only if the tournament is fully complete.
function getActivePredictionRound(matches) {
  for (const round of PREDICTION_ROUNDS) {
    const inRound = matches.filter(m => matchInPredictionRound(m, round));
    if (inRound.length === 0) continue;
    if (inRound.some(m => m.status !== 'finished')) return round;
  }
  return null;
}

function PathwaysView({ matches }) {
  const knockoutMatches = matches
    .map(m => ({ ...m, _round: normalizeRound(m.group) }))
    .filter(m => m._round !== null);

  const byRound = {};
  ROUND_ORDER.forEach(r => { byRound[r] = []; });
  knockoutMatches.forEach(m => { if (byRound[m._round]) byRound[m._round].push(m); });

  const activeRounds = ROUND_ORDER.filter(r => byRound[r].length > 0);

  const defaultRound = (() => {
    const first = activeRounds.find(r => byRound[r].some(m => m.status === 'upcoming'));
    return first || activeRounds[0] || ROUND_ORDER[0];
  })();

  const [selRound, setSelRound] = useState(defaultRound);
  const [mapOpen, setMapOpen]   = useState(false);

  const visMatches = sortMatches(byRound[selRound] || []);
  const finishedCount = visMatches.filter(m => m.status === 'finished').length;

  return (
    <div className="pathways-wrap">
      {/* Hero CTA — open the full bracket map */}
      <button className="pathways-map-cta" onClick={() => setMapOpen(true)}>
        <div className="pathways-map-cta-shine" />
        <div className="pathways-map-cta-content">
          <div className="pathways-map-cta-icon">🗺️</div>
          <div className="pathways-map-cta-text">
            <div className="pathways-map-cta-title">VIEW BRACKET MAP</div>
            <div className="pathways-map-cta-sub">See every match · every round · the road to the cup</div>
          </div>
          <svg className="pathways-map-cta-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Round pill selector */}
      <div className="pathways-round-bar">
        {activeRounds.map(r => (
          <button
            key={r}
            className={`pathways-round-btn ${selRound === r ? 'pathways-round-btn-on' : ''}`}
            onClick={() => setSelRound(r)}>
            {ROUND_SHORT[r]}
          </button>
        ))}
      </div>

      {/* Round heading */}
      <div className="pathways-round-hd">
        <span className="pathways-round-icon">{ROUND_ICON[selRound]}</span>
        <span className="pathways-round-name">{selRound}</span>
        {finishedCount > 0 && (
          <span className="pathways-round-prog">{finishedCount}/{visMatches.length} played</span>
        )}
      </div>

      {/* Match cards — grid layout (2 cols on desktop/tablet, 1 col mobile) */}
      <div className="pathways-matches pathways-grid">
        {visMatches.map(m => <PathwayMatchCard key={m.id} m={m} />)}
        {visMatches.length === 0 && (
          <div className="empty">No matches found for this round</div>
        )}
      </div>

      {/* Fullscreen bracket map modal */}
      {mapOpen && (
        <BracketMapModal
          byRound={byRound}
          activeRounds={activeRounds}
          onClose={() => setMapOpen(false)}
        />
      )}
    </div>
  );
}

// ── Bracket Map Modal — premium SVG-based tournament tree ────────────────────

function BracketMapModal({ byRound, activeRounds, onClose }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [mounted,   setMounted]   = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => setMounted(true));
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Build the rounds we render in order
  const ROUNDS = ['Round of 32','Round of 16','Quarter-Finals','Semi-Finals','Final'];
  const rounds = ROUNDS.filter(r => (byRound[r]?.length || 0) > 0);
  const thirdPlace = byRound['3rd Place'] && byRound['3rd Place'][0];

  // Header stats
  const totalMatches  = ['Round of 32','Round of 16','Quarter-Finals','Semi-Finals','3rd Place','Final']
    .reduce((s,r) => s + (byRound[r]?.length || 0), 0);
  const playedMatches = ['Round of 32','Round of 16','Quarter-Finals','Semi-Finals','3rd Place','Final']
    .reduce((s,r) => s + (byRound[r]?.filter(m => m.status === 'finished').length || 0), 0);

  // ── Zoom / pan ──────────────────────────────────────────────────────────
  const canvasRef = useRef(null);
  const headerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const HEADER_H = 52;

  // ── Geometry ──────────────────────────────────────────────────────────────
  const PAD = 30;
  const CARD_W = 200, CARD_H = 98, COL_GAP = 66;
  const r32Count = byRound['Round of 32']?.length || 16;
  const UNIT_H   = CARD_H + 34;                       // vertical spacing per R32 slot
  const TOTAL_H  = r32Count * UNIT_H + PAD * 2;
  const colX = i => PAD + i * (CARD_W + COL_GAP);     // left edge of column i
  const TOTAL_W  = PAD * 2 + rounds.length * CARD_W + (rounds.length - 1) * COL_GAP;

  // Card center Y (round labels live in their own sticky strip above the canvas).
  const centerY = (roundIdx, i) => {
    const span = Math.pow(2, roundIdx);               // 1,2,4,8,16
    return PAD + (i * span + span / 2 - 0.5) * UNIT_H;
  };

  // Fit-to-width on mount (clamped so cards never get microscopic)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const avail = el.clientWidth - 24;
    const fit = avail / TOTAL_W;
    setZoom(Math.min(1, Math.max(0.62, fit)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TOTAL_W, mounted]);

  const fitToWidth = () => {
    const el = canvasRef.current;
    if (!el) return;
    setZoom(Math.max(0.35, (el.clientWidth - 24) / TOTAL_W));
  };
  const zoomBy = (d) => setZoom(z => Math.min(1.5, Math.max(0.35, +(z + d).toFixed(2))));

  // Keep the round-header row aligned with horizontal scroll
  const onCanvasScroll = (e) => {
    if (headerRef.current) {
      headerRef.current.style.transform = `translateX(${-e.target.scrollLeft}px)`;
    }
  };

  // Build absolute position for each match: x (left), y (top)
  const cards = []; // { round, i, m, x, y, parentIdx, parentRoundIdx }
  rounds.forEach((round, roundIdx) => {
    const sorted = sortMatches(byRound[round] || []);
    sorted.forEach((m, i) => {
      const cx = colX(roundIdx);
      const cy = centerY(roundIdx, i) - CARD_H / 2;
      cards.push({
        round, roundIdx, i, m,
        x: cx, y: cy,
        cx, cyCenter: centerY(roundIdx, i),
      });
    });
  });

  // Build connectors: each card (except round 0) connects to two parent cards in previous round
  // Each card in round R index i connects FROM round R-1 indices 2i and 2i+1
  const connectors = []; // { id, fromX, fromY, toX, toY, finished, highlighted }
  for (let roundIdx = 1; roundIdx < rounds.length; roundIdx++) {
    const childRound  = rounds[roundIdx];
    const parentRound = rounds[roundIdx - 1];
    const childCards  = sortMatches(byRound[childRound]  || []);
    const parentCards = sortMatches(byRound[parentRound] || []);

    childCards.forEach((child, i) => {
      const childX = colX(roundIdx);
      const childY = centerY(roundIdx, i);

      [2*i, 2*i+1].forEach(parentIdx => {
        if (parentIdx >= parentCards.length) return;
        const parent = parentCards[parentIdx];
        const parentX = colX(roundIdx - 1) + CARD_W;
        const parentY = centerY(roundIdx - 1, parentIdx);
        connectors.push({
          id: `${child.id}->${parent.id}`,
          parentId: parent.id,
          childId:  child.id,
          fromX: parentX, fromY: parentY,
          toX:   childX,  toY:   childY,
          parentFinished: parent.status === 'finished',
          isWinnerPath: parent.status === 'finished' && (() => {
            // path only highlights if parent finished AND we know who won — for now just dim/bright
            return true;
          })(),
        });
      });
    });
  }

  // For hover-to-final: compute path from hovered card up to Final
  const pathToFinal = (matchId) => {
    if (!matchId) return new Set();
    const result = new Set([matchId]);
    let currentId = matchId;
    // Walk down through connectors that have currentId as parentId
    for (let i = 0; i < rounds.length; i++) {
      const next = connectors.find(c => c.parentId === currentId);
      if (!next) break;
      result.add(next.childId);
      result.add(next.id);
      currentId = next.childId;
    }
    // Also include the connector going INTO the original hovered card
    const incoming = connectors.find(c => c.childId === matchId);
    if (incoming) result.add(incoming.id);
    return result;
  };
  const highlightIds = pathToFinal(hoveredId);

  return (
    <div className="bm2-root" role="dialog" aria-modal="true" aria-label="Tournament bracket">
      {/* Background layers */}
      <div className="bm2-bg" />
      <div className="bm2-bg-glow" />
      <div className="bm2-bg-particles" />

      <div className="bm2-frame">
        {/* Top bar */}
        <div className="bm2-topbar">
          <div className="bm2-title">
            <span className="bm2-cup">🏆</span>
            <div>
              <div className="bm2-title-main">ROAD TO THE CUP</div>
              <div className="bm2-title-sub">{playedMatches}/{totalMatches} played · WC 2026</div>
            </div>
          </div>
          <div className="bm2-zoom-ctrl">
            <button onClick={() => zoomBy(-0.15)} aria-label="Zoom out">−</button>
            <button className="bm2-zoom-fit" onClick={fitToWidth}>FIT</button>
            <button onClick={() => zoomBy(0.15)} aria-label="Zoom in">+</button>
          </div>
          <button className="bm2-close" onClick={onClose} aria-label="Close bracket">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Round header strip — scrolls horizontally in sync with the canvas */}
        <div className="bm2-round-strip" style={{ height: HEADER_H }}>
          <div className="bm2-round-strip-inner" ref={headerRef} style={{ width: TOTAL_W * zoom }}>
            {rounds.map((r, idx) => (
              <div key={r} className="bm2-round-hd"
                   style={{ left: colX(idx) * zoom, width: CARD_W * zoom }}>
                <span className="bm2-round-icon">{ROUND_ICON[r]}</span>
                <span className="bm2-round-name">{r}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas: zoomable, scrollable */}
        <div className="bm2-canvas" ref={canvasRef} onScroll={onCanvasScroll}>
          {/* Sizer reserves the scaled footprint so scrollbars are correct */}
          <div className="bm2-zoom-sizer" style={{ width: TOTAL_W * zoom, height: TOTAL_H * zoom }}>
            <div className="bm2-zoom-scale"
                 style={{ width: TOTAL_W, height: TOTAL_H, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>

              {/* SVG connectors (full coordinate space) */}
              <svg className="bm2-svg" width={TOTAL_W} height={TOTAL_H}
                   viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
                   style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
                <defs>
                  <linearGradient id="bm2-line-dim" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"  stopColor="rgba(255,255,255,0.10)"/>
                    <stop offset="100%" stopColor="rgba(255,255,255,0.22)"/>
                  </linearGradient>
                  <linearGradient id="bm2-line-done" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"  stopColor="#4ade80"/>
                    <stop offset="100%" stopColor="#22c55e"/>
                  </linearGradient>
                  <linearGradient id="bm2-line-hot" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"  stopColor="#facc15"/>
                    <stop offset="100%" stopColor="#fbbf24"/>
                  </linearGradient>
                  <filter id="bm2-glow">
                    <feGaussianBlur stdDeviation="2.5" result="g"/>
                    <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>

                {connectors.map((c, idx) => {
                  const dx = (c.toX - c.fromX) * 0.5;
                  const path = `M ${c.fromX} ${c.fromY} C ${c.fromX + dx} ${c.fromY}, ${c.toX - dx} ${c.toY}, ${c.toX} ${c.toY}`;
                  const isHot = highlightIds.has(c.id);
                  const done  = c.parentFinished;
                  return (
                    <g key={c.id} className={`bm2-conn ${isHot ? 'bm2-conn-hot' : done ? 'bm2-conn-done' : 'bm2-conn-dim'}`}
                       style={{ animationDelay: `${0.2 + idx * 0.015}s` }}>
                      <path d={path} fill="none"
                            strokeWidth={isHot ? 3 : 2}
                            stroke={isHot ? 'url(#bm2-line-hot)' : done ? 'url(#bm2-line-done)' : 'url(#bm2-line-dim)'}
                            filter={isHot ? 'url(#bm2-glow)' : undefined}
                            className="bm2-path"/>
                    </g>
                  );
                })}
              </svg>

              {/* Trophy emblem behind the Final card */}
              {rounds.includes('Final') && (() => {
                const finalIdx = rounds.indexOf('Final');
                const fy = centerY(finalIdx, 0);
                const fx = colX(finalIdx) + CARD_W / 2;
                return (
                  <div className="bm2-trophy" style={{ left: fx - 90, top: fy - 150 }}>
                    <div className="bm2-trophy-ring" />
                    <div className="bm2-trophy-ring bm2-trophy-ring-2" />
                    <div className="bm2-trophy-emoji">🏆</div>
                    <div className="bm2-trophy-rays" />
                  </div>
                );
              })()}

              {/* Cards */}
              {cards.map((c) => {
                const isFinal = c.round === 'Final';
                const inHotPath = highlightIds.has(c.m.id);
                return (
                  <BracketMatch2
                    key={c.m.id}
                    m={c.m}
                    isFinal={isFinal}
                    inHotPath={inHotPath}
                    onMouseEnter={() => setHoveredId(c.m.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setHoveredId(h => h === c.m.id ? null : c.m.id)}
                    style={{
                      position: 'absolute',
                      left:  c.x,
                      top:   c.y,
                      width: CARD_W,
                      height: CARD_H,
                      animationDelay: mounted ? `${c.roundIdx * 0.08 + c.i * 0.015}s` : '0s',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* 3rd place — rendered separately at the bottom */}
        {thirdPlace && (
          <div className="bm2-third-strip">
            <div className="bm2-third-line" />
            <div className="bm2-third-label">3RD PLACE PLAY-OFF · BRONZE FINAL</div>
            <div className="bm2-third-card-wrap">
              <BracketMatch2
                m={thirdPlace}
                isThird
                inHotPath={false}
                onMouseEnter={() => {}}
                onMouseLeave={() => {}}
                onClick={() => {}}
                style={{ width: CARD_W + 30 }}
              />
            </div>
            <div className="bm2-third-line" />
          </div>
        )}

        {/* Footer legend */}
        <div className="bm2-foot">
          <div className="bm2-foot-legend">
            <span className="bm2-foot-pill bm2-foot-pill-tbd">○ TBD</span>
            <span className="bm2-foot-pill bm2-foot-pill-live">● LIVE</span>
            <span className="bm2-foot-pill bm2-foot-pill-done">✓ PLAYED</span>
          </div>
          <span className="bm2-foot-tip">{hoveredId ? "Path to the cup highlighted" : "Tap a match · pinch or use +/− to zoom"}</span>
        </div>
      </div>
    </div>
  );
}

function BracketMatch2({ m, isFinal, isThird, inHotPath, style, onMouseEnter, onMouseLeave, onClick }) {
  const isFinished = m.status === 'finished' && m.hs != null && m.as != null;
  const homeWon = isFinished && m.hs > m.as;
  const awayWon = isFinished && m.as > m.hs;
  const isLive  = (() => {
    if (m.status !== 'upcoming') return false;
    const ko = matchKickoff(m);
    if (!ko) return false;
    const now = Date.now();
    const koMs = ko.getTime();
    return now >= koMs && now <= koMs + 120 * 60 * 1000;
  })();

  return (
    <div
      className={`bm2-card ${isFinished ? 'bm2-card-done' : ''} ${isLive ? 'bm2-card-live' : ''} ${isFinal ? 'bm2-card-final' : ''} ${isThird ? 'bm2-card-third' : ''} ${inHotPath ? 'bm2-card-hot' : ''}`}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {isFinal && <div className="bm2-card-crown">★ FINAL ★</div>}
      {isLive  && <div className="bm2-card-live-pill"><span className="bm2-live-dot"/>LIVE</div>}
      <div className="bm2-card-meta">{m.date}{m.time ? ` · ${m.time}` : ''}</div>
      <div className={`bm2-team ${homeWon ? 'bm2-team-win' : awayWon ? 'bm2-team-lose' : ''}`}>
        <span className="bm2-flag">{flag(m.home)}</span>
        <span className="bm2-name">{m.home}</span>
        <span className="bm2-score">{isFinished ? m.hs : '–'}</span>
      </div>
      <div className={`bm2-team ${awayWon ? 'bm2-team-win' : homeWon ? 'bm2-team-lose' : ''}`}>
        <span className="bm2-flag">{flag(m.away)}</span>
        <span className="bm2-name">{m.away}</span>
        <span className="bm2-score">{isFinished ? m.as : '–'}</span>
      </div>
    </div>
  );
}

function PathwayMatchCard({ m }) {
  const isFinished = m.status === 'finished' && m.hs != null && m.as != null;
  const homeWon = isFinished && m.hs > m.as;
  const awayWon = isFinished && m.as > m.hs;
  const isLive  = (() => {
    if (m.status !== 'upcoming') return false;
    const ko = matchKickoff(m);
    if (!ko) return false;
    const now = Date.now();
    const koMs = ko.getTime();
    return now >= koMs && now <= koMs + 120 * 60 * 1000;
  })();

  return (
    <div className={`pw-card-v2 ${isFinished ? 'pw-card-done' : ''} ${isLive ? 'pw-card-live' : ''}`}>
      <div className="pw-card-glow" />
      <div className="pw-card-meta">
        <span className="pw-card-date">
          <span className="pw-card-date-day">{m.date}</span>
          <span className="pw-card-date-time">{m.time ? `${m.time} BON` : ''}</span>
        </span>
        {isLive && <span className="pw-card-status pw-card-status-live"><span className="pw-card-dot"/>LIVE</span>}
        {isFinished && <span className="pw-card-status pw-card-status-done">✓ FT</span>}
        {!isLive && !isFinished && <span className="pw-card-status pw-card-status-tbd">UPCOMING</span>}
      </div>

      <div className="pw-card-match">
        <div className={`pw-team ${homeWon ? 'pw-team-win' : awayWon ? 'pw-team-lose' : ''}`}>
          <span className="pw-team-flag">{flag(m.home)}</span>
          <span className="pw-team-name" title={m.home}>{m.home}</span>
        </div>

        <div className={`pw-card-mid ${isFinished ? 'pw-card-mid-done' : ''}`}>
          {isFinished ? (
            <span className="pw-card-score">{m.hs}<span className="pw-card-score-sep">–</span>{m.as}</span>
          ) : (
            <span className="pw-card-vs">vs</span>
          )}
        </div>

        <div className={`pw-team pw-team-right ${awayWon ? 'pw-team-win' : homeWon ? 'pw-team-lose' : ''}`}>
          <span className="pw-team-name" title={m.away}>{m.away}</span>
          <span className="pw-team-flag">{flag(m.away)}</span>
        </div>
      </div>
    </div>
  );
}

function matchKickoff(m) {
  try {
    const year = (() => { try { return JSON.parse(localStorage.getItem("em_app_settings")||"{}").eventYear||2026; } catch { return 2026; } })();
    return new Date(`${m.date} ${year} ${m.time}:00 GMT-0400`);
  } catch { return null; }
}

// Single global lock = 1 hour before the first match of the CURRENT prediction round.
// When the active round changes (e.g. group stage → R32) the lock automatically
// shifts to the new round's first kickoff.
function getGlobalLockMs(matches) {
  const activeRound = getActivePredictionRound(matches);
  if (!activeRound) return null;
  const kickoffs = matches
    .filter(m => matchInPredictionRound(m, activeRound))
    .map(m => matchKickoff(m))
    .filter(Boolean)
    .map(k => k.getTime());
  if (kickoffs.length === 0) return null;
  return Math.min(...kickoffs) - 60 * 60 * 1000;
}

// Countdown to a target timestamp (ms). All cards on the same day share the same lockMs.
function useCountdown(lockMs) {
  const [now, setNow] = useState(Date.now());
  const locked = !lockMs || now >= lockMs;
  useEffect(() => {
    if (locked) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [locked]);
  if (!lockMs) return { msLeft: 0, label: "", urgency: "none" };
  const ms = lockMs - now;
  if (ms <= 0) return { msLeft: 0, label: "LOCKED", urgency: "locked" };
  const totalMins = ms / 60000;
  const h = Math.floor(totalMins / 60);
  const min = Math.floor(totalMins % 60);
  const sec = Math.floor((ms % 60000) / 1000);
  let label, urgency;
  if (totalMins > 1440) { label = `${Math.floor(totalMins/1440)}d left`; urgency = "green"; }
  else if (totalMins > 120) { label = `${h}h ${min}m left`; urgency = "green"; }
  else if (totalMins > 60) { label = `${h}h ${min}m left`; urgency = "yellow"; }
  else if (totalMins > 10) { label = `${min}m ${sec}s left`; urgency = "yellow"; }
  else { label = `${min}m ${sec}s`; urgency = "red"; }
  return { msLeft: ms, label, urgency };
}

function MatchCard({ m, pred, onSave, globalLockTime, isBanned, allPreds, user }) {
  const [h, setH] = useState(pred?.h ?? "");
  const [a, setA] = useState(pred?.a ?? "");
  const [saved, setSaved] = useState(!!pred);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCaption, setShareCaption] = useState("");
  const [sharePosting, setSharePosting] = useState(false);
  const [sharePosted, setSharePosted] = useState(false);
  const fin       = m.status === "finished";
  const correct   = fin && pred && pred.h === m.hs && pred.a === m.as;
  const wrong     = fin && pred && !correct;
  const partialCorrect = fin && pred && !correct && (() => {
    const pw = pred.h > pred.a ? "home" : pred.h < pred.a ? "away" : "draw";
    const mw = m.hs  > m.as   ? "home" : m.hs  < m.as   ? "away" : "draw";
    return pw === mw;
  })();
  const submitted = !!pred;
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    if (fin) return;
    const id = setInterval(() => setNowTs(Date.now()), 5000);
    return () => clearInterval(id);
  }, [fin]);
  const isActuallyLocked = isBanned || (globalLockTime ? nowTs >= globalLockTime : false);

  // (Community pulse removed — now handled by MatchPulse at feed top)

  const postPredToFeed = async () => {
    if (!user || sharePosting || sharePosted) return;
    setSharePosting(true);
    try {
      const result = fin
        ? (correct ? "exact" : partialCorrect ? "winner" : pred ? "wrong" : "nopred")
        : null;
      const pts = fin ? (correct ? 5 : partialCorrect ? 1 : 0) : null;
      const meta = {
        __type: "pred",
        home: m.home, away: m.away,
        date: m.date, time: m.time, group: m.group,
        predH: pred?.h, predA: pred?.a,
        fin, result, pts,
        finalH: m.hs, finalA: m.as,
        userCaption: shareCaption.trim() || null,
      };
      const { error: insErr } = await supabase.from("moments").insert({
        image_url: "",
        caption: JSON.stringify(meta),
        posted_by: user.id,
        poster_name: user.name,
        poster_avatar: user.avatar_url || null,
        submitted_by: user.id,
        approved: true,
      });
      if (insErr) throw insErr;
      setSharePosted(true);
      setShareOpen(false);
      setShareCaption("");
    } catch(e) { console.error("share failed", e); }
    finally { setSharePosting(false); }
  };

  const save = () => {
    if (h===""||a===""||isActuallyLocked||submitted||isBanned) return;
    onSave(m.id, h, a);
    setSaved(true);
  };

  const statusColor = correct ? "#22c55e" : partialCorrect ? "#f59e0b" : wrong ? "#ef4444" : isActuallyLocked && !fin ? "#f59e0b" : "transparent";

  return (
    <div className={`mcard ${correct?"mcard-ok":partialCorrect?"mcard-partial":wrong?"mcard-ng":""}`} style={{borderLeft:`3px solid ${statusColor}`}}>
      <div className="mcard-topstrip">
        <span className="mcard-group-pill">{m.group}</span>
        <span className="mcard-dt">{m.date} · {m.time} BON</span>
        {!fin && isActuallyLocked && !isBanned && (
          <span className="countdown-chip" style={{color:"rgba(255,255,255,.45)",borderColor:"rgba(255,255,255,.12)",background:"transparent",fontSize:10}}>🔒 LOCKED</span>
        )}
      </div>
      <div className="mcard-scoreboard">
        <div className="mteam-col">
          <span className="mteam-flag-lg">{flag(m.home)}</span>
          <span className="mteam-name-lg">{m.home}</span>
        </div>
        <div className="mcard-center">
          {fin ? (
            <div className="score-board">
              <div className="score-row">
                <span className="score-digit">{m.hs}</span>
                <span className="score-colon">:</span>
                <span className="score-digit">{m.as}</span>
              </div>
              <span className="score-label">FINAL</span>
            </div>
          ) : submitted ? (
            <div className="score-board score-board-pick">
              <div className="score-row">
                <span className="score-digit score-digit-sm">{pred.h}</span>
                <span className="score-colon">:</span>
                <span className="score-digit score-digit-sm">{pred.a}</span>
              </div>
              <span className="score-label score-label-green">YOUR PICK</span>
            </div>
          ) : isActuallyLocked ? (
            <div className="score-board">
              <span style={{fontSize:28,lineHeight:1}}>🔒</span>
              <span className="score-label" style={{marginTop:6}}>LOCKED</span>
            </div>
          ) : (
            <div className="score-inputs-row">
              <input className="sinput" type="number" inputMode="numeric" pattern="[0-9]*" min="0" max="20" value={h} onChange={e=>setH(e.target.value)} placeholder="–" />
              <span className="ssep">:</span>
              <input className="sinput" type="number" inputMode="numeric" pattern="[0-9]*" min="0" max="20" value={a} onChange={e=>setA(e.target.value)} placeholder="–" />
            </div>
          )}
        </div>
        <div className="mteam-col mteam-col-r">
          <span className="mteam-flag-lg">{flag(m.away)}</span>
          <span className="mteam-name-lg">{m.away}</span>
        </div>
      </div>
      {!fin && !submitted && !isActuallyLocked && (
        <div className="mcard-foot">
          <button className={`pred-cta ${saved?"pred-cta-done":""}`} disabled={h===""||a===""} onClick={save}>
            {saved ? <><IcoCheck /> PREDICTION SAVED</> : "SUBMIT PREDICTION →"}
          </button>
        </div>
      )}
      {!fin && submitted && (
        <div className="mverdict mv-locked"><IcoCheck /> Locked in · {pred.h}:{pred.a}</div>
      )}
      {!fin && isActuallyLocked && !submitted && (
        <div className="mverdict mv-missed">
          <IcoDash /> {isBanned ? "Banned from predictions" : "Missed — prediction deadline has passed"}
        </div>
      )}
      {fin && (
        <div className={`mverdict ${correct?"mv-ok": partialCorrect?"mv-partial":"mv-ng"}`}>
          {correct      ? <><IcoCheck /> Correct +5 pts</>
            : partialCorrect ? <><IcoCheck /> Right winner +1 pt · Your pick: {pred.h}:{pred.a}</>
            : pred        ? <><IcoX /> Wrong · Your pick: {pred.h}:{pred.a}</>
            :               <><IcoDash /> No prediction</>}
        </div>
      )}
      {/* ── Share to Feed button ── */}
      {user && pred && !sharePosted && (submitted || fin) && (
        <div className="mcard-share-row">
          {!shareOpen ? (
            <button className="mcard-share-btn" onClick={()=>setShareOpen(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              {fin ? "SHARE RESULT TO FEED" : "SHARE YOUR PICK TO FEED"}
            </button>
          ) : (
            <div className="mcard-share-panel">
              <div className="mcard-share-preview">
                <span className="mcard-share-preview-match">{flag(m.home)} {m.home} vs {m.away} {flag(m.away)}</span>
                <span className="mcard-share-preview-score">
                  {fin
                    ? `Final ${m.hs}:${m.as} · My pick ${pred.h}:${pred.a} · ${correct?"✓ +5pts":partialCorrect?"✓ +1pt":"✗ 0pts"}`
                    : `My pick: ${pred.h}:${pred.a}`}
                </span>
              </div>
              <input
                className="mcard-share-inp"
                placeholder="Add a caption… (optional)"
                value={shareCaption}
                onChange={e=>setShareCaption(e.target.value)}
                maxLength={150}
                autoFocus
              />
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button className="mcard-share-cancel" onClick={()=>{setShareOpen(false);setShareCaption("");}}>CANCEL</button>
                <button className="mcard-share-post" onClick={postPredToFeed} disabled={sharePosting}>
                  {sharePosting?"POSTING…":"POST TO FEED →"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {user && pred && sharePosted && (
        <div className="mcard-share-row">
          <div className="mcard-share-posted">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Posted to Mundogram!
          </div>
        </div>
      )}
      {/* ── Who Predicted What ── show within 1h of kickoff and after */}
      {/* Community pulse moved to MatchPulse at top of feed */}
    </div>
  );
}

/* ═══ MOMENTS ═══════════════════════════════════════════════════════════════ */
const FEED_PAGE_SIZE = 15;

function MomentsView({ user, isAdmin, users = {}, preds = {}, matches = [], pts = () => 0, appSettings = {}, sendNotif = ()=>{}, sendPush = ()=>{} }) {
  const [feedTab,  setFeedTab]  = useState("feed"); // "feed" | "notifs"
  const [showSearch, setShowSearch] = useState(false);
  const [searchFromFeed, setSearchFromFeed] = useState(false); // opened via card author click
  const [searchQ, setSearchQ] = useState("");
  const [searchSel, setSearchSel] = useState(null);
  const [moments,  setMoments]  = useState([]);
  const [likes,    setLikes]    = useState({});
  const [comments, setComments] = useState({});
  const [openComments, setOpenComments] = useState(null);
  const [commentTexts, setCommentTexts] = useState({});
  const [showPost,  setShowPost]  = useState(false);
  const [caption,   setCaption]   = useState("");
  const [uploading, setUploading] = useState(false);
  const [deleting,  setDeleting]  = useState(null);
  const [preview,   setPreview]   = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [likeAnims, setLikeAnims] = useState({});
  const [notifSeen, setNotifSeen] = useState(() => { try { return localStorage.getItem("em_notif_seen")||""; } catch { return ""; } });
  const [notifs,    setNotifs]    = useState([]);
  const [openCardMenu, setOpenCardMenu] = useState(null); // momentId with open 3-dots menu
  const [lightboxUrl, setLightboxUrl] = useState(null); // photo to show full-screen
  const [imgRatios, setImgRatios] = useState({}); // momentId -> aspect ratio string
  // Feed pagination
  const [feedPage, setFeedPage] = useState(1);
  const feedScrollRef = useRef(null);

  // ── Premium pull-to-refresh ──
  // Hardcoded distances (px)
  const PTR_MAX = 82;
  const PTR_TRIGGER = 58;
  const [ptrDist, setPtrDist] = useState(0);
  const [ptrRefreshing, setPtrRefreshing] = useState(false);
  const ptrActiveRef = useRef(false);
  const ptrDragRef   = useRef(false); // true once we've confirmed this is a vertical pull
  const ptrStartYRef = useRef(0);
  const ptrStartXRef = useRef(0);
  const ptrLastDistRef = useRef(0);
  const ptrScrollerRef = useRef(null);
  const ptrRefreshingRef = useRef(false);
  // keep ref in sync with state for handler closure
  useEffect(() => { ptrRefreshingRef.current = ptrRefreshing; }, [ptrRefreshing]);

  const load = async () => {
    const { data: ms } = await supabase.from("moments").select("*").order("created_at", { ascending: false });
    if (!ms?.length) { setMoments([]); return; }
    setMoments(ms);
    const ids = ms.map(x => x.id);
    const [{ data: ls }, { data: cs }] = await Promise.all([
      supabase.from("moment_likes").select("*").in("moment_id", ids),
      supabase.from("moment_comments").select("*").in("moment_id", ids).order("created_at"),
    ]);
    const lMap = {};
    (ls||[]).forEach(l => { if (!lMap[l.moment_id]) lMap[l.moment_id] = new Set(); lMap[l.moment_id].add(l.user_id); });
    setLikes(lMap);
    const cMap = {};
    (cs||[]).forEach(c => { if (!cMap[c.moment_id]) cMap[c.moment_id] = []; cMap[c.moment_id].push(c); });
    setComments(cMap);
    // Build notifications: comments/likes on MY posts by others
    const myIds = new Set((ms||[]).filter(m => m.posted_by === user.id).map(m => m.id));
    const notifList = [];
    (cs||[]).filter(c => myIds.has(c.moment_id) && c.user_id !== user.id).forEach(c => {
      notifList.push({ id:`c_${c.id}`, type:"comment", name:c.user_name, text:c.body, momentId:c.moment_id, time:c.created_at, img:(ms||[]).find(m=>m.id===c.moment_id)?.image_url });
    });
    (ls||[]).filter(l => myIds.has(l.moment_id) && l.user_id !== user.id).forEach(l => {
      const likerName = users[l.user_id]?.name || l.user_name || "Someone";
      const likedMoment = (ms||[]).find(m=>m.id===l.moment_id);
      const likedImg = likedMoment?.image_url && likedMoment.image_url !== "" ? likedMoment.image_url : null;
      notifList.push({ id:`l_${l.moment_id}_${l.user_id}`, type:"like", name:likerName, text:"liked your post 🔥", momentId:l.moment_id, time:null, img:likedImg });
    });
    notifList.sort((a,b) => b.time > a.time ? 1 : -1);
    setNotifs(notifList);
  };

  // ── Pull-to-refresh touch handling ──
  // Attaches non-passive touch listeners on main.body (the real scroller in this SPA).
  // Uses a delayed rAF to ensure the DOM has the feed rendered before binding.
  useEffect(() => {
    if (feedTab !== "feed") return;
    let scroller = document.querySelector("main.body");
    if (!scroller) return;
    ptrScrollerRef.current = scroller;

    const getScrollTop = () => scroller.scrollTop || 0;

    const onTouchStart = (e) => {
      if (ptrRefreshingRef.current) return;
      if (getScrollTop() > 2) return; // must be at the very top
      const t = e.touches[0];
      ptrStartYRef.current = t.clientY;
      ptrStartXRef.current = t.clientX;
      ptrActiveRef.current = true;
      ptrDragRef.current = false;
      ptrLastDistRef.current = 0;
      ptrActiveRef.hapticFired = false;
    };

    const onTouchMove = (e) => {
      if (!ptrActiveRef.current || ptrRefreshingRef.current) return;
      const t = e.touches[0];
      const dy = t.clientY - ptrStartYRef.current;
      const dx = t.clientX - ptrStartXRef.current;
      // Ignore horizontal swipes
      if (!ptrDragRef.current) {
        if (Math.abs(dx) > Math.abs(dy) + 4) { ptrActiveRef.current = false; return; }
        if (dy > 4) ptrDragRef.current = true;
        else return;
      }
      // Only pulling down counts
      if (dy <= 0) {
        if (ptrLastDistRef.current > 0) { setPtrDist(0); ptrLastDistRef.current = 0; }
        return;
      }
      // If user scrolled the content away from top mid-drag, abort
      if (getScrollTop() > 2) {
        ptrActiveRef.current = false;
        if (ptrLastDistRef.current > 0) { setPtrDist(0); ptrLastDistRef.current = 0; }
        return;
      }
      // CRITICAL: block native scroll/overscroll while pulling (must be first)
      try { e.preventDefault(); } catch {}
      // Rubber-band curve: asymptotic approach to PTR_MAX
      const raw = dy * 0.58;
      const eased = raw < PTR_MAX ? raw : PTR_MAX - Math.pow(PTR_MAX, 2) / (PTR_MAX + (raw - PTR_MAX));
      const clamped = Math.max(0, Math.min(PTR_MAX, eased));
      ptrLastDistRef.current = clamped;
      setPtrDist(clamped);
      // Haptic tick when crossing trigger threshold
      if (clamped >= PTR_TRIGGER && !ptrActiveRef.hapticFired) {
        ptrActiveRef.hapticFired = true;
        try { navigator.vibrate?.(22); } catch {}
      }
      if (clamped < PTR_TRIGGER && ptrActiveRef.hapticFired) {
        ptrActiveRef.hapticFired = false;
      }
    };

    const onTouchEnd = async () => {
      if (!ptrActiveRef.current && ptrLastDistRef.current === 0) return;
      const wasActive = ptrActiveRef.current;
      const wasDist = ptrLastDistRef.current;
      ptrActiveRef.current = false;
      ptrDragRef.current = false;
      ptrActiveRef.hapticFired = false;
      if (!wasActive) return;
      if (wasDist >= PTR_TRIGGER && !ptrRefreshingRef.current) {
        setPtrRefreshing(true);
        setPtrDist(PTR_TRIGGER);
        try { navigator.vibrate?.([12, 40, 12]); } catch {}
        try { await load(); } catch {}
        await new Promise(r => setTimeout(r, 700));
        setPtrRefreshing(false);
        setPtrDist(0);
        ptrLastDistRef.current = 0;
      } else {
        setPtrDist(0);
        ptrLastDistRef.current = 0;
      }
    };

    // Non-passive touchmove so preventDefault() actually blocks native scroll
    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove",  onTouchMove,  { passive: false });
    scroller.addEventListener("touchend",   onTouchEnd,   { passive: true });
    scroller.addEventListener("touchcancel",onTouchEnd,   { passive: true });
    return () => {
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove",  onTouchMove);
      scroller.removeEventListener("touchend",   onTouchEnd);
      scroller.removeEventListener("touchcancel",onTouchEnd);
    };
  }, [feedTab]);

  useEffect(() => {
    load();
    const ch = supabase.channel("rt-moments")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"moments" }, () => { load(); setFeedPage(1); })
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"moments" }, p => {
        const r = p.new;
        if (r) {
          setMoments(ms => ms.map(m => m.id === r.id ? r : m));
          // Notify user when their post is approved
          if (r.approved && !p.old?.approved && r.posted_by === user.id) {
            sendNotif("✅ Post Approved!", "Live now on the feed!", `approved-${r.id}`);
          }
        }
      })
      .on("postgres_changes", { event:"DELETE", schema:"public", table:"moments" }, () => load())
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"moment_likes" }, p => {
        const { moment_id, user_id, user_name } = p.new;
        if (moment_id && user_id) {
          setLikes(l => { const n={...l}; const s=new Set(n[moment_id]||[]); s.add(user_id); n[moment_id]=s; return n; });
          // Notify if someone liked MY post (local) + push to post author
          setMoments(ms => {
            const m = ms.find(x => x.id === moment_id);
            if (m && m.posted_by === user.id && user_id !== user.id) {
              sendNotif("👍 New Like!", `${user_name || users[user_id]?.name || "Someone"} liked your post 🔥`, `like-${moment_id}-${user_id}`);
            }
            // Push to post author if it's someone else's like
            if (m && m.posted_by !== user_id && user_id === user.id) {
              sendPush({ title: `${user.name} liked your post `, body: "🔥🔥🔥🔥", tag: `like-${moment_id}`, userIds: [m.posted_by] });
            }
            return ms;
          });
        } else { load(); }
      })
      .on("postgres_changes", { event:"DELETE", schema:"public", table:"moment_likes" }, p => {
        const { moment_id, user_id } = p.old;
        if (moment_id && user_id) {
          setLikes(l => { const n={...l}; const s=new Set(n[moment_id]||[]); s.delete(user_id); n[moment_id]=s; return n; });
        } else { load(); }
      })
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"moment_comments" }, p => {
        const c = p.new;
        setComments(prev => { const n={...prev}; n[c.moment_id]=[...(n[c.moment_id]||[]), c]; return n; });
        // Notify if someone commented on MY post (local) + push to post author
        setMoments(ms => {
          const m = ms.find(x => x.id === c.moment_id);
          if (m && m.posted_by === user.id && c.user_id !== user.id) {
            sendNotif("💬 New Comment!", `${c.user_name || "Someone"}: ${(c.body||"").substring(0,60)}`, `comment-${c.id}`);
          }
          // Push to post author if it's someone else's comment
          if (m && m.posted_by !== c.user_id && c.user_id === user.id) {
            sendPush({ title: `${user.name} commented`, body: `${(c.body||"").substring(0,60)}`, tag: `comment-${c.moment_id}`, userIds: [m.posted_by] });
          }
          return ms;
        });
      })
      .on("postgres_changes", { event:"DELETE", schema:"public", table:"moment_comments" }, p => {
        const c = p.old;
        setComments(prev => { const n={...prev}; n[c.moment_id]=(n[c.moment_id]||[]).filter(x=>x.id!==c.id); return n; });
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const likeBusyRef = useRef(new Set());
  const toggleLike = async (momentId) => {
    if (likeBusyRef.current.has(momentId)) return;
    likeBusyRef.current.add(momentId);
    const liked = (likes[momentId]||new Set()).has(user.id);
    // Optimistic UI update
    setLikes(prev => {
      const n = { ...prev };
      const s = new Set(n[momentId] || []);
      if (liked) s.delete(user.id); else s.add(user.id);
      n[momentId] = s;
      return n;
    });
    try {
      if (liked) {
        const { error } = await supabase.from("moment_likes").delete().eq("moment_id", momentId).eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("moment_likes").insert({ moment_id: momentId, user_id: user.id });
        if (error && error.code !== "23505") throw error; // ignore duplicate key
        try { navigator.vibrate?.([40]); } catch {}
        // Burst animation
        const particles = Array.from({length:7},(_,i)=>({ id:Date.now()+i, dx:(Math.random()-0.5)*80, dy:-(30+Math.random()*60) }));
        setLikeAnims(a=>({...a,[momentId]:[...(a[momentId]||[]),...particles]}));
        setTimeout(()=>setLikeAnims(a=>({...a,[momentId]:(a[momentId]||[]).filter(p=>!particles.find(x=>x.id===p.id))})),900);
      }
    } catch (err) {
      console.error("Like failed:", err);
      // Revert optimistic update
      setLikes(prev => {
        const n = { ...prev };
        const s = new Set(n[momentId] || []);
        if (liked) s.add(user.id); else s.delete(user.id);
        n[momentId] = s;
        return n;
      });
    } finally {
      likeBusyRef.current.delete(momentId);
    }
  };

  const postComment = async (momentId) => {
    const txt = (commentTexts[momentId]||"").trim();
    if (!txt) return;
    await supabase.from("moment_comments").insert({
      moment_id: momentId, user_id: user.id,
      user_name: user.name, avatar_url: user.avatar_url || null,
      body: txt,
    });
    setCommentTexts(t=>({...t,[momentId]:""}));
  };

  const deleteComment = async (commentId, momentId) => {
    await supabase.from("moment_comments").delete().eq("id", commentId);
  };

  const deleteMoment = async (momentId) => {
    setDeleting(momentId);
    await supabase.from("moment_comments").delete().eq("moment_id", momentId);
    await supabase.from("moment_likes").delete().eq("moment_id", momentId);
    const mom = moments.find(m => m.id === momentId);
    if (mom?.image_url) {
      const path = mom.image_url.split("/avatars/").pop()?.split("?")[0];
      if (path) await supabase.storage.from("avatars").remove([path]);
    }
    await supabase.from("moments").delete().eq("id", momentId);
    setMoments(ms => ms.filter(m => m.id !== momentId));
    setDeleting(null);
  };

  const approveMoment = async (momentId) => {
    await supabase.from("moments").update({ approved: true }).eq("id", momentId);
    setMoments(ms => ms.map(m => m.id === momentId ? { ...m, approved: true } : m));
  };

  const handlePickPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("File too large — max 10MB"); e.target.value = ""; return; }
    setPreviewFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handlePostPhoto = async () => {
    if (!previewFile) return;
    setUploading(true);
    try {
      const compressed = await compressImage(previewFile);
      const path = `moments/${Date.now()}_${user.id}.jpg`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, compressed, { upsert: false, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("moments").insert({
        image_url: publicUrl, caption: caption.trim() || null,
        posted_by: user.id, poster_name: user.name, poster_avatar: user.avatar_url || null,
        submitted_by: user.id, approved: isAdmin,
      });
      setCaption(""); setShowPost(false); setPreview(null); setPreviewFile(null);
      if (!isAdmin) alert("📸 Submitted! Your photo appears after admin approves it.");
    } catch(err) { console.error("Moment upload failed", err); alert("Upload failed: " + (err?.message || JSON.stringify(err))); }
    finally { setUploading(false); }
  };

  const timeAgo = (ts) => {
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
  };


  const unseenNotifs = notifs.filter(n => !notifSeen.includes(n.id)).length;

  const markNotifsSeen = () => {
    const ids = notifs.map(n=>n.id).join(",");
    setNotifSeen(ids);
    try { localStorage.setItem("em_notif_seen", ids); } catch {}
  };

  // Player search
  const userList = Object.values(users);
  const searchResults = searchQ.trim().length > 0
    ? userList.filter(u => u.name?.toLowerCase().includes(searchQ.toLowerCase()) || String(u.player_number||"").includes(searchQ))
    : [];

  return (
    <div className="mom-root">

      {/* ── LIGHTBOX ── */}
      {lightboxUrl && (
        <div className="mom-lightbox" onClick={()=>setLightboxUrl(null)}>
          <button className="psearch-close" style={{top:20,right:20}} onClick={()=>setLightboxUrl(null)}>✕</button>
          <img src={lightboxUrl} className="mom-lightbox-img" alt=""/>
        </div>
      )}

      {/* ── PLAYER SEARCH / PROFILE POPUP ── */}
      {showSearch && (
        <div className="psearch-overlay" onClick={e=>{if(e.target===e.currentTarget){setShowSearch(false);setSearchQ("");setSearchSel(null);setSearchFromFeed(false);}}}>
          <div className="psearch-popup">
            <button className="psearch-close" onClick={()=>{setShowSearch(false);setSearchQ("");setSearchSel(null);setSearchFromFeed(false);}}>✕</button>

            {!searchSel ? (
              <>
                <div className="psearch-title">FIND PLAYERS</div>
                <div className="psearch-input-wrap">
                  <svg className="psearch-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input className="psearch-inp" placeholder="Name or #number…" value={searchQ}
                    onChange={e=>setSearchQ(e.target.value)} autoFocus/>
                  {searchQ && <button className="psearch-clear" onClick={()=>setSearchQ("")}>✕</button>}
                </div>
                <div className="psearch-results">
                  {searchQ.trim().length === 0 && <div className="psearch-hint">⚽ Search by player name or number</div>}
                  {searchQ.trim().length > 0 && searchResults.length === 0 && <div className="psearch-hint">No players found for "{searchQ}"</div>}
                  {searchResults.map((u,i)=>(
                    <div key={u.id} className="psearch-row" style={{animationDelay:`${i*0.04}s`}} onClick={()=>setSearchSel(u)}>
                      <Av u={u} size={46} fontSize={19}/>
                      <div className="psearch-row-info">
                        <div className="psearch-row-name">{u.name}</div>
                        {getPlayerBadge(u) && <div style={{marginTop:5}}><PlayerBadge u={u}/></div>}
                      </div>
                      <span className="psearch-arr">›</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* ── Player profile view ── */
              <>
                {!searchFromFeed && (
                  <button className="psearch-back" onClick={()=>setSearchSel(null)}>← BACK</button>
                )}
                <div className="psearch-profile">
                  <Av u={searchSel} size={88} fontSize={36}/>
                  <div className="psearch-pname">{searchSel.name}</div>
                  {getPlayerBadge(searchSel) && <div className="psearch-badge-glow"><PlayerBadge u={searchSel}/></div>}
                </div>
                <div className="psearch-stats">
                  {(() => {
                    const fin = matches.filter(m => m.status === "finished");
                    const selPts = pts(searchSel.id);
                    const sub = fin.filter(m => !!preds[`${searchSel.id}__${m.id}`]).length;
                    const corr = fin.filter(m => { const p = preds[`${searchSel.id}__${m.id}`]; return p && calcPts(p, m.hs, m.as) === 5; }).length;
                    const acc = sub > 0 ? Math.round(corr / sub * 100) : null;
                    return [{l:"POINTS",v:selPts},{l:"CORRECT",v:sub>0?`${corr}/${sub}`:"—"},{l:"ACCURACY",v:acc!=null?`${acc}%`:"—"}];
                  })().map(s=>(
                    <div key={s.l} className="psearch-stat">
                      <div className="psearch-stat-val">{s.v}</div>
                      <div className="psearch-stat-lbl">{s.l}</div>
                    </div>
                  ))}
                </div>
                {(() => {
                  const theirMoments = moments.filter(m=>m.posted_by===searchSel.id&&m.approved&&m.image_url&&m.image_url!=="");
                  return theirMoments.length > 0 ? (
                    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                      <div className="psearch-posts-title">PHOTOS · {theirMoments.length}</div>
                      <div className="psearch-grid" style={{flex:1,overflowY:"auto"}}>
                        {theirMoments.map(m=>(
                          <img key={m.id} src={m.image_url} className="psearch-grid-img" alt=""
                            onClick={()=>setLightboxUrl(m.image_url)} style={{cursor:"pointer"}}/>
                        ))}
                      </div>
                    </div>
                  ) : <div className="psearch-hint" style={{marginTop:24}}>No posts yet</div>;
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── POST POPUP ── */}
      {showPost && (
        <div className="psearch-overlay" onClick={e=>{if(e.target===e.currentTarget){setShowPost(false);setPreview(null);setPreviewFile(null);}}}>
          <div className="psearch-popup" style={{height:"auto",maxHeight:"90vh"}}>
            <button className="psearch-close" onClick={()=>{setShowPost(false);setPreview(null);setPreviewFile(null);}}>✕</button>
            <div className="psearch-title" style={{paddingBottom:8}}>{isAdmin?"NEW POST":"SUBMIT A MOMENT"}</div>
            {!isAdmin && <div style={{fontSize:11,color:"rgba(255,255,255,.3)",letterSpacing:1,padding:"0 24px 12px"}}>Your photo will be reviewed before appearing publicly</div>}
            <div style={{padding:"0 20px 20px",display:"flex",flexDirection:"column",gap:12}}>
              {preview ? (
                <div className="mom-preview-wrap">
                  <img src={preview} className="mom-preview-img" alt="preview" style={{maxHeight:300}}/>
                  <button className="mom-preview-change" onClick={()=>{setPreview(null);setPreviewFile(null);}}>✕ Change photo</button>
                </div>
              ) : (
                <label className="mom-pick-area">
                  <div style={{fontSize:48,marginBottom:10}}>📷</div>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:3,color:"rgba(255,255,255,.5)"}}>TAP TO SELECT PHOTO</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.2)",marginTop:6}}>JPG, PNG up to 10MB</div>
                  <input type="file" accept="image/*" style={{display:"none"}} onChange={handlePickPhoto}/>
                </label>
              )}
              <input className="mom-caption-inp" placeholder="Write a caption… (optional)" value={caption} onChange={e=>setCaption(e.target.value)} maxLength={200} style={{fontSize:14,padding:"12px 14px"}}/>
              <div style={{display:"flex",gap:10}}>
                <button className="mom-cancel-btn" style={{flex:1,padding:"13px 0"}} onClick={()=>{setShowPost(false);setPreview(null);setPreviewFile(null);}}>CANCEL</button>
                <button className="mom-upload-btn" style={{flex:2,padding:"13px 0",opacity:(!previewFile||uploading)?0.35:1,cursor:(!previewFile||uploading)?"not-allowed":"pointer"}} onClick={handlePostPhoto} disabled={!previewFile||uploading}>
                  {uploading?"UPLOADING…":"SHARE POST"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS POPUP ── */}
      {feedTab==="notifs" && (
        <div className="psearch-overlay" onClick={e=>{if(e.target===e.currentTarget){setFeedTab("feed");}}}>
          <div className="psearch-popup" style={{height:"75vh"}}>
            <button className="psearch-close" onClick={()=>setFeedTab("feed")}>✕</button>
            <div className="psearch-title">NOTIFICATIONS{unseenNotifs > 0 ? ` · ${unseenNotifs} NEW` : ""}</div>
            <div style={{flex:1,overflowY:"auto"}}>
              {notifs.length === 0 ? (
                <div className="psearch-hint" style={{paddingTop:40}}>
                  <div style={{fontSize:40,marginBottom:12}}>🔔</div>
                  <div>No notifications yet</div>
                  <div style={{marginTop:6,fontSize:11}}>Likes and comments on your posts appear here</div>
                </div>
              ) : notifs.map(n=>(
                <div key={n.id} className={`mom-notif-row ${!notifSeen.includes(n.id)?"mom-notif-new":""}`}>
                  <div className="mom-notif-icon">{n.type==="like"?"❤️":"💬"}</div>
                  <div className="mom-notif-body">
                    <span className="mom-notif-name">{n.name}</span>
                    <span className="mom-notif-text"> {n.type==="like"?"liked your photo":`commented: "${n.text?.substring(0,40)}${(n.text?.length||0)>40?"…":""}"`}</span>
                    {n.time && <div className="mom-notif-time">{timeAgo(n.time)}</div>}
                  </div>
                  {n.img && <img src={n.img} className="mom-notif-thumb" alt=""/>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="mom-header">
        <div className="mom-topbar">
          {/* Left: my avatar */}
          <div className="mom-topbar-left">
            <div className="mom-my-av" onClick={()=>{setSearchSel(users[user.id]||user);setShowSearch(true);setSearchFromFeed(true);}}>
              <Av u={user} size={32} fontSize={13}/>
            </div>
          </div>
          {/* Center: FEED + neon sub */}
          <div className="mom-topbar-center">
            <div className="mom-logo-text">FEED</div>
            <div className="mom-neon-sub">— {appSettings.eventName||"WORLD CUP"} {appSettings.eventYear||2026} —</div>
          </div>
          {/* Right: action icons */}
          <div className="mom-topbar-right">
            <button className="mom-icon-btn" onClick={()=>{setFeedTab("notifs");markNotifsSeen();}}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {unseenNotifs > 0 && <span className="mom-icon-badge">{unseenNotifs}</span>}
            </button>
            <button className="mom-icon-btn" onClick={()=>{setShowSearch(true);setSearchSel(null);setSearchQ("");setSearchFromFeed(false);}}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            <button className="mom-icon-btn mom-icon-add" onClick={()=>setShowPost(true)}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>
        <div className="mom-divider"/>
      </div>

      {/* ── FEED TAB ── */}
      {feedTab === "feed" && (
        <div ref={feedScrollRef}>
          {/* ── Minimal premium pull-to-refresh ── */}
          {(() => {
            const p = Math.min(1, ptrDist / PTR_TRIGGER);
            const ready = ptrDist >= PTR_TRIGGER;
            // Circle: r=11, circumference ≈ 69.1
            const C = 69.1;
            return (
              <div className="ptr4-wrap"
                   style={{
                     height: `${ptrDist}px`,
                     transition: ptrActiveRef.current ? "none" : "height .55s cubic-bezier(.22,.61,.36,1)",
                   }}>
                <div className="ptr4-stage"
                     style={{
                       opacity: Math.min(1, p * 1.2),
                       transform: `scale(${0.75 + p * 0.25})`,
                     }}>
                  <svg
                    className={`ptr4-svg ${ptrRefreshing ? "ptr4-spin" : ""}`}
                    width="26" height="26" viewBox="0 0 26 26"
                  >
                    <circle cx="13" cy="13" r="11" className="ptr4-track"/>
                    <circle
                      cx="13" cy="13" r="11"
                      className={`ptr4-progress ${ready ? "ptr4-ready" : ""}`}
                      style={{
                        strokeDasharray: C,
                        strokeDashoffset: ptrRefreshing ? C * 0.25 : C - (p * C),
                      }}
                    />
                  </svg>
                </div>
              </div>
            );
          })()}

          {/* ── Swipe down hint (only when idle and at top) ── */}
          {ptrDist === 0 && !ptrRefreshing && (
            <div className="ptr-hint" aria-hidden="true">
              <div className="ptr-hint-chev">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
              <div className="ptr-hint-label">SWIPE DOWN TO REFRESH</div>
            </div>
          )}

          {/* Cinematic World Cup hero banner */}
          <div className="mom-hero">
            <div className="mom-hero-bg"/>
            <div className="mom-hero-sweep"/>
            <div className="mom-hero-grid"/>
            <div className="mom-hero-body">
              <div className="mom-hero-eyebrow">EL MUNDO · BONAIRE</div>
              <div className="mom-hero-title">
                <span className="mom-hero-title-line1">{appSettings.eventName||"WORLD CUP"}</span>
                <span className="mom-hero-title-line2">{appSettings.eventYear||2026}</span>
              </div>
              <div className="mom-hero-bar"/>
              <div className="mom-hero-sub">CAPTURE &amp; SHARE YOUR MOMENTS</div>
            </div>
            <div className="mom-hero-ticker-wrap">
              <div className="mom-hero-ticker">
                {["🇲🇽 MEXICO","🇺🇸 USA","🇨🇦 CANADA","🇧🇷 BRAZIL","🇦🇷 ARGENTINA","🇫🇷 FRANCE","🇩🇪 GERMANY","🇪🇸 SPAIN","🏴󠁧󠁢󠁥󠁮󠁧󠁿 ENGLAND","🇳🇱 NETHERLANDS","🇵🇹 PORTUGAL","🇯🇵 JAPAN","🇲🇦 MOROCCO","🇸🇳 SENEGAL","🇨🇴 COLOMBIA","🇺🇾 URUGUAY"].map(t=>(
                  <span key={t} className="mom-hero-tick">{t}</span>
                ))}
                {["🇲🇽 MEXICO","🇺🇸 USA","🇨🇦 CANADA","🇧🇷 BRAZIL","🇦🇷 ARGENTINA","🇫🇷 FRANCE","🇩🇪 GERMANY","🇪🇸 SPAIN","🏴󠁧󠁢󠁥󠁮󠁧󠁿 ENGLAND","🇳🇱 NETHERLANDS","🇵🇹 PORTUGAL","🇯🇵 JAPAN","🇲🇦 MOROCCO","🇸🇳 SENEGAL","🇨🇴 COLOMBIA","🇺🇾 URUGUAY"].map(t=>(
                  <span key={t+"2"} className="mom-hero-tick">{t}</span>
                ))}
              </div>
            </div>
          </div>

          {(() => {
            const allVisible = moments.filter(m => isAdmin || m.approved);
            const totalPosts = allVisible.length;
            const visiblePosts = allVisible.slice(0, feedPage * FEED_PAGE_SIZE);
            const hasMore = visiblePosts.length < totalPosts;

            if (totalPosts === 0) return (
              <div className="mom-empty">
                <div style={{fontSize:64,marginBottom:16}}>📸</div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:18,letterSpacing:4,color:"rgba(255,255,255,.3)"}}>NO POSTS YET</div>
                <div style={{fontSize:13,color:"rgba(255,255,255,.2)",marginTop:8,letterSpacing:1,lineHeight:1.6}}>Share a moment or your match prediction — be the first!</div>
                <button className="mom-empty-cta" onClick={()=>setShowPost(true)}>+ POST A PHOTO</button>
              </div>
            );

            return (<>
            {/* Post count */}
            <div className="feed-count-bar">
              <span className="feed-count-txt">Showing {visiblePosts.length} of {totalPosts} post{totalPosts!==1?"s":""}</span>
            </div>
            <div className="mom-feed">
              {visiblePosts.map(mom => {
                const myLike = (likes[mom.id]||new Set()).has(user.id);
                const likeCount = (likes[mom.id]||new Set()).size;
                const momComments = comments[mom.id] || [];
                const showingComments = openComments === mom.id || openComments === mom.id+"_all";
                const showAllComments = openComments === mom.id+"_all";
                const isPending = !mom.approved;
                const anims = likeAnims[mom.id] || [];
                const posterUser = users[mom.posted_by] || { name: mom.poster_name, avatar_url: mom.poster_avatar };
                const openPosterProfile = () => { setSearchSel(posterUser); setShowSearch(true); setSearchFromFeed(true); };
                const menuOpen = openCardMenu === mom.id;
                const ratio = imgRatios[mom.id] || "4/5";

                // Detect prediction post (image_url is "" and caption is JSON with __type:"pred")
                let predMeta = null;
                try {
                  if ((mom.image_url === "" || mom.image_url === null) && mom.caption?.startsWith('{"__type":"pred"')) {
                    predMeta = JSON.parse(mom.caption);
                  }
                } catch {}

                return (
                  <div key={mom.id} className={`mom-card ${isPending?"mom-card-pending":""}`}
                    onClick={()=>{ if(menuOpen) setOpenCardMenu(null); }}>
                    {isPending && isAdmin && (
                      <div className="mom-pending-banner">
                        ⏳ PENDING
                        <button className="mom-approve-btn" onClick={()=>approveMoment(mom.id)}>✓ APPROVE</button>
                        <button className="mom-delete-btn" style={{marginLeft:6,color:"#ef4444"}} onClick={e=>{e.stopPropagation();deleteMoment(mom.id);}}>✕ REJECT</button>
                      </div>
                    )}
                    {/* Author row */}
                    <div className="mom-card-author">
                      <div className="mom-card-av mom-card-av-ring" onClick={openPosterProfile}>
                        <Av u={posterUser} size={40} fontSize={16}/>
                      </div>
                      <div className="mom-photo-author" onClick={openPosterProfile} style={{cursor:"pointer"}}>
                        <div className="mom-author-top">
                          <span className="mom-poster-name">{mom.poster_name}</span>
                          {getPlayerBadge(posterUser) && <PlayerBadge u={posterUser}/>}
                        </div>
                        <div className="mom-time">{timeAgo(mom.created_at)}</div>
                      </div>
                      {/* 3-dots menu */}
                      <div className="mom-3dots-wrap">
                        <button className="mom-3dots" onClick={e=>{e.stopPropagation();setOpenCardMenu(menuOpen?null:mom.id);}}>
                          <span/><span/><span/>
                        </button>
                        {menuOpen && (
                          <div className="mom-card-menu" onClick={e=>e.stopPropagation()}>
                            <button className="mom-card-menu-item" onClick={()=>{openPosterProfile();setOpenCardMenu(null);}}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                              View Profile
                            </button>
                            {(isAdmin || mom.posted_by === user.id) && (
                              <button className="mom-card-menu-item mom-card-menu-delete" onClick={()=>{deleteMoment(mom.id);setOpenCardMenu(null);}} disabled={deleting===mom.id}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                {deleting===mom.id?"Deleting…":"Delete Post"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Prediction Post Card — special render */}
                    {predMeta ? (
                      <div className="mom-pred-card">
                        <div className="mom-pred-label">
                          {predMeta.fin ? "⚽ MY RESULT" : "⚽ MY PREDICTION"}
                        </div>
                        <div className="mom-pred-matchup">
                          <div className="mom-pred-team">
                            <span className="mom-pred-flag">{flag(predMeta.home)}</span>
                            <span className="mom-pred-tname">{predMeta.home}</span>
                          </div>
                          <div className="mom-pred-scores">
                            {predMeta.fin && (
                              <div className="mom-pred-final">
                                <span className="mom-pred-fnum">{predMeta.finalH}</span>
                                <span className="mom-pred-fcolon">:</span>
                                <span className="mom-pred-fnum">{predMeta.finalA}</span>
                                <div className="mom-pred-final-lbl">FINAL</div>
                              </div>
                            )}
                            <div className="mom-pred-pick">
                              <span className="mom-pred-pnum">{predMeta.predH}</span>
                              <span className="mom-pred-pcolon">:</span>
                              <span className="mom-pred-pnum">{predMeta.predA}</span>
                              <div className="mom-pred-pick-lbl">MY PICK</div>
                            </div>
                          </div>
                          <div className="mom-pred-team mom-pred-team-r">
                            <span className="mom-pred-flag">{flag(predMeta.away)}</span>
                            <span className="mom-pred-tname">{predMeta.away}</span>
                          </div>
                        </div>
                        <div className="mom-pred-meta">{predMeta.group} · {predMeta.date} · {predMeta.time} BON</div>
                        {predMeta.fin && predMeta.result && (
                          <div className={`mom-pred-result ${predMeta.result==="exact"?"mom-pred-exact":predMeta.result==="winner"?"mom-pred-winner":"mom-pred-wrong"}`}>
                            {predMeta.result==="exact" && <><span className="mom-pred-result-ico">✓</span> EXACT SCORE · +5 PTS</>}
                            {predMeta.result==="winner" && <><span className="mom-pred-result-ico">✓</span> RIGHT WINNER · +1 PT</>}
                            {predMeta.result==="wrong"  && <><span className="mom-pred-result-ico">✗</span> WRONG PREDICTION · 0 PTS</>}
                          </div>
                        )}
                        {predMeta.userCaption && <div className="mom-pred-user-caption">"{predMeta.userCaption}"</div>}
                      </div>
                    ) : (
                      /* Regular photo post */
                      mom.image_url && mom.image_url !== "" && (
                        <div className="mom-photo-wrap" style={{aspectRatio:ratio}} onClick={()=>setLightboxUrl(mom.image_url)}>
                          <img src={mom.image_url} className="mom-img" alt="moment"
                            style={isPending?{opacity:.55}:{}}
                            onLoad={e=>{
                              const {naturalWidth:w,naturalHeight:h}=e.target;
                              if(!w||!h) return;
                              const r=w/h;
                              setImgRatios(prev=>({...prev,[mom.id]:r>1.1?"16/9":r<0.9?"4/5":"1/1"}));
                            }}/>
                        </div>
                      )
                    )}

                    {/* Caption (for photo posts) */}
                    {!predMeta && mom.caption && <div className="mom-caption">{mom.caption}</div>}

                    {/* Actions bar */}
                    <div className="mom-actions">
                      <div style={{position:"relative",display:"inline-flex",alignItems:"center"}}>
                        <button className={`mom-like-btn ${myLike?"mom-liked":""}`} onClick={()=>toggleLike(mom.id)}>
                          <svg className={`mom-heart-svg ${myLike?"mom-heart-svg-on":""}`} width="24" height="24" viewBox="0 0 24 24" fill={myLike?"#e63946":"none"} stroke={myLike?"#e63946":"rgba(255,255,255,.55)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                          {likeCount > 0 && <span className="mom-like-count">{likeCount}</span>}
                        </button>
                        {anims.map(p=>(
                          <span key={p.id} className="mom-heart-burst" style={{"--dx":`${p.dx}px`,"--dy":`${p.dy}px`}}>❤</span>
                        ))}
                      </div>
                      <button className="mom-comment-toggle" onClick={()=>setOpenComments(showingComments?null:mom.id)}>
                        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        {momComments.length > 0 && <span className="mom-like-count">{momComments.length}</span>}
                      </button>
                    </div>

                    {/* Comments */}
                    {showingComments && (
                      <div className="mom-comments">
                        {(momComments.length <= 2 || showAllComments ? momComments : momComments.slice(0, 2)).map(c=>(
                          <div key={c.id} className="mom-comment">
                            <Av u={{name:c.user_name,avatar_url:c.avatar_url}} size={28} fontSize={12}/>
                            <div className="mom-comment-body">
                              <span className="mom-comment-name">{c.user_name}</span>
                              <span className="mom-comment-text"> {c.body}</span>
                            </div>
                            {(isAdmin||c.user_id===user.id||mom.posted_by===user.id)&&<button className="mom-del-comment" onClick={()=>deleteComment(c.id,mom.id)}>×</button>}
                          </div>
                        ))}
                        {momComments.length > 2 && (
                          <button className="mom-see-more-btn" onClick={()=>setOpenComments(mom.id+"_all")}>
                            View all {momComments.length} comments
                          </button>
                        )}
                        <div className="mom-comment-input-row">
                          <Av u={user} size={28} fontSize={12}/>
                          <input className="mom-comment-inp" placeholder="Add a comment…"
                            value={commentTexts[mom.id]||""}
                            onChange={e=>setCommentTexts(t=>({...t,[mom.id]:e.target.value}))}
                            onKeyDown={e=>{if(e.key==="Enter")postComment(mom.id);}}
                            maxLength={300}/>
                          <button className="mom-comment-send" onClick={()=>postComment(mom.id)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Load more / end of feed */}
            {hasMore ? (
              <button className="feed-load-more" onClick={() => setFeedPage(p => p + 1)}>
                LOAD MORE ({totalPosts - visiblePosts.length} remaining)
              </button>
            ) : totalPosts > FEED_PAGE_SIZE && (
              <div className="feed-end">You've reached the end</div>
            )}
            </>);
          })()}
        </div>
      )}

      {/* ── NOTIFICATIONS TAB ── */}
      {feedTab === "notifs" && (
        <div className="mom-notifs">
          {notifs.length === 0 ? (
            <div className="mom-empty">
              <div style={{fontSize:52,marginBottom:16}}>🔔</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,letterSpacing:3,color:"rgba(255,255,255,.25)"}}>NO NOTIFICATIONS YET</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.2)",marginTop:8,lineHeight:1.6}}>Likes and comments on your posts will appear here</div>
            </div>
          ) : notifs.map(n => (
            <div key={n.id} className={`mom-notif-row ${!notifSeen.includes(n.id)?"mom-notif-new":""}`}>
              <div className="mom-notif-icon">{n.type==="like"?"❤️":"💬"}</div>
              <div className="mom-notif-body">
                <span className="mom-notif-name">{n.name}</span>
                <span className="mom-notif-text"> {n.type==="like"?"liked your post":`commented: "${n.text?.substring(0,40)}${(n.text?.length||0)>40?"…":""}"`}</span>
                {n.time && <div className="mom-notif-time">{timeAgo(n.time)}</div>}
              </div>
              {n.img && <img src={n.img} className="mom-notif-thumb" alt=""/>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ LEADERBOARD ═══════════════════════════════════════════════════════════ */
/* ═══ SHARED COMPONENTS ════════════════════════════════════════════════════ */
function SecHead({ title, sub }) {
  return (
    <div className="section-banner">
      <span className="section-banner-title">{title}</span>
      {sub && <span className="section-banner-sub">{sub}</span>}
    </div>
  );
}

function AField({ label, val, on, ph, type="text" }) {
  return (
    <div className="afield">
      <label className="afield-lbl">{label}</label>
      <input className="afield-inp" type={type} value={val} onChange={on} placeholder={ph} />
    </div>
  );
}

/* ═══ ICONS ══════════════════════════════════════════════════════════════════ */
const SoccerIco = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>;
const TrophyIco = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 2 12 2 12 16"/><path d="M5 6H3a2 2 0 0 0-2 2v1a6 6 0 0 0 6 6h2"/><path d="M19 6h2a2 2 0 0 1 2 2v1a6 6 0 0 1-6 6h-2"/><rect x="8" y="16" width="8" height="2" rx="1"/><line x1="8" y1="22" x2="16" y2="22"/><line x1="12" y1="18" x2="12" y2="22"/></svg>;
const MenuIco   = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>;
const RulesIco  = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
const PersonIco = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const AdminIco  = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const LogoutIco = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IcoCheck = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IcoX     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IcoDash  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>;

/* ─── Player Badge ───────────────────────────────────────────────────────── */
/* ═══ TOURNAMENT WINNER SCREEN ══════════════════════════════════════════════ */
function TournamentWinnerScreen({ board, isAdmin, onClose, appSettings = {} }) {
  const winner = board[0];
  const second = board[1];
  const third  = board[2];
  const confetti = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    color: ["#f472b6","#fff","#4ade80","#f87171","#60a5fa","#fbbf24"][i % 6],
    left: `${(i * 37 + 11) % 100}%`,
    dur:  `${3 + (i % 5)}s`,
    delay:`${(i * 0.3) % 3}s`,
    size: `${5 + (i % 5)}px`,
  }));

  return createPortal(
    <div className="winner-overlay">
      {/* Confetti */}
      <div className="winner-confetti">
        {confetti.map(c => (
          <span key={c.id} style={{
            position:"absolute", left:c.left, top:"-10px",
            width:c.size, height:c.size, borderRadius:"50%",
            background:c.color, opacity:.8,
            animation:`confettiFall ${c.dur} ${c.delay} linear infinite`,
          }}/>
        ))}
      </div>

      <div className="winner-trophy">🏆</div>
      <div className="winner-label">TOURNAMENT OVER</div>
      <div className="winner-event">EL MUNDO {appSettings.eventName||"WORLD CUP"} {appSettings.eventYear||2026}</div>

      {winner && <>
        <div className="winner-name">{winner.name}</div>
        <div className="winner-pts">{winner.pts} <span style={{fontSize:14,letterSpacing:2,opacity:.6}}>PTS</span></div>
        <div className="winner-champion">⭐ World Champion ⭐</div>
      </>}

      {(second || third) && (
        <div className="winner-podium">
          {second && (
            <div className="winner-pod-item">
              <div className="winner-pod-pos">🥈</div>
              <div className="winner-pod-name">{second.name}</div>
              <div className="winner-pod-pts">{second.pts} pts</div>
            </div>
          )}
          {third && (
            <div className="winner-pod-item">
              <div className="winner-pod-pos">🥉</div>
              <div className="winner-pod-name">{third.name}</div>
              <div className="winner-pod-pts">{third.pts} pts</div>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <button className="winner-close" onClick={onClose}>CLOSE SCREEN</button>
      )}
    </div>,
    document.body
  );
}

const BADGE_CFG = {
  developer: { label:"<> DEVELOPER", cls:"badge-dev"     },
  owner:     { label:"OWNER",     cls:"badge-owner"   },
  admin:     { label:"ADMIN",     cls:"badge-admin"   },
  gold:      { label:"SPONSOR",   cls:"badge-sponsor" },
  silver:    { label:"SPONSOR",   cls:"badge-sponsor" },
  sponsor:   { label:"SPONSOR",   cls:"badge-sponsor" },
};
const getPlayerBadge = (u) => {
  if (u.badge && BADGE_CFG[u.badge]) return u.badge;
  if (u.is_admin === true || u.is_admin === 1 || u.is_admin === "true") return "admin";
  if (u.sponsor_tier) return "sponsor"; // always show "SPONSOR" regardless of tier
  return null;
};
function PlayerBadge({ u }) {
  const key = getPlayerBadge(u);
  if (!key) return null;
  const cfg = BADGE_CFG[key];
  return <span className={`plr-badge ${cfg.cls}`}>{cfg.label}</span>;
}

/* ─── Avatar color from name hash ───────────────────────────────────────── */
const avatarColor = (name = "") => {
  const cols = ["#c0392b","#e67e22","#f39c12","#27ae60","#2980b9","#8e44ad","#16a085","#d35400","#1abc9c","#e91e63"];
  let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return cols[Math.abs(h) % cols.length];
};

/* ─── Reusable Avatar component ─────────────────────────────────────────── */
function Av({ u, size = 44, fontSize = 20 }) {
  if (u?.avatar_url) return (
    <img src={u.avatar_url} alt={u.name}
      style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0,display:"block"}} />
  );
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:avatarColor(u?.name||""),
      display:"flex",alignItems:"center",justifyContent:"center",
      fontFamily:"'Anton',sans-serif",fontSize,color:"#fff",flexShrink:0,letterSpacing:0}}>
      {(u?.name||"?")[0].toUpperCase()}
    </div>
  );
}

/* ─── Compress image before upload ──────────────────────────────────────── */
const compressImage = (file) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
      else        { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(resolve, "image/jpeg", 0.85);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

/* ─── Player Search View ─────────────────────────────────────────────────── */
function PlayerSearchView({ allUsers, currentUser, matches }) {
  const [query,    setQuery]    = useState("");
  const [selected, setSelected] = useState(null);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  const finished = matches.filter(m => m.status === "finished");

  const results = !query.trim() ? [] : allUsers.filter(u => {
    const q = query.toLowerCase();
    return (u.name||"").toLowerCase().includes(q) || (u.phone||"").includes(q);
  }).slice(0, 25);

  const openPlayer = async (u) => {
    setSelected(u); setStats(null); setLoading(true);
    const { data: rows } = await supabase.from("predictions").select("*").eq("user_id", u.id);
    if (rows) {
      const pm = {}; rows.forEach(p => { pm[p.match_id] = { h: p.home_pred, a: p.away_pred }; });
      let exact = 0, winner = 0, wrong = 0, totalPts = 0;
      for (const m of finished) {
        const p = pm[m.id];
        if (!p) continue;
        const pts = calcPts(p, m.hs ?? m.home_score, m.as ?? m.away_score);
        if (pts === 5) exact++; else if (pts === 1) winner++; else wrong++;
        totalPts += pts;
      }
      const total = exact + winner + wrong;
      setStats({ exact, winner, wrong, total, totalPts, accuracy: total ? Math.round((exact+winner)/total*100) : 0 });
    }
    setLoading(false);
  };

  if (selected) return (
    <div className="ps-root">
      <button className="ps-back" onClick={() => { setSelected(null); setStats(null); }}>‹ BACK TO SEARCH</button>

      {/* Profile card */}
      <div className="ps-profile-card">
        <div className="ps-profile-glow" style={{background: avatarColor(selected.name)}} />
        <div style={{marginBottom:14}}><Av u={selected} size={80} fontSize={36} /></div>
        <div className="ps-profile-name">{selected.name}</div>
        {getPlayerBadge(selected) && <div style={{marginTop:10}}><PlayerBadge u={selected} /></div>}
        {selected.id === currentUser.id && <div className="ps-its-you">— THIS IS YOU —</div>}
      </div>

      {/* Stats */}
      <div className="ps-stats-grid">
        <div className="ps-stat-box">
          <div className="ps-stat-num">{loading ? "…" : (stats?.totalPts ?? 0)}</div>
          <div className="ps-stat-lbl">POINTS</div>
        </div>
        <div className="ps-stat-box">
          <div className="ps-stat-num">{loading ? "…" : (stats?.total ?? 0)}</div>
          <div className="ps-stat-lbl">PREDICTED</div>
        </div>
        <div className="ps-stat-box">
          <div className="ps-stat-num">{loading ? "…" : `${stats?.accuracy ?? 0}%`}</div>
          <div className="ps-stat-lbl">ACCURACY</div>
        </div>
      </div>

      {stats && stats.total > 0 && (
        <div className="ps-breakdown">
          <div className="ps-bk-title">PREDICTION BREAKDOWN</div>
          <div className="ps-bk-bar">
            {stats.exact  > 0 && <div className="ps-bk-seg ps-bk-exact"  style={{flex:stats.exact}}  title={`Exact: ${stats.exact}`}/>}
            {stats.winner > 0 && <div className="ps-bk-seg ps-bk-winner" style={{flex:stats.winner}} title={`Winner: ${stats.winner}`}/>}
            {stats.wrong  > 0 && <div className="ps-bk-seg ps-bk-wrong"  style={{flex:stats.wrong}}  title={`Wrong: ${stats.wrong}`}/>}
          </div>
          <div className="ps-bk-legend">
            <span><span className="ps-bk-dot" style={{background:"#4ade80"}}/>Exact score ({stats.exact})</span>
            <span><span className="ps-bk-dot" style={{background:"#fbbf24"}}/>Correct winner ({stats.winner})</span>
            <span><span className="ps-bk-dot" style={{background:"rgba(255,255,255,.18)"}}/>Wrong ({stats.wrong})</span>
          </div>
        </div>
      )}
      {stats && stats.total === 0 && !loading && (
        <div className="ps-no-preds">No predictions placed yet</div>
      )}
    </div>
  );

  return (
    <div className="ps-root">
      {/* Search bar */}
      <div className="ps-bar">
        <span className="ps-bar-ico">⌕</span>
        <input className="ps-inp" placeholder="Search by name or phone…" value={query}
          onChange={e => setQuery(e.target.value)} autoComplete="off" autoCorrect="off" />
        {query && <button className="ps-clr" onClick={() => setQuery("")}>✕</button>}
      </div>

      {/* Empty state */}
      {!query.trim() && (
        <div className="ps-empty">
          <div className="ps-empty-ico">👥</div>
          <div className="ps-empty-title">SEARCH PLAYERS</div>
          <div className="ps-empty-sub">Find anyone by name or phone number</div>
        </div>
      )}

      {/* No results */}
      {query.trim() && results.length === 0 && (
        <div className="ps-empty">
          <div className="ps-empty-ico">🔍</div>
          <div className="ps-empty-title">NO RESULTS</div>
          <div className="ps-empty-sub">Try a different name or number</div>
        </div>
      )}

      {/* Results */}
      {results.map(u => (
        <div key={u.id} className="ps-row" onClick={() => openPlayer(u)}>
          <Av u={u} size={44} fontSize={20} />
          <div className="ps-row-info">
            <div className="ps-row-name">{u.name} {u.id === currentUser.id && <span className="ps-you">YOU</span>}</div>
            {getPlayerBadge(u) && <PlayerBadge u={u} />}
          </div>
          <div className="ps-row-arrow">›</div>
        </div>
      ))}
    </div>
  );
}

function PlayerProfileModal({ player, rank, matches, onClose }) {
  const finishedMatches = matches.filter(m => m.status === "finished");
  // Fetch this player's predictions on demand — avoids dependency on global
  // preds state which only contains the current user's rows after the 1000-row fix.
  const [stats, setStats] = useState({ total: 0, exact: 0 });
  useEffect(() => {
    if (finishedMatches.length === 0) return;
    supabase.from("predictions").select("*").eq("user_id", player.id)
      .then(({ data: rows }) => {
        if (!rows) return;
        const pm = {}; rows.forEach(p => { pm[p.match_id] = { h: p.home_pred, a: p.away_pred }; });
        const s = finishedMatches.reduce((acc, m) => {
          const p = pm[m.id];
          if (!p) return acc;
          const score = calcPts(p, m.hs ?? m.home_score, m.as ?? m.away_score);
          acc.total++;
          if (score === 5) acc.exact++;
          return acc;
        }, { total: 0, exact: 0 });
        setStats(s);
      });
  }, [player.id]); // eslint-disable-line

  const acc = stats.total > 0 ? Math.round(stats.exact / stats.total * 100) : null;
  const MEDALS = ["🥇","🥈","🥉"];
  const RANK_COLORS = ["#F0C040","#C0C0C0","#CD7F32"];
  const isTop3 = rank <= 3;

  return (
    <div className="psearch-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="psearch-popup" style={{height:"auto",maxHeight:"88vh"}}>
        <button className="psearch-close" onClick={onClose}>✕</button>

        {/* Premium rank badge */}
        <div style={{textAlign:"center",paddingTop:8,marginBottom:6}}>
          <span style={{
            display:"inline-flex",alignItems:"center",gap:7,
            background: isTop3 ? `linear-gradient(135deg,rgba(${isTop3?[
              "240,192,64","192,192,192","205,127,50"
            ][rank-1]:"255,255,255"},.14),rgba(${isTop3?[
              "240,192,64","192,192,192","205,127,50"
            ][rank-1]:"255,255,255"},.06))` : "rgba(255,255,255,.05)",
            border:`1px solid rgba(${isTop3?["240,192,64","192,192,192","205,127,50"][rank-1]:"255,255,255"},.${isTop3?"35":"1"})`,
            borderRadius:24,padding:"6px 16px",
            fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:3,
            color: isTop3 ? RANK_COLORS[rank-1] : "rgba(255,255,255,.35)",
          }}>
            {isTop3 && <span style={{fontSize:16,filter:`drop-shadow(0 0 6px ${RANK_COLORS[rank-1]})`}}>{MEDALS[rank-1]}</span>}
            RANK #{rank}
          </span>
        </div>

        {/* Avatar + name + badge */}
        <div className="psearch-profile">
          <Av u={player} size={88} fontSize={36}/>
          <div className="psearch-pname">{player.name}</div>
          {getPlayerBadge(player) && <div className="psearch-badge-glow"><PlayerBadge u={player}/></div>}
        </div>

        {/* Stats */}
        <div className="psearch-stats">
          {[
            {l:"POINTS",  v: player.pts},
            {l:"CORRECT", v: stats.total > 0 ? `${stats.exact}/${stats.total}` : "—"},
            {l:"ACCURACY",v: acc != null ? `${acc}%` : "—"},
          ].map(s => (
            <div key={s.l} className="psearch-stat">
              <div className="psearch-stat-val">{s.v}</div>
              <div className="psearch-stat-lbl">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LeaderView({ board, user, allUsers = [], matches = [], preds = {} }) {
  // Skeleton while board hydrates — empty board on first paint of this tab
  if (!board || board.length === 0) {
    return (
      <div className="lb-root">
        <div className="section-banner"><span className="section-banner-title">LEADERBOARD</span></div>
        <div className="lb-skel-podium">
          <div className="lb-skel-podium-card lb-skel-2" />
          <div className="lb-skel-podium-card lb-skel-1" />
          <div className="lb-skel-podium-card lb-skel-3" />
        </div>
        <div className="lb-skel-list">
          {[1,2,3,4,5,6,7].map(i => <div key={i} className="lb-skel-row" />)}
        </div>
      </div>
    );
  }
  const filtered = board.filter(u => u.is_admin !== true && u.is_admin !== 1 && u.is_admin !== "true");
  const top3   = filtered.slice(0, 3);
  const top4to10 = filtered.slice(3, 10); // positions 4–10 only

  // Rank in filtered (non-admin) board; fall back to full board for admins
  const myRankFiltered = filtered.findIndex(u => u.id === user.id) + 1;
  const myRankFull     = board.findIndex(u => u.id === user.id) + 1;
  const myRank  = myRankFiltered > 0 ? myRankFiltered : myRankFull;
  const myEntry = filtered.find(u => u.id === user.id) || board.find(u => u.id === user.id);

  // Show the user's own row below the table only when they're outside top 10
  const outsideTop10 = myRank > 10 || (myRankFiltered === 0 && myRankFull > 0);

  const [profilePlayer, setProfilePlayer] = useState(null);
  const profileRank = profilePlayer ? filtered.findIndex(u => u.id === profilePlayer.id) + 1 : 0;

  const [lbSearch, setLbSearch] = useState(false);
  const [lbQ, setLbQ] = useState("");
  const lbResults = lbQ.trim().length > 0
    ? filtered.filter(u => u.name?.toLowerCase().includes(lbQ.toLowerCase()) || String(u.player_number||"").includes(lbQ.trim()))
    : [];

  return (
    <div className="lb-root">
      {profilePlayer && (
        <PlayerProfileModal
          player={profilePlayer}
          rank={profileRank}
          matches={matches}
          onClose={() => setProfilePlayer(null)}
        />
      )}

      {/* ── PLAYER SEARCH OVERLAY ── */}
      {lbSearch && (
        <div className="psearch-overlay" onClick={e=>{if(e.target===e.currentTarget){setLbSearch(false);setLbQ("");}}}>
          <div className="psearch-popup">
            <button className="psearch-close" onClick={()=>{setLbSearch(false);setLbQ("");}}>✕</button>
            <div className="psearch-title">FIND A PLAYER</div>
            <div className="psearch-input-wrap">
              <svg className="psearch-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="psearch-inp" placeholder="Name or #number…" value={lbQ}
                onChange={e=>setLbQ(e.target.value)} autoFocus />
              {lbQ && <button className="psearch-clear" onClick={()=>setLbQ("")}>✕</button>}
            </div>
            <div className="psearch-results">
              {lbQ.trim().length === 0 && <div className="psearch-hint">Search by player name or number</div>}
              {lbQ.trim().length > 0 && lbResults.length === 0 && <div className="psearch-hint">No players found for "{lbQ}"</div>}
              {lbResults.map((u, i) => {
                const rank = filtered.findIndex(p => p.id === u.id) + 1;
                return (
                  <div key={u.id} className="psearch-row" style={{animationDelay:`${i*0.04}s`}} onClick={()=>{setLbSearch(false);setLbQ("");setProfilePlayer(u);}}>
                    <div className="psearch-row-info">
                      <div className="psearch-row-name">{u.name}</div>
                      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.35)"}}>#{rank} · {u.pts ?? 0} pts</div>
                    </div>
                    <span className="psearch-arr">›</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── SEARCH BUTTON ── */}
      <div style={{display:"flex",justifyContent:"flex-end",padding:"0 16px 4px"}}>
        <button onClick={()=>setLbSearch(true)} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:20,padding:"6px 14px",fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.7)",cursor:"pointer",letterSpacing:1}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          SEARCH PLAYERS
        </button>
      </div>

      {/* ── TOP 3 PODIUM ── */}
      {top3.length >= 3 && (
        <div className="lb-podium">
          {top3[1] ? (
            <div className="lb-pod lb-pod-2" style={{cursor:"pointer"}} onClick={() => setProfilePlayer(top3[1])}>
              <div className="lb-pod-medal">🥈</div>
              <div className="lb-pod-name">{top3[1].name}</div>
              <div className="lb-pod-pts">{top3[1].pts}<span className="lb-pod-pts-u">pts</span></div>
              {top3[1].id === user.id && <div className="lb-pod-you">YOU</div>}
              <div className="lb-pod-plinth lb-pod-plinth-2" />
            </div>
          ) : <div className="lb-pod" />}

          <div className="lb-pod lb-pod-1" style={{cursor:"pointer"}} onClick={() => setProfilePlayer(top3[0])}>
            <div className="lb-pod-crown">👑</div>
            <div className="lb-pod-medal lb-pod-medal-1">🥇</div>
            <div className="lb-pod-name lb-pod-name-1">{top3[0].name}</div>
            <div className="lb-pod-pts lb-pod-pts-1">{top3[0].pts}<span className="lb-pod-pts-u">pts</span></div>
            {top3[0].id === user.id && <div className="lb-pod-you">YOU</div>}
            <div className="lb-pod-plinth lb-pod-plinth-1" />
          </div>

          {top3[2] ? (
            <div className="lb-pod lb-pod-3" style={{cursor:"pointer"}} onClick={() => setProfilePlayer(top3[2])}>
              <div className="lb-pod-medal">🥉</div>
              <div className="lb-pod-name">{top3[2].name}</div>
              <div className="lb-pod-pts">{top3[2].pts}<span className="lb-pod-pts-u">pts</span></div>
              {top3[2].id === user.id && <div className="lb-pod-you">YOU</div>}
              <div className="lb-pod-plinth lb-pod-plinth-3" />
            </div>
          ) : <div className="lb-pod" />}
        </div>
      )}

      {/* ── POSITIONS 4–10 + optional YOUR ROW ── */}
      {(top4to10.length > 0 || outsideTop10) && (
        <div className="lb-table">
          <div className="lb-table-header">
            <span className="lb-th-rank">POS</span>
            <span className="lb-th-name">PLAYER</span>
            <span className="lb-th-pts">PTS</span>
          </div>

          {top4to10.map((u, i) => (
            <div key={u.id} className={`lb-row ${u.id===user.id ? "lb-row-me" : ""}`} style={{cursor:"pointer"}} onClick={() => setProfilePlayer(u)}>
              <span className="lb-row-rank">#{i + 4}</span>
              <span className="lb-row-name">
                {u.name}
                {u.id===user.id && <span className="lb-you-tag">YOU</span>}
              </span>
              <span className="lb-row-pts">{u.pts}<span className="lb-row-pts-u"> pts</span></span>
            </div>
          ))}

          {/* Gap separator + user's own row when outside top 10 */}
          {outsideTop10 && myEntry && (
            <>
              <div className="lb-row-gap">
                <span>· · ·</span>
              </div>
              <div className="lb-row lb-row-me lb-row-you-inline" style={{cursor:"pointer"}} onClick={() => setProfilePlayer(myEntry)}>
                <span className="lb-row-rank" style={{color:"#F0C040"}}>#{myRank}</span>
                <span className="lb-row-name">
                  {myEntry.name}
                  <span className="lb-you-tag">YOU</span>
                </span>
                <span className="lb-row-pts" style={{color:"#F0C040"}}>{myEntry.pts ?? 0}<span className="lb-row-pts-u"> pts</span></span>
              </div>
            </>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="lb-empty">
          <div style={{fontSize:48,marginBottom:16}}>🏆</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:18,letterSpacing:3,color:"rgba(255,255,255,.4)"}}>NO PLAYERS YET</div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.25)",marginTop:8}}>Be the first to register and predict!</div>
        </div>
      )}
    </div>
  );
}

/* ═══ RULES VIEW ════════════════════════════════════════════════════════════ */
function RulesView({ rules }) {
  return (
    <div>
      <div className="section-banner">
        <span className="section-banner-title">RULES</span>
        <span className="section-banner-sub">Please read before playing</span>
      </div>
      <div className="card-stack">
        {rules.map((r, i) => (
          <div key={r.id} className="rules-card">
            <div className="rules-num">{String(i+1).padStart(2,"0")}</div>
            <div className="rules-content">
              <div className="rules-title">{r.title}</div>
              <div className="rules-body">{r.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="rules-footer">
        <span>⚽</span>
        <span>By participating you agree to all rules above.</span>
        <span>Good luck!</span>
      </div>
    </div>
  );
}

/* ═══ SPONSORS VIEW ═════════════════════════════════════════════════════════ */
const SPONSORS_LIST = [
  { id:"indebon",      name:"INDEBON",              sub:"Instituto Di Deporte Boneriano",        logo:"/logos/indebon2.jpg",          bg:"#fff"    },
  { id:"haafkes",      name:"Haafkes",              sub:"Bouwondernemers · Nederland & Bonaire",  logo:"/logos/haafkes.png",           bg:"#fff"    },
  { id:"wildkamp",     name:"Wildkamp",             sub:"",                                       logo:"/logos/wildkamp.png",          bg:"#fff"    },
  { id:"koenderink",   name:"Koenderink & Co",      sub:"Since 1971",                             logo:"/logos/koenderink.png",        bg:"#1a2744" },
  { id:"vdm",          name:"VDM Bonaire",          sub:"",                                       logo:"/logos/vdm.png",               bg:"#fff"    },
  { id:"tulum",        name:"Tulum Summer Wear",    sub:"Kralendijk",                             logo:"/logos/tulum.png",             bg:"#fff"    },
  { id:"panadero",     name:"Panadero Trading",     sub:"",                                       logo:"/logos/panadero.png",          bg:"#fff"    },
  { id:"tafelheer",    name:"De Tafelheer",         sub:"Horecabenodigdheden · Bonaire",          logo:"/logos/tafelheer.png",         bg:"#fff"    },
  { id:"topdog",       name:"TopDog Food",          sub:"+599 786-1744",                          logo:"/logos/topdog.png",            bg:"#fff"    },
  { id:"rmd",          name:"RMD",                  sub:"Advies en Ontwikkeling",                 logo:"/logos/rmd.jpg",               bg:"#fff"    },
  { id:"wave",         name:"Wave & Wheels",        sub:"Watersports · Bike Rental · Clothing",   logo:"/logos/wafewheel.jpg",         bg:"#fff"    },
  { id:"bon",          name:"BON Container",        sub:"Services & Storage BV",                  logo:"/logos/bon.jpg",               bg:"#fff"    },
  { id:"changes",      name:"Changes",              sub:"",                                       logo:"/logos/changes.jpg",           bg:"#fff"    },
  { id:"winefactory",  name:"The Wine Factory",     sub:"Wines & Spirits · Bonaire",              logo:"/logos/winefactory_black.jpg", bg:"#fff"    },
  { id:"pcelectronics",name:"PC Electronics",       sub:"Home & Electronics",                     logo:"/logos/pcelectronics.jpg",     bg:"#fff"    },
  { id:"augustaice",   name:"Augusta Ice Service",  sub:"Bonaire",                                logo:"/logos/augustaice.jpg",        bg:"#fff"    },
  { id:"unitedweare",  name:"United We Are",        sub:"",                                       logo:"/logos/unitedweare.jpg",       bg:"#fff"    },
  { id:"macaroca",     name:"Maçaroca",             sub:"Madeira Bar Restaurant by Hilltop",      logo:"/logos/macaroca.jpg",          bg:"#fff"    },
  { id:"lacantina",    name:"La Cantina",           sub:"Cerveceria",                             logo:"/logos/lacantina.jpg",         bg:"#fff"    },
  { id:"cleanfeeling", name:"Clean Feeling",        sub:"Uw gedekte tafel specialist",            logo:"/logos/cleanfeeling.jpg",      bg:"#fff"    },
  { id:"phb",          name:"Pickup Huren Bonaire", sub:"",                                       logo:"/logos/phb.jpg",               bg:"#fff"    },
  { id:"harbourtown",  name:"Harbourtown",          sub:"Real Estate Bonaire",                     logo:"/logos/harbourtown.png",       bg:"#fff"    },
  { id:"crooijflipse", name:"Crooij & Flipse",      sub:"",                                        logo:"/logos/crooijflipse.jpg",      bg:"#000"    },
  { id:"kooyman",      name:"Kooyman",              sub:"Building Materials & Hardware",            logo:"/logos/kooyman.jpg",           bg:"#1cb054" },
  { id:"wheretobonaire",name:"Where To Bonaire",    sub:"Your guide to the island",                logo:"/logos/wheretobonaire.jpg",    bg:"#fff"    },
  { id:"wooddesign",   name:"Wood Design",          sub:"",                                        logo:"/logos/wooddesign.jpg",        bg:"#fff"    },
  { id:"cargoregency", name:"Cargo Regency",        sub:"",                                        logo:"/logos/cargoregency.jpg",      bg:"#111"    },
  { id:"palmboats",    name:"Palm Boats",           sub:"Bonaire",                                 logo:"/logos/palmboats.jpg",         bg:"#fff"    },
];

function SponsorShowcase({ onClose }) {
  const { evLabel } = useEvt();
  const [idx, setIdx]         = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const SLIDE_MS = 5000;
  const transTimerRef = useRef(null);

  // Cleanup transition timer on unmount to prevent setState on dead component
  useEffect(() => () => { if (transTimerRef.current) clearTimeout(transTimerRef.current); }, []);

  const advance = (next) => {
    setLeaving(true);
    transTimerRef.current = setTimeout(() => {
      setIdx(next);
      setAnimKey(k => k+1);
      setLeaving(false);
    }, 350);
  };

  useEffect(() => {
    const iv = setInterval(() => advance((idx + 1) % SPONSORS_LIST.length), SLIDE_MS);
    return () => clearInterval(iv);
  }, [idx]);

  const s = SPONSORS_LIST[idx];

  return createPortal(
    <div style={{position:"fixed",inset:0,zIndex:10000,background:"#050505",display:"flex",flexDirection:"column",overflow:"hidden",userSelect:"none"}}>

      {/* Stadium light beam from top */}
      <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",
        width:"70%",height:"65%",
        background:"radial-gradient(ellipse at top,rgba(212,175,55,.07) 0%,transparent 70%)",
        pointerEvents:"none"}}/>

      {/* Subtle grid lines background */}
      <div style={{position:"absolute",inset:0,
        backgroundImage:"linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px)",
        backgroundSize:"40px 40px",pointerEvents:"none"}}/>

      {/* Floating gold particles */}
      {[...Array(16)].map((_,i) => (
        <div key={`p-${animKey}-${i}`} style={{
          position:"absolute",
          width: i%4===0 ? 3 : i%3===0 ? 2 : 1.5,
          height: i%4===0 ? 3 : i%3===0 ? 2 : 1.5,
          borderRadius:"50%",
          background: i%3===0 ? "rgba(212,175,55,.7)" : "rgba(255,255,255,.25)",
          left:`${5+(i*6.1)%90}%`,
          top:`${8+(i*11.3)%84}%`,
          animation:`scPart ${2.5+i*0.22}s ease-in-out ${i*0.12}s infinite alternate`,
          pointerEvents:"none",
        }}/>
      ))}

      {/* ── MAIN SLIDE ── */}
      <div style={{
        flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        padding:"60px 24px 80px",gap:0,
        opacity: leaving ? 0 : 1,
        transform: leaving ? "scale(.96) translateY(10px)" : "scale(1) translateY(0)",
        transition:"opacity .35s ease, transform .35s ease",
      }}>

        {/* TOP LABEL */}
        <div key={`lbl-${animKey}`} style={{
          fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:4,
          color:"#d4af37",marginBottom:20,
          animation:"scFadeUp .6s .1s both",
        }}>
          PROUD SPONSOR · EL MUNDO {evLabel}
        </div>

        {/* LOGO CARD — full width, tall */}
        <div key={`logo-${animKey}`} style={{
          width:"100%",maxWidth:340,height:200,
          background:"#fff",borderRadius:24,
          display:"flex",alignItems:"center",justifyContent:"center",
          padding:"20px 28px",position:"relative",overflow:"hidden",
          boxShadow:"0 0 0 1px rgba(212,175,55,.2), 0 30px 80px rgba(0,0,0,.8), 0 0 80px rgba(212,175,55,.08)",
          animation:"scLogoIn .7s cubic-bezier(.22,1,.36,1) both",
        }}>
          <img src={s.logo} alt={s.name}
            style={{maxWidth:"100%",maxHeight:150,objectFit:"contain",display:"block"}}/>
          {/* Gold corner accents */}
          <div style={{position:"absolute",top:12,left:12,width:16,height:16,
            borderTop:"2px solid rgba(212,175,55,.4)",borderLeft:"2px solid rgba(212,175,55,.4)",borderRadius:"2px 0 0 0"}}/>
          <div style={{position:"absolute",top:12,right:12,width:16,height:16,
            borderTop:"2px solid rgba(212,175,55,.4)",borderRight:"2px solid rgba(212,175,55,.4)",borderRadius:"0 2px 0 0"}}/>
          <div style={{position:"absolute",bottom:12,left:12,width:16,height:16,
            borderBottom:"2px solid rgba(212,175,55,.4)",borderLeft:"2px solid rgba(212,175,55,.4)",borderRadius:"0 0 0 2px"}}/>
          <div style={{position:"absolute",bottom:12,right:12,width:16,height:16,
            borderBottom:"2px solid rgba(212,175,55,.4)",borderRight:"2px solid rgba(212,175,55,.4)",borderRadius:"0 0 2px 0"}}/>
          {/* Shimmer */}
          <div style={{
            position:"absolute",inset:0,
            background:"linear-gradient(105deg,transparent 35%,rgba(255,255,255,.55) 50%,transparent 65%)",
            animation:"scShimmer 1s .3s ease forwards",transform:"translateX(-100%)",
            pointerEvents:"none",
          }}/>
        </div>

        {/* GOLD DIVIDER LINE */}
        <div key={`div-${animKey}`} style={{
          height:1,background:"linear-gradient(90deg,transparent,#d4af37,transparent)",
          width:0,marginTop:28,
          animation:"scLineGrow .7s .5s forwards",
        }}/>

        {/* SPONSOR NAME — HUGE */}
        <div key={`name-${animKey}`} style={{
          fontFamily:"'Anton',sans-serif",
          fontSize: s.name.length > 14 ? 34 : s.name.length > 10 ? 42 : 52,
          letterSpacing:1,color:"#fff",textAlign:"center",lineHeight:1,
          marginTop:20,padding:"0 8px",
          animation:"scFadeUp .6s .55s both",
          textShadow:"0 0 40px rgba(255,255,255,.15)",
        }}>
          {s.name}
        </div>

        {/* SUBTITLE */}
        {s.sub && (
          <div key={`sub-${animKey}`} style={{
            fontFamily:"'Outfit',sans-serif",fontSize:14,fontWeight:500,
            color:"rgba(255,255,255,.5)",marginTop:8,textAlign:"center",
            animation:"scFadeUp .6s .7s both",letterSpacing:.5,
          }}>
            {s.sub}
          </div>
        )}

        {/* COUNTER */}
        <div key={`cnt-${animKey}`} style={{
          fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:5,
          color:"rgba(255,255,255,.2)",marginTop:24,
          animation:"scFadeUp .5s .8s both",
        }}>
          {String(idx+1).padStart(2,"0")} — {String(SPONSORS_LIST.length).padStart(2,"0")}
        </div>
      </div>

      {/* ── BOTTOM UI ── */}
      {/* Dot nav */}
      <div style={{position:"absolute",bottom:44,left:0,right:0,display:"flex",justifyContent:"center",gap:6,zIndex:5}}>
        {SPONSORS_LIST.map((_,i) => (
          <div key={i} onClick={()=>advance(i)} style={{
            width: i===idx ? 22 : 6, height:6, borderRadius:3,
            background: i===idx ? "#d4af37" : "rgba(255,255,255,.18)",
            transition:"all .35s cubic-bezier(.34,1.56,.64,1)",cursor:"pointer",
          }}/>
        ))}
      </div>

      {/* Gold progress bar */}
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:"rgba(255,255,255,.04)"}}>
        <div key={`bar-${animKey}`} style={{
          height:"100%",
          background:"linear-gradient(90deg,#b8962e,#f5e27d,#b8962e)",
          animation:`scProgress ${SLIDE_MS}ms linear forwards`,width:"0%",
        }}/>
      </div>

      {/* Close */}
      <button onClick={onClose} style={{
        position:"absolute",top:48,right:16,zIndex:20,
        background:"rgba(0,0,0,.6)",border:"1px solid rgba(255,255,255,.15)",
        color:"rgba(255,255,255,.6)",borderRadius:20,padding:"7px 18px",
        fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,cursor:"pointer",
        backdropFilter:"blur(8px)",
      }}>✕ CLOSE</button>

      {/* Top left label */}
      <div style={{position:"absolute",top:52,left:18,
        fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:4,color:"rgba(255,255,255,.18)"}}>
        OUR SPONSORS
      </div>

      {/* Prev / Next arrows */}
      {[{dir:-1,side:"left",pos:16},{dir:1,side:"right",pos:16}].map(({dir,side,pos})=>(
        <button key={side} onClick={()=>advance((idx+dir+SPONSORS_LIST.length)%SPONSORS_LIST.length)} style={{
          position:"absolute",[side]:pos,top:"50%",transform:"translateY(-50%)",
          background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",
          color:"rgba(255,255,255,.5)",borderRadius:12,width:36,height:52,
          fontFamily:"'Anton',sans-serif",fontSize:18,cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",
          backdropFilter:"blur(4px)",transition:"all .2s",zIndex:5,
        }}>{dir===-1?"‹":"›"}</button>
      ))}

      <style>{`
        @keyframes scLogoIn {
          from { opacity:0; transform:scale(.82) translateY(24px); }
          to   { opacity:1; transform:scale(1)   translateY(0);    }
        }
        @keyframes scFadeUp {
          from { opacity:0; transform:translateY(20px); filter:blur(6px); }
          to   { opacity:1; transform:translateY(0);    filter:blur(0);   }
        }
        @keyframes scLineGrow {
          from { width:0;    opacity:0; }
          to   { width:180px; opacity:1; }
        }
        @keyframes scShimmer {
          from { transform:translateX(-100%); }
          to   { transform:translateX(200%);  }
        }
        @keyframes scPart {
          from { transform:translateY(0) scale(1);    opacity:.2; }
          to   { transform:translateY(-22px) scale(1.5); opacity:.8; }
        }
        @keyframes scProgress {
          from { width:0%;   }
          to   { width:100%; }
        }
      `}</style>
    </div>,
    document.body
  );
}

function SponsorsSection() {
  const { evLabel } = useEvt();
  const [showShowcase, setShowShowcase] = useState(false);
  return (
    <div style={{marginTop:16,paddingBottom:8}}>
      {showShowcase && <SponsorShowcase onClose={()=>setShowShowcase(false)}/>}
      {/* Header */}
      <div style={{padding:"24px 16px 0",textAlign:"center"}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:5,color:"rgba(255,255,255,.3)",marginBottom:10}}>
          {evLabel} · EL MUNDO BONAIRE
        </div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:26,letterSpacing:2,color:"#fff",marginBottom:6}}>
          OUR SPONSORS
        </div>
        <div style={{width:40,height:1.5,background:"linear-gradient(90deg,transparent,#d4af37,transparent)",margin:"0 auto 12px"}}/>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.4)",lineHeight:1.5}}>
          Thank you to all our amazing partners who made this event possible
        </div>
      </div>

      {/* Showcase button */}
      <div style={{padding:"16px 16px 0",textAlign:"center"}}>
        <button onClick={()=>setShowShowcase(true)} style={{
          width:"100%",padding:"15px 0",
          background:"linear-gradient(135deg,#d4af37,#f5e27d,#d4af37)",
          backgroundSize:"200% 100%",
          border:"none",borderRadius:12,cursor:"pointer",
          fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:3,color:"#000",
          boxShadow:"0 4px 24px rgba(212,175,55,.3)",
          transition:"opacity .2s, transform .2s",
          animation:"showcaseBtnShine 3s linear infinite",
        }}>
          ▶ WATCH SPONSOR SHOWCASE
        </button>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.25)",marginTop:6}}>
          Cinematic tribute to our partners
        </div>
      </div>

      {/* Grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"20px 14px 8px"}}>
        {SPONSORS_LIST.map(s => (
          <div key={s.id} style={{
            borderRadius:14,
            overflow:"hidden",
            border:"1px solid rgba(255,255,255,.06)",
            background:"rgba(255,255,255,.03)",
            display:"flex",flexDirection:"column",
          }}>
            {/* Logo area */}
            <div style={{
              background:s.bg,
              padding:"18px 12px",
              display:"flex",alignItems:"center",justifyContent:"center",
              minHeight:90,
            }}>
              <img
                src={s.logo} alt={s.name}
                style={{maxWidth:"100%",maxHeight:70,objectFit:"contain",display:"block"}}
                onError={e => { e.target.style.display="none"; }}
              />
            </div>
            {/* Name area */}
            <div style={{padding:"10px 12px 12px",background:"rgba(255,255,255,.02)"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:.5,color:"#fff",marginBottom:s.sub?3:0}}>
                {s.name}
              </div>
              {s.sub && (
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.35)",lineHeight:1.3}}>
                  {s.sub}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer thank you */}
      <div style={{margin:"16px 14px 0",padding:"16px",background:"rgba(212,175,55,.05)",border:"1px solid rgba(212,175,55,.12)",borderRadius:12,textAlign:"center"}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:3,color:"#d4af37",marginBottom:6}}>
          ⚽ PROUD PARTNERS OF EL MUNDO
        </div>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.35)",lineHeight:1.5}}>
          Interested in sponsoring? Contact us at<br/>
          <span style={{color:"rgba(255,255,255,.6)"}}>www.elmundobonaire.com</span>
        </div>
      </div>
    </div>
  );
}


/* ═══ WALLET MODAL ══════════════════════════════════════════════════════════ */
function WalletModal({ user, myCredits, onClose, onToast = () => {} }) {
  const [historyView, setHistoryView] = useState(false);
  const [txHistory,   setTxHistory]   = useState([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [redeemOpen,  setRedeemOpen]  = useState(false);
  const [recent,      setRecent]      = useState([]);

  // Quick activity preview
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from("credit_transactions")
          .select("amount,new_balance,created_at")
          .eq("target_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(4);
        if (!cancelled && data) setRecent(data);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user.id, myCredits]);

  const loadHistory = async () => {
    setLoadingHist(true);
    try {
      const { data } = await supabase.from("credit_transactions")
        .select("amount,new_balance,created_at,admin_id")
        .eq("target_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40);
      setTxHistory(data || []);
    } catch {}
    setLoadingHist(false);
  };

  const openHistory = () => { setHistoryView(true); loadHistory(); };

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const playerNum = user.player_number ? String(user.player_number).padStart(4, "0") : "0000";

  return (
    <div className="wmodal-root" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wmodal-frame">
        <button className="wmodal-close" onClick={onClose} aria-label="Close wallet">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        {!historyView ? (
          <div className="wmodal-body">
            {/* ── CREDIT CARD ── */}
            <div className="wallet-cc">
              <div className="wallet-cc-glow" />
              <div className="wallet-cc-shine" />
              <div className="wallet-cc-grid" />

              <div className="wallet-cc-top">
                <div className="wallet-cc-brand">EL MUNDO</div>
                <div className="wallet-cc-brand-sub">WALLET</div>
              </div>

              <div className="wallet-cc-chip">
                <div className="wallet-cc-chip-inner">
                  <div className="wallet-cc-chip-line" />
                  <div className="wallet-cc-chip-line" />
                  <div className="wallet-cc-chip-line" />
                </div>
              </div>

              <div className="wallet-cc-amount-block">
                <div className="wallet-cc-amount-lbl">BALANCE</div>
                <div className="wallet-cc-amount">
                  <span className="wallet-cc-currency">$</span>{(+myCredits).toFixed(2)}
                </div>
              </div>

              <div className="wallet-cc-bottom">
                <div className="wallet-cc-bottom-l">
                  <div className="wallet-cc-mini">CARDHOLDER</div>
                  <div className="wallet-cc-name">{(user.name || "").toUpperCase()}</div>
                </div>
                <div className="wallet-cc-bottom-r">
                  <div className="wallet-cc-mini">PLAYER</div>
                  <div className="wallet-cc-num">#{playerNum}</div>
                </div>
              </div>
            </div>

            {/* ── ADD GIFT CARD ── */}
            <button className="wallet-add-btn" onClick={() => setRedeemOpen(true)}>
              <span className="wallet-add-btn-icon">🎁</span>
              <span className="wallet-add-btn-text">
                <span className="wallet-add-btn-title">ADD GIFT CARD CODE</span>
                <span className="wallet-add-btn-sub">Top up your balance instantly</span>
              </span>
              <svg className="wallet-add-btn-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* ── ACTIVITY PREVIEW ── */}
            <div className="wallet-section-hd">
              <span>RECENT ACTIVITY</span>
              {recent.length > 0 && (
                <button className="wmodal-history-link" onClick={openHistory}>VIEW ALL →</button>
              )}
            </div>
            {recent.length === 0 ? (
              <div className="wallet-empty">
                <div className="wallet-empty-icon">📋</div>
                <div className="wallet-empty-text">No transactions yet</div>
              </div>
            ) : (
              <div className="wallet-tx-list">
                {recent.map((tx, i) => {
                  const isPositive = +tx.amount >= 0;
                  return (
                    <div key={i} className="wallet-tx-row">
                      <div className={`wallet-tx-icon ${isPositive ? "wallet-tx-icon-pos" : "wallet-tx-icon-neg"}`}>
                        {isPositive ? "↑" : "↓"}
                      </div>
                      <div className="wallet-tx-mid">
                        <div className="wallet-tx-title">{isPositive ? "Top up" : "Order"}</div>
                        <div className="wallet-tx-when">
                          {tx.created_at ? new Date(tx.created_at).toLocaleString("en-US", {
                            month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
                          }) : ""}
                        </div>
                      </div>
                      <div className="wallet-tx-right">
                        <div className={`wallet-tx-amt ${isPositive ? "wallet-tx-amt-pos" : "wallet-tx-amt-neg"}`}>
                          {(isPositive ? "+" : "−") + "$" + Math.abs(+tx.amount).toFixed(2)}
                        </div>
                        <div className="wallet-tx-bal">${(+tx.new_balance).toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ── HISTORY VIEW ── */
          <div className="wmodal-body">
            <div className="wmodal-history-hd">
              <button className="wmodal-history-back" onClick={() => setHistoryView(false)}>← BACK</button>
              <div className="wmodal-history-title">FULL HISTORY</div>
            </div>
            <div className="wmodal-history-list">
              {loadingHist && <div className="wallet-empty"><div className="wallet-empty-text">Loading…</div></div>}
              {!loadingHist && txHistory.length === 0 && (
                <div className="wallet-empty">
                  <div className="wallet-empty-icon">📋</div>
                  <div className="wallet-empty-text">No transactions yet</div>
                </div>
              )}
              {!loadingHist && txHistory.length > 0 && (
                <div className="wallet-tx-list">
                  {txHistory.map((tx, i) => {
                    const isPositive = +tx.amount >= 0;
                    return (
                      <div key={i} className="wallet-tx-row">
                        <div className={`wallet-tx-icon ${isPositive ? "wallet-tx-icon-pos" : "wallet-tx-icon-neg"}`}>
                          {isPositive ? "↑" : "↓"}
                        </div>
                        <div className="wallet-tx-mid">
                          <div className="wallet-tx-title">{isPositive ? "Top up" : "Order"}</div>
                          <div className="wallet-tx-when">
                            {tx.created_at ? new Date(tx.created_at).toLocaleString("en-US", {
                              month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
                            }) : ""}
                          </div>
                        </div>
                        <div className="wallet-tx-right">
                          <div className={`wallet-tx-amt ${isPositive ? "wallet-tx-amt-pos" : "wallet-tx-amt-neg"}`}>
                            {(isPositive ? "+" : "−") + "$" + Math.abs(+tx.amount).toFixed(2)}
                          </div>
                          <div className="wallet-tx-bal">${(+tx.new_balance).toFixed(2)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {redeemOpen && (
        <RedeemGiftCardSheet onClose={() => setRedeemOpen(false)} onToast={onToast} />
      )}
    </div>
  );
}

/* ═══ PROFILE ═══════════════════════════════════════════════════════════════ */
function ProfileView({ user, myPts, myRank, myCredits = 0, preds, matches, sponsors, onAvatarUpdate, gifts = [], onOpenGifts = ()=>{}, appSettings = {}, board = [], onToast = ()=>{} }) {
  const [showRecap, setShowRecap] = useState(false);
  const fin  = matches.filter(m => m.status==="finished");
  const sub  = fin.filter(m => !!preds[`${user.id}__${m.id}`]).length;
  const corr = fin.filter(m => { const p=preds[`${user.id}__${m.id}`]; return p&&p.h===m.hs&&p.a===m.as; }).length;
  const acc  = sub>0 ? Math.round(corr/sub*100) : 0;

  // Hero rolling counters — tween from 0 on mount, then track live values
  const aPts  = useAnimatedNumber(myPts, 1200);
  const aRank = useAnimatedNumber(myRank > 0 ? myRank : 0, 900);
  const aCorr = useAnimatedNumber(corr, 900);
  const aAcc  = useAnimatedNumber(acc, 900);

  // ── Streak calculation ─────────────────────────────────────────────────
  const finSorted = [...fin].sort((a,b) => new Date(a.kickoff||a.date||0) - new Date(b.kickoff||b.date||0));
  // Current streak: walk backwards from most recent finished match
  let currentStreak = 0;
  for (let i = finSorted.length - 1; i >= 0; i--) {
    const p = preds[`${user.id}__${finSorted[i].id}`];
    if (!p) break;
    if (calcPts(p, finSorted[i].hs, finSorted[i].as) > 0) currentStreak++;
    else break;
  }
  // Best streak ever
  let bestStreak = 0, tmp = 0;
  for (const m of finSorted) {
    const p = preds[`${user.id}__${m.id}`];
    if (p && calcPts(p, m.hs, m.as) > 0) { tmp++; bestStreak = Math.max(bestStreak, tmp); }
    else tmp = 0;
  }
  const [uploading, setUploading] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [cardUrl, setCardUrl] = useState(null);
  const [generatingCard, setGeneratingCard] = useState(false);

  const generateCard = async () => {
    setGeneratingCard(true);
    try {
      await document.fonts.ready;
      const W = 1080, H = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      const ACCENT = '#ffffff'; const ACCENT2 = 'rgba(255,255,255,0.7)';
      const rr = (x,y,w,h,r) => { ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath(); };

      // ── Background ──
      ctx.fillStyle = '#050505'; ctx.fillRect(0,0,W,H);
      // Center radial glow
      const bgGrd = ctx.createRadialGradient(W/2,H*0.42,0,W/2,H*0.42,W*0.6);
      bgGrd.addColorStop(0,'rgba(255,255,255,0.04)'); bgGrd.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = bgGrd; ctx.fillRect(0,0,W,H);
      // Dot grid
      ctx.fillStyle = 'rgba(255,255,255,0.022)';
      for(let x=30;x<W;x+=50) for(let y=30;y<H;y+=50){ ctx.beginPath(); ctx.arc(x,y,1.8,0,Math.PI*2); ctx.fill(); }

      // ── Accent lines helper ──
      const goldLine = (y2) => {
        const g = ctx.createLinearGradient(60,0,W-60,0);
        g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(0.25,ACCENT2); g.addColorStop(0.75,ACCENT2); g.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(60, y2, W-120, 1.5);
      };

      // ── Header ──
      goldLine(90);
      ctx.textAlign='center'; ctx.fillStyle=ACCENT; ctx.font='36px Anton';
      ctx.fillText('EL MUNDO BAR-REST', W/2, 75);
      goldLine(98);

      // ── Avatar ──
      const AX = W/2, AY = 350, AR = 150;
      // Outer glow ring
      const ringGrd = ctx.createLinearGradient(AX-AR,AY-AR,AX+AR,AY+AR);
      ringGrd.addColorStop(0,ACCENT); ringGrd.addColorStop(0.5,'#e8e8e8'); ringGrd.addColorStop(1,ACCENT2);
      ctx.strokeStyle = ringGrd; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(AX,AY,AR+10,0,Math.PI*2); ctx.stroke();
      // Inner dark ring
      ctx.strokeStyle='rgba(5,5,5,0.9)'; ctx.lineWidth=4;
      ctx.beginPath(); ctx.arc(AX,AY,AR+3,0,Math.PI*2); ctx.stroke();
      // Avatar clip
      ctx.save(); ctx.beginPath(); ctx.arc(AX,AY,AR,0,Math.PI*2); ctx.clip();
      if(user.avatar_url) {
        try {
          const img = new Image(); img.crossOrigin='anonymous';
          await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=user.avatar_url+'?t=card'; });
          ctx.drawImage(img, AX-AR, AY-AR, AR*2, AR*2);
        } catch {
          ctx.fillStyle='#1a1a1a'; ctx.fillRect(AX-AR,AY-AR,AR*2,AR*2);
          ctx.fillStyle='#fff'; ctx.font=`${AR}px Anton`; ctx.textBaseline='middle';
          ctx.fillText((user.name||'?')[0].toUpperCase(),AX,AY); ctx.textBaseline='alphabetic';
        }
      } else {
        ctx.fillStyle='#1a1a1a'; ctx.fillRect(AX-AR,AY-AR,AR*2,AR*2);
        ctx.fillStyle='#fff'; ctx.font=`${AR}px Anton`; ctx.textBaseline='middle';
        ctx.fillText((user.name||'?')[0].toUpperCase(),AX,AY); ctx.textBaseline='alphabetic';
      }
      ctx.restore();

      // ── Player name ──
      ctx.textAlign='center'; ctx.textBaseline='alphabetic'; ctx.fillStyle='#fff';
      const nameStr = (user.name||'').toUpperCase();
      // Auto-size name to fit
      let nameSz = 84;
      ctx.font = `${nameSz}px Anton`;
      while(ctx.measureText(nameStr).width > W-180 && nameSz > 40) { nameSz -= 4; ctx.font=`${nameSz}px Anton`; }
      ctx.fillText(nameStr, W/2, 560);

      // ── Rank chip ──
      if(myRank > 0) {
        const chip = `RANK  #${myRank}`;
        ctx.font = '26px Anton';
        const chipW = ctx.measureText(chip).width + 40;
        const chipX = W/2 - chipW/2, chipY = 576, chipH = 40;
        rr(chipX,chipY,chipW,chipH,6);
        ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
        ctx.fillStyle = ACCENT; ctx.fillText(chip, W/2, chipY+chipH-9);
      }

      // ── Stats row ──
      const SY = 668, SH = 130;
      const stats = [
        {v: myPts===0?'—':myPts, l:'POINTS'},
        {v: myRank>0?`#${myRank}`:'—', l:'RANK'},
        {v: sub>0?`${corr}/${sub}`:'—', l:'CORRECT'},
        {v: sub>0?`${acc}%`:'—', l:'ACCURACY'},
      ];
      const statW = (W - 120) / 4;
      stats.forEach((s,i) => {
        const sx = 60 + i*statW;
        rr(sx+6, SY, statW-12, SH, 10);
        ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,0.1)'; ctx.lineWidth=1; ctx.stroke();
        ctx.fillStyle='#fff'; ctx.font=`60px Anton`; ctx.textAlign='center';
        ctx.fillText(String(s.v), sx+statW/2, SY+76);
        ctx.fillStyle='rgba(255,255,255,0.38)'; ctx.font='20px Anton';
        ctx.fillText(s.l, sx+statW/2, SY+108);
      });

      // ── Middle divider ──
      goldLine(838);

      // ── Bottom ──
      ctx.textAlign='center';
      ctx.fillStyle='#fff'; ctx.font='58px Anton';
      ctx.fillText(getEventLabel(), W/2, 910);
      ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='26px Anton';
      ctx.fillText('PREDICTION GAME  ·  EL MUNDO BONAIRE', W/2, 950);
      // URL
      ctx.fillStyle=ACCENT; ctx.font='28px Anton';
      ctx.fillText('elmundo-world-cup.com', W/2, 1006);

      // Bottom border line
      goldLine(H-52);

      // ── Watermark player number ──
      if(user.player_number) {
        ctx.fillStyle='rgba(255,255,255,0.07)'; ctx.font='200px Anton'; ctx.textAlign='right';
        ctx.fillText(`#${user.player_number}`, W-20, H-60);
      }

      // Convert to blob URL
      const blob = await new Promise(res => canvas.toBlob(res,'image/jpeg',0.94));
      const url = URL.createObjectURL(blob);
      if(cardUrl) URL.revokeObjectURL(cardUrl);
      setCardUrl(url);
      setShowShareCard(true);
    } catch(e) { console.error('Card failed',e); alert('Could not generate card: '+e.message); }
    finally { setGeneratingCard(false); }
  };

  const handleShare = async () => {
    if(!cardUrl) return;
    if(navigator.share && navigator.canShare) {
      try {
        const res = await fetch(cardUrl);
        const blob = await res.blob();
        const file = new File([blob], `${(user.name||'player').replace(/\s+/g,'-')}-elmundo-card.jpg`, {type:'image/jpeg'});
        if(navigator.canShare({files:[file]})) {
          await navigator.share({ files:[file], title:`Join the El Mundo ${appSettings.eventName||"World Cup"} Predictor!`, text:`I'm playing the ${appSettings.eventName||"World Cup"} ${appSettings.eventYear||2026} Prediction Game at El Mundo, Bonaire! Join me 👉 elmundo-world-cup.com` });
          return;
        }
      } catch {}
    }
    // Fallback: download
    const a = document.createElement('a');
    a.href = cardUrl; a.download = `${(user.name||'player').replace(/\s+/g,'-')}-elmundo-card.jpg`;
    a.click();
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("File too large — max 10MB"); e.target.value = ""; return; }
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const path = `${user.id}.jpg`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const urlWithBust = `${publicUrl}?t=${Date.now()}`;
      await supabase.from("profiles").update({ avatar_url: urlWithBust }).eq("id", user.id);
      onAvatarUpdate?.(urlWithBust);
    } catch(err) {
      console.error("Avatar upload failed", err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="prof-wrap">

      {/* ── WALLET MODAL ── */}
      {showWallet && <WalletModal user={user} myCredits={myCredits} onClose={() => setShowWallet(false)} onToast={onToast} />}

      {/* ── SHARE CARD MODAL ── */}
      {showShareCard && cardUrl && (
        <div className="sc-overlay" onClick={e=>{if(e.target===e.currentTarget)setShowShareCard(false)}}>
          <div className="sc-modal">
            <button className="sc-close" onClick={()=>setShowShareCard(false)}>✕</button>
            <div className="sc-title">YOUR PLAYER CARD</div>
            <div className="sc-sub">Share it to invite friends to the game</div>
            <img src={cardUrl} className="sc-preview" alt="Player card"/>
            <div className="sc-actions">
              <button className="sc-share-btn" onClick={handleShare}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                SHARE / DOWNLOAD
              </button>
            </div>
            <div className="sc-hint">Long-press the image to save it directly</div>
          </div>
        </div>
      )}

      <div className="prof-hero">

        {/* ── Wallet button — top-left ── */}
        <button onClick={() => setShowWallet(true)} style={{position:"absolute",top:14,left:14,background:"none",border:"none",padding:0,cursor:"pointer",zIndex:2}} title="My Wallet">
          {/* Mini credit card */}
          <div style={{width:62,height:42,borderRadius:7,background:"linear-gradient(135deg,#15803d 0%,#22c55e 55%,#14532d 100%)",position:"relative",overflow:"hidden",boxShadow:"0 3px 12px rgba(0,0,0,.45)",transition:"transform .15s"}}>
            {/* Shine sweep */}
            <div style={{position:"absolute",inset:0,background:"linear-gradient(110deg,transparent 30%,rgba(255,255,255,.18) 50%,transparent 70%)",animation:"cardShine 4s ease-in-out infinite",pointerEvents:"none"}} />
            {/* EM mark */}
            <div style={{position:"absolute",top:6,left:7,fontFamily:"'Anton',sans-serif",fontSize:7,letterSpacing:1,color:"rgba(255,255,255,.8)"}}>EM</div>
            {/* Gold chip */}
            <div style={{position:"absolute",top:6,right:7,width:11,height:8,borderRadius:1.5,background:"linear-gradient(135deg,#fbbf24,#d97706)",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}} />
            {/* Mag stripe */}
            <div style={{position:"absolute",bottom:8,left:0,right:0,height:5,background:"rgba(0,0,0,.35)"}} />
          </div>
          {/* Balance pill */}
          <div style={{position:"absolute",top:-7,right:-6,background:"#16a34a",border:"1.5px solid #fff",borderRadius:10,padding:"1px 5px",fontFamily:"'Anton',sans-serif",fontSize:8,color:"#fff",letterSpacing:0.5,whiteSpace:"nowrap",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}}>
            ${(+myCredits).toFixed(2)}
          </div>
        </button>

        <div className="prof-av-wrap">
          {user.avatar_url
            ? <img src={user.avatar_url} className="prof-av-img" alt="avatar" />
            : <div className="prof-av">{(user.name||"?")[0].toUpperCase()}</div>
          }
          <label className="prof-av-upload" title="Change photo">
            {uploading ? "…" : "📷"}
            <input type="file" accept="image/*" style={{display:"none"}} onChange={handleAvatarChange} />
          </label>
        </div>
        <div className="prof-name">{user.name}</div>
        <div className="prof-detail">{user.email}</div>
        <div className="prof-detail">{user.phone}</div>
        {myRank===1 && <div className="prof-leader-badge">👑 LEADING THE TOURNAMENT</div>}
      </div>

      {/* Player number — prominent card */}
      {user.player_number && (
        <div className="player-num-card">
          <div className="player-num-label">YOUR PLAYER NUMBER</div>
          <div className="player-num-value">#{user.player_number}</div>
          <div className="player-num-hint">🏧 Visit any Top-Up Desk and give this number to the staff — they'll add credits to your account instantly.</div>
        </div>
      )}


<div className="stats-grid">
        {[
          {v:Math.round(aPts),                          u:"PTS",     l:"Total Points"},
          {v:myRank>0 ? `#${Math.round(aRank)||myRank}` : "—", u:"", l:"Your Rank"},
          {v:Math.round(aCorr),                         u:`/${sub}`, l:"Correct"},
          {v:Math.round(aAcc),                          u:"%",       l:"Accuracy"},
        ].map(s => (
          <div key={s.l} className="scard">
            <div className="sval">{s.v}<span className="sunit">{s.u}</span></div>
            <div className="slbl">{s.l}</div>
          </div>
        ))}
      </div>

      {/* ── Streak card — only show once there are finished matches ── */}
      {finSorted.length > 0 && (
        <div className="streak-card">
          <div className="streak-flame">{currentStreak >= 3 ? "🔥" : currentStreak > 0 ? "⚡" : "💤"}</div>
          <div className="streak-info">
            <div className="streak-num">{currentStreak}</div>
            <div className="streak-label">
              {currentStreak === 0 ? "NO ACTIVE STREAK" : currentStreak === 1 ? "CORRECT IN A ROW" : `CORRECT IN A ROW`}
            </div>
          </div>
          {bestStreak > 0 && (
            <div className="streak-best">
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,color:"rgba(255,255,255,.35)"}}>{bestStreak}</div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:"rgba(255,255,255,.2)",letterSpacing:2}}>BEST</div>
            </div>
          )}
        </div>
      )}
      {/* ── 2026 Recap CTA ── shown when event is closed, or always so users can preview */}
      {matches.filter(m => m.status === "finished").length > 0 && (
        <div className="sc-cta-wrap" style={{marginBottom:0}}>
          <button className="recap-cta-btn" onClick={() => setShowRecap(true)}>
            🎬 MY {appSettings.eventName || "WORLD CUP"} {appSettings.eventYear || 2026} RECAP
          </button>
          <div className="sc-cta-sub">Your season highlights &amp; shareable story card</div>
        </div>
      )}
      {showRecap && (
        <PredictionRecapModal
          user={user} preds={preds} matches={matches} board={board}
          appSettings={appSettings}
          onClose={() => setShowRecap(false)}
        />
      )}

      {/* ── Share Card CTA ── */}
      <div className="sc-cta-wrap">
        <button className="sc-cta-btn" onClick={generateCard} disabled={generatingCard}>
          {generatingCard ? (
            <><span className="sc-cta-spinner"/>GENERATING…</>
          ) : (
            <>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              SHARE MY PLAYER CARD
            </>
          )}
        </button>
        <div className="sc-cta-sub">Generate a card to invite friends to the game</div>
      </div>

      {/* ── MY GIFTS (premium card, opens MyGiftsView) ── */}
      {(() => {
        const unredeemed = gifts.filter(g => !g.redeemed);
        const hasGifts = gifts.length > 0;
        return (
          <div className="gifts-card-v2">
            <div className="gifts-v2-shimmer"/>
            <div className="gifts-v2-inner">
              <div className="gifts-v2-left">
                <div className="gifts-v2-icon-wrap">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="gifts-v2-icon">
                    <polyline points="20 12 20 22 4 22 4 12"/>
                    <rect x="2" y="7" width="20" height="5"/>
                    <line x1="12" y1="22" x2="12" y2="7"/>
                    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
                    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
                  </svg>
                  {unredeemed.length > 0 && <span className="gifts-v2-badge">{unredeemed.length}</span>}
                </div>
                <div className="gifts-v2-text">
                  <div className="gifts-v2-title">MY GIFTS</div>
                  {unredeemed.length > 0 && (
                    <div className="gifts-v2-sub">{unredeemed.length} unopened</div>
                  )}
                </div>
              </div>
              <button className="gifts-v2-open" onClick={onOpenGifts}>
                OPEN
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
        );
      })()}

      <div className="info-card">
        <div className="info-title">⚽ HOW POINTS WORK</div>
        <p className="info-body">Predict the exact final score for each match. Exact score correct earns <strong>5 points</strong>. Correct winner with wrong score earns <strong>1 point</strong>. Draw matches: only exact score earns points. Most points at tournament end wins.</p>
      </div>

      {/* ── MY PREDICTION HISTORY ── */}
      {(() => {
        // All matches sorted newest first — show finished results + upcoming picks
        const allSorted = [...matches].sort((a,b) => new Date(b.kickoff||b.date||0) - new Date(a.kickoff||a.date||0));
        // Matches the user has predicted (any status)
        const predicted = allSorted.filter(m => !!preds[`${user.id}__${m.id}`]);
        // Finished matches without a prediction (missed)
        const missedFin = allSorted.filter(m => m.status==="finished" && !preds[`${user.id}__${m.id}`]);
        // Combine: predicted (all) + missed finished — deduplicate
        const shown = [...predicted, ...missedFin.filter(m => !predicted.find(p => p.id===m.id))].slice(0, 50);

        return (
          <div style={{marginTop:28,marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,paddingLeft:2}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:4,color:"rgba(255,255,255,.5)"}}>MY PREDICTIONS</div>
              {predicted.length > 0 && (
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.25)"}}>
                  {predicted.length} submitted
                </div>
              )}
            </div>

            {shown.length === 0 ? (
              /* Empty state */
              <div style={{textAlign:"center",padding:"28px 16px",background:"rgba(255,255,255,.03)",border:"1px dashed rgba(255,255,255,.1)",borderRadius:12}}>
                <div style={{fontSize:32,marginBottom:10}}>⚽</div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,letterSpacing:2,color:"rgba(255,255,255,.4)",marginBottom:6}}>NO PREDICTIONS YET</div>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.22)",lineHeight:1.6}}>
                  Head to the Matches tab to predict scores.<br/>Your picks will show up here.
                </div>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:420,overflowY:"auto",paddingRight:4}}>
                {shown.map(m => {
                  const k = `${user.id}__${m.id}`;
                  const p = preds[k];
                  const fin = m.status === "finished";
                  const exact  = fin && p && p.h === m.hs && p.a === m.as;
                  const winner = fin && p && !exact && ((p.h > p.a && m.hs > m.as) || (p.h < p.a && m.hs < m.as) || (p.h === p.a && m.hs === m.as));
                  const wrong  = fin && p && !exact && !winner;
                  const missed = fin && !p;
                  const pending = !fin && p;

                  const bg    = exact ? "rgba(240,192,64,.08)" : winner ? "rgba(74,222,128,.06)" : wrong ? "rgba(239,68,68,.05)" : missed ? "rgba(255,255,255,.02)" : "rgba(255,255,255,.03)";
                  const bdr   = exact ? "rgba(240,192,64,.25)" : winner ? "rgba(74,222,128,.18)" : wrong ? "rgba(239,68,68,.16)" : missed ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.09)";
                  const badgeBg = exact ? "rgba(240,192,64,.2)" : winner ? "rgba(74,222,128,.15)" : wrong ? "rgba(239,68,68,.12)" : missed ? "rgba(255,255,255,.05)" : "rgba(99,179,237,.12)";
                  const badgeColor = exact ? "#F0C040" : winner ? "#4ade80" : wrong ? "#f87171" : missed ? "rgba(255,255,255,.25)" : "#63b3ed";
                  const badgeText  = exact ? "+5 ✓" : winner ? "+1 ~" : wrong ? "0 ✗" : missed ? "MISSED" : "PENDING";

                  return (
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:10,background:bg,border:`1px solid ${bdr}`}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:1,color:"rgba(255,255,255,.85)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {m.home} vs {m.away}
                        </div>
                        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.3)",marginTop:2}}>
                          {fin ? `Result: ${m.hs}–${m.as} · ` : (m.date ? `${m.date}${m.time?` · ${m.time}`:""}  · ` : "")}
                          {p ? `Your pick: ${p.h}–${p.a}` : fin ? "No pick submitted" : "Locked in ✓"}
                        </div>
                      </div>
                      <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:1,padding:"4px 10px",borderRadius:20,flexShrink:0,background:badgeBg,color:badgeColor}}>
                        {badgeText}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── PREDICTION JOURNEY ── */}
      <PredictionJourney matches={matches} preds={preds} user={user} />

      {/* ── Zeli rides banner — perfect for profile (heading home after the bar) ── */}
      <ZeliRideCard />

      {/* ── SPONSORS SECTION ── */}
      <SponsorsSection />
    </div>
  );
}

/* ═══ MY GIFTS ═════════════════════════════════════════════════════════════ */
function MyGiftsView({ user, gifts = [], onClose, onToast = ()=>{}, onAddGiftToOrder = null }) {
  const [tab, setTab] = useState("active"); // "active" | "history"
  const [redeeming, setRedeeming] = useState(null);
  const [addedGift, setAddedGift] = useState(null); // brief confirmation after tapping ADD TO ORDER
  const [openedGift, setOpenedGift] = useState(null); // full-screen gift reveal
  const [showInstructions, setShowInstructions] = useState(null); // special gift claim modal

  const active  = gifts.filter(g => !g.redeemed);
  const history = gifts.filter(g => g.redeemed);
  const list = tab === "active" ? active : history;

  /* ── Type helpers ── */
  const isFoodType    = (g) => g.type === "drink_food" || g.type === "item";
  const isSpecialType = (g) => g.type === "special";
  const isCreditsType = (g) => g.type === "credits";

  /* ── Credits: player redeems directly ── */
  const redeemCredits = async (g) => {
    if (redeeming) return;
    setRedeeming(g.id);
    try {
      const { data: cur } = await supabase.from("user_credits").select("balance").eq("user_id", user.id).maybeSingle();
      const newBal = (+(cur?.balance || 0)) + (+g.amount || 0);
      await supabase.from("user_credits").upsert({ user_id: user.id, balance: newBal });
      await supabase.from("gifts").update({ redeemed: true, redeemed_at: new Date().toISOString(), redeemed_by: user.id }).eq("id", g.id);
      onToast(`+$${(+g.amount).toFixed(2)} credits added to your account`);
      try { navigator.vibrate?.([60, 40, 120]); } catch {}
    } catch (err) {
      console.error("Redeem failed", err);
      onToast("Could not redeem — please try again", false);
    } finally {
      setRedeeming(null);
    }
  };

  /* ── Drinks/Food: add to cart → checkout → redeemed when order placed ── */
  const addToOrder = (g) => {
    if (!onAddGiftToOrder) return;
    setAddedGift(g.id);
    setTimeout(() => setAddedGift(null), 1800);
    try { navigator.vibrate?.([40, 20, 60]); } catch {}
    onAddGiftToOrder(g); // navigates to menu tab and closes this overlay
  };

  const dismissOpenedGift = () => setOpenedGift(null);

  // Auto-open the newest unredeemed gift once (premium reveal animation)
  useEffect(() => {
    const latest = active[0];
    if (!latest) return;
    const seenKey = `em_gift_seen_${latest.id}`;
    if (localStorage.getItem(seenKey)) return;
    setOpenedGift(latest);
    try { localStorage.setItem(seenKey, "1"); } catch {}
  }, []); // eslint-disable-line

  /* ── Badge icons — distinct per type ── */
  const giftIcon = (g) => {
    if (isCreditsType(g)) {
      return (
        <div className="gift-card-badge gift-card-badge-credits">
          <img src="/elmundo-logo.png" alt="" className="gift-card-logo"/>
          <div className="gift-card-amount">${(+g.amount || 0).toFixed(2)}</div>
          <div className="gift-card-amount-lbl">CREDITS</div>
        </div>
      );
    }
    if (isFoodType(g)) {
      return (
        <div className="gift-card-badge gift-card-badge-food">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="gift-card-food-ico">
            <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
          </svg>
          <div className="gift-card-food-name">{g.item_name || "FREE ITEM"}</div>
        </div>
      );
    }
    return (
      <div className="gift-card-badge gift-card-badge-special">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="gift-card-special-ico">
          <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>
          <line x1="12" y1="22" x2="12" y2="7"/>
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
        </svg>
        <div className="gift-card-special-name">{g.item_name || "SPECIAL PRIZE"}</div>
      </div>
    );
  };

  const typeLabel = (g) => {
    if (isCreditsType(g)) return "CREDITS TOP-UP";
    if (isFoodType(g)) return "FREE DRINK OR FOOD";
    return "SPECIAL PRIZE";
  };

  return (
    <>
      {/* ── Full-screen gift reveal (first time opening) ── */}
      {openedGift && (
        <div className="gift-reveal-overlay" onClick={dismissOpenedGift}>
          <div className="gift-reveal-burst"/>
          <div className="gift-reveal-rays"/>
          <div className="gift-reveal-card" onClick={e=>e.stopPropagation()}>
            <div className="gift-reveal-eyebrow">YOU JUST RECEIVED A GIFT</div>
            <div className="gift-reveal-icon-wrap">{giftIcon(openedGift)}</div>
            <div className="gift-reveal-title">{openedGift.title}</div>
            {openedGift.description && <div className="gift-reveal-desc">{openedGift.description}</div>}
            {openedGift.sender_name && <div className="gift-reveal-from">From · {openedGift.sender_name}</div>}
            {openedGift.message && <div className="gift-reveal-msg">"{openedGift.message}"</div>}
            <button className="gift-reveal-close" onClick={dismissOpenedGift}>TAP TO CONTINUE</button>
          </div>
        </div>
      )}

      {/* ── Special gift claim instructions popup ── */}
      {showInstructions && (
        <div className="gift-instr-overlay" onClick={e => { if (e.target === e.currentTarget) setShowInstructions(null); }}>
          <div className="gift-instr-card">
            <button className="gift-instr-close" onClick={() => setShowInstructions(null)}>✕</button>
            <div className="gift-instr-icon gift-instr-icon-special">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>
                <line x1="12" y1="22" x2="12" y2="7"/>
                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
              </svg>
            </div>
            <div className="gift-instr-title">HOW TO CLAIM</div>
            <div className="gift-instr-item">{showInstructions.item_name || showInstructions.title}</div>
            <div className="gift-instr-steps">
              <div className="gift-instr-step"><span className="gift-instr-num">1</span>Head to the El Mundo restaurant</div>
              <div className="gift-instr-step"><span className="gift-instr-num">2</span>Show this screen to a staff member</div>
              <div className="gift-instr-step"><span className="gift-instr-num">3</span>Staff will verify your profile and hand you your prize</div>
            </div>
            <div className="gift-instr-player">
              <div className="gift-instr-player-lbl">PLAYER</div>
              <div className="gift-instr-player-val">{user.name}{user.player_number ? ` · #${user.player_number}` : ""}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Main MY GIFTS overlay ── */}
      <div className="gv-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="gv-modal">
          <button className="gv-close" onClick={onClose}>✕</button>
          <div className="gv-header">
            <div className="gv-title">MY GIFTS</div>
            <div className="gv-sub">Rewards, top-ups and surprises from El Mundo</div>
          </div>
          <div className="gv-tabs">
            <button className={`gv-tab ${tab==="active"?"gv-tab-on":""}`} onClick={() => setTab("active")}>
              ACTIVE {active.length > 0 && <span className="gv-tab-count">{active.length}</span>}
            </button>
            <button className={`gv-tab ${tab==="history"?"gv-tab-on":""}`} onClick={() => setTab("history")}>
              HISTORY {history.length > 0 && <span className="gv-tab-count">{history.length}</span>}
            </button>
          </div>

          <div className="gv-list">
            {list.length === 0 ? (
              <div className="gv-empty">
                <div className="gv-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 12 20 22 4 22 4 12"/>
                    <rect x="2" y="7" width="20" height="5"/>
                    <line x1="12" y1="22" x2="12" y2="7"/>
                    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
                    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
                  </svg>
                </div>
                <div className="gv-empty-title">{tab === "active" ? "NO ACTIVE GIFTS" : "NO HISTORY YET"}</div>
                <div className="gv-empty-hint">{tab === "active"
                  ? "Gifts from El Mundo will appear here"
                  : "Redeemed gifts will appear here"}</div>
              </div>
            ) : list.map((g, i) => (
              <div key={g.id} className={`gift-card ${isFoodType(g) ? "gift-card-food-type" : isSpecialType(g) ? "gift-card-special-type" : "gift-card-credits-type"} ${g.redeemed ? "gift-card-done" : ""}`} style={{animationDelay:`${i*.05}s`}}>
                <div className="gift-card-shine"/>
                <div className="gift-card-main">
                  {giftIcon(g)}
                  <div className="gift-card-info">
                    <div className="gift-card-type-lbl">{typeLabel(g)}</div>
                    <div className="gift-card-title">{g.title}</div>
                    {g.description && <div className="gift-card-desc">{g.description}</div>}
                    {g.sender_name && <div className="gift-card-from">from {g.sender_name}</div>}
                    {g.message && <div className="gift-card-msg">"{g.message}"</div>}
                    <div className="gift-card-date">
                      {g.redeemed
                        ? `Redeemed ${new Date(g.redeemed_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}`
                        : `Received ${new Date(g.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}`}
                    </div>
                  </div>
                </div>
                {!g.redeemed && (
                  <div className="gift-card-actions">
                    {isCreditsType(g) ? (
                      <button className="gift-redeem-btn gift-redeem-credits" onClick={() => redeemCredits(g)} disabled={redeeming === g.id}>
                        {redeeming === g.id ? "REDEEMING…" : "REDEEM TO BALANCE"}
                      </button>
                    ) : isFoodType(g) ? (
                      <button className="gift-redeem-btn gift-redeem-food" onClick={() => addToOrder(g)} disabled={addedGift === g.id}>
                        {addedGift === g.id ? "✓ ADDED TO ORDER" : "🛒 ADD TO ORDER"}
                      </button>
                    ) : (
                      <button className="gift-redeem-btn gift-redeem-special" onClick={() => setShowInstructions(g)}>
                        🎁 HOW TO CLAIM
                      </button>
                    )}
                  </div>
                )}
                {g.redeemed && (
                  <div className="gift-card-done-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    REDEEMED
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══ ADMIN DASHBOARD ═══════════════════════════════════════════════════════ */
function AdminDashboard({ allOrders, users, board }) {
  // Use LOCAL date (not UTC) — Supabase stores UTC, but we compare in local timezone
  const isoLocal = d => {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  };
  const localDate = ts => isoLocal(new Date(ts));
  const todayISO = isoLocal(new Date());

  const todayOrders = allOrders.filter(o => o.created_at && localDate(o.created_at) === todayISO);
  const pendingOrders = allOrders.filter(o => o.status === "pending" || o.status === "confirmed");
  const todayRevenue = todayOrders.reduce((s,o) => s + (+o.total), 0);
  const todayCreditOrders = todayOrders.filter(o => o.payment_method === "credits");
  const todayCardOrders   = todayOrders.filter(o => o.payment_method !== "credits");
  const creditRevenue = todayCreditOrders.reduce((s,o) => s + (+o.total), 0);
  const cardRevenue   = todayCardOrders.reduce((s,o) => s + (+o.total), 0);

  const allUsers   = Object.values(users);
  const totalUsers = allUsers.filter(u => !u.is_banned).length;
  const topPlayer  = board[0] || null;

  // Top product today
  const todayProducts = {};
  todayOrders.forEach(o => (o.items||[]).forEach(it => {
    if (!todayProducts[it.name]) todayProducts[it.name] = 0;
    todayProducts[it.name] += it.qty;
  }));
  const topProductEntry = Object.entries(todayProducts).sort((a,b)=>b[1]-a[1])[0];

  const DCard = ({ icon, label, value, sub, accent }) => (
    <div style={{background:"rgba(255,255,255,.04)",border:`1px solid ${accent||"rgba(255,255,255,.1)"}`,borderRadius:2,padding:"16px 14px",flex:1,minWidth:140,position:"relative",overflow:"hidden"}}>
      <div style={{fontSize:22,marginBottom:8,lineHeight:1}}>{icon}</div>
      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.4)",letterSpacing:2,fontWeight:700,marginBottom:4}}>{label}</div>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:28,color:"#fff",lineHeight:1}}>{value}</div>
      {sub && <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.3)",marginTop:5}}>{sub}</div>}
    </div>
  );

  const SRow = ({ label, value, accent }) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
      <span style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.55)",fontWeight:600}}>{label}</span>
      <span style={{fontFamily:"'Anton',sans-serif",fontSize:15,color:accent||"#fff"}}>{value}</span>
    </div>
  );

  return (
    <div style={{padding:"16px 14px 40px"}}>
      {/* ── Date header ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:3,color:"rgba(255,255,255,.3)"}}>QUICK DASHBOARD</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:18,color:"#fff",marginTop:2}}>{new Date().toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long"}).toUpperCase()}</div>
        </div>
        <div style={{width:8,height:8,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 8px #22c55e"}} title="Live" />
      </div>

      {/* ── Top KPI cards ── */}
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        <DCard icon="💵" label="TODAY'S REVENUE" value={`$${todayRevenue.toFixed(2)}`} sub={`${todayOrders.length} order${todayOrders.length!==1?"s":""}`} accent="rgba(34,197,94,.25)" />
        <DCard icon="⏳" label="PENDING ORDERS" value={pendingOrders.length} sub="Waiting / in progress" accent={pendingOrders.length>0?"rgba(245,158,11,.3)":"rgba(255,255,255,.1)"} />
      </div>
      <div style={{display:"flex",gap:10,marginBottom:24,flexWrap:"wrap"}}>
        <DCard icon="👥" label="TOTAL PLAYERS" value={totalUsers} sub="Registered accounts" />
        <DCard icon="🏆" label="TOP PLAYER" value={topPlayer ? topPlayer.name.split(" ")[0] : "—"} sub={topPlayer ? `${topPlayer.pts} pts · Rank #1` : "No predictions yet"} accent="rgba(255,255,255,.1)" />
      </div>

      {/* ── Today breakdown ── */}
      <div style={{marginBottom:24}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:3,color:"rgba(255,255,255,.3)",marginBottom:12}}>TODAY'S BREAKDOWN</div>
        <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",padding:"4px 14px"}}>
          <SRow label="💳 Credit Orders" value={`${todayCreditOrders.length} · $${creditRevenue.toFixed(2)}`} accent="#a3e635" />
          <SRow label="💵 Cash / Card" value={`${todayCardOrders.length} · $${cardRevenue.toFixed(2)}`} accent="#60a5fa" />
          <SRow label="📦 Total Orders Today" value={todayOrders.length} />
          <SRow label="🔥 Top Item Today" value={topProductEntry ? `${topProductEntry[0]} x${topProductEntry[1]}` : "—"} />
        </div>
      </div>

      {/* ── Active pending list ── */}
      {pendingOrders.length > 0 && (
        <div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:3,color:"rgba(255,255,255,.3)",marginBottom:10}}>ACTIVE ORDERS</div>
          {pendingOrders.slice(0,8).map(o => (
            <div key={o.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,.05)",background:"rgba(255,255,255,.02)"}}>
              <div>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"#fff",fontWeight:700}}>Table {o.table_number||"?"}</div>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.35)",marginTop:2}}>{(o.items||[]).map(i=>i.name).join(", ")}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,color:"#fff"}}>${(+o.total).toFixed(2)}</div>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:o.status==="pending"?"#f59e0b":"#a3e635",marginTop:2,textTransform:"uppercase",letterSpacing:1}}>{o.status}</div>
              </div>
            </div>
          ))}
          {pendingOrders.length > 8 && (
            <div style={{textAlign:"center",padding:"10px",fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.3)"}}>+{pendingOrders.length-8} more</div>
          )}
        </div>
      )}
      {pendingOrders.length === 0 && (
        <div style={{textAlign:"center",padding:"30px 0",fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.2)"}}>All orders fulfilled 🎉</div>
      )}
    </div>
  );
}

/* ═══ ADMIN VIEW ════════════════════════════════════════════════════════════ */
/* ═══ TV ADVERTISEMENT SLIDES ═══════════════════════════════════════════════ */

/* C — LOGO LIGHT BURST (cinematic reveal) */
function TVAdSlideC() {
  const { evLabel } = useEvt();
  const G = {background:"linear-gradient(135deg,#ffe97a,#F0C040,#fff8d6,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent"};
  const logoW = Math.min(380, Math.round(window.innerWidth * 0.30));
  return (
    <div className="tvad-slide">
      {/* Deep gold radial glow behind logo */}
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:"70vw",height:"70vw",maxWidth:900,maxHeight:900,borderRadius:"50%",background:"radial-gradient(circle,rgba(240,192,64,.14) 0%,rgba(240,192,64,.05) 40%,transparent 70%)",pointerEvents:"none"}} />
      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",gap:"clamp(16px,2.8vw,30px)"}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(11px,2vw,16px)",letterSpacing:12,color:"rgba(240,192,64,.8)",opacity:0,animation:"tvadFadeUp 1s cubic-bezier(.16,1,.3,1) .3s both"}}>WELCOME TO</div>
        <div style={{filter:"drop-shadow(0 0 60px rgba(240,192,64,.65))",opacity:0,animation:"tvadLogoReveal 1.8s cubic-bezier(.16,1,.3,1) .6s both"}}>
          <Logo w={logoW} />
        </div>
        <div style={{width:"clamp(180px,32vw,380px)",height:1,background:"linear-gradient(90deg,transparent,#F0C040,transparent)",transformOrigin:"center",opacity:0,animation:"tvadDividerGrow 1.4s cubic-bezier(.16,1,.3,1) 2.2s forwards"}} />
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(26px,6vw,64px)",letterSpacing:8,...G,lineHeight:1,filter:"drop-shadow(0 0 32px rgba(240,192,64,.5))",opacity:0,animation:"tvadFadeUp 1s cubic-bezier(.16,1,.3,1) 2.6s both"}}>{evLabel}</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(12px,2.2vw,18px)",letterSpacing:12,color:"rgba(255,255,255,.45)",opacity:0,animation:"tvadFadeUp 1s cubic-bezier(.16,1,.3,1) 3.4s both"}}>THE PREDICTION GAME</div>
      </div>
    </div>
  );
}

/* D — COUNTDOWN URGENCY SLIDE */
function TVAdClockUnit({ val, lbl }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:"clamp(72px,12vw,124px)"}}>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(52px,11vw,110px)",letterSpacing:2,lineHeight:1,color:"#F0C040",filter:"drop-shadow(0 0 28px rgba(240,192,64,.6))",animation:"tvadLivePulse 1s ease-in-out infinite"}}>{String(val).padStart(2,"0")}</div>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(9px,1.6vw,13px)",letterSpacing:5,color:"rgba(255,255,255,.35)",marginTop:6}}>{lbl}</div>
    </div>
  );
}
function getEventKickoff() {
  try {
    const s = JSON.parse(localStorage.getItem("em_app_settings")||"{}");
    if (s.eventKickoff) return new Date(s.eventKickoff).getTime();
  } catch {}
  return new Date("2026-06-11T20:00:00Z").getTime();
}

function TVAdSlideD({ matches = [] }) {
  const { evName, evYear } = useEvt();
  const G = {background:"linear-gradient(135deg,#ffe97a,#F0C040,#fff8d6,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent"};
  const nextMatch = useMemo(() => {
    const now = Date.now();
    return [...matches].filter(m => new Date(m.kickoff).getTime() > now).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0] || null;
  }, [matches]);

  const eventKickoff = getEventKickoff();
  const target = nextMatch ? new Date(nextMatch.kickoff).getTime() : eventKickoff;
  const mode = nextMatch ? "match" : (Date.now() < eventKickoff ? "tournament" : "live");

  const calcRemaining = () => {
    const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
    return { d: Math.floor(diff / 86400), h: Math.floor((diff % 86400) / 3600), m: Math.floor((diff % 3600) / 60), s: diff % 60, total: diff };
  };
  const [tl, setTl] = useState(calcRemaining);
  useEffect(() => {
    const id = setInterval(() => setTl(calcRemaining()), 1000);
    return () => clearInterval(id);
  }, [target]);

  const urgent = mode === "match" && tl.total < 600;
  const heading = mode === "match" ? "NEXT MATCH STARTS IN" : mode === "tournament" ? `${evName} ${evYear} KICKS OFF IN` : "THE TOURNAMENT IS LIVE";

  return (
    <div className="tvad-slide">
      {/* Soft radial glow behind logo */}
      <div style={{position:"absolute",top:"18%",left:"50%",transform:"translateX(-50%)",width:"60%",height:"45%",background:"radial-gradient(ellipse at center,rgba(240,192,64,.08) 0%,rgba(240,192,64,0) 60%)",pointerEvents:"none"}} />
      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",width:"100%",maxWidth:780,gap:"clamp(10px,2vw,20px)"}}>
        {/* Logo seal at top */}
        <div style={{filter:"drop-shadow(0 0 40px rgba(240,192,64,.5))",opacity:0,animation:"tvadLogoReveal 1.2s cubic-bezier(.16,1,.3,1) .1s both"}}>
          <Logo w={Math.min(200, Math.round(window.innerWidth * 0.16))} />
        </div>
        <div style={{width:"clamp(100px,20vw,260px)",height:1,background:"linear-gradient(90deg,transparent,rgba(240,192,64,.5),transparent)",opacity:0,animation:"tvadFadeUp .8s cubic-bezier(.16,1,.3,1) .7s both"}} />
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(10px,1.9vw,14px)",letterSpacing:8,color:"rgba(240,192,64,.75)",opacity:0,animation:"tvadFadeUp .7s cubic-bezier(.16,1,.3,1) .9s both"}}>{heading}</div>

        {/* Countdown OR "LIVE NOW" */}
        {mode !== "live" ? (
          <div style={{display:"flex",alignItems:"flex-start",gap:"clamp(8px,3vw,28px)",opacity:0,animation:"tvadScoreReveal .8s cubic-bezier(.16,1,.3,1) 1.2s both"}}>
            {tl.d > 0 && <><TVAdClockUnit val={tl.d} lbl="DAYS" /><div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(28px,6vw,60px)",color:"rgba(240,192,64,.35)",lineHeight:1,paddingTop:"clamp(6px,1.2vw,14px)"}}>:</div></>}
            <TVAdClockUnit val={tl.h} lbl="HRS" />
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(28px,6vw,60px)",color:"rgba(240,192,64,.35)",lineHeight:1,paddingTop:"clamp(6px,1.2vw,14px)"}}>:</div>
            <TVAdClockUnit val={tl.m} lbl="MIN" />
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(28px,6vw,60px)",color:"rgba(240,192,64,.35)",lineHeight:1,paddingTop:"clamp(6px,1.2vw,14px)"}}>:</div>
            <TVAdClockUnit val={tl.s} lbl="SEC" />
          </div>
        ) : (
          <div style={{display:"flex",alignItems:"center",gap:14,opacity:0,animation:"tvadScoreReveal .8s cubic-bezier(.16,1,.3,1) 1.2s both"}}>
            <div style={{width:14,height:14,borderRadius:"50%",background:"#F0C040",boxShadow:"0 0 24px rgba(240,192,64,.7)",animation:"tvadLivePulse 1s ease-in-out infinite"}} />
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(32px,7vw,72px)",letterSpacing:6,...G,lineHeight:1,filter:"drop-shadow(0 0 20px rgba(240,192,64,.5))"}}>NOW LIVE</div>
          </div>
        )}

        {/* Match info or tournament tag */}
        {mode === "match" && (
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(14px,3vw,24px)",color:"rgba(255,255,255,.6)",letterSpacing:4,opacity:0,animation:"tvadFadeUp .7s cubic-bezier(.16,1,.3,1) 1.5s both"}}>
            {nextMatch.home.toUpperCase()} <span style={{color:"rgba(240,192,64,.5)",margin:"0 10px"}}>vs</span> {nextMatch.away.toUpperCase()}
          </div>
        )}
        {mode === "tournament" && (
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(12px,2.4vw,18px)",color:"rgba(255,255,255,.45)",letterSpacing:6,opacity:0,animation:"tvadFadeUp .7s cubic-bezier(.16,1,.3,1) 1.5s both"}}>{evName} {evYear} · OPENING MATCH</div>
        )}

        {urgent && <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(13px,2.5vw,18px)",letterSpacing:4,color:"#ff4444",animation:"tvadNeonFlicker .4s linear infinite"}}>⚡ LOCK IN YOUR PREDICTION ⚡</div>}

        <div style={{width:"clamp(120px,24vw,300px)",height:1,background:"linear-gradient(90deg,transparent,rgba(240,192,64,.3),transparent)",opacity:0,animation:"tvadFadeUp .7s cubic-bezier(.16,1,.3,1) 1.7s both"}} />

        {/* QR + CTA block */}
        <div style={{display:"flex",alignItems:"center",gap:"clamp(18px,3vw,30px)",opacity:0,animation:"tvadFadeUp .8s cubic-bezier(.16,1,.3,1) 1.9s both"}}>
          <div style={{padding:10,background:"#0d0b00",border:"1.5px solid rgba(240,192,64,.45)",borderRadius:12,animation:"tvadQRGlow 2.5s ease-in-out infinite"}}>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://elmundo-world-cup.com&bgcolor=0d0b00&color=F0C040&format=png&margin=6" alt="QR" style={{width:"clamp(70px,10vw,120px)",height:"clamp(70px,10vw,120px)",display:"block"}} />
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,textAlign:"left"}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(18px,3.6vw,36px)",letterSpacing:2,...G,lineHeight:1}}>PREDICT</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(18px,3.6vw,36px)",letterSpacing:2,...G,lineHeight:1}}>EVERY MATCH</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(10px,1.6vw,12px)",color:"rgba(255,255,255,.35)",marginTop:6,letterSpacing:1.5}}>elmundo-world-cup.com</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* B — MATCH DUEL (no emoji flags — pure typography + color) */
function TVAdSlideB() {
  const { evLabel } = useEvt();
  const [minute, setMinute] = useState(67);
  useEffect(() => {
    const id = setInterval(() => setMinute(m => Math.min(m+1,90)), 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="tvad-slide" style={{padding:0,overflow:"hidden"}}>
      <div className="tvad-scanline-overlay"/>
      {/* Split colour wash */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
        <div style={{position:"absolute",inset:0,right:"50%",background:"linear-gradient(135deg,rgba(0,156,59,.13) 0%,transparent 70%)"}}/>
        <div style={{position:"absolute",inset:0,left:"50%",background:"linear-gradient(225deg,rgba(116,172,223,.13) 0%,transparent 70%)"}}/>
      </div>
      {/* Gold centre spine */}
      <div style={{position:"absolute",top:0,bottom:0,left:"50%",transform:"translateX(-50%)",width:1,background:"linear-gradient(180deg,transparent 4%,rgba(240,192,64,.55) 28%,rgba(240,192,64,.9) 50%,rgba(240,192,64,.55) 72%,transparent 96%)",boxShadow:"0 0 18px rgba(240,192,64,.35)",pointerEvents:"none"}}/>
      {/* Header */}
      <div style={{position:"absolute",top:0,left:0,right:0,display:"flex",alignItems:"center",justifyContent:"center",gap:14,padding:"clamp(10px,1.8vw,20px) 0",borderBottom:"1px solid rgba(240,192,64,.1)",zIndex:4,background:"linear-gradient(180deg,rgba(0,0,0,.75) 0%,transparent 100%)",opacity:0,animation:"tvadFadeUp .5s ease .1s both"}}>
        <div style={{width:8,height:8,borderRadius:"50%",background:"#ff3333",boxShadow:"0 0 12px #ff3333",animation:"tvadLivePulse .85s ease-in-out infinite"}}/>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(10px,1.8vw,14px)",letterSpacing:5,color:"#ff4444"}}>LIVE</div>
        <div style={{width:4,height:4,borderRadius:"50%",background:"rgba(255,255,255,.2)"}}/>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(10px,1.8vw,13px)",letterSpacing:3,color:"rgba(255,255,255,.5)"}}>{minute}'</div>
        <div style={{width:4,height:4,borderRadius:"50%",background:"rgba(255,255,255,.2)"}}/>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.5vw,11px)",color:"rgba(255,255,255,.28)",letterSpacing:3}}>GROUP A · MATCHDAY 2 · {evLabel}</div>
      </div>
      {/* Teams + score */}
      <div style={{position:"relative",zIndex:2,display:"flex",width:"100%",height:"100%",alignItems:"center",paddingTop:"clamp(56px,9vw,96px)",paddingBottom:"clamp(36px,6vw,56px)"}}>
        {/* Left team */}
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"clamp(6px,1.2vw,12px)",padding:"clamp(16px,3vw,40px)"}}>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.5vw,12px)",letterSpacing:5,color:"rgba(255,255,255,.3)",opacity:0,animation:"tvadFadeUp .5s ease .2s both"}}>HOME</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(26px,5.5vw,66px)",letterSpacing:1,color:"#fff",lineHeight:.95,textAlign:"center",opacity:0,animation:"tvadFadeUp .8s ease .4s both",textShadow:"0 0 50px rgba(0,200,70,.3)"}}>BRAZIL</div>
          <div style={{width:"clamp(40px,7vw,72px)",height:3,background:"linear-gradient(90deg,transparent,#009c3b,#ffdf00,transparent)",borderRadius:2,opacity:0,animation:"tvadFadeUp .5s ease .7s both"}}/>
        </div>
        {/* Score centre */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"clamp(6px,1.2vw,12px)",minWidth:"clamp(180px,28vw,300px)"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(64px,14vw,148px)",letterSpacing:6,color:"#fff",lineHeight:1,filter:"drop-shadow(0 0 36px rgba(255,255,255,.28))",opacity:0,animation:"tvadScoreReveal .8s cubic-bezier(.16,1,.3,1) .3s both",whiteSpace:"nowrap"}}>1 – 0</div>
          <div style={{width:"clamp(80px,14vw,140px)",height:1,background:"linear-gradient(90deg,transparent,rgba(240,192,64,.5),transparent)"}}/>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.5vw,12px)",letterSpacing:4,color:"rgba(240,192,64,.65)",opacity:0,animation:"tvadFadeUp .6s ease 1.2s both"}}>DID YOU PREDICT THIS?</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(22px,4.5vw,48px)",letterSpacing:2,background:"linear-gradient(135deg,#ffe97a,#F0C040)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",filter:"drop-shadow(0 0 18px rgba(240,192,64,.6))",opacity:0,animation:"tvadScaleIn .8s cubic-bezier(.34,1.56,.64,1) 1.7s both"}}>+5 PTS</div>
        </div>
        {/* Right team */}
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"clamp(6px,1.2vw,12px)",padding:"clamp(16px,3vw,40px)"}}>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.5vw,12px)",letterSpacing:5,color:"rgba(255,255,255,.3)",opacity:0,animation:"tvadFadeUp .5s ease .3s both"}}>AWAY</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(26px,5.5vw,66px)",letterSpacing:1,color:"#fff",lineHeight:.95,textAlign:"center",opacity:0,animation:"tvadFadeUp .8s ease .5s both",textShadow:"0 0 50px rgba(116,172,223,.3)"}}>ARGENTINA</div>
          <div style={{width:"clamp(40px,7vw,72px)",height:3,background:"linear-gradient(90deg,transparent,#74acdf,#fff,#74acdf,transparent)",borderRadius:2,opacity:0,animation:"tvadFadeUp .5s ease .8s both"}}/>
        </div>
      </div>
      {/* Bottom CTA */}
      <div style={{position:"absolute",bottom:"clamp(12px,2.2vw,24px)",left:0,right:0,display:"flex",justifyContent:"center",gap:14,opacity:0,animation:"tvadFadeUp .6s ease 2.4s both"}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(9px,1.5vw,13px)",letterSpacing:4,color:"rgba(255,255,255,.28)"}}>PREDICT EVERY MATCH →</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(9px,1.5vw,13px)",letterSpacing:3,color:"rgba(240,192,64,.6)"}}>ELMUNDO-WORLD-CUP.COM</div>
      </div>
    </div>
  );
}

/* ═══ PREDICTION JOURNEY — Animated SVG cumulative points chart ══════════ */
function PredictionJourney({ matches, preds, user }) {
  const svgRef    = useRef(null);
  const [animated, setAnimated] = useState(false);
  const [pathLen,  setPathLen]  = useState(1200);
  const [tooltip,  setTooltip]  = useState(null); // {x,y,point}

  const finMatches = useMemo(() =>
    sortMatches(matches.filter(m => m.status === "finished" && m.hs != null && m.as != null)),
    [matches]
  );

  const points = useMemo(() => {
    let cum = 0;
    return finMatches.map((m, i) => {
      const p = preds[`${user.id}__${m.id}`];
      const earned = p ? calcPts(p, m.hs, m.as) : 0;
      const outcome = !p ? "missed" : earned === 5 ? "exact" : earned === 1 ? "winner" : "wrong";
      cum += earned;
      return { i, pts: cum, earned, outcome, m };
    });
  }, [finMatches, preds, user.id]);

  const PAD = { x: 18, y: 18 };
  const VW = 340, VH = 148;
  const chartW = VW - PAD.x * 2;
  const chartH = VH - PAD.y * 2;
  const maxPts = Math.max(...points.map(p => p.pts), 5);
  const n = points.length;

  const toX = i  => PAD.x + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
  const toY = pt => PAD.y + chartH - (pt / maxPts) * chartH;

  const pathD = n < 2 ? "" : points.map((p, i) => {
    const x = toX(i), y = toY(p.pts);
    if (i === 0) return `M ${x} ${y}`;
    const px = toX(i - 1), py = toY(points[i - 1].pts);
    const cpx = (px + x) / 2;
    return `C ${cpx} ${py} ${cpx} ${y} ${x} ${y}`;
  }).join(" ");

  const fillD = pathD
    ? `${pathD} L ${toX(n - 1)} ${VH - PAD.y} L ${toX(0)} ${VH - PAD.y} Z`
    : "";

  const dotColor = o => o === "exact" ? "#F0C040" : o === "winner" ? "#4ade80" : o === "wrong" ? "#f87171" : "#334155";

  // Animate on mount
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 120);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = svgRef.current?.querySelector(".journey-line-path");
    if (el) setPathLen(el.getTotalLength() || 1200);
  }, [pathD]);

  if (n < 2) return null;

  const totalPts = points[n - 1]?.pts ?? 0;
  const exactCount = points.filter(p => p.outcome === "exact").length;
  const winnerCount = points.filter(p => p.outcome === "winner").length;

  return (
    <div className="journey-wrap">
      {/* Header */}
      <div className="journey-header">
        <div>
          <div className="journey-title">🗺️ PREDICTION JOURNEY</div>
          <div className="journey-sub">{n} matches completed</div>
        </div>
        <div className="journey-total-pts">{totalPts} PTS</div>
      </div>

      {/* SVG chart */}
      <div className="journey-chart-outer" onMouseLeave={() => setTooltip(null)} onTouchEnd={() => setTimeout(() => setTooltip(null), 2000)}>
        <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{display:"block",overflow:"visible"}}>
          <defs>
            <linearGradient id="jFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#F0C040" stopOpacity="0.22"/>
              <stop offset="100%" stopColor="#F0C040" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="jLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#F0C040" stopOpacity="0.4"/>
              <stop offset="100%" stopColor="#F0C040" stopOpacity="1"/>
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Horizontal grid */}
          {[0, 0.33, 0.66, 1].map((t, i) => (
            <line key={i}
              x1={PAD.x} y1={PAD.y + chartH * (1 - t)}
              x2={VW - PAD.x} y2={PAD.y + chartH * (1 - t)}
              stroke="rgba(255,255,255,.05)" strokeWidth="1"
            />
          ))}

          {/* Fill area */}
          {fillD && (
            <path d={fillD} fill="url(#jFill)"
              style={{opacity: animated ? 1 : 0, transition:"opacity 1.2s ease .6s"}}
            />
          )}

          {/* Animated line */}
          {pathD && (
            <path
              className="journey-line-path"
              d={pathD} fill="none"
              stroke="url(#jLine)" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              filter="url(#glow)"
              style={{
                strokeDasharray: pathLen,
                strokeDashoffset: animated ? 0 : pathLen,
                transition: `stroke-dashoffset ${Math.min(n * 0.25, 2.8)}s cubic-bezier(.4,0,.2,1) .1s`,
              }}
            />
          )}

          {/* Dots */}
          {points.map((p, i) => {
            const cx = toX(i), cy = toY(p.pts);
            const isExact = p.outcome === "exact";
            return (
              <g key={i} style={{cursor:"pointer"}}
                onClick={() => setTooltip(t => t?.i === i ? null : {i, x: cx, y: cy, point: p})}
                onMouseEnter={() => setTooltip({i, x: cx, y: cy, point: p})}
              >
                {isExact && (
                  <circle cx={cx} cy={cy} r={9}
                    fill="rgba(240,192,64,.18)" stroke="rgba(240,192,64,.45)" strokeWidth="1.5"
                    style={{opacity: animated ? 1 : 0, transition:`opacity .3s ease ${.5 + i * 0.07}s`}}
                  />
                )}
                <circle cx={cx} cy={cy} r={isExact ? 5.5 : 4}
                  fill={dotColor(p.outcome)}
                  stroke={isExact ? "rgba(240,192,64,.5)" : "rgba(0,0,0,.5)"} strokeWidth={isExact ? 2 : 1}
                  filter={isExact ? "url(#glow)" : "none"}
                  style={{opacity: animated ? 1 : 0, transition:`opacity .3s ease ${.5 + i * 0.07}s`}}
                />
              </g>
            );
          })}

          {/* Tooltip */}
          {tooltip && (() => {
            const { x, y, point: tp } = tooltip;
            const isLeft = x < VW / 2;
            const tx = isLeft ? x + 8 : x - 8;
            const ty = Math.max(y - 38, PAD.y);
            const pts = tp.earned > 0 ? `+${tp.earned} pts` : "0 pts";
            const score = tp.m.hs != null ? `${tp.m.hs}–${tp.m.as}` : "";
            const pick  = (() => { const pp = preds[`${user.id}__${tp.m.id}`]; return pp ? `${pp.h}–${pp.a}` : "—"; })();
            const label = `${tp.m.home} vs ${tp.m.away}`;
            return (
              <g>
                <rect
                  x={isLeft ? tx : tx - 130} y={ty}
                  width={130} height={52} rx={6}
                  fill="rgba(10,10,20,.9)" stroke="rgba(255,255,255,.12)" strokeWidth="1"
                />
                <text x={isLeft ? tx + 8 : tx - 122} y={ty + 14}
                  fontFamily="Anton" fontSize="9" fill="#F0C040" letterSpacing="1">
                  {pts.toUpperCase()} · TOTAL {tp.pts}
                </text>
                <text x={isLeft ? tx + 8 : tx - 122} y={ty + 26}
                  fontFamily="Outfit" fontSize="8.5" fill="rgba(255,255,255,.65)">
                  Result {score} · Pick {pick}
                </text>
                <text x={isLeft ? tx + 8 : tx - 122} y={ty + 40}
                  fontFamily="Outfit" fontSize="8" fill="rgba(255,255,255,.35)">
                  {label.length > 22 ? label.slice(0, 20) + "…" : label}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Legend + mini stats */}
      <div className="journey-footer">
        <div className="journey-legend">
          <span><span className="jleg" style={{background:"#F0C040"}}/> Exact +5</span>
          <span><span className="jleg" style={{background:"#4ade80"}}/> Winner +1</span>
          <span><span className="jleg" style={{background:"#f87171"}}/> Wrong</span>
          <span><span className="jleg" style={{background:"#334155"}}/> Missed</span>
        </div>
        <div className="journey-mini-stats">
          {exactCount > 0 && <span className="journey-exact-badge">⚡ {exactCount} exact</span>}
          {winnerCount > 0 && <span className="journey-win-badge">✓ {winnerCount} correct</span>}
        </div>
      </div>
    </div>
  );
}

/* A — "WHO WILL WIN [EVENT]?" — DRAMATIC TYPOGRAPHY REVEAL */
function TVAdSlideA() {
  const { evName, evYear } = useEvt();
  const G = {background:"linear-gradient(135deg,#ffe97a,#F0C040,#fff8d6,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent"};
  const line1 = evName.split("");
  const line2 = String(evYear).split("");

  return (
    <div className="tvad-slide" style={{padding:0,overflow:"hidden"}}>
      <div className="tvad-scanline-overlay"/>

      {/* Deep radial glow centre */}
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 65% 55% at 50% 45%,rgba(240,192,64,.09) 0%,transparent 70%)",pointerEvents:"none"}}/>

      {/* Two slow orbit rings for depth */}
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:"min(88vw,680px)",height:"min(88vw,680px)",borderRadius:"50%",border:"1px solid rgba(240,192,64,.07)",animation:"tvadRotateRing 32s linear infinite",pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:"min(62vw,500px)",height:"min(62vw,500px)",borderRadius:"50%",border:"1px dashed rgba(240,192,64,.05)",animation:"tvadRotateRing 22s linear infinite reverse",pointerEvents:"none"}}/>

      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",width:"100%",gap:0}}>

        {/* Eyebrow label */}
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.6vw,13px)",letterSpacing:9,color:"rgba(240,192,64,.55)",opacity:0,animation:"tvadFadeUp .7s ease .3s both",marginBottom:"clamp(10px,1.8vw,18px)"}}>THE WORLD IS WATCHING</div>

        {/* WHO WILL WIN */}
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(30px,6.5vw,72px)",letterSpacing:4,color:"rgba(255,255,255,.88)",lineHeight:1,opacity:0,animation:"tvadWordIn .85s cubic-bezier(.16,1,.3,1) .65s both",textAlign:"center"}}>WHO WILL WIN</div>

        {/* Gold growing divider */}
        <div style={{width:"clamp(60px,12vw,180px)",height:2,background:"linear-gradient(90deg,transparent,rgba(240,192,64,.75),transparent)",margin:"clamp(10px,1.8vw,16px) 0",opacity:0,animation:"tvadDividerGrow 1.3s ease 1.1s forwards"}}/>

        {/* WORLD — letter by letter */}
        <div style={{display:"flex",justifyContent:"center",gap:"clamp(2px,0.5vw,5px)",overflow:"hidden",lineHeight:1,marginBottom:"clamp(2px,0.5vw,4px)"}}>
          {line1.map((l, i) => (
            <span key={i} style={{
              fontFamily:"'Anton',sans-serif",
              fontSize:"clamp(52px,10.5vw,118px)",
              lineHeight:1,display:"inline-block",
              ...G,
              filter:"drop-shadow(0 0 32px rgba(240,192,64,.55))",
              opacity:0,
              animation:`tvadLetterIn .42s cubic-bezier(.16,1,.3,1) ${1.5 + i*0.07}s both`,
            }}>{l}</span>
          ))}
        </div>

        {/* CUP 2026 — letter by letter */}
        <div style={{display:"flex",justifyContent:"center",gap:"clamp(2px,0.5vw,5px)",overflow:"hidden",lineHeight:1}}>
          {line2.map((l, i) => (
            <span key={i} style={{
              fontFamily:"'Anton',sans-serif",
              fontSize:"clamp(52px,10.5vw,118px)",
              lineHeight:1,display:"inline-block",
              ...(l === " " ? {width:"clamp(20px,3vw,34px)"} : {}),
              ...(l === " " ? {} : G),
              ...(l === " " ? {} : {filter:"drop-shadow(0 0 32px rgba(240,192,64,.55))"}),
              color: l === " " ? "transparent" : undefined,
              opacity: l === " " ? 1 : 0,
              animation: l === " " ? "none" : `tvadLetterIn .42s cubic-bezier(.16,1,.3,1) ${1.9 + i*0.07}s both`,
            }}>{l === " " ? "\u00a0" : l}</span>
          ))}
        </div>

        {/* CAN YOU PREDICT IT? */}
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(13px,2.6vw,28px)",letterSpacing:6,color:"rgba(255,255,255,.55)",marginTop:"clamp(14px,2.4vw,22px)",opacity:0,animation:"tvadWordIn .85s ease 3.6s both"}}>CAN YOU PREDICT IT?</div>

        {/* Thin gold divider */}
        <div style={{width:"clamp(40px,8vw,100px)",height:1,background:"rgba(240,192,64,.3)",margin:"clamp(10px,1.8vw,18px) 0",opacity:0,animation:"tvadDividerGrow 1s ease 4.3s forwards"}}/>

        {/* CTA */}
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.7vw,14px)",letterSpacing:5,...G,opacity:0,animation:"tvadFadeUp .7s ease 4.9s both",textAlign:"center"}}>PREDICT EVERY MATCH AT ELMUNDO-WORLD-CUP.COM</div>
      </div>
    </div>
  );
}

/* F — WATCH · PREDICT · WIN three-pillar slide */
function TVAdSlideF() {
  const { evLabel } = useEvt();
  const G = {background:"linear-gradient(135deg,#ffe97a,#F0C040,#fff8d6,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent"};
  const logoW = Math.min(200, Math.round(window.innerWidth * 0.17));

  const pillars = [
    {word:"WATCH",   desc:`Every ${evLabel} match — live at El Mundo Bar, Bonaire`,       delay:1.2},
    {word:"PREDICT", desc:"Submit your exact score prediction before every kick-off",      delay:2.7},
    {word:"WIN",     desc:"Top the leaderboard and claim your Grand Prize",                delay:4.2},
  ];

  // Deterministic-ish particles (avoid Math.random on render)
  const particles = [
    {x:8,  y:15, s:3, d:0,   dur:5.2},
    {x:22, y:72, s:2, d:1.4, dur:6.1},
    {x:38, y:30, s:4, d:2.8, dur:4.8},
    {x:55, y:85, s:2, d:0.6, dur:5.7},
    {x:68, y:20, s:3, d:3.3, dur:6.3},
    {x:80, y:60, s:2, d:1.9, dur:5.0},
    {x:92, y:40, s:4, d:4.1, dur:4.6},
    {x:14, y:50, s:2, d:2.2, dur:5.9},
    {x:47, y:10, s:3, d:0.9, dur:6.0},
    {x:76, y:88, s:2, d:3.7, dur:5.4},
    {x:31, y:95, s:3, d:1.1, dur:4.9},
    {x:61, y:55, s:2, d:4.5, dur:6.2},
  ];

  return (
    <div className="tvad-slide" style={{padding:0,overflow:"hidden"}}>
      <div className="tvad-scanline-overlay"/>

      {/* Ambient gradient wash */}
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 70% 60% at 50% 50%,rgba(240,192,64,.06) 0%,transparent 68%)",pointerEvents:"none"}}/>

      {/* Floating gold dust particles */}
      {particles.map((p,i) => (
        <div key={i} style={{
          position:"absolute",left:`${p.x}%`,top:`${p.y}%`,
          width:p.s,height:p.s,borderRadius:"50%",
          background:"rgba(240,192,64,0.4)",
          animation:`tvadParticleDrift ${p.dur}s ease-in-out ${p.d}s infinite`,
          pointerEvents:"none",
        }}/>
      ))}

      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",width:"100%",gap:0}}>

        {/* Logo */}
        <div style={{filter:"drop-shadow(0 0 40px rgba(240,192,64,.5))",opacity:0,animation:"tvadLogoReveal 1.4s cubic-bezier(.16,1,.3,1) .3s both",marginBottom:"clamp(8px,1.6vw,14px)"}}>
          <Logo w={logoW} />
        </div>

        {/* Divider */}
        <div style={{width:"clamp(80px,16vw,220px)",height:1,background:"linear-gradient(90deg,transparent,rgba(240,192,64,.5),transparent)",opacity:0,animation:"tvadDividerGrow 1.2s ease .8s forwards",marginBottom:"clamp(12px,2.2vw,22px)"}}/>

        {/* Three pillar cards */}
        <div style={{display:"flex",flexDirection:"column",gap:"clamp(8px,1.4vw,12px)",width:"100%",maxWidth:660}}>
          {pillars.map((p, i) => (
            <div key={i} style={{
              display:"flex",alignItems:"center",gap:"clamp(16px,2.6vw,26px)",
              padding:"clamp(13px,2.2vw,20px) clamp(18px,3vw,30px)",
              background:"linear-gradient(135deg,rgba(240,192,64,.09) 0%,rgba(240,192,64,.02) 100%)",
              border:"1px solid rgba(240,192,64,.2)",
              borderLeft:"3px solid rgba(240,192,64,.75)",
              borderRadius:12,
              opacity:0,animation:`tvadSlideFromLeft .65s cubic-bezier(.16,1,.3,1) ${p.delay}s both`,
            }}>
              <div style={{
                fontFamily:"'Anton',sans-serif",
                fontSize:"clamp(28px,5.5vw,58px)",
                letterSpacing:3,lineHeight:1,
                ...G,
                filter:"drop-shadow(0 0 18px rgba(240,192,64,.45))",
                minWidth:"clamp(90px,13vw,160px)",
              }}>{p.word}</div>
              <div style={{width:1,alignSelf:"stretch",background:"rgba(240,192,64,.15)",flexShrink:0}}/>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(10px,1.7vw,15px)",color:"rgba(255,255,255,.5)",letterSpacing:1,lineHeight:1.5}}>{p.desc}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.5vw,12px)",letterSpacing:5,color:"rgba(255,255,255,.28)",marginTop:"clamp(12px,2vw,20px)",opacity:0,animation:"tvadFadeUp .6s ease 5.6s both"}}>EL MUNDO BAR · BONAIRE · {evLabel}</div>
      </div>
    </div>
  );
}

/* ── NEW SLIDE: HOW IT WORKS ─────────────────────────────────────────────── */
function TVAdSlideHowTo() {
  const { evLabel } = useEvt();
  const steps = [
    {ico:"⚽",n:"01",t:"PREDICT THE SCORE",d:`Enter your exact score prediction for every ${evLabel} match before kick-off`,delay:1.0},
    {ico:"🎯",n:"02",t:"EARN YOUR POINTS", d:"5 pts for exact score · 1 pt for correct winner — every match, every point",delay:2.8},
    {ico:"🏆",n:"03",t:"CLIMB & WIN",       d:"Top the leaderboard by tournament end and claim the grand prize",delay:4.6},
  ];
  return (
    <div className="tvad-slide" style={{gap:0}}>
      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(10px,1.8vw,13px)",letterSpacing:8,color:"rgba(240,192,64,.65)",opacity:0,animation:"tvadFadeUp .6s ease .2s both",marginBottom:6}}>HOW IT WORKS</div>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(26px,5vw,58px)",letterSpacing:3,color:"#fff",opacity:0,animation:"tvadFadeUp .8s ease .4s both",marginBottom:"clamp(18px,3vw,36px)"}}>3 SIMPLE STEPS</div>
      <div style={{display:"flex",flexDirection:"column",gap:"clamp(10px,1.8vw,18px)",width:"100%",maxWidth:700}}>
        {steps.map((s,i) => (
          <div key={i} style={{
            display:"flex",alignItems:"center",gap:"clamp(14px,2.4vw,24px)",
            background:"linear-gradient(135deg,rgba(240,192,64,.07),rgba(240,192,64,.02))",
            border:"1px solid rgba(240,192,64,.18)",borderLeft:"3px solid rgba(240,192,64,.6)",
            borderRadius:12,padding:"clamp(14px,2.4vw,22px) clamp(16px,2.6vw,26px)",
            opacity:0,animation:`tvadSlideFromLeft .7s cubic-bezier(.16,1,.3,1) ${s.delay}s both`,
          }}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(24px,5vw,48px)",color:"rgba(240,192,64,.18)",minWidth:"clamp(38px,5vw,54px)",lineHeight:1}}>{s.n}</div>
            <div style={{fontSize:"clamp(22px,4vw,36px)",minWidth:"clamp(32px,4vw,44px)"}}>{s.ico}</div>
            <div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(13px,2.2vw,20px)",letterSpacing:3,color:"#F0C040",marginBottom:4}}>{s.t}</div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(10px,1.6vw,14px)",color:"rgba(255,255,255,.45)",lineHeight:1.5}}>{s.d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── NEW SLIDE: SCORING SYSTEM ───────────────────────────────────────────── */
function TVAdSlidePoints() {
  return (
    <div className="tvad-slide" style={{gap:0,overflow:"hidden"}}>
      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(10px,1.8vw,13px)",letterSpacing:8,color:"rgba(240,192,64,.6)",opacity:0,animation:"tvadFadeUp .6s ease .2s both",marginBottom:6}}>SCORING SYSTEM</div>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(13px,2.4vw,20px)",letterSpacing:5,color:"rgba(255,255,255,.5)",opacity:0,animation:"tvadFadeUp .7s ease .4s both",marginBottom:"clamp(16px,2.8vw,32px)"}}>YOUR PREDICTIONS EARN</div>
      <div style={{display:"flex",alignItems:"center",gap:"clamp(20px,5vw,60px)"}}>
        {/* 5 PTS */}
        <div style={{textAlign:"center",opacity:0,animation:"tvadScaleIn .9s cubic-bezier(.34,1.56,.64,1) .9s both"}}>
          <div style={{position:"relative",display:"inline-block"}}>
            {[0,1,2].map(i => (
              <div key={i} style={{position:"absolute",top:`${-(i+1)*22}px`,left:`${-(i+1)*22}px`,right:`${-(i+1)*22}px`,bottom:`${-(i+1)*22}px`,borderRadius:"50%",border:`1.5px solid rgba(240,192,64,${0.5-i*0.15})`,opacity:0,animation:`tvadShockwave 1.2s ease-out ${1.8+i*0.25}s both`}}/>
            ))}
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(72px,16vw,160px)",lineHeight:1,background:"linear-gradient(135deg,#ffe97a,#F0C040,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",filter:"drop-shadow(0 0 50px rgba(240,192,64,.7))"}}>5</div>
          </div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(14px,2.5vw,24px)",letterSpacing:5,color:"#F0C040",marginTop:-4}}>POINTS</div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.6vw,13px)",color:"rgba(255,255,255,.5)",marginTop:6,letterSpacing:2}}>EXACT SCORE</div>
        </div>
        {/* OR */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,opacity:0,animation:"tvadFadeUp .5s ease 2.4s both"}}>
          <div style={{width:1,height:"clamp(40px,7vw,70px)",background:"rgba(240,192,64,.25)"}}/>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(10px,1.8vw,14px)",letterSpacing:3,color:"rgba(255,255,255,.22)"}}>OR</div>
          <div style={{width:1,height:"clamp(40px,7vw,70px)",background:"rgba(240,192,64,.25)"}}/>
        </div>
        {/* 1 PT */}
        <div style={{textAlign:"center",opacity:0,animation:"tvadScaleIn .9s cubic-bezier(.34,1.56,.64,1) 3.0s both"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(72px,16vw,160px)",lineHeight:1,color:"rgba(255,255,255,.55)",filter:"drop-shadow(0 0 20px rgba(255,255,255,.12))"}}>1</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(14px,2.5vw,24px)",letterSpacing:5,color:"rgba(255,255,255,.45)",marginTop:-4}}>POINT</div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.6vw,13px)",color:"rgba(255,255,255,.3)",marginTop:6,letterSpacing:2}}>CORRECT WINNER</div>
        </div>
      </div>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(12px,2.2vw,20px)",letterSpacing:6,color:"rgba(255,255,255,.35)",marginTop:"clamp(20px,3.5vw,40px)",opacity:0,animation:"tvadFadeUp .8s ease 4.2s both"}}>EVERY MATCH · EVERY POINT · COUNTS</div>
    </div>
  );
}

/* ── NEW SLIDE: WIN THE GRAND PRIZE ──────────────────────────────────────── */
function TVAdSlideWin() {
  return (
    <div className="tvad-slide" style={{gap:0,overflow:"hidden"}}>
      {[280,420,580].map((s,i) => (
        <div key={i} style={{position:"absolute",width:s,height:s,borderRadius:"50%",border:`1px solid rgba(240,192,64,${0.12-i*0.04})`,top:"50%",left:"50%",transform:"translate(-50%,-50%)",animation:`tvadRotateRing ${18+i*9}s linear infinite`,animationDirection:i%2?"reverse":"normal",pointerEvents:"none"}}/>
      ))}
      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",gap:"clamp(8px,1.6vw,16px)"}}>
        <div style={{fontSize:"clamp(48px,9vw,86px)",opacity:0,animation:"tvadCrownDrop .9s cubic-bezier(.34,1.56,.64,1) .3s both",filter:"drop-shadow(0 0 28px rgba(240,192,64,.8))"}}>👑</div>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(10px,1.8vw,13px)",letterSpacing:8,color:"rgba(240,192,64,.6)",opacity:0,animation:"tvadFadeUp .6s ease 1.2s both"}}>THE ULTIMATE PREDICTOR</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(28px,6vw,70px)",letterSpacing:3,color:"#fff",lineHeight:1,opacity:0,animation:"tvadFadeUp .8s ease 1.7s both"}}>WINS THE</div>
        <div style={{opacity:0,animation:"tvadScaleIn 1s cubic-bezier(.34,1.56,.64,1) 2.4s both"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(44px,9.5vw,110px)",letterSpacing:2,lineHeight:.95,background:"linear-gradient(135deg,#ffe97a,#F0C040,#fff8d6,#F0C040,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",filter:"drop-shadow(0 0 60px rgba(240,192,64,.55))"}}>GRAND PRIZE</div>
        </div>
        <div style={{width:"clamp(100px,18vw,220px)",height:1,background:"linear-gradient(90deg,transparent,#F0C040,transparent)",transform:"scaleX(0)",transformOrigin:"center",animation:"tvadDividerGrow 1s ease 3.6s forwards",marginTop:4}}/>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(10px,1.8vw,14px)",color:"rgba(255,255,255,.45)",letterSpacing:4,textAlign:"center",maxWidth:480,opacity:0,animation:"tvadFadeUp .7s ease 4.2s both"}}>MOST POINTS AT END OF TOURNAMENT</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(16px,3.2vw,34px)",letterSpacing:8,color:"#F0C040",marginTop:4,opacity:0,animation:"tvadNeonFlicker .1s ease 5.0s both, tvadLivePulse 2.5s ease 5.3s infinite"}}>WILL IT BE YOU?</div>
      </div>
    </div>
  );
}

/* ── NEW SLIDE: THE PRIZES ───────────────────────────────────────────────── */
function TVAdSlidePrizes() {
  const possibles = [
    {ico:"🍽️", name:"FREE ITEMS",     desc:"Food & drinks on the house",     col:"rgba(240,192,64,.7)",  delay:3.4},
    {ico:"💳",  name:"CREDITS",        desc:"Order credits at El Mundo",       col:"rgba(200,200,200,.6)", delay:4.1},
    {ico:"🎁",  name:"PHYSICAL GIFT",  desc:"Real prizes, wrapped surprises",  col:"rgba(205,127,50,.7)", delay:4.8},
    {ico:"✨",  name:"MYSTERY PRIZE",  desc:"You won't know until you open it",col:"rgba(180,180,255,.55)",delay:5.5},
  ];
  return (
    <div className="tvad-slide" style={{gap:0,overflow:"hidden"}}>
      <div style={{position:"absolute",top:"40%",left:"50%",transform:"translateX(-50%)",width:"90vw",height:"60vh",background:"radial-gradient(ellipse,rgba(240,192,64,.07) 0%,transparent 65%)",pointerEvents:"none"}}/>
      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",gap:0,width:"100%",maxWidth:800}}>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(10px,1.8vw,13px)",letterSpacing:8,color:"rgba(240,192,64,.65)",opacity:0,animation:"tvadFadeUp .6s ease .2s both",marginBottom:8}}>THIS TOURNAMENT</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(26px,5vw,58px)",letterSpacing:3,color:"#fff",opacity:0,animation:"tvadFadeUp .8s ease .4s both",marginBottom:"clamp(14px,2.4vw,22px)"}}>THE PRIZES</div>

        {/* 1st place hero card */}
        <div style={{position:"relative",width:"100%",background:"linear-gradient(135deg,rgba(240,192,64,.14),rgba(240,192,64,.04),rgba(240,192,64,.1))",border:"1px solid rgba(240,192,64,.45)",borderRadius:16,padding:"clamp(14px,2.4vw,24px) clamp(18px,3vw,32px)",display:"flex",alignItems:"center",gap:"clamp(14px,2.6vw,28px)",marginBottom:"clamp(10px,1.8vw,18px)",opacity:0,animation:"tvadFlipIn .9s cubic-bezier(.16,1,.3,1) .8s both",boxShadow:"0 0 80px rgba(240,192,64,.1),inset 0 1px 0 rgba(240,192,64,.2)"}}>
          {[{top:"14%",right:"5%"},{top:"68%",right:"3%"},{top:"38%",right:"8%"}].map((p,i)=>(
            <div key={i} style={{position:"absolute",top:p.top,right:p.right,width:5,height:5,borderRadius:"50%",background:"#F0C040",animation:`tvadLivePulse ${1.4+i*.6}s ease-in-out ${i*.35}s infinite`,boxShadow:"0 0 10px 2px rgba(240,192,64,.9)"}}/>
          ))}
          <div style={{fontSize:"clamp(40px,8.5vw,76px)",filter:"drop-shadow(0 0 24px rgba(240,192,64,.85))",animation:"tvadLivePulse 3s ease-in-out 2s infinite"}}>🥇</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.5vw,12px)",letterSpacing:6,color:"rgba(240,192,64,.6)",marginBottom:4}}>1ST PLACE — GUARANTEED</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(20px,4.5vw,52px)",letterSpacing:3,background:"linear-gradient(135deg,#ffe97a,#F0C040,#fff8d6,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1,filter:"drop-shadow(0 0 24px rgba(240,192,64,.5))"}}>FOOSBALL TABLE</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(10px,1.6vw,14px)",color:"rgba(255,255,255,.4)",marginTop:5,letterSpacing:1}}>The player with most points takes it home ⚽</div>
          </div>
        </div>

        {/* Divider with label */}
        <div style={{display:"flex",alignItems:"center",gap:12,width:"100%",marginBottom:"clamp(10px,1.8vw,16px)",opacity:0,animation:"tvadFadeUp .6s ease 3.0s both"}}>
          <div style={{flex:1,height:1,background:"linear-gradient(90deg,transparent,rgba(255,255,255,.12))"}}/>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(8px,1.4vw,11px)",letterSpacing:5,color:"rgba(255,255,255,.35)",whiteSpace:"nowrap"}}>OTHER TOP FINISHERS MAY WIN</div>
          <div style={{flex:1,height:1,background:"linear-gradient(90deg,rgba(255,255,255,.12),transparent)"}}/>
        </div>

        {/* Possible prizes grid */}
        <div style={{display:"flex",gap:"clamp(6px,1.2vw,12px)",width:"100%",marginBottom:"clamp(8px,1.5vw,14px)"}}>
          {possibles.map((p,i)=>(
            <div key={i} style={{flex:1,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",borderRadius:10,padding:"clamp(10px,1.8vw,16px) clamp(8px,1.4vw,12px)",textAlign:"center",opacity:0,animation:`tvadFlipIn .65s cubic-bezier(.16,1,.3,1) ${p.delay}s both`}}>
              <div style={{fontSize:"clamp(20px,3.8vw,34px)",marginBottom:5,filter:`drop-shadow(0 0 8px ${p.col})`}}>{p.ico}</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(10px,1.8vw,15px)",letterSpacing:2,color:p.col}}>{p.name}</div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(7px,1.2vw,10px)",color:"rgba(255,255,255,.28)",marginTop:3,lineHeight:1.4}}>{p.desc}</div>
            </div>
          ))}
        </div>

        {/* Surprise note + claim hint */}
        <div style={{display:"flex",alignItems:"center",gap:10,opacity:0,animation:"tvadFadeUp .7s ease 6.4s both"}}>
          <div style={{flex:1,height:1,background:"linear-gradient(90deg,transparent,rgba(240,192,64,.2))"}}/>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(8px,1.4vw,11px)",color:"rgba(255,255,255,.35)",letterSpacing:1.5,textAlign:"center"}}>
            Prizes are a <span style={{color:"rgba(240,192,64,.7)"}}>surprise</span> — check{" "}
            <span style={{color:"rgba(240,192,64,.85)",fontFamily:"'Anton',sans-serif",letterSpacing:2}}>MY PROFILE → GIFTS 🎁</span>
          </div>
          <div style={{flex:1,height:1,background:"linear-gradient(90deg,rgba(240,192,64,.2),transparent)"}}/>
        </div>
      </div>
    </div>
  );
}

/* ── NEW SLIDE: REGISTER & WIN ───────────────────────────────────────────── */
function TVAdSlideRegisterWin() {
  const G = {background:"linear-gradient(135deg,#ffe97a,#F0C040,#fff8d6,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent"};
  const qrW = Math.min(148, Math.round(window.innerWidth * 0.12));
  const steps = [
    {ico:"📲",t:"REGISTER FREE",    d:"Create your account in seconds",delay:1.3},
    {ico:"⚽",t:"PREDICT MATCHES",  d:"Enter your score before kick-off", delay:2.2},
    {ico:"📈",t:"EARN POINTS",      d:"5 pts exact · 1 pt correct winner",delay:3.1},
    {ico:"🎁",t:"CLAIM YOUR PRIZE", d:"My Profile → GIFTS tab",           delay:4.0},
  ];
  return (
    <div className="tvad-slide" style={{gap:0}}>
      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.6vw,12px)",letterSpacing:8,color:"rgba(240,192,64,.6)",opacity:0,animation:"tvadFadeUp .5s ease .1s both",marginBottom:6}}>READY TO WIN?</div>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(24px,5vw,58px)",letterSpacing:3,...G,lineHeight:1,filter:"drop-shadow(0 0 36px rgba(240,192,64,.45))",opacity:0,animation:"tvadScaleIn .9s cubic-bezier(.34,1.56,.64,1) .4s both",marginBottom:"clamp(16px,2.8vw,32px)"}}>YOUR PRIZE AWAITS</div>
      <div style={{display:"flex",gap:"clamp(24px,4.5vw,56px)",alignItems:"flex-start",width:"100%",maxWidth:780}}>
        {/* Steps */}
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:"clamp(10px,1.8vw,18px)"}}>
          {steps.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:"clamp(10px,1.8vw,16px)",opacity:0,animation:`tvadSlideFromLeft .6s cubic-bezier(.16,1,.3,1) ${s.delay}s both`}}>
              <div style={{width:"clamp(38px,5.5vw,52px)",height:"clamp(38px,5.5vw,52px)",borderRadius:12,background:i===3?"rgba(240,192,64,.14)":"rgba(255,255,255,.04)",border:`1px solid rgba(240,192,64,${i===3?.55:.18})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"clamp(16px,2.8vw,24px)",flexShrink:0,boxShadow:i===3?"0 0 20px rgba(240,192,64,.2)":"none"}}>
                {s.ico}
              </div>
              <div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(12px,2vw,18px)",letterSpacing:3,color:i===3?"#F0C040":"rgba(255,255,255,.85)"}}>{s.t}</div>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.5vw,12px)",color:"rgba(255,255,255,.35)",marginTop:2}}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
        {/* QR */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,opacity:0,animation:"tvadScaleIn .8s cubic-bezier(.34,1.56,.64,1) 1.8s both"}}>
          <div style={{padding:"clamp(10px,1.6vw,14px)",background:"#fff",borderRadius:14,boxShadow:"0 0 60px rgba(240,192,64,.5),0 0 120px rgba(240,192,64,.18)",animation:"tvadQRGlow 2.5s ease-in-out 3s infinite"}}>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://elmundo-world-cup.com&bgcolor=ffffff&color=000000&format=png&margin=6" alt="QR" style={{width:qrW,height:qrW,display:"block"}}/>
          </div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(10px,1.8vw,14px)",letterSpacing:4,...G,textAlign:"center",lineHeight:1.5,opacity:0,animation:"tvadFadeUp .6s ease 3.2s both"}}>SCAN TO<br/>REGISTER</div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(8px,1.3vw,11px)",color:"rgba(255,255,255,.28)",letterSpacing:2}}>elmundo-world-cup.com</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(9px,1.6vw,12px)",letterSpacing:3,color:"rgba(240,192,64,.5)",opacity:0,animation:"tvadNeonFlicker .1s ease 5s both,tvadLivePulse 2s ease 5.3s infinite",textAlign:"center"}}>IT'S FREE</div>
        </div>
      </div>
    </div>
  );
}

/* ── QR GRAND FINALE ─────────────────────────────────────────────────────── */
function TVAdSlideQR() {
  const { evLabel } = useEvt();
  const G = {background:"linear-gradient(135deg,#ffe97a,#F0C040,#fff8d6,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent"};
  const qrSize = Math.min(300, Math.round(window.innerWidth * 0.24));

  return (
    <div className="tvad-slide" style={{padding:0,overflow:"hidden"}}>
      <div className="tvad-scanline-overlay"/>

      {/* Gold atmosphere glow */}
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 65% 70% at 50% 52%,rgba(240,192,64,.11) 0%,rgba(240,192,64,.03) 45%,transparent 70%)",pointerEvents:"none"}}/>

      {/* Corner bracket accents */}
      {[[false,false],[false,true],[true,false],[true,true]].map(([bottom,right],i) => (
        <div key={i} style={{
          position:"absolute",
          top:    bottom ? "auto" : "clamp(14px,2.5vw,26px)",
          bottom: bottom ? "clamp(14px,2.5vw,26px)" : "auto",
          left:   right  ? "auto" : "clamp(14px,2.5vw,26px)",
          right:  right  ? "clamp(14px,2.5vw,26px)" : "auto",
          width:"clamp(18px,3vw,30px)", height:"clamp(18px,3vw,30px)",
          borderTop:    bottom ? "none" : "2px solid rgba(240,192,64,.4)",
          borderBottom: bottom ? "2px solid rgba(240,192,64,.4)" : "none",
          borderLeft:   right  ? "none" : "2px solid rgba(240,192,64,.4)",
          borderRight:  right  ? "2px solid rgba(240,192,64,.4)" : "none",
          opacity:0, animation:`tvadFadeUp .5s ease ${.2+i*.08}s both`,
        }}/>
      ))}

      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",width:"100%",gap:0}}>

        {/* Eyebrow */}
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.5vw,12px)",letterSpacing:10,color:"rgba(240,192,64,.5)",opacity:0,animation:"tvadFadeUp .6s ease .3s both",marginBottom:"clamp(8px,1.4vw,14px)"}}>SCAN TO PLAY · IT'S FREE</div>

        {/* SCAN THIS — per-letter gold reveal */}
        <div style={{display:"flex",alignItems:"flex-end",gap:"clamp(2px,0.4vw,4px)",marginBottom:"clamp(14px,2.4vw,22px)",overflow:"hidden"}}>
          {"SCAN THIS".split("").map((l, i) => (
            <span key={i} style={{
              fontFamily:"'Anton',sans-serif",
              fontSize: l === " " ? "clamp(18px,3vw,32px)" : "clamp(38px,7.8vw,86px)",
              lineHeight:1, display:"inline-block",
              ...(l === " " ? {width:"clamp(16px,2.5vw,24px)"} : {}),
              ...(l === " " ? {color:"transparent"} : G),
              filter: l === " " ? "none" : "drop-shadow(0 0 30px rgba(240,192,64,.6))",
              opacity: l === " " ? 1 : 0,
              animation: l === " " ? "none" : `tvadLetterIn .42s cubic-bezier(.16,1,.3,1) ${.5+i*.06}s both`,
            }}>{l === " " ? "\u00a0" : l}</span>
          ))}
        </div>

        {/* BIG QR — orbit rings + golden scan beam */}
        <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",opacity:0,animation:"tvadScaleIn 1.1s cubic-bezier(.34,1.56,.64,1) 1.3s both"}}>
          {/* Ring 1 — close, fast */}
          <div style={{position:"absolute",inset:-34,borderRadius:"50%",border:"1.5px solid rgba(240,192,64,.28)",animation:"tvadRotateRing 7s linear infinite",pointerEvents:"none"}}/>
          {/* Ring 2 — medium, counter */}
          <div style={{position:"absolute",inset:-56,borderRadius:"50%",border:"1px dashed rgba(240,192,64,.15)",animation:"tvadRotateRing 14s linear infinite reverse",pointerEvents:"none"}}/>
          {/* Ring 3 — wide, slow */}
          <div style={{position:"absolute",inset:-80,borderRadius:"50%",border:"1px solid rgba(240,192,64,.07)",animation:"tvadRotateRing 26s linear infinite",pointerEvents:"none"}}/>
          {/* Ring 4 — widest, dotted counter */}
          <div style={{position:"absolute",inset:-108,borderRadius:"50%",border:"1px dashed rgba(240,192,64,.04)",animation:"tvadRotateRing 40s linear infinite reverse",pointerEvents:"none"}}/>

          {/* QR card */}
          <div style={{position:"relative",overflow:"hidden",borderRadius:20,padding:"clamp(16px,2.4vw,24px)",background:"#0a0800",border:"2px solid rgba(240,192,64,.6)",animation:"tvadQRGlow 2.4s ease-in-out 2.4s infinite"}}>
            {/* Gold scan beam */}
            <div style={{
              position:"absolute",left:0,right:0,height:4,zIndex:3,pointerEvents:"none",
              background:"linear-gradient(90deg,transparent 0%,rgba(240,192,64,.95) 40%,rgba(255,255,200,1) 50%,rgba(240,192,64,.95) 60%,transparent 100%)",
              boxShadow:"0 0 16px 6px rgba(240,192,64,.5), 0 0 40px 10px rgba(240,192,64,.2)",
              animation:"tvadQRScan 2.6s ease-in-out 2.5s infinite",
            }}/>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=https://elmundo-world-cup.com&bgcolor=0a0800&color=F0C040&format=png&margin=12`}
              alt="Scan to join"
              style={{width:qrSize, height:qrSize, display:"block", position:"relative", zIndex:1}}
            />
          </div>
        </div>

        {/* URL — big gold */}
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(15px,3vw,30px)",letterSpacing:4,...G,marginTop:"clamp(18px,2.8vw,28px)",filter:"drop-shadow(0 0 24px rgba(240,192,64,.45))",opacity:0,animation:"tvadFadeUp .9s ease 2.8s both"}}>ELMUNDO-WORLD-CUP.COM</div>

        {/* Divider */}
        <div style={{width:"clamp(60px,14vw,180px)",height:1,background:"linear-gradient(90deg,transparent,rgba(240,192,64,.4),transparent)",margin:"clamp(10px,1.6vw,16px) 0",opacity:0,animation:"tvadDividerGrow 1.1s ease 3.5s forwards"}}/>

        {/* Tagline */}
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.6vw,13px)",letterSpacing:5,color:"rgba(255,255,255,.35)",opacity:0,animation:"tvadFadeUp .6s ease 4.0s both"}}>{evLabel} PREDICTION GAME · FREE TO PLAY</div>
      </div>
    </div>
  );
}

/* ── EXACT SCORE CINEMATIC CELEBRATION ──────────────────────────────────── */
function ExactScoreCelebration({ data, onClose }) {
  const { match: m, pred, prevRank, newRank } = data;
  const canvasRef       = useRef(null);
  const rafRef          = useRef(null);
  const partsRef        = useRef([]);
  const confettiStarted = useRef(false);   // prevent restart on phase change
  const [phase, setPhase] = useState(0);

  // Phase timeline
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 900),
      setTimeout(() => setPhase(2), 2400),
      setTimeout(() => setPhase(3), 3200),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Canvas confetti + gold burst — fires ONCE when phase reaches 3
  useEffect(() => {
    if (phase < 3 || confettiStarted.current) return;
    confettiStarted.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    const cx = W / 2, cy = H * 0.4;

    const COLS = ["#F0C040","#FFD700","#fff","#FF6B6B","#4ECDC4","#45B7D1","#F8B4D9","#96CEB4","#FFA500"];
    const particles = [];

    // Gold star burst radiating from center
    for (let i = 0; i < 100; i++) {
      const angle = (i / 100) * Math.PI * 2;
      const speed = 3 + Math.random() * 12;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2,
        color: i % 3 === 0 ? "#fff" : "#F0C040",
        r: 2.5 + Math.random() * 5.5,
        life: 1, decay: 0.008 + Math.random() * 0.007,
        rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.25,
        type: "star",
      });
    }
    // Coloured confetti rain from top
    for (let i = 0; i < 160; i++) {
      const col = COLS[Math.floor(Math.random() * COLS.length)];
      particles.push({
        x: Math.random() * W, y: -20 - Math.random() * 160,
        vx: (Math.random() - 0.5) * 4, vy: 1.5 + Math.random() * 5,
        color: col,
        w: 6 + Math.random() * 10, h: 3 + Math.random() * 5,
        life: 1, decay: 0.0025 + Math.random() * 0.004,
        rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.20,
        type: "rect",
      });
    }
    partsRef.current = particles;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      partsRef.current = partsRef.current.filter(p => p.life > 0.02);
      partsRef.current.forEach(p => {
        ctx.save();
        ctx.globalAlpha = Math.min(p.life * 1.2, 0.98);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.type === "star") {
          ctx.beginPath();
          for (let j = 0; j < 5; j++) {
            const a = (j * 4 * Math.PI / 5) - Math.PI / 2;
            const r = j % 2 === 0 ? p.r : p.r * 0.42;
            j === 0 ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r) : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
          }
          ctx.closePath();
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.fill();
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        }
        ctx.restore();
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.06; p.vx *= 0.994;
        p.rot += p.rotV; p.life -= p.decay;
      });
      if (partsRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => { /* intentionally no cancel — let particles finish */ };
  }, [phase]);

  // Cleanup RAF on unmount only
  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const rankMoved = prevRank > 0 && newRank > 0 && newRank !== prevRank;

  return createPortal(
    <div style={{position:"fixed",inset:0,zIndex:9900,background:"rgba(0,0,0,.93)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
      <canvas ref={canvasRef} style={{position:"absolute",inset:0,pointerEvents:"none"}}/>
      <div style={{position:"relative",zIndex:1,textAlign:"center",padding:"0 28px",width:"100%",maxWidth:420}}>

        {/* YOU NAILED IT */}
        <div style={{
          fontFamily:"'Anton',sans-serif",
          fontSize:"clamp(26px,9vw,62px)",
          letterSpacing:3,
          color:"#F0C040",
          textShadow:"0 0 60px rgba(240,192,64,.9)",
          transform: phase >= 0 ? "translateY(0) scale(1)" : "translateY(40px) scale(.7)",
          opacity: phase >= 0 ? 1 : 0,
          transition:"all .9s cubic-bezier(.34,1.56,.64,1)",
          lineHeight:1, marginBottom:6,
        }}>YOU NAILED IT</div>
        <div style={{
          fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,2.2vw,13px)",
          letterSpacing:7,color:"rgba(255,255,255,.4)",
          opacity: phase >= 0 ? 1 : 0,
          transition:"opacity .7s ease .4s",
          marginBottom:32,
        }}>EXACT SCORE PREDICTION</div>

        {/* Score comparison — phase 1 */}
        <div style={{
          display:"flex",alignItems:"center",justifyContent:"center",gap:"clamp(12px,5vw,32px)",
          marginBottom:28,
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? "translateY(0)" : "translateY(20px)",
          transition:"all .7s cubic-bezier(.34,1.56,.64,1)",
        }}>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,letterSpacing:5,color:"rgba(255,255,255,.3)",marginBottom:8}}>RESULT</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(38px,12vw,80px)",color:"#fff",lineHeight:1,textShadow:"0 0 24px rgba(255,255,255,.25)"}}>{m.hs}–{m.as}</div>
          </div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:28,color:"rgba(255,255,255,.18)"}}>≡</div>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,letterSpacing:5,color:"rgba(255,255,255,.3)",marginBottom:8}}>YOUR PICK</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(38px,12vw,80px)",color:"#F0C040",lineHeight:1,textShadow:"0 0 40px rgba(240,192,64,.7)"}}>{pred.h}–{pred.a}</div>
          </div>
        </div>

        {/* EXACT SCORE badge — phase 2 */}
        {phase >= 2 && (
          <div style={{
            display:"inline-block",
            fontFamily:"'Anton',sans-serif",
            fontSize:"clamp(16px,4.5vw,36px)",
            letterSpacing:5,
            color:"#000",
            background:"linear-gradient(135deg,#F0C040,#FFD700)",
            padding:"10px 28px",borderRadius:4,
            marginBottom:24,
            animation:"exactBadgePop .55s cubic-bezier(.34,1.56,.64,1) both",
            boxShadow:"0 0 70px rgba(240,192,64,.9), 0 0 140px rgba(240,192,64,.4)",
          }}>EXACT SCORE ✓</div>
        )}

        {/* +5 PTS — phase 3 */}
        {phase >= 3 && (
          <div style={{
            fontFamily:"'Anton',sans-serif",
            fontSize:"clamp(44px,14vw,100px)",
            color:"#F0C040",lineHeight:1,
            animation:"pts5Erupt .9s cubic-bezier(.34,1.56,.64,1) both",
            textShadow:"0 0 100px rgba(240,192,64,1), 0 0 40px rgba(240,192,64,.8)",
            marginBottom:14,
          }}>+5 PTS</div>
        )}

        {/* Match name */}
        {phase >= 1 && (
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(10px,2vw,14px)",letterSpacing:2,color:"rgba(255,255,255,.28)",marginBottom:14}}>
            {m.home} vs {m.away}
          </div>
        )}

        {/* Rank movement — phase 4 */}
        {phase >= 4 && rankMoved && (
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:10,animation:"tvadFadeUp .5s ease both"}}>
            📈 Rank: #{prevRank} → #{newRank}
          </div>
        )}

        {/* Close — phase 4 */}
        {phase >= 4 && (
          <button onClick={onClose} style={{
            fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:4,
            background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.18)",
            color:"rgba(255,255,255,.65)",padding:"13px 40px",borderRadius:4,
            cursor:"pointer",animation:"tvadFadeUp .5s ease .1s both",marginTop:4,
          }}>CLOSE</button>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ── POST-MATCH RESULT CARD ──────────────────────────────────────────────── */
function PostMatchCard({ data, onClose }) {
  const { match: m, pred, earned, prevRank, newRank } = data;

  // Exact score → cinematic celebration
  if (earned === 5) return <ExactScoreCelebration data={data} onClose={onClose} />;

  const winner = earned === 1;
  const wrong  = pred && earned === 0;
  const missed = !pred;

  const accentColor = winner ? "#4ade80" : wrong ? "#f87171" : "rgba(255,255,255,.3)";
  const borderColor = winner ? "rgba(74,222,128,.35)" : "rgba(255,255,255,.1)";
  const emoji       = winner ? "✅" : wrong ? "😬" : "😶";
  const headline    = winner ? "CORRECT WINNER" : wrong ? "WRONG PREDICTION" : "NO PREDICTION MADE";

  const rankMoved = prevRank > 0 && newRank > 0 && newRank !== prevRank;

  return (
    <div className="pmcard-overlay" onClick={onClose}>
      <div className="pmcard" style={{border:`1px solid ${borderColor}`}} onClick={e => e.stopPropagation()}>

        {/* Emoji + headline */}
        <div style={{fontSize:44,marginBottom:8}}>{emoji}</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:5,color:accentColor,marginBottom:4}}>{headline}</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:17,color:"rgba(255,255,255,.85)",marginBottom:20,letterSpacing:1}}>{m.home} vs {m.away}</div>

        {/* Score side-by-side */}
        <div className="pmcard-scores">
          <div className="pmcard-score-block">
            <span className="pmcard-score-label">RESULT</span>
            <span className="pmcard-score-val" style={{color:"#fff"}}>{m.hs}–{m.as}</span>
          </div>
          <span className="pmcard-vs">vs</span>
          <div className="pmcard-score-block">
            <span className="pmcard-score-label">YOUR PICK</span>
            <span className="pmcard-score-val" style={{color: accentColor}}>
              {pred ? `${pred.h}–${pred.a}` : "—"}
            </span>
          </div>
        </div>

        {/* Points earned */}
        <div style={{
          fontFamily:"'Anton',sans-serif",
          fontSize: earned > 0 ? 36 : 20,
          color: earned > 0 ? "#F0C040" : "rgba(255,255,255,.25)",
          marginBottom: 10,
          lineHeight: 1,
        }}>
          {earned > 0 ? `+${earned} PTS` : "0 PTS"}
        </div>

        {/* Rank line */}
        {newRank > 0 && (
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.35)",marginBottom:4}}>
            {rankMoved
              ? `📈 Rank moved from #${prevRank} → #${newRank}`
              : `Your rank: #${newRank}`}
          </div>
        )}

        <button className="pmcard-close" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

const TVAD_DURATIONS = [11000, 12000, 11000, 12000, 14000, 13000, 11000, 13000, 14000, 13000, 24000, 18000];
const TVAD_COUNT = TVAD_DURATIONS.length;

function TVAdView({ onBack, matches = [], board = [] }) {
  const [slide, setSlide] = useState(0);
  const [tick,  setTick]  = useState(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setSlide(s => { const next = (s + 1) % TVAD_COUNT; return next; });
      setTick(t => t + 1);
    }, TVAD_DURATIONS[slide]);
    return () => clearTimeout(id);
  }, [slide]);

  const goTo = (i) => { setSlide(i); setTick(t => t + 1); };

  return (
    <div className="tvad-root">
      <TVParticles />
      <div className="tv-vignette" />
      <button className="tv-back-btn" onClick={onBack} style={{position:"fixed",top:16,left:16,zIndex:30}}>← EXIT</button>
      <div className="tvad-progress">
        {Array.from({length:TVAD_COUNT}).map((_,i) => (
          <div key={i} className={`tvad-prog-seg${i<slide?" tvad-seg-done":""}`} onClick={()=>goTo(i)}>
            {i===slide && <div key={tick} className="tvad-seg-fill" style={{animationDuration:`${TVAD_DURATIONS[slide]}ms`}} />}
          </div>
        ))}
      </div>
      {slide===0 && <TVAdSlideC key={`c-${tick}`} />}
      {slide===1 && <TVAdSlideD key={`d-${tick}`} matches={matches} />}
      {slide===2 && <TVAdSlideB key={`b-${tick}`} />}
      {slide===3 && <TVAdSlideA key={`a-${tick}`} />}
      {slide===4 && <TVAdSlideF key={`f-${tick}`} />}
      {slide===5 && <TVAdSlideHowTo key={`how-${tick}`} />}
      {slide===6 && <TVAdSlidePoints key={`pts-${tick}`} />}
      {slide===7 && <TVAdSlideWin key={`win-${tick}`} />}
      {slide===8 && <TVAdSlidePrizes key={`prz-${tick}`} />}
      {slide===9 && <TVAdSlideRegisterWin key={`reg-${tick}`} />}
      {slide===10 && <TVLeaderboard key={`lb-${tick}`} board={board} inAd={true} onBack={null} />}
      {slide===11 && <TVAdSlideQR key={`qr-${tick}`} />}
    </div>
  );
}

function AdminTVAds({ onLaunch }) {
  const slides = [
    {n:"C",title:"PARTICLE EXPLOSION",desc:"Canvas firework burst → text forms from gold particles"},
    {n:"D",title:"COUNTDOWN URGENCY",desc:"Live countdown to next match + QR code"},
    {n:"B",title:"LIVE SCORE TICKER",desc:"Split screen — live match + predict CTA"},
    {n:"A",title:"CINEMATIC REVEAL",desc:"Letter-by-letter title → Register Now + QR"},
    {n:"F",title:"LUXURY MINIMAL",desc:"Hotel-menu word reveals · rotating ring · elmundobonaire.com"},
  ];
  return (
    <div style={{padding:"28px 20px"}}>
      <div style={{maxWidth:520,margin:"0 auto"}}>
        <div style={{background:"rgba(240,192,64,.05)",border:"1px solid rgba(240,192,64,.18)",borderRadius:16,padding:"28px 24px",textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:36,marginBottom:10}}>📺</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:15,letterSpacing:3,color:"#fff",marginBottom:6}}>TV ADVERTISEMENT MODE</div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.35)",lineHeight:1.7,marginBottom:22}}>
            5 premium animated slides · Per-slide durations<br/>Story-style progress bar · Gold particles background
          </div>
          <button onClick={onLaunch} style={{
            width:"100%",padding:"15px 0",
            background:"linear-gradient(135deg,rgba(240,192,64,.18),rgba(240,192,64,.08))",
            border:"1px solid rgba(240,192,64,.45)",color:"#F0C040",
            fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:3,
            cursor:"pointer",borderRadius:10,transition:"all .2s",
          }}
          onMouseEnter={e=>e.currentTarget.style.background="linear-gradient(135deg,rgba(240,192,64,.28),rgba(240,192,64,.14))"}
          onMouseLeave={e=>e.currentTarget.style.background="linear-gradient(135deg,rgba(240,192,64,.18),rgba(240,192,64,.08))"}>
            🎬  LAUNCH TV ADS — FULL SCREEN
          </button>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.18)",marginTop:10}}>Opens full screen — click EXIT to return</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {slides.map(s=>(
            <div key={s.n} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 16px",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:10}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2,color:"rgba(240,192,64,.4)",minWidth:24}}>{s.n}</div>
              <div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2,color:"rgba(255,255,255,.7)"}}>{s.title}</div>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.3)",marginTop:2}}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   EVENT CLOSED SPLASH
═══════════════════════════════════════════════════════════════════════════ */
function EventClosedSplash({ eventName, eventYear, user, preds, matches, board, onLogout }) {
  const [showRecap, setShowRecap] = useState(false);
  const fin = matches.filter(m => m.status === "finished");
  const hasStats = fin.length > 0 && user;

  return (
    <div className="ec-splash">
      {/* Ambient glow orbs */}
      <div className="ec-orb ec-orb1" />
      <div className="ec-orb ec-orb2" />

      <div className="ec-content">
        {/* Logo */}
        <div className="ec-logo-wrap">
          <svg viewBox="0 0 200 200" className="ec-logo-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="100" cy="100" r="88" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
            <circle cx="100" cy="100" r="70" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
            <text x="100" y="95" textAnchor="middle" fontFamily="Anton" fontSize="28" fill="white" letterSpacing="4">EL MUNDO</text>
            <text x="100" y="122" textAnchor="middle" fontFamily="Anton" fontSize="13" fill="rgba(255,255,255,0.5)" letterSpacing="6">BAR · REST</text>
            <circle cx="100" cy="140" r="3" fill="rgba(255,255,255,0.3)"/>
          </svg>
        </div>

        {/* Event badge */}
        <div className="ec-event-badge">
          <span className="ec-event-ico">⚽</span>
          <span className="ec-event-name">{eventName} {eventYear}</span>
        </div>

        {/* Main message */}
        <div className="ec-headline">THANKS FOR PLAYING</div>
        <div className="ec-sub">Stay close — we'll be back next year.</div>

        {/* Divider */}
        <div className="ec-divider" />

        {/* User actions */}
        {user && (
          <div className="ec-actions">
            {hasStats && (
              <button className="ec-recap-btn" onClick={() => setShowRecap(true)}>
                🎬 VIEW MY {eventYear} RECAP
              </button>
            )}
            <button className="ec-logout-btn" onClick={onLogout}>
              Sign out
            </button>
          </div>
        )}
      </div>

      {showRecap && (
        <PredictionRecapModal
          user={user} preds={preds} matches={matches} board={board}
          appSettings={{ eventName, eventYear }}
          onClose={() => setShowRecap(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREDICTION RECAP MODAL
═══════════════════════════════════════════════════════════════════════════ */
function PredictionRecapModal({ user, preds, matches, board, appSettings = {}, onClose }) {
  const [phase, setPhase]     = useState(0); // 0=stats, 1=highlights, 2=share
  const [cardUrl, setCardUrl] = useState(null);
  const [generating, setGenerating] = useState(false);

  const eventName = appSettings.eventName || "WORLD CUP";
  const eventYear = appSettings.eventYear || 2026;
  const uid = user?.id;

  const fin = matches.filter(m => m.status === "finished");
  const finSorted = [...fin].sort((a,b) => new Date(a.kickoff||a.date||0) - new Date(b.kickoff||b.date||0));

  // Stats
  const sub  = fin.filter(m => !!preds[`${uid}__${m.id}`]).length;
  const corr = fin.filter(m => { const p=preds[`${uid}__${m.id}`]; return p&&p.h===m.hs&&p.a===m.as; }).length;
  const acc  = sub > 0 ? Math.round(corr/sub*100) : 0;
  const totalPts = fin.reduce((s,m) => { const p=preds[`${uid}__${m.id}`]; return s + (p ? calcPts(p,m.hs,m.as) : 0); }, 0);
  const myRank = board.findIndex(u => u.id === uid) + 1;

  // Best streak
  let bestStreak = 0, tmp2 = 0;
  for (const m of finSorted) {
    const p = preds[`${uid}__${m.id}`];
    if (p && calcPts(p, m.hs, m.as) > 0) { tmp2++; bestStreak = Math.max(bestStreak, tmp2); }
    else tmp2 = 0;
  }

  // Top 5 scored predictions (highlight reel)
  const highlights = fin
    .map(m => { const p = preds[`${uid}__${m.id}`]; const pts = p ? calcPts(p,m.hs,m.as) : 0; return { m, p, pts }; })
    .filter(x => x.pts > 0)
    .sort((a,b) => b.pts - a.pts)
    .slice(0, 5);

  // Biggest miss — predicted but got 0pts (not just missing, but wrong)
  const misses = fin
    .map(m => { const p = preds[`${uid}__${m.id}`]; return { m, p, pts: p ? calcPts(p,m.hs,m.as) : null }; })
    .filter(x => x.p && x.pts === 0)
    .slice(0, 3);

  // Share card generation
  const generateShareCard = async () => {
    setGenerating(true);
    try {
      await document.fonts.ready;
      const W = 1080, H = 1920; // 9:16 story format
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#050505'; ctx.fillRect(0,0,W,H);
      const bgGrd = ctx.createRadialGradient(W/2,H*0.35,0,W/2,H*0.35,W*0.8);
      bgGrd.addColorStop(0,'rgba(255,255,255,0.05)'); bgGrd.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = bgGrd; ctx.fillRect(0,0,W,H);
      // Dot grid
      ctx.fillStyle = 'rgba(255,255,255,0.018)';
      for(let x=40;x<W;x+=60) for(let y=40;y<H;y+=60){ ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill(); }

      const line = (y2) => {
        const g = ctx.createLinearGradient(80,0,W-80,0);
        g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(0.3,'rgba(255,255,255,0.5)'); g.addColorStop(0.7,'rgba(255,255,255,0.5)'); g.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(80, y2, W-160, 1.5);
      };

      // Header
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '28px Outfit';
      ctx.fillText('EL MUNDO BAR · REST', W/2, 90);
      line(105);

      // Event year
      ctx.fillStyle = '#fff'; ctx.font = 'bold 100px Anton';
      ctx.fillText(`${eventName}`, W/2, 240);
      ctx.font = 'bold 140px Anton';
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillText(`${eventYear}`, W/2, 380);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 140px Anton';
      ctx.fillText(`${eventYear}`, W/2, 376);

      // Player name
      ctx.font = '52px Anton'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText((user.name||'').toUpperCase(), W/2, 500);

      line(530);

      // Stats grid
      const stats = [
        { val: totalPts, label: 'TOTAL PTS' },
        { val: `#${myRank||'—'}`, label: 'FINAL RANK' },
        { val: `${corr}/${sub}`, label: 'CORRECT' },
        { val: `${acc}%`, label: 'ACCURACY' },
      ];
      const sW = W / 2, sH = 200;
      stats.forEach((st, i) => {
        const sx = (i % 2) * sW + sW/2;
        const sy = 600 + Math.floor(i/2) * (sH + 20);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect((i%2)*sW + 30, sy - 60, sW - 60, sH);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 72px Anton';
        ctx.fillText(String(st.val), sx, sy + 20);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '26px Outfit';
        ctx.fillText(st.label, sx, sy + 60);
      });

      line(1070);

      // Highlights
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '24px Outfit';
      ctx.fillText('TOP PREDICTIONS', W/2, 1110);
      highlights.slice(0,3).forEach((h, i) => {
        const hy = 1160 + i * 130;
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(60, hy, W-120, 110);
        ctx.fillStyle = '#fff'; ctx.font = `bold 44px Anton`;
        const label = `${flag(h.m.home)||h.m.home} ${h.m.hs}–${h.m.as} ${flag(h.m.away)||h.m.away}`;
        ctx.fillText(label, W/2, hy + 56);
        ctx.fillStyle = h.pts >= 5 ? '#4ade80' : '#f59e0b';
        ctx.font = '28px Outfit'; ctx.fillText(`+${h.pts} pts`, W/2, hy + 90);
      });

      line(1560);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '28px Outfit';
      ctx.fillText('elmundo-world-cup.com', W/2, 1620);

      // Best streak badge
      if (bestStreak > 1) {
        ctx.fillStyle = '#f59e0b'; ctx.font = 'bold 36px Anton';
        ctx.fillText(`🔥 ${bestStreak} MATCH STREAK`, W/2, 1680);
      }

      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.93));
      const url = URL.createObjectURL(blob);
      setCardUrl(url);
      setPhase(2);
    } finally { setGenerating(false); }
  };

  const handleShare = async () => {
    if (!cardUrl) return;
    if (navigator.share) {
      try {
        const res = await fetch(cardUrl);
        const blob = await res.blob();
        const file = new File([blob], `${(user.name||'player').replace(/\s+/g,'-')}-recap-${eventYear}.jpg`, { type:'image/jpeg' });
        await navigator.share({ files: [file], title: `My ${eventName} ${eventYear} Recap` });
        return;
      } catch {}
    }
    const a = document.createElement('a');
    a.href = cardUrl;
    a.download = `${(user.name||'player').replace(/\s+/g,'-')}-recap-${eventYear}.jpg`;
    a.click();
  };

  const statCards = [
    { val: totalPts, label: "TOTAL PTS", color: "#4ade80" },
    { val: myRank > 0 ? `#${myRank}` : "—", label: "FINAL RANK", color: "#f59e0b" },
    { val: `${corr}/${sub}`, label: "CORRECT", color: "#60a5fa" },
    { val: `${acc}%`, label: "ACCURACY", color: "#a78bfa" },
  ];

  return createPortal(
    <div className="recap-overlay" onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div className="recap-modal">
        <button className="recap-close" onClick={onClose}>✕</button>

        {/* Header */}
        <div className="recap-header">
          <div className="recap-year-badge">{eventName} {eventYear}</div>
          <div className="recap-title">{(user?.name||"").toUpperCase()}</div>
          <div className="recap-subtitle">YOUR SEASON RECAP</div>
        </div>

        {/* Phase 0 & 1: Stats + Highlights */}
        {phase < 2 && (
          <>
            {/* Stats grid */}
            <div className="recap-stats">
              {statCards.map(s => (
                <div key={s.label} className="recap-stat-card">
                  <div className="recap-stat-val" style={{color:s.color}}>{s.val}</div>
                  <div className="recap-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
            {bestStreak > 1 && (
              <div className="recap-streak">🔥 Best streak: <b>{bestStreak}</b> in a row</div>
            )}

            {/* Highlights */}
            {highlights.length > 0 && (
              <div className="recap-section">
                <div className="recap-section-title">🏆 TOP PREDICTIONS</div>
                {highlights.map(({m, pts:p}) => (
                  <div key={m.id} className="recap-highlight">
                    <div className="recap-hl-match">
                      <span>{flag(m.home)}{m.home}</span>
                      <span className="recap-hl-score">{m.hs}–{m.as}</span>
                      <span>{flag(m.away)}{m.away}</span>
                    </div>
                    <div className="recap-hl-pts" style={{color: p>=5 ? "#4ade80" : "#f59e0b"}}>+{p} pts</div>
                  </div>
                ))}
              </div>
            )}

            {/* Misses */}
            {misses.length > 0 && (
              <div className="recap-section">
                <div className="recap-section-title">💔 ONES THAT GOT AWAY</div>
                {misses.map(({m,p}) => (
                  <div key={m.id} className="recap-highlight recap-miss">
                    <div className="recap-hl-match">
                      <span>{flag(m.home)}{m.home}</span>
                      <span className="recap-hl-score">{m.hs}–{m.as}</span>
                      <span>{flag(m.away)}{m.away}</span>
                    </div>
                    <div className="recap-hl-pred">You predicted: {p?.h}–{p?.a}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Generate share card */}
            <div style={{padding:"0 16px 24px"}}>
              <button className="recap-share-btn" onClick={generateShareCard} disabled={generating}>
                {generating ? "⏳ Generating…" : "📲 GENERATE STORY CARD"}
              </button>
            </div>
          </>
        )}

        {/* Phase 2: Share card ready */}
        {phase === 2 && cardUrl && (
          <div style={{padding:"0 16px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,letterSpacing:2,color:"rgba(255,255,255,.5)"}}>YOUR STORY CARD IS READY</div>
            <img src={cardUrl} alt="Recap card" style={{width:"100%",maxWidth:320,borderRadius:12,border:"1px solid rgba(255,255,255,.1)"}} />
            <button className="recap-share-btn" onClick={handleShare}>
              📤 SHARE / DOWNLOAD
            </button>
            <button onClick={() => setPhase(0)} style={{background:"transparent",border:"none",color:"rgba(255,255,255,.4)",fontFamily:"'Outfit',sans-serif",fontSize:12,cursor:"pointer"}}>
              ← Back to stats
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function AdminView({ matches, rules, sponsors, onUpdate, onAdd, onDelete, onSaveRules, onSaveSponsors, menuItems, users, onSaveMenuItem, onDeleteMenuItem, onToggleAvail, onToggleSoldOut, onAddCredits, onUpdateOrderStatus, onDeleteOrder, onLoadAllOrders, allOrders, sponsorGifts, onSetSponsorTier, onSaveSponsorGifts, onBanUsers, onAnnounceWinner, board, onSetFloorplanAccess = ()=>{}, onSetKeepupsAccess = ()=>{}, appSettings = {}, onSaveAppSettings = ()=>{}, sendPush = ()=>{}, onLaunchTVAd = ()=>{} }) {
  const [section, setSection] = useState("dashboard");

  const GROUPS = [
    {
      id: "live",
      label: "LIVE OPS",
      ico: "⚡",
      color: "#ff9500",
      tabs: [
        { id:"dashboard", label:"Dashboard", ico:"📊" },
      ]
    },
    {
      id: "service",
      label: "SERVICE",
      ico: "🍽️",
      color: "#30d158",
      tabs: [
        { id:"menu",          label:"Menu",         ico:"🍔" },
        { id:"tables",        label:"Tables",       ico:"🪑" },
        { id:"tableqr",       label:"Table QR",     ico:"📱" },
        { id:"credits",       label:"Credits",      ico:"💰" },
        { id:"giftCards",     label:"Gift Cards",   ico:"🎫" },
        { id:"fpAccess",      label:"Floor Plan",   ico:"🗺️" },
        { id:"keepupsAccess", label:"Keep-Ups",     ico:"🔔" },
        { id:"appSettings",   label:"App Settings", ico:"⚙️" },
      ]
    },
    {
      id: "game",
      label: "GAME",
      ico: "⚽",
      color: "#0a84ff",
      tabs: [
        { id:"matches",   label:"Matches",        ico:"🏟️" },
        { id:"rules",     label:"Rules",          ico:"📋" },
        { id:"vip",       label:"VIP Perks",      ico:"👑" },
        { id:"gifts",     label:"Gifts",          ico:"🎁" },
        { id:"integrity", label:"Integrity",      ico:"🔒" },
      ]
    },
  ];

  // Find active group
  const activeGroup = GROUPS.find(g => g.tabs.some(t => t.id === section)) || GROUPS[0];

  return (
    <div className="vpad">
      {/* ── Row 1: Group selectors ── */}
      <div style={{
        display:"flex",alignItems:"stretch",gap:0,
        borderBottom:"1px solid rgba(255,255,255,.07)",
        background:"rgba(0,0,0,.25)",
      }}>
        {GROUPS.map(g => {
          const isActive = g.id === activeGroup.id;
          return (
            <button key={g.id} onClick={()=>{ if (!isActive) setSection(g.tabs[0].id); }} style={{
              flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              gap:3,padding:"10px 4px 9px",
              background: isActive ? "rgba(255,255,255,.07)" : "transparent",
              border:"none",
              borderBottom: isActive ? `2px solid ${g.color}` : "2px solid transparent",
              cursor:"pointer",transition:"all .18s",
            }}>
              <span style={{fontSize:17,lineHeight:1}}>{g.ico}</span>
              <span style={{
                fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,
                color: isActive ? "#fff" : "rgba(255,255,255,.4)",
                transition:"color .18s",whiteSpace:"nowrap",
              }}>{g.label}</span>
            </button>
          );
        })}
        {onAnnounceWinner && (
          <button onClick={onAnnounceWinner} style={{
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            gap:3,padding:"10px 10px 9px",
            background:"transparent",border:"none",
            borderBottom:"2px solid transparent",
            cursor:"pointer",flexShrink:0,
          }}>
            <span style={{fontSize:17,lineHeight:1}}>🏆</span>
            <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,200,0,.75)",whiteSpace:"nowrap"}}>WINNER</span>
          </button>
        )}
      </div>

      {/* ── Row 2: Sub-tabs for active group ── */}
      <div style={{
        display:"flex",alignItems:"center",gap:4,
        padding:"8px 10px",
        borderBottom:"1px solid rgba(255,255,255,.06)",
        background:"rgba(255,255,255,.02)",
        overflowX:"auto",overflowY:"hidden",
        WebkitOverflowScrolling:"touch",scrollbarWidth:"none",
      }}>
        {activeGroup.tabs.map(t => {
          const on = section === t.id;
          return (
            <button key={t.id} onClick={()=>setSection(t.id)} style={{
              display:"inline-flex",alignItems:"center",gap:5,
              padding:"7px 12px",borderRadius:20,
              background: on ? "#fff" : "rgba(255,255,255,.06)",
              border: on ? "none" : "1px solid rgba(255,255,255,.1)",
              fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight: on ? 700 : 500,
              color: on ? "#000" : "rgba(255,255,255,.65)",
              cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap",flexShrink:0,
              letterSpacing:.2,
            }}>
              <span style={{fontSize:13,lineHeight:1}}>{t.ico}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      {section === "dashboard"  && <AdminDashboard allOrders={allOrders} users={users} board={board} />}


      {section === "matches"    && <AdminMatches  matches={matches}   onUpdate={onUpdate} onAdd={onAdd} onDelete={onDelete} />}
      {section === "rules"      && <AdminRules    rules={rules}       onSave={onSaveRules} />}
      {section === "sponsors"   && <AdminSponsors sponsors={sponsors} onSave={onSaveSponsors} />}
      {section === "menu"       && <AdminMenu     menuItems={menuItems} onSave={onSaveMenuItem} onDelete={onDeleteMenuItem} onToggleAvail={onToggleAvail} onToggleSoldOut={onToggleSoldOut} />}
      {section === "credits"    && <AdminCredits  users={users} onAddCredits={onAddCredits} />}
      {section === "giftCards"  && <AdminGiftCards />}
      {section === "tables"     && <AdminTables />}
      {section === "tableqr"    && <AdminTableQR />}
      {section === "vip"        && <AdminSponsorPerks users={users} sponsorGifts={sponsorGifts} menuItems={menuItems} onSetTier={onSetSponsorTier} onSaveGifts={onSaveSponsorGifts} />}
      {section === "gifts"      && <AdminGifts users={users} sendPush={sendPush} />}
      {section === "integrity"  && <AdminIntegrity users={users} onBanUsers={onBanUsers} />}
      {section === "fpAccess"      && <AdminFloorplanAccess users={users} onSetAccess={onSetFloorplanAccess} />}
      {section === "keepupsAccess" && <AdminKeepupsAccess  users={users} onSetAccess={onSetKeepupsAccess} />}
      {section === "appSettings"   && <AdminAppSettings appSettings={appSettings} onSave={onSaveAppSettings} />}
    </div>
  );
}

/* ── Admin: App Settings ── */
function AdminAppSettings({ appSettings = {}, onSave }) {
  const s = { showMatches:true, showLeaderboard:true, showMundogram:true, showMenu:true, eventClosed:false, eventYear:2026, eventName:"WORLD CUP", ...appSettings };
  const [eName, setEName] = useState(s.eventName);
  const [eYear, setEYear] = useState(String(s.eventYear));
  const [confirmClose, setConfirmClose] = useState(false);

  const Toggle = ({ label, desc, val, onToggle }) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",background:"rgba(255,255,255,.03)",border:`1px solid ${val?"rgba(255,255,255,.12)":"rgba(255,255,255,.06)"}`,marginBottom:8}}>
      <div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:1,color:val?"#fff":"rgba(255,255,255,.45)"}}>{label}</div>
        {desc && <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:3,fontFamily:"'Outfit',sans-serif"}}>{desc}</div>}
      </div>
      <div onClick={onToggle} style={{width:44,height:24,borderRadius:12,background:val?"#fff":"rgba(255,255,255,.12)",border:`1px solid ${val?"#fff":"rgba(255,255,255,.2)"}`,cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
        <div style={{position:"absolute",top:3,left:val?22:3,width:16,height:16,borderRadius:"50%",background:val?"#000":"rgba(255,255,255,.5)",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}}/>
      </div>
    </div>
  );

  return (
    <div className="vpad">
      <div className="section-banner">
        <div className="sb-label">APP SETTINGS</div>
        <div className="sb-sub">Control which tabs are visible for all users</div>
      </div>
      <div style={{padding:"0 14px 24px"}}>

        {/* Event identity */}
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2.5,color:"rgba(255,255,255,.35)",marginBottom:10,paddingBottom:6,borderBottom:"1px solid rgba(255,255,255,.06)"}}>EVENT IDENTITY</div>
          <div style={{display:"flex",gap:10,marginBottom:10}}>
            <div style={{flex:2}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginBottom:5,letterSpacing:1}}>EVENT NAME</div>
              <input className="afield-inp" value={eName} onChange={e=>setEName(e.target.value)} placeholder="e.g. WORLD CUP" style={{width:"100%"}} />
            </div>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginBottom:5,letterSpacing:1}}>YEAR</div>
              <input className="afield-inp" value={eYear} onChange={e=>setEYear(e.target.value)} placeholder="2026" type="number" style={{width:"100%"}} />
            </div>
          </div>
          <button onClick={()=>onSave({eventName:eName.trim()||"WORLD CUP",eventYear:parseInt(eYear)||2026})}
            style={{padding:"9px 20px",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.2)",fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2,color:"#fff",cursor:"pointer",borderRadius:6}}>
            SAVE EVENT NAME &amp; YEAR
          </button>
        </div>

        {/* Tab visibility */}
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2.5,color:"rgba(255,255,255,.35)",marginBottom:10,paddingBottom:6,borderBottom:"1px solid rgba(255,255,255,.06)"}}>TAB VISIBILITY</div>
          <Toggle label="MATCHES" desc="World Cup match predictions tab" val={s.showMatches} onToggle={()=>onSave({showMatches:!s.showMatches})} />
          <Toggle label="LEADERBOARD" desc="Player rankings and points tab" val={s.showLeaderboard} onToggle={()=>onSave({showLeaderboard:!s.showLeaderboard})} />
          <Toggle label="MUNDOGRAM" desc="Social photo feed tab" val={s.showMundogram} onToggle={()=>onSave({showMundogram:!s.showMundogram})} />
          <Toggle label="MENU" desc="Food & drinks ordering tab" val={s.showMenu} onToggle={()=>onSave({showMenu:!s.showMenu})} />
        </div>

        {/* Event close/reopen — danger zone */}
        <div style={{padding:"16px",background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.2)",borderRadius:8}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2.5,color:"rgba(239,68,68,.7)",marginBottom:8}}>
            {s.eventClosed ? "⚡ EVENT IS CLOSED" : "🏁 CLOSE EVENT"}
          </div>
          {s.eventClosed ? (
            <>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.5)",marginBottom:12}}>
                The app is showing the "stay close" splash to all players. Reopen to restore full access.
              </div>
              <button onClick={()=>onSave({eventClosed:false})}
                style={{padding:"10px 22px",background:"rgba(34,197,94,.12)",border:"1px solid rgba(34,197,94,.4)",fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:2,color:"#4ade80",cursor:"pointer",borderRadius:6}}>
                ✅ REOPEN EVENT
              </button>
            </>
          ) : (
            <>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.5)",marginBottom:12}}>
                Closes the {s.eventName} {s.eventYear} event. Players will see a "we'll be back" splash and can view their recap. You still have full admin access.
              </div>
              {!confirmClose ? (
                <button onClick={()=>setConfirmClose(true)}
                  style={{padding:"10px 22px",background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.4)",fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:2,color:"#f87171",cursor:"pointer",borderRadius:6}}>
                  🏁 CLOSE {s.eventName} {s.eventYear}
                </button>
              ) : (
                <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.6)"}}>Are you sure? This will lock all players out.</span>
                  <button onClick={()=>{onSave({eventClosed:true});setConfirmClose(false);}}
                    style={{padding:"9px 18px",background:"#ef4444",border:"none",fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2,color:"#fff",cursor:"pointer",borderRadius:6}}>
                    YES, CLOSE IT
                  </button>
                  <button onClick={()=>setConfirmClose(false)}
                    style={{padding:"9px 18px",background:"transparent",border:"1px solid rgba(255,255,255,.2)",fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2,color:"rgba(255,255,255,.5)",cursor:"pointer",borderRadius:6}}>
                    CANCEL
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Admin: Floor Plan Access ── */
function AdminFloorplanAccess({ users, onSetAccess }) {
  const [search, setSearch] = useState("");
  const userList = Object.values(users).filter(u => !u.is_admin);
  const filtered = search.trim()
    ? userList.filter(u => (u.name||"").toLowerCase().includes(search.toLowerCase()))
    : userList;
  return (
    <div className="vpad">
      <div className="section-banner">
        <div className="sb-label">FLOOR PLAN ACCESS</div>
        <div className="sb-sub">Grant staff access to the live Floor Plan tab</div>
      </div>
      <div style={{padding:"0 14px 12px"}}>
        <input className="afield-inp" placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",marginBottom:12}} />
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(u => (
            <div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"rgba(255,255,255,.03)",border:`1px solid ${u.floorplan_access?"rgba(96,165,250,.2)":"rgba(255,255,255,.07)"}`}}>
              {u.avatar_url ? (
                <img src={u.avatar_url} style={{width:36,height:36,borderRadius:"50%",objectFit:"cover",flexShrink:0}} />
              ) : (
                <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,.08)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Anton',sans-serif",fontSize:14,flexShrink:0}}>{(u.name||"?")[0].toUpperCase()}</div>
              )}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.35)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                {u.floorplan_access && <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,color:"#60a5fa",padding:"3px 8px",background:"rgba(96,165,250,.1)",border:"1px solid rgba(96,165,250,.3)"}}>FLOOR ✓</span>}
                <button onClick={()=>onSetAccess(u.id,!u.floorplan_access)} style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:1.5,padding:"7px 14px",border:"1px solid",cursor:"pointer",background:u.floorplan_access?"rgba(239,68,68,.1)":"rgba(96,165,250,.1)",borderColor:u.floorplan_access?"rgba(239,68,68,.4)":"rgba(96,165,250,.4)",color:u.floorplan_access?"#f87171":"#60a5fa",whiteSpace:"nowrap"}}>
                  {u.floorplan_access ? "REVOKE" : "GRANT"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Admin: Keep-Ups Access ── */
function AdminKeepupsAccess({ users, onSetAccess }) {
  const [search, setSearch] = useState("");
  const userList = Object.values(users).filter(u => !u.is_admin);
  const filtered = search.trim()
    ? userList.filter(u => (u.name||"").toLowerCase().includes(search.toLowerCase()))
    : userList;
  return (
    <div className="vpad">
      <div className="section-banner">
        <div className="sb-label">KEEP-UPS ACCESS</div>
        <div className="sb-sub">Grant the wine factory operator access to the Keep-Ups tab</div>
      </div>
      <div style={{padding:"0 14px 12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:"rgba(245,200,90,.07)",border:"1px solid rgba(245,200,90,.25)",borderRadius:8,marginBottom:14}}>
          <span style={{fontSize:18}}>🍷</span>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.65)",fontWeight:500,lineHeight:1.45}}>
            Operators with access see a <strong style={{color:"#f5c85a"}}>KEEP-UPS</strong> tab in their app. They can log player names and scores in real time. Players must spend <strong style={{color:"#fff"}}>$50+</strong> to qualify.
          </div>
        </div>
        <input className="afield-inp" placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",marginBottom:12}} />
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(u => (
            <div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"rgba(255,255,255,.03)",border:`1px solid ${u.keepups_access?"rgba(245,200,90,.3)":"rgba(255,255,255,.07)"}`,borderRadius:8}}>
              {u.avatar_url ? (
                <img src={u.avatar_url} style={{width:36,height:36,borderRadius:"50%",objectFit:"cover",flexShrink:0}} />
              ) : (
                <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,.08)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Anton',sans-serif",fontSize:14,flexShrink:0}}>{(u.name||"?")[0].toUpperCase()}</div>
              )}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.35)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                {u.keepups_access && <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,color:"#f5c85a",padding:"3px 8px",background:"rgba(245,200,90,.1)",border:"1px solid rgba(245,200,90,.3)"}}>KEEP-UPS ✓</span>}
                <button onClick={()=>onSetAccess(u.id,!u.keepups_access)} style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:1.5,padding:"7px 14px",border:"1px solid",cursor:"pointer",borderRadius:4,background:u.keepups_access?"rgba(239,68,68,.1)":"rgba(245,200,90,.1)",borderColor:u.keepups_access?"rgba(239,68,68,.4)":"rgba(245,200,90,.4)",color:u.keepups_access?"#f87171":"#f5c85a",whiteSpace:"nowrap"}}>
                  {u.keepups_access ? "REVOKE" : "GRANT"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══ KEEP-UPS CHALLENGE VIEW ════════════════════════════════════════════════
   Operator-only tab for logging keep-up scores during the Wine Factory game.
   Players must spend $50+ to qualify. Operator enters name + score, can edit.
   ═══════════════════════════════════════════════════════════════════════════ */
function KeepupsView({ user, users = {} }) {
  const [scores, setScores]               = useState([]);
  const [loading, setLoading]             = useState(true);
  /* player search */
  const [searchQ, setSearchQ]             = useState("");
  const [searchOpen, setSearchOpen]       = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  /* score input */
  const [scoreVal, setScoreVal]           = useState("");
  const [adding, setAdding]               = useState(false);
  /* edit */
  const [editId, setEditId]               = useState(null);
  const [editScore, setEditScore]         = useState("");
  const [saving, setSaving]               = useState(false);
  /* leaderboard slide-up sheet */
  const [showBoard, setShowBoard]         = useState(false);
  const [boardAnim, setBoardAnim]         = useState(false);

  /* ── user list for search ── */
  const userList = Object.values(users).filter(u => u.name);

  const filteredUsers = searchQ.trim().length > 0
    ? userList.filter(u =>
        u.name?.toLowerCase().includes(searchQ.toLowerCase()) ||
        String(u.player_number || "").includes(searchQ.trim())
      ).slice(0, 8)
    : [];

  /* ── realtime load ── */
  const load = async () => {
    const { data } = await supabase.from("keepups_scores").select("*").order("score", { ascending: false });
    setScores(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("rt-keepups")
      .on("postgres_changes", { event:"*", schema:"public", table:"keepups_scores" }, () => load())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  /* ── add score ── */
  const addScore = async () => {
    if (!selectedPlayer) return;
    const s = parseInt(scoreVal, 10);
    if (isNaN(s) || s < 0) return;
    setAdding(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("keepups_scores").insert({
        player_name: selectedPlayer.name,
        user_id: selectedPlayer.id,
        score: s,
        entered_by: authUser?.id || null,
      }).select().maybeSingle();
      if (error) throw error;
      if (data) setScores(prev => [...prev, data].sort((a,b) => b.score - a.score));
      setSelectedPlayer(null); setSearchQ(""); setScoreVal("");
      try { navigator.vibrate?.([40, 20, 80]); } catch {}
    } catch (err) { alert("Error: " + err.message); }
    setAdding(false);
  };

  /* ── edit (score only) ── */
  const startEdit = (row) => { setEditId(row.id); setEditScore(String(row.score)); };

  const saveEdit = async () => {
    const s = parseInt(editScore, 10);
    if (isNaN(s) || s < 0) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from("keepups_scores")
        .update({ score: s, updated_at: new Date().toISOString() })
        .eq("id", editId).select().maybeSingle();
      if (error) throw error;
      if (data) setScores(prev => prev.map(x => x.id === data.id ? data : x).sort((a,b) => b.score - a.score));
      setEditId(null);
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  };

  /* ── delete ── */
  const deleteScore = async (row) => {
    if (!confirm(`Delete ${row.player_name}'s score (${row.score})?`)) return;
    await supabase.from("keepups_scores").delete().eq("id", row.id);
    setScores(prev => prev.filter(x => x.id !== row.id));
  };

  /* ── leaderboard sheet animation ── */
  const openBoard = () => {
    setShowBoard(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setBoardAnim(true)));
  };
  const closeBoard = () => {
    setBoardAnim(false);
    setTimeout(() => setShowBoard(false), 400);
  };

  /* ── helpers ── */
  const medalColor = (rank) => {
    if (rank === 1) return "#FFD700";
    if (rank === 2) return "#C0C0C0";
    if (rank === 3) return "#CD7F32";
    return "rgba(255,255,255,.25)";
  };

  const rankBg = (rank) => {
    if (rank === 1) return "rgba(255,215,0";
    if (rank === 2) return "rgba(192,192,192";
    if (rank === 3) return "rgba(205,127,50";
    return "rgba(255,255,255";
  };

  /* profile object from users dict (may not exist for old records) */
  const profileFor = (row) => row.user_id ? (users[row.user_id] || { name: row.player_name }) : { name: row.player_name };

  const canAdd = !!selectedPlayer && scoreVal !== "" && !adding;

  return (
    <div style={{paddingBottom:80}}>
      {/* ── Header ── */}
      <div style={{position:"relative",padding:"28px 20px 20px",textAlign:"center",borderBottom:"1px solid rgba(255,255,255,.07)"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
          <div style={{width:80,height:80,borderRadius:16,overflow:"hidden",border:"1px solid rgba(255,255,255,.12)",boxShadow:"0 4px 20px rgba(0,0,0,.5)"}}>
            <img src="/logos/winefactory.jpg" alt="The Wine Factory" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          </div>
        </div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:4,color:"#f5c85a",marginBottom:4}}>THE WINE FACTORY</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:26,letterSpacing:3,color:"#fff",lineHeight:1}}>KEEP-UPS</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2,color:"rgba(255,255,255,.35)",marginTop:6}}>CHALLENGE</div>
        {/* Leaderboard button */}
        <button
          onClick={openBoard}
          style={{position:"absolute",top:24,right:16,display:"flex",alignItems:"center",gap:6,padding:"9px 14px",background:"rgba(245,200,90,.1)",border:"1px solid rgba(245,200,90,.35)",borderRadius:100,fontFamily:"'Anton',sans-serif",fontSize:9.5,letterSpacing:2,color:"#f5c85a",cursor:"pointer",transition:"background .18s"}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 20 18 10"/><polyline points="12 20 12 4"/><polyline points="6 20 6 14"/></svg>
          TOP
        </button>
      </div>

      {/* ── Add player form ── */}
      <div style={{padding:"18px 16px 16px",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:9.5,letterSpacing:2.5,color:"rgba(255,255,255,.35)",marginBottom:10}}>ADD PLAYER</div>

        {/* Account requirement notice */}
        <div style={{display:"flex",alignItems:"flex-start",gap:8,padding:"9px 12px",background:"rgba(245,200,90,.06)",border:"1px solid rgba(245,200,90,.18)",borderRadius:8,marginBottom:12}}>
          <span style={{fontSize:13,flexShrink:0,marginTop:1}}>ℹ️</span>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11.5,color:"rgba(255,255,255,.5)",fontWeight:500,lineHeight:1.45}}>
            Players must have an <strong style={{color:"rgba(245,200,90,.8)"}}>active app account</strong> and a minimum <strong style={{color:"rgba(245,200,90,.8)"}}>$50 spend</strong> at The Wine Factory to qualify.
          </div>
        </div>

        {/* Player search or selected player */}
        <div style={{position:"relative",marginBottom:8}}>
          {selectedPlayer ? (
            /* Selected player chip */
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:"rgba(245,200,90,.08)",border:"1px solid rgba(245,200,90,.3)",borderRadius:8}}>
              <Av u={selectedPlayer} size={32} fontSize={13}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,letterSpacing:.4,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selectedPlayer.name}</div>
                {selectedPlayer.player_number && <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10.5,color:"rgba(255,255,255,.35)",fontWeight:500}}>#{selectedPlayer.player_number}</div>}
              </div>
              <button onClick={()=>{setSelectedPlayer(null);setSearchQ("");}} style={{width:28,height:28,borderRadius:"50%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",color:"rgba(255,255,255,.5)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>✕</button>
            </div>
          ) : (
            /* Search input */
            <>
              <div style={{position:"relative"}}>
                <svg style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",opacity:.4}} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  value={searchQ}
                  onChange={e => { setSearchQ(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 160)}
                  placeholder="Search by name or player #"
                  style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",borderRadius:8,padding:"12px 13px 12px 36px",color:"#fff",fontFamily:"'Outfit',sans-serif",fontSize:14,fontWeight:500,outline:"none"}}
                />
              </div>
              {/* Dropdown */}
              {searchOpen && filteredUsers.length > 0 && (
                <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:50,background:"#161616",border:"1px solid rgba(255,255,255,.12)",borderRadius:10,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,.6)"}}>
                  {filteredUsers.map(u => (
                    <button key={u.id} onMouseDown={()=>{ setSelectedPlayer(u); setSearchQ(""); setSearchOpen(false); }}
                      style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"transparent",border:"none",borderBottom:"1px solid rgba(255,255,255,.05)",cursor:"pointer",textAlign:"left"}}>
                      <Av u={u} size={30} fontSize={12}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:.3,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</div>
                        {u.player_number && <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.35)",fontWeight:500}}>#{u.player_number}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searchOpen && searchQ.trim().length > 0 && filteredUsers.length === 0 && (
                <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:50,background:"#161616",border:"1px solid rgba(255,255,255,.12)",borderRadius:10,padding:"14px 16px",textAlign:"center",fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.3)",boxShadow:"0 8px 32px rgba(0,0,0,.6)"}}>
                  No players found — player must have an active account
                </div>
              )}
            </>
          )}
        </div>

        {/* Score + button row */}
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input
            value={scoreVal}
            onChange={e => setScoreVal(e.target.value.replace(/\D/g,""))}
            onKeyDown={e => e.key === "Enter" && canAdd && addScore()}
            placeholder="Score"
            inputMode="numeric"
            disabled={!selectedPlayer}
            style={{flex:1,background: selectedPlayer ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.03)",border:`1px solid ${selectedPlayer ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.06)"}`,borderRadius:8,padding:"13px 16px",color: selectedPlayer ? "#fff" : "rgba(255,255,255,.2)",fontFamily:"'Anton',sans-serif",fontSize:22,textAlign:"center",outline:"none",transition:"all .2s"}}
          />
          <button
            onClick={addScore}
            disabled={!canAdd}
            style={{padding:"13px 20px",background: canAdd ? "#f5c85a" : "rgba(245,200,90,.12)",color: canAdd ? "#000" : "rgba(255,255,255,.2)",border:"none",borderRadius:8,fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2,cursor: canAdd ? "pointer" : "not-allowed",transition:"all .18s",flexShrink:0}}>
            {adding ? "…" : "+ ADD"}
          </button>
        </div>
      </div>

      {/* ── Score list ── */}
      <div style={{padding:"14px 16px 0"}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:9.5,letterSpacing:2.5,color:"rgba(255,255,255,.35)",marginBottom:12}}>
          RANKINGS · {scores.length} PLAYER{scores.length !== 1 ? "S" : ""}
        </div>
        {loading ? (
          <div style={{textAlign:"center",padding:40,fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.3)"}}>Loading…</div>
        ) : scores.length === 0 ? (
          <div style={{textAlign:"center",padding:"40px 20px"}}>
            <div style={{fontSize:40,marginBottom:10}}>⚽</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:2,color:"rgba(255,255,255,.3)"}}>NO SCORES YET</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.2)",marginTop:6}}>Add the first player above</div>
          </div>
        ) : scores.map((row, idx) => {
          const rank = idx + 1;
          const mc = medalColor(rank);
          const rb = rankBg(rank);
          const isEditing = editId === row.id;
          const prof = profileFor(row);
          return (
            <div key={row.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",marginBottom:8,background:`${rb},.04)`,border:`1px solid ${rank<=3?`${rb},.18)`:"rgba(255,255,255,.07)"}`,borderRadius:10,transition:"all .2s"}}>
              {/* Rank badge */}
              <div style={{flexShrink:0,width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:`${rb},.1)`,border:`1.5px solid ${mc}`,fontFamily:"'Anton',sans-serif",fontSize:rank<=3?13:11,color:mc}}>
                {rank<=3?(rank===1?"🥇":rank===2?"🥈":"🥉"):rank}
              </div>

              {/* Avatar */}
              <Av u={prof} size={34} fontSize={13}/>

              {isEditing ? (
                <>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.player_name}</div>
                    {row.user_id && users[row.user_id]?.player_number && <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.3)",fontWeight:500}}>#{users[row.user_id].player_number}</div>}
                  </div>
                  <input value={editScore} onChange={e=>setEditScore(e.target.value.replace(/\D/g,""))} inputMode="numeric"
                    style={{width:72,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.2)",borderRadius:5,padding:"7px 10px",color:"#fff",fontFamily:"'Anton',sans-serif",fontSize:20,textAlign:"center",outline:"none"}}/>
                  <button onClick={saveEdit} disabled={saving} style={{padding:"7px 12px",background:"#f5c85a",color:"#000",border:"none",borderRadius:5,fontFamily:"'Anton',sans-serif",fontSize:9.5,letterSpacing:1.5,cursor:"pointer"}}>{saving?"…":"SAVE"}</button>
                  <button onClick={()=>setEditId(null)} style={{padding:"7px 10px",background:"transparent",color:"rgba(255,255,255,.4)",border:"1px solid rgba(255,255,255,.12)",borderRadius:5,fontFamily:"'Anton',sans-serif",fontSize:9.5,cursor:"pointer"}}>✕</button>
                </>
              ) : (
                <>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,letterSpacing:.4,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.player_name}</div>
                    {row.user_id && users[row.user_id]?.player_number && <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.3)",fontWeight:500,marginTop:1}}>#{users[row.user_id].player_number}</div>}
                  </div>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:28,color:mc,letterSpacing:0,lineHeight:1,flexShrink:0}}>{row.score}</div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>startEdit(row)} style={{width:32,height:32,borderRadius:"50%",border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.05)",color:"rgba(255,255,255,.6)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={()=>deleteScore(row)} style={{width:32,height:32,borderRadius:"50%",border:"1px solid rgba(239,68,68,.2)",background:"rgba(239,68,68,.06)",color:"#f87171",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Leaderboard slide-up sheet ── */}
      {showBoard && (
        <>
          {/* Backdrop */}
          <div
            onClick={closeBoard}
            style={{position:"fixed",inset:0,zIndex:8999,background:`rgba(0,0,0,${boardAnim?.5:.0})`,transition:"background .42s",backdropFilter:"blur(4px)"}}
          />
          {/* Sheet */}
          <div style={{
            position:"fixed",bottom:0,left:0,right:0,zIndex:9000,
            height:"82vh",
            background:"linear-gradient(170deg,#181818 0%,#080808 100%)",
            borderTopLeftRadius:22,borderTopRightRadius:22,
            border:"1px solid rgba(255,255,255,.12)",
            borderBottom:"none",
            transform:`translateY(${boardAnim?"0":"100%"})`,
            transition:"transform .42s cubic-bezier(.22,.61,.36,1)",
            display:"flex",flexDirection:"column",
            overflow:"hidden",
          }}>
            {/* Sheet handle */}
            <div style={{display:"flex",justifyContent:"center",padding:"12px 0 6px",flexShrink:0}}>
              <div style={{width:38,height:4,borderRadius:99,background:"rgba(255,255,255,.15)"}}/>
            </div>

            {/* Sheet header */}
            <div style={{padding:"10px 20px 16px",textAlign:"center",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0,position:"relative"}}>
              <button onClick={closeBoard} style={{position:"absolute",top:8,right:16,width:30,height:30,borderRadius:"50%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.6)",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
              <div style={{display:"flex",justifyContent:"center",marginBottom:10}}>
                <div style={{width:48,height:48,borderRadius:11,overflow:"hidden",border:"1px solid rgba(255,255,255,.12)"}}>
                  <img src="/logos/winefactory.jpg" alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                </div>
              </div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:4,color:"#f5c85a",marginBottom:3}}>THE WINE FACTORY</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:22,letterSpacing:3,color:"#fff"}}>LEADERBOARD</div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10.5,color:"rgba(255,255,255,.25)",marginTop:4,fontWeight:500}}>Top 10 players</div>
            </div>

            {/* Sheet list */}
            <div style={{flex:1,overflowY:"auto",padding:"14px 16px 32px"}}>
              {scores.length === 0 ? (
                <div style={{textAlign:"center",padding:"40px 0",fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.3)"}}>No scores yet</div>
              ) : scores.slice(0,10).map((row, idx) => {
                const rank = idx + 1;
                const mc = medalColor(rank);
                const rb = rankBg(rank);
                const prof = profileFor(row);
                return (
                  <div key={row.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",marginBottom:8,background:`${rb},.04)`,border:`1px solid ${rank<=3?`${rb},.2)`:"rgba(255,255,255,.06)"}`,borderRadius:11,
                    opacity: boardAnim ? 1 : 0,
                    transform: boardAnim ? "translateY(0)" : "translateY(16px)",
                    transition:`opacity .3s ${idx * 0.045}s, transform .3s ${idx * 0.045}s`,
                  }}>
                    {/* Medal / rank */}
                    <div style={{width:32,textAlign:"center",fontFamily:"'Anton',sans-serif",fontSize:rank<=3?18:13,color:mc,flexShrink:0}}>
                      {rank<=3?(rank===1?"🥇":rank===2?"🥈":"🥉"):rank}
                    </div>
                    {/* Avatar */}
                    <Av u={prof} size={36} fontSize={14}/>
                    {/* Name + number */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,letterSpacing:.4,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.player_name}</div>
                      {row.user_id && users[row.user_id]?.player_number && (
                        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.3)",fontWeight:500}}>#{users[row.user_id].player_number}</div>
                      )}
                    </div>
                    {/* Score */}
                    <div style={{fontFamily:"'Anton',sans-serif",fontSize:28,color:mc,flexShrink:0,lineHeight:1}}>{row.score}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Admin: Gifts (create, history, redeem item gifts) ── */
function AdminGifts({ users, sendPush = ()=>{} }) {
  const [allGifts, setAllGifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active"); // "active" | "history"
  const [showCreate, setShowCreate] = useState(false);
  const [recipientQ, setRecipientQ] = useState("");
  const [recipient, setRecipient] = useState(null);
  const [type, setType] = useState("credits");
  const [amount, setAmount] = useState("10");
  const [title, setTitle] = useState("");
  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);

  const loadGifts = async () => {
    setLoading(true);
    const { data } = await supabase.from("gifts").select("*").order("created_at", { ascending: false });
    setAllGifts(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadGifts();
    const ch = supabase.channel("rt-admin-gifts")
      .on("postgres_changes", { event:"*", schema:"public", table:"gifts" }, () => loadGifts())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const userList = Object.values(users).filter(u => !u.is_banned);
  const recipientResults = recipientQ.trim().length > 0
    ? userList.filter(u =>
        u.name?.toLowerCase().includes(recipientQ.toLowerCase()) ||
        String(u.player_number || "").includes(recipientQ))
    : userList.slice(0, 12);

  const resetForm = () => {
    setRecipient(null);
    setRecipientQ("");
    setType("credits");
    setAmount("10");
    setTitle("");
    setItemName("");
    setDescription("");
    setBulkMode(false);
  };

  /* type → display helpers */
  const typeColor   = (t) => t === "credits" ? "#10b981" : t === "drink_food" || t === "item" ? "#f59e0b" : "#b8c2cf";
  const typeIcon    = (t) => t === "credits" ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M14.31 8a4 4 0 0 0-6.31 4.87M9.69 16a4 4 0 0 0 6.31-4.87"/></svg>
  ) : t === "drink_food" || t === "item" ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
  );

  const createGift = async () => {
    if (creating) return;
    if (!bulkMode && !recipient) { alert("Pick a recipient first"); return; }
    if (type === "credits" && (!amount || parseFloat(amount) <= 0)) { alert("Enter a valid amount"); return; }
    if ((type === "drink_food" || type === "special") && !itemName.trim()) { alert("Enter an item/prize name"); return; }
    setCreating(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const recipients = bulkMode ? userList.map(u => u.id) : [recipient.id];
      const payloads = recipients.map(rid => ({
        recipient_id: rid,
        sender_id: authUser?.id || null,
        sender_name: "El Mundo",
        type,
        title: title.trim()
          || (type === "credits" ? `$${parseFloat(amount).toFixed(2)} in credits`
            : itemName.trim() || "Special reward"),
        description: description.trim() || null,
        amount: type === "credits" ? parseFloat(amount) : 0,
        item_name: (type === "drink_food" || type === "special") ? itemName.trim() : null,
      }));
      const { data: insertedGifts, error } = await supabase.from("gifts").insert(payloads).select();
      if (error) throw error;
      // Push notification to recipient(s) — keep it a surprise, no details revealed
      try {
        await sendPush({
          title: "🎁 You received a gift!",
          body: "Check in my profile > Gifts",
          tag: `gift-${Date.now()}`,
          userIds: recipients,
        });
      } catch {}
      setShowCreate(false);
      resetForm();
      loadGifts();
    } catch (err) {
      console.error("Create gift failed", err);
      alert("Failed to create gift: " + (err?.message || err));
    } finally {
      setCreating(false);
    }
  };

  const markRedeemed = async (g) => {
    if (!confirm(`Mark "${g.title}" as redeemed for ${users[g.recipient_id]?.name || "this player"}?`)) return;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      await supabase.from("gifts").update({
        redeemed: true,
        redeemed_at: new Date().toISOString(),
        redeemed_by: authUser?.id || null,
      }).eq("id", g.id);
    } catch (err) {
      console.error(err);
      alert("Failed");
    }
  };

  const deleteGift = async (g) => {
    if (!confirm("Delete this gift permanently?")) return;
    await supabase.from("gifts").delete().eq("id", g.id);
  };

  const activeGifts  = allGifts.filter(g => !g.redeemed);
  const historyGifts = allGifts.filter(g => g.redeemed);
  const list = tab === "active" ? activeGifts : historyGifts;

  const totalCreditsGiven = allGifts.filter(g => g.type === "credits").reduce((s,g)=>s+(+g.amount||0),0);
  const totalFoodDrink    = allGifts.filter(g => g.type === "drink_food" || g.type === "item").length;
  const totalSpecial      = allGifts.filter(g => g.type === "special").length;
  const totalRedeemed     = historyGifts.length;

  return (
    <div className="admin-gifts-wrap">
      <div className="section-banner">
        <div className="sb-label">GIFTS</div>
        <div className="sb-sub">Send credits and free items · Track redemptions</div>
      </div>

      <div className="admin-gifts-header">
        <div>
          <div className="admin-gifts-title">ALL GIFTS</div>
          <div className="admin-gifts-subtitle">{allGifts.length} total · {activeGifts.length} active · {totalRedeemed} redeemed</div>
        </div>
        <button className="admin-gifts-new-btn" onClick={() => setShowCreate(true)}>+ NEW GIFT</button>
      </div>

      <div className="admin-gifts-stats">
        <div className="admin-gifts-stat" style={{borderTop:"2px solid #10b981"}}>
          <div className="admin-gifts-stat-val" style={{color:"#10b981"}}>${totalCreditsGiven.toFixed(0)}</div>
          <div className="admin-gifts-stat-lbl">CREDITS</div>
        </div>
        <div className="admin-gifts-stat" style={{borderTop:"2px solid #f59e0b"}}>
          <div className="admin-gifts-stat-val" style={{color:"#f59e0b"}}>{totalFoodDrink}</div>
          <div className="admin-gifts-stat-lbl">DRINKS/FOOD</div>
        </div>
        <div className="admin-gifts-stat" style={{borderTop:"2px solid #b8c2cf"}}>
          <div className="admin-gifts-stat-val" style={{color:"#b8c2cf"}}>{totalSpecial}</div>
          <div className="admin-gifts-stat-lbl">SPECIAL</div>
        </div>
        <div className="admin-gifts-stat">
          <div className="admin-gifts-stat-val">{totalRedeemed}</div>
          <div className="admin-gifts-stat-lbl">REDEEMED</div>
        </div>
      </div>

      <div className="admin-gifts-tabs">
        <button className={`admin-gifts-tab ${tab==="active"?"admin-gifts-tab-on":""}`} onClick={() => setTab("active")}>
          ACTIVE {activeGifts.length > 0 && `(${activeGifts.length})`}
        </button>
        <button className={`admin-gifts-tab ${tab==="history"?"admin-gifts-tab-on":""}`} onClick={() => setTab("history")}>
          HISTORY {historyGifts.length > 0 && `(${historyGifts.length})`}
        </button>
      </div>

      {loading ? (
        <div className="admin-gifts-empty">Loading…</div>
      ) : list.length === 0 ? (
        <div className="admin-gifts-empty">
          {tab === "active" ? "No active gifts — click + NEW GIFT to send one" : "No redeemed gifts yet"}
        </div>
      ) : list.map(g => {
        const u = users[g.recipient_id];
        const tc = typeColor(g.type);
        return (
          <div key={g.id} className="admin-gifts-row" style={{borderLeft:`3px solid ${tc}33`}}>
            <div className="admin-gifts-row-type" style={{color:tc}}>
              {typeIcon(g.type)}
            </div>
            <div className="admin-gifts-row-info">
              <div className="admin-gifts-row-title">
                {g.title}
                <span style={{marginLeft:8,padding:"1px 7px",background:`${tc}18`,border:`1px solid ${tc}40`,borderRadius:99,fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:1.5,color:tc,verticalAlign:"middle"}}>
                  {g.type === "credits" ? "CREDITS" : g.type === "drink_food" || g.type === "item" ? "DRINK/FOOD" : "SPECIAL"}
                </span>
              </div>
              <div className="admin-gifts-row-meta">
                To · <strong style={{color:"#fff"}}>{u?.name || "(deleted)"}</strong>
                {u?.player_number ? ` · #${u.player_number}` : ""}
                {" · "}{new Date(g.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                {g.redeemed && ` · Redeemed ${new Date(g.redeemed_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}`}
              </div>
            </div>
            <div className="admin-gifts-row-actions">
              {!g.redeemed && (g.type === "item" || g.type === "drink_food" || g.type === "special") && (
                <button className="admin-gifts-btn admin-gifts-btn-primary" onClick={() => markRedeemed(g)}>
                  MARK REDEEMED
                </button>
              )}
              <button className="admin-gifts-btn admin-gifts-btn-danger" onClick={() => deleteGift(g)}>DEL</button>
            </div>
          </div>
        );
      })}

      {showCreate && (
        <div className="admin-gift-modal-overlay" onClick={e=>{if(e.target===e.currentTarget){setShowCreate(false);resetForm();}}}>
          <div className="admin-gift-modal">
            <h3>NEW GIFT</h3>
            <div className="admin-gift-modal-sub">Send credits or a free item to one or all players</div>

            <div style={{display:"flex",gap:8,marginBottom:14}}>
              <button className={`sg-type-btn ${!bulkMode?"sg-type-on":""}`} onClick={()=>setBulkMode(false)}>
                <span className="sg-type-ico">👤</span><span className="sg-type-lbl">ONE PLAYER</span>
              </button>
              <button className={`sg-type-btn ${bulkMode?"sg-type-on":""}`} onClick={()=>{setBulkMode(true);setRecipient(null);}}>
                <span className="sg-type-ico">👥</span><span className="sg-type-lbl">ALL PLAYERS</span>
              </button>
            </div>

            {!bulkMode && (
              <>
                <div className="sg-field-lbl">RECIPIENT</div>
                {recipient ? (
                  <div className="sg-row" style={{background:"rgba(255,255,255,.05)",borderColor:"rgba(255,255,255,.2)",marginBottom:14}}>
                    <Av u={recipient} size={40} fontSize={16}/>
                    <div className="sg-row-info">
                      <div className="sg-row-name">{recipient.name}</div>
                      {recipient.player_number && <div className="sg-row-num">#{recipient.player_number}</div>}
                    </div>
                    <button className="admin-gifts-btn" onClick={()=>setRecipient(null)}>CHANGE</button>
                  </div>
                ) : (
                  <>
                    <div className="sg-search-wrap" style={{margin:"0 0 10px"}}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input className="sg-search-inp" placeholder="Search players…" value={recipientQ} onChange={e=>setRecipientQ(e.target.value)}/>
                    </div>
                    <div style={{maxHeight:180,overflowY:"auto",marginBottom:14,display:"flex",flexDirection:"column",gap:4}}>
                      {recipientResults.map(u => (
                        <div key={u.id} className="sg-row" onClick={()=>setRecipient(u)}>
                          <Av u={u} size={36} fontSize={14}/>
                          <div className="sg-row-info">
                            <div className="sg-row-name">{u.name}</div>
                            {u.player_number && <div className="sg-row-num">#{u.player_number}</div>}
                          </div>
                          <span className="sg-row-arr">›</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            <div className="sg-field-lbl">GIFT TYPE</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
              {[
                { id:"credits",    label:"CREDITS",      sub:"Added to balance",   col:"#10b981" },
                { id:"drink_food", label:"DRINK / FOOD", sub:"Player orders in-app", col:"#f59e0b" },
                { id:"special",    label:"SPECIAL PRIZE",sub:"Go to restaurant",   col:"#b8c2cf" },
              ].map(opt => (
                <button key={opt.id} onClick={()=>setType(opt.id)} style={{
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  gap:6,padding:"14px 8px",
                  background: type === opt.id ? `${opt.col}18` : "rgba(255,255,255,.025)",
                  border: type === opt.id ? `1.5px solid ${opt.col}` : "1.5px solid rgba(255,255,255,.07)",
                  borderRadius:12,cursor:"pointer",transition:"all .18s",
                  boxShadow: type === opt.id ? `0 0 18px ${opt.col}22` : "none",
                }}>
                  <div style={{color: type === opt.id ? opt.col : "rgba(255,255,255,.4)", transition:"color .18s"}}>
                    {typeIcon(opt.id)}
                  </div>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:8.5,letterSpacing:1.5,color: type === opt.id ? "#fff" : "rgba(255,255,255,.5)",lineHeight:1.3,textAlign:"center"}}>{opt.label}</div>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color: type === opt.id ? opt.col : "rgba(255,255,255,.25)",fontWeight:500,lineHeight:1.3,textAlign:"center"}}>{opt.sub}</div>
                </button>
              ))}
            </div>

            {type === "credits" ? (
              <>
                <div className="sg-field-lbl">AMOUNT (USD)</div>
                <div className="sg-amount-row">
                  {[5, 10, 25, 50].map(v => (
                    <button key={v} className={`sg-amt-btn ${+amount === v ? "sg-amt-on" : ""}`} onClick={()=>setAmount(String(v))}>${v}</button>
                  ))}
                </div>
                <div className="sg-amount-custom-wrap" style={{marginBottom:12}}>
                  <span className="sg-amount-prefix">$</span>
                  <input className="sg-amount-inp" type="number" min="1" step="1" value={amount} onChange={e=>setAmount(e.target.value)}/>
                </div>
              </>
            ) : (
              <>
                <div className="sg-field-lbl">{type === "drink_food" ? "DRINK OR FOOD NAME" : "PRIZE NAME"}</div>
                <input className="sg-text-inp"
                  placeholder={type === "drink_food" ? "e.g. Amstel Bright Bucket, House Wine…" : "e.g. Official World Cup Ball, El Mundo Jersey…"}
                  value={itemName} onChange={e=>setItemName(e.target.value)} style={{marginBottom:12}}/>
                {type === "drink_food" && (
                  <div style={{padding:"8px 10px",background:"rgba(245,158,11,.06)",border:"1px solid rgba(245,158,11,.2)",borderRadius:7,marginBottom:12,fontFamily:"'Outfit',sans-serif",fontSize:10.5,color:"rgba(245,158,11,.8)",fontWeight:500,lineHeight:1.5}}>
                    🍺 Player will tap "ORDER FREE" and the item goes straight to the bar — no visit to staff needed
                  </div>
                )}
                {type === "special" && (
                  <div style={{padding:"8px 10px",background:"rgba(14,165,233,.06)",border:"1px solid rgba(14,165,233,.2)",borderRadius:7,marginBottom:12,fontFamily:"'Outfit',sans-serif",fontSize:10.5,color:"rgba(14,165,233,.8)",fontWeight:500,lineHeight:1.5}}>
                    🎁 Player will be instructed to come to the restaurant — staff marks it redeemed manually
                  </div>
                )}
              </>
            )}

            <div className="sg-field-lbl">CUSTOM TITLE (OPTIONAL)</div>
            <input className="sg-text-inp" placeholder="Override the default title…" value={title} onChange={e=>setTitle(e.target.value)} style={{marginBottom:12}}/>

            <div className="sg-field-lbl">DESCRIPTION (OPTIONAL)</div>
            <textarea className="sg-msg-inp" placeholder="Why this gift? Shown to the recipient." value={description} onChange={e=>setDescription(e.target.value)} rows={2} style={{marginBottom:16}}/>

            <div style={{display:"flex",gap:10}}>
              <button className="admin-cancel-btn" style={{flex:1}} onClick={()=>{setShowCreate(false);resetForm();}}>CANCEL</button>
              <button className="admin-save-btn" style={{flex:2}} onClick={createGift} disabled={creating}>
                {creating ? "SENDING…" : (bulkMode ? `SEND TO ${userList.length} PLAYERS` : "SEND GIFT")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Admin: Integrity / Duplicate Scanner ── */
function AdminIntegrity({ users, onBanUsers }) {
  const userList = Object.values(users);
  const [scanning, setScanning] = useState(false);
  const [dupeGroups, setDupeGroups] = useState([]);
  const [scanned, setScanned] = useState(false);
  const [search, setSearch] = useState("");

  const runScan = () => {
    setScanning(true);
    setTimeout(() => {
      // Group by phone (non-empty)
      const byPhone = {};
      userList.forEach(u => {
        const p = (u.phone || "").trim().replace(/\s+/g, "");
        if (p) { if (!byPhone[p]) byPhone[p] = []; byPhone[p].push(u); }
      });
      // Group by email (non-empty)
      const byEmail = {};
      userList.forEach(u => {
        const e = (u.email || "").trim().toLowerCase();
        if (e) { if (!byEmail[e]) byEmail[e] = []; byEmail[e].push(u); }
      });
      // Collect groups with > 1 member
      const groups = [];
      const seen = new Set();
      Object.entries(byPhone).forEach(([val, members]) => {
        if (members.length < 2) return;
        const key = members.map(m => m.id).sort().join(",");
        if (seen.has(key)) return; seen.add(key);
        groups.push({ type:"phone", value:val, members });
      });
      Object.entries(byEmail).forEach(([val, members]) => {
        if (members.length < 2) return;
        const key = members.map(m => m.id).sort().join(",");
        if (seen.has(key)) return; seen.add(key);
        groups.push({ type:"email", value:val, members });
      });
      setDupeGroups(groups);
      setScanned(true);
      setScanning(false);
    }, 600);
  };

  // All users list with ban/unban
  const filteredUsers = userList
    .sort((a,b) => (a.name||"").localeCompare(b.name||""))
    .filter(u => !search || u.name?.toLowerCase().includes(search.toLowerCase()) ||
      (u.phone||"").includes(search) || (u.email||"").toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      {/* Duplicate Scanner */}
      <div style={{padding:"14px 14px 0"}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:2,color:"#fff",marginBottom:6}}>🤖 DUPLICATE ACCOUNT SCANNER</div>
        <div className="admin-hint" style={{borderTop:"none",padding:"0 0 10px"}}>
          Scans all players for matching phone number or email. Duplicate accounts will be flagged — you can ban all accounts in a group instantly.
        </div>
        <button className="admin-save-btn" style={{width:"100%",padding:13,marginBottom:14}} onClick={runScan} disabled={scanning}>
          {scanning ? "Scanning…" : "🔍 Run Duplicate Scan"}
        </button>

        {scanned && dupeGroups.length === 0 && (
          <div style={{textAlign:"center",padding:"20px 0",fontFamily:"'Outfit',sans-serif",fontSize:14,color:"rgba(74,222,128,.8)"}}>
            ✅ No duplicate accounts found
          </div>
        )}

        {dupeGroups.map((g, i) => (
          <div key={i} style={{marginBottom:14,background:"rgba(239,68,68,.07)",border:"1px solid rgba(239,68,68,.25)",borderRadius:10,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div>
                <span style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2,color:"rgba(239,68,68,.9)"}}>
                  ⚠ DUPLICATE {g.type.toUpperCase()}
                </span>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.5)",marginTop:2}}>{g.value}</div>
              </div>
              <button onClick={() => onBanUsers(g.members.map(m => m.id))}
                style={{padding:"6px 14px",background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.4)",
                  color:"rgba(239,68,68,.9)",fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:1.5,
                  cursor:"pointer",borderRadius:6}}>
                BAN ALL
              </button>
            </div>
            {g.members.map(m => (
              <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"7px 10px",background:"rgba(255,255,255,.04)",borderRadius:6,marginBottom:5}}>
                <div>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"#fff",fontWeight:600}}>{m.name}</div>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)"}}>
                    {m.phone && `📞 ${m.phone}`}{m.phone && m.email && " · "}{m.email && `✉ ${m.email}`}
                  </div>
                </div>
                {m.is_banned && <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1,
                  color:"rgba(239,68,68,.7)",background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",
                  padding:"2px 8px",borderRadius:4}}>BANNED</span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* All players list with manual ban/unban */}
      <div style={{padding:"14px 14px 0",borderTop:"1px solid rgba(255,255,255,.08)",marginTop:8}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:2,color:"#fff",marginBottom:8}}>👥 ALL PLAYERS</div>
        <input className="afield-inp" placeholder="Search by name, phone or email…" value={search}
          onChange={e=>setSearch(e.target.value)} style={{width:"100%",boxSizing:"border-box",marginBottom:10}} />
        {filteredUsers.map(u => (
          <div key={u.id} className="admin-row" style={{alignItems:"center",opacity: u.is_banned ? 0.6 : 1}}>
            <div style={{flex:1,minWidth:0}}>
              <div className="admin-row-teams" style={{fontSize:13}}>{u.name}</div>
              <div className="admin-row-dt">{u.phone && `📞 ${u.phone}`}{u.phone && u.email && " · "}{u.email && `✉ ${u.email}`}</div>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0,alignItems:"center"}}>
              {u.is_banned && <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1,
                color:"rgba(239,68,68,.7)",padding:"2px 8px",borderRadius:4,
                background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)"}}>BANNED</span>}
              <button onClick={() => onBanUsers([u.id], !!u.is_banned)}
                style={{padding:"4px 10px",borderRadius:6,cursor:"pointer",fontFamily:"'Anton',sans-serif",
                  fontSize:9,letterSpacing:1.5,transition:"all .2s",
                  border: u.is_banned ? "1px solid rgba(74,222,128,.4)" : "1px solid rgba(239,68,68,.3)",
                  background: u.is_banned ? "rgba(74,222,128,.08)" : "rgba(239,68,68,.08)",
                  color: u.is_banned ? "rgba(74,222,128,.8)" : "rgba(239,68,68,.8)"}}>
                {u.is_banned ? "UNBAN" : "BAN"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Admin: Table QR Codes ── */
function AdminTableQR() {
  const { evLabel } = useEvt();
  const [count, setCount] = useState(26);
  const [customBase, setCustomBase] = useState("https://elmundo-world-cup.com");
  const base = customBase.trim().replace(/\/$/, "");

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=1000,height=800");
    if (!win) return;
    const tables = Array.from({ length: count }, (_, i) => i + 1);
    const cards = tables.map(n => `
      <div class="card">
        <!-- Header: logo area -->
        <div class="card-top">
          <div class="logo-arch">EL MUNDO</div>
          <div class="logo-sub">BAR-REST</div>
          <div class="logo-badge">
            <span class="badge-est">EST. 2009</span>
            <span class="badge-dot">·</span>
            <span class="badge-loc">BONAIRE</span>
          </div>
        </div>

        <!-- Gold divider -->
        <div class="divider"></div>

        <!-- Table number -->
        <div class="table-label">TABLE</div>
        <div class="table-num">${n}</div>

        <!-- QR Code -->
        <div class="qr-wrap">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&color=000000&bgcolor=ffffff&data=${encodeURIComponent(base + "?table=" + n)}" />
        </div>

        <!-- Instruction -->
        <div class="scan-row">
          <span class="scan-line"></span>
          <span class="scan-text">SCAN TO ORDER</span>
          <span class="scan-line"></span>
        </div>

        <!-- Footer -->
        <div class="card-footer">
          <div class="footer-event">⚽ ${evLabel}</div>
          <div class="footer-url">elmundo-world-cup.com</div>
        </div>
      </div>
    `).join("");

    win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>Table QR Codes — El Mundo</title>
    <style>
      @page { margin: 8mm; }
      * { margin:0; padding:0; box-sizing:border-box; }
      body {
        font-family: 'Arial Black', Arial, sans-serif;
        background: #f0f0f0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 14px;
      }
      .card {
        background: #000;
        color: #fff;
        border-radius: 14px;
        padding: 20px 16px 16px;
        text-align: center;
        break-inside: avoid;
        page-break-inside: avoid;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
      }

      /* TOP — Logo */
      .card-top { width:100%; margin-bottom: 10px; }
      .logo-arch {
        font-size: 22px;
        font-weight: 900;
        letter-spacing: 5px;
        color: #fff;
        line-height: 1;
      }
      .logo-sub {
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 4px;
        color: rgba(255,255,255,.75);
        margin-top: 2px;
      }
      .logo-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border: 1px solid rgba(255,255,255,.25);
        border-radius: 4px;
        padding: 3px 10px;
        margin-top: 7px;
        font-size: 8px;
        letter-spacing: 2px;
        color: rgba(255,255,255,.5);
        font-weight: 700;
      }
      .badge-dot { color: #d4af37; }

      /* Gold divider */
      .divider {
        width: 36px;
        height: 1.5px;
        background: linear-gradient(90deg, transparent, #d4af37, transparent);
        margin: 10px auto;
        flex-shrink: 0;
      }

      /* Table number */
      .table-label {
        font-size: 8px;
        letter-spacing: 4px;
        color: rgba(255,255,255,.35);
        font-weight: 900;
        margin-bottom: 2px;
      }
      .table-num {
        font-size: 48px;
        font-weight: 900;
        color: #fff;
        line-height: 1;
        letter-spacing: -1px;
        margin-bottom: 10px;
      }

      /* QR */
      .qr-wrap {
        background: #fff;
        border-radius: 10px;
        padding: 8px;
        display: inline-block;
        margin-bottom: 12px;
      }
      .qr-wrap img {
        width: 140px;
        height: 140px;
        display: block;
      }

      /* Scan row */
      .scan-row {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        margin-bottom: 12px;
      }
      .scan-line {
        flex: 1;
        height: 1px;
        background: rgba(255,255,255,.15);
      }
      .scan-text {
        font-size: 8px;
        letter-spacing: 3px;
        color: rgba(255,255,255,.45);
        font-weight: 900;
        white-space: nowrap;
      }

      /* Footer */
      .card-footer { width: 100%; border-top: 1px solid rgba(255,255,255,.08); padding-top: 10px; }
      .footer-event {
        font-size: 9px;
        letter-spacing: 3px;
        color: #d4af37;
        font-weight: 900;
        margin-bottom: 3px;
      }
      .footer-url {
        font-size: 8px;
        letter-spacing: 1px;
        color: rgba(255,255,255,.3);
        font-weight: 700;
      }

      @media print {
        body { background: #f0f0f0; }
      }
    </style>
    </head><body>
    <div class="grid">${cards}</div>
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 800);
  };

  return (
    <div style={{padding:"0 4px"}}>
      <div className="admin-section-lbl" style={{marginBottom:8}}>TABLE QR CODES</div>
      <div className="admin-hint" style={{borderTop:"none",padding:"0 0 16px"}}>
        Each QR code links to the app with the table number pre-filled. Print them, laminate, and place on each table. When a customer scans, the table fills in automatically and they go straight to the menu.
      </div>

      <div style={{background:"#111",border:"1px solid #222",borderRadius:12,padding:16,marginBottom:16}}>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:6}}>App domain</div>
        <input
          type="text" value={customBase}
          onChange={e => setCustomBase(e.target.value)}
          style={{width:"100%",padding:"10px 12px",background:"#1a1a1a",border:"1px solid #333",
            borderRadius:8,color:"#fff",fontFamily:"'Outfit',sans-serif",fontSize:14,
            outline:"none",marginBottom:16}} />
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:10}}>Number of tables</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <input
            type="number" min={1} max={50} value={count}
            onChange={e => setCount(Math.max(1, Math.min(50, +e.target.value)))}
            style={{width:80,padding:"10px 12px",background:"#1a1a1a",border:"1px solid #333",
              borderRadius:8,color:"#fff",fontFamily:"'Anton',sans-serif",fontSize:20,
              textAlign:"center",outline:"none"}} />
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.4)"}}>
            Will generate QR codes for tables 1 – {count}
          </div>
        </div>
      </div>

      {/* Preview grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
        {Array.from({ length: Math.min(count, 6) }, (_, i) => i + 1).map(n => (
          <div key={n} style={{background:"#111",border:"1px solid #222",borderRadius:10,
            padding:12,textAlign:"center"}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:2,
              color:"#fff",marginBottom:8}}>TABLE {n}</div>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=4&data=${encodeURIComponent(base + "?table=" + n)}`}
              style={{width:80,height:80,borderRadius:6,background:"#fff",padding:4}}
              alt={`Table ${n} QR`} />
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:"rgba(255,255,255,.3)",
              marginTop:6,letterSpacing:1}}>Scan to order</div>
          </div>
        ))}
      </div>
      {count > 6 && (
        <div style={{textAlign:"center",fontFamily:"'Outfit',sans-serif",fontSize:12,
          color:"rgba(255,255,255,.3)",marginBottom:16}}>
          + {count - 6} more tables · all included in print
        </div>
      )}

      <button className="admin-save-btn" style={{width:"100%",padding:14,fontSize:14}} onClick={handlePrint}>
        🖨 Print All {count} QR Codes
      </button>
      <div className="admin-hint" style={{marginTop:8}}>
        💡 A new window opens with all QR codes ready to print. Select "4 per row" layout. Laminate each card and place it on the matching table.
      </div>
    </div>
  );
}

/* ── Admin: Tables ── */
function AdminTables() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmUnlock, setConfirmUnlock] = useState(null); // { id, tableNum }
  const [unlocking, setUnlocking] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("group_orders")
      .select("id, code, table_number, status, payment_mode, created_at, host_user_id, profiles:host_user_id(name)")
      .in("status", ["open","awaiting_payment"])
      .order("created_at", { ascending: false });
    setGroups(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const unlock = async () => {
    if (!confirmUnlock) return;
    setUnlocking(true);
    // Cancel the order FIRST so members' realtime/poll transitions fire before their data disappears
    await supabase.from("group_orders").update({ status: "cancelled" }).eq("id", confirmUnlock.id);
    await supabase.from("group_order_members").delete().eq("group_order_id", confirmUnlock.id);
    await supabase.from("group_order_items").delete().eq("group_order_id", confirmUnlock.id);
    setConfirmUnlock(null);
    setUnlocking(false);
    load();
  };

  const statusColor = (s) => s === "awaiting_payment" ? "#f59e0b" : "#22c55e";

  return (
    <div style={{padding:"0 4px"}}>
      {/* Unlock confirmation modal */}
      {confirmUnlock && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">Unlock Table {confirmUnlock.tableNum}?</div>
            <p className="modal-body">This will cancel the group order for this table. Members will be kicked out.</p>
            <div className="modal-actions">
              <button className="modal-del-btn" onClick={unlock} disabled={unlocking}>
                {unlocking ? "Unlocking…" : "Yes, Unlock"}
              </button>
              <button className="modal-cancel-btn" onClick={()=>setConfirmUnlock(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="admin-section-lbl" style={{marginBottom:8}}>
        RESERVED TABLES
        <button onClick={load} style={{marginLeft:12,fontSize:11,padding:"2px 10px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:6,cursor:"pointer"}}>↻ Refresh</button>
      </div>
      {loading && <div style={{color:"#666",padding:20,textAlign:"center"}}>Loading...</div>}
      {!loading && groups.length === 0 && (
        <div style={{color:"#555",padding:24,textAlign:"center",border:"1px dashed #333",borderRadius:10}}>No tables currently reserved</div>
      )}
      {!loading && groups.map(g => (
        <div key={g.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"#111",border:"1px solid #222",borderRadius:10,marginBottom:8}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <span style={{fontFamily:"Anton",fontSize:22,color:"#fff"}}>TABLE {g.table_number}</span>
              <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:statusColor(g.status)+"22",color:statusColor(g.status),border:`1px solid ${statusColor(g.status)}44`,fontWeight:600,letterSpacing:1}}>
                {g.status === "awaiting_payment" ? "AWAITING PAYMENT" : "OPEN"}
              </span>
            </div>
            <div style={{fontSize:12,color:"#666"}}>
              Code: <span style={{color:"#aaa",fontWeight:600}}>{g.code}</span>
              {g.profiles?.name && <> · Host: <span style={{color:"#aaa"}}>{g.profiles.name}</span></>}
              {g.payment_mode && <> · Mode: <span style={{color:"#aaa"}}>{g.payment_mode}</span></>}
            </div>
          </div>
          <button
            onClick={() => setConfirmUnlock({ id: g.id, tableNum: g.table_number })}
            style={{padding:"8px 16px",background:"#1a0000",border:"1px solid #7f1d1d",color:"#f87171",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600,letterSpacing:1,flexShrink:0}}
          >
            🔓 UNLOCK
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Admin: Matches ── */
function AdminMatches({ matches, onUpdate, onAdd, onDelete }) {
  const [editId,  setEditId]  = useState(null);
  const [addMode, setAddMode] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [ef, setEf] = useState({});
  const [sorted, setSorted] = useState(false);

  const startEdit  = m => { setEditId(m.id); setEf({...m, hs:m.hs??'', as:m.as??''}); setAddMode(false); };
  const cancelEdit = () => { setEditId(null); setEf({}); };
  const efSet = k => e => setEf(f=>({...f,[k]:e.target.value}));
  const saveEdit = () => {
    if (!ef.home||!ef.away||!ef.date||!ef.time||!ef.group) return;
    const fin = ef.hs!==''&&ef.as!=='';
    onUpdate({...ef, status:fin?"finished":"upcoming", hs:fin?+ef.hs:null, as:fin?+ef.as:null});
    setEditId(null); setEf({});
  };
  const blank = { home:"", away:"", date:"", time:"18:00", group:"Group A", hs:"", as:"" };
  const [af, setAf] = useState(blank);
  const afSet = k => e => setAf(f=>({...f,[k]:e.target.value}));
  const saveAdd = () => {
    if (!af.home||!af.away||!af.date||!af.time||!af.group) return;
    const fin = af.hs!==''&&af.as!=='';
    onAdd({...af, status:fin?"finished":"upcoming", hs:fin?+af.hs:null, as:fin?+af.as:null});
    setAf(blank); setAddMode(false);
  };
  // Matches are already sorted in memory via sortMatches() below — no DB writes needed
  const doSort = () => {
    setSorted(true);
    setTimeout(() => setSorted(false), 2000);
  };

  const upcoming = sortMatches(matches.filter(m=>m.status==="upcoming"));
  const finished = sortMatches(matches.filter(m=>m.status==="finished"));

  return (
    <div>
      <div className="admin-topbar">
        <div className="admin-section-lbl" style={{margin:0}}>MATCHES</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button className="admin-add-btn" style={{background:sorted?"#22c55e":"",color:sorted?"#fff":""}} onClick={doSort}>
            {sorted ? "✓ Sorted!" : "↕ Sort by Date"}
          </button>
          <button className="admin-add-btn" onClick={()=>{setAddMode(v=>!v);setEditId(null);}}>
            {addMode ? "✕ Cancel" : "+ Add Match"}
          </button>
        </div>
      </div>

      {addMode && (
        <div className="admin-form-card" style={{marginTop:12}}>
          <div className="admin-form-title">NEW MATCH</div>
          <div className="admin-form-grid">
            <AField label="Home Team"      val={af.home}  on={afSet("home")}  ph="e.g. Brazil"  />
            <AField label="Away Team"      val={af.away}  on={afSet("away")}  ph="e.g. France"  />
            <AField label="Date (Jun 20)"  val={af.date}  on={afSet("date")}  ph="e.g. Jun 20"  />
            <AField label="Time (BON)"     val={af.time}  on={afSet("time")}  ph="18:00"        />
            <AField label="Group"          val={af.group} on={afSet("group")} ph="Group A"      />
          </div>
          <div className="admin-score-row">
            <span className="admin-score-lbl">Final Score (leave blank if upcoming)</span>
            <div className="admin-score-inputs">
              <input className="admin-sinput" type="number" min="0" max="20" value={af.hs} onChange={afSet("hs")} placeholder="H" />
              <span className="admin-sep">–</span>
              <input className="admin-sinput" type="number" min="0" max="20" value={af.as} onChange={afSet("as")} placeholder="A" />
            </div>
          </div>
          <div className="admin-form-actions">
            <button className="admin-save-btn" onClick={saveAdd}>Save Match</button>
            <button className="admin-cancel-btn" onClick={()=>setAddMode(false)}>Cancel</button>
          </div>
        </div>
      )}

      {confirm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">Delete this match?</div>
            <p className="modal-body">This cannot be undone.</p>
            <div className="modal-actions">
              <button className="modal-del-btn" onClick={()=>{ onDelete(confirm); setConfirm(null); }}>Yes, Delete</button>
              <button className="modal-cancel-btn" onClick={()=>setConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-section-lbl" style={{marginTop:20}}>UPCOMING <span className="admin-count">{upcoming.length}</span></div>
      <div className="card-stack">
        {upcoming.length===0 && <div className="empty">No upcoming matches.</div>}
        {upcoming.map(m => editId===m.id
          ? <AdminEditCard key={m.id} ef={ef} efSet={efSet} onSave={saveEdit} onCancel={cancelEdit} />
          : <AdminMatchRow key={m.id} m={m} onEdit={()=>startEdit(m)} onDelete={()=>setConfirm(m.id)} />
        )}
      </div>

      <div className="admin-section-lbl">FINISHED <span className="admin-count">{finished.length}</span></div>
      <div className="card-stack">
        {finished.length===0 && <div className="empty">No finished matches yet.</div>}
        {finished.map(m => editId===m.id
          ? <AdminEditCard key={m.id} ef={ef} efSet={efSet} onSave={saveEdit} onCancel={cancelEdit} />
          : <AdminMatchRow key={m.id} m={m} onEdit={()=>startEdit(m)} onDelete={()=>setConfirm(m.id)} />
        )}
      </div>
      <div className="admin-hint">💡 To award points: click Edit on a finished match, fill in the score, then Save & Update Leaderboard.</div>
    </div>
  );
}

function AdminMatchRow({ m, onEdit, onDelete }) {
  return (
    <div className="admin-row">
      <div className="admin-row-left">
        <span className="admin-row-group">{m.group}</span>
        <span className="admin-row-teams">{flag(m.home)} {m.home} vs {m.away} {flag(m.away)}</span>
        <span className="admin-row-dt">{m.date} · {m.time} BON</span>
      </div>
      <div className="admin-row-right">
        {m.status==="finished"
          ? <span className="admin-score-badge">{m.hs} – {m.as} <span className="finished-tag">FINAL</span></span>
          : <span className="upcoming-tag">UPCOMING</span>}
        <button className="admin-edit-btn" onClick={onEdit}>Edit</button>
        <button className="admin-del-btn"  onClick={onDelete}>✕</button>
      </div>
    </div>
  );
}

function AdminEditCard({ ef, efSet, onSave, onCancel }) {
  return (
    <div className="admin-form-card admin-edit-card">
      <div className="admin-form-title">EDITING MATCH</div>
      <div className="admin-form-grid">
        <AField label="Home Team"     val={ef.home}  on={efSet("home")}  ph="Home"    />
        <AField label="Away Team"     val={ef.away}  on={efSet("away")}  ph="Away"    />
        <AField label="Date (Jun 20)" val={ef.date}  on={efSet("date")}  ph="Jun 15"  />
        <AField label="Time (BON)"    val={ef.time}  on={efSet("time")}  ph="18:00"   />
        <AField label="Group"         val={ef.group} on={efSet("group")} ph="Group A" />
      </div>
      <div className="admin-score-row">
        <span className="admin-score-lbl">Final Score — fills this marks match as FINISHED and awards points</span>
        <div className="admin-score-inputs" style={{gap:16,alignItems:"center"}}>
          {/* Home stepper */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.35)",letterSpacing:2}}>{ef.home||"HOME"}</span>
            <div style={{display:"flex",alignItems:"center",gap:0,background:"rgba(255,255,255,.06)",borderRadius:10,overflow:"hidden",border:"1px solid rgba(255,255,255,.12)"}}>
              <button type="button" onClick={()=>efSet("hs")({target:{value:Math.max(0,(+ef.hs||0)-1)}})}
                style={{padding:"10px 16px",background:"none",border:"none",color:"rgba(255,255,255,.7)",fontSize:20,cursor:"pointer",fontWeight:"bold",lineHeight:1}}>−</button>
              <span style={{fontFamily:"'Anton',sans-serif",fontSize:28,color:"#fff",minWidth:36,textAlign:"center",lineHeight:1}}>{ef.hs===undefined||ef.hs===""?"·":ef.hs}</span>
              <button type="button" onClick={()=>efSet("hs")({target:{value:Math.min(20,(+ef.hs||0)+1)}})}
                style={{padding:"10px 16px",background:"none",border:"none",color:"rgba(255,255,255,.7)",fontSize:20,cursor:"pointer",fontWeight:"bold",lineHeight:1}}>+</button>
            </div>
          </div>
          <span className="admin-sep" style={{fontSize:28,alignSelf:"flex-end",marginBottom:4}}>–</span>
          {/* Away stepper */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.35)",letterSpacing:2}}>{ef.away||"AWAY"}</span>
            <div style={{display:"flex",alignItems:"center",gap:0,background:"rgba(255,255,255,.06)",borderRadius:10,overflow:"hidden",border:"1px solid rgba(255,255,255,.12)"}}>
              <button type="button" onClick={()=>efSet("as")({target:{value:Math.max(0,(+ef.as||0)-1)}})}
                style={{padding:"10px 16px",background:"none",border:"none",color:"rgba(255,255,255,.7)",fontSize:20,cursor:"pointer",fontWeight:"bold",lineHeight:1}}>−</button>
              <span style={{fontFamily:"'Anton',sans-serif",fontSize:28,color:"#fff",minWidth:36,textAlign:"center",lineHeight:1}}>{ef.as===undefined||ef.as===""?"·":ef.as}</span>
              <button type="button" onClick={()=>efSet("as")({target:{value:Math.min(20,(+ef.as||0)+1)}})}
                style={{padding:"10px 16px",background:"none",border:"none",color:"rgba(255,255,255,.7)",fontSize:20,cursor:"pointer",fontWeight:"bold",lineHeight:1}}>+</button>
            </div>
          </div>
          {/* Clear result */}
          {(ef.hs!==""||ef.as!=="") && (
            <button type="button" onClick={()=>{efSet("hs")({target:{value:""}});efSet("as")({target:{value:""}});}}
              style={{padding:"6px 12px",background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,color:"rgba(239,68,68,.8)",fontFamily:"'Outfit',sans-serif",fontSize:11,cursor:"pointer",marginTop:18}}>
              CLEAR
            </button>
          )}
        </div>
      </div>
      <div className="admin-form-actions">
        <button className="admin-save-btn" onClick={onSave}>Save & Update Leaderboard</button>
        <button className="admin-cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ── Admin: Rules ── */
function AdminRules({ rules, onSave }) {
  const [local, setLocal] = useState(rules.map(r=>({...r})));
  // Keep local state in sync if rules load async after mount
  useEffect(() => { setLocal(rules.map(r=>({...r}))); }, [rules.length]);
  const update = (id, field, val) => setLocal(l => l.map(r => r.id===id ? {...r,[field]:val} : r));
  const addRule = () => setLocal(l => [...l, { id:`r${Date.now()}`, title:"", body:"" }]);
  const removeRule = (id) => setLocal(l => l.filter(r => r.id!==id));
  return (
    <div>
      <div className="admin-topbar" style={{marginTop:16}}>
        <div className="admin-section-lbl" style={{margin:0}}>EVENT RULES</div>
        <button className="admin-add-btn" onClick={addRule}>+ Add Rule</button>
      </div>
      <div className="card-stack" style={{marginTop:12}}>
        {local.map((r, i) => (
          <div key={r.id} className="admin-form-card" style={{marginBottom:0}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <span className="admin-form-title" style={{margin:0}}>RULE {i+1}</span>
              <button className="admin-del-btn" onClick={()=>removeRule(r.id)}>✕</button>
            </div>
            <AField label="Title" val={r.title} on={e=>update(r.id,"title",e.target.value)} ph="e.g. How to Play" />
            <div className="afield" style={{marginTop:10}}>
              <label className="afield-lbl">Description</label>
              <textarea className="afield-inp afield-ta" value={r.body} onChange={e=>update(r.id,"body",e.target.value)} placeholder="Explain this rule..." rows={3} />
            </div>
          </div>
        ))}
      </div>
      <button className="admin-save-btn" style={{width:"100%",marginTop:14,padding:14}} onClick={()=>onSave(local)}>
        Save All Rules
      </button>
      <div className="admin-hint" style={{marginTop:8}}>💡 Changes appear instantly for all players after saving.</div>
    </div>
  );
}

/* ── Admin: Sponsors ── */
function AdminSponsors({ sponsors, onSave }) {
  const [local, setLocal] = useState(sponsors.map(s=>({...s})));
  // Keep local state in sync if sponsors load async after mount
  useEffect(() => { setLocal(sponsors.map(s=>({...s}))); }, [sponsors.length]);
  const update = (id, field, val) => setLocal(l => l.map(s => s.id===id ? {...s,[field]:val} : s));
  const addSponsor = () => setLocal(l => [...l, { id:`s${Date.now()}`, name:"", role:"", detail:"", emoji:"⭐" }]);
  const removeSponsor = (id) => setLocal(l => l.filter(s => s.id!==id));
  return (
    <div>
      <div className="admin-topbar" style={{marginTop:16}}>
        <div className="admin-section-lbl" style={{margin:0}}>SPONSORS</div>
        <button className="admin-add-btn" onClick={addSponsor}>+ Add Sponsor</button>
      </div>
      <div className="card-stack" style={{marginTop:12}}>
        {local.map((s, i) => (
          <div key={s.id} className="admin-form-card" style={{marginBottom:0}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <span className="admin-form-title" style={{margin:0}}>SPONSOR {i+1}{i===0?" — EVENT HOST":""}</span>
              <button className="admin-del-btn" onClick={()=>removeSponsor(s.id)}>✕</button>
            </div>
            <div className="admin-form-grid">
              <AField label="Business Name" val={s.name}   on={e=>update(s.id,"name",e.target.value)}   ph="e.g. El Mundo Bar"      />
              <AField label="Role / Tier"   val={s.role}   on={e=>update(s.id,"role",e.target.value)}   ph="e.g. Gold Sponsor"      />
              <AField label="Details"       val={s.detail} on={e=>update(s.id,"detail",e.target.value)} ph="e.g. website or tagline" />
              <AField label="Emoji / Icon"  val={s.emoji}  on={e=>update(s.id,"emoji",e.target.value)}  ph="⭐"                     />
            </div>
          </div>
        ))}
      </div>
      <button className="admin-save-btn" style={{width:"100%",marginTop:14,padding:14}} onClick={()=>onSave(local)}>
        Save All Sponsors
      </button>
      <div className="admin-hint" style={{marginTop:8}}>💡 The first sponsor in the list appears as the main featured sponsor.</div>
    </div>
  );
}

/* ── Admin: VIP / Sponsor Perks ── */
const SPONSOR_TIERS = ["gold", "silver"];
const TIER_META = {
  gold:   { label:"GOLD",   color:"#FFD700", bg:"rgba(255,215,0,.12)",   icon:"🥇" },
  silver: { label:"SILVER", color:"#C0C0C0", bg:"rgba(192,192,192,.12)", icon:"🥈" },
};

function AdminSponsorPerks({ users, sponsorGifts, menuItems = [], onSetTier, onSaveGifts }) {
  const [subTab, setSubTab] = useState("users"); // "users" | "gifts" | "configure"
  const [search, setSearch] = useState("");
  const [gifts, setGifts]   = useState(sponsorGifts.map(g => ({ ...g, _key: g.id || Math.random() })));
  const [saving, setSaving] = useState(false);
  const [redemptions, setRedemptions] = useState([]);
  const [loadingRed, setLoadingRed]   = useState(false);
  const [pickerTier, setPickerTier]   = useState(null); // when set, the menu picker overlay is open for this tier
  // Keep gifts in sync if sponsorGifts loads async after mount
  useEffect(() => { setGifts(sponsorGifts.map(g => ({ ...g, _key: g.id || Math.random() }))); }, [sponsorGifts.length]);

  const [usedByUser, setUsedByUser] = useState({}); // userId -> {itemId -> qty}

  const loadRedemptions = async () => {
    setLoadingRed(true);
    const { data } = await supabase.from("orders").select("*")
      .eq("payment_method", "sponsor_gift")
      .order("created_at", { ascending: false });
    setRedemptions(data || []);
    // Build per-user usage map
    const byUser = {};
    (data || []).forEach(r => {
      if (!byUser[r.user_id]) byUser[r.user_id] = {};
      (r.items || []).forEach(it => {
        byUser[r.user_id][String(it.id)] = (byUser[r.user_id][String(it.id)] || 0) + (it.qty || 1);
      });
    });
    setUsedByUser(byUser);
    setLoadingRed(false);
  };

  useEffect(() => { loadRedemptions(); }, []);

  const userList = Object.values(users)
    .sort((a,b) => (a.name||"").localeCompare(b.name||""))
    .filter(u => !search || u.name?.toLowerCase().includes(search.toLowerCase()));

  // Add an item from menu to a tier. If the same item already exists for that tier,
  // just bump the quantity instead of duplicating the row.
  const addGiftFromMenu = (tier, menuItem) => {
    setGifts(g => {
      const existing = g.find(x => x.tier === tier && x.menu_item_id === menuItem.id);
      if (existing) {
        return g.map(x => x._key === existing._key ? { ...x, quantity: (+x.quantity || 0) + 1 } : x);
      }
      return [...g, {
        _key: `${Date.now()}-${Math.random()}`,
        tier,
        menu_item_id: menuItem.id,
        item_name: menuItem.name,
        item_category: menuItem.category,
        item_price: 0,
        quantity: 1,
      }];
    });
  };
  const removeGift = (key) => setGifts(g => g.filter(x => x._key !== key));
  const updateGift = (key, field, val) => setGifts(g => g.map(x => x._key === key ? { ...x, [field]: val } : x));

  const handleSave = async () => {
    setSaving(true);
    await onSaveGifts(gifts.filter(g => (g.item_name || "").trim()));
    setSaving(false);
  };

  return (
    <div>
      <div style={{display:"flex",gap:8,padding:"12px 14px 0"}}>
        {["users","gifts","configure"].map(id => (
          <button key={id} className={`admin-subtab ${subTab===id?"ast-on":""}`} style={{flex:1}}
            onClick={()=>setSubTab(id)}>
            {id === "users" ? "👥 Sponsors" : id === "gifts" ? "🎁 Status" : "⚙️ Config"}
          </button>
        ))}
      </div>

      {subTab === "users" && (
        <div>
          <div style={{padding:"12px 14px 8px"}}>
            <input className="afield-inp" placeholder="Search by name…" value={search}
              onChange={e=>setSearch(e.target.value)} style={{width:"100%",boxSizing:"border-box"}} />
          </div>
          <div className="admin-hint" style={{margin:"0 14px 8px",borderTop:"none",padding:0}}>
            Set a user's VIP tier — they'll get a ⭐ VIP tab. They must refresh their app after you assign it. Sponsors only see "VIP GUEST", not their tier label.
          </div>
          {userList.map(u => {
            const uGifts = u.sponsor_tier ? gifts.filter(g => g.tier === u.sponsor_tier) : [];
            const uUsed = usedByUser[u.id] || {};
            const totalAlloc = uGifts.reduce((s,g) => s + (+g.quantity||0), 0);
            const totalUsed = uGifts.reduce((s,g) => s + (uUsed[String(g.id)] || 0), 0);
            const allRedeemed = totalAlloc > 0 && totalUsed >= totalAlloc;
            return (
            <div key={u.id} className="admin-row" style={{alignItems:"center"}}>
              <div style={{flex:1,minWidth:0}}>
                <div className="admin-row-teams" style={{fontSize:13}}>{u.name}</div>
                <div className="admin-row-dt">{u.phone||u.email||""}</div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                {SPONSOR_TIERS.map(tier => {
                  const m = TIER_META[tier];
                  const active = u.sponsor_tier === tier;
                  return (
                    <button key={tier} onClick={() => onSetTier(u.id, active ? null : tier)}
                      style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${active ? m.color : "rgba(255,255,255,.15)"}`,
                        background: active ? m.bg : "transparent",
                        color: active ? m.color : "rgba(255,255,255,.4)",
                        fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,cursor:"pointer",transition:"all .2s"}}>
                      {m.icon} {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })}
          {userList.length === 0 && <div className="empty">No users found</div>}
        </div>
      )}

      {subTab === "gifts" && (
        <div style={{padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div className="admin-hint" style={{borderTop:"none",padding:0,margin:0}}>
              Live gift status per sponsor. Updates on refresh.
            </div>
            <button className="admin-save-btn" style={{padding:"6px 12px",fontSize:9,letterSpacing:1}} onClick={loadRedemptions}>↺ Refresh</button>
          </div>
          {/* Per-sponsor live status */}
          {Object.values(users).filter(u => u.sponsor_tier).length === 0 ? (
            <div style={{color:"rgba(255,255,255,.3)",fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:2,padding:20,textAlign:"center"}}>NO SPONSORS ASSIGNED YET</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>
              {Object.values(users).filter(u => u.sponsor_tier).sort((a,b) => (a.name||"").localeCompare(b.name||"")).map(u => {
                const uGifts = gifts.filter(g => g.tier === u.sponsor_tier);
                const uUsed = usedByUser[u.id] || {};
                const m = TIER_META[u.sponsor_tier];
                return (
                  <div key={u.id} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,padding:"12px 14px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,letterSpacing:1,color:"#fff"}}>{u.name}</div>
                      <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1,color:m?.color||"#aaa",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",padding:"2px 8px",borderRadius:4}}>
                        {m?.label||u.sponsor_tier}
                      </div>
                    </div>
                    {uGifts.length === 0 ? (
                      <div style={{fontSize:12,color:"rgba(255,255,255,.3)"}}>No gifts configured for this tier</div>
                    ) : (
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {uGifts.map(g => {
                          const used = uUsed[String(g.id)] || 0;
                          const total = +g.quantity || 0;
                          const remaining = Math.max(0, total - used);
                          const allUsed = remaining === 0 && total > 0;
                          return (
                            <div key={g.id || g._key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                              <span style={{fontSize:13,color:"rgba(255,255,255,.8)"}}>{g.item_name}</span>
                              <span style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:1,
                                color: allUsed ? "#f87171" : remaining < total ? "#fbbf24" : "#4ade80"}}>
                                {allUsed ? "ALL USED" : `${remaining} LEFT`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === "configure" && (
        <div style={{padding:"12px 14px"}}>
          <div className="admin-hint" style={{borderTop:"none",padding:"0 0 12px"}}>
            Pick items from the menu for each tier. Every sponsor on that tier gets the same items free.
          </div>
          {SPONSOR_TIERS.map(tier => {
            const m = TIER_META[tier];
            const tierGifts = gifts.filter(g => g.tier === tier);
            const totalItems = tierGifts.reduce((s,g) => s + (+g.quantity || 0), 0);
            return (
              <div key={tier} className="vip-tier-panel" style={{borderColor: m.color + "33"}}>
                <div className="vip-tier-hd">
                  <div className="vip-tier-hd-l" style={{color: m.color}}>
                    {m.icon} {m.label} TIER
                  </div>
                  <div className="vip-tier-hd-r">{totalItems} item{totalItems === 1 ? "" : "s"} total</div>
                </div>

                {tierGifts.length === 0 ? (
                  <div className="vip-tier-empty">
                    No items yet. Tap below to pick from the menu.
                  </div>
                ) : (
                  <div className="vip-tier-list">
                    {tierGifts.map(g => (
                      <div key={g._key} className="vip-tier-item">
                        <div className="vip-tier-item-info">
                          <div className="vip-tier-item-name">{g.item_name}</div>
                          {g.item_category && (
                            <div className="vip-tier-item-cat">{catMeta(g.item_category).icon} {g.item_category}</div>
                          )}
                        </div>
                        <div className="vip-tier-item-qty">
                          <button className="vip-qty-btn" onClick={()=>updateGift(g._key,"quantity", Math.max(1, (+g.quantity || 1) - 1))}>−</button>
                          <span className="vip-qty-val">{g.quantity}</span>
                          <button className="vip-qty-btn" onClick={()=>updateGift(g._key,"quantity", (+g.quantity || 1) + 1)}>+</button>
                        </div>
                        <button className="vip-tier-del" onClick={()=>removeGift(g._key)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <button className="vip-tier-add-btn" style={{color: m.color, borderColor: m.color + "55"}}
                  onClick={() => setPickerTier(tier)}>
                  + ADD ITEMS FROM MENU
                </button>
              </div>
            );
          })}
          <button className="admin-save-btn" style={{width:"100%",padding:14,marginTop:8}} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save All Tier Packages"}
          </button>
        </div>
      )}

      {/* Menu picker overlay */}
      {pickerTier && (
        <MenuPickerOverlay
          menuItems={menuItems}
          tier={pickerTier}
          tierMeta={TIER_META[pickerTier]}
          alreadyPicked={new Set(gifts.filter(g => g.tier === pickerTier && g.menu_item_id).map(g => g.menu_item_id))}
          onPick={(menuItem) => addGiftFromMenu(pickerTier, menuItem)}
          onClose={() => setPickerTier(null)}
        />
      )}

    </div>
  );
}

// Menu picker — used by AdminSponsorPerks to add menu items to a tier
function MenuPickerOverlay({ menuItems, tier, tierMeta, alreadyPicked, onPick, onClose }) {
  const [section, setSection] = useState("DRINKS");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const q = search.toLowerCase().trim();
  const filtered = menuItems
    .filter(i => i.available !== false)
    .filter(i => {
      const cat = catMeta(i.category);
      const isFood = FOOD_CATS.has(i.category);
      const inSection = section === "FOOD" ? isFood : !isFood;
      return inSection;
    })
    .filter(i => !q || (i.name || "").toLowerCase().includes(q) || (i.category || "").toLowerCase().includes(q));

  // Group by category
  const grouped = {};
  filtered.forEach(i => {
    if (!grouped[i.category]) grouped[i.category] = [];
    grouped[i.category].push(i);
  });

  return createPortal(
    <div className="vip-picker-root" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="vip-picker">
        <div className="vip-picker-hd">
          <div className="vip-picker-hd-title">
            <span style={{color: tierMeta.color}}>{tierMeta.icon} {tierMeta.label}</span>
            <span style={{color:"rgba(255,255,255,.4)",marginLeft:8}}>· Pick items</span>
          </div>
          <button className="vip-picker-close" onClick={onClose}>✕</button>
        </div>

        <div className="vip-picker-tabs">
          {["DRINKS","FOOD"].map(s => (
            <button key={s}
              className={`vip-picker-tab ${section === s ? "vip-picker-tab-on" : ""}`}
              onClick={() => setSection(s)}>
              {s === "FOOD" ? "🍔" : "🍺"} {s}
            </button>
          ))}
        </div>

        <input type="text" className="vip-picker-search"
          placeholder="Search items…"
          value={search} onChange={e => setSearch(e.target.value)} />

        <div className="vip-picker-body">
          {Object.keys(grouped).length === 0 ? (
            <div className="vip-picker-empty">
              {menuItems.length === 0 ? "No menu items defined — add some in Menu admin first." : "No items found"}
            </div>
          ) : (
            Object.entries(grouped).map(([cat, items]) => {
              const meta = catMeta(cat);
              return (
                <div key={cat} className="vip-picker-cat">
                  <div className="vip-picker-cat-hd">{meta.icon} {meta.label}</div>
                  {items.map(it => {
                    const picked = alreadyPicked.has(it.id);
                    return (
                      <button key={it.id}
                        className={`vip-picker-item ${picked ? "vip-picker-item-picked" : ""}`}
                        onClick={() => onPick(it)}>
                        <div className="vip-picker-item-l">
                          <div className="vip-picker-item-name">{it.name}</div>
                          <div className="vip-picker-item-price">${(+it.price).toFixed(2)} retail</div>
                        </div>
                        <div className="vip-picker-item-r" style={{color: picked ? "#4ade80" : tierMeta.color}}>
                          {picked ? "+1 MORE" : "+ ADD"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <button className="vip-picker-done" onClick={onClose}>DONE</button>
      </div>
    </div>,
    document.body
  );
}

/* ── Onboarding Tutorial ── */
const ONBOARDING_KEY = "em_onboarding_v2";
function makeOnboardingSlides(evName, evYear) {
  return [
    {
      emoji: "⚽",
      title: "Welcome to El Mundo",
      sub: `${evName} ${evYear} · BONAIRE`,
      body: "The official prediction game & ordering app for El Mundo Bar-Rest. Predict match scores, order food & drinks from your table, and compete to top the leaderboard.",
      cta: null,
    },
    {
      emoji: "🎯",
      title: "Predict Every Match",
      sub: "MATCHES TAB",
      body: `Go to the Matches tab, pick any ${evName} game, and enter your predicted home and away score. Save it. You can change predictions anytime before the deadline.`,
      cta: null,
    },
    {
      emoji: "🏆",
      title: "How Points Work",
      sub: "SCORING SYSTEM",
      body: "Exact score correct → 5 pts\nCorrect winner (wrong score) → 1 pt\nDraw with wrong score → 0 pts\nWrong or missing prediction → 0 pts",
      cta: null,
    },
    {
      emoji: "🍺",
      title: "Order From Your Seat",
      sub: "MENU TAB",
      body: "Top up credits at the desk (cash or card). Scan the QR code on your table — it fills your table number automatically. Order food & drinks straight from your phone.",
      cta: null,
    },
    {
      emoji: "🚀",
      title: "You're All Set!",
      sub: "GOOD LUCK",
      body: "Head to the Matches tab and start predicting. May the best fan win!",
      cta: "LET'S GO →",
    },
  ];
}

function OnboardingTutorial({ onDone }) {
  const { evName, evYear } = useEvt();
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);
  const touchStartX = useRef(null);
  const ONBOARDING_SLIDES = React.useMemo(() => makeOnboardingSlides(evName, evYear), [evName, evYear]);
  const slide = ONBOARDING_SLIDES[step];
  const total = ONBOARDING_SLIDES.length;

  const finish = () => {
    setExiting(true);
    localStorage.setItem(ONBOARDING_KEY, "1");
    setTimeout(onDone, 350);
  };

  const next = () => {
    if (step < total - 1) setStep(s => s + 1);
    else finish();
  };

  const prev = () => { if (step > 0) setStep(s => s - 1); };

  const onTouchStart = e => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = e => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -50) next();
    else if (dx > 50) prev();
    touchStartX.current = null;
  };

  return createPortal(
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position:"fixed",inset:0,zIndex:9999,
        background:"#000",
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        padding:"24px 28px",
        opacity: exiting ? 0 : 1,
        transition:"opacity .35s ease",
      }}>

      {/* Skip */}
      <button onClick={finish} style={{
        position:"absolute",top:52,right:20,
        background:"transparent",border:"none",
        fontFamily:"'Outfit',sans-serif",fontSize:13,
        color:"rgba(255,255,255,.35)",cursor:"pointer",
        letterSpacing:1,padding:"8px 12px",
      }}>SKIP</button>

      {/* Slide content */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:"100%",maxWidth:380,textAlign:"center",gap:20}}>

        {/* Emoji */}
        <div style={{fontSize:72,lineHeight:1,marginBottom:4}}>{slide.emoji}</div>

        {/* Sub label */}
        <div style={{
          fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:4,
          color:"rgba(255,255,255,.3)",
        }}>{slide.sub}</div>

        {/* Title */}
        <div style={{
          fontFamily:"'Anton',sans-serif",fontSize:30,letterSpacing:1,
          color:"#fff",lineHeight:1.1,
        }}>{slide.title}</div>

        {/* Thin gold line */}
        <div style={{width:40,height:2,background:"rgba(212,175,55,.6)",borderRadius:2}}/>

        {/* Body */}
        <div style={{
          fontFamily:"'Outfit',sans-serif",fontSize:15,color:"rgba(255,255,255,.65)",
          lineHeight:1.7,whiteSpace:"pre-line",
        }}>{slide.body}</div>
      </div>

      {/* Bottom: dots + button */}
      <div style={{width:"100%",maxWidth:380,display:"flex",flexDirection:"column",alignItems:"center",gap:24,paddingBottom:20}}>
        {/* Dot indicators */}
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {ONBOARDING_SLIDES.map((_,i) => (
            <div key={i} onClick={()=>setStep(i)} style={{
              width: i===step ? 24 : 7,
              height:7,
              borderRadius:4,
              background: i===step ? "#fff" : "rgba(255,255,255,.2)",
              transition:"all .3s ease",
              cursor:"pointer",
            }}/>
          ))}
        </div>

        {/* CTA button */}
        <button onClick={next} style={{
          width:"100%",padding:"17px 0",
          background:"#fff",color:"#000",
          border:"none",cursor:"pointer",
          fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:3,
          borderRadius:10,
          transition:"opacity .15s",
        }}>
          {slide.cta || (step < total - 1 ? "NEXT →" : "LET'S GO →")}
        </button>

        {step > 0 && (
          <button onClick={prev} style={{
            background:"transparent",border:"none",
            fontFamily:"'Outfit',sans-serif",fontSize:13,
            color:"rgba(255,255,255,.3)",cursor:"pointer",letterSpacing:1,
            marginTop:-10,padding:"4px 12px",
          }}>← Back</button>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ── QR Table Scanner ── */
function QRTableScanner({ onScan, onClose }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [hint,  setHint]  = useState("Point the camera at a table QR code");

  useEffect(() => {
    let active = true;
    let successTimeout = null;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        const scan = () => {
          if (!active) return;
          const video  = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || video.readyState !== 4) { rafRef.current = requestAnimationFrame(scan); return; }
          canvas.width  = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(video, 0, 0);
          const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            try {
              const url    = new URL(code.data);
              const table  = url.searchParams.get("table");
              const num    = parseInt(table);
              if (table && num >= 1 && num <= 50) {
                if (active) setHint(`✅ Table ${num} detected!`);
                cancelAnimationFrame(rafRef.current);
                successTimeout = setTimeout(() => {
                  if (active) { onScan(String(num)); onClose(); }
                }, 400);
                return;
              }
            } catch {}
            if (active) setHint("QR code found but not a table code — try again");
          }
          rafRef.current = requestAnimationFrame(scan);
        };
        rafRef.current = requestAnimationFrame(scan);
      })
      .catch(() => { if (active) setError("Camera access denied. Please allow camera permission and try again."); });
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
      clearTimeout(successTimeout);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return createPortal(
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"#000",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",
        background:"rgba(0,0,0,.8)",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
        <div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,letterSpacing:3,color:"#fff"}}>SCAN TABLE QR CODE</div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>Point at the QR code on your table</div>
        </div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",
          color:"#fff",borderRadius:8,padding:"6px 14px",fontFamily:"'Outfit',sans-serif",fontSize:13,cursor:"pointer"}}>
          Cancel
        </button>
      </div>

      {/* Camera */}
      <div style={{flex:1,position:"relative",overflow:"hidden"}}>
        {error ? (
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",gap:12,padding:32}}>
            <span style={{fontSize:40}}>📷</span>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:"rgba(255,255,255,.6)",textAlign:"center"}}>{error}</div>
          </div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted
              style={{width:"100%",height:"100%",objectFit:"cover"}} />
            <canvas ref={canvasRef} style={{display:"none"}} />
            {/* Scanner frame overlay */}
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
              <div style={{width:220,height:220,position:"relative"}}>
                {/* Corner brackets */}
                {[["0,0","0","0"],["0,auto","0","auto"],["auto,0","auto","0"],["auto,auto","auto","auto"]].map(([key,t,l],i) => (
                  <div key={i} style={{position:"absolute",
                    top: i < 2 ? 0 : "auto", bottom: i >= 2 ? 0 : "auto",
                    left: i % 2 === 0 ? 0 : "auto", right: i % 2 === 1 ? 0 : "auto",
                    width:32,height:32,
                    borderTop:    i < 2  ? "3px solid #FFD700" : "none",
                    borderBottom: i >= 2 ? "3px solid #FFD700" : "none",
                    borderLeft:   i % 2 === 0 ? "3px solid #FFD700" : "none",
                    borderRight:  i % 2 === 1 ? "3px solid #FFD700" : "none",
                  }} />
                ))}
                {/* Scan line */}
                <div style={{position:"absolute",left:8,right:8,top:"50%",height:2,
                  background:"linear-gradient(90deg,transparent,#FFD700,transparent)",
                  animation:"qrScanLine 2s ease-in-out infinite"}} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Hint bar */}
      <div style={{padding:"14px 16px",background:"rgba(0,0,0,.85)",textAlign:"center",
        fontFamily:"'Outfit',sans-serif",fontSize:13,
        color: hint.startsWith("✅") ? "#4ade80" : "rgba(255,255,255,.6)"}}>
        {hint}
      </div>

      <style>{`@keyframes qrScanLine{0%,100%{top:10%}50%{top:90%}}`}</style>
    </div>,
    document.body
  );
}

/* ── Sponsor VIP View (user-facing) ── */
function SponsorView({ user, sponsorGifts, placeOrder, onToast }) {
  const tier      = user?.sponsor_tier;
  const m         = tier ? TIER_META[tier] : null;
  const myGifts   = sponsorGifts.filter(g => g.tier === tier);
  const [cart, setCart]         = useState({});
  const [placing, setPlacing]   = useState(false);
  const [done, setDone]         = useState(false);
  const [pickupNum, setPickupNum] = useState(null);
  // usedQty: how many of each gift_id the sponsor has already ordered (lifetime)
  const [usedQty, setUsedQty]   = useState({});
  const [loadingUsed, setLoadingUsed] = useState(true);

  // Load past sponsor_gift orders for this user
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("orders")
      .select("items")
      .eq("user_id", user.id)
      .eq("payment_method", "sponsor_gift")
      .then(({ data }) => {
        const used = {};
        (data || []).forEach(order => {
          (order.items || []).forEach(item => {
            used[item.id] = (used[item.id] || 0) + item.qty;
          });
        });
        setUsedQty(used);
        setLoadingUsed(false);
      })
      .catch(() => { setLoadingUsed(false); });
  }, [user?.id]);

  if (!tier || !m) return (
    <div style={{padding:32,textAlign:"center",color:"rgba(255,255,255,.4)",fontFamily:"'Outfit',sans-serif"}}>
      No sponsor access configured.
    </div>
  );

  // remaining = gift.quantity - already used - in current cart
  const getRemaining = (g) => Math.max(0, g.quantity - (usedQty[String(g.id)] || 0));

  const addItem = (id, remaining) => setCart(c => {
    const cur = c[id] || 0;
    if (cur >= remaining) return c;
    return { ...c, [id]: cur + 1 };
  });
  const removeItem = (id) => setCart(c => { const n={...c}; if(n[id]>1) n[id]--; else delete n[id]; return n; });

  const cartItems = Object.entries(cart)
    .map(([id, qty]) => ({ ...myGifts.find(g => String(g.id)===id), qty }))
    .filter(i => i.item_name);

  if (done) return (
    <div style={{padding:40,textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:16}}>🎉</div>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:22,letterSpacing:2,color:"#fff",marginBottom:8}}>ORDER SENT!</div>
      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:"rgba(255,255,255,.55)",marginBottom:24,lineHeight:1.55}}>
        Sit back and relax — a member of staff will <strong style={{color:"#FFD700"}}>bring your order to you</strong>.
        <br/><span style={{fontSize:12,color:"rgba(255,255,255,.35)"}}>No pickup needed — VIP service.</span>
      </div>
      <div style={{margin:"0 auto 28px",padding:"16px 20px",background:"rgba(255,215,0,.06)",
        border:"1px solid rgba(255,215,0,.25)",borderRadius:14,maxWidth:280,
        display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
        <span style={{fontSize:24,flexShrink:0}}>⭐</span>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.55)",lineHeight:1.45}}>
          The bar already knows it's a sponsor order. They'll find you.
        </div>
      </div>
      <button onClick={() => { setDone(false); setCart({}); setPickupNum(null); }}
        style={{width:"100%",padding:"14px 0",background:"#fff",color:"#000",border:"none",
          fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:3,cursor:"pointer",marginBottom:10}}>
        ORDER MORE GIFTS
      </button>
    </div>
  );

  const handleOrder = async () => {
    if (cartItems.length === 0) { onToast && onToast("Add at least one item", false); return; }
    setPlacing(true);
    const num = await placeOrder({
      tableNumber: "OUT-SPONSOR",
      items: cartItems.map(i => ({ id: String(i.id), name: i.item_name, price: 0, qty: i.qty })),
      total: 0,
      paymentMethod: "sponsor_gift",
    });
    setPlacing(false);
    if (num) {
      setUsedQty(prev => {
        const next = { ...prev };
        cartItems.forEach(i => { next[String(i.id)] = (next[String(i.id)] || 0) + i.qty; });
        return next;
      });
      setPickupNum(num);
      setCart({});
      setDone(true);
    }
  };

  const allRedeemed = myGifts.length > 0 && myGifts.every(g => getRemaining(g) === 0);

  return (
    <div style={{paddingBottom:40}}>
      {/* Hero */}
      <div className="sponsor-vip-hero" style={{borderBottom:"2px solid rgba(255,215,0,.2)"}}>
        <div className="sponsor-vip-tier-badge" style={{background:"rgba(255,215,0,.1)",border:"1px solid rgba(255,215,0,.35)",color:"#FFD700"}}>
          ⭐ SPONSOR
        </div>
        <div className="sponsor-vip-name">{user.name}</div>
        <div className="sponsor-vip-sub">Your complimentary gifts from El Mundo Bar-Rest</div>
      </div>

      {myGifts.length === 0 ? (
        <div style={{padding:32,textAlign:"center",fontFamily:"'Outfit',sans-serif",color:"rgba(255,255,255,.4)"}}>
          Your complimentary gifts will appear here soon. Check back shortly!
        </div>
      ) : allRedeemed ? (
        <div style={{padding:40,textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:18,letterSpacing:2,color:"#fff",marginBottom:8}}>ALL GIFTS REDEEMED</div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.4)"}}>
            You've used all your complimentary gifts. New gifts will appear here when available.
          </div>
        </div>
      ) : (
        <div style={{padding:"16px 16px 0"}}>
          {/* Group gifts by FOOD/DRINKS section, then by category */}
          {loadingUsed ? (
            <div style={{textAlign:"center",padding:24,color:"rgba(255,255,255,.3)",fontFamily:"'Outfit',sans-serif",fontSize:13}}>Loading…</div>
          ) : (() => {
            const drinkGifts = myGifts.filter(g => !FOOD_CATS.has(g.item_category));
            const foodGifts  = myGifts.filter(g =>  FOOD_CATS.has(g.item_category));
            const renderGift = (g) => {
              const inCart    = cart[String(g.id)] || 0;
              const remaining = getRemaining(g);
              const redeemed  = remaining === 0;
              return (
                <div key={g.id} className="menu-item-row" style={{borderColor: redeemed ? "rgba(255,255,255,.05)" : "rgba(255,215,0,.15)", opacity: redeemed ? 0.5 : 1}}>
                  <div className="menu-item-info">
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <div className="menu-item-name" style={{textTransform:"capitalize"}}>{g.item_name}</div>
                      {redeemed ? (
                        <span style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:1.5,
                          color:"rgba(255,255,255,.35)",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",padding:"2px 8px",borderRadius:4}}>
                          REDEEMED
                        </span>
                      ) : (
                        <span style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:1.5,
                          color:"#FFD700",background:"rgba(255,215,0,.1)",border:"1px solid rgba(255,215,0,.35)",padding:"2px 8px",borderRadius:4}}>
                          FREE × {remaining}
                        </span>
                      )}
                    </div>
                    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>
                      {redeemed ? "Already redeemed" : `${remaining} left · complimentary`}
                    </div>
                  </div>
                  <div className="menu-item-actions">
                    {redeemed ? null : inCart > 0 ? (
                      <div className="menu-qty-ctrl">
                        <button className="menu-qty-btn" onClick={()=>removeItem(String(g.id))}>−</button>
                        <span className="menu-qty-val">{inCart}</span>
                        <button className="menu-qty-btn" onClick={()=>addItem(String(g.id), remaining)}>+</button>
                      </div>
                    ) : (
                      <button className="menu-add-btn" onClick={()=>addItem(String(g.id), remaining)}>ADD</button>
                    )}
                  </div>
                </div>
              );
            };
            return (
              <>
                {drinkGifts.length > 0 && (
                  <>
                    <div className="sv-section-hd">
                      <span className="sv-section-hd-ico">🍺</span> DRINKS
                    </div>
                    {drinkGifts.map(renderGift)}
                  </>
                )}
                {foodGifts.length > 0 && (
                  <>
                    <div className="sv-section-hd" style={{marginTop: drinkGifts.length > 0 ? 24 : 0}}>
                      <span className="sv-section-hd-ico">🍔</span> FOOD
                    </div>
                    {foodGifts.map(renderGift)}
                  </>
                )}
              </>
            );
          })()}

          {/* Order summary + place button */}
          <div style={{marginTop:24,borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:20}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.4)",
              textAlign:"center",marginBottom:14}}>
              🌴 Orders go directly to the outdoor bar
            </div>
            {cartItems.length > 0 && (
              <div style={{marginBottom:14,background:"rgba(255,255,255,.04)",
                border:"1px solid rgba(255,255,255,.08)",borderRadius:10,padding:14}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,255,255,.35)",marginBottom:8}}>ORDER SUMMARY</div>
                {cartItems.map(i => (
                  <div key={i.id} style={{display:"flex",justifyContent:"space-between",fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.7)",marginBottom:4}}>
                    <span style={{textTransform:"capitalize"}}>{i.item_name} × {i.qty}</span>
                    <span style={{color:"#4ade80"}}>FREE</span>
                  </div>
                ))}
              </div>
            )}
            <button className={`order-place-btn ${placing ? "btn-loading btn-loading-dark" : ""}`} style={{background:`linear-gradient(135deg,${m.color},${m.color}cc)`,color:"#000"}}
              onClick={handleOrder} disabled={placing || cartItems.length === 0}>
              {`🎁 ORDER COMPLIMENTARY GIFTS`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Wallet Tab — credit-card style + redemption sheet ── */
function WalletTab({ user, myCredits, onToast }) {
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [recent,     setRecent]     = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("credit_transactions")
          .select("amount,new_balance,created_at")
          .eq("target_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (!cancelled && data) setRecent(data);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user.id, myCredits]);

  const playerNum = user.player_number ? String(user.player_number).padStart(4, "0") : "0000";
  const memberSince = (() => {
    try {
      if (!user.created_at) return "2026";
      const d = new Date(user.created_at);
      return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)}`;
    } catch { return "01/26"; }
  })();

  return (
    <div className="wallet-tab-wrap">
      {/* Credit-card style balance */}
      <div className="wallet-cc">
        <div className="wallet-cc-glow" />
        <div className="wallet-cc-shine" />
        <div className="wallet-cc-grid" />

        <div className="wallet-cc-top">
          <div className="wallet-cc-brand">EL MUNDO</div>
          <div className="wallet-cc-brand-sub">WALLET</div>
        </div>

        <div className="wallet-cc-chip">
          <div className="wallet-cc-chip-inner">
            <div className="wallet-cc-chip-line" />
            <div className="wallet-cc-chip-line" />
            <div className="wallet-cc-chip-line" />
          </div>
        </div>

        <div className="wallet-cc-amount-block">
          <div className="wallet-cc-amount-lbl">BALANCE</div>
          <div className="wallet-cc-amount">
            <span className="wallet-cc-currency">$</span>{(+myCredits).toFixed(2)}
          </div>
        </div>

        <div className="wallet-cc-bottom">
          <div className="wallet-cc-bottom-l">
            <div className="wallet-cc-mini">CARDHOLDER</div>
            <div className="wallet-cc-name">{(user.name || "").toUpperCase()}</div>
          </div>
          <div className="wallet-cc-bottom-r">
            <div className="wallet-cc-mini">PLAYER</div>
            <div className="wallet-cc-num">#{playerNum}</div>
          </div>
        </div>
      </div>

      {/* Add gift card button */}
      <button className="wallet-add-btn" onClick={() => setRedeemOpen(true)}>
        <span className="wallet-add-btn-icon">🎁</span>
        <span className="wallet-add-btn-text">
          <span className="wallet-add-btn-title">ADD GIFT CARD CODE</span>
          <span className="wallet-add-btn-sub">Top up your balance instantly</span>
        </span>
        <svg className="wallet-add-btn-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Top-up history */}
      <div className="wallet-section-hd">
        <span>TOP-UP HISTORY</span>
        {recent.length > 0 && <span className="wallet-section-hd-count">{recent.length}</span>}
      </div>
      {recent.length === 0 ? (
        <div className="wallet-empty">
          <div className="wallet-empty-icon">📋</div>
          <div className="wallet-empty-text">No top-ups yet</div>
        </div>
      ) : (
        <div className="wallet-tx-list">
          {recent.map((tx, i) => {
            const isPositive = +tx.amount >= 0;
            return (
              <div key={i} className="wallet-tx-row">
                <div className={`wallet-tx-icon ${isPositive ? "wallet-tx-icon-pos" : "wallet-tx-icon-neg"}`}>
                  {isPositive ? "↑" : "↓"}
                </div>
                <div className="wallet-tx-mid">
                  <div className="wallet-tx-title">{isPositive ? "Top up" : "Order"}</div>
                  <div className="wallet-tx-when">
                    {tx.created_at ? new Date(tx.created_at).toLocaleString("en-US", {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
                    }) : ""}
                  </div>
                </div>
                <div className="wallet-tx-right">
                  <div className={`wallet-tx-amt ${isPositive ? "wallet-tx-amt-pos" : "wallet-tx-amt-neg"}`}>
                    {(isPositive ? "+" : "−") + "$" + Math.abs(+tx.amount).toFixed(2)}
                  </div>
                  <div className="wallet-tx-bal">${(+tx.new_balance).toFixed(2)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Zeli food delivery banner — relevant to wallet/menu context */}
      <ZeliFoodCard />

      {redeemOpen && (
        <RedeemGiftCardSheet onClose={() => setRedeemOpen(false)} onToast={onToast} />
      )}
    </div>
  );
}

/* ── Redeem Gift Card bottom sheet ── */
function RedeemGiftCardSheet({ onClose, onToast }) {
  const [code,      setCode]      = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [success,   setSuccess]   = useState(null); // { amount, newBalance }
  const inputRef = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => inputRef.current?.focus(), 280);
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const handleChange = (e) => {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    let f;
    if (raw.startsWith("EM")) {
      const body = raw.slice(2);
      f = body.length === 0 ? "EM"
        : body.length <= 4 ? `EM-${body}`
        : `EM-${body.slice(0,4)}-${body.slice(4,8)}`;
    } else if (raw.length === 0) {
      f = "";
    } else {
      f = raw.length <= 4 ? `EM-${raw}` : `EM-${raw.slice(0,4)}-${raw.slice(4,8)}`;
    }
    setCode(f);
  };

  const isValid = /^EM-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code.trim());

  const handleRedeem = async () => {
    if (redeeming || !isValid) return;
    setRedeeming(true);
    try {
      const { data, error } = await supabase.rpc("redeem_gift_card", { p_code: code.trim() });
      if (error) throw error;
      if (!data?.ok) {
        const msg = ({
          invalid_code:     "This code is not valid",
          already_redeemed: "This code has already been redeemed",
          voided:           "This code has been voided",
          not_signed_in:    "Please sign in again",
        })[data?.error] || "Could not redeem this code";
        onToast?.(msg, false);
        try { navigator.vibrate?.([80, 60, 80]); } catch {}
        return;
      }
      try { navigator.vibrate?.([40, 30, 80, 30, 120]); } catch {}
      setSuccess({ amount: +data.amount, newBalance: +data.new_balance });
      setTimeout(() => { onClose(); }, 1900);
    } catch (e) {
      onToast?.("Network error — please try again", false);
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="redeem-sheet-root" onClick={onClose}>
      <div className="redeem-sheet" onClick={e => e.stopPropagation()}>
        <div className="redeem-sheet-grab" />
        {!success ? (
          <>
            <div className="redeem-sheet-icon">🎁</div>
            <div className="redeem-sheet-title">REDEEM GIFT CARD</div>
            <div className="redeem-sheet-sub">Enter the 10-character code printed on your gift card</div>

            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              className={`redeem-sheet-input ${isValid ? "redeem-sheet-input-ok" : ""}`}
              placeholder="EM-XXXX-XXXX"
              value={code}
              onChange={handleChange}
              onKeyDown={e => { if (e.key === "Enter" && isValid) handleRedeem(); }}
              maxLength={12}
              disabled={redeeming}
            />

            <button
              className="redeem-sheet-btn"
              onClick={handleRedeem}
              disabled={!isValid || redeeming}>
              {redeeming ? "REDEEMING…" : "ADD TO WALLET"}
            </button>

            <button className="redeem-sheet-cancel" onClick={onClose}>Cancel</button>
          </>
        ) : (
          <div className="redeem-success">
            <div className="redeem-success-burst">
              <div className="redeem-success-check">✓</div>
            </div>
            <div className="redeem-success-amount">+${success.amount.toFixed(2)}</div>
            <div className="redeem-success-title">ADDED TO YOUR WALLET</div>
            <div className="redeem-success-bal">New balance: <strong>${success.newBalance.toFixed(2)}</strong></div>
          </div>
        )}
      </div>
    </div>
  );
}


/* ── Admin: Rooms ── */


function MenuView({ user, menuItems, myCredits, myOrders, onPlaceOrder, onCancelOrder,
  printOrderReceipt, stripeCheckout, onToast, qrTable = "",
  gifts = [], pendingGiftItems = [], onClearPendingGifts = () => {},
  setMyCredits = ()=>{},
  initialTab = null, onInitialTabConsumed = ()=>{} }) {
  const { t } = useLang();
  const [cart,        setCart]        = useState({});
  const [cartNotes,   setCartNotes]   = useState({}); // { [itemId]: noteString }
  const [noteOpen,    setNoteOpen]    = useState({}); // { [itemId]: bool }
  const [tab,         setTab]         = useState(initialTab || "menu");
  // Honor initialTab even when MenuView is already mounted (e.g. user re-taps
  // the credits badge while menu tab is already active)
  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
      onInitialTabConsumed();
    }
  }, [initialTab]); // eslint-disable-line
  const [placing,     setPlacing]     = useState(false);
  const [cartPayMethod, setCartPayMethod] = useState("credits"); // "credits" | "pay_bar"
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false);
  const [pendingPayMethod,   setPendingPayMethod]   = useState("credits");
  /* ── gift cart: free drink/food gifts added from My Gifts ── */
  const [giftCart, setGiftCart] = useState([]); // [{ giftId, name }]

  const available  = menuItems.filter(i => i.available);
  const [activeCat, setActiveCat] = useState(null);
  const [activeSection, setActiveSection] = useState("DRINKS");
  const sectionRefs = useRef({});
  const pillsRef    = useRef(null);
  // Group available items by category in defined order.
  // FOOD is hidden from EVERYONE in the main menu — sponsors get food via VIP PERKS,
  // regular players don't order food at all.
  const menuSections = MENU_SECTIONS.map(s => ({
    ...s,
    cats: s.cats.map(c => ({ ...c, items: available.filter(i => i.category === c.id) }))
               .filter(c => c.items.length > 0),
  })).filter(s => {
    if (s.cats.length === 0) return false;
    if (s.section === "FOOD") return false;
    return true;
  });
  const allActiveCats = menuSections.flatMap(s => s.cats);
  const visibleSections = menuSections.filter(s => s.section === activeSection);
  const visibleCats = visibleSections.flatMap(s => s.cats);

  const scrollToSection = catId => {
    setActiveCat(catId);
    const el = sectionRefs.current[catId];
    if (!el) return;
    // Scroll with offset to account for sticky pill bar height
    const scrollContainer = el.closest('.body') || document.querySelector('.body');
    const pillH = (pillsRef.current?.offsetHeight || 48) + 4;
    if (scrollContainer) {
      const elTop = el.getBoundingClientRect().top;
      const containerTop = scrollContainer.getBoundingClientRect().top;
      scrollContainer.scrollTo({ top: scrollContainer.scrollTop + elTop - containerTop - pillH, behavior: "smooth" });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  /* ── Consume pending gift items sent from My Gifts ── */
  useEffect(() => {
    if (!pendingGiftItems || pendingGiftItems.length === 0) return;
    setGiftCart(prev => {
      const next = [...prev];
      pendingGiftItems.forEach(pg => {
        if (!next.find(g => g.giftId === pg.giftId)) next.push(pg);
      });
      return next;
    });
    onClearPendingGifts();
    setTab("cart");
  }, [pendingGiftItems]); // eslint-disable-line

  const addToCart      = id => setCart(c => ({ ...c, [id]: (c[id]||0)+1 }));
  const removeFromCart = id => setCart(c => { const n={...c}; if(n[id]>1) n[id]--; else delete n[id]; return n; });
  const clearCart      = () => { setCart({}); setCartNotes({}); setNoteOpen({}); };
  const addGiftToCart  = (g) => setGiftCart(prev => prev.find(x => x.giftId === g.id) ? prev : [...prev, { giftId: g.id, name: g.item_name || g.title }]);
  const removeGiftFromCart = (giftId) => setGiftCart(prev => prev.filter(g => g.giftId !== giftId));

  const cartItems = Object.entries(cart).map(([id, qty]) => {
    const item = menuItems.find(i => i.id === id);
    return { ...item, qty };
  }).filter(i => i.name);

  /* gift cart as renderable items */
  const giftCartItems = giftCart.map(g => ({
    giftId: g.giftId, name: g.name, price: 0, qty: 1, isGift: true, id: `gift_${g.giftId}`,
  }));

  /* gifts available to add from checkout (not already in cart) */
  const availableGiftsToAdd = gifts.filter(g => !giftCartItems.find(gc => gc.giftId === g.id));

  const cartTotal = cartItems.reduce((s,i) => s + i.price * i.qty, 0);
  const cartCount = cartItems.reduce((s,i) => s + i.qty, 0);

  const placingRef = useRef(false); // ref guard prevents double submit

  // ── Set initial active category when menu first loads or section changes ──
  useEffect(() => {
    if (visibleCats.length > 0) setActiveCat(visibleCats[0].id);
  }, [activeSection, allActiveCats.length]);

  // ── IntersectionObserver: highlight pill as user scrolls ──
  useEffect(() => {
    if (tab !== "menu" || visibleCats.length === 0) return;
    const scrollContainer = document.querySelector('.body');
    const pillH = pillsRef.current?.offsetHeight || 48;
    const observer = new IntersectionObserver(entries => {
      // Pick the topmost intersecting entry
      const visible = entries.filter(e => e.isIntersecting);
      if (visible.length === 0) return;
      visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const catId = visible[0].target.dataset.catId;
      setActiveCat(catId);
      // Scroll pill bar so active pill is centered — use scrollLeft, not scrollIntoView
      const bar = pillsRef.current;
      const pill = bar?.querySelector(`[data-pill="${catId}"]`);
      if (bar && pill) {
        const target = pill.offsetLeft - (bar.offsetWidth / 2) + (pill.offsetWidth / 2);
        bar.scrollTo({ left: target, behavior: "smooth" });
      }
    }, {
      root: scrollContainer || null,
      rootMargin: `-${pillH + 2}px 0px -55% 0px`,
      threshold: 0
    });
    Object.values(sectionRefs.current).forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [tab, activeSection, allActiveCats.length]);

  const openOrderModal = (payMethod) => {
    setPendingPayMethod(payMethod);
    if (payMethod === "pay_bar") handleBarOrder();
    else if (payMethod === "credits") handleOrder();
    else handleStripeOrder();
  };

  const handleBarOrder = async () => {
    if (placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    try {
      const allItems = [
        ...cartItems.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty, category:i.category||"", ...(cartNotes[i.id]?{note:cartNotes[i.id]}:{}) })),
        ...giftCartItems.map(i => ({ id:i.id, name:i.name, price:0, qty:1, category:"gift", note:"🎁 Gift redemption" })),
      ];
      const { data: ord, error } = await supabase.from("orders").insert({
        user_id: user.id,
        user_name: user.name,
        table_number: "OUT",
        items: allItems,
        total: +cartTotal.toFixed(2),
        payment_method: "cash",
        status: "pending",
      }).select().single();
      if (error || !ord) { onToast("Order failed", false); return; }
      clearCart(); setGiftCart([]); setTab("orders");
    } catch(e) {
      onToast("Error creating order", false);
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  const handleOrder = async () => {
    if (placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    try {
      const ok = await onPlaceOrder({
        tableNumber: "OUT",
        items: [
          ...cartItems.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty, category:i.category||"", ...(cartNotes[i.id]?{note:cartNotes[i.id]}:{}) })),
          ...giftCartItems.map(i => ({ id:i.id, name:i.name, price:0, qty:1, category:"gift", note:"🎁 Gift redemption" })),
        ],
        total: +cartTotal.toFixed(2),
        paymentMethod: +cartTotal.toFixed(2) === 0 ? "sponsor_gift" : "credits",
      });
      if (ok) {
        if (giftCartItems.length > 0) {
          try {
            await supabase.from("gifts").update({ redeemed:true, redeemed_at:new Date().toISOString(), redeemed_by:user.id })
              .in("id", giftCartItems.map(g => g.giftId));
          } catch(e) { console.error("Gift redeem failed", e); }
        }
        clearCart(); setGiftCart([]); setTab("orders");
      }
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  const handleStripeOrder = async () => {
    if (+cartTotal.toFixed(2) === 0) { handleOrder(); return; }
    if (placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    let newOrder = null;
    try {
      const allItems = [
        ...cartItems.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty, category:i.category||"", ...(cartNotes[i.id]?{note:cartNotes[i.id]}:{}) })),
        ...giftCartItems.map(i => ({ id:i.id, name:i.name, price:0, qty:1, category:"gift", note:"🎁 Gift redemption" })),
      ];
      const { data: ord, error } = await supabase.from("orders").insert({
        user_id: user.id,
        user_name: user.name,
        table_number: "OUT",
        items: allItems,
        total: +cartTotal.toFixed(2),
        payment_method: "card_pending",
        status: "pending",
      }).select().single();
      if (error || !ord) { onToast("Error creating order", false); return; }
      newOrder = ord;
      if (giftCartItems.length > 0) {
        try {
          await supabase.from("gifts").update({ redeemed:true, redeemed_at:new Date().toISOString(), redeemed_by:user.id })
            .in("id", giftCartItems.map(g => g.giftId));
        } catch(e) { console.error("Gift redeem failed", e); }
      }
    } catch(e) {
      onToast("Error creating order", false); return;
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
    clearCart(); setGiftCart([]);
    stripeCheckout({
      type: "order",
      orderId: newOrder.id,
      userId: user.id,
      userEmail: user.email,
      items: cartItems.map(i => ({ name:i.name, qty:i.qty, price:i.price })),
      total: +cartTotal.toFixed(2),
    });
    setCartNotes({});
    setNoteOpen({});
  };

  const statusColor = s => s==="pending"?"rgba(251,191,36,.9)":s==="confirmed"?"rgba(74,222,128,.8)":s==="ready"?"#fff":"rgba(255,255,255,.4)";
  const statusLabel = s => s==="pending"?"⏳ Pending":s==="confirmed"?"✓ Confirmed":s==="ready"?"🔔 Ready! Pick up":"—";

  return (
    <div>
      {/* ── WALLET HEADER ── */}
      <div className="wallet-header">
        <div className="wallet-left">
          <div className="wallet-label">{t('creditBalance')}</div>
          <div className="wallet-balance">${(+myCredits).toFixed(2)}</div>
          <div className="wallet-sub">{t('useCredits')}</div>
        </div>
        <button className="wallet-topup-btn" onClick={()=>setTab("wallet")}>
          {t('topUp')}
        </button>
      </div>

      {/* Tabs */}
      <div className="admin-subtabs">
        {[
          {id:"menu",   label:`🍽 ${t('menuTab')}`},
          {id:"cart",   label:`🛒 ${t('cartTab')}${cartCount>0?` · ${cartCount}`:""}`},
          {id:"orders", label:`📦 ${t('ordersTab')}`},
          {id:"wallet", label:`💳 ${t('walletTab')}`},
        ].map(st=>(
          <button key={st.id} className={`admin-subtab ${tab===st.id?"ast-on":""}`} onClick={()=>setTab(st.id)}>{st.label}</button>
        ))}
      </div>

      {/* ── MENU TAB ── */}
      {tab === "menu" && (
        <div style={{paddingBottom: cartCount > 0 ? 140 : 20}}>

          {/* ── Section toggle: DRINKS / FOOD ── */}
          <div style={{padding:"8px 10px 8px"}}>
            <div className="menu-section-toggle" style={{margin:0,padding:0}}>
              {menuSections.map(sec => (
                <button
                  key={sec.section}
                  className={`menu-sec-btn ${activeSection === sec.section ? "menu-sec-btn-on" : ""}`}
                  onClick={() => {
                    setActiveSection(sec.section);
                    const el = document.querySelector('.body') || window;
                    if (el.scrollTo) el.scrollTo({ top: 0 });
                  }}>
                  <span className="menu-sec-btn-icon">{sec.section === "DRINKS" ? "🍹" : "🍽"}</span>
                  <span>{sec.section}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Sticky sub-category pill bar ── */}
          {visibleCats.length > 0 && (
            <div ref={pillsRef} className="menu-pills-bar">
              {visibleCats.map(cat => (
                <button
                  key={cat.id}
                  data-pill={cat.id}
                  className={`menu-cat-pill ${activeCat === cat.id ? "menu-cat-pill-on" : ""}`}
                  onClick={() => scrollToSection(cat.id)}>
                  <span style={{fontSize:14,lineHeight:1}}>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Items grouped by category (flat — no collapse) ── */}
          {visibleSections.map(sec => (
            <div key={sec.section}>
              {sec.cats.map(cat => (
                <div key={cat.id}
                  ref={el => { sectionRefs.current[cat.id] = el; }}
                  data-cat-id={cat.id}>

                  {/* Category header */}
                  <div className="menu-cat-header">
                    <span className="menu-cat-header-icon">{cat.icon}</span>
                    <div className="menu-cat-header-text">
                      <span>{cat.label.toUpperCase()}</span>
                      <span className="menu-cat-header-count">{cat.items.length} items</span>
                    </div>
                  </div>

                  {/* Items */}
                  {cat.items.map(item => {
                    const st = (item.serving_type || "").toLowerCase();
                    const isBucket = st === "bucket" || (!st && /bucket/i.test(item.name + (item.description||"")));
                    const isGlass  = st === "glass"  || (!st && /glass/i.test(item.name  + (item.description||"")));
                    const isBottle = st === "bottle" || (!st && /bottle/i.test(item.name + (item.description||"")));
                    const isDraft  = st === "draft"  || (!st && /draft/i.test(item.name  + (item.description||"")));
                    const displayQty = cart[item.id] || 0;
                    const handleAdd = () => addToCart(item.id);
                    const handleRemove = () => removeFromCart(item.id);
                    return (
                      <div key={item.id} className={`menu-item-row${item.sold_out?" menu-item-soldout":""}`} style={{position:"relative"}}>
                        {item.sold_out && <div className="menu-item-soldout-badge">SOLD OUT</div>}
                        <div className="menu-item-info">
                          <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                            <div className="menu-item-name">{(item.name||"").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}</div>
                            {isBucket && <span className="menu-badge menu-badge-gold">🪣 BUCKET</span>}
                            {isGlass   && <span className="menu-badge menu-badge-blue">🍷 GLASS</span>}
                            {isBottle  && <span className="menu-badge menu-badge-blue">🍾 BOTTLE</span>}
                            {isDraft   && <span className="menu-badge menu-badge-amber">🍺 DRAFT</span>}
                          </div>
                          {item.description && <div className="menu-item-desc">{item.description}</div>}
                          <div className="menu-item-price">${(+item.price).toFixed(2)}</div>
                        </div>
                        <div className="menu-item-actions">
                          {!item.sold_out && (displayQty > 0 ? (
                            <div className="menu-qty-ctrl">
                              <button className="menu-qty-btn" onClick={handleRemove}>−</button>
                              <span className="menu-qty-val">{displayQty}</span>
                              <button className="menu-qty-btn" onClick={handleAdd}>+</button>
                            </div>
                          ) : (
                            <button className="menu-add-btn" onClick={handleAdd}>{t('addToCart')}</button>
                          ))}
                          {item.sold_out && (
                            <button className="menu-add-btn" disabled style={{opacity:.3,cursor:"not-allowed"}}>{t('addToCart')}</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}

          {available.length === 0 && <div className="empty">{t('noMenu')}</div>}

          {(cartCount > 0 || giftCartItems.length > 0) && (
            <div className="cart-fab" onClick={()=>setTab("cart")}>
              {t('viewCart')} · {cartCount + giftCartItems.length} {t('itemsLabel')} · ${cartTotal.toFixed(2)}
              {giftCartItems.length > 0 && <span style={{color:"#f59e0b",marginLeft:4}}>+ {giftCartItems.length} free</span>} →
            </div>
          )}
        </div>
      )}

      {/* ── CART TAB ── */}
      {tab === "cart" && (
        <div style={{paddingBottom:32}}>
          {cartItems.length === 0 && giftCartItems.length === 0 ? (
            <div className="empty" style={{padding:"60px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
              <div style={{fontSize:40}}>🛒</div>
              <div>Your cart is empty</div>
              <button className="menu-add-btn" style={{padding:"10px 24px",marginTop:8}} onClick={()=>setTab("menu")}>{t('browseMenu')}</button>
            </div>
          ) : (
            <>
              {/* Regular menu items */}
              {cartItems.map(item => (
                <div key={item.id}>
                  <div className="cart-row">
                    <div className="cart-row-name">{item.name}</div>
                    <div className="menu-qty-ctrl">
                      <button className="menu-qty-btn" onClick={()=>removeFromCart(item.id)}>−</button>
                      <span className="menu-qty-val">{item.qty}</span>
                      <button className="menu-qty-btn" onClick={()=>addToCart(item.id)}>+</button>
                    </div>
                    <div className="cart-row-price">${(item.price*item.qty).toFixed(2)}</div>
                  </div>
                  <div style={{padding:"0 0 8px 4px"}}>
                    {!noteOpen[item.id] ? (
                      <button className="cart-item-note-btn" onClick={()=>setNoteOpen(n=>({...n,[item.id]:true}))}>
                        {cartNotes[item.id] ? `📝 ${cartNotes[item.id]}` : "+ Add note"}
                      </button>
                    ) : (
                      <input
                        className="cart-item-note-inp"
                        placeholder="Special request (e.g. no ice, extra sauce…)"
                        value={cartNotes[item.id]||""}
                        autoFocus
                        onChange={e=>setCartNotes(n=>({...n,[item.id]:e.target.value}))}
                        onBlur={()=>setNoteOpen(n=>({...n,[item.id]:false}))}
                      />
                    )}
                  </div>
                </div>
              ))}

              {/* Gift items in cart */}
              {giftCartItems.length > 0 && (
                <div style={{margin:"4px 0 8px",padding:"2px 0"}}>
                  {giftCartItems.map(item => (
                    <div key={item.id} className="cart-row" style={{background:"rgba(245,158,11,.06)",border:"1px solid rgba(245,158,11,.18)",borderRadius:8,marginBottom:4}}>
                      <div className="cart-row-name" style={{display:"flex",alignItems:"center",gap:7}}>
                        <span style={{background:"rgba(245,158,11,.2)",border:"1px solid rgba(245,158,11,.4)",borderRadius:99,padding:"2px 7px",fontFamily:"'Anton',sans-serif",fontSize:8.5,letterSpacing:1.5,color:"#f59e0b",flexShrink:0}}>🎁 FREE</span>
                        {item.name}
                      </div>
                      <button onClick={() => removeGiftFromCart(item.giftId)} style={{background:"transparent",border:"none",color:"rgba(255,255,255,.3)",cursor:"pointer",padding:"4px 8px",fontSize:13}}>✕</button>
                      <div className="cart-row-price" style={{color:"#f59e0b",fontFamily:"'Anton',sans-serif"}}>FREE</div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── ADD FREE GIFTS PICKER (in checkout) ── */}
              {availableGiftsToAdd.length > 0 && (
                <div style={{margin:"8px 0 12px",padding:"12px 14px",background:"rgba(245,158,11,.05)",border:"1px dashed rgba(245,158,11,.28)",borderRadius:10}}>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:8.5,letterSpacing:2,color:"#f59e0b",marginBottom:8}}>🎁 YOUR FREE GIFT{availableGiftsToAdd.length > 1 ? "S" : ""}</div>
                  {availableGiftsToAdd.map(g => (
                    <button key={g.id} onClick={() => addGiftToCart(g)}
                      style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.22)",borderRadius:8,cursor:"pointer",marginBottom:6,textAlign:"left"}}>
                      <span style={{fontSize:18,flexShrink:0}}>🍺</span>
                      <span style={{fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:.5,color:"#fff",flex:1}}>{g.item_name || g.title}</span>
                      <span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"#f59e0b",fontWeight:700,flexShrink:0}}>+ ADD FREE</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="cart-total-row">
                <span className="cart-total-label">{t('total')}</span>
                <div style={{textAlign:"right"}}>
                  <span className="cart-total-val">${cartTotal.toFixed(2)}</span>
                  {giftCartItems.length > 0 && (
                    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10.5,color:"#f59e0b",fontWeight:600,marginTop:2}}>
                      + {giftCartItems.length} free gift item{giftCartItems.length > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </div>
              <div style={{padding:"0 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",
                  background:"rgba(34,197,94,.07)",border:"1px solid rgba(34,197,94,.2)",
                  borderRadius:10,marginBottom:14}}>
                  <span style={{fontSize:20}}>🌴</span>
                  <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.55)"}}>
                    Orders go directly to the outdoor bar
                  </span>
                </div>
                <div className="afield" style={{marginBottom:20}}>
                  <label className="afield-lbl">{t('payment')}</label>
                  <div className="cart-pay-options">
                    <button
                      className={`cart-pay-opt ${cartPayMethod==="credits"?"cart-pay-opt-on":""}`}
                      onClick={() => setCartPayMethod("credits")}>
                      <span style={{fontSize:18}}>🪙</span>
                      <div>
                        <div className="cart-pay-opt-title">Credits</div>
                        <div className="cart-pay-opt-sub">Balance: ${(+myCredits).toFixed(2)}</div>
                      </div>
                    </button>
                    <button
                      className={`cart-pay-opt ${cartPayMethod==="pay_bar"?"cart-pay-opt-on":""}`}
                      onClick={() => setCartPayMethod("pay_bar")}>
                      <span style={{fontSize:18}}>🍺</span>
                      <div>
                        <div className="cart-pay-opt-title">Pay at Bar</div>
                        <div className="cart-pay-opt-sub">Cash or card at the bar</div>
                      </div>
                    </button>
                  </div>
                  {cartPayMethod === "credits" && cartTotal > myCredits && (
                    <div className="wallet-warning">
                      ⚠ Not enough credits — you need ${(cartTotal - myCredits).toFixed(2)} more.
                      <button className="wallet-warning-link" onClick={()=>setTab("wallet")}>Top up →</button>
                    </div>
                  )}
                  {cartPayMethod === "pay_bar" && (
                    <div style={{marginTop:10,padding:"10px 12px",background:"rgba(251,191,36,.07)",border:"1px solid rgba(251,191,36,.25)",borderRadius:8,fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.6)",lineHeight:1.5}}>
                      🍺 You'll get an order number. Walk to the bar, <strong>wait your turn in line</strong>, then tell staff your number — they'll pay you out and hand over your order.
                    </div>
                  )}
                  {cartPayMethod === "credits" && (
                    <div style={{marginTop:10,padding:"10px 12px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.55)",lineHeight:1.5}}>
                      📋 You'll get an order number. Walk to the bar, <strong>wait your turn in line</strong>, then tell staff your number — they'll hand over your order.
                    </div>
                  )}
                </div>
                <button className={`order-place-btn ${placing ? "btn-loading btn-loading-dark" : ""}`}
                  disabled={placing}
                  onClick={() => openOrderModal(cartPayMethod)}>
                  {cartPayMethod === "pay_bar"
                    ? `🍺 ORDER · PAY AT BAR · $${cartTotal.toFixed(2)}`
                    : `${t('placeOrder')} · $${cartTotal.toFixed(2)}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ORDER TYPE MODAL ── */}
      {showOrderTypeModal && createPortal(
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.88)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}
          onClick={() => setShowOrderTypeModal(false)}>
          <div style={{background:"#111",border:"1px solid rgba(255,255,255,.1)",borderRadius:20,padding:28,width:"100%",maxWidth:340}}
            onClick={e => e.stopPropagation()}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:17,letterSpacing:2,color:"#fff",marginBottom:4,textAlign:"center"}}>HOW DO YOU WANT TO ORDER?</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.35)",textAlign:"center",marginBottom:24}}>
              Solo for yourself, or group with your table
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <button onClick={() => handleOrderTypeChoice("solo")}
                style={{padding:"18px 20px",borderRadius:14,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",cursor:"pointer",display:"flex",alignItems:"center",gap:16,textAlign:"left",width:"100%"}}>
                <span style={{fontSize:32}}>🧍</span>
                <div>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:15,letterSpacing:1,color:"#fff"}}>JUST ME</div>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.4)",marginTop:3}}>Solo order · pay now</div>
                </div>
              </button>
              <button onClick={() => handleOrderTypeChoice("group")}
                style={{padding:"18px 20px",borderRadius:14,background:"rgba(255,215,0,.06)",border:"1px solid rgba(255,215,0,.3)",cursor:"pointer",display:"flex",alignItems:"center",gap:16,textAlign:"left",width:"100%"}}>
                <span style={{fontSize:32}}>👥</span>
                <div>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:15,letterSpacing:1,color:"#FFD700"}}>ORDER AS GROUP</div>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.4)",marginTop:3}}>Order together with your table</div>
                </div>
              </button>
            </div>
            <button onClick={() => setShowOrderTypeModal(false)}
              style={{marginTop:16,width:"100%",padding:"11px",background:"none",border:"1px solid rgba(255,255,255,.08)",borderRadius:10,color:"rgba(255,255,255,.3)",fontFamily:"'Outfit',sans-serif",fontSize:13,cursor:"pointer"}}>
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── ORDERS TAB ── */}
      {tab === "orders" && (
        <div>
          {/* ── PICKUP NUMBER — stays on screen until staff clears the order ── */}
          {(() => {
            // Sponsor orders are brought to the table — no pickup number shown
            const pendingOrds = myOrders.filter(o =>
              o.status === "pending"
              && o.order_number
              && +o.order_number < 100
              && o.payment_method !== "sponsor_gift"
            );
            if (pendingOrds.length === 0) return null;
            const ord = pendingOrds[0];
            return (
              <div style={{
                margin:"16px 16px 0",padding:"24px 20px 20px",
                background:"rgba(255,255,255,.04)",
                border:"2px solid rgba(255,255,255,.25)",
                borderRadius:16,textAlign:"center",
              }}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:4,color:"rgba(255,255,255,.5)",marginBottom:8}}>
                  PICK UP AT THE BAR
                </div>
                <div style={{
                  fontFamily:"'Anton',sans-serif",fontSize:96,lineHeight:1,color:"#fff",
                  letterSpacing:4,
                  textShadow:"0 0 40px rgba(255,255,255,.35)",
                }}>
                  {String(ord.order_number).padStart(2,"0")}
                </div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:3,color:"rgba(255,255,255,.3)",marginTop:12}}>
                  YOUR ORDER NUMBER
                </div>

                {/* 3-step instructions */}
                <div style={{marginTop:18,display:"flex",flexDirection:"column",gap:6,textAlign:"left",
                  padding:"12px 14px",background:"rgba(0,0,0,.35)",borderRadius:10,
                  border:"1px solid rgba(255,255,255,.08)"}}>
                  <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{fontFamily:"'Anton',sans-serif",fontSize:12,color:"#facc15",letterSpacing:1,width:14,flexShrink:0}}>1.</span>
                    <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.7)",lineHeight:1.45}}>
                      Walk to the bar
                    </span>
                  </div>
                  <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{fontFamily:"'Anton',sans-serif",fontSize:12,color:"#facc15",letterSpacing:1,width:14,flexShrink:0}}>2.</span>
                    <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.7)",lineHeight:1.45}}>
                      <strong>Wait your turn in line</strong> — staff don't call you
                    </span>
                  </div>
                  <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{fontFamily:"'Anton',sans-serif",fontSize:12,color:"#facc15",letterSpacing:1,width:14,flexShrink:0}}>3.</span>
                    <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.7)",lineHeight:1.45}}>
                      Say your number — staff will hand over your order
                      {ord.payment_method === "cash" && <span style={{color:"#fbbf24"}}> (and pay with cash or card)</span>}
                    </span>
                  </div>
                </div>

                <div style={{marginTop:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:"#4ade80",boxShadow:"0 0 6px #4ade80",display:"inline-block",animation:"of-pulse 1.6s ease-in-out infinite"}}/>
                  <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.4)"}}>Order is ready when staff clears it</span>
                </div>
              </div>
            );
          })()}

          {myOrders.length === 0 && (
            <div className="empty" style={{padding:"60px 0"}}>{t('noOrders')}</div>
          )}
          {myOrders.map(ord => (
            <div key={ord.id} className="order-card">
              <div className="order-card-top">
                <div>
                  <div className="order-card-table">Table {ord.table_number}</div>
                  <div className="order-card-date">{new Date(ord.created_at).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}>
                  <div className="order-card-status" style={{color:statusColor(ord.status)}}>{statusLabel(ord.status)}</div>
                  {ord.order_number && <div className="order-id-chip">#{ord.order_number}</div>}
                </div>
              </div>
              <div className="order-card-items">
                {ord.items.map((it,i) => (
                  <div key={i} className="order-item-line">{it.qty}× {it.name}<span>${(it.price*it.qty).toFixed(2)}</span></div>
                ))}
              </div>
              <div className="order-card-total">Total ${(+ord.total).toFixed(2)} · {ord.payment_method==="credits"?"Credits":"Card"}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── WALLET TAB ── */}
      {tab === "wallet" && (
        <WalletTab user={user} myCredits={myCredits} onToast={onToast} />
      )}

    </div>
  );
}

/* ── Admin: Menu management ── */
function MenuItemForm({ item, onClose, onSave }) {
  const [f, setF] = useState(item);
  const [saving, setSaving] = useState(false);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const handleSave = async () => {
    if (!f.name.trim() || !f.price) return;
    setSaving(true);
    await onSave({ ...f, price: +f.price, sort_order: +f.sort_order });
    setSaving(false);
    onClose();
  };
  return (
    <div className="admin-form-card" style={{margin:"0 14px 16px"}}>
      <div className="admin-form-title">{f.id ? "EDIT ITEM" : "NEW ITEM"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        <AField label="Name" val={f.name} on={set("name")} ph="e.g. Caribe Beer" />
        <AField label="Description" val={f.description||""} on={set("description")} ph="e.g. Cold draft on tap" />
        <AField label="Price ($)" val={f.price} on={set("price")} ph="e.g. 3.50" />
        <div className="afield">
          <label className="afield-lbl">SERVING TYPE</label>
          <select className="afield-inp" value={f.serving_type||""} onChange={set("serving_type")}>
            <option value="">— None —</option>
            <option value="glass">🍷 Glass</option>
            <option value="bottle">🍾 Bottle</option>
            <option value="bucket">🪣 Bucket</option>
            <option value="draft">🍺 Draft</option>
          </select>
        </div>
        <div className="afield">
          <label className="afield-lbl">CATEGORY</label>
          <select className="afield-inp" value={f.category} onChange={set("category")}>
            {MENU_SECTIONS.map(s => (
              <optgroup key={s.section} label={`── ${s.section} ──`}>
                {s.cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <AField label="Sort Order" val={f.sort_order} on={set("sort_order")} ph="0" />
      </div>
      <div style={{display:"flex",gap:8}}>
        <button className="admin-save-btn" style={{flex:1,opacity:saving?0.6:1}} disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save ✓"}</button>
        <button className="modal-cancel-btn" style={{flex:1}} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function AdminMenu({ menuItems, onSave, onDelete, onToggleAvail, onToggleSoldOut }) {
  const [editItem,   setEditItem]   = useState(null);
  const [addMode,    setAddMode]    = useState(false);
  const [filterCat,  setFilterCat]  = useState("all");
  const blank = { name:"", description:"", price:"", category:"Beer", available:true, sort_order:0, serving_type:"" };

  // Get all categories that actually have items
  const activeCats = ALL_MENU_CATS.filter(c => menuItems.some(i => i.category === c));
  const displayed  = filterCat === "all" ? menuItems : menuItems.filter(i => i.category === filterCat);

  // Group displayed items by category (in defined order)
  const grouped = activeCats
    .filter(c => filterCat === "all" || c === filterCat)
    .map(c => ({ cat:c, items: displayed.filter(i => i.category === c) }))
    .filter(g => g.items.length > 0);

  return (
    <div>
      {/* Toolbar */}
      <div style={{padding:"14px 14px 0",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)}
          style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",color:"rgba(255,255,255,.7)",padding:"7px 12px",fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,cursor:"pointer"}}>
          <option value="all">ALL CATEGORIES</option>
          {MENU_SECTIONS.map(s=>(
            <optgroup key={s.section} label={`── ${s.section} ──`}>
              {s.cats.filter(c=>menuItems.some(i=>i.category===c.id)).map(c=>(
                <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className="admin-save-btn" style={{padding:"8px 18px",fontSize:9,letterSpacing:2}} onClick={()=>{setAddMode(true);setEditItem(null);}}>+ ADD ITEM</button>
      </div>

      {addMode && <MenuItemForm item={blank} onClose={()=>setAddMode(false)} onSave={onSave} />}

      {/* Grouped list */}
      {grouped.map(({ cat, items }) => {
        const meta = catMeta(cat);
        return (
          <div key={cat}>
            <div style={{padding:"10px 14px 4px",display:"flex",alignItems:"center",gap:8,borderTop:"1px solid rgba(255,255,255,.06)"}}>
              <span style={{fontSize:14}}>{meta.icon}</span>
              <span style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2.5,color:"rgba(255,255,255,.35)"}}>{meta.label.toUpperCase()}</span>
              <span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.2)",fontWeight:600}}>{items.length} item{items.length!==1?"s":""}</span>
            </div>
            {items.map(item => (
              <div key={item.id}>
                {editItem===item.id && <MenuItemForm item={item} onClose={()=>setEditItem(null)} onSave={onSave} />}
                <div className="admin-row" style={{opacity:item.available?1:.4}}>
                  <div style={{flex:1}}>
                    <div className="admin-row-teams">{item.name}</div>
                    <div className="admin-row-dt">
                      ${(+item.price).toFixed(2)}
                      {item.description && <span style={{color:"rgba(255,255,255,.3)"}}> · {item.description}</span>}
                      {!item.available && <span style={{color:"rgba(239,68,68,.65)"}}> · HIDDEN</span>}
                      {item.sold_out && <span style={{color:"rgba(248,113,113,.8)"}}> · SOLD OUT</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <button className={`admin-soldout-btn${item.sold_out?" on":""}`} onClick={()=>onToggleSoldOut&&onToggleSoldOut(item)}>
                      SOLD OUT
                    </button>
                    <button className="admin-save-btn" style={{padding:"5px 12px",fontSize:8}} onClick={()=>onToggleAvail(item.id,!item.available)}>
                      {item.available?"HIDE":"SHOW"}
                    </button>
                    <button className="admin-save-btn" style={{padding:"5px 12px",fontSize:8}} onClick={()=>setEditItem(item.id)}>EDIT</button>
                    <button className="admin-del-btn" onClick={()=>onDelete(item.id)}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {menuItems.length === 0 && (
        <div style={{padding:"40px 20px",textAlign:"center",fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.3)"}}>
          No items yet — add your first item above
        </div>
      )}
    </div>
  );
}

/* ── Admin: Credits management ── */
/* ── WebAuthn biometric helpers (Face ID / Touch ID / Windows Hello / Android) ── */
const BIO_CRED_KEY = "em_admin_bio_credid";
const _b64enc = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const _b64dec = str   => Uint8Array.from(atob(str), c => c.charCodeAt(0));

async function bioCheckSupport() {
  try {
    if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return !!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

async function bioEnroll() {
  let res;
  try { res = await supabase.auth.getUser(); } catch { res = { data: { user: null } }; }
  const user = res?.data?.user;
  if (!user) throw new Error("Not signed in");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = new TextEncoder().encode(user.id);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "El Mundo Admin Credits" },
      user: { id: userIdBytes, name: user.email || "admin", displayName: user.email?.split("@")[0] || "Admin" },
      pubKeyCredParams: [{ type:"public-key", alg:-7 },{ type:"public-key", alg:-257 }],
      authenticatorSelection: { authenticatorAttachment:"platform", userVerification:"required" },
      timeout: 60000, attestation: "none",
    }
  });
  localStorage.setItem(BIO_CRED_KEY, _b64enc(cred.rawId));
  return true;
}

async function bioVerify() {
  const credIdB64 = localStorage.getItem(BIO_CRED_KEY);
  if (!credIdB64) throw new Error("No biometric registered");
  const credId = _b64dec(credIdB64);
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type:"public-key", id: credId, transports:["internal"] }],
      userVerification: "required",
      timeout: 60000,
    }
  });
  return true;
}

/* ── Admin: Gift Cards — bulk generate + print on thermal ── */
function AdminGiftCards() {
  const DENOMS = [10, 20, 50, 100];
  const [denom,     setDenom]     = useState(10);
  const [quantity,  setQuantity]  = useState(50);
  const [generating, setGenerating] = useState(false);
  const [cards,     setCards]     = useState([]);
  const [filter,    setFilter]    = useState("all"); // all / active / redeemed / voided / not_printed
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState({}); // { id: true }
  const [batchView, setBatchView] = useState(null); // batch_id when viewing a single batch
  const [toast, setToast] = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2400);
  };

  const load = async () => {
    setLoading(true);
    try {
      const status = (filter === "active" || filter === "redeemed" || filter === "voided") ? filter : null;
      const { data, error } = await supabase.rpc("admin_list_gift_cards", { p_limit: 500, p_status: status });
      if (error) throw error;
      let rows = data || [];
      if (filter === "not_printed") rows = rows.filter(c => !c.printed);
      setCards(rows);
    } catch (e) {
      console.error(e);
      showToast(e.message || "Failed to load", false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const generate = async () => {
    if (generating) return;
    const q = +quantity;
    const a = +denom;
    if (!a || a <= 0)        return showToast("Pick a denomination", false);
    if (!q || q < 1 || q > 500) return showToast("Quantity must be 1–500", false);
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc("admin_generate_gift_cards", { p_amount: a, p_quantity: q });
      if (error) throw error;
      showToast(`✓ Generated ${data.length} × $${a.toFixed(2)} cards`);
      try { navigator.vibrate?.([40, 30, 80]); } catch {}
      const newBatchId = data[0]?.out_batch_id;
      await load();
      if (newBatchId) setBatchView(newBatchId);
    } catch (e) {
      showToast(e.message || "Generation failed", false);
    } finally {
      setGenerating(false);
    }
  };

  const toggleSelect = (id) => setSelected(s => ({ ...s, [id]: !s[id] }));
  const selectAll = (rows) => {
    const allOn = rows.every(c => selected[c.id]);
    const next = { ...selected };
    rows.forEach(c => { if (allOn) delete next[c.id]; else next[c.id] = true; });
    setSelected(next);
  };
  const clearSelection = () => setSelected({});

  const printCards = async (rows) => {
    if (rows.length === 0) return;
    const html = buildThermalHTML(rows);
    const w = window.open("", "_blank", "width=420,height=720");
    if (!w) { showToast("Allow pop-ups to print", false); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      try { w.print(); } catch {}
    }, 250);
    // Mark as printed (best-effort)
    try {
      await supabase.rpc("admin_mark_printed", { p_card_ids: rows.map(r => r.id) });
      load();
    } catch {}
  };

  const voidCard = async (id) => {
    if (!confirm("Void this gift card? It can no longer be redeemed.")) return;
    try {
      const { data, error } = await supabase.rpc("admin_void_gift_card", { p_card_id: id });
      if (error) throw error;
      if (!data?.ok) {
        showToast(data?.error === "already_redeemed" ? "Already redeemed" : "Could not void", false);
        return;
      }
      showToast("Card voided");
      load();
    } catch (e) {
      showToast("Could not void", false);
    }
  };

  // Group cards by batch when not in batch view
  const batches = useMemo(() => {
    const map = new Map();
    cards.forEach(c => {
      const key = c.batch_id || c.id;
      if (!map.has(key)) map.set(key, { batch_id: key, created_at: c.created_at, cards: [] });
      map.get(key).cards.push(c);
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [cards]);

  const currentBatch = batchView ? batches.find(b => b.batch_id === batchView) : null;
  const visibleCards = currentBatch ? currentBatch.cards : [];
  const selectedRows = visibleCards.filter(c => selected[c.id]);

  // Stats
  const stats = useMemo(() => {
    const total = cards.length;
    const active = cards.filter(c => c.status === "active").length;
    const redeemed = cards.filter(c => c.status === "redeemed").length;
    const voided = cards.filter(c => c.status === "voided").length;
    const notPrinted = cards.filter(c => !c.printed && c.status === "active").length;
    const totalValue = cards.reduce((s, c) => s + (+c.amount || 0), 0);
    return { total, active, redeemed, voided, notPrinted, totalValue };
  }, [cards]);

  return (
    <div style={{padding:"14px 14px 80px"}}>
      {/* Toast */}
      {toast && (
        <div style={{
          position:"fixed",top:90,left:"50%",transform:"translateX(-50%)",zIndex:9999,
          padding:"10px 18px",borderRadius:100,
          background: toast.ok ? "rgba(34,197,94,.92)" : "rgba(239,68,68,.92)",
          color:"#fff",fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:1.5,
          boxShadow:"0 8px 24px rgba(0,0,0,.4)",
        }}>{toast.msg}</div>
      )}

      {!batchView ? (
        <>
          {/* GENERATE NEW BATCH */}
          <div className="agc-panel">
            <div className="agc-panel-hd">
              <span style={{fontSize:18}}>🎫</span>
              GENERATE NEW BATCH
            </div>
            <div className="agc-denoms">
              {DENOMS.map(d => (
                <button key={d}
                  className={`agc-denom ${denom === d ? "agc-denom-on" : ""}`}
                  onClick={() => setDenom(d)}>
                  <div className="agc-denom-amt">${d}</div>
                  <div className="agc-denom-lbl">EACH</div>
                </button>
              ))}
            </div>
            <div className="agc-qty-row">
              <label className="agc-qty-label">QUANTITY</label>
              <div className="agc-qty-controls">
                <button className="agc-qty-btn" onClick={()=>setQuantity(q => Math.max(1, +q - 10))}>−10</button>
                <button className="agc-qty-btn" onClick={()=>setQuantity(q => Math.max(1, +q - 1))}>−</button>
                <input type="number" min="1" max="500" className="agc-qty-input" value={quantity}
                  onChange={e => setQuantity(+e.target.value || 1)} />
                <button className="agc-qty-btn" onClick={()=>setQuantity(q => Math.min(500, +q + 1))}>+</button>
                <button className="agc-qty-btn" onClick={()=>setQuantity(q => Math.min(500, +q + 10))}>+10</button>
              </div>
            </div>
            <div className="agc-totals">
              <div className="agc-totals-l">
                <div className="agc-totals-lbl">TOTAL VALUE</div>
                <div className="agc-totals-amt">${(denom * quantity).toFixed(2)}</div>
              </div>
              <button
                className="agc-generate-btn"
                onClick={generate}
                disabled={generating}>
                {generating ? "GENERATING…" : `+ GENERATE ${quantity} CARDS`}
              </button>
            </div>
          </div>

          {/* STATS */}
          <div className="agc-stats">
            <div className="agc-stat"><div className="agc-stat-n">{stats.total}</div><div className="agc-stat-l">TOTAL</div></div>
            <div className="agc-stat agc-stat-green"><div className="agc-stat-n">{stats.active}</div><div className="agc-stat-l">ACTIVE</div></div>
            <div className="agc-stat agc-stat-blue"><div className="agc-stat-n">{stats.redeemed}</div><div className="agc-stat-l">REDEEMED</div></div>
            <div className="agc-stat agc-stat-amber"><div className="agc-stat-n">{stats.notPrinted}</div><div className="agc-stat-l">UNPRINTED</div></div>
            <div className="agc-stat agc-stat-red"><div className="agc-stat-n">{stats.voided}</div><div className="agc-stat-l">VOIDED</div></div>
          </div>

          {/* FILTER CHIPS */}
          <div className="agc-filter-bar">
            {[
              { id: "all",         lbl: "ALL" },
              { id: "active",      lbl: "ACTIVE" },
              { id: "not_printed", lbl: "NEED PRINT" },
              { id: "redeemed",    lbl: "REDEEMED" },
              { id: "voided",      lbl: "VOIDED" },
            ].map(f => (
              <button key={f.id}
                className={`agc-filter-chip ${filter === f.id ? "agc-filter-chip-on" : ""}`}
                onClick={() => setFilter(f.id)}>{f.lbl}</button>
            ))}
          </div>

          {/* BATCHES */}
          <div className="agc-section-hd">BATCHES</div>
          {loading ? (
            <div className="agc-empty">Loading…</div>
          ) : batches.length === 0 ? (
            <div className="agc-empty">No batches yet. Generate one above.</div>
          ) : (
            <div className="agc-batch-list">
              {batches.map(b => {
                const d = new Date(b.created_at);
                const amount = b.cards[0]?.amount;
                const redeemed = b.cards.filter(c => c.status === "redeemed").length;
                const printed  = b.cards.filter(c => c.printed).length;
                const total    = b.cards.length;
                return (
                  <div key={b.batch_id} className="agc-batch-card" onClick={() => { clearSelection(); setBatchView(b.batch_id); }}>
                    <div className="agc-batch-card-l">
                      <div className="agc-batch-card-amt">${(+amount).toFixed(0)}</div>
                      <div className="agc-batch-card-amt-lbl">EACH</div>
                    </div>
                    <div className="agc-batch-card-mid">
                      <div className="agc-batch-card-title">{total} cards · ${(amount * total).toFixed(0)}</div>
                      <div className="agc-batch-card-sub">
                        {d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} ·
                        {" "}{d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}
                      </div>
                      <div className="agc-batch-card-progress">
                        <span className="agc-pill agc-pill-green">{printed}/{total} printed</span>
                        {redeemed > 0 && <span className="agc-pill agc-pill-blue">{redeemed} redeemed</span>}
                      </div>
                    </div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{color:"rgba(255,255,255,.4)"}}>
                      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        // BATCH DETAIL VIEW — list every card
        <>
          <div className="agc-batch-detail-hd">
            <button className="agc-back-btn" onClick={() => { setBatchView(null); clearSelection(); }}>← BACK</button>
            <div className="agc-batch-detail-title">
              {currentBatch.cards.length} × ${(+currentBatch.cards[0]?.amount).toFixed(0)} batch
            </div>
          </div>

          {/* Bulk action bar */}
          <div className="agc-bulk-bar">
            <button className="agc-bulk-btn" onClick={() => selectAll(visibleCards)}>
              {visibleCards.every(c => selected[c.id]) ? "DESELECT ALL" : "SELECT ALL"}
            </button>
            <span className="agc-bulk-count">{selectedRows.length} selected</span>
            <button
              className="agc-bulk-print"
              disabled={selectedRows.length === 0}
              onClick={() => printCards(selectedRows)}>
              🖨️ PRINT {selectedRows.length > 0 ? `(${selectedRows.length})` : ""}
            </button>
          </div>

          {/* Cards list */}
          <div className="agc-card-list">
            {visibleCards.map(c => {
              const isSel = !!selected[c.id];
              return (
                <div key={c.id} className={`agc-card-row ${isSel ? "agc-card-row-sel" : ""}`}>
                  <label className="agc-card-check">
                    <input type="checkbox" checked={isSel} onChange={() => toggleSelect(c.id)} disabled={c.status !== "active"} />
                    <span />
                  </label>
                  <div className="agc-card-row-mid">
                    <div className="agc-card-row-code">{c.code}</div>
                    <div className="agc-card-row-meta">
                      ${(+c.amount).toFixed(2)} · {
                        c.status === "active"   ? (c.printed ? "🖨 printed" : "ready") :
                        c.status === "redeemed" ? "✓ redeemed" :
                        c.status === "voided"   ? "✕ voided" : c.status
                      }
                    </div>
                  </div>
                  <div className="agc-card-row-actions">
                    {c.status === "active" && (
                      <>
                        <button className="agc-row-btn" onClick={() => printCards([c])}>🖨️</button>
                        <button className="agc-row-btn agc-row-btn-void" onClick={() => voidCard(c.id)}>✕</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Build the print-friendly HTML for one-or-more gift cards on thermal paper (80mm wide ≈ 302px @ 96dpi)
function buildThermalHTML(cards) {
  const css = `
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: 'Helvetica Neue', Arial, sans-serif; color: #000; }
    body { width: 80mm; }
    .card {
      width: 80mm; padding: 6mm 5mm 7mm; page-break-after: always;
      border-bottom: 2px dashed #000;
      text-align: center;
    }
    .card:last-child { border-bottom: none; }
    .brand {
      font-family: 'Impact', 'Arial Black', sans-serif;
      font-size: 22pt; letter-spacing: 4px; margin: 0;
      line-height: 1;
    }
    .brand-sub {
      font-size: 7pt; letter-spacing: 4px; margin-top: 2mm;
      color: #333;
    }
    .divider { border: none; border-top: 1.5px solid #000; margin: 3mm 0; }
    .gift-title {
      font-family: 'Impact', 'Arial Black', sans-serif;
      font-size: 11pt; letter-spacing: 6px; margin: 2mm 0 1mm;
    }
    .amount-block {
      border: 3px solid #000; padding: 3mm 2mm; margin: 3mm 0;
      display: flex; align-items: baseline; justify-content: center; gap: 2mm;
    }
    .amount-currency { font-size: 14pt; font-weight: 900; }
    .amount-value {
      font-family: 'Impact', 'Arial Black', sans-serif;
      font-size: 34pt; line-height: 1; font-weight: 900;
    }
    .code-label {
      font-size: 7pt; letter-spacing: 4px; margin-top: 4mm; color: #333;
    }
    .code {
      font-family: 'Courier New', monospace; font-weight: 900;
      font-size: 19pt; letter-spacing: 2px; margin: 1mm 0 3mm;
      padding: 2mm 0;
      border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;
    }
    .howto {
      font-size: 7.5pt; line-height: 1.4; margin-top: 3mm; text-align: left;
      padding: 2mm 3mm; background: #f3f3f3;
    }
    .howto strong { font-size: 8.5pt; letter-spacing: 2px; }
    .howto ol { padding-left: 4mm; margin: 1mm 0; }
    .foot {
      font-size: 6pt; letter-spacing: 3px; margin-top: 3mm; color: #555;
    }
    .barcode {
      font-family: 'Libre Barcode 128', 'Courier New', monospace;
      font-size: 28pt; letter-spacing: 0; margin: 2mm 0; line-height: 1;
    }
    .id {
      font-family: 'Courier New', monospace;
      font-size: 5.5pt; color: #888; letter-spacing: 1px; margin-top: 2mm;
    }
  `;

  const cardHtml = cards.map(c => {
    const amount = (+c.amount).toFixed(2);
    const amountWhole = String(Math.floor(+c.amount));
    return `
      <div class="card">
        <div class="brand">EL MUNDO</div>
        <div class="brand-sub">BAR · RESTAURANT</div>
        <hr class="divider"/>
        <div class="gift-title">GIFT CARD</div>
        <div class="amount-block">
          <span class="amount-currency">$</span>
          <span class="amount-value">${amountWhole}</span>
        </div>
        <div class="code-label">REDEMPTION CODE</div>
        <div class="code">${c.code}</div>
        <div class="howto">
          <strong>HOW TO REDEEM</strong>
          <ol>
            <li>Open the El Mundo app</li>
            <li>Go to your Wallet</li>
            <li>Tap "Add gift card code"</li>
            <li>Enter the code above</li>
          </ol>
        </div>
        <div class="foot">elmundobonaire.com · #${c.id.slice(0,8).toUpperCase()}</div>
      </div>
    `;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>El Mundo Gift Cards</title><style>${css}</style></head><body>${cardHtml}</body></html>`;
}


function AdminCredits({ users, onAddCredits }) {
  const [unlocked,  setUnlocked]  = useState(false);
  const [pinInput,  setPinInput]  = useState("");
  const [pinErr,    setPinErr]    = useState("");
  // biometric state
  const [bioSupported,     setBioSupported]     = useState(false);
  const [bioRegistered,    setBioRegistered]    = useState(false);
  const [bioBusy,          setBioBusy]          = useState(false);
  const [bioMsg,           setBioMsg]           = useState(null);
  const [showEnrollPrompt, setShowEnrollPrompt] = useState(false);
  const [search,    setSearch]    = useState("");
  const [amounts,   setAmounts]   = useState({});
  const [confirm,   setConfirm]   = useState(null); // {userId, amount, name}
  const [showHistory, setShowHistory] = useState(false);
  const [topUpHistory, setTopUpHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [histFilter, setHistFilter] = useState("recent"); // recent | today | week | month | custom
  const [histFrom, setHistFrom] = useState("");
  const [histTo, setHistTo] = useState("");
  const [expandedPlayer, setExpandedPlayer] = useState(null); // userId for per-player history
  const [playerHistory, setPlayerHistory] = useState({}); // { [userId]: [...topups] }
  const [playerHistLoading, setPlayerHistLoading] = useState(null);

  const loadHistory = async () => {
    setHistoryLoading(true);
    const { data } = await supabase.from("credit_topups").select("*").order("created_at", { ascending: false }).limit(500);
    setTopUpHistory(data || []);
    setHistoryLoading(false);
  };

  const getFilteredHistory = () => {
    const now = new Date();
    if (histFilter === "recent") return topUpHistory.slice(0, 5);
    if (histFilter === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return topUpHistory.filter(t => new Date(t.created_at) >= start);
    }
    if (histFilter === "week") {
      const start = new Date(now); start.setDate(now.getDate() - 7);
      return topUpHistory.filter(t => new Date(t.created_at) >= start);
    }
    if (histFilter === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return topUpHistory.filter(t => new Date(t.created_at) >= start);
    }
    if (histFilter === "custom" && histFrom) {
      const from = new Date(histFrom);
      const to = histTo ? new Date(histTo + "T23:59:59") : new Date();
      return topUpHistory.filter(t => { const d = new Date(t.created_at); return d >= from && d <= to; });
    }
    return topUpHistory;
  };

  const printThermalReceipt = (txList) => {
    const rows = txList.map(tx => {
      const player = Object.values(users).find(u => u.id === tx.user_id);
      const dt = new Date(tx.created_at);
      const name = (player?.name || "Unknown") + (player?.player_number ? ` #${player.player_number}` : "");
      return `<tr><td>${dt.toLocaleDateString([],{month:"2-digit",day:"2-digit"})} ${dt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</td><td>${name}</td><td>${tx.method||"cash"}</td><td style="text-align:right;font-weight:bold">+$${(+tx.amount).toFixed(2)}</td></tr>`;
    }).join("");
    const total = txList.reduce((s,t)=>s+(+t.amount),0);
    const filterLabel = histFilter==="recent"?"Last 5":histFilter==="today"?"Today":histFilter==="week"?"This Week":histFilter==="month"?"This Month":`${histFrom||""}${histTo?" → "+histTo:""}`;
    silentPrint(`<!DOCTYPE html><html><head><title>Top-Up Receipt</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:11px;width:72mm;padding:4mm;background:#fff;color:#000}
h1{font-size:13px;text-align:center;font-weight:bold;margin-bottom:2px}
.sub{text-align:center;font-size:10px;margin-bottom:6px;border-bottom:1px dashed #000;padding-bottom:4px}
.meta{font-size:9px;margin-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:10px}
td{padding:2px 1px;vertical-align:top}
td:last-child{white-space:nowrap}
.divider{border-top:1px dashed #000;margin:4px 0}
.total{font-weight:bold;font-size:12px;text-align:right;padding-top:4px}
.footer{text-align:center;font-size:9px;margin-top:6px;border-top:1px dashed #000;padding-top:4px}
@media print{@page{size:72mm auto;margin:0}body{width:72mm;padding:3mm}}
</style></head><body>
<h1>EL MUNDO</h1>
<div class="sub">TOP-UP HISTORY · ${filterLabel.toUpperCase()}</div>
<div class="meta">Printed: ${new Date().toLocaleString([], {month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"})}<br>Records: ${txList.length}</div>
<table>${rows}</table>
<div class="divider"></div>
<div class="total">TOTAL: $${total.toFixed(2)}</div>
<div class="footer">www.elmundobonaire.com</div>
<div style="height:20mm"></div>
</body></html>`, sendCut);
  };

  const loadPlayerHistory = async (userId) => {
    if (expandedPlayer === userId) { setExpandedPlayer(null); return; }
    setExpandedPlayer(userId);
    if (playerHistory[userId]) return; // already cached
    setPlayerHistLoading(userId);
    const { data } = await supabase.from("credit_topups").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    setPlayerHistory(h => ({ ...h, [userId]: data || [] }));
    setPlayerHistLoading(null);
  };

  // Auto-lock after 15 minutes of TRUE inactivity (resets on any pointer/key/touch event)
  useEffect(() => {
    if (!unlocked) return;
    const IDLE_MS = 15 * 60 * 1000;
    let timer;
    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { setUnlocked(false); setPinInput(""); }, IDLE_MS);
    };
    reset();
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(ev => window.addEventListener(ev, reset, { passive: true }));
    return () => {
      if (timer) clearTimeout(timer);
      events.forEach(ev => window.removeEventListener(ev, reset));
    };
  }, [unlocked]);

  // Admin re-auth via Supabase — confirm their own password before adding credits
  const handleUnlock = async () => {
    if (!pinInput.trim()) { setPinErr("Enter your admin password"); return; }
    let userRes;
    try { userRes = await supabase.auth.getUser(); } catch { userRes = { data: { user: null } }; }
    const sessionUser = userRes?.data?.user;
    if (!sessionUser?.email) {
      setPinErr("Your session has expired — please log out and sign in again.");
      setPinInput("");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: sessionUser.email, password: pinInput });
    if (error) { setPinErr("Wrong password — try again"); setPinInput(""); return; }
    setUnlocked(true);
    setPinErr("");
    // Offer biometric enrolment if supported and not yet registered on this device
    if (bioSupported && !bioRegistered) setShowEnrollPrompt(true);
  };

  // Detect biometric support + registration on mount
  useEffect(() => {
    bioCheckSupport().then(setBioSupported);
    setBioRegistered(!!localStorage.getItem(BIO_CRED_KEY));
  }, []);

  // No auto-trigger — admin chooses biometric or password by tapping.

  const handleBioUnlock = async () => {
    if (bioBusy) return;
    setBioBusy(true); setBioMsg(null);
    try {
      await bioVerify();
      setUnlocked(true);
      setPinErr("");
    } catch (e) {
      if (e.name === "NotAllowedError")        setBioMsg("Cancelled — tap the button to try again.");
      else if (e.name === "InvalidStateError" || e.name === "NotSupportedError") {
        localStorage.removeItem(BIO_CRED_KEY);
        setBioRegistered(false);
        setBioMsg("Biometric no longer available on this device.");
      } else                                    setBioMsg("Biometric failed — try again or use your password.");
    }
    setBioBusy(false);
  };

  const handleBioEnroll = async () => {
    setBioBusy(true);
    try {
      await bioEnroll();
      setBioRegistered(true);
      setShowEnrollPrompt(false);
    } catch (e) {
      // Silent fail — user cancelled or device doesn't allow it
    }
    setBioBusy(false);
  };

  const handleBioDisable = () => {
    localStorage.removeItem(BIO_CRED_KEY);
    setBioRegistered(false);
  };

  // Sort users by player_number if available, else by name
  const userList = Object.values(users)
    .sort((a,b) => (a.player_number||9999) - (b.player_number||9999))
    .filter(u => {
      if (!search) return true;
      const s = search.toLowerCase();
      return u.name?.toLowerCase().includes(s) ||
             String(u.player_number||"").includes(s);
    });

  if (!unlocked) return (
    <div style={{padding:"32px 16px",maxWidth:380,margin:"0 auto"}}>
      <div className="admin-form-card">
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{fontSize:36,marginBottom:12}}>🔐</div>
          <div className="admin-form-title" style={{fontSize:14,letterSpacing:2}}>ADMIN VERIFICATION</div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.45)",marginTop:8,lineHeight:1.5}}>
            Use Face ID / Touch ID or your admin password to manage player credits.
          </div>
        </div>

        {/* ── Biometric button — shown when registered ── */}
        {bioSupported && bioRegistered && (
          <>
            <button onClick={handleBioUnlock} disabled={bioBusy}
              aria-busy={bioBusy ? "true" : "false"}
              aria-label="Unlock with Face ID or Touch ID"
              style={{
                width:"100%",padding:"15px",
                background:"linear-gradient(135deg,rgba(99,179,237,.2),rgba(99,179,237,.07))",
                border:"1.5px solid rgba(99,179,237,.5)",
                borderRadius:10,color:"#63b3ed",
                fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:2,
                cursor:bioBusy?"not-allowed":"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                opacity:bioBusy?.7:1,transition:"all .15s",
                boxShadow:"0 0 18px rgba(99,179,237,.1)",
              }}>
              <span style={{fontSize:18}}>👆</span>
              {bioBusy ? "VERIFYING…" : "UNLOCK WITH FACE ID / TOUCH ID"}
            </button>

            {bioMsg && (
              <div style={{
                marginTop:10,padding:"7px 12px",borderRadius:6,
                background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.25)",
                fontFamily:"'Outfit',sans-serif",fontSize:11,color:"#fbbf24",lineHeight:1.4
              }}>{bioMsg}</div>
            )}

            <div style={{
              display:"flex",alignItems:"center",gap:10,margin:"16px 0",
              fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.3)",letterSpacing:1.5,
            }}>
              <div style={{flex:1,height:1,background:"rgba(255,255,255,.07)"}}/>
              <span>OR USE PASSWORD</span>
              <div style={{flex:1,height:1,background:"rgba(255,255,255,.07)"}}/>
            </div>
          </>
        )}

        {/* ── Password input — always visible ── */}
        <div className="afield">
          <label className="afield-lbl">ADMIN PASSWORD</label>
          <input className="afield-inp" type="password" placeholder="Your password"
            value={pinInput} onChange={e=>{setPinInput(e.target.value);setPinErr("");}}
            onKeyDown={e=>e.key==="Enter"&&handleUnlock()} autoComplete="current-password" />
        </div>
        {pinErr && <div style={{color:"rgba(239,68,68,.8)",fontFamily:"'Outfit',sans-serif",fontSize:12,marginTop:8}}>{pinErr}</div>}
        <button className="order-place-btn" style={{marginTop:16}}
          onClick={handleUnlock}>
          VERIFY WITH PASSWORD
        </button>

        {/* First-time hint when biometric is supported but not yet registered */}
        {bioSupported && !bioRegistered && (
          <div style={{
            marginTop:14,padding:"10px 12px",
            background:"rgba(99,179,237,.06)",border:"1px dashed rgba(99,179,237,.3)",
            borderRadius:8,display:"flex",alignItems:"center",gap:10,
          }}>
            <span style={{fontSize:18,flexShrink:0}}>👆</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:1.5,color:"#63b3ed",marginBottom:2}}>
                FACE ID / TOUCH ID AVAILABLE
              </div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.5)",lineHeight:1.4}}>
                After you verify with your password, you can enable biometric for faster unlocks next time.
              </div>
            </div>
          </div>
        )}
        {!bioSupported && (
          <div style={{
            marginTop:12,fontFamily:"'Outfit',sans-serif",fontSize:10,
            color:"rgba(255,255,255,.25)",textAlign:"center",letterSpacing:.5,
          }}>
            Biometric unlock isn't available in this browser/device
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div>
      {/* Confirm modal */}
      {confirm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">Add Credits?</div>
            <p className="modal-body">
              Add <strong>${(+confirm.amount).toFixed(2)}</strong> credits to <strong>{confirm.name}</strong>{confirm.playerNumber ? ` (Player #${confirm.playerNumber})` : ""}?
            </p>
            <div className="modal-actions">
              <button className="modal-del-btn" onClick={()=>{ onAddCredits(confirm.userId, +confirm.amount, confirm.name); setAmounts(a=>({...a,[confirm.userId]:""})); setPlayerHistory(h => { const n={...h}; delete n[confirm.userId]; return n; }); setConfirm(null); }}>Yes, Add</button>
              <button className="modal-cancel-btn" onClick={()=>setConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating LOCK button — fixed, never scrolls ── */}
      <button
        onClick={() => {
          setUnlocked(false);
          setPinInput("");
          setPinErr("");
          setBioMsg(null);
          setSearch("");
          setAmounts({});
          setShowEnrollPrompt(false);
        }}
        title="Lock the credits tab"
        aria-label="Lock the credits tab"
        style={{
          position:"fixed",
          // Use safe-area + bottom-nav height (≈80px) — works on iOS notch and PWAs
          bottom:"calc(80px + env(safe-area-inset-bottom, 0px) + 16px)",
          right:"calc(env(safe-area-inset-right, 0px) + 16px)",
          zIndex:100,
          display:"flex",alignItems:"center",gap:7,
          padding:"11px 16px",borderRadius:30,
          background:"linear-gradient(135deg,rgba(239,68,68,.95),rgba(220,38,38,.95))",
          color:"#fff",border:"1.5px solid rgba(255,255,255,.18)",
          fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:2,
          cursor:"pointer",
          boxShadow:"0 8px 24px rgba(239,68,68,.45),0 2px 8px rgba(0,0,0,.4)",
          transition:"transform .12s,box-shadow .12s",
        }}
        onMouseDown={e=>e.currentTarget.style.transform="scale(.95)"}
        onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
        onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
      >
        <span style={{fontSize:14}}>🔒</span>
        <span>LOCK</span>
      </button>

      <div className="admin-hint" style={{margin:"0 14px",padding:"12px 0 4px",borderTop:"none"}}>
        ✓ Verified. Search by player number or name, enter amount and press ADD.
      </div>

      {/* ── Biometric enrolment banner — first time after password unlock ── */}
      {showEnrollPrompt && bioSupported && !bioRegistered && (
        <div style={{
          margin:"10px 14px 0",padding:"14px 16px",
          background:"linear-gradient(135deg,rgba(99,179,237,.1),rgba(99,179,237,.03))",
          border:"1px solid rgba(99,179,237,.3)",borderRadius:10,
          display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",
        }}>
          <div style={{fontSize:22,flexShrink:0}}>👆</div>
          <div style={{flex:1,minWidth:140}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:2,color:"#63b3ed",marginBottom:2}}>
              ENABLE FACE ID / TOUCH ID
            </div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.45)",lineHeight:1.4}}>
              Unlock the credits tab faster on this device. Falls back to password if not recognised.
            </div>
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            <button onClick={handleBioEnroll} disabled={bioBusy}
              style={{padding:"8px 14px",background:"rgba(99,179,237,.22)",border:"1px solid rgba(99,179,237,.55)",
                color:"#63b3ed",fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:1.5,cursor:bioBusy?"not-allowed":"pointer",borderRadius:6}}>
              {bioBusy ? "…" : "ENABLE"}
            </button>
            <button onClick={()=>setShowEnrollPrompt(false)}
              style={{padding:"8px 12px",background:"transparent",border:"1px solid rgba(255,255,255,.15)",
                color:"rgba(255,255,255,.5)",fontFamily:"'Outfit',sans-serif",fontSize:11,cursor:"pointer",borderRadius:6}}>
              Not now
            </button>
          </div>
        </div>
      )}

      {/* ── Biometric status pill — when registered, allow disable ── */}
      {bioSupported && bioRegistered && (
        <div style={{margin:"8px 14px 0",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{
            display:"inline-flex",alignItems:"center",gap:6,
            padding:"5px 11px",borderRadius:20,
            background:"rgba(74,222,128,.08)",border:"1px solid rgba(74,222,128,.25)",
            fontFamily:"'Outfit',sans-serif",fontSize:11,color:"#4ade80",letterSpacing:.5,
          }}>
            <span>👆</span>
            <span>Biometric unlock active on this device</span>
          </div>
          <button onClick={handleBioDisable}
            style={{padding:"4px 10px",background:"transparent",border:"1px solid rgba(255,255,255,.12)",
              color:"rgba(255,255,255,.4)",fontFamily:"'Outfit',sans-serif",fontSize:10,cursor:"pointer",borderRadius:6}}>
            Disable on this device
          </button>
        </div>
      )}

      {/* ── Top-Up History ── */}
      <div style={{padding:"0 14px 10px"}}>
        <div style={{display:"flex",gap:8,marginBottom:showHistory?8:0}}>
          <button style={{flex:1,padding:"10px",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.15)",color:"rgba(255,255,255,.75)",fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2,cursor:"pointer"}}
            onClick={()=>{setShowHistory(!showHistory); if(!showHistory && topUpHistory.length===0) loadHistory();}}>
            {showHistory ? "▲ HIDE HISTORY" : "▼ TOP-UP HISTORY"}
          </button>
          {showHistory && (
            <button style={{padding:"10px 14px",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.15)",color:"rgba(255,255,255,.75)",fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2,cursor:"pointer",flexShrink:0}}
              onClick={()=>printThermalReceipt(getFilteredHistory())}>🖨 PRINT</button>
          )}
        </div>
        {showHistory && (
          <div>
            {/* Filter pills */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              {[["recent","LAST 5"],["today","TODAY"],["week","WEEK"],["month","MONTH"],["custom","CUSTOM"]].map(([f,label])=>(
                <button key={f} style={{padding:"5px 10px",fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,cursor:"pointer",border:`1px solid ${histFilter===f?"rgba(255,255,255,.6)":"rgba(255,255,255,.12)"}`,background:histFilter===f?"rgba(255,255,255,.08)":"transparent",color:histFilter===f?"#fff":"rgba(255,255,255,.4)",transition:"all .15s"}}
                  onClick={()=>{setHistFilter(f); if(topUpHistory.length===0) loadHistory();}}>
                  {label}
                </button>
              ))}
              <button style={{padding:"5px 10px",fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,cursor:"pointer",border:"1px solid rgba(255,255,255,.08)",background:"transparent",color:"rgba(255,255,255,.3)",marginLeft:"auto"}}
                onClick={loadHistory}>↻</button>
            </div>
            {histFilter === "custom" && (
              <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
                <input type="date" value={histFrom} onChange={e=>setHistFrom(e.target.value)}
                  style={{flex:1,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",color:"#fff",padding:"6px 8px",fontFamily:"'Outfit',sans-serif",fontSize:12}} />
                <span style={{color:"rgba(255,255,255,.3)",fontSize:11}}>→</span>
                <input type="date" value={histTo} onChange={e=>setHistTo(e.target.value)}
                  style={{flex:1,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",color:"#fff",padding:"6px 8px",fontFamily:"'Outfit',sans-serif",fontSize:12}} />
              </div>
            )}
            {historyLoading ? (
              <div style={{textAlign:"center",padding:"16px 0",color:"rgba(255,255,255,.25)",fontFamily:"'Outfit',sans-serif",fontSize:13}}>Loading…</div>
            ) : getFilteredHistory().length === 0 ? (
              <div style={{textAlign:"center",padding:"16px 0",color:"rgba(255,255,255,.25)",fontFamily:"'Outfit',sans-serif",fontSize:13}}>No top-ups in this period</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {getFilteredHistory().map((tx,i) => {
                  const player = Object.values(users).find(u => u.id === tx.user_id);
                  const admin  = Object.values(users).find(u => u.id === tx.added_by);
                  const dt = new Date(tx.created_at);
                  return (
                    <div key={tx.id||i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)"}}>
                      <div style={{fontFamily:"'Anton',sans-serif",fontSize:16,color:"#4ade80",minWidth:60,flexShrink:0}}>+${(+tx.amount).toFixed(2)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"#fff",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {player?.name||"Unknown"}{player?.player_number?` #${player.player_number}`:""}
                        </div>
                        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.3)",marginTop:1}}>
                          {admin?.name||"Admin"} · {tx.method||"cash"} · {dt.toLocaleDateString([],{month:"short",day:"numeric"})} {dt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {histFilter==="recent" && topUpHistory.length>5 && (
                  <div style={{textAlign:"center",padding:"6px 0",fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.25)"}}>
                    Showing last 5 of {topUpHistory.length} — use filters to see more
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{padding:"0 14px 12px"}}>
        <input className="afield-inp" placeholder="Search by # or name..." value={search}
          onChange={e=>setSearch(e.target.value)} style={{width:"100%",boxSizing:"border-box"}} />
      </div>
      {userList.map(u => (
        <div key={u.id}>
          <div className="admin-row" style={{cursor:"pointer"}} onClick={()=>loadPlayerHistory(u.id)}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {u.player_number && (
                  <span style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2,color:"rgba(255,255,255,.35)",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",padding:"2px 8px",flexShrink:0}}>
                    #{u.player_number}
                  </span>
                )}
                <div className="admin-row-teams">{u.name}</div>
                <span style={{fontSize:9,color:"rgba(255,255,255,.25)",marginLeft:"auto",fontFamily:"'Outfit',sans-serif"}}>{expandedPlayer===u.id ? "▲" : "▼"}</span>
              </div>
              <div className="admin-row-dt">{u.phone||"No phone"}</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
              <input className="afield-inp" type="number" min="1" step="1" placeholder="$"
                style={{width:64,textAlign:"center",padding:"6px 8px",fontSize:14}}
                value={amounts[u.id]||""}
                onChange={e=>setAmounts(a=>({...a,[u.id]:e.target.value}))} />
              <button className="admin-save-btn" style={{padding:"7px 14px",fontSize:9,letterSpacing:1}}
                disabled={!amounts[u.id]||+amounts[u.id]<=0}
                onClick={()=>setConfirm({userId:u.id, amount:amounts[u.id], name:u.name, playerNumber:u.player_number})}>
                ADD
              </button>
            </div>
          </div>
          {/* Per-player top-up history */}
          {expandedPlayer === u.id && (
            <div style={{padding:"0 14px 10px",background:"rgba(255,255,255,.02)",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
              {playerHistLoading === u.id ? (
                <div style={{padding:"12px 0",textAlign:"center",fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.25)"}}>Loading...</div>
              ) : !playerHistory[u.id] || playerHistory[u.id].length === 0 ? (
                <div style={{padding:"12px 0",textAlign:"center",fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.2)"}}>No top-ups for this player</div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:4,paddingTop:6}}>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,255,255,.3)",marginBottom:4}}>TOP-UP HISTORY — {u.name?.toUpperCase()}</div>
                  {playerHistory[u.id].map((tx,i) => {
                    const admin = Object.values(users).find(a => a.id === tx.added_by);
                    const dt = new Date(tx.created_at);
                    return (
                      <div key={tx.id||i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.05)"}}>
                        <div style={{fontFamily:"'Anton',sans-serif",fontSize:15,color:"#4ade80",minWidth:55,flexShrink:0}}>+${(+tx.amount).toFixed(2)}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.5)"}}>
                            by <strong style={{color:"rgba(255,255,255,.7)"}}>{admin?.name || "Admin"}</strong> · {tx.method || "cash"}
                          </div>
                          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.25)",marginTop:1}}>
                            {dt.toLocaleDateString([],{month:"short",day:"numeric",year:"numeric"})} {dt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {userList.length === 0 && <div className="empty">No players found</div>}


      <div style={{padding:"12px 14px 8px"}}>
        <button style={{background:"transparent",border:"none",color:"rgba(255,255,255,.3)",fontFamily:"'Outfit',sans-serif",fontSize:12,cursor:"pointer",padding:0}}
          onClick={()=>{setUnlocked(false);setPinInput("");}}>
          🔒 Lock credits panel
        </button>
      </div>
    </div>
  );
}

/* ═══ PRINT RECEIPT ══════════════════════════════════════════════════════════ */
