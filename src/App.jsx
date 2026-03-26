import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from '@supabase/supabase-js';
import jsQR from "jsqr";
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
  { id:"r1", title:"How to Play",        body:"Create your account and predict the exact final score for every World Cup 2026 match. Browse all 64 games in the Matches tab, enter your home and away score prediction for each one, and hit Save. You can update your predictions anytime until the deadline." },
  { id:"r2", title:"Prediction Deadline",body:"All predictions must be submitted before 14:00 on June 11, 2026 — exactly 1 hour before the opening match (Mexico vs Canada, 15:00 BON time). Once the deadline passes, the prediction window closes permanently for all games. No late submissions, no exceptions." },
  { id:"r3", title:"Points System",      body:"Exact final score correct → 5 points. Correct winner predicted (wrong score) → 1 point. Draw matches: only the exact score earns points — no points for guessing a draw with the wrong score. Wrong or missing prediction → 0 points." },
  { id:"r4", title:"Leaderboard",        body:"The player with the most points at the end of the tournament wins. The leaderboard updates live every time a match result is entered. Check the Leaderboard tab anytime to see your current rank against all other players." },
  { id:"r5", title:"Ordering Food & Drinks", body:"Top up your credits at the top-up desk (cash or card). Then scan the QR code on your table — it fills in your table number automatically. Browse the menu, add items to your cart, and place your order directly from your phone. Your order goes straight to the bar." },
  { id:"r6", title:"Group Orders",       body:"Want to order together with your table? Go to the Group tab and start a group order. Everyone at the table scans the same table QR code to join. Add your own items, then choose to pay individually or let one person cover the whole table." },
  { id:"r7", title:"Tiebreaker",         body:"If two or more players finish with the same number of points, the player who registered their account first is ranked higher. Make sure you register early!" },
  { id:"r8", title:"Fair Play",          body:"One account per person only. Duplicate accounts detected by phone number or email will result in both accounts being banned from predictions. Any attempt to manipulate the prediction system — including changing device time — will be detected and result in disqualification." },
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
// Sort by date first, then by kickoff time within the same day
const sortMatches = arr => [...arr].sort((a,b) => {
  const dateDiff = matchDate(a) - matchDate(b);
  if (dateDiff !== 0) return dateDiff;
  // same date — sort by time string "HH:MM"
  const ta = (a.time || "00:00");
  const tb = (b.time || "00:00");
  return ta.localeCompare(tb);
});

