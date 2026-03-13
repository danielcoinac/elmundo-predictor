import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from '@supabase/supabase-js';

/* ─── Supabase ──────────────────────────────────────────────────────────────── */
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/* ─── ADMIN CONFIG — change this to your own email ─────────────────────────── */
const ADMIN_EMAIL = "admin@elmundo.com";
const ADMIN_PASS  = "ElMundo2026!";

/* ─── Storage (rules/sponsors only — still use local storage) ──────────────── */
async function sget(k) { try { const r = await window.storage.get(k, true); return r ? JSON.parse(r.value) : null; } catch { return null; } }
async function sset(k, v) { try { await window.storage.set(k, JSON.stringify(v), true); } catch {} }

/* ─── Default Matches — empty, always loads from Supabase ──────────────────── */
const DEFAULT_MATCHES = [];

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
  { id:"s1", name:"El Mundo Bar-Rest", role:"EVENT HOST", detail:"Est. 2009 — Bonaire", logo:"/elmundo-logo.png" },
  { id:"s2", name:"Your Business Here", role:"Gold Sponsor",  detail:"Contact us to become a sponsor", logo:"" },
  { id:"s3", name:"Your Business Here", role:"Silver Sponsor", detail:"Contact us to become a sponsor", logo:"" },
];

const FLAGS = {
  /* CONMEBOL */ Brazil:"🇧🇷",Argentina:"🇦🇷",Uruguay:"🇺🇾",Colombia:"🇨🇴",Ecuador:"🇪🇨",Venezuela:"🇻🇪",Paraguay:"🇵🇾",Chile:"🇨🇱",Bolivia:"🇧🇴",Peru:"🇵🇪",
  /* UEFA */ France:"🇫🇷",Germany:"🇩🇪",Spain:"🇪🇸",Portugal:"🇵🇹",England:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",Netherlands:"🇳🇱",Italy:"🇮🇹",Croatia:"🇭🇷",Belgium:"🇧🇪",Switzerland:"🇨🇭",Austria:"🇦🇹",Denmark:"🇩🇰",Serbia:"🇷🇸",Hungary:"🇭🇺",Czechia:"🇨🇿",Slovakia:"🇸🇰",Turkey:"🇹🇷",Romania:"🇷🇴",Scotland:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",Wales:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",Ukraine:"🇺🇦",Greece:"🇬🇷",Poland:"🇵🇱",
  /* CONCACAF */ USA:"🇺🇸",Mexico:"🇲🇽",Canada:"🇨🇦",Jamaica:"🇯🇲","Costa Rica":"🇨🇷",Panama:"🇵🇦",Honduras:"🇭🇳","El Salvador":"🇸🇻",Guatemala:"🇬🇹","Trinidad & Tobago":"🇹🇹",Cuba:"🇨🇺",Haiti:"🇭🇹",
  /* CAF */ Morocco:"🇲🇦",Senegal:"🇸🇳",Egypt:"🇪🇬","South Africa":"🇿🇦",Nigeria:"🇳🇬",Ghana:"🇬🇭","Ivory Coast":"🇨🇮",Cameroon:"🇨🇲",Algeria:"🇩🇿",Tunisia:"🇹🇳",Mali:"🇲🇱",
  /* AFC */ Japan:"🇯🇵","South Korea":"🇰🇷",Iran:"🇮🇷",Australia:"🇦🇺","Saudi Arabia":"🇸🇦",Qatar:"🇶🇦","United Arab Emirates":"🇦🇪",Iraq:"🇮🇶","New Zealand":"🇳🇿",
  /* OFC */ Tahiti:"🇵🇫",
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
      if (mRows) {
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
      setTimeout(() => setPage("auth"), 18000);
    })();
  }, []);

  /* Poll every 5s for live match/score/leaderboard updates */
  useEffect(() => {
    if (page !== "app") return;
    const id = setInterval(async () => {
      const { data: mRows } = await supabase.from("matches").select("*");
      if (mRows) {
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
    }, 5000);
    return () => clearInterval(id);
  }, [page]);

  const toast$ = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3200); };

  /* ── Auth ── */
  const doRegister = async () => {
    setFormErr("");
    if (!form.name.trim())                 return setFormErr("Full name is required.");
    if (!/\S+@\S+\.\S+/.test(form.email)) return setFormErr("Enter a valid email address.");
    if (!form.phone.trim())                return setFormErr("Phone number is required.");
    if (form.password.length < 6)          return setFormErr("Password must be at least 8 characters.");
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
  const mainRef  = useRef(null);
  const goldRef  = useRef(null);
  const sub2Ref  = useRef(null);
  const divRef   = useRef(null);
  const sepRef   = useRef(null);
  const signRef  = useRef(null);
  const ballRef  = useRef(null);

  const [showBall,  setShowBall]  = useState(true);
  const [ballHit,   setBallHit]   = useState(false);
  const [showSign,  setShowSign]  = useState(false);
  const [shake,     setShake]     = useState(false);
  const [flash,     setFlash]     = useState(false);
  const [cracks,    setCracks]    = useState(false);
  const [falling,   setFalling]   = useState(false);

  useEffect(() => {
    const T = [];
    const at = (ms, fn) => T.push(setTimeout(fn, ms));

    // 3.0s — ball has arrived at screen, trigger IMPACT
    at(3000, () => {
      setBallHit(true);    // switches ball to smash animation
      setShake(true);
      setFlash(true);
      setCracks(true);
      setTimeout(() => setShake(false), 850);
      setTimeout(() => setFlash(false), 500);
      setTimeout(() => setCracks(false), 1200);
    });

    // 3.7s — ball fully gone, sign descends
    at(3700, () => {
      setShowBall(false);
      setShowSign(true);
    });

    // 5.8s — EL MUNDO white neon flickers on
    at(5800, () => {
      if (mainRef.current) mainRef.current.style.animation = 'neonWhiteOn 3.5s ease forwards';
      if (sub2Ref.current) sub2Ref.current.style.animation = 'subWhiteOn 1.2s ease 2s forwards';
      if (divRef.current)  divRef.current.style.animation  = 'dividerOn 0.6s ease 2.2s forwards';
    });

    // 9.8s — WORLD CUP 2026 gold neon flickers on
    at(9800, () => {
      if (goldRef.current) goldRef.current.style.animation = 'neonGoldOn 3.5s ease forwards';
      if (sepRef.current)  sepRef.current.style.animation  = 'dividerOn 0.5s ease 0.3s forwards';
    });

    // 13.5s — switch to breathing
    at(13500, () => {
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

    // 16.5s — sign falls
    at(16500, () => setFalling(true));

    return () => T.forEach(clearTimeout);
  }, []);

  return (
    <div className={`splash${shake ? ' splash-shake' : ''}`}>
      <div className="sp-vignette" />
      {flash  && <div className="sp-flash" />}
      {cracks && (
        <div className="sp-cracks">
          {[0,30,60,90,120,150,180,210,240,270,300,330].map(deg => (
            <div key={deg} className="sp-crack" style={{transform:`rotate(${deg}deg)`}} />
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
            <div ref={mainRef}  className="sp-neon-main">EL MUNDO</div>
            <div ref={divRef}   className="sp-sign-divider" style={{opacity:0}} />
            <div ref={sub2Ref}  className="sp-neon-sub2">BAR · REST · BONAIRE</div>
            <div ref={sepRef}   className="sp-sign-sep"  style={{opacity:0}} />
            <div ref={goldRef}  className="sp-neon-gold">WORLD CUP 2026</div>
          </div>
        </div>
      )}
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
          <Logo w={220} />
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
  const [animKey, setAnimKey] = useState(appTab);

  const switchTab = (id) => {
    setAnimKey(id);
    setAppTab(id);
  };

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
          <button className="hdr-out" onClick={onLogout} title="Log out"><LogoutIco /></button>
        </div>
        </div>
      </header>

      <main className="body">
        <div className="body-inner page-anim" key={animKey}>
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
function MatchesView({ matches, getPred, savePred }) {
  const upcoming = matches.filter(m => m.status === "upcoming");
  const finished = matches.filter(m => m.status === "finished");
  return (
    <div>
      <div className="section-banner">
        <span className="section-banner-title">UPCOMING</span>
        <span className="section-banner-sub">Predict · 5 pts per correct score</span>
      </div>
      <div className="card-stack">
        {upcoming.length === 0 && <div className="empty">No upcoming matches yet.</div>}
        {upcoming.map(m => <MatchCard key={m.id} m={m} pred={getPred(m.id)} onSave={savePred} />)}
      </div>
      <div className="section-banner section-banner-dim">
        <span className="section-banner-title">RESULTS</span>
        <span className="section-banner-sub">Final scores & your predictions</span>
      </div>
      <div className="card-stack">
        {finished.length === 0 && <div className="empty">No results yet.</div>}
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

  const statusColor = correct ? "#22c55e" : wrong ? "#ef4444" : locked && !fin ? "#f59e0b" : "transparent";

  return (
    <div className={`mcard ${correct?"mcard-ok":wrong?"mcard-ng":""}`} style={{borderLeft:`3px solid ${statusColor}`}}>

      {/* Top strip: group + date */}
      <div className="mcard-topstrip">
        <span className="mcard-group-pill">{m.group}</span>
        <span className="mcard-dt">{m.date} · {m.time} UTC</span>
        {locked && !fin && <span className="lock-chip">🔒 {minsLeft < 1 ? "LOCKED" : `${Math.round(minsLeft)}m`}</span>}
      </div>

      {/* Main scoreboard row */}
      <div className="mcard-scoreboard">
        {/* Home team */}
        <div className="mteam-col">
          <span className="mteam-flag-lg">{flag(m.home)}</span>
          <span className="mteam-name-lg">{m.home}</span>
        </div>

        {/* Center: score or inputs */}
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
              <input className="sinput" type="number" min="0" max="20" value={h} onChange={e=>setH(e.target.value)} placeholder="–" />
              <span className="ssep">:</span>
              <input className="sinput" type="number" min="0" max="20" value={a} onChange={e=>setA(e.target.value)} placeholder="–" />
            </div>
          )}
        </div>

        {/* Away team */}
        <div className="mteam-col mteam-col-r">
          <span className="mteam-flag-lg">{flag(m.away)}</span>
          <span className="mteam-name-lg">{m.away}</span>
        </div>
      </div>

      {/* Bottom action / verdict */}
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
        <div className="mverdict mv-ng"><IcoX /> No prediction — predictions closed</div>
      )}
      {fin && (
        <div className={`mverdict ${correct?"mv-ok":"mv-ng"}`}>
          {correct ? <><IcoCheck /> Correct +5 pts</>
            : pred  ? <><IcoX /> Wrong · Your pick: {pred.h}:{pred.a}</>
            :         <><IcoDash /> No prediction</>}
        </div>
      )}
    </div>
  );
}

/* ═══ LEADERBOARD ═══════════════════════════════════════════════════════════ */
function LeaderView({ board, user }) {
  const M = ["🥇","🥈","🥉"];
  return (
    <div>
      {board[0] && (
        <div className="leader-hero">
          <div className="lh-crown-row">
            <span className="lh-crown-ico">👑</span>
            <span className="lh-crown-lbl">LEADING THE TOURNAMENT</span>
          </div>
          <div className="lh-name">{board[0].name}</div>
          <div className="lh-pts-row">
            <span className="lh-pts">{board[0].pts}</span>
            <span className="lh-pts-unit">PTS</span>
          </div>
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
function SponsorsView({ sponsors }) {
  return (
    <div>
      <div className="section-banner">
        <span className="section-banner-title">SPONSORS</span>
        <span className="section-banner-sub">Thank you for making this event possible</span>
      </div>
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
  );
}

/* ═══ PROFILE ═══════════════════════════════════════════════════════════════ */
function ProfileView({ user, myPts, myRank, preds, matches }) {
  const fin  = matches.filter(m => m.status==="finished");
  const sub  = fin.filter(m => !!preds[`${user.id}__${m.id}`]).length;
  const corr = fin.filter(m => { const p=preds[`${user.id}__${m.id}`]; return p&&p.h===m.hs&&p.a===m.as; }).length;
  const acc  = sub>0 ? Math.round(corr/sub*100) : 0;
  const initials = user.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return (
    <div className="prof-wrap">
      <div className="prof-hero">
        <div className="prof-av">{initials}</div>
        <div className="prof-name">{user.name}</div>
        <div className="prof-detail">{user.email}</div>
        <div className="prof-detail">{user.phone}</div>
        {myRank===1 && <div className="prof-leader-badge">👑 LEADING THE TOURNAMENT</div>}
      </div>
      <div className="stats-grid">
        {[
          {v:myPts,                       u:"PTS",  l:"Total Points"},
          {v:myRank>0?`#${myRank}`:"—",  u:"",     l:"Your Rank"},
          {v:corr,                        u:`/${sub}`,l:"Correct"},
          {v:acc,                         u:"%",    l:"Accuracy"},
        ].map(s => (
          <div key={s.l} className="scard">
            <div className="sval">{s.v}<span className="sunit">{s.u}</span></div>
            <div className="slbl">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="info-card">
        <div className="info-title">⚽ HOW POINTS WORK</div>
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
              <span className="admin-form-title" style={{margin:0}}>SPONSOR {i+1}{i===0?" — EVENT HOST":""}</span>
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
  ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:2px}

  /* ── TOAST ── */
  .toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:12px 28px;font-family:'Anton',sans-serif;font-size:10px;letter-spacing:3px;white-space:nowrap;z-index:9999;animation:toastIn .2s ease both;pointer-events:none;border:1px solid rgba(255,255,255,.2)}
  .tok{background:#fff;color:#000}
  .terr{background:#000;color:#ef4444;border-color:#ef4444}

  /* ── SPLASH ── */
  .splash{display:flex;align-items:center;justify-content:center;height:100vh;background:#000;overflow:hidden}
  .sp-inner{display:flex;flex-direction:column;align-items:center;gap:0}
  .sp-logo{animation:fadeUp .8s cubic-bezier(.16,1,.3,1) both}
  .sp-line{width:120px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);margin:32px 0 28px;animation:expandW .7s ease .6s both;transform-origin:center}
  .sp-tagline{display:flex;align-items:center;gap:14px;animation:fadeUp .5s ease .7s both;margin-bottom:32px}
  .sp-tag-word{font-family:'Anton',sans-serif;font-size:14px;letter-spacing:6px;color:#fff;text-transform:uppercase}
  .sp-tag-dot{font-family:'Anton',sans-serif;font-size:10px;color:rgba(255,255,255,.2)}
  .sp-bar{width:48px;height:2px;background:rgba(255,255,255,.08);overflow:hidden;animation:fadeUp .4s ease 1s both}
  .sp-bar-inner{width:0;height:100%;background:#fff;animation:fillBar 2.2s cubic-bezier(.4,0,.2,1) 1.1s forwards}
  .sp-sub{font-family:'Anton',sans-serif;font-size:7.5px;letter-spacing:6px;color:rgba(255,255,255,.18);animation:fadeUp .4s ease 1.3s both;text-transform:uppercase;margin-top:14px}

  /* ── AUTH ── */
  .auth-root{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;padding:48px 20px 80px;position:relative;overflow:hidden}
  .auth-grid-bg{position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);background-size:40px 40px}
  .auth-wrap{display:flex;flex-direction:column;align-items:center;width:100%;max-width:440px}
  .auth-hero{display:flex;flex-direction:column;align-items:center;margin-bottom:44px;animation:fadeUp .7s cubic-bezier(.16,1,.3,1) both}
  .auth-event{display:flex;align-items:center;gap:16px;margin-top:22px}
  .auth-event-rule{flex-shrink:0;height:1px;width:44px;background:rgba(255,255,255,.25)}
  .auth-event-text{font-family:'Anton',sans-serif;font-size:13px;letter-spacing:5px;color:rgba(255,255,255,.55);white-space:nowrap}
  .auth-panel{width:100%;background:#000;border:1px solid rgba(255,255,255,.14);animation:fadeUp .7s cubic-bezier(.16,1,.3,1) .12s both}
  .auth-tabs{display:flex}
  .auth-tab{flex:1;padding:18px 0;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.08);font-family:'Anton',sans-serif;font-size:10.5px;letter-spacing:3px;color:rgba(255,255,255,.18);cursor:pointer;transition:all .2s;position:relative}
  .atab-on{color:#fff;border-bottom-color:transparent;background:rgba(255,255,255,.02)}
  .atab-on::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:#fff}
  .auth-form{padding:32px 28px 28px;display:flex;flex-direction:column;gap:0}
  .ffield{margin-bottom:18px}
  .ffield-lbl{display:block;font-family:'Anton',sans-serif;font-size:7.5px;letter-spacing:3px;color:rgba(255,255,255,.25);margin-bottom:8px}
  .ffield-inp{width:100%;padding:15px 16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);color:#fff;font-family:'Outfit',sans-serif;font-size:15px;transition:all .2s;outline:none;border-radius:0}
  .ffield-inp::placeholder{color:rgba(255,255,255,.13)}
  .ffield-inp:focus{border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.045)}
  .auth-err{display:flex;align-items:center;gap:10px;padding:10px 14px;font-family:'Outfit',sans-serif;font-size:12px;color:#fca5a5;margin-bottom:18px;background:rgba(239,68,68,.06);border-left:2px solid #ef4444}
  .auth-err-dot{font-family:'Anton',sans-serif;font-size:15px;color:#ef4444}
  .auth-cta{width:100%;padding:18px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:11.5px;letter-spacing:5px;transition:opacity .15s;margin-bottom:22px;margin-top:6px}
  .auth-cta:hover{opacity:.88}
  .auth-footer-text{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.22);text-align:center}
  .auth-footer-link{color:rgba(255,255,255,.6);font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:3px}

  /* ── SHELL ── */
  .shell{display:flex;flex-direction:column;height:100vh;background:#000;max-width:100%;margin:0 auto;position:relative}

  /* ── HEADER ── */
  .hdr{display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 20px;background:#000;border-bottom:1px solid rgba(255,255,255,.07);position:sticky;top:0;z-index:200;flex-shrink:0}
  .hdr-inner{display:flex;align-items:center;justify-content:space-between;width:100%;max-width:900px;margin:0 auto}
  .body{flex:1;overflow-y:auto;padding-bottom:64px}
  .body-inner{max-width:900px;margin:0 auto}
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
  .hdr-out:hover{border-color:rgba(255,255,255,.4);color:#fff}

  /* ── BODY / NAV ── */
  .body{flex:1;overflow-y:auto;padding-bottom:64px}
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
  .section-banner-sub{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.45);margin-top:5px;display:block}
  .card-stack{display:flex;flex-direction:column}
  .empty{text-align:center;color:rgba(255,255,255,.14);padding:56px 0;font-family:'Anton',sans-serif;font-size:11px;letter-spacing:4px;text-transform:uppercase}

  /* ── MATCH CARD ── */
  .mcard{background:#000;border-bottom:1px solid rgba(255,255,255,.055);overflow:hidden;transition:background .15s}
  .mcard:hover{background:#060606}
  .mcard-topstrip{display:flex;align-items:center;justify-content:space-between;padding:10px 14px 0;flex-wrap:wrap;gap:6px}
  .mcard-group-pill{font-family:'Anton',sans-serif;font-size:7.5px;letter-spacing:3px;color:rgba(255,255,255,.5);text-transform:uppercase}
  .mcard-dt{font-family:'Outfit',sans-serif;font-size:11px;color:rgba(255,255,255,.38)}
  .lock-chip{font-family:'Anton',sans-serif;font-size:7px;letter-spacing:2px;color:rgba(251,191,36,.7);border:1px solid rgba(251,191,36,.2);padding:2px 8px}

  /* scoreboard layout */
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
  .sinput{width:52px;height:60px;text-align:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#fff;font-family:'Anton',sans-serif;font-size:30px;outline:none;transition:all .2s}
  .sinput:focus{border-color:rgba(255,255,255,.55);background:rgba(255,255,255,.07)}
  .sinput::placeholder{color:rgba(255,255,255,.1)}
  .ssep{font-family:'Anton',sans-serif;font-size:22px;color:rgba(255,255,255,.2)}

  /* bottom of match card */
  .mcard-foot{padding:0 14px 14px}
  .pred-cta{width:100%;padding:14px;background:transparent;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.35);cursor:pointer;font-family:'Anton',sans-serif;font-size:9.5px;letter-spacing:3px;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px}
  .pred-cta:hover:not(:disabled){border-color:#fff;color:#fff;background:rgba(255,255,255,.03)}
  .pred-cta:disabled{opacity:.15;cursor:not-allowed}
  .pred-cta-done{border-color:rgba(34,197,94,.4)!important;color:rgba(34,197,94,.8)!important}
  .mverdict{display:flex;align-items:center;gap:8px;padding:9px 14px;border-top:1px solid rgba(255,255,255,.04);font-family:'Outfit',sans-serif;font-size:11px;font-weight:600}
  .mv-ok{color:#86efac}.mv-ng{color:rgba(255,255,255,.2)}.mv-locked{color:rgba(34,197,94,.7);display:flex;align-items:center;gap:8px;padding:9px 14px;border-top:1px solid rgba(255,255,255,.04);font-family:'Outfit',sans-serif;font-size:11px;font-weight:600}

  /* ── LEADERBOARD ── */
  .leader-hero{background:#fff;padding:36px 20px 30px;text-align:center}
  .lh-crown-row{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:16px}
  .lh-crown-ico{font-size:20px}
  .lh-crown-lbl{font-family:'Anton',sans-serif;font-size:7.5px;letter-spacing:5px;color:rgba(0,0,0,.3);text-transform:uppercase}
  .lh-name{font-family:'Anton',sans-serif;font-size:36px;letter-spacing:1.5px;color:#000;line-height:1;text-transform:uppercase}
  .lh-pts-row{display:flex;align-items:baseline;justify-content:center;gap:8px;margin-top:12px}
  .lh-pts{font-family:'Anton',sans-serif;font-size:72px;color:#000;line-height:.9}
  .lh-pts-unit{font-family:'Anton',sans-serif;font-size:16px;letter-spacing:4px;color:rgba(0,0,0,.3)}
  .lboard{display:flex;flex-direction:column}
  .lrow{display:flex;align-items:center;gap:14px;border-bottom:1px solid rgba(255,255,255,.055);padding:15px 16px;transition:background .15s;cursor:default}
  .lrow:hover{background:#060606}
  .lrow-me{background:#0c0c0c!important;border-left:2px solid rgba(255,255,255,.45)}
  .lrank{font-size:22px;width:34px;text-align:center;flex-shrink:0;line-height:1}
  .lrank-n{font-family:'Anton',sans-serif;font-size:14px;color:rgba(255,255,255,.4);letter-spacing:1px}
  .linfo{flex:1;display:flex;align-items:center;gap:10px;min-width:0}
  .lname{font-family:'Anton',sans-serif;font-size:15px;color:#fff;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}
  .you-chip{font-family:'Anton',sans-serif;font-size:6px;letter-spacing:2px;background:#fff;color:#000;padding:2px 8px;flex-shrink:0}
  .lpts-wrap{display:flex;align-items:baseline;gap:4px;flex-shrink:0}
  .lpts-n{font-family:'Anton',sans-serif;font-size:28px;color:#fff;line-height:1}
  .lpts-u{font-family:'Anton',sans-serif;font-size:7.5px;letter-spacing:1.5px;color:rgba(255,255,255,.4)}

  /* ── RULES ── */
  .rules-card{display:flex;gap:18px;border-bottom:1px solid rgba(255,255,255,.055);padding:22px 16px;transition:background .15s}
  .rules-card:hover{background:#060606}
  .rules-num{font-family:'Anton',sans-serif;font-size:44px;color:rgba(255,255,255,.05);letter-spacing:1px;flex-shrink:0;min-width:44px;line-height:1;margin-top:-4px}
  .rules-content{flex:1}
  .rules-title{font-family:'Anton',sans-serif;font-size:13px;letter-spacing:2px;color:#fff;text-transform:uppercase;margin-bottom:9px}
  .rules-body{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(255,255,255,.55);line-height:1.76}
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
  .sponsor-detail{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.45);margin-top:3px}
  .sponsor-cta-box{padding:24px 16px;border-top:1px solid rgba(255,255,255,.055)}
  .sponsor-cta-title{font-family:'Anton',sans-serif;font-size:13px;letter-spacing:2.5px;color:#fff;text-transform:uppercase;margin-bottom:8px}
  .sponsor-cta-body{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.25);line-height:1.7}

  /* ── PROFILE ── */
  .prof-wrap{max-width:600px;margin:0 auto;display:flex;flex-direction:column}
  .prof-hero{background:#fff;padding:40px 24px 32px;text-align:center;width:100%}
  .prof-av{width:72px;height:72px;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Anton',sans-serif;font-size:24px;letter-spacing:2px;margin:0 auto 20px}
  .prof-name{font-family:'Anton',sans-serif;font-size:28px;letter-spacing:1px;color:#000;text-transform:uppercase;margin-bottom:8px}
  .prof-detail{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(0,0,0,.55);margin-bottom:3px}
  .prof-leader-badge{margin-top:18px;display:inline-block;background:#000;color:#fff;padding:10px 24px;font-family:'Anton',sans-serif;font-size:9px;letter-spacing:3px;text-transform:uppercase}
  .stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(255,255,255,.08);width:100%}
  .scard{background:#111;padding:24px 20px}
  .sval{font-family:'Anton',sans-serif;font-size:44px;color:#fff;line-height:1}
  .sunit{font-family:'Anton',sans-serif;font-size:16px;color:rgba(255,255,255,.4);margin-left:3px}
  .slbl{font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;color:rgba(255,255,255,.5);margin-top:8px;text-transform:uppercase;letter-spacing:.5px}
  .info-card{padding:24px 20px;border-top:1px solid rgba(255,255,255,.08);width:100%}
  .info-title{font-family:'Anton',sans-serif;font-size:13px;letter-spacing:2px;color:#fff;margin-bottom:12px;text-transform:uppercase}
  .info-body{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(255,255,255,.5);line-height:1.78}
  .info-body strong{color:#fff;font-weight:700}

  /* ── ADMIN ── */
  .admin-subtabs{display:flex;border-bottom:1px solid rgba(255,255,255,.07)}
  .admin-subtab{padding:15px 16px;background:transparent;border:none;border-bottom:2px solid transparent;font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:rgba(255,255,255,.22);cursor:pointer;transition:all .2s;margin-bottom:-1px}
  .ast-on{color:#fff;border-bottom-color:#fff}
  .admin-topbar{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 14px 0;margin-bottom:4px;gap:12px}
  .admin-add-btn{flex-shrink:0;padding:10px 18px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:9.5px;letter-spacing:2.5px;transition:opacity .15s;white-space:nowrap}
  .admin-add-btn:hover{opacity:.85}
  .admin-section-lbl{font-family:'Anton',sans-serif;font-size:7.5px;letter-spacing:3.5px;color:rgba(255,255,255,.22);display:flex;align-items:center;gap:8px;padding:18px 14px 10px}
  .admin-count{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);padding:2px 8px}
  .admin-row{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.055);padding:14px 14px;gap:12px;flex-wrap:wrap;transition:background .15s}
  .admin-row:hover{background:#060606}
  .admin-row-left{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}
  .admin-row-group{font-family:'Anton',sans-serif;font-size:7px;letter-spacing:2.5px;color:rgba(255,255,255,.22)}
  .admin-row-teams{font-family:'Anton',sans-serif;font-size:13px;color:#fff;letter-spacing:.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase}
  .admin-row-dt{font-family:'Outfit',sans-serif;font-size:10px;color:rgba(255,255,255,.22);margin-top:2px}
  .admin-row-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
  .admin-score-badge{font-family:'Anton',sans-serif;font-size:16px;color:#fff;letter-spacing:3px}
  .finished-tag{font-family:'Anton',sans-serif;font-size:6.5px;letter-spacing:2px;color:rgba(34,197,94,.6);border:1px solid rgba(34,197,94,.15);padding:2px 8px}
  .upcoming-tag{font-family:'Anton',sans-serif;font-size:6.5px;letter-spacing:2px;color:rgba(255,255,255,.28);border:1px solid rgba(255,255,255,.08);padding:2px 8px}
  .admin-edit-btn{padding:7px 14px;background:transparent;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.5);cursor:pointer;font-family:'Anton',sans-serif;font-size:8.5px;letter-spacing:2px;transition:all .15s}
  .admin-edit-btn:hover{border-color:rgba(255,255,255,.45);color:#fff}
  .admin-del-btn{width:30px;height:30px;background:transparent;border:1px solid rgba(239,68,68,.15);color:#f87171;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .15s}
  .admin-del-btn:hover{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.4)}
  .admin-form-card{background:#050505;border:1px solid rgba(255,255,255,.1);padding:18px;margin:0 0 8px}
  .admin-edit-card{border-color:rgba(255,255,255,.22)}
  .admin-form-title{font-family:'Anton',sans-serif;font-size:9px;letter-spacing:3px;color:rgba(255,255,255,.28);margin-bottom:16px;text-transform:uppercase}
  .admin-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-bottom:14px}
  .afield{display:flex;flex-direction:column;gap:6px}
  .afield-lbl{font-family:'Anton',sans-serif;font-size:7.5px;letter-spacing:2px;color:rgba(255,255,255,.25)}
  .afield-inp{padding:10px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);color:#fff;font-family:'Outfit',sans-serif;font-size:13px;transition:all .2s;outline:none}
  .afield-inp:focus{border-color:rgba(255,255,255,.35);background:rgba(255,255,255,.04)}
  .afield-inp::placeholder{color:rgba(255,255,255,.13)}
  .afield-ta{resize:vertical;min-height:80px;font-family:'Outfit',sans-serif}
  .admin-score-row{margin-bottom:16px}
  .admin-score-lbl{display:block;font-family:'Anton',sans-serif;font-size:7.5px;letter-spacing:2px;color:rgba(255,255,255,.25);margin-bottom:10px}
  .admin-score-inputs{display:flex;align-items:center;gap:10px}
  .admin-sinput{width:56px;height:48px;text-align:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);color:#fff;font-family:'Anton',sans-serif;font-size:22px;transition:all .2s;outline:none}
  .admin-sinput:focus{border-color:rgba(255,255,255,.4)}
  .admin-sep{font-family:'Anton',sans-serif;font-size:20px;color:rgba(255,255,255,.15)}
  .admin-form-actions{display:flex;gap:10px}
  .admin-save-btn{flex:1;padding:13px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:10.5px;letter-spacing:3px;transition:opacity .15s}
  .admin-save-btn:hover{opacity:.85}
  .admin-cancel-btn{padding:13px 18px;background:transparent;border:1px solid rgba(255,255,255,.09);color:rgba(255,255,255,.35);cursor:pointer;font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;transition:all .15s}
  .admin-cancel-btn:hover{border-color:rgba(255,255,255,.3);color:#fff}
  .admin-hint{border-top:1px solid rgba(255,255,255,.05);padding:14px 0;font-family:'Outfit',sans-serif;font-size:11px;color:rgba(255,255,255,.22);line-height:1.65;margin-bottom:24px}
  .vpad{padding:0}

  /* ── MODAL ── */
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px}
  .modal{background:#000;border:1px solid rgba(255,255,255,.2);padding:32px 24px;width:100%;max-width:340px}
  .modal-title{font-family:'Anton',sans-serif;font-size:22px;letter-spacing:1.5px;color:#fff;margin-bottom:12px;text-transform:uppercase}
  .modal-body{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.35);line-height:1.7;margin-bottom:24px}
  .modal-actions{display:flex;gap:10px}
  .modal-del-btn{flex:1;padding:14px;background:#ef4444;color:#fff;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:10.5px;letter-spacing:3px;transition:opacity .15s}
  .modal-del-btn:hover{opacity:.85}
  .modal-cancel-btn{padding:14px 20px;background:transparent;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4);cursor:pointer;font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;transition:all .15s}
  .modal-cancel-btn:hover{border-color:rgba(255,255,255,.3);color:#fff}

  /* ── SECHEAD (admin only) ── */
  .sechead{padding:20px 16px 14px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:20px}
  .sectitle{font-family:'Anton',sans-serif;font-size:26px;letter-spacing:2px;color:#fff;text-transform:uppercase}
  .secsub{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.45);margin-top:5px}

  /* ══════════════════════════════════════════


  /* ══════════════════════════════════════
     SPLASH — BALL + ROPE SIGN + NEON
  ══════════════════════════════════════ */
  .splash{position:relative;display:flex;align-items:center;justify-content:center;height:100vh;background:#000;overflow:hidden}
  .splash-shake{animation:screenShake 0.8s cubic-bezier(.36,.07,.19,.97) both}
  .sp-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,.92) 100%);pointer-events:none;z-index:1}
  .sp-flash{position:absolute;inset:0;background:#fff;z-index:20;animation:flashOut 0.5s ease forwards;pointer-events:none}
  .sp-cracks{position:absolute;top:50%;left:50%;z-index:3;pointer-events:none}
  .sp-crack{position:absolute;top:0;left:0;width:1px;height:0;background:linear-gradient(to bottom,rgba(255,255,255,.9),transparent);transform-origin:top center;animation:crackGrow 1.2s ease forwards}

  /* BALL — kicked from below, grows smoothly toward screen */
  .sp-ball-fly{
    position:absolute;z-index:5;
    bottom:0; left:50%;
    transform:translateX(-50%) scale(0.06);
    animation:ballApproach 3s cubic-bezier(.25,0,.15,1) forwards;
  }
  .sp-ball-smash{
    position:absolute;z-index:5;
    top:50%; left:50%;
    transform:translate(-50%,-50%) scale(4.5);
    animation:ballSmash 0.7s cubic-bezier(.1,0,.4,1) forwards;
  }
  .sp-ball{
    font-size:72px;
    line-height:1;
    display:block;
    animation:ballSpin 3s linear forwards;
  }
  .sp-ball-nospin{ animation:none }

  /* SIGN WRAPPER */
  .sp-sign-wrap{
    position:absolute;z-index:10;
    left:50%;
    display:flex;flex-direction:column;align-items:center;
    width:min(500px,88vw);
  }
  .sp-sign-drop{
    top:-500px;
    animation:signDrop 1.8s cubic-bezier(.22,1,.36,1) forwards;
  }
  .sp-sign-falling{
    top:50%;
    transform:translate(-50%,-50%);
    animation:signFall 1.2s cubic-bezier(.55,0,1,.45) forwards;
  }

  /* ROPES */
  .sp-ropes{display:flex;justify-content:space-between;width:65%;padding:0 8px}
  .sp-rope{width:2px;height:0;background:linear-gradient(to bottom,rgba(255,255,255,.05),rgba(255,255,255,.4),rgba(255,255,255,.15));animation:ropeGrow 0.5s ease 0.2s forwards}

  /* SIGN BOARD */
  .sp-sign-board{
    background:#080808;
    border:2px solid rgba(255,255,255,.2);
    padding:30px 38px 34px;
    text-align:center;
    width:100%;
    box-shadow:0 8px 60px rgba(0,0,0,.95), inset 0 0 40px rgba(0,0,0,.6);
    position:relative;
  }
  .sp-sign-board::before{content:'';position:absolute;inset:5px;border:1px solid rgba(255,255,255,.06);pointer-events:none}

  /* EL MUNDO — dim by default, neon turns on via JS */
  .sp-neon-main{
    font-family:'Anton',sans-serif;
    font-size:clamp(46px,10vw,82px);
    letter-spacing:8px;
    color:rgba(255,255,255,.18);
    line-height:1;
    text-transform:uppercase;
  }

  /* Divider */
  .sp-sign-divider{height:1px;background:rgba(255,255,255,.18);margin:14px 0 10px;width:100%}

  /* BAR · REST · BONAIRE */
  .sp-neon-sub2{
    font-family:'Anton',sans-serif;
    font-size:clamp(9px,2vw,13px);
    letter-spacing:5px;
    color:rgba(255,255,255,.18);
    text-transform:uppercase;
    margin-bottom:16px;
  }

  /* Separator gold line */
  .sp-sign-sep{height:1px;background:rgba(255,200,50,.2);margin:0 0 14px;width:80%}

  /* WORLD CUP 2026 — dim gold by default */
  .sp-neon-gold{
    font-family:'Anton',sans-serif;
    font-size:clamp(11px,2.4vw,17px);
    letter-spacing:10px;
    color:rgba(255,200,50,.18);
    text-transform:uppercase;
  }

  /* ── PAGE TRANSITIONS & UI ANIMATIONS ── */
  .page-anim{animation:pageIn 0.3s cubic-bezier(.4,0,.2,1) both}
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
  .toast{animation:toastBounce .4s cubic-bezier(.34,1.56,.64,1) both}
  .auth-panel{animation:fadeUp .5s cubic-bezier(.4,0,.2,1) .12s both}
  .auth-cta:active{transform:scale(.97)}

  /* ══ KEYFRAMES ══ */
  @keyframes screenShake{
    0%{transform:translate(0,0)}
    8%{transform:translate(-16px,-12px) rotate(-1.2deg)}
    16%{transform:translate(18px,14px) rotate(1.2deg)}
    24%{transform:translate(-16px,8px) rotate(-.8deg)}
    32%{transform:translate(14px,-14px) rotate(.8deg)}
    42%{transform:translate(-10px,10px) rotate(-.4deg)}
    52%{transform:translate(9px,-8px) rotate(.4deg)}
    63%{transform:translate(-6px,6px)}
    74%{transform:translate(4px,-4px)}
    86%{transform:translate(-2px,2px)}
    100%{transform:translate(0,0)}
  }
  @keyframes flashOut{0%{opacity:1}100%{opacity:0}}
  @keyframes crackGrow{0%{height:0;opacity:1}55%{opacity:.8}100%{height:clamp(90px,17vw,170px);opacity:0}}
  @keyframes ballApproach{
    /* single smooth perspective zoom from bottom — no jumps */
    0%   { bottom:0;    left:50%; transform:translateX(-50%) scale(0.06);  filter:blur(1px)   }
    20%  { bottom:8%;   left:50%; transform:translateX(-50%) scale(0.18);  filter:blur(0px)   }
    40%  { bottom:20%;  left:50%; transform:translate(-50%,-20%) scale(0.45) }
    60%  { bottom:40%;  left:50%; transform:translate(-50%,-40%) scale(1.0)  }
    78%  { bottom:50%;  left:50%; transform:translate(-50%,-50%) scale(2.2)  }
    90%  { bottom:50%;  left:50%; transform:translate(-50%,-50%) scale(3.6)  }
    100% { bottom:50%;  left:50%; transform:translate(-50%,-50%) scale(4.5)  }
  }
  @keyframes ballSmash{
    0%   { transform:translate(-50%,-50%) scale(4.5);  opacity:1   }
    30%  { transform:translate(-50%,-50%) scale(5.8);  opacity:1   }
    60%  { transform:translate(-50%,-50%) scale(4.2);  opacity:.75 }
    100% { transform:translate(-50%,-50%) scale(0.1);  opacity:0   }
  }
  @keyframes ballSpin{ from{transform:rotate(0deg)} to{transform:rotate(1440deg)} }
  @keyframes ropeGrow{from{height:0}to{height:clamp(30px,5.5vw,52px)}}
  @keyframes signDrop{
    0%  {top:-500px; transform:translateX(-50%) rotate(-4deg)}
    45% {top:53%;    transform:translateX(calc(-50% + 10px)) rotate(2.5deg)}
    62% {top:46%;    transform:translateX(calc(-50% - 6px))  rotate(-1.2deg)}
    75% {top:51%;    transform:translateX(calc(-50% + 3px))  rotate(.6deg)}
    86% {top:49%;    transform:translateX(calc(-50% - 1px))  rotate(-.2deg)}
    100%{top:50%;    transform:translate(-50%,-50%)           rotate(0deg)}
  }
  @keyframes signFall{
    0%  {top:50%; transform:translate(-50%,-50%) rotate(0deg);  opacity:1}
    12% {         transform:translate(-50%,-44%) rotate(4deg);  opacity:1}
    100%{top:160%;transform:translate(-50%,0)    rotate(18deg); opacity:0}
  }
  @keyframes neonWhiteOn{
    0%  {color:rgba(255,255,255,.18); text-shadow:none}
    5%  {color:#fff;                  text-shadow:0 0 8px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9)}
    10% {color:rgba(255,255,255,.1);  text-shadow:none}
    18% {color:#fff;                  text-shadow:0 0 8px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9)}
    24% {color:rgba(255,255,255,.05); text-shadow:none}
    33% {color:#fff;                  text-shadow:0 0 8px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9)}
    40% {color:rgba(255,255,255,.2);  text-shadow:none}
    50% {color:#fff;                  text-shadow:0 0 8px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9)}
    58% {color:rgba(255,255,255,.4)}
    67% {color:#fff;                  text-shadow:0 0 8px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9)}
    78% {color:rgba(255,255,255,.65)}
    88% {color:#fff;                  text-shadow:0 0 8px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9)}
    100%{color:#fff;                  text-shadow:0 0 5px #fff,0 0 12px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9),0 0 85px rgba(180,200,255,.5)}
  }
  @keyframes neonWhiteBreathe{
    0%,100%{text-shadow:0 0 5px #fff,0 0 12px #fff,0 0 22px #fff,0 0 45px rgba(200,220,255,.9),0 0 85px rgba(180,200,255,.5)}
    50%    {text-shadow:0 0 3px #fff,0 0 6px  #fff,0 0 12px #fff,0 0 22px rgba(200,220,255,.5),0 0 45px rgba(180,200,255,.25)}
  }
  @keyframes neonGoldOn{
    0%  {color:rgba(255,200,50,.18); text-shadow:none}
    6%  {color:rgba(255,200,50,1);   text-shadow:0 0 8px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9)}
    13% {color:rgba(255,200,50,.05); text-shadow:none}
    21% {color:rgba(255,200,50,1);   text-shadow:0 0 8px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9)}
    28% {color:rgba(255,200,50,.1);  text-shadow:none}
    37% {color:rgba(255,200,50,1);   text-shadow:0 0 8px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9)}
    46% {color:rgba(255,200,50,.25)}
    55% {color:rgba(255,200,50,1);   text-shadow:0 0 8px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9)}
    65% {color:rgba(255,200,50,.5)}
    74% {color:rgba(255,200,50,1);   text-shadow:0 0 8px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9)}
    85% {color:rgba(255,200,50,.75)}
    93% {color:rgba(255,200,50,1);   text-shadow:0 0 8px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9)}
    100%{color:rgba(255,200,50,1);   text-shadow:0 0 5px rgba(255,200,50,1),0 0 12px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9),0 0 45px rgba(255,160,20,.7),0 0 85px rgba(255,140,10,.4)}
  }
  @keyframes neonGoldBreathe{
    0%,100%{text-shadow:0 0 5px rgba(255,200,50,1),0 0 12px rgba(255,200,50,1),0 0 22px rgba(255,180,30,.9),0 0 45px rgba(255,160,20,.7),0 0 85px rgba(255,140,10,.4)}
    50%    {text-shadow:0 0 3px rgba(255,200,50,.7),0 0 7px rgba(255,200,50,.7),0 0 12px rgba(255,180,30,.5),0 0 25px rgba(255,160,20,.35),0 0 50px rgba(255,140,10,.2)}
  }
  @keyframes subWhiteOn{from{color:rgba(255,255,255,.18)}to{color:rgba(255,255,255,.5)}}
  @keyframes dividerOn{from{opacity:0}to{opacity:1}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pageIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes cardIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
  @keyframes heroReveal{from{opacity:0;transform:scaleY(.96)}to{opacity:1;transform:scaleY(1)}}
  @keyframes digitPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
  @keyframes toastBounce{from{opacity:0;transform:translateX(-50%) translateY(-120%) scale(.85)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
  @keyframes expandW{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  @keyframes fillBar{from{width:0}to{width:100%}}
`;


