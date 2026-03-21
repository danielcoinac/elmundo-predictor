import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from '@supabase/supabase-js';

/* ─── Supabase ──────────────────────────────────────────────────────────────── */
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/* ─── Language / i18n ───────────────────────────────────────────────────── */
const TRANSLATIONS = {
  en: {
    // Auth
    signIn:"Sign In", register:"Register", email:"Email Address", password:"Password",
    fullName:"Full Name", phone:"Phone Number", signInBtn:"SIGN IN", registerBtn:"REGISTER",
    dontHaveAccount:"Don't have an account?", alreadyHaveAccount:"Already have an account?",
    registerHere:"Register here", signInHere:"Sign in here",
    // Nav
    matches:"Matches", leaderboard:"Leaderboard", menu:"Menu", rules:"Rules",
    profile:"Profile", admin:"Admin",
    // Menu tabs
    menuTab:"Menu", cartTab:"Cart", ordersTab:"Orders", walletTab:"Wallet", groupTab:"Group",
    // Menu
    addToCart:"ADD", viewCart:"View Cart", browseMenu:"BROWSE MENU",
    itemsLabel:"items", noMenu:"Menu not available right now",
    // Cart
    yourCart:"Your cart", emptyCart:"Your cart is empty",
    selectTable:"SELECT YOUR TABLE", payment:"PAYMENT",
    payWithCredits:"💳 CREDITS",
    placeOrder:"PLACE ORDER", placing:"PLACING...",
    total:"TOTAL", selectedTable:"Selected: Table",
    // Orders
    noOrders:"No orders yet", pending:"⏳ Pending", confirmed:"✓ Confirmed",
    ready:"🔔 Ready!", delivered:"Delivered", printReceipt:"PRINT RECEIPT",
    // Wallet
    creditBalance:"CREDIT BALANCE", topUp:"+ TOP UP", useCredits:"Use credits to pay for orders",
    selectAmount:"SELECT AMOUNT",
    // Group
    groupOrder:"GROUP ORDER", orderTogether:"Order together, pay your way",
    startGroup:"+ START GROUP ORDER", joinWithCode:"JOIN WITH CODE",
    createGroup:"CREATE GROUP", joinGroup:"JOIN GROUP",
    tableNumber:"TABLE NUMBER", yourName:"YOUR NAME",
    back:"← Back", lobby:"Lobby", checkout:"CHECKOUT",
    paymentMode:"PAYMENT MODE", splitBill:"SPLIT BILL", hostPaysAll:"HOST PAYS ALL",
    proceedToCheckout:"PROCEED TO CHECKOUT →",
    waitingForHost:"Waiting for host to start checkout…",
    // Predictions
    predictScore:"Predict score", savePred:"SAVE", saved:"Saved ✓",
    // Profile
    yourStats:"YOUR STATS", points:"pts", predictions:"predictions",
    accuracy:"accuracy", rank:"rank", yourPredictions:"YOUR PREDICTIONS",
    // General
    loading:"Loading…", save:"Save", cancel:"Cancel", close:"Close",
    delete:"Delete", edit:"EDIT", show:"SHOW", hide:"HIDE",
    confirmDelete:"Are you sure you want to delete this?",
    notEnoughCredits:"Not enough credits",
    orderPlaced:"Order placed! 🍺 The bar will prepare it shortly.",
    welcomeBack:"Welcome back",
  },
  nl: {
    // Auth
    signIn:"Inloggen", register:"Registreren", email:"E-mailadres", password:"Wachtwoord",
    fullName:"Volledige naam", phone:"Telefoonnummer", signInBtn:"INLOGGEN", registerBtn:"REGISTREREN",
    dontHaveAccount:"Nog geen account?", alreadyHaveAccount:"Al een account?",
    registerHere:"Registreer hier", signInHere:"Log hier in",
    // Nav
    matches:"Wedstrijden", leaderboard:"Ranglijst", menu:"Menu", rules:"Regels",
    profile:"Profiel", admin:"Admin",
    // Menu tabs
    menuTab:"Menu", cartTab:"Winkelwagen", ordersTab:"Bestellingen", walletTab:"Portemonnee", groupTab:"Groep",
    // Menu
    addToCart:"ADD", viewCart:"Winkelwagen", browseMenu:"BEKIJK MENU",
    itemsLabel:"items", noMenu:"Menu momenteel niet beschikbaar",
    // Cart
    yourCart:"Uw winkelwagen", emptyCart:"Uw winkelwagen is leeg",
    selectTable:"KIES UW TAFEL", payment:"BETALING",
    payWithCredits:"💳 CREDITS",
    placeOrder:"BESTELLING PLAATSEN", placing:"BEZIG...",
    total:"TOTAAL", selectedTable:"Geselecteerd: Tafel",
    // Orders
    noOrders:"Nog geen bestellingen", pending:"⏳ In behandeling", confirmed:"✓ Bevestigd",
    ready:"🔔 Klaar!", delivered:"Bezorgd", printReceipt:"BON AFDRUKKEN",
    // Wallet
    creditBalance:"CREDITSALDO", topUp:"+ OPLADEN", useCredits:"Gebruik credits om te betalen",
    selectAmount:"KIES BEDRAG",
    // Group
    groupOrder:"GROEPSBESTELLING", orderTogether:"Samen bestellen, op jouw manier betalen",
    startGroup:"+ GROEPSBESTELLING STARTEN", joinWithCode:"DEELNEMEN MET CODE",
    createGroup:"GROEP AANMAKEN", joinGroup:"GROEP DEELNEMEN",
    tableNumber:"TAFELNUMMER", yourName:"UW NAAM",
    back:"← Terug", lobby:"Lobby", checkout:"AFREKENEN",
    paymentMode:"BETALINGSWIJZE", splitBill:"REKENING SPLITSEN", hostPaysAll:"GASTHEER BETAALT ALLES",
    proceedToCheckout:"VERDER NAAR AFREKENEN →",
    waitingForHost:"Wachten tot de gastheer het afrekenen start…",
    // Predictions
    predictScore:"Score voorspellen", savePred:"OPSLAAN", saved:"Opgeslagen ✓",
    // Profile
    yourStats:"UW STATISTIEKEN", points:"pts", predictions:"voorspellingen",
    accuracy:"nauwkeurigheid", rank:"rang", yourPredictions:"UW VOORSPELLINGEN",
    // General
    loading:"Laden…", save:"Opslaan", cancel:"Annuleren", close:"Sluiten",
    delete:"Verwijderen", edit:"BEWERKEN", show:"TONEN", hide:"VERBERGEN",
    confirmDelete:"Weet u zeker dat u dit wilt verwijderen?",
    notEnoughCredits:"Niet genoeg credits",
    orderPlaced:"Bestelling geplaatst! 🍺 De bar bereidt het zo snel mogelijk.",
    welcomeBack:"Welkom terug",
  },
};
const LangContext = React.createContext({ lang:"en", t: k => TRANSLATIONS.en[k] || k });
function useLang() { return React.useContext(LangContext); }

/* ─── Storage (rules/sponsors only) ──────────────────────────────────────── */
async function sget(k) { try { const r = await window.storage.get(k, true); return r ? JSON.parse(r.value) : null; } catch { return null; } }
async function sset(k, v) { try { await window.storage.set(k, JSON.stringify(v), true); } catch {} }

const DEFAULT_MATCHES = [];

const DEFAULT_RULES = [
  { id:"r1", title:"How to Play",   body:"Register your account and predict the exact final score for each match before it starts. You cannot change your prediction once the match has kicked off." },
  { id:"r2", title:"Points System", body:"Predict the exact final score correctly and earn 5 points. Predict the correct winner (or a draw) but with the wrong score and earn 1 point. An incorrect prediction earns 0 points." },
  { id:"r3", title:"Leaderboard",   body:"The player with the most points at the end of the tournament wins. The leaderboard updates automatically every time a match result is entered." },
  { id:"r4", title:"Tiebreaker",    body:"In case of a tie in points, the player who registered first will be ranked higher." },
  { id:"r5", title:"Fair Play",     body:"One account per person. Any attempt to cheat or create multiple accounts will result in immediate disqualification." },
];

const DEFAULT_SPONSORS = [
  { id:"s1", name:"El Mundo Bar-Rest", role:"EVENT HOST",    detail:"Est. 2009 — Bonaire",               logo:"/elmundo-logo.png" },
  { id:"s2", name:"Your Business Here", role:"Gold Sponsor",   detail:"Contact us to become a sponsor",  logo:"" },
  { id:"s3", name:"Your Business Here", role:"Silver Sponsor", detail:"Contact us to become a sponsor",  logo:"" },
];

const MONTHS = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
const matchDate = m => {
  const [mon, day] = (m.date || m.match_date || "Jan 1").split(" ");
  return new Date(2026, (MONTHS[mon]||1)-1, parseInt(day)||1);
};
const sortMatches = arr => [...arr].sort((a,b) => matchDate(a) - matchDate(b));

// Points: 5 for exact score, 1 for correct winner/draw (but not exact)
function calcPts(pred, homeScore, awayScore) {
  if (!pred) return 0;
  const ph = +pred.h, pa = +pred.a;
  const mh = +homeScore,  ma = +awayScore;
  if (ph === mh && pa === ma) return 5;
  const predWinner = ph > pa ? "home" : ph < pa ? "away" : "draw";
  const realWinner = mh > ma ? "home" : mh < ma ? "away" : "draw";
  if (predWinner === realWinner) return 1;
  return 0;
}

const FLAGS = {
  /* CONMEBOL */ Brazil:"🇧🇷",Argentina:"🇦🇷",Uruguay:"🇺🇾",Colombia:"🇨🇴",Ecuador:"🇪🇨",Venezuela:"🇻🇪",Paraguay:"🇵🇾",Chile:"🇨🇱",Bolivia:"🇧🇴",Peru:"🇵🇪",
  /* UEFA */ France:"🇫🇷",Germany:"🇩🇪",Spain:"🇪🇸",Portugal:"🇵🇹",England:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",Netherlands:"🇳🇱",Italy:"🇮🇹",Croatia:"🇭🇷",Belgium:"🇧🇪",Switzerland:"🇨🇭",Austria:"🇦🇹",Denmark:"🇩🇰",Serbia:"🇷🇸",Hungary:"🇭🇺",Czechia:"🇨🇿",Slovakia:"🇸🇰",Turkey:"🇹🇷",Romania:"🇷🇴",Scotland:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",Wales:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",Ukraine:"🇺🇦",Greece:"🇬🇷",Poland:"🇵🇱",Norway:"🇳🇴",
  /* CONCACAF */ USA:"🇺🇸",Mexico:"🇲🇽",Canada:"🇨🇦",Jamaica:"🇯🇲","Costa Rica":"🇨🇷",Panama:"🇵🇦",Honduras:"🇭🇳","El Salvador":"🇸🇻",Guatemala:"🇬🇹","Trinidad & Tobago":"🇹🇹",Cuba:"🇨🇺",Haiti:"🇭🇹",Curacao:"🇨🇼",
  /* CAF */ Morocco:"🇲🇦",Senegal:"🇸🇳",Egypt:"🇪🇬","South Africa":"🇿🇦",Nigeria:"🇳🇬",Ghana:"🇬🇭","Ivory Coast":"🇨🇮",Cameroon:"🇨🇲",Algeria:"🇩🇿",Tunisia:"🇹🇳",Mali:"🇲🇱",Jordan:"🇯🇴",
  /* AFC */ Japan:"🇯🇵","South Korea":"🇰🇷",Iran:"🇮🇷",Australia:"🇦🇺","Saudi Arabia":"🇸🇦",Qatar:"🇶🇦","United Arab Emirates":"🇦🇪",Iraq:"🇮🇶","New Zealand":"🇳🇿",
  /* OFC */ Tahiti:"🇵🇫",
};
const flag = t => FLAGS[t] || "⚽";

