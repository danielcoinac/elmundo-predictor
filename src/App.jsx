import { useState, useEffect, useCallback } from "react";

/* ─── ADMIN CONFIG — change this to your own email ─────────────────────────── */
const ADMIN_EMAIL = "admin@elmundo.com";
const ADMIN_PASS  = "ElMundo2026!";

/* ─── Supabase ──────────────────────────────────────────────────────────────── */
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/* ─── Storage (rules/sponsors only — still use local storage) ──────────────── */
async function sget(k) { try { const r = await window.storage.get(k, true); return r ? JSON.parse(r.value) : null; } catch { return null; } }
async function sset(k, v) { try { await window.storage.set(k, JSON.stringify(v), true); } catch {} }

/* ─── Default Matches ──────────────────────────────────────────────────────── */
const DEFAULT_MATCHES = [
  { id:"g1", home:"Brazil",      away:"Argentina",   date:"Jun 15", time:"18:00", status:"upcoming", hs:null, as:null, group:"Group A" },
  { id:"g2", home:"France",      away:"Germany",     date:"Jun 15", time:"21:00", status:"upcoming", hs:null, as:null, group:"Group B" },
  { id:"g3", home:"Spain",       away:"Portugal",    date:"Jun 16", time:"18:00", status:"upcoming", hs:null, as:null, group:"Group C" },
  { id:"g4", home:"England",     away:"Netherlands", date:"Jun 16", time:"21:00", status:"upcoming", hs:null, as:null, group:"Group D" },
  { id:"g5", home:"Italy",       away:"Croatia",     date:"Jun 17", time:"18:00", status:"upcoming", hs:null, as:null, group:"Group E" },
  { id:"g6", home:"Morocco",     away:"Senegal",     date:"Jun 17", time:"21:00", status:"upcoming", hs:null, as:null, group:"Group F" },
  { id:"r1", home:"Uruguay",     away:"Mexico",      date:"Jun 12", time:"18:00", status:"finished",  hs:2,    as:1,   group:"Group G" },
  { id:"r2", home:"USA",         away:"Canada",      date:"Jun 12", time:"21:00", status:"finished",  hs:1,    as:1,   group:"Group H" },
];

/* ─── Default Rules ────────────────────────────────────────────────────────── */
const DEFAULT_RULES = [
  { id:"r1", title:"How to Play",        body:"Register your account and predict the exact final score for each match before it starts. You cannot change your prediction once the match has kicked off." },
  { id:"r2", title:"Points System",      body:"Predict the exact final score correctly and earn 5 points. An incorrect prediction earns 0 points. There are no partial points." },
  { id:"r3", title:"Leaderboard",        body:"The player with the most points at the end of the tournament wins. The leaderboard updates automatically every time a match result is entered." },
  { id:"r4", title:"Tiebreaker",         body:"In case of a tie in points, the player who registered first will be ranked higher." },
  { id:"r5", title:"Fair Play",          body:"One account per person. Any attempt to cheat or create multiple accounts will result in immediate disqualification." },
];

/* ─── Default Sponsors ─────────────────────────────────────────────────────── */
const DEFAULT_SPONSORS = [
  { id:"s1", name:"El Mundo Bar-Rest", role:"Main Sponsor", detail:"Est. 2009 — Bonaire", emoji:"🏆" },
  { id:"s2", name:"Your Business Here", role:"Gold Sponsor",  detail:"Contact us to become a sponsor", emoji:"⭐" },
  { id:"s3", name:"Your Business Here", role:"Silver Sponsor", detail:"Contact us to become a sponsor", emoji:"🥈" },
];

const FLAGS = {
  Brazil:"🇧🇷",Argentina:"🇦🇷",France:"🇫🇷",Germany:"🇩🇪",Spain:"🇪🇸",
  Portugal:"🇵🇹",England:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",Netherlands:"🇳🇱",Italy:"🇮🇹",Croatia:"🇭🇷",
  Morocco:"🇲🇦",Senegal:"🇸🇳",Uruguay:"🇺🇾",Mexico:"🇲🇽",USA:"🇺🇸",Canada:"🇨🇦",
};
const flag = t => FLAGS[t] || "⚽";