// Points: 5 for exact score, 1 for correct winner (non-draw only), 0 for everything else
function calcPts(pred, homeScore, awayScore) {
  if (!pred) return 0;
  const ph = +pred.h, pa = +pred.a;
  const mh = +homeScore, ma = +awayScore;
  if (ph === mh && pa === ma) return 5;
  const realWinner = mh > ma ? "home" : mh < ma ? "away" : "draw";
  if (realWinner === "draw") return 0;
  const predWinner = ph > pa ? "home" : ph < pa ? "away" : "draw";
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
  const tableFromQR = new URLSearchParams(window.location.search).get("table") || "";
  const [appTab,   setAppTab]   = useState(tableFromQR ? "menu" : "matches");
  const [qrTable,  setQrTable]  = useState(tableFromQR);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [newOrderAlert, setNewOrderAlert] = useState(false);
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
  const [sponsorGifts, setSponsorGifts] = useState([]);
  const [showWinner,   setShowWinner]   = useState(false);
  const [winnerData,   setWinnerData]   = useState(null);
  const [appSettings, setAppSettings] = useState(() => {
    try {
      const s = localStorage.getItem("em_app_settings");
      const def = { showMatches:true, showLeaderboard:true, showMundogram:true, showMenu:true, noEventMode:false };
      return s ? { ...def, ...JSON.parse(s) } : def;
    } catch { return { showMatches:true, showLeaderboard:true, showMundogram:true, showMenu:true, noEventMode:false }; }
  });
  const saveAppSettings = (updates) => {
    const n = { ...appSettings, ...updates };
    setAppSettings(n);
    localStorage.setItem("em_app_settings", JSON.stringify(n));
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
          if (credRow) setMyCredits(credRow.balance || 0);
          const { data: sgRows } = await supabase.from("sponsor_gifts").select("*").order("tier");
          if (sgRows) setSponsorGifts(sgRows);
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
            setNewOrderAlert(true);
            toast$(`🔔 New order — Table ${payload.new.table_number}`, true);
            setAllOrders(o => o.find(x => x.id === payload.new.id) ? o : [payload.new, ...o]);
          }
        }).subscribe();
    }

    // ── 9. LIGHTWEIGHT FALLBACK POLL every 60s ───────────────────────────────
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
      if (adminOrderSub) supabase.removeChannel(adminOrderSub);
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

  const playKitchenAlert = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[1047, 0], [1047, 0.22], [1047, 0.44]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = "sine";
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + delay + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.8);
        osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.85);
      });
    } catch(e) {}
  };

  const playFoodReadyBell = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[523.25, 0, 0.35], [1046.5, 0, 0.18], [1568.75, 0, 0.1]].forEach(([freq, delay, vol]) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = "sine";
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 2.5);
        osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 2.6);
      });
      [[523.25, 0.9, 0.35], [1046.5, 0.9, 0.18]].forEach(([freq, delay, vol]) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = "sine";
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 2.5);
        osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 2.6);
      });
    } catch(e) {}
  };

  const toast$ = (msg, ok = true) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, ok });
    toastTimerRef.current = setTimeout(() => { setToast(null); toastTimerRef.current = null; }, 3200);
  };

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
    // Auto-assign next player number
    const { count } = await supabase.from("profiles").select("*", { count:"exact", head:true });
    const playerNumber = (count || 0) + 1;
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
    const seen = localStorage.getItem(ONBOARDING_KEY);
    if (!seen) setShowOnboarding(true);
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
      const { data: tsData } = await supabase.rpc("get_server_time");
      const serverNow = tsData ? new Date(tsData).getTime() : Date.now();
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
    } finally {
      predSavingRef.current.delete(id);
    }
  };

  const adminUpdateMatch = async (updated) => {
    const { error } = await supabase.from("matches").upsert({
      id: updated.id, home: updated.home, away: updated.away,
      match_group: updated.group, match_date: updated.date,
      match_time: updated.time, status: updated.status,
      home_score: updated.hs, away_score: updated.as
    });
    if (error) { toast$("Error saving match: " + error.message, false); return; }
    setMatches(m => m.map(x => x.id === updated.id ? updated : x));
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
    toast$("Match added ✓");
  };
  const adminDeleteMatch = async (id) => {
    const { error } = await supabase.from("matches").delete().eq("id", id);
    if (error) { toast$("Error removing match: " + error.message, false); return; }
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

  const isAdmin = user?.is_admin === true || user?.is_admin === 1 || user?.is_admin === "true"
    || user?.badge === "developer" || user?.badge === "owner";

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

  const adminSetKitchenAccess = async (userId, grant) => {
    const { error } = await supabase.from("profiles").update({ kitchen_access: grant }).eq("id", userId);
    if (error) { toast$("DB error — run migration first: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kitchen_access BOOLEAN DEFAULT FALSE", false); return; }
    setUsers(u => ({ ...u, [userId]: { ...u[userId], kitchen_access: grant } }));
    toast$(grant ? "Kitchen access granted ✓" : "Kitchen access removed ✓");
  };

  const adminSetFloorplanAccess = async (userId, grant) => {
    const { error } = await supabase.from("profiles").update({ floorplan_access: grant }).eq("id", userId);
    if (error) { toast$("DB error — run: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS floorplan_access BOOLEAN DEFAULT FALSE", false); return; }
    setUsers(u => ({ ...u, [userId]: { ...u[userId], floorplan_access: grant } }));
    toast$(grant ? "Floor plan access granted ✓" : "Floor plan access removed ✓");
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
    // Update users state so Credits tab reflects new balance immediately
    setUsers(u => u[userId] ? { ...u, [userId]: { ...u[userId], credits: newBal } } : u);
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
      </div></body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); win.close(); }, 400);
    } else {
      toast$("Credits added ✓ — allow popups to print receipt", true);
    }
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

  const loadAllOrders = async () => {
    const { data } = await supabase.from("orders").select("*")
      .neq("payment_method", "card_pending") // exclude ghost orders from cancelled Stripe sessions
      .order("created_at", { ascending: false });
    if (data) setAllOrders(data);
  };

  // ── Order receipt printer ─────────────────────────────────────────────────
  const printOrderReceipt = (ord, customerName) => {
    const win = window.open("", "_blank", "width=360,height=600");
    if (!win) { toast$("Allow popups to print receipt", false); return; }
    const now = new Date(ord.created_at);
    const timeStr = now.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    const dateStr = now.toLocaleDateString("en-US",{weekday:"short",month:"long",day:"numeric",year:"numeric"});
    const itemRows = (ord.items || []).map(it =>
      `<div class="row"><span>${it.qty}x ${it.name.toUpperCase()}</span><span>$${(it.price*it.qty).toFixed(2)}</span></div>`
    ).join("");
    const payLabel = ord.payment_method === "credits" ? "CREDITS" : ord.payment_method === "card" ? "CARD" : ord.payment_method === "sponsor_gift" ? "COMPLIMENTARY" : "CASH";
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt</title>
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
    const { data: hostProfile } = await supabase.from("profiles").select("name").eq("id", order.host_user_id).maybeSingle();
    const { error: orderError } = await supabase.from("orders").insert({
      user_id: order.host_user_id,
      user_name: hostProfile?.name || "Group Order",
      table_number: String(order.table_number),
      items: items.map(i => ({ id: i.item_id, name: i.item_name, price: i.price, qty: i.qty, category: i.category||"" })),
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
      {showOnboarding && <OnboardingTutorial onDone={() => { localStorage.setItem(ONBOARDING_KEY, "1"); setShowOnboarding(false); }} />}
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
          menuItems={menuItems} myCredits={myCredits} myOrders={myOrders}
          placeOrder={placeOrder}
          saveMenuItem={saveMenuItem} deleteMenuItem={deleteMenuItem}
          toggleMenuItemAvail={toggleMenuItemAvail}
          toggleMenuItemSoldOut={toggleMenuItemSoldOut}
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
          sponsorGifts={sponsorGifts}
          adminSetSponsorTier={adminSetSponsorTier}
          adminSaveSponsorGifts={adminSaveSponsorGifts}
          adminBanUsers={adminBanUsers}
          adminSetKitchenAccess={adminSetKitchenAccess}
          adminSetFloorplanAccess={adminSetFloorplanAccess}
          appSettings={appSettings}
          onSaveAppSettings={saveAppSettings}
          newOrderAlert={newOrderAlert} setNewOrderAlert={setNewOrderAlert}
          showWinner={showWinner} setShowWinner={setShowWinner}
          winnerData={winnerData} setWinnerData={setWinnerData}
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
      <div className="tv-footer" style={{position:"relative",zIndex:2}}>⚽ Exact score = 5 pts · Correct winner = 1 pt · Most points wins</div>
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
                saveMenuItem, deleteMenuItem, toggleMenuItemAvail, toggleMenuItemSoldOut,
                adminAddCredits, updateOrderStatus, deleteOrder, loadAllOrders, allOrders, matchesLoaded,
                activeGroup, groupMembers, groupItems,
                createGroupOrder, joinGroupOrder, leaveGroupOrder,
                addGroupItem, removeGroupItem,
                setGroupPaymentMode, assignMyPaymentTo, unassignMyPayment,
                payGroupShareCredits, hostPayAllCredits,
                calcMyGroupShare,
                resetGroupToLobby, printOrderReceipt, stripeCheckout, onToast,
                sponsorGifts, adminSetSponsorTier, adminSaveSponsorGifts, adminBanUsers = () => {}, adminSetKitchenAccess = () => {}, adminSetFloorplanAccess = () => {},
                appSettings = { showMatches:true, showLeaderboard:true, showMundogram:true, showMenu:true, noEventMode:false }, onSaveAppSettings = () => {},
                newOrderAlert = false, setNewOrderAlert,
                showWinner = false, setShowWinner, winnerData, setWinnerData,
                qrTable = "" }) {
  const { t, lang, toggleLang } = useLang();
  const myPts  = pts(user.id);
  const myRank = board.findIndex(u => u.id === user.id) + 1;
  const [animKey, setAnimKey] = useState(appTab);

  const switchTab = (id) => { setAnimKey(id); setAppTab(id); if (id === "admin" && setNewOrderAlert) setNewOrderAlert(false); };

  const tabs = [
    ...(!appSettings.noEventMode && appSettings.showMatches  !== false ? [{ id:"matches",     label:t('matches'),     ico:<SoccerIco /> }] : []),
    ...(!appSettings.noEventMode && appSettings.showLeaderboard !== false ? [{ id:"leaderboard", label:t('leaderboard'), ico:<TrophyIco /> }] : []),
    ...(appSettings.showMundogram !== false ? [{ id:"moments", label:"MUNDOGRAM", ico:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg> }] : []),
    ...(appSettings.showMenu !== false ? [{ id:"menu", label:t('menu'), ico:<MenuIco /> }] : []),
    { id:"profile", label:t('profile'), ico:<PersonIco /> },
    ...(user?.sponsor_tier ? [{ id:"vip", label:"PERKS", ico:<span style={{fontSize:16}}>⭐</span> }] : []),
    ...(user?.kitchen_access ? [{ id:"kitchen", label:"KITCHEN", ico:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6z"/><line x1="6" y1="17" x2="18" y2="17"/></svg> }] : []),
    ...(user?.floorplan_access ? [{ id:"floorplan", label:"FLOOR", ico:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> }] : []),
    ...(isAdmin ? [{ id:"admin", label:t('admin'), ico:<AdminIco /> }] : []),
  ];

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
          {appTab === "matches"     && <MatchesView matches={matches} getPred={getPred} savePred={savePred} loaded={matchesLoaded} isBanned={!!user?.is_banned} allPreds={preds} user={user} />}
          {appTab === "moments"     && <MomentsView user={user} isAdmin={isAdmin} users={users} />}
          {appTab === "leaderboard" && <LeaderView board={board} user={user} allUsers={Object.values(users)} matches={matches} />}
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
            qrTable={qrTable}
          />}
          {appTab === "rules"       && <RulesView   rules={rules} />}
          {appTab === "profile"     && <ProfileView user={user} myPts={myPts} myRank={myRank} preds={preds} matches={matches} sponsors={sponsors} onAvatarUpdate={(url) => setUser(u => ({...u, avatar_url: url}))} />}
          {appTab === "vip" && user?.sponsor_tier && (
            <SponsorView user={user} sponsorGifts={sponsorGifts} placeOrder={placeOrder} onToast={onToast} />
          )}
          {appTab === "kitchen" && user?.kitchen_access && <KitchenView user={user} />}
          {appTab === "floorplan" && user?.floorplan_access && (
            <FloorPlan allOrders={allOrders} onLoad={loadAllOrders} onUpdateStatus={updateOrderStatus} onDeleteOrder={deleteOrder} />
          )}
          {appTab === "admin" && isAdmin && (
            <AdminView
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
              onSetKitchenAccess={adminSetKitchenAccess}
              onSetFloorplanAccess={adminSetFloorplanAccess}
              appSettings={appSettings}
              onSaveAppSettings={onSaveAppSettings}
              onAnnounceWinner={() => { setWinnerData(board[0]||null); setShowWinner(true); }}
              board={board}
            />
          )}
          {showWinner && (
            <TournamentWinnerScreen
              board={board}
              isAdmin={isAdmin}
              onClose={() => setShowWinner(false)}
            />
          )}
        </div>
      </main>
      <nav className="bot-nav">
        <div className="bot-nav-inner">
          {tabs.map(({ id, label, ico }) => (
            <button key={id} className={`bnav-btn ${appTab===id?"bnav-on":""}`} onClick={()=>switchTab(id)}>
              <span className="bnav-ico" style={{position:"relative"}}>
                {ico}
                {id==="admin" && newOrderAlert && (
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

function MatchesView({ matches, getPred, savePred, loaded, isBanned, allPreds, user }) {
  const upcoming = sortMatches(matches.filter(m => m.status === "upcoming"));
  const finished = sortMatches(matches.filter(m => m.status === "finished"));

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
      {/* Date filter */}
      {allDates.length > 1 && (
        <div className="date-filter-bar">
          <button className={`date-chip ${selDate==="all"?"date-chip-on":""}`} onClick={()=>setSelDate("all")}>ALL DATES</button>
          {allDates.map(d => (
            <button key={d} className={`date-chip ${selDate===d?"date-chip-on":""}`} onClick={()=>setSelDate(d)}>{d}</button>
          ))}
        </div>
      )}

      {/* ── Premium global countdown ── */}
      {globalLockMs && <PredictionCountdown lockMs={globalLockMs} firstMatch={firstMatch} />}

      {/* Prediction ban notice */}
      {isBanned && (
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

      <div className="section-banner">
        <span className="section-banner-title">UPCOMING</span>
        <span className="section-banner-sub">Exact score = 5 pts · Correct winner = 1 pt</span>
      </div>

      <div className="card-stack">
        {visUpcoming.length === 0 && <div className="empty">No upcoming matches{selDate!=="all"?` on ${selDate}`:""}</div>}
        {visUpcoming.map(m => <MatchCard key={m.id} m={m} pred={getPred(m.id)} onSave={savePred} globalLockTime={globalLockMs} isBanned={isBanned} allPreds={allPreds} user={user} />)}
      </div>
      <div className="section-banner section-banner-dim">
        <span className="section-banner-title">RESULTS</span>
        <span className="section-banner-sub">Final scores & your predictions</span>
      </div>
      <div className="card-stack">
        {visFinished.length === 0 && <div className="empty">No results{selDate!=="all"?` on ${selDate}`:""}</div>}
        {visFinished.map(m => <MatchCard key={m.id} m={m} pred={getPred(m.id)} onSave={savePred} globalLockTime={globalLockMs} allPreds={allPreds} user={user} />)}
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

  // Show Community Pulse only within 1 hour of kickoff (or after)
  const matchKickoffTs = (() => {
    if (!m.date || !m.time) return null;
    try {
      const [mon, day] = m.date.split(" ");
      const [hh, mm] = (m.time||"00:00").split(":");
      return new Date(`${mon} ${day} 2026 ${hh}:${mm}:00 GMT-0400`).getTime();
    } catch { return null; }
  })();
  const showWPW = !!allPreds && !fin && (matchKickoffTs !== null && nowTs >= matchKickoffTs - 60 * 60 * 1000);

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
      {showWPW && (() => {
        const mp = Object.entries(allPreds).filter(([k]) => k.endsWith(`__${m.id}`)).map(([,v]) => v);
        if (!mp.length) return null;
        const hw = mp.filter(p => p.h > p.a).length;
        const dr = mp.filter(p => p.h === p.a).length;
        const aw = mp.filter(p => p.h < p.a).length;
        const tot = mp.length;
        const hp = Math.round(hw/tot*100), dp = Math.round(dr/tot*100), ap = 100-hp-dp;
        return (
          <div className="wpw-wrap">
            <div className="wpw-title">COMMUNITY PULSE · {tot} player{tot!==1?"s":""}</div>
            <div className="wpw-bars">
              <div className="wpw-bar-col">
                <div className="wpw-bar-track"><div className="wpw-bar-fill wpw-home" style={{width:`${hp}%`}}/></div>
                <div className="wpw-bar-lbl">{flag(m.home)} {hp}%</div>
              </div>
              <div className="wpw-bar-col wpw-draw-col">
                <div className="wpw-bar-track"><div className="wpw-bar-fill wpw-draw" style={{width:`${dp}%`}}/></div>
                <div className="wpw-bar-lbl">DRAW {dp}%</div>
              </div>
              <div className="wpw-bar-col">
                <div className="wpw-bar-track"><div className="wpw-bar-fill wpw-away" style={{width:`${ap}%`}}/></div>
                <div className="wpw-bar-lbl">{flag(m.away)} {ap}%</div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ═══ MOMENTS ═══════════════════════════════════════════════════════════════ */
function MomentsView({ user, isAdmin, users = {} }) {
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
      notifList.push({ id:`l_${l.moment_id}_${l.user_id}`, type:"like", name:likerName, text:"liked your post", momentId:l.moment_id, time:null, img:likedImg });
    });
    notifList.sort((a,b) => b.time > a.time ? 1 : -1);
    setNotifs(notifList);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("rt-moments")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"moments" }, () => load())
      .on("postgres_changes", { event:"DELETE", schema:"public", table:"moments" }, () => load())
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"moment_likes" }, p => {
        const { moment_id, user_id } = p.new;
        if (moment_id && user_id) {
          setLikes(l => { const n={...l}; const s=new Set(n[moment_id]||[]); s.add(user_id); n[moment_id]=s; return n; });
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
      })
      .on("postgres_changes", { event:"DELETE", schema:"public", table:"moment_comments" }, p => {
        const c = p.old;
        setComments(prev => { const n={...prev}; n[c.moment_id]=(n[c.moment_id]||[]).filter(x=>x.id!==c.id); return n; });
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const toggleLike = async (momentId) => {
    const liked = (likes[momentId]||new Set()).has(user.id);
    if (liked) {
      await supabase.from("moment_likes").delete().eq("moment_id", momentId).eq("user_id", user.id);
    } else {
      await supabase.from("moment_likes").insert({ moment_id: momentId, user_id: user.id, user_name: user.name });
      // Burst animation
      const particles = Array.from({length:7},(_,i)=>({ id:Date.now()+i, dx:(Math.random()-0.5)*80, dy:-(30+Math.random()*60) }));
      setLikeAnims(a=>({...a,[momentId]:[...(a[momentId]||[]),...particles]}));
      setTimeout(()=>setLikeAnims(a=>({...a,[momentId]:(a[momentId]||[]).filter(p=>!particles.find(x=>x.id===p.id))})),900);
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
                  {[{l:"POINTS",v:searchSel.pts??0},{l:"CORRECT",v:searchSel.correct??0},{l:"ACCURACY",v:searchSel.accuracy!=null?`${searchSel.accuracy}%`:"—"}].map(s=>(
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
            <div className="mom-neon-sub">— WORLD CUP 2026 —</div>
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
        <>
          {/* Stories row — players who have posts */}
          {(() => {
            const storyUsers = [];
            const seen = new Set();
            moments.filter(m=>(m.approved||isAdmin)&&m.image_url&&m.image_url!=="").forEach(m => {
              if (!seen.has(m.posted_by)) {
                seen.add(m.posted_by);
                storyUsers.push(users[m.posted_by] || { id: m.posted_by, name: m.poster_name, avatar_url: m.poster_avatar });
              }
            });
            if (storyUsers.length === 0) return null;
            return (
              <div className="mom-stories-row">
                {/* My story / post button */}
                <div className="mom-story-item" onClick={()=>setShowPost(true)}>
                  <div className="mom-story-av mom-story-add">
                    <Av u={user} size={52} fontSize={20}/>
                    <div className="mom-story-plus">+</div>
                  </div>
                  <div className="mom-story-name">Your Story</div>
                </div>
                {storyUsers.map(u => (
                  <div key={u.id} className="mom-story-item" onClick={()=>{setSearchSel(u);setShowSearch(true);setSearchFromFeed(true);}}>
                    <div className={`mom-story-av ${u.id===user.id?"mom-story-av-me":"mom-story-av-ring"}`}>
                      <Av u={u} size={52} fontSize={20}/>
                    </div>
                    <div className="mom-story-name">{(u.name||"").split(" ")[0]}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {moments.filter(m=>isAdmin||m.approved).length === 0 ? (
            <div className="mom-empty">
              <div style={{fontSize:64,marginBottom:16}}>📸</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:18,letterSpacing:4,color:"rgba(255,255,255,.3)"}}>NO POSTS YET</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,.2)",marginTop:8,letterSpacing:1,lineHeight:1.6}}>Share a moment or your match prediction — be the first!</div>
              <button className="mom-empty-cta" onClick={()=>setShowPost(true)}>+ POST A PHOTO</button>
            </div>
          ) : (
            <div className="mom-feed">
              {moments.filter(mom=>isAdmin||mom.approved).map(mom => {
                const myLike = (likes[mom.id]||new Set()).has(user.id);
                const likeCount = (likes[mom.id]||new Set()).size;
                const momComments = comments[mom.id] || [];
                const showingComments = openComments === mom.id;
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
                        {momComments.map(c=>(
                          <div key={c.id} className="mom-comment">
                            <Av u={{name:c.user_name,avatar_url:c.avatar_url}} size={28} fontSize={12}/>
                            <div className="mom-comment-body">
                              <span className="mom-comment-name">{c.user_name}</span>
                              <span className="mom-comment-text"> {c.body}</span>
                            </div>
                            {(isAdmin||c.user_id===user.id)&&<button className="mom-del-comment" onClick={()=>deleteComment(c.id,mom.id)}>×</button>}
                          </div>
                        ))}
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
          )}
        </>
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
function TournamentWinnerScreen({ board, isAdmin, onClose }) {
  const winner = board[0];
  const second = board[1];
  const third  = board[2];
  const confetti = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    color: ["#c9a84c","#fff","#4ade80","#f87171","#60a5fa","#fbbf24"][i % 6],
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
      <div className="winner-event">EL MUNDO WORLD CUP 2026</div>

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
      const MAX = 400;
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

function LeaderView({ board, user, allUsers = [], matches = [] }) {
  const filtered = board.filter(u => u.is_admin !== true && u.is_admin !== 1 && u.is_admin !== "true");
  const top3 = filtered.slice(0, 3);
  const rest = filtered.slice(3);
  const myRank = filtered.findIndex(u => u.id === user.id) + 1;
  const myEntry = filtered.find(u => u.id === user.id);

  return (
    <div className="lb-root">
      {true && <>
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
      </>}
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

/* ═══ PROFILE ═══════════════════════════════════════════════════════════════ */
function ProfileView({ user, myPts, myRank, preds, matches, sponsors, onAvatarUpdate }) {
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
      const GOLD = '#f0c040'; const GOLD2 = '#c9a84c';
      const rr = (x,y,w,h,r) => { ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath(); };

      // ── Background ──
      ctx.fillStyle = '#050505'; ctx.fillRect(0,0,W,H);
      // Center radial glow
      const bgGrd = ctx.createRadialGradient(W/2,H*0.42,0,W/2,H*0.42,W*0.6);
      bgGrd.addColorStop(0,'rgba(240,192,64,0.07)'); bgGrd.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = bgGrd; ctx.fillRect(0,0,W,H);
      // Dot grid
      ctx.fillStyle = 'rgba(255,255,255,0.022)';
      for(let x=30;x<W;x+=50) for(let y=30;y<H;y+=50){ ctx.beginPath(); ctx.arc(x,y,1.8,0,Math.PI*2); ctx.fill(); }

      // ── Gold accent lines helper ──
      const goldLine = (y2) => {
        const g = ctx.createLinearGradient(60,0,W-60,0);
        g.addColorStop(0,'rgba(201,168,76,0)'); g.addColorStop(0.25,GOLD2); g.addColorStop(0.75,GOLD2); g.addColorStop(1,'rgba(201,168,76,0)');
        ctx.fillStyle = g; ctx.fillRect(60, y2, W-120, 1.5);
      };

      // ── Header ──
      goldLine(90);
      ctx.textAlign='center'; ctx.fillStyle=GOLD; ctx.font='36px Anton';
      ctx.fillText('EL MUNDO BAR-REST', W/2, 75);
      goldLine(98);

      // ── Avatar ──
      const AX = W/2, AY = 350, AR = 150;
      // Outer glow ring
      const ringGrd = ctx.createLinearGradient(AX-AR,AY-AR,AX+AR,AY+AR);
      ringGrd.addColorStop(0,GOLD); ringGrd.addColorStop(0.5,'#fff8d0'); ringGrd.addColorStop(1,GOLD2);
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
        ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = 'rgba(240,192,64,0.1)'; ctx.fill();
        ctx.fillStyle = GOLD; ctx.fillText(chip, W/2, chipY+chipH-9);
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
      ctx.fillText('WORLD CUP 2026', W/2, 910);
      ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='26px Anton';
      ctx.fillText('PREDICTION GAME  ·  EL MUNDO BONAIRE', W/2, 950);
      // URL with gold
      ctx.fillStyle=GOLD; ctx.font='28px Anton';
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

      <div className="info-card">
        <div className="info-title">⚽ HOW POINTS WORK</div>
        <p className="info-body">Predict the exact final score for each match. Exact score correct earns <strong>5 points</strong>. Correct winner with wrong score earns <strong>1 point</strong>. Draw matches: only exact score earns points. Most points at tournament end wins.</p>
      </div>

      {/* ── SPONSORS SECTION ── */}
      <SponsorsSection />
    </div>
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

  const totalUsers = Object.keys(users).length;
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
        <DCard icon="🏆" label="TOP PLAYER" value={topPlayer ? topPlayer.name.split(" ")[0] : "—"} sub={topPlayer ? `${topPlayer.pts} pts · Rank #1` : "No predictions yet"} accent="rgba(201,168,76,.25)" />
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
function AdminView({ matches, rules, sponsors, onUpdate, onAdd, onDelete, onSaveRules, onSaveSponsors, menuItems, users, onSaveMenuItem, onDeleteMenuItem, onToggleAvail, onToggleSoldOut, onAddCredits, onUpdateOrderStatus, onDeleteOrder, onLoadAllOrders, allOrders, sponsorGifts, onSetSponsorTier, onSaveSponsorGifts, onBanUsers, onAnnounceWinner, board, onSetKitchenAccess, onSetFloorplanAccess = ()=>{}, appSettings = {}, onSaveAppSettings = ()=>{} }) {
  const [section, setSection] = useState("dashboard");

  const GROUPS = [
    {
      id: "live",
      label: "LIVE OPS",
      ico: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
      tabs: [
        { id:"dashboard", label:"Dashboard" },
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
        { id:"kitchen",     label:"Kitchen"     },
        { id:"fpAccess",    label:"Floor Plan"  },
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
            background:"rgba(201,168,76,.12)",border:"1px solid rgba(201,168,76,.35)",
            fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,
            color:"#c9a84c",cursor:"pointer",whiteSpace:"nowrap",
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

      {section === "matches"    && <AdminMatches  matches={matches}   onUpdate={onUpdate} onAdd={onAdd} onDelete={onDelete} />}
      {section === "rules"      && <AdminRules    rules={rules}       onSave={onSaveRules} />}
      {section === "sponsors"   && <AdminSponsors sponsors={sponsors} onSave={onSaveSponsors} />}
      {section === "menu"       && <AdminMenu     menuItems={menuItems} onSave={onSaveMenuItem} onDelete={onDeleteMenuItem} onToggleAvail={onToggleAvail} onToggleSoldOut={onToggleSoldOut} />}
      {section === "credits"    && <AdminCredits  users={users} onAddCredits={onAddCredits} />}
      {section === "tables"     && <AdminTables />}
      {section === "tableqr"    && <AdminTableQR />}
      {section === "vip"        && <AdminSponsorPerks users={users} sponsorGifts={sponsorGifts} onSetTier={onSetSponsorTier} onSaveGifts={onSaveSponsorGifts} />}
      {section === "integrity"  && <AdminIntegrity users={users} onBanUsers={onBanUsers} />}
      {section === "kitchen"    && <AdminKitchenAccess users={users} onSetAccess={onSetKitchenAccess} />}
      {section === "fpAccess"    && <AdminFloorplanAccess users={users} onSetAccess={onSetFloorplanAccess} />}
      {section === "appSettings" && <AdminAppSettings appSettings={appSettings} onSave={onSaveAppSettings} />}
    </div>
  );
}

/* ── Admin: App Settings ── */
function AdminAppSettings({ appSettings = {}, onSave }) {
  const s = { showMatches:true, showLeaderboard:true, showMundogram:true, showMenu:true, noEventMode:false, ...appSettings };
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
        <div className="sb-sub">Control which tabs are visible and toggle event mode</div>
      </div>
      <div style={{padding:"0 14px 24px"}}>
        {/* Event Mode */}
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2.5,color:"rgba(255,255,255,.35)",marginBottom:10,paddingBottom:6,borderBottom:"1px solid rgba(255,255,255,.06)"}}>EVENT MODE</div>
          <div style={{padding:"16px",background:s.noEventMode?"rgba(255,255,255,.04)":"rgba(201,168,76,.06)",border:`1px solid ${s.noEventMode?"rgba(255,255,255,.1)":"rgba(201,168,76,.3)"}`,marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,letterSpacing:1,color:s.noEventMode?"rgba(255,255,255,.45)":"#c9a84c"}}>
                  {s.noEventMode ? "EVENT DISABLED" : "⚽ WORLD CUP MODE ACTIVE"}
                </div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:4,fontFamily:"'Outfit',sans-serif"}}>
                  {s.noEventMode ? "Matches & leaderboard tabs are hidden. App runs in restaurant-only mode." : "Matches and leaderboard are shown. Disable when the event ends."}
                </div>
              </div>
              <div onClick={()=>onSave({noEventMode:!s.noEventMode})} style={{width:44,height:24,borderRadius:12,background:s.noEventMode?"rgba(255,255,255,.12)":"#c9a84c",border:`1px solid ${s.noEventMode?"rgba(255,255,255,.2)":"#c9a84c"}`,cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0,marginLeft:16}}>
                <div style={{position:"absolute",top:3,left:s.noEventMode?3:22,width:16,height:16,borderRadius:"50%",background:s.noEventMode?"rgba(255,255,255,.5)":"#000",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}}/>
              </div>
            </div>
          </div>
        </div>
        {/* Individual Tab Visibility */}
        {!s.noEventMode && (
          <div style={{marginBottom:20}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2.5,color:"rgba(255,255,255,.35)",marginBottom:10,paddingBottom:6,borderBottom:"1px solid rgba(255,255,255,.06)"}}>TAB VISIBILITY</div>
            <Toggle label="MATCHES" desc="World Cup match predictions tab" val={s.showMatches} onToggle={()=>onSave({showMatches:!s.showMatches})} />
            <Toggle label="LEADERBOARD" desc="Player rankings and points tab" val={s.showLeaderboard} onToggle={()=>onSave({showLeaderboard:!s.showLeaderboard})} />
          </div>
        )}
        <div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2.5,color:"rgba(255,255,255,.35)",marginBottom:10,paddingBottom:6,borderBottom:"1px solid rgba(255,255,255,.06)"}}>RESTAURANT TABS</div>
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

/* ── Admin: Kitchen Access Management ── */
function AdminKitchenAccess({ users, onSetAccess }) {
  const [search, setSearch] = useState("");
  const userList = Object.values(users).filter(u => !u.is_admin);
  const filtered = search.trim()
    ? userList.filter(u => (u.name||"").toLowerCase().includes(search.toLowerCase()))
    : userList;

  return (
    <div className="vpad">
      <div className="section-banner">
        <div className="sb-label">KITCHEN ACCESS</div>
        <div className="sb-sub">Grant staff access to the Kitchen Display System</div>
      </div>
      <div style={{padding:"0 14px 12px"}}>
        <input
          className="afield-inp"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{width:"100%",marginBottom:12}}
        />
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(u => (
            <div key={u.id} style={{
              display:"flex",alignItems:"center",gap:12,
              padding:"12px 14px",
              background:"rgba(255,255,255,.03)",
              border:`1px solid ${u.kitchen_access ? "rgba(74,222,128,.2)" : "rgba(255,255,255,.07)"}`,
            }}>
              {u.avatar_url ? (
                <img src={u.avatar_url} style={{width:36,height:36,borderRadius:"50%",objectFit:"cover",flexShrink:0}} />
              ) : (
                <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,.08)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Anton',sans-serif",fontSize:14,flexShrink:0}}>
                  {(u.name||"?")[0].toUpperCase()}
                </div>
              )}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.35)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                {u.kitchen_access && (
                  <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,color:"#4ade80",padding:"3px 8px",background:"rgba(74,222,128,.1)",border:"1px solid rgba(74,222,128,.3)"}}>
                    KITCHEN ✓
                  </span>
                )}
                <button
                  onClick={() => onSetAccess(u.id, !u.kitchen_access)}
                  style={{
                    fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:1.5,
                    padding:"7px 14px",border:"1px solid",cursor:"pointer",
                    background: u.kitchen_access ? "rgba(239,68,68,.1)" : "rgba(74,222,128,.1)",
                    borderColor: u.kitchen_access ? "rgba(239,68,68,.4)" : "rgba(74,222,128,.4)",
                    color: u.kitchen_access ? "#f87171" : "#4ade80",
                    whiteSpace:"nowrap",
                  }}
                >
                  {u.kitchen_access ? "REVOKE" : "GRANT"}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{textAlign:"center",padding:"32px 0",color:"rgba(255,255,255,.25)",fontSize:13,fontFamily:"'Outfit',sans-serif"}}>
              No players found
            </div>
          )}
        </div>
      </div>
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
                      <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1,color:m?.color||"#aaa",background:`rgba(201,168,76,.1)`,border:`1px solid rgba(201,168,76,.2)`,padding:"2px 8px",borderRadius:4}}>
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
          const ctx = canvas.getContext("2d");
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
  const [showQRScan, setShowQRScan] = useState(false);
  const [goMenuOpen, setGoMenuOpen] = useState(false);
  const [goMenuSection, setGoMenuSection] = useState("DRINKS");
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
  resetGroupToLobby, printOrderReceipt, stripeCheckout, onToast, qrTable = "" }) {
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

  const addToCart      = id => setCart(c => ({ ...c, [id]: (c[id]||0)+1 }));
  const removeFromCart = id => setCart(c => { const n={...c}; if(n[id]>1) n[id]--; else delete n[id]; return n; });
  const clearCart      = () => { setCart({}); setCartNotes({}); setNoteOpen({}); };

  const cartItems = Object.entries(cart).map(([id, qty]) => {
    const item = menuItems.find(i => i.id === id);
    return { ...item, qty };
  }).filter(i => i.name);

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
    setPendingPayMethod(payMethod);
    setShowOrderTypeModal(true);
  };

  const handleOrderTypeChoice = (type) => {
    setShowOrderTypeModal(false);
    if (type === "group") { setTab("group"); return; }
    if (pendingPayMethod === "credits") handleOrder();
    else handleStripeOrder();
  };

  const handleOrder = async () => {
    if (!table.trim()) { setTableErr("Please select your table"); return; }
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
        items: cartItems.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty, category:i.category||"", ...(cartNotes[i.id]?{note:cartNotes[i.id]}:{}) })),
        total: +cartTotal.toFixed(2),
        paymentMethod: "credits",
      });
      if (ok) { clearCart(); setTab("orders"); }
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  const handleStripeOrder = async () => {
    if (!table.trim()) { setTableErr("Please select your table"); return; }
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
      const { data: ord, error } = await supabase.from("orders").insert({
        user_id: user.id,
        user_name: user.name,
        table_number: String(tableNum),
        items: cartItems.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty, category:i.category||"", ...(cartNotes[i.id]?{note:cartNotes[i.id]}:{}) })),
        total: +cartTotal.toFixed(2),
        payment_method: "card_pending",
        status: "pending",
      }).select().single();
      if (error || !ord) { onToast("Error creating order", false); return; }
      newOrder = ord;
    } catch(e) {
      onToast("Error creating order", false); return;
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
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
        <div style={{paddingBottom: cartCount > 0 ? 140 : 20}}>

          {/* ── Section toggle: DRINKS / FOOD ── */}
          <div className="menu-section-toggle">
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
                          {!item.sold_out && (cart[item.id] ? (
                            <div className="menu-qty-ctrl">
                              <button className="menu-qty-btn" onClick={()=>removeFromCart(item.id)}>−</button>
                              <span className="menu-qty-val">{cart[item.id]}</span>
                              <button className="menu-qty-btn" onClick={()=>addToCart(item.id)}>+</button>
                            </div>
                          ) : (
                            <button className="menu-add-btn" onClick={()=>addToCart(item.id)}>{t('addToCart')}</button>
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
              <div className="cart-total-row">
                <span className="cart-total-label">{t('total')}</span>
                <span className="cart-total-val">${cartTotal.toFixed(2)}</span>
              </div>
              <div style={{padding:"0 16px"}}>
                {showQRScan && <QRTableScanner onScan={t=>{setTable(t);setTableErr("");}} onClose={()=>setShowQRScan(false)} />}
                <div className="afield" style={{marginBottom:14}}>
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
          qrTable={qrTable}
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
    { id:"Soft Drinks",   icon:"🥤", label:"Soft Drinks"    },
    { id:"Waters",        icon:"💧", label:"Waters"         },
    { id:"Juices",        icon:"🍊", label:"Juices"         },
    { id:"Smoothies",     icon:"🥝", label:"Smoothies"      },
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
const FOOD_CATS = new Set(MENU_SECTIONS.find(s => s.section === "FOOD")?.cats.map(c => c.id) || []);
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
      <td style="padding:6px 0;font-size:15px;font-weight:700;">${it.qty}x ${it.name.toUpperCase()}</td>
      <td style="padding:6px 0;font-size:15px;font-weight:700;text-align:right;">$${(it.price*it.qty).toFixed(2)}</td>
    </tr>`).join("");
  const payLabel = ord.payment_method === "credits" ? "CREDITS" : ord.payment_method === "card" ? "CARD" : ord.payment_method === "sponsor_gift" ? "COMPLIMENTARY" : "CASH";

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Receipt #${ord.order_number||ord.id}</title>
  <style>
    @page { size: 80mm 800mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; page-break-inside: avoid; break-inside: avoid; }
    html, body { width: 80mm; height: auto; overflow: visible; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Arial Black', 'Arial', sans-serif; color: #000; background: #fff; }
    .wrap { width: 74mm; margin: 0 auto; padding: 4mm 0 8mm; page-break-after: avoid; }
    .logo-block { text-align: center; padding-bottom: 10px; border-bottom: 3px solid #000; margin-bottom: 10px; }
    .brand { font-size: 28px; font-weight: 900; letter-spacing: 5px; line-height: 1; }
    .bar-rest { font-size: 12px; font-weight: 900; letter-spacing: 4px; margin-top: 3px; }
    .event { font-size: 10px; font-weight: 900; letter-spacing: 3px; border: 2px solid #000; display: inline-block; padding: 3px 10px; margin-top: 5px; }
    .loc { font-size: 9px; font-weight: 700; letter-spacing: 2px; margin-top: 4px; color: #222; }
    .meta-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #aaa; }
    .meta-lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #444; }
    .meta-val { font-size: 12px; font-weight: 900; }
    .section-hdr { font-size: 9px; font-weight: 900; letter-spacing: 3px; padding: 7px 0 3px; border-bottom: 2px solid #000; margin-bottom: 2px; }
    .divider { border: none; border-top: 2px solid #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { font-size: 13px; padding: 5px 0; font-weight: 700; }
    .total-row td { font-size: 17px; font-weight: 900; letter-spacing: 1px; padding-top: 8px; border-top: 3px solid #000; }
    .pay-row { display: flex; justify-content: space-between; margin-top: 5px; font-size: 12px; font-weight: 700; }
    .footer { text-align: center; margin-top: 12px; padding-top: 8px; border-top: 3px double #000; }
    .thanks { font-size: 14px; font-weight: 900; letter-spacing: 3px; margin-bottom: 4px; }
    .url { font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #222; }
    .wc { font-size: 10px; font-weight: 900; letter-spacing: 3px; margin-top: 5px; }
  </style></head>
  <body><div class="wrap">

    <div class="logo-block">
      <div class="brand">EL MUNDO</div>
      <div class="bar-rest">BAR &amp; RESTAURANT</div>
      <div class="event">WORLD CUP EVENT 2026</div>
      <div class="loc">KRALENDIJK · BONAIRE · EST. 2009</div>
    </div>

    <div class="meta-row"><span class="meta-lbl">Date</span><span class="meta-val">${dateStr}</span></div>
    <div class="meta-row"><span class="meta-lbl">Time</span><span class="meta-val">${timeStr}</span></div>
    <div class="meta-row"><span class="meta-lbl">Table</span><span class="meta-val">${ord.table_number}</span></div>
    ${ord.order_number ? `<div class="meta-row"><span class="meta-lbl">Order #</span><span class="meta-val">${ord.order_number}</span></div>` : ""}

    <div class="divider"></div>
    <div class="section-hdr">ORDER ITEMS</div>
    <table><tbody>${items}</tbody></table>

    <table><tbody>
      <tr class="total-row">
        <td>TOTAL</td>
        <td style="text-align:right;">$${(+ord.total).toFixed(2)}</td>
      </tr>
    </tbody></table>
    <div class="pay-row"><span>PAYMENT METHOD</span><span>${payLabel}</span></div>

    <div class="footer">
      <div class="thanks">THANK YOU!</div>
      <div class="wc">⚽ WORLD CUP 2026 ⚽</div>
      <div class="url">www.elmundobonaire.com</div>
    </div>

  </div></body></html>`;

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

/* ═══ ADMIN: SETTLEMENT REPORT ══════════════════════════════════════════════ */
function AdminReport({ allOrders }) {
  // LOCAL date helpers — never use toISOString() which gives UTC and causes off-by-one errors
  // (e.g. orders at 10 PM Bonaire = next day UTC)
  const isoLocal = d => {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  };
  const localDate = ts => isoLocal(new Date(ts)); // convert UTC timestamp → local date string

  const todayISO = isoLocal(new Date());
  const [preset,  setPreset ] = useState("today");
  const [finFrom, setFinFrom] = useState(todayISO);
  const [finTo,   setFinTo  ] = useState(todayISO);
  const [topups,  setTopups ] = useState([]);

  // Fetch top-ups from Supabase
  useEffect(() => {
    supabase.from("credit_topups").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setTopups(data); });
  }, []);

  const applyPreset = (p) => {
    const d = new Date();
    setPreset(p);
    if (p === "today")     { setFinFrom(isoLocal(d)); setFinTo(isoLocal(d)); }
    if (p === "yesterday") { const y=new Date(d); y.setDate(y.getDate()-1); setFinFrom(isoLocal(y)); setFinTo(isoLocal(y)); }
    if (p === "week")      { const s=new Date(d); s.setDate(d.getDate()-d.getDay()); setFinFrom(isoLocal(s)); setFinTo(isoLocal(d)); }
    if (p === "month")     { setFinFrom(isoLocal(new Date(d.getFullYear(),d.getMonth(),1))); setFinTo(isoLocal(d)); }
    if (p === "all")       { setFinFrom("2024-01-01"); setFinTo(isoLocal(d)); }
  };

  // Compare using LOCAL date of the timestamp (not raw UTC slice)
  const inRange = (ts) => { if (!ts) return false; const d = localDate(ts); return d >= finFrom && d <= finTo; };

  const filtered = allOrders.filter(o => inRange(o.created_at));
  const filteredTopups = topups.filter(t => inRange(t.created_at));

  const totalRevenue    = filtered.reduce((s,o) => s + (+o.total), 0);
  const orderCount      = filtered.length;

  // By payment method
  const byPay = {};
  filtered.forEach(o => {
    const m = o.payment_method || "unknown";
    if (!byPay[m]) byPay[m] = { total:0, orders:0 };
    byPay[m].total  += (+o.total);
    byPay[m].orders++;
  });
  const creditPay = byPay["credits"] || { total:0, orders:0 };
  const cashPay   = byPay["cash"]    || { total:0, orders:0 };
  const cardPay   = byPay["card"]    || { total:0, orders:0 };

  // Top-ups breakdown
  const topupTotal  = filteredTopups.reduce((s,t) => s + (+t.amount), 0);
  const topupByMethod = {};
  filteredTopups.forEach(t => {
    const m = t.method || "cash";
    if (!topupByMethod[m]) topupByMethod[m] = { total:0, count:0 };
    topupByMethod[m].total += (+t.amount);
    topupByMethod[m].count++;
  });

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

  // Build thermal receipt HTML string (no DOM dependency — avoids emoji/CSS issues in print window)
  const buildReceiptHTML = () => {
    const fmtDate = s => new Date(s+"T00:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"});
    const periodLabel = finFrom === finTo ? fmtDate(finFrom) : `${fmtDate(finFrom)} - ${fmtDate(finTo)}`;
    const now = new Date().toLocaleString("en-US",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
    const pad = (left, right, w=32) => {
      const gap = w - left.length - right.length;
      return left + " ".repeat(Math.max(1, gap)) + right;
    };
    const cur = v => `$${(+v).toFixed(2)}`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Settlement - El Mundo</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 14px;
    font-weight: 700;
    background: #fff;
    color: #000;
    width: 72mm;
    margin: 0 auto;
    padding: 6mm 4mm 12mm;
    -webkit-print-color-adjust: exact;
  }
  .center { text-align: center; }
  .dim { color: #333; font-weight: 600; }
  .row { white-space: pre; font-size: 14px; font-weight: 700; line-height: 1.9; }
  .section { margin: 10px 0 5px; font-weight: 900; font-size: 13px; letter-spacing: 1px; text-decoration: underline; }
  .divider { border: none; border-top: 1px dashed #555; margin: 7px 0; }
  .solid { border: none; border-top: 3px solid #000; margin: 7px 0; }
  .total-block { margin: 6px 0; }
  .total-label { font-size: 14px; font-weight: 900; letter-spacing: 1px; }
  .total-amount { font-size: 26px; font-weight: 900; text-align: right; }
  @media print {
    body { width: 100%; margin: 0; padding: 4mm; }
    @page { margin: 4mm; size: 72mm auto; }
  }
</style>
</head><body>
  <div class="center" style="font-size:18px;font-weight:900;letter-spacing:2px;margin-bottom:3px">EL MUNDO BAR-REST</div>
  <hr class="solid" style="margin:7px 0">
  <div class="center" style="font-size:13px;font-weight:900;letter-spacing:1px">SETTLEMENT REPORT</div>
  <div class="center dim" style="font-size:13px;margin-bottom:2px">${periodLabel}</div>
  <div class="center dim" style="font-size:12px">Printed: ${now}</div>
  <hr class="divider">

  <div class="section">REVENUE SUMMARY</div>
  <div class="row">${pad("Total Orders", String(orderCount))}</div>

  <hr class="divider">
  <div class="section">PAYMENT METHODS</div>
  <div class="row">${pad("Credits", `${creditPay.orders}x  ${cur(creditPay.total)}`)}</div>
  <div class="row">${pad("Cash", `${cashPay.orders}x  ${cur(cashPay.total)}`)}</div>
  <div class="row">${pad("Card / Online", `${cardPay.orders}x  ${cur(cardPay.total)}`)}</div>
  ${Object.entries(byPay).filter(([k])=>!["credits","cash","card"].includes(k)).map(([k,v])=>
    `<div class="row">${pad(k.charAt(0).toUpperCase()+k.slice(1), `${v.orders}x  ${cur(v.total)}`)}</div>`
  ).join("")}

  <hr class="divider">
  <div class="section">TOP-UP ACTIVITY</div>
  <div class="row">${pad("Transactions", String(filteredTopups.length))}</div>
  <div class="row">${pad("Total Top-Ups", cur(topupTotal))}</div>

  <hr class="solid">
  <div class="total-block">
    <div class="total-label">TOTAL REVENUE</div>
    <div class="total-amount">${cur(totalRevenue)}</div>
  </div>
  <hr class="solid">

  <div style="height:6px"></div>
  <div class="center dim" style="font-size:12px;letter-spacing:1px">EL MUNDO BAR-REST · BONAIRE</div>
</body></html>`;
  };

  const handlePrint = () => {
    const html = buildReceiptHTML();
    const win = window.open("", "_blank", "width=400,height=700");
    if (!win) { alert("Please allow popups to print."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  };

  const PRESETS = [["today","TODAY"],["yesterday","YESTERDAY"],["week","THIS WEEK"],["month","THIS MONTH"],["all","ALL TIME"]];
  const fmtDate = s => new Date(s+"T00:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"});
  const periodLabel = finFrom === finTo ? fmtDate(finFrom) : `${fmtDate(finFrom)} — ${fmtDate(finTo)}`;

  return (
    <div style={{padding:"12px 14px 40px"}}>
      {/* ── Controls bar ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:3,color:"rgba(255,255,255,.3)"}}>SETTLEMENT REPORT</div>
        <button onClick={handlePrint} style={{display:"flex",alignItems:"center",gap:7,padding:"9px 18px",background:"#fff",color:"#000",border:"none",fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2,cursor:"pointer"}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          PRINT RECEIPT
        </button>
      </div>

      {/* ── Preset buttons ── */}
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

      {/* ── Custom date range ── */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:24,padding:"10px 12px",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",flexWrap:"wrap"}}>
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,255,255,.3)"}}>CUSTOM</span>
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,255,255,.25)"}}>FROM</span>
        <input type="date" value={finFrom} onChange={e=>{setFinFrom(e.target.value);setPreset("custom");}}
          style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",color:"#fff",padding:"6px 8px",fontFamily:"'Outfit',sans-serif",fontSize:12,colorScheme:"dark",cursor:"pointer",flex:1,minWidth:130}} />
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,255,255,.25)"}}>TO</span>
        <input type="date" value={finTo} onChange={e=>{setFinTo(e.target.value);setPreset("custom");}}
          style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",color:"#fff",padding:"6px 8px",fontFamily:"'Outfit',sans-serif",fontSize:12,colorScheme:"dark",cursor:"pointer",flex:1,minWidth:130}} />
      </div>

      {/* ── On-screen preview ── */}
      <div style={{marginBottom:24,paddingBottom:16,borderBottom:"1px solid rgba(255,255,255,.08)"}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:20,color:"#fff",letterSpacing:2}}>EL MUNDO BAR & RESTAURANT</div>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.4)",marginTop:4}}>{periodLabel.toUpperCase()}</div>
      </div>

      {/* ── SECTION 1: Revenue ── */}
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:3,color:"rgba(255,255,255,.3)",marginBottom:12}}>REVENUE SUMMARY</div>
      <div style={{display:"flex",gap:10,marginBottom:24,flexWrap:"wrap"}}>
        {[
          ["TOTAL REVENUE", `$${totalRevenue.toFixed(2)}`, `${orderCount} order${orderCount!==1?"s":""}`],
          ["TOP-UPS", `$${topupTotal.toFixed(2)}`, `${filteredTopups.length} transaction${filteredTopups.length!==1?"s":""}`],
        ].map(([label,val,sub]) => (
          <div key={label} style={{flex:1,minWidth:110,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",padding:"14px 12px"}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,255,255,.4)",fontWeight:700,marginBottom:5}}>{label}</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:24,color:"#fff",lineHeight:1}}>{val}</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.3)",marginTop:4}}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── SECTION 2: Payment Methods ── */}
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:3,color:"rgba(255,255,255,.3)",marginBottom:12}}>PAYMENT BREAKDOWN</div>
      <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",padding:"4px 14px",marginBottom:24}}>
        {[
          ["Credits", creditPay, "#a3e635"],
          ["Cash", cashPay, "#60a5fa"],
          ["Card / Online", cardPay, "#f0c040"],
          ...Object.entries(byPay).filter(([k])=>!["credits","cash","card"].includes(k)).map(([k,v])=>[k,v,"rgba(255,255,255,.5)"]),
        ].map(([label,d,accent]) => (
          <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
            <div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.7)",fontWeight:600}}>{label}</div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.3)",marginTop:1}}>{d.orders} order{d.orders!==1?"s":""}{totalRevenue>0?` · ${Math.round(d.total/totalRevenue*100)}%`:""}</div>
            </div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:18,color:accent}}>${d.total.toFixed(2)}</div>
          </div>
        ))}
      </div>

      {/* ── SECTION 3: Top-ups ── */}
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:3,color:"rgba(255,255,255,.3)",marginBottom:12}}>TOP-UP ACTIVITY</div>
      <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",marginBottom:24}}>
        {filteredTopups.length === 0 ? (
          <div style={{padding:"18px 14px",fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.2)",textAlign:"center"}}>No top-ups in this period</div>
        ) : (
          <>
            <div style={{padding:"12px 14px 10px",borderBottom:"1px solid rgba(255,255,255,.06)",display:"flex",gap:10,flexWrap:"wrap"}}>
              {Object.entries(topupByMethod).map(([m,d])=>(
                <div key={m} style={{flex:1,minWidth:90}}>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,255,255,.4)",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>{m}</div>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:18,color:"#fff"}}>${d.total.toFixed(2)}</div>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.3)",marginTop:2}}>{d.count}x</div>
                </div>
              ))}
              <div style={{flex:1,minWidth:90}}>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,letterSpacing:2,color:"rgba(255,255,255,.4)",fontWeight:700,marginBottom:4}}>TOTAL</div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:18,color:"#f0c040"}}>${topupTotal.toFixed(2)}</div>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.3)",marginTop:2}}>{filteredTopups.length} total</div>
              </div>
            </div>
            <div style={{maxHeight:160,overflowY:"auto"}}>
              {filteredTopups.slice(0,20).map((t,i) => (
                <div key={t.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                  <div>
                    <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.55)",textTransform:"capitalize"}}>{t.method||"cash"}</span>
                    <span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.25)",marginLeft:8}}>
                      {t.created_at ? new Date(t.created_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "—"}
                    </span>
                  </div>
                  <span style={{fontFamily:"'Anton',sans-serif",fontSize:14,color:"#fff"}}>${(+t.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── SECTION 4: Top Tables ── */}
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:3,color:"rgba(255,255,255,.3)",marginBottom:12}}>TOP TABLES</div>
      <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",marginBottom:24}}>
        {topTables.length === 0 ? <div style={{padding:"16px 14px",fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.2)",textAlign:"center"}}>No data</div>
        : topTables.map(([name,d],i)=>(
          <div key={name} style={{display:"flex",alignItems:"center",padding:"9px 14px",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
            <span style={{fontFamily:"'Anton',sans-serif",fontSize:11,color:"rgba(255,255,255,.2)",minWidth:28}}>#{i+1}</span>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"#fff",fontWeight:700}}>{name}</div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.3)",marginTop:1}}>{d.orders} order{d.orders!==1?"s":""}</div>
            </div>
            <span style={{fontFamily:"'Anton',sans-serif",fontSize:14,color:"#fff"}}>${d.total.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <div style={{borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:14,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.25)"}}>
          Generated {new Date().toLocaleString("en-US",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}
        </div>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.2)"}}>El Mundo Bar-Rest · Bonaire</div>
      </div>
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

/* ═══ KITCHEN DISPLAY SYSTEM ════════════════════════════════════════════════ */
function KitchenView({ user }) {
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [markingId, setMarkingId] = useState(null);
  const [now,       setNow]       = useState(Date.now());
  const prevIdsRef = useRef(new Set());

  const fetchOrders = async () => {
    const { data } = await supabase.from("orders")
      .select("*")
      .in("kitchen_status", ["food_pending", "food_ready"])
      .neq("status", "completed")
      .order("created_at", { ascending: true });
    if (data) setOrders(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
    const ch = supabase.channel("kds-" + user.id)
      .on("postgres_changes", { event:"*", schema:"public", table:"orders" }, fetchOrders)
      .subscribe();
    const tick = setInterval(() => setNow(Date.now()), 60000); // live timers update every minute
    return () => { supabase.removeChannel(ch); clearInterval(tick); };
  }, []);

  // Play alert sound when new tickets arrive
  useEffect(() => {
    const pending = orders.filter(o => o.kitchen_status === "food_pending");
    const newOnes = pending.filter(o => !prevIdsRef.current.has(o.id));
    if (newOnes.length > 0) {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        [[1047,0],[1047,0.22],[1047,0.44]].forEach(([freq,delay]) => {
          const osc = ac.createOscillator(); const g = ac.createGain();
          osc.connect(g); g.connect(ac.destination);
          osc.frequency.value = freq; osc.type = "sine";
          g.gain.setValueAtTime(0, ac.currentTime+delay);
          g.gain.linearRampToValueAtTime(0.3, ac.currentTime+delay+0.04);
          g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+delay+0.8);
          osc.start(ac.currentTime+delay); osc.stop(ac.currentTime+delay+0.85);
        });
      } catch(e) {}
    }
    prevIdsRef.current = new Set(pending.map(o => o.id));
  }, [orders]);

  const markReady = async (orderId) => {
    if (markingId) return;
    setMarkingId(orderId);
    await supabase.from("orders").update({ kitchen_status:"food_ready" }).eq("id", orderId);
    setOrders(prev => prev.map(o => o.id===orderId ? {...o, kitchen_status:"food_ready"} : o));
    setMarkingId(null);
  };

  const dismiss = async (orderId) => {
    await supabase.from("orders").update({ kitchen_status:"food_done" }).eq("id", orderId);
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  // Timer helpers — color + label based on elapsed minutes
  const getMins = (createdAt) => Math.floor((now - new Date(createdAt).getTime()) / 60000);
  const timerColor = (mins) => mins < 5 ? "#4ade80" : mins < 10 ? "#fbbf24" : "#f87171";
  const timerLabel = (mins) => mins < 1 ? "<1m" : `${mins}m`;

  const pending = orders.filter(o => o.kitchen_status === "food_pending");
  const ready   = orders.filter(o => o.kitchen_status === "food_ready");

  // Live clock for header
  const clockStr = new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});

  if (loading) return (
    <div className="kds2-root"><div className="kds2-loading">Loading…</div></div>
  );

  return (
    <div className="kds2-root">

      {/* ── TOP BAR ── */}
      <div className="kds2-topbar">
        <div className="kds2-topbar-left">
          <span className="kds2-brand">EL MUNDO</span>
          <span className="kds2-brandbar">BAR-REST</span>
        </div>
        <div className="kds2-topbar-center">
          <span className="kds2-clock">{clockStr}</span>
        </div>
        <div className="kds2-topbar-right">
          {pending.length > 0 && (
            <div className="kds2-counter kds2-counter-fire">
              <span>{pending.length}</span>
              <span>COOKING</span>
            </div>
          )}
          {ready.length > 0 && (
            <div className="kds2-counter kds2-counter-done">
              <span>{ready.length}</span>
              <span>READY</span>
            </div>
          )}
        </div>
      </div>

      {/* ── EMPTY STATE ── */}
      {pending.length === 0 && ready.length === 0 && (
        <div className="kds2-empty">
          <div className="kds2-empty-check">✓</div>
          <div className="kds2-empty-title">ALL CLEAR</div>
          <div className="kds2-empty-sub">No tickets. Standing by for next order.</div>
        </div>
      )}

      {/* ── TWO-LANE LAYOUT ── */}
      {(pending.length > 0 || ready.length > 0) && (
        <div className="kds2-lanes">

          {/* LANE LEFT: COOKING */}
          <div className="kds2-lane">
            <div className="kds2-lane-header kds2-lane-header-fire">
              <span className="kds2-lane-icon">🔥</span>
              <span className="kds2-lane-title">COOKING</span>
              <span className="kds2-lane-count">{pending.length}</span>
            </div>
            <div className="kds2-tickets">
              {pending.length === 0 && (
                <div className="kds2-lane-empty">No active tickets</div>
              )}
              {pending.map(order => {
                const foodItems = (order.items||[]).filter(i => FOOD_CATS.has(i.category));
                const mins = getMins(order.created_at);
                const col  = timerColor(mins);
                const urgent = mins >= 10;
                return (
                  <div key={order.id} className={`kds2-ticket${urgent ? " kds2-ticket-urgent" : ""}`} style={{"--ticket-color": col}}>
                    {/* Ticket top */}
                    <div className="kds2-ticket-head">
                      <div className="kds2-ticket-table">T{order.table_number}</div>
                      <div className="kds2-ticket-timer" style={{color: col, borderColor: col}}>
                        {timerLabel(mins)}
                      </div>
                    </div>
                    {/* Customer */}
                    <div className="kds2-ticket-customer">{order.user_name}</div>
                    {/* Dashed separator */}
                    <div className="kds2-ticket-sep"/>
                    {/* Items — large text for kitchen visibility */}
                    <div className="kds2-ticket-items">
                      {foodItems.map((item, idx) => (
                        <div key={idx} className="kds2-ticket-item">
                          <span className="kds2-item-qty">{item.qty}</span>
                          <div className="kds2-item-right">
                            <span className="kds2-item-name">{item.name.toUpperCase()}</span>
                            {item.note && (
                              <span className="kds2-item-note">📝 {item.note}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Action */}
                    <button
                      className="kds2-btn-ready"
                      onClick={() => markReady(order.id)}
                      disabled={markingId === order.id}
                    >
                      {markingId === order.id ? "…" : "DONE — SEND TO BAR"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* LANE RIGHT: READY */}
          <div className="kds2-lane">
            <div className="kds2-lane-header kds2-lane-header-done">
              <span className="kds2-lane-icon">🔔</span>
              <span className="kds2-lane-title">READY</span>
              <span className="kds2-lane-count">{ready.length}</span>
            </div>
            <div className="kds2-tickets">
              {ready.length === 0 && (
                <div className="kds2-lane-empty">Nothing waiting pickup</div>
              )}
              {ready.map(order => {
                const foodItems = (order.items||[]).filter(i => FOOD_CATS.has(i.category));
                const mins = getMins(order.created_at);
                return (
                  <div key={order.id} className="kds2-ticket kds2-ticket-ready">
                    <div className="kds2-ticket-head">
                      <div className="kds2-ticket-table" style={{color:"#4ade80"}}>T{order.table_number}</div>
                      <div className="kds2-ticket-ready-badge">READY ✓</div>
                    </div>
                    <div className="kds2-ticket-customer">{order.user_name}</div>
                    <div className="kds2-ticket-sep"/>
                    <div className="kds2-ticket-items">
                      {foodItems.map((item, idx) => (
                        <div key={idx} className="kds2-ticket-item kds2-item-done">
                          <span className="kds2-item-qty" style={{opacity:.4}}>{item.qty}</span>
                          <span className="kds2-item-name" style={{opacity:.5,textDecoration:"line-through"}}>{item.name.toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                    <button className="kds2-btn-dismiss" onClick={() => dismiss(order.id)}>
                      ✓ PICKED UP
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

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

  const prevFoodReadyRef = useRef(new Set(allOrders.filter(o=>o.kitchen_status==="food_ready").map(o=>o.id)));
  useEffect(() => {
    const currentReady = new Set(allOrders.filter(o=>o.kitchen_status==="food_ready").map(o=>o.id));
    const prevSet = prevFoodReadyRef.current;
    const newOnes = [...currentReady].filter(id => !prevSet.has(id));
    if (newOnes.length > 0) {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        [[523.25, 0, 0.35], [1046.5, 0, 0.18], [1568.75, 0, 0.1],
         [523.25, 0.9, 0.35], [1046.5, 0.9, 0.18]].forEach(([freq, delay, vol]) => {
          const osc = ac.createOscillator(); const g = ac.createGain();
          osc.connect(g); g.connect(ac.destination);
          osc.frequency.value = freq; osc.type = "sine";
          g.gain.setValueAtTime(0, ac.currentTime + delay);
          g.gain.linearRampToValueAtTime(vol, ac.currentTime + delay + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 2.5);
          osc.start(ac.currentTime + delay); osc.stop(ac.currentTime + delay + 2.6);
        });
      } catch(e) {}
    }
    prevFoodReadyRef.current = currentReady;
  }, [allOrders]);

  const foodReadyOrders = activeOrders.filter(o => o.kitchen_status === "food_ready");
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

  // ── TABLE DETAIL PANEL ────────────────────────────────────────────────────
  // drink_status state machine:  null → "confirmed" → "ready"  (never backwards)
  // kitchen_status state machine: null → "food_pending" → "food_ready" → "food_done" (never backwards)
  // Auto-complete: when drinks="ready" (or no drinks) AND kitchen="food_done" (or no food) → print + complete
  const TableDetail = () => {
    const orders = (byTable[selectedTable]||[]);
    const [busy, setBusy] = useState({});

    const dItems = ord => (ord.items||[]).filter(i => !FOOD_CATS.has(i.category));
    const fItems = ord => (ord.items||[]).filter(i =>  FOOD_CATS.has(i.category));

    // Perform update + reload.
    // Auto-kitchen: if confirming drinks on an order that has food and food hasn't been sent yet → send to kitchen now.
    // Auto-complete: when drinks="ready" AND food="food_done" (or no drinks/food) → print receipt + complete.
    const doUpdate = async (ordId, updates) => {
      setBusy(p => ({...p, [ordId]: true}));
      const ord = orders.find(o => o.id === ordId);
      // If bar is confirming drinks and there's food not yet sent → auto-route food to kitchen
      if (ord && updates.drink_status && fItems(ord).length > 0 && !ord.kitchen_status) {
        updates.kitchen_status = "food_pending";
      }
      await supabase.from("orders").update(updates).eq("id", ordId);
      // Check completion
      const { data: fresh } = await supabase.from("orders").select("*").eq("id", ordId).maybeSingle();
      if (fresh) {
        const dDone = dItems(fresh).length === 0 || fresh.drink_status === "ready";
        const fDone = fItems(fresh).length === 0 || fresh.kitchen_status === "food_done";
        if (dDone && fDone) {
          try { printReceipt({ ...fresh, table_number: selectedTable }); } catch(e) { console.error("printReceipt error", e); }
          await supabase.from("orders").update({ status: "completed" }).eq("id", ordId);
        }
      }
      await onLoad();
      setBusy(p => ({...p, [ordId]: false}));
    };

    return (
      <div className="modal-overlay" onClick={()=>setSelectedTable(null)}>
        <div style={{background:"#111",border:"1px solid rgba(255,255,255,.15)",width:"92%",maxWidth:480,maxHeight:"88vh",display:"flex",flexDirection:"column",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>

          {/* Header */}
          <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,.1)",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,.04)",flexShrink:0}}>
            <div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:28,color:"#fff",letterSpacing:2,lineHeight:1}}>TABLE {selectedTable}</div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.4)",marginTop:4,fontWeight:600}}>{orders.length} order{orders.length!==1?"s":""}</div>
            </div>
            <button onClick={e=>{e.stopPropagation();setSelectedTable(null);}} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"#fff",width:36,height:36,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>

          {/* Orders */}
          <div style={{overflowY:"auto",flex:1,padding:"12px 16px",display:"flex",flexDirection:"column",gap:16}}>
            {orders.length === 0 && (
              <div style={{textAlign:"center",padding:"40px 0",fontFamily:"'Outfit',sans-serif",fontSize:14,color:"rgba(255,255,255,.3)"}}>No active orders</div>
            )}

            {orders.map(ord => {
              const drinks  = dItems(ord);
              const foods   = fItems(ord);
              const hasDrinks = drinks.length > 0;
              const hasFood   = foods.length > 0;
              const ds = ord.drink_status;   // null | "confirmed" | "ready"
              const ks = ord.kitchen_status; // null | "food_pending" | "food_ready" | "food_done"
              const isBusy = !!busy[ord.id];

              // Section item list renderer
              const ItemList = ({ items }) => (
                <div style={{marginBottom:10}}>
                  {items.map((it,i) => (
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontFamily:"'Anton',sans-serif",fontSize:17,color:"rgba(255,255,255,.45)",minWidth:28}}>{it.qty}×</span>
                        <div>
                          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:"#fff",fontWeight:700}}>{it.name}</div>
                          {it.note && <div style={{fontSize:11,color:"rgba(255,255,255,.35)",fontStyle:"italic",marginTop:2}}>📝 {it.note}</div>}
                        </div>
                      </div>
                      <span style={{fontFamily:"'Anton',sans-serif",fontSize:13,color:"rgba(255,255,255,.4)",flexShrink:0}}>${(it.price*it.qty).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              );

              return (
                <div key={ord.id} style={{border:"1px solid rgba(255,255,255,.1)"}}>
                  {/* Order meta bar */}
                  <div style={{padding:"9px 14px",background:"rgba(255,255,255,.03)",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:statusColor(ord.status),boxShadow:`0 0 5px ${statusColor(ord.status)}`}}/>
                      <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:700,color:"rgba(255,255,255,.55)"}}>{ord.user_name}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      {ord.order_number && <span className="order-id-chip">#{ord.order_number}</span>}
                      <span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.3)",fontWeight:600}}>{new Date(ord.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                    </div>
                  </div>

                  <div style={{padding:"0 14px"}}>

                    {/* ── DRINKS SECTION ── */}
                    {hasDrinks && (<>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0 8px",borderBottom:"1px solid rgba(96,165,250,.15)"}}>
                        <span style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2.5,color:"#60a5fa"}}>🍺 DRINKS</span>
                        {ds === "ready" && <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,color:"#4ade80",background:"rgba(74,222,128,.1)",border:"1px solid rgba(74,222,128,.25)",padding:"3px 8px"}}>✓ SERVED</span>}
                        {ds === "confirmed" && <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,color:"#60a5fa",background:"rgba(96,165,250,.1)",border:"1px solid rgba(96,165,250,.25)",padding:"3px 8px"}}>PREPARING</span>}
                      </div>
                      <ItemList items={drinks} />
                      {/* Drinks button */}
                      {ds !== "ready" && (
                        <button disabled={isBusy} onClick={()=>doUpdate(ord.id,{drink_status: ds==="confirmed"?"ready":"confirmed", status:"confirmed"})}
                          style={{width:"100%",padding:"13px",marginBottom:10,border:"none",fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:2,color:"#000",cursor:isBusy?"not-allowed":"pointer",opacity:isBusy?.6:1,transition:"opacity .15s",
                            background: ds==="confirmed" ? "#4ade80" : "#fbbf24",
                          }}>
                          {isBusy ? "…" : ds === "confirmed" ? "🍺 DRINKS READY" : "✓ CONFIRM DRINKS"}
                        </button>
                      )}
                    </>)}

                    {/* ── FOOD SECTION ── */}
                    {hasFood && (<>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0 8px",borderBottom:"1px solid rgba(192,132,252,.15)"}}>
                        <span style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2.5,color:"#c084fc"}}>🍳 FOOD</span>
                        {ks === "food_done"    && <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,color:"#4ade80",background:"rgba(74,222,128,.1)",border:"1px solid rgba(74,222,128,.25)",padding:"3px 8px"}}>✓ SERVED</span>}
                        {ks === "food_pending" && <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,color:"#c084fc",background:"rgba(192,132,252,.1)",border:"1px solid rgba(192,132,252,.25)",padding:"3px 8px"}}>⏳ KITCHEN</span>}
                        {ks === "food_ready"   && <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,color:"#fbbf24",background:"rgba(251,191,36,.1)",border:"1px solid rgba(251,191,36,.35)",padding:"3px 8px"}}>🔔 READY</span>}
                      </div>
                      <ItemList items={foods} />
                      {/* Food button — auto-routed to kitchen on first confirm, bar only clears when ready */}
                      {ks !== "food_done" && (
                        ks === "food_pending" ? (
                          <div style={{width:"100%",padding:"13px",marginBottom:10,background:"rgba(192,132,252,.06)",border:"1px solid rgba(192,132,252,.2)",fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2,color:"rgba(192,132,252,.5)",textAlign:"center",boxSizing:"border-box"}}>
                            ⏳ KITCHEN PREPARING…
                          </div>
                        ) : ks === "food_ready" ? (
                          <button disabled={isBusy} onClick={()=>doUpdate(ord.id,{kitchen_status:"food_done"})}
                            style={{width:"100%",padding:"13px",marginBottom:10,border:"none",background:"#4ade80",fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:2,color:"#000",cursor:isBusy?"not-allowed":"pointer",opacity:isBusy?.6:1,animation:"kds-urgent-blink 1.2s ease-in-out infinite"}}>
                            {isBusy ? "…" : "✓ FOOD DELIVERED — CLEAR"}
                          </button>
                        ) : (
                          /* null state — food-only: direct button; mixed order: auto-routes when drinks confirmed */
                          !hasDrinks ? (
                            <button disabled={isBusy} onClick={()=>doUpdate(ord.id,{kitchen_status:"food_pending",status:"confirmed"})}
                              style={{width:"100%",padding:"13px",marginBottom:10,border:"none",background:"#c084fc",fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:2,color:"#000",cursor:isBusy?"not-allowed":"pointer",opacity:isBusy?.6:1,transition:"opacity .15s"}}>
                              {isBusy ? "…" : "🍳 SEND TO KITCHEN"}
                            </button>
                          ) : (
                            <div style={{width:"100%",padding:"13px",marginBottom:10,background:"rgba(192,132,252,.06)",border:"1px solid rgba(192,132,252,.15)",fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2,color:"rgba(192,132,252,.4)",textAlign:"center",boxSizing:"border-box"}}>
                              🍳 ROUTES TO KITCHEN ON CONFIRM
                            </div>
                          )
                        )
                      )}
                    </>)}

                    {/* Total + print */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0 10px",borderTop:"1px solid rgba(255,255,255,.06)",marginTop:4}}>
                      <span style={{fontFamily:"'Anton',sans-serif",fontSize:22,color:"#fff"}}>${(+ord.total).toFixed(2)}</span>
                      <button onClick={()=>printReceipt({...ord,table_number:selectedTable})}
                        style={{padding:"8px 14px",background:"transparent",border:"1px solid rgba(255,255,255,.15)",color:"rgba(255,255,255,.45)",fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,cursor:"pointer"}}>
                        🖨 PRINT
                      </button>
                    </div>
                    {/* Manual close — shown when everything is served but order wasn't auto-completed */}
                    {(() => {
                      const dDone = dItems(ord).length === 0 || ds === "ready";
                      const fDone = fItems(ord).length === 0 || ks === "food_done";
                      return (dDone && fDone) ? (
                        <button disabled={isBusy} onClick={()=>doUpdate(ord.id,{status:"completed"})}
                          style={{width:"100%",padding:"13px",marginBottom:10,border:"none",background:"#fff",fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2.5,color:"#000",cursor:isBusy?"not-allowed":"pointer",opacity:isBusy?.6:1}}>
                          {isBusy ? "…" : "✓ CLOSE ORDER"}
                        </button>
                      ) : null;
                    })()}

                  </div>
                </div>
              );
            })}
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

      {/* ── FOOD READY — persistent right-side notification panel ─────────── */}
      {foodReadyOrders.length > 0 && (
        <div style={{position:"fixed",top:80,right:0,zIndex:500,display:"flex",flexDirection:"column",gap:10,padding:"0",pointerEvents:"none",maxHeight:"calc(100vh - 100px)",overflowY:"auto"}}>
          {foodReadyOrders.map((ord,idx) => {
            const foodNames = (ord.items||[]).filter(i=>FOOD_CATS.has(i.category)).map(i=>`${i.qty}× ${i.name}`);
            return (
              <div key={ord.id} style={{
                pointerEvents:"all",
                display:"flex",alignItems:"stretch",
                background:"#0a0a0a",
                border:"1px solid #4ade80",
                borderRight:"none",
                boxShadow:"-6px 0 32px rgba(74,222,128,.3), inset 0 0 0 1px rgba(74,222,128,.08)",
                animation:`fp-notif-slide 0.45s cubic-bezier(.16,1,.3,1) ${idx*0.08}s both`,
                width:280,
              }}>
                {/* Pulsing green accent bar */}
                <div style={{width:5,background:"#4ade80",flexShrink:0,animation:"kds-urgent-blink 1.4s ease-in-out infinite"}}/>
                <div style={{padding:"14px 16px",flex:1,minWidth:0}}>
                  {/* Header */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:"#4ade80",boxShadow:"0 0 8px #4ade80",animation:"kds-urgent-blink 1.4s ease-in-out infinite"}}/>
                      <span style={{fontFamily:"'Anton',sans-serif",fontSize:16,letterSpacing:2.5,color:"#fff"}}>TABLE {ord.table_number}</span>
                    </div>
                    <span style={{fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,color:"#4ade80",background:"rgba(74,222,128,.12)",border:"1px solid rgba(74,222,128,.3)",padding:"3px 8px"}}>FOOD READY</span>
                  </div>
                  {/* Customer */}
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:600,marginBottom:8,letterSpacing:.5}}>{ord.user_name}</div>
                  {/* Items */}
                  <div style={{borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:8,marginBottom:12}}>
                    {foodNames.map((n,i)=>(
                      <div key={i} style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.85)",fontWeight:700,lineHeight:1.6}}>{n}</div>
                    ))}
                  </div>
                  {/* Deliver button */}
                  <button
                    onClick={async()=>{
                      await supabase.from("orders").update({kitchen_status:"food_done"}).eq("id",ord.id);
                      const { data: fresh } = await supabase.from("orders").select("*").eq("id",ord.id).maybeSingle();
                      if (fresh) {
                        const dDone = (fresh.items||[]).filter(i=>!FOOD_CATS.has(i.category)).length === 0 || fresh.drink_status === "ready";
                        if (dDone) {
                          try { printReceipt({ ...fresh, table_number: fresh.table_number }); } catch(e) { console.error("printReceipt error", e); }
                          await supabase.from("orders").update({ status: "completed" }).eq("id",ord.id);
                        }
                      }
                      await onLoad();
                    }}
                    style={{width:"100%",padding:"11px 0",background:"#4ade80",border:"none",fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2.5,color:"#000",cursor:"pointer",transition:"opacity .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.opacity=".8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                    ✓ DELIVERED
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
                ? "radial-gradient(circle, rgba(255,255,255,.06) 1px, transparent 1px) 0 0 / 40px 40px, #0a0a0a"
                : "radial-gradient(circle, rgba(255,255,255,.03) 1px, transparent 1px) 0 0 / 40px 40px, #080808",
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
  .hdr{display:flex;align-items:center;justify-content:space-between;height:64px;padding:0 20px;background:#000;border-bottom:1px solid rgba(255,255,255,.07);position:sticky;top:0;z-index:200;flex-shrink:0}
  .hdr-logo-btn{background:none;border:none;padding:0;cursor:pointer;display:flex;align-items:center;opacity:.92;transition:opacity .15s, transform .15s}
  .hdr-logo-btn:hover{opacity:1;transform:scale(1.04)}
  .hdr-logo-btn:active{transform:scale(.97)}
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
  .body{flex:1;overflow-y:auto;padding-bottom:calc(72px + env(safe-area-inset-bottom, 0px))}
  .body-inner{max-width:900px;margin:0 auto}
  .bot-nav{display:flex;justify-content:center;position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,.97);backdrop-filter:blur(12px);border-top:1px solid rgba(255,255,255,.07);height:calc(60px + env(safe-area-inset-bottom, 0px));padding-bottom:env(safe-area-inset-bottom, 0px);z-index:200}
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

  /* ── Leaderboard tab toggle ── */
  .lb-toggle{display:flex;gap:4px;padding:12px 16px 0;border-bottom:1px solid rgba(255,255,255,.08)}
  .lb-tog-btn{flex:1;background:none;border:none;color:rgba(255,255,255,.35);font-family:'Anton',sans-serif;font-size:11px;letter-spacing:3px;padding:10px 8px;cursor:pointer;transition:all .2s;border-bottom:2px solid transparent;margin-bottom:-1px}
  .lb-tog-btn:hover{color:rgba(255,255,255,.7)}
  .lb-tog-on{color:#fff!important;border-bottom-color:#fff!important}

  /* ── Badges — same family, simple, premium ── */
  .plr-badge{display:inline-flex;align-self:flex-start;width:fit-content;align-items:center;font-family:'Outfit',sans-serif;font-size:9px;font-weight:700;letter-spacing:3px;padding:4px 10px;border-radius:2px;white-space:nowrap;line-height:1;text-transform:uppercase}
  .badge-owner{background:transparent;border:1px solid rgba(201,168,76,.6);color:#c9a84c}
  .badge-admin{background:transparent;border:1px solid rgba(255,255,255,.25);color:rgba(255,255,255,.55)}
  .badge-sponsor{background:transparent;border:1px solid rgba(201,168,76,.4);color:rgba(201,168,76,.8)}

  /* ── Developer badge — unique ── */
  .badge-dev{
    position:relative;overflow:hidden;
    display:inline-flex;align-self:flex-start;width:fit-content;
    background:#000;
    border:1px solid;
    font-family:'Outfit',sans-serif;font-size:9px;font-weight:700;letter-spacing:4px;
    padding:4px 12px;border-radius:2px;white-space:nowrap;line-height:1;
    animation:devCycle 5s linear infinite;
  }
  .badge-dev::after{
    content:'';position:absolute;top:0;left:-120%;width:60%;height:100%;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent);
    animation:devScan 3s ease-in-out infinite;
  }
  @keyframes devCycle{
    0%  {border-color:#00f5ff;color:#00f5ff;box-shadow:0 0 10px rgba(0,245,255,.2),inset 0 0 8px rgba(0,245,255,.05)}
    25% {border-color:#a78bfa;color:#a78bfa;box-shadow:0 0 10px rgba(167,139,250,.2),inset 0 0 8px rgba(167,139,250,.05)}
    50% {border-color:#f472b6;color:#f472b6;box-shadow:0 0 10px rgba(244,114,182,.2),inset 0 0 8px rgba(244,114,182,.05)}
    75% {border-color:#a78bfa;color:#a78bfa;box-shadow:0 0 10px rgba(167,139,250,.2),inset 0 0 8px rgba(167,139,250,.05)}
    100%{border-color:#00f5ff;color:#00f5ff;box-shadow:0 0 10px rgba(0,245,255,.2),inset 0 0 8px rgba(0,245,255,.05)}
  }
  @keyframes devScan{
    0%  {left:-120%;opacity:0}
    15% {opacity:1}
    85% {opacity:1}
    100%{left:180%;opacity:0}
  }

  /* ── Player Search ── */
  .ps-root{display:flex;flex-direction:column;padding:0 0 24px}
  .ps-bar{display:flex;align-items:center;gap:12px;margin:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);padding:12px 16px;border-radius:8px}
  .ps-bar-ico{font-size:18px;opacity:.5;font-style:normal}
  .ps-inp{flex:1;background:none;border:none;outline:none;color:#fff;font-family:'Outfit',sans-serif;font-size:15px}
  .ps-inp::placeholder{color:rgba(255,255,255,.28)}
  .ps-clr{background:none;border:none;color:rgba(255,255,255,.35);cursor:pointer;font-size:14px;padding:0;transition:color .15s}
  .ps-clr:hover{color:#fff}
  .ps-empty{display:flex;flex-direction:column;align-items:center;padding:60px 20px;text-align:center}
  .ps-empty-ico{font-size:48px;margin-bottom:14px}
  .ps-empty-title{font-family:'Anton',sans-serif;font-size:16px;letter-spacing:4px;color:rgba(255,255,255,.3)}
  .ps-empty-sub{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.18);margin-top:6px}
  .ps-row{display:flex;align-items:center;gap:14px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer;transition:background .15s;animation:psRowIn .3s ease both}
  .ps-row:hover{background:rgba(255,255,255,.04)}
  .ps-row-avatar{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Anton',sans-serif;font-size:20px;color:#fff;flex-shrink:0;letter-spacing:0}
  .ps-row-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
  .ps-row-name{font-family:'Anton',sans-serif;font-size:16px;letter-spacing:.5px;color:#fff;text-transform:uppercase;display:flex;align-items:center;gap:8px}
  .ps-row-phone{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.3)}
  .ps-row-arrow{font-size:22px;color:rgba(255,255,255,.25);flex-shrink:0}
  .ps-you{font-family:'Anton',sans-serif;font-size:7px;letter-spacing:2px;background:#fff;color:#000;padding:2px 7px;flex-shrink:0}
  @keyframes psRowIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  .ps-row:nth-child(1){animation-delay:.03s}.ps-row:nth-child(2){animation-delay:.06s}.ps-row:nth-child(3){animation-delay:.09s}.ps-row:nth-child(4){animation-delay:.12s}.ps-row:nth-child(5){animation-delay:.15s}

  /* ── Player Profile (full view) ── */
  .ps-back{background:none;border:none;color:rgba(255,255,255,.45);font-family:'Anton',sans-serif;font-size:11px;letter-spacing:3px;padding:16px 16px 8px;cursor:pointer;text-align:left;transition:color .15s}
  .ps-back:hover{color:#fff}
  .ps-profile-card{display:flex;flex-direction:column;align-items:center;padding:32px 20px 28px;position:relative;overflow:hidden;border-bottom:1px solid rgba(255,255,255,.08)}
  .ps-profile-glow{position:absolute;top:-40px;left:50%;transform:translateX(-50%);width:200px;height:200px;border-radius:50%;opacity:.12;filter:blur(50px);pointer-events:none}
  .ps-profile-avatar{width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Anton',sans-serif;font-size:38px;color:#fff;letter-spacing:0;margin-bottom:14px;box-shadow:0 4px 24px rgba(0,0,0,.4)}
  .ps-profile-name{font-family:'Anton',sans-serif;font-size:28px;letter-spacing:2px;color:#fff;text-transform:uppercase;text-align:center;line-height:1.1}
  .ps-profile-phone{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.35);margin-top:4px}
  .ps-its-you{font-family:'Outfit',sans-serif;font-size:11px;letter-spacing:2px;color:rgba(255,255,255,.4);margin-top:8px;font-weight:500}
  .ps-stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.08)}
  .ps-stat-box{display:flex;flex-direction:column;align-items:center;padding:24px 8px;background:#000}
  .ps-stat-num{font-family:'Anton',sans-serif;font-size:34px;color:#fff;line-height:1}
  .ps-stat-lbl{font-family:'Outfit',sans-serif;font-size:11px;letter-spacing:2px;color:rgba(255,255,255,.5);margin-top:6px;font-weight:600}
  .ps-breakdown{padding:20px 16px}
  .ps-bk-title{font-family:'Outfit',sans-serif;font-size:12px;letter-spacing:2px;color:rgba(255,255,255,.5);margin-bottom:12px;font-weight:600;text-transform:uppercase}
  .ps-bk-bar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,.08);margin-bottom:14px}
  .ps-bk-seg{height:100%;transition:flex .4s ease}
  .ps-bk-exact{background:#4ade80}
  .ps-bk-winner{background:#fbbf24}
  .ps-bk-wrong{background:rgba(255,255,255,.18)}
  .ps-bk-legend{display:flex;flex-wrap:wrap;gap:12px 20px}
  .ps-bk-legend span{display:flex;align-items:center;gap:6px;font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.7)}
  .ps-bk-dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .ps-no-preds{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.25);text-align:center;padding:32px 20px}

  /* ── Sold out ── */
  .menu-item-soldout{opacity:.45;pointer-events:none;position:relative}
  .menu-item-soldout-badge{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#000;border:1px solid rgba(255,255,255,.25);color:rgba(255,255,255,.8);font-family:'Anton',sans-serif;font-size:9px;letter-spacing:3px;padding:5px 14px;white-space:nowrap;z-index:2;pointer-events:none}
  .admin-soldout-btn{background:none;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.35);font-family:'Anton',sans-serif;font-size:8px;letter-spacing:2px;padding:4px 9px;cursor:pointer;transition:all .15s;white-space:nowrap}
  .admin-soldout-btn:hover{border-color:rgba(255,255,255,.3);color:rgba(255,255,255,.7)}
  .admin-soldout-btn.on{border-color:rgba(248,113,113,.5);color:#f87171}

  /* ── Order item notes ── */
  .cart-item-note-btn{background:none;border:none;color:rgba(255,255,255,.28);font-family:'Outfit',sans-serif;font-size:11px;cursor:pointer;padding:0;text-decoration:underline;transition:color .15s;display:block;margin-top:3px}
  .cart-item-note-btn:hover{color:rgba(255,255,255,.6)}
  .cart-item-note-inp{width:100%;background:none;border:none;border-bottom:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.75);font-family:'Outfit',sans-serif;font-size:12px;padding:5px 0;outline:none;margin-top:4px;transition:border-color .15s}
  .cart-item-note-inp:focus{border-bottom-color:rgba(255,255,255,.4)}
  .cart-item-note-inp::placeholder{color:rgba(255,255,255,.2)}
  .order-item-note{font-family:'Outfit',sans-serif;font-size:11px;color:rgba(255,255,255,.38);font-style:italic;margin-top:2px}

  /* ── Tournament Winner Screen ── */
  .winner-overlay{position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;overflow:hidden;text-align:center}
  .winner-confetti{position:absolute;inset:0;pointer-events:none;overflow:hidden}
  .winner-trophy{font-size:72px;animation:trophyBounce 1.2s ease-in-out infinite alternate;margin-bottom:12px;filter:drop-shadow(0 0 24px rgba(201,168,76,.5))}
  @keyframes trophyBounce{from{transform:scale(1) translateY(0)}to{transform:scale(1.1) translateY(-10px)}}
  .winner-label{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:6px;color:rgba(255,255,255,.4);margin-bottom:6px}
  .winner-event{font-family:'Anton',sans-serif;font-size:12px;letter-spacing:4px;color:#c9a84c;margin-bottom:28px}
  .winner-name{font-family:'Anton',sans-serif;font-size:clamp(36px,10vw,68px);color:#fff;line-height:1;margin-bottom:8px;animation:winnerIn .7s cubic-bezier(.34,1.56,.64,1) both}
  @keyframes winnerIn{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
  .winner-pts{font-family:'Anton',sans-serif;font-size:24px;color:#c9a84c;letter-spacing:3px;margin-bottom:4px}
  .winner-champion{font-family:'Outfit',sans-serif;font-size:12px;letter-spacing:4px;color:#c9a84c;font-weight:700;text-transform:uppercase;margin-bottom:36px}
  .winner-podium{display:flex;gap:36px;margin-bottom:36px}
  .winner-pod-item{display:flex;flex-direction:column;align-items:center;gap:5px}
  .winner-pod-pos{font-size:28px}
  .winner-pod-name{font-family:'Anton',sans-serif;font-size:13px;color:rgba(255,255,255,.55);letter-spacing:1px;text-transform:uppercase}
  .winner-pod-pts{font-family:'Outfit',sans-serif;font-size:11px;color:rgba(255,255,255,.3)}
  .winner-close{background:none;border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.4);font-family:'Anton',sans-serif;font-size:10px;letter-spacing:3px;padding:11px 28px;cursor:pointer;transition:all .2s}
  .winner-close:hover{border-color:rgba(255,255,255,.45);color:#fff}
  @keyframes confettiFall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}
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
  .sponsor-vip-hero{padding:40px 24px 28px;text-align:center;background:linear-gradient(160deg,rgba(255,255,255,.05) 0%,rgba(0,0,0,0) 100%)}
  .sponsor-vip-tier-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 20px;border-radius:50px;font-family:'Anton',sans-serif;font-size:13px;letter-spacing:2.5px;margin-bottom:14px}
  .sponsor-vip-name{font-family:'Anton',sans-serif;font-size:26px;color:#fff;letter-spacing:1px;margin-bottom:6px}
  .sponsor-vip-sub{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.4);line-height:1.5}
  .prof-av{width:76px;height:76px;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.18);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Anton',sans-serif;font-size:26px;letter-spacing:2px;border-radius:50%}
  .prof-av-wrap{position:relative;width:76px;height:76px;margin:0 auto 20px}
  .prof-av-img{width:76px;height:76px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.25);display:block}
  .prof-av-upload{position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:#fff;color:#000;display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.5);transition:transform .15s}
  .prof-av-upload:hover{transform:scale(1.15)}
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

  /* ── ADMIN / MENU INNER TABS ── */
  .admin-subtabs{display:flex;border-bottom:1px solid rgba(255,255,255,.07);overflow-x:auto;scrollbar-width:none}
  .admin-subtabs::-webkit-scrollbar{display:none}
  .admin-subtab{padding:11px 14px;background:transparent;border:none;border-bottom:2px solid transparent;font-family:'Anton',sans-serif;font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.45);cursor:pointer;transition:all .2s;margin-bottom:-1px;white-space:nowrap;flex-shrink:0}
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

  /* ── Share Card CTA ── */
  .sc-cta-wrap{padding:20px 16px 8px;display:flex;flex-direction:column;align-items:center;gap:8px}
  .sc-cta-btn{display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#1a1a1a,#111);border:1px solid rgba(240,192,64,0.45);color:#f0c040;font-family:'Anton',sans-serif;font-size:13px;letter-spacing:3px;padding:16px 28px;border-radius:100px;cursor:pointer;width:100%;max-width:340px;justify-content:center;transition:all .25s;box-shadow:0 0 20px rgba(240,192,64,0.08)}
  .sc-cta-btn:hover:not(:disabled){border-color:rgba(240,192,64,0.8);box-shadow:0 0 30px rgba(240,192,64,0.18);background:linear-gradient(135deg,#1f1a0a,#171200)}
  .sc-cta-btn:active:not(:disabled){transform:scale(.97)}
  .sc-cta-btn:disabled{opacity:.5;cursor:not-allowed}
  .sc-cta-btn svg{flex-shrink:0;opacity:.85}
  .sc-cta-sub{font-family:'Outfit',sans-serif;font-size:11px;color:rgba(255,255,255,.2);letter-spacing:.5px;text-align:center}
  @keyframes spin{to{transform:rotate(360deg)}}
  .sc-cta-spinner{width:14px;height:14px;border:2px solid rgba(240,192,64,.25);border-top-color:#f0c040;border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0}

  /* ── Share Card Modal ── */
  .sc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:700;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(14px);animation:fadeIn .2s ease}
  .sc-modal{background:#0e0e0e;border:1px solid rgba(240,192,64,.2);border-radius:20px;padding:24px 20px 28px;width:100%;max-width:420px;display:flex;flex-direction:column;align-items:center;gap:0;position:relative;animation:fadeUp .3s cubic-bezier(.16,1,.3,1)}
  .sc-close{position:absolute;top:14px;right:14px;background:rgba(255,255,255,.07);border:none;color:rgba(255,255,255,.5);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:14px;transition:all .15s}
  .sc-close:hover{background:rgba(255,255,255,.14);color:#fff}
  .sc-title{font-family:'Anton',sans-serif;font-size:16px;letter-spacing:4px;color:#fff;margin-bottom:4px;text-align:center}
  .sc-sub{font-family:'Outfit',sans-serif;font-size:11px;color:rgba(255,255,255,.3);letter-spacing:1px;text-align:center;margin-bottom:18px}
  .sc-preview{width:100%;max-width:340px;border-radius:12px;display:block;border:1px solid rgba(255,255,255,.08);box-shadow:0 20px 60px rgba(0,0,0,.6)}
  .sc-actions{margin-top:18px;width:100%}
  .sc-share-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;background:#f0c040;color:#000;border:none;font-family:'Anton',sans-serif;font-size:13px;letter-spacing:3px;padding:16px 0;border-radius:100px;cursor:pointer;transition:opacity .15s,transform .15s}
  .sc-share-btn:hover{opacity:.92}
  .sc-share-btn:active{transform:scale(.97)}
  .sc-hint{font-family:'Outfit',sans-serif;font-size:10px;color:rgba(255,255,255,.18);letter-spacing:.5px;text-align:center;margin-top:10px}

  .scard{animation:cardIn .32s ease both}
  .scard:nth-child(1){animation-delay:.06s}.scard:nth-child(2){animation-delay:.12s}.scard:nth-child(3){animation-delay:.18s}.scard:nth-child(4){animation-delay:.24s}
  .score-digit{animation:digitPop .3s cubic-bezier(.34,1.56,.64,1) both}
  .auth-panel{animation:fadeUp .5s cubic-bezier(.4,0,.2,1) .12s both}
  .auth-cta:active{transform:scale(.97)}

  /* ── Who Predicted What ── */
  .wpw-wrap{padding:10px 14px 14px;border-top:1px solid rgba(255,255,255,.06)}
  .wpw-title{font-family:'Anton',sans-serif;font-size:8px;letter-spacing:2px;color:rgba(255,255,255,.3);margin-bottom:8px}
  .wpw-bars{display:flex;gap:8px}
  .wpw-bar-col{flex:1;display:flex;flex-direction:column;gap:4px}
  .wpw-bar-track{height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
  .wpw-bar-fill{height:100%;border-radius:2px;transition:width .8s cubic-bezier(.4,0,.2,1)}
  .wpw-home{background:#3b82f6}
  .wpw-draw{background:rgba(255,255,255,.35)}
  .wpw-away{background:#ef4444}
  .wpw-bar-lbl{font-size:9px;color:rgba(255,255,255,.45);letter-spacing:.5px}
  .wpw-draw-col .wpw-bar-lbl{text-align:center}
  .wpw-bar-col:last-child .wpw-bar-lbl{text-align:right}

  /* ── Moments ── */
  /* ── MOMENTS ── */
  .mom-root{padding-bottom:32px;max-width:500px;margin:0 auto;width:100%}
  .mom-header{background:#000;position:sticky;top:0;z-index:50;max-width:500px;margin:0 auto;width:100%}
  .mom-header-title{font-family:'Anton',sans-serif;font-size:20px;letter-spacing:4px;color:#fff}
  .mom-header-sub{font-size:10px;color:rgba(255,255,255,.3);letter-spacing:2px;margin-top:2px}
  /* ── Feed Topbar ── */
  .mom-topbar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:12px 14px 10px}
  .mom-topbar-left{display:flex;align-items:center}
  .mom-topbar-center{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:5px}
  .mom-topbar-right{display:flex;align-items:center;gap:0;justify-content:flex-end}
  .mom-logo-text{font-family:'Anton',sans-serif;font-size:18px;letter-spacing:6px;color:#fff;line-height:1}
  .mom-neon-sub{text-align:center;font-family:'Outfit',sans-serif;font-size:8px;font-weight:600;letter-spacing:5px;color:#f0c040;animation:neonBlink 2.8s ease-in-out infinite;padding:0}
  @keyframes neonBlink{0%,100%{opacity:1;text-shadow:0 0 8px rgba(240,192,64,.9),0 0 20px rgba(240,192,64,.6),0 0 40px rgba(240,192,64,.25)}50%{opacity:.4;text-shadow:0 0 4px rgba(240,192,64,.2)}}
  .mom-divider{height:1px;background:rgba(255,255,255,.07);margin:0}
  .mom-icon-btn{background:transparent;border:none;color:rgba(255,255,255,.45);cursor:pointer;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:10px;transition:color .2s,transform .2s;position:relative;flex-shrink:0}
  .mom-icon-btn:hover{color:#fff;transform:scale(1.12)}
  .mom-icon-btn:active{transform:scale(.92)}
  .mom-icon-add{color:rgba(255,255,255,.75)}
  .mom-icon-add:hover{color:#fff;transform:scale(1.18)!important}
  .mom-icon-badge{position:absolute;top:4px;right:4px;background:#e63946;color:#fff;font-size:7px;min-width:14px;height:14px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;padding:0 3px;font-family:'Anton',sans-serif;letter-spacing:0;animation:pulse 1.5s infinite;pointer-events:none}
  .mom-my-av{cursor:pointer;border-radius:50%;transition:opacity .2s,transform .2s;flex-shrink:0}
  .mom-my-av:hover{opacity:.75;transform:scale(1.08)}
  .mom-post-fab{width:40px;height:40px;border-radius:50%;background:#fff;color:#000;border:none;font-size:22px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s;box-shadow:0 2px 12px rgba(255,255,255,.15)}
  .mom-post-fab:active{transform:scale(.92)}
  .mom-search-btn{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.08);color:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.12);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
  .mom-search-btn:hover{background:rgba(255,255,255,.14);color:#fff}
  /* ══ ALL POPUPS ══ */
  .psearch-overlay{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:600;display:flex;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(10px)}
  .psearch-popup{position:relative;background:#000;border:1px solid rgba(255,255,255,.09);border-radius:26px;width:100%;max-width:600px;height:90vh;max-height:820px;display:flex;flex-direction:column;overflow:hidden;animation:popIn .28s cubic-bezier(.16,1,.3,1);box-shadow:0 0 0 1px rgba(255,255,255,.04),0 40px 120px rgba(0,0,0,.95)}
  @keyframes popIn{from{opacity:0;transform:scale(.94) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
  .psearch-close{position:absolute;top:14px;right:14px;background:#fff;border:none;color:#000;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:12px;font-weight:900;display:flex;align-items:center;justify-content:center;transition:transform .2s,background .2s;z-index:100}
  .psearch-close:hover{background:rgba(255,255,255,.85);transform:scale(1.1)}

  /* ── Search view ── */
  .psearch-title{font-family:'Anton',sans-serif;font-size:13px;letter-spacing:6px;color:rgba(255,255,255,.35);padding:28px 26px 16px;flex-shrink:0;text-transform:uppercase}
  .psearch-input-wrap{display:flex;align-items:center;gap:10px;margin:0 18px 16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:0 16px;transition:all .2s;flex-shrink:0}
  .psearch-input-wrap:focus-within{border-color:rgba(255,255,255,.3);background:rgba(255,255,255,.07)}
  .psearch-ico{color:rgba(255,255,255,.3);flex-shrink:0}
  .psearch-inp{flex:1;background:transparent;border:none;color:#fff;font-size:16px;padding:15px 0;outline:none;font-family:'Outfit',sans-serif}
  .psearch-inp::placeholder{color:rgba(255,255,255,.2)}
  .psearch-clear{background:transparent;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:13px;padding:6px;flex-shrink:0;transition:color .15s}
  .psearch-clear:hover{color:rgba(255,255,255,.6)}
  .psearch-results{flex:1;overflow-y:auto;padding:0 10px 16px}
  .psearch-hint{text-align:center;color:rgba(255,255,255,.18);font-size:12px;letter-spacing:1.5px;padding:40px 16px;font-family:'Outfit',sans-serif}
  .psearch-row{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:14px;cursor:pointer;transition:background .18s;animation:psRowIn .3s ease both;border:1px solid transparent}
  .psearch-row:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.07)}
  @keyframes psRowIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  .psearch-row-info{flex:1;min-width:0}
  .psearch-row-name{font-family:'Anton',sans-serif;font-size:16px;letter-spacing:.5px;color:#fff}
  .psearch-row-sub{font-size:11px;color:rgba(255,255,255,.28);margin-top:3px;letter-spacing:.5px}
  .psearch-arr{color:rgba(255,255,255,.15);font-size:20px;flex-shrink:0}

  /* ── Profile view ── */
  .psearch-back{background:transparent;border:none;color:rgba(255,255,255,.3);font-family:'Outfit',sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;cursor:pointer;padding:22px 26px 4px;text-align:left;display:flex;align-items:center;gap:6px;transition:color .15s;flex-shrink:0;text-transform:uppercase}
  .psearch-back:hover{color:rgba(255,255,255,.7)}
  /* Profile header — centered layout */
  .psearch-profile{display:flex;flex-direction:column;align-items:center;gap:12px;padding:22px 26px 24px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0;text-align:center}
  .psearch-pname{font-family:'Anton',sans-serif;font-size:30px;letter-spacing:1px;color:#fff;line-height:1.1}
  .psearch-pnum{font-size:12px;color:rgba(255,255,255,.25);margin-top:3px;letter-spacing:2px;font-family:'Outfit',sans-serif}
  /* Badge glow in profile */
  .psearch-badge-glow{margin-top:4px}
  .psearch-badge-glow .plr-badge{font-size:11px;padding:6px 16px;letter-spacing:3px;position:relative;overflow:hidden}
  .psearch-badge-glow .plr-badge::after{content:'';position:absolute;top:0;left:-120%;width:60%;height:100%;background:linear-gradient(105deg,transparent 0%,rgba(255,255,255,.38) 50%,transparent 100%);transform:skewX(-20deg);animation:badgeShimmer 3s ease-in-out infinite}
  @keyframes badgeShimmer{0%{left:-120%}45%,100%{left:160%}}
  /* Stats — no boxes, just numbers with dividers */
  .psearch-stats{display:grid;grid-template-columns:1fr 1fr 1fr;padding:22px 20px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
  .psearch-stat{text-align:center;padding:0 10px;position:relative}
  .psearch-stat:not(:last-child)::after{content:"";position:absolute;right:0;top:10%;height:80%;width:1px;background:rgba(255,255,255,.08)}
  .psearch-stat-val{font-family:'Anton',sans-serif;font-size:38px;color:#fff;letter-spacing:-1px;line-height:1}
  .psearch-stat-lbl{font-size:8px;letter-spacing:3px;color:rgba(255,255,255,.25);margin-top:8px;font-family:'Outfit',sans-serif;font-weight:600;text-transform:uppercase}
  /* Posts grid */
  .psearch-posts-title{font-family:'Outfit',sans-serif;font-weight:700;font-size:10px;letter-spacing:4px;color:rgba(255,255,255,.25);padding:16px 26px 10px;flex-shrink:0;text-transform:uppercase}
  .psearch-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;overflow-y:auto;flex:1}
  .psearch-grid-img{width:100%;aspect-ratio:1;object-fit:cover;transition:opacity .2s}
  .psearch-grid-img:hover{opacity:.8}
  .mom-tabs{display:flex;gap:0;margin-top:14px;border-bottom:1px solid rgba(255,255,255,.08)}
  .mom-tab{flex:1;padding:10px 0;background:transparent;border:none;border-bottom:2px solid transparent;font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2px;color:rgba(255,255,255,.35);cursor:pointer;transition:all .2s;position:relative;margin-bottom:-1px}
  .mom-tab-on{color:#fff;border-bottom-color:#fff}
  .mom-notif-badge{position:absolute;top:6px;right:calc(50% - 22px);background:#ef4444;color:#fff;font-size:8px;min-width:16px;height:16px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;padding:0 4px;font-family:'Anton',sans-serif;letter-spacing:0;animation:pulse 1.5s infinite}
  /* Sheet */
  .mom-sheet-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:400;display:flex;align-items:flex-end}
  .mom-sheet{background:#111;border-radius:20px 20px 0 0;padding:16px 16px calc(32px + env(safe-area-inset-bottom,0px));width:100%;max-height:90vh;overflow-y:auto;animation:slideUp .3s cubic-bezier(.16,1,.3,1);box-sizing:border-box}
  .mom-sheet-handle{width:36px;height:4px;background:rgba(255,255,255,.2);border-radius:2px;margin:0 auto 16px}
  .mom-sheet-title{font-family:'Anton',sans-serif;font-size:16px;letter-spacing:3px;color:#fff;margin-bottom:4px}
  .mom-sheet-hint{font-size:11px;color:rgba(255,255,255,.3);letter-spacing:1px;margin-bottom:12px}
  .mom-pick-area{display:flex;flex-direction:column;align-items:center;justify-content:center;border:1.5px dashed rgba(255,255,255,.18);border-radius:12px;padding:32px 16px;margin-bottom:12px;cursor:pointer;transition:border-color .2s}
  .mom-pick-area:hover{border-color:rgba(255,255,255,.4)}
  .mom-preview-wrap{position:relative;margin-bottom:12px;border-radius:12px;overflow:hidden}
  .mom-preview-img{width:100%;max-height:260px;object-fit:cover;display:block;border-radius:12px}
  .mom-preview-change{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.7);color:#fff;border:none;border-radius:20px;padding:4px 10px;font-size:11px;cursor:pointer}
  .mom-caption-inp{width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:#fff;padding:10px 14px;font-size:13px;border-radius:10px;outline:none;box-sizing:border-box;margin-bottom:0}
  .mom-caption-inp::placeholder{color:rgba(255,255,255,.25)}
  .mom-upload-btn{padding:13px;background:#fff;color:#000;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2px;cursor:pointer;border:none;border-radius:10px;text-align:center;transition:opacity .2s}
  .mom-cancel-btn{padding:13px;background:transparent;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.45);font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2px;cursor:pointer;border-radius:10px}
  /* ── Feed ── */
  .mom-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;text-align:center}
  /* Refresh bar */
  .mom-feed-bar{display:flex;align-items:center;justify-content:flex-end;padding:6px 14px 2px}
  .mom-refresh-btn{display:flex;align-items:center;gap:5px;background:transparent;border:none;color:rgba(255,255,255,.22);font-family:'Anton',sans-serif;font-size:8px;letter-spacing:2px;cursor:pointer;padding:5px 8px;border-radius:6px;transition:color .2s}
  .mom-refresh-btn:hover{color:rgba(255,255,255,.6)}
  .mom-refresh-btn:hover svg{transform:rotate(180deg)}
  .mom-refresh-btn svg{transition:transform .45s ease}
  /* Feed — flat list */
  .mom-feed{display:flex;flex-direction:column;padding:0 0 100px}
  /* Card — flat, separated by thin line */
  .mom-card{background:#000;border-bottom:1px solid rgba(255,255,255,.06);animation:fadeUp .4s ease both}
  .mom-card:first-child{border-top:1px solid rgba(255,255,255,.06)}
  .mom-card-pending{border-left:2px solid #f59e0b}
  /* Author row */
  .mom-card-author{display:flex;align-items:center;gap:11px;padding:14px 16px 10px}
  .mom-card-av{cursor:pointer;border-radius:50%;transition:opacity .15s;flex-shrink:0}
  .mom-card-av:hover{opacity:.75}
  .mom-photo-author{display:flex;flex-direction:column;justify-content:center;flex:1;min-width:0}
  .mom-author-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .mom-poster-name{font-family:'Anton',sans-serif;font-size:14px;letter-spacing:.5px;color:#fff;line-height:1.2}
  .mom-time{font-size:10px;color:rgba(255,255,255,.25);margin-top:3px;letter-spacing:.3px;font-family:'Outfit',sans-serif}
  .mom-delete-btn{background:transparent;border:none;color:rgba(255,255,255,.18);font-size:15px;cursor:pointer;padding:6px;border-radius:8px;transition:color .15s;flex-shrink:0}
  .mom-delete-btn:hover{color:#ef4444}
  /* Photo */
  .mom-photo-wrap{width:100%;aspect-ratio:4/3;max-height:320px;overflow:hidden;background:#111;position:relative;cursor:pointer}
  .mom-photo-top{display:none}
  .mom-img{width:100%;height:100%;object-fit:cover;display:block;transition:opacity .25s}
  .mom-card:hover .mom-img{opacity:.92}
  .mom-img-tap-hint{position:absolute;bottom:10px;right:12px;font-size:9px;letter-spacing:1px;color:rgba(255,255,255,.2);font-family:'Outfit',sans-serif;pointer-events:none;opacity:0;transition:opacity .3s}
  .mom-card:hover .mom-img-tap-hint{opacity:1}
  /* Caption & badge override */
  .mom-caption{padding:10px 16px 6px;font-size:13px;color:rgba(255,255,255,.7);line-height:1.6;font-family:'Outfit',sans-serif}
  .mom-card .plr-badge{font-size:7px;padding:3px 7px;letter-spacing:2px}
  /* 3-dots menu */
  .mom-3dots-wrap{position:relative;flex-shrink:0}
  .mom-3dots{background:transparent;border:none;cursor:pointer;padding:8px 6px;display:flex;flex-direction:column;gap:3.5px;align-items:center;justify-content:center;border-radius:8px;transition:background .15s}
  .mom-3dots:hover{background:rgba(255,255,255,.08)}
  .mom-3dots span{display:block;width:3.5px;height:3.5px;background:rgba(255,255,255,.5);border-radius:50%}
  .mom-card-menu{position:absolute;top:calc(100% + 4px);right:0;background:#1a1a1a;border:1px solid rgba(255,255,255,.12);border-radius:14px;overflow:hidden;min-width:170px;z-index:100;animation:popIn .18s cubic-bezier(.16,1,.3,1);box-shadow:0 12px 40px rgba(0,0,0,.8)}
  .mom-card-menu-item{display:flex;align-items:center;gap:10px;width:100%;padding:13px 16px;background:transparent;border:none;color:rgba(255,255,255,.8);font-family:'Outfit',sans-serif;font-size:13px;font-weight:500;cursor:pointer;text-align:left;transition:background .15s;border-bottom:1px solid rgba(255,255,255,.06)}
  .mom-card-menu-item:last-child{border-bottom:none}
  .mom-card-menu-item:hover{background:rgba(255,255,255,.07);color:#fff}
  .mom-card-menu-delete{color:#ef4444!important}
  .mom-card-menu-delete:hover{background:rgba(239,68,68,.1)!important}
  /* Lightbox */
  .mom-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.97);z-index:800;display:flex;align-items:center;justify-content:center;animation:fadeIn .2s ease;cursor:zoom-out}
  .mom-lightbox-img{max-width:95vw;max-height:92vh;object-fit:contain;border-radius:8px;box-shadow:0 0 80px rgba(0,0,0,.8)}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  /* Heart SVG */
  .mom-heart-svg{transition:transform .2s,fill .2s,stroke .2s;flex-shrink:0}
  .mom-heart-svg-on{animation:heartPop .35s cubic-bezier(.36,.07,.19,.97) both}
  /* Caption */
  .mom-caption{padding:10px 14px 6px;font-size:13px;color:rgba(255,255,255,.75);line-height:1.6;font-style:italic}
  /* Smaller badge inside cards */
  .mom-card .plr-badge{font-size:7px;padding:3px 7px;letter-spacing:2px}
  /* Actions */
  .mom-actions{display:flex;gap:2px;padding:8px 8px 6px;align-items:center;border-top:1px solid rgba(255,255,255,.05)}
  .mom-like-btn,.mom-comment-toggle{background:transparent;border:none;color:rgba(255,255,255,.55);cursor:pointer;padding:8px 10px;display:flex;align-items:center;gap:7px;transition:all .2s;border-radius:10px}
  .mom-like-btn:hover .mom-heart-svg{transform:scale(1.15)}
  .mom-comment-toggle:hover{color:#fff;background:rgba(255,255,255,.06)}
  .mom-liked .mom-heart-svg{filter:drop-shadow(0 0 6px rgba(230,57,70,.6))}
  .mom-heart{font-size:21px;display:inline-block;transition:transform .15s}
  .mom-heart-on{animation:heartPop .35s cubic-bezier(.36,.07,.19,.97) both}
  .mom-like-count{font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;color:rgba(255,255,255,.6)}
  /* Heart burst particles */
  .mom-heart-burst{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:14px;pointer-events:none;animation:heartFloat .9s ease-out forwards}
  @keyframes heartFloat{0%{opacity:1;transform:translate(-50%,-50%) translate(0,0) scale(1)}100%{opacity:0;transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(.3)}}
  @keyframes heartPop{0%{transform:scale(1)}40%{transform:scale(1.5)}70%{transform:scale(.9)}100%{transform:scale(1)}}
  /* Comments */
  .mom-comments{padding:8px 14px 4px;border-top:1px solid rgba(255,255,255,.05);background:rgba(0,0,0,.2)}
  .mom-comment{display:flex;align-items:flex-start;gap:9px;margin-bottom:10px}
  .mom-comment-body{flex:1;background:rgba(255,255,255,.04);border-radius:12px;padding:8px 12px}
  .mom-comment-name{font-family:'Anton',sans-serif;font-size:10px;letter-spacing:1px;color:#fff;margin-right:6px}
  .mom-comment-text{font-size:12px;color:rgba(255,255,255,.65);line-height:1.45}
  .mom-del-comment{background:transparent;border:none;color:rgba(255,255,255,.15);font-size:14px;cursor:pointer;padding:4px;align-self:center;flex-shrink:0;transition:color .15s}
  .mom-del-comment:hover{color:#ef4444}
  .mom-comment-input-row{display:flex;align-items:center;gap:8px;padding:4px 0 12px}
  .mom-comment-inp{flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:22px;padding:10px 16px;color:#fff;font-size:13px;outline:none;transition:border-color .2s}
  .mom-comment-inp:focus{border-color:rgba(255,255,255,.35);background:rgba(255,255,255,.08)}
  .mom-comment-inp::placeholder{color:rgba(255,255,255,.2)}
  .mom-comment-send{width:34px;height:34px;border-radius:50%;background:#fff;color:#000;border:none;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:900;transition:transform .15s,opacity .15s}
  .mom-comment-send:active{transform:scale(.88)}
  /* Pending banner */
  .mom-pending-banner{display:flex;align-items:center;gap:8px;padding:9px 14px;background:rgba(245,158,11,.08);font-family:'Anton',sans-serif;font-size:9px;letter-spacing:2px;color:#f59e0b;border-bottom:1px solid rgba(245,158,11,.12)}
  .mom-approve-btn{margin-left:auto;background:#22c55e;color:#000;border:none;font-family:'Anton',sans-serif;font-size:9px;letter-spacing:1px;padding:5px 12px;cursor:pointer;border-radius:6px;transition:opacity .15s}
  .mom-approve-btn:hover{opacity:.85}
  /* ── Notifications popup ── */
  .mom-notifs{display:flex;flex-direction:column}
  .mom-notif-row{display:flex;align-items:center;gap:14px;padding:16px 22px;border-bottom:1px solid rgba(255,255,255,.05);animation:fadeUp .3s ease both;transition:background .2s}
  .mom-notif-row:hover{background:rgba(255,255,255,.03)}
  .mom-notif-new{background:rgba(255,255,255,.025)}
  .mom-notif-icon{font-size:18px;flex-shrink:0;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.08)}
  .mom-notif-body{flex:1;min-width:0}
  .mom-notif-name{font-family:'Anton',sans-serif;font-size:13px;letter-spacing:.5px;color:#fff}
  .mom-notif-text{font-size:12px;color:rgba(255,255,255,.45);font-family:'Outfit',sans-serif}
  .mom-notif-time{font-size:10px;color:rgba(255,255,255,.2);margin-top:3px;letter-spacing:.5px;font-family:'Outfit',sans-serif}
  .mom-notif-thumb{width:52px;height:52px;object-fit:cover;border-radius:10px;flex-shrink:0;border:1px solid rgba(255,255,255,.08)}
  /* ── Post popup ── */
  .mom-pick-area{display:flex;flex-direction:column;align-items:center;justify-content:center;border:1.5px dashed rgba(255,255,255,.12);border-radius:16px;padding:40px 16px;cursor:pointer;transition:all .2s;background:rgba(255,255,255,.02)}
  .mom-pick-area:hover{border-color:rgba(255,255,255,.3);background:rgba(255,255,255,.04)}
  .mom-caption-inp{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);color:#fff;padding:13px 16px;font-size:14px;border-radius:12px;outline:none;box-sizing:border-box;font-family:'Outfit',sans-serif;transition:all .2s}
  .mom-caption-inp:focus{border-color:rgba(255,255,255,.3);background:rgba(255,255,255,.07)}
  .mom-caption-inp::placeholder{color:rgba(255,255,255,.2)}
  .mom-upload-btn{padding:14px;background:#fff;color:#000;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:3px;cursor:pointer;border:none;border-radius:12px;text-align:center;transition:opacity .2s,transform .15s}
  .mom-upload-btn:hover{opacity:.9;transform:scale(1.01)}
  .mom-cancel-btn{padding:14px;background:transparent;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.35);font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2px;cursor:pointer;border-radius:12px;transition:all .2s}
  .mom-cancel-btn:hover{border-color:rgba(255,255,255,.25);color:rgba(255,255,255,.6)}
  .mom-preview-wrap{position:relative;margin-bottom:0;border-radius:14px;overflow:hidden}
  .mom-preview-img{width:100%;object-fit:cover;display:block;border-radius:14px}
  .mom-preview-change{position:absolute;top:10px;right:10px;background:rgba(0,0,0,.75);color:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:5px 12px;font-size:11px;cursor:pointer;font-family:'Outfit',sans-serif;backdrop-filter:blur(4px);transition:all .15s}
  .mom-preview-change:hover{color:#fff;background:rgba(0,0,0,.9)}

  /* ── Stories row ── */
  .mom-stories-row{display:flex;gap:0;overflow-x:auto;padding:14px 12px 10px;border-bottom:1px solid rgba(255,255,255,.06);scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .mom-stories-row::-webkit-scrollbar{display:none}
  .mom-story-item{display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;flex-shrink:0;padding:0 8px;min-width:72px}
  .mom-story-av{width:60px;height:60px;border-radius:50%;position:relative;padding:2px;background:linear-gradient(135deg,#f0c040,#ff6b35,#e63946);flex-shrink:0}
  .mom-story-av-ring{background:linear-gradient(135deg,#f0c040,#e63946)}
  .mom-story-av-me{background:linear-gradient(135deg,#22c55e,#16a34a)}
  .mom-story-av-ring > div,.mom-story-av-me > div,.mom-story-add > div{border:2.5px solid #000;border-radius:50%}
  .mom-story-add{background:linear-gradient(135deg,rgba(255,255,255,.15),rgba(255,255,255,.05));border:2px dashed rgba(255,255,255,.2)}
  .mom-story-plus{position:absolute;bottom:0;right:0;width:18px;height:18px;background:#fff;color:#000;border-radius:50%;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;line-height:1;border:2px solid #000}
  .mom-story-name{font-family:'Outfit',sans-serif;font-size:10px;color:rgba(255,255,255,.55);letter-spacing:.3px;text-align:center;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}

  /* ── Feed card upgrade ── */
  .mom-card{background:#000;border-bottom:1px solid rgba(255,255,255,.055);overflow:hidden;animation:fadeUp .4s ease both}
  .mom-card-av-ring{padding:2px;background:linear-gradient(135deg,#f0c040,#e63946);border-radius:50%}
  .mom-card-av-ring > div{border:2px solid #000;border-radius:50%}

  /* ── Empty state CTA ── */
  .mom-empty-cta{margin-top:24px;background:#fff;color:#000;border:none;font-family:'Anton',sans-serif;font-size:12px;letter-spacing:3px;padding:14px 28px;cursor:pointer;border-radius:100px;transition:transform .15s,opacity .15s}
  .mom-empty-cta:hover{opacity:.88;transform:scale(1.03)}

  /* ── Match card share ── */
  .mcard-share-row{padding:4px 14px 12px}
  .mcard-share-btn{display:flex;align-items:center;gap:7px;background:transparent;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.5);font-family:'Anton',sans-serif;font-size:9px;letter-spacing:2px;padding:8px 14px;border-radius:100px;cursor:pointer;transition:all .2s;width:100%;justify-content:center}
  .mcard-share-btn:hover{border-color:rgba(255,255,255,.35);color:rgba(255,255,255,.85);background:rgba(255,255,255,.03)}
  .mcard-share-btn svg{flex-shrink:0;opacity:.7}
  .mcard-share-panel{display:flex;flex-direction:column;gap:8px;animation:fadeUp .25s ease}
  .mcard-share-preview{display:flex;flex-direction:column;gap:3px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 14px}
  .mcard-share-preview-match{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:1px;color:rgba(255,255,255,.75)}
  .mcard-share-preview-score{font-family:'Outfit',sans-serif;font-size:11px;color:rgba(255,255,255,.4);margin-top:2px}
  .mcard-share-inp{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;padding:10px 13px;font-size:13px;border-radius:10px;outline:none;font-family:'Outfit',sans-serif;transition:border-color .2s}
  .mcard-share-inp:focus{border-color:rgba(255,255,255,.3)}
  .mcard-share-inp::placeholder{color:rgba(255,255,255,.2)}
  .mcard-share-cancel{flex:1;background:transparent;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.35);font-family:'Anton',sans-serif;font-size:9px;letter-spacing:2px;padding:11px 0;border-radius:10px;cursor:pointer;transition:all .2s}
  .mcard-share-cancel:hover{border-color:rgba(255,255,255,.25);color:rgba(255,255,255,.6)}
  .mcard-share-post{flex:2;background:#fff;color:#000;border:none;font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2px;padding:11px 0;border-radius:10px;cursor:pointer;transition:opacity .15s}
  .mcard-share-post:disabled{opacity:.4;cursor:not-allowed}
  .mcard-share-posted{display:flex;align-items:center;gap:6px;color:#22c55e;font-family:'Anton',sans-serif;font-size:9px;letter-spacing:2px;justify-content:center;padding:8px 0}

  /* ── Prediction post card in feed ── */
  .mom-pred-card{margin:0 14px 2px;border-radius:14px;background:linear-gradient(145deg,#0d0d0d,#111);border:1px solid rgba(255,255,255,.1);overflow:hidden}
  .mom-pred-label{padding:10px 14px 0;font-family:'Anton',sans-serif;font-size:9px;letter-spacing:3px;color:rgba(255,255,255,.35)}
  .mom-pred-matchup{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:14px 14px 10px;gap:8px}
  .mom-pred-team{display:flex;flex-direction:column;align-items:center;gap:5px}
  .mom-pred-team-r{align-items:center}
  .mom-pred-flag{font-size:30px;line-height:1}
  .mom-pred-tname{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:1px;color:rgba(255,255,255,.7);text-align:center;line-height:1.2}
  .mom-pred-scores{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:80px}
  .mom-pred-final{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:2px;background:rgba(255,255,255,.06);border-radius:10px;padding:6px 10px;position:relative}
  .mom-pred-fnum{font-family:'Anton',sans-serif;font-size:26px;color:#fff;line-height:1}
  .mom-pred-fcolon{font-family:'Anton',sans-serif;font-size:22px;color:rgba(255,255,255,.5);line-height:1}
  .mom-pred-final-lbl{width:100%;text-align:center;font-family:'Anton',sans-serif;font-size:7px;letter-spacing:2px;color:rgba(255,255,255,.3);margin-top:2px}
  .mom-pred-pick{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:2px;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:5px 10px}
  .mom-pred-pnum{font-family:'Anton',sans-serif;font-size:18px;color:rgba(255,255,255,.65);line-height:1}
  .mom-pred-pcolon{font-family:'Anton',sans-serif;font-size:15px;color:rgba(255,255,255,.3);line-height:1}
  .mom-pred-pick-lbl{width:100%;text-align:center;font-family:'Anton',sans-serif;font-size:7px;letter-spacing:2px;color:rgba(255,255,255,.25);margin-top:2px}
  .mom-pred-meta{text-align:center;font-family:'Outfit',sans-serif;font-size:10px;color:rgba(255,255,255,.25);letter-spacing:.5px;padding:0 14px 10px}
  .mom-pred-result{display:flex;align-items:center;justify-content:center;gap:7px;padding:10px 14px;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2px;border-top:1px solid rgba(255,255,255,.06)}
  .mom-pred-exact{color:#22c55e;background:rgba(34,197,94,.06)}
  .mom-pred-winner{color:#f59e0b;background:rgba(245,158,11,.06)}
  .mom-pred-wrong{color:rgba(255,255,255,.35);background:rgba(255,255,255,.02)}
  .mom-pred-result-ico{font-size:14px}
  .mom-pred-user-caption{padding:10px 14px;font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.5);font-style:italic;line-height:1.5;border-top:1px solid rgba(255,255,255,.06)}

  @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}

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
  @keyframes cdGlow{0%,100%{opacity:1;text-shadow:0 0 8px currentColor}50%{opacity:.55;text-shadow:0 0 2px currentColor}}
  .cd-urgent{animation:cdGlow 2s ease-in-out infinite}

  /* ── MENU & ORDER ── */
  .wallet-header{display:flex;align-items:center;justify-content:space-between;padding:20px 16px;background:linear-gradient(135deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,.02) 100%);border-bottom:1px solid rgba(255,255,255,.1)}
  .wallet-left{display:flex;flex-direction:column;gap:3px}
  .wallet-label{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:4px;color:rgba(255,255,255,.55)}
  .wallet-balance{font-family:'Anton',sans-serif;font-size:38px;color:#fff;line-height:1;letter-spacing:1px}
  .wallet-sub{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(255,255,255,.5);font-weight:500}
  .wallet-topup-btn{padding:14px 24px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:3px;transition:opacity .15s;flex-shrink:0}
  .wallet-topup-btn:hover{opacity:.85}

  /* Sticky category pill bar */
  .menu-section-toggle{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 16px 0;background:#000}
  .menu-sec-btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.45);font-family:'Anton',sans-serif;font-size:13px;letter-spacing:2.5px;cursor:pointer;transition:all .2s;border-radius:10px}
  .menu-sec-btn-icon{font-size:18px;line-height:1}
  .menu-sec-btn:hover{background:rgba(255,255,255,.09);color:#fff}
  .menu-sec-btn-on{background:#fff !important;color:#000 !important;border-color:#fff !important}
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
  .menu-item-name{font-family:'Anton',sans-serif;font-size:18px;color:#fff;letter-spacing:.5px;margin-bottom:4px;text-transform:capitalize}
  .menu-item-desc{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.5);margin-bottom:5px;line-height:1.4}
  .menu-item-price{font-family:'Anton',sans-serif;font-size:18px;color:rgba(255,255,255,.8);letter-spacing:1px}
  .menu-add-btn{padding:11px 20px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2px;transition:opacity .15s;flex-shrink:0}
  .menu-add-btn:hover{opacity:.85}
  .menu-qty-ctrl{display:flex;align-items:center;border:1px solid rgba(255,255,255,.2);flex-shrink:0}
  .menu-qty-btn{width:40px;height:40px;background:transparent;border:none;color:#fff;cursor:pointer;font-size:18px;font-family:'Anton',sans-serif;display:flex;align-items:center;justify-content:center;transition:background .15s}
  .menu-qty-btn:hover{background:rgba(255,255,255,.1)}
  .menu-qty-val{font-family:'Anton',sans-serif;font-size:18px;color:#fff;min-width:32px;text-align:center}
  .cart-fab{position:fixed;left:16px;right:16px;bottom:calc(72px + env(safe-area-inset-bottom, 0px));padding:15px 20px;background:#fff;color:#000;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2px;text-align:center;cursor:pointer;box-shadow:0 8px 32px rgba(0,0,0,.6);transition:opacity .15s,transform .15s;border-radius:12px;z-index:190}
  .cart-fab:hover{opacity:.9;transform:translateY(-1px)}

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
  .go-menu-name{font-family:'Anton',sans-serif;font-size:18px;color:#fff;letter-spacing:.5px;text-transform:capitalize}
  .go-menu-desc{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.5);margin-bottom:5px;line-height:1.4;text-transform:lowercase}
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
  .go-modal-section-toggle{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px 16px 6px;flex-shrink:0}
  .go-modal-sec-btn{display:flex;align-items:center;justify-content:center;gap:7px;padding:11px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.45);font-family:'Anton',sans-serif;font-size:12px;letter-spacing:2px;cursor:pointer;transition:all .2s;border-radius:8px}
  .go-modal-sec-btn:hover{background:rgba(255,255,255,.09);color:#fff}
  .go-modal-sec-on{background:#fff !important;color:#000 !important;border-color:#fff !important}
  .go-modal-cats{display:flex;gap:8px;padding:10px 16px 10px;overflow-x:auto;scrollbar-width:none;flex-shrink:0}
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

  /* ── KDS (Kitchen Display System) ── */
  .kds-root{padding:0 0 80px;min-height:100vh;background:#000}
  .kds-loading{display:flex;align-items:center;justify-content:center;height:60vh;color:rgba(255,255,255,.4);font-family:'Outfit',sans-serif;font-size:14px}
  .kds-header{display:flex;align-items:center;justify-content:space-between;padding:20px 16px 16px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.97);position:sticky;top:0;z-index:10}
  .kds-header-left{display:flex;align-items:center;gap:12px}
  .kds-header-icon{font-size:26px;line-height:1}
  .kds-header-title{font-family:'Anton',sans-serif;font-size:20px;letter-spacing:2px;color:#fff;line-height:1}
  .kds-header-sub{font-size:9px;color:rgba(255,255,255,.3);letter-spacing:1.5px;margin-top:4px;text-transform:uppercase;font-family:'Outfit',sans-serif}
  .kds-header-counts{display:flex;gap:8px}
  .kds-count-badge{display:flex;flex-direction:column;align-items:center;padding:8px 14px;gap:2px;border:1px solid;min-width:56px}
  .kds-count-badge span:first-child{font-family:'Anton',sans-serif;font-size:22px;line-height:1}
  .kds-count-badge span:last-child{font-size:8px;letter-spacing:1.5px;font-family:'Anton',sans-serif}
  .kds-count-pending{background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.4);color:#fbbf24}
  .kds-count-ready{background:rgba(74,222,128,.1);border-color:rgba(74,222,128,.4);color:#4ade80}
  .kds-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 32px;text-align:center}
  .kds-empty-icon{font-size:56px;color:rgba(255,255,255,.12);margin-bottom:20px;font-family:'Anton',sans-serif}
  .kds-empty-title{font-family:'Anton',sans-serif;font-size:22px;letter-spacing:2px;color:rgba(255,255,255,.3);margin-bottom:10px}
  .kds-empty-sub{font-size:13px;color:rgba(255,255,255,.18);line-height:1.6;max-width:270px;font-family:'Outfit',sans-serif}
  .kds-section{padding:20px 14px 4px}
  .kds-section-label{font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2.5px;color:rgba(255,255,255,.3);margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.06)}
  .kds-tickets{display:flex;flex-direction:column;gap:14px}
  .kds-ticket{padding:20px;border:1px solid;position:relative;overflow:hidden;transition:box-shadow .3s}
  .kds-ticket-pending{background:rgba(251,191,36,.05);border-color:rgba(251,191,36,.3)}
  .kds-ticket-urgent{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.5);animation:kds-urgent-blink 1.4s ease-in-out infinite}
  .kds-ticket-done{background:rgba(74,222,128,.04);border-color:rgba(74,222,128,.2)}
  @keyframes kds-urgent-blink{0%,100%{box-shadow:none}50%{box-shadow:0 0 0 3px rgba(239,68,68,.18),inset 0 0 20px rgba(239,68,68,.04)}}
  .kds-ticket-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px}
  .kds-ticket-table{font-family:'Anton',sans-serif;font-size:26px;letter-spacing:2px;color:#fff;line-height:1}
  .kds-ticket-time{font-size:12px;color:rgba(255,255,255,.35);font-family:'Outfit',sans-serif;font-weight:600;margin-top:4px}
  .kds-ticket-time-urgent{color:#f87171;animation:countdown-pulse 1s ease-in-out infinite}
  .kds-ticket-done-badge{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:1.5px;color:#4ade80;background:rgba(74,222,128,.1);padding:5px 10px;border:1px solid rgba(74,222,128,.3);margin-top:2px}
  .kds-ticket-name{font-size:11px;color:rgba(255,255,255,.35);letter-spacing:1px;text-transform:uppercase;margin-bottom:16px;font-family:'Outfit',sans-serif;font-weight:600}
  .kds-ticket-items{display:flex;flex-direction:column;gap:10px;margin-bottom:20px}
  .kds-ticket-item{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .kds-ticket-item-done{opacity:.5}
  .kds-ticket-qty{font-family:'Anton',sans-serif;font-size:15px;color:rgba(255,255,255,.4);min-width:28px;flex-shrink:0}
  .kds-ticket-itemname{font-family:'Anton',sans-serif;font-size:20px;letter-spacing:.5px;color:#fff;flex:1}
  .kds-ticket-note{font-size:11px;color:rgba(251,191,36,.7);font-family:'Outfit',sans-serif;font-style:italic;width:100%;padding-left:38px}
  .kds-ready-btn{width:100%;padding:16px;background:#fbbf24;border:none;font-family:'Anton',sans-serif;font-size:14px;letter-spacing:2.5px;color:#000;cursor:pointer;transition:all .15s;margin-top:4px}
  .kds-ready-btn:hover{background:#f59e0b;transform:translateY(-1px)}
  .kds-ready-btn:active{transform:translateY(0)}
  .kds-ready-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
  .kds-dismiss-btn{width:100%;padding:11px;background:transparent;border:1px solid rgba(255,255,255,.12);font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2px;color:rgba(255,255,255,.35);cursor:pointer;transition:all .15s;margin-top:4px}
  .kds-dismiss-btn:hover{border-color:rgba(255,255,255,.25);color:rgba(255,255,255,.6)}
  .kds-food-ready-text{font-family:'Anton',sans-serif;font-size:12px;letter-spacing:1.5px;color:#4ade80}
  @keyframes fp-notif-slide{from{opacity:0;transform:translateX(110%)}to{opacity:1;transform:translateX(0)}}

  /* ─── KDS v2 — Premium Kitchen Display ──────────────────────────────────── */
  .kds2-root{min-height:100vh;background:#0a0a0a;padding-bottom:32px;font-family:'Outfit',sans-serif}
  .kds2-loading{display:flex;align-items:center;justify-content:center;height:70vh;color:rgba(255,255,255,.3);font-size:15px;letter-spacing:2px;font-family:'Anton',sans-serif}

  /* TOP BAR */
  .kds2-topbar{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:#000;border-bottom:2px solid rgba(255,255,255,.06);position:sticky;top:0;z-index:20}
  .kds2-topbar-left{display:flex;flex-direction:column;gap:1px}
  .kds2-brand{font-family:'Anton',sans-serif;font-size:18px;letter-spacing:3px;color:#fff;line-height:1}
  .kds2-brandbar{font-size:8px;letter-spacing:3px;color:rgba(255,255,255,.3);text-transform:uppercase;font-family:'Outfit',sans-serif;font-weight:600}
  .kds2-topbar-center{flex:1;display:flex;justify-content:center}
  .kds2-clock{font-family:'Anton',sans-serif;font-size:26px;letter-spacing:4px;color:rgba(255,255,255,.15)}
  .kds2-topbar-right{display:flex;gap:8px;align-items:center}
  .kds2-counter{display:flex;flex-direction:column;align-items:center;padding:6px 14px;gap:1px;border:1px solid;min-width:52px}
  .kds2-counter span:first-child{font-family:'Anton',sans-serif;font-size:22px;line-height:1}
  .kds2-counter span:last-child{font-size:7px;letter-spacing:2px;font-family:'Anton',sans-serif}
  .kds2-counter-fire{background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.35);color:#fbbf24}
  .kds2-counter-done{background:rgba(74,222,128,.08);border-color:rgba(74,222,128,.35);color:#4ade80}

  /* EMPTY STATE */
  .kds2-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;text-align:center;gap:14px}
  .kds2-empty-check{font-family:'Anton',sans-serif;font-size:72px;color:rgba(74,222,128,.2);line-height:1}
  .kds2-empty-title{font-family:'Anton',sans-serif;font-size:28px;letter-spacing:4px;color:rgba(255,255,255,.2)}
  .kds2-empty-sub{font-size:13px;color:rgba(255,255,255,.15);letter-spacing:1px;max-width:260px;line-height:1.7}

  /* TWO-LANE GRID */
  .kds2-lanes{display:grid;grid-template-columns:1fr 1fr;gap:0;min-height:calc(100vh - 80px)}
  .kds2-lane{display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,.06)}
  .kds2-lane:last-child{border-right:none}

  /* LANE HEADERS */
  .kds2-lane-header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06);position:sticky;top:65px;z-index:10;background:#0a0a0a}
  .kds2-lane-header-fire{border-bottom-color:rgba(251,191,36,.2)}
  .kds2-lane-header-done{border-bottom-color:rgba(74,222,128,.2)}
  .kds2-lane-icon{font-size:18px;line-height:1}
  .kds2-lane-title{font-family:'Anton',sans-serif;font-size:14px;letter-spacing:3px;color:rgba(255,255,255,.7);flex:1}
  .kds2-lane-count{font-family:'Anton',sans-serif;font-size:20px;color:rgba(255,255,255,.3)}
  .kds2-lane-header-fire .kds2-lane-count{color:#fbbf24}
  .kds2-lane-header-done .kds2-lane-count{color:#4ade80}

  /* TICKETS LIST */
  .kds2-tickets{display:flex;flex-direction:column;gap:10px;padding:12px 10px}
  .kds2-lane-empty{text-align:center;padding:40px 20px;color:rgba(255,255,255,.15);font-size:12px;letter-spacing:2px;text-transform:uppercase;font-family:'Anton',sans-serif}

  /* TICKET CARD */
  .kds2-ticket{background:#111;border:1px solid rgba(255,255,255,.08);padding:16px;position:relative;overflow:hidden;transition:box-shadow .3s,border-color .3s}
  .kds2-ticket::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--ticket-color,rgba(255,255,255,.1))}
  .kds2-ticket-urgent{border-color:rgba(239,68,68,.45);background:rgba(239,68,68,.04);animation:kds2-pulse 1.6s ease-in-out infinite}
  .kds2-ticket-ready{border-color:rgba(74,222,128,.25);background:rgba(74,222,128,.04)}
  .kds2-ticket-ready::before{background:#4ade80}
  @keyframes kds2-pulse{0%,100%{box-shadow:none}50%{box-shadow:0 0 0 3px rgba(239,68,68,.15),inset 0 0 20px rgba(239,68,68,.04)}}

  /* TICKET HEAD (table + timer) */
  .kds2-ticket-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px}
  .kds2-ticket-table{font-family:'Anton',sans-serif;font-size:38px;letter-spacing:1px;color:#fff;line-height:1}
  .kds2-ticket-timer{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:1.5px;padding:4px 9px;border:1px solid;line-height:1;align-self:flex-start;margin-top:6px}
  .kds2-ticket-ready-badge{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:1.5px;color:#4ade80;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.3);padding:4px 9px;align-self:flex-start;margin-top:8px}

  /* CUSTOMER */
  .kds2-ticket-customer{font-size:10px;color:rgba(255,255,255,.3);letter-spacing:1.5px;text-transform:uppercase;font-weight:600;margin-bottom:14px}

  /* DASHED SEPARATOR */
  .kds2-ticket-sep{border:none;border-top:1px dashed rgba(255,255,255,.1);margin-bottom:14px}

  /* ITEMS */
  .kds2-ticket-items{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}
  .kds2-ticket-item{display:flex;align-items:flex-start;gap:10px}
  .kds2-item-done{opacity:.45}
  .kds2-item-qty{font-family:'Anton',sans-serif;font-size:20px;color:rgba(255,255,255,.4);min-width:28px;flex-shrink:0;line-height:1.2}
  .kds2-item-right{display:flex;flex-direction:column;gap:3px}
  .kds2-item-name{font-family:'Anton',sans-serif;font-size:20px;letter-spacing:.5px;color:#fff;line-height:1.2}
  .kds2-item-note{font-size:11px;color:rgba(251,191,36,.7);font-style:italic;line-height:1.4}

  /* ACTION BUTTONS */
  .kds2-btn-ready{width:100%;padding:14px;background:#fbbf24;border:none;font-family:'Anton',sans-serif;font-size:13px;letter-spacing:2.5px;color:#000;cursor:pointer;transition:background .15s,transform .1s}
  .kds2-btn-ready:hover{background:#f59e0b;transform:translateY(-1px)}
  .kds2-btn-ready:active{transform:translateY(0)}
  .kds2-btn-ready:disabled{opacity:.5;cursor:not-allowed;transform:none}
  .kds2-btn-dismiss{width:100%;padding:11px;background:transparent;border:1px solid rgba(74,222,128,.25);font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2px;color:#4ade80;cursor:pointer;transition:all .15s}
  .kds2-btn-dismiss:hover{background:rgba(74,222,128,.08);border-color:rgba(74,222,128,.5)}
`;

