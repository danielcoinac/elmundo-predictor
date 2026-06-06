/* ─── Storage (app settings, rules, sponsors) ───────────────────────────── */
export async function sget(k) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; }
}
export async function sset(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}

export const DEFAULT_MATCHES = [];

function _getEvLabel() {
  try { const s = JSON.parse(localStorage.getItem("em_app_settings")||"{}"); return `${s.eventName||"WORLD CUP"} ${s.eventYear||2026}`; } catch { return "WORLD CUP 2026"; }
}
function _getEvYear() {
  try { return JSON.parse(localStorage.getItem("em_app_settings")||"{}").eventYear||2026; } catch { return 2026; }
}

export function makeDefaultRules() {
  const ev = _getEvLabel();
  return [
    { id:"r1", title:"How to Play",        body:`Create your account and predict the exact final score for every ${ev} match. Browse all games in the Matches tab, enter your home and away score prediction for each one, and hit Save. You can update your predictions anytime until the deadline.` },
    { id:"r2", title:"Prediction Deadline",body:`All predictions must be submitted before the first match kicks off. Once the deadline passes, the prediction window closes permanently for all games. No late submissions, no exceptions.` },
    { id:"r3", title:"Points System",      body:"Exact final score correct → 5 points. Correct winner predicted (wrong score) → 1 point. Draw matches: only the exact score earns points — no points for guessing a draw with the wrong score. Wrong or missing prediction → 0 points." },
    { id:"r4", title:"Leaderboard",        body:"The player with the most points at the end of the tournament wins. The leaderboard updates live every time a match result is entered. Check the Leaderboard tab anytime to see your current rank against all other players." },
    { id:"r5", title:"Ordering Food & Drinks", body:"Top up your credits at the top-up desk (cash or card). Then scan the QR code on your table — it fills in your table number automatically. Browse the menu, add items to your cart, and place your order directly from your phone. Your order goes straight to the bar." },
    { id:"r6", title:"Group Orders",       body:"Want to order together with your table? Go to the Group tab and start a group order. Everyone at the table scans the same table QR code to join. Add your own items, then choose to pay individually or let one person cover the whole table." },
    { id:"r7", title:"Tiebreaker",         body:"If two or more players finish with the same number of points, the player who registered their account first is ranked higher. Make sure you register early!" },
    { id:"r8", title:"Fair Play",          body:"One account per person only. Duplicate accounts detected by phone number or email will result in both accounts being banned from predictions. Any attempt to manipulate the prediction system — including changing device time — will be detected and result in disqualification." },
  ];
}
export const DEFAULT_RULES = makeDefaultRules();

export const DEFAULT_SPONSORS = [
  { id:"s1", name:"El Mundo Bar-Rest", role:"EVENT HOST",    detail:"Est. 2009 — Bonaire",               logo:"/elmundo-logo.png" },
  { id:"s2", name:"Your Business Here", role:"Gold Sponsor",   detail:"Contact us to become a sponsor",  logo:"" },
  { id:"s3", name:"Your Business Here", role:"Silver Sponsor", detail:"Contact us to become a sponsor",  logo:"" },
];

export const MONTHS = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
export const matchDate = m => {
  const [mon, day] = (m.date || m.match_date || "Jan 1").split(" ");
  return new Date(_getEvYear(), (MONTHS[mon]||1)-1, parseInt(day)||1);
};
// Sort by date first, then by kickoff time within the same day
export const sortMatches = arr => [...arr].sort((a,b) => {
  const dateDiff = matchDate(a) - matchDate(b);
  if (dateDiff !== 0) return dateDiff;
  // same date — sort by time string "HH:MM"
  const ta = (a.time || "00:00");
  const tb = (b.time || "00:00");
  return ta.localeCompare(tb);
});

// Points: 5 for exact score, 1 for correct winner (non-draw only), 0 for everything else
export function calcPts(pred, homeScore, awayScore) {
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

export const FLAGS = {
  /* CONMEBOL */ Brazil:"🇧🇷",Argentina:"🇦🇷",Uruguay:"🇺🇾",Colombia:"🇨🇴",Ecuador:"🇪🇨",Venezuela:"🇻🇪",Paraguay:"🇵🇾",Chile:"🇨🇱",Bolivia:"🇧🇴",Peru:"🇵🇪",
  /* UEFA */ France:"🇫🇷",Germany:"🇩🇪",Spain:"🇪🇸",Portugal:"🇵🇹",England:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",Netherlands:"🇳🇱",Italy:"🇮🇹",Croatia:"🇭🇷",Belgium:"🇧🇪",Switzerland:"🇨🇭",Austria:"🇦🇹",Denmark:"🇩🇰",Serbia:"🇷🇸",Hungary:"🇭🇺",Czechia:"🇨🇿",Slovakia:"🇸🇰",Turkey:"🇹🇷",Turkiye:"🇹🇷",Romania:"🇷🇴",Scotland:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",Wales:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",Ukraine:"🇺🇦",Greece:"🇬🇷",Poland:"🇵🇱",Norway:"🇳🇴",Sweden:"🇸🇪","Bosnia and Herzegovina":"🇧🇦",Uzbekistan:"🇺🇿",
  /* CONCACAF */ USA:"🇺🇸",Mexico:"🇲🇽",Canada:"🇨🇦",Jamaica:"🇯🇲","Costa Rica":"🇨🇷",Panama:"🇵🇦",Honduras:"🇭🇳","El Salvador":"🇸🇻",Guatemala:"🇬🇹","Trinidad & Tobago":"🇹🇹",Cuba:"🇨🇺",Haiti:"🇭🇹",Curacao:"🇨🇼",
  /* CAF */ Morocco:"🇲🇦",Senegal:"🇸🇳",Egypt:"🇪🇬","South Africa":"🇿🇦",Nigeria:"🇳🇬",Ghana:"🇬🇭","Ivory Coast":"🇨🇮",Cameroon:"🇨🇲",Algeria:"🇩🇿",Tunisia:"🇹🇳",Mali:"🇲🇱","DR Congo":"🇨🇩","Cape Verde":"🇨🇻",
  /* AFC */ Japan:"🇯🇵","South Korea":"🇰🇷",Iran:"🇮🇷",Australia:"🇦🇺","Saudi Arabia":"🇸🇦",Qatar:"🇶🇦","United Arab Emirates":"🇦🇪",Iraq:"🇮🇶",Jordan:"🇯🇴","New Zealand":"🇳🇿",
  /* OFC */ Tahiti:"🇵🇫",
};
export const flag = t => FLAGS[t] || "⚽";

export const MENU_SECTIONS = [
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
export const ALL_MENU_CATS = MENU_SECTIONS.flatMap(s => s.cats.map(c => c.id));
export const FOOD_CATS = new Set(MENU_SECTIONS.find(s => s.section === "FOOD")?.cats.map(c => c.id) || []);
export const catMeta = id => MENU_SECTIONS.flatMap(s=>s.cats).find(c=>c.id===id) || { icon:"🍽", label:id };