/* ─── SVG Logos ─────────────────────────────────────────────────────────── */
const Logo = ({ w = 160 }) => (
  <svg width={w} height={w} viewBox="0 0 200 200">
    <rect width="200" height="200" fill="transparent"/>
    <text x="100" y="58"  textAnchor="middle" fill="#fff" fontFamily="'Anton',sans-serif" fontSize="44">EL MUNDO</text>
    <text x="100" y="85"  textAnchor="middle" fill="#fff" fontFamily="'Anton',sans-serif" fontSize="21" letterSpacing="5">BAR-REST</text>
    <rect x="16" y="93" width="168" height="44" fill="none" stroke="#fff" strokeWidth="2.2" rx="2"/>
    <text x="100" y="115" textAnchor="middle" fill="#fff" fontFamily="'Anton',sans-serif" fontSize="19" letterSpacing="3">EST. 2009</text>
    <line x1="26" y1="122" x2="68" y2="122" stroke="#fff" strokeWidth="0.9"/>
    <line x1="132" y1="122" x2="174" y2="122" stroke="#fff" strokeWidth="0.9"/>
    <text x="100" y="127" textAnchor="middle" fill="#fff" fontFamily="Georgia,serif" fontSize="6.2" letterSpacing="2.2">WWW.ELMUNDOBONAIRE.COM</text>
    <text x="100" y="168" textAnchor="middle" fill="#fff" fontFamily="'Anton',sans-serif" fontSize="37" letterSpacing="4">BONAIRE</text>
  </svg>
);
const HeaderLogo = () => (
  <svg width="40" height="40" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="#fff"/>
    <text x="100" y="58"  textAnchor="middle" fill="#000" fontFamily="'Anton',sans-serif" fontSize="44">EL MUNDO</text>
    <text x="100" y="85"  textAnchor="middle" fill="#000" fontFamily="'Anton',sans-serif" fontSize="21" letterSpacing="5">BAR-REST</text>
    <rect x="16" y="93" width="168" height="44" fill="none" stroke="#000" strokeWidth="2.2" rx="2"/>
    <text x="100" y="115" textAnchor="middle" fill="#000" fontFamily="'Anton',sans-serif" fontSize="19" letterSpacing="3">EST. 2009</text>
    <line x1="26" y1="122" x2="68" y2="122" stroke="#000" strokeWidth="0.9"/>
    <line x1="132" y1="122" x2="174" y2="122" stroke="#000" strokeWidth="0.9"/>
    <text x="100" y="127" textAnchor="middle" fill="#000" fontFamily="Georgia,serif" fontSize="6.2" letterSpacing="2.2">WWW.ELMUNDOBONAIRE.COM</text>
    <text x="100" y="168" textAnchor="middle" fill="#000" fontFamily="'Anton',sans-serif" fontSize="37" letterSpacing="4">BONAIRE</text>
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [page,     setPage]     = useState("loading");
  const [authTab,  setAuthTab]  = useState("login");
  const [appTab,   setAppTab]   = useState("matches");
  const [user,     setUser]     = useState(null);
  const [users,    setUsers]    = useState({});
  const [preds,    setPreds]    = useState({});
  const [matches,  setMatches]  = useState(DEFAULT_MATCHES);
  const [rules,    setRules]    = useState(DEFAULT_RULES);
  const [sponsors, setSponsors] = useState(DEFAULT_SPONSORS);
  const [toast,    setToast]    = useState(null);
  const toastTimerRef = useRef(null);
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
          const { data: predRows } = await supabase.from("predictions").select("*").eq("user_id", session.user.id);
          if (predRows) {
            const predMap = {};
            predRows.forEach(p => { predMap[`${session.user.id}__${p.match_id}`] = { h: p.home_pred, a: p.away_pred }; });
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
          if (credRow) setMyCredits(credRow.balance || 0);
          const { data: orderRows } = await supabase.from("orders").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
          if (orderRows) setMyOrders(orderRows);

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
            const { data: cr } = await supabase.from("user_credits").select("balance").eq("user_id", profRow.id).maybeSingle();
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
            setTimeout(() => toast$("Payment cancelled", false), 600);
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

    // ── 4. PROFILES — Realtime (for leaderboard updates) ────────────────────
    const profileSub = supabase.channel("rt-profiles")
      .on("postgres_changes", { event:"*", schema:"public", table:"profiles" }, payload => {
        const r = payload.new;
        if (!r || r.is_admin) return;
        setUsers(u => ({ ...u, [r.id]: r }));
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
        }
      }).subscribe();

    // ── 8. LIGHTWEIGHT FALLBACK POLL every 60s ───────────────────────────────
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

  const toast$ = (msg, ok = true) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, ok });
    toastTimerRef.current = setTimeout(() => { setToast(null); toastTimerRef.current = null; }, 3200);
  };

  const doRegister = async () => {
    setFormErr("");
    if (!form.name.trim())                 return setFormErr("Full name is required.");
    if (!/\S+@\S+\.\S+/.test(form.email)) return setFormErr("Enter a valid email address.");
    if (!form.phone.trim())                return setFormErr("Phone number is required.");
    if (form.password.length < 6)          return setFormErr("Password must be at least 6 characters.");
    const { data, error } = await supabase.auth.signUp({ email: form.email, password: form.password });
    if (error) return setFormErr(error.message);
    // Auto-assign next player number
    const { count } = await supabase.from("profiles").select("*", { count:"exact", head:true });
    const playerNumber = (count || 0) + 1;
    await supabase.from("profiles").upsert({ id: data.user.id, name: form.name, phone: form.phone, player_number: playerNumber });
    setUser({ ...data.user, name: form.name, phone: form.phone, is_admin: false, player_number: playerNumber });
    setPage("app");
    toast$(`Welcome, ${form.name}! ⚽`);
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
      supabase.from("predictions").select("*").eq("user_id", data.user.id).then(r => r.data),
      supabase.from("profiles").select("*").then(r => r.data),
      supabase.from("menu_items").select("*").order("sort_order").then(r => r.data),
      supabase.from("user_credits").select("balance").eq("user_id", data.user.id).maybeSingle().then(r => r.data),
      supabase.from("orders").select("*").eq("user_id", data.user.id).order("created_at", { ascending: false }).limit(20).then(r => r.data),
    ]);
    if (predRows) {
      const predMap = {};
      predRows.forEach(p => { predMap[`${data.user.id}__${p.match_id}`] = { h: p.home_pred, a: p.away_pred }; });
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
    predSavingRef.current.add(id);
    try {
      const { error } = await supabase.from("predictions").upsert(
        { user_id: user.id, match_id: id, home_pred: +h, away_pred: +a },
        { onConflict: "user_id,match_id" }
      );
      if (error) { toast$("Error saving prediction", false); return; }
      const k = `${user.id}__${id}`;
      setPreds(p => ({ ...p, [k]: { h:+h, a:+a } }));
      toast$("Prediction saved ⚽");
    } finally {
      predSavingRef.current.delete(id);
    }
  };

  const adminUpdateMatch = async (updated) => {
    await supabase.from("matches").upsert({
      id: updated.id, home: updated.home, away: updated.away,
      match_group: updated.group, match_date: updated.date,
      match_time: updated.time, status: updated.status,
      home_score: updated.hs, away_score: updated.as
    });
    setMatches(m => m.map(x => x.id === updated.id ? updated : x));
    toast$("Match updated ✓");
  };
  const adminAddMatch = async (newMatch) => {
    const id = `m${Date.now()}`;
    await supabase.from("matches").insert({
      id, home: newMatch.home, away: newMatch.away,
      match_group: newMatch.group, match_date: newMatch.date,
      match_time: newMatch.time, status: newMatch.status,
      home_score: newMatch.hs, away_score: newMatch.as
    });
    setMatches(m => [...m, { ...newMatch, id }]);
    toast$("Match added ✓");
  };
  const adminDeleteMatch = async (id) => {
    await supabase.from("matches").delete().eq("id", id);
    setMatches(m => m.filter(x => x.id !== id));
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

  const isAdmin = user?.is_admin === true;

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
    await supabase.from("menu_items").delete().eq("id", id);
    setMenuItems(m => m.filter(x => x.id !== id));
    toast$("Item removed ✓");
  };

  const toggleMenuItemAvail = async (id, available) => {
    await supabase.from("menu_items").update({ available }).eq("id", id);
    setMenuItems(m => m.map(x => x.id === id ? { ...x, available } : x));
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
      toast$("Payment error: " + e.message, false);
    }
  };

  const placeOrder = async ({ tableNumber, items, total, paymentMethod }) => {
    if (paymentMethod === "credits") {
      if (myCredits < total) { toast$("Not enough credits", false); return false; }
    }
    // Insert order FIRST — if this fails, no credits are deducted
    const { data, error } = await supabase.from("orders").insert({
      user_id: user.id,
      user_name: user.name,
      table_number: tableNumber,
      items,
      total,
      payment_method: paymentMethod,
      status: "pending",
    }).select().single();
    if (error) { toast$("Error placing order", false); return false; }
    // Deduct credits only after order is confirmed in DB
    if (paymentMethod === "credits") {
      const newBal = +(myCredits - total).toFixed(2);
      await supabase.from("user_credits").upsert({ user_id: user.id, balance: newBal, updated_at: new Date().toISOString() });
      setMyCredits(newBal);
    }
    toast$("Order placed! 🍺 The bar will prepare it shortly.");
    return true;
  };

  const adminAddCredits = async (userId, amount, userName) => {
    if (!amount || +amount <= 0) { toast$("Enter a valid amount", false); return; }
    const { data: cur } = await supabase.from("user_credits").select("balance").eq("user_id", userId).maybeSingle();
    const newBal = +((cur?.balance || 0) + amount).toFixed(2);
    await supabase.from("user_credits").upsert({ user_id: userId, balance: newBal, updated_at: new Date().toISOString() });
    await supabase.from("credit_topups").insert({ user_id: userId, amount, method: "cash", added_by: user.id });
    toast$(`$${amount} credits added to ${userName} ✓`);
    // Print top-up receipt
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    const dateStr = now.toLocaleDateString([], { month:"short", day:"numeric", year:"numeric" });
    const win = window.open("", "_blank", "width=320,height=400");
    if (win) {
      win.document.write(`<!DOCTYPE html><html><head><title>Top-Up Receipt</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body { width: 80mm; }
        body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; }
        .wrap { width: 72mm; margin: 0 auto; padding: 4mm 0; }
        .center { text-align: center; }
        .logo { font-size: 24px; font-weight: 900; letter-spacing: 3px; margin-bottom: 2px; }
        .sub { font-size: 9px; color: #333; margin-bottom: 8px; letter-spacing: 2px; }
        .divider { border-top: 1px dashed #000; margin: 8px 0; }
        .divider-solid { border-top: 2px solid #000; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; padding: 3px 0; font-size:11px; }
        .label { font-size: 9px; color: #333; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
        .big { font-size: 20px; font-weight: 900; letter-spacing: 1px; }
        .amount { font-size: 28px; font-weight: 900; }
        .footer { font-size: 10px; color: #333; margin-top: 10px; text-align:center; }
        .type { display:inline-block; border:1px solid #000; padding: 2px 8px; font-size:9px; letter-spacing:2px; font-weight:900; margin-top:5px; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body><div class="wrap">
      <div class="center">
        <div class="logo">EL MUNDO</div>
        <div class="sub">WORLD CUP 2026 · BONAIRE</div>
        <div class="type">TOP-UP RECEIPT</div>
      </div>
      <div class="divider"></div>
      <div class="label">Customer</div>
      <div style="font-size:16px;font-weight:900;margin-bottom:10px">${userName}</div>
      <div class="label">Credits Added</div>
      <div class="amount">$${(+amount).toFixed(2)}</div>
      <div class="divider-solid"></div>
      <div class="row"><span>New Balance</span><span style="font-weight:900">$${newBal.toFixed(2)}</span></div>
      <div class="row"><span>Payment</span><span>Cash / Card</span></div>
      <div class="row"><span>Date & Time</span><span>${dateStr} · ${timeStr}</span></div>
      <div class="divider"></div>
      <div class="center footer">Enjoy the match! ⚽<br>Use credits to order food & drinks.</div>
      </div></body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); win.close(); }, 400);
    } else {
      toast$("Credits added ✓ — allow popups to print receipt", true);
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    await supabase.from("orders").update({ status }).eq("id", orderId);
    setAllOrders(o => o.map(x => x.id === orderId ? { ...x, status } : x));
  };

  const deleteOrder = async (orderId) => {
    // Mark as "completed" — stays in history but off the floor plan
    await supabase.from("orders").update({ status: "completed" }).eq("id", orderId);
    setAllOrders(o => o.map(x => x.id === orderId ? { ...x, status: "completed" } : x));
  };

  const loadAllOrders = async () => {
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (data) setAllOrders(data);
  };

  // ── Order receipt printer ─────────────────────────────────────────────────
  const printOrderReceipt = (ord, customerName) => {
    const win = window.open("", "_blank", "width=340,height=500");
    if (!win) { toast$("Allow popups to print receipt", false); return; }
    const now = new Date(ord.created_at);
    const timeStr = now.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    const dateStr = now.toLocaleDateString([], { month:"short", day:"numeric", year:"numeric" });
    const itemRows = (ord.items || []).map(it =>
      `<div class="row"><span>${it.qty}× ${it.name}</span><span>$${(it.price*it.qty).toFixed(2)}</span></div>`
    ).join("");
    const payLabel = ord.payment_method === "credits" ? "Credits" : "Cash / Card";
    win.document.write(`<!DOCTYPE html><html><head><title>Order Receipt</title>
    <style>
      @page{size:80mm auto;margin:0}*{margin:0;padding:0;box-sizing:border-box}html,body{width:80mm}
      body{font-family:'Courier New',monospace;font-size:12px;color:#000;background:#fff}
      .wrap{width:72mm;margin:0 auto;padding:4mm 0}
      .center{text-align:center}.logo{font-size:22px;font-weight:900;letter-spacing:3px;margin-bottom:2px}
      .sub{font-size:9px;color:#333;margin-bottom:8px;letter-spacing:2px}
      .divider{border-top:1px dashed #000;margin:8px 0}.divider-solid{border-top:2px solid #000;margin:8px 0}
      .row{display:flex;justify-content:space-between;padding:3px 0;font-size:11px}
      .label{font-size:9px;color:#333;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px}
      .total{font-size:18px;font-weight:900}.type{display:inline-block;border:1px solid #000;padding:2px 8px;font-size:9px;letter-spacing:2px;font-weight:900;margin-top:5px}
      .footer{font-size:10px;color:#333;margin-top:10px;text-align:center}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><div class="wrap">
    <div class="center">
      <div class="logo">EL MUNDO</div>
      <div class="sub">WORLD CUP 2026 · BONAIRE</div>
      <div class="type">ORDER RECEIPT</div>
    </div>
    <div class="divider"></div>
    <div class="label">Customer</div>
    <div style="font-size:14px;font-weight:900;margin-bottom:6px">${customerName || "Guest"}</div>
    <div class="label">Table</div>
    <div style="font-size:14px;font-weight:900;margin-bottom:8px">Table ${ord.table_number}${ord.order_number ? ` · #${ord.order_number}` : ""}</div>
    <div class="divider"></div>
    <div class="label">Items</div>
    ${itemRows}
    <div class="divider-solid"></div>
    <div class="row"><span style="font-weight:900">TOTAL</span><span class="total">$${(+ord.total).toFixed(2)}</span></div>
    <div class="row"><span>Payment</span><span>${payLabel}</span></div>
    <div class="row"><span>Date &amp; Time</span><span>${dateStr} · ${timeStr}</span></div>
    <div class="divider"></div>
    <div class="center footer">Thank you &amp; enjoy! ⚽<br>El Mundo Bar-Rest, Bonaire</div>
    </div></body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
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
    const { error: orderError } = await supabase.from("orders").insert({
      user_id: order.host_user_id,
      table_number: order.table_number,
      items: items.map(i => ({ id: i.item_id, name: i.item_name, price: i.price, qty: i.qty })),
      total: +total.toFixed(2),
      payment_method: order.payment_mode === "host" ? "group_host" : "group_individual",
      status: "pending",
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
    // Fetch fresh members from DB — don't rely on potentially stale React state
    const { data: freshMembers } = await supabase.from("group_order_members").select("*").eq("group_order_id", activeGroup.id);
    const { data: freshItems } = await supabase.from("group_order_items").select("*").eq("group_order_id", activeGroup.id);
    const myShare = calcMyGroupShare(user.id, freshMembers || groupMembers, freshItems || groupItems);
    if (myCredits < myShare) { toast$("Not enough credits", false); return false; }
    const newBal = +(myCredits - myShare).toFixed(2);
    await supabase.from("user_credits").upsert({ user_id: user.id, balance: newBal, updated_at: new Date().toISOString() });
    setMyCredits(newBal);
    // Mark me and anyone assigned to me as paid (fresh from DB to avoid stale state bugs)
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
    if (myCredits < total) { toast$("Not enough credits", false); return false; }
    const newBal = +(myCredits - total).toFixed(2);
    await supabase.from("user_credits").upsert({ user_id: user.id, balance: newBal, updated_at: new Date().toISOString() });
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
      <style>{CSS}</style>
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
              publicBoard={publicBoard} />
      )}
      {page === "app" && (
        <Main
          appTab={appTab} setAppTab={setAppTab}
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
          menuItems={menuItems} myCredits={myCredits} myOrders={myOrders}
          placeOrder={placeOrder}
          saveMenuItem={saveMenuItem} deleteMenuItem={deleteMenuItem}
          toggleMenuItemAvail={toggleMenuItemAvail}
          adminAddCredits={adminAddCredits}
          updateOrderStatus={updateOrderStatus}
          deleteOrder={deleteOrder}
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
            <div ref={goldRef} className="sp-neon-gold">WORLD CUP 2026</div>
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

      // ── BASE: very dark green pitch ──────────────────────────────
      ctx.fillStyle = "#060e07"; ctx.fillRect(0, 0, W, H);

      // Alternating grass stripes (subtle) — horizontal bands
      const stripes = 10;
      for (let i = 0; i < stripes; i++) {
        const y0 = (i / stripes) * H;
        const y1 = ((i + 1) / stripes) * H;
        ctx.fillStyle = i % 2 === 0 ? "rgba(12,28,14,0.55)" : "rgba(8,20,10,0.55)";
        ctx.fillRect(0, y0, W, y1 - y0);
      }

      // ── STADIUM FLOODLIGHTS — four corners, warm wash ────────────
      [
        { cx: 0.0, cy: 0.0 }, { cx: 1.0, cy: 0.0 },
        { cx: 0.0, cy: 1.0 }, { cx: 1.0, cy: 1.0 },
      ].forEach(({ cx, cy }) => {
        const lx = cx * W, ly = cy * H;
        const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, W * 0.72);
        lg.addColorStop(0,   "rgba(255,245,195,0.18)");
        lg.addColorStop(0.25,"rgba(255,240,175,0.07)");
        lg.addColorStop(0.6, "rgba(200,240,160,0.03)");
        lg.addColorStop(1,   "transparent");
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H); ctx.restore();
      });

      // Soft green glow at center of pitch
      const cg = ctx.createRadialGradient(W*0.5, H*0.5, 0, W*0.5, H*0.5, W * 0.38);
      cg.addColorStop(0,   "rgba(20,80,30,0.22)");
      cg.addColorStop(0.5, "rgba(10,40,15,0.09)");
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
function Auth({ tab, setTab, form, setForm, err, setErr, onLogin, onRegister, publicBoard }) {
  const { t } = useLang();
  const [showTV,  setShowTV]  = useState(false);
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
              WORLD CUP EVENT 2026
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
            <span className="auth-event-text">WORLD CUP EVENT 2026</span>
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
              <FField label={t('fullName')}  val={form.name}     on={set("name")}     ph="John Doe"          />
              <FField label={t('phone')}    val={form.phone}    on={set("phone")}    ph="+599 700 0000"     />
            </>}
            <FField label={t('email')}     val={form.email}    on={set("email")}    ph="your@email.com"     type="email"    />
            <FField label={t('password')}  val={form.password} on={set("password")} ph="Min. 8 characters" type="password" />
            {err && <div className="auth-err"><span className="auth-err-dot">!</span>{err}</div>}
            <button className="auth-cta" onClick={isLogin ? onLogin : onRegister}>
              {isLogin ? t('signInBtn') : t('registerBtn')}
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

function TVBalls() {
  const balls = useBalls();
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",overflow:"hidden",zIndex:0}}>
      {balls.map(b => (
        <div key={b.id} style={{
          position:"absolute",
          left:`${b.x}%`, top:`${b.y}%`,
          fontSize:`${b.size}px`,
          transform:`translate(-50%,-50%) rotate(${b.rot}deg)`,
          opacity: b.opacity,
          filter: b.blur ? `blur(${b.blur}px)` : "none",
          transition:"none",
          userSelect:"none",
          lineHeight:1,
        }}>⚽</div>
      ))}
    </div>
  );
}

function TVLeaderboard({ board, onBack }) {
  const [mode,   setMode]   = useState("scroll");
  const [visIdx, setVisIdx] = useState(0);
  const M = ["🥇","🥈","🥉"];

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

  return (
    <div className="tv-root">
      {/* Animated soccer balls */}
      <TVBalls />

      {/* Scanline overlay for TV effect */}
      <div className="tv-scanlines" />

      {/* Back */}
      <button className="tv-back-btn" onClick={onBack}>← BACK TO LOGIN</button>

      {/* Header */}
      <div className="tv-header" style={{position:"relative",zIndex:2}}>
        <Logo w={80} />
        <div className="tv-header-text">
          <div className="tv-title">WORLD CUP 2026</div>
          <div className="tv-subtitle">EL MUNDO BAR · BONAIRE</div>
        </div>
      </div>

      {/* Mode dots */}
      <div className="tv-mode-dots" style={{position:"relative",zIndex:2}}>
        <span className={`tv-dot ${mode==="scroll"?"tv-dot-on":""}`} />
        <span className={`tv-dot ${mode==="podium"?"tv-dot-on":""}`} />
      </div>

      {/* SCROLL MODE */}
      {mode === "scroll" && (
        <div key="scroll" className="tv-scroll-wrap tv-mode-fade" style={{position:"relative",zIndex:2}}>
          <div className="tv-section-label">LEADERBOARD — TOP 10</div>
          {board.length === 0 && <div className="tv-empty">No players yet — be the first to register!</div>}
          {board.map((u, i) => (
            <div key={u.id} className={`tv-row ${visIdx===i?"tv-row-lit":""}`}>
              <div className="tv-rank">
                {i<3 ? <span className="tv-medal">{M[i]}</span> : <span className="tv-rank-n">#{i+1}</span>}
              </div>
              <div className="tv-name">{u.name}</div>
              <div className="tv-pts-wrap">
                <span className="tv-pts">{u.pts}</span>
                <span className="tv-pts-u">PTS</span>
              </div>
              {visIdx===i && <div className="tv-row-ball" style={{display:"none"}}>⚽</div>}
            </div>
          ))}
        </div>
      )}

      {/* PODIUM MODE */}
      {mode === "podium" && (
        <div key="podium" className="tv-podium-wrap tv-mode-fade" style={{position:"relative",zIndex:2}}>
          <div className="tv-section-label">TOP 3 PODIUM</div>
          <div className="tv-podium">
            {top3[1] && (
              <div className="tv-pod tv-pod-2">
                <div className="tv-pod-medal">🥈</div>
                <div className="tv-pod-name">{top3[1].name}</div>
                <div className="tv-pod-pts">{top3[1].pts}<span className="tv-pod-pts-u">pts</span></div>
                <div className="tv-pod-block tv-pod-block-2" />
              </div>
            )}
            {top3[0] && (
              <div className="tv-pod tv-pod-1">
                <div className="tv-pod-crown">👑</div>
                <div className="tv-pod-medal">🥇</div>
                <div className="tv-pod-name tv-pod-name-1">{top3[0].name}</div>
                <div className="tv-pod-pts tv-pod-pts-1">{top3[0].pts}<span className="tv-pod-pts-u">pts</span></div>
                <div className="tv-pod-block tv-pod-block-1" />
              </div>
            )}
            {top3[2] && (
              <div className="tv-pod tv-pod-3">
                <div className="tv-pod-medal">🥉</div>
                <div className="tv-pod-name">{top3[2].name}</div>
                <div className="tv-pod-pts">{top3[2].pts}<span className="tv-pod-pts-u">pts</span></div>
                <div className="tv-pod-block tv-pod-block-3" />
              </div>
            )}
          </div>
          {board.length === 0 && <div className="tv-empty">No players yet!</div>}
        </div>
      )}

      {/* Footer */}
      <div className="tv-footer" style={{position:"relative",zIndex:2}}>⚽ Exact score = 5 pts · Correct winner or draw = 1 pt · Most points wins</div>
    </div>
  );
}

/* ═══ MAIN SHELL ════════════════════════════════════════════════════════════ */
function Main({ appTab, setAppTab, user, isAdmin, board, preds, matches, rules, sponsors,
                getPred, savePred, pts, onLogout,
                users,
                adminUpdateMatch, adminAddMatch, adminDeleteMatch,
                adminSaveRules, adminSaveSponsors,
                menuItems, myCredits, myOrders, placeOrder,
                saveMenuItem, deleteMenuItem, toggleMenuItemAvail,
                adminAddCredits, updateOrderStatus, deleteOrder, loadAllOrders, allOrders, matchesLoaded,
                activeGroup, groupMembers, groupItems,
                createGroupOrder, joinGroupOrder, leaveGroupOrder,
                addGroupItem, removeGroupItem,
                setGroupPaymentMode, assignMyPaymentTo, unassignMyPayment,
                payGroupShareCredits, hostPayAllCredits,
                calcMyGroupShare,
                resetGroupToLobby, printOrderReceipt, stripeCheckout, onToast }) {
  const { t, lang, toggleLang } = useLang();
  const myPts  = pts(user.id);
  const myRank = board.findIndex(u => u.id === user.id) + 1;
  const [animKey, setAnimKey] = useState(appTab);

  const switchTab = (id) => { setAnimKey(id); setAppTab(id); };

  const tabs = [
    { id:"matches",     label:t('matches'),     ico:<SoccerIco /> },
    { id:"leaderboard", label:t('leaderboard'), ico:<TrophyIco /> },
    { id:"menu",        label:t('menu'),        ico:<MenuIco />   },
    { id:"rules",       label:t('rules'),       ico:<RulesIco />  },
    { id:"profile",     label:t('profile'),     ico:<PersonIco /> },
    ...(isAdmin ? [{ id:"admin", label:t('admin'), ico:<AdminIco /> }] : []),
  ];

  return (
    <div className="shell">
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-l">
            <HeaderLogo />
            <div className="hdr-text">
              <span className="hdr-brand">EL MUNDO</span>
              <span className="hdr-caption">⚽ WORLD CUP 2026</span>
            </div>
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
          {appTab === "matches"     && <MatchesView matches={matches} getPred={getPred} savePred={savePred} loaded={matchesLoaded} />}
          {appTab === "leaderboard" && <LeaderView  board={board} user={user} />}
          {appTab === "menu" && <MenuView user={user} menuItems={menuItems} myCredits={myCredits} myOrders={myOrders} onPlaceOrder={placeOrder}
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
          />}
          {appTab === "rules"       && <RulesView   rules={rules} />}
          {appTab === "profile"     && <ProfileView user={user} myPts={myPts} myRank={myRank} preds={preds} matches={matches} sponsors={sponsors} />}
          {appTab === "admin" && isAdmin && (
            <AdminView
              matches={matches} rules={rules} sponsors={sponsors}
              onUpdate={adminUpdateMatch} onAdd={adminAddMatch} onDelete={adminDeleteMatch}
              onSaveRules={adminSaveRules} onSaveSponsors={adminSaveSponsors}
              menuItems={menuItems} users={users}
              onSaveMenuItem={saveMenuItem} onDeleteMenuItem={deleteMenuItem}
              onToggleAvail={toggleMenuItemAvail} onAddCredits={adminAddCredits}
              onUpdateOrderStatus={updateOrderStatus} onDeleteOrder={deleteOrder} onLoadAllOrders={loadAllOrders}
              allOrders={allOrders}
            />
          )}
        </div>
      </main>
      <nav className="bot-nav">
        <div className="bot-nav-inner">
          {tabs.map(({ id, label, ico }) => (
            <button key={id} className={`bnav-btn ${appTab===id?"bnav-on":""}`} onClick={()=>switchTab(id)}>
              <span className="bnav-ico">{ico}</span>
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
function MatchesView({ matches, getPred, savePred, loaded }) {
  const upcoming = sortMatches(matches.filter(m => m.status === "upcoming"));
  const finished = sortMatches(matches.filter(m => m.status === "finished"));

  // collect unique dates across all matches
  const allDates = [...new Set(sortMatches(matches).map(m => m.date).filter(Boolean))];
  const [selDate, setSelDate] = useState("all");

  const filterByDate = arr => selDate === "all" ? arr : arr.filter(m => m.date === selDate);
  const visUpcoming = filterByDate(upcoming);
  const visFinished = filterByDate(finished);

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
      {/* Day filter bar */}
      {allDates.length > 1 && (
        <div className="date-filter-bar">
          <button className={`date-chip ${selDate==="all"?"date-chip-on":""}`} onClick={()=>setSelDate("all")}>ALL</button>
          {allDates.map(d => (
            <button key={d} className={`date-chip ${selDate===d?"date-chip-on":""}`} onClick={()=>setSelDate(d)}>{d}</button>
          ))}
        </div>
      )}

      <div className="section-banner">
        <span className="section-banner-title">UPCOMING</span>
        <span className="section-banner-sub">Exact score = 5 pts · Correct winner = 1 pt</span>
      </div>
      <div className="card-stack">
        {visUpcoming.length === 0 && <div className="empty">No upcoming matches{selDate!=="all"?` on ${selDate}`:""}</div>}
        {visUpcoming.map(m => <MatchCard key={m.id} m={m} pred={getPred(m.id)} onSave={savePred} />)}
      </div>
      <div className="section-banner section-banner-dim">
        <span className="section-banner-title">RESULTS</span>
        <span className="section-banner-sub">Final scores & your predictions</span>
      </div>
      <div className="card-stack">
        {visFinished.length === 0 && <div className="empty">No results{selDate!=="all"?` on ${selDate}`:""}</div>}
        {visFinished.map(m => <MatchCard key={m.id} m={m} pred={getPred(m.id)} onSave={savePred} />)}
      </div>
    </div>
  );
}

function matchKickoff(m) {
  try {
    const year = 2026;
    return new Date(`${m.date} ${year} ${m.time}:00 GMT-0400`);
  } catch { return null; }
}
function useCountdown(m) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (m.status === "finished") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [m.status]);
  const ko = matchKickoff(m);
  if (!ko) return { minsLeft: Infinity, label: "", urgency: "none" };
  const ms = ko - now;
  const totalMins = ms / 60000;
  if (totalMins <= 0) return { minsLeft: 0, label: "LOCKED", urgency: "locked" };
  const h = Math.floor(totalMins / 60);
  const min = Math.floor(totalMins % 60);
  const sec = Math.floor((ms % 60000) / 1000);
  let label, urgency;
  if (totalMins > 1440) { label = `${Math.floor(totalMins/1440)}d left`; urgency = "green"; }
  else if (totalMins > 120) { label = `${h}h ${min}m left`; urgency = "green"; }
  else if (totalMins > 60) { label = `${h}h ${min}m left`; urgency = "yellow"; }
  else if (totalMins > 10) { label = `${min}m ${sec}s left`; urgency = "yellow"; }
  else { label = `${min}m ${sec}s`; urgency = "red"; }
  return { minsLeft: totalMins, label, urgency };
}

function MatchCard({ m, pred, onSave }) {
  const [h, setH] = useState(pred?.h ?? "");
  const [a, setA] = useState(pred?.a ?? "");
  const [saved, setSaved] = useState(!!pred);
  const fin       = m.status === "finished";
  const correct   = fin && pred && pred.h === m.hs && pred.a === m.as;
  const wrong     = fin && pred && !correct;
  const partialCorrect = fin && pred && !correct && (() => {
    const pw = pred.h > pred.a ? "home" : pred.h < pred.a ? "away" : "draw";
    const mw = m.hs  > m.as   ? "home" : m.hs  < m.as   ? "away" : "draw";
    return pw === mw;
  })();
  const { minsLeft, label: countdownLabel, urgency } = useCountdown(m);
  const locked    = !fin && minsLeft <= 60;
  const submitted = !!pred;

  const save = () => {
    if (h===""||a===""||locked||submitted) return;
    onSave(m.id, h, a);
    setSaved(true);
  };

  const urgencyColor = urgency === "red" ? "rgba(255,255,255,1)" : urgency === "yellow" ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.6)";
  const urgencyBg    = urgency === "red" ? "rgba(255,255,255,.1)" : urgency === "yellow" ? "rgba(255,255,255,.05)" : "transparent";
  const urgencyBorder= urgency === "red" ? "rgba(255,255,255,.5)" : urgency === "yellow" ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.15)";
  const urgencyGlow  = urgency === "red"    ? "0 0 6px rgba(239,68,68,.5), 0 0 12px rgba(239,68,68,.2)"
                     : urgency === "yellow" ? "0 0 6px rgba(251,191,36,.4), 0 0 12px rgba(251,191,36,.15)"
                     : urgency === "green"  ? "0 0 6px rgba(74,222,128,.35), 0 0 10px rgba(74,222,128,.12)"
                     : "none";
  const statusColor  = correct ? "#22c55e" : partialCorrect ? "#f59e0b" : wrong ? "#ef4444" : locked && !fin ? "#f59e0b" : "transparent";

  return (
    <div className={`mcard ${correct?"mcard-ok":partialCorrect?"mcard-partial":wrong?"mcard-ng":""}`} style={{borderLeft:`3px solid ${statusColor}`}}>
      <div className="mcard-topstrip">
        <span className="mcard-group-pill">{m.group}</span>
        <span className="mcard-dt">{m.date} · {m.time} BON</span>
        {!fin && countdownLabel && (
          <span className={`countdown-chip${urgency==="red"?" countdown-chip-urgent":""}`} style={{color: urgencyColor, borderColor: urgencyBorder, background: urgencyBg, boxShadow: urgencyGlow}}>
            {urgency === "locked" ? "🔒 LOCKED" : countdownLabel}
          </span>
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
          ) : locked ? (
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
      {!fin && !submitted && !locked && (
        <div className="mcard-foot">
          <button className={`pred-cta ${saved?"pred-cta-done":""}`} disabled={h===""||a===""} onClick={save}>
            {saved ? <><IcoCheck /> PREDICTION SAVED</> : "SUBMIT PREDICTION →"}
          </button>
        </div>
      )}
      {!fin && submitted && (
        <div className="mverdict mv-locked"><IcoCheck /> Locked in · {pred.h}:{pred.a}</div>
      )}
      {!fin && locked && !submitted && (
        <div className="mverdict mv-missed"><IcoDash /> Missed — predictions closed for this match</div>
      )}
      {fin && (
        <div className={`mverdict ${correct?"mv-ok": partialCorrect?"mv-partial":"mv-ng"}`}>
          {correct      ? <><IcoCheck /> Correct +5 pts</>
            : partialCorrect ? <><IcoCheck /> Right winner +1 pt · Your pick: {pred.h}:{pred.a}</>
            : pred        ? <><IcoX /> Wrong · Your pick: {pred.h}:{pred.a}</>
            :               <><IcoDash /> No prediction</>}
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

function LeaderView({ board, user }) {
  const filtered = board.filter(u => u.is_admin !== true && u.is_admin !== 1 && u.is_admin !== "true");
  const top3 = filtered.slice(0, 3);
  const rest = filtered.slice(3);
  const myRank = filtered.findIndex(u => u.id === user.id) + 1;
  const myEntry = filtered.find(u => u.id === user.id);

  return (
    <div className="lb-root">

      {/* ── TITLE BAR ── */}
      <div className="lb-title-bar">
        <span className="lb-title">RANKINGS</span>
      </div>

      {/* ── TOP 3 PODIUM ── */}
      {top3.length >= 3 && (
        <div className="lb-podium">
          {/* 2nd */}
          {top3[1] ? (
            <div className="lb-pod lb-pod-2">
              <div className="lb-pod-medal">🥈</div>
              <div className="lb-pod-name">{top3[1].name}</div>
              <div className="lb-pod-pts">{top3[1].pts}<span className="lb-pod-pts-u">pts</span></div>
              {top3[1].id === user.id && <div className="lb-pod-you">YOU</div>}
              <div className="lb-pod-plinth lb-pod-plinth-2" />
            </div>
          ) : <div className="lb-pod" />}

          {/* 1st — tallest */}
          <div className="lb-pod lb-pod-1">
            <div className="lb-pod-crown">👑</div>
            <div className="lb-pod-medal lb-pod-medal-1">🥇</div>
            <div className="lb-pod-name lb-pod-name-1">{top3[0].name}</div>
            <div className="lb-pod-pts lb-pod-pts-1">{top3[0].pts}<span className="lb-pod-pts-u">pts</span></div>
            {top3[0].id === user.id && <div className="lb-pod-you">YOU</div>}
            <div className="lb-pod-plinth lb-pod-plinth-1" />
          </div>

          {/* 3rd */}
          {top3[2] ? (
            <div className="lb-pod lb-pod-3">
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
            <div key={u.id} className={`lb-row ${u.id===user.id?"lb-row-me":""}`}>
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
/* ═══ PROFILE ═══════════════════════════════════════════════════════════════ */
function ProfileView({ user, myPts, myRank, preds, matches, sponsors }) {
  const fin  = matches.filter(m => m.status==="finished");
  const sub  = fin.filter(m => !!preds[`${user.id}__${m.id}`]).length;
  const corr = fin.filter(m => { const p=preds[`${user.id}__${m.id}`]; return p&&p.h===m.hs&&p.a===m.as; }).length;
  const acc  = sub>0 ? Math.round(corr/sub*100) : 0;
  const initials = (user.name || "?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return (
    <div className="prof-wrap">
      <div className="prof-hero">
        <div className="prof-av">{initials}</div>
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
      <div className="info-card">
        <div className="info-title">⚽ HOW POINTS WORK</div>
        <p className="info-body">Predict the exact final score for each match. A correct prediction earns <strong>5 points</strong>. Predict the right winner or draw (wrong score) earns <strong>1 point</strong>. Most points at tournament end wins.</p>
      </div>

      {/* ── SPONSORS SECTION ── */}
      {sponsors?.length > 0 && (
        <div style={{marginTop:8}}>
          <div className="prof-section-divider">
            <span className="prof-section-label">OUR SPONSORS</span>
          </div>
          <div className="prof-sponsor-sub">Thank you for making this event possible</div>
          {sponsors[0] && (
            <div className="sponsor-hero">
              <div className="sponsor-hero-emoji">
                {sponsors[0].logo
                  ? <img src={sponsors[0].logo} alt={sponsors[0].name} style={{width:80,height:80,objectFit:"contain"}} />
                  : sponsors[0].emoji}
              </div>
              <div className="sponsor-hero-role">{sponsors[0].role}</div>
              <div className="sponsor-hero-name">{sponsors[0].name}</div>
              <div className="sponsor-hero-detail">{sponsors[0].detail}</div>
            </div>
          )}
          <div className="card-stack">
            {sponsors.slice(1).map(s => (
              <div key={s.id} className="sponsor-card">
                <div className="sponsor-emoji">
                  {s.logo
                    ? <img src={s.logo} alt={s.name} style={{width:48,height:48,objectFit:"contain"}} />
                    : s.emoji}
                </div>
                <div className="sponsor-info">
                  <div className="sponsor-role">{s.role}</div>
                  <div className="sponsor-name">{s.name}</div>
                  {s.detail && <div className="sponsor-detail">{s.detail}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className="sponsor-cta-box">
            <div className="sponsor-cta-title">Become a Sponsor</div>
            <div className="sponsor-cta-body">Contact El Mundo Bar-Rest to learn about sponsorship opportunities for the World Cup event.</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ ADMIN VIEW ════════════════════════════════════════════════════════════ */
function AdminView({ matches, rules, sponsors, onUpdate, onAdd, onDelete, onSaveRules, onSaveSponsors, menuItems, users, onSaveMenuItem, onDeleteMenuItem, onToggleAvail, onAddCredits, onUpdateOrderStatus, onDeleteOrder, onLoadAllOrders, allOrders }) {
  const [section, setSection] = useState("floorplan");

  const TABS = [
    { id:"floorplan", label:"🗺 Floor Plan" },
    { id:"menu",     label:"🍽 Menu"     },
    { id:"tables",   label:"🪑 Tables"   },
    { id:"credits",  label:"💳 Credits"  },
    { id:"matches",  label:"⚽ Matches"  },
    { id:"rules",    label:"📋 Rules"    },
    { id:"sponsors", label:"⭐ Sponsors" },
  ];

  return (
    <div className={section === "floorplan" ? "" : "vpad"}>
      {section !== "floorplan" && <SecHead title="Admin Panel" sub="Manage all content from here" />}
      <div className="admin-subtabs" style={{flexWrap:"wrap"}}>
        {TABS.map(t => (
          <button key={t.id} className={`admin-subtab ${section===t.id?"ast-on":""}`} onClick={()=>setSection(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {section === "floorplan" && <FloorPlan allOrders={allOrders} onLoad={onLoadAllOrders} onUpdateStatus={onUpdateOrderStatus} onDeleteOrder={onDeleteOrder} />}
      {section === "matches"   && <AdminMatches  matches={matches}   onUpdate={onUpdate} onAdd={onAdd} onDelete={onDelete} />}
      {section === "rules"     && <AdminRules    rules={rules}       onSave={onSaveRules} />}
      {section === "sponsors"  && <AdminSponsors sponsors={sponsors} onSave={onSaveSponsors} />}
      {section === "menu"      && <AdminMenu     menuItems={menuItems} onSave={onSaveMenuItem} onDelete={onDeleteMenuItem} onToggleAvail={onToggleAvail} />}
      {section === "credits"   && <AdminCredits  users={users} onAddCredits={onAddCredits} />}
      {section === "tables"    && <AdminTables />}
    </div>
  );
}

/* ── Admin: Tables ── */
function AdminTables() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const unlock = async (id, tableNum) => {
    if (!window.confirm(`Unlock table ${tableNum}? This will cancel the group order.`)) return;
    // Cancel the order FIRST so members' realtime/poll transitions fire before their data disappears
    await supabase.from("group_orders").update({ status: "cancelled" }).eq("id", id);
    await supabase.from("group_order_members").delete().eq("group_order_id", id);
    await supabase.from("group_order_items").delete().eq("group_order_id", id);
    load();
  };

  const statusColor = (s) => s === "awaiting_payment" ? "#f59e0b" : "#22c55e";

  return (
    <div style={{padding:"0 4px"}}>
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
            onClick={() => unlock(g.id, g.table_number)}
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
  const doSort = () => {
    sortMatches(matches).forEach(m => onUpdate(m));
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
  stripeCheckout, onToast,
}) {
  const [screen, setScreen] = useState("start"); // "start"|"create"|"join"|"lobby"|"checkout"|"payment"|"placed"
  const [joinCode, setJoinCode] = useState("");
  const [tableInput, setTableInput] = useState("");
  const [tableErr, setTableErr] = useState("");
  const [joinErr, setJoinErr] = useState("");
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [takenTables, setTakenTables] = useState([]);
  const [cancelNote, setCancelNote] = useState(false);
  const [goMenuOpen, setGoMenuOpen] = useState(false);
  const [goMenuCat, setGoMenuCat] = useState("all");

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
      <button className="go-btn-primary" onClick={() => setScreen("create")}>
        + START GROUP ORDER
      </button>
      <button className="go-btn-secondary" style={{marginTop:10}} onClick={() => setScreen("join")}>
        JOIN WITH CODE
      </button>
    </div>
  );

  // ── SCREEN: CREATE ──
  if (screen === "create") return (
    <div style={{padding:"24px 16px"}}>
      <button className="go-back-btn" onClick={() => setScreen("start")}>← Back</button>
      <div className="go-section-title">START GROUP ORDER</div>
      <label className="afield-lbl" style={{display:"block",margin:"8px 0 12px"}}>SELECT YOUR TABLE</label>
      <div className="table-picker-grid" style={{marginBottom:8}}>
        {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26].map(n => {
          const taken = takenTables.includes(String(n));
          return (
            <button key={n}
              disabled={taken}
              className={`table-picker-btn ${tableInput===String(n)?"table-picker-on":""}`}
              style={taken ? {opacity:.3,cursor:"not-allowed",position:"relative"} : {}}
              onClick={() => { if (!taken) { setTableInput(String(n)); setTableErr(""); } }}
              title={taken ? `Table ${n} is taken` : `Table ${n}`}>
              {n}
              {taken && <span style={{position:"absolute",top:2,right:3,fontSize:8,color:"#f87171"}}>✕</span>}
            </button>
          );
        })}
      </div>
      {takenTables.length > 0 && (
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.35)",marginBottom:8}}>
          ✕ = table already has an active group order
        </div>
      )}
      {tableInput && <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:8,fontWeight:600}}>Selected: Table {tableInput}</div>}
      {tableErr && <div style={{color:"rgba(239,68,68,.8)",fontFamily:"'Outfit',sans-serif",fontSize:13,marginBottom:8}}>{tableErr}</div>}
      <button className="go-btn-primary" style={{marginTop:8}} disabled={!tableInput || busy} onClick={handleCreate}>
        {busy ? "CREATING…" : "CREATE GROUP ORDER"}
      </button>
    </div>
  );

  // ── SCREEN: JOIN ──
  if (screen === "join") return (
    <div style={{padding:"24px 16px"}}>
      <button className="go-back-btn" onClick={() => setScreen("start")}>← Back</button>
      <div className="go-section-title">JOIN GROUP ORDER</div>
      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:"rgba(255,255,255,.5)",marginBottom:16}}>
        Ask the host for the 6-character join code.
      </div>
      <input className="ffield-inp" type="text" placeholder="Enter code e.g. X7K2QP"
        value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
        style={{width:"100%",fontSize:28,textAlign:"center",padding:"14px",letterSpacing:8,marginBottom:8}} />
      {joinErr && <div style={{color:"rgba(239,68,68,.8)",fontFamily:"'Outfit',sans-serif",fontSize:13,marginBottom:8}}>{joinErr}</div>}
      <button className="go-btn-primary" style={{marginTop:8}} disabled={busy} onClick={handleJoin}>
        {busy ? "JOINING…" : "JOIN ORDER"}
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
        const cats = ["all", ...Array.from(new Set(available.map(i => i.category || "Other")))];
        const filtered = goMenuCat === "all" ? available : available.filter(i => (i.category || "Other") === goMenuCat);
        return (
          <div className="go-modal-overlay" onClick={() => setGoMenuOpen(false)}>
            <div className="go-modal-panel" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="go-modal-header">
                <div className="go-modal-title">ADD ITEMS</div>
                <button className="go-modal-close" onClick={() => setGoMenuOpen(false)}>✕</button>
              </div>
              {/* Category pills */}
              <div className="go-modal-cats">
                {cats.map(c => (
                  <button key={c} className={`go-modal-cat-pill${goMenuCat === c ? " go-modal-cat-on" : ""}`}
                    onClick={() => setGoMenuCat(c)}>
                    {c === "all" ? "ALL" : c.toUpperCase()}
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

    // HOST PAYS ALL
    if (activeGroup?.payment_mode === "host" && isHost) {
      const alreadyPaid = myMember?.payment_status === "paid";
      return (
        <div style={{padding:"24px 16px"}}>
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
            <div style={{textAlign:"center",padding:"20px 0",fontFamily:"'Outfit',sans-serif",fontSize:15,color:"#4ade80"}}>
              ✅ Payment confirmed — waiting for order to be placed…
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
            <div style={{textAlign:"center",padding:"16px 0",fontFamily:"'Outfit',sans-serif",fontSize:15,color:"#4ade80"}}>
              ✅ Your payment is confirmed!
            </div>
          )}
        </div>
      );
    }
  }

  return null;
}

function MenuView({ user, menuItems, myCredits, myOrders, onPlaceOrder,
  activeGroup, groupMembers, groupItems,
  createGroupOrder, joinGroupOrder, leaveGroupOrder,
  addGroupItem, removeGroupItem,
  setGroupPaymentMode, assignMyPaymentTo, unassignMyPayment,
  payGroupShareCredits, hostPayAllCredits,
  calcMyGroupShare,
  resetGroupToLobby, printOrderReceipt, stripeCheckout, onToast }) {
  const { t } = useLang();
  const [cart,        setCart]        = useState({});
  const [tab,         setTab]         = useState("menu");
  const [table,       setTable]       = useState("");
  const [placing,     setPlacing]     = useState(false);
  const [tableErr,    setTableErr]    = useState("");
  const [topupAmt,    setTopupAmt]    = useState("");
  const [cartPayMethod, setCartPayMethod] = useState("credits"); // "credits" | "card"

  const available  = menuItems.filter(i => i.available);
  const [activeCat, setActiveCat] = useState(null);
  const sectionRefs = useRef({});
  const pillsRef    = useRef(null);
  // Group available items by category in defined order
  const menuSections = MENU_SECTIONS.map(s => ({
    ...s,
    cats: s.cats.map(c => ({ ...c, items: available.filter(i => i.category === c.id) }))
               .filter(c => c.items.length > 0),
  })).filter(s => s.cats.length > 0);
  const allActiveCats = menuSections.flatMap(s => s.cats);

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

  const addToCart      = id => setCart(c => ({ ...c, [id]: (c[id]||0)+1 }));
  const removeFromCart = id => setCart(c => { const n={...c}; if(n[id]>1) n[id]--; else delete n[id]; return n; });
  const clearCart      = () => setCart({});

  const cartItems = Object.entries(cart).map(([id, qty]) => {
    const item = menuItems.find(i => i.id === id);
    return { ...item, qty };
  }).filter(i => i.name);

  const cartTotal = cartItems.reduce((s,i) => s + i.price * i.qty, 0);
  const cartCount = cartItems.reduce((s,i) => s + i.qty, 0);

  // All valid table numbers in the bar
  const VALID_TABLES = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26];
  const placingRef = useRef(false); // ref guard prevents double submit

  // ── Set initial active category when menu first loads ──
  useEffect(() => {
    if (allActiveCats.length > 0 && !activeCat) setActiveCat(allActiveCats[0].id);
  }, [allActiveCats.length]);

  // ── IntersectionObserver: highlight pill as user scrolls ──
  useEffect(() => {
    if (tab !== "menu" || allActiveCats.length === 0) return;
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
  }, [tab, allActiveCats.length]);

  const handleOrder = async () => {
    if (!table.trim()) { setTableErr("Please select your table"); return; }
    const tableNum = parseInt(table.trim());
    if (!VALID_TABLES.includes(tableNum)) {
      setTableErr(`Table ${table} doesn't exist. Valid tables: 1–26`); return;
    }
    setTableErr("");
    if (placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    const ok = await onPlaceOrder({
      tableNumber: String(tableNum),
      items: cartItems.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty })),
      total: +cartTotal.toFixed(2),
      paymentMethod: "credits",
    });
    if (ok) { clearCart(); setTab("orders"); }
    placingRef.current = false;
    setPlacing(false);
  };

  const handleStripeOrder = async () => {
    if (!table.trim()) { setTableErr("Please select your table"); return; }
    const tableNum = parseInt(table.trim());
    if (!VALID_TABLES.includes(tableNum)) {
      setTableErr(`Table ${table} doesn't exist. Valid tables: 1–26`); return;
    }
    setTableErr("");
    if (placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    // Insert a pending order first so we have an ID for the webhook
    const { data: newOrder, error } = await supabase.from("orders").insert({
      user_id: user.id,
      user_name: user.name,
      table_number: String(tableNum),
      items: cartItems.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty })),
      total: +cartTotal.toFixed(2),
      payment_method: "card_pending",
      status: "pending",
    }).select().single();
    placingRef.current = false;
    setPlacing(false);
    if (error || !newOrder) { onToast("Error creating order", false); return; }
    clearCart();
    // Redirect to Stripe
    stripeCheckout({
      type: "order",
      orderId: newOrder.id,
      userId: user.id,
      userEmail: user.email,
      items: cartItems.map(i => ({ name:i.name, qty:i.qty, price:i.price })),
      total: +cartTotal.toFixed(2),
    });
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
          {id:"group",  label:`👥 ${t('groupTab')}${activeGroup?" ·":""}`},
          {id:"cart",   label:`🛒 ${t('cartTab')}${cartCount>0?` · ${cartCount}`:""}`},
          {id:"orders", label:`📦 ${t('ordersTab')}`},
          {id:"wallet", label:`💳 ${t('walletTab')}`},
        ].map(st=>(
          <button key={st.id} className={`admin-subtab ${tab===st.id?"ast-on":""}`} onClick={()=>setTab(st.id)}>{st.label}</button>
        ))}
      </div>

      {/* ── MENU TAB ── */}
      {tab === "menu" && (
        <div style={{paddingBottom: cartCount > 0 ? 80 : 20}}>

          {/* ── Sticky category pill bar ── */}
          {allActiveCats.length > 0 && (
            <div ref={pillsRef} className="menu-pills-bar">
              {allActiveCats.map(cat => (
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
          {menuSections.map(sec => (
            <div key={sec.section}>
              {/* Section divider: DRINKS / FOOD */}
              <div className="menu-section-divider">
                <div className="menu-section-line"/>
                <span className="menu-section-label">{sec.section}</span>
                <div className="menu-section-line"/>
              </div>

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
                    return (
                      <div key={item.id} className="menu-item-row">
                        <div className="menu-item-info">
                          <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                            <div className="menu-item-name">{item.name}</div>
                            {isBucket && <span className="menu-badge menu-badge-gold">🪣 BUCKET</span>}
                            {isGlass   && <span className="menu-badge menu-badge-blue">🍷 GLASS</span>}
                            {isBottle  && <span className="menu-badge menu-badge-blue">🍾 BOTTLE</span>}
                            {isDraft   && <span className="menu-badge menu-badge-amber">🍺 DRAFT</span>}
                          </div>
                          {item.description && <div className="menu-item-desc">{item.description}</div>}
                          <div className="menu-item-price">${(+item.price).toFixed(2)}</div>
                        </div>
                        <div className="menu-item-actions">
                          {cart[item.id] ? (
                            <div className="menu-qty-ctrl">
                              <button className="menu-qty-btn" onClick={()=>removeFromCart(item.id)}>−</button>
                              <span className="menu-qty-val">{cart[item.id]}</span>
                              <button className="menu-qty-btn" onClick={()=>addToCart(item.id)}>+</button>
                            </div>
                          ) : (
                            <button className="menu-add-btn" onClick={()=>addToCart(item.id)}>{t('addToCart')}</button>
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

          {cartCount > 0 && (
            <div className="cart-fab" onClick={()=>setTab("cart")}>
              {t('viewCart')} · {cartCount} {t('itemsLabel')} · ${cartTotal.toFixed(2)} →
            </div>
          )}
        </div>
      )}

      {/* ── CART TAB ── */}
      {tab === "cart" && (
        <div style={{paddingBottom:32}}>
          {cartItems.length === 0 ? (
            <div className="empty" style={{padding:"60px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
              <div style={{fontSize:40}}>🛒</div>
              <div>Your cart is empty</div>
              <button className="menu-add-btn" style={{padding:"10px 24px",marginTop:8}} onClick={()=>setTab("menu")}>{t('browseMenu')}</button>
            </div>
          ) : (
            <>
              {cartItems.map(item => (
                <div key={item.id} className="cart-row">
                  <div className="cart-row-name">{item.name}</div>
                  <div className="menu-qty-ctrl">
                    <button className="menu-qty-btn" onClick={()=>removeFromCart(item.id)}>−</button>
                    <span className="menu-qty-val">{item.qty}</span>
                    <button className="menu-qty-btn" onClick={()=>addToCart(item.id)}>+</button>
                  </div>
                  <div className="cart-row-price">${(item.price*item.qty).toFixed(2)}</div>
                </div>
              ))}
              <div className="cart-total-row">
                <span className="cart-total-label">{t('total')}</span>
                <span className="cart-total-val">${cartTotal.toFixed(2)}</span>
              </div>
              <div style={{padding:"0 16px"}}>
                <div className="afield" style={{marginBottom:14}}>
                  <label className="afield-lbl">{t('selectTable')}</label>
                  <div className="table-picker-grid">
                    {VALID_TABLES.map(n => (
                      <button key={n}
                        className={`table-picker-btn ${table===String(n)?"table-picker-on":""}`}
                        onClick={()=>{setTable(String(n));setTableErr("");}}>
                        {n}
                      </button>
                    ))}
                  </div>
                  {tableErr && <div style={{color:"rgba(239,68,68,.8)",fontFamily:"'Outfit',sans-serif",fontSize:12,marginTop:8}}>{tableErr}</div>}
                  {table && <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.5)",marginTop:8,fontWeight:600}}>{t('selectedTable')} {table}</div>}
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
                    disabled={placing || cartTotal > myCredits}
                    onClick={handleOrder}>
                    {placing ? t('placing') : `${t('placeOrder')} · $${cartTotal.toFixed(2)}`}
                  </button>
                ) : (
                  <button className="order-place-btn stripe-pay-btn"
                    disabled={placing}
                    onClick={handleStripeOrder}>
                    {placing ? "PROCESSING…" : `💳 PAY WITH CARD · $${cartTotal.toFixed(2)}`}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
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
              <button className="receipt-print-btn" onClick={() => printOrderReceipt(ord, user.name)}>
                🖨 {t('printReceipt')}
              </button>
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
        />
      )}
    </div>
  );
}

/* ── Menu category definitions ─────────────────────────────────────────────── */
const MENU_SECTIONS = [
  { section:"DRINKS", cats:[
    { id:"Hot Drinks",        icon:"☕", label:"Hot Drinks"         },
    { id:"Special Coffee",icon:"✨", label:"Special Coffee" },
    { id:"Beer",          icon:"🍺", label:"Beer"           },
    { id:"Cocktails",     icon:"🍹", label:"Cocktails"      },
    { id:"Gin & Tonics",  icon:"🫧", label:"Gin & Tonics"   },
    { id:"Vodka",         icon:"🥃", label:"Vodka"          },
    { id:"Whiskey",       icon:"🥃", label:"Whiskey"        },
    { id:"Rum",           icon:"🍹", label:"Rum"            },
    { id:"Liqueurs",      icon:"🍶", label:"Liqueurs"       },
    { id:"Tequila",       icon:"🌵", label:"Tequila"        },
    { id:"House Wines",   icon:"🍷", label:"House Wines"    },
    { id:"Sparkling",     icon:"🥂", label:"Sparkling"      },
  ]},
  { section:"FOOD", cats:[
    { id:"Appetizers",    icon:"🥗", label:"Appetizers"     },
    { id:"Burgers",       icon:"🍔", label:"Burgers"        },
    { id:"Meat & Fish",   icon:"🥩", label:"Meat & Fish"    },
    { id:"Stoba",         icon:"🍲", label:"Stoba"          },
    { id:"Fajitas",       icon:"🌮", label:"Fajitas"        },
    { id:"Quesadillas",   icon:"🫓", label:"Quesadillas"    },
    { id:"Pasta",         icon:"🍝", label:"Pasta"          },
    { id:"Kids Menu",     icon:"⭐", label:"Kids Menu"       },
    { id:"Desserts",      icon:"🍮", label:"Desserts"       },
  ]},
];
const ALL_MENU_CATS = MENU_SECTIONS.flatMap(s => s.cats.map(c => c.id));
const catMeta = id => MENU_SECTIONS.flatMap(s=>s.cats).find(c=>c.id===id) || { icon:"🍽", label:id };

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

function AdminMenu({ menuItems, onSave, onDelete, onToggleAvail }) {
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
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
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
              <button className="modal-del-btn" onClick={()=>{ onAddCredits(confirm.userId, +confirm.amount, confirm.name); setAmounts(a=>({...a,[confirm.userId]:""})); setConfirm(null); }}>Yes, Add</button>
              <button className="modal-cancel-btn" onClick={()=>setConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-hint" style={{margin:"0 14px",padding:"12px 0 4px",borderTop:"none"}}>
        ✓ Verified. Search by player number or name, enter amount and press ADD.
      </div>
      <div style={{padding:"0 14px 12px"}}>
        <input className="afield-inp" placeholder="Search by # or name..." value={search}
          onChange={e=>setSearch(e.target.value)} style={{width:"100%",boxSizing:"border-box"}} />
      </div>
      {userList.map(u => (
        <div key={u.id} className="admin-row">
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {u.player_number && (
                <span style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2,color:"rgba(255,255,255,.35)",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",padding:"2px 8px",flexShrink:0}}>
                  #{u.player_number}
                </span>
              )}
              <div className="admin-row-teams">{u.name}</div>
            </div>
            <div className="admin-row-dt">{u.phone||"No phone"}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
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
      ))}
      {userList.length === 0 && <div className="empty">No players found</div>}

      <div style={{padding:"16px 14px 8px",borderTop:"1px solid rgba(255,255,255,.07)",marginTop:16}}>
        <button style={{background:"transparent",border:"none",color:"rgba(255,255,255,.3)",fontFamily:"'Outfit',sans-serif",fontSize:12,cursor:"pointer",padding:0}}
          onClick={()=>{setUnlocked(false);setPinInput("");}}>
          🔒 Lock credits panel
        </button>
      </div>
    </div>
  );
}

/* ═══ PRINT RECEIPT ══════════════════════════════════════════════════════════ */
function printReceipt(ord) {
  const date = new Date(ord.created_at);
  const dateStr = date.toLocaleDateString("en-US",{weekday:"short",year:"numeric",month:"long",day:"numeric"});
  const timeStr = date.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
  const items = (ord.items || []).map(it => `
    <tr>
      <td style="padding:5px 0;font-size:13px;">${it.qty}× ${it.name}</td>
      <td style="padding:5px 0;font-size:13px;text-align:right;">$${(it.price*it.qty).toFixed(2)}</td>
    </tr>`).join("");
  const payLabel = ord.payment_method === "credits" ? "Credits" : ord.payment_method === "card" ? "Card" : "Cash";

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Receipt #${ord.order_number||ord.id}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; color: #000; background: #fff; width: 80mm; font-size: 12px; }
    .wrap { width: 72mm; margin: 0 auto; padding: 4mm 0; }
    .logo-block { text-align: center; padding-bottom: 10px; border-bottom: 2px solid #000; margin-bottom: 10px; }
    .logo-block .brand { font-size: 28px; font-weight: 900; letter-spacing: 4px; line-height: 1; }
    .logo-block .sub   { font-size: 9px; letter-spacing: 3px; margin-top: 4px; }
    .logo-block .sub2  { font-size: 8px; letter-spacing: 2px; color: #333; margin-top: 2px; }
    .meta { font-size: 11px; line-height: 1.9; margin-bottom: 10px; }
    .meta .row { display: flex; justify-content: space-between; }
    .meta .lbl { color: #333; }
    .divider { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    .divider-solid { border: none; border-top: 2px solid #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { font-size: 12px; padding: 4px 0; }
    .total-row td { font-size: 15px; font-weight: 900; letter-spacing: 1px; padding-top: 8px; }
    .payment-row { font-size: 11px; color: #333; margin-top: 5px; }
    .footer { text-align: center; margin-top: 14px; padding-top: 10px; border-top: 2px solid #000; }
    .footer .thanks { font-size: 13px; font-weight: 700; letter-spacing: 2px; margin-bottom: 4px; }
    .footer .url    { font-size: 9px; letter-spacing: 2px; color: #444; }
    .footer .wc     { font-size: 10px; letter-spacing: 3px; margin-top: 6px; }
    @media print { 
      html, body { width: 80mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style></head>
  <body><div class="wrap">
    <div class="logo-block">
      <div class="brand">EL MUNDO</div>
      <div class="sub">BAR · REST · EST. 2009</div>
      <div class="sub2">KRALENDIJK, BONAIRE</div>
    </div>
    <div class="meta">
      <div class="row"><span class="lbl">Date</span><span>${dateStr}</span></div>
      <div class="row"><span class="lbl">Time</span><span>${timeStr}</span></div>
      <div class="row"><span class="lbl">Table</span><span><b>${ord.table_number}</b></span></div>
      ${ord.order_number ? `<div class="row"><span class="lbl">Order #</span><span><b>${ord.order_number}</b></span></div>` : ""}
    </div>
    <hr class="divider"/>
    <table>
      <tbody>${items}</tbody>
    </table>
    <hr class="divider-solid"/>
    <table>
      <tbody>
        <tr class="total-row">
          <td>TOTAL</td>
          <td style="text-align:right;">$${(+ord.total).toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
    <div class="payment-row">Payment: ${payLabel}</div>
    <div class="footer">
      <div class="thanks">THANK YOU!</div>
      <div class="url">www.elmundobonaire.com</div>
      <div class="wc">⚽ WORLD CUP 2026 ⚽</div>
    </div>
  </div>
  </body></html>`;

  // Use hidden iframe — no popup, no tab switch, print dialog appears directly
  const existing = document.getElementById("__receipt_frame");
  if (existing) existing.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "__receipt_frame";
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;opacity:0;";
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  iframe.contentWindow.onafterprint = () => iframe.remove();
  setTimeout(() => { try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch(e) {} }, 300);
}

/* ═══ ADMIN: ORDER HISTORY ═══════════════════════════════════════════════════ */
function AdminHistory({ allOrders }) {
  const [search, setSearch] = useState("");

  const results = [...allOrders]
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .filter(o => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return String(o.order_number||"").includes(s) ||
        o.user_name?.toLowerCase().includes(s) ||
        String(o.table_number||"").includes(s);
    });

  const isNameSearch = search.trim().length > 0 && isNaN(search.trim()) && !search.startsWith("#");

  return (
    <div style={{padding:"12px 14px 32px"}}>
      <input className="afield-inp" placeholder="Search by #order, name or table…"
        value={search} onChange={e=>setSearch(e.target.value)}
        style={{width:"100%",boxSizing:"border-box",marginBottom:14}} />

      <div className="admin-section-lbl">ORDER HISTORY<span className="admin-count">{results.length}</span></div>

      {results.length === 0 && <div className="empty">No orders found</div>}

      {isNameSearch ? (() => {
        const grouped = results.reduce((acc,o) => { const k=o.user_name||"?"; if(!acc[k])acc[k]=[]; acc[k].push(o); return acc; },{});
        return Object.entries(grouped).map(([name,orders]) => (
          <div key={name} style={{marginBottom:16}}>
            <div className="history-person-header">
              <div>
                <div className="history-person-name">{name}</div>
                <div className="history-person-meta">{orders.length} orders · ${orders.reduce((s,o)=>s+(+o.total),0).toFixed(2)} total</div>
              </div>
            </div>
            {orders.map(ord => (
              <div key={ord.id} className="history-order-row">
                <div className="history-order-row-left">
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {ord.order_number && <span className="order-id-chip">#{ord.order_number}</span>}
                    <span className="history-order-table">Table {ord.table_number}</span>
                  </div>
                  <div className="history-order-items-inline">{ord.items.map(it=>`${it.qty}x ${it.name}`).join(" · ")}</div>
                  <div className="order-card-date">{new Date(ord.created_at).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div className="history-order-amount">${(+ord.total).toFixed(2)}</div>
                  <button onClick={()=>printReceipt(ord)} title="Print Receipt"
                    style={{background:"transparent",border:"1px solid rgba(255,255,255,.15)",color:"rgba(255,255,255,.45)",padding:"5px 9px",cursor:"pointer",fontSize:12,borderRadius:2,transition:"all .15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,.4)";e.currentTarget.style.color="#fff";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,.15)";e.currentTarget.style.color="rgba(255,255,255,.45)";}}>🖨</button>
                </div>
              </div>
            ))}
          </div>
        ));
      })() : results.map(ord => (
        <div key={ord.id} className="order-card" style={{marginBottom:8,borderLeft:"3px solid rgba(255,255,255,.1)"}}>
          <div className="order-card-top">
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div className="order-card-table">Table {ord.table_number}</div>
                {ord.order_number && <div className="order-id-chip">#{ord.order_number}</div>}
              </div>
              <div className="order-card-date">{ord.user_name} · {new Date(ord.created_at).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:16,color:"#fff"}}>${(+ord.total).toFixed(2)}</div>
              <button onClick={()=>printReceipt(ord)} title="Print Receipt"
                style={{background:"transparent",border:"1px solid rgba(255,255,255,.15)",color:"rgba(255,255,255,.45)",padding:"5px 9px",cursor:"pointer",fontSize:12,borderRadius:2,transition:"all .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,.4)";e.currentTarget.style.color="#fff";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,.15)";e.currentTarget.style.color="rgba(255,255,255,.45)";}}>🖨</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══ ADMIN: FINANCIAL REPORT ════════════════════════════════════════════════ */
function AdminReport({ allOrders }) {
  const iso = d => d.toISOString().slice(0,10);
  const todayISO = iso(new Date());
  const [preset,  setPreset ] = useState("today");
  const [finFrom, setFinFrom] = useState(todayISO);
  const [finTo,   setFinTo  ] = useState(todayISO);

  const applyPreset = (p) => {
    const d = new Date();
    setPreset(p);
    if (p === "today")     { setFinFrom(iso(d)); setFinTo(iso(d)); }
    if (p === "yesterday") { const y=new Date(d); y.setDate(y.getDate()-1); setFinFrom(iso(y)); setFinTo(iso(y)); }
    if (p === "week")      { const s=new Date(d); s.setDate(d.getDate()-d.getDay()); setFinFrom(iso(s)); setFinTo(iso(d)); }
    if (p === "month")     { setFinFrom(iso(new Date(d.getFullYear(),d.getMonth(),1))); setFinTo(iso(d)); }
    if (p === "all")       { setFinFrom("2024-01-01"); setFinTo(iso(d)); }
  };

  const filtered = allOrders.filter(o => {
    if (!o.created_at) return false;
    const d = o.created_at.slice(0,10);
    return d >= finFrom && d <= finTo;
  });

  const totalRevenue = filtered.reduce((s,o) => s + (+o.total), 0);
  const orderCount   = filtered.length;
  const avgOrder     = orderCount > 0 ? totalRevenue / orderCount : 0;

  // By table
  const byTable = {};
  filtered.forEach(o => {
    const t = `Table ${o.table_number||"?"}`;
    if (!byTable[t]) byTable[t] = { total:0, orders:0 };
    byTable[t].total  += (+o.total);
    byTable[t].orders++;
  });
  const topTables = Object.entries(byTable).sort((a,b)=>b[1].total-a[1].total).slice(0,8);

  // By product
  const byProduct = {};
  filtered.forEach(o => {
    (o.items||[]).forEach(it => {
      if (!byProduct[it.name]) byProduct[it.name] = { qty:0, revenue:0 };
      byProduct[it.name].qty     += it.qty;
      byProduct[it.name].revenue += it.price * it.qty;
    });
  });
  const topProducts = Object.entries(byProduct).sort((a,b) => b[1].qty - a[1].qty).slice(0,10);

  // By payment method
  const byPay = {};
  filtered.forEach(o => {
    const m = o.payment_method || "unknown";
    if (!byPay[m]) byPay[m] = { total:0, orders:0 };
    byPay[m].total  += (+o.total);
    byPay[m].orders++;
  });

  const statCard = (label, value, sub) => (
    <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",padding:"14px 12px",flex:1,minWidth:80}}>
      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.4)",letterSpacing:2,fontWeight:700,marginBottom:6}}>{label}</div>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:24,color:"#fff",lineHeight:1}}>{value}</div>
      {sub && <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.3)",marginTop:4}}>{sub}</div>}
    </div>
  );

  const PRESETS = [["today","TODAY"],["yesterday","YESTERDAY"],["week","THIS WEEK"],["month","THIS MONTH"],["all","ALL TIME"]];

  return (
    <div style={{padding:"12px 14px 32px"}}>
      {/* Quick preset buttons */}
      <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
        {PRESETS.map(([v,l]) => (
          <button key={v} onClick={()=>applyPreset(v)} style={{
            padding:"8px 13px",
            background: preset===v ? "#fff" : "rgba(255,255,255,.05)",
            color: preset===v ? "#000" : "rgba(255,255,255,.5)",
            border: preset===v ? "none" : "1px solid rgba(255,255,255,.1)",
            fontFamily:"'Anton',sans-serif", fontSize:9, letterSpacing:2, cursor:"pointer", whiteSpace:"nowrap"
          }}>{l}</button>
        ))}
      </div>
      {/* Custom date range */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,padding:"10px 12px",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",flexWrap:"wrap"}}>
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,255,255,.3)"}}>CUSTOM</span>
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,255,255,.25)"}}>FROM</span>
        <input type="date" value={finFrom} onChange={e=>{setFinFrom(e.target.value);setPreset("custom");}}
          style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",color:"#fff",padding:"6px 8px",fontFamily:"'Outfit',sans-serif",fontSize:12,colorScheme:"dark",cursor:"pointer",flex:1,minWidth:130}} />
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,255,255,.25)"}}>TO</span>
        <input type="date" value={finTo} onChange={e=>{setFinTo(e.target.value);setPreset("custom");}}
          style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",color:"#fff",padding:"6px 8px",fontFamily:"'Outfit',sans-serif",fontSize:12,colorScheme:"dark",cursor:"pointer",flex:1,minWidth:130}} />
      </div>

      {/* Revenue stats */}
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {statCard("REVENUE", `$${totalRevenue.toFixed(2)}`)}
        {statCard("ORDERS", orderCount)}
        {statCard("AVG ORDER", `$${avgOrder.toFixed(2)}`)}
      </div>

      {/* Payment breakdown */}
      {Object.keys(byPay).length > 0 && (
        <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
          {Object.entries(byPay).map(([m,d])=>(
            <div key={m} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",padding:"12px",flex:1,minWidth:80}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.4)",letterSpacing:2,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{m}</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:20,color:"#fff"}}>${d.total.toFixed(2)}</div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.3)",marginTop:2}}>{d.orders} order{d.orders>1?"s":""}</div>
            </div>
          ))}
        </div>
      )}

      {/* Top tables */}
      <div className="admin-section-lbl" style={{marginBottom:8}}>TOP TABLES</div>
      {topTables.length === 0 && <div className="empty" style={{marginBottom:20}}>No data</div>}
      {topTables.map(([name,d],i) => (
        <div key={name} style={{display:"flex",alignItems:"center",padding:"11px 14px",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
          <span style={{fontFamily:"'Anton',sans-serif",fontSize:13,color:"rgba(255,255,255,.25)",minWidth:28}}>#{i+1}</span>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:"#fff",fontWeight:700}}>{name}</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>{d.orders} order{d.orders>1?"s":""}</div>
          </div>
          <span style={{fontFamily:"'Anton',sans-serif",fontSize:16,color:"#fff"}}>${d.total.toFixed(2)}</span>
        </div>
      ))}

      {/* Top products */}
      <div className="admin-section-lbl" style={{marginTop:24,marginBottom:8}}>TOP PRODUCTS</div>
      {topProducts.length === 0 && <div className="empty">No data</div>}
      {topProducts.map(([name,d],i) => (
        <div key={name} style={{display:"flex",alignItems:"center",padding:"11px 14px",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
          <span style={{fontFamily:"'Anton',sans-serif",fontSize:13,color:"rgba(255,255,255,.25)",minWidth:28}}>#{i+1}</span>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:"#fff",fontWeight:700}}>{name}</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>{d.qty} sold</div>
          </div>
          <span style={{fontFamily:"'Anton',sans-serif",fontSize:15,color:"rgba(255,255,255,.55)"}}>${d.revenue.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══ FLOOR PLAN ════════════════════════════════════════════════════════════ */
const FP_KEY     = 'fp-layout-v2';
const FP_BAR_KEY = 'fp-bar-v2';
const FP_BAR_DEF = { x:592, y:8, w:100, h:60 };
const FP_DEFAULT = [
  { id:1,  x:80,  y:20,  w:82, h:64, shape:"rect"  },
  { id:2,  x:186, y:20,  w:82, h:64, shape:"rect"  },
  { id:3,  x:292, y:20,  w:82, h:64, shape:"rect"  },
  { id:4,  x:8,   y:116, w:88, h:68, shape:"rect"  },
  { id:5,  x:220, y:116, w:82, h:72, shape:"rect"  },
  { id:6,  x:316, y:116, w:82, h:72, shape:"rect"  },
  { id:7,  x:490, y:116, w:82, h:68, shape:"rect"  },
  { id:8,  x:590, y:116, w:82, h:68, shape:"rect"  },
  { id:9,  x:8,   y:230, w:100,h:70, shape:"rect"  },
  { id:10, x:210, y:230, w:84, h:66, shape:"rect"  },
  { id:11, x:310, y:230, w:76, h:66, shape:"rect"  },
  { id:12, x:466, y:230, w:100,h:70, shape:"rect"  },
  { id:13, x:600, y:228, w:70, h:70, shape:"round" },
  { id:14, x:8,   y:328, w:100,h:70, shape:"rect"  },
  { id:15, x:210, y:328, w:80, h:70, shape:"rect"  },
  { id:16, x:306, y:328, w:84, h:74, shape:"rect"  },
  { id:17, x:466, y:328, w:80, h:66, shape:"rect"  },
  { id:18, x:564, y:328, w:80, h:66, shape:"rect"  },
  { id:19, x:8,   y:428, w:64, h:64, shape:"round" },
  { id:20, x:88,  y:428, w:64, h:64, shape:"round" },
  { id:21, x:230, y:430, w:74, h:66, shape:"rect"  },
  { id:22, x:318, y:430, w:74, h:66, shape:"rect"  },
  { id:23, x:406, y:430, w:74, h:66, shape:"rect"  },
  { id:24, x:530, y:428, w:64, h:64, shape:"round" },
  { id:25, x:614, y:428, w:64, h:64, shape:"round" },
  { id:26, x:318, y:520, w:64, h:64, shape:"round" },
];

function FloorPlan({ allOrders, onLoad, onUpdateStatus, onDeleteOrder }) {
  const loadSaved = () => { try { const s = localStorage.getItem(FP_KEY); return s ? JSON.parse(s) : FP_DEFAULT; } catch { return FP_DEFAULT; } };
  const [selectedTable, setSelectedTable] = useState(null);
  const [now,       setNow      ] = useState(Date.now());
  const [editMode,  setEditMode ] = useState(false);
  const [fpView,  setFpView ] = useState("live"); // "live" | "history" | "report"
  const [showFin, setShowFin] = useState(false);  // hide financials by default
  const [tables,    setTables   ] = useState(loadSaved);
  const [savedTbls, setSavedTbls] = useState(loadSaved);
  const [dragging,  setDragging ] = useState(null); // { id, ox, oy }
  const [resizing,  setResizing ] = useState(null); // { id, sx, sy, sw, sh }
  const [editSel,   setEditSel  ] = useState(null);
  const [barPos,    setBarPos   ] = useState(() => { try { const s = localStorage.getItem(FP_BAR_KEY); return s ? JSON.parse(s) : FP_BAR_DEF; } catch { return FP_BAR_DEF; } });
  const [savedBar,  setSavedBar ] = useState(() => { try { const s = localStorage.getItem(FP_BAR_KEY); return s ? JSON.parse(s) : FP_BAR_DEF; } catch { return FP_BAR_DEF; } });
  const [barDrag,   setBarDrag  ] = useState(null); // { ox, oy }
  const canvasRef = useRef(null);

  // Auto-refresh orders + clock every 10s
  useEffect(() => {
    onLoad();
    const iv = setInterval(() => { onLoad(); setNow(Date.now()); }, 10000);
    const clock = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(iv); clearInterval(clock); };
  }, []);

  // Get active (non-completed) orders grouped by table
  const activeOrders = allOrders.filter(o => o.status !== "completed" && o.status !== "delivered");
  const byTable = activeOrders.reduce((acc, o) => {
    const t = String(o.table_number);
    if (!acc[t]) acc[t] = [];
    acc[t].push(o);
    return acc;
  }, {});

  // Financial summary — today only (custom ranges live in the REPORT tab)
  const todayStr = new Date().toDateString();
  const todayOrders  = allOrders.filter(o => new Date(o.created_at).toDateString() === todayStr);
  const todayRevenue = todayOrders.reduce((s, o) => s + (+o.total || 0), 0);
  const todayCount   = todayOrders.length;

  // Table status based on oldest pending order age
  // 5 clear states based on what's actually happening at the table
  const tableStatus = (num) => {
    const orders = byTable[String(num)] || [];
    if (orders.length === 0) return "empty";
    const hasPending  = orders.some(o => o.status === "pending");
    const hasReady    = orders.some(o => o.status === "ready");
    if (hasPending) {
      const oldest = Math.min(...orders.filter(o=>o.status==="pending").map(o => new Date(o.created_at).getTime()));
      const mins = (now - oldest) / 60000;
      if (mins >= 15) return "urgent";   // red blink — nobody took the order 15+ min
      if (mins >= 10) return "warning";  // yellow — waiting 10+ min
      return "new";                      // green — fresh order just came in
    }
    if (hasReady) return "ready";        // white pulse — ready to be picked up
    return "preparing";                  // blue — confirmed, being prepared
  };

  const statusStyle = (s) => ({
    empty:     { bg:"rgba(255,255,255,.04)", border:"rgba(255,255,255,.1)",   color:"rgba(255,255,255,.25)", dot:null,      blink:false },
    new:       { bg:"rgba(34,197,94,.15)",   border:"rgba(34,197,94,.8)",     color:"#4ade80",               dot:"#4ade80", blink:false },
    preparing: { bg:"rgba(96,165,250,.12)",  border:"rgba(96,165,250,.7)",    color:"#93c5fd",               dot:"#93c5fd", blink:false },
    ready:     { bg:"rgba(255,255,255,.12)", border:"rgba(255,255,255,.9)",   color:"#fff",                  dot:"#fff",    blink:false },
    warning:   { bg:"rgba(251,191,36,.15)",  border:"rgba(251,191,36,.85)",   color:"#fbbf24",               dot:"#fbbf24", blink:false },
    urgent:    { bg:"rgba(239,68,68,.18)",   border:"rgba(239,68,68,.95)",    color:"#f87171",               dot:"#f87171", blink:true  },
  }[s] || { bg:"rgba(255,255,255,.04)", border:"rgba(255,255,255,.1)", color:"rgba(255,255,255,.25)", dot:null, blink:false });

  const nextStatus  = s => s==="pending"?"confirmed":s==="confirmed"?"ready":null;
  const nextLabel   = s => s==="pending"?"✓ CONFIRM":s==="confirmed"?"🔔 READY":s==="ready"?"✓ CLEAR":null;
  const statusColor = s => s==="pending"?"#f59e0b":s==="confirmed"?"#93c5fd":s==="ready"?"#fff":"rgba(255,255,255,.3)";
  const statusLabel = s => s==="pending"?"NEW ORDER":s==="confirmed"?"PREPARING":s==="ready"?"READY ↑":"";

  const pendingCount = activeOrders.filter(o=>o.status==="pending").length;
  const urgentTables = tables.filter(t => tableStatus(t.id)==="urgent");

  // ── Drag / Resize ──────────────────────────────────────────────────────────
  const getPos = e => e.touches ? { x:e.touches[0].clientX, y:e.touches[0].clientY } : { x:e.clientX, y:e.clientY };

  const startDrag = (e, id) => {
    if (!editMode) return;
    e.stopPropagation(); e.preventDefault();
    const pos = getPos(e);
    const rect = canvasRef.current.getBoundingClientRect();
    const t = tables.find(t => t.id === id);
    setDragging({ id, ox: pos.x - rect.left - t.x, oy: pos.y - rect.top - t.y });
    setEditSel(id);
  };

  const startResize = (e, id) => {
    e.stopPropagation(); e.preventDefault();
    const pos = getPos(e);
    const t = tables.find(t => t.id === id);
    setResizing({ id, sx: pos.x, sy: pos.y, sw: t.w, sh: t.h });
  };

  const onMove = (e) => {
    if (!dragging && !resizing && !barDrag) return;
    const pos = getPos(e);
    if (dragging) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width - 30, pos.x - rect.left - dragging.ox));
      const y = Math.max(0, pos.y - rect.top - dragging.oy);
      setTables(ts => ts.map(t => t.id === dragging.id ? { ...t, x, y } : t));
    }
    if (resizing) {
      const dx = pos.x - resizing.sx;
      const dy = pos.y - resizing.sy;
      setTables(ts => ts.map(t => t.id === resizing.id ? {
        ...t,
        w: Math.max(50, resizing.sw + dx),
        h: t.shape === "round" ? Math.max(50, resizing.sw + dx) : Math.max(40, resizing.sh + dy),
      } : t));
    }
    if (barDrag) {
      const rect = canvasRef.current.getBoundingClientRect();
      setBarPos(b => ({
        ...b,
        x: Math.max(0, Math.min(rect.width - b.w, pos.x - rect.left - barDrag.ox)),
        y: Math.max(0, pos.y - rect.top - barDrag.oy),
      }));
    }
  };

  const onEnd = () => { setDragging(null); setResizing(null); setBarDrag(null); };

  // ── Edit actions ───────────────────────────────────────────────────────────
  const addTable = () => {
    const maxId = tables.length > 0 ? Math.max(...tables.map(t => t.id)) : 0;
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? Math.max(10, (rect.width / 2) - 36) : 200;
    const newT = { id: maxId + 1, x: cx, y: 80, w: 72, h: 56, shape: "rect" };
    setTables(ts => [...ts, newT]);
    setEditSel(maxId + 1);
  };

  const deleteTable = (id) => {
    setTables(ts => ts.filter(t => t.id !== id));
    if (editSel === id) setEditSel(null);
  };

  const toggleShape = (id) => {
    setTables(ts => ts.map(t => t.id === id
      ? { ...t, shape: t.shape === "rect" ? "round" : "rect" }
      : t
    ));
  };

  const saveLayout = () => {
    localStorage.setItem(FP_KEY, JSON.stringify(tables));
    localStorage.setItem(FP_BAR_KEY, JSON.stringify(barPos));
    setSavedTbls(tables); setSavedBar(barPos);
    setEditMode(false); setEditSel(null);
  };

  const cancelEdit = () => {
    setTables(savedTbls); setBarPos(savedBar);
    setEditMode(false); setEditSel(null);
  };

  const resetLayout = () => { setTables(FP_DEFAULT); setBarPos(FP_BAR_DEF); setEditSel(null); };

  // ── Canvas height ──────────────────────────────────────────────────────────
  const canvasH = Math.max(620, ...tables.map(t => t.y + t.h + 80));

  // ── Table element ──────────────────────────────────────────────────────────
  const TableEl = ({ tbl }) => {
    const s  = editMode ? "empty" : tableStatus(tbl.id);
    const st = statusStyle(s);
    const orders = editMode ? [] : (byTable[String(tbl.id)] || []);
    const pCount = orders.filter(o => o.status === "pending").length;
    const pendingOrds = orders.filter(o => o.status === "pending");
    const elapsedMins = pendingOrds.length > 0
      ? Math.floor((now - Math.min(...pendingOrds.map(o => new Date(o.created_at).getTime()))) / 60000)
      : null;
    const firstInitial = orders.length > 0 ? (orders[0].user_name || "?").charAt(0).toUpperCase() : null;
    const isSel = editSel === tbl.id;
    const isDraggingThis = dragging?.id === tbl.id;

    return (
      <div
        className={!editMode && st.blink ? "fp-blink" : ""}
        style={{
          position:"absolute", left:tbl.x, top:tbl.y, width:tbl.w, height:tbl.h,
          background: editMode ? (isSel ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.04)") : st.bg,
          border: editMode
            ? `2px ${isSel?"solid":"dashed"} rgba(255,255,255,${isSel?".65":".2"})`
            : `2px solid ${st.border}`,
          borderRadius: tbl.shape === "round" ? "50%" : 6,
          cursor: editMode ? (isDraggingThis ? "grabbing" : "grab") : (s!=="empty"?"pointer":"default"),
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          transition: isDraggingThis ? "none" : "background .2s, border .2s, box-shadow .2s",
          boxShadow: editMode
            ? (isSel ? "0 0 0 3px rgba(255,255,255,.2), 0 8px 24px rgba(0,0,0,.6)" : "0 2px 10px rgba(0,0,0,.4)")
            : (st.blink ? "0 0 18px rgba(239,68,68,.55)" : s==="ready" ? "0 0 14px rgba(255,255,255,.25)" : s==="new" ? "0 0 12px rgba(34,197,94,.3)" : "none"),
          userSelect:"none", touchAction:"none",
          zIndex: isSel ? 20 : isDraggingThis ? 15 : 1,
        }}
        onMouseDown={e => editMode ? startDrag(e, tbl.id) : (s!=="empty" && setSelectedTable(String(tbl.id)))}
        onTouchStart={e => editMode ? startDrag(e, tbl.id) : (s!=="empty" && setSelectedTable(String(tbl.id)))}
        onClick={e => editMode && (e.stopPropagation(), setEditSel(tbl.id))}
      >
        {/* Number */}
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:tbl.w>65?20:15,color:editMode?"rgba(255,255,255,.7)":st.color,letterSpacing:.5,lineHeight:1}}>{tbl.id}</span>

        {/* Elapsed */}
        {!editMode && elapsedMins !== null && (
          <span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:st.color,opacity:.85,letterSpacing:.5,lineHeight:1,marginTop:2,fontWeight:700}}>
            {elapsedMins < 1 ? "<1m" : `${elapsedMins}m`}
          </span>
        )}

        {/* Status dots */}
        {!editMode && orders.length > 0 && (
          <div style={{display:"flex",gap:3,marginTop:4,flexWrap:"wrap",justifyContent:"center",maxWidth:tbl.w-12}}>
            {orders.map((o,i) => (
              <div key={i} style={{width:7,height:7,borderRadius:"50%",background:statusColor(o.status),boxShadow:o.status==="pending"?`0 0 4px ${statusColor(o.status)}`:"none"}}/>
            ))}
          </div>
        )}

        {/* Pending badge */}
        {!editMode && pCount > 0 && (
          <div style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:"#f59e0b",color:"#000",fontFamily:"'Anton',sans-serif",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 8px rgba(245,158,11,.7)"}}>{pCount}</div>
        )}

        {/* Customer initial */}
        {!editMode && firstInitial && s!=="empty" && (
          <div style={{position:"absolute",bottom:-5,left:-5,width:16,height:16,borderRadius:"50%",background:"rgba(255,255,255,.18)",border:"1px solid rgba(255,255,255,.35)",fontFamily:"'Anton',sans-serif",fontSize:8,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>{firstInitial}</div>
        )}

        {/* EDIT: shape toggle (top-left) */}
        {editMode && (
          <div onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();toggleShape(tbl.id);}}
            style={{position:"absolute",top:-9,left:-9,width:18,height:18,borderRadius:"50%",background:"rgba(96,165,250,.25)",border:"1px solid rgba(96,165,250,.7)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:9,color:"#93c5fd",fontFamily:"'Anton',sans-serif",zIndex:30}}
            title="Toggle shape">
            {tbl.shape==="round"?"□":"○"}
          </div>
        )}

        {/* EDIT: delete (top-right) */}
        {editMode && (
          <div onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();deleteTable(tbl.id);}}
            style={{position:"absolute",top:-9,right:-9,width:18,height:18,borderRadius:"50%",background:"rgba(239,68,68,.25)",border:"1px solid rgba(239,68,68,.7)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:13,color:"#f87171",lineHeight:1,zIndex:30}}>
            ×
          </div>
        )}

        {/* EDIT: resize handle (bottom-right) */}
        {editMode && (
          <div onMouseDown={e=>startResize(e,tbl.id)} onTouchStart={e=>startResize(e,tbl.id)}
            style={{position:"absolute",bottom:-1,right:-1,width:13,height:13,background:"rgba(255,255,255,.55)",cursor:"se-resize",borderRadius:tbl.shape==="round"?"50%":"0 0 4px 0",zIndex:30,border:"1px solid rgba(255,255,255,.9)"}}
          />
        )}
      </div>
    );
  };

  // ── TABLE DETAIL PANEL — redesigned ──────────────────────────────────────
  const TableDetail = () => {
    const orders = (byTable[selectedTable]||[]);
    return (
      <div className="modal-overlay" onClick={()=>setSelectedTable(null)}>
        <div style={{
          background:"#111", border:"1px solid rgba(255,255,255,.15)",
          width:"92%", maxWidth:480, maxHeight:"80vh",
          display:"flex", flexDirection:"column", borderRadius:4,
          overflow:"hidden",
        }} onClick={e=>e.stopPropagation()}>

          {/* Header */}
          <div style={{padding:"18px 20px",borderBottom:"1px solid rgba(255,255,255,.1)",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,.04)"}}>
            <div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:28,color:"#fff",letterSpacing:2,lineHeight:1}}>TABLE {selectedTable}</div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.4)",marginTop:4,fontWeight:600}}>
                {orders.length} active order{orders.length!==1?"s":""}
              </div>
            </div>
            <button onClick={(e)=>{ e.stopPropagation(); setSelectedTable(null); }}
              style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"#fff",width:36,height:36,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>
              ✕
            </button>
          </div>

          {/* Orders */}
          <div style={{overflowY:"auto",flex:1,padding:"12px 16px",display:"flex",flexDirection:"column",gap:12}}>
            {orders.length === 0 && (
              <div style={{textAlign:"center",padding:"40px 0",fontFamily:"'Outfit',sans-serif",fontSize:14,color:"rgba(255,255,255,.3)"}}>No active orders</div>
            )}
            {orders.map(ord => (
              <div key={ord.id} style={{border:`1px solid ${statusColor(ord.status)}44`,borderRadius:4,overflow:"hidden"}}>

                {/* Order status bar */}
                <div style={{padding:"10px 14px",background:`${statusColor(ord.status)}18`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:statusColor(ord.status),boxShadow:`0 0 6px ${statusColor(ord.status)}`}}/>
                    <span style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2.5,color:statusColor(ord.status)}}>{statusLabel(ord.status)}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {ord.order_number && <span className="order-id-chip">#{ord.order_number}</span>}
                    <span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:600}}>
                      {new Date(ord.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                    </span>
                  </div>
                </div>

                {/* Customer + items */}
                <div style={{padding:"12px 14px"}}>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.45)",fontWeight:600,marginBottom:10}}>{ord.user_name}</div>
                  {ord.items.map((it,i) => (
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontFamily:"'Anton',sans-serif",fontSize:18,color:"rgba(255,255,255,.5)",minWidth:28}}>{it.qty}×</span>
                        <span style={{fontFamily:"'Outfit',sans-serif",fontSize:15,color:"#fff",fontWeight:700}}>{it.name}</span>
                      </div>
                      <span style={{fontFamily:"'Anton',sans-serif",fontSize:14,color:"rgba(255,255,255,.5)"}}>${(it.price*it.qty).toFixed(2)}</span>
                    </div>
                  ))}
                  {/* Total + action */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,paddingTop:10,borderTop:"1px solid rgba(255,255,255,.08)"}}>
                    <span style={{fontFamily:"'Anton',sans-serif",fontSize:20,color:"#fff"}}>
                      ${(+ord.total).toFixed(2)}
                    </span>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      {(nextStatus(ord.status) || ord.status === "ready") && (
                        <button
                          style={{padding:"12px 20px",background:"#fff",color:"#000",border:"none",cursor:"pointer",fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2,transition:"opacity .15s"}}
                          onClick={()=>{
                            if (ord.status === "ready") {
                              onDeleteOrder(ord.id); onLoad();
                            } else {
                              if (ord.status === "pending") printReceipt({...ord, table_number: selectedTable});
                              onUpdateStatus(ord.id, nextStatus(ord.status)); onLoad();
                            }
                          }}>
                          {nextLabel(ord.status)}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{background:"#0a0a0a",minHeight:"70vh"}}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{background:"#000",borderBottom:"1px solid rgba(255,255,255,.08)",padding:"16px 18px 14px"}}>

        {/* Row 1: title + view toggle */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontFamily:"'Anton',sans-serif",fontSize:22,color:"#fff",letterSpacing:3,lineHeight:1}}>FLOOR PLAN</span>
            {fpView === "live" && (editMode ? (
              <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,color:"#fbbf24",background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.35)",padding:"3px 9px"}}>EDIT MODE</span>
            ) : (
              <button onClick={()=>{setEditMode(true);setSelectedTable(null);setFpView("live");}} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.14)",color:"rgba(255,255,255,.55)",padding:"5px 11px",fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,cursor:"pointer",transition:"all .15s"}}>✏ EDIT</button>
            ))}
          </div>
          {/* View toggle pill */}
          <div style={{display:"flex",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:2,overflow:"hidden"}}>
            {[{id:"live",label:"⬛ LIVE"},{id:"history",label:"📋 HISTORY"},{id:"report",label:"📊 REPORT"}].map(v=>(
              <button key={v.id} onClick={()=>{setFpView(v.id);if(v.id!=="live"){setEditMode(false);}}}
                style={{padding:"8px 14px",background:fpView===v.id?"#fff":"transparent",color:fpView===v.id?"#000":"rgba(255,255,255,.45)",border:"none",fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,cursor:"pointer",transition:"all .18s",whiteSpace:"nowrap"}}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: order stats + financial bar — only in LIVE mode */}
        {fpView === "live" && (<>
          <div style={{display:"flex",alignItems:"stretch",gap:0,marginBottom:14,borderTop:"1px solid rgba(255,255,255,.07)",borderBottom:"1px solid rgba(255,255,255,.07)",padding:"14px 0"}}>
            {/* Order status counters */}
            {[{val:urgentTables.length,color:"#f87171",lbl:"URGENT",glow:"rgba(248,113,113,.25)"},{val:pendingCount,color:"#fbbf24",lbl:"PENDING",glow:"rgba(251,191,36,.2)"},{val:activeOrders.length,color:"#4ade80",lbl:"ACTIVE",glow:"rgba(74,222,128,.18)"}].map(({val,color,lbl,glow},i,a)=>(
              <React.Fragment key={lbl}>
                <div style={{textAlign:"center",flex:1,padding:"0 10px"}}>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:42,color,lineHeight:1,textShadow:val>0?`0 0 18px ${glow},0 0 40px ${glow}`:"none",transition:"text-shadow .3s"}}>{val}</div>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2.5,color:"rgba(255,255,255,.4)",marginTop:5}}>{lbl}</div>
                </div>
                {i<a.length-1 && <div style={{width:1,background:"rgba(255,255,255,.08)",alignSelf:"stretch"}}/>}
              </React.Fragment>
            ))}
            {/* Divider before financials */}
            <div style={{width:1,background:"rgba(255,255,255,.08)",alignSelf:"stretch",margin:"0 4px"}}/>
            {/* Revenue */}
            <div style={{textAlign:"center",flex:1,padding:"0 10px",position:"relative"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:42,color:"rgba(255,255,255,.9)",lineHeight:1,filter:showFin?"none":"blur(10px)",userSelect:showFin?"auto":"none",transition:"filter .25s"}}>
                ${todayRevenue.toFixed(0)}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,marginTop:5}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2.5,color:"rgba(255,255,255,.4)"}}>TODAY REV</div>
                <button onClick={()=>setShowFin(v=>!v)} title={showFin?"Hide":"Show"} style={{background:"none",border:"none",cursor:"pointer",padding:"2px 3px",lineHeight:1,opacity:.5,transition:"opacity .15s",fontSize:11}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.5}>
                  {showFin ? "👁" : "🙈"}
                </button>
              </div>
            </div>
            <div style={{width:1,background:"rgba(255,255,255,.08)",alignSelf:"stretch"}}/>
            {/* Orders */}
            <div style={{textAlign:"center",flex:1,padding:"0 10px"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:42,color:"rgba(255,255,255,.9)",lineHeight:1,filter:showFin?"none":"blur(10px)",userSelect:showFin?"auto":"none",transition:"filter .25s"}}>
                {todayCount}
              </div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2.5,color:"rgba(255,255,255,.4)",marginTop:5}}>ORDERS</div>
            </div>
          </div>

          {/* Row 3: color legend */}
          <div style={{display:"flex",gap:18,flexWrap:"wrap"}}>
            {[{color:"#4ade80",label:"NEW ORDER"},{color:"#93c5fd",label:"PREPARING"},{color:"#fff",label:"READY"},{color:"#fbbf24",label:"WAITING 10m+"},{color:"#f87171",label:"URGENT 15m+"}].map(({color,label})=>(
              <div key={label} style={{display:"flex",alignItems:"center",gap:7}}>
                <div style={{width:9,height:9,borderRadius:"50%",background:color,boxShadow:`0 0 7px ${color}99`,flexShrink:0}}/>
                <span style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:1,color:"rgba(255,255,255,.55)"}}>{label}</span>
              </div>
            ))}
          </div>
        </>)}
      </div>

      {/* ── LIVE VIEW ───────────────────────────────────────────────────────── */}
      {fpView === "live" && (<>
        {/* Edit toolbar */}
        {editMode && (
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"rgba(251,191,36,.05)",borderBottom:"1px solid rgba(251,191,36,.18)",flexWrap:"wrap"}}>
            <button onClick={addTable} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.2)",color:"#fff",padding:"8px 14px",fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,cursor:"pointer"}}>+ ADD TABLE</button>
            <button onClick={resetLayout} style={{background:"transparent",border:"1px solid rgba(255,255,255,.12)",color:"rgba(255,255,255,.45)",padding:"8px 14px",fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,cursor:"pointer"}}>↺ RESET</button>
            <div style={{flex:1,fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.35)",fontWeight:600}}>Drag · □/○ shape · × delete · ⊿ resize</div>
            <button onClick={cancelEdit} style={{background:"transparent",border:"1px solid rgba(255,255,255,.18)",color:"rgba(255,255,255,.55)",padding:"8px 16px",fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,cursor:"pointer"}}>CANCEL</button>
            <button onClick={saveLayout} style={{background:"#fff",border:"none",color:"#000",padding:"8px 20px",fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,cursor:"pointer"}}>✓ SAVE</button>
          </div>
        )}
        {/* Canvas */}
        <div style={{overflowX:"auto",overflowY:"visible",WebkitOverflowScrolling:"touch"}}>
          <div
            ref={canvasRef}
            style={{
              position:"relative", width:700, minWidth:700, height:canvasH,
              background: editMode
                ? "repeating-linear-gradient(rgba(255,255,255,.025) 0,rgba(255,255,255,.025) 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0,rgba(255,255,255,.025) 1px,transparent 1px,transparent 40px),#0a0a0a"
                : "#0a0a0a",
              transition:"background .3s",
            }}
            onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
            onTouchMove={onMove} onTouchEnd={onEnd}
            onClick={()=>{ if(editMode) setEditSel(null); }}
          >
            {/* BAR — dark wood, no text/emoji */}
            <div
              style={{
                position:"absolute", left:barPos.x, top:barPos.y, width:barPos.w, height:barPos.h,
                background:"linear-gradient(135deg, #3b2010 0%, #5c3317 40%, #3b2010 100%)",
                border: editMode ? `2px dashed rgba(255,255,255,.5)` : "2px solid #6b3a1f",
                borderRadius:6,
                cursor: editMode ? (barDrag ? "grabbing" : "grab") : "default",
                userSelect:"none", touchAction:"none",
                boxShadow: editMode ? "0 2px 12px rgba(0,0,0,.6)" : "inset 0 1px 0 rgba(255,255,255,.08), 0 2px 8px rgba(0,0,0,.5)",
                transition: barDrag ? "none" : "border .2s",
                zIndex: barDrag ? 20 : 2,
                /* Wood grain effect via repeating gradient */
                backgroundImage:"repeating-linear-gradient(92deg, transparent, transparent 8px, rgba(0,0,0,.08) 8px, rgba(0,0,0,.08) 9px), linear-gradient(135deg, #3b2010 0%, #6b3a1f 45%, #3b2010 100%)",
              }}
              onMouseDown={e => { if (!editMode) return; e.stopPropagation(); const pos = getPos(e); const rect = canvasRef.current.getBoundingClientRect(); setBarDrag({ ox: pos.x - rect.left - barPos.x, oy: pos.y - rect.top - barPos.y }); }}
              onTouchStart={e => { if (!editMode) return; e.stopPropagation(); const pos = getPos(e); const rect = canvasRef.current.getBoundingClientRect(); setBarDrag({ ox: pos.x - rect.left - barPos.x, oy: pos.y - rect.top - barPos.y }); }}
            >
              {/* Resize handle in edit mode */}
              {editMode && (
                <div
                  onMouseDown={e => { e.stopPropagation(); const startX = e.clientX; const startY = e.clientY; const startW = barPos.w; const startH = barPos.h;
                    const onMove = e => setBarPos(b => ({ ...b, w: Math.max(40, startW + e.clientX - startX), h: Math.max(30, startH + e.clientY - startY) }));
                    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp); }}
                  style={{position:"absolute",bottom:-1,right:-1,width:14,height:14,background:"rgba(255,255,255,.6)",cursor:"se-resize",borderRadius:"0 0 4px 0",zIndex:30,border:"1px solid rgba(255,255,255,.9)"}}
                />
              )}
            </div>
            {/* Stairs */}
            <div style={{position:"absolute",left:0,right:0,top:207,height:16,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
              <div style={{flex:1,height:1,background:"rgba(255,255,255,.07)"}}/>
              <span style={{padding:"0 14px",fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:5,color:"rgba(255,255,255,.2)",whiteSpace:"nowrap"}}>▼  STAIRS  ▼</span>
              <div style={{flex:1,height:1,background:"rgba(255,255,255,.07)"}}/>
            </div>
            {/* Tables */}
            {tables.map(t => <TableEl key={t.id} tbl={t} />)}
          </div>
        </div>
        {/* Table detail panel */}
        {selectedTable && !editMode && <TableDetail />}
      </>)}

      {/* ── HISTORY VIEW ────────────────────────────────────────────────────── */}
      {fpView === "history" && <AdminHistory allOrders={allOrders} />}

      {/* ── REPORT VIEW ─────────────────────────────────────────────────────── */}
      {fpView === "report" && <AdminReport allOrders={allOrders} />}
    </div>
  );
}

const CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
  ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:2px}

  /* ── NOTIFICATIONS ── */
  .notification{position:fixed;bottom:80px;right:20px;display:flex;align-items:center;gap:12px;padding:14px 20px;z-index:9999;pointer-events:none;animation:notifSlideIn .4s cubic-bezier(.16,1,.3,1) both;max-width:320px;border-left:3px solid}
  .notif-ok{background:rgba(10,10,10,.96);border-color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.08)}
  .notif-err{background:rgba(10,10,10,.96);border-color:rgba(255,255,255,.4);box-shadow:0 8px 32px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.08)}
  .notif-dot{font-family:'Anton',sans-serif;font-size:14px;flex-shrink:0;line-height:1}
  .notif-ok .notif-dot{color:#fff}
  .notif-err .notif-dot{color:rgba(255,255,255,.6)}
  .notif-msg{font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;color:#fff;letter-spacing:.2px;line-height:1.4}
  @keyframes notifSlideIn{from{opacity:0;transform:translateX(110%)}to{opacity:1;transform:translateX(0)}}

  /* ── AUTH ── */
  .auth-root{min-height:100vh;display:flex;align-items:center;justify-content:center;background:transparent;padding:48px 20px 80px;position:relative;overflow:hidden}
  .auth-grid-bg{position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.012) 1px,transparent 1px);background-size:40px 40px;z-index:1}
  .auth-wrap{display:flex;flex-direction:column;align-items:center;width:100%;max-width:440px;position:relative;z-index:2}
  .auth-hero{display:flex;flex-direction:column;align-items:center;margin-bottom:44px;animation:fadeUp .7s cubic-bezier(.16,1,.3,1) both}
  .auth-event{display:flex;align-items:center;gap:16px;margin-top:24px}
  .auth-event-rule{flex-shrink:0;height:1px;width:44px;background:rgba(255,255,255,.25)}
  .auth-event-text{font-family:'Anton',sans-serif;font-size:13px;letter-spacing:5px;color:rgba(255,255,255,.7);white-space:nowrap}
  .auth-panel{width:100%;background:rgba(10,10,10,0.72);border:1px solid rgba(255,255,255,.15);border-radius:20px;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);box-shadow:0 24px 80px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.04) inset,0 1px 0 rgba(255,255,255,.1) inset;overflow:hidden;animation:fadeUp .7s cubic-bezier(.16,1,.3,1) .12s both}
  .auth-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.08)}
  .auth-tab{flex:1;padding:20px 0;background:transparent;border:none;font-family:'Anton',sans-serif;font-size:10.5px;letter-spacing:3px;color:rgba(255,255,255,.32);cursor:pointer;transition:all .25s;position:relative}
  .atab-on{color:#fff;background:rgba(255,255,255,.05)}
  .atab-on::after{content:'';position:absolute;bottom:0;left:20%;right:20%;height:2px;background:#fff;border-radius:2px 2px 0 0}
  .auth-form{padding:32px 28px 28px;display:flex;flex-direction:column;gap:0}
  .ffield{margin-bottom:18px}
  .ffield-lbl{display:block;font-family:'Anton',sans-serif;font-size:9px;letter-spacing:3px;color:rgba(255,255,255,.45);margin-bottom:8px}
  .ffield-inp{width:100%;padding:15px 16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;font-family:'Outfit',sans-serif;font-size:16px;font-weight:500;transition:all .2s;outline:none;border-radius:10px}
  .ffield-inp::placeholder{color:rgba(255,255,255,.25)}
  .ffield-inp:focus{border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.09);box-shadow:0 0 0 3px rgba(255,255,255,.06)}
  .auth-err{display:flex;align-items:center;gap:10px;padding:10px 14px;font-family:'Outfit',sans-serif;font-size:12px;color:#fca5a5;margin-bottom:18px;background:rgba(239,68,68,.08);border-left:2px solid #ef4444;border-radius:6px}
  .auth-err-dot{font-family:'Anton',sans-serif;font-size:15px;color:#ef4444}
  .auth-cta{width:100%;padding:18px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:11.5px;letter-spacing:5px;transition:all .15s;margin-bottom:22px;margin-top:6px;border-radius:10px}
  .auth-cta:hover{opacity:.88;transform:translateY(-1px)}
  .auth-footer-text{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.45);text-align:center}
  .auth-footer-link{color:rgba(255,255,255,.8);font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:3px}

  /* ── SHELL ── */
  .shell{display:flex;flex-direction:column;height:100vh;background:#000;max-width:100%;margin:0 auto;position:relative}
  .hdr{display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 20px;background:#000;border-bottom:1px solid rgba(255,255,255,.07);position:sticky;top:0;z-index:200;flex-shrink:0}
  .hdr-inner{display:flex;align-items:center;justify-content:space-between;width:100%;max-width:900px;margin:0 auto}
  .hdr-l{display:flex;align-items:center;gap:12px}
  .hdr-r{display:flex;align-items:center;gap:10px}
  .hdr-text{display:flex;flex-direction:column;gap:2px}
  .hdr-brand{font-family:'Anton',sans-serif;font-size:16px;letter-spacing:3px;color:#fff;line-height:1}
  .hdr-caption{font-family:'Anton',sans-serif;font-size:6.5px;letter-spacing:3px;color:rgba(255,255,255,.22)}
  .hdr-badge{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);padding:5px 12px}
  .hdr-badge-pts{font-family:'Anton',sans-serif;font-size:22px;color:#fff;line-height:1}
  .hdr-badge-meta{display:flex;flex-direction:column;gap:1px}
  .hdr-badge-label{font-family:'Anton',sans-serif;font-size:6.5px;letter-spacing:2px;color:rgba(255,255,255,.3)}
  .hdr-badge-rank{font-family:'Anton',sans-serif;font-size:9px;letter-spacing:1px;color:rgba(255,255,255,.55)}
  .admin-badge{font-family:'Anton',sans-serif;font-size:8.5px;letter-spacing:3px;border:1px solid rgba(255,255,255,.15);padding:6px 12px;color:rgba(255,255,255,.55)}
  .hdr-out{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.28);cursor:pointer;transition:all .15s;background:transparent}
  .lang-toggle{padding:5px 10px;background:transparent;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.6);cursor:pointer;font-family:'Anton',sans-serif;font-size:9px;letter-spacing:1.5px;transition:all .15s}
  .lang-toggle:hover{background:rgba(255,255,255,.08);color:#fff}
  .hdr-out:hover{border-color:rgba(255,255,255,.4);color:#fff}
  .body{flex:1;overflow-y:auto;padding-bottom:64px}
  .body-inner{max-width:900px;margin:0 auto}
  .bot-nav{display:flex;justify-content:center;position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,.97);backdrop-filter:blur(12px);border-top:1px solid rgba(255,255,255,.07);height:60px;z-index:200}
  .bot-nav-inner{display:flex;width:100%;max-width:900px}
  .bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:transparent;border:none;color:rgba(255,255,255,.18);cursor:pointer;transition:color .2s;position:relative;padding:0}
  .bnav-on{color:#fff}
  .bnav-indicator{position:absolute;top:0;left:20%;right:20%;height:1.5px;background:#fff;border-radius:0 0 2px 2px}
  .bnav-ico{display:flex;align-items:center;justify-content:center}
  .bnav-lbl{font-family:'Anton',sans-serif;font-size:6px;letter-spacing:2px;text-transform:uppercase}

  /* ── SECTION BANNER ── */
  .section-banner{padding:22px 16px 16px;border-bottom:1px solid rgba(255,255,255,.07)}
  .section-banner-dim{background:rgba(255,255,255,.015)}
  .section-banner-title{font-family:'Anton',sans-serif;font-size:32px;letter-spacing:2px;color:#fff;display:block;line-height:1;text-transform:uppercase}
  .section-banner-sub{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.6);margin-top:5px;display:block}
  .card-stack{display:flex;flex-direction:column}
  .empty{text-align:center;color:rgba(255,255,255,.14);padding:56px 0;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:4px;text-transform:uppercase}

  /* ── DATE FILTER BAR ── */
  .date-filter-bar{display:flex;gap:8px;padding:12px 14px;overflow-x:auto;border-bottom:1px solid rgba(255,255,255,.07);scrollbar-width:none}
  .date-filter-bar::-webkit-scrollbar{display:none}
  .date-chip{flex-shrink:0;padding:7px 14px;background:transparent;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.35);font-family:'Anton',sans-serif;font-size:9px;letter-spacing:2px;cursor:pointer;transition:all .15s;white-space:nowrap}
  .date-chip:hover{border-color:rgba(255,255,255,.35);color:rgba(255,255,255,.7)}
  .date-chip-on{background:#fff!important;color:#000!important;border-color:#fff!important}

  /* ── MATCH CARD ── */
  .mcard{background:#000;border-bottom:1px solid rgba(255,255,255,.055);overflow:hidden;transition:background .15s}
  .mcard:hover{background:#060606}
  .mcard-skeleton{height:140px;background:linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.04) 75%);background-size:200% 100%;animation:shimmer 1.6s infinite;border-bottom:1px solid rgba(255,255,255,.055)}
  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  .mcard-ok{background:rgba(34,197,94,.04)!important}
  .mcard-partial{background:rgba(245,158,11,.04)!important}
  .mcard-ng{background:rgba(239,68,68,.03)!important}
  .mcard-topstrip{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:10px 14px 0;gap:6px}
  .mcard-group-pill{font-family:'Anton',sans-serif;font-size:12px;letter-spacing:3px;color:rgba(255,255,255,.8);text-transform:uppercase;justify-self:start}
  .mcard-dt{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.7);font-weight:500;text-align:center;justify-self:center}
  .lock-chip{font-family:'Anton',sans-serif;font-size:7px;letter-spacing:2px;color:rgba(251,191,36,.7);border:1px solid rgba(251,191,36,.2);padding:2px 8px}
  .mcard-scoreboard{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:16px 14px 14px;gap:10px}
  .mteam-col{display:flex;flex-direction:column;align-items:center;gap:8px}
  .mteam-col-r{align-items:center}
  .mteam-flag-lg{font-size:36px;line-height:1}
  .mteam-name-lg{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2px;color:#fff;text-align:center;text-transform:uppercase}
  .mcard-center{display:flex;align-items:center;justify-content:center;min-width:96px}
  .score-board{display:flex;flex-direction:column;align-items:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);padding:12px 16px;gap:6px;min-width:90px}
  .score-board-pick{border-color:rgba(34,197,94,.25);background:rgba(34,197,94,.03)}
  .score-row{display:flex;align-items:center;gap:6px}
  .score-digit{font-family:'Anton',sans-serif;font-size:36px;color:#fff;line-height:1;letter-spacing:1px}
  .score-digit-sm{font-size:28px}
  .score-colon{font-family:'Anton',sans-serif;font-size:28px;color:rgba(255,255,255,.25);line-height:1;margin-bottom:2px}
  .score-sep{display:none}
  .score-label{font-family:'Anton',sans-serif;font-size:6.5px;letter-spacing:3px;color:rgba(255,255,255,.25)}
  .score-label-green{color:rgba(34,197,94,.6)}
  .score-inputs-row{display:flex;align-items:center;gap:8px}
  .sinput{width:52px;height:60px;text-align:center;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.2);color:#fff;font-family:'Anton',sans-serif;font-size:30px;outline:none;transition:all .2s}
  .sinput:focus{border-color:rgba(255,255,255,.7);background:rgba(255,255,255,.12)}
  .sinput::placeholder{color:rgba(255,255,255,.25)}
  .ssep{font-family:'Anton',sans-serif;font-size:22px;color:rgba(255,255,255,.2)}
  .mcard-foot{padding:0 14px 14px}
  .pred-cta{width:100%;padding:14px;background:transparent;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.35);cursor:pointer;font-family:'Anton',sans-serif;font-size:9.5px;letter-spacing:3px;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px}
  .pred-cta:hover:not(:disabled){border-color:#fff;color:#fff;background:rgba(255,255,255,.03)}
  .pred-cta:disabled{opacity:.15;cursor:not-allowed}
  .pred-cta-done{border-color:rgba(34,197,94,.4)!important;color:rgba(34,197,94,.8)!important}
  .mverdict{display:flex;align-items:center;gap:8px;padding:9px 14px;border-top:1px solid rgba(255,255,255,.04);font-family:'Outfit',sans-serif;font-size:11px;font-weight:600}
  .mv-ok{color:#86efac}.mv-partial{color:#fbbf24}.mv-ng{color:rgba(255,255,255,.2)}.mv-missed{color:rgba(255,255,255,.22)}.mv-locked{color:rgba(34,197,94,.7);display:flex;align-items:center;gap:8px;padding:9px 14px;border-top:1px solid rgba(255,255,255,.04);font-family:'Outfit',sans-serif;font-size:11px;font-weight:600}

  /* ── LEADERBOARD ── */
  /* ── LEADERBOARD REDESIGN ── */
  .lb-root{display:flex;flex-direction:column;min-height:60vh}
  .lb-title-bar{display:flex;align-items:center;justify-content:center;padding:28px 16px 22px;border-bottom:1px solid rgba(255,255,255,.08)}
  .lb-title{font-family:'Anton',sans-serif;font-size:42px;letter-spacing:4px;color:#fff;line-height:1;text-transform:uppercase;text-align:center}
  .lb-podium{display:flex;align-items:flex-end;justify-content:center;gap:0;padding:32px 12px 0;background:linear-gradient(to bottom,rgba(255,255,255,.015) 0%,transparent 100%);border-bottom:1px solid rgba(255,255,255,.08)}
  .lb-pod{display:flex;flex-direction:column;align-items:center;flex:1;max-width:200px;position:relative}
  .lb-pod-crown{font-size:clamp(20px,4vw,30px);margin-bottom:4px;animation:crownBounce 2s ease-in-out infinite}
  .lb-pod-medal{font-size:clamp(24px,5vw,36px);margin-bottom:8px;line-height:1}
  .lb-pod-medal-1{font-size:clamp(30px,6vw,44px)}
  .lb-pod-name{font-family:'Anton',sans-serif;font-size:clamp(11px,2.2vw,15px);letter-spacing:1px;color:#fff;text-transform:uppercase;text-align:center;word-break:break-word;line-height:1.2;margin-bottom:6px;padding:0 4px}
  .lb-pod-name-1{font-size:clamp(14px,2.8vw,20px)}
  .lb-pod-pts{font-family:'Anton',sans-serif;font-size:clamp(26px,5vw,42px);color:#fff;line-height:1;text-align:center;margin-bottom:12px}
  .lb-pod-pts-1{font-size:clamp(34px,6.5vw,56px)}
  .lb-pod-pts-u{font-family:'Anton',sans-serif;font-size:clamp(7px,1.2vw,11px);letter-spacing:2px;color:rgba(255,255,255,.4);margin-left:3px}
  .lb-pod-you{font-family:'Anton',sans-serif;font-size:7px;letter-spacing:2px;background:#fff;color:#000;padding:2px 8px;margin-bottom:8px}
  .lb-pod-plinth{width:100%;border-top:2px solid rgba(255,255,255,.15)}
  .lb-pod-plinth-1{height:clamp(48px,9vw,80px);background:linear-gradient(to bottom,rgba(255,255,255,.1),rgba(255,255,255,.03))}
  .lb-pod-plinth-2{height:clamp(32px,6vw,56px);background:linear-gradient(to bottom,rgba(255,255,255,.06),rgba(255,255,255,.01))}
  .lb-pod-plinth-3{height:clamp(22px,4vw,40px);background:linear-gradient(to bottom,rgba(255,255,255,.04),transparent)}
  .lb-table{display:flex;flex-direction:column}
  .lb-table-header{display:grid;grid-template-columns:52px 1fr 80px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.1)}
  .lb-th-rank,.lb-th-name,.lb-th-pts{font-family:'Anton',sans-serif;font-size:9px;letter-spacing:3px;color:rgba(255,255,255,.35)}
  .lb-th-pts{text-align:right}
  .lb-row{display:grid;grid-template-columns:52px 1fr 80px;align-items:center;padding:16px 16px;border-bottom:1px solid rgba(255,255,255,.06);transition:background .15s;animation:lbRowIn .35s ease both}
  .lb-row:hover{background:rgba(255,255,255,.03)}
  .lb-row-me{background:rgba(255,255,255,.05)!important;border-left:3px solid #fff}
  .lb-row-rank{font-family:'Anton',sans-serif;font-size:16px;color:rgba(255,255,255,.4);letter-spacing:1px}
  .lb-row-name{font-family:'Anton',sans-serif;font-size:18px;color:#fff;letter-spacing:.5px;text-transform:uppercase;display:flex;align-items:center;gap:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .lb-row-pts{font-family:'Anton',sans-serif;font-size:22px;color:#fff;text-align:right;line-height:1}
  .lb-row-pts-u{font-family:'Anton',sans-serif;font-size:9px;letter-spacing:1.5px;color:rgba(255,255,255,.4)}
  .lb-you-tag{font-family:'Anton',sans-serif;font-size:7px;letter-spacing:2px;background:#fff;color:#000;padding:2px 7px;flex-shrink:0}
  .lb-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;text-align:center}
  @keyframes lbRowIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
  .lb-row:nth-child(1){animation-delay:.05s}.lb-row:nth-child(2){animation-delay:.10s}.lb-row:nth-child(3){animation-delay:.15s}.lb-row:nth-child(4){animation-delay:.20s}.lb-row:nth-child(5){animation-delay:.25s}.lb-row:nth-child(6){animation-delay:.30s}.lb-row:nth-child(7){animation-delay:.35s}
  /* keep lrow/you-chip for TV leaderboard reuse */
  .you-chip{font-family:'Anton',sans-serif;font-size:6px;letter-spacing:2px;background:#fff;color:#000;padding:2px 8px;flex-shrink:0}

  /* ── RULES ── */
  .rules-card{display:flex;gap:18px;border-bottom:1px solid rgba(255,255,255,.055);padding:22px 16px;transition:background .15s}
  .rules-card:hover{background:#060606}
  .rules-num{font-family:'Anton',sans-serif;font-size:44px;color:rgba(255,255,255,.28);letter-spacing:1px;flex-shrink:0;min-width:44px;line-height:1;margin-top:-4px}
  .rules-content{flex:1}
  .rules-title{font-family:'Anton',sans-serif;font-size:13px;letter-spacing:2px;color:#fff;text-transform:uppercase;margin-bottom:9px}
  .rules-body{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(255,255,255,.72);line-height:1.76}
  .rules-footer{display:flex;align-items:center;justify-content:center;gap:10px;padding:24px 16px;font-family:'Outfit',sans-serif;font-size:11px;color:rgba(255,255,255,.16)}

  /* ── SPONSORS ── */
  .sponsor-hero{background:#fff;padding:24px 20px 28px;text-align:center}
  .sponsor-hero-emoji{font-size:64px;margin-bottom:8px;display:block}
  .sponsor-hero-name{font-family:'Anton',sans-serif;font-size:30px;letter-spacing:2px;color:#000;text-transform:uppercase}
  .sponsor-hero-role{font-family:'Anton',sans-serif;font-size:13px;letter-spacing:5px;color:rgba(0,0,0,.6);margin-bottom:10px;text-transform:uppercase;display:block}
  .sponsor-hero-detail{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(0,0,0,.4);margin-top:8px}
  .sponsor-card{display:flex;align-items:center;gap:16px;border-bottom:1px solid rgba(255,255,255,.055);padding:18px 16px;transition:background .15s}
  .sponsor-card:hover{background:#060606}
  .sponsor-emoji{font-size:26px;flex-shrink:0}
  .sponsor-info{flex:1}
  .sponsor-name{font-family:'Anton',sans-serif;font-size:16px;letter-spacing:.5px;color:#fff;text-transform:uppercase}
  .sponsor-role{font-family:'Anton',sans-serif;font-size:7.5px;letter-spacing:3px;color:rgba(255,255,255,.25);text-transform:uppercase;margin-bottom:4px}
  .sponsor-detail{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.6);margin-top:3px}
  .sponsor-cta-box{padding:24px 16px;border-top:1px solid rgba(255,255,255,.055)}
  .sponsor-cta-title{font-family:'Anton',sans-serif;font-size:13px;letter-spacing:2.5px;color:#fff;text-transform:uppercase;margin-bottom:8px}
  .sponsor-cta-body{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.25);line-height:1.7}

  /* ── PROFILE ── */
  .prof-wrap{max-width:600px;margin:0 auto;display:flex;flex-direction:column}
  .prof-hero{background:linear-gradient(160deg,rgba(255,255,255,.07) 0%,rgba(255,255,255,.02) 100%);border-bottom:1px solid rgba(255,255,255,.09);padding:44px 24px 36px;text-align:center;width:100%}
  .prof-av{width:76px;height:76px;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.18);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Anton',sans-serif;font-size:26px;letter-spacing:2px;margin:0 auto 20px;border-radius:50%}
  .prof-name{font-family:'Anton',sans-serif;font-size:28px;letter-spacing:1px;color:#fff;text-transform:uppercase;margin-bottom:8px}
  .prof-detail{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(255,255,255,.5);margin-bottom:3px}
  .prof-leader-badge{margin-top:18px;display:inline-block;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;padding:10px 24px;font-family:'Anton',sans-serif;font-size:9px;letter-spacing:3px;text-transform:uppercase;border-radius:6px}
  .stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(255,255,255,.08);width:100%}
  .scard{background:#111;padding:24px 20px}
  .sval{font-family:'Anton',sans-serif;font-size:44px;color:#fff;line-height:1}
  .sunit{font-family:'Anton',sans-serif;font-size:16px;color:rgba(255,255,255,.4);margin-left:3px}
  .slbl{font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;color:rgba(255,255,255,.5);margin-top:8px;text-transform:uppercase;letter-spacing:.5px}
  .info-card{padding:24px 20px;border-top:1px solid rgba(255,255,255,.08);width:100%}
  .info-title{font-family:'Anton',sans-serif;font-size:13px;letter-spacing:2px;color:#fff;margin-bottom:12px;text-transform:uppercase}
  .info-body{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(255,255,255,.65);line-height:1.78}
  .info-body strong{color:#fff;font-weight:700}

  /* ── ADMIN ── */
  .admin-subtabs{display:flex;border-bottom:1px solid rgba(255,255,255,.07)}
  .admin-subtab{padding:16px 18px;background:transparent;border:none;border-bottom:2px solid transparent;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:rgba(255,255,255,.6);cursor:pointer;transition:all .2s;margin-bottom:-1px}
  .ast-on{color:#fff;border-bottom-color:#fff}
  .admin-topbar{display:flex;align-items:center;justify-content:space-between;padding:18px 14px 0;margin-bottom:4px;gap:12px}
  .admin-add-btn{flex-shrink:0;padding:10px 18px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:9.5px;letter-spacing:2.5px;transition:opacity .15s;white-space:nowrap}
  .admin-add-btn:hover{opacity:.85}
  .admin-section-lbl{font-family:'Anton',sans-serif;font-size:12px;letter-spacing:3px;color:rgba(255,255,255,.65);display:flex;align-items:center;gap:8px;padding:18px 14px 10px}
  .admin-count{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);padding:3px 10px;font-size:11px;color:#fff}
  .admin-row{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.07);padding:16px 14px;gap:12px;flex-wrap:wrap;transition:background .15s}
  .admin-row:hover{background:#080808}
  .admin-row-left{display:flex;flex-direction:column;gap:5px;flex:1;min-width:0}
  .admin-row-group{font-family:'Anton',sans-serif;font-size:12px;letter-spacing:2.5px;color:rgba(255,255,255,.65)}
  .admin-row-teams{font-family:'Anton',sans-serif;font-size:18px;color:#fff;letter-spacing:.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase}
  .admin-row-dt{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(255,255,255,.7);margin-top:3px;font-weight:500}
  .admin-row-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
  .admin-score-badge{font-family:'Anton',sans-serif;font-size:18px;color:#fff;letter-spacing:3px}
  .finished-tag{font-family:'Anton',sans-serif;font-size:8px;letter-spacing:2px;color:rgba(34,197,94,.8);border:1px solid rgba(34,197,94,.25);padding:3px 8px}
  .upcoming-tag{font-family:'Anton',sans-serif;font-size:8px;letter-spacing:2px;color:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.15);padding:3px 8px}
  .admin-edit-btn{padding:8px 16px;background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);cursor:pointer;font-family:'Anton',sans-serif;font-size:9px;letter-spacing:2px;transition:all .15s}
  .admin-edit-btn:hover{border-color:rgba(255,255,255,.55);color:#fff}
  .admin-del-btn{width:32px;height:32px;background:transparent;border:1px solid rgba(239,68,68,.2);color:rgba(239,68,68,.6);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s}
  .admin-del-btn:hover{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.5);color:#f87171}
  .admin-form-card{background:#050505;border:1px solid rgba(255,255,255,.12);padding:18px;margin:0 0 8px}
  .admin-edit-card{border-color:rgba(255,255,255,.25)}
  .admin-form-title{font-family:'Anton',sans-serif;font-size:12px;letter-spacing:3px;color:rgba(255,255,255,.65);margin-bottom:18px;text-transform:uppercase}
  .admin-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-bottom:14px}
  .afield{display:flex;flex-direction:column;gap:6px}
  .afield-lbl{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2px;color:rgba(255,255,255,.75)}
  .afield-inp{padding:10px 12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#fff;font-family:'Outfit',sans-serif;font-size:14px;font-weight:500;transition:all .2s;outline:none}
  .afield-inp:focus{border-color:rgba(255,255,255,.45);background:rgba(255,255,255,.08)}
  .afield-inp::placeholder{color:rgba(255,255,255,.3)}
  .afield-ta{resize:vertical;min-height:80px;font-family:'Outfit',sans-serif}
  .admin-score-row{margin-bottom:16px}
  .admin-score-lbl{display:block;font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.6);margin-bottom:10px;font-weight:500}
  .admin-score-inputs{display:flex;align-items:center;gap:10px}
  .admin-sinput{width:56px;height:52px;text-align:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#fff;font-family:'Anton',sans-serif;font-size:24px;transition:all .2s;outline:none}
  .admin-sinput:focus{border-color:rgba(255,255,255,.5)}
  .admin-sep{font-family:'Anton',sans-serif;font-size:20px;color:rgba(255,255,255,.25)}
  .admin-form-actions{display:flex;gap:10px}
  .admin-save-btn{flex:1;padding:14px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:3px;transition:opacity .15s}
  .admin-save-btn:hover{opacity:.85}
  .admin-cancel-btn{padding:14px 20px;background:transparent;border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.55);cursor:pointer;font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;transition:all .15s}
  .admin-cancel-btn:hover{border-color:rgba(255,255,255,.4);color:#fff}
  .admin-hint{border-top:1px solid rgba(255,255,255,.07);padding:14px 0;font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.5);line-height:1.65;margin-bottom:24px}
  .vpad{padding:0}

  /* ── MODAL ── */
  .modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.92);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
  .modal{background:#111;border:1px solid rgba(255,255,255,.25);padding:36px 28px;width:100%;max-width:360px;box-shadow:0 24px 80px rgba(0,0,0,.9);animation:modalPop .25s cubic-bezier(.16,1,.3,1) both}
  @keyframes modalPop{from{opacity:0;transform:scale(.94) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
  .modal-title{font-family:'Anton',sans-serif;font-size:24px;letter-spacing:1.5px;color:#fff;margin-bottom:14px;text-transform:uppercase}
  .modal-body{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(255,255,255,.6);line-height:1.7;margin-bottom:24px}
  .modal-actions{display:flex;gap:10px}
  .modal-del-btn{flex:1;padding:14px;background:#ef4444;color:#fff;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:10.5px;letter-spacing:3px;transition:opacity .15s}
  .modal-del-btn:hover{opacity:.85}
  .modal-cancel-btn{padding:14px 20px;background:transparent;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4);cursor:pointer;font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;transition:all .15s}
  .modal-cancel-btn:hover{border-color:rgba(255,255,255,.3);color:#fff}

  /* ── SECHEAD ── */
  .sechead{padding:20px 16px 14px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:20px}
  .sectitle{font-family:'Anton',sans-serif;font-size:26px;letter-spacing:2px;color:#fff;text-transform:uppercase}
  .secsub{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.45);margin-top:5px}

  /* ── COUNTDOWN CHIP ── */
  .countdown-chip{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2px;border:1px solid;padding:5px 12px;white-space:nowrap;transition:all .5s;justify-self:end}
  .countdown-chip-urgent{animation:chipPulse 1.4s ease-in-out infinite}
  @keyframes chipPulse{0%,100%{opacity:1}50%{opacity:.55}}

  /* ── ROOMS ── */

  .room-empty-ico{font-size:48px;line-height:1}
  .room-empty-title{font-family:'Anton',sans-serif;font-size:18px;letter-spacing:2px;color:rgba(255,255,255,.5)}
  .room-empty-sub{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.25);text-align:center}

  .room-leave-btn{width:100%;padding:13px;background:transparent;border:1px solid rgba(239,68,68,.2);color:rgba(239,68,68,.5);cursor:pointer;font-family:'Anton',sans-serif;font-size:9.5px;letter-spacing:3px;transition:all .2s}
  .room-leave-btn:hover{border-color:rgba(239,68,68,.5);color:#f87171}



  /* ── ROOM LEADER HERO ── */

  .room-leader-crown{font-size:32px;line-height:1;margin-bottom:8px;animation:crownBounce 1.5s ease-in-out infinite}
  .room-leader-label{font-family:'Anton',sans-serif;font-size:9px;letter-spacing:5px;color:rgba(0,0,0,.4);text-transform:uppercase;margin-bottom:12px}
  .room-leader-name{font-family:'Anton',sans-serif;font-size:clamp(24px,5vw,40px);letter-spacing:1.5px;color:#000;line-height:1;text-transform:uppercase;margin-bottom:10px}
  .room-leader-pts-row{display:flex;align-items:baseline;justify-content:center;gap:8px}
  .room-leader-pts{font-family:'Anton',sans-serif;font-size:60px;color:#000;line-height:.9}
  .room-leader-pts-unit{font-family:'Anton',sans-serif;font-size:14px;letter-spacing:4px;color:rgba(0,0,0,.3)}
  .room-prize-banner{display:flex;align-items:center;gap:14px;padding:16px 14px;background:linear-gradient(135deg,rgba(255,200,50,.08),rgba(255,160,20,.04));border-bottom:1px solid rgba(255,200,50,.15)}
  .room-prize-banner-ico{font-size:32px;flex-shrink:0;line-height:1}
  .room-prize-banner-text{display:flex;flex-direction:column;gap:3px}
  .room-prize-banner-label{font-family:'Anton',sans-serif;font-size:8px;letter-spacing:3px;color:rgba(255,200,50,.5);text-transform:uppercase}
  .room-prize-banner-val{font-family:'Anton',sans-serif;font-size:20px;letter-spacing:1px;color:rgba(255,200,50,.95);text-transform:uppercase}

  /* ── ACTIVITY FEED ── */


  /* ── CHAT ── */

  .chat-msg-me .chat-msg-bubble{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.2)}
  .chat-msg-me .chat-msg-header{flex-direction:row-reverse}
  .chat-input-row{display:flex;gap:0;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0}
  .chat-input{flex:1;padding:14px 16px;background:rgba(255,255,255,.03);border:none;color:#fff;font-family:'Outfit',sans-serif;font-size:15px;font-weight:500;outline:none}
  .chat-input::placeholder{color:rgba(255,255,255,.25)}
  .chat-input:focus{background:rgba(255,255,255,.06)}
  .chat-send-btn{width:56px;background:rgba(255,255,255,.08);border:none;border-left:1px solid rgba(255,255,255,.08);color:#fff;font-family:'Anton',sans-serif;font-size:18px;cursor:pointer;transition:all .15s;flex-shrink:0}
  .chat-send-btn:hover:not(:disabled){background:rgba(255,255,255,.18)}
  .chat-send-btn:disabled{opacity:.25;cursor:not-allowed}

  /* ── TV LEADERBOARD BUTTON ── */
  .tv-lb-btn{display:flex;align-items:center;gap:14px;width:100%;max-width:440px;margin-top:16px;padding:16px 20px;background:rgba(10,10,10,.65);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.12);border-radius:16px;cursor:pointer;transition:all .2s;text-align:left}
  .tv-lb-btn:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.3);transform:translateY(-1px)}
  .tv-lb-btn-ico{font-size:26px;flex-shrink:0;line-height:1}
  .tv-lb-btn-inner{display:flex;flex-direction:column;gap:3px}
  .tv-lb-btn-text{font-family:'Anton',sans-serif;font-size:12px;letter-spacing:3px;color:#fff}
  .tv-lb-btn-sub{font-family:'Outfit',sans-serif;font-size:11px;color:rgba(255,255,255,.4);font-weight:500}

  /* ── TV LEADERBOARD SCREEN ── */
  .tv-root{min-height:100vh;background:#000;display:flex;flex-direction:column;align-items:center;padding:24px 20px 40px;position:relative;overflow:hidden}
  .tv-scanlines{position:fixed;inset:0;pointer-events:none;z-index:1;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.15) 2px,rgba(0,0,0,.15) 4px)}
  .tv-back-btn{position:absolute;top:18px;left:20px;background:transparent;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.45);font-family:'Anton',sans-serif;font-size:8.5px;letter-spacing:2.5px;padding:8px 14px;cursor:pointer;transition:all .2s;z-index:10}
  .tv-back-btn:hover{color:#fff;border-color:rgba(255,255,255,.4)}
  .tv-header{display:flex;align-items:center;gap:20px;margin-bottom:12px;margin-top:10px}
  .tv-header-text{display:flex;flex-direction:column;gap:4px}
  .tv-title{font-family:'Anton',sans-serif;font-size:clamp(28px,6vw,56px);letter-spacing:4px;color:#fff;line-height:1;text-transform:uppercase;text-shadow:0 0 20px rgba(255,255,255,.3)}
  .tv-subtitle{font-family:'Anton',sans-serif;font-size:clamp(10px,2vw,16px);letter-spacing:6px;color:rgba(255,255,255,.4);text-transform:uppercase}
  .tv-mode-dots{display:flex;gap:8px;margin-bottom:24px}
  .tv-mode-fade{animation:tvModeFade 0.9s cubic-bezier(.4,0,.2,1) both}
  @keyframes tvModeFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  .tv-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.15);transition:background .4s}
  .tv-dot-on{background:#fff;box-shadow:0 0 8px #fff}
  .tv-section-label{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:5px;color:rgba(255,255,255,.3);text-align:center;margin-bottom:20px;text-transform:uppercase}
  .tv-empty{font-family:'Outfit',sans-serif;font-size:16px;color:rgba(255,255,255,.25);text-align:center;padding:40px 0}
  .tv-scroll-wrap{width:100%;max-width:680px;z-index:2}
  .tv-row{display:flex;align-items:center;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.06);transition:background .4s,border-color .4s;position:relative}
  .tv-row-lit{background:rgba(255,255,255,.07);border-bottom-color:rgba(255,255,255,.2);box-shadow:0 0 30px rgba(255,255,255,.04)}
  .tv-row-ball{position:absolute;right:80px;font-size:clamp(16px,2.5vw,24px);animation:rowBallBounce .6s ease-in-out infinite alternate}
  @keyframes rowBallBounce{from{transform:translateY(0) rotate(0deg)}to{transform:translateY(-6px) rotate(180deg)}}
  .tv-rank{width:52px;flex-shrink:0;text-align:center}
  .tv-medal{font-size:clamp(22px,4vw,34px);line-height:1}
  .tv-rank-n{font-family:'Anton',sans-serif;font-size:clamp(18px,3vw,26px);color:rgba(255,255,255,.35);letter-spacing:1px}
  .tv-name{flex:1;font-family:'Anton',sans-serif;font-size:clamp(20px,4vw,38px);color:#fff;letter-spacing:1px;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tv-pts-wrap{display:flex;align-items:baseline;gap:6px;flex-shrink:0}
  .tv-pts{font-family:'Anton',sans-serif;font-size:clamp(28px,5vw,52px);color:#fff;line-height:1}
  .tv-pts-u{font-family:'Anton',sans-serif;font-size:clamp(9px,1.5vw,14px);letter-spacing:2px;color:rgba(255,255,255,.35)}
  .tv-podium-wrap{width:100%;max-width:760px;z-index:2}
  .tv-podium{display:flex;align-items:flex-end;justify-content:center;gap:12px;padding:0 10px;margin-top:20px}
  .tv-pod{display:flex;flex-direction:column;align-items:center;flex:1;max-width:220px}
  .tv-pod-crown{font-size:clamp(24px,4vw,42px);line-height:1;margin-bottom:4px;animation:crownBounce 1.5s ease-in-out infinite}
  .tv-pod-medal{font-size:clamp(28px,5vw,50px);line-height:1;margin-bottom:10px}
  .tv-pod-name{font-family:'Anton',sans-serif;font-size:clamp(13px,2.5vw,22px);letter-spacing:1px;color:#fff;text-transform:uppercase;text-align:center;margin-bottom:6px;line-height:1.2;word-break:break-word}
  .tv-pod-name-1{font-size:clamp(16px,3vw,28px)}
  .tv-pod-pts{font-family:'Anton',sans-serif;font-size:clamp(22px,4vw,44px);color:#fff;line-height:1;text-align:center;margin-bottom:12px}
  .tv-pod-pts-1{font-size:clamp(30px,5.5vw,58px)}
  .tv-pod-pts-u{font-family:'Anton',sans-serif;font-size:clamp(8px,1.2vw,13px);letter-spacing:2px;color:rgba(255,255,255,.4);margin-left:4px}
  .tv-pod-block{width:100%;border-top:2px solid rgba(255,255,255,.2)}
  .tv-pod-block-1{height:clamp(60px,10vw,100px);background:rgba(255,255,255,.12)}
  .tv-pod-block-2{height:clamp(44px,7vw,72px);background:rgba(255,255,255,.06)}
  .tv-pod-block-3{height:clamp(32px,5vw,52px);background:rgba(255,255,255,.04)}
  .tv-footer{margin-top:auto;padding-top:32px;font-family:'Outfit',sans-serif;font-size:clamp(11px,1.8vw,14px);color:rgba(255,255,255,.25);text-align:center;letter-spacing:.5px;z-index:2}
  @keyframes crownBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}

  /* ══════════════════════════════════════
     SPLASH — BALL + ROPE SIGN + NEON
  ══════════════════════════════════════ */
  .splash{position:relative;display:flex;align-items:center;justify-content:center;height:100vh;background:#000;overflow:hidden}
  .splash-shake{animation:screenShake 0.8s cubic-bezier(.36,.07,.19,.97) both}
  .sp-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 25%,rgba(0,0,0,.88) 100%);pointer-events:none;z-index:1}
  .sp-glow-bg{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:600px;border-radius:50%;background:radial-gradient(circle,rgba(255,200,50,.0) 0%,transparent 70%);pointer-events:none;z-index:0}
  @keyframes glowBurst{0%{background:radial-gradient(circle,rgba(255,220,80,.55) 0%,transparent 60%);transform:translate(-50%,-50%) scale(.4)}30%{background:radial-gradient(circle,rgba(255,200,50,.35) 0%,transparent 65%);transform:translate(-50%,-50%) scale(1.3)}70%{background:radial-gradient(circle,rgba(255,180,30,.18) 0%,transparent 70%);transform:translate(-50%,-50%) scale(1.6)}100%{background:radial-gradient(circle,rgba(255,180,30,.06) 0%,transparent 70%);transform:translate(-50%,-50%) scale(2)}}
  .sp-tap-hint{position:absolute;bottom:52px;left:50%;transform:translateX(-50%);font-family:'Anton',sans-serif;font-size:11px;letter-spacing:5px;color:rgba(255,255,255,.4);z-index:15;animation:tapHintPulse 1.6s ease-in-out infinite;pointer-events:none;white-space:nowrap;border:1px solid rgba(255,255,255,.12);padding:6px 16px}
  @keyframes tapHintPulse{0%,100%{opacity:.3}50%{opacity:.75}}
  .sp-progress-track{position:absolute;bottom:0;left:0;right:0;height:2px;background:rgba(255,255,255,.06);z-index:15;pointer-events:none}
  .sp-progress-fill{height:100%;background:linear-gradient(to right,rgba(255,200,50,.5),rgba(255,200,50,.9));transition:width .12s linear}
  .sp-flash{position:absolute;inset:0;background:#fff;z-index:20;animation:flashOut 0.5s ease forwards;pointer-events:none}
  .sp-cracks{position:absolute;top:50%;left:50%;z-index:3;pointer-events:none}
  .sp-crack{position:absolute;top:0;left:0;width:1px;height:0;background:linear-gradient(to bottom,rgba(255,255,255,.9),transparent);transform-origin:top center;animation:crackGrow 1.2s ease forwards}
  .sp-sparks{position:absolute;top:50%;left:50%;z-index:6;pointer-events:none}
  .sp-spark{position:absolute;top:0;left:0;width:2px;height:0;background:linear-gradient(to bottom,rgba(255,220,80,1),rgba(255,120,20,.6),transparent);transform-origin:top center;animation:sparkShoot 0.9s cubic-bezier(.2,0,.8,1) forwards}
  @keyframes sparkShoot{0%{height:0;opacity:1}40%{height:clamp(40px,8vw,80px);opacity:1}100%{height:clamp(60px,14vw,140px);opacity:0}}
  .sp-ball-fly{position:absolute;z-index:5;bottom:0;left:50%;transform:translateX(-50%) scale(0.06);animation:ballApproach 3s cubic-bezier(.25,0,.15,1) forwards}
  .sp-ball-smash{position:absolute;z-index:5;top:50%;left:50%;transform:translate(-50%,-50%) scale(4.5);animation:ballSmash 0.7s cubic-bezier(.1,0,.4,1) forwards}
  .sp-ball{font-size:72px;line-height:1;display:block;animation:ballSpin 3s linear forwards}
  .sp-ball-nospin{animation:none}
  .sp-sign-wrap{position:absolute;z-index:10;left:50%;display:flex;flex-direction:column;align-items:center;width:min(520px,90vw)}
  .sp-sign-drop{top:-500px;animation:signDrop 1.8s cubic-bezier(.22,1,.36,1) forwards}
  .sp-sign-falling{top:50%;transform:translate(-50%,-50%);animation:signFall 1.2s cubic-bezier(.55,0,1,.45) forwards}
  .sp-ropes{display:flex;justify-content:space-between;width:65%;padding:0 8px}
  .sp-rope{width:2px;height:0;background:linear-gradient(to bottom,rgba(255,255,255,.05),rgba(255,255,255,.4),rgba(255,255,255,.15));animation:ropeGrow 0.5s ease 0.2s forwards}
  .sp-sign-board{background:#060606;border:2px solid rgba(255,255,255,.22);padding:32px 42px 36px;text-align:center;width:100%;box-shadow:0 12px 80px rgba(0,0,0,.98),0 0 0 1px rgba(255,255,255,.04),inset 0 0 60px rgba(0,0,0,.7);position:relative}
  .sp-sign-board::before{content:'';position:absolute;inset:6px;border:1px solid rgba(255,255,255,.07);pointer-events:none}
  .sp-sign-board::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(255,255,255,.03) 0%,transparent 65%);pointer-events:none}
  .sp-neon-main{font-family:'Anton',sans-serif;font-size:clamp(50px,11vw,88px);letter-spacing:8px;color:rgba(255,255,255,.18);line-height:1;text-transform:uppercase}
  .sp-sign-divider{height:1px;background:rgba(255,255,255,.18);margin:14px 0 10px;width:100%}
  .sp-neon-sub2{font-family:'Anton',sans-serif;font-size:clamp(9px,2vw,13px);letter-spacing:6px;color:rgba(255,255,255,.18);text-transform:uppercase;margin-bottom:18px}
  .sp-sign-sep{height:1px;background:rgba(255,200,50,.22);margin:0 0 12px;width:100%}
  .sp-neon-gold{font-family:'Anton',sans-serif;font-size:clamp(13px,2.8vw,20px);letter-spacing:10px;color:rgba(255,200,50,.18);text-transform:uppercase;margin-bottom:10px}
  .sp-neon-tag{font-family:'Outfit',sans-serif;font-size:clamp(8px,1.6vw,11px);letter-spacing:4px;color:rgba(255,255,255,.18);text-transform:uppercase;margin-top:2px}

  /* ── ANIMATIONS ── */
  .page-anim{animation:pageIn 0.25s ease both}
  .bnav-btn{transition:color .2s,transform .12s}
  .bnav-btn:active{transform:scale(.85)}
  .bnav-ico{transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
  .bnav-on .bnav-ico{transform:scale(1.25) translateY(-2px)}
  .card-stack .mcard{animation:cardIn .35s ease both}
  .card-stack .mcard:nth-child(1){animation-delay:.04s}.card-stack .mcard:nth-child(2){animation-delay:.09s}.card-stack .mcard:nth-child(3){animation-delay:.14s}.card-stack .mcard:nth-child(4){animation-delay:.19s}.card-stack .mcard:nth-child(5){animation-delay:.24s}.card-stack .mcard:nth-child(6){animation-delay:.29s}
  .lrow{animation:cardIn .32s ease both}
  .lrow:nth-child(1){animation-delay:.05s}.lrow:nth-child(2){animation-delay:.10s}.lrow:nth-child(3){animation-delay:.15s}.lrow:nth-child(4){animation-delay:.20s}.lrow:nth-child(5){animation-delay:.25s}
  .rules-card{animation:cardIn .32s ease both}
  .rules-card:nth-child(1){animation-delay:.05s}.rules-card:nth-child(2){animation-delay:.11s}.rules-card:nth-child(3){animation-delay:.17s}.rules-card:nth-child(4){animation-delay:.23s}.rules-card:nth-child(5){animation-delay:.29s}
  .leader-hero{animation:heroReveal .5s cubic-bezier(.4,0,.2,1) both}
  .prof-hero{animation:heroReveal .5s cubic-bezier(.4,0,.2,1) both}
  .sponsor-hero{animation:heroReveal .5s cubic-bezier(.4,0,.2,1) both}
  .prof-wrap .stats-grid{animation:fadeUp .4s ease .15s both}
  .prof-wrap .info-card{animation:fadeUp .4s ease .28s both}
  .scard{animation:cardIn .32s ease both}
  .scard:nth-child(1){animation-delay:.06s}.scard:nth-child(2){animation-delay:.12s}.scard:nth-child(3){animation-delay:.18s}.scard:nth-child(4){animation-delay:.24s}
  .score-digit{animation:digitPop .3s cubic-bezier(.34,1.56,.64,1) both}
  .auth-panel{animation:fadeUp .5s cubic-bezier(.4,0,.2,1) .12s both}
  .auth-cta:active{transform:scale(.97)}

  @keyframes screenShake{0%{transform:translate(0,0)}8%{transform:translate(-16px,-12px) rotate(-1.2deg)}16%{transform:translate(18px,14px) rotate(1.2deg)}24%{transform:translate(-16px,8px) rotate(-.8deg)}32%{transform:translate(14px,-14px) rotate(.8deg)}42%{transform:translate(-10px,10px) rotate(-.4deg)}52%{transform:translate(9px,-8px) rotate(.4deg)}63%{transform:translate(-6px,6px)}74%{transform:translate(4px,-4px)}86%{transform:translate(-2px,2px)}100%{transform:translate(0,0)}}
  @keyframes flashOut{0%{opacity:1}100%{opacity:0}}
  @keyframes crackGrow{0%{height:0;opacity:1}55%{opacity:.8}100%{height:clamp(90px,17vw,170px);opacity:0}}
  @keyframes ballApproach{0%{bottom:0;left:50%;transform:translateX(-50%) scale(0.06);filter:blur(1px)}20%{bottom:8%;left:50%;transform:translateX(-50%) scale(0.18);filter:blur(0px)}40%{bottom:20%;left:50%;transform:translate(-50%,-20%) scale(0.45)}60%{bottom:40%;left:50%;transform:translate(-50%,-40%) scale(1.0)}78%{bottom:50%;left:50%;transform:translate(-50%,-50%) scale(2.2)}90%{bottom:50%;left:50%;transform:translate(-50%,-50%) scale(3.6)}100%{bottom:50%;left:50%;transform:translate(-50%,-50%) scale(4.5)}}
  @keyframes ballSmash{0%{transform:translate(-50%,-50%) scale(4.5);opacity:1}30%{transform:translate(-50%,-50%) scale(5.8);opacity:1}60%{transform:translate(-50%,-50%) scale(4.2);opacity:.75}100%{transform:translate(-50%,-50%) scale(0.1);opacity:0}}
  @keyframes ballSpin{from{transform:rotate(0deg)}to{transform:rotate(1440deg)}}
  @keyframes ropeGrow{from{height:0}to{height:clamp(30px,5.5vw,52px)}}
  @keyframes signDrop{0%{top:-500px;transform:translateX(-50%) rotate(-4deg)}45%{top:53%;transform:translateX(calc(-50% + 10px)) rotate(2.5deg)}62%{top:46%;transform:translateX(calc(-50% - 6px)) rotate(-1.2deg)}75%{top:51%;transform:translateX(calc(-50% + 3px)) rotate(.6deg)}86%{top:49%;transform:translateX(calc(-50% - 1px)) rotate(-.2deg)}100%{top:50%;transform:translate(-50%,-50%) rotate(0deg)}}
  @keyframes signFall{0%{top:50%;transform:translate(-50%,-50%) rotate(0deg);opacity:1}12%{transform:translate(-50%,-44%) rotate(4deg);opacity:1}100%{top:160%;transform:translate(-50%,0) rotate(18deg);opacity:0}}
  @keyframes neonWhiteOn{0%{color:rgba(255,255,255,.18);text-shadow:none}5%{color:#fff;text-shadow:0 0 8px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9)}10%{color:rgba(255,255,255,.1);text-shadow:none}18%{color:#fff;text-shadow:0 0 8px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9)}24%{color:rgba(255,255,255,.05);text-shadow:none}33%{color:#fff;text-shadow:0 0 8px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9)}40%{color:rgba(255,255,255,.2);text-shadow:none}50%{color:#fff;text-shadow:0 0 8px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9)}58%{color:rgba(255,255,255,.4)}67%{color:#fff;text-shadow:0 0 8px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9)}78%{color:rgba(255,255,255,.65)}88%{color:#fff;text-shadow:0 0 8px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9)}100%{color:#fff;text-shadow:0 0 5px #fff,0 0 12px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9),0 0 85px rgba(180,200,255,.5)}}
  @keyframes neonWhiteBreathe{0%,100%{text-shadow:0 0 5px #fff,0 0 12px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9),0 0 85px rgba(180,200,255,.5)}50%{text-shadow:0 0 3px #fff,0 0 6px #fff,0 0 12px #fff,0 0 22px rgba(200,220,255,.5),0 0 45px rgba(180,200,255,.25)}}
  @keyframes neonGoldOn{0%{color:rgba(255,200,50,.18);text-shadow:none}6%{color:rgba(255,200,50,1);text-shadow:0 0 8px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9)}13%{color:rgba(255,200,50,.05);text-shadow:none}21%{color:rgba(255,200,50,1);text-shadow:0 0 8px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9)}28%{color:rgba(255,200,50,.1);text-shadow:none}37%{color:rgba(255,200,50,1);text-shadow:0 0 8px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9)}46%{color:rgba(255,200,50,.25)}55%{color:rgba(255,200,50,1);text-shadow:0 0 8px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9)}65%{color:rgba(255,200,50,.5)}74%{color:rgba(255,200,50,1);text-shadow:0 0 8px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9)}85%{color:rgba(255,200,50,.75)}93%{color:rgba(255,200,50,1);text-shadow:0 0 8px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9)}100%{color:rgba(255,200,50,1);text-shadow:0 0 5px rgba(255,200,50,1),0 0 12px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9),0 0 45px rgba(255,160,20,.7),0 0 85px rgba(255,140,10,.4)}}
  @keyframes neonGoldBreathe{0%,100%{text-shadow:0 0 5px rgba(255,200,50,1),0 0 12px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9),0 0 45px rgba(255,160,20,.7),0 0 85px rgba(255,140,10,.4)}50%{text-shadow:0 0 3px rgba(255,200,50,.7),0 0 7px rgba(255,200,50,.7),0 0 12px rgba(255,180,30,.5),0 0 25px rgba(255,160,20,.35),0 0 50px rgba(255,140,10,.2)}}
  @keyframes subWhiteOn{from{color:rgba(255,255,255,.18)}to{color:rgba(255,255,255,.5)}}
  @keyframes dividerOn{from{opacity:0}to{opacity:1}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pageIn{from{opacity:0}to{opacity:1}}
  @keyframes cardIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
  @keyframes heroReveal{from{opacity:0;transform:scaleY(.96)}to{opacity:1;transform:scaleY(1)}}
  @keyframes digitPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
  @keyframes expandW{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  @keyframes fillBar{from{width:0}to{width:100%}}

  /* ── FLOOR PLAN ── */
  .fp-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02)}
  .fp-header-title{font-family:'Anton',sans-serif;font-size:20px;letter-spacing:3px;color:#fff}
  .fp-stats{display:flex;align-items:center;gap:12px}
  .fp-stat{display:flex;flex-direction:column;align-items:center;gap:2px}
  .fp-stat-lbl{font-family:'Anton',sans-serif;font-size:7px;letter-spacing:2.5px;color:rgba(255,255,255,.3)}
  .fp-stat-div{width:1px;height:28px;background:rgba(255,255,255,.1)}
  .fp-legend{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .fp-legend-item{display:flex;align-items:center;gap:5px}
  .fp-zone{position:relative;padding:20px 16px 24px;border:1px solid rgba(255,255,255,.06)}
  .fp-zone-red{background:rgba(180,60,60,.06)}
  .fp-zone-white{background:rgba(240,240,240,.03)}
  .fp-zone-label{font-family:'Anton',sans-serif;font-size:9px;letter-spacing:4px;color:rgba(255,255,255,.25);margin-bottom:20px}
  .fp-row{display:flex;align-items:center;gap:16px}
  .fp-stairs{display:flex;align-items:center;justify-content:center;gap:0;padding:8px 0;background:rgba(255,255,255,.03);border-top:1px dashed rgba(255,255,255,.08);border-bottom:1px dashed rgba(255,255,255,.08)}
  .fp-stair{width:24px;height:8px;background:rgba(255,255,255,.1);margin:0 1px}
  .fp-stairs-label{font-family:'Anton',sans-serif;font-size:8px;letter-spacing:4px;color:rgba(255,255,255,.25);margin:0 14px}
  .fp-table{user-select:none}
  .fp-history-btn{padding:9px 16px;background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.6);cursor:pointer;font-family:'Anton',sans-serif;font-size:9px;letter-spacing:2.5px;transition:all .2s;flex-shrink:0}
  .fp-history-btn:hover{border-color:#fff;color:#fff}
  .fp-history-btn-on{background:rgba(255,255,255,.1);border-color:#fff;color:#fff}
  @keyframes fpBlink{0%,100%{opacity:1}50%{opacity:.4}}
  .fp-blink{animation:fpBlink 1.2s ease-in-out infinite}

  /* ── MENU & ORDER ── */
  .wallet-header{display:flex;align-items:center;justify-content:space-between;padding:20px 16px;background:linear-gradient(135deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,.02) 100%);border-bottom:1px solid rgba(255,255,255,.1)}
  .wallet-left{display:flex;flex-direction:column;gap:3px}
  .wallet-label{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:4px;color:rgba(255,255,255,.55)}
  .wallet-balance{font-family:'Anton',sans-serif;font-size:38px;color:#fff;line-height:1;letter-spacing:1px}
  .wallet-sub{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(255,255,255,.5);font-weight:500}
  .wallet-topup-btn{padding:14px 24px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:3px;transition:opacity .15s;flex-shrink:0}
  .wallet-topup-btn:hover{opacity:.85}

  /* Sticky category pill bar */
  .menu-pills-bar{position:sticky;top:0;z-index:20;display:flex;gap:8px;padding:10px 16px;background:#000;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0}
  .menu-pills-bar::-webkit-scrollbar{display:none}
  .menu-cat-pill{display:flex;align-items:center;gap:6px;padding:8px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.55);font-family:'Anton',sans-serif;font-size:10px;letter-spacing:1.5px;cursor:pointer;white-space:nowrap;transition:all .2s;flex-shrink:0}
  .menu-cat-pill:hover{background:rgba(255,255,255,.1);color:#fff}
  .menu-cat-pill-on{background:#fff !important;color:#000 !important;border-color:#fff !important}
  /* Section divider */
  .menu-section-divider{display:flex;align-items:center;gap:12px;padding:20px 16px 8px}
  .menu-section-line{flex:1;height:1px;background:rgba(255,255,255,.08)}
  .menu-section-label{font-family:'Anton',sans-serif;font-size:9px;letter-spacing:4px;color:rgba(255,255,255,.2)}
  /* Category header */
  .menu-cat-header{font-family:'Anton',sans-serif;font-size:16px;letter-spacing:4px;color:#fff;padding:18px 16px 16px;text-transform:uppercase;display:flex;align-items:center;gap:12px;background:linear-gradient(90deg,#111 0%,#0d0d0d 60%,#0a0a0a 100%);border-top:1px solid rgba(255,255,255,.1);border-bottom:1px solid rgba(255,255,255,.06);margin-top:4px;position:sticky;top:51px;z-index:15;overflow:hidden}
  .menu-cat-header::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#fff 0%,rgba(255,255,255,.3) 100%)}
  .menu-cat-header-icon{font-size:26px;line-height:1;filter:drop-shadow(0 0 8px rgba(255,255,255,.3))}
  .menu-cat-header-text{flex:1;display:flex;align-items:baseline;gap:10px}
  .menu-cat-header-count{font-family:'Outfit',sans-serif;font-size:11px;color:rgba(255,255,255,.3);font-weight:700;letter-spacing:0}
  /* Item badges */
  .menu-badge{font-size:9px;font-family:'Anton',sans-serif;letter-spacing:1px;padding:2px 6px;flex-shrink:0}
  .menu-badge-gold{background:rgba(251,191,36,.12);color:#fbbf24;border:1px solid rgba(251,191,36,.3)}
  .menu-badge-blue{background:rgba(147,197,253,.1);color:#93c5fd;border:1px solid rgba(147,197,253,.25)}
  .menu-badge-amber{background:rgba(251,191,36,.12);color:#c76300;border:1px solid rgba(255,68,0,.3)}
  .menu-item-row{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.055);gap:12px;transition:background .15s}
  .menu-item-row:hover{background:rgba(255,255,255,.025)}
  .menu-item-info{flex:1;min-width:0}
  .menu-item-name{font-family:'Anton',sans-serif;font-size:18px;color:#fff;letter-spacing:.5px;margin-bottom:4px}
  .menu-item-desc{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.5);margin-bottom:5px;line-height:1.4}
  .menu-item-price{font-family:'Anton',sans-serif;font-size:18px;color:rgba(255,255,255,.8);letter-spacing:1px}
  .menu-add-btn{padding:11px 20px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2px;transition:opacity .15s;flex-shrink:0}
  .menu-add-btn:hover{opacity:.85}
  .menu-qty-ctrl{display:flex;align-items:center;border:1px solid rgba(255,255,255,.2);flex-shrink:0}
  .menu-qty-btn{width:40px;height:40px;background:transparent;border:none;color:#fff;cursor:pointer;font-size:18px;font-family:'Anton',sans-serif;display:flex;align-items:center;justify-content:center;transition:background .15s}
  .menu-qty-btn:hover{background:rgba(255,255,255,.1)}
  .menu-qty-val{font-family:'Anton',sans-serif;font-size:18px;color:#fff;min-width:32px;text-align:center}
  .cart-fab{position:sticky;bottom:72px;margin:0 16px;padding:16px 20px;background:#fff;color:#000;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2px;text-align:center;cursor:pointer;box-shadow:0 4px 24px rgba(0,0,0,.5);transition:opacity .15s}
  .cart-fab:hover{opacity:.9}

  .cart-row{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06);gap:12px}
  .cart-row-name{font-family:'Anton',sans-serif;font-size:16px;color:#fff;flex:1;letter-spacing:.5px}
  .cart-row-price{font-family:'Anton',sans-serif;font-size:18px;color:#fff;min-width:64px;text-align:right}
  .cart-total-row{display:flex;align-items:baseline;justify-content:space-between;padding:16px 16px 20px;border-top:2px solid rgba(255,255,255,.12)}
  .cart-total-label{font-family:'Anton',sans-serif;font-size:12px;letter-spacing:4px;color:rgba(255,255,255,.45)}
  .cart-total-val{font-family:'Anton',sans-serif;font-size:34px;color:#fff}
  .menu-pay-btn{flex:1;padding:12px 8px;background:transparent;border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.55);cursor:pointer;font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;transition:all .15s;text-align:center}
  .menu-pay-btn:hover{border-color:rgba(255,255,255,.35);color:#fff}
  .menu-pay-btn-on{background:rgba(255,255,255,.08);border-color:#fff;color:#fff}
  .wallet-warning{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(239,68,68,.8);margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .wallet-warning-link{background:transparent;border:none;color:#fff;cursor:pointer;font-family:'Anton',sans-serif;font-size:10px;letter-spacing:1px;text-decoration:underline;padding:0}
  .table-picker-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:10px}
  .table-picker-btn{padding:12px 4px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.7);cursor:pointer;font-family:'Anton',sans-serif;font-size:16px;letter-spacing:.5px;transition:all .15s;border-radius:4px}
  .table-picker-btn:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.35);color:#fff}
  .table-picker-on{background:#fff!important;color:#000!important;border-color:#fff!important}
  .order-place-btn{width:100%;padding:18px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:12px;letter-spacing:3px;transition:opacity .15s}
  .order-place-btn:hover{opacity:.88}
  .order-place-btn:disabled{opacity:.3;cursor:not-allowed}

  /* Wallet tab */
  .wallet-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);padding:32px 24px;margin:20px 0;text-align:center}
  .wallet-card-label{font-family:'Anton',sans-serif;font-size:9px;letter-spacing:4px;color:rgba(255,255,255,.4);margin-bottom:8px}
  .wallet-card-amount{font-family:'Anton',sans-serif;font-size:56px;color:#fff;line-height:1;letter-spacing:2px;margin-bottom:10px}
  .wallet-card-name{font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:2px}
  .wallet-section-title{font-family:'Anton',sans-serif;font-size:10px;letter-spacing:4px;color:rgba(255,255,255,.45);margin-bottom:14px;padding-top:4px}
  .wallet-topup-amounts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
  .wallet-amt-btn{padding:14px 8px;background:transparent;border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.6);cursor:pointer;font-family:'Anton',sans-serif;font-size:16px;letter-spacing:1px;transition:all .15s}
  .wallet-amt-btn:hover{border-color:rgba(255,255,255,.4);color:#fff}
  .wallet-amt-on{background:rgba(255,255,255,.1);border-color:#fff;color:#fff}
  .topup-desk-box{margin:0 0 16px;padding:20px 18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.15);text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px}
  .topup-desk-icon{font-size:32px;line-height:1}
  .topup-desk-title{font-family:'Anton',sans-serif;font-size:12px;letter-spacing:3px;color:#fff}
  .topup-desk-body{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(255,255,255,.65);line-height:1.8;max-width:300px;text-align:left}
  .wallet-cash-box{margin-top:20px;padding:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}
  .wallet-cash-title{font-family:'Anton',sans-serif;font-size:14px;color:#fff;letter-spacing:.5px;margin-bottom:8px}
  .wallet-cash-body{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.5);line-height:1.6}
  .wallet-info-box{margin-top:12px;padding:16px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06)}
  .wallet-info-title{font-family:'Anton',sans-serif;font-size:12px;letter-spacing:1px;color:rgba(255,255,255,.5);margin-bottom:6px}
  .wallet-info-body{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.4);line-height:1.6}

  /* Stripe top-up button */
  .stripe-topup-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:12px;padding:18px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:13px;letter-spacing:4px;border-radius:10px;transition:all .15s;margin-bottom:8px}
  .stripe-topup-btn:hover:not(:disabled){opacity:.88;transform:translateY(-1px)}
  .stripe-topup-btn:disabled{opacity:.35;cursor:default}
  .stripe-topup-btn-ico{font-size:20px}
  .topup-divider{display:flex;align-items:center;gap:12px;margin:16px 0;color:rgba(255,255,255,.3);font-family:'Anton',sans-serif;font-size:10px;letter-spacing:3px}
  .topup-divider::before,.topup-divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.1)}

  /* Cart payment options */
  .cart-pay-options{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
  .cart-pay-opt{display:flex;align-items:center;gap:12px;padding:14px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:10px;cursor:pointer;text-align:left;transition:all .15s}
  .cart-pay-opt:hover{background:rgba(255,255,255,.07)}
  .cart-pay-opt-on{border-color:rgba(255,255,255,.55);background:rgba(255,255,255,.07)}
  .cart-pay-opt-title{font-family:'Anton',sans-serif;font-size:13px;color:#fff;letter-spacing:.5px}
  .cart-pay-opt-sub{font-family:'Outfit',sans-serif;font-size:11px;color:rgba(255,255,255,.45);margin-top:3px;font-weight:500}
  .stripe-pay-btn{background:#635bff !important;color:#fff !important}
  .stripe-pay-btn:hover:not(:disabled){background:#7a73ff !important}

  .order-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);padding:16px;margin:0 0 10px}
  .order-card-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
  .order-card-table{font-family:'Anton',sans-serif;font-size:17px;color:#fff;letter-spacing:.5px}
  .order-card-date{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.4);margin-top:3px}
  .order-card-status{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:1.5px;text-align:right}
  .order-card-items{border-top:1px solid rgba(255,255,255,.07);padding-top:10px;margin-bottom:10px}
  .order-item-line{display:flex;justify-content:space-between;font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.7);padding:3px 0;font-weight:500}
  .order-item-line span{color:rgba(255,255,255,.4)}
  .order-card-total{font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;color:rgba(255,255,255,.4);border-top:1px solid rgba(255,255,255,.07);padding-top:10px}

  /* Profile sponsors section */
  .prof-section-divider{display:flex;align-items:center;gap:12px;padding:24px 16px 8px}
  .prof-section-label{font-family:'Anton',sans-serif;font-size:10px;letter-spacing:4px;color:rgba(255,255,255,.35)}
  .prof-sponsor-sub{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.3);padding:0 16px 16px;font-weight:500}

  /* Player number card */
  .player-num-card{margin:0 0 2px;padding:20px 16px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px}
  .player-num-label{font-family:'Anton',sans-serif;font-size:9px;letter-spacing:4px;color:rgba(255,255,255,.4)}
  .player-num-value{font-family:'Anton',sans-serif;font-size:56px;color:#fff;line-height:1;letter-spacing:2px}
  .player-num-hint{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.45);line-height:1.6;max-width:320px;font-weight:500;border:1px solid rgba(255,255,255,.1);padding:10px 14px;background:rgba(255,255,255,.03)}

  /* Order ID chip */
  .order-id-chip{font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2px;color:rgba(255,255,255,.45);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);padding:2px 8px;flex-shrink:0}

  /* Orders page tabs */
  .orders-page-tabs{display:grid;grid-template-columns:1fr 1fr;border-bottom:2px solid rgba(255,255,255,.08)}
  .orders-page-tab{padding:18px 12px;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:background .2s;border-bottom:3px solid transparent;margin-bottom:-2px}
  .orders-page-tab:hover{background:rgba(255,255,255,.04)}
  .orders-page-tab-on{background:rgba(255,255,255,.05);border-bottom-color:#fff}
  .orders-page-tab-label{font-family:'Anton',sans-serif;font-size:13px;letter-spacing:2.5px;color:rgba(255,255,255,.6)}
  .orders-page-tab-on .orders-page-tab-label{color:#fff}
  .orders-live-badge{background:#f59e0b;color:#000;font-family:'Anton',sans-serif;font-size:11px;padding:2px 9px;border-radius:0;min-width:24px;text-align:center}

  /* Live stats bar */
  .live-stats-bar{display:flex;align-items:center;justify-content:space-around;padding:14px 16px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.07)}
  .live-stat{display:flex;flex-direction:column;align-items:center;gap:3px}
  .live-stat-val{font-family:'Anton',sans-serif;font-size:28px;line-height:1;color:rgba(255,255,255,.5)}
  .live-stat-lbl{font-family:'Anton',sans-serif;font-size:8px;letter-spacing:2.5px;color:rgba(255,255,255,.3)}
  .live-stat-divider{width:1px;height:36px;background:rgba(255,255,255,.08)}

  /* Live orders grid — 2 cols on wider screens */
  .live-orders-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;padding:14px}
  .live-order-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;overflow:hidden;transition:border-color .2s}
  .live-order-status-row{display:flex;align-items:center;gap:8px;padding:10px 14px}
  .live-order-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .live-order-status-txt{font-family:'Anton',sans-serif;font-size:10px;letter-spacing:3px;flex:1}
  .live-order-time{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.4);font-weight:600;margin-left:auto}
  .live-order-hero{display:flex;align-items:flex-start;justify-content:space-between;padding:14px 14px 10px}
  .live-order-table{font-family:'Anton',sans-serif;font-size:26px;color:#fff;letter-spacing:1px;line-height:1}
  .live-order-name{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.5);font-weight:600;margin-top:4px}
  .live-order-total{font-family:'Anton',sans-serif;font-size:22px;color:#fff;letter-spacing:1px}
  .live-order-items{padding:0 14px 14px;display:flex;flex-direction:column;gap:5px;border-bottom:1px solid rgba(255,255,255,.06)}
  .live-order-item{display:flex;align-items:center;gap:8px}
  .live-order-qty{font-family:'Anton',sans-serif;font-size:16px;color:rgba(255,255,255,.5);min-width:28px}
  .live-order-item-name{font-family:'Outfit',sans-serif;font-size:15px;color:#fff;font-weight:600}
  .live-order-action-btn{width:100%;padding:16px;background:transparent;border:none;border-top:1px solid rgba(255,255,255,.08);cursor:pointer;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:3px;transition:background .2s}
  .live-order-action-btn:hover{background:rgba(255,255,255,.07)}
  .history-person-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:rgba(255,255,255,.05);border-top:2px solid rgba(255,255,255,.15);border-bottom:1px solid rgba(255,255,255,.08)}
  .history-person-name{font-family:'Anton',sans-serif;font-size:20px;color:#fff;letter-spacing:.5px;text-transform:uppercase}
  .history-person-meta{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.5);margin-top:3px;font-weight:500}
  .history-order-row{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.05);gap:12px}
  .history-order-row-left{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
  .history-order-table{font-family:'Anton',sans-serif;font-size:14px;color:rgba(255,255,255,.7);letter-spacing:.5px}
  .history-order-items-inline{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.55);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .history-order-amount{font-family:'Anton',sans-serif;font-size:18px;color:#fff;flex-shrink:0}

  /* ── Group Order ── */
  .go-hero{text-align:center;padding:32px 0 24px}
  .go-hero-icon{font-size:48px;margin-bottom:8px}
  .go-hero-title{font-family:'Anton',sans-serif;font-size:28px;letter-spacing:4px;color:#fff}
  .go-hero-sub{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(255,255,255,.5);margin-top:6px}
  .go-how{margin-bottom:28px}
  .go-how-row{display:flex;align-items:flex-start;gap:14px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)}
  .go-how-num{font-family:'Anton',sans-serif;font-size:18px;color:rgba(255,255,255,.25);min-width:20px}
  .go-how-txt{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(255,255,255,.65);line-height:1.4}
  .go-btn-primary{width:100%;padding:16px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:12px;letter-spacing:3px;transition:opacity .15s}
  .go-btn-primary:hover{opacity:.85}
  .go-btn-primary:disabled{opacity:.35;cursor:not-allowed}
  .go-btn-secondary{width:100%;padding:14px;background:transparent;color:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.25);cursor:pointer;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:3px;transition:all .15s}
  .go-btn-secondary:hover{border-color:#fff;color:#fff}
  .go-btn-leave{width:100%;padding:12px;background:transparent;color:rgba(239,68,68,.6);border:1px solid rgba(239,68,68,.3);cursor:pointer;font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2px;transition:all .15s}
  .go-btn-leave:hover{border-color:rgba(239,68,68,.7);color:rgba(239,68,68,.9)}
  .go-back-btn{background:transparent;border:none;color:rgba(255,255,255,.45);font-family:'Outfit',sans-serif;font-size:13px;cursor:pointer;padding:0 0 20px;letter-spacing:.5px}
  .go-section-title{font-family:'Anton',sans-serif;font-size:10px;letter-spacing:4px;color:rgba(255,255,255,.4)}
  .go-header{display:flex;justify-content:space-between;align-items:center;padding:16px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.08)}
  .go-code-label{font-family:'Outfit',sans-serif;font-size:10px;color:rgba(255,255,255,.4);letter-spacing:2px;margin-bottom:4px}
  .go-code{font-family:'Anton',sans-serif;font-size:32px;letter-spacing:8px;color:#fff}
  .go-copy-btn{padding:10px 16px;background:transparent;border:1px solid rgba(255,255,255,.3);color:rgba(255,255,255,.7);font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2px;cursor:pointer;transition:all .15s;white-space:nowrap}
  .go-copy-btn:hover{border-color:#fff;color:#fff}
  .go-table-row{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.4);padding:8px 16px;border-bottom:1px solid rgba(255,255,255,.06)}
  .go-member-row{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06)}
  .go-member-info{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .go-member-name{font-family:'Anton',sans-serif;font-size:14px;color:#fff;letter-spacing:.5px}
  .go-host-badge{font-family:'Anton',sans-serif;font-size:8px;letter-spacing:2px;background:#fff;color:#000;padding:2px 6px}
  .go-you-badge{font-family:'Anton',sans-serif;font-size:8px;letter-spacing:2px;border:1px solid rgba(255,255,255,.3);color:rgba(255,255,255,.5);padding:2px 6px}
  .go-item-row{display:flex;align-items:center;gap:8px;padding:4px 0}
  .go-item-name{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.75);flex:1}
  .go-qty-btn{width:24px;height:24px;background:rgba(255,255,255,.1);border:none;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:2px}
  .go-qty-val{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.5);min-width:20px;text-align:center}
  .go-item-price{font-family:'Anton',sans-serif;font-size:13px;color:#fff;min-width:48px;text-align:right}
  .go-member-subtotal{font-family:'Outfit',sans-serif;font-size:11px;color:rgba(255,255,255,.35);text-align:right;margin-top:4px}
  .go-member-items{padding-left:4px}
  .go-menu-row{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.055);gap:12px;transition:background .15s}
  .go-menu-row:hover{background:rgba(255,255,255,.025)}
  .go-menu-name{font-family:'Anton',sans-serif;font-size:18px;color:#fff;letter-spacing:.5px}
  .go-menu-desc{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.5);margin-bottom:5px;line-height:1.4}
  .go-menu-price{font-family:'Anton',sans-serif;font-size:18px;color:rgba(255,255,255,.8);letter-spacing:1px}
  .go-add-btn{padding:8px 14px;background:transparent;border:1px solid rgba(255,255,255,.25);color:rgba(255,255,255,.7);font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2px;cursor:pointer;transition:all .15s;white-space:nowrap}
  .go-add-btn:hover{border-color:#fff;color:#fff}
  /* Open menu button */
  .go-open-menu-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.18);color:#fff;font-family:'Anton',sans-serif;font-size:14px;letter-spacing:2px;cursor:pointer;transition:all .2s;position:relative}
  .go-open-menu-btn:hover{background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.4)}
  .go-open-menu-badge{position:absolute;right:16px;top:50%;transform:translateY(-50%);background:#fff;color:#000;font-family:'Anton',sans-serif;font-size:12px;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center}
  /* Group menu modal */
  .go-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:20px}
  .go-modal-panel{width:100%;max-width:480px;max-height:80vh;background:#141414;border:1px solid rgba(255,255,255,.12);border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.8)}
  .go-modal-header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 14px;border-bottom:1px solid rgba(255,255,255,.08)}
  .go-modal-title{font-family:'Anton',sans-serif;font-size:20px;color:#fff;letter-spacing:2px}
  .go-modal-close{background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.6);width:34px;height:34px;border-radius:50%;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
  .go-modal-close:hover{border-color:#fff;color:#fff}
  .go-modal-cats{display:flex;gap:8px;padding:14px 16px 10px;overflow-x:auto;scrollbar-width:none;flex-shrink:0}
  .go-modal-cats::-webkit-scrollbar{display:none}
  .go-modal-cat-pill{padding:7px 16px;border:1px solid rgba(255,255,255,.2);background:transparent;color:rgba(255,255,255,.55);font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;letter-spacing:1px;border-radius:20px;cursor:pointer;white-space:nowrap;transition:all .15s;flex-shrink:0}
  .go-modal-cat-pill:hover{border-color:rgba(255,255,255,.5);color:rgba(255,255,255,.8)}
  .go-modal-cat-on{background:#fff !important;color:#000 !important;border-color:#fff !important}
  .go-modal-body{flex:1;overflow-y:auto;overscroll-behavior:contain}
  .go-modal-item{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.055);gap:12px;transition:background .15s}
  .go-modal-item:hover{background:rgba(255,255,255,.025)}
  .go-modal-add-btn{padding:9px 16px;background:transparent;border:1.5px solid rgba(255,255,255,.3);color:#fff;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2px;cursor:pointer;transition:all .15s;white-space:nowrap;border-radius:2px}
  .go-modal-add-btn:hover{background:#fff;color:#000;border-color:#fff}
  .go-modal-add-btn:active{transform:scale(.96)}
  .go-modal-footer{padding:16px;border-top:1px solid rgba(255,255,255,.1);flex-shrink:0}
  .go-footer{padding:16px}
  .go-footer-total{display:flex;justify-content:space-between;align-items:center;font-family:'Anton',sans-serif;font-size:20px;color:#fff;letter-spacing:1px;padding:12px 0;border-top:1px solid rgba(255,255,255,.15);border-bottom:1px solid rgba(255,255,255,.15);margin-bottom:4px}
  .go-pay-mode-card{display:flex;align-items:center;gap:14px;padding:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);cursor:pointer;transition:all .15s;margin-bottom:4px}
  .go-pay-mode-card:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.3)}
  .go-pay-mode-icon{font-size:24px;min-width:32px}
  .go-pay-mode-title{font-family:'Anton',sans-serif;font-size:13px;letter-spacing:1px;color:#fff}
  .go-pay-mode-sub{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.45);margin-top:3px}
  .go-pay-mode-arrow{font-size:18px;color:rgba(255,255,255,.3);margin-left:auto}
  .go-pay-summary{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);padding:12px 14px}
  .go-pay-row{display:flex;justify-content:space-between;font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.7);padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)}
  .go-pay-total-row{display:flex;justify-content:space-between;font-family:'Anton',sans-serif;font-size:16px;color:#fff;padding-top:8px;margin-top:4px}
  .go-assign-btn{padding:8px 14px;background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.6);font-family:'Outfit',sans-serif;font-size:12px;cursor:pointer;transition:all .15s;border-radius:2px}
  .go-assign-btn:hover{border-color:#fff;color:#fff}
`;