/* ─── SVG Logos ────────────────────────────────────────────────────────────── */
const Logo = ({ w = 160 }) => (
  <svg width={w} height={w} viewBox="0 0 200 200">
    <rect width="200" height="200" fill="#000"/>
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
  const [page,     setPage]     = useState("splash");
  const [authTab,  setAuthTab]  = useState("login");
  const [appTab,   setAppTab]   = useState("matches");
  const [user,     setUser]     = useState(null);
  const [users,    setUsers]    = useState({});
  const [preds,    setPreds]    = useState({});
  const [matches,  setMatches]  = useState(DEFAULT_MATCHES);
  const [rules,    setRules]    = useState(DEFAULT_RULES);
  const [sponsors, setSponsors] = useState(DEFAULT_SPONSORS);
  const [toast,    setToast]    = useState(null);
  const [form,     setForm]     = useState({ name:"", email:"", phone:"", password:"" });
  const [formErr,  setFormErr]  = useState("");

  /* Load on mount: session + matches + predictions + rules + sponsors */
  useEffect(() => {
    (async () => {
      /* rules & sponsors from local storage (admin editable, no DB needed) */
      const rl = await sget("em_rules");
      const sp = await sget("em_sponsors");
      if (rl) setRules(rl);
      if (sp) setSponsors(sp);

      /* matches from Supabase */
      const { data: mRows } = await supabase.from("matches").select("*");
      if (mRows && mRows.length > 0) {
        setMatches(mRows.map(r => ({
          id: r.id, home: r.home, away: r.away,
          group: r.match_group, date: r.match_date,
          time: r.match_time, status: r.status,
          hs: r.home_score, as: r.away_score
        })));
      }

      /* check existing session */
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase.from("profiles")
          .select("*").eq("id", session.user.id).single();
        if (profile) {
          setUser({ ...session.user, ...profile });
          /* load this user's predictions */
          const { data: predRows } = await supabase.from("predictions")
            .select("*").eq("user_id", session.user.id);
          if (predRows) {
            const predMap = {};
            predRows.forEach(p => { predMap[`${session.user.id}__${p.match_id}`] = { h: p.home_pred, a: p.away_pred }; });
            setPreds(predMap);
          }
          /* load all profiles for leaderboard */
          const { data: allProfiles } = await supabase.from("profiles").select("*");
          if (allProfiles) {
            const usersMap = {};
            allProfiles.forEach(p => { usersMap[p.id] = p; });
            setUsers(usersMap);
          }
          setPage("app");
          return;
        }
      }
      setTimeout(() => setPage("auth"), 2500);
    })();
  }, []);

  /* Poll every 15s for live match/score/leaderboard updates */
  useEffect(() => {
    if (page !== "app") return;
    const id = setInterval(async () => {
      const { data: mRows } = await supabase.from("matches").select("*");
      if (mRows && mRows.length > 0) {
        setMatches(mRows.map(r => ({
          id: r.id, home: r.home, away: r.away,
          group: r.match_group, date: r.match_date,
          time: r.match_time, status: r.status,
          hs: r.home_score, as: r.away_score
        })));
      }
      const { data: allProfiles } = await supabase.from("profiles").select("*");
      if (allProfiles) {
        const usersMap = {};
        allProfiles.forEach(p => { usersMap[p.id] = p; });
        setUsers(usersMap);
      }
      const { data: allPreds } = await supabase.from("predictions").select("*");
      if (allPreds) {
        const predMap = {};
        allPreds.forEach(p => { predMap[`${p.user_id}__${p.match_id}`] = { h: p.home_pred, a: p.away_pred }; });
        setPreds(predMap);
      }
    }, 15000);
    return () => clearInterval(id);
  }, [page]);

  const toast$ = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3200); };

  /* ── Auth ── */
  const doRegister = async () => {
    setFormErr("");
    if (!form.name.trim())                 return setFormErr("Full name is required.");
    if (!/\S+@\S+\.\S+/.test(form.email)) return setFormErr("Enter a valid email address.");
    if (!form.phone.trim())                return setFormErr("Phone number is required.");
    if (form.password.length < 6)          return setFormErr("Password must be at least 6 characters.");
    const { data, error } = await supabase.auth.signUp({ email: form.email, password: form.password });
    if (error) return setFormErr(error.message);
    await supabase.from("profiles").upsert({ id: data.user.id, name: form.name, phone: form.phone });
    setUser({ ...data.user, name: form.name, phone: form.phone, is_admin: false });
    setPage("app");
    toast$(`Welcome, ${form.name}! ⚽`);
  };

  const doLogin = async () => {
    setFormErr("");
    if (!form.email || !form.password) return setFormErr("Please fill in all fields.");
    const { data, error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
    if (error) return setFormErr("Incorrect email or password.");
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
    setUser({ ...data.user, ...profile });
    /* load predictions */
    const { data: predRows } = await supabase.from("predictions").select("*").eq("user_id", data.user.id);
    if (predRows) {
      const predMap = {};
      predRows.forEach(p => { predMap[`${data.user.id}__${p.match_id}`] = { h: p.home_pred, a: p.away_pred }; });
      setPreds(predMap);
    }
    /* load all profiles for leaderboard */
    const { data: allProfiles } = await supabase.from("profiles").select("*");
    if (allProfiles) {
      const usersMap = {};
      allProfiles.forEach(p => { usersMap[p.id] = p; });
      setUsers(usersMap);
    }
    setPage("app");
    toast$(`Welcome back, ${profile.name}!`);
  };

  const doLogout = async () => {
    await supabase.auth.signOut();
    setUser(null); setPage("auth");
    setForm({ name:"", email:"", phone:"", password:"" });
    setPreds({}); setUsers({});
  };

  /* ── Predictions ── */
  const getPred = id => preds[`${user?.id}__${id}`] || null;
  const savePred = async (id, h, a) => {
    const { error } = await supabase.from("predictions").upsert(
      { user_id: user.id, match_id: id, home_pred: +h, away_pred: +a },
      { onConflict: "user_id,match_id" }
    );
    if (error) { toast$("Error saving prediction", false); return; }
    const k = `${user.id}__${id}`;
    setPreds(p => ({ ...p, [k]: { h:+h, a:+a } }));
    toast$("Prediction saved ⚽");
  };

  /* ── Admin: matches ── */
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

  /* ── Admin: rules ── */
  const adminSaveRules = async (newRules) => {
    setRules(newRules); await sset("em_rules", newRules); toast$("Rules saved ✓");
  };

  /* ── Admin: sponsors ── */
  const adminSaveSponsors = async (newSponsors) => {
    setSponsors(newSponsors); await sset("em_sponsors", newSponsors); toast$("Sponsors saved ✓");
  };

  /* ── Points ── */
  const pts = useCallback((uid) =>
    matches.filter(m => m.status === "finished").reduce((acc, m) => {
      const p = preds[`${uid}__${m.id}`];
      return acc + (p && p.h === m.hs && p.a === m.as ? 5 : 0);
    }, 0), [matches, preds]);

  const board = Object.values(users)
    .map(u => ({ ...u, pts: pts(u.id) }))
    .sort((a, b) => b.pts - a.pts).slice(0, 10);

  const isAdmin = user?.is_admin === true;

  return (
    <div style={{ fontFamily:"'Outfit',sans-serif", background:"#000", minHeight:"100vh", color:"#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Anton&family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{CSS}</style>

      {toast && <div className={`toast ${toast.ok?"tok":"terr"}`}>{toast.msg}</div>}

      {page === "splash" && <Splash />}
      {page === "auth"   && (
        <Auth tab={authTab} setTab={setAuthTab} form={form} setForm={setForm}
              err={formErr} setErr={setFormErr} onLogin={doLogin} onRegister={doRegister} />
      )}
      {page === "app" && (
        <Main
          appTab={appTab} setAppTab={setAppTab}
          user={user} isAdmin={isAdmin}
          board={board} preds={preds} matches={matches}
          rules={rules} sponsors={sponsors}
          getPred={getPred} savePred={savePred} pts={pts}
          onLogout={doLogout}
          adminUpdateMatch={adminUpdateMatch}
          adminAddMatch={adminAddMatch}
          adminDeleteMatch={adminDeleteMatch}
          adminSaveRules={adminSaveRules}
          adminSaveSponsors={adminSaveSponsors}
        />
      )}
    </div>
  );
}

/* ═══ SPLASH ════════════════════════════════════════════════════════════════ */
function Splash() {
  return (
    <div className="splash">
      <div className="sp-inner">
        <div className="sp-logo"><Logo w={156} /></div>
        <div className="sp-divider" />
        <p className="sp-label">WORLD CUP EVENT 2026</p>
        <div className="sp-dots">{[0,1,2].map(i=><span key={i} className="sp-dot" style={{animationDelay:`${i*0.2}s`}}/>)}</div>
      </div>
    </div>
  );
}

/* ═══ AUTH ══════════════════════════════════════════════════════════════════ */
function Auth({ tab, setTab, form, setForm, err, setErr, onLogin, onRegister }) {
  const set = k => e => { setForm(f=>({...f,[k]:e.target.value})); setErr(""); };
  const isLogin = tab === "login";
  return (
    <div className="auth-root">
      <div className="auth-grid-bg" />
      <div className="auth-wrap">
        <div className="auth-hero">
          <Logo w={160} />
          <div className="auth-event">
            <span className="auth-event-rule" />
            <span className="auth-event-text">WORLD CUP EVENT 2026</span>
            <span className="auth-event-rule" />
          </div>
        </div>
        <div className="auth-panel">
          <div className="auth-tabs">
            <button className={`auth-tab ${isLogin?"atab-on":""}`} onClick={()=>{setTab("login");setErr("");}}>Sign In</button>
            <button className={`auth-tab ${!isLogin?"atab-on":""}`} onClick={()=>{setTab("register");setErr("");}}>Register</button>
          </div>
          <div className="auth-form">
            {!isLogin && <>
              <FField label="Full Name"    val={form.name}     on={set("name")}     ph="John Doe"          />
              <FField label="Phone Number" val={form.phone}    on={set("phone")}    ph="+599 700 0000"     />
            </>}
            <FField label="Email Address"  val={form.email}    on={set("email")}    ph="you@email.com"     type="email"    />
            <FField label="Password"       val={form.password} on={set("password")} ph="Min. 6 characters" type="password" />
            {err && <div className="auth-err"><span className="auth-err-dot">!</span>{err}</div>}
            <button className="auth-cta" onClick={isLogin ? onLogin : onRegister}>
              {isLogin ? "SIGN IN" : "CREATE ACCOUNT"}
            </button>
            <p className="auth-footer-text">
              {isLogin ? "Don't have an account? " : "Already registered? "}
              <span className="auth-footer-link" onClick={()=>{setTab(isLogin?"register":"login");setErr("");}}>
                {isLogin ? "Register here" : "Sign in"}
              </span>
            </p>
          </div>
        </div>
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

/* ═══ MAIN SHELL ════════════════════════════════════════════════════════════ */
function Main({ appTab, setAppTab, user, isAdmin, board, preds, matches, rules, sponsors,
                getPred, savePred, pts, onLogout,
                adminUpdateMatch, adminAddMatch, adminDeleteMatch,
                adminSaveRules, adminSaveSponsors }) {
  const myPts  = pts(user.id);
  const myRank = board.findIndex(u => u.id === user.id) + 1;

  const tabs = [
    { id:"matches",     label:"Matches",   ico:<SoccerIco /> },
    { id:"leaderboard", label:"Ranking",   ico:<TrophyIco /> },
    { id:"rules",       label:"Rules",     ico:<RulesIco />  },
    { id:"sponsors",    label:"Sponsors",  ico:<StarIco />   },
    { id:"profile",     label:"Profile",   ico:<PersonIco /> },
    ...(isAdmin ? [{ id:"admin", label:"Admin", ico:<AdminIco /> }] : []),
  ];

  return (
    <div className="shell">
      <header className="hdr">
        <div className="hdr-l">
          <HeaderLogo />
          <div className="hdr-text">
            <span className="hdr-brand">EL MUNDO</span>
            <span className="hdr-caption">World Cup Predictor{isAdmin?" · Admin":""}</span>
          </div>
        </div>
        <div className="hdr-r">
          {!isAdmin && (
            <div className="hdr-score">
              <span className="hdr-score-n">{myPts}</span>
              <span className="hdr-score-u">PTS{myRank > 0 ? ` · #${myRank}` : ""}</span>
            </div>
          )}
          {isAdmin && <span className="admin-badge">ADMIN</span>}
          <button className="hdr-out" onClick={onLogout} title="Log out"><LogoutIco /></button>
        </div>
      </header>

      <main className="body">
        {appTab === "matches"     && <MatchesView matches={matches} getPred={getPred} savePred={savePred} />}
        {appTab === "leaderboard" && <LeaderView  board={board} user={user} />}
        {appTab === "rules"       && <RulesView   rules={rules} />}
        {appTab === "sponsors"    && <SponsorsView sponsors={sponsors} />}
        {appTab === "profile"     && <ProfileView user={user} myPts={myPts} myRank={myRank} preds={preds} matches={matches} />}
        {appTab === "admin" && isAdmin && (
          <AdminView
            matches={matches} rules={rules} sponsors={sponsors}
            onUpdate={adminUpdateMatch} onAdd={adminAddMatch} onDelete={adminDeleteMatch}
            onSaveRules={adminSaveRules} onSaveSponsors={adminSaveSponsors}
          />
        )}
      </main>

      <nav className="bot-nav">
        {tabs.map(({ id, label, ico }) => (
          <button key={id} className={`bnav-btn ${appTab===id?"bnav-on":""}`} onClick={()=>setAppTab(id)}>
            <span className="bnav-ico">{ico}</span>
            <span className="bnav-lbl">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ═══ MATCHES ═══════════════════════════════════════════════════════════════ */
function MatchesView({ matches, getPred, savePred }) {
  const upcoming = matches.filter(m => m.status === "upcoming");
  const finished = matches.filter(m => m.status === "finished");
  return (
    <div className="vpad">
      <SecHead title="Upcoming Matches" sub="Predict the exact score — 5 pts per correct answer" />
      <div className="card-stack">
        {upcoming.length === 0 && <div className="empty">No upcoming matches yet.</div>}
        {upcoming.map(m => <MatchCard key={m.id} m={m} pred={getPred(m.id)} onSave={savePred} />)}
      </div>
      <SecHead title="Finished Matches" sub="Results & your predictions" />
      <div className="card-stack">
        {finished.length === 0 && <div className="empty">No finished matches yet.</div>}
        {finished.map(m => <MatchCard key={m.id} m={m} pred={getPred(m.id)} onSave={savePred} />)}
      </div>
    </div>
  );
}

/* Parse "Jun 15 2026 18:00" → Date object using match date/time */
function matchKickoff(m) {
  try {
    const year = 2026;
    return new Date(`${m.date} ${year} ${m.time}:00 UTC`);
  } catch { return null; }
}
function minsUntilKickoff(m) {
  const ko = matchKickoff(m);
  if (!ko) return Infinity;
  return (ko - Date.now()) / 60000;
}

function MatchCard({ m, pred, onSave }) {
  const [h, setH] = useState(pred?.h ?? "");
  const [a, setA] = useState(pred?.a ?? "");
  const [saved, setSaved] = useState(!!pred);
  const fin       = m.status === "finished";
  const correct   = fin && pred && pred.h === m.hs && pred.a === m.as;
  const wrong     = fin && pred && !correct;
  const minsLeft  = minsUntilKickoff(m);
  const locked    = !fin && minsLeft <= 60;   /* lock 1hr before */
  const submitted = !!pred;                   /* once submitted, can't change */

  const save = () => {
    if (h===""||a===""||locked||submitted) return;
    onSave(m.id, h, a);
    setSaved(true);
  };

  return (
    <div className={`mcard ${correct?"mcard-ok":wrong?"mcard-ng":locked&&!fin?"mcard-locked":""}`}>
      <div className="mcard-meta">
        <span className="mcard-group">{m.group}</span>
        <span className="mcard-dt">{m.date} · {m.time} UTC</span>
        {locked && !fin && (
          <span className="lock-chip">🔒 {minsLeft < 1 ? "Locked" : `Locks in ${Math.round(minsLeft)}m`}</span>
        )}
      </div>
      <div className="mcard-body">
        <div className="mteam">
          <span className="mteam-flag">{flag(m.home)}</span>
          <span className="mteam-name">{m.home}</span>
        </div>
        {fin ? (
          <div className="mscore-final">
            <span className="mscore-num">{m.hs} – {m.as}</span>
            <span className="mscore-lbl">FINAL</span>
          </div>
        ) : submitted ? (
          /* Already predicted — show locked prediction, no editing */
          <div className="mscore-final" style={{borderColor:"rgba(34,197,94,.3)"}}>
            <span className="mscore-num" style={{fontSize:22}}>{pred.h} – {pred.a}</span>
            <span className="mscore-lbl">YOUR PICK</span>
          </div>
        ) : locked ? (
          /* Locked, no prediction yet */
          <div className="mscore-final" style={{borderColor:"rgba(255,255,255,.06)"}}>
            <span style={{fontSize:22}}>🔒</span>
            <span className="mscore-lbl">LOCKED</span>
          </div>
        ) : (
          <div className="mscore-input">
            <input className="sinput" type="number" min="0" max="20" value={h} onChange={e=>setH(e.target.value)} placeholder="0" />
            <span className="ssep">–</span>
            <input className="sinput" type="number" min="0" max="20" value={a} onChange={e=>setA(e.target.value)} placeholder="0" />
          </div>
        )}
        <div className="mteam mteam-r">
          <span className="mteam-flag">{flag(m.away)}</span>
          <span className="mteam-name">{m.away}</span>
        </div>
      </div>
      {!fin && !submitted && !locked && (
        <div className="mcard-foot">
          <button className={`pred-cta ${saved?"pred-cta-done":""}`} disabled={h===""||a===""} onClick={save}>
            {saved ? <><IcoCheck />Prediction Saved</> : "Submit Prediction"}
          </button>
        </div>
      )}
      {!fin && submitted && (
        <div className="mverdict mv-locked">
          <IcoCheck />Prediction locked in — {pred.h} – {pred.a}
        </div>
      )}
      {!fin && locked && !submitted && (
        <div className="mverdict mv-ng">
          <IcoX />Predictions closed for this match
        </div>
      )}
      {fin && (
        <div className={`mverdict ${correct?"mv-ok":"mv-ng"}`}>
          {correct ? <><IcoCheck />Correct prediction — +5 points</>
            : pred  ? <><IcoX />Incorrect — Your pick: {pred.h} – {pred.a}</>
            :         <><IcoDash />No prediction submitted</>}
        </div>
      )}
    </div>
  );
}

/* ═══ LEADERBOARD ═══════════════════════════════════════════════════════════ */
function LeaderView({ board, user }) {
  const M = ["🥇","🥈","🥉"];
  return (
    <div className="vpad">
      <SecHead title="Leaderboard" sub="Top 10 players · updates automatically" />
      {board[0] && (
        <div className="leader-hero">
          <div className="lh-crown">👑</div>
          <div className="lh-name">{board[0].name}</div>
          <div className="lh-pts">{board[0].pts}<span> pts</span></div>
          <div className="lh-tag">CURRENT LEADER</div>
        </div>
      )}
      <div className="lboard">
        {board.map((u,i) => (
          <div key={u.id} className={`lrow ${u.id===user.id?"lrow-me":""}`}>
            <div className="lrank">{i<3 ? M[i] : <span className="lrank-n">#{i+1}</span>}</div>
            <div className="linfo">
              <span className="lname">{u.name}</span>
              {u.id===user.id && <span className="you-chip">YOU</span>}
            </div>
            <div className="lpts-wrap">
              <span className="lpts-n">{u.pts}</span>
              <span className="lpts-u">pts</span>
            </div>
          </div>
        ))}
        {board.length===0 && <div className="empty">No players yet — be the first!</div>}
      </div>
    </div>
  );
}

/* ═══ RULES VIEW ════════════════════════════════════════════════════════════ */
function RulesView({ rules }) {
  return (
    <div className="vpad">
      <SecHead title="Event Rules" sub="Please read before playing" />
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
function SponsorsView({ sponsors }) {
  return (
    <div className="vpad">
      <SecHead title="Our Sponsors" sub="Thank you for making this event possible" />

      {/* Main / first sponsor — bigger card */}
      {sponsors[0] && (
        <div className="sponsor-hero">
          <div className="sponsor-hero-emoji">{sponsors[0].emoji}</div>
          <div className="sponsor-hero-role">{sponsors[0].role}</div>
          <div className="sponsor-hero-name">{sponsors[0].name}</div>
          <div className="sponsor-hero-detail">{sponsors[0].detail}</div>
        </div>
      )}

      {/* Rest of sponsors */}
      <div className="card-stack">
        {sponsors.slice(1).map(s => (
          <div key={s.id} className="sponsor-card">
            <div className="sponsor-emoji">{s.emoji}</div>
            <div className="sponsor-info">
              <div className="sponsor-role">{s.role}</div>
              <div className="sponsor-name">{s.name}</div>
              {s.detail && <div className="sponsor-detail">{s.detail}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="sponsor-cta-box">
        <div className="sponsor-cta-title">Want to become a sponsor?</div>
        <div className="sponsor-cta-body">Contact El Mundo Bar-Rest to learn about sponsorship opportunities for the World Cup event.</div>
      </div>
    </div>
  );
}

/* ═══ PROFILE ═══════════════════════════════════════════════════════════════ */
function ProfileView({ user, myPts, myRank, preds, matches }) {
  const fin  = matches.filter(m => m.status==="finished");
  const sub  = fin.filter(m => !!preds[`${user.id}__${m.id}`]).length;
  const corr = fin.filter(m => { const p=preds[`${user.id}__${m.id}`]; return p&&p.h===m.hs&&p.a===m.as; }).length;
  const acc  = sub>0 ? Math.round(corr/sub*100) : 0;
  return (
    <div className="vpad">
      <SecHead title="My Profile" sub="Your tournament stats" />
      <div className="prof-card">
        <div className="prof-av">{user.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
        <div className="prof-name">{user.name}</div>
        <div className="prof-detail">{user.email}</div>
        <div className="prof-detail">{user.phone}</div>
        {myRank===1 && <div className="prof-leader">👑 Currently Leading the Tournament</div>}
      </div>
      <div className="stats-grid">
        {[
          {v:myPts,                       u:"pts",     l:"Total Points"},
          {v:myRank>0?`#${myRank}`:"—",  u:"",        l:"Your Rank"},
          {v:corr,                        u:`/${sub}`, l:"Correct"},
          {v:acc,                         u:"%",       l:"Accuracy"},
        ].map(s => (
          <div key={s.l} className="scard">
            <div className="sval">{s.v}<span className="sunit">{s.u}</span></div>
            <div className="slbl">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="info-card">
        <div className="info-ico">⚽</div>
        <div className="info-title">How Points Work</div>
        <p className="info-body">Predict the exact final score for each match. A correct prediction earns <strong>5 points</strong>. Incorrect = 0. Most points at tournament end wins.</p>
      </div>
    </div>
  );
}

/* ═══ ADMIN VIEW ════════════════════════════════════════════════════════════ */
function AdminView({ matches, rules, sponsors, onUpdate, onAdd, onDelete, onSaveRules, onSaveSponsors }) {
  const [section, setSection] = useState("matches");
  return (
    <div className="vpad">
      <SecHead title="Admin Panel" sub="Manage all content from here" />

      {/* Admin sub-tabs */}
      <div className="admin-subtabs">
        {[
          { id:"matches",  label:"⚽ Matches"  },
          { id:"rules",    label:"📋 Rules"    },
          { id:"sponsors", label:"⭐ Sponsors" },
        ].map(t => (
          <button key={t.id} className={`admin-subtab ${section===t.id?"ast-on":""}`} onClick={()=>setSection(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {section === "matches"  && <AdminMatches  matches={matches}   onUpdate={onUpdate} onAdd={onAdd} onDelete={onDelete} />}
      {section === "rules"    && <AdminRules    rules={rules}       onSave={onSaveRules} />}
      {section === "sponsors" && <AdminSponsors sponsors={sponsors} onSave={onSaveSponsors} />}
    </div>
  );
}

/* ── Admin: Matches ── */
function AdminMatches({ matches, onUpdate, onAdd, onDelete }) {
  const [editId,  setEditId]  = useState(null);
  const [addMode, setAddMode] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [ef, setEf] = useState({});
  const startEdit = m => { setEditId(m.id); setEf({...m, hs:m.hs??'', as:m.as??''}); setAddMode(false); };
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
  const upcoming = matches.filter(m=>m.status==="upcoming");
  const finished = matches.filter(m=>m.status==="finished");
  return (
    <div>
      <div className="admin-topbar">
        <div className="admin-section-lbl" style={{margin:0}}>MATCHES</div>
        <button className="admin-add-btn" onClick={()=>{setAddMode(v=>!v);setEditId(null);}}>
          {addMode ? "✕ Cancel" : "+ Add Match"}
        </button>
      </div>

      {addMode && (
        <div className="admin-form-card" style={{marginTop:12}}>
          <div className="admin-form-title">NEW MATCH</div>
          <div className="admin-form-grid">
            <AField label="Home Team"  val={af.home}  on={afSet("home")}  ph="e.g. Brazil"  />
            <AField label="Away Team"  val={af.away}  on={afSet("away")}  ph="e.g. France"  />
            <AField label="Date"       val={af.date}  on={afSet("date")}  ph="e.g. Jun 20"  />
            <AField label="Time (UTC)" val={af.time}  on={afSet("time")}  ph="18:00"        />
            <AField label="Group"      val={af.group} on={afSet("group")} ph="Group A"      />
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
        <span className="admin-row-dt">{m.date} · {m.time}</span>
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
        <AField label="Home Team"  val={ef.home}  on={efSet("home")}  ph="Home"    />
        <AField label="Away Team"  val={ef.away}  on={efSet("away")}  ph="Away"    />
        <AField label="Date"       val={ef.date}  on={efSet("date")}  ph="Jun 15"  />
        <AField label="Time (UTC)" val={ef.time}  on={efSet("time")}  ph="18:00"   />
        <AField label="Group"      val={ef.group} on={efSet("group")} ph="Group A" />
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

/* ── Admin: Rules editor ── */
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
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10}}>
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
      <button className="admin-save-btn" style={{width:"100%", marginTop:14, padding:14}} onClick={()=>onSave(local)}>
        Save All Rules
      </button>
      <div className="admin-hint" style={{marginTop:8}}>💡 Changes appear instantly for all players after saving.</div>
    </div>
  );
}

/* ── Admin: Sponsors editor ── */
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
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10}}>
              <span className="admin-form-title" style={{margin:0}}>SPONSOR {i+1}{i===0?" — MAIN SPONSOR":""}</span>
              <button className="admin-del-btn" onClick={()=>removeSponsor(s.id)}>✕</button>
            </div>
            <div className="admin-form-grid">
              <AField label="Business Name" val={s.name}   on={e=>update(s.id,"name",e.target.value)}   ph="e.g. El Mundo Bar"    />
              <AField label="Role / Tier"   val={s.role}   on={e=>update(s.id,"role",e.target.value)}   ph="e.g. Gold Sponsor"    />
              <AField label="Details"       val={s.detail} on={e=>update(s.id,"detail",e.target.value)} ph="e.g. website or tagline" />
              <AField label="Emoji / Icon"  val={s.emoji}  on={e=>update(s.id,"emoji",e.target.value)}  ph="⭐"                   />
            </div>
          </div>
        ))}
      </div>
      <button className="admin-save-btn" style={{width:"100%", marginTop:14, padding:14}} onClick={()=>onSave(local)}>
        Save All Sponsors
      </button>
      <div className="admin-hint" style={{marginTop:8}}>💡 The first sponsor in the list appears as the main featured sponsor.</div>
    </div>
  );
}

function AField({ label, val, on, ph }) {
  return (
    <div className="afield">
      <label className="afield-lbl">{label}</label>
      <input className="afield-inp" value={val} onChange={on} placeholder={ph} autoComplete="off" />
    </div>
  );
}

/* ═══ SHARED ════════════════════════════════════════════════════════════════ */
function SecHead({ title, sub }) {
  return (
    <div className="sechead">
      <h2 className="sectitle">{title}</h2>
      {sub && <p className="secsub">{sub}</p>}
    </div>
  );
}

/* Icons */
const SoccerIco = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20M12 2C8 6 8 18 12 22M12 2c4 4 4 16 0 20M2 12h20"/></svg>;
const TrophyIco = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M6 2h12v7a6 6 0 0 1-12 0V2z"/></svg>;
const PersonIco = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const AdminIco  = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const LogoutIco = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const RulesIco  = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
const StarIco   = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const IcoCheck  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{display:"inline",marginRight:5,verticalAlign:"middle"}}><polyline points="20 6 9 17 4 12"/></svg>;
const IcoX      = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{display:"inline",marginRight:5,verticalAlign:"middle"}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IcoDash   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{display:"inline",marginRight:5,verticalAlign:"middle"}}><line x1="5" y1="12" x2="19" y2="12"/></svg>;

/* ═══ CSS ════════════════════════════════════════════════════════════════════ */
const CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
  ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:99px}

  .toast{position:fixed;top:18px;left:50%;transform:translateX(-50%);padding:11px 24px;border-radius:99px;
    font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;letter-spacing:.3px;white-space:nowrap;
    z-index:9999;animation:fadeUp .3s cubic-bezier(.34,1.56,.64,1) both;pointer-events:none}
  .tok{background:#fff;color:#000}.terr{background:#ef4444;color:#fff}

  .splash{display:flex;align-items:center;justify-content:center;height:100vh;background:#000}
  .sp-inner{display:flex;flex-direction:column;align-items:center}
  .sp-logo{animation:fadeUp .6s ease both}
  .sp-divider{width:56px;height:1px;background:rgba(255,255,255,0.18);margin:20px 0 16px;animation:fadeUp .5s ease .2s both}
  .sp-label{font-family:'Outfit',sans-serif;font-size:9px;font-weight:700;letter-spacing:4.5px;color:rgba(255,255,255,0.4);text-transform:uppercase;animation:fadeUp .5s ease .28s both}
  .sp-dots{display:flex;gap:7px;margin-top:36px;animation:fadeUp .5s ease .36s both}
  .sp-dot{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.3);animation:blink 1.3s ease-in-out infinite}

  .auth-root{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;padding:52px 20px 80px;position:relative;overflow:hidden}
  .auth-grid-bg{position:fixed;inset:0;pointer-events:none;
    background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
    background-size:52px 52px;
    -webkit-mask-image:radial-gradient(ellipse 75% 70% at 50% 50%,#000 30%,transparent 100%);
    mask-image:radial-gradient(ellipse 75% 70% at 50% 50%,#000 30%,transparent 100%)}
  .auth-wrap{display:flex;flex-direction:column;align-items:center;width:100%;max-width:420px;position:relative}
  .auth-hero{display:flex;flex-direction:column;align-items:center;margin-bottom:30px;animation:fadeUp .55s ease both}
  .auth-event{display:flex;align-items:center;gap:12px;margin-top:20px}
  .auth-event-rule{flex-shrink:0;height:1px;width:38px;background:rgba(255,255,255,0.18)}
  .auth-event-text{font-family:'Outfit',sans-serif;font-size:8.5px;font-weight:700;letter-spacing:4px;color:rgba(255,255,255,0.38);text-transform:uppercase;white-space:nowrap}
  .auth-panel{width:100%;background:#0a0a0a;border:1px solid rgba(255,255,255,0.1);overflow:hidden;animation:fadeUp .58s ease .13s both;box-shadow:0 40px 100px rgba(0,0,0,.9)}
  .auth-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,0.08)}
  .auth-tab{flex:1;padding:17px 0;background:transparent;border:none;font-family:'Outfit',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.32);cursor:pointer;transition:all .2s;position:relative}
  .atab-on{color:#fff}.atab-on::after{content:'';position:absolute;bottom:0;left:18%;right:18%;height:2px;background:#fff;border-radius:1px}
  .auth-form{padding:30px 26px 26px;display:flex;flex-direction:column}
  .ffield{margin-bottom:20px}
  .ffield-lbl{display:block;font-size:8.5px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:rgba(255,255,255,.38);margin-bottom:8px}
  .ffield-inp{width:100%;padding:13px 15px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.09);color:#fff;font-family:'Outfit',sans-serif;font-size:14px;transition:all .2s}
  .ffield-inp::placeholder{color:rgba(255,255,255,.2)}.ffield-inp:focus{outline:none;border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.05)}
  .auth-err{display:flex;align-items:center;gap:10px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.22);padding:11px 14px;font-size:12px;color:#fca5a5;margin-bottom:18px}
  .auth-err-dot{width:18px;height:18px;border-radius:50%;background:rgba(239,68,68,.25);color:#fca5a5;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;flex-shrink:0}
  .auth-cta{width:100%;padding:15px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:13px;letter-spacing:3.5px;transition:opacity .15s,transform .15s;margin-bottom:20px}
  .auth-cta:hover{opacity:.87;transform:translateY(-1px)}.auth-cta:active{transform:translateY(0)}
  .auth-footer-text{font-size:12px;color:rgba(255,255,255,.35);text-align:center}
  .auth-footer-link{color:#fff;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:3px}

  .shell{display:flex;flex-direction:column;height:100vh;background:#000}
  .hdr{display:flex;align-items:center;justify-content:space-between;height:58px;padding:0 16px;background:#000;border-bottom:1px solid rgba(255,255,255,0.09);position:sticky;top:0;z-index:200;flex-shrink:0}
  .hdr-l{display:flex;align-items:center;gap:11px}.hdr-r{display:flex;align-items:center;gap:10px}
  .hdr-text{display:flex;flex-direction:column}
  .hdr-brand{font-family:'Anton',sans-serif;font-size:17px;letter-spacing:2px;color:#fff;line-height:1}
  .hdr-caption{font-size:9px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;color:rgba(255,255,255,.38)}
  .hdr-score{display:flex;flex-direction:column;align-items:flex-end}
  .hdr-score-n{font-family:'Anton',sans-serif;font-size:20px;color:#fff;line-height:1}
  .hdr-score-u{font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.38)}
  .admin-badge{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);padding:4px 10px;color:#fff}
  .hdr-out{width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4);cursor:pointer;transition:all .15s}
  .hdr-out:hover{background:rgba(255,255,255,.1);color:#fff}
  .body{flex:1;overflow-y:auto;padding-bottom:72px}
  .bot-nav{display:flex;position:fixed;bottom:0;left:0;right:0;background:#000;border-top:1px solid rgba(255,255,255,.09);height:62px;z-index:200;overflow-x:auto}
  .bnav-btn{flex:1;min-width:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:transparent;border:none;color:rgba(255,255,255,.28);cursor:pointer;transition:color .2s;font-family:'Outfit',sans-serif;position:relative}
  .bnav-on{color:#fff}.bnav-on::before{content:'';position:absolute;top:0;left:22%;right:22%;height:2px;background:#fff}
  .bnav-ico{display:flex}.bnav-lbl{font-size:8px;font-weight:700;letter-spacing:.8px;text-transform:uppercase}

  .vpad{padding:24px 16px 8px}
  .sechead{margin-bottom:20px}.sectitle{font-family:'Anton',sans-serif;font-size:20px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;font-weight:400}
  .secsub{font-size:11px;color:rgba(255,255,255,.38);margin-top:5px}
  .card-stack{display:flex;flex-direction:column;gap:8px;margin-bottom:28px}

  .mcard{background:#0d0d0d;border:1px solid rgba(255,255,255,.09);overflow:hidden;transition:border-color .2s,transform .2s}
  .mcard:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.2)}
  .mcard-ok{border-color:rgba(34,197,94,.38)!important;background:rgba(34,197,94,.03)!important}
  .mcard-ng{border-color:rgba(239,68,68,.18)!important}
  .mcard-meta{display:flex;align-items:center;justify-content:space-between;padding:11px 14px 0}
  .mcard-group{font-size:8.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.38)}
  .mcard-dt{font-size:9px;color:rgba(255,255,255,.25);letter-spacing:.5px}
  .mcard-body{display:flex;align-items:center;justify-content:space-between;padding:14px;gap:10px}
  .mteam{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px}
  .mteam-r{align-items:center}.mteam-flag{font-size:28px;line-height:1}
  .mteam-name{font-size:11px;font-weight:700;color:#fff;text-align:center;letter-spacing:.3px}
  .mscore-final{display:flex;flex-direction:column;align-items:center;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);padding:10px 18px;min-width:90px}
  .mscore-num{font-family:'Anton',sans-serif;font-size:28px;color:#fff;letter-spacing:3px;line-height:1}
  .mscore-lbl{font-size:7.5px;font-weight:700;letter-spacing:2.5px;color:rgba(255,255,255,.35);margin-top:5px}
  .mscore-input{display:flex;align-items:center;gap:8px}
  .sinput{width:50px;height:54px;text-align:center;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);color:#fff;font-family:'Anton',sans-serif;font-size:26px;transition:all .2s}
  .sinput:focus{outline:none;border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.08)}
  .ssep{font-family:'Anton',sans-serif;font-size:22px;color:rgba(255,255,255,.22)}
  .mcard-foot{padding:0 14px 14px}
  .pred-cta{width:100%;padding:12px;background:transparent;border:1px solid rgba(255,255,255,.22);color:rgba(255,255,255,.65);cursor:pointer;font-family:'Outfit',sans-serif;font-size:11.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:2px}
  .pred-cta:hover:not(:disabled){border-color:rgba(255,255,255,.55);color:#fff;background:rgba(255,255,255,.04)}
  .pred-cta:disabled{opacity:.28;cursor:not-allowed}
  .pred-cta-done{border-color:rgba(34,197,94,.45)!important;color:#86efac!important;background:rgba(34,197,94,.05)!important}
  .mcard-locked{border-color:rgba(255,255,255,.06)!important;opacity:.75}
  .lock-chip{font-size:8px;font-weight:700;letter-spacing:1px;color:rgba(255,200,50,.8);background:rgba(255,200,50,.08);border:1px solid rgba(255,200,50,.2);padding:2px 7px;border-radius:99px}
  .mv-locked{display:flex;align-items:center;padding:9px 14px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;font-weight:600;color:#86efac}
  .mv-ok{color:#86efac}.mv-ng{color:rgba(255,255,255,.35)}

  .leader-hero{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14);padding:26px 20px;text-align:center;margin-bottom:16px;position:relative;overflow:hidden}
  .leader-hero::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.04) 0%,transparent 55%);pointer-events:none}
  .lh-crown{font-size:30px;margin-bottom:8px}.lh-name{font-family:'Anton',sans-serif;font-size:26px;letter-spacing:2px;color:#fff}
  .lh-pts{font-family:'Anton',sans-serif;font-size:44px;color:#fff;line-height:1.05;margin-top:2px}.lh-pts span{font-size:18px;color:rgba(255,255,255,.4);margin-left:4px}
  .lh-tag{font-size:8.5px;font-weight:700;letter-spacing:4.5px;color:rgba(255,255,255,.35);margin-top:8px}
  .lboard{display:flex;flex-direction:column;gap:6px}
  .lrow{display:flex;align-items:center;gap:14px;background:#0d0d0d;border:1px solid rgba(255,255,255,.08);padding:14px 16px;transition:all .15s}
  .lrow:hover{border-color:rgba(255,255,255,.2)}.lrow-me{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.28)!important}
  .lrank{font-size:22px;width:36px;text-align:center;flex-shrink:0}.lrank-n{font-family:'Outfit',sans-serif;font-size:13px;font-weight:700;color:rgba(255,255,255,.38)}
  .linfo{flex:1;display:flex;align-items:center;gap:9px;flex-wrap:wrap}.lname{font-size:14px;font-weight:600;color:#fff}
  .you-chip{font-size:7.5px;font-weight:900;letter-spacing:1.5px;background:#fff;color:#000;padding:2px 8px;border-radius:99px}
  .lpts-wrap{display:flex;align-items:baseline;gap:3px}.lpts-n{font-family:'Anton',sans-serif;font-size:22px;color:#fff}.lpts-u{font-size:10px;color:rgba(255,255,255,.35);font-weight:600}
  .empty{text-align:center;color:rgba(255,255,255,.3);padding:40px 0;font-size:13px}

  /* RULES */
  .rules-card{display:flex;gap:14px;background:#0d0d0d;border:1px solid rgba(255,255,255,.09);padding:18px 16px}
  .rules-num{font-family:'Anton',sans-serif;font-size:28px;color:rgba(255,255,255,.12);letter-spacing:1px;flex-shrink:0;line-height:1;margin-top:2px}
  .rules-content{flex:1}
  .rules-title{font-family:'Anton',sans-serif;font-size:15px;letter-spacing:1px;color:#fff;margin-bottom:7px}
  .rules-body{font-size:13px;color:rgba(255,255,255,.5);line-height:1.7}
  .rules-footer{display:flex;align-items:center;justify-content:center;gap:10px;padding:20px 0 8px;font-size:12px;color:rgba(255,255,255,.25);font-style:italic}

  /* SPONSORS */
  .sponsor-hero{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.18);padding:30px 20px;text-align:center;margin-bottom:16px;position:relative;overflow:hidden}
  .sponsor-hero::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.04) 0%,transparent 60%);pointer-events:none}
  .sponsor-hero-emoji{font-size:40px;margin-bottom:10px}
  .sponsor-hero-role{font-size:9px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:6px}
  .sponsor-hero-name{font-family:'Anton',sans-serif;font-size:28px;letter-spacing:2px;color:#fff}
  .sponsor-hero-detail{font-size:12px;color:rgba(255,255,255,.35);margin-top:6px}
  .sponsor-card{display:flex;align-items:center;gap:16px;background:#0d0d0d;border:1px solid rgba(255,255,255,.09);padding:16px}
  .sponsor-emoji{font-size:28px;flex-shrink:0}
  .sponsor-info{flex:1}
  .sponsor-role{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:3px}
  .sponsor-name{font-size:15px;font-weight:700;color:#fff}
  .sponsor-detail{font-size:11px;color:rgba(255,255,255,.35);margin-top:2px}
  .sponsor-cta-box{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);padding:20px;text-align:center;margin-top:8px;margin-bottom:16px}
  .sponsor-cta-title{font-family:'Anton',sans-serif;font-size:14px;letter-spacing:1.5px;color:#fff;margin-bottom:8px}
  .sponsor-cta-body{font-size:12px;color:rgba(255,255,255,.35);line-height:1.6}

  .prof-card{background:#0d0d0d;border:1px solid rgba(255,255,255,.09);padding:30px 20px;text-align:center;margin-bottom:12px}
  .prof-av{width:72px;height:72px;border-radius:50%;background:#fff;color:#000;display:flex;align-items:center;justify-content:center;font-family:'Anton',sans-serif;font-size:26px;letter-spacing:2px;margin:0 auto 16px}
  .prof-name{font-family:'Anton',sans-serif;font-size:24px;letter-spacing:1.5px;color:#fff;margin-bottom:6px}
  .prof-detail{font-size:12px;color:rgba(255,255,255,.35);margin-bottom:2px}
  .prof-leader{margin-top:16px;display:inline-block;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);padding:8px 18px;font-size:11px;font-weight:700;letter-spacing:.5px;color:#fff;border-radius:99px}
  .stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
  .scard{background:#0d0d0d;border:1px solid rgba(255,255,255,.09);padding:18px 16px}
  .sval{font-family:'Anton',sans-serif;font-size:30px;color:#fff;line-height:1}.sunit{font-size:13px;color:rgba(255,255,255,.35);margin-left:3px}
  .slbl{font-size:8.5px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:rgba(255,255,255,.35);margin-top:7px}
  .info-card{background:#0d0d0d;border:1px solid rgba(255,255,255,.09);padding:24px 20px;text-align:center}
  .info-ico{font-size:26px;margin-bottom:12px}
  .info-title{font-family:'Anton',sans-serif;font-size:14px;letter-spacing:2.5px;text-transform:uppercase;color:#fff;margin-bottom:12px}
  .info-body{font-size:13px;color:rgba(255,255,255,.38);line-height:1.75}.info-body strong{color:#fff;font-weight:700}

  /* ADMIN */
  .admin-subtabs{display:flex;gap:8px;margin-bottom:20px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:0}
  .admin-subtab{padding:10px 16px;background:transparent;border:none;border-bottom:2px solid transparent;font-family:'Outfit',sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.35);cursor:pointer;transition:all .2s;margin-bottom:-1px}
  .ast-on{color:#fff;border-bottom-color:#fff}
  .admin-topbar{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px;gap:12px}
  .admin-add-btn{flex-shrink:0;padding:10px 16px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Outfit',sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;transition:opacity .15s;white-space:nowrap}
  .admin-add-btn:hover{opacity:.85}
  .admin-section-lbl{font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:10px;display:flex;align-items:center;gap:8px}
  .admin-count{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);padding:2px 7px;font-size:9px;border-radius:99px}
  .admin-row{display:flex;align-items:center;justify-content:space-between;background:#0d0d0d;border:1px solid rgba(255,255,255,.09);padding:13px 14px;gap:12px;flex-wrap:wrap}
  .admin-row-left{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}
  .admin-row-group{font-size:8.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.35)}
  .admin-row-teams{font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .admin-row-dt{font-size:10px;color:rgba(255,255,255,.3)}
  .admin-row-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
  .admin-score-badge{font-family:'Anton',sans-serif;font-size:16px;color:#fff;letter-spacing:2px;display:flex;align-items:center;gap:6px}
  .finished-tag{font-family:'Outfit',sans-serif;font-size:8px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,.35);background:rgba(255,255,255,.07);padding:2px 6px}
  .upcoming-tag{font-size:8.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);padding:3px 8px}
  .admin-edit-btn{padding:7px 14px;background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);cursor:pointer;font-family:'Outfit',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;transition:all .15s}
  .admin-edit-btn:hover{border-color:rgba(255,255,255,.5);color:#fff}
  .admin-del-btn{width:30px;height:30px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);color:#f87171;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .15s}
  .admin-del-btn:hover{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.5)}
  .admin-form-card{background:#0d0d0d;border:1px solid rgba(255,255,255,.15);padding:18px;margin-bottom:8px}
  .admin-edit-card{border-color:rgba(255,255,255,.3)}
  .admin-form-title{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2.5px;color:rgba(255,255,255,.4);margin-bottom:14px}
  .admin-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-bottom:14px}
  .afield{display:flex;flex-direction:column;gap:6px}
  .afield-lbl{font-size:8.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.35)}
  .afield-inp{padding:10px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#fff;font-family:'Outfit',sans-serif;font-size:13px;transition:all .2s}
  .afield-inp:focus{outline:none;border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.06)}
  .afield-inp::placeholder{color:rgba(255,255,255,.2)}
  .afield-ta{resize:vertical;min-height:80px;font-family:'Outfit',sans-serif}
  .admin-score-row{margin-bottom:16px}
  .admin-score-lbl{display:block;font-size:8.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:10px}
  .admin-score-inputs{display:flex;align-items:center;gap:10px}
  .admin-sinput{width:56px;height:48px;text-align:center;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);color:#fff;font-family:'Anton',sans-serif;font-size:22px;transition:all .2s}
  .admin-sinput:focus{outline:none;border-color:rgba(255,255,255,.5)}
  .admin-sinput-lg{width:62px;height:54px;font-size:26px}
  .admin-sep{font-family:'Anton',sans-serif;font-size:20px;color:rgba(255,255,255,.25)}
  .admin-form-actions{display:flex;gap:10px}
  .admin-save-btn{flex:1;padding:13px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:12px;letter-spacing:2.5px;transition:opacity .15s}
  .admin-save-btn:hover{opacity:.85}
  .admin-cancel-btn{padding:13px 18px;background:transparent;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.5);cursor:pointer;font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;transition:all .15s}
  .admin-cancel-btn:hover{border-color:rgba(255,255,255,.35);color:#fff}
  .admin-hint{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);padding:12px 14px;font-size:12px;color:rgba(255,255,255,.35);line-height:1.6;margin-bottom:24px}

  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px}
  .modal{background:#111;border:1px solid rgba(255,255,255,.2);padding:28px 24px;width:100%;max-width:360px}
  .modal-title{font-family:'Anton',sans-serif;font-size:18px;letter-spacing:1.5px;color:#fff;margin-bottom:12px}
  .modal-body{font-size:13px;color:rgba(255,255,255,.45);line-height:1.65;margin-bottom:22px}
  .modal-actions{display:flex;gap:10px}
  .modal-del-btn{flex:1;padding:13px;background:#ef4444;color:#fff;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:12px;letter-spacing:2px;transition:opacity .15s}
  .modal-del-btn:hover{opacity:.85}
  .modal-cancel-btn{padding:13px 20px;background:transparent;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.5);cursor:pointer;font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;transition:all .15s}
  .modal-cancel-btn:hover{border-color:rgba(255,255,255,.4);color:#fff}

  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes blink{0%,100%{opacity:.2}50%{opacity:.9}}
`;
