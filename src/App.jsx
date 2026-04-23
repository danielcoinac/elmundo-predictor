import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import jsQR from "jsqr";
import { supabase } from "./lib/supabase";
import { TRANSLATIONS, LangContext, useLang } from "./lib/i18n";
import { sget, sset, DEFAULT_MATCHES, DEFAULT_RULES, DEFAULT_SPONSORS, MONTHS, matchDate, sortMatches, calcPts, FLAGS, flag, MENU_SECTIONS, ALL_MENU_CATS, catMeta } from "./lib/utils";
import { Logo, HeaderLogo } from "./components/Logo";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FloorPlan, OrderFeed } from "./components/StaffViews";
import "./styles.css";

/** Read event branding from localStorage — works in any context (outside React components) */
function getEventLabel() {
  try { const s = JSON.parse(localStorage.getItem("em_app_settings")||"{}"); return `${s.eventName||"WORLD CUP"} ${s.eventYear||2026}`; } catch { return "WORLD CUP 2026"; }
}

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
  const [toast,    setToast]    = useState(null);
  const toastTimerRef = useRef(null);
  const globalChannelRef = useRef(null);
  const [lang,     setLang]     = useState(() => localStorage.getItem("lang") || "en");
  const t = k => TRANSLATIONS[lang]?.[k] ?? TRANSLATIONS.en[k] ?? k;
  const toggleLang = () => { const nl = lang === "en" ? "nl" : "en"; setLang(nl); localStorage.setItem("lang", nl); };
  const [form,     setForm]     = useState({ name:"", email:"", phone:"", password:"" });
  const [formErr,  setFormErr]  = useState("");
  const [publicBoard, setPublicBoard] = useState([]);
  const [menuItems,   setMenuItems]   = useState([]);
  const [myCredits,   setMyCredits]   = useState(0);
  const [myOrders,    setMyOrders]    = useState([]);
  const [allOrders,   setAllOrders]   = useState([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [activeGroup,  setActiveGroup]  = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupItems,   setGroupItems]   = useState([]);
  const [sponsorGifts, setSponsorGifts] = useState([]);
  const [showWinner,   setShowWinner]   = useState(false);
  const [winnerData,   setWinnerData]   = useState(null);
  const [passportStamps, setPassportStamps] = useState([]);
  const [showPassport,   setShowPassport]   = useState(false);
  const [gifts,          setGifts]          = useState([]);
  const [showGifts,      setShowGifts]      = useState(false);
  const [passportCompletion, setPassportCompletion] = useState(null);
  const [pendingGiftItems, setPendingGiftItems] = useState([]); // gift(s) queued to add to menu cart
  const APP_SETTINGS_DEF = { showMatches:true, showLeaderboard:true, showMundogram:true, showMenu:true, noEventMode:false, eventYear:2026, eventName:"WORLD CUP" };
  const [appSettings, setAppSettings] = useState(APP_SETTINGS_DEF);
  // Online/offline detection
  useEffect(() => {
    const goOnline  = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
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

      // Load public leaderboard (available before login, for TV screen)
      const { data: pubProfiles } = await supabase.from("profiles").select("*");
      const { data: pubPreds }    = await supabase.from("predictions").select("*");
      if (pubProfiles && pubPreds && mRows) {
        const predMap = {};
        pubPreds.forEach(p => { predMap[`${p.user_id}__${p.match_id}`] = { h: p.home_pred, a: p.away_pred }; });
        const finished = mRows.filter(r => r.status === "finished");
        const noAdmins = pubProfiles.filter(u => !u.is_admin);
        const pubBoard = noAdmins.map(u => ({
          ...u,
          pts: finished.reduce((acc, m) => {
            const p = predMap[`${u.id}__${m.id}`];
            return acc + calcPts(p, m.home_score, m.away_score);
          }, 0)
        })).sort((a,b) => b.pts - a.pts).slice(0, 10);
        setPublicBoard(pubBoard);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
        if (profile) {
          setUser({ ...session.user, ...profile });
          const { data: predRows } = await supabase.from("predictions").select("*");
          if (predRows) {
            const predMap = {};
            predRows.forEach(p => { predMap[`${p.user_id}__${p.match_id}`] = { h: p.home_pred, a: p.away_pred }; });
            setPreds(predMap);
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
          // Load passport stamps
          const { data: stampRows } = await supabase.from("passport_stamps").select("*").eq("user_id", session.user.id).order("earned_at");
          if (stampRows) setPassportStamps(stampRows);

          // Load gifts
          const { data: giftRows } = await supabase.from("gifts").select("*").eq("recipient_id", session.user.id).order("created_at", { ascending: false });
          if (giftRows) setGifts(giftRows);

          // Load passport completion (pending gift signal)
          const { data: pcRow } = await supabase.from("passport_completions").select("*").eq("user_id", session.user.id).maybeSingle();
          if (pcRow) setPassportCompletion(pcRow);

          // Restore active group order if user is still a member
          const { data: memRow } = await supabase
            .from("group_order_members")
            .select("group_order_id")
            .eq("user_id", session.user.id)
            .order("joined_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (memRow) {
            const { data: grpRow } = await supabase
              .from("group_orders")
              .select("*")
              .eq("id", memRow.group_order_id)
              .in("status", ["open", "awaiting_payment", "placed"])
              .maybeSingle();
            if (grpRow) {
              setActiveGroup(grpRow);
              const { data: mems } = await supabase.from("group_order_members").select("*").eq("group_order_id", grpRow.id);
              if (mems) setGroupMembers(mems);
              const { data: items } = await supabase.from("group_order_items").select("*").eq("group_order_id", grpRow.id);
              if (items) setGroupItems(items);
            }
          }

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
          } else if (stripeResult === "group_success") {
            window.history.replaceState({}, "", window.location.pathname);
            setTimeout(() => toast$("Group payment confirmed! Your order is being prepared 🍺"), 600);
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

    // ── 6. MY CREDITS — Realtime ─────────────────────────────────────────────
    const creditSub = supabase.channel("rt-credits")
      .on("postgres_changes", {
        event:"*", schema:"public", table:"user_credits",
        filter:`user_id=eq.${uid}`
      }, payload => {
        if (payload.new) setMyCredits(payload.new.balance || 0);
      }).subscribe();

    // ── 6b. CREDIT TOP-UP NOTIFICATION ───────────────────────────────────────
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

    // ── 9c. MY PASSPORT COMPLETION — Realtime (pending gift signal) ──────────
    const passportCompletionSub = supabase.channel("rt-passport-completion-me")
      .on("postgres_changes", {
        event:"*", schema:"public", table:"passport_completions",
        filter:`user_id=eq.${uid}`
      }, payload => {
        if (payload.eventType === "DELETE") {
          setPassportCompletion(null);
        } else if (payload.new) {
          setPassportCompletion(payload.new);
        }
      }).subscribe();

    // ── 10. LIGHTWEIGHT FALLBACK POLL every 60s ───────────────────────────────
    // Only fetches the user's own lightweight data — failsafe if Realtime misses anything
    // 500 users × 1 query / 60s = ~8 queries/sec total. Very manageable.
    const fallback = setInterval(async () => {
      const { data: cred } = await supabase.from("user_credits")
        .select("balance").eq("user_id", uid).maybeSingle();
      if (cred) setMyCredits(cred.balance || 0);

      const { data: ords } = await supabase.from("orders")
        .select("*").eq("user_id", uid).order("created_at", { ascending:false });
      if (ords) setMyOrders(ords);
    }, 60000);

    return () => {
      supabase.removeChannel(matchSub);
      supabase.removeChannel(menuSub);
      supabase.removeChannel(profileSub);
      supabase.removeChannel(predSub);
      supabase.removeChannel(creditSub);
      supabase.removeChannel(orderSub);
      supabase.removeChannel(creditNotifSub);
      if (adminOrderSub) supabase.removeChannel(adminOrderSub);
      supabase.removeChannel(globalSub);
      supabase.removeChannel(giftSub);
      supabase.removeChannel(passportCompletionSub);
      clearInterval(fallback);
    };
  }, [page, user?.id]);

  useEffect(() => {
    if (!activeGroup?.id) return;
    const gid = activeGroup.id;
    const mSub = supabase.channel(`go-members-${gid}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"group_order_members", filter:`group_order_id=eq.${gid}` },
        async () => {
          const { data } = await supabase.from("group_order_members").select("*").eq("group_order_id", gid);
          if (data) setGroupMembers(data);
        }).subscribe();
    const iSub = supabase.channel(`go-items-${gid}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"group_order_items", filter:`group_order_id=eq.${gid}` },
        async () => {
          const { data } = await supabase.from("group_order_items").select("*").eq("group_order_id", gid);
          if (data) setGroupItems(data);
        }).subscribe();
    const oSub = supabase.channel(`go-order-${gid}`)
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"group_orders", filter:`id=eq.${gid}` },
        async (payload) => {
          const fresh = payload.new && Object.keys(payload.new).length > 1
            ? payload.new
            : (await supabase.from("group_orders").select("*").eq("id", gid).maybeSingle()).data;
          if (fresh) setActiveGroup(prev => ({ ...prev, ...fresh }));
        }).subscribe();
    return () => { supabase.removeChannel(mSub); supabase.removeChannel(iSub); supabase.removeChannel(oSub); };
  }, [activeGroup?.id]);

  // ─── GROUP ORDER POLLING FALLBACK ────────────────────────────────────────────
  // Supabase realtime postgres_changes requires REPLICA IDENTITY FULL + publication
  // to deliver to ALL subscribers. This poll every 4s is the safety net so members
  // always see status changes (checkout → payment, who paid, order placed) even if
  // realtime doesn't fire for them.
  useEffect(() => {
    if (!activeGroup?.id) return;
    if (activeGroup.status === "placed" || activeGroup.status === "cancelled") return;
    const gid = activeGroup.id;
    const iv = setInterval(async () => {
      const [grpRes, memsRes, itemsRes] = await Promise.all([
        supabase.from("group_orders").select("*").eq("id", gid).maybeSingle(),
        supabase.from("group_order_members").select("*").eq("group_order_id", gid),
        supabase.from("group_order_items").select("*").eq("group_order_id", gid),
      ]);
      if (grpRes.data) setActiveGroup(prev => {
        if (!prev || JSON.stringify(prev) === JSON.stringify(grpRes.data)) return prev;
        return grpRes.data;
      });
      if (memsRes.data) setGroupMembers(memsRes.data);
      if (itemsRes.data) setGroupItems(itemsRes.data);
    }, 4000);
    return () => clearInterval(iv);
  }, [activeGroup?.id, activeGroup?.status]);

  const playOrderAlert = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, ok });
    toastTimerRef.current = setTimeout(() => { setToast(null); toastTimerRef.current = null; }, 3200);
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
      supabase.from("predictions").select("*").then(r => r.data || []).catch(() => []),
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
    setPage("app");
    toast$(`Welcome back, ${profile.name}! ⚽`);
  };

  const doLogout = async () => {
    // Cancel/leave any active group order before signing out
    if (activeGroup) {
      if (activeGroup.host_user_id === user?.id) {
        // Only cancel if not already placed — don't destroy a completed order
        if (activeGroup.status !== "placed") {
          await supabase.from("group_orders").update({ status: "cancelled" }).eq("id", activeGroup.id);
        }
      } else {
        // Unassign anyone who was counting on this user to pay for them
        await supabase.from("group_order_members")
          .update({ pay_for_user_id: null, payment_status: "pending" })
          .eq("group_order_id", activeGroup.id).eq("pay_for_user_id", user.id);
        await supabase.from("group_order_members").delete().eq("group_order_id", activeGroup.id).eq("user_id", user.id);
      }
      setActiveGroup(null); setGroupMembers([]); setGroupItems([]);
    }
    await supabase.auth.signOut();
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
      if (error) { toast$("Error saving prediction", false); return; }
      const k = `${user.id}__${id}`;
      setPreds(p => ({ ...p, [k]: { h:+h, a:+a } }));
      toast$("Prediction saved ⚽");
      try { navigator.vibrate?.([60, 30, 60]); } catch {}
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

  const pts = useCallback((uid) =>
    matches.filter(m => m.status === "finished").reduce((acc, m) => {
      const p = preds[`${uid}__${m.id}`];
      return acc + calcPts(p, m.hs, m.as);
    }, 0), [matches, preds]);

  const board = Object.values(users)
    .filter(u => u.is_admin !== true && u.is_admin !== 1 && u.is_admin !== "true")
    .map(u => ({ ...u, pts: pts(u.id) }))
    .sort((a, b) => b.pts - a.pts).slice(0, 10);

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

  // ── PASSPORT STAMP AWARDING ──────────────────────────────────────────────
  // One stamp per live WC match — earned when you place an order during the match
  const checkAndAwardStamps = async () => {
    if (!user) return;
    const now = Date.now();
    // Find all matches happening TODAY (same calendar day as kickoff)
    const today = new Date(now);
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    const liveMatches = matches.filter(m => {
      const ko = matchKickoff(m);
      if (!ko) return false;
      const koStr = `${ko.getFullYear()}-${String(ko.getMonth()+1).padStart(2,"0")}-${String(ko.getDate()).padStart(2,"0")}`;
      return koStr === todayStr;
    });
    let stampsAdded = 0;
    for (const lm of liveMatches) {
      // Skip if already earned for this match
      if (passportStamps.some(s => s.match_id === lm.id)) continue;
      try {
        const { data } = await supabase.from("passport_stamps").insert({
          user_id: user.id, stamp_type: "match_day", match_id: lm.id,
        }).select().maybeSingle();
        if (data) {
          setPassportStamps(prev => [...prev, data]);
          stampsAdded++;
        }
      } catch (e) { /* duplicate = ignore */ }
    }
    // ── PASSPORT COMPLETION SIGNAL ──
    // If user just earned their final stamp (reached matches.length total), insert a
    // passport_completions row. This is a SIGNAL only — no gift, no push. The admin
    // sees this in their panel and manually prepares + sends the gift.
    if (stampsAdded > 0 && matches.length > 0) {
      const newTotal = passportStamps.length + stampsAdded;
      if (newTotal >= matches.length) {
        try {
          // Avoid duplicate inserts (table has a UNIQUE constraint on user_id anyway)
          const { data: existing } = await supabase.from("passport_completions")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (!existing) {
            const { data: pcRow } = await supabase.from("passport_completions").insert({
              user_id: user.id,
            }).select().maybeSingle();
            if (pcRow) setPassportCompletion(pcRow);
            toast$("🏆 Passport complete! Your gift is being prepared by El Mundo");
            try { navigator.vibrate?.([100, 50, 100, 50, 200]); } catch {}
          }
        } catch (e) { /* ignore */ }
      }
    }
  };

  const VALID_PAYMENT_METHODS = ["credits", "cash", "card_pending", "sponsor_gift", "gift"];
  const placeOrder = async ({ tableNumber, items, total, paymentMethod }) => {
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      toast$("Invalid payment method", false); return false;
    }
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
      const { data: newOrd, error } = await supabase.from("orders").insert({
        user_id: user.id, user_name: user.name, table_number: tableNumber,
        items, total, payment_method: paymentMethod, status: "completed",
      }).select().single();
      if (error) {
        // Order failed after credits deducted — refund automatically
        const { data: refundBal } = await supabase.rpc("add_credits", { p_user_id: user.id, p_amount: total });
        if (refundBal != null) setMyCredits(refundBal);
        toast$("Error placing order — credits refunded", false); return false;
      }
    } else {
      const { data: newOrd, error } = await supabase.from("orders").insert({
        user_id: user.id, user_name: user.name, table_number: tableNumber,
        items, total, payment_method: paymentMethod, status: "completed",
      }).select().single();
      if (error) { toast$("Error placing order", false); return false; }
    }
    toast$("Order placed! 🍺 The bar will prepare it shortly.");
    try { navigator.vibrate?.([80, 40, 80, 40, 120]); } catch {}
    // Award passport stamps in background
    checkAndAwardStamps().catch(() => {});
    return true;
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
        tier: g.tier, item_name: g.item_name, item_price: +(g.item_price || 0), quantity: +(g.quantity || 1)
      })));
    }
    const { data } = await supabase.from("sponsor_gifts").select("*").order("tier");
    if (data) setSponsorGifts(data);
    toast$("Sponsor gifts saved ✓");
  };

  const adminAddCredits = async (userId, amount, userName) => {
    if (!amount || +amount <= 0) { toast$("Enter a valid amount", false); return; }
    const { data: cur } = await supabase.from("user_credits").select("balance").eq("user_id", userId).maybeSingle();
    const newBal = +((cur?.balance || 0) + amount).toFixed(2);
    const { error: upsertErr } = await supabase.from("user_credits").upsert({ user_id: userId, balance: newBal, updated_at: new Date().toISOString() });
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
        <div class="sub">WORLD CUP 2026 · BONAIRE</div>
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

  // ── Epson ePOS direct cut — sends ESC/POS cut via printer's built-in API ──
  const sendCut = () => { new Image().src = 'http://localhost:9200/cut?' + Date.now(); };
  const CUT_DELAY = 1500;

  // ── Silent print via hidden iframe — no new tab, no preview ──────────────
  const silentPrint = (html, afterPrint) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;border:none;left:-9999px;top:-9999px;";
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    setTimeout(() => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch(e) {}
      setTimeout(() => { afterPrint?.(); try { document.body.removeChild(iframe); } catch(e) {} }, CUT_DELAY);
    }, 400);
  };

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
      <div class="event">WORLD CUP EVENT 2026</div>
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
      <div class="wc">⚽ WORLD CUP 2026 ⚽</div>
      <div class="url">www.elmundobonaire.com</div>
    </div>
    <div style="height:20mm"></div>
    </div></body></html>`, sendCut);
  };

  const createGroupOrder = async (tableNumber) => {
    // Check if another active group order already holds this table
    const { data: conflict } = await supabase.from("group_orders")
      .select("id").eq("table_number", String(tableNumber))
      .in("status", ["open", "awaiting_payment"]).maybeSingle();
    if (conflict) { toast$(`Table ${tableNumber} already has an active group order`, false); return; }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data, error } = await supabase.from("group_orders")
      .insert({ code, table_number: tableNumber, host_user_id: user.id, status: "open" })
      .select().single();
    if (error || !data) { toast$("Failed to create group order", false); return; }
    await supabase.from("group_order_members")
      .insert({ group_order_id: data.id, user_id: user.id, display_name: user.name, payment_status: "pending" });
    const { data: members } = await supabase.from("group_order_members").select("*").eq("group_order_id", data.id);
    setActiveGroup(data);
    setGroupMembers(members || []);
    setGroupItems([]);
  };

  const joinGroupOrder = async (code) => {
    const { data: order } = await supabase.from("group_orders").select("*")
      .eq("code", code.trim().toUpperCase()).eq("status", "open").maybeSingle();
    if (!order) { toast$("Group order not found or already closed", false); return false; }
    const { data: existing } = await supabase.from("group_order_members").select("id")
      .eq("group_order_id", order.id).eq("user_id", user.id).maybeSingle();
    if (!existing) {
      await supabase.from("group_order_members")
        .insert({ group_order_id: order.id, user_id: user.id, display_name: user.name, payment_status: "pending" });
    }
    const { data: members } = await supabase.from("group_order_members").select("*").eq("group_order_id", order.id);
    const { data: items } = await supabase.from("group_order_items").select("*").eq("group_order_id", order.id);
    setActiveGroup(order);
    setGroupMembers(members || []);
    setGroupItems(items || []);
    return true;
  };

  const leaveGroupOrder = async () => {
    if (!activeGroup) return;
    if (activeGroup.host_user_id === user.id) {
      // Only cancel if not already placed — don't destroy a completed order
      if (activeGroup.status !== "placed") {
        await supabase.from("group_orders").update({ status: "cancelled" }).eq("id", activeGroup.id);
      }
    } else {
      // Only modify DB data if order hasn't been placed yet — preserve history for placed orders
      if (activeGroup.status !== "placed") {
        // Unassign anyone who was counting on this user to pay for them
        await supabase.from("group_order_members")
          .update({ pay_for_user_id: null, payment_status: "pending" })
          .eq("group_order_id", activeGroup.id).eq("pay_for_user_id", user.id);
        await supabase.from("group_order_members").delete().eq("group_order_id", activeGroup.id).eq("user_id", user.id);
        await supabase.from("group_order_items").delete().eq("group_order_id", activeGroup.id).eq("added_by_user_id", user.id);
      }
    }
    setActiveGroup(null); setGroupMembers([]); setGroupItems([]);
  };

  const addGroupItem = async (item) => {
    if (!activeGroup) return;
    const existing = groupItems.find(i => i.added_by_user_id === user.id && i.item_id === item.id);
    if (existing) {
      const { data } = await supabase.from("group_order_items").update({ qty: existing.qty + 1 }).eq("id", existing.id).select().single();
      if (data) setGroupItems(prev => prev.map(i => i.id === data.id ? data : i));
    } else {
      const { data } = await supabase.from("group_order_items")
        .insert({ group_order_id: activeGroup.id, added_by_user_id: user.id, item_id: item.id, item_name: item.name, price: item.price, qty: 1 })
        .select().single();
      if (data) setGroupItems(prev => [...prev, data]);
    }
  };

  const removeGroupItem = async (groupItemId) => {
    const item = groupItems.find(i => i.id === groupItemId);
    if (!item) return;
    if (item.qty > 1) {
      const { data } = await supabase.from("group_order_items").update({ qty: item.qty - 1 }).eq("id", groupItemId).select().single();
      if (data) setGroupItems(prev => prev.map(i => i.id === data.id ? data : i));
    } else {
      await supabase.from("group_order_items").delete().eq("id", groupItemId);
      setGroupItems(prev => prev.filter(i => i.id !== groupItemId));
    }
  };

  const setGroupPaymentMode = async (mode) => {
    const { data } = await supabase.from("group_orders")
      .update({ status: "awaiting_payment", payment_mode: mode }).eq("id", activeGroup.id).select().single();
    if (data) setActiveGroup(data);
    // In individual mode, auto-mark anyone with $0 share as paid so they never block the order
    if (mode === "individual") {
      const zeroShareIds = groupMembers
        .filter(m => groupItems.filter(i => i.added_by_user_id === m.user_id).reduce((s, i) => s + i.price * i.qty, 0) === 0)
        .map(m => m.user_id);
      if (zeroShareIds.length > 0) {
        await supabase.from("group_order_members").update({ payment_status: "paid" })
          .eq("group_order_id", activeGroup.id).in("user_id", zeroShareIds);
        const { data: updated } = await supabase.from("group_order_members").select("*").eq("group_order_id", activeGroup.id);
        if (updated) setGroupMembers(updated);
      }
    }
  };

  const assignMyPaymentTo = async (targetUserId) => {
    await supabase.from("group_order_members")
      .update({ pay_for_user_id: targetUserId, payment_status: "assigned" })
      .eq("group_order_id", activeGroup.id).eq("user_id", user.id);
    const { data } = await supabase.from("group_order_members").select("*").eq("group_order_id", activeGroup.id);
    if (data) setGroupMembers(data);
  };

  const unassignMyPayment = async () => {
    await supabase.from("group_order_members")
      .update({ pay_for_user_id: null, payment_status: "pending" })
      .eq("group_order_id", activeGroup.id).eq("user_id", user.id);
    const { data } = await supabase.from("group_order_members").select("*").eq("group_order_id", activeGroup.id);
    if (data) setGroupMembers(data);
  };

  const checkAndPlaceGroupOrder = async (groupId) => {
    const { data: members } = await supabase.from("group_order_members").select("*").eq("group_order_id", groupId);
    if (!members?.every(m => m.payment_status === "paid")) return false;
    const { data: items } = await supabase.from("group_order_items").select("*").eq("group_order_id", groupId);
    const { data: order } = await supabase.from("group_orders").select("*").eq("id", groupId).maybeSingle();
    if (!items || !order) return false;
    // Guard against race condition: only place if still awaiting_payment (not already placed)
    if (order.status !== "awaiting_payment") {
      // Order was already placed by another member — just update local state so this user transitions too
      setActiveGroup(prev => prev ? { ...prev, status: order.status } : prev);
      return order.status === "placed";
    }
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const { data: hostProfile } = await supabase.from("profiles").select("name").eq("id", order.host_user_id).maybeSingle();
    const { error: orderError } = await supabase.from("orders").insert({
      user_id: order.host_user_id,
      user_name: hostProfile?.name || "Group Order",
      table_number: String(order.table_number),
      items: items.map(i => ({ id: i.item_id, name: i.item_name, price: i.price, qty: i.qty, category: i.category||"" })),
      total: +total.toFixed(2),
      payment_method: order.payment_mode === "host" ? "group_host" : "group_individual",
      status: "completed",
    });
    if (orderError) { toast$("Error placing group order — please contact staff", false); return false; }
    const { error: statusError } = await supabase.from("group_orders").update({ status: "placed" }).eq("id", groupId);
    if (statusError) { toast$("Order sent but status update failed — contact staff", false); return false; }
    // Immediately update local state — don't wait for realtime which can be slow
    setActiveGroup(prev => prev ? { ...prev, status: "placed" } : prev);
    return true;
  };

  const calcMyGroupShare = (uid, gMembers, gItems) => {
    const assignedToMe = gMembers.filter(m => m.pay_for_user_id === uid).map(m => m.user_id);
    const payingFor = [uid, ...assignedToMe];
    return +gItems.filter(i => payingFor.includes(i.added_by_user_id)).reduce((s, i) => s + i.price * i.qty, 0).toFixed(2);
  };

  const payGroupShareCredits = async () => {
    if (!activeGroup) return false;
    // Fetch fresh data from DB — don't rely on potentially stale React state
    const { data: freshMembers } = await supabase.from("group_order_members").select("*").eq("group_order_id", activeGroup.id);
    const { data: freshItems }   = await supabase.from("group_order_items").select("*").eq("group_order_id", activeGroup.id);
    const myShare = calcMyGroupShare(user.id, freshMembers || groupMembers, freshItems || groupItems);
    // Atomic credit deduction — DB lock prevents double-spend
    const { data: newBal, error: deductErr } = await supabase.rpc("deduct_credits", {
      p_user_id: user.id, p_amount: myShare
    });
    if (deductErr) {
      if (deductErr.message?.includes("insufficient_balance")) toast$("Not enough credits", false);
      else toast$("Payment error — please try again", false);
      return false;
    }
    setMyCredits(newBal);
    // Mark me and anyone assigned to me as paid
    const assignedToMe = (freshMembers || groupMembers).filter(m => m.pay_for_user_id === user.id).map(m => m.user_id);
    await supabase.from("group_order_members").update({ payment_status: "paid" })
      .eq("group_order_id", activeGroup.id).in("user_id", [user.id, ...assignedToMe]);
    const { data } = await supabase.from("group_order_members").select("*").eq("group_order_id", activeGroup.id);
    if (data) setGroupMembers(data);
    await checkAndPlaceGroupOrder(activeGroup.id);
    return true;
  };

  const hostPayAllCredits = async () => {
    if (!activeGroup) return false;
    const total = groupItems.reduce((s, i) => s + i.price * i.qty, 0);
    // Atomic credit deduction — DB lock prevents double-spend
    const { data: newBal, error: deductErr } = await supabase.rpc("deduct_credits", {
      p_user_id: user.id, p_amount: +total.toFixed(2)
    });
    if (deductErr) {
      if (deductErr.message?.includes("insufficient_balance")) toast$("Not enough credits", false);
      else toast$("Payment error — please try again", false);
      return false;
    }
    setMyCredits(newBal);
    await supabase.from("group_order_members").update({ payment_status: "paid" }).eq("group_order_id", activeGroup.id);
    const { data } = await supabase.from("group_order_members").select("*").eq("group_order_id", activeGroup.id);
    if (data) setGroupMembers(data);
    await checkAndPlaceGroupOrder(activeGroup.id);
    return true;
  };

  const resetGroupToLobby = async () => {
    if (!activeGroup) return;
    // Reset all members back to pending and clear any payment assignments
    await supabase.from("group_order_members")
      .update({ payment_status: "pending", pay_for_user_id: null })
      .eq("group_order_id", activeGroup.id);
    const { data } = await supabase.from("group_orders")
      .update({ status: "open", payment_mode: null })
      .eq("id", activeGroup.id)
      .select()
      .single();
    if (data) setActiveGroup(data);
    const { data: mems } = await supabase.from("group_order_members").select("*").eq("group_order_id", activeGroup.id);
    if (mems) setGroupMembers(mems);
  };

  return (
    <LangContext.Provider value={{ lang, t, toggleLang }}>
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
      {toast && (
        <div className={`notification ${toast.ok ? "notif-ok" : "notif-err"}`}>
          <span className="notif-dot">{toast.ok ? "✓" : "!"}</span>
          <span className="notif-msg">{toast.msg}</span>
        </div>
      )}
      {page === "loading" && <div style={{position:"fixed",inset:0,background:"#000",zIndex:999}} />}
      {page === "auth"   && (
        <Auth tab={authTab} setTab={setAuthTab} form={form} setForm={setForm}
              err={formErr} setErr={setFormErr} onLogin={doLogin} onRegister={doRegister}
              publicBoard={publicBoard} appSettings={appSettings} />
      )}
      {page === "app" && (
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
          activeGroup={activeGroup} groupMembers={groupMembers} groupItems={groupItems}
          createGroupOrder={createGroupOrder} joinGroupOrder={joinGroupOrder} leaveGroupOrder={leaveGroupOrder}
          addGroupItem={addGroupItem} removeGroupItem={removeGroupItem}
          setGroupPaymentMode={setGroupPaymentMode} assignMyPaymentTo={assignMyPaymentTo} unassignMyPayment={unassignMyPayment}
          payGroupShareCredits={payGroupShareCredits} hostPayAllCredits={hostPayAllCredits}
          calcMyGroupShare={calcMyGroupShare}
          resetGroupToLobby={resetGroupToLobby}
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
          showPassport={showPassport} setShowPassport={setShowPassport}
          passportStamps={passportStamps}
          gifts={gifts}
          showGifts={showGifts} setShowGifts={setShowGifts}
          passportCompletion={passportCompletion}
          pendingGiftItems={pendingGiftItems} setPendingGiftItems={setPendingGiftItems}
          sendNotif={sendNotif}
          sendPush={sendPush}
        />
      )}
    </div>
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
  const [showTV,  setShowTV]  = useState(false);
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

  if (showTV) return <TVLeaderboard board={publicBoard} onBack={() => setShowTV(false)} />;

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

function TVLeaderboard({ board, onBack }) {
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

  return (
    <div className="tv-root">
      <TVParticles />
      <div className="tv-vignette" />
      <button className="tv-back-btn" onClick={onBack}>← BACK TO LOGIN</button>

      <div className="tv-header">
        <Logo w={72} />
        <div className="tv-header-text">
          <div className="tv-title">WORLD CUP 2026</div>
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
                activeGroup, groupMembers, groupItems,
                createGroupOrder, joinGroupOrder, leaveGroupOrder,
                addGroupItem, removeGroupItem,
                setGroupPaymentMode, assignMyPaymentTo, unassignMyPayment,
                payGroupShareCredits, hostPayAllCredits,
                calcMyGroupShare,
                resetGroupToLobby, printOrderReceipt, stripeCheckout, onToast,
                sponsorGifts, adminSetSponsorTier, adminSaveSponsorGifts, adminBanUsers = () => {}, adminSetFloorplanAccess = () => {}, adminSetKeepupsAccess = () => {},
                appSettings = { showMatches:true, showLeaderboard:true, showMundogram:true, showMenu:true, noEventMode:false }, onSaveAppSettings = () => {},
                newOrderAlert = false, setNewOrderAlert,
                showWinner = false, setShowWinner, winnerData, setWinnerData,
                showPassport = false, setShowPassport, passportStamps = [],
                gifts = [], showGifts = false, setShowGifts = () => {},
                passportCompletion = null,
                pendingGiftItems = [], setPendingGiftItems = () => {},
                qrTable = "", sendNotif = () => {}, sendPush = () => {} }) {
  const { t, lang, toggleLang } = useLang();
  const myPts  = pts(user.id);
  const myRank = board.findIndex(u => u.id === user.id) + 1;
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

  const printOutdoorReceipt = (ord, zone) => {
    const now = new Date(ord.created_at || new Date());
    const timeStr = now.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    const itemRows = (ord.items || []).map(it =>
      `<div class="row"><span class="qty">${it.qty}×</span><span class="name">${it.name.toUpperCase()}</span><span class="price">$${(it.price*it.qty).toFixed(2)}</span></div>`
    ).join("");
    silentPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Outdoor Order</title>
<style>
@page{size:80mm auto;margin:0}*{margin:0;padding:0;box-sizing:border-box}html,body{width:80mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:'Arial Black',Arial,sans-serif;background:#fff;color:#000}
.zone-hdr{text-align:center;padding:14px 0 10px;border-bottom:3px solid #000;margin-bottom:6px}
.zone-name{font-size:36px;font-weight:900;letter-spacing:8px;color:#000;line-height:1}
.zone-label{font-size:10px;font-weight:900;letter-spacing:4px;color:#555;margin-top:4px}
.brand{text-align:center;padding:8px 0 6px;border-bottom:2px solid #000}
.brand-name{font-size:20px;font-weight:900;letter-spacing:5px}
.brand-sub{font-size:9px;font-weight:900;letter-spacing:3px;margin-top:3px;opacity:.55}
.items{padding:8px 10px}
.row{display:flex;align-items:baseline;padding:6px 0;border-bottom:1px dashed #ccc;gap:4px}
.qty{font-size:16px;font-weight:900;min-width:24px;opacity:.5}
.name{font-size:15px;font-weight:800;flex:1}
.price{font-size:14px;font-weight:900;white-space:nowrap}
.total{display:flex;justify-content:space-between;padding:10px 10px 6px;border-top:3px solid #000;margin-top:4px}
.total-lbl{font-size:20px;font-weight:900}
.total-amt{font-size:20px;font-weight:900}
.footer{text-align:center;padding:8px 0 10px;font-size:10px;font-weight:700;opacity:.5}
.time{text-align:center;font-size:11px;font-weight:700;padding:4px 0;border-top:1px dashed #ccc;opacity:.6}
<\/style></head><body>
<div class="zone-hdr">
  <div class="zone-name">${zone.name}</div>
  <div class="zone-label">OUTDOOR ZONE</div>
</div>
<div class="brand"><div class="brand-name">EL MUNDO</div><div class="brand-sub">OUTDOOR BAR · BONAIRE</div></div>
<div class="items">${itemRows}</div>
<div class="total"><span class="total-lbl">TOTAL</span><span class="total-amt">$${(+ord.total).toFixed(2)}</span></div>
<div class="time">${timeStr}</div>
<div class="footer">www.elmundobonaire.com</div>
<div style="height:20mm"></div>
</body></html>`, sendCut);
  };

  // Load outdoor zones from the floor plan layout (staff-editable in Plan 2)
  // Falls back to defaults if no floor plan saved yet
  const loadOutdoorZones = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("em_fp_p2") || "null");
      if (Array.isArray(saved) && saved.length > 0) {
        return saved.map(z => ({ id: z.id, name: `ZONE ${z.id}`, color: z.color || "#f1f5f9", bg: `${z.color || "#f1f5f9"}22` }));
      }
    } catch {}
    return [
      { id:1, name:"ZONE 1", color:"#ef4444", bg:"rgba(239,68,68,.15)"   },
      { id:2, name:"ZONE 2", color:"#f97316", bg:"rgba(249,115,22,.15)"  },
      { id:3, name:"ZONE 3", color:"#eab308", bg:"rgba(234,179,8,.15)"   },
      { id:4, name:"ZONE 4", color:"#22c55e", bg:"rgba(34,197,94,.15)"   },
      { id:5, name:"ZONE 5", color:"#14b8a6", bg:"rgba(20,184,166,.15)"  },
      { id:6, name:"ZONE 6", color:"#3b82f6", bg:"rgba(59,130,246,.15)"  },
      { id:7, name:"ZONE 7", color:"#a855f7", bg:"rgba(168,85,247,.15)"  },
      { id:8, name:"ZONE 8", color:"#ec4899", bg:"rgba(236,72,153,.15)"  },
      { id:9, name:"ZONE 9", color:"#f1f5f9", bg:"rgba(241,245,249,.08)" },
    ];
  };
  const OUTDOOR_ZONES = loadOutdoorZones();
  const [isOutside,          setIsOutside]          = useState(null); // null | true | false
  const [outdoorZone,        setOutdoorZone]        = useState(null); // zone object | null
  const [showLocationModal,  setShowLocationModal]  = useState(false);
  const [showZonePicker,     setShowZonePicker]     = useState(false);

  const switchTab = (id) => {
    setAnimKey(id); setAppTab(id);
    if (id === "floorplan" && setNewOrderAlert) setNewOrderAlert(false);
    if (id === "menu" && isOutside === null) setShowLocationModal(true);
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
      <header className="hdr" style={appTab === "moments" ? {display:"none"} : undefined}>
        <div className="hdr-inner">
          <div className="hdr-l">
            <button className="hdr-logo-btn" onClick={() => switchTab("matches")} title="Go to Matches">
              <Logo w={72} />
            </button>
          </div>
          <div className="hdr-r">
            {!isAdmin && myRank > 0 && (
              <div className="hdr-badge">
                <span className="hdr-badge-pts">{myPts}</span>
                <div className="hdr-badge-meta">
                  <span className="hdr-badge-label">PTS</span>
                  <span className="hdr-badge-rank">#{myRank}</span>
                </div>
              </div>
            )}
            {!isAdmin && myRank === 0 && (
              <div className="hdr-badge">
                <span className="hdr-badge-pts">0</span>
                <span className="hdr-badge-label">PTS</span>
              </div>
            )}
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
          {appTab === "matches" && <ErrorBoundary name="matches"><MatchesView matches={matches} getPred={getPred} savePred={savePred} loaded={matchesLoaded} isBanned={!!user?.is_banned} allPreds={preds} user={user} /></ErrorBoundary>}
          {appTab === "moments" && <ErrorBoundary name="moments"><MomentsView user={user} isAdmin={isAdmin} users={users} preds={preds} matches={matches} pts={pts} appSettings={appSettings} sendNotif={sendNotif} sendPush={sendPush} /></ErrorBoundary>}
          {appTab === "leaderboard" && <ErrorBoundary name="leaderboard"><LeaderView board={board} user={user} allUsers={Object.values(users)} matches={matches} preds={preds} /></ErrorBoundary>}
          {appTab === "menu" && <ErrorBoundary name="menu"><MenuView user={user} menuItems={menuItems} myCredits={myCredits} myOrders={myOrders} onPlaceOrder={placeOrder}
            onCancelOrder={cancelOrder}
            activeGroup={activeGroup} groupMembers={groupMembers} groupItems={groupItems}
            createGroupOrder={createGroupOrder} joinGroupOrder={joinGroupOrder} leaveGroupOrder={leaveGroupOrder}
            addGroupItem={addGroupItem} removeGroupItem={removeGroupItem}
            setGroupPaymentMode={setGroupPaymentMode} assignMyPaymentTo={assignMyPaymentTo} unassignMyPayment={unassignMyPayment}
            payGroupShareCredits={payGroupShareCredits} hostPayAllCredits={hostPayAllCredits}
            calcMyGroupShare={calcMyGroupShare}
            resetGroupToLobby={resetGroupToLobby}
            printOrderReceipt={printOrderReceipt}
            stripeCheckout={stripeCheckout}
            onToast={onToast}
            qrTable={qrTable}
            gifts={gifts.filter(g => (g.type === "drink_food" || g.type === "item") && !g.redeemed)}
            pendingGiftItems={pendingGiftItems}
            onClearPendingGifts={() => setPendingGiftItems([])}
            isOutside={isOutside} outdoorZone={outdoorZone}
            onChangeLocation={()=>{ setShowLocationModal(true); }}
            onChangeZone={()=>{ setShowZonePicker(true); }}
            outdoorZones={OUTDOOR_ZONES}
            printOutdoorReceipt={printOutdoorReceipt}
            setMyCredits={setMyCredits}
          /></ErrorBoundary>}
          {appTab === "rules" && <ErrorBoundary name="rules"><RulesView rules={rules} /></ErrorBoundary>}
          {appTab === "profile" && <ErrorBoundary name="profile"><ProfileView user={user} myPts={myPts} myRank={myRank} preds={preds} matches={matches} sponsors={sponsors} onAvatarUpdate={(url) => setUser(u => ({...u, avatar_url: url}))} passportStamps={passportStamps} onOpenPassport={() => setShowPassport(true)} gifts={gifts} onOpenGifts={() => setShowGifts(true)} /></ErrorBoundary>}
          {appTab === "vip" && user?.sponsor_tier && (
            <ErrorBoundary name="vip"><SponsorView user={user} sponsorGifts={sponsorGifts} placeOrder={placeOrder} onToast={onToast} /></ErrorBoundary>
          )}
          {appTab === "floorplan" && user?.floorplan_access && (
            <ErrorBoundary name="floorplan"><FloorPlan allOrders={allOrders} onLoad={loadAllOrders} onUpdateStatus={updateOrderStatus} onDeleteOrder={deleteOrder} onToast={onToast} /></ErrorBoundary>
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
          {showPassport && (
            <PassportView
              user={user}
              stamps={passportStamps}
              matches={matches}
              onClose={() => setShowPassport(false)}
            />
          )}
          {showGifts && (
            <MyGiftsView
              user={user}
              gifts={gifts}
              passportCompletion={passportCompletion}
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

      {/* ── LOCATION MODAL ─────────────────────────────────────────────────── */}
      {showLocationModal && (
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.92)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#111",border:"1px solid rgba(255,255,255,.1)",borderRadius:20,padding:28,width:"100%",maxWidth:360,textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>📍</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:22,letterSpacing:3,color:"#fff",marginBottom:8}}>WHERE ARE YOU?</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.4)",marginBottom:28}}>Choose your location to order</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <button onClick={()=>{ setIsOutside(false); setOutdoorZone(null); setShowLocationModal(false); }}
                style={{padding:"18px",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,fontFamily:"'Anton',sans-serif",fontSize:16,letterSpacing:2,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
                🏠 <span>INSIDE</span>
              </button>
              <button onClick={()=>{ setIsOutside(true); setShowLocationModal(false); setShowZonePicker(true); }}
                style={{padding:"18px",background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.3)",borderRadius:12,fontFamily:"'Anton',sans-serif",fontSize:16,letterSpacing:2,color:"#4ade80",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
                🌴 <span>OUTSIDE</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ZONE PICKER MODAL ───────────────────────────────────────────────── */}
      {showZonePicker && (
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.92)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}}>
          <div style={{background:"#111",border:"1px solid rgba(255,255,255,.1)",borderRadius:20,padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:18,letterSpacing:3,color:"#fff",marginBottom:6,textAlign:"center"}}>🌴 WHICH ZONE?</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.4)",marginBottom:20,textAlign:"center"}}>Pick the color of your zone area</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
              {OUTDOOR_ZONES.map(z => (
                <button key={z.id} onClick={()=>{ setOutdoorZone(z); setShowZonePicker(false); }}
                  style={{padding:"18px 8px",background:z.bg,border:`2px solid ${z.color}`,borderRadius:12,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8,transition:"transform .15s",fontFamily:"'Anton',sans-serif"}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:z.color,boxShadow:`0 0 12px ${z.color}`}}/>
                  <span style={{fontSize:11,letterSpacing:2,color:z.color}}>{z.name}</span>
                </button>
              ))}
            </div>
            <button onClick={()=>{ setShowZonePicker(false); setIsOutside(false); setShowLocationModal(false); }}
              style={{width:"100%",padding:"12px",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.4)",cursor:"pointer"}}>
              ← Go inside instead
            </button>
          </div>
        </div>
      )}

      <nav className="bot-nav">
        <div className="bot-nav-inner">
          {tabs.map(({ id, label, ico }) => (
            <button key={id} className={`bnav-btn ${appTab===id?"bnav-on":""}`} onClick={()=>switchTab(id)}>
              <span className="bnav-ico" style={{position:"relative"}}>
                {ico}
                {id==="floorplan" && newOrderAlert && (
                  <span style={{position:"absolute",top:-2,right:-4,width:8,height:8,background:"#ef4444",borderRadius:"50%",display:"block",boxShadow:"0 0 6px #ef4444"}}/>
                )}
              </span>
              <span className="bnav-lbl">{label}</span>
              {appTab===id && <span className="bnav-indicator"/>}
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

/* ═══ MATCH PULSE — Live prediction stats when a match is on ══════════════ */
function MatchPulse({ matches, allPreds }) {
  const [now, setNow] = useState(Date.now());
  const [elapsedPulse, setElapsedPulse] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setElapsedPulse(p => p + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Show pulse from 60 min before kickoff through 90 min after
  const liveMatches = matches.filter(m => {
    const ko = matchKickoff(m);
    if (!ko) return false;
    const koMs = ko.getTime();
    return now >= koMs - 60 * 60 * 1000 && now <= koMs + 90 * 60 * 1000 && m.status === "upcoming";
  });

  if (liveMatches.length === 0) return null;

  return (
    <div className="pulse-wrap">
      {liveMatches.map(m => {
        const ko = matchKickoff(m);
        const koMs = ko ? ko.getTime() : 0;
        const isPreKickoff = now < koMs;
        const minsUntil = isPreKickoff ? Math.ceil((koMs - now) / 60000) : 0;
        const elapsed = !isPreKickoff && ko ? Math.floor((now - koMs) / 60000) : 0;
        const half = elapsed <= 45 ? 1 : 2;
        const minute = elapsed <= 45 ? elapsed : elapsed - 15; // 15min halftime

        // Gather all predictions for this match
        const predsForMatch = Object.entries(allPreds).filter(([k]) => k.endsWith(`__${m.id}`));
        const total = predsForMatch.length;
        let homeW = 0, draw = 0, awayW = 0;
        predsForMatch.forEach(([, p]) => {
          if (p.h > p.a) homeW++;
          else if (p.h === p.a) draw++;
          else awayW++;
        });
        const homePct = total > 0 ? Math.round(homeW / total * 100) : 0;
        const drawPct = total > 0 ? Math.round(draw / total * 100) : 0;
        const awayPct = total > 0 ? 100 - homePct - drawPct : 0;

        // Most popular exact score
        const scoreCounts = {};
        predsForMatch.forEach(([, p]) => {
          const key = `${p.h}-${p.a}`;
          scoreCounts[key] = (scoreCounts[key] || 0) + 1;
        });
        const topScore = Object.entries(scoreCounts).sort((a, b) => b[1] - a[1])[0];

        return (
          <div key={m.id} className="pulse-card">
            {/* Animated background rings */}
            <div className="pulse-ring"/>
            <div className="pulse-ring pulse-ring-2"/>

            {/* Header: pre-kickoff or LIVE */}
            <div className="pulse-header">
              <div className="pulse-live">
                <span className="pulse-live-dot" style={isPreKickoff ? {background:"#fbbf24",boxShadow:"0 0 8px #fbbf24"} : {}}/>
                <span className="pulse-live-text" style={isPreKickoff ? {color:"#fbbf24"} : {}}>{isPreKickoff ? "SOON" : "LIVE"}</span>
              </div>
              <span className="pulse-live-min">
                {isPreKickoff ? `in ${minsUntil}m` : minute > 0 ? `${minute}'` : "KICK OFF"}
              </span>
            </div>

            {/* Teams row */}
            <div className="pulse-teams">
              <div className="pulse-team">
                <span className="pulse-flag">{flag(m.home)}</span>
                <span className="pulse-tname">{m.home}</span>
              </div>
              <div className="pulse-vs">VS</div>
              <div className="pulse-team">
                <span className="pulse-flag">{flag(m.away)}</span>
                <span className="pulse-tname">{m.away}</span>
              </div>
            </div>

            {/* Prediction distribution bar */}
            {total > 0 && (
              <div className="pulse-dist">
                <div className="pulse-dist-header">
                  <span className="pulse-dist-label">COMMUNITY PREDICTIONS</span>
                  <span className="pulse-dist-total">{total} prediction{total !== 1 ? "s" : ""}</span>
                </div>
                <div className="pulse-bar">
                  <div className="pulse-bar-home" style={{ width: `${Math.max(homePct, 5)}%` }}>
                    {homePct > 15 && <span>{homePct}%</span>}
                  </div>
                  <div className="pulse-bar-draw" style={{ width: `${Math.max(drawPct, 5)}%` }}>
                    {drawPct > 15 && <span>{drawPct}%</span>}
                  </div>
                  <div className="pulse-bar-away" style={{ width: `${Math.max(awayPct, 5)}%` }}>
                    {awayPct > 15 && <span>{awayPct}%</span>}
                  </div>
                </div>
                <div className="pulse-bar-legend">
                  <span className="pulse-leg"><span className="pulse-leg-dot" style={{background:"#4ade80"}}/>{m.home} {homePct}%</span>
                  <span className="pulse-leg"><span className="pulse-leg-dot" style={{background:"#94a3b8"}}/>DRAW {drawPct}%</span>
                  <span className="pulse-leg"><span className="pulse-leg-dot" style={{background:"#f87171"}}/>{m.away} {awayPct}%</span>
                </div>
              </div>
            )}

            {/* Most predicted score — inline */}
            {topScore && total > 0 && (
              <div className="pulse-top-score">
                <span className="pulse-top-icon">🎯</span>
                <span className="pulse-top-text">Most predicted: <strong>{topScore[0]}</strong> by {topScore[1]} player{topScore[1]!==1?"s":""}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MatchesView({ matches, getPred, savePred, loaded, isBanned, allPreds, user }) {
  const upcoming = sortMatches(matches.filter(m => m.status === "upcoming"));
  const finished = sortMatches(matches.filter(m => m.status === "finished"));

  const [matchTab, setMatchTab] = useState("upcoming");

  // Date filter
  const allDates = [...new Set(sortMatches(matches).map(m => m.date).filter(Boolean))];
  const [selDate, setSelDate] = useState("all");
  const [nowTs,   setNowTs]   = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  const filterMatches = arr => selDate === "all" ? arr : arr.filter(m => m.date === selDate);
  const visUpcoming = filterMatches(upcoming);
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

      {/* ── Match Pulse — live prediction stats ── */}
      <MatchPulse matches={matches} allPreds={allPreds} />

      {/* ── Upcoming / Results tabs ── */}
      <div className="match-tab-bar">
        <button
          className={`match-tab-btn ${matchTab === "upcoming" ? "match-tab-btn-on" : ""}`}
          onClick={() => setMatchTab("upcoming")}>
          <span className="match-tab-icon">⏱</span>
          <span>UPCOMING</span>
          {upcoming.length > 0 && <span className="match-tab-count">{upcoming.length}</span>}
        </button>
        <button
          className={`match-tab-btn ${matchTab === "results" ? "match-tab-btn-on" : ""}`}
          onClick={() => setMatchTab("results")}>
          <span className="match-tab-icon">🏁</span>
          <span>RESULTS</span>
          {finished.length > 0 && <span className="match-tab-count">{finished.length}</span>}
        </button>
      </div>

      {/* Date filter */}
      {allDates.length > 1 && (
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
        <div className="card-stack">
          {visUpcoming.length === 0 && <div className="empty">No upcoming matches{selDate!=="all"?` on ${selDate}`:""}</div>}
          {visUpcoming.map(m => <MatchCard key={m.id} m={m} pred={getPred(m.id)} onSave={savePred} globalLockTime={globalLockMs} isBanned={isBanned} allPreds={allPreds} user={user} />)}
        </div>
      )}

      {matchTab === "results" && (
        <div className="card-stack">
          {visFinished.length === 0 && <div className="empty">No results yet{selDate!=="all"?` on ${selDate}`:""}</div>}
          {visFinished.map(m => <MatchCard key={m.id} m={m} pred={getPred(m.id)} onSave={savePred} globalLockTime={globalLockMs} allPreds={allPreds} user={user} />)}
        </div>
      )}
    </div>
  );
}

function matchKickoff(m) {
  try {
    const year = (() => { try { return JSON.parse(localStorage.getItem("em_app_settings")||"{}").eventYear||2026; } catch { return 2026; } })();
    return new Date(`${m.date} ${year} ${m.time}:00 GMT-0400`);
  } catch { return null; }
}

// Single global lock = 1 hour before the very first match of the entire tournament
function getGlobalLockMs(matches) {
  const kickoffs = matches
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
                <span className="mom-hero-title-line1">WORLD CUP</span>
                <span className="mom-hero-title-line2">2026</span>
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

function PlayerProfileModal({ player, rank, matches, preds, onClose }) {
  const finishedMatches = matches.filter(m => m.status === "finished");
  const stats = finishedMatches.reduce((acc, m) => {
    const p = preds[`${player.id}__${m.id}`];
    if (!p) return acc;
    const score = calcPts(p, m.hs ?? m.home_score, m.as ?? m.away_score);
    acc.total++;
    if (score === 5) acc.exact++;
    return acc;
  }, { total: 0, exact: 0 });

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
  const filtered = board.filter(u => u.is_admin !== true && u.is_admin !== 1 && u.is_admin !== "true");
  const top3 = filtered.slice(0, 3);
  const rest = filtered.slice(3);
  const myRank = filtered.findIndex(u => u.id === user.id) + 1;
  const myEntry = filtered.find(u => u.id === user.id);
  const [profilePlayer, setProfilePlayer] = useState(null);
  const profileRank = profilePlayer ? filtered.findIndex(u => u.id === profilePlayer.id) + 1 : 0;

  return (
    <div className="lb-root">
      {profilePlayer && (
        <PlayerProfileModal
          player={profilePlayer}
          rank={profileRank}
          matches={matches}
          preds={preds}
          onClose={() => setProfilePlayer(null)}
        />
      )}

      {/* ── TOP 3 PODIUM ── */}
      {top3.length >= 3 && (
        <div className="lb-podium">
          {/* 2nd */}
          {top3[1] ? (
            <div className="lb-pod lb-pod-2" style={{cursor:"pointer"}} onClick={() => setProfilePlayer(top3[1])}>
              <div className="lb-pod-medal">🥈</div>
              <div className="lb-pod-name">{top3[1].name}</div>
              <div className="lb-pod-pts">{top3[1].pts}<span className="lb-pod-pts-u">pts</span></div>
              {top3[1].id === user.id && <div className="lb-pod-you">YOU</div>}
              <div className="lb-pod-plinth lb-pod-plinth-2" />
            </div>
          ) : <div className="lb-pod" />}

          {/* 1st — tallest */}
          <div className="lb-pod lb-pod-1" style={{cursor:"pointer"}} onClick={() => setProfilePlayer(top3[0])}>
            <div className="lb-pod-crown">👑</div>
            <div className="lb-pod-medal lb-pod-medal-1">🥇</div>
            <div className="lb-pod-name lb-pod-name-1">{top3[0].name}</div>
            <div className="lb-pod-pts lb-pod-pts-1">{top3[0].pts}<span className="lb-pod-pts-u">pts</span></div>
            {top3[0].id === user.id && <div className="lb-pod-you">YOU</div>}
            <div className="lb-pod-plinth lb-pod-plinth-1" />
          </div>

          {/* 3rd */}
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

      {/* ── REST OF TABLE ── */}
      {rest.length > 0 && (
        <div className="lb-table">
          <div className="lb-table-header">
            <span className="lb-th-rank">POS</span>
            <span className="lb-th-name">PLAYER</span>
            <span className="lb-th-pts">PTS</span>
          </div>
          {rest.map((u, i) => (
            <div key={u.id} className={`lb-row ${u.id===user.id?"lb-row-me":""}`} style={{cursor:"pointer"}} onClick={() => setProfilePlayer(u)}>
              <span className="lb-row-rank">#{i + 4}</span>
              <span className="lb-row-name">
                {u.name}
                {u.id===user.id && <span className="lb-you-tag">YOU</span>}
              </span>
              <span className="lb-row-pts">{u.pts}<span className="lb-row-pts-u"> pts</span></span>
            </div>
          ))}
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
  { id:"indebon",    name:"INDEBON",             sub:"Instituto Di Deporte Boneriano",        logo:"/logos/indebon2.jpg",   bg:"#fff" },
  { id:"haafkes",    name:"Haafkes",             sub:"Bouwondernemers · Nederland & Bonaire",  logo:"/logos/haafkes.png",    bg:"#fff" },
  { id:"wildkamp",   name:"Wildkamp",            sub:"",                                       logo:"/logos/wildkamp.png",   bg:"#fff" },
  { id:"koenderink", name:"Koenderink & Co",     sub:"Since 1971",                             logo:"/logos/koenderink.png", bg:"#fff" },
  { id:"vdm",        name:"VDM Bonaire",         sub:"",                                       logo:"/logos/vdm.png",        bg:"#fff" },
  { id:"tulum",      name:"Tulum Summer Wear",   sub:"Kralendijk",                             logo:"/logos/tulum.png",      bg:"#fff" },
  { id:"panadero",   name:"Panadero Trading",    sub:"",                                       logo:"/logos/panadero.png",   bg:"#fff" },
  { id:"tafelheer",  name:"De Tafelheer",        sub:"Horecabenodigdheden · Bonaire",          logo:"/logos/tafelheer.png",  bg:"#fff" },
  { id:"topdog",     name:"TopDog Food",         sub:"+599 786-1744",                          logo:"/logos/topdog.png",     bg:"#fff" },
  { id:"rmd",        name:"RMD",                 sub:"Advies en Ontwikkeling",                 logo:"/logos/rmd.jpg",        bg:"#fff" },
  { id:"wave",       name:"Wave & Wheels",       sub:"Watersports · Bike Rental · Clothing",   logo:"/logos/wafewheel.jpg",  bg:"#fff" },
  { id:"bon",        name:"BON Container",       sub:"Services & Storage BV",                  logo:"/logos/leon.jpg",       bg:"#fff" },
  { id:"changes",    name:"Changes",             sub:"",                                       logo:"/logos/indebon.jpg",    bg:"#fff" },
  { id:"winefactory",name:"The Wine Factory",    sub:"Wines & Spirits · Bonaire",              logo:"/logos/winefactory.jpg", bg:"#fff" },
];

function SponsorShowcase({ onClose }) {
  const [idx, setIdx]         = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const SLIDE_MS = 5000;

  const advance = (next) => {
    setLeaving(true);
    setTimeout(() => {
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
          PROUD SPONSOR · EL MUNDO WORLD CUP 2026
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
  const [showShowcase, setShowShowcase] = useState(false);
  return (
    <div style={{marginTop:16,paddingBottom:8}}>
      {showShowcase && <SponsorShowcase onClose={()=>setShowShowcase(false)}/>}
      {/* Header */}
      <div style={{padding:"24px 16px 0",textAlign:"center"}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:5,color:"rgba(255,255,255,.3)",marginBottom:10}}>
          WORLD CUP 2026 · EL MUNDO BONAIRE
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

/* ═══ EL MUNDO PASSPORT ════════════════════════════════════════════════════ */
// Ink colors rotate per stamp for visual variety
const STAMP_INKS = [
  { fg: "#1e40af", ring: "#3b82f6" },   // blue
  { fg: "#991b1b", ring: "#dc2626" },   // red
  { fg: "#166534", ring: "#22c55e" },   // green
  { fg: "#6b21a8", ring: "#0ea5e9" },   // purple
  { fg: "#92400e", ring: "#f59e0b" },   // amber
  { fg: "#0e7490", ring: "#06b6d4" },   // cyan
];

function PassportView({ user, stamps, matches = [], onClose }) {
  const [ppPage, setPpPage] = useState(0);

  const evLabel = getEventLabel();
  const joinDate = user.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

  // One match per page after identity + visa
  const sortedMatches = [...matches].sort((a, b) => {
    const ka = matchKickoff(a), kb = matchKickoff(b);
    return (ka?.getTime() || 0) - (kb?.getTime() || 0);
  });

  // page 0 = identity, page 1 = visa, page 2+ = one match each
  const totalPages = 2 + sortedMatches.length;
  const stampSet = new Set(stamps.map(s => s.match_id));
  const stampLookup = {};
  stamps.forEach(s => { stampLookup[s.match_id] = s; });

  // Pseudo-random rotation per match
  const rot = (id) => {
    let h = 0;
    for (let i = 0; i < (id || "").length; i++) h = ((h << 5) - h + (id || "").charCodeAt(i)) | 0;
    return (h % 13) - 6;
  };

  const visaNo = `EM-2026-${(user.id || "").slice(0, 8).toUpperCase()}`;

  /* ── Reusable paper watermark SVG ── */
  const PaperWatermark = () => (
    <svg className="pp-wm" viewBox="0 0 200 200" fill="none">
      <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="0.5"/>
      <ellipse cx="100" cy="100" rx="40" ry="80" stroke="currentColor" strokeWidth="0.4"/>
      <ellipse cx="100" cy="100" rx="65" ry="80" stroke="currentColor" strokeWidth="0.3"/>
      <line x1="20" y1="65" x2="180" y2="65" stroke="currentColor" strokeWidth="0.3"/>
      <line x1="20" y1="100" x2="180" y2="100" stroke="currentColor" strokeWidth="0.3"/>
      <line x1="20" y1="135" x2="180" y2="135" stroke="currentColor" strokeWidth="0.3"/>
    </svg>
  );

  // Stamp slam sound effect (Web Audio API — no files needed)
  const playStampSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Impact thud
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(80, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
      // Crisp snap
      const noise = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      noise.buffer = buf;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.15, ctx.currentTime);
      ng.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      noise.connect(ng); ng.connect(ctx.destination);
      noise.start(ctx.currentTime + 0.02);
      setTimeout(() => ctx.close(), 500);
    } catch {}
  }, []);

  // Play sound when navigating to an earned stamp page
  const prevPage = useRef(ppPage);
  useEffect(() => {
    if (ppPage !== prevPage.current && ppPage >= 2) {
      const m = sortedMatches[ppPage - 2];
      if (m && stampSet.has(m.id)) {
        setTimeout(playStampSound, 200);
      }
    }
    prevPage.current = ppPage;
  }, [ppPage, sortedMatches, stampSet, playStampSound]);

  // Get match for current stamp page
  const currentMatch = ppPage >= 2 ? sortedMatches[ppPage - 2] : null;
  const currentInk = currentMatch ? STAMP_INKS[(ppPage - 2) % STAMP_INKS.length] : null;
  const currentEarned = currentMatch ? stampSet.has(currentMatch.id) : false;
  const currentStampDate = currentMatch ? stampLookup[currentMatch.id]?.earned_at : null;

  return (
    <div className="pp-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pp-book">
        {/* Close button */}
        <button className="pp-close" onClick={onClose}>✕</button>

        {/* Book spine shadow */}
        <div className="pp-spine"/>

        {/* The page */}
        <div className="pp-page" key={ppPage}>
          <div className="pp-paper">
            <PaperWatermark/>

            {/* ════════ PAGE 0: IDENTITY ════════ */}
            {ppPage === 0 && (
              <div className="pp-id">
                <div className="pp-id-header">
                  <div className="pp-id-header-label">REPUBLICA DE EL MUNDO</div>
                  <div className="pp-id-header-country">PASSPORT / PASAPORTE</div>
                </div>
                <div className="pp-id-divider"/>
                <div className="pp-id-body">
                  <div className="pp-id-photo">
                    {user.avatar_url
                      ? <img src={user.avatar_url} className="pp-id-img" alt="" />
                      : <div className="pp-id-initial">{(user.name || "?")[0].toUpperCase()}</div>
                    }
                  </div>
                  <div className="pp-id-fields">
                    <div className="pp-id-row"><span className="pp-id-label">SURNAME / NOMBRE</span><span className="pp-id-value">{(user.name || "").toUpperCase()}</span></div>
                    <div className="pp-id-row"><span className="pp-id-label">PLAYER NO.</span><span className="pp-id-value">{user.player_number ? `#${user.player_number}` : "—"}</span></div>
                    <div className="pp-id-row"><span className="pp-id-label">DATE OF ISSUE</span><span className="pp-id-value">{joinDate}</span></div>
                    <div className="pp-id-row"><span className="pp-id-label">STAMPS COLLECTED</span><span className="pp-id-value">{stamps.length} / {matches.length}</span></div>
                  </div>
                </div>
                <div className="pp-id-footer">
                  <div className="pp-id-barcode">
                    {Array.from({ length: 32 }, (_, i) => (
                      <div key={i} className="pp-id-bar" style={{ width: [1, 2, 3, 1, 2, 1, 3][i % 7], opacity: 0.3 + (i % 3) * 0.2 }} />
                    ))}
                  </div>
                  <div className="pp-id-mrz">{`P<BES${(user.name || "").replace(/\s/g, "<").toUpperCase()}<<<<<<<<<<<<`.slice(0, 36)}</div>
                </div>
              </div>
            )}

            {/* ════════ PAGE 1: ENTRY VISA ════════ */}
            {ppPage === 1 && (
              <div className="pp-visa">
                <svg viewBox="0 0 300 400" className="pp-visa-svg">
                  {/* Ornamental double border */}
                  <rect x="8" y="8" width="284" height="384" rx="8" fill="none" stroke="#8b1a1a" strokeWidth="2" opacity=".45"/>
                  <rect x="14" y="14" width="272" height="372" rx="5" fill="none" stroke="#8b1a1a" strokeWidth=".6" strokeDasharray="4 2" opacity=".25"/>

                  {/* Header */}
                  <text x="150" y="42" textAnchor="middle" fontFamily="Anton" fontSize="9" letterSpacing="4" fill="#8b1a1a" opacity=".65">REPUBLICA DE EL MUNDO</text>
                  <line x1="45" y1="50" x2="255" y2="50" stroke="#8b1a1a" strokeWidth=".4" opacity=".18"/>

                  {/* ── El Mundo Logo Seal ── */}
                  <circle cx="150" cy="115" r="48" fill="none" stroke="#8b1a1a" strokeWidth="1.8" opacity=".5"/>
                  <circle cx="150" cy="115" r="43" fill="none" stroke="#8b1a1a" strokeWidth=".5" strokeDasharray="3 2" opacity=".25"/>
                  {Array.from({ length: 36 }, (_, i) => {
                    const a = (i * 10) * Math.PI / 180;
                    return <line key={i} x1={150 + 46 * Math.cos(a)} y1={115 + 46 * Math.sin(a)} x2={150 + 50 * Math.cos(a)} y2={115 + 50 * Math.sin(a)} stroke="#8b1a1a" strokeWidth=".7" opacity=".3"/>;
                  })}
                  {/* Globe inside seal */}
                  <circle cx="150" cy="115" r="24" fill="none" stroke="#8b1a1a" strokeWidth=".8" opacity=".4"/>
                  <ellipse cx="150" cy="115" rx="12" ry="24" fill="none" stroke="#8b1a1a" strokeWidth=".5" opacity=".3"/>
                  <ellipse cx="150" cy="115" rx="19" ry="24" fill="none" stroke="#8b1a1a" strokeWidth=".3" opacity=".2"/>
                  <line x1="126" y1="106" x2="174" y2="106" stroke="#8b1a1a" strokeWidth=".35" opacity=".2"/>
                  <line x1="126" y1="115" x2="174" y2="115" stroke="#8b1a1a" strokeWidth=".35" opacity=".2"/>
                  <line x1="126" y1="124" x2="174" y2="124" stroke="#8b1a1a" strokeWidth=".35" opacity=".2"/>
                  {/* Crossed fork & knife */}
                  <line x1="128" y1="85" x2="172" y2="145" stroke="#8b1a1a" strokeWidth="1" opacity=".1"/>
                  <line x1="172" y1="85" x2="128" y2="145" stroke="#8b1a1a" strokeWidth="1" opacity=".1"/>
                  {/* Arc text */}
                  <defs>
                    <path id="visaArcT" d="M 150,115 m -53,0 a 53,53 0 1,1 106,0"/>
                    <path id="visaArcB" d="M 150,115 m 53,0 a 53,53 0 1,1 -106,0"/>
                  </defs>
                  <text fill="#8b1a1a" fontFamily="Anton" fontSize="7" letterSpacing="3" opacity=".55">
                    <textPath href="#visaArcT" startOffset="6%">EL MUNDO BAR-REST</textPath>
                  </text>
                  <text fill="#8b1a1a" fontFamily="Anton" fontSize="6.5" letterSpacing="3" opacity=".45">
                    <textPath href="#visaArcB" startOffset="14%">★ BONAIRE ★</textPath>
                  </text>

                  {/* ── Visa fields ── */}
                  <text x="30" y="188" fontFamily="Outfit" fontSize="6" fill="#8b1a1a" opacity=".38" fontWeight="700" letterSpacing="1.5">TYPE / TIPO</text>
                  <text x="30" y="202" fontFamily="Anton" fontSize="12" fill="#8b1a1a" opacity=".6" letterSpacing="1">SINGLE ENTRY — SPORTS</text>

                  <text x="30" y="224" fontFamily="Outfit" fontSize="6" fill="#8b1a1a" opacity=".38" fontWeight="700" letterSpacing="1.5">VISA NO.</text>
                  <text x="30" y="238" fontFamily="'Courier New',monospace" fontSize="11" fill="#8b1a1a" opacity=".55">{visaNo}</text>

                  <text x="30" y="260" fontFamily="Outfit" fontSize="6" fill="#8b1a1a" opacity=".38" fontWeight="700" letterSpacing="1.5">DATE OF ENTRY / FECHA</text>
                  <text x="30" y="274" fontFamily="Anton" fontSize="11" fill="#8b1a1a" opacity=".55">{joinDate.toUpperCase()}</text>

                  <text x="180" y="260" fontFamily="Outfit" fontSize="6" fill="#8b1a1a" opacity=".38" fontWeight="700" letterSpacing="1.5">VALID FOR</text>
                  <text x="180" y="274" fontFamily="Anton" fontSize="11" fill="#8b1a1a" opacity=".55">{evLabel}</text>

                  <line x1="30" y1="284" x2="270" y2="284" stroke="#8b1a1a" strokeWidth=".4" opacity=".12"/>

                  <text x="30" y="300" fontFamily="Outfit" fontSize="6" fill="#8b1a1a" opacity=".38" fontWeight="700" letterSpacing="1.5">AUTHORIZED BY</text>
                  <text x="30" y="314" fontFamily="Anton" fontSize="9.5" fill="#8b1a1a" opacity=".45" letterSpacing="1">EL MUNDO IMMIGRATION OFFICE</text>

                  {/* APPROVED stamp */}
                  <g transform="rotate(-8, 150, 356)">
                    <rect x="65" y="336" width="170" height="34" rx="4" fill="none" stroke="#1a6b3c" strokeWidth="2.5" opacity=".45"/>
                    <text x="150" y="360" textAnchor="middle" fontFamily="Anton" fontSize="20" fill="#1a6b3c" letterSpacing="8" opacity=".5">APPROVED</text>
                  </g>
                </svg>
                <div className="pp-visa-foot">This visa grants the bearer access to all {evLabel} match screenings at El Mundo Bar-Restaurant, Bonaire.</div>
              </div>
            )}

            {/* ════════ PAGE 2+: ONE MATCH PER PAGE ════════ */}
            {ppPage >= 2 && currentMatch && (
              <div className="pp-stamp-page">
                <div className="pp-stamp-num">— {ppPage - 1} —</div>

                {/* Match info header */}
                <div className="pp-stamp-header">
                  <span className="pp-stamp-date">{currentMatch.date || "TBD"}</span>
                  <span className="pp-stamp-group">{currentMatch.group || ""}</span>
                </div>
                <div className="pp-stamp-teams">
                  {flag(currentMatch.home)} {currentMatch.home || "TBD"} <span className="pp-stamp-vs">VS</span> {currentMatch.away || "TBD"} {flag(currentMatch.away)}
                </div>

                {/* Big centered stamp area */}
                <div className="pp-stamp-area">
                  {currentEarned ? (
                    <div className="pp-ink" style={{ '--stamp-rot': `${rot(currentMatch.id)}deg` }}>
                      {/* Slam impact ring */}
                      <div className="pp-slam-ring" style={{ borderColor: currentInk.ring }}/>
                      <div className="pp-slam-ring pp-slam-ring-2" style={{ borderColor: currentInk.ring }}/>
                      {/* Ink splatter particles */}
                      {Array.from({ length: 8 }, (_, i) => (
                        <div key={i} className="pp-splat" style={{
                          '--splat-angle': `${i * 45}deg`,
                          '--splat-dist': `${110 + (i % 3) * 15}px`,
                          '--splat-size': `${3 + (i % 4)}px`,
                          background: currentInk.ring,
                        }}/>
                      ))}
                      <svg viewBox="0 0 280 280" className="pp-stamp-svg">
                        {/* Outer ring with ticks */}
                        <circle cx="140" cy="140" r="130" fill="none" stroke={currentInk.ring} strokeWidth="2.5" opacity=".5"/>
                        <circle cx="140" cy="140" r="124" fill="none" stroke={currentInk.ring} strokeWidth=".8" opacity=".3"/>
                        {Array.from({ length: 48 }, (_, k) => {
                          const a = (k * 7.5) * Math.PI / 180;
                          return <line key={k} x1={140 + 124 * Math.cos(a)} y1={140 + 124 * Math.sin(a)} x2={140 + 131 * Math.cos(a)} y2={140 + 131 * Math.sin(a)} stroke={currentInk.ring} strokeWidth="1" opacity=".35"/>;
                        })}
                        {/* Inner dashed ring */}
                        <circle cx="140" cy="140" r="108" fill="none" stroke={currentInk.ring} strokeWidth=".8" strokeDasharray="3 2.5" opacity=".2"/>

                        {/* Arc text */}
                        <defs>
                          <path id={`stT${ppPage}`} d="M 140,140 m -96,0 a 96,96 0 1,1 192,0"/>
                          <path id={`stB${ppPage}`} d="M 140,140 m 96,0 a 96,96 0 1,1 -192,0"/>
                        </defs>
                        <text fill={currentInk.ring} fontFamily="Anton" fontSize="12" letterSpacing="4" opacity=".7">
                          <textPath href={`#stT${ppPage}`} startOffset="5%">★ EL MUNDO BAR-REST · BONAIRE ★</textPath>
                        </text>
                        <text fill={currentInk.ring} fontFamily="Anton" fontSize="10" letterSpacing="3" opacity=".5">
                          <textPath href={`#stB${ppPage}`} startOffset="6%">WORLD CUP 2026 · MATCH DAY</textPath>
                        </text>

                        {/* Trophy icon */}
                        <g transform="translate(140, 86)" fill={currentInk.ring} opacity=".5">
                          <path d="M-8,-8 L8,-8 L6,3 Q5,8 0,11 Q-5,8 -6,3 Z"/>
                          <path d="M-8,-5 Q-13,-5 -13,0 Q-13,4 -9,2.5" fill="none" stroke={currentInk.ring} strokeWidth="1"/>
                          <path d="M8,-5 Q13,-5 13,0 Q13,4 9,2.5" fill="none" stroke={currentInk.ring} strokeWidth="1"/>
                          <rect x="-2.5" y="11" width="5" height="3" rx="1"/>
                          <rect x="-5" y="14" width="10" height="2.5" rx="1"/>
                        </g>

                        {/* Home team */}
                        <text x="140" y="122" textAnchor="middle" fill={currentInk.ring} fontFamily="Anton" fontSize="18" letterSpacing="2" opacity=".85">
                          {(currentMatch.home || "").toUpperCase()}
                        </text>

                        {/* Soccer ball divider */}
                        <circle cx="140" cy="140" r="7" fill="none" stroke={currentInk.ring} strokeWidth=".8" opacity=".3"/>
                        <circle cx="140" cy="140" r="2.5" fill={currentInk.ring} opacity=".2"/>
                        <line x1="110" y1="140" x2="127" y2="140" stroke={currentInk.ring} strokeWidth=".5" opacity=".15"/>
                        <line x1="153" y1="140" x2="170" y2="140" stroke={currentInk.ring} strokeWidth=".5" opacity=".15"/>

                        {/* Away team */}
                        <text x="140" y="166" textAnchor="middle" fill={currentInk.ring} fontFamily="Anton" fontSize="18" letterSpacing="2" opacity=".85">
                          {(currentMatch.away || "").toUpperCase()}
                        </text>

                        {/* Separator */}
                        <line x1="70" y1="178" x2="210" y2="178" stroke={currentInk.ring} strokeWidth=".5" opacity=".15"/>

                        {/* Date */}
                        <text x="140" y="198" textAnchor="middle" fill={currentInk.ring} fontFamily="Outfit" fontSize="10" fontWeight="700" opacity=".5" letterSpacing="1.5">
                          {currentStampDate ? new Date(currentStampDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase() : (currentMatch.date || "").toUpperCase()}
                        </text>

                        {/* Verified badge */}
                        <text x="140" y="216" textAnchor="middle" fill={currentInk.ring} fontFamily="Anton" fontSize="7.5" letterSpacing="3.5" opacity=".3">✦ VERIFIED ✦</text>
                      </svg>
                    </div>
                  ) : (
                    <div className="pp-stamp-empty">
                      <div className="pp-stamp-empty-circle"/>
                      <div className="pp-stamp-empty-text">ORDER DURING THIS MATCH TO EARN YOUR STAMP</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Page number at bottom */}
            <div className="pp-page-num">{ppPage === 0 ? "ID" : ppPage === 1 ? "VISA" : ppPage - 1} / {totalPages - 1}</div>
          </div>
        </div>

        {/* Navigation arrows on the book edges */}
        {ppPage > 0 && (
          <button className="pp-arr pp-arr-l" onClick={() => setPpPage(p => p - 1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        )}
        {ppPage < totalPages - 1 && (
          <button className="pp-arr pp-arr-r" onClick={() => setPpPage(p => p + 1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══ PROFILE ═══════════════════════════════════════════════════════════════ */
function ProfileView({ user, myPts, myRank, preds, matches, sponsors, onAvatarUpdate, passportStamps = [], onOpenPassport, gifts = [], onOpenGifts = ()=>{} }) {
  const fin  = matches.filter(m => m.status==="finished");
  const sub  = fin.filter(m => !!preds[`${user.id}__${m.id}`]).length;
  const corr = fin.filter(m => { const p=preds[`${user.id}__${m.id}`]; return p&&p.h===m.hs&&p.a===m.as; }).length;
  const acc  = sub>0 ? Math.round(corr/sub*100) : 0;
  const [uploading, setUploading] = useState(false);
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
          await navigator.share({ files:[file], title:'Join the El Mundo World Cup Predictor!', text:`I'm playing the World Cup 2026 Prediction Game at El Mundo, Bonaire! Join me 👉 elmundo-world-cup.com` });
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
        {/* Passport icon — top corner of hero */}
        <button className="pp-icon-btn" onClick={onOpenPassport} title="El Mundo Passport">
          <div className="pp-icon-book">
            <div className="pp-icon-spine"/>
            <div className="pp-icon-cover">
              <svg viewBox="0 0 30 30" fill="none" className="pp-icon-globe">
                <circle cx="15" cy="15" r="11" stroke="currentColor" strokeWidth=".7"/>
                <ellipse cx="15" cy="15" rx="5.5" ry="11" stroke="currentColor" strokeWidth=".5"/>
                <line x1="4" y1="12" x2="26" y2="12" stroke="currentColor" strokeWidth=".4"/>
                <line x1="4" y1="18" x2="26" y2="18" stroke="currentColor" strokeWidth=".4"/>
              </svg>
            </div>
            <div className="pp-icon-pages"/>
          </div>
          {passportStamps.length > 0 && <span className="pp-icon-badge">{passportStamps.length}</span>}
        </button>
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
          {v:myPts,                      u:"PTS", l:"Total Points"},
          {v:myRank>0?`#${myRank}`:"—", u:"",    l:"Your Rank"},
          {v:corr,                       u:`/${sub}`,l:"Correct"},
          {v:acc,                        u:"%",   l:"Accuracy"},
        ].map(s => (
          <div key={s.l} className="scard">
            <div className="sval">{s.v}<span className="sunit">{s.u}</span></div>
            <div className="slbl">{s.l}</div>
          </div>
        ))}
      </div>
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
            {/* Passport progress ribbon — stays in profile for visibility */}
            {matches.length > 0 && (
              <div className="gifts-v2-passport">
                <div className="gifts-v2-passport-top">
                  <span className="gifts-v2-passport-lbl">EL MUNDO PASSPORT</span>
                  <span className="gifts-v2-passport-count">{passportStamps.length} / {matches.length}</span>
                </div>
                <div className="gifts-v2-bar-track">
                  <div className="gifts-v2-bar-fill" style={{ width: `${Math.round(passportStamps.length / matches.length * 100)}%` }}/>
                </div>
                {passportStamps.length >= matches.length
                  ? <div className="gifts-v2-passport-hint gifts-v2-passport-done">COMPLETE — your gift is being prepared by El Mundo</div>
                  : <div className="gifts-v2-passport-hint">Collect all stamps by ordering anything during each match — complete it and get a guaranteed gift!</div>}
              </div>
            )}
          </div>
        );
      })()}

      <div className="info-card">
        <div className="info-title">⚽ HOW POINTS WORK</div>
        <p className="info-body">Predict the exact final score for each match. Exact score correct earns <strong>5 points</strong>. Correct winner with wrong score earns <strong>1 point</strong>. Draw matches: only exact score earns points. Most points at tournament end wins.</p>
      </div>

      {/* ── SPONSORS SECTION ── */}
      <SponsorsSection />
    </div>
  );
}

/* ═══ MY GIFTS ═════════════════════════════════════════════════════════════ */
function MyGiftsView({ user, gifts = [], passportCompletion = null, onClose, onToast = ()=>{}, onAddGiftToOrder = null }) {
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
  const isSpecialType = (g) => g.type === "special" || g.type === "passport";
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
    // special / passport
    return (
      <div className="gift-card-badge gift-card-badge-special">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="gift-card-special-ico">
          <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>
          <line x1="12" y1="22" x2="12" y2="7"/>
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
        </svg>
        <div className="gift-card-special-name">{isSpecialType(g) && g.type !== "passport" ? (g.item_name || "SPECIAL PRIZE") : "PASSPORT"}</div>
      </div>
    );
  };

  const typeLabel = (g) => {
    if (isCreditsType(g)) return "CREDITS TOP-UP";
    if (isFoodType(g)) return "FREE DRINK OR FOOD";
    if (g.type === "passport") return "PASSPORT REWARD";
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
            {/* ── PENDING PASSPORT GIFT CARD ── */}
            {tab === "active" && passportCompletion && !passportCompletion.gift_sent && (
              <div className="gift-card gift-card-pending">
                <div className="gift-card-shine"/>
                <div className="gift-card-main">
                  <div className="gift-card-badge gift-card-badge-pending">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="gift-card-trophy">
                      <path d="M8 21h8M12 17v4M17 4h3a1 1 0 0 1 1 1v2a5 5 0 0 1-5 5M7 4H4a1 1 0 0 0-1 1v2a5 5 0 0 0 5 5"/>
                      <path d="M17 4H7v7a5 5 0 0 0 10 0V4z"/>
                    </svg>
                    <div className="gift-card-passport-lbl">PENDING</div>
                  </div>
                  <div className="gift-card-info">
                    <div className="gift-card-type-lbl">PASSPORT REWARD</div>
                    <div className="gift-card-title">YOUR GIFT IS BEING PREPARED</div>
                    <div className="gift-card-desc">You collected every passport stamp! El Mundo is preparing your reward. You'll get a notification when it's ready.</div>
                    <div className="gift-card-date">
                      Passport completed {new Date(passportCompletion.completed_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                    </div>
                  </div>
                </div>
                <div className="gift-card-actions">
                  <div className="gift-pending-status">
                    <span className="gift-pending-dot"/>
                    AWAITING ADMIN APPROVAL
                  </div>
                </div>
              </div>
            )}
            {list.length === 0 && !(tab === "active" && passportCompletion && !passportCompletion.gift_sent) ? (
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
                  ? "Order during matches and complete your passport to earn a guaranteed gift from El Mundo"
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

/* C — PARTICLE EXPLOSION CANVAS */
function TVAdSlideC() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf, startTime = null;
    const W = canvas.width = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    const CX = W / 2, CY = H / 2;

    // Sample text pixels
    const PHRASE = "PREDICT · COMPETE · WIN";
    const offscreen = document.createElement("canvas");
    offscreen.width = W; offscreen.height = H;
    const oc = offscreen.getContext("2d");
    oc.fillStyle = "#fff";
    const fs = Math.round(W * 0.055);
    oc.font = `900 ${fs}px Anton, sans-serif`;
    oc.textAlign = "center"; oc.textBaseline = "middle";
    oc.fillText(PHRASE, CX, CY);
    const pixels = oc.getImageData(0, 0, W, H).data;
    const targets = [];
    const step = 5;
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const idx = (y * W + x) * 4;
        if (pixels[idx + 3] > 128) targets.push({ x, y });
      }
    }

    // Build particles
    const TOTAL = Math.min(targets.length, 800);
    const sampled = targets.sort(() => Math.random() - 0.5).slice(0, TOTAL);
    const particles = sampled.map(t => ({
      tx: t.x, ty: t.y,
      x: CX + (Math.random() - 0.5) * 8,
      y: CY + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 0.5) * 18,
      size: Math.random() * 2.5 + 1,
      alpha: 1,
      gold: Math.random() > 0.35,
    }));

    const PHASE_DUR = [1200, 800, 2800, 2000, 1200];
    const PHASES = PHASE_DUR.reduce((a, d, i) => { a.push((a[i - 1] || 0) + d); return a; }, []);

    function draw(ts) {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      ctx.clearRect(0, 0, W, H);

      // phase 0: pulsing origin dot
      if (elapsed < PHASES[0]) {
        const p = elapsed / PHASE_DUR[0];
        const r = 6 + Math.sin(p * Math.PI * 8) * 4;
        ctx.beginPath();
        ctx.arc(CX, CY, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240,192,64,${0.6 + Math.sin(p * Math.PI * 6) * 0.4})`;
        ctx.fill();
        ctx.shadowColor = "#F0C040"; ctx.shadowBlur = 30;
        ctx.fill(); ctx.shadowBlur = 0;
      }
      // phase 1: explosion burst
      else if (elapsed < PHASES[1]) {
        const p = (elapsed - PHASES[0]) / PHASE_DUR[1];
        particles.forEach(pt => {
          pt.x += pt.vx * 0.5;
          pt.y += pt.vy * 0.5;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
          ctx.fillStyle = pt.gold ? `rgba(240,192,64,${1 - p * 0.3})` : `rgba(255,255,255,${1 - p * 0.4})`;
          ctx.fill();
        });
      }
      // phase 2: converge to text
      else if (elapsed < PHASES[2]) {
        const p = Math.min(1, (elapsed - PHASES[1]) / PHASE_DUR[2]);
        const ease = 1 - Math.pow(1 - p, 3);
        particles.forEach(pt => {
          pt.x = pt.x + (pt.tx - pt.x) * ease * 0.06;
          pt.y = pt.y + (pt.ty - pt.y) * ease * 0.06;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size * (1 - p * 0.3 + 0.3), 0, Math.PI * 2);
          ctx.fillStyle = pt.gold ? `rgba(240,192,64,${0.7 + ease * 0.3})` : `rgba(255,220,120,${0.5 + ease * 0.5})`;
          ctx.fill();
        });
      }
      // phase 3: shimmer hold
      else if (elapsed < PHASES[3]) {
        const p = (elapsed - PHASES[2]) / PHASE_DUR[3];
        particles.forEach((pt, i) => {
          const flicker = 0.7 + Math.sin((elapsed * 0.005 + i * 0.3)) * 0.3;
          ctx.beginPath();
          ctx.arc(pt.tx, pt.ty, pt.size, 0, Math.PI * 2);
          ctx.fillStyle = pt.gold ? `rgba(240,192,64,${flicker})` : `rgba(255,220,120,${flicker * 0.8})`;
          if (pt.gold) { ctx.shadowColor = "#F0C040"; ctx.shadowBlur = 6; }
          ctx.fill(); ctx.shadowBlur = 0;
        });
        // EL MUNDO overlay text
        const ta = Math.min(1, (elapsed - PHASES[2]) / 400);
        ctx.globalAlpha = ta;
        ctx.fillStyle = "rgba(240,192,64,0.12)";
        ctx.font = `900 ${Math.round(W * 0.18)}px Anton, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("EL MUNDO", CX, CY * 0.55);
        ctx.globalAlpha = 1;
      }
      // phase 4: collapse + logo burst
      else {
        const p = Math.min(1, (elapsed - PHASES[3]) / PHASE_DUR[4]);
        particles.forEach(pt => {
          ctx.beginPath();
          ctx.arc(pt.tx + (CX - pt.tx) * p, pt.ty + (CY - pt.ty) * p, pt.size * (1 - p), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(240,192,64,${1 - p})`;
          ctx.fill();
        });
        const burst = p;
        ctx.beginPath();
        ctx.arc(CX, CY, burst * 120, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240,192,64,${(1 - burst) * 0.25})`;
        ctx.fill();
      }

      if (elapsed < PHASES[4]) raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const G = {background:"linear-gradient(135deg,#ffe97a,#F0C040,#fff8d6,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent"};
  return (
    <div className="tvad-slide" style={{padding:0}}>
      <canvas ref={canvasRef} style={{position:"absolute",inset:0,width:"100%",height:"100%"}} />
      <div style={{position:"absolute",bottom:"12%",left:0,right:0,display:"flex",flexDirection:"column",alignItems:"center",zIndex:2,animation:"tvadWordIn 1s cubic-bezier(.16,1,.3,1) 4.5s both"}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(11px,2vw,15px)",letterSpacing:7,color:"rgba(255,255,255,.3)",marginBottom:8}}>WORLD CUP 2026</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(32px,8vw,86px)",letterSpacing:8,...G,filter:"drop-shadow(0 0 40px rgba(240,192,64,.6))"}}>EL MUNDO</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(10px,1.8vw,14px)",letterSpacing:5,color:"rgba(255,255,255,.22)",marginTop:6}}>BONAIRE · NETHERLANDS ANTILLES</div>
      </div>
    </div>
  );
}

/* D — COUNTDOWN URGENCY SLIDE */
function TVAdClockUnit({ val, lbl }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:"clamp(60px,10vw,100px)"}}>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(40px,9vw,90px)",letterSpacing:2,lineHeight:1,color:"#F0C040",filter:"drop-shadow(0 0 20px rgba(240,192,64,.5))",animation:"tvadLivePulse 1s ease-in-out infinite"}}>{String(val).padStart(2,"0")}</div>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(8px,1.4vw,11px)",letterSpacing:4,color:"rgba(255,255,255,.3)",marginTop:4}}>{lbl}</div>
    </div>
  );
}
function TVAdSlideD({ matches = [] }) {
  const G = {background:"linear-gradient(135deg,#ffe97a,#F0C040,#fff8d6,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent"};
  const nextMatch = useMemo(() => {
    const now = Date.now();
    return [...matches].filter(m => new Date(m.kickoff).getTime() > now).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0] || null;
  }, [matches]);

  const calcRemaining = () => {
    if (!nextMatch) return null;
    const diff = Math.max(0, Math.floor((new Date(nextMatch.kickoff).getTime() - Date.now()) / 1000));
    return { d: Math.floor(diff / 86400), h: Math.floor((diff % 86400) / 3600), m: Math.floor((diff % 3600) / 60), s: diff % 60, total: diff };
  };
  const [tl, setTl] = useState(calcRemaining);
  useEffect(() => {
    const id = setInterval(() => setTl(calcRemaining()), 1000);
    return () => clearInterval(id);
  }, [nextMatch]);

  const urgent = tl && tl.total < 600;

  return (
    <div className="tvad-slide">
      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",width:"100%",maxWidth:700}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(9px,1.8vw,13px)",letterSpacing:7,color:"rgba(240,192,64,.65)",marginBottom:12,animation:"tvadWordIn .6s cubic-bezier(.16,1,.3,1) .1s both"}}>NEXT MATCH STARTS IN</div>
        {tl ? (
          <>
            <div style={{display:"flex",alignItems:"center",gap:"clamp(8px,3vw,32px)",marginBottom:14,animation:"tvadScoreReveal .8s cubic-bezier(.16,1,.3,1) .3s both"}}>
              {tl.d > 0 && <><TVAdClockUnit val={tl.d} lbl="DAYS" /><div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(28px,6vw,60px)",color:"rgba(240,192,64,.35)",lineHeight:1,paddingBottom:16}}>:</div></>}
              <TVAdClockUnit val={tl.h} lbl="HRS" />
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(28px,6vw,60px)",color:"rgba(240,192,64,.35)",lineHeight:1,paddingBottom:16}}>:</div>
              <TVAdClockUnit val={tl.m} lbl="MIN" />
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(28px,6vw,60px)",color:"rgba(240,192,64,.35)",lineHeight:1,paddingBottom:16}}>:</div>
              <TVAdClockUnit val={tl.s} lbl="SEC" />
            </div>
            {nextMatch && (
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(13px,2.8vw,22px)",color:"rgba(255,255,255,.5)",letterSpacing:3,marginBottom:28,animation:"tvadWordIn .7s cubic-bezier(.16,1,.3,1) .6s both"}}>
                {nextMatch.home} vs {nextMatch.away}
              </div>
            )}
            {urgent && <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(13px,2.5vw,18px)",letterSpacing:4,color:"#ff4444",animation:"tvadNeonFlicker 0.4s linear infinite",marginBottom:16}}>⚡ SUBMIT YOUR PREDICTION NOW ⚡</div>}
          </>
        ) : (
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(28px,7vw,72px)",color:"rgba(255,255,255,.18)",letterSpacing:4,marginBottom:28}}>STAY TUNED</div>
        )}
        <div style={{width:"100%",height:1,background:"linear-gradient(90deg,transparent,rgba(240,192,64,.3),transparent)",marginBottom:28,animation:"tvadLineGrow 1s ease .8s both"}} />
        <div style={{display:"flex",alignItems:"center",gap:24,animation:"tvadWordIn .8s cubic-bezier(.16,1,.3,1) 1s both"}}>
          <div style={{padding:10,background:"#0d0b00",border:"1.5px solid rgba(240,192,64,.4)",borderRadius:12,animation:"tvadQRGlow 2.5s ease-in-out infinite"}}>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://elmundo-world-cup.com&bgcolor=0d0b00&color=F0C040&format=png&margin=6" alt="QR" style={{width:"clamp(80px,12vw,140px)",height:"clamp(80px,12vw,140px)",display:"block"}} />
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,textAlign:"left"}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(18px,4vw,40px)",letterSpacing:2,...G,lineHeight:1}}>PREDICT</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(18px,4vw,40px)",letterSpacing:2,...G,lineHeight:1}}>EVERY MATCH</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(10px,1.8vw,13px)",color:"rgba(255,255,255,.3)",marginTop:6,letterSpacing:1}}>elmundo-world-cup.com</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* B — LIVE SCORE TICKER */
function TVAdSlideB() {
  const G = {background:"linear-gradient(135deg,#ffe97a,#F0C040,#fff8d6,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent"};
  const [minute, setMinute] = useState(67);
  const [score, setScore]   = useState({h:1, a:0});
  useEffect(() => {
    const id = setInterval(() => {
      setMinute(m => Math.min(m + 1, 90));
    }, 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="tvad-slide" style={{padding:0}}>
      <div className="tvad-scanline-overlay" />
      <div style={{position:"relative",zIndex:2,display:"flex",width:"100%",height:"100%",alignItems:"stretch"}}>
        {/* LEFT — live match */}
        <div style={{flex:"0 0 55%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"clamp(24px,5vw,60px)",borderRight:"1px solid rgba(240,192,64,.15)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,animation:"tvadWordIn .6s cubic-bezier(.16,1,.3,1) .1s both"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:"#ff3333",animation:"tvadLivePulse .8s ease-in-out infinite"}} />
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(10px,1.8vw,14px)",letterSpacing:5,color:"#ff4444"}}>LIVE</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(10px,1.8vw,13px)",letterSpacing:2,color:"rgba(255,255,255,.35)",marginLeft:4}}>{minute}'</div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"clamp(12px,4vw,36px)",width:"100%",marginBottom:20,animation:"tvadScoreReveal .8s cubic-bezier(.16,1,.3,1) .3s both"}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
              <div style={{fontSize:"clamp(32px,7vw,64px)"}}>🇧🇷</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(9px,1.6vw,12px)",letterSpacing:2,color:"rgba(255,255,255,.4)"}}>BRAZIL</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(44px,10vw,100px)",letterSpacing:8,color:"#fff",lineHeight:1,filter:"drop-shadow(0 0 24px rgba(255,255,255,.25))"}}>{score.h} – {score.a}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
              <div style={{fontSize:"clamp(32px,7vw,64px)"}}>🇦🇷</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(9px,1.6vw,12px)",letterSpacing:2,color:"rgba(255,255,255,.4)"}}>ARGENTINA</div>
            </div>
          </div>
          <div style={{width:"70%",height:1,background:"linear-gradient(90deg,transparent,rgba(240,192,64,.3),transparent)",marginBottom:16,animation:"tvadScanlineBar 3s linear infinite"}} />
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(8px,1.4vw,11px)",letterSpacing:4,color:"rgba(255,255,255,.2)",animation:"tvadWordIn .6s cubic-bezier(.16,1,.3,1) .7s both"}}>GROUP A · MATCHDAY 2</div>
        </div>
        {/* RIGHT — prediction CTA */}
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"clamp(20px,4vw,48px)"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(9px,1.6vw,12px)",letterSpacing:6,color:"rgba(240,192,64,.6)",marginBottom:10,animation:"tvadWordIn .6s cubic-bezier(.16,1,.3,1) .2s both"}}>DID YOU PREDICT</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(24px,5.5vw,52px)",letterSpacing:3,color:"#fff",lineHeight:1,marginBottom:8,animation:"tvadWordIn .8s cubic-bezier(.16,1,.3,1) .4s both"}}>THIS<br/>SCORE?</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(22px,5vw,44px)",letterSpacing:2,...G,marginBottom:24,animation:"tvadWordIn .7s cubic-bezier(.16,1,.3,1) .6s both",filter:"drop-shadow(0 0 16px rgba(240,192,64,.4))"}}>+5 PTS</div>
          <div style={{padding:12,background:"#0d0b00",border:"1.5px solid rgba(240,192,64,.4)",borderRadius:14,marginBottom:14,animation:"tvadQRGlow 2.5s ease-in-out infinite, tvadScoreReveal .8s cubic-bezier(.16,1,.3,1) .8s both"}}>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://elmundo-world-cup.com&bgcolor=0d0b00&color=F0C040&format=png&margin=6" alt="QR" style={{width:"clamp(70px,11vw,120px)",height:"clamp(70px,11vw,120px)",display:"block"}} />
          </div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(10px,1.8vw,13px)",letterSpacing:3,...G,animation:"tvadWordIn .6s cubic-bezier(.16,1,.3,1) 1s both"}}>PREDICT FREE</div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(9px,1.5vw,11px)",color:"rgba(255,255,255,.22)",marginTop:4,letterSpacing:1,animation:"tvadWordIn .5s cubic-bezier(.16,1,.3,1) 1.1s both"}}>elmundo-world-cup.com</div>
        </div>
      </div>
    </div>
  );
}

/* A — CINEMATIC TITLE REVEAL */
function TVAdSlideA() {
  const G = {background:"linear-gradient(135deg,#ffe97a,#F0C040,#fff8d6,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent"};
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setPhase(1), 5400);
    return () => clearTimeout(id);
  }, []);
  const letters = "EL MUNDO".split("");

  return (
    <div className="tvad-slide">
      {phase === 0 ? (
        <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{display:"flex",gap:"clamp(2px,1vw,8px)",marginBottom:20,overflow:"hidden"}}>
            {letters.map((l, i) => (
              <div key={i} style={{
                fontFamily:"'Anton',sans-serif",
                fontSize:"clamp(48px,12vw,128px)",
                letterSpacing:2,lineHeight:1,
                ...G,
                filter:"drop-shadow(0 0 32px rgba(240,192,64,.45))",
                animation:`tvadLetterIn .5s cubic-bezier(.16,1,.3,1) ${.2 + i * .08}s both`,
              }}>{l === " " ? "\u00A0" : l}</div>
            ))}
          </div>
          <div style={{width:"clamp(80px,18vw,200px)",height:2,background:"linear-gradient(90deg,transparent,#F0C040,transparent)",marginBottom:18,animation:"tvadLineGrow .8s ease 1.0s both"}} />
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(14px,3vw,28px)",letterSpacing:8,color:"rgba(255,255,255,.0)",marginBottom:6,animation:"tvadNeonFlicker .08s linear 1.2s 1 forwards, tvadWordIn .6s cubic-bezier(.16,1,.3,1) 1.2s both",WebkitTextFillColor:"rgba(255,255,255,.55)"}}>WORLD CUP 2026</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(10px,1.8vw,14px)",letterSpacing:6,color:"rgba(255,255,255,.2)",animation:"tvadWordIn .6s cubic-bezier(.16,1,.3,1) 1.8s both"}}>THE ULTIMATE PREDICTION GAME</div>
        </div>
      ) : (
        <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",width:"100%",maxWidth:580,animation:"tvadSlideIn .6s cubic-bezier(.16,1,.3,1) both"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(9px,1.7vw,13px)",letterSpacing:7,color:"rgba(240,192,64,.6)",marginBottom:14,animation:"tvadWordIn .5s cubic-bezier(.16,1,.3,1) .1s both"}}>JOIN THE GAME</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(24px,6vw,60px)",letterSpacing:3,color:"#fff",lineHeight:1.1,marginBottom:8,animation:"tvadWordIn .7s cubic-bezier(.16,1,.3,1) .2s both"}}>REGISTER NOW</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(14px,3vw,26px)",letterSpacing:2,color:"rgba(255,255,255,.45)",lineHeight:1.2,marginBottom:26,animation:"tvadWordIn .7s cubic-bezier(.16,1,.3,1) .35s both"}}>& TAKE PART IN EVERY MATCH</div>
          <div style={{display:"flex",alignItems:"center",gap:24,animation:"tvadScoreReveal .7s cubic-bezier(.16,1,.3,1) .5s both"}}>
            <div style={{padding:14,background:"#0d0b00",border:"2px solid rgba(240,192,64,.5)",borderRadius:16,animation:"tvadQRGlow 2.2s ease-in-out infinite"}}>
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://elmundo-world-cup.com&bgcolor=0d0b00&color=F0C040&format=png&margin=8" alt="QR" style={{width:"clamp(100px,16vw,160px)",height:"clamp(100px,16vw,160px)",display:"block"}} />
            </div>
            <div style={{textAlign:"left",display:"flex",flexDirection:"column",gap:10}}>
              {[{ico:"⚡",t:"PREDICT SCORES",s:"Exact score = 5 pts"},{ico:"🏆",t:"CLIMB THE BOARD",s:"Beat every guest"},{ico:"🎁",t:"WIN PRIZES",s:"Top predictors rewarded"}].map((r,i)=>(
                <div key={r.t} style={{animation:`tvadWordIn .5s cubic-bezier(.16,1,.3,1) ${.6+i*.12}s both`,display:"flex",alignItems:"flex-start",gap:10}}>
                  <div style={{fontSize:"clamp(14px,2.5vw,20px)",marginTop:1}}>{r.ico}</div>
                  <div>
                    <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(10px,1.8vw,14px)",letterSpacing:2,color:"rgba(255,255,255,.75)"}}>{r.t}</div>
                    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(8px,1.4vw,11px)",color:"rgba(255,255,255,.28)",marginTop:1}}>{r.s}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(12px,2.5vw,18px)",letterSpacing:3,...G,marginTop:20,animation:"tvadWordIn .6s cubic-bezier(.16,1,.3,1) 1s both"}}>elmundo-world-cup.com</div>
        </div>
      )}
    </div>
  );
}

/* F — LUXURY HOTEL MENU STYLE */
function TVAdSlideF() {
  const G = {background:"linear-gradient(135deg,#ffe97a,#F0C040,#fff8d6,#c8901c)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent"};
  const words = [
    {text:"EL MUNDO", fs:"clamp(44px,11vw,116px)", ls:10, g:true, delay:1.5},
    {text:"BAR · RESTAURANT · BONAIRE", fs:"clamp(10px,2vw,16px)", ls:6, g:false, col:"rgba(255,255,255,.35)", delay:3.3},
    {text:"WORLD CUP 2026", fs:"clamp(18px,4vw,40px)", ls:5, g:true, delay:4.9},
    {text:"PREDICTION GAME", fs:"clamp(14px,3vw,28px)", ls:4, g:false, col:"rgba(255,255,255,.55)", delay:6.4},
  ];
  return (
    <div className="tvad-slide">
      <div style={{position:"absolute",top:"50%",left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,rgba(240,192,64,.18),transparent)",transform:"translateY(-0px)",animation:"tvadLuxLine 3.2s cubic-bezier(.16,1,.3,1) .8s both"}} />
      <div style={{position:"absolute",bottom:"50%",left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,rgba(240,192,64,.12),transparent)",animation:"tvadLuxLine 3.2s cubic-bezier(.16,1,.3,1) 1.2s both"}} />
      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",gap:"clamp(8px,2vw,18px)"}}>
        {words.map((w,i)=>(
          <div key={i} style={{
            fontFamily:"'Anton',sans-serif",
            fontSize:w.fs, letterSpacing:w.ls, lineHeight:1,
            ...(w.g ? {...G, filter:"drop-shadow(0 0 24px rgba(240,192,64,.3))"} : {color:w.col}),
            animation:`tvadWordIn .8s cubic-bezier(.16,1,.3,1) ${w.delay}s both`,
          }}>{w.text}</div>
        ))}
        <div style={{width:"clamp(60px,12vw,140px)",height:1,background:"linear-gradient(90deg,transparent,rgba(240,192,64,.4),transparent)",margin:"clamp(8px,2vw,18px) 0",animation:"tvadLineGrow 1s ease 8.2s both"}} />
        <div style={{position:"relative",animation:`tvadWordIn .8s cubic-bezier(.16,1,.3,1) 8.8s both`}}>
          <div style={{position:"absolute",inset:-20,borderRadius:"50%",border:"1px solid rgba(240,192,64,.2)",animation:"tvadRotateRing 8s linear infinite",pointerEvents:"none"}} />
          <div style={{position:"absolute",inset:-20,borderRadius:"50%",border:"1px dashed rgba(240,192,64,.1)",animation:"tvadRotateRing 14s linear infinite reverse",pointerEvents:"none"}} />
          <div style={{padding:14,background:"#0d0b00",border:"1.5px solid rgba(240,192,64,.45)",borderRadius:14,animation:"tvadQRGlow 3s ease-in-out infinite"}}>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://elmundobonaire.com&bgcolor=0d0b00&color=F0C040&format=png&margin=6" alt="QR" style={{width:"clamp(80px,12vw,130px)",height:"clamp(80px,12vw,130px)",display:"block"}} />
          </div>
        </div>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:"clamp(10px,1.8vw,13px)",color:"rgba(255,255,255,.22)",letterSpacing:2,animation:"tvadWordIn .6s cubic-bezier(.16,1,.3,1) 9.4s both"}}>elmundobonaire.com</div>
      </div>
    </div>
  );
}

const TVAD_DURATIONS = [11000, 12000, 11000, 12000, 14000];
const TVAD_COUNT = TVAD_DURATIONS.length;

function TVAdView({ onBack, matches = [] }) {
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

function AdminView({ matches, rules, sponsors, onUpdate, onAdd, onDelete, onSaveRules, onSaveSponsors, menuItems, users, onSaveMenuItem, onDeleteMenuItem, onToggleAvail, onToggleSoldOut, onAddCredits, onUpdateOrderStatus, onDeleteOrder, onLoadAllOrders, allOrders, sponsorGifts, onSetSponsorTier, onSaveSponsorGifts, onBanUsers, onAnnounceWinner, board, onSetFloorplanAccess = ()=>{}, onSetKeepupsAccess = ()=>{}, appSettings = {}, onSaveAppSettings = ()=>{}, sendPush = ()=>{}, onLaunchTVAd = ()=>{} }) {
  const [section, setSection] = useState("dashboard");

  const GROUPS = [
    {
      id: "live",
      label: "LIVE OPS",
      ico: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
      tabs: [
        { id:"dashboard", label:"Dashboard" },
        { id:"tvads",     label:"📺 TV Ads"  },
      ]
    },
    {
      id: "service",
      label: "SERVICE",
      ico: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
      tabs: [
        { id:"menu",        label:"Menu"        },
        { id:"tables",      label:"Tables"      },
        { id:"tableqr",     label:"Table QR"    },
        { id:"credits",     label:"Credits"     },
        { id:"fpAccess",    label:"Floor Plan"  },
        { id:"keepupsAccess", label:"Keep-Ups" },
        { id:"appSettings", label:"App Settings"},
      ]
    },
    {
      id: "game",
      label: "GAME",
      ico: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><line x1="2" y1="12" x2="22" y2="12"/></svg>,
      tabs: [
        { id:"matches",   label:"Matches"   },
        { id:"rules",     label:"Rules"     },
        { id:"vip",       label:"VIP Perks" },
        { id:"gifts",     label:"Gifts"     },
        { id:"passGifts", label:"Passport Gifts" },
        { id:"integrity", label:"Integrity" },
      ]
    },
  ];

  // Derive which group the current section belongs to
  const activeGroup = GROUPS.find(g => g.tabs.some(t => t.id === section)) || GROUPS[0];
  const subTabs = activeGroup.tabs;

  const goGroup = (g) => { setSection(g.tabs[0].id); };

  return (
    <div className="vpad">
      {/* ── Level 1: Group nav ── */}
      <div style={{display:"flex",alignItems:"center",borderBottom:"1px solid rgba(255,255,255,.07)",gap:0}}>
        {GROUPS.map(g => {
          const on = g.id === activeGroup.id;
          return (
            <button key={g.id} onClick={()=>goGroup(g)} style={{
              display:"flex",alignItems:"center",gap:6,
              padding:"13px 20px",
              background: on ? "rgba(255,255,255,.06)" : "transparent",
              border:"none",
              borderBottom: on ? "2px solid #fff" : "2px solid transparent",
              fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2,
              color: on ? "#fff" : "rgba(255,255,255,.35)",
              cursor:"pointer",transition:"all .18s",whiteSpace:"nowrap",
              marginBottom:-1,
            }}>
              <span style={{opacity: on ? 1 : 0.5}}>{g.ico}</span>
              {g.label}
            </button>
          );
        })}
        {/* Announce Winner lives in the group bar, right-aligned */}
        {onAnnounceWinner && (
          <button onClick={onAnnounceWinner} style={{
            marginLeft:"auto",display:"flex",alignItems:"center",gap:6,
            padding:"8px 14px",margin:"6px 12px 6px auto",
            background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.25)",
            fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,
            color:"rgba(255,255,255,.85)",cursor:"pointer",whiteSpace:"nowrap",
          }}>
            🏆 WINNER
          </button>
        )}
      </div>

      {/* ── Level 2: Sub-tab nav ── */}
      <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,.05)",background:"rgba(255,255,255,.02)"}}>
        {subTabs.map(t => {
          const on = section === t.id;
          return (
            <button key={t.id} onClick={()=>setSection(t.id)} style={{
              padding:"9px 16px",
              background:"transparent",border:"none",
              borderBottom: on ? "2px solid rgba(255,255,255,.5)" : "2px solid transparent",
              fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight: on ? 700 : 500,
              color: on ? "#fff" : "rgba(255,255,255,.3)",
              cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap",
              marginBottom:-1,letterSpacing:.5,
            }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      {section === "dashboard"  && <AdminDashboard allOrders={allOrders} users={users} board={board} />}
      {section === "tvads"      && <AdminTVAds onLaunch={onLaunchTVAd} />}

      {section === "matches"    && <AdminMatches  matches={matches}   onUpdate={onUpdate} onAdd={onAdd} onDelete={onDelete} />}
      {section === "rules"      && <AdminRules    rules={rules}       onSave={onSaveRules} />}
      {section === "sponsors"   && <AdminSponsors sponsors={sponsors} onSave={onSaveSponsors} />}
      {section === "menu"       && <AdminMenu     menuItems={menuItems} onSave={onSaveMenuItem} onDelete={onDeleteMenuItem} onToggleAvail={onToggleAvail} onToggleSoldOut={onToggleSoldOut} />}
      {section === "credits"    && <AdminCredits  users={users} onAddCredits={onAddCredits} />}
      {section === "tables"     && <AdminTables />}
      {section === "tableqr"    && <AdminTableQR />}
      {section === "vip"        && <AdminSponsorPerks users={users} sponsorGifts={sponsorGifts} onSetTier={onSetSponsorTier} onSaveGifts={onSaveSponsorGifts} />}
      {section === "gifts"      && <AdminGifts users={users} sendPush={sendPush} />}
      {section === "passGifts" && <AdminPassportGifts users={users} matches={matches} />}
      {section === "integrity"  && <AdminIntegrity users={users} onBanUsers={onBanUsers} />}
      {section === "fpAccess"      && <AdminFloorplanAccess users={users} onSetAccess={onSetFloorplanAccess} />}
      {section === "keepupsAccess" && <AdminKeepupsAccess  users={users} onSetAccess={onSetKeepupsAccess} />}
      {section === "appSettings"   && <AdminAppSettings appSettings={appSettings} onSave={onSaveAppSettings} />}
    </div>
  );
}

/* ── Admin: App Settings ── */
function AdminAppSettings({ appSettings = {}, onSave }) {
  const s = { showMatches:true, showLeaderboard:true, showMundogram:true, showMenu:true, ...appSettings };
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
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2.5,color:"rgba(255,255,255,.35)",marginBottom:10,paddingBottom:6,borderBottom:"1px solid rgba(255,255,255,.06)"}}>TAB VISIBILITY</div>
          <Toggle label="MATCHES" desc="World Cup match predictions tab" val={s.showMatches} onToggle={()=>onSave({showMatches:!s.showMatches})} />
          <Toggle label="LEADERBOARD" desc="Player rankings and points tab" val={s.showLeaderboard} onToggle={()=>onSave({showLeaderboard:!s.showLeaderboard})} />
          <Toggle label="MUNDOGRAM" desc="Social photo feed tab" val={s.showMundogram} onToggle={()=>onSave({showMundogram:!s.showMundogram})} />
          <Toggle label="MENU" desc="Food & drinks ordering tab" val={s.showMenu} onToggle={()=>onSave({showMenu:!s.showMenu})} />
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
  const [completions, setCompletions] = useState([]); // passport_completions rows
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
  const [linkingCompletion, setLinkingCompletion] = useState(null); // pending completion being fulfilled

  const loadGifts = async () => {
    setLoading(true);
    const { data } = await supabase.from("gifts").select("*").order("created_at", { ascending: false });
    setAllGifts(data || []);
    setLoading(false);
  };

  const loadCompletions = async () => {
    const { data } = await supabase.from("passport_completions").select("*").order("completed_at", { ascending: false });
    setCompletions(data || []);
  };

  useEffect(() => {
    loadGifts();
    loadCompletions();
    const ch = supabase.channel("rt-admin-gifts")
      .on("postgres_changes", { event:"*", schema:"public", table:"gifts" }, () => loadGifts())
      .subscribe();
    const ch2 = supabase.channel("rt-admin-passport-completions")
      .on("postgres_changes", { event:"*", schema:"public", table:"passport_completions" }, () => loadCompletions())
      .subscribe();
    return () => { supabase.removeChannel(ch); supabase.removeChannel(ch2); };
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
    setLinkingCompletion(null);
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

  // Open the create-gift modal pre-filled to fulfill a passport completion
  const prepareGiftForCompletion = (completion) => {
    const u = users[completion.user_id];
    if (!u) { alert("Player profile not loaded"); return; }
    setLinkingCompletion(completion);
    setRecipient(u);
    setRecipientQ("");
    setBulkMode(false);
    setType("special");
    setItemName("");
    setTitle("PASSPORT REWARD");
    setDescription("You collected every passport stamp! Head to the El Mundo restaurant and show this screen to claim your exclusive reward.");
    setShowCreate(true);
  };

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
      // If we are fulfilling a passport completion, link the new gift back
      if (linkingCompletion && insertedGifts && insertedGifts.length === 1) {
        const newGift = insertedGifts[0];
        const { error: pcErr } = await supabase.from("passport_completions").update({
          gift_sent: true,
          gift_id: newGift.id,
          fulfilled_at: new Date().toISOString(),
          fulfilled_by: authUser?.id || null,
        }).eq("id", linkingCompletion.id);
        if (pcErr) console.error("Failed to link passport completion", pcErr);
      }
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
      loadCompletions();
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

      {/* ─── Passport completions awaiting a gift ─── */}
      {(() => {
        const pending = completions.filter(c => !c.gift_sent);
        if (pending.length === 0) return null;
        return (
          <div className="admin-pcomp-panel">
            <div className="admin-pcomp-head">
              <div className="admin-pcomp-title">🏆 PASSPORT COMPLETIONS</div>
              <div className="admin-pcomp-sub">{pending.length} player{pending.length===1?"":"s"} finished — pick a gift to send</div>
            </div>
            <div className="admin-pcomp-list">
              {pending.map(c => {
                const u = users[c.user_id];
                return (
                  <div key={c.id} className="admin-pcomp-row">
                    <div className="admin-pcomp-row-info">
                      <div className="admin-pcomp-row-name">
                        {u?.name || "(deleted player)"}
                        {u?.player_number ? <span className="admin-pcomp-row-num"> · #{u.player_number}</span> : null}
                      </div>
                      <div className="admin-pcomp-row-meta">
                        Completed {new Date(c.completed_at).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                      </div>
                    </div>
                    <button className="admin-pcomp-prep-btn" disabled={!u} onClick={() => prepareGiftForCompletion(c)}>
                      PREPARE GIFT
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
                  {g.type === "credits" ? "CREDITS" : g.type === "drink_food" || g.type === "item" ? "DRINK/FOOD" : g.type === "special" ? "SPECIAL" : "PASSPORT"}
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

/* ── Admin: Passport Gifts ── */
function AdminPassportGifts({ users, matches }) {
  const [allStamps, setAllStamps] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [giftType, setGiftType] = useState("giftcard"); // giftcard | menu_item
  const [giftDesc, setGiftDesc] = useState("");
  const [awarding, setAwarding] = useState(null);

  const totalMatches = matches.length;

  // Load all stamps and gifts
  useEffect(() => {
    (async () => {
      const [stampRes, giftRes] = await Promise.all([
        supabase.from("passport_stamps").select("user_id, match_id"),
        supabase.from("passport_gifts").select("*").order("awarded_at", { ascending: false }),
      ]);
      setAllStamps(stampRes.data || []);
      setGifts(giftRes.data || []);
      setLoading(false);
    })();
  }, []);

  // Group stamps by user
  const stampsByUser = {};
  allStamps.forEach(s => {
    if (!stampsByUser[s.user_id]) stampsByUser[s.user_id] = new Set();
    stampsByUser[s.user_id].add(s.match_id);
  });

  // Find players who completed the passport
  const completedPlayers = Object.entries(stampsByUser)
    .filter(([, stamps]) => stamps.size >= totalMatches && totalMatches > 0)
    .map(([uid, stamps]) => ({ uid, count: stamps.size, user: users[uid] }))
    .filter(p => p.user);

  // Find players close to completing
  const nearComplete = Object.entries(stampsByUser)
    .filter(([, stamps]) => stamps.size >= Math.floor(totalMatches * 0.75) && stamps.size < totalMatches && totalMatches > 0)
    .map(([uid, stamps]) => ({ uid, count: stamps.size, user: users[uid] }))
    .filter(p => p.user)
    .sort((a, b) => b.count - a.count);

  const giftedSet = new Set(gifts.map(g => g.user_id));

  const awardGift = async (userId) => {
    if (!giftDesc.trim()) return;
    setAwarding(userId);
    try {
      const { data, error } = await supabase.from("passport_gifts").insert({
        user_id: userId, gift_type: giftType, description: giftDesc.trim(),
      }).select().maybeSingle();
      if (error) throw error;
      if (data) setGifts(prev => [data, ...prev]);
      setGiftDesc("");
    } catch (e) { console.error(e); }
    setAwarding(null);
  };

  if (loading) return <div style={{padding:40,textAlign:"center",color:"rgba(255,255,255,.3)",fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:2}}>LOADING STAMPS...</div>;

  return (
    <div style={{padding:"16px 14px 40px"}}>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:3,color:"rgba(255,255,255,.3)",marginBottom:16}}>PASSPORT GIFTS</div>

      {/* Summary */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:20}}>
        <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:10,padding:"14px 10px",textAlign:"center"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:28,color:"#fff"}}>{totalMatches}</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:2,color:"rgba(255,255,255,.3)",marginTop:4}}>TOTAL MATCHES</div>
        </div>
        <div style={{background:"rgba(34,197,94,.06)",border:"1px solid rgba(34,197,94,.2)",borderRadius:10,padding:"14px 10px",textAlign:"center"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:28,color:"#4ade80"}}>{completedPlayers.length}</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:2,color:"rgba(34,197,94,.5)",marginTop:4}}>COMPLETED</div>
        </div>
        <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:10,padding:"14px 10px",textAlign:"center"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:28,color:"rgba(255,255,255,.5)"}}>{gifts.length}</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:2,color:"rgba(255,255,255,.25)",marginTop:4}}>GIFTS AWARDED</div>
        </div>
      </div>

      {/* Gift type selector */}
      <div style={{marginBottom:16}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,255,255,.35)",marginBottom:8}}>GIFT TYPE</div>
        <div style={{display:"flex",gap:6}}>
          {[{id:"giftcard",label:"🎁 Gift Card"},{id:"menu_item",label:"🍽 Free Menu Items"}].map(t => (
            <button key={t.id} onClick={() => setGiftType(t.id)}
              style={{padding:"8px 16px",background:giftType===t.id?"#fff":"rgba(255,255,255,.05)",
                color:giftType===t.id?"#000":"rgba(255,255,255,.5)",border:giftType===t.id?"none":"1px solid rgba(255,255,255,.1)",
                fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:1.5,cursor:"pointer",borderRadius:6,
                fontWeight:giftType===t.id?900:400}}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Gift description input */}
      <div style={{marginBottom:20}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,255,255,.35)",marginBottom:6}}>GIFT DESCRIPTION</div>
        <input value={giftDesc} onChange={e => setGiftDesc(e.target.value)}
          placeholder={giftType === "giftcard" ? "e.g. $25 Gift Card" : "e.g. 2x Free Cocktails + 1 Main Course"}
          style={{width:"100%",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",
            color:"#fff",padding:"12px 14px",fontFamily:"'Outfit',sans-serif",fontSize:13,borderRadius:8,
            outline:"none",boxSizing:"border-box"}} />
      </div>

      {/* ── COMPLETED PLAYERS ── */}
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2,color:"#4ade80",marginBottom:10}}>
        🏆 COMPLETED PASSPORT ({completedPlayers.length})
      </div>
      {completedPlayers.length === 0 && (
        <div style={{padding:"30px 0",textAlign:"center",fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.2)"}}>
          No players have completed their passport yet
        </div>
      )}
      {completedPlayers.map(p => (
        <div key={p.uid} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",
          background:giftedSet.has(p.uid)?"rgba(34,197,94,.04)":"rgba(255,255,255,.03)",
          border:`1px solid ${giftedSet.has(p.uid)?"rgba(34,197,94,.15)":"rgba(255,255,255,.08)"}`,
          borderRadius:10,marginBottom:6}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,.08)",
            display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Anton',sans-serif",
            fontSize:14,color:"rgba(255,255,255,.5)",overflow:"hidden",flexShrink:0}}>
            {p.user.avatar_url ? <img src={p.user.avatar_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/> : (p.user.name||"?")[0].toUpperCase()}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,color:"#fff",letterSpacing:1}}>{p.user.name}</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.35)"}}>{p.count}/{totalMatches} stamps</div>
          </div>
          {giftedSet.has(p.uid) ? (
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,color:"#4ade80",
              background:"rgba(34,197,94,.08)",padding:"5px 12px",borderRadius:20,border:"1px solid rgba(34,197,94,.2)"}}>✓ GIFTED</div>
          ) : (
            <button onClick={() => awardGift(p.uid)} disabled={!giftDesc.trim() || awarding === p.uid}
              style={{background:"#fff",color:"#000",border:"none",padding:"8px 16px",
                fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:1.5,cursor:"pointer",
                borderRadius:6,fontWeight:900,opacity:(!giftDesc.trim()||awarding===p.uid)?.4:1}}>
              {awarding === p.uid ? "..." : "AWARD GIFT"}
            </button>
          )}
        </div>
      ))}

      {/* ── NEAR COMPLETION ── */}
      {nearComplete.length > 0 && (
        <>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2,color:"rgba(255,255,255,.4)",marginTop:20,marginBottom:10}}>
            📊 NEAR COMPLETION ({nearComplete.length})
          </div>
          {nearComplete.map(p => (
            <div key={p.uid} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
              background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.05)",borderRadius:10,marginBottom:4}}>
              <div style={{width:30,height:30,borderRadius:"50%",background:"rgba(255,255,255,.06)",
                display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Anton',sans-serif",
                fontSize:12,color:"rgba(255,255,255,.4)",overflow:"hidden",flexShrink:0}}>
                {p.user.avatar_url ? <img src={p.user.avatar_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/> : (p.user.name||"?")[0].toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:12,color:"rgba(255,255,255,.7)",letterSpacing:1}}>{p.user.name}</div>
              </div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.35)",fontWeight:600}}>
                {p.count}/{totalMatches}
              </div>
              <div style={{width:60,height:4,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden"}}>
                <div style={{width:`${Math.round(p.count/totalMatches*100)}%`,height:"100%",background:"rgba(255,255,255,.25)",borderRadius:2}}/>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── GIFT HISTORY ── */}
      {gifts.length > 0 && (
        <>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2,color:"rgba(255,255,255,.3)",marginTop:24,marginBottom:10}}>
            📜 GIFT HISTORY
          </div>
          {gifts.map(g => (
            <div key={g.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
              background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)",borderRadius:8,marginBottom:4}}>
              <span style={{fontSize:16}}>{g.gift_type === "giftcard" ? "🎁" : "🍽"}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,color:"rgba(255,255,255,.6)",letterSpacing:1}}>{users[g.user_id]?.name || "Unknown"}</div>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.25)"}}>{g.description}</div>
              </div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:"rgba(255,255,255,.15)"}}>
                {new Date(g.awarded_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </>
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
          <div class="footer-event">⚽ WORLD CUP 2026</div>
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
        <span className="admin-score-lbl">Final Score — filling this marks match as FINISHED and awards points</span>
        <div className="admin-score-inputs">
          <input className="admin-sinput admin-sinput-lg" type="number" min="0" max="20" value={ef.hs} onChange={efSet("hs")} placeholder="H" />
          <span className="admin-sep">–</span>
          <input className="admin-sinput admin-sinput-lg" type="number" min="0" max="20" value={ef.as} onChange={efSet("as")} placeholder="A" />
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

function AdminSponsorPerks({ users, sponsorGifts, onSetTier, onSaveGifts }) {
  const [subTab, setSubTab] = useState("users"); // "users" | "gifts" | "redeemed"
  const [search, setSearch] = useState("");
  const [gifts, setGifts]   = useState(sponsorGifts.map(g => ({ ...g, _key: g.id || Math.random() })));
  const [saving, setSaving] = useState(false);
  const [redemptions, setRedemptions] = useState([]); // [{user_id, user_name, tier, items, created_at}]
  const [loadingRed, setLoadingRed]   = useState(false);
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

  const addGift = (tier) => setGifts(g => [...g, { _key: Date.now(), tier, item_name:"", item_price:0, quantity:1 }]);
  const removeGift = (key) => setGifts(g => g.filter(x => x._key !== key));
  const updateGift = (key, field, val) => setGifts(g => g.map(x => x._key === key ? { ...x, [field]: val } : x));

  const handleSave = async () => {
    setSaving(true);
    await onSaveGifts(gifts.filter(g => g.item_name.trim()));
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
            Add free items per tier. Sponsors order these at no cost — goes straight to the bar.
          </div>
          {SPONSOR_TIERS.map(tier => {
            const m = TIER_META[tier];
            const tierGifts = gifts.filter(g => g.tier === tier);
            return (
              <div key={tier} style={{marginBottom:24}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:2,color:m.color}}>
                    {m.icon} {m.label} GIFTS
                  </div>
                  <button className="admin-add-btn" onClick={()=>addGift(tier)}>+ Add Item</button>
                </div>
                {tierGifts.length === 0 && (
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.3)",padding:"8px 0"}}>
                    No gifts configured for {m.label} yet.
                  </div>
                )}
                {tierGifts.map(g => (
                  <div key={g._key} className="admin-form-card" style={{marginBottom:8}}>
                    <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div className="admin-form-grid" style={{gridTemplateColumns:"1fr 80px"}}>
                          <AField label="Item Name" val={g.item_name} ph="e.g. Corona Beer"
                            on={e=>updateGift(g._key,"item_name",e.target.value)} />
                          <AField label="Qty" val={g.quantity} ph="1" type="number"
                            on={e=>updateGift(g._key,"quantity",e.target.value)} />
                        </div>
                      </div>
                      <button className="admin-del-btn" style={{marginTop:22,flexShrink:0}} onClick={()=>removeGift(g._key)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          <button className="admin-save-btn" style={{width:"100%",padding:14}} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save All Gift Packages"}
          </button>
        </div>
      )}

    </div>
  );
}

/* ── Onboarding Tutorial ── */
const ONBOARDING_KEY = "em_onboarding_v2";
const ONBOARDING_SLIDES = [
  {
    emoji: "⚽",
    title: "Welcome to El Mundo",
    sub: "WORLD CUP 2026 · BONAIRE",
    body: "The official prediction game & ordering app for El Mundo Bar-Rest. Predict match scores, order food & drinks from your table, and compete to top the leaderboard.",
    cta: null,
  },
  {
    emoji: "🎯",
    title: "Predict Every Match",
    sub: "MATCHES TAB",
    body: "Go to the Matches tab, pick any World Cup game, and enter your predicted home and away score. Save it. You can change predictions anytime before the deadline.",
    cta: null,
  },
  {
    emoji: "🏆",
    title: "How Points Work",
    sub: "SCORING SYSTEM",
    body: "Exact score correct → 5 pts\nCorrect winner (wrong score) → 1 pt\nDraw with wrong score → 0 pts\nWrong or missing prediction → 0 pts\n\nDeadline: 14:00 · June 11, 2026",
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

function OnboardingTutorial({ onDone }) {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);
  const touchStartX = useRef(null);
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
  const [table, setTable]       = useState("");
  const [tableErr, setTableErr] = useState("");
  const [cart, setCart]         = useState({});
  const [placing, setPlacing]   = useState(false);
  const [done, setDone]         = useState(false);
  const [showQRScan, setShowQRScan] = useState(false);
  // usedQty: how many of each gift_id the sponsor has already ordered (lifetime)
  const [usedQty, setUsedQty]   = useState({});
  const [loadingUsed, setLoadingUsed] = useState(true);
  const VALID_TABLES = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26];

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
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:22,letterSpacing:2,color:"#fff",marginBottom:8}}>
        ORDER SENT!
      </div>
      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:"rgba(255,255,255,.5)",marginBottom:32}}>
        Your complimentary gifts are on their way to Table {table}
      </div>
      <button onClick={() => { setDone(false); setCart({}); setTable(""); }}
        style={{width:"100%",padding:"14px 0",background:"#fff",color:"#000",border:"none",
          fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:3,cursor:"pointer",marginBottom:10}}>
        ORDER MORE GIFTS
      </button>
      <button onClick={() => window.location.href = "/"}
        style={{width:"100%",padding:"14px 0",background:"transparent",color:"rgba(255,255,255,.5)",
          border:"1px solid rgba(255,255,255,.15)",fontFamily:"'Anton',sans-serif",fontSize:13,
          letterSpacing:3,cursor:"pointer"}}>
        BACK TO HOME
      </button>
    </div>
  );

  const handleOrder = async () => {
    const t = parseInt(table.trim());
    if (isNaN(t) || !VALID_TABLES.includes(t)) { setTableErr("Please enter a valid table (1–26)"); return; }
    setTableErr("");
    if (cartItems.length === 0) { onToast && onToast("Add at least one item", false); return; }
    setPlacing(true);
    const ok = await placeOrder({
      tableNumber: String(t),
      items: cartItems.map(i => ({ id: String(i.id), name: i.item_name, price: 0, qty: i.qty })),
      total: 0,
      paymentMethod: "sponsor_gift",
    });
    setPlacing(false);
    if (ok) {
      // Update usedQty immediately so limits reflect right away
      setUsedQty(prev => {
        const next = { ...prev };
        cartItems.forEach(i => { next[String(i.id)] = (next[String(i.id)] || 0) + i.qty; });
        return next;
      });
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
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:3,color:"rgba(255,255,255,.35)",marginBottom:12}}>
            YOUR FREE GIFTS
          </div>
          {loadingUsed ? (
            <div style={{textAlign:"center",padding:24,color:"rgba(255,255,255,.3)",fontFamily:"'Outfit',sans-serif",fontSize:13}}>Loading…</div>
          ) : myGifts.map(g => {
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
                    {redeemed ? "Already redeemed" : `${remaining} left · $0.00`}
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
          })}

          {/* Table + Order */}
          <div style={{marginTop:24,borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:20}}>
            {showQRScan && <QRTableScanner onScan={t=>{setTable(t);setTableErr("");}} onClose={()=>setShowQRScan(false)} />}
            <div className="afield">
              <label className="afield-lbl">TABLE NUMBER</label>
              {table ? (
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",
                  background:"rgba(74,222,128,.07)",border:"1px solid rgba(74,222,128,.25)",borderRadius:10}}>
                  <span style={{fontSize:18}}>📍</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'Anton',sans-serif",fontSize:16,color:"#4ade80",letterSpacing:1}}>TABLE {table}</div>
                    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:1}}>Tap to change</div>
                  </div>
                  <button onClick={()=>setTable("")}
                    style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",
                      color:"rgba(255,255,255,.5)",borderRadius:6,padding:"4px 10px",
                      fontFamily:"'Outfit',sans-serif",fontSize:11,cursor:"pointer"}}>✕</button>
                </div>
              ) : (
                <button onClick={()=>setShowQRScan(true)}
                  style={{width:"100%",padding:"14px 16px",background:"rgba(255,215,0,.06)",
                    border:"1px solid rgba(255,215,0,.25)",borderRadius:10,cursor:"pointer",
                    display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                  <span style={{fontSize:22}}>📷</span>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:2,color:"#FFD700"}}>SCAN TABLE QR CODE</div>
                    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:1}}>Point camera at the QR code on your table</div>
                  </div>
                </button>
              )}
              {tableErr && <div style={{color:"rgba(239,68,68,.8)",fontFamily:"'Outfit',sans-serif",fontSize:12,marginTop:6}}>{tableErr}</div>}
            </div>
            {cartItems.length > 0 && (
              <div style={{marginTop:12,marginBottom:12,background:"rgba(255,255,255,.04)",
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
            <button className="order-place-btn" style={{background:`linear-gradient(135deg,${m.color},${m.color}cc)`,color:"#000"}}
              onClick={handleOrder} disabled={placing || cartItems.length === 0}>
              {placing ? "PLACING ORDER…" : `🎁 ORDER COMPLIMENTARY GIFTS`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Admin: Rooms ── */

/* ═══ GROUP ORDER VIEW ══════════════════════════════════════════════════════ */
function GroupOrderView({
  user, menuItems, myCredits,
  activeGroup, groupMembers, groupItems,
  createGroupOrder, joinGroupOrder, leaveGroupOrder,
  addGroupItem, removeGroupItem,
  setGroupPaymentMode, assignMyPaymentTo, unassignMyPayment,
  payGroupShareCredits, hostPayAllCredits,
  calcMyGroupShare,
  resetGroupToLobby,
  stripeCheckout, onToast, qrTable = "",
  gifts = [],
}) {
  const [screen, setScreen] = useState(qrTable ? "create" : "start"); // "start"|"create"|"join"|"lobby"|"checkout"|"payment"|"placed"
  const [joinCode, setJoinCode] = useState("");
  const [tableInput, setTableInput] = useState(qrTable);
  const [tableErr, setTableErr] = useState("");
  const [joinErr, setJoinErr] = useState("");
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [takenTables, setTakenTables] = useState([]);
  const [cancelNote, setCancelNote] = useState(false);
  const [paySecsLeft, setPaySecsLeft] = useState(null); // countdown for payment phase
  const [showQRScan, setShowQRScan] = useState(false);
  const [goMenuOpen, setGoMenuOpen] = useState(false);
  const [goMenuSection, setGoMenuSection] = useState("DRINKS");
  const [goMenuCat, setGoMenuCat] = useState("all");

  // 10-min payment countdown — starts when group enters awaiting_payment
  useEffect(() => {
    if (activeGroup?.status !== "awaiting_payment") { setPaySecsLeft(null); return; }
    const started = activeGroup.updated_at ? new Date(activeGroup.updated_at).getTime() : Date.now();
    const deadline = started + 10 * 60 * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setPaySecsLeft(left);
      if (left === 0) {
        supabase.from("group_orders").update({ status: "cancelled" }).eq("id", activeGroup.id);
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [activeGroup?.status, activeGroup?.updated_at]);

  // Auto-add unredeemed gifts to group order when entering lobby
  const addedGiftIdsRef = useRef(new Set());
  useEffect(() => {
    if (screen !== "lobby" || !activeGroup) return;
    gifts.forEach(g => {
      if (addedGiftIdsRef.current.has(g.id)) return;
      addedGiftIdsRef.current.add(g.id);
      addGroupItem({ id: g.id, name: (g.item_name || g.title || "Gift Item"), price: 0 });
    });
  }, [screen, activeGroup?.id, gifts.length]);

  // Redeem gifts when group order is placed
  useEffect(() => {
    if (screen !== "placed") return;
    const ids = [...addedGiftIdsRef.current];
    if (!ids.length) return;
    supabase.from("gifts").update({ redeemed: true, redeemed_at: new Date().toISOString(), redeemed_by: user.id })
      .in("id", ids).then(() => { addedGiftIdsRef.current.clear(); });
  }, [screen]);

  // Reset gift tracking when joining a new group
  useEffect(() => { addedGiftIdsRef.current.clear(); }, [activeGroup?.id]);

  // Auto-retry placing order when all members show paid but order still hasn't been placed
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (activeGroup?.status !== "awaiting_payment") return;
    if (!groupMembers.length) return;
    const allPaid = groupMembers.every(m => m.payment_status === "paid" || m.payment_status === "assigned");
    if (!allPaid) return;
    // Everyone is paid locally — retry every 3s in case last payer's checkAndPlace failed
    const iv = setInterval(async () => {
      const placed = await checkAndPlaceGroupOrder(activeGroup.id);
      if (placed) clearInterval(iv);
    }, 3000);
    return () => clearInterval(iv);
  }, [activeGroup?.status, groupMembers]);

  const manualRetryPlace = async () => {
    setRetrying(true);
    try { await checkAndPlaceGroupOrder(activeGroup.id); } finally { setRetrying(false); }
  };

  // Load taken tables whenever the create screen is shown
  useEffect(() => {
    if (screen !== "create") return;
    supabase.from("group_orders").select("table_number")
      .in("status", ["open", "awaiting_payment"])
      .then(({ data }) => setTakenTables(data ? data.map(r => String(r.table_number)) : []));
  }, [screen]);

  const isHost = activeGroup?.host_user_id === user.id;
  const myMember = groupMembers.find(m => m.user_id === user.id);
  const myShare = activeGroup ? calcMyGroupShare(user.id, groupMembers, groupItems) : 0;
  const groupTotal = groupItems.reduce((s, i) => s + i.price * i.qty, 0);
  const myItems = groupItems.filter(i => i.added_by_user_id === user.id);

  // Sync screen with activeGroup status
  useEffect(() => {
    if (!activeGroup) { setScreen("start"); return; }
    if (activeGroup.status === "placed") { setScreen("placed"); return; }
    if (activeGroup.status === "cancelled") {
      // Show a notification so non-host members know why they were kicked out
      if (activeGroup.host_user_id !== user.id) setCancelNote(true);
      leaveGroupOrder(); setScreen("start"); return;
    }
    if (activeGroup.status === "awaiting_payment") { setScreen("payment"); return; }
    setScreen("lobby");
  }, [activeGroup?.status]);

  // Auto-dismiss the placed screen after 5 seconds if the user doesn't press a button.
  // This clears activeGroup so the Menu tab stops showing the "GROUP ORDER ACTIVE" banner.
  useEffect(() => {
    if (activeGroup?.status !== "placed") return;
    const t = setTimeout(() => { leaveGroupOrder(); }, 5000);
    return () => clearTimeout(t);
  }, [activeGroup?.id, activeGroup?.status]);

  const handleCreate = async () => {
    if (!tableInput.trim() || isNaN(+tableInput) || +tableInput < 1 || +tableInput > 26) {
      setTableErr("Enter a valid table number (1–26)"); return;
    }
    setTableErr("");
    setBusy(true);
    try { await createGroupOrder(tableInput.trim()); } finally { setBusy(false); }
  };

  const handleJoin = async () => {
    if (joinCode.trim().length < 4) { setJoinErr("Enter the join code"); return; }
    setJoinErr("");
    setBusy(true);
    try { await joinGroupOrder(joinCode.trim()); } finally { setBusy(false); }
  };

  const handleJoinByTable = async (tableNum) => {
    setBusy(true);
    setJoinErr("");
    try {
      const { data } = await supabase
        .from("group_orders")
        .select("code, table_number")
        .eq("table_number", String(tableNum))
        .in("status", ["open", "awaiting_payment"])
        .maybeSingle();
      if (!data) {
        // Nobody has started one yet — this user becomes the host automatically
        await createGroupOrder(tableNum);
      } else {
        await joinGroupOrder(data.code);
      }
    } catch(e) {
      setJoinErr("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(activeGroup?.code || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Guard: if activeGroup is null but we're still on an active screen, wait for the useEffect to reset screen
  if (!activeGroup && !["start","create","join"].includes(screen)) return null;

  // ── SCREEN: START (no active group) ──
  if (screen === "start") return (
    <div style={{padding:"24px 16px"}}>
      {cancelNote && (
        <div style={{background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.3)",borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:"'Outfit',sans-serif"}}>
          <div>
            <div style={{fontWeight:600,color:"#f87171",fontSize:13,marginBottom:2}}>Group order was cancelled</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.5)"}}>The host cancelled the group order.</div>
          </div>
          <button onClick={() => setCancelNote(false)} style={{background:"none",border:"none",color:"#888",fontSize:18,cursor:"pointer",padding:"0 4px"}}>✕</button>
        </div>
      )}
      <div className="go-hero">
        <div className="go-hero-icon">👥</div>
        <div className="go-hero-title">GROUP ORDER</div>
        <div className="go-hero-sub">Order together, pay your way</div>
      </div>
      <div className="go-how">
        {[
          ["1","Start or join a group order"],
          ["2","Everyone adds their items"],
          ["3","Choose who pays — split or one pays all"],
          ["4","Order goes to the bar when paid"],
        ].map(([n, t]) => (
          <div key={n} className="go-how-row">
            <div className="go-how-num">{n}</div>
            <div className="go-how-txt">{t}</div>
          </div>
        ))}
      </div>
      {/* If came via table QR — offer smart join first */}
      {qrTable ? (
        <>
          <button className="go-btn-primary" disabled={busy}
            onClick={() => handleJoinByTable(qrTable)}>
            {busy ? "CONNECTING…" : `📷 JOIN / START TABLE ${qrTable} ORDER`}
          </button>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.35)",textAlign:"center",marginTop:6}}>
            Joins existing order or starts a new one for Table {qrTable}
          </div>
          {joinErr && <div style={{color:"rgba(239,68,68,.8)",fontFamily:"'Outfit',sans-serif",fontSize:12,marginTop:8,textAlign:"center"}}>{joinErr}</div>}
        </>
      ) : (
        <>
          <button className="go-btn-primary" onClick={() => setScreen("create")}>
            + START GROUP ORDER
          </button>
          <button className="go-btn-secondary" style={{marginTop:10}} onClick={() => setScreen("join")}>
            JOIN WITH CODE
          </button>
        </>
      )}
    </div>
  );

  // ── SCREEN: CREATE ──
  if (screen === "create") return (
    <div style={{padding:"24px 16px"}}>
      {showQRScan && <QRTableScanner onScan={t=>{setTableInput(t);setTableErr("");}} onClose={()=>setShowQRScan(false)} />}
      <button className="go-back-btn" onClick={() => setScreen("start")}>← Back</button>
      <div className="go-section-title">START GROUP ORDER</div>
      <label className="afield-lbl" style={{display:"block",margin:"8px 0 12px"}}>YOUR TABLE</label>
      {tableInput ? (
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",marginBottom:12,
          background:"rgba(74,222,128,.07)",border:"1px solid rgba(74,222,128,.25)",borderRadius:10}}>
          <span style={{fontSize:18}}>📍</span>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:16,color:"#4ade80",letterSpacing:1}}>TABLE {tableInput}</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:1}}>Scanned from table QR code</div>
          </div>
          <button onClick={()=>setTableInput("")}
            style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",
              color:"rgba(255,255,255,.5)",borderRadius:6,padding:"4px 10px",
              fontFamily:"'Outfit',sans-serif",fontSize:11,cursor:"pointer"}}>✕</button>
        </div>
      ) : (
        <button onClick={()=>setShowQRScan(true)}
          style={{width:"100%",padding:"14px 16px",marginBottom:12,background:"rgba(255,215,0,.06)",
            border:"1px solid rgba(255,215,0,.25)",borderRadius:10,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          <span style={{fontSize:22}}>📷</span>
          <div style={{textAlign:"left"}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:2,color:"#FFD700"}}>SCAN TABLE QR CODE</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:1}}>Point camera at the QR code on your table</div>
          </div>
        </button>
      )}
      {tableErr && <div style={{color:"rgba(239,68,68,.8)",fontFamily:"'Outfit',sans-serif",fontSize:13,marginBottom:8}}>{tableErr}</div>}
      <button className="go-btn-primary" style={{marginTop:8}} disabled={!tableInput || busy} onClick={handleCreate}>
        {busy ? "CREATING…" : "CREATE GROUP ORDER"}
      </button>
    </div>
  );

  // ── SCREEN: JOIN ──
  if (screen === "join") return (
    <div style={{padding:"24px 16px"}}>
      {showQRScan && (
        <QRTableScanner
          onScan={t => { setShowQRScan(false); handleJoinByTable(t); }}
          onClose={() => setShowQRScan(false)} />
      )}
      <button className="go-back-btn" onClick={() => setScreen("start")}>← Back</button>
      <div className="go-section-title">JOIN GROUP ORDER</div>

      {/* Primary — scan QR */}
      <button onClick={() => setShowQRScan(true)}
        style={{width:"100%",padding:"16px",marginBottom:20,background:"rgba(255,215,0,.06)",
          border:"1px solid rgba(255,215,0,.25)",borderRadius:12,cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
        <span style={{fontSize:26}}>📷</span>
        <div style={{textAlign:"left"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,letterSpacing:2,color:"#FFD700"}}>SCAN TABLE QR CODE</div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>Instantly joins the group order at your table</div>
        </div>
      </button>

      {/* Divider */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <div style={{flex:1,height:1,background:"rgba(255,255,255,.08)"}} />
        <span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.3)"}}>OR ENTER CODE MANUALLY</span>
        <div style={{flex:1,height:1,background:"rgba(255,255,255,.08)"}} />
      </div>

      {/* Fallback — manual code */}
      <input className="ffield-inp" type="text" placeholder="Enter code e.g. X7K2QP"
        value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
        style={{width:"100%",fontSize:24,textAlign:"center",padding:"14px",letterSpacing:8,marginBottom:8}} />
      {joinErr && <div style={{color:"rgba(239,68,68,.8)",fontFamily:"'Outfit',sans-serif",fontSize:13,marginBottom:8}}>{joinErr}</div>}
      <button className="go-btn-primary" style={{marginTop:4}} disabled={busy || joinCode.trim().length < 4} onClick={handleJoin}>
        {busy ? "JOINING…" : "JOIN WITH CODE"}
      </button>
    </div>
  );

  // ── SCREEN: PLACED ──
  if (screen === "placed" || activeGroup?.status === "placed") return (
    <div style={{padding:"40px 16px",textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:12}}>🎉</div>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:26,color:"#4ade80",letterSpacing:2,marginBottom:8}}>ORDER PLACED!</div>
      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:15,color:"rgba(255,255,255,.6)",lineHeight:1.6,marginBottom:8}}>
        Your waiter will bring everything to
      </div>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:32,color:"#fff",letterSpacing:2,marginBottom:8}}>
        TABLE {activeGroup?.table_number}
      </div>
      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:"rgba(255,255,255,.35)",marginBottom:40}}>
        Sit back and enjoy! ⚽
      </div>
      <button className="go-btn-primary" style={{marginBottom:12}} onClick={() => { leaveGroupOrder(); }}>
        + START NEW GROUP ORDER
      </button>
      <button className="go-btn-secondary" onClick={() => { leaveGroupOrder(); }}>
        DONE — CLOSE
      </button>
    </div>
  );

  // ── SCREEN: LOBBY (open — adding items) ──
  if (screen === "lobby") return (
    <div style={{paddingBottom:24}}>
      {/* Header */}
      <div className="go-header">
        <div>
          <div className="go-code-label">JOIN CODE</div>
          <div className="go-code">{activeGroup.code}</div>
        </div>
        <button className="go-copy-btn" onClick={handleCopyCode}>
          {copied ? "✓ COPIED" : "COPY CODE"}
        </button>
      </div>
      <div className="go-table-row">Table {activeGroup.table_number} · {groupMembers.length} {groupMembers.length === 1 ? "member" : "members"}</div>

      {/* Members */}
      <div className="go-section-title" style={{padding:"16px 16px 8px"}}>MEMBERS</div>
      {groupMembers.map(m => {
        const mItems = groupItems.filter(i => i.added_by_user_id === m.user_id);
        const mTotal = mItems.reduce((s, i) => s + i.price * i.qty, 0);
        return (
          <div key={m.id} className="go-member-row">
            <div className="go-member-info">
              <span className="go-member-name">{m.display_name || "Guest"}</span>
              {m.user_id === activeGroup.host_user_id && <span className="go-host-badge">HOST</span>}
              {m.user_id === user.id && <span className="go-you-badge">YOU</span>}
            </div>
            <div className="go-member-items">
              {mItems.length === 0 ? (
                <span style={{color:"rgba(255,255,255,.3)",fontSize:12}}>no items yet</span>
              ) : (
                mItems.map(i => (
                  <div key={i.id} className="go-item-row">
                    <span className="go-item-name">{i.item_name}</span>
                    {m.user_id === user.id && activeGroup.status === "open" && (
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <button className="go-qty-btn" onClick={() => removeGroupItem(i.id)}>−</button>
                        <span className="go-qty-val">×{i.qty}</span>
                        <button className="go-qty-btn" onClick={() => addGroupItem({ id: i.item_id, name: i.item_name, price: i.price })}>+</button>
                      </div>
                    )}
                    {m.user_id !== user.id && <span className="go-qty-val">×{i.qty}</span>}
                    <span className="go-item-price">${(i.price * i.qty).toFixed(2)}</span>
                  </div>
                ))
              )}
              {mItems.length > 0 && <div className="go-member-subtotal">Subtotal: ${mTotal.toFixed(2)}</div>}
            </div>
          </div>
        );
      })}

      {/* Auto-included gifts notice */}
      {gifts.length > 0 && (
        <div style={{margin:"0 16px 8px",padding:"10px 14px",background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.3)",borderRadius:8,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>🎁</span>
          <div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:1.5,color:"#fbbf24",marginBottom:2}}>GIFTS INCLUDED</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.55)"}}>
              {gifts.map(g => g.item_name || g.title || "Gift").join(", ")} · automatically added for free
            </div>
          </div>
        </div>
      )}

      {/* Add items button */}
      <div style={{padding:"12px 16px"}}>
        <button className="go-open-menu-btn" onClick={() => { setGoMenuOpen(true); setGoMenuCat("all"); }}>
          <span style={{fontSize:20,lineHeight:1}}>＋</span>
          <span>ADD ITEMS TO ORDER</span>
          {groupItems.length > 0 && (
            <span className="go-open-menu-badge">{groupItems.reduce((s,i)=>s+i.qty,0)}</span>
          )}
        </button>
      </div>

      {/* Group Menu Modal — rendered via portal to escape any parent transforms */}
      {goMenuOpen && createPortal((() => {
        const available = menuItems.filter(i => i.available);
        const goSections = MENU_SECTIONS.map(s => ({
          ...s,
          cats: s.cats.map(c => ({ ...c, items: available.filter(i => i.category === c.id) })).filter(c => c.items.length > 0),
        })).filter(s => s.cats.length > 0);
        const activeSec = goSections.find(s => s.section === goMenuSection) || goSections[0];
        const visibleCatsGo = activeSec ? activeSec.cats : [];
        const filtered = goMenuCat === "all"
          ? (activeSec ? activeSec.cats.flatMap(c => c.items) : [])
          : available.filter(i => i.category === goMenuCat);
        return (
          <div className="go-modal-overlay" onClick={() => setGoMenuOpen(false)}>
            <div className="go-modal-panel" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="go-modal-header">
                <div className="go-modal-title">ADD ITEMS</div>
                <button className="go-modal-close" onClick={() => setGoMenuOpen(false)}>✕</button>
              </div>
              {/* Section toggle: DRINKS / FOOD */}
              <div className="go-modal-section-toggle">
                {goSections.map(sec => (
                  <button key={sec.section}
                    className={`go-modal-sec-btn ${goMenuSection === sec.section ? "go-modal-sec-on" : ""}`}
                    onClick={() => { setGoMenuSection(sec.section); setGoMenuCat("all"); }}>
                    <span>{sec.section === "DRINKS" ? "🍹" : "🍽"}</span>
                    <span>{sec.section}</span>
                  </button>
                ))}
              </div>
              {/* Sub-category pills */}
              <div className="go-modal-cats">
                <button className={`go-modal-cat-pill${goMenuCat === "all" ? " go-modal-cat-on" : ""}`}
                  onClick={() => setGoMenuCat("all")}>ALL</button>
                {visibleCatsGo.map(c => (
                  <button key={c.id} className={`go-modal-cat-pill${goMenuCat === c.id ? " go-modal-cat-on" : ""}`}
                    onClick={() => setGoMenuCat(c.id)}>
                    <span style={{fontSize:13}}>{c.icon}</span> {c.label.toUpperCase()}
                  </button>
                ))}
              </div>
              {/* Item count label */}
              <div style={{padding:"8px 16px 0",fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.3)",letterSpacing:1.5}}>
                {filtered.length} ITEM{filtered.length !== 1 ? "S" : ""}
              </div>
              {/* Items list */}
              <div className="go-modal-body">
                {filtered.map(item => {
                  const st = (item.serving_type || "").toLowerCase();
                  const isBucket = st === "bucket" || (!st && /bucket/i.test(item.name + (item.description||"")));
                  const isGlass  = st === "glass"  || (!st && /glass/i.test(item.name  + (item.description||"")));
                  const isBottle = st === "bottle" || (!st && /bottle/i.test(item.name + (item.description||"")));
                  const isDraft  = st === "draft"  || (!st && /draft/i.test(item.name  + (item.description||"")));
                  const myQty = groupItems.filter(gi => gi.added_by_user_id === user.id && gi.item_id === item.id).reduce((s,gi)=>s+gi.qty,0);
                  return (
                    <div key={item.id} className="go-modal-item">
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
                          <span className="go-menu-name">{item.name}</span>
                          {isBucket && <span className="menu-badge menu-badge-gold">🪣 BUCKET</span>}
                          {isGlass   && <span className="menu-badge menu-badge-blue">🍷 GLASS</span>}
                          {isBottle  && <span className="menu-badge menu-badge-blue">🍾 BOTTLE</span>}
                          {isDraft   && <span className="menu-badge menu-badge-amber">🍺 DRAFT</span>}
                        </div>
                        {item.description && <div className="go-menu-desc">{item.description}</div>}
                        <div className="go-menu-price">${(+item.price).toFixed(2)}</div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0}}>
                        <button className="go-modal-add-btn" onClick={() => addGroupItem(item)}>+ ADD</button>
                        {myQty > 0 && <span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.45)"}}>×{myQty} added</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Done button */}
              <div className="go-modal-footer">
                <button className="go-btn-primary" onClick={() => setGoMenuOpen(false)}>
                  DONE — {groupItems.reduce((s,i)=>s+i.qty,0)} item{groupItems.reduce((s,i)=>s+i.qty,0)!==1?"s":""} · ${groupTotal.toFixed(2)}
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* Total + checkout */}
      <div className="go-footer">
        <div className="go-footer-total">
          <span>GROUP TOTAL</span>
          <span>${groupTotal.toFixed(2)}</span>
        </div>
        {isHost && activeGroup.status === "open" && (
          <button className="go-btn-primary" style={{marginTop:12}}
            disabled={groupItems.length === 0}
            onClick={() => setScreen("checkout")}>
            PROCEED TO CHECKOUT →
          </button>
        )}
        {!isHost && activeGroup.status === "open" && (
          <div style={{textAlign:"center",fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.4)",marginTop:12,padding:"10px 0"}}>
            Waiting for host to start checkout…
          </div>
        )}
        <button className="go-btn-leave" style={{marginTop:10}} onClick={leaveGroupOrder}>
          {isHost ? "CANCEL GROUP ORDER" : "LEAVE GROUP ORDER"}
        </button>
      </div>
    </div>
  );

  // ── SCREEN: CHECKOUT (host picks payment mode) ──
  if (screen === "checkout" && isHost) return (
    <div style={{padding:"24px 16px"}}>
      <button className="go-back-btn" onClick={() => setScreen("lobby")}>← Back</button>
      <div className="go-section-title">CHOOSE PAYMENT MODE</div>
      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:"rgba(255,255,255,.5)",marginBottom:20,lineHeight:1.6}}>
        How does your group want to pay?
      </div>
      <div className="go-pay-mode-card" onClick={() => setGroupPaymentMode("host")}>
        <div className="go-pay-mode-icon">💳</div>
        <div>
          <div className="go-pay-mode-title">I'LL PAY FOR EVERYONE</div>
          <div className="go-pay-mode-sub">You cover the full bill · ${groupTotal.toFixed(2)}</div>
        </div>
        <div className="go-pay-mode-arrow">→</div>
      </div>
      <div className="go-pay-mode-card" style={{marginTop:10}} onClick={() => setGroupPaymentMode("individual")}>
        <div className="go-pay-mode-icon">🤝</div>
        <div>
          <div className="go-pay-mode-title">EVERYONE PAYS THEIR OWN</div>
          <div className="go-pay-mode-sub">Each person pays their share separately</div>
        </div>
        <div className="go-pay-mode-arrow">→</div>
      </div>
    </div>
  );

  // ── SCREEN: PAYMENT (awaiting_payment) ──
  if (screen === "payment") {
    const anyPaid = groupMembers.some(m => m.payment_status === "paid");
    const timerMins = paySecsLeft !== null ? Math.floor(paySecsLeft / 60) : null;
    const timerSecs = paySecsLeft !== null ? paySecsLeft % 60 : null;
    const timerUrgent = paySecsLeft !== null && paySecsLeft <= 120;
    const timerDisplay = paySecsLeft !== null
      ? `${timerMins}:${String(timerSecs).padStart(2,"0")}`
      : null;

    const PayTimer = timerDisplay ? (
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",marginBottom:12,background:timerUrgent?"rgba(239,68,68,.12)":"rgba(251,191,36,.08)",border:`1px solid ${timerUrgent?"rgba(239,68,68,.4)":"rgba(251,191,36,.3)"}`,borderRadius:10}}>
        <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:timerUrgent?"#f87171":"rgba(255,255,255,.5)"}}>Complete payment or order cancels</span>
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:18,letterSpacing:2,color:timerUrgent?"#f87171":"#fbbf24"}}>{timerDisplay}</span>
      </div>
    ) : null;

    // HOST PAYS ALL
    if (activeGroup?.payment_mode === "host" && isHost) {
      const alreadyPaid = myMember?.payment_status === "paid";
      return (
        <div style={{padding:"24px 16px"}}>
          {PayTimer}
          {!anyPaid && (
            <button className="go-btn-secondary" style={{marginBottom:16,padding:"8px 16px",fontSize:11}}
              onClick={resetGroupToLobby}>
              ← BACK TO ORDER
            </button>
          )}
          <div className="go-section-title">PAY FOR EVERYONE</div>
          <div className="go-pay-summary">
            {groupMembers.map(m => {
              const mTotal = groupItems.filter(i => i.added_by_user_id === m.user_id).reduce((s,i)=>s+i.price*i.qty,0);
              return (
                <div key={m.id} className="go-pay-row">
                  <span>{m.display_name}{m.user_id === user.id ? " (you)" : ""}</span>
                  <span>${mTotal.toFixed(2)}</span>
                </div>
              );
            })}
            <div className="go-pay-total-row"><span>TOTAL</span><span>${groupTotal.toFixed(2)}</span></div>
          </div>
          {alreadyPaid ? (
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:15,color:"#4ade80",marginBottom:12}}>✅ Payment confirmed — waiting for order to be placed…</div>
              <button onClick={manualRetryPlace} disabled={retrying}
                style={{fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:1.5,padding:"10px 20px",background:"rgba(74,222,128,.15)",border:"1px solid rgba(74,222,128,.5)",color:"#4ade80",borderRadius:8,cursor:"pointer",opacity:retrying?.6:1}}>
                {retrying ? "CHECKING…" : "🔄 PLACE ORDER NOW"}
              </button>
            </div>
          ) : (
            <>
              <div className="go-section-title" style={{marginBottom:12}}>PAY ${groupTotal.toFixed(2)}</div>
              <button className="go-btn-primary" style={{marginBottom:10}}
                disabled={paying || myCredits < groupTotal}
                onClick={async () => { setPaying(true); try { await hostPayAllCredits(); } finally { setPaying(false); } }}>
                {paying ? "PROCESSING..." : `PAY WITH CREDITS · $${groupTotal.toFixed(2)}`}
              </button>
              {myCredits < groupTotal && (
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"#f87171",marginBottom:10}}>
                  Not enough credits (balance: ${myCredits.toFixed(2)})
                </div>
              )}
              <button className="go-btn-primary stripe-pay-btn" style={{marginBottom:10}}
                disabled={paying}
                onClick={() => stripeCheckout({
                  type: "group_host_payment",
                  groupOrderId: activeGroup.id,
                  userId: user.id,
                  userEmail: user.email,
                  items: [{ name: "Group Order", qty: 1, price: groupTotal }],
                  total: groupTotal,
                })}>
                PAY VIA CARD · ${groupTotal.toFixed(2)}
              </button>
            </>
          )}
        </div>
      );
    }

    // HOST PAYS ALL — non-host sees waiting screen
    if (activeGroup?.payment_mode === "host" && !isHost) {
      const hostPaid = groupMembers.find(m => m.user_id === activeGroup.host_user_id)?.payment_status === "paid";
      return (
        <div style={{padding:"40px 16px",textAlign:"center"}}>
          {PayTimer}
          <div style={{fontSize:48,marginBottom:16}}>{hostPaid ? "✅" : "⏳"}</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:18,letterSpacing:2,color:"#fff",marginBottom:8}}>
            {hostPaid ? "Payment confirmed!" : "Waiting for host to pay…"}
          </div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:"rgba(255,255,255,.5)"}}>
            {hostPaid ? "Your order is being placed." : "The host is covering the full bill."}
          </div>
        </div>
      );
    }

    // INDIVIDUAL PAYMENTS
    if (activeGroup?.payment_mode === "individual") {
      const isPaid = myMember?.payment_status === "paid";
      const isAssigned = myMember?.payment_status === "assigned";
      const myPayer = isAssigned ? groupMembers.find(m => m.user_id === myMember.pay_for_user_id) : null;
      const otherMembers = groupMembers.filter(m => m.user_id !== user.id);

      return (
        <div style={{padding:"16px"}}>
          {PayTimer}
          {isHost && !anyPaid && (
            <button className="go-btn-secondary" style={{marginBottom:16,padding:"8px 16px",fontSize:11}}
              onClick={resetGroupToLobby}>
              ← BACK TO ORDER
            </button>
          )}
          <div className="go-section-title" style={{marginBottom:12}}>PAYMENT STATUS</div>
          <div className="go-pay-summary" style={{marginBottom:20}}>
            {groupMembers.map(m => {
              const assignedToM = groupMembers.filter(x => x.pay_for_user_id === m.user_id).map(x => x.user_id);
              const payingFor = [m.user_id, ...assignedToM];
              const share = groupItems.filter(i => payingFor.includes(i.added_by_user_id)).reduce((s,i)=>s+i.price*i.qty,0);
              const badge = m.payment_status === "paid" ? "✅" : m.payment_status === "assigned" ? "→" : "⏳";
              return (
                <div key={m.id} className="go-pay-row">
                  <span>{badge} {m.display_name}{m.user_id === user.id ? " (you)" : ""}
                    {m.payment_status === "assigned" && myPayer ? ` → paid by ${myPayer.display_name}` : ""}
                  </span>
                  <span style={{color: m.payment_status==="paid" ? "#4ade80" : "inherit"}}>${share.toFixed(2)}</span>
                </div>
              );
            })}
          </div>

          {!isPaid && !isAssigned && (
            <>
              <div className="go-section-title" style={{marginBottom:8}}>YOUR SHARE · ${myShare.toFixed(2)}</div>

              {/* Assign to someone else — only show unpaid members who aren't already paying for someone else */}
              {otherMembers.filter(m => m.payment_status !== "paid").length > 0 && (
                <div style={{marginBottom:16}}>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.4)",marginBottom:8,letterSpacing:1}}>ASSIGN TO SOMEONE ELSE</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                    {otherMembers.filter(m => m.payment_status !== "paid").map(m => (
                      <button key={m.id} className="go-assign-btn"
                        onClick={() => assignMyPaymentTo(m.user_id)}>
                        {m.display_name} pays for me
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button className="go-btn-primary" style={{marginBottom:10}}
                disabled={paying || myCredits < myShare}
                onClick={async () => { setPaying(true); try { await payGroupShareCredits(); } finally { setPaying(false); } }}>
                {paying ? "PROCESSING..." : `PAY WITH CREDITS · $${myShare.toFixed(2)}`}
              </button>
              {myCredits < myShare && (
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"#f87171",marginBottom:10}}>
                  Not enough credits (balance: ${myCredits.toFixed(2)})
                </div>
              )}
              <button className="go-btn-primary stripe-pay-btn" style={{marginBottom:10}}
                disabled={paying}
                onClick={() => stripeCheckout({
                  type: "group_individual_payment",
                  groupOrderId: activeGroup.id,
                  userId: user.id,
                  userEmail: user.email,
                  items: [{ name: "My Group Share", qty: 1, price: myShare }],
                  total: myShare,
                })}>
                PAY MY SHARE VIA CARD · ${myShare.toFixed(2)}
              </button>
            </>
          )}

          {isAssigned && (
            <div style={{padding:"16px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:4,marginBottom:16}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:"rgba(255,255,255,.7)",marginBottom:8}}>
                {myPayer
                  ? <>{myPayer.display_name} is paying for you (${myShare.toFixed(2)})</>
                  : <span style={{color:"#f87171"}}>Your assigned payer has left the group — you need to pay yourself.</span>
                }
              </div>
              <button className="go-btn-secondary" style={{padding:"8px 16px",fontSize:11}}
                onClick={unassignMyPayment}>
                PAY MYSELF INSTEAD
              </button>
            </div>
          )}

          {isPaid && (
            <div style={{textAlign:"center",padding:"16px 0"}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:15,color:"#4ade80",marginBottom:12}}>✅ Your payment is confirmed!</div>
              {groupMembers.every(m => m.payment_status === "paid" || m.payment_status === "assigned") && (
                <button onClick={manualRetryPlace} disabled={retrying}
                  style={{fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:1.5,padding:"10px 20px",background:"rgba(74,222,128,.15)",border:"1px solid rgba(74,222,128,.5)",color:"#4ade80",borderRadius:8,cursor:"pointer",opacity:retrying?.6:1}}>
                  {retrying ? "CHECKING…" : "🔄 ALL PAID — PLACE ORDER NOW"}
                </button>
              )}
            </div>
          )}
        </div>
      );
    }
  }

  return null;
}

