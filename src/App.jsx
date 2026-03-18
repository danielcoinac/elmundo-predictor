import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from '@supabase/supabase-js';

/* ─── Supabase ──────────────────────────────────────────────────────────────── */
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

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
  const [rooms,    setRooms]    = useState([]);
  const [myRooms,  setMyRooms]  = useState([]); // room_ids the user belongs to
  const [publicBoard, setPublicBoard] = useState([]);

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
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
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
          // load rooms
          const { data: rpRows } = await supabase.from("room_participants").select("room_id").eq("user_id", session.user.id);
          if (rpRows) setMyRooms(rpRows.map(r => r.room_id));
          const { data: roomRows } = await supabase.from("rooms").select("*");
          if (roomRows) setRooms(roomRows);

          // Show splash briefly (ball smash moment ~3.5s), then go to app
          setTimeout(() => setPage("app"), 3500);
          return;
        }
      }
      // Not logged in — show splash until ball hits then go to auth
      setTimeout(() => setPage("auth"), 3500);
    })();
  }, []);

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
        allProfiles.filter(p => !p.is_admin).forEach(p => { usersMap[p.id] = p; });
        setUsers(usersMap);
        // also refresh public TV board
        const { data: allPreds2 } = await supabase.from("predictions").select("*");
        if (allPreds2 && mRows) {
          const pm = {};
          allPreds2.forEach(p => { pm[`${p.user_id}__${p.match_id}`] = { h: p.home_pred, a: p.away_pred }; });
          const fin = mRows.filter(r => r.status === "finished");
          const pb = allProfiles.filter(u => !u.is_admin).map(u => ({
            ...u,
            pts: fin.reduce((acc, m) => {
              const p = pm[`${u.id}__${m.id}`];
              return acc + calcPts(p, m.home_score, m.away_score);
            }, 0)
          })).sort((a,b) => b.pts - a.pts).slice(0, 10);
          setPublicBoard(pb);
        }
      }
      const { data: allPreds } = await supabase.from("predictions").select("*");
      if (allPreds) {
        const predMap = {};
        allPreds.forEach(p => { predMap[`${p.user_id}__${p.match_id}`] = { h: p.home_pred, a: p.away_pred }; });
        setPreds(predMap);
      }
      const { data: roomRows } = await supabase.from("rooms").select("*");
      if (roomRows) {
        setRooms(roomRows);
        // Auto self-join: if the current user created a room that just got approved
        // and they're not yet a participant — insert themselves
        const { data: rpRefresh } = await supabase.auth.getSession();
        if (rpRefresh?.session) {
          const uid = rpRefresh.session.user.id;
          const { data: myRoomRows } = await supabase.from("room_participants").select("room_id").eq("user_id", uid);
          if (myRoomRows) {
            const myRoomIds = myRoomRows.map(r => r.room_id);
            setMyRooms(myRoomIds);
            // Find rooms I created that are now approved but I'm not yet in
            const needsJoin = roomRows.filter(r =>
              r.created_by === uid &&
              r.status === "approved" &&
              !myRoomIds.includes(r.id)
            );
            for (const r of needsJoin) {
              await supabase.from("room_participants").upsert(
                { room_id: r.id, user_id: uid },
                { onConflict: "room_id,user_id" }
              );
              setMyRooms(prev => prev.includes(r.id) ? prev : [...prev, r.id]);
            }
          }
        }
      }
    }, 5000);
    return () => clearInterval(id);
  }, [page]);

  const toast$ = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3200); };

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
    const { data: predRows } = await supabase.from("predictions").select("*").eq("user_id", data.user.id);
    if (predRows) {
      const predMap = {};
      predRows.forEach(p => { predMap[`${data.user.id}__${p.match_id}`] = { h: p.home_pred, a: p.away_pred }; });
      setPreds(predMap);
    }
    const { data: allProfiles } = await supabase.from("profiles").select("*");
    if (allProfiles) {
      const usersMap = {};
      allProfiles.filter(p => p.is_admin !== true && p.is_admin !== 1 && p.is_admin !== "true").forEach(p => { usersMap[p.id] = p; });
      setUsers(usersMap);
    }
    const { data: rpRows2 } = await supabase.from("room_participants").select("room_id").eq("user_id", data.user.id);
    if (rpRows2) setMyRooms(rpRows2.map(r => r.room_id));
    const { data: roomRows2 } = await supabase.from("rooms").select("*");
    if (roomRows2) setRooms(roomRows2);
    setPage("app");
    toast$(`Welcome back, ${profile.name}!`);
  };

  const doLogout = async () => {
    await supabase.auth.signOut();
    setUser(null); setPage("auth");
    setForm({ name:"", email:"", phone:"", password:"" });
    setPreds({}); setUsers({}); setRooms([]); setMyRooms([]);
  };

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
  const requestRoom = async ({ name, prize, description, max_members, enable_chat, enable_leaderboard, enable_feed }) => {
    const { data, error } = await supabase.from("rooms").insert({
      room_name: name,
      prize: prize || null,
      description: description || null,
      max_members: max_members || 50,
      enable_chat: enable_chat !== false,
      enable_leaderboard: enable_leaderboard !== false,
      enable_feed: enable_feed !== false,
      created_by: user.id,
      requested_by_name: user.name,
      status: "pending",
      room_code: "PENDING",   // placeholder — overwritten on approval
    }).select().single();
    if (error) {
      console.error("requestRoom error:", error);
      toast$(`Error: ${error.message}`, false);
      return;
    }
    setRooms(r => [...r, data]);
    toast$("Room request submitted! Waiting for admin approval ⏳");
    return data;
  };

  const approveRoom = async (roomId) => {
    const code = Math.random().toString(36).substring(2,6).toUpperCase();
    const { error } = await supabase.from("rooms").update({ status: "approved", room_code: code }).eq("id", roomId);
    if (error) { toast$("Error approving room", false); return; }

    // Get the room to find its creator
    const room = rooms.find(r => r.id === roomId);
    if (room?.created_by) {
      // Add creator as participant — upsert so it won't fail if already exists
      await supabase.from("room_participants").upsert(
        { room_id: roomId, user_id: room.created_by },
        { onConflict: "room_id,user_id" }
      );
    }

    setRooms(r => r.map(x => x.id === roomId ? { ...x, status: "approved", room_code: code } : x));
    toast$(`Room approved! Code: ${code} ✓`);
  };

  const rejectRoom = async (roomId) => {
    const { error } = await supabase.from("rooms").update({ status: "rejected" }).eq("id", roomId);
    if (error) { toast$("Error rejecting room", false); return; }
    setRooms(r => r.map(x => x.id === roomId ? { ...x, status: "rejected" } : x));
    toast$("Room rejected");
  };

  const updateRoomSettings = async (roomId, settings) => {
    const { error } = await supabase.from("rooms").update(settings).eq("id", roomId);
    if (error) { toast$("Error saving settings", false); return; }
    setRooms(r => r.map(x => x.id === roomId ? { ...x, ...settings } : x));
    toast$("Settings saved ✓");
  };

  const joinRoom = async (code) => {
    const room = rooms.find(r => r.room_code === code.toUpperCase() && r.status === "approved" && r.room_code !== "PENDING");
    if (!room) { toast$("Room not found or not yet approved — check the code", false); return; }
    if (myRooms.includes(room.id)) { toast$("You're already in this room!", false); return; }
    if (room.max_members) {
      const { count } = await supabase.from("room_participants").select("*", { count:"exact", head:true }).eq("room_id", room.id);
      if (count >= room.max_members) { toast$("This room is full!", false); return; }
    }
    const { error } = await supabase.from("room_participants").insert({ room_id: room.id, user_id: user.id });
    if (error) { toast$("Error joining room", false); return; }
    setMyRooms(r => [...r, room.id]);
    toast$(`Joined "${room.room_name}" 🎉`);
  };

  const leaveRoom = async (roomId) => {
    await supabase.from("room_participants").delete().eq("room_id", roomId).eq("user_id", user.id);
    setMyRooms(r => r.filter(id => id !== roomId));
    toast$("Left room");
  };

  const deleteRoom = async (roomId) => {
    await supabase.from("rooms").delete().eq("id", roomId);
    setRooms(r => r.filter(x => x.id !== roomId));
    setMyRooms(r => r.filter(id => id !== roomId));
    toast$("Room deleted ✓");
  };

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

  return (
    <div style={{ fontFamily:"'Outfit',sans-serif", background:"#000", minHeight:"100vh", color:"#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Anton&family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{CSS}</style>
      {toast && (
        <div className={`notification ${toast.ok ? "notif-ok" : "notif-err"}`}>
          <span className="notif-dot">{toast.ok ? "✓" : "!"}</span>
          <span className="notif-msg">{toast.msg}</span>
        </div>
      )}
      {page === "splash" && <Splash onSkip={() => setPage(user ? "app" : "auth")} />}
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
          rooms={rooms} myRooms={myRooms} users={users}
          requestRoom={requestRoom} joinRoom={joinRoom} leaveRoom={leaveRoom} deleteRoom={deleteRoom} updateRoomSettings={updateRoomSettings}
          approveRoom={approveRoom} rejectRoom={rejectRoom}
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
function Splash({ onSkip }) {
  const mainRef  = useRef(null);
  const goldRef  = useRef(null);
  const sub2Ref  = useRef(null);
  const divRef   = useRef(null);
  const sepRef   = useRef(null);
  const signRef  = useRef(null);
  const ballRef  = useRef(null);

  const [showBall, setShowBall] = useState(true);
  const [ballHit,  setBallHit]  = useState(false);
  const [showSign, setShowSign] = useState(false);
  const [shake,    setShake]    = useState(false);
  const [flash,    setFlash]    = useState(false);
  const [cracks,   setCracks]   = useState(false);
  const [falling,  setFalling]  = useState(false);
  const [tapHint,  setTapHint]  = useState(false);

  useEffect(() => {
    const T = [];
    const at = (ms, fn) => T.push(setTimeout(fn, ms));

    // Show tap hint after ball appears
    at(800, () => setTapHint(true));

    at(3000, () => {
      setBallHit(true);
      setShake(true); setFlash(true); setCracks(true);
      setTimeout(() => setShake(false), 850);
      setTimeout(() => setFlash(false), 500);
      setTimeout(() => setCracks(false), 1200);
    });
    at(3700, () => { setShowBall(false); setShowSign(true); setTapHint(false); });
    at(5800, () => {
      if (mainRef.current) mainRef.current.style.animation = 'neonWhiteOn 3.5s ease forwards';
      if (sub2Ref.current) sub2Ref.current.style.animation = 'subWhiteOn 1.2s ease 2s forwards';
      if (divRef.current)  divRef.current.style.animation  = 'dividerOn 0.6s ease 2.2s forwards';
    });
    at(9800, () => {
      if (goldRef.current) goldRef.current.style.animation = 'neonGoldOn 3.5s ease forwards';
      if (sepRef.current)  sepRef.current.style.animation  = 'dividerOn 0.5s ease 0.3s forwards';
    });
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
    at(16500, () => setFalling(true));
    return () => T.forEach(clearTimeout);
  }, []);

  return (
    <div className={`splash${shake ? ' splash-shake' : ''}`} onClick={onSkip}>
      <div className="sp-vignette" />
      {flash  && <div className="sp-flash" />}
      {tapHint && <div className="sp-tap-hint">TAP TO SKIP</div>}
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
            <div ref={mainRef} className="sp-neon-main">EL MUNDO</div>
            <div ref={divRef}  className="sp-sign-divider" style={{opacity:0}} />
            <div ref={sub2Ref} className="sp-neon-sub2">BAR · REST · BONAIRE</div>
            <div ref={sepRef}  className="sp-sign-sep"  style={{opacity:0}} />
            <div ref={goldRef} className="sp-neon-gold">WORLD CUP 2026</div>
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

    const particles = Array.from({ length: 120 }, () => ({
      x: Math.random(),
      y: 0.1 + Math.random() * 0.9,
      vy: -(0.00015 + Math.random() * 0.0003),
      vx: (Math.random() - 0.5) * 0.0001,
      size: 0.5 + Math.random() * 1.8,
      alpha: 0.08 + Math.random() * 0.38,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.8,
    }));

    const sweeps = Array.from({ length: 3 }, (_, i) => ({
      y: 0.55 + i * 0.18,
      x: Math.random(),
      vx: 0.0003 + Math.random() * 0.0004,
      width: 0.08 + Math.random() * 0.12,
      alpha: 0.035 + Math.random() * 0.03,
      phase: Math.random() * Math.PI * 2,
    }));

    let t = 0;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      t += 0.008;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      // Green pitch glow from bottom
      const pitchGlow = ctx.createRadialGradient(W*0.5, H*1.1, 0, W*0.5, H*1.1, W*0.85);
      pitchGlow.addColorStop(0,    "rgba(18,38,12,0.5)");
      pitchGlow.addColorStop(0.4,  "rgba(8,20,6,0.2)");
      pitchGlow.addColorStop(0.75, "rgba(3,8,3,0.07)");
      pitchGlow.addColorStop(1,    "transparent");
      ctx.fillStyle = pitchGlow;
      ctx.fillRect(0, 0, W, H);

      // Side vignette
      [[0, W*0.35], [W, W*0.65]].forEach(([x0, x1]) => {
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, "rgba(6,10,18,0.55)");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });

      // Horizontal sweep glows
      sweeps.forEach(s => {
        s.x += s.vx;
        if (s.x > 1.2) s.x = -0.2;
        const pulse = 0.7 + 0.3 * Math.sin(t * 0.5 + s.phase);
        const sx = s.x * W, sy = s.y * H, sw = s.width * W;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sw);
        grad.addColorStop(0,   `rgba(200,220,255,${s.alpha * pulse})`);
        grad.addColorStop(0.45,`rgba(180,205,255,${s.alpha * 0.35 * pulse})`);
        grad.addColorStop(1,   "transparent");
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sw, sw * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Floating dust particles
      particles.forEach(p => {
        p.y += p.vy;
        p.x += p.vx + Math.sin(t * p.speed + p.phase) * 0.00008;
        if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
        const flicker = 0.45 + 0.55 * Math.sin(t * p.speed * 3 + p.phase);
        const fadeTop = Math.min(1, p.y / 0.12);
        const finalAlpha = p.alpha * flicker * fadeTop;
        if (finalAlpha < 0.012) return;
        const px = p.x * W, py = p.y * H;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const pg = ctx.createRadialGradient(px, py, 0, px, py, p.size * 3);
        pg.addColorStop(0, `rgba(210,228,255,${finalAlpha})`);
        pg.addColorStop(1, "transparent");
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(px, py, p.size * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Two minimal corner lights
      [[W * 0.11, 0], [W * 0.89, 0]].forEach(([lx, ly], idx) => {
        const tilt = idx === 0 ? -0.2 : 0.2;
        const pulse = 0.88 + 0.12 * Math.sin(t * 0.6 + idx * 2.1);

        // Bulb glow
        const src = ctx.createRadialGradient(lx, ly, 0, lx, ly, W * 0.055);
        src.addColorStop(0,   `rgba(235,245,255,${0.22 * pulse})`);
        src.addColorStop(0.35,`rgba(215,232,255,${0.08 * pulse})`);
        src.addColorStop(1,   "transparent");
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = src; ctx.beginPath();
        ctx.arc(lx, ly, W * 0.055, 0, Math.PI * 2); ctx.fill(); ctx.restore();

        // Single tight beam
        const bLen = H * 1.5;
        const la = tilt - 0.018, ra = tilt + 0.018;
        const bg = ctx.createRadialGradient(lx, ly, 0, lx, ly, bLen * 0.45);
        bg.addColorStop(0,   `rgba(215,232,255,${0.14 * pulse})`);
        bg.addColorStop(0.25,`rgba(200,225,255,${0.06 * pulse})`);
        bg.addColorStop(0.6, `rgba(185,215,255,${0.015 * pulse})`);
        bg.addColorStop(1,   "transparent");
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.beginPath(); ctx.moveTo(lx, ly);
        ctx.lineTo(lx + Math.sin(la)*bLen, ly + Math.cos(Math.abs(la))*bLen);
        ctx.lineTo(lx + Math.sin(ra)*bLen, ly + Math.cos(Math.abs(ra))*bLen);
        ctx.closePath(); ctx.fillStyle = bg; ctx.fill(); ctx.restore();

        // Small bulb cluster dots
        const dots = idx === 0
          ? [{dx:-0.04,dy:0.002},{dx:-0.025,dy:-0.012},{dx:-0.010,dy:-0.016},{dx:0.006,dy:-0.013},{dx:0.018,dy:-0.005}]
          : [{dx:0.04,dy:0.002},{dx:0.025,dy:-0.012},{dx:0.010,dy:-0.016},{dx:-0.006,dy:-0.013},{dx:-0.018,dy:-0.005}];
        dots.forEach((d, di) => {
          const bp = pulse * (0.85 + 0.15 * Math.sin(t * 1.2 + di * 0.8));
          const dx = lx + d.dx * W, dy = ly + d.dy * H;
          const cg = ctx.createRadialGradient(dx, dy, 0, dx, dy, W * 0.012);
          cg.addColorStop(0,   `rgba(255,255,255,${0.9 * bp})`);
          cg.addColorStop(0.3, `rgba(235,245,255,${0.5 * bp})`);
          cg.addColorStop(1,   "transparent");
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = cg; ctx.beginPath();
          ctx.arc(dx, dy, W * 0.012, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        });
      });

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
  const [showTV, setShowTV] = useState(false);
  const set = k => e => { setForm(f=>({...f,[k]:e.target.value})); setErr(""); };
  const isLogin = tab === "login";

  if (showTV) return <TVLeaderboard board={publicBoard} onBack={() => setShowTV(false)} />;

  return (
    <div className="auth-root">
      <StadiumSky />
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
        <button className="tv-lb-btn" onClick={() => setShowTV(true)}>
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
                rooms, myRooms, users,
                requestRoom, joinRoom, leaveRoom, deleteRoom, updateRoomSettings,
                approveRoom, rejectRoom,
                adminUpdateMatch, adminAddMatch, adminDeleteMatch,
                adminSaveRules, adminSaveSponsors }) {
  const myPts  = pts(user.id);
  const myRank = board.findIndex(u => u.id === user.id) + 1;
  const [animKey, setAnimKey] = useState(appTab);
  const slideDirRef = useRef(1);

  const tabs = [
    { id:"matches",     label:"Matches",  ico:<SoccerIco /> },
    { id:"leaderboard", label:"Ranking",  ico:<TrophyIco /> },
    { id:"rooms",       label:"Rooms",    ico:<RoomsIco />  },
    { id:"rules",       label:"Rules",    ico:<RulesIco />  },
    { id:"sponsors",    label:"Sponsors", ico:<StarIco />   },
    { id:"profile",     label:"Profile",  ico:<PersonIco /> },
    ...(isAdmin ? [{ id:"admin", label:"Admin", ico:<AdminIco /> }] : []),
  ];

  const switchTab = (id) => {
    const fromIdx = tabs.findIndex(t => t.id === appTab);
    const toIdx   = tabs.findIndex(t => t.id === id);
    slideDirRef.current = toIdx >= fromIdx ? 1 : -1;
    setAnimKey(id); setAppTab(id);
  };

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
        <div className={`body-inner ${slideDirRef.current >= 0 ? "page-slide-fwd" : "page-slide-bwd"}`} key={animKey}>
          {appTab === "matches"     && <MatchesView matches={matches} getPred={getPred} savePred={savePred} />}
          {appTab === "leaderboard" && <LeaderView  board={board} user={user} />}
          {appTab === "rooms" && <RoomsView user={user} rooms={rooms} myRooms={myRooms} users={users} preds={preds} matches={matches} pts={pts} requestRoom={requestRoom} joinRoom={joinRoom} leaveRoom={leaveRoom} deleteRoom={deleteRoom} updateRoomSettings={updateRoomSettings} isAdmin={isAdmin} />}
          {appTab === "rules"       && <RulesView   rules={rules} />}
          {appTab === "sponsors"    && <SponsorsView sponsors={sponsors} />}
          {appTab === "profile"     && <ProfileView user={user} myPts={myPts} myRank={myRank} preds={preds} matches={matches} />}
          {appTab === "admin" && isAdmin && (
            <AdminView
              matches={matches} rules={rules} sponsors={sponsors} rooms={rooms}
              onUpdate={adminUpdateMatch} onAdd={adminAddMatch} onDelete={adminDeleteMatch}
              onSaveRules={adminSaveRules} onSaveSponsors={adminSaveSponsors}
              onDeleteRoom={deleteRoom} onApproveRoom={approveRoom} onRejectRoom={rejectRoom}
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
  const upcoming = sortMatches(matches.filter(m => m.status === "upcoming"));
  const finished = sortMatches(matches.filter(m => m.status === "finished"));

  // collect unique dates across all matches
  const allDates = [...new Set(sortMatches(matches).map(m => m.date).filter(Boolean))];
  const [selDate, setSelDate] = useState("all");

  const filterByDate = arr => selDate === "all" ? arr : arr.filter(m => m.date === selDate);
  const visUpcoming = filterByDate(upcoming);
  const visFinished = filterByDate(finished);

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
function minsUntilKickoff(m) {
  const ko = matchKickoff(m);
  if (!ko) return Infinity;
  return (ko - Date.now()) / 60000;
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
  else if (totalMins > 10) { label = `${min}m ${sec}s left`; urgency = "red"; }
  else { label = `${min}m ${sec}s`; urgency = "red"; }
  return { minsLeft: totalMins, label, urgency };
}

function ScoreInput({ val, onChange }) {
  const n = val === "" ? null : +val;
  const dec = () => { if (n === null) return; onChange(Math.max(0, n - 1)); };
  const inc = () => { onChange(n === null ? 0 : Math.min(20, n + 1)); };
  return (
    <div className="stepper">
      <button className="stepper-btn" onClick={dec} type="button">−</button>
      <input
        className="stepper-inp"
        type="number" min="0" max="20"
        value={val}
        onChange={e => onChange(e.target.value === "" ? "" : +e.target.value)}
        placeholder="–"
      />
      <button className="stepper-btn stepper-btn-plus" onClick={inc} type="button">+</button>
    </div>
  );
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
          <span className={`countdown-chip${urgency === "red" ? " countdown-pulse" : ""}`} style={{color: urgencyColor, borderColor: urgencyBorder, background: urgencyBg, boxShadow: urgencyGlow}}>
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
              <ScoreInput val={h} onChange={setH} />
              <span className="ssep">:</span>
              <ScoreInput val={a} onChange={setA} />
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
        <div className="mverdict mv-ng"><IcoX /> No prediction — predictions closed</div>
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
      {top3.length > 0 && (
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
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = p < 1 ? p * p * (3 - 2 * p) : 1;
      setVal(Math.round(eased * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target]);
  return val;
}

function ProfileView({ user, myPts, myRank, preds, matches }) {
  const fin  = matches.filter(m => m.status==="finished");
  const sub  = fin.filter(m => !!preds[`${user.id}__${m.id}`]).length;
  const corr = fin.filter(m => { const p=preds[`${user.id}__${m.id}`]; return p&&p.h===m.hs&&p.a===m.as; }).length;
  const acc  = sub>0 ? Math.round(corr/sub*100) : 0;
  const initials = user.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const animPts  = useCountUp(myPts);
  const animCorr = useCountUp(corr);
  const animAcc  = useCountUp(acc);
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
          {v:animPts,                    u:"PTS", l:"Total Points"},
          {v:myRank>0?`#${myRank}`:"—", u:"",    l:"Your Rank"},
          {v:`${animCorr}/${sub}`,       u:"",    l:"Correct"},
          {v:animAcc,                    u:"%",   l:"Accuracy"},
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
    </div>
  );
}

/* ═══ ADMIN VIEW ════════════════════════════════════════════════════════════ */
function AdminView({ matches, rules, sponsors, rooms, onUpdate, onAdd, onDelete, onSaveRules, onSaveSponsors, onDeleteRoom, onApproveRoom, onRejectRoom }) {
  const [section, setSection] = useState("matches");
  const pendingCount = rooms.filter(r => r.status === "pending").length;
  return (
    <div className="vpad">
      <SecHead title="Admin Panel" sub="Manage all content from here" />
      <div className="admin-subtabs">
        {[
          { id:"matches",  label:"⚽ Matches"  },
          { id:"rules",    label:"📋 Rules"    },
          { id:"sponsors", label:"⭐ Sponsors" },
          { id:"rooms",    label: pendingCount > 0 ? `🏠 Rooms · ${pendingCount} pending` : "🏠 Rooms" },
        ].map(t => (
          <button key={t.id} className={`admin-subtab ${section===t.id?"ast-on":""}`} onClick={()=>setSection(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {section === "matches"  && <AdminMatches  matches={matches}   onUpdate={onUpdate} onAdd={onAdd} onDelete={onDelete} />}
      {section === "rules"    && <AdminRules    rules={rules}       onSave={onSaveRules} />}
      {section === "sponsors" && <AdminSponsors sponsors={sponsors} onSave={onSaveSponsors} />}
      {section === "rooms"    && <AdminRooms    rooms={rooms}       onDelete={onDeleteRoom} onApprove={onApproveRoom} onReject={onRejectRoom} />}
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
        <div style={{display:"flex",gap:8}}>
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
function AdminRooms({ rooms, onDelete, onApprove, onReject }) {
  const [confirm, setConfirm] = useState(null);
  const pending  = rooms.filter(r => r.status === "pending");
  const approved = rooms.filter(r => r.status === "approved");
  const rejected = rooms.filter(r => r.status === "rejected");

  return (
    <div>
      {confirm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">Delete this room?</div>
            <p className="modal-body">All messages and participants will be removed. This cannot be undone.</p>
            <div className="modal-actions">
              <button className="modal-del-btn" onClick={()=>{ onDelete(confirm); setConfirm(null); }}>Yes, Delete</button>
              <button className="modal-cancel-btn" onClick={()=>setConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* PENDING */}
      <div className="admin-section-lbl" style={{marginTop:16}}>
        PENDING APPROVAL <span className="admin-count" style={{background: pending.length?"rgba(251,191,36,.15)":"", borderColor: pending.length?"rgba(251,191,36,.3)":""}}>{pending.length}</span>
      </div>
      {pending.length === 0 && <div className="empty" style={{padding:"28px 0"}}>No pending requests</div>}
      {pending.map(r => (
        <div key={r.id} className="admin-row" style={{borderLeft:"3px solid rgba(251,191,36,.4)"}}>
          <div className="admin-row-left">
            <span className="admin-row-group" style={{color:"rgba(251,191,36,.8)"}}>⏳ PENDING</span>
            <span className="admin-row-teams">{r.room_name}</span>
            <span className="admin-row-dt">Requested by: {r.requested_by_name}</span>
            {r.prize && <span className="admin-row-dt">🏆 {r.prize}</span>}
            {r.description && <span className="admin-row-dt" style={{color:"rgba(255,255,255,.4)"}}>"{r.description}"</span>}
            <span className="admin-row-dt" style={{fontSize:10}}>
              Chat: {r.enable_chat?"✓":"✗"} · Feed: {r.enable_feed?"✓":"✗"} · Leaderboard: {r.enable_leaderboard?"✓":"✗"} · Max: {r.max_members}
            </span>
          </div>
          <div className="admin-row-right">
            <button className="admin-save-btn" style={{padding:"8px 14px",fontSize:9,letterSpacing:2,background:"#22c55e",color:"#000"}} onClick={()=>onApprove(r.id)}>✓ APPROVE</button>
            <button className="admin-cancel-btn" style={{padding:"8px 12px",fontSize:10}} onClick={()=>onReject(r.id)}>✕ REJECT</button>
            <button className="admin-del-btn" onClick={()=>setConfirm(r.id)}>🗑</button>
          </div>
        </div>
      ))}

      {/* APPROVED */}
      <div className="admin-section-lbl" style={{marginTop:20}}>
        APPROVED <span className="admin-count">{approved.length}</span>
      </div>
      {approved.length === 0 && <div className="empty" style={{padding:"20px 0"}}>No approved rooms yet</div>}
      {approved.map(r => (
        <div key={r.id} className="admin-row" style={{borderLeft:"3px solid rgba(34,197,94,.3)"}}>
          <div className="admin-row-left">
            <span className="admin-row-group" style={{color:"rgba(34,197,94,.7)",letterSpacing:3}}>{r.room_code}</span>
            <span className="admin-row-teams">{r.room_name}</span>
            <span className="admin-row-dt">By: {r.requested_by_name}{r.prize ? ` · 🏆 ${r.prize}` : ""}</span>
          </div>
          <div className="admin-row-right">
            <button className="admin-del-btn" onClick={()=>setConfirm(r.id)}>✕</button>
          </div>
        </div>
      ))}

      {/* REJECTED */}
      {rejected.length > 0 && <>
        <div className="admin-section-lbl" style={{marginTop:20}}>REJECTED <span className="admin-count">{rejected.length}</span></div>
        {rejected.map(r => (
          <div key={r.id} className="admin-row" style={{opacity:.45}}>
            <div className="admin-row-left">
              <span className="admin-row-group" style={{color:"rgba(239,68,68,.6)"}}>✕ REJECTED</span>
              <span className="admin-row-teams">{r.room_name}</span>
              <span className="admin-row-dt">By: {r.requested_by_name}</span>
            </div>
            <div className="admin-row-right">
              <button className="admin-save-btn" style={{padding:"6px 12px",fontSize:8,letterSpacing:2}} onClick={()=>onApprove(r.id)}>RE-APPROVE</button>
              <button className="admin-del-btn" onClick={()=>setConfirm(r.id)}>✕</button>
            </div>
          </div>
        ))}
      </>}

      <div className="admin-hint">💡 Approving generates a unique code. The room creator sees it in their app to share.</div>
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

function SecHead({ title, sub }) {
  return (
    <div className="sechead">
      <h2 className="sectitle">{title}</h2>
      {sub && <p className="secsub">{sub}</p>}
    </div>
  );
}

/* Icons */
const RoomsIco  = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
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

/* ═══ ROOMS VIEW ════════════════════════════════════════════════════════════ */
function RoomsView({ user, rooms, myRooms, users, preds, matches, pts, requestRoom, joinRoom, leaveRoom, deleteRoom, updateRoomSettings, isAdmin }) {
  const [subTab,     setSubTab]     = useState("mine");
  const [joinCode,   setJoinCode]   = useState("");
  const [activeRoom, setActiveRoom] = useState(null);
  const [joining,    setJoining]    = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [reqForm,    setReqForm]    = useState({
    name:"", prize:"", description:"", max_members:50,
    enable_chat:true, enable_leaderboard:true, enable_feed:true
  });

  // My rooms: approved ones I joined, plus my own pending/rejected requests
  const myApprovedRooms = rooms.filter(r => r.status === "approved" && myRooms.includes(r.id));
  const myRequests      = rooms.filter(r => r.created_by === user.id && r.status !== "approved");
  const browseRooms     = rooms.filter(r => r.status === "approved" && !myRooms.includes(r.id));

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    await joinRoom(joinCode.trim());
    setJoinCode(""); setJoining(false); setSubTab("mine");
  };

  const handleRequest = async () => {
    if (!reqForm.name.trim()) return;
    setRequesting(true);
    await requestRoom(reqForm);
    setRequesting(false);
    setReqForm({ name:"", prize:"", description:"", max_members:50, enable_chat:true, enable_leaderboard:true, enable_feed:true });
    setSubTab("mine");
  };

  const currentActiveRoom = activeRoom ? rooms.find(r => r.id === activeRoom.id) || activeRoom : null;

  if (currentActiveRoom && currentActiveRoom.status === "approved") {
    return (
      <RoomDetail
        room={currentActiveRoom} user={user} users={users}
        preds={preds} matches={matches} pts={pts}
        isOwner={currentActiveRoom.created_by === user.id} isAdmin={isAdmin}
        onBack={() => setActiveRoom(null)}
        onLeave={async () => { await leaveRoom(currentActiveRoom.id); setActiveRoom(null); }}
        onDelete={async () => { await deleteRoom(currentActiveRoom.id); setActiveRoom(null); }}
        onSaveSettings={(s) => updateRoomSettings(currentActiveRoom.id, s)}
      />
    );
  }

  return (
    <div>
      <div className="section-banner">
        <span className="section-banner-title">ROOMS</span>
        <span className="section-banner-sub">Request a private room · Admin approves · Share code</span>
      </div>
      <div className="admin-subtabs">
        {[{id:"mine",label:"My Rooms"},{id:"request",label:"+ Request Room"},{id:"join",label:"Join with Code"}].map(t => (
          <button key={t.id} className={`admin-subtab ${subTab===t.id?"ast-on":""}`} onClick={()=>setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* MY ROOMS */}
      {subTab === "mine" && (
        <div>
          {/* Approved rooms I'm in */}
          {myApprovedRooms.length === 0 && myRequests.length === 0 && (
            <div className="room-empty-state">
              <div className="room-empty-ico">🏠</div>
              <div className="room-empty-title">No rooms yet</div>
              <div className="room-empty-sub">Request a room or join one with a code</div>
            </div>
          )}
          {myApprovedRooms.map(r => (
            <RoomCard key={r.id} room={r} isOwner={r.created_by === user.id} isAdmin={isAdmin} myRooms={myRooms}
              onView={() => setActiveRoom(r)}
              onDelete={async (e) => { e.stopPropagation(); await deleteRoom(r.id); }}
            />
          ))}

          {/* My pending/rejected requests */}
          {myRequests.length > 0 && (
            <div>
              <div className="admin-section-lbl" style={{padding:"18px 14px 8px"}}>MY REQUESTS</div>
              {myRequests.map(r => (
                <div key={r.id} className={`room-request-row ${r.status === "rejected" ? "room-request-rejected" : ""}`}>
                  <div className="room-request-left">
                    <span className={`room-request-status ${r.status === "pending" ? "rrs-pending" : "rrs-rejected"}`}>
                      {r.status === "pending" ? "⏳ PENDING APPROVAL" : "✕ REJECTED"}
                    </span>
                    <span className="room-card-name">{r.room_name}</span>
                    {r.prize && <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,200,50,.6)"}}>🏆 {r.prize}</span>}
                    {r.status === "pending" && <span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.3)"}}>Waiting for admin to review</span>}
                    {r.status === "rejected" && <span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(239,68,68,.4)"}}>Your request was not approved</span>}
                  </div>
                  <div className="admin-row-right">
                    <button className="admin-del-btn" onClick={() => deleteRoom(r.id)} title="Cancel request">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REQUEST ROOM */}
      {subTab === "request" && (
        <div style={{padding:"16px 14px"}}>
          <div className="room-request-info">
            <span className="room-request-info-ico">ℹ️</span>
            <span className="room-request-info-text">Submit your room details below. Once the admin approves, a unique code will appear in your room so you can invite people.</span>
          </div>
          <div className="admin-form-card" style={{marginTop:12}}>
            <div className="admin-form-title">ROOM REQUEST</div>
            <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
              <AField label="Room Name *" val={reqForm.name} on={e=>setReqForm(f=>({...f,name:e.target.value}))} ph="e.g. Los Amigos FC" />
              <AField label="Prize (optional)" val={reqForm.prize} on={e=>setReqForm(f=>({...f,prize:e.target.value}))} ph="e.g. Free round of drinks 🍺" />
              <AField label="Description (optional)" val={reqForm.description} on={e=>setReqForm(f=>({...f,description:e.target.value}))} ph="e.g. Office World Cup group" />
              <div className="afield">
                <label className="afield-lbl">Max Members</label>
                <input className="afield-inp" type="number" min="2" max="200" value={reqForm.max_members} onChange={e=>setReqForm(f=>({...f,max_members:+e.target.value}))} />
              </div>
            </div>

            <div className="admin-section-lbl" style={{padding:"0 0 12px",fontSize:9}}>FEATURES TO ENABLE</div>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
              {[
                {key:"enable_leaderboard", label:"🏅 Room Leaderboard", sub:"Members ranked by points"},
                {key:"enable_feed",        label:"🔔 Activity Feed",    sub:"Who predicted what after matches"},
                {key:"enable_chat",        label:"💬 Chat / Trash talk", sub:"Real-time messages between members"},
              ].map(({key,label,sub}) => (
                <div key={key} className="room-toggle-row" onClick={()=>setReqForm(f=>({...f,[key]:!f[key]}))} style={{cursor:"pointer"}}>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'Anton',sans-serif",fontSize:13,color:"#fff",letterSpacing:.5}}>{label}</div>
                    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.35)",marginTop:2}}>{sub}</div>
                  </div>
                  <div className={`room-toggle ${reqForm[key]?"room-toggle-on":""}`}>
                    <div className="room-toggle-knob"/>
                  </div>
                </div>
              ))}
            </div>

            <button className="admin-save-btn" style={{width:"100%"}} disabled={!reqForm.name.trim()||requesting} onClick={handleRequest}>
              {requesting ? "Submitting..." : "Submit Room Request →"}
            </button>
          </div>
        </div>
      )}

      {/* JOIN */}
      {subTab === "join" && (
        <div style={{padding:"16px 14px"}}>
          <div className="admin-form-card">
            <div className="admin-form-title">JOIN A ROOM</div>
            <div style={{marginBottom:16}}>
              <AField label="Room Code (4 characters)" val={joinCode} on={e=>setJoinCode(e.target.value.toUpperCase())} ph="e.g. A1B2" />
            </div>
            <button className="admin-save-btn" style={{width:"100%"}} disabled={joinCode.length < 2 || joining} onClick={handleJoin}>
              {joining ? "Joining..." : "Join Room →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoomCard({ room, isOwner, isAdmin, myRooms, onView, onJoin, onDelete }) {
  const joined = myRooms.includes(room.id);
  const canDelete = isOwner || isAdmin;
  return (
    <div className="room-card" onClick={joined && onView ? onView : undefined} style={{cursor: joined && onView ? "pointer" : "default"}}>
      <div className="room-card-left">
        <div className="room-card-name">{room.room_name}</div>
        <div className="room-card-meta">
          <span className="room-code-badge">{room.room_code}</span>
          {room.prize && <span className="room-prize-badge">🏆 {room.prize}</span>}
          {isOwner && <span className="room-owner-badge">OWNER</span>}
        </div>
      </div>
      <div className="room-card-right">
        {joined && onView && (
          <button className="room-view-btn-pill" onClick={onView}>VIEW →</button>
        )}
        {!joined && onJoin && (
          <button className="room-join-btn" onClick={e=>{e.stopPropagation();onJoin();}}>JOIN</button>
        )}
        {canDelete && onDelete && (
          <button className="room-card-del-btn" onClick={e=>{e.stopPropagation();onDelete();}} title="Delete room">✕</button>
        )}
      </div>
    </div>
  );
}

function RoomDetail({ room, user, users, preds, matches, pts, isOwner, isAdmin, onBack, onLeave, onDelete, onSaveSettings }) {
  const [tab,       setTab]       = useState("board");
  const [members,   setMembers]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [settings,  setSettings]  = useState({
    room_name:         room.room_name,
    prize:             room.prize || "",
    description:       room.description || "",
    max_members:       room.max_members || 50,
    enable_chat:       room.enable_chat !== false,
    enable_leaderboard:room.enable_leaderboard !== false,
    enable_feed:       room.enable_feed !== false,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const M = ["🥇","🥈","🥉"];
  // Only the room CREATOR can delete from inside the room — admin uses Admin panel
  const canDelete = isOwner;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("room_participants").select("user_id").eq("room_id", room.id);
      if (data) setMembers(data.map(r => r.user_id));
      setLoading(false);
    })();
  }, [room.id]);

  const board = members
    .map(uid => ({ ...users[uid], id: uid, pts: pts(uid) }))
    .filter(u => u.name && u.is_admin !== true && u.is_admin !== 1 && u.is_admin !== "true")
    .sort((a, b) => b.pts - a.pts);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    await onSaveSettings({
      room_name: settings.room_name,
      prize: settings.prize || null,
      description: settings.description || null,
      max_members: settings.max_members,
      enable_chat: settings.enable_chat,
      enable_leaderboard: settings.enable_leaderboard,
      enable_feed: settings.enable_feed,
    });
    setSavingSettings(false);
  };

  const tabs = [
    ...(room.enable_leaderboard !== false ? [{id:"board",  label:"🏅 Ranking"}]   : []),
    ...(room.enable_feed        !== false ? [{id:"feed",   label:"🔔 Activity"}]   : []),
    ...(room.enable_chat        !== false ? [{id:"chat",   label:"💬 Chat"}]       : []),
    ...(isOwner                           ? [{id:"settings",label:"⚙️ Settings"}]  : []),
  ];

  // Default to first available tab
  const activeTab = tabs.find(t => t.id === tab) ? tab : tabs[0]?.id || "board";

  return (
    <div>
      {/* Confirm delete */}
      {confirmDel && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">Delete this room?</div>
            <p className="modal-body">All messages and participants will be removed. This cannot be undone.</p>
            <div className="modal-actions">
              <button className="modal-del-btn" onClick={onDelete}>Yes, Delete</button>
              <button className="modal-cancel-btn" onClick={()=>setConfirmDel(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Confirm leave */}
      {confirmLeave && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">Leave this room?</div>
            <p className="modal-body">You can rejoin later with the room code.</p>
            <div className="modal-actions">
              <button className="modal-del-btn" onClick={onLeave}>Yes, Leave</button>
              <button className="modal-cancel-btn" onClick={()=>setConfirmLeave(false)}>Stay</button>
            </div>
          </div>
        </div>
      )}

      <div className="room-lb-header">
        <button className="room-back-btn" onClick={onBack}>← ROOMS</button>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
          <div>
            <div className="room-lb-title">{room.room_name}</div>
            {room.prize && <div className="room-lb-prize">🏆 {room.prize}</div>}
            {room.description && <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.55)",marginTop:4}}>{room.description}</div>}
          </div>
          {canDelete && (
            <button className="room-delete-btn" onClick={()=>setConfirmDel(true)}>DELETE ROOM</button>
          )}
        </div>
      </div>

      {/* Code strip — only visible to owner */}
      {isOwner && (
        <div className="room-code-strip">
          <span className="room-code-strip-lbl">YOUR CODE</span>
          <span className="room-code-strip-val">{room.room_code}</span>
          <span className="room-code-strip-hint">Share this with people you want to invite</span>
        </div>
      )}

      {room.prize && (
        <div className="room-prize-banner">
          <span className="room-prize-banner-ico">🏆</span>
          <div className="room-prize-banner-text">
            <span className="room-prize-banner-label">PRIZE FOR THE WINNER</span>
            <span className="room-prize-banner-val">{room.prize}</span>
          </div>
        </div>
      )}

      <div className="admin-subtabs">
        {tabs.map(t => (
          <button key={t.id} className={`admin-subtab ${activeTab===t.id?"ast-on":""}`} onClick={()=>setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {activeTab === "board" && (
        <div>
          {!loading && board[0] && (
            <div className="room-leader-hero">
              <div className="room-leader-crown">👑</div>
              <div className="room-leader-label">LEADING THIS ROOM</div>
              <div className="room-leader-name">{board[0].name}</div>
              <div className="room-leader-pts-row">
                <span className="room-leader-pts">{board[0].pts}</span>
                <span className="room-leader-pts-unit">PTS</span>
              </div>
            </div>
          )}
          <div className="lboard">
            {board.map((u,i) => (
              <div key={u.id} className={`lrow ${u.id===user.id?"lrow-me":""}`}>
                <div className="lrank">{i<3?M[i]:<span className="lrank-n">#{i+1}</span>}</div>
                <div className="linfo"><span className="lname">{u.name}</span>{u.id===user.id&&<span className="you-chip">YOU</span>}</div>
                <div className="lpts-wrap"><span className="lpts-n">{u.pts}</span><span className="lpts-u">pts</span></div>
              </div>
            ))}
            {!loading && board.length === 0 && <div className="empty" style={{padding:"40px 0"}}>No members yet — share your code!</div>}
          </div>
        </div>
      )}

      {activeTab === "feed" && <RoomFeed room={room} members={members} users={users} preds={preds} matches={matches} />}
      {activeTab === "chat" && <RoomChat room={room} user={user} />}

      {activeTab === "settings" && isOwner && (
        <div style={{padding:"16px 14px"}}>
          <div className="admin-form-card">
            <div className="admin-form-title">ROOM SETTINGS</div>
            <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
              <AField label="Room Name" val={settings.room_name} on={e=>setSettings(s=>({...s,room_name:e.target.value}))} ph="Room name" />
              <AField label="Prize" val={settings.prize} on={e=>setSettings(s=>({...s,prize:e.target.value}))} ph="e.g. Free round of drinks 🍺" />
              <AField label="Description" val={settings.description} on={e=>setSettings(s=>({...s,description:e.target.value}))} ph="A note for your members" />
              <div className="afield">
                <label className="afield-lbl">Max Members</label>
                <input className="afield-inp" type="number" min="2" max="200" value={settings.max_members} onChange={e=>setSettings(s=>({...s,max_members:+e.target.value}))} />
              </div>
            </div>
            <div className="admin-section-lbl" style={{padding:"0 0 12px",fontSize:9}}>FEATURES</div>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
              {[
                {key:"enable_leaderboard", label:"🏅 Room Leaderboard"},
                {key:"enable_feed",        label:"🔔 Activity Feed"},
                {key:"enable_chat",        label:"💬 Chat"},
              ].map(({key,label}) => (
                <div key={key} className="room-toggle-row" onClick={()=>setSettings(s=>({...s,[key]:!s[key]}))} style={{cursor:"pointer"}}>
                  <div style={{flex:1,fontFamily:"'Anton',sans-serif",fontSize:13,color:"#fff",letterSpacing:.5}}>{label}</div>
                  <div className={`room-toggle ${settings[key]?"room-toggle-on":""}`}><div className="room-toggle-knob"/></div>
                </div>
              ))}
            </div>
            <button className="admin-save-btn" style={{width:"100%"}} disabled={savingSettings} onClick={handleSaveSettings}>
              {savingSettings ? "Saving..." : "Save Settings ✓"}
            </button>
          </div>
          <div style={{padding:"16px 0 8px"}}>
            <button className="room-delete-btn" onClick={()=>setConfirmDel(true)}>Delete This Room</button>
          </div>
        </div>
      )}

      {!isOwner && (
        <div style={{padding:"16px 14px 32px"}}>
          <button className="room-leave-subtle-btn" onClick={()=>setConfirmLeave(true)}>
            ← Leave this room
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Room Activity Feed ── */
function RoomFeed({ room, members, users, preds, matches }) {
  const finished = matches.filter(m => m.status === "finished");

  // Build activity events from predictions on finished matches for members
  const events = [];
  finished.forEach(m => {
    members.forEach(uid => {
      const u = users[uid];
      if (!u) return;
      const p = preds[`${uid}__${m.id}`];
      if (!p) return;
      const exact = p.h === m.hs && p.a === m.as;
      const pw = p.h > p.a ? "home" : p.h < p.a ? "away" : "draw";
      const mw = m.hs > m.as ? "home" : m.hs < m.as ? "away" : "draw";
      const partial = !exact && pw === mw;
      const pts = exact ? 5 : partial ? 1 : 0;
      events.push({
        uid, name: u.name,
        match: `${m.home} vs ${m.away}`,
        pred: `${p.h}:${p.a}`,
        result: `${m.hs}:${m.as}`,
        correct: exact,
        partial,
        pts,
        date: m.date,
      });
    });
  });
  events.sort((a,b) => b.pts - a.pts);

  if (events.length === 0) return (
    <div className="room-empty-state">
      <div className="room-empty-ico">🔔</div>
      <div className="room-empty-title">No activity yet</div>
      <div className="room-empty-sub">Correct predictions will appear here once matches finish</div>
    </div>
  );

  return (
    <div>
      <div className="admin-section-lbl" style={{padding:"14px 14px 8px"}}>PREDICTION RESULTS</div>
      {events.map((e,i) => (
        <div key={i} className={`feed-row ${e.correct?"feed-row-ok":e.partial?"feed-row-partial":"feed-row-ng"}`}>
          <div className="feed-ico">{e.correct ? "✅" : e.partial ? "🟡" : "❌"}</div>
          <div className="feed-body">
            <span className="feed-name">{e.name}</span>
            <span className="feed-match">{e.match} · {e.date}</span>
            <span className="feed-detail">
              Predicted <strong>{e.pred}</strong> · Result <strong>{e.result}</strong>
              {e.correct && <span className="feed-pts"> +5 pts 🎯</span>}
              {e.partial  && <span className="feed-pts" style={{color:"#fbbf24"}}> +1 pt ✓ winner</span>}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Room Chat ── */
function RoomChat({ room, user }) {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState("");
  const [sending,   setSending]   = useState(false);
  const [loading,   setLoading]   = useState(true);
  const bottomRef   = useRef(null);
  const lastIdRef   = useRef(null);

  const fetchMessages = async () => {
    const { data } = await supabase.from("room_messages").select("*")
      .eq("room_id", room.id).order("created_at", { ascending: true }).limit(100);
    if (data) {
      setMessages(data);
      if (data.length > 0) lastIdRef.current = data[data.length - 1].id;
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();

    // Realtime subscription (works if Realtime is enabled in Supabase dashboard)
    const channel = supabase.channel(`room-chat-${room.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public",
        table: "room_messages", filter: `room_id=eq.${room.id}`
      }, payload => {
        setMessages(m => {
          if (m.find(x => x.id === payload.new.id)) return m;
          return [...m, payload.new];
        });
      }).subscribe();

    // Polling fallback every 3s — ensures messages show even without Realtime
    const poll = setInterval(fetchMessages, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [room.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const optimistic = {
      id: `tmp-${Date.now()}`, room_id: room.id,
      user_id: user.id, user_name: user.name,
      message: input.trim(), created_at: new Date().toISOString(),
    };
    setMessages(m => [...m, optimistic]);
    setInput("");
    await supabase.from("room_messages").insert({
      room_id: room.id, user_id: user.id,
      user_name: user.name, message: optimistic.message
    });
    setSending(false);
  };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });

  return (
    <div className="chat-wrap">
      <div className="chat-messages">
        {loading && <div className="empty" style={{padding:30}}>Loading...</div>}
        {!loading && messages.length === 0 && (
          <div className="chat-empty">
            <div style={{fontSize:32,marginBottom:8}}>💬</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,letterSpacing:2,color:"rgba(255,255,255,.3)"}}>NO MESSAGES YET</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.2)",marginTop:4}}>Be the first to say something!</div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`chat-msg ${msg.user_id === user.id ? "chat-msg-me" : ""}`}>
            <div className="chat-msg-header">
              <span className="chat-msg-name">{msg.user_id === user.id ? "You" : msg.user_name}</span>
              <span className="chat-msg-time">{formatTime(msg.created_at)}</span>
            </div>
            <div className="chat-msg-bubble">{msg.message}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-row">
        <input
          className="chat-input"
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&send()}
          placeholder="Say something... 🗣️"
          maxLength={200}
        />
        <button className="chat-send-btn" onClick={send} disabled={!input.trim()||sending}>
          {sending ? "..." : "→"}
        </button>
      </div>
    </div>
  );
}

/* ═══ CSS ════════════════════════════════════════════════════════════════════ */
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
  .auth-panel{width:100%;background:#000;border:1px solid rgba(255,255,255,.14);animation:fadeUp .7s cubic-bezier(.16,1,.3,1) .12s both}
  .auth-tabs{display:flex}
  .auth-tab{flex:1;padding:18px 0;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.08);font-family:'Anton',sans-serif;font-size:10.5px;letter-spacing:3px;color:rgba(255,255,255,.45);cursor:pointer;transition:all .2s;position:relative}
  .atab-on{color:#fff;border-bottom-color:transparent;background:rgba(255,255,255,.02)}
  .atab-on::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:#fff}
  .auth-form{padding:32px 28px 28px;display:flex;flex-direction:column;gap:0}
  .ffield{margin-bottom:18px}
  .ffield-lbl{display:block;font-family:'Anton',sans-serif;font-size:9px;letter-spacing:3px;color:rgba(255,255,255,.6);margin-bottom:8px}
  .ffield-inp{width:100%;padding:15px 16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#fff;font-family:'Outfit',sans-serif;font-size:16px;font-weight:500;transition:all .2s;outline:none;border-radius:0}
  .ffield-inp::placeholder{color:rgba(255,255,255,.35)}
  .ffield-inp:focus{border-color:rgba(255,255,255,.6);background:rgba(255,255,255,.09)}
  .auth-err{display:flex;align-items:center;gap:10px;padding:10px 14px;font-family:'Outfit',sans-serif;font-size:12px;color:#fca5a5;margin-bottom:18px;background:rgba(239,68,68,.06);border-left:2px solid #ef4444}
  .auth-err-dot{font-family:'Anton',sans-serif;font-size:15px;color:#ef4444}
  .auth-cta{width:100%;padding:18px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:11.5px;letter-spacing:5px;transition:opacity .15s;margin-bottom:22px;margin-top:6px}
  .auth-cta:hover{opacity:.88}
  .auth-footer-text{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.5);text-align:center}
  .auth-footer-link{color:rgba(255,255,255,.85);font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:3px}

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
  .mv-ok{color:#86efac}.mv-partial{color:#fbbf24}.mv-ng{color:rgba(255,255,255,.2)}.mv-locked{color:rgba(34,197,94,.7);display:flex;align-items:center;gap:8px;padding:9px 14px;border-top:1px solid rgba(255,255,255,.04);font-family:'Outfit',sans-serif;font-size:11px;font-weight:600}

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
  .prof-hero{background:#fff;padding:40px 24px 32px;text-align:center;width:100%}
  .prof-av{width:72px;height:72px;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Anton',sans-serif;font-size:24px;letter-spacing:2px;margin:0 auto 20px}
  .prof-name{font-family:'Anton',sans-serif;font-size:28px;letter-spacing:1px;color:#000;text-transform:uppercase;margin-bottom:8px}
  .prof-detail{font-family:'Outfit',sans-serif;font-size:14px;color:rgba(0,0,0,.65);margin-bottom:3px}
  .prof-leader-badge{margin-top:18px;display:inline-block;background:#000;color:#fff;padding:10px 24px;font-family:'Anton',sans-serif;font-size:9px;letter-spacing:3px;text-transform:uppercase}
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
  .admin-subtab{padding:15px 16px;background:transparent;border:none;border-bottom:2px solid transparent;font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:rgba(255,255,255,.55);cursor:pointer;transition:all .2s;margin-bottom:-1px}
  .ast-on{color:#fff;border-bottom-color:#fff}
  .admin-topbar{display:flex;align-items:center;justify-content:space-between;padding:18px 14px 0;margin-bottom:4px;gap:12px}
  .admin-add-btn{flex-shrink:0;padding:10px 18px;background:#fff;color:#000;border:none;cursor:pointer;font-family:'Anton',sans-serif;font-size:9.5px;letter-spacing:2.5px;transition:opacity .15s;white-space:nowrap}
  .admin-add-btn:hover{opacity:.85}
  .admin-section-lbl{font-family:'Anton',sans-serif;font-size:12px;letter-spacing:3px;color:rgba(255,255,255,.65);display:flex;align-items:center;gap:8px;padding:18px 14px 10px}
  .admin-count{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);padding:3px 10px;font-size:11px;color:#fff}
  .admin-row{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.07);padding:16px 14px;gap:12px;flex-wrap:wrap;transition:background .15s}
  .admin-row:hover{background:#080808}
  .admin-row-left{display:flex;flex-direction:column;gap:5px;flex:1;min-width:0}
  .admin-row-group{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2.5px;color:rgba(255,255,255,.6)}
  .admin-row-teams{font-family:'Anton',sans-serif;font-size:16px;color:#fff;letter-spacing:.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase}
  .admin-row-dt{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.7);margin-top:2px;font-weight:500}
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
  .admin-form-title{font-family:'Anton',sans-serif;font-size:10px;letter-spacing:3px;color:rgba(255,255,255,.55);margin-bottom:16px;text-transform:uppercase}
  .admin-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-bottom:14px}
  .afield{display:flex;flex-direction:column;gap:6px}
  .afield-lbl{font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2px;color:rgba(255,255,255,.7)}
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

  /* ── ROOMS ── */
  .room-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:10px}
  .room-empty-ico{font-size:48px;line-height:1}
  .room-empty-title{font-family:'Anton',sans-serif;font-size:18px;letter-spacing:2px;color:rgba(255,255,255,.5)}
  .room-empty-sub{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.25);text-align:center}
  .room-card{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.07);padding:18px 14px;transition:background .15s;gap:16px}
  .room-card:hover{background:#080808}
  .room-card-left{display:flex;flex-direction:column;gap:8px;flex:1;min-width:0}
  .room-card-name{font-family:'Anton',sans-serif;font-size:20px;letter-spacing:1px;color:#fff;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .room-card-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .room-code-badge{font-family:'Anton',sans-serif;font-size:14px;letter-spacing:4px;color:#fff;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);padding:4px 12px}
  .room-prize-badge{font-family:'Outfit',sans-serif;font-size:12px;font-weight:700;color:rgba(255,200,50,.95);background:rgba(255,200,50,.08);border:1px solid rgba(255,200,50,.2);padding:4px 10px}
  .room-owner-badge{font-family:'Anton',sans-serif;font-size:9px;letter-spacing:2px;color:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.15);padding:4px 10px}
  .room-card-right{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0}
  .room-view-btn-pill{font-family:'Anton',sans-serif;font-size:11px;letter-spacing:2px;color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);padding:8px 16px;cursor:pointer;transition:all .15s}
  .room-view-btn-pill:hover{background:rgba(255,255,255,.15)}
  .room-join-btn{font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2px;color:#000;background:#fff;border:none;padding:8px 18px;cursor:pointer;transition:opacity .15s}
  .room-join-btn:hover{opacity:.85}
  .room-card-del-btn{background:transparent;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:14px;padding:4px 6px;transition:color .15s;line-height:1}
  .room-card-del-btn:hover{color:rgba(239,68,68,.7)}
  .room-lb-header{padding:16px 14px 10px;border-bottom:1px solid rgba(255,255,255,.07)}
  .room-back-btn{background:transparent;border:none;font-family:'Anton',sans-serif;font-size:10px;letter-spacing:2.5px;color:rgba(255,255,255,.55);cursor:pointer;padding:0;margin-bottom:10px;display:block;transition:color .15s}
  .room-back-btn:hover{color:#fff}
  .room-lb-title{font-family:'Anton',sans-serif;font-size:28px;letter-spacing:2px;color:#fff;text-transform:uppercase;line-height:1;margin-bottom:6px}
  .room-lb-prize{font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;color:rgba(255,200,50,.8)}
  .room-delete-btn{flex-shrink:0;padding:8px 16px;background:transparent;border:1px solid rgba(239,68,68,.25);color:rgba(239,68,68,.55);cursor:pointer;font-family:'Anton',sans-serif;font-size:8px;letter-spacing:2.5px;transition:all .2s;white-space:nowrap;margin-top:6px}
  .room-delete-btn:hover{border-color:rgba(239,68,68,.6);color:#f87171;background:rgba(239,68,68,.06)}
  .room-leave-subtle-btn{background:transparent;border:none;font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;color:rgba(255,255,255,.28);cursor:pointer;padding:4px 0;transition:color .2s;display:inline-block}
  .room-leave-subtle-btn:hover{color:rgba(255,255,255,.6)}
  .room-code-strip{display:flex;align-items:center;gap:16px;padding:16px 14px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.08);flex-wrap:wrap}
  .room-code-strip-lbl{font-family:'Anton',sans-serif;font-size:10px;letter-spacing:3px;color:rgba(255,255,255,.45)}
  .room-code-strip-val{font-family:'Anton',sans-serif;font-size:28px;letter-spacing:8px;color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);padding:8px 18px}
  .room-code-strip-hint{font-family:'Outfit',sans-serif;font-size:13px;color:rgba(255,255,255,.4);font-weight:500}
  .room-leave-btn{width:100%;padding:13px;background:transparent;border:1px solid rgba(239,68,68,.2);color:rgba(239,68,68,.5);cursor:pointer;font-family:'Anton',sans-serif;font-size:9.5px;letter-spacing:3px;transition:all .2s}
  .room-leave-btn:hover{border-color:rgba(239,68,68,.5);color:#f87171}

  /* Request rows */
  .room-request-row{display:flex;align-items:center;justify-content:space-between;padding:16px 14px;border-bottom:1px solid rgba(255,255,255,.055);gap:12px}
  .room-request-rejected{opacity:.5}
  .room-request-left{display:flex;flex-direction:column;gap:4px;flex:1}
  .room-request-status{font-family:'Anton',sans-serif;font-size:8px;letter-spacing:2.5px;margin-bottom:2px}
  .rrs-pending{color:rgba(251,191,36,.8)}
  .rrs-rejected{color:rgba(239,68,68,.6)}
  .room-request-info{display:flex;gap:10px;padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);margin-bottom:4px;align-items:flex-start}
  .room-request-info-ico{font-size:16px;flex-shrink:0;margin-top:1px}
  .room-request-info-text{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.5);line-height:1.6}

  /* Toggle switch */
  .room-toggle-row{display:flex;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05)}
  .room-toggle{width:44px;height:24px;background:rgba(255,255,255,.1);border-radius:12px;position:relative;flex-shrink:0;transition:background .2s}
  .room-toggle-on{background:rgba(34,197,94,.5)}
  .room-toggle-knob{position:absolute;top:3px;left:3px;width:18px;height:18px;background:#fff;border-radius:50%;transition:transform .2s;transform:translateX(0)}
  .room-toggle-on .room-toggle-knob{transform:translateX(20px)}

  /* ── ROOM LEADER HERO ── */
  .room-leader-hero{background:#fff;padding:32px 20px 28px;text-align:center;position:relative}
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
  .feed-row{display:flex;align-items:flex-start;gap:12px;padding:14px;border-bottom:1px solid rgba(255,255,255,.055);transition:background .15s}
  .feed-row:hover{background:#060606}
  .feed-row-ok{border-left:3px solid rgba(34,197,94,.4)}
  .feed-row-partial{border-left:3px solid rgba(251,191,36,.4)}
  .feed-row-ng{border-left:3px solid rgba(255,255,255,.06)}
  .feed-ico{font-size:18px;flex-shrink:0;margin-top:2px}
  .feed-body{display:flex;flex-direction:column;gap:3px;flex:1}
  .feed-name{font-family:'Anton',sans-serif;font-size:14px;letter-spacing:.5px;color:#fff;text-transform:uppercase}
  .feed-match{font-family:'Outfit',sans-serif;font-size:11px;color:rgba(255,255,255,.4);font-weight:500}
  .feed-detail{font-family:'Outfit',sans-serif;font-size:12px;color:rgba(255,255,255,.55);line-height:1.5}
  .feed-detail strong{color:#fff}
  .feed-pts{color:#86efac;font-weight:700}

  /* ── CHAT ── */
  .chat-wrap{display:flex;flex-direction:column;height:calc(100vh - 280px);min-height:320px}
  .chat-messages{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
  .chat-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px 0}
  .chat-msg{display:flex;flex-direction:column;gap:3px;max-width:82%}
  .chat-msg-me{align-self:flex-end}
  .chat-msg-header{display:flex;align-items:center;gap:8px}
  .chat-msg-name{font-family:'Anton',sans-serif;font-size:9px;letter-spacing:2px;color:rgba(255,255,255,.35);text-transform:uppercase}
  .chat-msg-time{font-family:'Outfit',sans-serif;font-size:10px;color:rgba(255,255,255,.2)}
  .chat-msg-bubble{font-family:'Outfit',sans-serif;font-size:14px;font-weight:500;color:#fff;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.09);padding:10px 14px;line-height:1.5;word-break:break-word}
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
  .tv-lb-btn{display:flex;align-items:center;gap:14px;width:100%;max-width:440px;margin-top:16px;padding:16px 20px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);cursor:pointer;transition:all .2s;text-align:left}
  .tv-lb-btn:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.3)}
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
  .sp-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,.92) 100%);pointer-events:none;z-index:1}
  .sp-tap-hint{position:absolute;bottom:32px;left:50%;transform:translateX(-50%);font-family:'Anton',sans-serif;font-size:10px;letter-spacing:4px;color:rgba(255,255,255,.25);z-index:15;animation:tapHintPulse 1.8s ease-in-out infinite;pointer-events:none;white-space:nowrap}
  @keyframes tapHintPulse{0%,100%{opacity:.25}50%{opacity:.6}}
  .sp-flash{position:absolute;inset:0;background:#fff;z-index:20;animation:flashOut 0.5s ease forwards;pointer-events:none}
  .sp-cracks{position:absolute;top:50%;left:50%;z-index:3;pointer-events:none}
  .sp-crack{position:absolute;top:0;left:0;width:1px;height:0;background:linear-gradient(to bottom,rgba(255,255,255,.9),transparent);transform-origin:top center;animation:crackGrow 1.2s ease forwards}
  .sp-ball-fly{position:absolute;z-index:5;bottom:0;left:50%;transform:translateX(-50%) scale(0.06);animation:ballApproach 3s cubic-bezier(.25,0,.15,1) forwards}
  .sp-ball-smash{position:absolute;z-index:5;top:50%;left:50%;transform:translate(-50%,-50%) scale(4.5);animation:ballSmash 0.7s cubic-bezier(.1,0,.4,1) forwards}
  .sp-ball{font-size:72px;line-height:1;display:block;animation:ballSpin 3s linear forwards}
  .sp-ball-nospin{animation:none}
  .sp-sign-wrap{position:absolute;z-index:10;left:50%;display:flex;flex-direction:column;align-items:center;width:min(500px,88vw)}
  .sp-sign-drop{top:-500px;animation:signDrop 1.8s cubic-bezier(.22,1,.36,1) forwards}
  .sp-sign-falling{top:50%;transform:translate(-50%,-50%);animation:signFall 1.2s cubic-bezier(.55,0,1,.45) forwards}
  .sp-ropes{display:flex;justify-content:space-between;width:65%;padding:0 8px}
  .sp-rope{width:2px;height:0;background:linear-gradient(to bottom,rgba(255,255,255,.05),rgba(255,255,255,.4),rgba(255,255,255,.15));animation:ropeGrow 0.5s ease 0.2s forwards}
  .sp-sign-board{background:#080808;border:2px solid rgba(255,255,255,.2);padding:30px 38px 34px;text-align:center;width:100%;box-shadow:0 8px 60px rgba(0,0,0,.95),inset 0 0 40px rgba(0,0,0,.6);position:relative}
  .sp-sign-board::before{content:'';position:absolute;inset:5px;border:1px solid rgba(255,255,255,.06);pointer-events:none}
  .sp-neon-main{font-family:'Anton',sans-serif;font-size:clamp(46px,10vw,82px);letter-spacing:8px;color:rgba(255,255,255,.18);line-height:1;text-transform:uppercase}
  .sp-sign-divider{height:1px;background:rgba(255,255,255,.18);margin:14px 0 10px;width:100%}
  .sp-neon-sub2{font-family:'Anton',sans-serif;font-size:clamp(9px,2vw,13px);letter-spacing:5px;color:rgba(255,255,255,.18);text-transform:uppercase;margin-bottom:16px}
  .sp-sign-sep{height:1px;background:rgba(255,200,50,.2);margin:0 0 14px;width:100%}
  .sp-neon-gold{font-family:'Anton',sans-serif;font-size:clamp(11px,2.4vw,17px);letter-spacing:10px;color:rgba(255,200,50,.18);text-transform:uppercase}

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

  /* ── STEPPER SCORE INPUTS ── */
  .stepper{display:flex;align-items:center;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.2);transition:border-color .2s}
  .stepper:focus-within{border-color:rgba(255,255,255,.65);background:rgba(255,255,255,.1)}
  .stepper-btn{width:44px;height:60px;background:transparent;border:none;color:rgba(255,255,255,.45);font-size:22px;cursor:pointer;transition:all .13s;flex-shrink:0;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none;line-height:1}
  .stepper-btn:hover{background:rgba(255,255,255,.1);color:#fff}
  .stepper-btn:active{transform:scale(.82);background:rgba(255,255,255,.18)}
  .stepper-inp{width:50px;height:60px;text-align:center;background:transparent;border:none;border-left:1px solid rgba(255,255,255,.13);border-right:1px solid rgba(255,255,255,.13);color:#fff;font-family:'Anton',sans-serif;font-size:30px;outline:none}
  .stepper-inp::placeholder{color:rgba(255,255,255,.25)}

  /* ── PAGE SLIDE TRANSITIONS ── */
  .page-slide-fwd{animation:pageSlideIn .22s cubic-bezier(.4,0,.2,1) both}
  .page-slide-bwd{animation:pageSlideInRev .22s cubic-bezier(.4,0,.2,1) both}
  @keyframes pageSlideIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}
  @keyframes pageSlideInRev{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:translateX(0)}}

  /* ── NAV ACTIVE DOT ── */
  .bnav-indicator{position:absolute;bottom:5px;left:50%;transform:translateX(-50%);width:5px;height:5px;background:#fff;border-radius:50%;box-shadow:0 0 8px #fff,0 0 16px rgba(255,255,255,.4)}

  /* ── COUNTDOWN PULSE ── */
  @keyframes urgentPulse{0%,100%{opacity:1}50%{opacity:.55}}
  .countdown-pulse{animation:urgentPulse .78s ease-in-out infinite}

  /* ── MATCH CARD RESULT TINTS ── */
  .mcard-ok{background:rgba(34,197,94,.018)!important}
  .mcard-partial{background:rgba(251,191,36,.014)!important}

  /* ── PREDICT CTA GLOW ON HOVER ── */
  .pred-cta:hover:not(:disabled){border-color:#fff;color:#fff;background:rgba(255,255,255,.04);box-shadow:0 0 18px rgba(255,255,255,.06)}

  /* ── ROOM LEADERBOARD ── */
  .lboard{display:flex;flex-direction:column}
  .lrow{display:grid;grid-template-columns:44px 1fr auto;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06);transition:background .15s;animation:cardIn .32s ease both}
  .lrow:hover{background:rgba(255,255,255,.03)}
  .lrow-me{background:rgba(255,255,255,.05)!important;border-left:3px solid #fff}
  .lrank{font-size:20px;line-height:1;text-align:center;flex-shrink:0}
  .lrank-n{font-family:'Anton',sans-serif;font-size:14px;color:rgba(255,255,255,.4)}
  .linfo{display:flex;align-items:center;gap:8px;overflow:hidden}
  .lname{font-family:'Anton',sans-serif;font-size:16px;color:#fff;letter-spacing:.5px;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .lpts-wrap{display:flex;align-items:baseline;gap:3px;flex-shrink:0}
  .lpts-n{font-family:'Anton',sans-serif;font-size:20px;color:#fff;line-height:1}
  .lpts-u{font-family:'Anton',sans-serif;font-size:8px;letter-spacing:1.5px;color:rgba(255,255,255,.4)}
  .lrow:nth-child(1){animation-delay:.05s}.lrow:nth-child(2){animation-delay:.10s}.lrow:nth-child(3){animation-delay:.15s}.lrow:nth-child(4){animation-delay:.20s}.lrow:nth-child(5){animation-delay:.25s}

  /* ── SECTION BANNER ACCENT ── */
  .section-banner{border-left:3px solid rgba(255,255,255,.1)}
  .section-banner-dim{border-left-color:rgba(255,255,255,.04)}

  /* ── SMOOTH INPUT FOCUS RINGS ── */
  .ffield-inp:focus{border-color:rgba(255,255,255,.65);background:rgba(255,255,255,.1);box-shadow:0 0 0 1px rgba(255,255,255,.12)}
  .afield-inp:focus{border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.09);box-shadow:0 0 0 1px rgba(255,255,255,.1)}

  /* ── BOTTOM NAV ACTIVE SCALE BOOST ── */
  .bnav-on .bnav-ico{transform:scale(1.3) translateY(-3px)}
`;