function MenuView({ user, menuItems, myCredits, myOrders, onPlaceOrder, onCancelOrder,
  activeGroup, groupMembers, groupItems,
  createGroupOrder, joinGroupOrder, leaveGroupOrder,
  addGroupItem, removeGroupItem,
  setGroupPaymentMode, assignMyPaymentTo, unassignMyPayment,
  payGroupShareCredits, hostPayAllCredits,
  calcMyGroupShare,
  resetGroupToLobby, printOrderReceipt, stripeCheckout, onToast, qrTable = "",
  gifts = [], pendingGiftItems = [], onClearPendingGifts = () => {},
  isOutside = false, outdoorZone = null, onChangeLocation = ()=>{}, onChangeZone = ()=>{},
  outdoorZones = [], printOutdoorReceipt = ()=>{}, setMyCredits = ()=>{} }) {
  const { t } = useLang();
  const [cart,        setCart]        = useState({});
  const [cartNotes,   setCartNotes]   = useState({}); // { [itemId]: noteString }
  const [noteOpen,    setNoteOpen]    = useState({}); // { [itemId]: bool }
  const [tab,         setTab]         = useState("menu");
  const [table,       setTable]       = useState(qrTable);
  const [placing,     setPlacing]     = useState(false);
  const [tableErr,    setTableErr]    = useState("");
  const [topupAmt,    setTopupAmt]    = useState("");
  const [cartPayMethod, setCartPayMethod] = useState("credits"); // "credits" | "card"
  const [showQRScan,  setShowQRScan]  = useState(false);
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false);
  const [pendingPayMethod,   setPendingPayMethod]   = useState("credits");
  /* ── gift cart: free drink/food gifts added from My Gifts ── */
  const [giftCart, setGiftCart] = useState([]); // [{ giftId, name }]

  const available  = menuItems.filter(i => i.available);
  const [activeCat, setActiveCat] = useState(null);
  const [activeSection, setActiveSection] = useState("DRINKS");
  const sectionRefs = useRef({});
  const pillsRef    = useRef(null);
  // Group available items by category in defined order
  const menuSections = MENU_SECTIONS.map(s => ({
    ...s,
    cats: s.cats.map(c => ({ ...c, items: available.filter(i => i.category === c.id) }))
               .filter(c => c.items.length > 0),
  })).filter(s => s.cats.length > 0);
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

  // All valid table numbers in the bar
  const VALID_TABLES = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26];
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
    if (!isOutside && !table.trim()) {
      setTableErr("Please select your table");
      onToast?.("⚠ Please scan a table QR code first", false);
      tableRef.current?.scrollIntoView({ behavior:"smooth", block:"center" });
      return;
    }
    if (isOutside && !outdoorZone) { onChangeZone(); return; }
    setPendingPayMethod(payMethod);
    if (isOutside) { if (payMethod === "credits") handleOrder(); else handleStripeOrder(); return; }
    setShowOrderTypeModal(true);
  };

  const handleOrderTypeChoice = (type) => {
    setShowOrderTypeModal(false);
    if (type === "group") { setTab("group"); return; }
    if (pendingPayMethod === "credits") handleOrder();
    else handleStripeOrder();
  };

  const tableRef = useRef(null);
  const handleOrder = async () => {
    // Outdoor: use zone as table, skip table validation
    if (isOutside) {
      if (!outdoorZone) { onChangeZone(); return; }
      if (placingRef.current) return;
      placingRef.current = true;
      setPlacing(true);
      try {
        const allItems = [
          ...cartItems.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty, category:i.category||"", ...(cartNotes[i.id]?{note:cartNotes[i.id]}:{}) })),
          ...giftCartItems.map(i => ({ id:i.id, name:i.name, price:0, qty:1, category:"gift", note:"🎁 Gift redemption" })),
        ];
        const total = +cartTotal.toFixed(2);
        const paymentMethod = total === 0 ? "sponsor_gift" : "credits";
        // Deduct credits first if needed
        if (paymentMethod === "credits") {
          const { data: newBal, error: deductErr } = await supabase.rpc("deduct_credits", { p_user_id: user.id, p_amount: total });
          if (deductErr) {
            onToast?.(deductErr.message?.includes("insufficient_balance") ? "Not enough credits" : "Payment error", false);
            return;
          }
          setMyCredits(newBal);
        }
        // Insert as completed immediately — no staff confirmation needed for outdoor
        const { error } = await supabase.from("orders").insert({
          user_id: user.id, user_name: user.name,
          table_number: `OUT-${outdoorZone.id}`,
          items: allItems, total, payment_method: paymentMethod, status: "completed",
        });
        if (error) {
          if (paymentMethod === "credits") {
            const { data: refundBal } = await supabase.rpc("add_credits", { p_user_id: user.id, p_amount: total });
            if (refundBal != null) setMyCredits(refundBal);
          }
          onToast?.("Error placing order", false); return;
        }
        if (giftCartItems.length > 0) {
          try { await supabase.from("gifts").update({ redeemed:true, redeemed_at:new Date().toISOString(), redeemed_by:user.id }).in("id", giftCartItems.map(g => g.giftId)); } catch(e) {}
        }
        onToast?.("Order sent! 🍺");
        try { navigator.vibrate?.([80, 40, 80, 40, 120]); } catch {}
        clearCart(); setGiftCart([]); setTab("orders");
      } finally { placingRef.current = false; setPlacing(false); }
      return;
    }
    if (!table.trim()) { setTableErr("Please select your table"); onToast?.("⚠ Please select your table first"); tableRef.current?.scrollIntoView({ behavior:"smooth", block:"center" }); return; }
    const tableNum = parseInt(table.trim());
    if (isNaN(tableNum) || !VALID_TABLES.includes(tableNum)) {
      setTableErr(`Table ${table} doesn't exist. Valid tables: 1–26`); return;
    }
    setTableErr("");
    if (placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    try {
      const ok = await onPlaceOrder({
        tableNumber: String(tableNum),
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
    if (isOutside) {
      if (!outdoorZone) { onChangeZone(); return; }
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
          user_id: user.id, user_name: user.name,
          table_number: `OUT-${outdoorZone.id}`,
          items: allItems, total: +cartTotal.toFixed(2),
          payment_method: "card_pending", status: "pending",
        }).select().single();
        if (error || !ord) { onToast("Error creating order", false); return; }
        newOrder = ord;
        if (giftCartItems.length > 0) {
          try { await supabase.from("gifts").update({ redeemed:true, redeemed_at:new Date().toISOString(), redeemed_by:user.id })
            .in("id", giftCartItems.map(g => g.giftId)); } catch(e) {}
        }
      } catch(e) { onToast("Error creating order", false); return; }
      finally { placingRef.current = false; setPlacing(false); }
      clearCart(); setGiftCart([]);
      stripeCheckout({ type:"order", orderId:newOrder.id, userId:user.id, userEmail:user.email,
        items:cartItems.map(i=>({name:i.name,qty:i.qty,price:i.price})), total:+cartTotal.toFixed(2) });
      setCartNotes({}); setNoteOpen({});
      return;
    }
    if (!table.trim()) { setTableErr("Please select your table"); onToast?.("⚠ Please select your table first"); tableRef.current?.scrollIntoView({ behavior:"smooth", block:"center" }); return; }
    const tableNum = parseInt(table.trim());
    if (isNaN(tableNum) || !VALID_TABLES.includes(tableNum)) {
      setTableErr(`Table ${table} doesn't exist. Valid tables: 1–26`); return;
    }
    setTableErr("");
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
        table_number: String(tableNum),
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
    // Redirect to Stripe
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
          ...(!isOutside ? [{id:"group", label:`👥 ${t('groupTab')}${(activeGroup && activeGroup.status !== "placed" && activeGroup.status !== "cancelled")?" ·":""}`}] : []),
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

          {/* ── Section toggle: DRINKS / FOOD + outdoor zone chip ── */}
          <div style={{display:"flex",alignItems:"stretch",gap:8,padding:"8px 10px 8px"}}>
            <div className="menu-section-toggle" style={{flex:1,margin:0,padding:0}}>
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
            {isOutside ? (
              <button onClick={onChangeZone}
                style={{flexShrink:0,display:"flex",alignItems:"center",gap:7,padding:"0 14px",
                  borderRadius:12,border:`1.5px solid ${outdoorZone ? outdoorZone.color+"77" : "rgba(255,255,255,.15)"}`,
                  background: outdoorZone ? outdoorZone.bg : "rgba(255,255,255,.05)",
                  cursor:"pointer",minWidth:0}}>
                <div style={{width:10,height:10,borderRadius:"50%",flexShrink:0,
                  background: outdoorZone ? outdoorZone.color : "rgba(255,255,255,.3)",
                  boxShadow: outdoorZone ? `0 0 8px ${outdoorZone.color}` : "none"}}/>
                <span style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:1.5,
                  color: outdoorZone ? outdoorZone.color : "rgba(255,255,255,.5)",whiteSpace:"nowrap"}}>
                  {outdoorZone ? outdoorZone.name : "ZONE?"}
                </span>
              </button>
            ) : (
              <button onClick={onChangeLocation}
                style={{flexShrink:0,display:"flex",alignItems:"center",gap:7,padding:"0 14px",
                  borderRadius:12,border:"1.5px solid rgba(255,255,255,.15)",
                  background:"rgba(255,255,255,.05)",cursor:"pointer",minWidth:0}}>
                <span style={{fontSize:12}}>🏠</span>
                <span style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:1.5,
                  color:"rgba(255,255,255,.5)",whiteSpace:"nowrap"}}>INSIDE</span>
              </button>
            )}
          </div>

          {/* ── Group order banner (only when the group is still assembling/paying) ── */}
          {activeGroup && activeGroup.status !== "placed" && activeGroup.status !== "cancelled" && (
            <div style={{padding:"13px 18px",background:"rgba(255,255,255,.03)",borderTop:"1px solid rgba(255,255,255,.08)",borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:"#4ade80",boxShadow:"0 0 8px #4ade80",flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2.5,color:"rgba(255,255,255,.9)",textTransform:"uppercase"}}>Group Order Active</div>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.38)",marginTop:2}}>All items go to the group cart</div>
              </div>
            </div>
          )}

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
                    // When in a group order, route to group cart instead of individual cart.
                    // Exclude placed/cancelled groups so leftover UI doesn't try to add items
                    // to a finished order.
                    const inGroup = !!activeGroup && activeGroup.status !== "placed" && activeGroup.status !== "cancelled";
                    const myGrpItem = inGroup ? groupItems.find(gi => gi.added_by_user_id === user.id && gi.item_id === item.id) : null;
                    const displayQty = inGroup ? (myGrpItem?.qty || 0) : (cart[item.id] || 0);
                    const handleAdd = () => inGroup ? addGroupItem(item) : addToCart(item.id);
                    const handleRemove = () => inGroup ? (myGrpItem && removeGroupItem(myGrpItem.id)) : removeFromCart(item.id);
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
                {showQRScan && <QRTableScanner onScan={t=>{setTable(t);setTableErr("");}} onClose={()=>setShowQRScan(false)} />}
                {isOutside ? (
                  <div className="afield" style={{marginBottom:14}}>
                    <label className="afield-lbl">🌴 OUTDOOR ZONE</label>
                    {outdoorZone ? (
                      <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",
                        background: outdoorZone.bg, border:`1px solid ${outdoorZone.color}55`, borderRadius:10, cursor:"pointer"}}
                        onClick={onChangeZone}>
                        <div style={{width:16,height:16,borderRadius:"50%",background:outdoorZone.color,boxShadow:`0 0 12px ${outdoorZone.color}88`,flexShrink:0}}/>
                        <div style={{flex:1}}>
                          <div style={{fontFamily:"'Anton',sans-serif",fontSize:18,color:outdoorZone.color,letterSpacing:2}}>{outdoorZone.name}</div>
                          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:1}}>Tap to change zone</div>
                        </div>
                        <span style={{fontFamily:"'Anton',sans-serif",fontSize:10,color:"rgba(255,255,255,.25)",letterSpacing:1}}>CHANGE ›</span>
                      </div>
                    ) : (
                      <button onClick={onChangeZone}
                        style={{width:"100%",padding:"14px 16px",background:"rgba(255,255,255,.04)",
                          border:"1px dashed rgba(255,255,255,.2)",borderRadius:10,cursor:"pointer",
                          display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                        <span style={{fontSize:22}}>🌴</span>
                        <div style={{textAlign:"left"}}>
                          <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:2,color:"rgba(255,255,255,.7)"}}>SELECT YOUR ZONE</div>
                          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:1}}>Choose your outdoor seating area</div>
                        </div>
                      </button>
                    )}
                  <button onClick={onChangeLocation}
                    style={{marginTop:8,background:"none",border:"none",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.3)",padding:"2px 0",textDecoration:"underline",display:"block"}}>
                    Switch to indoor tables →
                  </button>
                  </div>
                ) : (
                <div className="afield" ref={tableRef} style={{marginBottom:14}}>
                  <label className="afield-lbl">{t('selectTable')}</label>
                  {table ? (
                    <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",
                      background:"rgba(74,222,128,.07)",border:"1px solid rgba(74,222,128,.25)",borderRadius:10}}>
                      <span style={{fontSize:18}}>📍</span>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:"'Anton',sans-serif",fontSize:16,color:"#4ade80",letterSpacing:1}}>TABLE {table}</div>
                        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:1}}>
                          {qrTable ? "Set automatically from QR code" : "Tap ✕ to change"}
                        </div>
                      </div>
                      {!qrTable && (
                        <button onClick={()=>setTable("")}
                          style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",
                            color:"rgba(255,255,255,.5)",borderRadius:6,padding:"4px 10px",
                            fontFamily:"'Outfit',sans-serif",fontSize:11,cursor:"pointer"}}>✕</button>
                      )}
                    </div>
                  ) : (
                    <button onClick={()=>setShowQRScan(true)}
                      style={{width:"100%",padding:"14px 16px",background:"rgba(255,215,0,.06)",
                        border:"1px solid rgba(255,215,0,.25)",borderRadius:10,cursor:"pointer",
                        display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                      <span style={{fontSize:22}}>📷</span>
                      <div style={{textAlign:"left"}}>
                        <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:2,color:"#FFD700"}}>SCAN TABLE QR CODE</div>
                        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:1}}>Point camera at the QR code on your table</div>
                      </div>
                    </button>
                  )}
                  {tableErr && <div style={{color:"rgba(239,68,68,.8)",fontFamily:"'Outfit',sans-serif",fontSize:12,marginTop:8}}>{tableErr}</div>}
                  <button onClick={onChangeLocation}
                    style={{marginTop:8,background:"none",border:"none",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.3)",padding:"2px 0",textDecoration:"underline",display:"block"}}>
                    Switch to outdoor zones →
                  </button>
                </div>
                )}
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
                      className={`cart-pay-opt ${cartPayMethod==="card"?"cart-pay-opt-on":""}`}
                      onClick={() => setCartPayMethod("card")}>
                      <span style={{fontSize:18}}>💳</span>
                      <div>
                        <div className="cart-pay-opt-title">Card / Online</div>
                        <div className="cart-pay-opt-sub">Pay securely via Stripe</div>
                      </div>
                    </button>
                  </div>
                  {cartPayMethod === "credits" && cartTotal > myCredits && (
                    <div className="wallet-warning">
                      ⚠ Not enough credits — you need ${(cartTotal - myCredits).toFixed(2)} more.
                      <button className="wallet-warning-link" onClick={()=>setTab("wallet")}>Top up →</button>
                    </div>
                  )}
                </div>
                {cartPayMethod === "credits" ? (
                  <button className="order-place-btn"
                    disabled={placing}
                    onClick={() => openOrderModal("credits")}>
                    {placing ? t('placing') : `${t('placeOrder')} · $${cartTotal.toFixed(2)}`}
                  </button>
                ) : (
                  <button className="order-place-btn stripe-pay-btn"
                    disabled={placing}
                    onClick={() => openOrderModal("card")}>
                    {placing ? "PROCESSING…" : `💳 PAY WITH CARD · $${cartTotal.toFixed(2)}`}
                  </button>
                )}
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
        <div style={{padding:"0 16px 32px"}}>
          {/* Balance card */}
          <div className="wallet-card">
            <div className="wallet-card-label">AVAILABLE BALANCE</div>
            <div className="wallet-card-amount">${(+myCredits).toFixed(2)}</div>
            <div className="wallet-card-name">{user.name}</div>
            {user.player_number ? <div style={{fontFamily:"'Anton',sans-serif",fontSize:28,letterSpacing:4,color:"#fff",marginTop:8,opacity:0.9}}>PLAYER <span style={{color:"#facc15"}}>#{user.player_number}</span></div> : null}
          </div>

          {/* Top up section */}
          <div className="wallet-section-title">ADD CREDITS TO YOUR BALANCE</div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:"rgba(255,255,255,.55)",marginBottom:16,lineHeight:1.6}}>
            Select an amount, then visit any <strong style={{color:"#fff"}}>Top-Up Desk</strong> in the restaurant. Pay by cash or card and staff will add the credits to your account instantly.
          </div>
          <div className="wallet-topup-amounts">
            {[5,10,20,50].map(amt => (
              <button key={amt}
                className={`wallet-amt-btn ${topupAmt===String(amt)?"wallet-amt-on":""}`}
                onClick={()=>setTopupAmt(String(amt))}>
                ${amt}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
            <span style={{fontFamily:"'Anton',sans-serif",fontSize:14,color:"rgba(255,255,255,.5)"}}>$</span>
            <input className="afield-inp" type="number" min="1" placeholder="Other amount"
              value={topupAmt} onChange={e=>setTopupAmt(e.target.value)}
              style={{flex:1,fontSize:18,letterSpacing:2}} />
          </div>

          {/* Pay online with card */}
          <button
            className="stripe-topup-btn"
            disabled={!topupAmt || +topupAmt <= 0}
            onClick={() => stripeCheckout({
              type: "topup",
              amount: +topupAmt,
              userId: user.id,
              userEmail: user.email,
            })}
          >
            <span className="stripe-topup-btn-ico">💳</span>
            <span className="stripe-topup-btn-text">PAY ONLINE · ${topupAmt ? (+topupAmt).toFixed(2) : "0.00"}</span>
          </button>

          <div className="topup-divider"><span>OR</span></div>

          {/* Top-up desk info */}
          <div className="topup-desk-box">
            <div className="topup-desk-icon">🏧</div>
            <div className="topup-desk-title">TOP UP AT THE BAR</div>
            <div className="topup-desk-body">
              Visit the <strong>Top-Up Desk</strong> and pay by cash or card — staff will add credits to your account instantly.
            </div>
          </div>

          {/* How credits work */}
          <div className="wallet-info-box">
            <div className="wallet-info-title">How credits work</div>
            <div className="wallet-info-body">Credits are stored in your account. Use them to pay for food and drinks directly from the app. Your waiter will bring your order to your table.</div>
          </div>
        </div>
      )}

      {tab === "group" && (
        <GroupOrderView
          user={user} menuItems={menuItems} myCredits={myCredits}
          activeGroup={activeGroup} groupMembers={groupMembers} groupItems={groupItems}
          createGroupOrder={createGroupOrder} joinGroupOrder={joinGroupOrder} leaveGroupOrder={leaveGroupOrder}
          addGroupItem={addGroupItem} removeGroupItem={removeGroupItem}
          setGroupPaymentMode={setGroupPaymentMode} assignMyPaymentTo={assignMyPaymentTo} unassignMyPayment={unassignMyPayment}
          payGroupShareCredits={payGroupShareCredits} hostPayAllCredits={hostPayAllCredits}
          calcMyGroupShare={calcMyGroupShare}
          resetGroupToLobby={resetGroupToLobby}
          stripeCheckout={stripeCheckout} onToast={onToast}
          qrTable={qrTable}
          gifts={gifts.filter(g => (g.type === "drink_food" || g.type === "item") && !g.redeemed)}
        />
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
function AdminCredits({ users, onAddCredits }) {
  const [unlocked,  setUnlocked]  = useState(false);
  const [pinInput,  setPinInput]  = useState("");
  const [pinErr,    setPinErr]    = useState("");
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
      const admin  = Object.values(users).find(u => u.id === tx.added_by);
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

  // Auto-lock after 15 minutes of inactivity
  useEffect(() => {
    if (!unlocked) return;
    const t = setTimeout(() => { setUnlocked(false); setPinInput(""); }, 15 * 60 * 1000);
    return () => clearTimeout(t);
  }, [unlocked]);

  // Admin re-auth via Supabase — confirm their own password before adding credits
  const handleUnlock = async () => {
    if (!pinInput.trim()) { setPinErr("Enter your admin password"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: pinInput });
    if (error) { setPinErr("Wrong password — try again"); setPinInput(""); return; }
    setUnlocked(true);
    setPinErr("");
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
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:36,marginBottom:12}}>🔐</div>
          <div className="admin-form-title" style={{fontSize:14,letterSpacing:2}}>ADMIN VERIFICATION</div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.45)",marginTop:8,lineHeight:1.5}}>
            Confirm your admin password before managing player credits.
          </div>
        </div>
        <div className="afield">
          <label className="afield-lbl">ADMIN PASSWORD</label>
          <input className="afield-inp" type="password" placeholder="Your password"
            value={pinInput} onChange={e=>{setPinInput(e.target.value);setPinErr("");}}
            onKeyDown={e=>e.key==="Enter"&&handleUnlock()} autoComplete="current-password" />
        </div>
        {pinErr && <div style={{color:"rgba(239,68,68,.8)",fontFamily:"'Outfit',sans-serif",fontSize:12,marginTop:8}}>{pinErr}</div>}
        <button className="order-place-btn" style={{marginTop:16}}
          onClick={handleUnlock}>
          VERIFY & CONTINUE
        </button>
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

      <div className="admin-hint" style={{margin:"0 14px",padding:"12px 0 4px",borderTop:"none"}}>
        ✓ Verified. Search by player number or name, enter amount and press ADD.
      </div>

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
